import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { computeStats } from '../lib/stats'

const router = Router()

// GET /wrapped/:userId
router.get('/:userId', async (req, res) => {
  const { userId } = req.params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { oauthToken: { select: { id: true } } },
  })
  if (!user) return void res.status(404).json({ error: 'User not found' })

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  })

  if (entries.length === 0) {
    return void res.json({
      connected: !!user.oauthToken,
      email: user.email,
      totalEntries: 0,
      stats: null,
    })
  }

  res.json({
    connected: true,
    email: user.email,
    totalEntries: entries.length,
    stats: computeStats(entries),
  })
})

export { router as wrappedRouter }
