import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession, enforceOwnership } from '../lib/session'

const router = Router()
router.use(requireSession)
router.param('userId', enforceOwnership) // 403 unless :userId matches the token's user

// GET /promotions/:userId
// Marketing entries that look like a real offer — they carry a promo code,
// discount text, or a future expiry. Expired offers are dropped; results are
// sorted by soonest expiry (offers with no known expiry come last). Pure DB read.
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const rows = await prisma.ledgerEntry.findMany({
    where: {
      userId,
      category: 'marketing',
      OR: [
        { promoCode: { not: null } },
        { discount: { not: null } },
        { eventDate: { gte: startOfToday } },
      ],
    },
  })

  // Keep offers that haven't expired (no expiry = still keep), soonest expiry first.
  const active = rows
    .filter(e => !e.eventDate || e.eventDate >= startOfToday)
    .sort((a, b) => (a.eventDate?.getTime() ?? Infinity) - (b.eventDate?.getTime() ?? Infinity))

  // Note: deliberately no senderEmail/unsubscribe here — the Promotions card
  // doesn't render them, so don't ship them (least-data principle).
  res.json({
    promotions: active.map(e => ({
      id: e.id,
      vendor: e.vendor,
      description: e.description,
      promoCode: e.promoCode,
      discount: e.discount,
      expiresAt: e.eventDate,
      emailId: e.emailId,
    })),
  })
}))

export { router as promotionsRouter }
