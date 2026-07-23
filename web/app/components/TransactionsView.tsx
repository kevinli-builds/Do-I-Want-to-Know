'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTransactions, gmailMessageUrl, getAcceptances, setAcceptance, updateTransaction, deleteTransaction, renameVendorAll, type Transaction } from '../lib/api'
import { catEmoji, catLabel, CATEGORY_KEYS } from '../lib/categories'
import { money } from '../lib/format'
import { fmtDate } from '../lib/dates'
import {
  EMPTY_FILTERS, SORT_LABELS, deleteView, filterTxns, isFiltered, loadViews, saveView,
  sortTxns, summarize, toCsv, type LedgerFilters, type SavedView, type SortKey,
} from '../lib/ledgerFilter'
import { VendorButton } from './VendorPanel'

export function TransactionsView({ userId, refreshKey = 0, onChanged, onOpenVendor }: { userId: string; refreshKey?: number; onChanged?: () => void; onOpenVendor?: (v: string) => void }) {
  const [all, setAll] = useState<Transaction[] | null>(null)
  const [error, setError] = useState(false)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  // ── Ledger workbench (§9 A7): filters, sort, saved views ──────────────────
  const [filters, setFilters] = useState<LedgerFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortKey>('recent')
  const [showFilters, setShowFilters] = useState(false)
  const [views, setViews] = useState<SavedView[]>([])
  const [viewName, setViewName] = useState('')

  useEffect(() => { setViews(loadViews(userId)) }, [userId])

  const patch = (p: Partial<LedgerFilters>) => setFilters(f => ({ ...f, ...p }))

  function toggleCategory(cat: string) {
    setFilters(f => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter(c => c !== cat) : [...f.categories, cat],
    }))
  }

  // Blank input → no bound (not 0), so clearing a box widens the result again.
  function amountBound(raw: string): number | null {
    const n = Number(raw)
    return raw.trim() === '' || !Number.isFinite(n) ? null : n
  }

  function applyView(v: SavedView) {
    setFilters(v.filters)
    setSort(v.sort)
    setShowFilters(true)
  }
  function storeView() {
    const name = viewName.trim()
    if (!name) return
    setViews(saveView(userId, { name, filters, sort }))
    setViewName('')
  }
  function dropView(name: string) {
    setViews(deleteView(userId, name))
  }

  const load = useCallback(async () => {
    setError(false)
    setAll(null)
    try {
      setAll(await getTransactions(userId))
    } catch {
      setError(true)
    }
  }, [userId])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    getAcceptances(userId).then(v => setAccepted(new Set(v))).catch(() => {})
  }, [userId, refreshKey])

  async function toggleAccept(vendor: string) {
    const was = accepted.has(vendor)
    setAccepted(prev => { const n = new Set(prev); was ? n.delete(vendor) : n.add(vendor); return n })
    try {
      const vendors = await setAcceptance(userId, vendor, !was)
      setAccepted(new Set(vendors))
    } catch {
      setAccepted(prev => { const n = new Set(prev); was ? n.add(vendor) : n.delete(vendor); return n }) // revert
    }
  }

  // Apply a local edit optimistically; persist via apiCall; revert the list if
  // it fails. onChanged + onOk run only on success.
  async function optimisticEdit(
    mutate: (list: Transaction[]) => Transaction[],
    apiCall: () => Promise<unknown>,
    onOk?: () => void,
  ) {
    const snapshot = all
    setAll(list => (list ? mutate(list) : list))
    try {
      await apiCall()
      onChanged?.()   // let other views (Wrapped totals etc.) pick up the change
      onOk?.()
    } catch {
      setAll(snapshot) // revert
    }
  }

  // Inline category correction.
  function changeCategory(id: string, newCat: string) {
    return optimisticEdit(
      list => list.map(t => (t.id === id ? { ...t, category: newCat, categoryLocked: true } : t)),
      () => updateTransaction(userId, id, { category: newCat }),
    )
  }

  // Inline vendor rename — click ✏️, edit, Enter/blur to save, Esc to cancel.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const skipBlur = useRef(false)
  // After a single rename, offer to apply it to the vendor's other rows.
  const [bulkPrompt, setBulkPrompt] = useState<{ from: string; to: string; count: number } | null>(null)

  function startEditVendor(id: string, current: string) {
    skipBlur.current = false
    setEditingId(id)
    setDraft(current)
  }
  function cancelEditVendor() {
    skipBlur.current = true   // suppress the save that the input's blur would trigger
    setEditingId(null)
  }
  function saveVendor(id: string) {
    if (skipBlur.current) { skipBlur.current = false; return }
    const v = draft.trim()
    const old = all?.find(t => t.id === id)?.vendor
    setEditingId(null)
    if (!v || v === old) return // no-op on empty/unchanged
    const others = all?.filter(t => t.vendor === old && t.id !== id).length ?? 0
    return optimisticEdit(
      list => list.map(t => (t.id === id ? { ...t, vendor: v } : t)),
      () => updateTransaction(userId, id, { vendor: v }),
      () => { if (old && others > 0) setBulkPrompt({ from: old, to: v, count: others }) },
    )
  }

  // Remove a wrongly-extracted record. Confirm first — this is the one
  // destructive action in the list, and it won't reappear on the next sync.
  function removeTxn(t: Transaction) {
    if (!window.confirm(`Remove the ${t.vendor} record? It won't come back on the next sync.`)) return
    return optimisticEdit(
      list => list.filter(x => x.id !== t.id),
      () => deleteTransaction(userId, t.id),
    )
  }

  function applyBulkRename() {
    if (!bulkPrompt) return
    const { from, to } = bulkPrompt
    setBulkPrompt(null)
    return optimisticEdit(
      list => list.map(t => (t.vendor === from ? { ...t, vendor: to } : t)),
      () => renameVendorAll(userId, from, to),
    )
  }

  // Categories actually present, in the app's canonical order (not alphabetical).
  const categories = useMemo(() => {
    if (!all) return []
    const present = new Set(all.map(t => t.category))
    return CATEGORY_KEYS.filter(c => present.has(c))
  }, [all])

  const rows = useMemo(
    () => (all ? sortTxns(filterTxns(all, filters, accepted), sort) : []),
    [all, filters, sort, accepted]
  )
  const summary = useMemo(() => summarize(rows), [rows])
  const narrowed = isFiltered(filters)

  // CSV of exactly what's on screen — the filtered, sorted set. The xlsx
  // Export button on Wrapped stays the full-ledger download.
  function downloadCsv() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diwtkn-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <div className="shell">
        <div className="card">
          <div className="empty">
            Couldn’t load your records — the server may be waking up.
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => load()}>Try again</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!all) {
    return (
      <div className="shell">
        <div className="center-spin" style={{ minHeight: 240 }}><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="shell">
      <div className="header">
        <div>
          <h1>Audit</h1>
          <div className="email">Filter, sort, and export your ledger · every row links to its source email</div>
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card">
          <div className="empty">
            No records yet — hit <strong>Sync Emails</strong> on the Wrapped tab first.
          </div>
        </div>
      ) : (
        <>
          <div className="audit-controls">
            <input
              className="audit-search"
              placeholder="Search vendor or description…"
              value={filters.text}
              onChange={e => patch({ text: e.target.value })}
            />
            <select className="audit-select" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
              {Object.entries(SORT_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <button
              className={`audit-filter-btn${showFilters ? ' on' : ''}`}
              onClick={() => setShowFilters(s => !s)}
              aria-expanded={showFilters}
            >
              ⚙ Filters{narrowed ? ' ·' : ''}
              {narrowed && <span className="audit-filter-dot" aria-label="filters active" />}
            </button>
            <button className="audit-filter-btn" onClick={downloadCsv} disabled={rows.length === 0}>
              ⬇ CSV
            </button>
          </div>

          {showFilters && (
            <div className="audit-filters">
              <div className="af-group">
                <div className="af-label">Categories</div>
                <div className="af-chips">
                  {categories.map(c => (
                    <button
                      key={c}
                      className={`af-chip${filters.categories.includes(c) ? ' on' : ''}`}
                      onClick={() => toggleCategory(c)}
                      aria-pressed={filters.categories.includes(c)}
                    >
                      {catEmoji(c)} {catLabel(c)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="af-row">
                <div className="af-group">
                  <div className="af-label">Amount (USD)</div>
                  <div className="af-pair">
                    <input
                      className="af-input" type="number" inputMode="decimal" min="0" placeholder="min"
                      value={filters.minAmount ?? ''}
                      onChange={e => patch({ minAmount: amountBound(e.target.value) })}
                    />
                    <span className="af-dash">–</span>
                    <input
                      className="af-input" type="number" inputMode="decimal" min="0" placeholder="max"
                      value={filters.maxAmount ?? ''}
                      onChange={e => patch({ maxAmount: amountBound(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="af-group">
                  <div className="af-label">Date range</div>
                  <div className="af-pair">
                    <input
                      className="af-input af-date" type="date"
                      value={filters.from ?? ''}
                      onChange={e => patch({ from: e.target.value || null })}
                    />
                    <span className="af-dash">–</span>
                    <input
                      className="af-input af-date" type="date"
                      value={filters.to ?? ''}
                      onChange={e => patch({ to: e.target.value || null })}
                    />
                  </div>
                </div>
              </div>

              <label className="unsub-toggle">
                <input
                  type="checkbox"
                  checked={filters.hideAccepted}
                  onChange={e => patch({ hideAccepted: e.target.checked })}
                />
                Hide accepted vendors
              </label>

              <div className="af-group">
                <div className="af-label">Saved views</div>
                {views.length > 0 && (
                  <div className="af-chips">
                    {views.map(v => (
                      <span className="af-view" key={v.name}>
                        <button className="af-view-apply" onClick={() => applyView(v)}>{v.name}</button>
                        <button className="af-view-x" onClick={() => dropView(v.name)} aria-label={`Delete view ${v.name}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="af-pair">
                  <input
                    className="af-input af-view-name"
                    placeholder="Name this view…"
                    value={viewName}
                    onChange={e => setViewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); storeView() } }}
                  />
                  <button className="audit-filter-btn" onClick={storeView} disabled={!viewName.trim()}>Save</button>
                </div>
                <p className="af-hint">Saved on this device — a view stores the filters, not the records.</p>
              </div>
            </div>
          )}

          <div className="audit-summary">
            <span>
              {narrowed ? <>Showing <strong>{summary.count}</strong> of {all.length}</> : <><strong>{summary.count}</strong> records</>}
              {' · '}{summary.vendors} vendor{summary.vendors === 1 ? '' : 's'}
              {summary.spend > 0 && <> · {money(summary.net)} net</>}
              {summary.refunds > 0 && <> ({money(summary.refunds)} refunded)</>}
            </span>
            {narrowed && (
              <button className="link-btn" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
            )}
          </div>

          {bulkPrompt && (
            <div className="bulk-rename-bar">
              <span>
                Rename the {bulkPrompt.count} other “{bulkPrompt.from}” record{bulkPrompt.count === 1 ? '' : 's'} to “{bulkPrompt.to}” too?
              </span>
              <span className="bulk-rename-actions">
                <button className="btn" onClick={applyBulkRename}>Apply to all</button>
                <button className="link-btn" onClick={() => setBulkPrompt(null)}>Dismiss</button>
              </span>
            </div>
          )}

          <div className="card" style={{ padding: 8 }}>
            {rows.length === 0 ? (
              <div className="empty">No records match your filters.</div>
            ) : (
              rows.map(t => (
                <div className="txn" key={t.id}>
                  <div className="txn-main">
                    <span className="txn-vendor">
                      {catEmoji(t.category)}{' '}
                      {editingId === t.id ? (
                        <input
                          className="vendor-input"
                          value={draft}
                          autoFocus
                          onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); saveVendor(t.id) }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelEditVendor() }
                          }}
                          onBlur={() => saveVendor(t.id)}
                        />
                      ) : (
                        <>
                          {t.vendor}
                          <button className="vendor-edit-btn" onClick={() => startEditVendor(t.id, t.vendor)} title="Rename vendor">✏️</button>
                          {onOpenVendor && <VendorButton vendor={t.vendor} onOpen={onOpenVendor} />}
                        </>
                      )}
                    </span>
                    <span className="txn-amount" style={t.category === 'refund' ? { color: '#0ea5e9' } : undefined}>
                      {t.amount != null
                        ? `${t.category === 'refund' ? '+' : ''}${money(t.amount, t.currency)}`
                        : '—'}
                      {t.amount != null && t.currency && t.currency.toUpperCase() !== 'USD' && t.amountUsd != null && (
                        <span className="txn-usd"> ≈ {money(t.amountUsd)}</span>
                      )}
                    </span>
                  </div>
                  <div className="txn-desc">{t.description}</div>
                  {t.termMonths && t.termMonths > 1 && t.amount != null && (
                    <div className="txn-term">
                      🗓 Covers {t.termMonths} months · ≈ {money(t.amount / t.termMonths)}/mo
                    </div>
                  )}
                  <div className="txn-meta">
                    <span className="txn-cat-edit">
                      {fmtDate(t.date)} ·{' '}
                      <select
                        className="cat-select"
                        value={t.category}
                        onChange={e => changeCategory(t.id, e.target.value)}
                        title="Change category"
                      >
                        {CATEGORY_KEYS.map(c => (
                          <option key={c} value={c}>{catEmoji(c)} {catLabel(c)}</option>
                        ))}
                      </select>
                      {t.categoryLocked && <span className="cat-edited" title="Manually corrected">✎</span>}
                    </span>
                    <span className="txn-meta-actions">
                      <button
                        className={`accept-btn${accepted.has(t.vendor) ? ' on' : ''}`}
                        onClick={() => toggleAccept(t.vendor)}
                        title="Mark this vendor as Accepted"
                      >
                        {accepted.has(t.vendor) ? '✓ Accepted' : 'Accept'}
                      </button>
                      <a
                        className="txn-link"
                        href={gmailMessageUrl(t.emailId)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View email ↗
                      </a>
                      <button className="txn-remove-btn" onClick={() => removeTxn(t)} title="Remove this record">
                        Remove
                      </button>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="chart-caption" style={{ marginTop: 14 }}>
            “View email” opens the exact Gmail message this record was extracted from. If a figure
            looks wrong, that’s the source of truth.
          </p>
        </>
      )}
    </div>
  )
}
