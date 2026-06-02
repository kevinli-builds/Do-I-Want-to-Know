import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { userIdFromRequest, AUTH_ENFORCED } from '../lib/session'

const router = Router()

const RATE_LIMIT_HOURS = Number(process.env.SYNC_RATE_LIMIT_HOURS ?? 24)

function statusPayload(user: {
  id: string; email: string | null; createdAt: Date; lastSyncedAt: Date | null
  oauthToken: { id: string } | null
}, entryCount: number, oldest: { date: Date } | null) {
  const caughtUp = !!user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < RATE_LIMIT_HOURS * 3600 * 1000
  return {
    id: user.id,
    email: user.email,
    connected: !!user.oauthToken,
    createdAt: user.createdAt,
    lastSyncedAt: user.lastSyncedAt,
    entryCount,
    oldestDate: oldest?.date ?? null,
    caughtUp,
  }
}

// POST /users  { id }   (optional: Authorization: Bearer <token>)
//
// Bootstrap / status check. This endpoint is intentionally NOT gated by a
// session, because a brand-new device has no token yet and still needs to learn
// it isn't connected. But we only ever reveal a user's email / counts / connect
// status to a request that proves ownership with a valid session token. An
// unauthenticated request — even one carrying a real, connected device id — is
// answered with connected:false and nothing else, so the id alone leaks nothing.
router.post('/', asyncHandler(async (req, res) => {
  const sessionUserId = await userIdFromRequest(req)
  const { id } = req.body

  // Resolve which user we're allowed to describe: the session's user if a valid
  // token was presented, or — only when auth is NOT enforced (rollback mode) —
  // the legacy device id from the body.
  const resolvedId = sessionUserId ?? (!AUTH_ENFORCED && typeof id === 'string' ? id : null)

  if (resolvedId) {
    const user = await prisma.user.upsert({
      where: { id: resolvedId },
      create: { id: resolvedId },
      update: {},
      include: { oauthToken: { select: { id: true } } },
    })
    const [entryCount, oldest] = await Promise.all([
      prisma.ledgerEntry.count({ where: { userId: user.id } }),
      prisma.ledgerEntry.findFirst({ where: { userId: user.id }, orderBy: { date: 'asc' }, select: { date: true } }),
    ])
    return void res.json(statusPayload(user, entryCount, oldest))
  }

  // Unauthenticated / new device with auth enforced: ensure a row exists for the
  // device id (it serves as the OAuth hint), but never disclose connection
  // status without a valid session.
  if (id && typeof id === 'string') {
    await prisma.user.upsert({ where: { id }, create: { id }, update: {} })
  }
  res.json({ id: id ?? null, email: null, connected: false, entryCount: 0, oldestDate: null, caughtUp: false })
}))

export { router as usersRouter }
