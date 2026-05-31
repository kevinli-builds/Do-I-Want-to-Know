// Thin client over the Render backend. All calls are unauthenticated except for
// the device UUID, which identifies the anonymous user.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

// fetch with an abort timeout so a stalled request rejects instead of hanging
// the UI forever. Generous default (60s) to tolerate Render free-tier cold
// starts (~30-50s). NOT used for /emails/sync, which legitimately runs longer.
async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 60000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export interface UserStatus {
  id: string
  email: string | null
  connected: boolean
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
}

export interface WrappedData {
  connected: boolean
  email: string | null
  totalEntries: number
  year: number | null
  availableYears: number[]
  stats: WrappedStats | null
}

export interface SyncResult {
  synced: number
  total: number
  message?: string
}

/** Thrown when the Gmail token has expired/been revoked and the user must reconnect. */
export class ReauthError extends Error {}

// ── Monitor deck ───────────────────────────────────────────────────────────
export interface KpiPair {
  value: number
  prev: number
  deltaPct: number | null
}
export interface TrendPoint {
  label: string
  value: number
}
export interface MonitorFlag {
  kind: 'up' | 'down' | 'new' | 'info'
  text: string
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
  spendTrend?: TrendPoint[]
  promoTrend?: TrendPoint[]
  subscriptions?: {
    monthlyBurn: number
    activeCount: number
    newlyDetected: { vendor: string; monthlyEstimate: number }[]
    priceChanges: { vendor: string; from: number; to: number }[]
  }
  topSenders?: { vendor: string; count: number; prevCount: number }[]
  flags?: MonitorFlag[]
}

export async function getMonitor(userId: string, period: 'month' | 'year'): Promise<MonitorData> {
  const res = await fetchWithTimeout(`${API}/monitor/${encodeURIComponent(userId)}?period=${period}`)
  if (!res.ok) throw new Error('Could not load the monitor')
  return res.json()
}

// ── Audit / transactions ───────────────────────────────────────────────────
export interface Transaction {
  id: string
  date: string
  category: string
  vendor: string
  amount: number | null
  currency: string
  description: string
  emailId: string
  senderEmail: string | null
  unsubscribe: string | null
  termMonths: number | null
}

export async function getTransactions(userId: string): Promise<Transaction[]> {
  const res = await fetchWithTimeout(`${API}/transactions/${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error('Could not load transactions')
  const data = await res.json()
  return data.transactions ?? []
}

/** Deep link to the exact Gmail message a record was extracted from. */
export function gmailMessageUrl(emailId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${emailId}`
}

export async function upsertUser(id: string): Promise<UserStatus> {
  const res = await fetchWithTimeout(`${API}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Could not reach the server')
  return res.json()
}

// Ask the owner to be added as a test user (for people not yet on the list).
export async function requestAccess(email: string): Promise<void> {
  const res = await fetch(`${API}/access/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Could not submit your request')
}

// Full-page navigation to start the Google OAuth flow. The backend redirects
// back to this origin with ?connected=1 once Gmail is connected.
export function startConnect(userId: string): void {
  const redirect = window.location.origin
  window.location.href =
    `${API}/auth/google?userId=${encodeURIComponent(userId)}&redirect=${encodeURIComponent(redirect)}`
}

export async function getWrapped(userId: string, year?: number | null): Promise<WrappedData> {
  const qs = year != null ? `?year=${year}` : ''
  const res = await fetchWithTimeout(`${API}/wrapped/${encodeURIComponent(userId)}${qs}`)
  if (!res.ok) throw new Error('Could not load your Wrapped')
  return res.json()
}

/** Triggers a direct file download of the user's data as an Excel workbook. */
export function downloadExcel(userId: string): void {
  const a = document.createElement('a')
  a.href = `${API}/export/${encodeURIComponent(userId)}`
  a.download = ''          // let the server Content-Disposition set the filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function syncEmails(userId: string): Promise<SyncResult> {
  const res = await fetch(`${API}/emails/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Expired/revoked Gmail token — caller should prompt a reconnect
    if (res.status === 401 && data.reauth) {
      throw new ReauthError(data.error ?? 'Your Gmail session expired — please reconnect.')
    }
    // Surface the backend's friendly message (e.g. rate-limit notice)
    throw new Error(data.error ?? 'Sync failed — please try again')
  }
  return data
}
