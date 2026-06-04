import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { getUsdRates, toUsd } from '../lib/fx'
import { CATEGORIES } from '../lib/categories'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession } from '../lib/session'

const router = Router()
router.use(requireSession)

// GET /transactions/:userId
// Returns every extracted record (newest first) so the user can audit any view
// and click through to the source Gmail message. Pure DB read — no Claude cost.
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return void res.status(404).json({ error: 'User not found' })

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  })

  const rates = await getUsdRates()
  res.json({
    transactions: entries.map(e => ({
      id: e.id,
      date: e.date,
      category: e.category,
      vendor: e.vendor,
      amount: e.amount,                          // original amount, in `currency`
      currency: e.currency,
      amountUsd: toUsd(e.amount, e.currency, rates), // normalized to USD for totals/sorting
      description: e.description,
      emailId: e.emailId,
      senderEmail: e.senderEmail,
      unsubscribe: e.unsubscribe,
      termMonths: e.termMonths,
      categoryLocked: e.categoryLocked,
    })),
  })
}))

// PATCH /transactions/:userId/:id   { category }
// Manually correct a record's category. requireSession guarantees :userId is
// the caller; we additionally scope the update to that user's own row, and set
// categoryLocked so the entry is treated as user-authoritative going forward.
router.patch('/:userId/:id', asyncHandler(async (req, res) => {
  const { userId, id } = req.params
  const category = String(req.body?.category ?? '')
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return void res.status(400).json({ error: 'Invalid category' })
  }

  const result = await prisma.ledgerEntry.updateMany({
    where: { id, userId },                 // ownership-scoped: can't touch another user's row
    data: { category, categoryLocked: true },
  })
  if (result.count === 0) return void res.status(404).json({ error: 'Transaction not found' })

  res.json({ ok: true, id, category })
}))

export { router as transactionsRouter }
