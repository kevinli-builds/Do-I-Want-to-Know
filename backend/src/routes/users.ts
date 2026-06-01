import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'

const router = Router()

const RATE_LIMIT_HOURS = Number(process.env.SYNC_RATE_LIMIT_HOURS ?? 24)

// POST /users  { id }
// Creates or finds the user for this device UUID, returns connection status
router.post('/', asyncHandler(async (req, res) => {
  const { id } = req.body
  if (!id) return void res.status(400).json({ error: 'id required' })

  const user = await prisma.user.upsert({
    where: { id },
    create: { id },
    update: {},
    include: { oauthToken: { select: { id: true } } },
  })

  // Sync progress: how many records and how far back we've reached
  const [entryCount, oldest] = await Promise.all([
    prisma.ledgerEntry.count({ where: { userId: user.id } }),
    prisma.ledgerEntry.findFirst({ where: { userId: user.id }, orderBy: { date: 'asc' }, select: { date: true } }),
  ])

  // "Caught up" = we've cooled down since the last sync that reached the end.
  // (lastSyncedAt is only stamped once a sync catches up, so this also reads as
  // "not mid-backfill".)
  const caughtUp = !!user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < RATE_LIMIT_HOURS * 3600 * 1000

  res.json({
    id: user.id,
    email: user.email,
    connected: !!user.oauthToken,
    createdAt: user.createdAt,
    lastSyncedAt: user.lastSyncedAt,
    entryCount,
    oldestDate: oldest?.date ?? null,
    caughtUp,
  })
}))

export { router as usersRouter }
