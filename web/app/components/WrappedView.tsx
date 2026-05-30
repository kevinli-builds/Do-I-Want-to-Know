'use client'

import { useState } from 'react'
import { syncEmails, type WrappedData } from '../lib/api'

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

export function WrappedView({
  userId,
  data,
  onRefresh,
}: {
  userId: string
  data: WrappedData
  onRefresh: () => Promise<void>
}) {
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setNotice(null)
    try {
      const result = await syncEmails(userId)
      setNotice({
        text:
          result.synced > 0
            ? `Synced ${result.synced} new email${result.synced === 1 ? '' : 's'}.`
            : (result.message ?? "You're already up to date."),
      })
      await onRefresh()
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Sync failed', error: true })
    } finally {
      setSyncing(false)
    }
  }

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
        </div>
        <button className="btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Emails'}
        </button>
      </div>

      {notice && <div className={`notice${notice.error ? ' error' : ''}`}>{notice.text}</div>}

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
          {/* ── Hero: Total Spend ───────────────────────────────────── */}
          <div className="card hero">
            <h2>Total Spend</h2>
            <div className="big">{money(stats.totalSpend)}</div>
            <div className="sub">across {data.totalEntries} tracked emails</div>
          </div>

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

          {/* ── Who Spams You Most ─────────────────────────────────── */}
          {stats.topSpammers.length > 0 && (
            <div className="card">
              <h2>📬 Who Emails You Most</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
                Brands sending you the most promotional email
              </p>
              {stats.topSpammers.map((s, i) => (
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
                    <span className="value">
                      {info.count}{info.spend > 0 ? ` · ${money(info.spend)}` : ''}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* ── Subscriptions ──────────────────────────────────────── */}
          {stats.subscriptions.length > 0 && (
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
          )}
        </>
      )}
    </div>
  )
}
