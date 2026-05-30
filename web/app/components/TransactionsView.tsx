'use client'

import { useEffect, useMemo, useState } from 'react'
import { getTransactions, gmailMessageUrl, type Transaction } from '../lib/api'

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

export function TransactionsView({ userId }: { userId: string }) {
  const [all, setAll] = useState<Transaction[] | null>(null)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<'recent' | 'amount'>('recent')

  useEffect(() => {
    let cancelled = false
    getTransactions(userId)
      .then(t => { if (!cancelled) setAll(t) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [userId])

  const categories = useMemo(
    () => (all ? [...new Set(all.map(t => t.category))].sort() : []),
    [all]
  )

  const rows = useMemo(() => {
    if (!all) return []
    const q = search.trim().toLowerCase()
    let list = all.filter(t => {
      if (category !== 'all' && t.category !== category) return false
      if (!q) return true
      return t.vendor.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) =>
      sort === 'amount'
        ? (b.amount ?? -1) - (a.amount ?? -1)
        : new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    return list
  }, [all, search, category, sort])

  if (error) {
    return (
      <div className="shell">
        <div className="card"><div className="empty">Could not load your records. Try again shortly.</div></div>
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
                    <a
                      className="txn-link"
                      href={gmailMessageUrl(t.emailId)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View email ↗
                    </a>
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
