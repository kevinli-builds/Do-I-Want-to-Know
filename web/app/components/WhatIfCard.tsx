'use client'

import { useMemo, useState } from 'react'
import type { MonitorAnalytics, SubItem } from '../lib/api'
import { avgMonthlyByCategory, cappableCategories, computeWhatIf } from '../lib/whatif'
import { money } from '../lib/format'
import { catLabel } from '../lib/categories'

const SHOW_SUBS = 8
const SHOW_CATS = 5

// What-if simulator (§9 A5): check subscriptions to "cancel", cap category
// spending, and watch the savings-per-year number move. Pure client-side —
// the recompute-as-you-toggle number is the whole point.
export function WhatIfCard({ subs, analytics }: { subs?: SubItem[]; analytics?: MonitorAnalytics }) {
  const [canceled, setCanceled] = useState<Set<string>>(new Set())
  const [caps, setCaps] = useState<Record<string, string>>({})
  const [allSubs, setAllSubs] = useState(false)

  const avg = useMemo(() => (analytics ? avgMonthlyByCategory(analytics) : {}), [analytics])
  const cats = useMemo(() => cappableCategories(avg).slice(0, SHOW_CATS), [avg])
  const subItems = subs ?? []

  const result = useMemo(() => {
    const numericCaps: Record<string, number> = {}
    for (const [cat, raw] of Object.entries(caps)) {
      if (raw.trim() === '') continue
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) numericCaps[cat] = n
    }
    return computeWhatIf(subItems, avg, { canceledVendors: canceled, categoryCaps: numericCaps })
  }, [subItems, avg, canceled, caps])

  // Nothing to simulate (no active subs detected and no category history).
  if (subItems.length === 0 && cats.length === 0) return null

  const toggle = (vendor: string) =>
    setCanceled(prev => {
      const next = new Set(prev)
      if (next.has(vendor)) next.delete(vendor)
      else next.add(vendor)
      return next
    })

  const dirty = canceled.size > 0 || Object.values(caps).some(v => v.trim() !== '')
  const shownSubs = allSubs ? subItems : subItems.slice(0, SHOW_SUBS)

  return (
    <div className="card">
      <h2>💡 What If?</h2>

      {subItems.length > 0 && (
        <p className="wi-fiveyear">
          At today's prices, your subscriptions cost{' '}
          <strong>≈ {money(result.currentFiveYearSubs)}</strong> over the next 5 years.
        </p>
      )}

      {subItems.length > 0 && (
        <>
          <div className="sub-section-label">Cancel a subscription…</div>
          <div className="wi-subs">
            {shownSubs.map(s => (
              <label className={`wi-sub${canceled.has(s.vendor) ? ' canceled' : ''}`} key={s.vendor}>
                <input
                  type="checkbox"
                  checked={canceled.has(s.vendor)}
                  onChange={() => toggle(s.vendor)}
                />
                <span className="wi-sub-vendor">{s.vendor}</span>
                <span className="wi-sub-cost">{money(s.monthlyEstimate)}/mo</span>
              </label>
            ))}
          </div>
          {subItems.length > SHOW_SUBS && !allSubs && (
            <button className="link-btn" onClick={() => setAllSubs(true)}>
              show all {subItems.length} subscriptions
            </button>
          )}
        </>
      )}

      {cats.length > 0 && (
        <>
          <div className="sub-section-label">…or cap a category</div>
          {cats.map(cat => {
            const capRaw = caps[cat] ?? ''
            const capN = Number(capRaw)
            const saving = capRaw.trim() !== '' && Number.isFinite(capN) && capN >= 0
              ? Math.max(0, (avg[cat] ?? 0) - capN)
              : 0
            return (
              <div className="wi-cap" key={cat}>
                <span className="wi-cap-label">{catLabel(cat)}</span>
                <span className="wi-cap-avg">avg {money(avg[cat])}/mo</span>
                <span className="wi-cap-input">
                  $<input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="cap"
                    value={capRaw}
                    onChange={e => setCaps(prev => ({ ...prev, [cat]: e.target.value }))}
                  />/mo
                </span>
                {saving > 0 && <span className="wi-cap-save">−{money(saving)}/mo</span>}
              </div>
            )
          })}
        </>
      )}

      <div className={`wi-result${result.monthlySavings > 0 ? ' active' : ''}`}>
        {result.monthlySavings > 0 ? (
          <>
            <div className="wi-result-big">
              You'd save <strong>{money(result.monthlySavings)}/mo</strong> ·{' '}
              <strong>{money(result.yearlySavings)}/yr</strong>
            </div>
            {result.fromSubscriptions > 0 && (
              <div className="wi-result-sub">
                5-year subscription cost drops to <strong>{money(result.scenarioFiveYearSubs)}</strong>{' '}
                (from {money(result.currentFiveYearSubs)})
              </div>
            )}
          </>
        ) : (
          <div className="wi-result-hint">
            Tick a subscription or set a cap to see what it frees up.
          </div>
        )}
        {dirty && (
          <button className="link-btn" onClick={() => { setCanceled(new Set()); setCaps({}) }}>
            reset
          </button>
        )}
      </div>

      <p className="chart-caption" style={{ textAlign: 'left', margin: '8px 0 0' }}>
        Estimates from your billing history — category savings assume you hold spending at the cap.
      </p>
    </div>
  )
}
