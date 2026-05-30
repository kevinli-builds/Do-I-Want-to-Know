// Thin client over the Render backend. All calls are unauthenticated except for
// the device UUID, which identifies the anonymous user.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

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
  mostExpensive: { vendor: string; amount: number; description: string; date: string } | null
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

export async function upsertUser(id: string): Promise<UserStatus> {
  const res = await fetch(`${API}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Could not reach the server')
  return res.json()
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
  const res = await fetch(`${API}/wrapped/${encodeURIComponent(userId)}${qs}`)
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
