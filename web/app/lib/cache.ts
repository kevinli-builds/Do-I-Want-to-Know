// Local cache of a user's Wrapped results in localStorage.
//
// The extracted data already lives permanently in the backend database, and
// reading it never costs any Claude usage. This cache is a client-side
// stale-while-revalidate layer so the dashboard renders instantly on revisit
// (and still works while the backend is cold-starting or briefly offline).

import type { WrappedData } from './api'

const PREFIX = 'diwtkn_wrapped_'

export interface CachedWrapped {
  data: WrappedData
  cachedAt: number // epoch ms
}

export function saveWrappedCache(userId: string, data: WrappedData): void {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedWrapped = { data, cachedAt: Date.now() }
    window.localStorage.setItem(PREFIX + userId, JSON.stringify(payload))
  } catch {
    /* quota / disabled storage — ignore, cache is best-effort */
  }
}

export function loadWrappedCache(userId: string): CachedWrapped | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PREFIX + userId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedWrapped
    if (parsed && parsed.data && typeof parsed.cachedAt === 'number') return parsed
  } catch {
    /* corrupt entry — ignore */
  }
  return null
}

export function clearWrappedCache(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(PREFIX + userId)
  } catch {
    /* ignore */
  }
}
