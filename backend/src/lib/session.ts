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
  if (!userId) {
    res.status(401).json({ error: 'Please reconnect Gmail to continue.', reauth: true })
    return
  }
  const claimed = (req.params?.userId ?? req.body?.userId) as string | undefined
  if (claimed && claimed !== userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  req.authUserId = userId
  next()
}
