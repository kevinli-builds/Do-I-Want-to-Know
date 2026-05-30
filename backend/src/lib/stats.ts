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

export interface SpammerStat {
  vendor: string
  count: number
  senderEmail: string | null
  unsubscribe: string | null
}

export interface SubscriptionInsight {
  vendor: string
  monthlyEstimate: number          // cost normalized to a monthly figure
  lastAmount: number | null        // most recent known charge amount
  cadence: 'weekly' | 'monthly' | 'annual'
  lastCharge: string               // ISO date of most recent charge
  chargeCount: number
  active: boolean                  // charged within the expected recency window
}

export interface MostExpensive {
  vendor: string
  amount: number | null
  description: string
  date: Date
  emailId: string
}

export interface WrappedStats {
  totalSpend: number
  byCategory: Record<string, CategoryStat>
  topVendors: VendorStat[]
  mostExpensive: MostExpensive | null
  monthlySpend: Record<string, number>
  subscriptions: string[]
  subscriptionCount: number
  subscriptionInsights: SubscriptionInsight[]
  monthlySubscriptionCost: number
  annualSubscriptionCost: number
  topSpammers: SpammerStat[]
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

// Rank marketing senders by volume, enriched with the most recent sender email
// + unsubscribe link so the UI can offer a one-click unsubscribe.
// Assumes `marketingEntries` is sorted newest-first.
function topSpammersFrom(marketingEntries: LedgerEntry[], limit: number): SpammerStat[] {
  const acc: Record<string, SpammerStat> = {}
  for (const e of marketingEntries) {
    if (!acc[e.vendor]) {
      acc[e.vendor] = {
        vendor: e.vendor,
        count: 0,
        senderEmail: e.senderEmail ?? null,
        unsubscribe: e.unsubscribe ?? null,
      }
    }
    const s = acc[e.vendor]
    s.count++
    // Backfill from older emails if the newest lacked the field
    if (!s.senderEmail && e.senderEmail) s.senderEmail = e.senderEmail
    if (!s.unsubscribe && e.unsubscribe) s.unsubscribe = e.unsubscribe
  }
  return Object.values(acc)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

// Analyze subscription entries per vendor: detect cadence from the gaps between
// charges, estimate a normalized monthly cost, and flag whether it's still active.
function computeSubscriptionInsights(subEntries: LedgerEntry[]): {
  insights: SubscriptionInsight[]
  monthlyCost: number
  annualCost: number
} {
  const byVendor: Record<string, LedgerEntry[]> = {}
  for (const e of subEntries) (byVendor[e.vendor] ??= []).push(e)

  const insights: SubscriptionInsight[] = Object.entries(byVendor).map(([vendor, list]) => {
    const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime())
    const withAmount = sorted.filter(e => e.amount != null && e.amount > 0)
    const lastAmount = withAmount.length ? withAmount[withAmount.length - 1].amount! : null

    // Median gap between consecutive charges (days)
    let medianGap = 30.44 // assume monthly when we only have one sighting
    if (sorted.length >= 2) {
      const gaps: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        gaps.push((sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86_400_000)
      }
      gaps.sort((a, b) => a - b)
      medianGap = gaps[Math.floor(gaps.length / 2)] || 30.44
    }

    let cadence: SubscriptionInsight['cadence']
    if (medianGap <= 10) cadence = 'weekly'
    else if (medianGap > 250) cadence = 'annual'
    else cadence = 'monthly'

    const monthlyEstimate = lastAmount != null ? round2(lastAmount * (30.44 / medianGap)) : 0

    const lastCharge = sorted[sorted.length - 1].date
    const ageDays = (Date.now() - lastCharge.getTime()) / 86_400_000
    const active = cadence === 'annual' ? ageDays <= 400 : ageDays <= 45

    return {
      vendor,
      monthlyEstimate,
      lastAmount,
      cadence,
      lastCharge: lastCharge.toISOString().slice(0, 10),
      chargeCount: list.length,
      active,
    }
  })

  insights.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
  // "Current burn" counts active subscriptions only
  const monthlyCost = round2(
    insights.filter(i => i.active).reduce((sum, i) => sum + i.monthlyEstimate, 0)
  )
  return { insights, monthlyCost, annualCost: round2(monthlyCost * 12) }
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
  const subEntries = entries.filter(e => e.category === 'subscription')
  const subscriptions = [...new Set(subEntries.map(e => e.vendor))]
  const subRadar = computeSubscriptionInsights(subEntries)

  // Top marketing senders (with unsubscribe metadata)
  const topSpammers = topSpammersFrom(marketingEntries, 10)

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
      ? { vendor: mostExpensive.vendor, amount: mostExpensive.amount, description: mostExpensive.description, date: mostExpensive.date, emailId: mostExpensive.emailId }
      : null,
    monthlySpend,
    subscriptions,
    subscriptionCount: subscriptions.length,
    subscriptionInsights: subRadar.insights,
    monthlySubscriptionCost: subRadar.monthlyCost,
    annualSubscriptionCost: subRadar.annualCost,
    topSpammers,
    charities,
    charityTotal,
  }
}
