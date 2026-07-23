'use client'

import { useState } from 'react'
import { startConnect, requestAccess } from '../lib/api'

// Sticky banner shown across the demo experience: reminds the visitor the data
// is fictional and offers the two conversion paths — connect Gmail, or request
// access (for people not yet on the invite-only test-user list).
export function DemoBanner({ userId, onExit }: { userId: string; onExit: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    try {
      await requestAccess(email.trim())
      setStatus('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  return (
    <div className="demo-banner no-print">
      <div className="demo-banner-main">
        <span className="demo-badge">DEMO</span>
        <span className="demo-banner-text">
          Sample data — <strong>connect Gmail to see yours</strong>.
        </span>
        <div className="demo-banner-actions">
          <button className="btn" disabled={!userId} onClick={() => startConnect(userId)}>Connect Gmail</button>
          {status !== 'done' && (
            <button className="link-btn" onClick={() => setShowForm(s => !s)}>
              Blocked by Google? Request access
            </button>
          )}
          <button className="link-btn ghost" onClick={onExit}>Exit demo</button>
        </div>
      </div>

      {status === 'done' ? (
        <p className="demo-request-done">✓ Request sent! You’ll be added soon — try connecting later.</p>
      ) : showForm ? (
        <form className="demo-request-form" onSubmit={submitRequest}>
          <input
            type="email"
            required
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="request-input"
          />
          <button type="submit" className="btn" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Request'}
          </button>
          {status === 'error' && <span className="request-error">{errorMsg}</span>}
        </form>
      ) : null}
    </div>
  )
}
