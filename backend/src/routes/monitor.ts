import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { computeMonitor, type Period } from '../lib/monitor'
import { getUsdRates } from '../lib/fx'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession } from '../lib/session'

const router = Router()
router.use(requireSession)

// GET /monitor/:userId?period=month|year
// Period-over-period monitoring deck. Pure DB read — no Claude cost.
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { oauthToken: { select: { id: true } } },
  })
  if (!user) return void res.status(404).json({ error: 'User not found' })

  const period: Period = req.query.period === 'year' ? 'year' : 'month'

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  })

  if (entries.length === 0) {
    return void res.json({ connected: !!user.oauthToken, email: user.email, empty: true, period })
  }

  const rates = await getUsdRates()
  res.json({
    connected: true,
    email: user.email,
    empty: false,
    ...computeMonitor(entries, period, rates),
  })
}))

export { router as monitorRouter }
