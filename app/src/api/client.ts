import axios from 'axios'
import Constants from 'expo-constants'
import { getToken, setToken } from '../lib/userId'

const BASE_URL: string =
  Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3000'

export const api = axios.create({ baseURL: BASE_URL })

// Attach the bearer session token (if we have one) to every request. The token,
// not the userId, is the credential the backend's requireSession checks.
api.interceptors.request.use(async config => {
  const token = await getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * URL the app opens for the Gmail OAuth flow. `redirect` is the app's deep link
 * (e.g. diwtkn://auth) that the backend sends the one-time handoff code back to.
 */
export function getConnectUrl(userId: string, redirect?: string): string {
  const r = redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''
  return `${BASE_URL}/auth/google?userId=${encodeURIComponent(userId)}${r}`
}

/** Trade the one-time code from the OAuth redirect for a durable session token. */
export const exchangeCode = async (code: string) => {
  const { data } = await api.post<{ userId: string; token: string }>('/auth/exchange', { code })
  await setToken(data.token)
  return data
}

export interface UserStatus {
  id: string
  email: string | null
  connected: boolean
  createdAt: string
}

export interface WrappedStats {
  connected: boolean
  email: string | null
  totalEntries: number
  stats: {
    totalSpend: number
    byCategory: Record<string, { count: number; spend: number }>
    topVendors: { vendor: string; count: number }[]
    mostExpensive: {
      vendor: string
      amount: number | null
      description: string
      date: string
    } | null
    monthlySpend: Record<string, number>
    subscriptions: string[]
    subscriptionCount: number
  } | null
}

export const upsertUser = (id: string) =>
  api.post<UserStatus>('/users', { id }).then(r => r.data)

export const syncEmails = (userId: string) =>
  api.post<{ synced: number; total: number }>('/emails/sync', { userId }).then(r => r.data)

export const getWrapped = (userId: string) =>
  api.get<WrappedStats>(`/wrapped/${userId}`).then(r => r.data)
