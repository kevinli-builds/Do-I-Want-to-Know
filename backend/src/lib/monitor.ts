// Period-over-period monitoring analytics — powers the Monitor deck.
// Pure functions over LedgerEntry[]; no I/O, no Claude.

import type { LedgerEntry } from '@prisma/client'
import { SPEND_CATEGORIES, CATEGORY_LABELS, type Category } from './categories'
import { computeStats } from './stats'
import { normalizeToUsd } from './fx'
import { computeRenewals, type Renewal } from './renewals'

export interface BudgetInput { category: string; amount: number }
export interface BudgetProgress {
  category: string  // a category key, or 'overall'
  label: string
  amount: number    // monthly budget (USD)
  spent: number     // this calendar month (USD)
  pct: number       // 0..N (can exceed 100)
}

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

// A spend comparison between two periods (for the plain-language trend section).
export interface TrendChange {
  fromLabel: string
  toLabel: string
  from: number
  to: number
  deltaPct: number | null // null when the earlier period was 0 (can't compute %)
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
    renewals: Renewal[]
  }
  topSenders: { vendor: string; count: number; prevCount: number }[]
  budgets: BudgetProgress[]
  flags: MonitorFlag[]
  // Plain-language spend trend, independent of the month/year toggle.
  trend: {
    mom: TrendChange | null // most recent month vs the month before
    yoy: TrendChange | null // most recent month vs the same month a year earlier
  }
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

const monthStartLabel = (d: Date) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' })

// Plain-language spend trend: most recent month vs the prior month (MoM) and vs
// the same month a year earlier (YoY). Net of refunds, USD. Expects normalized
// entries. Independent of the month/year period toggle.
export function computeTrend(entries: LedgerEntry[]): { mom: TrendChange | null; yoy: TrendChange | null } {
  if (entries.length === 0) return { mom: null, yoy: null }
  const net = new Map<string, number>()
  const add = (key: string, v: number) => net.set(key, (net.get(key) ?? 0) + v)
  for (const e of entries) {
    if (isSpend(e)) add(monthKey(e.date), e.amount ?? 0)
    else if (e.category === 'refund') add(monthKey(e.date), -(e.amount ?? 0))
  }

  const max = new Date(Math.max(...entries.map(e => e.date.getTime())))
  const cur = new Date(max.getFullYear(), max.getMonth(), 1)
  const prev = new Date(max.getFullYear(), max.getMonth() - 1, 1)
  const yoyMonth = new Date(max.getFullYear() - 1, max.getMonth(), 1)
  const to = round2(net.get(monthKey(cur)) ?? 0)

  const momFrom = round2(net.get(monthKey(prev)) ?? 0)
  const mom: TrendChange | null = to !== 0 || momFrom !== 0
    ? { fromLabel: monthStartLabel(prev), toLabel: monthStartLabel(cur), from: momFrom, to, deltaPct: deltaPct(to, momFrom) }
    : null

  const yoy: TrendChange | null = net.has(monthKey(yoyMonth))
    ? (() => {
        const from = round2(net.get(monthKey(yoyMonth)) ?? 0)
        return { fromLabel: monthStartLabel(yoyMonth), toLabel: monthStartLabel(cur), from, to, deltaPct: deltaPct(to, from) }
      })()
    : null

  return { mom, yoy }
}

