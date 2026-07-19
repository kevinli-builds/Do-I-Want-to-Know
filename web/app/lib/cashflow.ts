// Pure calendar math for the Monitor's cashflow calendar (§9 A2): a month
// grid where past days carry the day's net spend (heatmap) and future days
// carry predicted subscription renewals. All money is USD (amountUsd).
import type { Renewal, Transaction } from './types'

// Mirror of the backend's SPEND_CATEGORIES: what counts as real financial
// spend. marketing/shipping/charity are excluded; refunds net against spend.
const SPEND = new Set(['order', 'clothes', 'subscription', 'travel', 'food', 'entertainment', 'other'])

export type CalendarTxn = Pick<Transaction, 'id' | 'date' | 'category' | 'vendor' | 'amountUsd' | 'description'>

export interface CalendarDay {
  iso: string // YYYY-MM-DD (local)
  day: number
  inMonth: boolean
  isToday: boolean
  isFuture: boolean
  spend: number // net USD spend that day (refunds subtract; 0 for future days)
  txns: CalendarTxn[] // spend/refund transactions that day (newest first as given)
  renewals: Renewal[] // predicted renewals landing that day (future days only)
  intensity: number // 0..4 heat bucket relative to the month's max day
  refundDay: boolean // net negative day (refunds exceeded spend)
}

export interface CashflowMonth {
  year: number
  month: number // 0-based
  label: string // e.g. "July 2026"
  weeks: CalendarDay[][] // rows of 7, Sunday-first; out-of-month cells inMonth=false
  maxDaySpend: number
  monthSpend: number // net spend across the month's past days
  monthRenewalTotal: number // predicted renewal $ landing in this month's future days
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A transaction/renewal date → local YYYY-MM-DD key. Bare dates (predicted
// renewals are 'YYYY-MM-DD') are calendar dates already — use them verbatim;
// converting through Date would shift them a day in western timezones.
function dayKey(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return localIso(new Date(iso))
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildCashflowMonth(
  txns: CalendarTxn[],
  renewals: Renewal[],
  year: number,
  month: number,
  today: Date = new Date()
): CashflowMonth {
  const todayIso = localIso(today)

  const txnsByDay = new Map<string, CalendarTxn[]>()
  for (const t of txns) {
    if (t.amountUsd == null) continue
    if (!SPEND.has(t.category) && t.category !== 'refund') continue
    const k = dayKey(t.date)
    const arr = txnsByDay.get(k) ?? []
    arr.push(t)
    txnsByDay.set(k, arr)
  }

  const renewalsByDay = new Map<string, Renewal[]>()
  for (const r of renewals) {
    const k = dayKey(r.date)
    const arr = renewalsByDay.get(k) ?? []
    arr.push(r)
    renewalsByDay.set(k, arr)
  }

  const daySpend = (list: CalendarTxn[]) =>
    round2(list.reduce((s, t) => s + (t.category === 'refund' ? -(t.amountUsd ?? 0) : (t.amountUsd ?? 0)), 0))

  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const days: CalendarDay[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const iso = localIso(date)
    const isFuture = iso > todayIso
    const dayTxns = isFuture ? [] : (txnsByDay.get(iso) ?? [])
    const spend = daySpend(dayTxns)
    days.push({
      iso,
      day: d,
      inMonth: true,
      isToday: iso === todayIso,
      isFuture,
      spend,
      txns: dayTxns,
      renewals: isFuture || iso === todayIso ? (renewalsByDay.get(iso) ?? []) : [],
      intensity: 0, // filled below once maxDaySpend is known
      refundDay: spend < 0,
    })
  }

  const maxDaySpend = Math.max(0, ...days.map(d => d.spend))
  for (const d of days) {
    d.intensity = d.spend > 0 && maxDaySpend > 0 ? Math.max(1, Math.ceil((d.spend / maxDaySpend) * 4)) : 0
  }

  // Pad to Sunday-first full weeks with out-of-month blanks.
  const blank = (iso: string, day: number): CalendarDay => ({
    iso, day, inMonth: false, isToday: false, isFuture: false,
    spend: 0, txns: [], renewals: [], intensity: 0, refundDay: false,
  })
  const lead = first.getDay()
  const padded: CalendarDay[] = []
  for (let i = lead - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    padded.push(blank(localIso(d), d.getDate()))
  }
  padded.push(...days)
  while (padded.length % 7 !== 0) {
    const d = new Date(year, month, daysInMonth + (padded.length - lead - daysInMonth) + 1)
    padded.push(blank(localIso(d), d.getDate()))
  }
  const weeks: CalendarDay[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))

  return {
    year,
    month,
    label,
    weeks,
    maxDaySpend,
    monthSpend: round2(days.reduce((s, d) => s + d.spend, 0)),
    monthRenewalTotal: round2(
      days.flatMap(d => (d.isFuture || d.isToday ? d.renewals : [])).reduce((s, r) => s + (r.amount ?? 0), 0)
    ),
  }
}

// "What hits next week": predicted renewal cost landing in the next 7 days.
export function nextSevenDays(renewals: Renewal[]): { total: number; count: number } {
  const soon = renewals.filter(r => r.daysAway >= 0 && r.daysAway <= 7)
  return { total: round2(soon.reduce((s, r) => s + (r.amount ?? 0), 0)), count: soon.length }
}
