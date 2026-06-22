import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { computeStats } from '../lib/stats'
import { getUsdRates } from '../lib/fx'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession } from '../lib/session'
import { findUserOr404 } from '../lib/ledger'

const router = Router()
router.use(requireSession)

// GET /wrapped/:userId               → all-time stats
// GET /wrapped/:userId?year=2025      → scoped to a calendar year
// GET /wrapped/:userId?from=&to=      → scoped to a custom date window (inclusive, ISO dates)
//
// `availableYears` / `availableMonths` are always computed from the FULL ledger
// so the scope picker shows every option regardless of the current filter.
// Pure DB read — no Claude.
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params

  const user = await findUserOr404(res, userId)
  if (!user) return

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
      from: null,
      to: null,
      availableYears: [],
      availableMonths: [],
      stats: null,
    })
  }

  const availableYears = [...new Set(entries.map(e => e.date.getFullYear()))].sort((a, b) => b - a)
  const availableMonths = [...new Set(entries.map(e =>
    `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`
  ))].sort((a, b) => (a < b ? 1 : -1)) // newest first

  // Scope: a custom window (from/to) takes precedence, then a calendar year,
  // else all-time.
  const fromDate = typeof req.query.from === 'string' ? new Date(req.query.from) : null
  const toRaw = typeof req.query.to === 'string' ? new Date(req.query.to) : null
  const hasWindow = fromDate && !isNaN(fromDate.getTime()) && toRaw && !isNaN(toRaw.getTime())

  const yearParam = Number(req.query.year)
  const year = Number.isInteger(yearParam) && availableYears.includes(yearParam) ? yearParam : null

  let scoped = entries
  let fromOut: Date | null = null
  let toOut: Date | null = null
  if (hasWindow) {
    const toEnd = new Date(toRaw!)
    toEnd.setHours(23, 59, 59, 999) // inclusive of the end day
    scoped = entries.filter(e => e.date >= fromDate! && e.date <= toEnd)
    fromOut = fromDate
    toOut = toRaw
  } else if (year !== null) {
    scoped = entries.filter(e => e.date.getFullYear() === year)
  }

  const rates = await getUsdRates()
  res.json({
    connected: true,
    email: user.email,
    totalEntries: scoped.length,
    year: hasWindow ? null : year,
    from: fromOut,
    to: toOut,
    availableYears,
    availableMonths,
    stats: computeStats(scoped, rates),
  })
}))

export { router as wrappedRouter }
