import { describe, expect, it } from 'vitest'

import { avgMonthlyByCategory, cappableCategories, computeWhatIf } from '../whatif'
import type { MonitorAnalytics, SubItem } from '../types'

const SUBS: SubItem[] = [
  { vendor: 'Netflix', monthlyEstimate: 17.99, cadence: 'monthly' },
  { vendor: 'Spotify', monthlyEstimate: 11.99, cadence: 'monthly' },
  { vendor: 'Prime', monthlyEstimate: 11.58, cadence: 'annual' }, // 139/yr amortized
]

const ANALYTICS: MonitorAnalytics = {
  months: ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
  categories: ['food', 'order', 'subscription', 'travel'],
  countByCategory: {},
  spendByCategory: {
    food: [100, 140, 0, 120, 130, 110], // one zero month — excluded from the avg
    order: [50, 50, 50, 50, 50, 50],
    subscription: [41, 41, 41, 41, 41, 41],
    travel: [0, 0, 0, 0, 0, 0], // never any spend — not cappable
  },
}

const scenario = (o: Partial<{ canceled: string[]; caps: Record<string, number> }> = {}) => ({
  canceledVendors: new Set(o.canceled ?? []),
  categoryCaps: o.caps ?? {},
})

describe('avgMonthlyByCategory', () => {
  it('averages only months with recorded spend', () => {
    const avg = avgMonthlyByCategory(ANALYTICS)
    expect(avg.food).toBe(120) // (100+140+120+130+110)/5, zero month dropped
    expect(avg.order).toBe(50)
    expect(avg.travel).toBeUndefined()
  })
})

describe('cappableCategories', () => {
  it('excludes subscription and empty categories, sorts by spend', () => {
    const cats = cappableCategories(avgMonthlyByCategory(ANALYTICS))
    expect(cats).toEqual(['food', 'order'])
  })
})

describe('computeWhatIf', () => {
  it('sums canceled subscriptions monthly and yearly', () => {
    const r = computeWhatIf(SUBS, {}, scenario({ canceled: ['Netflix', 'Prime'] }))
    expect(r.fromSubscriptions).toBe(29.57)
    expect(r.monthlySavings).toBe(29.57)
    expect(r.yearlySavings).toBe(354.84)
  })

  it('cap savings = max(0, avg − cap); over-generous caps save nothing', () => {
    const avg = avgMonthlyByCategory(ANALYTICS)
    const r = computeWhatIf([], avg, scenario({ caps: { food: 80, order: 999 } }))
    expect(r.fromCaps).toBe(40) // 120 − 80; order cap above avg → 0
    expect(r.yearlySavings).toBe(480)
  })

  it('ignores caps for unknown categories and negative caps', () => {
    const avg = avgMonthlyByCategory(ANALYTICS)
    const r = computeWhatIf([], avg, scenario({ caps: { travel: 10, food: -5 } }))
    expect(r.fromCaps).toBe(0)
  })

  it('combines both levers', () => {
    const avg = avgMonthlyByCategory(ANALYTICS)
    const r = computeWhatIf(SUBS, avg, scenario({ canceled: ['Spotify'], caps: { food: 100 } }))
    expect(r.fromSubscriptions).toBe(11.99)
    expect(r.fromCaps).toBe(20)
    expect(r.monthlySavings).toBe(31.99)
  })

  it('computes the five-year subscription number (D5) and its scenario drop', () => {
    const r = computeWhatIf(SUBS, {}, scenario({ canceled: ['Netflix'] }))
    expect(r.currentFiveYearSubs).toBe(2493.6) // 41.56 × 60
    expect(r.scenarioFiveYearSubs).toBe(1414.2) // (41.56 − 17.99) × 60
  })

  it('empty scenario saves nothing', () => {
    const r = computeWhatIf(SUBS, avgMonthlyByCategory(ANALYTICS), scenario())
    expect(r.monthlySavings).toBe(0)
    expect(r.yearlySavings).toBe(0)
    expect(r.scenarioFiveYearSubs).toBe(r.currentFiveYearSubs)
  })
})
