'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getTransactions, gmailMessageUrl, getAcceptances, setAcceptance, type Transaction } from '../lib/api'

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const CATEGORY_EMOJI: Record<string, string> = {
  order: '📦', subscription: '🔁', travel: '✈️', food: '🍔',
  entertainment: '🎬', charity: '💝', marketing: '📣', other: '🧾',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function TransactionsView({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const [all, setAll] = useState<Transaction[] | null>(null)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<'recent' | 'amount'>('recent')
  const [hideAccepted, setHideAccepted] = useState(false)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

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

  const categories = useMemo(
    () => (all ? [...new Set(all.map(t => t.category))].sort() : []),
    [all]
  )

  const rows = useMemo(() => {
    if (!all) return []
    const q = search.trim().toLowerCase()
    let list = all.filter(t => {
      if (category !== 'all' && t.category !== category) return false
      if (hideAccepted && accepted.has(t.vendor)) return false
      if (!q) return true
      return t.vendor.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) =>
      sort === 'amount'
        ? (b.amount ?? -1) - (a.amount ?? -1)
        : new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    return list
  }, [all, search, category, sort, hideAccepted, accepted])

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
          <div className="email">{all.length} records · click any to open its source email</div>
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
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="audit-select" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{CATEGORY_EMOJI[c] ?? '•'} {c}</option>
              ))}
            </select>
            <select className="audit-select" value={sort} onChange={e => setSort(e.target.value as 'recent' | 'amount')}>
              <option value="recent">Most recent</option>
              <option value="amount">Highest amount</option>
            </select>
            <label className="unsub-toggle">
              <input type="checkbox" checked={hideAccepted} onChange={e => setHideAccepted(e.target.checked)} />
              Hide accepted
            </label>
          </div>

          <div className="card" style={{ padding: 8 }}>
            {rows.length === 0 ? (
              <div className="empty">No records match your filters.</div>
            ) : (
              rows.map(t => (
                <div className="txn" key={t.id}>
                  <div className="txn-main">
                    <span className="txn-vendor">
                      {CATEGORY_EMOJI[t.category] ?? '•'} {t.vendor}
                    </span>
                    <span className="txn-amount">{t.amount != null ? money(t.amount) : '—'}</span>
                  </div>
                  <div className="txn-desc">{t.description}</div>
                  {t.termMonths && t.termMonths > 1 && t.amount != null && (
                    <div className="txn-term">
                      🗓 Covers {t.termMonths} months · ≈ {money(t.amount / t.termMonths)}/mo
                    </div>
                  )}
                  <div className="txn-meta">
                    <span>{fmtDate(t.date)} · {t.category}</span>
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
