import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { userIdFromRequest } from '../lib/session'

const router = Router()

const RATE_LIMIT_HOURS = Number(process.env.SYNC_RATE_LIMIT_HOURS ?? 24)

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

  if (sessionUserId) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      include: { oauthToken: { select: { id: true } } },
    })
    if (user) {
      const [entryCount, oldest] = await Promise.all([
        prisma.ledgerEntry.count({ where: { userId: user.id } }),
        prisma.ledgerEntry.findFirst({ where: { userId: user.id }, orderBy: { date: 'asc' }, select: { date: true } }),
      ])
      const caughtUp = !!user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < RATE_LIMIT_HOURS * 3600 * 1000
      return void res.json({
        id: user.id,
        email: user.email,
        connected: !!user.oauthToken,
        createdAt: user.createdAt,
        lastSyncedAt: user.lastSyncedAt,
        entryCount,
        oldestDate: oldest?.date ?? null,
        caughtUp,
      })
    }
  }

  // Unauthenticated / new device: make sure a row exists for this device id (it
  // serves as the OAuth hint), but never disclose connection status without a
  // valid session.
  const { id } = req.body
  if (id && typeof id === 'string') {
    await prisma.user.upsert({ where: { id }, create: { id }, update: {} })
  }
  res.json({ id: id ?? null, email: null, connected: false, entryCount: 0, oldestDate: null, caughtUp: false })
}))

export { router as usersRouter }
