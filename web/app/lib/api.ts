// Thin client over the Render backend. All calls are unauthenticated except for
// the device UUID, which identifies the anonymous user.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export interface UserStatus {
  id: string
  email: string | null
  connected: boolean
}

export interface WrappedStats {
  totalSpend: number
  byCategory: Record<string, { count: number; spend: number }>
  topVendors: { vendor: string; count: number }[]
  mostExpensive: { vendor: string; amount: number; description: string; date: string } | null
  monthlySpend: Record<string, number>
  subscriptions: string[]
  subscriptionCount: number
  topSpammers: { vendor: string; count: number }[]
  charities: { vendor: string; count: number; total: number }[]
  charityTotal: number
}

export interface WrappedData {
  connected: boolean
  email: string | null
  totalEntries: number
  stats: WrappedStats | null
}

export interface SyncResult {
  synced: number
  total: number
  message?: string
}

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

export async function getWrapped(userId: string): Promise<WrappedData> {
  const res = await fetch(`${API}/wrapped/${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error('Could not load your Wrapped')
  return res.json()
}

export async function syncEmails(userId: string): Promise<SyncResult> {
  const res = await fetch(`${API}/emails/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Surface the backend's friendly message (e.g. rate-limit notice)
    throw new Error(data.error ?? 'Sync failed — please try again')
  }
  return data
}
