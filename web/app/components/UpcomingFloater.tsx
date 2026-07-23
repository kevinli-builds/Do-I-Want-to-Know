'use client'

import { useEffect, useState } from 'react'
import { getUpcoming, gmailMessageUrl, type UpcomingItem, type Renewal } from '../lib/api'
import { money } from '../lib/format'
import { relativeDay } from '../lib/dates'
import { catEmoji } from '../lib/categories'

const CADENCE_WORD: Record<Renewal['cadence'], string> = {
  weekly: 'Weekly', monthly: 'Monthly', annual: 'Annual',
}

export function UpcomingFloater({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const [items, setItems] = useState<UpcomingItem[]>([])
  const [renewals, setRenewals] = useState<Renewal[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getUpcoming(userId)
      .then(u => { if (!cancelled) { setItems(u.upcoming); setRenewals(u.renewals) } })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId, refreshKey])

  const total = items.length + renewals.length
  if (total === 0) return null

  return (
    <div className={`upcoming-fab no-print${open ? ' open' : ''}`}>
      <button className="upcoming-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Upcoming">
        🗓️ <span className="upcoming-label">Upcoming</span> <span className="upcoming-badge">{total}</span>
      </button>
      {open && (
        <div className="upcoming-panel">
          {items.length > 0 && (
            <>
              <div className="upcoming-head">Arriving</div>
              {items.map(it => (
                <a
                  className="upcoming-item"
                  key={it.id}
                  href={gmailMessageUrl(it.emailId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="upcoming-emoji">{catEmoji(it.category)}</span>
                  <span className="upcoming-body">
                    <span className="upcoming-vendor">{it.vendor}</span>
                    <span className="upcoming-desc">{it.description}</span>
                  </span>
                  <span className="upcoming-when">{relativeDay(it.eventDate)}</span>
                </a>
              ))}
            </>
          )}

          {renewals.length > 0 && (
            <>
              <div className="upcoming-head">Subscription renewals</div>
              {renewals.map(r => (
                <div className="upcoming-item" key={`${r.vendor}-${r.date}`}>
                  <span className="upcoming-emoji">🔁</span>
                  <span className="upcoming-body">
                    <span className="upcoming-vendor">{r.vendor}</span>
                    <span className="upcoming-desc">
                      {CADENCE_WORD[r.cadence]} renewal{r.amount != null ? ` · ${money(r.amount)}` : ''}
                    </span>
                  </span>
                  <span className="upcoming-when">{relativeDay(r.date)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
