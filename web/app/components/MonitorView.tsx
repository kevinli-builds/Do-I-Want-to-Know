'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { getMonitor, setBudget, gmailMessageUrl, safeHref, type MonitorData, type KpiPair, type TrendChange, type SubHealth } from '../lib/api'
import { money as moneyFull, moneyWhole as money } from '../lib/format'
import { fmtDate, relativeDay } from '../lib/dates'
import { catLabel, CATEGORY_KEYS } from '../lib/categories'
import { useTxnDrilldown } from '../lib/useTxnDrilldown'
import { AnalyticsChart } from './AnalyticsChart'

// One plain-language line, e.g. "Spending grew 5% (March 2026 → April 2026): $1,200 → $1,260."
function trendSentence(c: TrendChange): string {
  if (c.deltaPct === null) return `You spent ${moneyFull(c.to)} in ${c.toLabel} — nothing in ${c.fromLabel}.`
  if (c.deltaPct === 0) return `Spending held flat at ${moneyFull(c.to)} (${c.fromLabel} → ${c.toLabel}).`
  const dir = c.deltaPct > 0 ? 'grew' : 'fell'
  return `Spending ${dir} ${Math.abs(c.deltaPct)}% (${c.fromLabel} → ${c.toLabel}): ${moneyFull(c.from)} → ${moneyFull(c.to)}.`
}

function TrendRow({ title, c }: { title: string; c: TrendChange }) {
  const cls = c.deltaPct == null ? 'delta-new' : c.deltaPct === 0 ? 'delta-flat' : c.deltaPct > 0 ? 'delta-up' : 'delta-down'
  const badge = c.deltaPct == null ? 'new' : c.deltaPct === 0 ? 'no change' : `${c.deltaPct > 0 ? '▲' : '▼'} ${Math.abs(c.deltaPct)}%`
  return (
    <div className="trend-row">
      <div className="trend-head">
        <span className="trend-title">{title}</span>
        <span className={`delta ${cls}`}>{badge}</span>
      </div>
      <p className="trend-text">{trendSentence(c)}</p>
    </div>
  )
}

