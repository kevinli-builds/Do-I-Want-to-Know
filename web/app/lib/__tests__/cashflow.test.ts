import { describe, expect, it } from 'vitest'

import { buildCashflowMonth, nextSevenDays, type CalendarTxn } from '../cashflow'
import { daysUntil, fmtDate } from '../dates'
import type { Renewal } from '../types'

// Fixed clock: Wednesday 2026-07-15, viewing July 2026 (starts on a Wednesday,
// 31 days -> 5 weeks with 3 leading + 1 trailing blank).
// Transaction fixtures use T10:00Z so the local calendar date is the same
// across every plausible test timezone; renewal fixtures are bare YYYY-MM-DD
// exactly as the backend emits them.
const TODAY = new Date(2026, 6, 15, 12, 0, 0)

const txn = (o: Partial<CalendarTxn> & { date: string }): CalendarTxn => ({
  id: Math.random().toString(36).slice(2),
  category: 'order',
  vendor: 'Amazon',
  amountUsd: 10,
  description: '',
  ...o,
})

const renewal = (o: Partial<Renewal> & { date: string; daysAway: number }): Renewal => ({
  vendor: 'Netflix',
  amount: 17.99,
  cadence: 'monthly',
  ...o,
})

describe('buildCashflowMonth', () => {
  it('lays out July 2026 as Sunday-first full weeks', () => {
    const m = buildCashflowMonth([], [], 2026, 6, TODAY)
    expect(m.label).toBe('July 2026')
    expect(m.weeks).toHaveLength(5)
    for (const w of m.weeks) expect(w).toHaveLength(7)
    // July 1 2026 is a Wednesday -> 3 leading out-of-month cells
    expect(m.weeks[0].slice(0, 3).every(d => !d.inMonth)).toBe(true)
    expect(m.weeks[0][3]).toMatchObject({ inMonth: true, day: 1 })
    // 31 + 3 leading = 34 -> one trailing blank
    expect(m.weeks[4][6].inMonth).toBe(false)
  })

  it('sums a day net of refunds and ignores non-spend categories', () => {
    const m = buildCashflowMonth(
      [
        txn({ date: '2026-07-10T10:00:00.000Z', amountUsd: 40 }),
        txn({ date: '2026-07-10T10:00:00.000Z', amountUsd: 15, category: 'food' }),
        txn({ date: '2026-07-10T10:00:00.000Z', amountUsd: 12, category: 'refund' }),
        txn({ date: '2026-07-10T10:00:00.000Z', amountUsd: 99, category: 'marketing' }), // not spend
        txn({ date: '2026-07-10T10:00:00.000Z', amountUsd: null }), // no amount
      ],
      [], 2026, 6, TODAY
    )
    const day10 = m.weeks.flat().find(d => d.inMonth && d.day === 10)!
    expect(day10.spend).toBe(43) // 40 + 15 - 12
    expect(day10.txns).toHaveLength(3) // marketing + null-amount excluded
    expect(m.monthSpend).toBe(43)
  })

  it('marks net-refund days and keeps them out of the heat scale', () => {
    const m = buildCashflowMonth(
      [
        txn({ date: '2026-07-08T10:00:00.000Z', amountUsd: 30, category: 'refund' }),
        txn({ date: '2026-07-09T10:00:00.000Z', amountUsd: 100 }),
      ],
      [], 2026, 6, TODAY
    )
    const day8 = m.weeks.flat().find(d => d.inMonth && d.day === 8)!
    expect(day8.refundDay).toBe(true)
    expect(day8.intensity).toBe(0)
    expect(m.maxDaySpend).toBe(100)
  })

  it('scales intensity 1..4 relative to the biggest day', () => {
    const m = buildCashflowMonth(
      [
        txn({ date: '2026-07-01T10:00:00.000Z', amountUsd: 10 }),
        txn({ date: '2026-07-02T10:00:00.000Z', amountUsd: 50 }),
        txn({ date: '2026-07-03T10:00:00.000Z', amountUsd: 100 }),
      ],
      [], 2026, 6, TODAY
    )
    const byDay = (n: number) => m.weeks.flat().find(d => d.inMonth && d.day === n)!
    expect(byDay(1).intensity).toBe(1) // 10% of max -> bucket 1
    expect(byDay(2).intensity).toBe(2) // 50% -> bucket 2
    expect(byDay(3).intensity).toBe(4) // max -> bucket 4
  })

  it('places renewals on future days only and totals them for the month', () => {
    const m = buildCashflowMonth(
      [],
      [
        renewal({ date: '2026-07-20', daysAway: 5 }),
        renewal({ date: '2026-07-28', daysAway: 13, vendor: 'Spotify', amount: 11.99 }),
        renewal({ date: '2026-08-02', daysAway: 18 }), // next month - not in this grid
      ],
      2026, 6, TODAY
    )
    const day20 = m.weeks.flat().find(d => d.inMonth && d.day === 20)!
    expect(day20.renewals).toHaveLength(1)
    expect(day20.isFuture).toBe(true)
    expect(m.monthRenewalTotal).toBe(29.98) // 17.99 + 11.99; August one excluded
  })

  it('keeps a bare renewal date on its own calendar day in any timezone', () => {
    // The backend emits 'YYYY-MM-DD'; parsing that through new Date() lands on
    // the previous local day west of UTC. The grid must not inherit that.
    const m = buildCashflowMonth([], [renewal({ date: '2026-07-20', daysAway: 5 })], 2026, 6, TODAY)
    const day19 = m.weeks.flat().find(d => d.inMonth && d.day === 19)!
    const day20 = m.weeks.flat().find(d => d.inMonth && d.day === 20)!
    expect(day19.renewals).toHaveLength(0)
    expect(day20.renewals).toHaveLength(1)
  })

  it('does not attach renewals to past days', () => {
    const m = buildCashflowMonth(
      [],
      [renewal({ date: '2026-07-10', daysAway: -5 })],
      2026, 6, TODAY
    )
    const day10 = m.weeks.flat().find(d => d.inMonth && d.day === 10)!
    expect(day10.renewals).toHaveLength(0)
  })

  it('flags today and treats it as a renewal-capable day', () => {
    const m = buildCashflowMonth(
      [txn({ date: '2026-07-15T10:00:00.000Z', amountUsd: 20 })],
      [renewal({ date: '2026-07-15', daysAway: 0 })],
      2026, 6, TODAY
    )
    const today = m.weeks.flat().find(d => d.isToday)!
    expect(today.day).toBe(15)
    expect(today.spend).toBe(20)
    expect(today.renewals).toHaveLength(1)
  })
})

describe('nextSevenDays', () => {
  it('totals only renewals within a week', () => {
    const { total, count } = nextSevenDays([
      renewal({ date: '2026-07-16', daysAway: 1 }),
      renewal({ date: '2026-07-22', daysAway: 7, vendor: 'Spotify', amount: 11.99 }),
      renewal({ date: '2026-07-30', daysAway: 15, vendor: 'iCloud', amount: 2.99 }),
    ])
    expect(count).toBe(2)
    expect(total).toBe(29.98)
  })

  it('handles the empty case', () => {
    expect(nextSevenDays([])).toEqual({ total: 0, count: 0 })
  })
})

describe('dates.ts bare-date parsing (regression)', () => {
  it('treats YYYY-MM-DD as a local calendar date, not UTC midnight', () => {
    // Before the fix, west-of-UTC zones rendered Jul 20 as Jul 19.
    expect(fmtDate('2026-07-20')).toBe('Jul 20, 2026')
  })

  it('daysUntil counts from local today for bare dates', () => {
    const t = new Date()
    const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)
    const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    expect(daysUntil(iso)).toBe(1)
  })
})
