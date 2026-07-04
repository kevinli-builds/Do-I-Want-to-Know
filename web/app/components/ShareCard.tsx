'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WrappedData, WrappedScope } from '../lib/api'
import { loadGuess } from '../lib/guess'

// Downloadable 1080×1920 "year in review" share card — the named main
// word-of-mouth play (OPUS_BRIEF P1). Rendered entirely client-side on a canvas
// from the Wrapped data already on screen (no backend). Numbers are shown; vendor
// names are optional (privacy toggle) since these get posted publicly. Works in
// demo mode too, where a share doubles as an ad.

const W = 1080
const H = 1920

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function ShareCard({
  data,
  scope,
  userId,
  onClose,
}: {
  data: WrappedData
  scope: WrappedScope
  userId: string
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [showVendors, setShowVendors] = useState(false)
  const [dataUrl, setDataUrl] = useState<string>('')

  const stats = data.stats

  const periodLabel =
    scope.mode === 'year' ? String(scope.year)
    : scope.mode === 'month' ? scope.month
    : scope.mode === 'custom' ? `${scope.from} → ${scope.to}`
    : 'All time'

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !stats) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Background — the app's purple identity as a vertical gradient.
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#6c63ff')
    bg.addColorStop(1, '#4b3fd4')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    ctx.textAlign = 'center'

    // Header
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '600 40px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('📬  DO I WANT TO KNOW', W / 2, 150)
    ctx.font = '500 34px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(`Your inbox, wrapped · ${periodLabel}`, W / 2, 205)

    // Hero — total net spend
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = '600 44px system-ui, sans-serif'
    ctx.fillText('I spent', W / 2, 430)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 150px system-ui, sans-serif'
    ctx.fillText(fmtUsd(stats.totalSpend), W / 2, 570)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '500 34px system-ui, sans-serif'
    ctx.fillText(`across ${data.totalEntries} tracked emails`, W / 2, 635)

    // Guess-vs-actual (if the user played the guessing game) — the shareable hook
    const g = loadGuess(userId, scope)
    if (g.guess != null) {
      const delta = Math.round(stats.totalSpend - g.guess)
      const line = Math.abs(delta) < 1 ? 'I nailed my guess 🎯'
        : delta > 0 ? `I guessed ${fmtUsd(g.guess)} — I was ${fmtUsd(Math.abs(delta))} optimistic 😬`
        : `I guessed ${fmtUsd(g.guess)} — ${fmtUsd(Math.abs(delta))} under 😅`
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.font = '600 34px system-ui, sans-serif'
      ctx.fillText(line, W / 2, 715)
    }

    // Stat tiles
    const tiles: { value: string; label: string }[] = [
      { value: String(stats.subscriptionCount), label: 'subscriptions' },
      { value: fmtUsd(stats.monthlySubscriptionCost) + '/mo', label: 'on subscriptions' },
    ]
    const topVendor = stats.topVendors[0]
    if (topVendor) tiles.push({ value: showVendors ? topVendor.vendor : `${topVendor.count} orders`, label: showVendors ? `top vendor · ${topVendor.count} orders` : 'from your #1 vendor' })
    if (stats.refundTotal > 0) tiles.push({ value: fmtUsd(stats.refundTotal), label: 'won back in refunds' })

    let ty = 820
    const tileH = 150
    for (const t of tiles.slice(0, 4)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(ctx, 90, ty, W - 180, tileH, 28)
      ctx.fill()
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 64px system-ui, sans-serif'
      ctx.fillText(t.value, 130, ty + 78)
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.font = '500 32px system-ui, sans-serif'
      ctx.fillText(t.label, 132, ty + 120)
      ctx.textAlign = 'center'
      ty += tileH + 28
    }

    // Biggest purchase
    if (stats.mostExpensive && stats.mostExpensive.amount != null) {
      const me = stats.mostExpensive
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      roundRect(ctx, 90, ty + 10, W - 180, 190, 28)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '600 32px system-ui, sans-serif'
      ctx.fillText('💸  BIGGEST SINGLE PURCHASE', W / 2, ty + 70)
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 84px system-ui, sans-serif'
      ctx.fillText(fmtUsd(me.amount), W / 2, ty + 158)
      if (showVendors) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.font = '500 30px system-ui, sans-serif'
        ctx.fillText(me.vendor, W / 2, ty + 196)
      }
    }

    // One Wrapped Moment
    const moment = stats.funFacts?.find(f => f.label === 'Busiest month') ?? stats.funFacts?.[0]
    if (moment) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = '600 40px system-ui, sans-serif'
      ctx.fillText(`${moment.emoji}  ${moment.label}: ${moment.value}`, W / 2, H - 170)
    }

    // Footer CTA
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '500 32px system-ui, sans-serif'
    ctx.fillText('See yours — connect your inbox', W / 2, H - 90)

    setDataUrl(canvas.toDataURL('image/png'))
  }, [stats, data.totalEntries, periodLabel, showVendors, userId, scope])

  useEffect(() => { draw() }, [draw])

  function download() {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `diwtkn-wrapped-${periodLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!stats) return null

  return (
    <div className="share-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-head">
          <h2>Share your Wrapped</h2>
          <button className="fab-toast-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Hidden full-res canvas; we display the generated image scaled down. */}
        <canvas ref={canvasRef} width={W} height={H} style={{ display: 'none' }} />
        {dataUrl && <img className="share-preview" src={dataUrl} alt="Your Wrapped share card" />}

        <label className="share-toggle">
          <input type="checkbox" checked={showVendors} onChange={(e) => setShowVendors(e.target.checked)} />
          Include vendor names
        </label>
        <p className="share-hint">
          Numbers are always shown; vendor names are off by default since these get posted publicly.
        </p>

        <div className="share-actions">
          <button className="btn" onClick={download} disabled={!dataUrl}>⬇ Download image</button>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
