import { describe, expect, it } from 'vitest'

import { buildVendorProfile, listVendors, type VendorTxn } from '../vendorStats'

// Fixtures use T12:00Z so the local calendar date is the same across every
// plausible test timezone. The one exception is the bare-YYYY-MM-DD case,
// which is exercised deliberately in its own test.
const txn = (o: Partial<VendorTxn> & { date: string }): VendorTxn => ({
  id: o.date + (o.description ?? '') + (o.category ?? ''),
  category: 'order',
  vendor: 'Amazon',
  amount: o.amountUsd ?? 10,
  currency: 'USD',
  amountUsd: 10,
  description: '',
  emailId: 'e1',
  ...o,
})

const TODAY = new Date(2026, 6, 15, 12, 0, 0) // 2026-07-15

describe('buildVendorProfile', () => {
  it('returns a zeroed profile for a vendor with no records', () => {
    const p = buildVendorProfile([txn({ date: '2026-01-10T12:00:00Z' })], 'Nobody', TODAY)
    expect(p).toMatchObject({
      vendor: 'Nobody',
      recordCount: 0,
      orderCount: 0,
      totalSpend: 0,
      refundTotal: 0,
      netSpend: 0,
      avgOrder: null,
      largest: null,
      first: null,
      last: null,
      daysSinceLast: null,
      avgGapDays: null,
      longestGap: null,
      isSubscription: false,
    })
    expect(p.months).toEqual([])
    expect(p.categories).toEqual([])
  })

  it('nets refunds against spend and excludes non-spend categories from orders', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-03-01T12:00:00Z', amountUsd: 100 }),
        txn({ date: '2026-03-05T12:00:00Z', amountUsd: 50 }),
        txn({ date: '2026-03-08T12:00:00Z', category: 'refund', amountUsd: 30 }),
        txn({ date: '2026-03-09T12:00:00Z', category: 'marketing', amountUsd: null }),
        txn({ date: '2026-03-10T12:00:00Z', category: 'shipping', amountUsd: null }),
      ],
      'Amazon',
      TODAY
    )
    expect(p.recordCount).toBe(5)
    expect(p.orderCount).toBe(2) // refund/marketing/shipping are not orders
    expect(p.totalSpend).toBe(150)
    expect(p.refundTotal).toBe(30)
    expect(p.netSpend).toBe(120)
    expect(p.avgOrder).toBe(75)
    expect(p.marketingCount).toBe(1)
    expect(p.refunds).toHaveLength(1)
  })

  it('describes a promo-only sender as having no purchases', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-03-01T12:00:00Z', vendor: 'Groupon', category: 'marketing', amountUsd: null }),
        txn({ date: '2026-03-02T12:00:00Z', vendor: 'Groupon', category: 'marketing', amountUsd: null }),
      ],
      'Groupon',
      TODAY
    )
    expect(p.recordCount).toBe(2)
    expect(p.orderCount).toBe(0)
    expect(p.marketingCount).toBe(2)
    expect(p.totalSpend).toBe(0)
    expect(p.months).toEqual([]) // no spend months → the trend chart stays hidden
    expect(p.first).toBeNull()
    expect(p.largest).toBeNull()
  })

  it('measures cadence: first, last, mean gap, and the longest dry spell', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-02-10T12:00:00Z' }),
        txn({ date: '2026-06-10T12:00:00Z' }),
        txn({ date: '2026-01-10T12:00:00Z' }),
      ],
      'Amazon',
      TODAY
    )
    expect(p.first?.startsWith('2026-01-10')).toBe(true)
    expect(p.last?.startsWith('2026-06-10')).toBe(true)
    expect(p.avgGapDays).toBe(75.5) // 151 days spanned across 2 gaps
    expect(p.longestGap?.days).toBe(120) // Feb 10 → Jun 10
    expect(p.longestGap?.from.startsWith('2026-02-10')).toBe(true)
    expect(p.daysSinceLast).toBe(35) // Jun 10 → Jul 15
  })

  it('leaves gap stats null for a single purchase', () => {
    const p = buildVendorProfile([txn({ date: '2026-06-10T12:00:00Z' })], 'Amazon', TODAY)
    expect(p.avgGapDays).toBeNull()
    expect(p.longestGap).toBeNull()
    expect(p.first).toBe(p.last)
  })

  it('builds a contiguous month series, zero-filling quiet months', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-01-10T12:00:00Z', amountUsd: 20 }),
        txn({ date: '2026-01-20T12:00:00Z', amountUsd: 5 }),
        txn({ date: '2026-06-10T12:00:00Z', amountUsd: 40 }),
      ],
      'Amazon',
      TODAY
    )
    expect(p.months.map(m => m.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    ])
    expect(p.months[0]).toMatchObject({ spend: 25, count: 2 })
    expect(p.months[2]).toMatchObject({ spend: 0, count: 0 })
    expect(p.months[5]).toMatchObject({ spend: 40, count: 1 })
  })

  it('caps the month series to the most recent monthCap months', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-01-10T12:00:00Z' }),
        txn({ date: '2026-06-10T12:00:00Z' }),
      ],
      'Amazon',
      TODAY,
      3
    )
    expect(p.months.map(m => m.month)).toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('bins order sizes and ignores records with no amount', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-03-01T12:00:00Z', amountUsd: 9.99 }),
        txn({ date: '2026-03-02T12:00:00Z', amountUsd: 10 }), // lower bound is inclusive
        txn({ date: '2026-03-03T12:00:00Z', amountUsd: 249.99 }),
        txn({ date: '2026-03-04T12:00:00Z', amountUsd: 250 }), // open-ended top bucket
        txn({ date: '2026-03-05T12:00:00Z', amountUsd: null }),
      ],
      'Amazon',
      TODAY
    )
    const counts = Object.fromEntries(p.buckets.map(b => [b.label, b.count]))
    expect(counts).toEqual({
      '< $10': 1, '$10–25': 1, '$25–50': 0, '$50–100': 0, '$100–250': 1, '$250+': 1,
    })
    expect(p.orderCount).toBe(5) // the unpriced record is still an order…
    expect(p.avgOrder).toBe(round(519.98 / 4)) // …but is left out of the average
  })

  it('ranks the category mix by record count and flags subscriptions', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-03-01T12:00:00Z', category: 'marketing', amountUsd: null }),
        txn({ date: '2026-03-02T12:00:00Z', category: 'marketing', amountUsd: null }),
        txn({ date: '2026-03-03T12:00:00Z', category: 'marketing', amountUsd: null }),
        txn({ date: '2026-03-04T12:00:00Z', category: 'subscription', amountUsd: 17.99 }),
      ],
      'Amazon',
      TODAY
    )
    expect(p.categories.map(c => c.category)).toEqual(['marketing', 'subscription'])
    expect(p.categories[0].count).toBe(3)
    expect(p.categories[1].spend).toBe(17.99)
    expect(p.isSubscription).toBe(true)
  })

  it('picks the largest priced purchase and lists records newest first', () => {
    const p = buildVendorProfile(
      [
        txn({ date: '2026-03-01T12:00:00Z', amountUsd: 100, description: 'mid' }),
        txn({ date: '2026-03-02T12:00:00Z', amountUsd: null, description: 'unpriced' }),
        txn({ date: '2026-03-03T12:00:00Z', amountUsd: 900, description: 'big' }),
      ],
      'Amazon',
      TODAY
    )
    expect(p.largest?.description).toBe('big')
    expect(p.recent.map(t => t.description)).toEqual(['big', 'unpriced', 'mid'])
  })

  it('treats a bare YYYY-MM-DD as a local calendar date (no day-early shift)', () => {
    // Regression guard for the lib/dates.ts bug: `new Date('2026-06-10')` is UTC
    // midnight, which is June 9 locally anywhere west of Greenwich.
    const p = buildVendorProfile([txn({ date: '2026-06-10' })], 'Amazon', TODAY)
    expect(p.months.map(m => m.month)).toEqual(['2026-06'])
    expect(p.daysSinceLast).toBe(35)
  })
})

describe('listVendors', () => {
  it('orders vendors by record count, then alphabetically', () => {
    const vendors = listVendors([
      txn({ date: '2026-03-01T12:00:00Z', vendor: 'Netflix' }),
      txn({ date: '2026-03-02T12:00:00Z', vendor: 'Amazon' }),
      txn({ date: '2026-03-03T12:00:00Z', vendor: 'Amazon' }),
      txn({ date: '2026-03-04T12:00:00Z', vendor: 'Bandcamp' }),
    ])
    expect(vendors).toEqual(['Amazon', 'Bandcamp', 'Netflix'])
  })
})

function round(n: number): number {
  return Math.round(n * 100) / 100
}
