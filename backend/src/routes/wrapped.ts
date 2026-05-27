import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// GET /wrapped/:userId
// Returns aggregated "Spotify Wrapped"-style stats from the user's ledger
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
      stats: null,
    })
  }

  // ── Total spend ──────────────────────────────────────────────────────────────
  const totalSpend = entries
    .filter(e => e.amount !== null)
    .reduce((sum, e) => sum + (e.amount ?? 0), 0)

  // ── Category breakdown ────────────────────────────────────────────────────────
  const byCategory: Record<string, { count: number; spend: number }> = {}
  for (const e of entries) {
    if (!byCategory[e.category]) byCategory[e.category] = { count: 0, spend: 0 }
    byCategory[e.category].count++
    byCategory[e.category].spend += e.amount ?? 0
  }

  // ── Top vendors by order frequency ───────────────────────────────────────────
  const vendorFreq: Record<string, number> = {}
  for (const e of entries) {
    vendorFreq[e.vendor] = (vendorFreq[e.vendor] ?? 0) + 1
  }
  const topVendors = Object.entries(vendorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendor, count]) => ({ vendor, count }))

  // ── Most expensive single purchase ───────────────────────────────────────────
  const withAmount = entries.filter(e => e.amount !== null && e.amount > 0)
  const mostExpensive =
    withAmount.length > 0
      ? withAmount.reduce((max, e) => (e.amount! > max.amount! ? e : max))
      : null

  // ── Monthly spend (last 12 months) ───────────────────────────────────────────
  const monthlySpend: Record<string, number> = {}
  for (const e of entries) {
    if (!e.amount) continue
    const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`
    monthlySpend[key] = (monthlySpend[key] ?? 0) + e.amount
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  const subscriptionVendors = [
    ...new Set(entries.filter(e => e.category === 'subscription').map(e => e.vendor)),
  ]

  res.json({
    connected: true,
    email: user.email,
    totalEntries: entries.length,
    stats: {
      totalSpend: Math.round(totalSpend * 100) / 100,
      byCategory,
      topVendors,
      mostExpensive: mostExpensive
        ? {
            vendor: mostExpensive.vendor,
            amount: mostExpensive.amount,
            description: mostExpensive.description,
            date: mostExpensive.date,
          }
        : null,
      monthlySpend,
      subscriptions: subscriptionVendors,
      subscriptionCount: subscriptionVendors.length,
    },
  })
})

export { router as wrappedRouter }
