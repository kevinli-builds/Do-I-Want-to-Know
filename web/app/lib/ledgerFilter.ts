// Pure query engine for the ledger workbench (§9 A7): the Audit tab's filter
// row, its sort, its saved views, and the CSV of whatever is on screen. All
// client-side over the /transactions list the tab already holds — the Audit
// table stays the editor, this just narrows what it shows.
import type { Transaction } from './types'

export type LedgerTxn = Pick<
  Transaction,
  'id' | 'date' | 'category' | 'vendor' | 'amount' | 'currency' | 'amountUsd' | 'description' | 'emailId' | 'categoryLocked'
>

export interface LedgerFilters {
  text: string
  categories: string[] // empty = every category
  minAmount: number | null // USD, inclusive
  maxAmount: number | null // USD, inclusive
  from: string | null // YYYY-MM-DD, inclusive
  to: string | null // YYYY-MM-DD, inclusive
  hideAccepted: boolean
}

export type SortKey = 'recent' | 'oldest' | 'amount' | 'amountAsc' | 'vendor'

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Most recent',
  oldest: 'Oldest first',
  amount: 'Highest amount',
  amountAsc: 'Lowest amount',
  vendor: 'Vendor A–Z',
}

export const EMPTY_FILTERS: LedgerFilters = {
  text: '',
  categories: [],
  minAmount: null,
  maxAmount: null,
  from: null,
  to: null,
  hideAccepted: false,
}

export interface LedgerSummary {
  count: number
  spend: number // USD across spend records
  refunds: number // USD returned
  net: number
  vendors: number // distinct vendors in the result
}

