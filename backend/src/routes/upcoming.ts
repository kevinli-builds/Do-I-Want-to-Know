import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { getUsdRates, normalizeToUsd } from '../lib/fx'
import { computeSubscriptionInsights } from '../lib/stats'
import { computeRenewals } from '../lib/renewals'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession } from '../lib/session'

const router = Router()
router.use(requireSession)

// GET /upcoming/:userId
// Two forward-looking lists, both pure DB reads (no Claude):
//   • upcoming — future-dated events (deliveries, flights, check-ins, tickets,
//     and trial-end dates) with eventDate today-or-later, soonest first.
//   • renewals — predicted next charge for each active subscription, within ~45d.
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [rows, subEntries, rates] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { userId, eventDate: { gte: startOfToday }, category: { notIn: ['marketing', 'refund'] } },
      orderBy: { eventDate: 'asc' },
      take: 30,
    }),
    prisma.ledgerEntry.findMany({ where: { userId, category: 'subscription' } }),
    getUsdRates(),
  ])

  const insights = computeSubscriptionInsights(normalizeToUsd(subEntries, rates)).insights
  const renewals = computeRenewals(insights)

  res.json({
    upcoming: rows.map(e => ({
      id: e.id,
      category: e.category,
      vendor: e.vendor,
      description: e.description,
      eventDate: e.eventDate,
      emailId: e.emailId,
    })),
    renewals,
  })
}))

export { router as upcomingRouter }
