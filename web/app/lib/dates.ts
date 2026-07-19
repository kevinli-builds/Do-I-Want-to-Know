// Shared date formatting + relative-time helpers (single source of truth).

function toDate(v: string | number | Date): Date {
  // A bare YYYY-MM-DD (e.g. a predicted renewal date) is a CALENDAR date, but
  // new Date() parses it as UTC midnight — which is the previous local day in
  // the Americas, showing renewals a day early. Parse it as local instead.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return v instanceof Date ? v : new Date(v)
}

/** Whole days from the start of today to the given date (negative = past, NaN if invalid). */
export function daysUntil(v: string | Date): number {
  const d = toDate(v)
  if (isNaN(d.getTime())) return NaN
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  return Math.round((day.getTime() - today.getTime()) / 86_400_000)
}

/** Near-future label: "today" / "tomorrow" / "in N days" / "Mon D". */
export function relativeDay(v: string | Date): string {
  const d = toDate(v)
  if (isNaN(d.getTime())) return ''
  const diff = daysUntil(d)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff < 7) return `in ${diff} days`
  return monthDay(d)
}

/** "Mon D, YYYY" */
export function fmtDate(v: string | Date): string {
  const d = toDate(v)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Mon D" */
export function monthDay(v: string | Date): string {
  const d = toDate(v)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mon YYYY" (empty string for null/invalid) */
export function monthYear(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = toDate(v)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Past-relative for a ms timestamp: "just now" / "5 min ago" / "3h ago" / "2 days ago". */
export function relativeTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
