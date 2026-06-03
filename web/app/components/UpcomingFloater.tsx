'use client'

import { useEffect, useState } from 'react'
import { getUpcoming, gmailMessageUrl, type UpcomingItem } from '../lib/api'

const EMOJI: Record<string, string> = {
  order: '📦', clothes: '👕', travel: '✈️', food: '🍔',
  entertainment: '🎟️', subscription: '🔁', other: '🗓️',
}

// "today" / "tomorrow" / "in 4 days" / "Jun 12"
function whenLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff < 7) return `in ${diff} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function UpcomingFloater({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const [items, setItems] = useState<UpcomingItem[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getUpcoming(userId).then(u => { if (!cancelled) setItems(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [userId, refreshKey])

  if (items.length === 0) return null

  return (
    <div className={`upcoming-fab no-print${open ? ' open' : ''}`}>
      <button className="upcoming-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Upcoming">
        🗓️ <span className="upcoming-label">Upcoming</span> <span className="upcoming-badge">{items.length}</span>
      </button>
      {open && (
        <div className="upcoming-panel">
          <div className="upcoming-head">Upcoming</div>
          {items.map(it => (
            <a
              className="upcoming-item"
              key={it.id}
              href={gmailMessageUrl(it.emailId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="upcoming-emoji">{EMOJI[it.category] ?? '🗓️'}</span>
              <span className="upcoming-body">
                <span className="upcoming-vendor">{it.vendor}</span>
                <span className="upcoming-desc">{it.description}</span>
              </span>
              <span className="upcoming-when">{whenLabel(it.eventDate)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
