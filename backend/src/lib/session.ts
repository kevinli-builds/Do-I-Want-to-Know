import { createHash, randomBytes } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { prisma } from './prisma'

// A session token is a high-entropy random string. We store only its SHA-256
// hash, so reading the DB never yields a usable token. The raw token is the
// credential the client sends as `Authorization: Bearer <token>`.
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Kill-switch. Session auth is enforced by default. Set AUTH_ENFORCED=false (or
// 0) on the server to instantly fall back to the legacy userId-based behavior —
// no code rollback, no migration revert — if the auth rollout misbehaves in
// production. A valid token is still honored when present; this only changes
// what happens when one is ABSENT.
export const AUTH_ENFORCED =
  process.env.AUTH_ENFORCED !== 'false' && process.env.AUTH_ENFORCED !== '0'

/** Mint a session for a user and return the raw token (only the hash is stored). */
export async function createSession(userId: string): Promise<string> {
  const token = newToken()
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token) } })
  return token
}

/** Resolve the user id from a request's Bearer token, or null if absent/invalid. */
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.header('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(m[1].trim()) } })
  return session?.userId ?? null
}

// Augment Express's Request with the authenticated user id.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUserId?: string
    }
  }
}

// Middleware: require a valid session. If the route also carries a userId (in
// params or body), it must match the session's user — so a stolen/guessed id is
// useless without the token. Handlers can read req.authUserId.
export const requireSession: RequestHandler = async (req, res, next) => {
  const userId = await userIdFromRequest(req)
  const claimed = (req.params?.userId ?? req.body?.userId) as string | undefined

  if (userId) {
    // Valid token: it must match any userId the route also carries.
    if (claimed && claimed !== userId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    req.authUserId = userId
    next()
    return
  }

  // No valid token.
  if (!AUTH_ENFORCED) {
    // Rollback mode: trust the legacy userId in the route, as before sessions.
    req.authUserId = claimed
    next()
    return
  }

  res.status(401).json({ error: 'Please reconnect Gmail to continue.', reauth: true })
}
