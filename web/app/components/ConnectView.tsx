'use client'

import { useState } from 'react'
import { startConnect, requestAccess } from '../lib/api'

export function ConnectView({
  userId,
  slowStart = false,
}: {
  userId: string
  slowStart?: boolean
}) {
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
    <div className="connect">
      <div className="emoji">📬</div>
      <h1>Do I Want To Know</h1>
      <p className="tagline">
        Spotify Wrapped, but for your inbox. Connect Gmail and we&apos;ll turn your order,
        subscription, and travel emails into a year-in-review of your spending.
      </p>

      {slowStart && (
        <div
          style={{
            background: '#fff8e6',
            border: '1px solid #fcd34d',
            borderRadius: 12,
            padding: '10px 16px',
            fontSize: 13,
            color: '#92400e',
            maxWidth: 380,
            lineHeight: 1.5,
            marginBottom: 8,
          }}
        >
          ⏳ <strong>Server is waking up</strong> — it may take up to 30 seconds on first
          load. You can connect Gmail now; it will be ready by the time you return.
        </div>
      )}

      <button className="btn" disabled={!userId} onClick={() => startConnect(userId)}>
        Connect Gmail
      </button>
      <p className="fineprint">
        We only read metadata (sender, subject, date, snippet) from purchase emails — never the
        full body of any message. You can disconnect anytime.
      </p>

      {/* Request access — for people not yet added as test users */}
      <div className="request-access">
        {status === 'done' ? (
          <p className="request-done">
            ✓ Request sent! You&apos;ll be added soon — try connecting again later.
          </p>
        ) : !showForm ? (
          <button className="request-link" onClick={() => setShowForm(true)}>
            Blocked by Google? Request access →
          </button>
        ) : (
          <form className="request-form" onSubmit={submitRequest}>
            <p className="request-hint">
              This app is invite-only while in testing. Enter your Gmail and we&apos;ll add you.
            </p>
            <div className="request-row">
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
            </div>
            {status === 'error' && <p className="request-error">{errorMsg}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
