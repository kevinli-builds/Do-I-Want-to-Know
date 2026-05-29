'use client'

import { useState } from 'react'
import { syncEmails, type WrappedData } from '../lib/api'

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

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
            ? `Synced ${result.synced} new purchase${result.synced === 1 ? '' : 's'}.`
            : (result.message ?? 'You’re already up to date.'),
      })
      await onRefresh()
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Sync failed', error: true })
    } finally {
      setSyncing(false)
    }
  }

  const stats = data.stats

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
            No purchases yet. Hit <strong>Sync Emails</strong> to scan your inbox and build your
            Wrapped.
            <br />
            (The first sync can take 30–60 seconds.)
          </div>
        </div>
      ) : (
        <>
          <div className="card hero">
            <h2>Total Spend</h2>
            <div className="big">{money(stats.totalSpend)}</div>
            <div className="sub">across {data.totalEntries} tracked purchases</div>
          </div>

          <div className="grid">
            <div className="stat">
              <div className="n">{stats.subscriptionCount}</div>
              <div className="l">subscriptions</div>
            </div>
            <div className="stat">
              <div className="n">{data.totalEntries}</div>
              <div className="l">purchases tracked</div>
            </div>
          </div>

          {stats.mostExpensive && (
            <div className="card">
              <h2>Biggest Purchase</h2>
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

          {stats.topVendors.length > 0 && (
            <div className="card">
              <h2>Top Vendors</h2>
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

          {Object.keys(stats.byCategory).length > 0 && (
            <div className="card">
              <h2>By Category</h2>
              {Object.entries(stats.byCategory)
                .sort((a, b) => b[1].spend - a[1].spend)
                .map(([cat, info]) => (
                  <div className="row" key={cat}>
                    <span className="label" style={{ textTransform: 'capitalize' }}>
                      {cat}
                    </span>
                    <span className="value">
                      {info.count} · {money(info.spend)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {stats.subscriptions.length > 0 && (
            <div className="card">
              <h2>Subscriptions</h2>
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
