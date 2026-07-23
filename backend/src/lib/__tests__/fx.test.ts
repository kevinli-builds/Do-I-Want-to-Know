import { describe, expect, it } from 'vitest'

import { normalizeToUsd, toUsd } from '../fx'

const RATES = { USD: 1, EUR: 1.08, JPY: 0.0066, GBP: 1.27 }

describe('toUsd', () => {
  it('passes null/undefined amounts through as null', () => {
    expect(toUsd(null, 'EUR', RATES)).toBeNull()
    expect(toUsd(undefined, 'EUR', RATES)).toBeNull()
  })

  it('returns USD amounts unchanged', () => {
    expect(toUsd(100, 'USD', RATES)).toBe(100)
    expect(toUsd(100, null, RATES)).toBe(100) // missing currency defaults to USD
  })

  it('converts by the rate (the ¥10,000 case)', () => {
    expect(toUsd(10_000, 'JPY', RATES)).toBeCloseTo(66, 5)
    expect(toUsd(50, 'EUR', RATES)).toBeCloseTo(54, 5)
  })

  it('is case- and whitespace-tolerant on the currency code', () => {
    expect(toUsd(50, ' eur ', RATES)).toBeCloseTo(54, 5)
  })

  it('leaves unknown currencies as-is (best effort, never crashes)', () => {
    expect(toUsd(75, 'XYZ', RATES)).toBe(75)
  })
})

describe('normalizeToUsd', () => {
  const entries = [
    { amount: 10_000, currency: 'JPY', vendor: 'Uniqlo' },
    { amount: null, currency: 'EUR', vendor: 'Zara' },
    { amount: 20, currency: 'USD', vendor: 'Amazon' },
  ]

  it('converts every row and stamps currency USD, preserving other fields', () => {
    const out = normalizeToUsd(entries, RATES)
    expect(out[0]).toMatchObject({ amount: 66, currency: 'USD', vendor: 'Uniqlo' })
    expect(out[1]).toMatchObject({ amount: null, currency: 'USD', vendor: 'Zara' })
    expect(out[2]).toMatchObject({ amount: 20, currency: 'USD' })
  })

  it('does not mutate the input rows', () => {
    normalizeToUsd(entries, RATES)
    expect(entries[0].currency).toBe('JPY')
    expect(entries[0].amount).toBe(10_000)
  })
})
