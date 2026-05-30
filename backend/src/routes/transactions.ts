import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// GET /transactions/:userId
// Returns every extracted record (newest first) so the user can audit any view
// and click through to the source Gmail message. Pure DB read — no Claude cost.
router.get('/:userId', async (req, res) => {
  const { userId } = req.params

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return void res.status(404).json({ error: 'User not found' })

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  })

  res.json({
    transactions: entries.map(e => ({
      id: e.id,
      date: e.date,
      category: e.category,
      vendor: e.vendor,
      amount: e.amount,
      currency: e.currency,
      description: e.description,
      emailId: e.emailId,
      senderEmail: e.senderEmail,
    })),
  })
})

export { router as transactionsRouter }
