'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPromotions, gmailMessageUrl, type Promotion } from '../lib/api'
import { daysUntil, monthDay } from '../lib/dates'

// "Expires today" / "Expires in 3 days" / "Expires Jun 30" / "" (no known expiry)
function expiryLabel(iso: string | null): { text: string; urgent: boolean } {
  if (!iso) return { text: 'No end date given', urgent: false }
  const diff = daysUntil(iso)
  if (isNaN(diff)) return { text: '', urgent: false }
  if (diff <= 0) return { text: 'Expires today', urgent: true }
  if (diff === 1) return { text: 'Expires tomorrow', urgent: true }
  if (diff < 7) return { text: `Expires in ${diff} days`, urgent: true }
  return { text: `Expires ${monthDay(iso)}`, urgent: false }
}

function PromoCard({ promo }: { promo: Promotion }) {
  const [copied, setCopied] = useState(false)
  const exp = expiryLabel(promo.expiresAt)

  function copyCode() {
    if (!promo.promoCode) return
    navigator.clipboard?.writeText(promo.promoCode).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500) },
      () => {},
    )
  }

  return (
    <div className="promo-card">
      <div className="promo-top">
        <span className="promo-vendor">{promo.vendor}</span>
        {promo.discount && <span className="promo-discount">{promo.discount}</span>}
      </div>

      {promo.promoCode && (
        <button className={`promo-code${copied ? ' copied' : ''}`} onClick={copyCode} title="Copy code">
          <span className="promo-code-label">CODE</span>
          <span className="promo-code-value">{promo.promoCode}</span>
          <span className="promo-code-copy">{copied ? '✓ Copied' : 'Copy'}</span>
        </button>
      )}

      {promo.description && <div className="promo-desc">{promo.description}</div>}

      <div className="promo-foot">
        <span className={`promo-expiry${exp.urgent ? ' urgent' : ''}`}>{exp.text}</span>
        <a className="txn-link" href={gmailMessageUrl(promo.emailId)} target="_blank" rel="noopener noreferrer">
          View email ↗
        </a>
      </div>
    </div>
  )
}

export function PromotionsView({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const [promos, setPromos] = useState<Promotion[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    setPromos(null)
    try {
      setPromos(await getPromotions(userId))
    } catch {
      setError(true)
    }
  }, [userId])

  useEffect(() => { load() }, [load, refreshKey])

  if (error) {
    return (
      <div className="shell">
        <div className="card">
          <div className="empty">
            Couldn’t load your promotions — the server may be waking up.
            <div style={{ marginTop: 14 }}><button className="btn" onClick={() => load()}>Try again</button></div>
          </div>
        </div>
      </div>
    )
  }

  if (!promos) {
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
          <h1>Promotions</h1>
          <div className="email">{promos.length} active offer{promos.length === 1 ? '' : 's'} from your inbox</div>
        </div>
      </div>

      {promos.length === 0 ? (
        <div className="card">
          <div className="empty">
            No active promo codes or discounts found yet. Sync more email on the Wrapped tab —
            we surface codes &amp; expiry dates as they’re detected.
          </div>
        </div>
      ) : (
        <div className="promo-grid">
          {promos.map(p => <PromoCard key={p.id} promo={p} />)}
        </div>
      )}

      <p className="chart-caption" style={{ marginTop: 14 }}>
        Codes &amp; expiry dates are read from email subjects/snippets, so some offers may be
        missing details. Always confirm on the retailer’s site before relying on a code.
      </p>
    </div>
  )
}
