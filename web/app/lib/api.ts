// Thin client over the Render backend. Data calls are authenticated with a
// bearer session token (obtained after Gmail OAuth, see exchangeCode). The token
// — not the user id — is the credential, and it travels in the Authorization
// header, never in the URL.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

const TOKEN_KEY = 'diwtkn_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(TOKEN_KEY, token) } catch { /* ignore */ }
}
export function clearToken(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = getToken()
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra
}

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

// Authenticated fetch: attaches the bearer token and turns a 401 reauth response
// into a ReauthError (after dropping the dead token) so the UI can prompt a
// reconnect instead of silently showing an error.
async function authedFetch(url: string, opts: RequestInit = {}, ms = 60000): Promise<Response> {
  const headers = { ...(opts.headers as Record<string, string> | undefined ?? {}), ...authHeaders() }
  const res = await fetchWithTimeout(url, { ...opts, headers }, ms)
  if (res.status === 401) {
    const data = await res.clone().json().catch(() => ({} as { reauth?: boolean; error?: string }))
    if (data?.reauth) {
      clearToken()
      throw new ReauthError(data.error ?? 'Please reconnect Gmail.')
    }
  }
  return res
}

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

/** Thrown when the Gmail token has expired/been revoked and the user must reconnect. */
export class ReauthError extends Error {}

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
export interface TrendChange {
  fromLabel: string
  toLabel: string
  from: number
  to: number
  deltaPct: number | null
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
    newlyDetected: { vendor: string; monthlyEstimate: number }[]
    priceChanges: { vendor: string; from: number; to: number }[]
  }
  topSenders?: { vendor: string; count: number; prevCount: number }[]
  flags?: MonitorFlag[]
  trend?: { mom: TrendChange | null; yoy: TrendChange | null }
}

export async function getMonitor(userId: string, period: 'month' | 'year'): Promise<MonitorData> {
  const res = await authedFetch(`${API}/monitor/${encodeURIComponent(userId)}?period=${period}`)
  if (!res.ok) throw new Error('Could not load the monitor')
  return res.json()
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
}

export async function getTransactions(userId: string): Promise<Transaction[]> {
  const res = await authedFetch(`${API}/transactions/${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error('Could not load transactions')
  const data = await res.json()
  return data.transactions ?? []
}

/** Deep link to the exact Gmail message a record was extracted from. */
export function gmailMessageUrl(emailId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${emailId}`
}

/**
 * Defense-in-depth for links built from email data (e.g. unsubscribe links):
 * only allow http(s)/mailto schemes, so a malformed/hostile value can never
 * render as a `javascript:` (or other) href. Returns undefined if unsafe.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return /^(https?:|mailto:)/i.test(url.trim()) ? url : undefined
}

// ── Upcoming events (deliveries, flights, check-ins, tickets) ───────────────
export interface UpcomingItem {
  id: string
  category: string
  vendor: string
  description: string
  eventDate: string
  emailId: string
}

export async function getUpcoming(userId: string): Promise<UpcomingItem[]> {
  const res = await authedFetch(`${API}/upcoming/${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error('Could not load upcoming')
  const data = await res.json()
  return data.upcoming ?? []
}

// ── Promotions (active discounts + promo codes) ─────────────────────────────
export interface Promotion {
  id: string
  vendor: string
  description: string
  promoCode: string | null
  discount: string | null
  expiresAt: string | null
  senderEmail: string | null
  unsubscribe: string | null
  emailId: string
}

export async function getPromotions(userId: string): Promise<Promotion[]> {
  const res = await authedFetch(`${API}/promotions/${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error('Could not load promotions')
  const data = await res.json()
  return data.promotions ?? []
}

// ── Accepted tags (cross-device) ───────────────────────────────────────────
export async function getAcceptances(userId: string): Promise<string[]> {
  const res = await authedFetch(`${API}/acceptances/${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error('Could not load accepted tags')
  const data = await res.json()
  return data.vendors ?? []
}

export async function setAcceptance(userId: string, vendor: string, accepted: boolean): Promise<string[]> {
  const res = await authedFetch(`${API}/acceptances/${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vendor, accepted }),
  })
  if (!res.ok) throw new Error('Could not update accepted tag')
  const data = await res.json()
  return data.vendors ?? []
}

export async function upsertUser(id: string): Promise<UserStatus> {
  // Sends the bearer token if we have one (so a connected device gets its real
  // status); without it the server safely reports connected:false.
  const res = await fetchWithTimeout(`${API}/users`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Could not reach the server')
  return res.json()
}

// Trade the one-time code from the OAuth redirect for a durable session token
// and the canonical user id. Persists the token on success.
export async function exchangeCode(code: string): Promise<{ userId: string; token: string }> {
  const res = await fetch(`${API}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = await res.json().catch(() => ({} as { userId?: string; token?: string; error?: string }))
  if (!res.ok || !data.token || !data.userId) {
    throw new Error(data.error ?? 'Could not complete sign-in')
  }
  setToken(data.token)
  return { userId: data.userId, token: data.token }
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

// Disconnect Gmail: revokes the stored OAuth tokens + all sessions server-side,
// then drops the local token. Ledger data is kept (reconnect shows it again).
export async function disconnectGmail(): Promise<void> {
  try {
    await authedFetch(`${API}/auth/disconnect`, { method: 'POST' })
  } finally {
    clearToken()
  }
}

export async function getWrapped(userId: string, scope: WrappedScope = { mode: 'total' }): Promise<WrappedData> {
  let qs = ''
  if (scope.mode === 'year') {
    qs = `?year=${scope.year}`
  } else if (scope.mode === 'custom') {
    qs = `?from=${encodeURIComponent(scope.from)}&to=${encodeURIComponent(scope.to)}`
  } else if (scope.mode === 'month') {
    const [y, m] = scope.month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate() // day 0 of next month = last day of this month
    qs = `?from=${scope.month}-01&to=${scope.month}-${String(lastDay).padStart(2, '0')}`
  }
  const res = await authedFetch(`${API}/wrapped/${encodeURIComponent(userId)}${qs}`)
  if (!res.ok) throw new Error('Could not load your Wrapped')
  return res.json()
}

/**
 * Downloads the user's data as an Excel workbook. The export endpoint now needs
 * the bearer token, which a plain <a href> navigation can't send — so we fetch
 * the file as a blob (with the auth header) and trigger the download from it.
 */
export async function downloadExcel(userId: string): Promise<void> {
  const res = await authedFetch(`${API}/export/${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error('Could not export your data')
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const match = cd.match(/filename="?([^"]+)"?/)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = match?.[1] ?? 'do-i-want-to-know.xlsx'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function syncEmails(userId: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const res = await fetch(`${API}/emails/sync`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, ...opts }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Expired session, expired Gmail token, OR missing Gmail scope — reconnect.
    if (data.reauth) {
      if (res.status === 401) clearToken()
      throw new ReauthError(data.error ?? 'Please reconnect Gmail.')
    }
    // Surface the backend's friendly message (e.g. rate-limit notice)
    throw new Error(data.error ?? 'Sync failed — please try again')
  }
  return data
}
