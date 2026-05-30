import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { computeStats } from '../lib/stats'

const router = Router()

// GET /wrapped/:userId          → all-time stats
// GET /wrapped/:userId?year=2025 → stats scoped to that calendar year
//
// `availableYears` is always computed from the FULL ledger so the year toggle
// shows every year regardless of the current filter. Pure DB read — no Claude.
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
      year: null,
      availableYears: [],
      stats: null,
    })
  }

  const availableYears = [...new Set(entries.map(e => e.date.getFullYear()))].sort((a, b) => b - a)

  const yearParam = Number(req.query.year)
  const year = Number.isInteger(yearParam) && availableYears.includes(yearParam) ? yearParam : null
  const scoped = year !== null ? entries.filter(e => e.date.getFullYear() === year) : entries

  res.json({
    connected: true,
    email: user.email,
    totalEntries: scoped.length,
    year,
    availableYears,
    stats: computeStats(scoped),
  })
})

export { router as wrappedRouter }
