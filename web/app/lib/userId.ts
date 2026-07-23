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

/**
 * Adopt a canonical user id returned by the backend after OAuth, so this
 * device converges onto the Gmail-keyed identity and sees the same data
 * everywhere. No-op if it already matches.
 */
export function setUserId(id: string): void {
  if (typeof window === 'undefined' || !id) return
  window.localStorage.setItem(KEY, id)
}
