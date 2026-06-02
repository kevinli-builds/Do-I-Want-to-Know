import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'

const KEY = 'diwtkn_user_id'
const TOKEN_KEY = 'diwtkn_token'

export async function getUserId(): Promise<string> {
  let id = await SecureStore.getItemAsync(KEY)
  if (!id) {
    id = Crypto.randomUUID()
    await SecureStore.setItemAsync(KEY, id)
  }
  return id
}

/** Adopt the canonical user id the backend resolved from the Gmail address. */
export async function setUserId(id: string): Promise<void> {
  if (id) await SecureStore.setItemAsync(KEY, id)
}

// ── Session token (bearer credential, obtained after OAuth) ──────────────────
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}
export async function setToken(token: string): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token)
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}
