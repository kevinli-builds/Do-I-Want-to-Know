'use client'

import { useCallback, useEffect, useState } from 'react'
import { getMonitor, type MonitorData, type KpiPair } from '../lib/api'
import { AnalyticsChart } from './AnalyticsChart'

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const moneyFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

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

export function MonitorView({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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

      {/* KPI tiles */}
      <div className="kpi-grid">
        <Kpi label="Spend" pair={k.spend} kind="money" />
        <Kpi label="Transactions" pair={k.transactions} kind="count" />
        <Kpi label="Subscription Spend" pair={k.subscriptionSpend} kind="money" />
        <Kpi label="Promo Emails" pair={k.promoEmails} kind="count" />
        <Kpi label="Donations" pair={k.donations} kind="money" />
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
        {subs.newlyDetected.length === 0 && subs.priceChanges.length === 0 && (
          <p className="chart-caption">No new subscriptions or price changes detected.</p>
        )}
      </div>

      {/* Inbox-load monitor */}
      {data.topSenders && data.topSenders.length > 0 && (
        <div className="card">
          <h2>📥 Top Senders — {data.currentLabel}</h2>
          {data.topSenders.map((s, i) => {
            const diff = s.count - s.prevCount
            return (
              <div className="row" key={s.vendor}>
                <span className="label"><span className="rank">{i + 1}</span>{s.vendor}</span>
                <span className="value">
                  {s.count}
                  {diff !== 0 && (
                    <span className={diff > 0 ? 'delta delta-up' : 'delta delta-down'} style={{ marginLeft: 8 }}>
                      {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
                    </span>
                  )}
                </span>
              </div>
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
