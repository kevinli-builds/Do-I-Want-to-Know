'use client'

import { startConnect } from '../lib/api'

export function ConnectView({
  userId,
  slowStart = false,
}: {
  userId: string
  slowStart?: boolean
}) {
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
    </div>
  )
}
