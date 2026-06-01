import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'

const router = Router()

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

  res.json({
    id: user.id,
    email: user.email,
    connected: !!user.oauthToken,
    createdAt: user.createdAt,
    lastSyncedAt: user.lastSyncedAt,
    entryCount,
    oldestDate: oldest?.date ?? null,
  })
}))

export { router as usersRouter }
