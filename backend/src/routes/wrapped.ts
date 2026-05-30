import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// Categories that represent real financial spend (not marketing noise)
const SPEND_CATEGORIES = ['order', 'subscription', 'travel', 'food', 'entertainment', 'other']

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

  // Partition entries by broad type
  const spendEntries   = entries.filter(e => SPEND_CATEGORIES.includes(e.category))
  const marketingEntries = entries.filter(e => e.category === 'marketing')
  const charityEntries = entries.filter(e => e.category === 'charity')

  // ── Total purchase spend (marketing / charity excluded) ───────────────────────
  const totalSpend = spendEntries
    .filter(e => e.amount !== null)
    .reduce((sum, e) => sum + (e.amount ?? 0), 0)

  // ── Category breakdown (all categories including marketing & charity) ──────────
  const byCategory: Record<string, { count: number; spend: number }> = {}
  for (const e of entries) {
    if (!byCategory[e.category]) byCategory[e.category] = { count: 0, spend: 0 }
    byCategory[e.category].count++
    byCategory[e.category].spend += e.amount ?? 0
  }

  // ── Top purchase vendors by frequency (marketing excluded) ────────────────────
  const vendorFreq: Record<string, number> = {}
  for (const e of spendEntries) {
    vendorFreq[e.vendor] = (vendorFreq[e.vendor] ?? 0) + 1
  }
  const topVendors = Object.entries(vendorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendor, count]) => ({ vendor, count }))

  // ── Most expensive single purchase (marketing / charity excluded) ─────────────
  const withAmount = spendEntries.filter(e => e.amount !== null && e.amount > 0)
  const mostExpensive =
    withAmount.length > 0
      ? withAmount.reduce((max, e) => (e.amount! > max.amount! ? e : max))
      : null

  // ── Monthly spend (purchases only) ───────────────────────────────────────────
  const monthlySpend: Record<string, number> = {}
  for (const e of spendEntries) {
    if (!e.amount) continue
    const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`
    monthlySpend[key] = (monthlySpend[key] ?? 0) + e.amount
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  const subscriptionVendors = [
    ...new Set(entries.filter(e => e.category === 'subscription').map(e => e.vendor)),
  ]

  // ── Top email senders / "spammers" (marketing category only) ─────────────────
  const spammerFreq: Record<string, number> = {}
  for (const e of marketingEntries) {
    spammerFreq[e.vendor] = (spammerFreq[e.vendor] ?? 0) + 1
  }
  const topSpammers = Object.entries(spammerFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([vendor, count]) => ({ vendor, count }))

  // ── Charity / donations ───────────────────────────────────────────────────────
  const charityByVendor: Record<string, { count: number; total: number }> = {}
  for (const e of charityEntries) {
    if (!charityByVendor[e.vendor]) charityByVendor[e.vendor] = { count: 0, total: 0 }
    charityByVendor[e.vendor].count++
    charityByVendor[e.vendor].total += e.amount ?? 0
  }
  const charities = Object.entries(charityByVendor)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([vendor, info]) => ({
      vendor,
      count: info.count,
      total: Math.round(info.total * 100) / 100,
    }))
  const charityTotal = Math.round(
    charityEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0) * 100
  ) / 100

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
      topSpammers,
      charities,
      charityTotal,
    },
  })
})

export { router as wrappedRouter }
