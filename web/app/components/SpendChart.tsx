'use client'

import { LineChart } from './LineChart'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

/**
 * Renders monthlySpend (keyed "YYYY-MM") as a line chart.
 *  - A specific year → 12 monthly points (Jan–Dec)
 *  - All-time (null) → one point per year
 */
export function SpendChart({
  monthlySpend,
  year,
}: {
  monthlySpend: Record<string, number>
  year: number | null
}) {
  let labels: string[]
  let values: number[]
  let peakLabel = ''

  if (year != null) {
    labels = MONTH_LABELS
    values = MONTH_LABELS.map((_, i) => monthlySpend[`${year}-${String(i + 1).padStart(2, '0')}`] ?? 0)
  } else {
    const byYear: Record<string, number> = {}
    for (const [key, val] of Object.entries(monthlySpend)) {
      const y = key.slice(0, 4)
      byYear[y] = (byYear[y] ?? 0) + val
    }
    labels = Object.keys(byYear).sort()
    values = labels.map(y => byYear[y])
  }

  const max = Math.max(...values, 0)
  if (max <= 0) return null // nothing to plot

  const peakIdx = values.indexOf(max)
  peakLabel = labels[peakIdx] ?? ''

  return (
    <div className="card">
      <h2>📈 Spending Over Time</h2>
      <LineChart
        labels={labels}
        series={[{ name: 'Spend', color: '#6c63ff', values }]}
        format="money"
      />
      <div className="chart-caption">
        Peak: {peakLabel} · {money(max)}
      </div>
    </div>
  )
}
