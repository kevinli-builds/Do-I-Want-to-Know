// Shared API/domain types for the web client. Extracted from api.ts so the
// client module stays focused on fetch logic. api.ts re-exports everything here,
// so `import { Foo } from './api'` keeps working throughout the app.

export interface UserStatus {
  id: string
  email: string | null
  connected: boolean
  lastSyncedAt?: string | null
  entryCount?: number       // emails stored as records
  examinedCount?: number    // emails evaluated by Claude
  oldestDate?: string | null
  caughtUp?: boolean
}

export interface SubscriptionInsight {
  vendor: string
  monthlyEstimate: number
  lastAmount: number | null
  cadence: 'weekly' | 'monthly' | 'annual'
  lastCharge: string
  chargeCount: number
  active: boolean
}

export interface SpammerStat {
  vendor: string
  count: number
  senderEmail: string | null
  unsubscribe: string | null
}

export interface WrappedStats {
  totalSpend: number
  refundTotal: number
  byCategory: Record<string, { count: number; spend: number }>
  topVendors: { vendor: string; count: number }[]
  mostExpensive: { vendor: string; amount: number; description: string; date: string; emailId: string; termMonths: number | null } | null
  monthlySpend: Record<string, number>
  subscriptions: string[]
  subscriptionCount: number
  subscriptionInsights: SubscriptionInsight[]
  monthlySubscriptionCost: number
  annualSubscriptionCost: number
  topSpammers: SpammerStat[]
  charities: { vendor: string; count: number; total: number }[]
  charityTotal: number
  funFacts?: { emoji: string; label: string; value: string; detail?: string }[]
}

export interface WrappedData {
  connected: boolean
  email: string | null
  totalEntries: number
  year: number | null
  from?: string | null
  to?: string | null
  availableYears: number[]
  availableMonths?: string[]   // YYYY-MM, newest first
  stats: WrappedStats | null
}

// How the Wrapped summary is scoped.
export type WrappedScope =
  | { mode: 'total' }
  | { mode: 'year'; year: number }
  | { mode: 'month'; month: string }            // YYYY-MM
  | { mode: 'custom'; from: string; to: string } // YYYY-MM-DD … YYYY-MM-DD

export interface SyncResult {
  synced: number
  total: number
  examinedCount?: number
  oldestDate?: string | null
  caughtUp?: boolean
  message?: string
}

export interface SyncOptions {
  lookbackDays?: number
  maxEmails?: number
}

// ── Monitor deck ───────────────────────────────────────────────────────────
export interface KpiPair {
  value: number
  prev: number
  deltaPct: number | null
}
export interface MonitorAnalytics {
  months: string[]
  categories: string[]
  countByCategory: Record<string, number[]>
  spendByCategory: Record<string, number[]>
}
export interface MonitorFlag {
  kind: 'up' | 'down' | 'new' | 'info'
  text: string
}

// A structured unusual-charge alert (§9 A8) — the panel the user grades with
// Expected / Not expected. `new` vendors have no history, so their numbers are
// null. Optional in this type: older backend deploys don't send it.
export interface Anomaly {
  kind: 'spike' | 'new'
  vendor: string
  amount: number
  median: number | null
  ratio: number | null
  multiplier: number | null // the sensitivity in force when this fired
}
export interface TrendChange {
  fromLabel: string
  toLabel: string
  from: number
  to: number
  deltaPct: number | null
}
export interface SubItem {
  vendor: string
  monthlyEstimate: number
  cadence: 'weekly' | 'monthly' | 'annual'
}

export interface MonitorData {
  connected: boolean
  email: string | null
  empty: boolean
  period: 'month' | 'year'
  currentLabel?: string
  previousLabel?: string
  kpis?: {
    spend: KpiPair
    transactions: KpiPair
    subscriptionSpend: KpiPair
    promoEmails: KpiPair
    donations: KpiPair
  }
  analytics?: MonitorAnalytics
  subscriptions?: {
    monthlyBurn: number
    activeCount: number
    // Per-active-sub burn for the what-if simulator (optional: older backend
    // deploys don't send it — the UI degrades gracefully without it).
    items?: SubItem[]
    newlyDetected: { vendor: string; monthlyEstimate: number }[]
    priceChanges: { vendor: string; from: number; to: number }[]
    renewals?: Renewal[]
    health?: SubHealth
  }
  topSenders?: { vendor: string; count: number; prevCount: number }[]
  budgets?: BudgetProgress[]
  flags?: MonitorFlag[]
  anomalies?: Anomaly[]
  trend?: { mom: TrendChange | null; yoy: TrendChange | null }
}

// ── Subscription health (backend lib/subhealth.ts) ──────────────────────────
export interface PriceStep {
  vendor: string
  from: number // stable price before the step (USD)
  to: number // stable price after
  pct: number // signed % change (negative = drop)
  atDate: string // ISO date of the first charge at the new price
  chargesBefore: number
  chargesAfter: number
  confirmed: boolean // both plateaus have ≥2 charges — not a fluke
}

export interface ZombieSub {
  vendor: string
  monthlyEstimate: number
  lastCharge: string // ISO
  lastOtherActivity: string | null
  daysQuiet: number // days with nothing from the vendor but bills
  unsubscribe: string | null
}

export interface SubHealth {
  steps: PriceStep[]
  monthlyDeltaVsYearAgo: number | null // price-driven burn change vs a year ago
  zombies: ZombieSub[]
}

export interface BudgetProgress {
  category: string
  label: string
  amount: number
  spent: number
  pct: number
}

// ── Audit / transactions ───────────────────────────────────────────────────
export interface Transaction {
  id: string
  date: string
  category: string
  vendor: string
  amount: number | null      // original amount, in `currency`
  currency: string
  amountUsd: number | null   // normalized to USD (for totals + cross-currency sort)
  description: string
  emailId: string
  senderEmail: string | null
  unsubscribe: string | null
  termMonths: number | null
  categoryLocked?: boolean
}

// ── Upcoming events (deliveries, flights, check-ins, tickets) + renewals ────
export interface UpcomingItem {
  id: string
  category: string
  vendor: string
  description: string
  eventDate: string
  emailId: string
}

export interface Renewal {
  vendor: string
  amount: number | null
  cadence: 'weekly' | 'monthly' | 'annual'
  date: string
  daysAway: number
}

// ── Promotions (active discounts + promo codes) ─────────────────────────────
export interface Promotion {
  id: string
  vendor: string
  description: string
  promoCode: string | null
  discount: string | null
  expiresAt: string | null
  emailId: string
}
