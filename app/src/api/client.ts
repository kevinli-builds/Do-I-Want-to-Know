import axios from 'axios'
import Constants from 'expo-constants'

const BASE_URL: string =
  Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3000'

export const api = axios.create({ baseURL: BASE_URL })

/** Returns the URL the app opens in a browser for the Gmail OAuth flow */
export function getConnectUrl(userId: string): string {
  return `${BASE_URL}/auth/google?userId=${encodeURIComponent(userId)}`
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
