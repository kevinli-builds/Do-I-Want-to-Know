'use client'

import { useMemo, useState } from 'react'
import type { MonitorAnalytics } from '../lib/api'
import { catColor, catLabel, catEmoji } from '../lib/categories'
import { LineChart, type LineSeries } from './LineChart'

// Configurable analytics chart: pick a metric (email count vs spend), optionally
// break the single aggregate line out into one line per category, and toggle
// individual categories on/off as a filter.
export function AnalyticsChart({ data }: { data: MonitorAnalytics }) {
  const [metric, setMetric] = useState<'count' | 'spend'>('count')
  const [grouped, setGrouped] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const source = metric === 'spend' ? data.spendByCategory : data.countByCategory
  const cats = data.categories
  const visibleCats = cats.filter(c => !hidden.has(c))

  const series = useMemo<LineSeries[]>(() => {
    if (grouped) {
      return visibleCats.map(c => ({
        name: catLabel(c),
        color: catColor(c),
        values: source[c] ?? data.months.map(() => 0),
      }))
    }
    // Single aggregate line = sum of visible categories per month
    const totals = data.months.map((_, i) =>
      visibleCats.reduce((sum, c) => sum + (source[c]?.[i] ?? 0), 0)
    )
    return [{ name: metric === 'spend' ? 'Total spend' : 'Total emails', color: '#6c63ff', values: totals }]
  }, [grouped, visibleCats, source, data.months, metric])

  function toggleCat(c: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  return (
    <div className="card">
      <h2>📈 Analytics</h2>

      <div className="analytics-controls no-print">
        <div className="seg">
          <button className={`seg-btn${metric === 'count' ? ' active' : ''}`} onClick={() => setMetric('count')}>
            Emails
          </button>
          <button className={`seg-btn${metric === 'spend' ? ' active' : ''}`} onClick={() => setMetric('spend')}>
            Spend $
          </button>
        </div>
        <label className="unsub-toggle">
          <input type="checkbox" checked={grouped} onChange={e => setGrouped(e.target.checked)} />
          Break down by category
        </label>
      </div>

      <LineChart labels={data.months} series={series} format={metric === 'spend' ? 'money' : 'count'} />

      {/* Category filter chips */}
      {cats.length > 1 && (
        <div className="cat-filter">
          {cats.map(c => (
            <button
              key={c}
              className={`cat-chip${hidden.has(c) ? ' off' : ''}`}
              style={!hidden.has(c) ? { borderColor: catColor(c) } : undefined}
              onClick={() => toggleCat(c)}
            >
              <span className="cat-dot" style={{ background: hidden.has(c) ? '#ccc' : catColor(c) }} />
              {catEmoji(c)} {catLabel(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
