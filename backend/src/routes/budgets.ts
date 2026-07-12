import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { CATEGORIES } from '../lib/categories'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession, enforceOwnership } from '../lib/session'

const router = Router()
router.use(requireSession)
router.param('userId', enforceOwnership) // 403 unless :userId matches the token's user

const VALID = new Set<string>([...CATEGORIES, 'overall'])

// GET /budgets/:userId → { budgets: { [category]: amount } }
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const rows = await prisma.budget.findMany({ where: { userId } })
  const budgets: Record<string, number> = {}
  for (const r of rows) budgets[r.category] = r.amount
  res.json({ budgets })
}))

// PUT /budgets/:userId  { category, amount }
// Upsert a monthly budget. amount <= 0 removes it. Ownership-scoped.
router.put('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params
  const category = String(req.body?.category ?? '')
  const amount = Number(req.body?.amount)

  if (!VALID.has(category)) return void res.status(400).json({ error: 'Invalid category' })
  if (!Number.isFinite(amount)) return void res.status(400).json({ error: 'Invalid amount' })

  if (amount <= 0) {
    await prisma.budget.deleteMany({ where: { userId, category } })
    return void res.json({ ok: true, removed: true, category })
  }

  const capped = Math.min(amount, 10_000_000)
  await prisma.budget.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, amount: capped },
    update: { amount: capped },
  })
  res.json({ ok: true, category, amount: capped })
}))

export { router as budgetsRouter }
