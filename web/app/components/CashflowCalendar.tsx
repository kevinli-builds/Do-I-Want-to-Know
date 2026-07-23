'use client'

import { useEffect, useMemo, useState } from 'react'
import { getTransactions, type Renewal, type Transaction } from '../lib/api'
import { buildCashflowMonth, nextSevenDays, type CalendarDay } from '../lib/cashflow'
import { money } from '../lib/format'
import { fmtDate, relativeDay } from '../lib/dates'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Month-grid cashflow calendar (§9 A2): past days heat-mapped by that day's
// net spend, future days carrying predicted subscription renewals — "what
// hits next week" at a glance. Tap a day for its transactions/renewals.
export function CashflowCalendar({ userId, renewals }: { userId: string; renewals: Renewal[] }) {
  const now = new Date()
  const [txns, setTxns] = useState<Transaction[] | null>(null)
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')
  const [offset, setOffset] = useState(0) // months relative to the current one
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setState('loading')
    getTransactions(userId)
      .then(t => { if (alive) { setTxns(t); setState('done') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [userId])

  const view = useMemo(() => {
    if (!txns) return null
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return buildCashflowMonth(txns, renewals, base.getFullYear(), base.getMonth(), now)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, renewals, offset])

  const soon = useMemo(() => nextSevenDays(renewals), [renewals])

  if (state === 'error') {
    return (
      <div className="card">
        <h2>🗓 Cashflow Calendar</h2>
        <div className="empty">Couldn’t load transactions for the calendar.</div>
      </div>
    )
  }
  if (state === 'loading' || !view) {
    return (
      <div className="card">
        <h2>🗓 Cashflow Calendar</h2>
        <div className="center-spin" style={{ minHeight: 120 }}><div className="spinner" /></div>
      </div>
    )
  }

  const selectedDay: CalendarDay | null = selected
    ? view.weeks.flat().find(d => d.inMonth && d.iso === selected) ?? null
    : null

  return (
    <div className="card">
      <h2>🗓 Cashflow Calendar</h2>

      {soon.count > 0 && (
        <p className="cal-headline">
          <strong>≈ {money(soon.total)}</strong> in {soon.count} subscription renewal{soon.count === 1 ? '' : 's'} hits
          in the next 7 days.
        </p>
      )}

      <div className="cal-nav no-print">
        <button className="cal-nav-btn" onClick={() => { setOffset(o => o - 1); setSelected(null) }} aria-label="Previous month">‹</button>
        <span className="cal-label">{view.label}</span>
        <button className="cal-nav-btn" onClick={() => { setOffset(o => o + 1); setSelected(null) }} aria-label="Next month">›</button>
        {offset !== 0 && (
          <button className="link-btn cal-today-btn" onClick={() => { setOffset(0); setSelected(null) }}>today</button>
        )}
      </div>

      <div className="cal-grid cal-weekdays" aria-hidden>
        {WEEKDAYS.map((w, i) => <div key={i} className="cal-wd">{w}</div>)}
      </div>
      {view.weeks.map((week, wi) => (
        <div className="cal-grid" key={wi}>
          {week.map((d, di) => {
            if (!d.inMonth) return <div className="cal-day cal-out" key={di} />
            const cls = [
              'cal-day',
              d.refundDay ? 'cal-refund' : d.intensity > 0 ? `cal-heat-${d.intensity}` : '',
              d.isToday ? 'cal-today' : '',
              selected === d.iso ? 'cal-selected' : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={di}
                className={cls}
                onClick={() => setSelected(s => (s === d.iso ? null : d.iso))}
                title={d.spend !== 0 ? money(Math.abs(d.spend)) : undefined}
              >
                <span className="cal-num">{d.day}</span>
                {d.spend > 0 && <span className="cal-amt">{money(d.spend)}</span>}
                {d.refundDay && <span className="cal-amt">+{money(Math.abs(d.spend))}</span>}
                {d.renewals.length > 0 && (
                  <span className="cal-renew">🔁{d.renewals.length > 1 ? d.renewals.length : ''}</span>
                )}
              </button>
            )
          })}
        </div>
      ))}

      <div className="cal-legend">
        <span>less</span>
        {[1, 2, 3, 4].map(i => <span key={i} className={`cal-chip cal-heat-${i}`} />)}
        <span>more · 🔁 predicted renewal</span>
      </div>

      {selectedDay && (
        <div className="cal-detail">
          <div className="cal-detail-head">
            {fmtDate(selectedDay.iso)}
            {selectedDay.spend !== 0 && (
              <span className="cal-detail-total">
                {selectedDay.refundDay ? `+${money(Math.abs(selectedDay.spend))} net refund` : `${money(selectedDay.spend)} spent`}
              </span>
            )}
          </div>
          {selectedDay.txns.length === 0 && selectedDay.renewals.length === 0 && (
            <div className="detail-empty">{selectedDay.isFuture ? 'Nothing predicted for this day.' : 'No spend recorded this day.'}</div>
          )}
          {selectedDay.txns.map(t => (
            <div className="detail-line" key={t.id}>
              <div className="txn-desc" style={{ margin: 0 }}>
                {t.category === 'refund' ? '↩️ ' : ''}{t.vendor}
              </div>
              <div className="txn-meta">
                <span>{t.description || ''}</span>
                <span>{t.category === 'refund' ? '+' : ''}{money(Math.abs(t.amountUsd ?? 0))}</span>
              </div>
            </div>
          ))}
          {selectedDay.renewals.map((r, i) => (
            <div className="detail-line" key={`r-${i}`}>
              <div className="txn-desc" style={{ margin: 0 }}>🔁 {r.vendor}</div>
              <div className="txn-meta">
                <span>predicted {r.cadence} renewal · {relativeDay(r.date)}</span>
                <span>{r.amount != null ? money(r.amount) : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="chart-caption" style={{ textAlign: 'left', margin: '10px 0 0' }}>
        Renewal dates are predictions from each subscription’s billing history.
      </p>
    </div>
  )
}
