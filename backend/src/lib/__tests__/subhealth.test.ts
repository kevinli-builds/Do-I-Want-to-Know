import { describe, it, expect } from 'vitest'
import type { LedgerEntry } from '@prisma/client'
import { buildPlateaus, detectPriceSteps, computeSubHealth, ZOMBIE_QUIET_DAYS } from '../subhealth'
import type { SubscriptionInsight } from '../stats'

// Fixture helpers — monthly charges, oldest first.
const NOW = new Date('2026-07-01T00:00:00Z')
const monthsAgo = (n: number) => new Date(Date.UTC(2026, 6 - n, 15)) // the 15th, n months back

const charge = (n: number, amount: number) => ({ date: monthsAgo(n), amount })

const entry = (partial: Partial<LedgerEntry> & { vendor: string; category: string; date: Date }): LedgerEntry =>
  ({ amount: null, currency: 'USD', ...partial }) as LedgerEntry

const insight = (partial: Partial<SubscriptionInsight> & { vendor: string }): SubscriptionInsight => ({
  monthlyEstimate: 10,
  lastAmount: 10,
  cadence: 'monthly',
  lastCharge: monthsAgo(0).toISOString().slice(0, 10),
  chargeCount: 6,
  active: true,
  ...partial,
})

describe('buildPlateaus / detectPriceSteps', () => {
  it('detects the classic Netflix step', () => {
    // 6 months at 15.49, then 3 at 17.99
    const charges = [
      ...[8, 7, 6, 5, 4, 3].map(n => charge(n, 15.49)),
      ...[2, 1, 0].map(n => charge(n, 17.99)),
    ]
    const steps = detectPriceSteps('Netflix', charges)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ vendor: 'Netflix', from: 15.49, to: 17.99, pct: 16.1, confirmed: true })
    expect(steps[0].atDate).toBe(monthsAgo(2).toISOString().slice(0, 10))
  })

  it('ignores FX/tax jitter inside the tolerance band', () => {
    // A foreign-billed sub wobbling ~1%: one plateau, no steps.
    const charges = [charge(5, 42.1), charge(4, 41.8), charge(3, 42.3), charge(2, 41.9), charge(1, 42.0)]
    expect(buildPlateaus(charges)).toHaveLength(1)
    expect(detectPriceSteps('Spotify TR', charges)).toHaveLength(0)
  })

  it('absorbs a one-month promo as noise, not two steps', () => {
    // 9.99, 9.99, 0.99 (promo), 9.99, 9.99 → one plateau, no steps.
    const charges = [charge(5, 9.99), charge(4, 9.99), charge(3, 0.99), charge(2, 9.99), charge(1, 9.99)]
    const steps = detectPriceSteps('Hulu', charges)
    expect(steps).toHaveLength(0)
  })

  it('marks a step seen once (latest bill) as unconfirmed', () => {
    const charges = [charge(4, 12), charge(3, 12), charge(2, 12), charge(1, 12), charge(0, 14.5)]
    const steps = detectPriceSteps('iCloud', charges)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ from: 12, to: 14.5, confirmed: false, chargesAfter: 1 })
  })

  it('reports price drops with a negative pct', () => {
    const charges = [charge(5, 20), charge(4, 20), charge(3, 15), charge(2, 15), charge(1, 15)]
    const steps = detectPriceSteps('Gym', charges)
    expect(steps).toHaveLength(1)
    expect(steps[0].pct).toBe(-25)
  })

  it('handles two successive real steps', () => {
    const charges = [charge(9, 10), charge(8, 10), charge(6, 12), charge(5, 12), charge(2, 14), charge(1, 14)]
    const steps = detectPriceSteps('SaaS', charges)
    expect(steps.map(s => [s.from, s.to])).toEqual([
      [10, 12],
      [12, 14],
    ])
    expect(steps.every(s => s.confirmed)).toBe(true)
  })
})

describe('computeSubHealth', () => {
  it('computes the price-driven monthly delta vs a year ago', () => {
    // Netflix: 15.49 for months 14..3, 17.99 since. A year ago the price was 15.49.
    const entries = [
      ...[14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map(n =>
        entry({ vendor: 'Netflix', category: 'subscription', date: monthsAgo(n), amount: 15.49 }),
      ),
      ...[2, 1, 0].map(n => entry({ vendor: 'Netflix', category: 'subscription', date: monthsAgo(n), amount: 17.99 })),
    ]
    const h = computeSubHealth(entries, [insight({ vendor: 'Netflix', cadence: 'monthly' })], NOW)
    expect(h.monthlyDeltaVsYearAgo).toBeCloseTo(2.5, 1)
    expect(h.steps).toHaveLength(1)
  })

  it('returns null delta when no sub has a year of history', () => {
    const entries = [3, 2, 1, 0].map(n =>
      entry({ vendor: 'New', category: 'subscription', date: monthsAgo(n), amount: 9.99 }),
    )
    const h = computeSubHealth(entries, [insight({ vendor: 'New' })], NOW)
    expect(h.monthlyDeltaVsYearAgo).toBeNull()
  })

  it('flags a zombie: active sub with nothing but bills for 90+ days', () => {
    const entries = [
      ...[6, 5, 4, 3, 2, 1].map(n =>
        entry({ vendor: 'ZombieBox', category: 'subscription', date: monthsAgo(n), amount: 12 }),
      ),
      // Last non-bill mail from them was 5 months ago.
      entry({ vendor: 'ZombieBox', category: 'marketing', date: monthsAgo(5) }),
    ]
    const h = computeSubHealth(entries, [insight({ vendor: 'ZombieBox', monthlyEstimate: 12 })], NOW)
    expect(h.zombies).toHaveLength(1)
    expect(h.zombies[0].vendor).toBe('ZombieBox')
    expect(h.zombies[0].daysQuiet).toBeGreaterThanOrEqual(ZOMBIE_QUIET_DAYS)
    expect(h.zombies[0].lastOtherActivity).toBe(monthsAgo(5).toISOString().slice(0, 10))
  })

  it('does not flag a sub whose vendor mails you (orders, marketing)', () => {
    const entries = [
      ...[4, 3, 2, 1].map(n => entry({ vendor: 'Amazon', category: 'subscription', date: monthsAgo(n), amount: 14.99 })),
      entry({ vendor: 'Amazon', category: 'order', date: monthsAgo(1), amount: 30 }),
    ]
    const h = computeSubHealth(entries, [insight({ vendor: 'Amazon', monthlyEstimate: 14.99 })], NOW)
    expect(h.zombies).toHaveLength(0)
  })

  it('skips inactive or single-charge subs for zombie purposes', () => {
    const entries = [entry({ vendor: 'OneOff', category: 'subscription', date: monthsAgo(6), amount: 5 })]
    const h = computeSubHealth(
      entries,
      [
        insight({ vendor: 'OneOff', chargeCount: 1 }),
        insight({ vendor: 'Cancelled', active: false }),
      ],
      NOW,
    )
    expect(h.zombies).toHaveLength(0)
  })
})
