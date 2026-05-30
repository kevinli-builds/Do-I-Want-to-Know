'use client'

import { useEffect, useMemo, useState } from 'react'
import { getTransactions, type Transaction } from '../lib/api'

interface Sender {
  vendor: string
  count: number
  senderEmail: string | null
  unsubscribe: string | null
}

function gmailSearchUrl(email: string): string {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:(${email})`)}`
}

const doneKey = (userId: string) => `diwtkn_unsub_done_${userId}`
function loadDone(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(window.localStorage.getItem(doneKey(userId)) || '[]'))
  } catch {
    return new Set()
  }
}
function persistDone(userId: string, set: Set<string>) {
  try {
    window.localStorage.setItem(doneKey(userId), JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

export function UnsubscribeView({ userId }: { userId: string }) {
  const [all, setAll] = useState<Transaction[] | null>(null)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())

  useEffect(() => { setDone(loadDone(userId)) }, [userId])
  useEffect(() => {
    let cancelled = false
    getTransactions(userId)
      .then(t => { if (!cancelled) setAll(t) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [userId])

  const senders = useMemo<Sender[]>(() => {
    if (!all) return []
    const map: Record<string, Sender> = {}
    for (const t of all) {
      if (t.category !== 'marketing') continue
      if (!map[t.vendor]) {
        map[t.vendor] = { vendor: t.vendor, count: 0, senderEmail: t.senderEmail, unsubscribe: t.unsubscribe }
      }
      const s = map[t.vendor]
      s.count++
      if (!s.senderEmail && t.senderEmail) s.senderEmail = t.senderEmail
      if (!s.unsubscribe && t.unsubscribe) s.unsubscribe = t.unsubscribe
    }
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [all])

  const totalPromo = useMemo(() => senders.reduce((s, x) => s + x.count, 0), [senders])
  const missingLinks = useMemo(() => senders.filter(s => !s.unsubscribe).length, [senders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return senders.filter(s => {
      if (hideDone && done.has(s.vendor)) return false
      if (!q) return true
      return s.vendor.toLowerCase().includes(q) || (s.senderEmail ?? '').toLowerCase().includes(q)
    })
  }, [senders, search, hideDone, done])

  function toggleDone(vendor: string) {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(vendor)) next.delete(vendor)
      else next.add(vendor)
      persistDone(userId, next)
      return next
    })
  }

  if (error) {
    return (
      <div className="shell">
        <div className="card"><div className="empty">Could not load your senders. Try again shortly.</div></div>
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
          <h1>Unsubscribe</h1>
          <div className="email">Tidy up your inbox — manage promotional senders</div>
        </div>
      </div>

      {senders.length === 0 ? (
        <div className="card">
          <div className="empty">
            No promotional senders found yet. Hit <strong>Sync Emails</strong> on the Wrapped tab to
            scan your inbox.
          </div>
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat"><div className="n">{senders.length}</div><div className="l">senders</div></div>
            <div className="stat"><div className="n">{totalPromo}</div><div className="l">promo emails</div></div>
            <div className="stat"><div className="n">{done.size}</div><div className="l">handled</div></div>
          </div>

          {missingLinks > 0 && (
            <div className="notice" style={{ marginTop: 4 }}>
              {missingLinks} sender{missingLinks === 1 ? '' : 's'} have no unsubscribe link yet — these
              were synced before we started capturing them. Re-sync to fetch links for recent emails.
              You can still use <strong>Find in Gmail</strong> for any of them.
            </div>
          )}

          <div className="audit-controls" style={{ marginTop: 14 }}>
            <input
              className="audit-search"
              placeholder="Search senders…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <label className="unsub-toggle">
              <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
              Hide handled
            </label>
          </div>

          <div className="card" style={{ padding: '6px 18px' }}>
            {filtered.length === 0 ? (
              <div className="empty">Nothing to show — everything here is handled. 🎉</div>
            ) : (
              filtered.map(s => {
                const isDone = done.has(s.vendor)
                const isMailto = s.unsubscribe ? /^mailto:/i.test(s.unsubscribe) : false
                return (
                  <div className={`sender${isDone ? ' done' : ''}`} key={s.vendor}>
                    <div className="sender-top">
                      <div>
                        <div className="sender-name">{s.vendor}</div>
                        {s.senderEmail && <div className="sender-email">{s.senderEmail}</div>}
                      </div>
                      <div className="sender-count">{s.count} email{s.count === 1 ? '' : 's'}</div>
                    </div>
                    <div className="sender-actions">
                      {s.unsubscribe && (
                        <a className="link-btn" href={s.unsubscribe} target="_blank" rel="noopener noreferrer">
                          {isMailto ? 'Unsubscribe (email)' : 'Unsubscribe'}
                        </a>
                      )}
                      {s.senderEmail && (
                        <a className="link-btn ghost" href={gmailSearchUrl(s.senderEmail)} target="_blank" rel="noopener noreferrer">
                          Find in Gmail
                        </a>
                      )}
                      {!s.unsubscribe && !s.senderEmail && (
                        <span className="sender-email">No unsubscribe link captured</span>
                      )}
                      <button className="link-btn ghost done-btn" onClick={() => toggleDone(s.vendor)}>
                        {isDone ? '✓ Handled' : 'Mark handled'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <p className="chart-caption" style={{ marginTop: 14 }}>
            “Unsubscribe” opens the sender’s own opt-out link (we never unsubscribe for you).
            “Handled” is tracked on this device so you can work through the list.
          </p>
        </>
      )}
    </div>
  )
}
