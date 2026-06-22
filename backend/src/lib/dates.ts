// Date coercion helpers for untrusted/AI-derived date strings.

// Parse an optional date, returning null if absent or unparseable. Use for
// genuinely optional fields (e.g. eventDate) where "no date" is meaningful.
export function optionalDate(s: string | undefined | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// Return the first parseable date among the candidates, else now. Use when a row
// MUST have a date — prevents an "Invalid Date" from Claude's output blowing up a
// Prisma insert.
export function safeDate(...candidates: (string | undefined | null)[]): Date {
  for (const c of candidates) {
    const d = optionalDate(c)
    if (d) return d
  }
  return new Date()
}
