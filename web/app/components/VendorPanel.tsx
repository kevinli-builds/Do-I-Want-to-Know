'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getTransactions, gmailMessageUrl, type Transaction } from '../lib/api'
import { buildVendorProfile } from '../lib/vendorStats'
import { catEmoji, catLabel } from '../lib/categories'
import { money, moneyWhole } from '../lib/format'
import { fmtDate, monthYear } from '../lib/dates'
import { LineChart } from './LineChart'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Axis tick for a YYYY-MM point. Past 12 months the same month name recurs, so
// carry the year — it also lands in the chart's per-point tooltip.
function monthTick(month: string, span: number): string {
  const name = MONTH_LABELS[Number(month.slice(5, 7)) - 1]
  return span > 12 ? `${name} ’${month.slice(2, 4)}` : name
}

/**
 * The button that opens the drilldown. Always visible — never hover-revealed,
 * which would make it invisible on touch screens (the bug class found across
 * the portfolio in the 2026-07-12 usability pass).
 */
export function VendorButton({ vendor, onOpen }: { vendor: string; onOpen: (v: string) => void }) {
  return (
    <button
      className="vendor-btn"
      title={`Insights for ${vendor}`}
      aria-label={`Insights for ${vendor}`}
      onClick={e => { e.stopPropagation(); onOpen(vendor) }}
    >
      📊
    </button>
  )
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="vp-fact">
      <div className="vp-fact-label">{label}</div>
      <div className="vp-fact-value">{value}</div>
      {hint && <div className="vp-fact-hint">{hint}</div>}
    </div>
  )
}

/**
 * Vendor drilldown (§9 A3) — the reader view for one vendor: how much, how
 * often, what shape, and every source email behind it. Stays mounted so the
 * transaction list is fetched once and reused across opens; renders nothing
 * while no vendor is selected.
 */
