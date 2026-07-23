import { describe, it, expect } from 'vitest'
import { CATEGORIES, normalizeCategory } from '../categories'

describe('normalizeCategory', () => {
  it('passes through every known category unchanged', () => {
    for (const c of CATEGORIES) expect(normalizeCategory(c)).toBe(c)
  })

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeCategory('  Subscription ')).toBe('subscription')
    expect(normalizeCategory('TRAVEL')).toBe('travel')
  })

  it('coerces unknown / injected values to "other"', () => {
    // The category comes from attacker-influenceable email content via Claude —
    // an arbitrary or prompt-injected string must not reach an aggregation bucket.
    expect(normalizeCategory('rent')).toBe('other')
    expect(normalizeCategory('food; DROP TABLE')).toBe('other')
    expect(normalizeCategory('__proto__')).toBe('other')
    expect(normalizeCategory('overall')).toBe('other') // valid for budgets, not for entries
  })

  it('coerces nullish / non-string values to "other"', () => {
    expect(normalizeCategory(null)).toBe('other')
    expect(normalizeCategory(undefined)).toBe('other')
    expect(normalizeCategory(42)).toBe('other')
    expect(normalizeCategory({})).toBe('other')
  })
})
