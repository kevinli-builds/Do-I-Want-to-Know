import { beforeEach, describe, expect, it } from 'vitest'

import {
  CSV_HEADERS,
  EMPTY_FILTERS,
  deleteView,
  filterTxns,
  isFiltered,
  loadViews,
  saveView,
  sortTxns,
  summarize,
  toCsv,
  type LedgerFilters,
  type LedgerTxn,
  type SavedView,
} from '../ledgerFilter'

// Fixtures use T12:00Z so the local calendar date holds across test timezones.
const txn = (o: Partial<LedgerTxn> & { date: string }): LedgerTxn => ({
  id: o.date + (o.description ?? '') + (o.vendor ?? ''),
  category: 'order',
  vendor: 'Amazon',
  amount: 10,
  currency: 'USD',
  amountUsd: 10,
  description: '',
  emailId: 'e1',
  ...o,
})

const filters = (o: Partial<LedgerFilters> = {}): LedgerFilters => ({ ...EMPTY_FILTERS, ...o })

const SET: LedgerTxn[] = [
  txn({ date: '2026-01-05T12:00:00Z', vendor: 'Amazon', description: 'Running socks', amountUsd: 25, amount: 25 }),
  txn({ date: '2026-03-10T12:00:00Z', vendor: 'Netflix', category: 'subscription', description: 'Monthly plan', amountUsd: 17.99, amount: 17.99 }),
  txn({ date: '2026-05-20T12:00:00Z', vendor: 'DoorDash', category: 'food', description: 'Dinner', amountUsd: 43.5, amount: 43.5 }),
  txn({ date: '2026-06-01T12:00:00Z', vendor: 'Amazon', category: 'refund', description: 'Returned socks', amountUsd: 25, amount: 25 }),
  txn({ date: '2026-06-15T12:00:00Z', vendor: 'Groupon', category: 'marketing', description: '20% off', amountUsd: null, amount: null }),
]

const names = (list: LedgerTxn[]) => list.map(t => t.vendor)

describe('isFiltered', () => {
  it('is false for the empty filter set and true once anything narrows', () => {
    expect(isFiltered(EMPTY_FILTERS)).toBe(false)
    expect(isFiltered(filters({ text: '  ' }))).toBe(false) // whitespace only
    expect(isFiltered(filters({ text: 'amazon' }))).toBe(true)
    expect(isFiltered(filters({ categories: ['food'] }))).toBe(true)
    expect(isFiltered(filters({ minAmount: 0 }))).toBe(true) // 0 is a real bound
    expect(isFiltered(filters({ hideAccepted: true }))).toBe(true)
  })
})

describe('filterTxns', () => {
  it('returns everything when nothing is set', () => {
    expect(filterTxns(SET, EMPTY_FILTERS)).toHaveLength(5)
  })

  it('matches text against vendor or description, requiring every term', () => {
    expect(names(filterTxns(SET, filters({ text: 'amazon' })))).toEqual(['Amazon', 'Amazon'])
    expect(names(filterTxns(SET, filters({ text: 'socks' })))).toEqual(['Amazon', 'Amazon'])
    // both terms must appear, across the vendor+description haystack
    expect(names(filterTxns(SET, filters({ text: 'amazon running' })))).toEqual(['Amazon'])
    expect(filterTxns(SET, filters({ text: 'amazon dinner' }))).toHaveLength(0)
  })

  it('filters by category set', () => {
    expect(names(filterTxns(SET, filters({ categories: ['food', 'subscription'] })))).toEqual(['Netflix', 'DoorDash'])
  })

  it('bounds amounts on the USD value and drops unpriced records', () => {
    expect(names(filterTxns(SET, filters({ minAmount: 20 })))).toEqual(['Amazon', 'DoorDash', 'Amazon'])
    expect(names(filterTxns(SET, filters({ maxAmount: 20 })))).toEqual(['Netflix'])
    expect(names(filterTxns(SET, filters({ minAmount: 20, maxAmount: 30 })))).toEqual(['Amazon', 'Amazon'])
    // the marketing record has no amount, so any bound excludes it
    expect(filterTxns(SET, filters({ minAmount: 0 })).some(t => t.vendor === 'Groupon')).toBe(false)
    // …but with no bound set it stays
    expect(filterTxns(SET, EMPTY_FILTERS).some(t => t.vendor === 'Groupon')).toBe(true)
  })

  it('bounds dates inclusively on the local calendar date', () => {
    expect(names(filterTxns(SET, filters({ from: '2026-05-20', to: '2026-06-01' })))).toEqual(['DoorDash', 'Amazon'])
    expect(names(filterTxns(SET, filters({ from: '2026-06-15' })))).toEqual(['Groupon'])
    expect(names(filterTxns(SET, filters({ to: '2026-01-05' })))).toEqual(['Amazon'])
  })

  it('treats a bare YYYY-MM-DD record date as that calendar day', () => {
    // Regression guard for the lib/dates.ts UTC-midnight bug.
    const list = [txn({ date: '2026-06-15', vendor: 'Bare' })]
    expect(filterTxns(list, filters({ from: '2026-06-15', to: '2026-06-15' }))).toHaveLength(1)
  })

  it('hides accepted vendors only when asked', () => {
    const accepted = new Set(['Amazon'])
    expect(filterTxns(SET, EMPTY_FILTERS, accepted)).toHaveLength(5)
    expect(names(filterTxns(SET, filters({ hideAccepted: true }), accepted))).toEqual(['Netflix', 'DoorDash', 'Groupon'])
  })

  it('combines every predicate', () => {
    const out = filterTxns(SET, filters({ text: 'socks', categories: ['order'], minAmount: 20, from: '2026-01-01' }))
    expect(names(out)).toEqual(['Amazon'])
    expect(out[0].description).toBe('Running socks')
  })
})

