'use client'

import { useState } from 'react'

// First-visit tour of the connected dashboard. Shown once (localStorage
// 'diwtkn_tour_seen'), reopenable via the ? button in the tab bar.
// Works in demo mode too — step copy adapts (no Sync button there).

type Step = { emoji: string; title: string; body: string }

function steps(demo: boolean): Step[] {
  return [
    {
      emoji: '👋',
      title: 'Your inbox, totaled',
      body: demo
        ? 'Wrapped adds up every order, subscription and trip found in an email inbox — total spend, top vendors, biggest splurge. You’re looking at sample data; everything works the same with your own.'
        : 'Wrapped adds up every order, subscription and trip Claude finds in your email — total spend, top vendors, biggest splurge. The picker up top switches between all-time, a single year, or any window.',
    },
    demo
      ? {
          emoji: '🔒',
          title: 'When you connect for real',
          body: 'Only email metadata is read — subject, sender, date, snippet. Never the full body, and the scope is read-only. Disconnect anytime; your data stays yours.',
        }
      : {
          emoji: '🔄',
          title: 'Sync works in passes',
          body: 'Each tap of “Sync Emails” reads the next batch and reaches further back in time — “✓ up to date” means it’s all in. The first pass can take a minute or two while your history loads.',
        },
    {
      emoji: '🧭',
      title: 'More than Wrapped',
      body: 'Monitor watches trends, budgets and renewals. Audit lets you fix any record. Promotions and Unsubscribe help clean the inbox itself — and Upcoming (top right) tracks deliveries and events.',
    },
  ]
}

export function IntroTour({ demo, onClose }: { demo: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const all = steps(demo)
  const step = all[i]
  const last = i === all.length - 1

  return (
    <div className="tour-overlay no-print" onClick={onClose}>
      <div className="tour-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Quick tour">
        <div className="tour-emoji" aria-hidden="true">{step.emoji}</div>
        <h2 className="tour-title">{step.title}</h2>
        <p className="tour-body">{step.body}</p>

        <div className="tour-dots" aria-hidden="true">
          {all.map((_, d) => (
            <span key={d} className={`tour-dot${d === i ? ' on' : ''}`} />
          ))}
        </div>

        <div className="tour-actions">
          {i > 0 ? (
            <button className="btn btn-outline" onClick={() => setI(i - 1)}>Back</button>
          ) : (
            <button className="btn btn-outline" onClick={onClose}>Skip</button>
          )}
          <button className="btn" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? "Let's go" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
