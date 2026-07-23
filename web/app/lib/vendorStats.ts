// Pure per-vendor analytics for the vendor drilldown (§9 A3): everything the
// reader view shows about one vendor, computed client-side from the
// /transactions list the app already fetches. The Audit tab is the editor for
// the ledger; this is the reader. All money is USD (amountUsd).
//
// House rules (§9): compare the user only to THEMSELVES, keep click-through
// provenance to the source email on every record, and label estimates.
import type { Transaction } from './types'

// Mirror of the backend's SPEND_CATEGORIES: what counts as real financial
// spend. marketing/shipping/charity are excluded; refunds net against spend.
const SPEND = new Set(['order', 'clothes', 'subscription', 'travel', 'food', 'entertainment', 'other'])

export type VendorTxn = Pick<
  Transaction,
  'id' | 'date' | 'category' | 'vendor' | 'amount' | 'currency' | 'amountUsd' | 'description' | 'emailId'
>

export interface VendorMonth {
  month: string // YYYY-MM
  spend: number // USD spent that month
  count: number // spend records that month
}

export interface VendorBucket {
  label: string
  min: number
  max: number | null // exclusive upper bound; null = open-ended
  count: number
}

export interface VendorCategory {
  category: string
  count: number
  spend: number // summed amountUsd for that category (unsigned)
}

export interface VendorProfile {
  vendor: string
  recordCount: number // every record from this vendor, incl. marketing/shipping
  orderCount: number // spend records only
  totalSpend: number // gross USD across spend records
  refundTotal: number // USD returned to the user
  netSpend: number // totalSpend − refundTotal
  avgOrder: number | null // over records that carry an amount
  largest: VendorTxn | null
  first: string | null // ISO date of the first spend record
  last: string | null // …and the most recent
  daysSinceLast: number | null
  avgGapDays: number | null // mean days between spend records (needs ≥2)
  longestGap: { days: number; from: string; to: string } | null
  months: VendorMonth[] // contiguous first→last spend month (most recent 24)
  buckets: VendorBucket[]
  categories: VendorCategory[] // busiest first
  refunds: VendorTxn[] // newest first
  marketingCount: number
  isSubscription: boolean
  recent: VendorTxn[] // every record, newest first — the provenance list
}

const BUCKET_EDGES: { label: string; min: number; max: number | null }[] = [
  { label: '< $10', min: 0, max: 10 },
  { label: '$10–25', min: 10, max: 25 },
  { label: '$25–50', min: 25, max: 50 },
  { label: '$50–100', min: 50, max: 100 },
  { label: '$100–250', min: 100, max: 250 },
  { label: '$250+', min: 250, max: null },
]

const MS_PER_DAY = 86_400_000

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// A record's date → local Date. A bare YYYY-MM-DD is a calendar date already;
// parsing it through `new Date()` would land on UTC midnight and shift it a day
// earlier in the Americas (the bug fixed in lib/dates.ts).
function toLocal(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(iso)
}

function monthKey(iso: string): string {
  const d = toLocal(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Whole days between two record dates, ignoring the time of day so two
// purchases on the same calendar day read as a 0-day gap, not 0.4.
function dayDiff(from: string, to: string): number {
  const a = toLocal(from); a.setHours(0, 0, 0, 0)
  const b = toLocal(to); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

/** Every distinct vendor in the ledger, busiest first — powers vendor pickers. */
export function listVendors(txns: VendorTxn[]): string[] {
  const counts = new Map<string, number>()
  for (const t of txns) counts.set(t.vendor, (counts.get(t.vendor) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v)
}

/**
 * Full analytics for one vendor. `txns` is the unfiltered ledger; the vendor
 * match is exact (the Audit tab's "rename all" is what normalizes spellings).
 * Returns a zeroed profile when the vendor has no records, so callers can
 * render without null-checking every field.
 */
export function buildVendorProfile(
  txns: VendorTxn[],
  vendor: string,
  today: Date = new Date(),
  monthCap = 24
): VendorProfile {
  const mine = txns
    .filter(t => t.vendor === vendor)
    .sort((a, b) => toLocal(b.date).getTime() - toLocal(a.date).getTime()) // newest first

  const spends = mine.filter(t => SPEND.has(t.category))
  const refunds = mine.filter(t => t.category === 'refund')
  const oldestFirst = [...spends].reverse()

  const totalSpend = round2(spends.reduce((s, t) => s + (t.amountUsd ?? 0), 0))
  const refundTotal = round2(refunds.reduce((s, t) => s + (t.amountUsd ?? 0), 0))
  const priced = spends.filter(t => t.amountUsd != null)

  // ── Cadence: first/last purchase, mean gap, and the longest dry spell ──────
  const first = oldestFirst[0]?.date ?? null
  const last = spends[0]?.date ?? null
  let longestGap: VendorProfile['longestGap'] = null
  for (let i = 1; i < oldestFirst.length; i++) {
    const days = dayDiff(oldestFirst[i - 1].date, oldestFirst[i].date)
    if (!longestGap || days > longestGap.days) {
      longestGap = { days, from: oldestFirst[i - 1].date, to: oldestFirst[i].date }
    }
  }
  const avgGapDays =
    first && last && spends.length > 1 ? round2(dayDiff(first, last) / (spends.length - 1)) : null

  // ── Monthly trend: contiguous months so a quiet stretch reads as a gap ─────
  const byMonth = new Map<string, VendorMonth>()
  for (const t of spends) {
    const key = monthKey(t.date)
    const m = byMonth.get(key) ?? { month: key, spend: 0, count: 0 }
    m.spend += t.amountUsd ?? 0
    m.count += 1
    byMonth.set(key, m)
  }
  const months: VendorMonth[] = []
  if (first && last) {
    const start = toLocal(first)
    const end = toLocal(last)
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const hit = byMonth.get(key)
      months.push({ month: key, spend: round2(hit?.spend ?? 0), count: hit?.count ?? 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  // ── Order-size distribution ───────────────────────────────────────────────
  const buckets: VendorBucket[] = BUCKET_EDGES.map(b => ({ ...b, count: 0 }))
  for (const t of priced) {
    const v = t.amountUsd as number
    const hit = buckets.find(b => v >= b.min && (b.max === null || v < b.max))
    if (hit) hit.count += 1
  }

  // ── Category mix across everything they've ever sent ───────────────────────
  const catMap = new Map<string, VendorCategory>()
  for (const t of mine) {
    const c = catMap.get(t.category) ?? { category: t.category, count: 0, spend: 0 }
    c.count += 1
    c.spend += t.amountUsd ?? 0
    catMap.set(t.category, c)
  }
  const categories = [...catMap.values()]
    .map(c => ({ ...c, spend: round2(c.spend) }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))

  const largest = priced.reduce<VendorTxn | null>(
    (best, t) => (best === null || (t.amountUsd as number) > (best.amountUsd as number) ? t : best),
    null
  )

  return {
    vendor,
    recordCount: mine.length,
    orderCount: spends.length,
    totalSpend,
    refundTotal,
    netSpend: round2(totalSpend - refundTotal),
    avgOrder: priced.length > 0 ? round2(totalSpend / priced.length) : null,
    largest,
    first,
    last,
    daysSinceLast: last ? dayDiff(last, today.toISOString()) : null,
    avgGapDays,
    longestGap,
    months: months.slice(-monthCap),
    buckets,
    categories,
    refunds,
    marketingCount: mine.filter(t => t.category === 'marketing').length,
    isSubscription: mine.some(t => t.category === 'subscription'),
    recent: mine,
  }
}