describe('sortTxns', () => {
  it('orders by date in both directions', () => {
    expect(names(sortTxns(SET, 'recent'))[0]).toBe('Groupon')
    expect(names(sortTxns(SET, 'oldest'))[0]).toBe('Amazon')
  })

  it('orders by USD amount, sinking unpriced records to the end', () => {
    expect(names(sortTxns(SET, 'amount'))).toEqual(['DoorDash', 'Amazon', 'Amazon', 'Netflix', 'Groupon'])
    expect(names(sortTxns(SET, 'amountAsc')).at(-1)).toBe('Groupon')
    expect(names(sortTxns(SET, 'amountAsc'))[0]).toBe('Netflix')
  })

  it('orders by vendor name, newest first within a vendor', () => {
    const out = sortTxns(SET, 'vendor')
    expect(names(out)).toEqual(['Amazon', 'Amazon', 'DoorDash', 'Groupon', 'Netflix'])
    expect(out[0].description).toBe('Returned socks') // Jun before Jan
  })

  it('does not mutate its input', () => {
    const before = names(SET)
    sortTxns(SET, 'vendor')
    expect(names(SET)).toEqual(before)
  })
})

describe('summarize', () => {
  it('nets refunds against spend and counts distinct vendors', () => {
    const s = summarize(SET)
    expect(s.count).toBe(5)
    expect(s.spend).toBe(86.49) // 25 + 17.99 + 43.5; marketing excluded
    expect(s.refunds).toBe(25)
    expect(s.net).toBe(61.49)
    expect(s.vendors).toBe(4)
  })
})

describe('toCsv', () => {
  it('emits a header row and one CRLF-terminated line per record', () => {
    const csv = toCsv([SET[0]])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(CSV_HEADERS.join(','))
    expect(lines[1]).toBe('2026-01-05,Amazon,order,Running socks,25,USD,25,e1')
  })

  it('quotes cells containing commas, quotes, or newlines', () => {
    const csv = toCsv([txn({ date: '2026-01-05T12:00:00Z', vendor: 'Ben, Inc', description: 'He said "hi"' })])
    expect(csv).toContain('"Ben, Inc"')
    expect(csv).toContain('"He said ""hi"""')
  })

  it('neutralizes spreadsheet formula injection in email-derived text', () => {
    // Matches the backend xlsx export's safeText guard.
    const csv = toCsv([txn({ date: '2026-01-05T12:00:00Z', vendor: '=HYPERLINK("http://evil","x")', description: '@SUM(A1)' })])
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csv).toContain(`'@SUM(A1)`)
    expect(csv).not.toMatch(/,=HYPERLINK/)
  })

  it('leaves a missing amount as an empty cell rather than 0', () => {
    const csv = toCsv([SET[4]])
    expect(csv.split('\r\n')[1]).toBe('2026-06-15,Groupon,marketing,20% off,,USD,,e1')
  })
})

// The suite runs in vitest's default node environment (no jsdom dependency), so
// stand up the minimum of `window.localStorage` the saved-view helpers touch.
function installLocalStorage(): void {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
  }
  ;(globalThis as { window?: unknown }).window = { localStorage }
}

describe('saved views', () => {
  const USER = 'u1'
  beforeEach(() => { installLocalStorage() })

  const view = (o: Partial<SavedView> = {}): SavedView => ({
    name: 'Big food',
    sort: 'amount',
    filters: filters({ categories: ['food'], minAmount: 30 }),
    ...o,
  })

  it('round-trips a view', () => {
    saveView(USER, view())
    const [v] = loadViews(USER)
    expect(v.name).toBe('Big food')
    expect(v.sort).toBe('amount')
    expect(v.filters.categories).toEqual(['food'])
    expect(v.filters.minAmount).toBe(30)
  })

  it('replaces a view of the same name case-insensitively, keeping the list sorted', () => {
    saveView(USER, view({ name: 'Zed' }))
    saveView(USER, view({ name: 'Alpha' }))
    saveView(USER, view({ name: 'alpha', sort: 'oldest' }))
    const list = loadViews(USER)
    expect(list.map(v => v.name)).toEqual(['alpha', 'Zed'])
    expect(list[0].sort).toBe('oldest')
  })

  it('keeps views separate per user', () => {
    saveView(USER, view())
    saveView('u2', view({ name: 'Other' }))
    expect(loadViews(USER).map(v => v.name)).toEqual(['Big food'])
    expect(loadViews('u2').map(v => v.name)).toEqual(['Other'])
  })

  it('deletes by name', () => {
    saveView(USER, view())
    expect(deleteView(USER, 'BIG FOOD')).toEqual([])
    expect(loadViews(USER)).toEqual([])
  })

  it('ignores unnamed views and survives corrupt storage', () => {
    saveView(USER, view({ name: '   ' }))
    expect(loadViews(USER)).toEqual([])
    window.localStorage.setItem('diwtkn_views_u1', '{not json')
    expect(loadViews(USER)).toEqual([])
    window.localStorage.setItem('diwtkn_views_u1', '[{"name":"ok","sort":"nonsense","filters":{"minAmount":"20"}}]')
    const [v] = loadViews(USER)
    expect(v.sort).toBe('recent') // unknown sort falls back
    expect(v.filters.minAmount).toBeNull() // a string bound is not a bound
    expect(v.filters.categories).toEqual([])
  })
})
