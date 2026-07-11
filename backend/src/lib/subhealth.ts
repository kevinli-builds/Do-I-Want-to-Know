// Subscription health: price-step detection (A1) + zombie subscriptions (A4).
// Pure functions over USD-normalized LedgerEntry[]; no I/O, no Claude.
//
// Price steps: a vendor's subscription charges form "plateaus" — runs of
// charges at the same price, allowing for FX/tax jitter. A real price change
// is a step from one plateau to the next that HOLDS (ideally confirmed by
// several charges), unlike a one-month promo or a partial charge, which reads
// as a single-charge outlier sandwiched between matching plateaus and is
// absorbed as noise. House rules apply: compare the user only to themselves,
// and label uncertainty (`confirmed`) instead of over-claiming.

import type { LedgerEntry } from '@prisma/client'
import type { SubscriptionInsight } from './stats'

// Tolerance band for "same price": FX conversion and tax wobble can move a
// charge a percent or two between bills; a real change is a step that holds.
export const JITTER_PCT = 0.02
export const JITTER_FLOOR = 0.75 // dollars — sub-dollar wobble is never a step
// A sub is a zombie candidate after this long with no email from the vendor
// other than its own bills.
export const ZOMBIE_QUIET_DAYS = 90

const tol = (m: number) => Math.max(Math.abs(m) * JITTER_PCT, JITTER_FLOOR)
const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10
const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
const DAY = 86_400_000

export interface Charge {
  date: Date
  amount: number // USD, > 0
}

export interface PriceStep {
  vendor: string
  from: number // stable price before the step (plateau median, USD)
  to: number // stable price after
  pct: number // signed % change, 1dp (negative = price drop)
  atDate: string // ISO date of the first charge at the new price
  chargesBefore: number // charges that established the old price
  chargesAfter: number // charges seen at the new price so far
  confirmed: boolean // both plateaus have ≥2 charges — not a fluke
}

export interface ZombieSub {
  vendor: string
  monthlyEstimate: number
  lastCharge: string // ISO
  lastOtherActivity: string | null // ISO date of the vendor's last non-bill email
  daysQuiet: number // days with nothing from the vendor but bills
}

export interface SubHealth {
  steps: PriceStep[] // all detected steps, newest first
  // Price-driven change in monthly burn: for each active sub billed both now
  // and a year ago, (today's price − the price in effect then), monthly-ized.
  // Isolates price changes from subs added/cancelled. Null when no sub has a
  // year of history to compare.
  monthlyDeltaVsYearAgo: number | null
  zombies: ZombieSub[]
}

interface Plateau {
  amounts: number[]
  median: number
  start: Date
  end: Date
}

