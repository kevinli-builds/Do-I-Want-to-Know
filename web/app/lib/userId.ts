// Persists an anonymous device UUID in localStorage so the same browser maps to
// the same backend user across visits (and survives the OAuth round-trip).

const KEY = 'diwtkn_user_id'

export function getUserId(): string {
  if (typeof window === 'undefined') return ''
  let id = window.localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(KEY, id)
  }
  return id
}
