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

// PATCH /transactions/:userId/:id   { category?, vendor? }
// Manually correct a record's category and/or vendor. requireSession guarantees
// :userId is the caller; we additionally scope the update to that user's own row.
// A category change sets categoryLocked so the entry stays user-authoritative.
router.patch('/:userId/:id', asyncHandler(async (req, res) => {
  const { userId, id } = req.params
  const data: { category?: string; categoryLocked?: boolean; vendor?: string } = {}

  if (req.body?.category !== undefined) {
    const category = String(req.body.category)
    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return void res.status(400).json({ error: 'Invalid category' })
    }
    data.category = category
    data.categoryLocked = true
  }

  if (req.body?.vendor !== undefined) {
    const vendor = String(req.body.vendor).trim().slice(0, 120)
    if (!vendor) return void res.status(400).json({ error: 'Vendor cannot be empty' })
    data.vendor = vendor
  }

  if (Object.keys(data).length === 0) {
    return void res.status(400).json({ error: 'Nothing to update' })
  }

  const result = await prisma.ledgerEntry.updateMany({
    where: { id, userId },                 // ownership-scoped: can't touch another user's row
    data,
  })
  if (result.count === 0) return void res.status(404).json({ error: 'Transaction not found' })

  res.json({ ok: true, id, ...data })
}))

// POST /transactions/:userId/rename-vendor   { from, to }
// Rename every record with vendor == `from` to `to` (this user only). Powers the
// "rename all" option so a messy sender name can be fixed across the board.
router.post('/:userId/rename-vendor', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const from = String(req.body?.from ?? '').trim()
  const to = String(req.body?.to ?? '').trim().slice(0, 120)
  if (!from || !to) return void res.status(400).json({ error: 'from and to are required' })

  const result = await prisma.ledgerEntry.updateMany({
    where: { userId, vendor: from },       // ownership-scoped
    data: { vendor: to },
  })
  res.json({ ok: true, updated: result.count, to })
}))

export { router as transactionsRouter }
