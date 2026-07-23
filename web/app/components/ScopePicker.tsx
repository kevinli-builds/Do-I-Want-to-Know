'use client'

import { useState } from 'react'
import type { WrappedScope } from '../lib/api'

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  if (!y || !mo) return m
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// The Total / Yearly / Monthly / Custom scope selector for the Wrapped view.
// Owns its own "custom range open" + draft date state; the chosen scope is
// reported up via onScopeChange. `customOpen` is also surfaced so the parent's
// active-segment styling stays in sync (Custom highlights while editing).
export function ScopePicker({
  scope,
  onScopeChange,
  scopeLoading = false,
  availableYears,
  availableMonths,
  onCustomOpenChange,
}: {
  scope: WrappedScope
  onScopeChange: (scope: WrappedScope) => void
  scopeLoading?: boolean
  availableYears: number[]
  availableMonths: string[]
  onCustomOpenChange?: (open: boolean) => void
}) {
  const earliestMonth = availableMonths.length ? availableMonths[availableMonths.length - 1] : null
  const [customOpen, setCustomOpenState] = useState(false)
  const [customFrom, setCustomFrom] = useState(earliestMonth ? `${earliestMonth}-01` : '')
  const [customTo, setCustomTo] = useState(todayISO())

  const setCustomOpen = (open: boolean) => {
    setCustomOpenState(open)
    onCustomOpenChange?.(open)
  }

  const segCls = (m: WrappedScope['mode']) => `seg-btn${scope.mode === m && !customOpen ? ' active' : ''}`

  return (
    <div className="scope no-print">
      <div className="seg scope-seg">
        <button className={segCls('total')} disabled={scopeLoading}
          onClick={() => { setCustomOpen(false); onScopeChange({ mode: 'total' }) }}>Total</button>
        <button className={segCls('year')} disabled={scopeLoading || availableYears.length === 0}
          onClick={() => { setCustomOpen(false); onScopeChange({ mode: 'year', year: scope.mode === 'year' ? scope.year : availableYears[0] }) }}>Yearly</button>
        <button className={segCls('month')} disabled={scopeLoading || availableMonths.length === 0}
          onClick={() => { setCustomOpen(false); onScopeChange({ mode: 'month', month: scope.mode === 'month' ? scope.month : availableMonths[0] }) }}>Monthly</button>
        <button className={`seg-btn${scope.mode === 'custom' || customOpen ? ' active' : ''}`} disabled={scopeLoading}
          onClick={() => setCustomOpen(true)}>Custom</button>
      </div>

      {scope.mode === 'year' && !customOpen && (
        <div className="scope-options">
          {availableYears.map((y) => (
            <button key={y} className={`year-btn${scope.mode === 'year' && scope.year === y ? ' active' : ''}`}
              disabled={scopeLoading} onClick={() => onScopeChange({ mode: 'year', year: y })}>{y}</button>
          ))}
        </div>
      )}

      {scope.mode === 'month' && !customOpen && (
        <div className="scope-options">
          <select className="audit-select" value={scope.month} disabled={scopeLoading}
            onChange={(e) => onScopeChange({ mode: 'month', month: e.target.value })}>
            {availableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      )}

      {customOpen && (
        <div className="scope-options scope-custom">
          <label>From <input type="date" value={customFrom} max={customTo || todayISO()} onChange={(e) => setCustomFrom(e.target.value)} /></label>
          <label>To <input type="date" value={customTo} min={customFrom} max={todayISO()} onChange={(e) => setCustomTo(e.target.value)} /></label>
          <button className="btn btn-outline" disabled={scopeLoading || !customFrom || !customTo || customFrom > customTo}
            onClick={() => onScopeChange({ mode: 'custom', from: customFrom, to: customTo })}>Apply</button>
        </div>
      )}
    </div>
  )
}