// Mirror of the backend's SPEND_CATEGORIES (see lib/cashflow.ts).
const SPEND = new Set(['order', 'clothes', 'subscription', 'travel', 'food', 'entertainment', 'other'])

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// A record's date → its local YYYY-MM-DD, so range bounds compare as the
// calendar dates the user typed. Bare dates are already calendar dates; parsing
// one through `new Date()` would land on UTC midnight (a day early out west).
function dayKey(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** True when the filters would narrow anything — drives the "Clear" affordance. */
export function isFiltered(f: LedgerFilters): boolean {
  return (
    f.text.trim() !== '' ||
    f.categories.length > 0 ||
    f.minAmount != null ||
    f.maxAmount != null ||
    f.from != null ||
    f.to != null ||
    f.hideAccepted
  )
}

/**
 * Narrow the ledger. Text matches vendor or description (case-insensitive,
 * every whitespace-separated term must appear, so "amazon socks" works).
 * Amount bounds compare the USD-normalized value so currencies are comparable;
 * a record with no amount is excluded as soon as either bound is set.
 */
export function filterTxns<T extends LedgerTxn>(
  txns: T[],
  filters: LedgerFilters,
  accepted: Set<string> = new Set()
): T[] {
  const terms = filters.text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const cats = filters.categories.length > 0 ? new Set(filters.categories) : null
  const boundedByAmount = filters.minAmount != null || filters.maxAmount != null

  return txns.filter(t => {
    if (cats && !cats.has(t.category)) return false
    if (filters.hideAccepted && accepted.has(t.vendor)) return false

    if (boundedByAmount) {
      if (t.amountUsd == null) return false
      if (filters.minAmount != null && t.amountUsd < filters.minAmount) return false
      if (filters.maxAmount != null && t.amountUsd > filters.maxAmount) return false
    }

    if (filters.from || filters.to) {
      const day = dayKey(t.date)
      if (!day) return false
      if (filters.from && day < filters.from) return false
      if (filters.to && day > filters.to) return false
    }

    if (terms.length > 0) {
      const hay = `${t.vendor} ${t.description}`.toLowerCase()
      if (!terms.every(term => hay.includes(term))) return false
    }

    return true
  })
}

/** Sort a result set. Returns a new array; records with no amount sort last. */
export function sortTxns<T extends LedgerTxn>(txns: T[], sort: SortKey): T[] {
  const list = [...txns]
  const time = (t: T) => new Date(t.date).getTime()
  const amt = (t: T) => t.amountUsd ?? t.amount

  switch (sort) {
    case 'oldest':
      return list.sort((a, b) => time(a) - time(b))
    case 'amount':
      return list.sort((a, b) => (amt(b) ?? -Infinity) - (amt(a) ?? -Infinity))
    case 'amountAsc':
      return list.sort((a, b) => (amt(a) ?? Infinity) - (amt(b) ?? Infinity))
    case 'vendor':
      return list.sort((a, b) => a.vendor.localeCompare(b.vendor) || time(b) - time(a))
    default:
      return list.sort((a, b) => time(b) - time(a))
  }
}

/** Totals for the filtered set — the "what am I looking at" line. */
export function summarize(txns: LedgerTxn[]): LedgerSummary {
  let spend = 0
  let refunds = 0
  for (const t of txns) {
    const v = t.amountUsd ?? 0
    if (t.category === 'refund') refunds += v
    else if (SPEND.has(t.category)) spend += v
  }
  return {
    count: txns.length,
    spend: round2(spend),
    refunds: round2(refunds),
    net: round2(spend - refunds),
    vendors: new Set(txns.map(t => t.vendor)).size,
  }
}

// Guard against spreadsheet formula injection, matching the backend's xlsx
// export (backend/src/routes/export.ts `safeText`): a cell beginning with
// = + - @ or a leading tab/CR can execute as a formula in Excel/Sheets, and
// vendor/description text is email-derived. Prefix those with an apostrophe.
function safeText(v: string | null | undefined): string {
  const s = String(v ?? '')
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? String(v) : safeText(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_HEADERS = ['Date', 'Vendor', 'Category', 'Description', 'Amount', 'Currency', 'Amount (USD)', 'Email ID']

/** CSV of exactly what's on screen. CRLF line endings so Excel is happy. */
export function toCsv(txns: LedgerTxn[]): string {
  const rows = txns.map(t =>
    [
      dayKey(t.date),
      csvCell(t.vendor),
      csvCell(t.category),
      csvCell(t.description),
      t.amount ?? '',
      csvCell(t.currency),
      t.amountUsd ?? '',
      csvCell(t.emailId),
    ].join(',')
  )
  return [CSV_HEADERS.join(','), ...rows].join('\r\n')
}

// ── Saved views ─────────────────────────────────────────────────────────────
// Per-user, per-device (localStorage) — a saved view is just a named filter+sort
// pair, so it stays valid as the ledger grows.

export interface SavedView {
  name: string
  filters: LedgerFilters
  sort: SortKey
}

const VIEWS_PREFIX = 'diwtkn_views_'

function viewsKey(userId: string): string {
  return `${VIEWS_PREFIX}${userId}`
}

// Coerce anything parsed out of localStorage back into a well-formed view, so a
// hand-edited or stale entry can't crash the tab.
function normalizeView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  const name = typeof v.name === 'string' ? v.name.trim() : ''
  if (!name) return null
  const f = (v.filters ?? {}) as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  const str = (x: unknown) => (typeof x === 'string' && x ? x : null)
  return {
    name,
    sort: (typeof v.sort === 'string' && v.sort in SORT_LABELS ? v.sort : 'recent') as SortKey,
    filters: {
      text: typeof f.text === 'string' ? f.text : '',
      categories: Array.isArray(f.categories) ? f.categories.filter(c => typeof c === 'string') : [],
      minAmount: num(f.minAmount),
      maxAmount: num(f.maxAmount),
      from: str(f.from),
      to: str(f.to),
      hideAccepted: f.hideAccepted === true,
    },
  }
}

export function loadViews(userId: string): SavedView[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(viewsKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeView).filter((v): v is SavedView => v !== null)
  } catch {
    return []
  }
}

function persist(userId: string, views: SavedView[]): SavedView[] {
  try { window.localStorage.setItem(viewsKey(userId), JSON.stringify(views)) } catch { /* ignore */ }
  return views
}

/** Add or replace a view by name (case-insensitive). Returns the new list. */
export function saveView(userId: string, view: SavedView): SavedView[] {
  const clean = normalizeView(view)
  if (!clean) return loadViews(userId)
  const rest = loadViews(userId).filter(v => v.name.toLowerCase() !== clean.name.toLowerCase())
  return persist(userId, [...rest, clean].sort((a, b) => a.name.localeCompare(b.name)))
}

export function deleteView(userId: string, name: string): SavedView[] {
  return persist(userId, loadViews(userId).filter(v => v.name.toLowerCase() !== name.toLowerCase()))
}
