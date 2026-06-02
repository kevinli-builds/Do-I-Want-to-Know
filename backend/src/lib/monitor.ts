// Period-over-period monitoring analytics — powers the Monitor deck.
// Pure functions over LedgerEntry[]; no I/O, no Claude.

import type { LedgerEntry } from '@prisma/client'
import { SPEND_CATEGORIES, type Category } from './categories'
import { computeStats } from './stats'
import { toUsd } from './fx'

export type Period = 'month' | 'year'

export interface KpiPair {
  value: number
  prev: number
  deltaPct: number | null // null when prev is 0 (can't compute %)
}

export interface MonitorFlag {
  kind: 'up' | 'down' | 'new' | 'info'
  text: string
}

// 12-month time-series, split by category, so the UI can chart a single
// aggregate line or break it out per category, for either metric.
export interface MonitorAnalytics {
  months: string[] // 12 short month labels, oldest → newest
  categories: string[] // categories present in the window
  countByCategory: Record<string, number[]> // category → 12 monthly counts
  spendByCategory: Record<string, number[]> // category → 12 monthly spend totals
}

export interface MonitorData {
  period: Period
  currentLabel: string
  previousLabel: string
  kpis: {
    spend: KpiPair
    transactions: KpiPair
    subscriptionSpend: KpiPair
    promoEmails: KpiPair
    donations: KpiPair
  }
  analytics: MonitorAnalytics
  subscriptions: {
    monthlyBurn: number
    activeCount: number
    newlyDetected: { vendor: string; monthlyEstimate: number }[]
    priceChanges: { vendor: string; from: number; to: number }[]
  }
  topSenders: { vendor: string; count: number; prevCount: number }[]
  flags: MonitorFlag[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const isSpend = (e: LedgerEntry) => SPEND_CATEGORIES.includes(e.category as Category)

function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return round1(((cur - prev) / prev) * 100)
}

function periodBase(period: Period, now: Date, which: 'cur' | 'prev'): Date {
  if (period === 'year') return new Date(now.getFullYear() - (which === 'cur' ? 0 : 1), 0, 1)
  return new Date(now.getFullYear(), now.getMonth() - (which === 'cur' ? 0 : 1), 1)
}

function inPeriod(d: Date, period: Period, base: Date): boolean {
  if (period === 'year') return d.getFullYear() === base.getFullYear()
  return d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth()
}

function periodLabel(period: Period, base: Date): string {
  return period === 'year'
    ? String(base.getFullYear())
    : base.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function kpiTotals(entries: LedgerEntry[]) {
  const grossSpend = entries.filter(isSpend).reduce((s, e) => s + (e.amount ?? 0), 0)
  const refunds = entries.filter(e => e.category === 'refund').reduce((s, e) => s + (e.amount ?? 0), 0)
  const spend = round2(grossSpend - refunds) // net of refunds
  const transactions = entries.filter(isSpend).length
  const subscriptionSpend = round2(
    entries.filter(e => e.category === 'subscription').reduce((s, e) => s + (e.amount ?? 0), 0)
  )
  const promoEmails = entries.filter(e => e.category === 'marketing').length
  const donations = round2(
    entries.filter(e => e.category === 'charity').reduce((s, e) => s + (e.amount ?? 0), 0)
  )
  return { spend, transactions, subscriptionSpend, promoEmails, donations }
}

const pair = (cur: number, prev: number): KpiPair => ({ value: cur, prev, deltaPct: deltaPct(cur, prev) })

// Build a 12-month, per-category time series for both count and spend.
export function computeAnalytics(entries: LedgerEntry[], now = new Date()): MonitorAnalytics {
  const monthsD: Date[] = []
  for (let i = 11; i >= 0; i--) monthsD.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
  const idxByKey: Record<string, number> = {}
  monthsD.forEach((d, i) => { idxByKey[monthKey(d)] = i })

  const countByCategory: Record<string, number[]> = {}
  const spendByCategory: Record<string, number[]> = {}
  const cats = new Set<string>()
  for (const e of entries) {
    const idx = idxByKey[monthKey(e.date)]
    if (idx === undefined) continue // outside the 12-month window
    cats.add(e.category)
    if (!countByCategory[e.category]) {
      countByCategory[e.category] = Array(12).fill(0)
      spendByCategory[e.category] = Array(12).fill(0)
    }
    countByCategory[e.category][idx] += 1
    spendByCategory[e.category][idx] += e.amount ?? 0
  }
  for (const c of Object.keys(spendByCategory)) {
    spendByCategory[c] = spendByCategory[c].map(round2)
  }

  return {
    months: monthsD.map(d => d.toLocaleString('en-US', { month: 'short' })),
    categories: [...cats].sort(),
    countByCategory,
    spendByCategory,
  }
}

export function computeMonitor(
  rawEntries: LedgerEntry[],
  period: Period,
  rates: Record<string, number> = { USD: 1 },
  now = new Date(),
): MonitorData {
  // Normalize amounts to USD up front so every KPI, trend, and subscription
  // figure below is single-currency.
  const entries = rawEntries.map(e => ({
    ...e,
    amount: toUsd(e.amount, e.currency, rates),
    currency: 'USD',
  }))

  const curBase = periodBase(period, now, 'cur')
  const prevBase = periodBase(period, now, 'prev')
  const curEntries = entries.filter(e => inPeriod(e.date, period, curBase))
  const prevEntries = entries.filter(e => inPeriod(e.date, period, prevBase))

  const cur = kpiTotals(curEntries)
  const prev = kpiTotals(prevEntries)

  // ── Subscription monitor ──────────────────────────────────────────────────
  const stats = computeStats(entries)
  const activeInsights = stats.subscriptionInsights.filter(s => s.active)

  // Group subscription charges by vendor (ascending date) for new/price detection
  const subByVendor: Record<string, LedgerEntry[]> = {}
  for (const e of entries) {
    if (e.category === 'subscription') (subByVendor[e.vendor] ??= []).push(e)
  }
  const newlyDetected: { vendor: string; monthlyEstimate: number }[] = []
  const priceChanges: { vendor: string; from: number; to: number }[] = []
  for (const [vendor, list] of Object.entries(subByVendor)) {
    const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime())
    // New this period: the very first charge we've seen lands in the current period
    if (inPeriod(sorted[0].date, period, curBase)) {
      const est = stats.subscriptionInsights.find(s => s.vendor === vendor)?.monthlyEstimate ?? 0
      newlyDetected.push({ vendor, monthlyEstimate: est })
    }
    // Price change: last two distinct known amounts differ
    const amts = sorted.filter(e => e.amount != null && e.amount > 0).map(e => e.amount as number)
    if (amts.length >= 2) {
      const to = amts[amts.length - 1]
      const from = amts[amts.length - 2]
      if (Math.abs(to - from) >= 0.01) priceChanges.push({ vendor, from: round2(from), to: round2(to) })
    }
  }

  // ── Inbox-load monitor: top senders this period (+ prior count) ────────────
  const curMarketing = curEntries.filter(e => e.category === 'marketing')
  const prevMarketing = prevEntries.filter(e => e.category === 'marketing')
  const curCounts: Record<string, number> = {}
  const prevCounts: Record<string, number> = {}
  for (const e of curMarketing) curCounts[e.vendor] = (curCounts[e.vendor] ?? 0) + 1
  for (const e of prevMarketing) prevCounts[e.vendor] = (prevCounts[e.vendor] ?? 0) + 1
  const topSenders = Object.entries(curCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([vendor, count]) => ({ vendor, count, prevCount: prevCounts[vendor] ?? 0 }))

  // ── Auto-flagged changes ──────────────────────────────────────────────────
  const flags: MonitorFlag[] = []
  const spendDelta = deltaPct(cur.spend, prev.spend)
  if (spendDelta != null && Math.abs(spendDelta) >= 25) {
    flags.push({
      kind: spendDelta > 0 ? 'up' : 'down',
      text: `Spend ${spendDelta > 0 ? 'up' : 'down'} ${Math.abs(spendDelta)}% vs ${periodLabel(period, prevBase)}`,
    })
  }
  const promoDelta = deltaPct(cur.promoEmails, prev.promoEmails)
  if (promoDelta != null && Math.abs(promoDelta) >= 25) {
    flags.push({
      kind: promoDelta > 0 ? 'up' : 'down',
      text: `Promotional email ${promoDelta > 0 ? 'up' : 'down'} ${Math.abs(promoDelta)}%`,
    })
  }
  for (const n of newlyDetected) {
    flags.push({
      kind: 'new',
      text: `New subscription: ${n.vendor}${n.monthlyEstimate > 0 ? ` (~$${n.monthlyEstimate}/mo)` : ''}`,
    })
  }
  for (const p of priceChanges) {
    flags.push({ kind: 'info', text: `Price change: ${p.vendor} $${p.from} → $${p.to}` })
  }
  if (flags.length === 0) flags.push({ kind: 'info', text: 'No notable changes this period.' })

  return {
    period,
    currentLabel: periodLabel(period, curBase),
    previousLabel: periodLabel(period, prevBase),
    kpis: {
      spend: pair(cur.spend, prev.spend),
      transactions: pair(cur.transactions, prev.transactions),
      subscriptionSpend: pair(cur.subscriptionSpend, prev.subscriptionSpend),
      promoEmails: pair(cur.promoEmails, prev.promoEmails),
      donations: pair(cur.donations, prev.donations),
    },
    analytics: computeAnalytics(entries, now),
    subscriptions: {
      monthlyBurn: stats.monthlySubscriptionCost,
      activeCount: activeInsights.length,
      newlyDetected,
      priceChanges,
    },
    topSenders,
    flags,
  }
}
