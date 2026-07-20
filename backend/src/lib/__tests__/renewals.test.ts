import { describe, expect, it } from 'vitest'

import { computeRenewals } from '../renewals'
import type { SubscriptionInsight } from '../stats'

// Fixed clock, mid-day UTC so local-midnight math stays on the same calendar
// day across test timezones.
const NOW = new Date('2026-07-15T12:00:00.000Z')

const insight = (o: Partial<SubscriptionInsight> & { vendor: string }): SubscriptionInsight => ({
  monthlyEstimate: 15,
  lastAmount: 15,
  cadence: 'monthly',
  lastCharge: '2026-07-01T12:00:00.000Z',
  chargeCount: 5,
  active: true,
  ...o,
})

describe('computeRenewals', () => {
  it('rolls a monthly sub forward to its next future charge', () => {
    const [r] = computeRenewals([insight({ vendor: 'Netflix' })], NOW)
    expect(r.date).toBe('2026-08-01')
    expect(r.daysAway).toBeGreaterThan(0)
    expect(r.daysAway).toBeLessThanOrEqual(18)
  })

  it('rolls repeatedly when the last charge is far in the past', () => {
    const [r] = computeRenewals(
      [insight({ vendor: 'Spotify', cadence: 'weekly', lastCharge: '2026-06-01T12:00:00.000Z' })],
      NOW
    )
    // Weekly from Jun 1: Jun 8, 15, 22, 29, Jul 6, 13, 20 — first ≥ today is Jul 20
    expect(r.date).toBe('2026-07-20')
  })

  it('skips inactive subscriptions and invalid dates', () => {
    const out = computeRenewals(
      [
        insight({ vendor: 'Dead', active: false }),
        insight({ vendor: 'Broken', lastCharge: 'not-a-date' }),
      ],
      NOW
    )
    expect(out).toEqual([])
  })

  it('drops renewals beyond the horizon (annual charged last month)', () => {
    const out = computeRenewals(
      [insight({ vendor: 'Prime', cadence: 'annual', lastCharge: '2026-06-20T12:00:00.000Z' })],
      NOW
    )
    expect(out).toEqual([]) // next charge June 2027, way past 45 days
  })

  it('includes an annual renewal inside the horizon', () => {
    const [r] = computeRenewals(
      [insight({ vendor: 'Domain', cadence: 'annual', lastCharge: '2025-08-01T12:00:00.000Z' })],
      NOW
    )
    expect(r.date).toBe('2026-08-01')
  })

  it('sorts soonest first', () => {
    const out = computeRenewals(
      [
        insight({ vendor: 'Later', lastCharge: '2026-07-10T12:00:00.000Z' }),
        insight({ vendor: 'Sooner', cadence: 'weekly', lastCharge: '2026-07-12T12:00:00.000Z' }),
      ],
      NOW
    )
    expect(out.map(r => r.vendor)).toEqual(['Sooner', 'Later'])
  })

  it('falls back lastAmount → monthlyEstimate → null for the amount', () => {
    const [a] = computeRenewals([insight({ vendor: 'A', lastAmount: 9.99 })], NOW)
    const [b] = computeRenewals([insight({ vendor: 'B', lastAmount: null, monthlyEstimate: 12 })], NOW)
    const [c] = computeRenewals([insight({ vendor: 'C', lastAmount: null, monthlyEstimate: 0 })], NOW)
    expect(a.amount).toBe(9.99)
    expect(b.amount).toBe(12)
    expect(c.amount).toBeNull()
  })
})
