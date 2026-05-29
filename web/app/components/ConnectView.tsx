'use client'

import { startConnect } from '../lib/api'

export function ConnectView({ userId }: { userId: string }) {
  return (
    <div className="connect">
      <div className="emoji">📬</div>
      <h1>Do I Want To Know</h1>
      <p className="tagline">
        Spotify Wrapped, but for your inbox. Connect Gmail and we&apos;ll turn your order,
        subscription, and travel emails into a year-in-review of your spending.
      </p>
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
