// Pure math for the Monitor's what-if simulator (§9 A5): toggle subscriptions
// off and cap category spending, watch the yearly number move. Client-side
// over data the Monitor already has — no backend calls.
import type { MonitorAnalytics, SubItem } from './types'

export interface WhatIfScenario {
  canceledVendors: Set<string>
  categoryCaps: Record<string, number> // category → monthly cap in USD
}

export interface WhatIfResult {
  monthlySavings: number
  yearlySavings: number
  fromSubscriptions: number // monthly, from canceled subs
  fromCaps: number // monthly, from category caps
  currentFiveYearSubs: number // all active subs, 5 years, at today's prices
  scenarioFiveYearSubs: number // after cancellations
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Average monthly spend per category over the analytics window, using only
// months with any recorded spend in that category so a short history doesn't
// dilute the average toward zero.
export function avgMonthlyByCategory(analytics: MonitorAnalytics): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [cat, series] of Object.entries(analytics.spendByCategory)) {
    const active = series.filter(v => v > 0)
    if (active.length > 0) out[cat] = round2(active.reduce((s, v) => s + v, 0) / active.length)
  }
  return out
}

// Subscription spend is excluded from cappable categories: canceling
// subscriptions IS the lever for that money, and counting both would
// double-book the same dollars.
export function cappableCategories(avg: Record<string, number>): string[] {
  return Object.entries(avg)
    .filter(([cat, amt]) => cat !== 'subscription' && amt >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat)
}

export function computeWhatIf(
  subs: SubItem[],
  avgByCategory: Record<string, number>,
  scenario: WhatIfScenario
): WhatIfResult {
  const fromSubscriptions = round2(
    subs
      .filter(s => scenario.canceledVendors.has(s.vendor))
      .reduce((sum, s) => sum + s.monthlyEstimate, 0)
  )

  let fromCaps = 0
  for (const [cat, cap] of Object.entries(scenario.categoryCaps)) {
    const avg = avgByCategory[cat]
    if (avg == null || !Number.isFinite(cap) || cap < 0) continue
    fromCaps += Math.max(0, avg - cap)
  }
  fromCaps = round2(fromCaps)

  const monthlySavings = round2(fromSubscriptions + fromCaps)
  const totalSubsMonthly = subs.reduce((s, x) => s + x.monthlyEstimate, 0)

  return {
    monthlySavings,
    yearlySavings: round2(monthlySavings * 12),
    fromSubscriptions,
    fromCaps,
    currentFiveYearSubs: round2(totalSubsMonthly * 60),
    scenarioFiveYearSubs: round2((totalSubsMonthly - fromSubscriptions) * 60),
  }
}