export function VendorPanel({
  userId,
  vendor,
  onClose,
  onOpenAudit,
}: {
  userId: string
  vendor: string | null
  onClose: () => void
  onOpenAudit?: () => void
}) {
  const [txns, setTxns] = useState<Transaction[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const [attempt, setAttempt] = useState(0) // bumped by "Try again"
  const started = useRef(false)

  // A different user (demo ↔ real) invalidates the cached ledger.
  useEffect(() => {
    started.current = false
    setTxns(null)
    setState('idle')
  }, [userId])

  // Fetch lazily on the first open, then reuse for every later vendor. The
  // `started` ref — not the `state` value — guards re-entry, so switching
  // vendors mid-flight can't cancel the request that's already running.
  useEffect(() => {
    if (!vendor || started.current) return
    started.current = true
    setState('loading')
    getTransactions(userId)
      .then(t => { setTxns(t); setState('done') })
      .catch(() => { started.current = false; setState('error') })
  }, [vendor, userId, attempt])

  // Close on Escape, like any modal.
  useEffect(() => {
    if (!vendor) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vendor, onClose])

  const profile = useMemo(
    () => (vendor && txns ? buildVendorProfile(txns, vendor) : null),
    [vendor, txns]
  )

  if (!vendor) return null

  const maxBucket = profile ? Math.max(1, ...profile.buckets.map(b => b.count)) : 1
  const shownRecords = profile?.recent.slice(0, 8) ?? []

  return (
    <div className="share-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="vp-modal" onClick={e => e.stopPropagation()}>
        <div className="share-head">
          <h2>{vendor}</h2>
          <button className="fab-toast-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {state === 'loading' && <div className="center-spin" style={{ minHeight: 160 }}><div className="spinner" /></div>}
        {state === 'error' && (
          <div className="empty">
            Couldn’t load this vendor’s records — the server may be waking up.
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => setAttempt(a => a + 1)}>Try again</button>
            </div>
          </div>
        )}

        {profile && profile.recordCount === 0 && (
          <div className="empty">No records from {vendor} in your ledger.</div>
        )}

        {profile && profile.recordCount > 0 && (
          <>
            {/* ── The relationship headline ─────────────────────────────── */}
            <p className="vp-headline">
              {profile.orderCount > 0 ? (
                <>
                  <strong>{profile.orderCount}</strong> purchase{profile.orderCount === 1 ? '' : 's'} ·{' '}
                  <strong>{money(profile.netSpend)}</strong>
                  {profile.first && <> since {monthYear(profile.first)}</>}
                </>
              ) : (
                <>
                  No purchases on record — just <strong>{profile.recordCount}</strong> email
                  {profile.recordCount === 1 ? '' : 's'}.
                </>
              )}
            </p>

            {profile.orderCount > 0 && (
              <div className="vp-facts">
                <Fact
                  label="Net spend"
                  value={money(profile.netSpend)}
                  hint={profile.refundTotal > 0 ? `${money(profile.totalSpend)} − ${money(profile.refundTotal)} back` : undefined}
                />
                <Fact
                  label="Typical order"
                  value={profile.avgOrder != null ? money(profile.avgOrder) : '—'}
                  hint={profile.avgOrder != null ? 'average' : undefined}
                />
                <Fact
                  label="Last purchase"
                  value={profile.daysSinceLast != null ? (profile.daysSinceLast === 0 ? 'today' : `${profile.daysSinceLast}d ago`) : '—'}
                  hint={profile.last ? fmtDate(profile.last) : undefined}
                />
                <Fact
                  label="Buying rhythm"
                  value={profile.avgGapDays != null ? `~${Math.round(profile.avgGapDays)}d` : 'one-off'}
                  hint={profile.avgGapDays != null ? 'between orders' : undefined}
                />
              </div>
            )}

            {/* ── Monthly trend ─────────────────────────────────────────── */}
            {profile.months.length > 1 && (
              <div className="vp-section">
                <div className="sub-section-label">Spending over time</div>
                <LineChart
                  labels={profile.months.map(m => monthTick(m.month, profile.months.length))}
                  series={[{ name: 'Spend', color: '#6c63ff', values: profile.months.map(m => m.spend) }]}
                  format="money"
                  height={150}
                />
                <div className="chart-caption">
                  {monthYear(`${profile.months[0].month}-01`)} → {monthYear(`${profile.months[profile.months.length - 1].month}-01`)}
                </div>
              </div>
            )}

            {/* ── Order-size distribution ───────────────────────────────── */}
            {profile.buckets.some(b => b.count > 0) && (
              <div className="vp-section">
                <div className="sub-section-label">Order sizes</div>
                {profile.buckets.map(b => (
                  <div className="vp-bucket" key={b.label}>
                    <span className="vp-bucket-label">{b.label}</span>
                    <span className="vp-bucket-bar">
                      <span className="vp-bucket-fill" style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                    </span>
                    <span className="vp-bucket-count">{b.count || ''}</span>
                  </div>
                ))}
                {profile.largest && (
                  <p className="chart-caption" style={{ textAlign: 'left', margin: '8px 0 0' }}>
                    Biggest: {money(profile.largest.amountUsd ?? 0)}
                    {profile.largest.description ? ` · ${profile.largest.description}` : ''} ·{' '}
                    {fmtDate(profile.largest.date)}
                  </p>
                )}
              </div>
            )}

            {/* ── The dry spell ─────────────────────────────────────────── */}
            {profile.longestGap && profile.longestGap.days > 0 && (
              <p className="vp-note">
                🌵 Longest gap: <strong>{profile.longestGap.days} days</strong> between{' '}
                {fmtDate(profile.longestGap.from)} and {fmtDate(profile.longestGap.to)}.
              </p>
            )}
            {profile.refundTotal > 0 && (
              <p className="vp-note vp-note-good">
                ↩️ You got <strong>{money(profile.refundTotal)}</strong> back from {vendor} across{' '}
                {profile.refunds.length} refund{profile.refunds.length === 1 ? '' : 's'}.
              </p>
            )}
            {profile.marketingCount > 0 && profile.orderCount > 0 && (
              <p className="vp-note">
                📣 They’ve also sent you <strong>{profile.marketingCount}</strong> promotional email
                {profile.marketingCount === 1 ? '' : 's'}.
              </p>
            )}

            {/* ── Category mix ──────────────────────────────────────────── */}
            {profile.categories.length > 1 && (
              <div className="vp-section">
                <div className="sub-section-label">What they send you</div>
                {profile.categories.map(c => (
                  <div className="row" key={c.category}>
                    <span className="label">{catEmoji(c.category)} {catLabel(c.category)}</span>
                    <span className="value">
                      {c.count}
                      {c.spend > 0 ? ` · ${moneyWhole(c.spend)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Provenance: the source emails ─────────────────────────── */}
            <div className="vp-section">
              <div className="sub-section-label">Records</div>
              {shownRecords.map(t => (
                <div className="detail-line" key={t.id}>
                  <div className="txn-main">
                    <span className="txn-vendor">{catEmoji(t.category)} {t.description || '(no subject)'}</span>
                    <span className="txn-amount" style={t.category === 'refund' ? { color: '#0ea5e9' } : undefined}>
                      {t.amount != null ? `${t.category === 'refund' ? '+' : ''}${money(t.amount, t.currency)}` : '—'}
                      {t.amount != null && t.currency && t.currency.toUpperCase() !== 'USD' && t.amountUsd != null && (
                        <span className="txn-usd"> ≈ {money(t.amountUsd)}</span>
                      )}
                    </span>
                  </div>
                  <div className="txn-meta">
                    <span>{fmtDate(t.date)}</span>
                    <a className="txn-link" href={gmailMessageUrl(t.emailId)} target="_blank" rel="noopener noreferrer">
                      View email ↗
                    </a>
                  </div>
                </div>
              ))}
              {profile.recent.length > shownRecords.length && (
                <div className="detail-more">
                  + {profile.recent.length - shownRecords.length} more
                  {onOpenAudit && (
                    <> · <button className="link-btn" onClick={() => { onClose(); onOpenAudit() }}>open in Audit →</button></>
                  )}
                </div>
              )}
            </div>

            <p className="chart-caption" style={{ textAlign: 'left', marginTop: 12 }}>
              Everything here is read from your own records — no comparison to anyone else. Amounts
              are converted to USD at today’s rates where the receipt was in another currency.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
