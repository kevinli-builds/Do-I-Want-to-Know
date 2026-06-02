'use client'

import { downloadExcel, gmailMessageUrl, type WrappedData } from '../lib/api'
import { SpendChart } from './SpendChart'

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

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

export function WrappedView({
  userId,
  data,
  cachedAt,
  selectedYear,
  onSelectYear,
  yearLoading = false,
  onOpenUnsubscribe,
  onDisconnect,
}: {
  userId: string
  data: WrappedData
  cachedAt?: number | null
  selectedYear: number | null
  onSelectYear: (year: number | null) => void
  yearLoading?: boolean
  onOpenUnsubscribe?: () => void
  onDisconnect?: () => void
}) {
  const stats = data.stats

  // Summary counts for the hero grid
  const marketingCount = stats?.byCategory?.marketing?.count ?? 0
  const charityCount   = stats?.charities?.length ?? 0

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

      {(data.availableYears?.length ?? 0) > 1 && (
        <div className="year-toggle">
          <button
            className={`year-btn${selectedYear === null ? ' active' : ''}`}
            onClick={() => onSelectYear(null)}
            disabled={yearLoading}
          >
            All time
          </button>
          {data.availableYears.map((y) => (
            <button
              key={y}
              className={`year-btn${selectedYear === y ? ' active' : ''}`}
              onClick={() => onSelectYear(y)}
              disabled={yearLoading}
            >
              {y}
            </button>
          ))}
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
            <h2>Net Spend{selectedYear ? ` · ${selectedYear}` : ''}</h2>
            <div className="big">{money(stats.totalSpend)}</div>
            <div className="sub">
              across {data.totalEntries} tracked emails
              {stats.refundTotal > 0 ? ` · ${money(stats.refundTotal)} refunded` : ''}
            </div>
          </div>

          {/* ── Spend Over Time chart ──────────────────────────────── */}
          <SpendChart monthlySpend={stats.monthlySpend} year={selectedYear} />

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
              {stats.topVendors.map((v, i) => (
                <div className="row" key={v.vendor}>
                  <span className="label">
                    <span className="rank">{i + 1}</span>
                    {v.vendor}
                  </span>
                  <span className="value">
                    {v.count} order{v.count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Who Spams You Most (manage in Unsubscribe tab) ─────── */}
          {stats.topSpammers.length > 0 && (
            <div className="card">
              <h2>📬 Who Emails You Most</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
                Your top promotional senders
              </p>
              {stats.topSpammers.slice(0, 5).map((s, i) => (
                <div className="row" key={s.vendor}>
                  <span className="label">
                    <span className="rank">{i + 1}</span>
                    {s.vendor}
                  </span>
                  <span className="value">
                    {s.count} email{s.count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
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
              {stats.charities.map((c) => (
                <div className="row" key={c.vendor}>
                  <span className="label">{c.vendor}</span>
                  <span className="value">
                    {c.total > 0 ? money(c.total) : `${c.count} email${c.count === 1 ? '' : 's'}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Category Breakdown ─────────────────────────────────── */}
          {Object.keys(stats.byCategory).length > 0 && (
            <div className="card">
              <h2>📊 By Category</h2>
              {Object.entries(stats.byCategory)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([cat, info]) => (
                  <div className="row" key={cat}>
                    <span className="label">
                      {categoryEmoji(cat)} {categoryLabel(cat)}
                    </span>
                    <span className="value" style={cat === 'refund' ? { color: '#0ea5e9' } : undefined}>
                      {info.count}
                      {info.spend > 0 ? ` · ${cat === 'refund' ? '−' : ''}${money(info.spend)}` : ''}
                    </span>
                  </div>
                ))}
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
              {stats.subscriptionInsights.map((s) => (
                <div className="row" key={s.vendor}>
                  <span className="label" style={{ opacity: s.active ? 1 : 0.5 }}>
                    {s.vendor}
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
              ))}
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
