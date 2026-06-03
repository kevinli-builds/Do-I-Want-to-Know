import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession } from '../lib/session'

const router = Router()
router.use(requireSession)

// GET /upcoming/:userId
// Future-dated, non-promotional events (deliveries, flights, check-ins, event
// tickets) with eventDate today-or-later, soonest first. Powers the Upcoming
// floater. Pure DB read — no Claude.
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const rows = await prisma.ledgerEntry.findMany({
    where: {
      userId,
      eventDate: { gte: startOfToday },
      category: { notIn: ['marketing', 'refund'] },
    },
    orderBy: { eventDate: 'asc' },
    take: 30,
  })

  res.json({
    upcoming: rows.map(e => ({
      id: e.id,
      category: e.category,
      vendor: e.vendor,
      description: e.description,
      eventDate: e.eventDate,
      emailId: e.emailId,
    })),
  })
}))

export { router as upcomingRouter }
