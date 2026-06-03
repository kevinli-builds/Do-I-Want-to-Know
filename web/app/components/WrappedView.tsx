'use client'

import { Fragment, useCallback, useState } from 'react'
import { downloadExcel, getTransactions, gmailMessageUrl, type WrappedData, type WrappedScope, type Transaction } from '../lib/api'
import { SpendChart } from './SpendChart'

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  if (!y || !mo) return m
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
const todayISO = () => new Date().toISOString().slice(0, 10)

// USD by default; pass a currency code to format a foreign amount (e.g. ¥, €).
// Falls back to USD if the code is missing/invalid so it never throws.
const money = (n: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(n)
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  }
}

// Human-friendly labels + emoji for each category
const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  order:         { label: 'Online Orders',   emoji: '📦' },
  subscription:  { label: 'Subscriptions',   emoji: '🔁' },
  travel:        { label: 'Travel',           emoji: '✈️' },
  food:          { label: 'Food & Delivery',  emoji: '🍔' },
  entertainment: { label: 'Entertainment',   emoji: '🎬' },
  charity:       { label: 'Donations',        emoji: '💝' },
  marketing:     { label: 'Marketing Email',  emoji: '📣' },
  other:         { label: 'Other',            emoji: '🧾' },
}

function categoryLabel(cat: string) {
  return CATEGORY_META[cat]?.label ?? cat.charAt(0).toUpperCase() + cat.slice(1)
}
function categoryEmoji(cat: string) {
  return CATEGORY_META[cat]?.emoji ?? '•'
}

function relativeTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function fullDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function WrappedView({
  userId,
  data,
  cachedAt,
  scopeLoading = false,
  scope,
  onScopeChange,
  onOpenUnsubscribe,
  onOpenAudit,
  onDisconnect,
}: {
  userId: string
  data: WrappedData
  cachedAt?: number | null
  scope: WrappedScope
  onScopeChange: (scope: WrappedScope) => void
  scopeLoading?: boolean
  onOpenUnsubscribe?: () => void
  onOpenAudit?: () => void
  onDisconnect?: () => void
}) {
  const stats = data.stats

  // Summary counts for the hero grid
  const marketingCount = stats?.byCategory?.marketing?.count ?? 0
  const charityCount   = stats?.charities?.length ?? 0

  // ── Scope picker (Total / Yearly / Monthly / Custom window) ────────────────
  const availableYears = data.availableYears ?? []
  const availableMonths = data.availableMonths ?? []
  const earliestMonth = availableMonths.length ? availableMonths[availableMonths.length - 1] : null
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(earliestMonth ? `${earliestMonth}-01` : '')
  const [customTo, setCustomTo] = useState(todayISO())

  const scopeLabel = () => {
    if (scope.mode === 'year') return ` · ${scope.year}`
    if (scope.mode === 'month') return ` · ${monthLabel(scope.month)}`
    if (scope.mode === 'custom') return ` · ${scope.from} → ${scope.to}`
    return ''
  }
  const segCls = (m: WrappedScope['mode']) => `seg-btn${scope.mode === m && !customOpen ? ' active' : ''}`

  // ── Expandable row details (lazy-load the full transaction list once) ──────
  const [txns, setTxns] = useState<Transaction[] | null>(null)
  const [txnState, setTxnState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const ensureTxns = useCallback(async () => {
    if (txnState === 'loading' || txnState === 'done') return
    setTxnState('loading')
    try {
      setTxns(await getTransactions(userId))
      setTxnState('done')
    } catch {
      setTxnState('error')
    }
  }, [txnState, userId])

  const toggle = useCallback((key: string) => {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    void ensureTxns()
  }, [ensureTxns])

  // Detail rows respect the active scope so they match the row's numbers.
  const inScope = (t: Transaction) => {
    const d = new Date(t.date)
    if (scope.mode === 'year') return d.getFullYear() === scope.year
    if (scope.mode === 'month') {
      const [y, m] = scope.month.split('-').map(Number)
      return d.getFullYear() === y && d.getMonth() + 1 === m
    }
    if (scope.mode === 'custom') {
      const from = new Date(scope.from)
      const to = new Date(scope.to); to.setHours(23, 59, 59, 999)
      return d >= from && d <= to
    }
    return true // total
  }

  const rowProps = (key: string) => ({
    className: 'row row-clickable',
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => toggle(key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(key) }
    },
  })

  const chev = (key: string) => <span className="chev">{open.has(key) ? '▾' : '▸'}</span>

  // Renders the expandable detail panel for a row (lazy txn list, filtered).
  function renderDetail(key: string, filterFn: (t: Transaction) => boolean, extra?: React.ReactNode) {
    if (!open.has(key)) return null
    return (
      <div className="row-detail">
        {extra}
        {txnState === 'loading' && <div className="detail-spin"><div className="spinner" /></div>}
        {txnState === 'error' && (
          <div className="detail-empty">
            Couldn’t load details. <button className="link-btn" onClick={() => { setTxnState('idle'); void ensureTxns() }}>Retry</button>
          </div>
        )}
        {txnState === 'done' && txns && (() => {
          const items = txns.filter(filterFn)
          if (items.length === 0) return <div className="detail-empty">No matching records in this view.</div>
          const total = items.reduce((sum, t) => sum + (t.amountUsd ?? 0), 0)
          const shown = items.slice(0, 8)
          return (
            <>
              <div className="detail-summary">
                {items.length} record{items.length === 1 ? '' : 's'}{total > 0 ? ` · ${money(total)} total` : ''}
              </div>
              {shown.map(t => (
                <div className="detail-line" key={t.id}>
                  <div className="txn-main">
                    <span className="txn-vendor">{t.vendor}</span>
                    <span className="txn-amount">
                      {t.amount != null ? money(t.amount, t.currency) : '—'}
                      {t.amount != null && t.currency && t.currency.toUpperCase() !== 'USD' && t.amountUsd != null && (
                        <span className="txn-usd"> ≈ {money(t.amountUsd)}</span>
                      )}
                    </span>
                  </div>
                  {t.description && <div className="txn-desc">{t.description}</div>}
                  <div className="txn-meta">
                    <span>{fullDate(t.date)} · {t.category}</span>
                    <a className="txn-link" href={gmailMessageUrl(t.emailId)} target="_blank" rel="noopener noreferrer">View email ↗</a>
                  </div>
                </div>
              ))}
              {items.length > shown.length && (
                <div className="detail-more">
                  + {items.length - shown.length} more
                  {onOpenAudit && <> · <button className="link-btn" onClick={onOpenAudit}>open in Audit →</button></>}
                </div>
              )}
            </>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="shell">
      <div className="header">
        <div>
          <h1>Your Wrapped</h1>
          {data.email && <div className="email">{data.email}</div>}
          {cachedAt && (
            <div className="email" style={{ fontSize: 12 }}>
              Saved locally · updated {relativeTime(cachedAt)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {data.totalEntries > 0 && (
            <button className="btn btn-outline" onClick={() => { downloadExcel(userId).catch(() => {}) }}>
              ⬇ Export
            </button>
          )}
          {onDisconnect && (
            <button className="btn btn-outline" onClick={onDisconnect}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {stats && (
        <div className="scope no-print">
          <div className="seg scope-seg">
            <button className={segCls('total')} disabled={scopeLoading}
              onClick={() => { setCustomOpen(false); onScopeChange({ mode: 'total' }) }}>Total</button>
            <button className={segCls('year')} disabled={scopeLoading || availableYears.length === 0}
              onClick={() => { setCustomOpen(false); onScopeChange({ mode: 'year', year: scope.mode === 'year' ? scope.year : availableYears[0] }) }}>Yearly</button>
            <button className={segCls('month')} disabled={scopeLoading || availableMonths.length === 0}
              onClick={() => { setCustomOpen(false); onScopeChange({ mode: 'month', month: scope.mode === 'month' ? scope.month : availableMonths[0] }) }}>Monthly</button>
            <button className={`seg-btn${scope.mode === 'custom' || customOpen ? ' active' : ''}`} disabled={scopeLoading}
              onClick={() => setCustomOpen(true)}>Custom</button>
          </div>

          {scope.mode === 'year' && !customOpen && (
            <div className="scope-options">
              {availableYears.map((y) => (
                <button key={y} className={`year-btn${scope.mode === 'year' && scope.year === y ? ' active' : ''}`}
                  disabled={scopeLoading} onClick={() => onScopeChange({ mode: 'year', year: y })}>{y}</button>
              ))}
            </div>
          )}

          {scope.mode === 'month' && !customOpen && (
            <div className="scope-options">
              <select className="audit-select" value={scope.month} disabled={scopeLoading}
                onChange={(e) => onScopeChange({ mode: 'month', month: e.target.value })}>
                {availableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
          )}

          {customOpen && (
            <div className="scope-options scope-custom">
              <label>From <input type="date" value={customFrom} max={customTo || todayISO()} onChange={(e) => setCustomFrom(e.target.value)} /></label>
              <label>To <input type="date" value={customTo} min={customFrom} max={todayISO()} onChange={(e) => setCustomTo(e.target.value)} /></label>
              <button className="btn btn-outline" disabled={scopeLoading || !customFrom || !customTo || customFrom > customTo}
                onClick={() => onScopeChange({ mode: 'custom', from: customFrom, to: customTo })}>Apply</button>
            </div>
          )}
        </div>
      )}

      {!stats ? (
        <div className="card">
          <div className="empty">
            No data yet. Hit <strong>Sync Emails</strong> to scan your inbox.
            <br />
            (The first sync can take 30–60 seconds.)
          </div>
        </div>
      ) : (
        <>
          {/* ── Hero: Total Spend (net of refunds) ──────────────────── */}
          <div className="card hero">
            <h2>Net Spend{scopeLabel()}</h2>
            <div className="big">{money(stats.totalSpend)}</div>
            <div className="sub">
              across {data.totalEntries} tracked emails
              {stats.refundTotal > 0 ? ` · ${money(stats.refundTotal)} refunded` : ''}
            </div>
          </div>

          {/* ── Spend Over Time chart ──────────────────────────────── */}
          <SpendChart monthlySpend={stats.monthlySpend} year={scope.mode === 'year' ? scope.year : null} />

          {/* ── Stats Grid ─────────────────────────────────────────── */}
          <div className="grid">
            <div className="stat">
              <div className="n">{stats.subscriptionCount}</div>
              <div className="l">subscriptions</div>
            </div>
            <div className="stat">
              <div className="n">{marketingCount}</div>
              <div className="l">promo emails</div>
            </div>
            {stats.charityTotal > 0 && (
              <div className="stat">
                <div className="n">{money(stats.charityTotal)}</div>
                <div className="l">donated</div>
              </div>
            )}
            {charityCount > 0 && (
              <div className="stat">
                <div className="n">{charityCount}</div>
                <div className="l">cause{charityCount === 1 ? '' : 's'} supported</div>
              </div>
            )}
            {stats.refundTotal > 0 && (
              <div className="stat">
                <div className="n" style={{ color: '#0ea5e9' }}>−{money(stats.refundTotal)}</div>
                <div className="l">refunded</div>
              </div>
            )}
          </div>

          {/* ── Biggest Purchase ───────────────────────────────────── */}
          {stats.mostExpensive && (
            <div className="card">
              <h2>💸 Biggest Purchase</h2>
              <div className="row">
                <span className="label">{stats.mostExpensive.vendor}</span>
                <span className="value">
                  {stats.mostExpensive.amount != null ? money(stats.mostExpensive.amount) : '—'}
                </span>
              </div>
              <div className="email" style={{ marginTop: 6 }}>
                {stats.mostExpensive.description}
              </div>
              {stats.mostExpensive.termMonths && stats.mostExpensive.termMonths > 1 && stats.mostExpensive.amount != null && (
                <div className="txn-term" style={{ marginTop: 6 }}>
                  🗓 Covers {stats.mostExpensive.termMonths} months · ≈ {money(stats.mostExpensive.amount / stats.mostExpensive.termMonths)}/mo
                </div>
              )}
              {stats.mostExpensive.emailId && (
                <a
                  className="txn-link"
                  style={{ display: 'inline-block', marginTop: 10 }}
                  href={gmailMessageUrl(stats.mostExpensive.emailId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View email ↗
                </a>
              )}
            </div>
          )}

          {/* ── Top Purchase Vendors ───────────────────────────────── */}
          {stats.topVendors.length > 0 && (
            <div className="card">
              <h2>🏆 Top Vendors</h2>
              {stats.topVendors.map((v, i) => {
                const key = `vendor:${v.vendor}`
                return (
                  <Fragment key={v.vendor}>
                    <div {...rowProps(key)}>
                      <span className="label">
                        <span className="rank">{i + 1}</span>
                        {v.vendor}{chev(key)}
                      </span>
                      <span className="value">
                        {v.count} order{v.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    {renderDetail(key, t => inScope(t) && t.vendor === v.vendor && t.category !== 'marketing')}
                  </Fragment>
                )
              })}
            </div>
          )}

          {/* ── Who Spams You Most (manage in Unsubscribe tab) ─────── */}
          {stats.topSpammers.length > 0 && (
            <div className="card">
              <h2>📬 Who Emails You Most</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
                Your top promotional senders
              </p>
              {stats.topSpammers.slice(0, 5).map((s, i) => {
                const key = `spam:${s.vendor}`
                const extra = (
                  <div className="detail-summary">
                    {s.senderEmail ?? 'sender unknown'}
                    {s.unsubscribe && (
                      <> · <a className="txn-link" href={s.unsubscribe} target="_blank" rel="noopener noreferrer">Unsubscribe ↗</a></>
                    )}
                  </div>
                )
                return (
                  <Fragment key={s.vendor}>
                    <div {...rowProps(key)}>
                      <span className="label">
                        <span className="rank">{i + 1}</span>
                        {s.vendor}{chev(key)}
                      </span>
                      <span className="value">
                        {s.count} email{s.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    {renderDetail(key, t => inScope(t) && t.vendor === s.vendor && t.category === 'marketing', extra)}
                  </Fragment>
                )
              })}
              {onOpenUnsubscribe && (
                <button className="btn btn-outline" style={{ marginTop: 14 }} onClick={onOpenUnsubscribe}>
                  Manage &amp; unsubscribe →
                </button>
              )}
            </div>
          )}

          {/* ── Charity / Donations ────────────────────────────────── */}
          {stats.charities.length > 0 && (
            <div className="card">
              <h2>💝 Charity & Donations</h2>
              {stats.charityTotal > 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
                  {money(stats.charityTotal)} donated across {stats.charities.length} cause{stats.charities.length === 1 ? '' : 's'}
                </p>
              )}
              {stats.charities.map((c) => {
                const key = `charity:${c.vendor}`
                return (
                  <Fragment key={c.vendor}>
                    <div {...rowProps(key)}>
                      <span className="label">{c.vendor}{chev(key)}</span>
                      <span className="value">
                        {c.total > 0 ? money(c.total) : `${c.count} email${c.count === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    {renderDetail(key, t => inScope(t) && t.vendor === c.vendor && t.category === 'charity')}
                  </Fragment>
                )
              })}
            </div>
          )}

          {/* ── Category Breakdown ─────────────────────────────────── */}
          {Object.keys(stats.byCategory).length > 0 && (
            <div className="card">
              <h2>📊 By Category</h2>
              {Object.entries(stats.byCategory)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([cat, info]) => {
                  const key = `cat:${cat}`
                  return (
                    <Fragment key={cat}>
                      <div {...rowProps(key)}>
                        <span className="label">
                          {categoryEmoji(cat)} {categoryLabel(cat)}{chev(key)}
                        </span>
                        <span className="value" style={cat === 'refund' ? { color: '#0ea5e9' } : undefined}>
                          {info.count}
                          {info.spend > 0 ? ` · ${cat === 'refund' ? '−' : ''}${money(info.spend)}` : ''}
                        </span>
                      </div>
                      {renderDetail(key, t => inScope(t) && t.category === cat)}
                    </Fragment>
                  )
                })}
            </div>
          )}

          {/* ── Subscription Radar ─────────────────────────────────── */}
          {stats.subscriptionInsights && stats.subscriptionInsights.length > 0 ? (
            <div className="card">
              <h2>🔁 Subscription Radar</h2>
              {stats.monthlySubscriptionCost > 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
                  ~{money(stats.monthlySubscriptionCost)}/mo · ~{money(stats.annualSubscriptionCost)}/yr
                  in active subscriptions
                </p>
              )}
              {stats.subscriptionInsights.map((s) => {
                const key = `sub:${s.vendor}`
                return (
                  <Fragment key={s.vendor}>
                    <div {...rowProps(key)}>
                      <span className="label" style={{ opacity: s.active ? 1 : 0.5 }}>
                        {s.vendor}{chev(key)}
                        <span className="sub-meta">
                          {s.cadence}
                          {!s.active
                            ? ' · no recent charge'
                            : s.lastCharge
                              ? ` · last ${shortDate(s.lastCharge)}`
                              : ''}
                        </span>
                      </span>
                      <span className="value">
                        {s.monthlyEstimate > 0 ? `${money(s.monthlyEstimate)}/mo` : '—'}
                      </span>
                    </div>
                    {renderDetail(key, t => inScope(t) && t.vendor === s.vendor && t.category === 'subscription')}
                  </Fragment>
                )
              })}
              <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 12 }}>
                Estimates inferred from email receipts — costs normalized to a monthly figure.
              </p>
            </div>
          ) : stats.subscriptions.length > 0 ? (
            <div className="card">
              <h2>🔁 Subscriptions</h2>
              <div>
                {stats.subscriptions.map((s) => (
                  <span className="pill" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