// Spend-vs-budget for the CURRENT calendar month (budgets are monthly), per
// budgeted category (or 'overall'). Expects USD-normalized entries.
function computeBudgets(entries: LedgerEntry[], budgets: BudgetInput[], now: Date): BudgetProgress[] {
  if (budgets.length === 0) return []
  const y = now.getFullYear(), m = now.getMonth()
  const month = entries.filter(e => e.date.getFullYear() === y && e.date.getMonth() === m)
  const spentFor = (cat: string): number => {
    if (cat === 'overall') {
      const gross = month.filter(isSpend).reduce((s, e) => s + (e.amount ?? 0), 0)
      const refunds = month.filter(e => e.category === 'refund').reduce((s, e) => s + (e.amount ?? 0), 0)
      return round2(gross - refunds)
    }
    return round2(month.filter(e => e.category === cat).reduce((s, e) => s + (e.amount ?? 0), 0))
  }
  return budgets
    .map(b => {
      const spent = spentFor(b.category)
      return {
        category: b.category,
        label: b.category === 'overall' ? 'Overall' : (CATEGORY_LABELS[b.category as Category] ?? b.category),
        amount: round2(b.amount),
        spent,
        pct: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
      }
    })
    .sort((a, b) => b.pct - a.pct)
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Flag charges that stand out: a charge much larger than the vendor's historical
// norm (>=3 prior charges, >=3x the median), or a brand-new vendor this period.
// Operates on USD-normalized entries; capped to keep the flag strip readable.
function computeUnusual(entries: LedgerEntry[], curEntries: LedgerEntry[], curBase: Date, period: Period): MonitorFlag[] {
  const priorByVendor: Record<string, number[]> = {}
  for (const e of entries) {
    if (!isSpend(e) || e.amount == null || e.amount <= 0) continue
    if (e.date < curBase) (priorByVendor[e.vendor] ??= []).push(e.amount)
  }

  // Largest current-period charge per vendor (avoids multiple flags for one vendor).
  const curMax: Record<string, number> = {}
  for (const e of curEntries) {
    if (!isSpend(e) || e.amount == null || e.amount <= 0) continue
    curMax[e.vendor] = Math.max(curMax[e.vendor] ?? 0, e.amount)
  }

  const spikes: { vendor: string; amount: number; ratio: number }[] = []
  const fresh: { vendor: string; amount: number }[] = []
  for (const [vendor, amount] of Object.entries(curMax)) {
    const prior = priorByVendor[vendor]
    if (!prior || prior.length === 0) {
      if (amount >= 40) fresh.push({ vendor, amount }) // new vendor, ignore tiny one-offs
      continue
    }
    if (prior.length >= 3) {
      const med = median(prior)
      if (med > 0 && amount >= med * 3) spikes.push({ vendor, amount, ratio: amount / med })
    }
  }

  const flags: MonitorFlag[] = []
  spikes.sort((a, b) => b.ratio - a.ratio)
  for (const s of spikes.slice(0, 3)) {
    flags.push({ kind: 'up', text: `⚠️ ${s.vendor} $${Math.round(s.amount)} — ${Math.round(s.ratio)}× your usual` })
  }
  fresh.sort((a, b) => b.amount - a.amount)
  const periodWord = period === 'year' ? 'this year' : 'this period'
  for (const n of fresh.slice(0, 2)) {
    flags.push({ kind: 'new', text: `New vendor ${periodWord}: ${n.vendor} $${Math.round(n.amount)}` })
  }
  return flags
}

export function computeMonitor(
  rawEntries: LedgerEntry[],
  period: Period,
  rates: Record<string, number> = { USD: 1 },
  now = new Date(),
  budgets: BudgetInput[] = [],
): MonitorData {
  // Normalize amounts to USD up front so every KPI, trend, and subscription
  // figure below is single-currency.
  const entries = normalizeToUsd(rawEntries, rates)

  const curBase = periodBase(period, now, 'cur')
  const prevBase = periodBase(period, now, 'prev')
  const curEntries = entries.filter(e => inPeriod(e.date, period, curBase))
  const prevEntries = entries.filter(e => inPeriod(e.date, period, prevBase))

  const cur = kpiTotals(curEntries)
  const prev = kpiTotals(prevEntries)

  // ── Subscription monitor ──────────────────────────────────────────────────
  const stats = computeStats(entries)
  const activeInsights = stats.subscriptionInsights.filter(s => s.active)
  const renewals = computeRenewals(stats.subscriptionInsights, now)

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
  // Heads-up: subscriptions renewing within the next 7 days.
  for (const r of renewals) {
    if (r.daysAway > 7) continue
    const when = r.daysAway <= 0 ? 'today' : r.daysAway === 1 ? 'tomorrow' : `in ${r.daysAway} days`
    const amt = r.amount != null ? ` ($${r.amount.toFixed(2)})` : ''
    flags.push({ kind: 'info', text: `${r.vendor} renews ${when}${amt}` })
  }
  // Unusual-charge alerts (spikes vs a vendor's norm + brand-new vendors).
  flags.push(...computeUnusual(entries, curEntries, curBase, period))

  // Budget alerts (current month).
  const budgetProgress = computeBudgets(entries, budgets, now)
  for (const b of budgetProgress) {
    if (b.pct >= 100) {
      flags.push({ kind: 'up', text: `Over budget: ${b.label} $${Math.round(b.spent)} / $${Math.round(b.amount)} (${b.pct}%)` })
    } else if (b.pct >= 85) {
      flags.push({ kind: 'info', text: `Nearing budget: ${b.label} ${b.pct}% of $${Math.round(b.amount)}` })
    }
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
      renewals,
    },
    topSenders,
    budgets: budgetProgress,
    flags,
    trend: computeTrend(entries),
  }
}