// Delta badge: ▲ for increase (warm), ▼ for decrease (cool), "new" when no baseline.
function Delta({ pair }: { pair: KpiPair }) {
  if (pair.deltaPct === null) {
    return <span className="delta delta-new">{pair.value > 0 ? 'new' : '—'}</span>
  }
  if (pair.deltaPct === 0) return <span className="delta delta-flat">no change</span>
  const up = pair.deltaPct > 0
  return (
    <span className={`delta ${up ? 'delta-up' : 'delta-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(pair.deltaPct)}%
    </span>
  )
}

function Kpi({ label, pair, kind }: { label: string; pair: KpiPair; kind: 'money' | 'count' }) {
  const fmt = kind === 'money' ? money : (n: number) => n.toLocaleString('en-US')
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmt(pair.value)}</div>
      <div className="kpi-foot">
        <Delta pair={pair} />
        <span className="kpi-prev">was {fmt(pair.prev)}</span>
      </div>
    </div>
  )
}

// Dedicated "Subscription health" panel: burn-delta headline, price-step
// history (confirmed vs early), zombie subs with Unsubscribe deep-links.
// Renders nothing until there's at least one thing worth saying.
function SubHealthPanel({ health }: { health: SubHealth }) {
  const delta = health.monthlyDeltaVsYearAgo
  const hasContent = (delta != null && Math.abs(delta) >= 0.5) || health.steps.length > 0 || health.zombies.length > 0
  if (!hasContent) return null
  return (
    <div className="card">
      <h2>🩺 Subscription Health</h2>

      {delta != null && Math.abs(delta) >= 0.5 && (
        <p className={`health-headline ${delta > 0 ? 'up' : 'down'}`}>
          Price changes alone moved your monthly subscription burn{' '}
          <strong>{delta > 0 ? '+' : '−'}{moneyFull(Math.abs(delta))}/mo</strong> vs a year ago
          {delta > 0 ? ' — same subscriptions, higher bills.' : ' — your subscriptions got cheaper.'}
        </p>
      )}

      {health.steps.length > 0 && (
        <>
          <div className="sub-section-label">Price changes</div>
          {health.steps.slice(0, 6).map((s, i) => (
            <div className="row" key={`${s.vendor}-${s.atDate}-${i}`}>
              <span className="label">
                {s.pct > 0 ? '📈' : '📉'} {s.vendor}
                <span className={`health-badge ${s.confirmed ? 'confirmed' : 'early'}`}>
                  {s.confirmed ? 'confirmed' : `seen ${s.chargesAfter}×`}
                </span>
              </span>
              <span className="value">
                {moneyFull(s.from)} → {moneyFull(s.to)}
                <span className={`delta ${s.pct > 0 ? 'delta-up' : 'delta-down'}`} style={{ marginLeft: 8 }}>
                  {s.pct > 0 ? '▲' : '▼'} {Math.abs(s.pct)}%
                </span>
                <span className="health-when">{fmtDate(s.atDate)}</span>
              </span>
            </div>
          ))}
        </>
      )}

      {health.zombies.length > 0 && (
        <>
          <div className="sub-section-label">Possible zombies — paying, but hearing nothing</div>
          {health.zombies.map(z => (
            <div className="zombie-card" key={z.vendor}>
              <div className="zombie-head">
                <span className="zombie-vendor">🧟 {z.vendor}</span>
                <span className="zombie-cost">{moneyFull(z.monthlyEstimate)}/mo</span>
              </div>
              <div className="zombie-meta">
                Still billing you, but no other email from them in <strong>{z.daysQuiet} days</strong>
                {z.lastOtherActivity ? ` (last: ${fmtDate(z.lastOtherActivity)})` : ' — bills only, ever'}.
                {' '}Still using it?
              </div>
              {z.unsubscribe && (
                <a className="txn-link" href={safeHref(z.unsubscribe)} target="_blank" rel="noopener noreferrer">
                  Unsubscribe from their emails ↗
                </a>
              )}
            </div>
          ))}
          <p className="chart-caption" style={{ textAlign: 'left', margin: '8px 0 0' }}>
            “Quiet” means their emails — we can’t see whether you open the app itself.
          </p>
        </>
      )}
    </div>
  )
}

export function MonitorView({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Expandable Top-Senders drilldown — lazy-load the txn list once (like Wrapped).
  const { txns, state: txnState, open, toggle: toggleSender, retry } = useTxnDrilldown(userId)

  const load = useCallback(async (p: 'month' | 'year') => {
    setLoading(true)
    setError(false)
    try {
      setData(await getMonitor(userId, p))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Budget editor
  const [bCat, setBCat] = useState('overall')
  const [bAmt, setBAmt] = useState('')
  const [bSaving, setBSaving] = useState(false)

  async function saveBudget() {
    const amt = Number(bAmt)
    if (!Number.isFinite(amt) || amt <= 0) return
    setBSaving(true)
    try { await setBudget(userId, bCat, amt); setBAmt(''); await load(period) }
    catch { /* ignore */ }
    finally { setBSaving(false) }
  }
  async function removeBudget(category: string) {
    try { await setBudget(userId, category, 0); await load(period) } catch { /* ignore */ }
  }

  useEffect(() => { load(period) }, [load, period, refreshKey])

  if (loading) {
    return (
      <div className="shell">
        <div className="center-spin" style={{ minHeight: 240 }}>
          <div className="spinner" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="shell">
        <div className="card">
          <div className="empty">
            Couldn’t load the monitor — the server may be waking up.
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => load(period)}>Try again</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (data.empty || !data.kpis) {
    return (
      <div className="shell">
        <div className="card">
          <div className="empty">
            No data yet — hit <strong>Sync Emails</strong> on the Wrapped tab first, then your
            monitoring deck will populate.
          </div>
        </div>
      </div>
    )
  }

  const k = data.kpis
  const subs = data.subscriptions!

  // The expandable panel under a Top-Senders row: that sender's recent emails.
  function renderSenderDetail(vendor: string) {
    if (!open.has(vendor)) return null
    return (
      <div className="row-detail">
        {txnState === 'loading' && <div className="detail-spin"><div className="spinner" /></div>}
        {txnState === 'error' && (
          <div className="detail-empty">
            Couldn’t load details. <button className="link-btn" onClick={retry}>Retry</button>
          </div>
        )}
        {txnState === 'done' && txns && (() => {
          const items = txns.filter(t => t.category === 'marketing' && t.vendor === vendor)
          if (items.length === 0) return <div className="detail-empty">No recent emails found for this sender.</div>
          const first = items[0]
          const shown = items.slice(0, 8)
          return (
            <>
              {(first.senderEmail || first.unsubscribe) && (
                <div className="detail-summary">
                  {first.senderEmail ?? 'sender unknown'}
                  {first.unsubscribe && (
                    <> · <a className="txn-link" href={safeHref(first.unsubscribe)} target="_blank" rel="noopener noreferrer">Unsubscribe ↗</a></>
                  )}
                </div>
              )}
              {shown.map(t => (
                <div className="detail-line" key={t.id}>
                  <div className="txn-desc" style={{ margin: 0 }}>{t.description || '(no subject)'}</div>
                  <div className="txn-meta">
                    <span>{fmtDate(t.date)}</span>
                    <a className="txn-link" href={gmailMessageUrl(t.emailId)} target="_blank" rel="noopener noreferrer">View email ↗</a>
                  </div>
                </div>
              ))}
              {items.length > shown.length && <div className="detail-more">+ {items.length - shown.length} more</div>}
            </>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="shell monitor">
      <div className="header">
        <div>
          <h1>Monitor</h1>
          <div className="email">
            {data.email ? `${data.email} · ` : ''}
            {data.currentLabel} vs {data.previousLabel}
          </div>
        </div>
        <div className="monitor-actions no-print">
          <div className="seg">
            <button className={`seg-btn${period === 'month' ? ' active' : ''}`} onClick={() => setPeriod('month')}>
              MoM
            </button>
            <button className={`seg-btn${period === 'year' ? ' active' : ''}`} onClick={() => setPeriod('year')}>
              YoY
            </button>
          </div>
          <button className="btn btn-outline" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>

      {/* Auto-flagged changes */}
      {data.flags && data.flags.length > 0 && (
        <div className="flags">
          {data.flags.map((f, i) => (
            <span key={i} className={`flag flag-${f.kind}`}>{f.text}</span>
          ))}
        </div>
      )}

      {/* Plain-language spend trend (MoM + YoY) */}
      {data.trend && (data.trend.mom || data.trend.yoy) && (
        <div className="card">
          <h2>📈 Spending Trend</h2>
          {data.trend.mom && <TrendRow title="Month over month" c={data.trend.mom} />}
          {data.trend.yoy && <TrendRow title="Year over year" c={data.trend.yoy} />}
        </div>
      )}

      {/* KPI tiles */}
      <div className="kpi-grid">
        <Kpi label="Spend" pair={k.spend} kind="money" />
        <Kpi label="Transactions" pair={k.transactions} kind="count" />
        <Kpi label="Subscription Spend" pair={k.subscriptionSpend} kind="money" />
        <Kpi label="Promo Emails" pair={k.promoEmails} kind="count" />
        <Kpi label="Donations" pair={k.donations} kind="money" />
      </div>

      {/* Budgets (current month) */}
      <div className="card">
        <h2>🎯 Budgets <span className="sub-section-inline">this month</span></h2>
        {data.budgets && data.budgets.length > 0 ? (
          data.budgets.map(b => {
            const status = b.pct >= 100 ? 'over' : b.pct >= 85 ? 'near' : 'ok'
            return (
              <div className="budget-row" key={b.category}>
                <div className="budget-head">
                  <span className="budget-label">{b.label}</span>
                  <span className="budget-nums">
                    {moneyFull(b.spent)} / {moneyFull(b.amount)} · {b.pct}%
                    <button className="budget-remove" onClick={() => removeBudget(b.category)} title="Remove budget" aria-label="Remove budget">×</button>
                  </span>
                </div>
                <div className="budget-bar"><div className={`budget-fill ${status}`} style={{ width: `${Math.min(b.pct, 100)}%` }} /></div>
              </div>
            )
          })
        ) : (
          <p className="chart-caption" style={{ textAlign: 'left', margin: '0 0 12px' }}>
            No budgets yet — set one below to track this month’s spend and get over-budget alerts.
          </p>
        )}

        <div className="budget-editor no-print">
          <select className="audit-select" value={bCat} onChange={e => setBCat(e.target.value)}>
            <option value="overall">Overall</option>
            {CATEGORY_KEYS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
          </select>
          <input
            className="budget-input"
            type="number"
            min="0"
            inputMode="decimal"
            placeholder="$ / mo"
            value={bAmt}
            onChange={e => setBAmt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveBudget() }}
          />
          <button className="btn" onClick={saveBudget} disabled={bSaving || !bAmt}>Set</button>
        </div>
      </div>

      {/* Analytics — configurable line chart */}
      {data.analytics && <AnalyticsChart data={data.analytics} />}

      {/* Subscription monitor */}
      <div className="card">
        <h2>🔁 Subscription Monitor</h2>
        <div className="row">
          <span className="label">Active subscriptions</span>
          <span className="value">{subs.activeCount} · {moneyFull(subs.monthlyBurn)}/mo</span>
        </div>
        {subs.newlyDetected.length > 0 && (
          <div className="row">
            <span className="label">🆕 New this period</span>
            <span className="value">{subs.newlyDetected.map(n => n.vendor).join(', ')}</span>
          </div>
        )}
        {subs.priceChanges.length > 0 &&
          subs.priceChanges.map((p, i) => (
            <div className="row" key={i}>
              <span className="label">💲 {p.vendor} price change</span>
              <span className="value">{moneyFull(p.from)} → {moneyFull(p.to)}</span>
            </div>
          ))}

        {subs.renewals && subs.renewals.length > 0 && (
          <>
            <div className="sub-section-label">Renewing soon</div>
            {subs.renewals.slice(0, 8).map(r => (
              <div className="row" key={`${r.vendor}-${r.date}`}>
                <span className="label">🔁 {r.vendor}</span>
                <span className="value">
                  {relativeDay(r.date)}{r.amount != null ? ` · ${moneyFull(r.amount)}` : ''}
                </span>
              </div>
            ))}
          </>
        )}

        {subs.newlyDetected.length === 0 && subs.priceChanges.length === 0 && (!subs.renewals || subs.renewals.length === 0) && (
          <p className="chart-caption">No new subscriptions, price changes, or upcoming renewals detected.</p>
        )}
      </div>

      {/* Subscription health — price-step history, burn delta, zombie subs */}
      {subs.health && <SubHealthPanel health={subs.health} />}

      {/* Inbox-load monitor */}
      {data.topSenders && data.topSenders.length > 0 && (
        <div className="card">
          <h2>📥 Top Senders — {data.currentLabel}</h2>
          {data.topSenders.map((s, i) => {
            const diff = s.count - s.prevCount
            return (
              <Fragment key={s.vendor}>
                <div
                  className="row row-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSender(s.vendor)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSender(s.vendor) } }}
                >
                  <span className="label">
                    <span className="rank">{i + 1}</span>{s.vendor}
                    <span className="chev">{open.has(s.vendor) ? '▾' : '▸'}</span>
                  </span>
                  <span className="value">
                    {s.count}
                    {diff !== 0 && (
                      <span className={diff > 0 ? 'delta delta-up' : 'delta delta-down'} style={{ marginLeft: 8 }}>
                        {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
                      </span>
                    )}
                  </span>
                </div>
                {renderSenderDetail(s.vendor)}
              </Fragment>
            )
          })}
        </div>
      )}

      <p className="chart-caption no-print" style={{ marginTop: 18 }}>
        Tip: use 🖨 Print → “Save as PDF” to export this deck. All figures are read from saved
        data — no Claude usage.
      </p>
    </div>
  )
}