// Group a vendor's charges (chronological) into stable price plateaus, then
// absorb single-charge outliers sandwiched between two matching plateaus.
export function buildPlateaus(charges: Charge[]): Plateau[] {
  const sorted = [...charges]
    .filter(c => c.amount > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const plateaus: Plateau[] = []
  for (const c of sorted) {
    const p = plateaus[plateaus.length - 1]
    if (p && Math.abs(c.amount - p.median) <= tol(p.median)) {
      p.amounts.push(c.amount)
      p.median = median(p.amounts)
      p.end = c.date
    } else {
      plateaus.push({ amounts: [c.amount], median: c.amount, start: c.date, end: c.date })
    }
  }
  // A lone odd charge between two plateaus at the same price is noise (promo
  // month, partial charge, failed-then-retried bill) — drop it and merge.
  for (let i = 1; i < plateaus.length - 1; ) {
    const [a, b, c] = [plateaus[i - 1], plateaus[i], plateaus[i + 1]]
    if (b.amounts.length === 1 && Math.abs(a.median - c.median) <= tol(a.median)) {
      a.amounts.push(...c.amounts)
      a.median = median(a.amounts)
      a.end = c.end
      plateaus.splice(i, 2)
    } else i++
  }
  return plateaus
}

function stepsFromPlateaus(vendor: string, plateaus: Plateau[]): PriceStep[] {
  const steps: PriceStep[] = []
  for (let i = 1; i < plateaus.length; i++) {
    const prev = plateaus[i - 1]
    const cur = plateaus[i]
    const from = round2(prev.median)
    const to = round2(cur.median)
    if (from <= 0) continue
    steps.push({
      vendor,
      from,
      to,
      pct: round1(((to - from) / from) * 100),
      atDate: iso(cur.start),
      chargesBefore: prev.amounts.length,
      chargesAfter: cur.amounts.length,
      confirmed: prev.amounts.length >= 2 && cur.amounts.length >= 2,
    })
  }
  return steps
}

// The steps between consecutive plateaus of one vendor's charge series.
export function detectPriceSteps(vendor: string, charges: Charge[]): PriceStep[] {
  return stepsFromPlateaus(vendor, buildPlateaus(charges))
}

// The plateau price in effect at a moment: the last plateau that had started.
function priceAsOf(plateaus: Plateau[], when: Date): number | null {
  let price: number | null = null
  for (const p of plateaus) if (p.start <= when) price = p.median
  return price
}

const CHARGES_PER_MONTH: Record<SubscriptionInsight['cadence'], number> = {
  weekly: 52 / 12,
  monthly: 1,
  annual: 1 / 12,
}

export function computeSubHealth(
  entries: LedgerEntry[],
  insights: SubscriptionInsight[],
  now = new Date(),
): SubHealth {
  const subCharges: Record<string, Charge[]> = {}
  const otherActivity: Record<string, Date> = {} // latest non-bill email per vendor
  for (const e of entries) {
    if (e.category === 'subscription') {
      if (e.amount != null && e.amount > 0) (subCharges[e.vendor] ??= []).push({ date: e.date, amount: e.amount })
    } else {
      const d = otherActivity[e.vendor]
      if (!d || e.date > d) otherActivity[e.vendor] = e.date
    }
  }

  const steps: PriceStep[] = []
  const plateausByVendor: Record<string, Plateau[]> = {}
  for (const [vendor, charges] of Object.entries(subCharges)) {
    const plateaus = buildPlateaus(charges)
    plateausByVendor[vendor] = plateaus
    steps.push(...stepsFromPlateaus(vendor, plateaus))
  }
  steps.sort((a, b) => (a.atDate < b.atDate ? 1 : a.atDate > b.atDate ? -1 : 0))

  // Price-driven monthly-burn delta vs a year ago (active subs only).
  const yearAgo = new Date(now)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  let delta = 0
  let comparable = 0
  for (const s of insights) {
    if (!s.active) continue
    const plateaus = plateausByVendor[s.vendor]
    if (!plateaus || plateaus.length === 0) continue
    const oldPrice = priceAsOf(plateaus, yearAgo)
    if (oldPrice == null) continue // no history that far back — not comparable
    const curPrice = plateaus[plateaus.length - 1].median
    comparable++
    delta += (curPrice - oldPrice) * CHARGES_PER_MONTH[s.cadence]
  }
  const monthlyDeltaVsYearAgo = comparable > 0 ? round2(delta) : null

  // Zombie subs: an established, active subscription whose vendor has sent
  // nothing but bills for ZOMBIE_QUIET_DAYS. Framed as an email-silence fact —
  // we cannot see whether the user opens the app itself.
  const zombies: ZombieSub[] = []
  for (const s of insights) {
    if (!s.active || s.chargeCount < 2) continue
    const other = otherActivity[s.vendor] ?? null
    const charges = subCharges[s.vendor]
    const since =
      other ??
      (charges && charges.length
        ? charges.reduce((min, c) => (c.date < min ? c.date : min), charges[0].date)
        : null)
    if (!since) continue
    const daysQuiet = Math.floor((now.getTime() - since.getTime()) / DAY)
    if (daysQuiet >= ZOMBIE_QUIET_DAYS) {
      zombies.push({
        vendor: s.vendor,
        monthlyEstimate: s.monthlyEstimate,
        lastCharge: s.lastCharge,
        lastOtherActivity: other ? iso(other) : null,
        daysQuiet,
      })
    }
  }
  zombies.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)

  return { steps, monthlyDeltaVsYearAgo, zombies }
}
