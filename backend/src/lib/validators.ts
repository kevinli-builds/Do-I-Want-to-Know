// Shared input validators. Kept dependency-free so any module (route or lib) can
// import them without pulling in heavier packages.

// A pragmatic email shape check: one @, a dot in the domain, no whitespace. Not
// RFC-perfect (deliberately), but enough to reject obviously bad input before we
// store it or parse a sender address.
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value)
}
