// Pure aggregation functions — no I/O, easy to unit-test.
// Called by both the /wrapped route and the /export route.

import type { LedgerEntry } from '@prisma/client'
import { SPEND_CATEGORIES } from './categories'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CategoryStat {
  count: number
  spend: number
}

export interface VendorStat {
  vendor: string
  count: number
}

export interface CharityStat {
  vendor: string
  count: number
  total: number
}

export interface MostExpensive {
  vendor: string
  amount: number | null
  description: string
  date: Date
}

export interface WrappedStats {
  totalSpend: number
  byCategory: Record<string, CategoryStat>
  topVendors: VendorStat[]
  mostExpensive: MostExpensive | null
  monthlySpend: Record<string, number>
  subscriptions: string[]
  subscriptionCount: number
  topSpammers: VendorStat[]
  charities: CharityStat[]
  charityTotal: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function topByFreq(entries: LedgerEntry[], limit: number): VendorStat[] {
  const freq: Record<string, number> = {}
  for (const e of entries) {
    freq[e.vendor] = (freq[e.vendor] ?? 0) + 1
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([vendor, count]) => ({ vendor, count }))
}

// ── Main aggregation ──────────────────────────────────────────────────────────

export function computeStats(entries: LedgerEntry[]): WrappedStats {
  const spendEntries     = entries.filter(e => SPEND_CATEGORIES.includes(e.category as any))
  const marketingEntries = entries.filter(e => e.category === 'marketing')
  const charityEntries   = entries.filter(e => e.category === 'charity')

  // Total spend (purchases only)
  const totalSpend = round2(
    spendEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0)
  )

  // Category breakdown (all categories)
  const byCategory: Record<string, CategoryStat> = {}
  for (const e of entries) {
    if (!byCategory[e.category]) byCategory[e.category] = { count: 0, spend: 0 }
    byCategory[e.category].count++
    byCategory[e.category].spend += e.amount ?? 0
  }
  // Round spend values
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].spend = round2(byCategory[cat].spend)
  }

  // Top purchase vendors (marketing excluded)
  const topVendors = topByFreq(spendEntries, 5)

  // Most expensive single purchase
  const withAmount = spendEntries.filter(e => e.amount != null && e.amount > 0)
  const mostExpensive = withAmount.length > 0
    ? withAmount.reduce((max, e) => e.amount! > max.amount! ? e : max)
    : null

  // Monthly spend (purchases only)
  const monthlySpend: Record<string, number> = {}
  for (const e of spendEntries) {
    if (!e.amount) continue
    const key = monthKey(e.date)
    monthlySpend[key] = round2((monthlySpend[key] ?? 0) + e.amount)
  }

  // Subscriptions
  const subscriptions = [...new Set(
    entries.filter(e => e.category === 'subscription').map(e => e.vendor)
  )]

  // Top marketing senders
  const topSpammers = topByFreq(marketingEntries, 10)

  // Charities
  const charityMap: Record<string, { count: number; total: number }> = {}
  for (const e of charityEntries) {
    if (!charityMap[e.vendor]) charityMap[e.vendor] = { count: 0, total: 0 }
    charityMap[e.vendor].count++
    charityMap[e.vendor].total += e.amount ?? 0
  }
  const charities: CharityStat[] = Object.entries(charityMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([vendor, { count, total }]) => ({ vendor, count, total: round2(total) }))
  const charityTotal = round2(charityEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0))

  return {
    totalSpend,
    byCategory,
    topVendors,
    mostExpensive: mostExpensive
      ? { vendor: mostExpensive.vendor, amount: mostExpensive.amount, description: mostExpensive.description, date: mostExpensive.date }
      : null,
    monthlySpend,
    subscriptions,
    subscriptionCount: subscriptions.length,
    topSpammers,
    charities,
    charityTotal,
  }
}
