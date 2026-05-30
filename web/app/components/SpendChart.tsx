'use client'

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const moneyFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

interface Bar {
  label: string
  full: string // tooltip label
  value: number
}

/**
 * Renders monthlySpend (keyed "YYYY-MM") as a simple bar chart.
 *  - A specific year  → 12 monthly bars (Jan–Dec)
 *  - All-time (null)  → one bar per year
 */
export function SpendChart({
  monthlySpend,
  year,
}: {
  monthlySpend: Record<string, number>
  year: number | null
}) {
  let bars: Bar[]

  if (year != null) {
    bars = MONTH_LABELS.map((label, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`
      const value = monthlySpend[key] ?? 0
      const monthName = new Date(year, i, 1).toLocaleString('en-US', { month: 'long' })
      return { label, full: `${monthName} ${year}`, value }
    })
  } else {
    const byYear: Record<string, number> = {}
    for (const [key, val] of Object.entries(monthlySpend)) {
      const y = key.slice(0, 4)
      byYear[y] = (byYear[y] ?? 0) + val
    }
    bars = Object.keys(byYear)
      .sort()
      .map(y => ({ label: y, full: y, value: byYear[y] }))
  }

  const max = Math.max(...bars.map(b => b.value), 0)
  if (max <= 0) return null // nothing to plot

  const peak = bars.reduce((m, b) => (b.value > m.value ? b : m), bars[0])

  return (
    <div className="card">
      <h2>📈 Spending Over Time</h2>
      <div className="chart">
        {bars.map((b, i) => {
          const pct = max > 0 ? (b.value / max) * 100 : 0
          const isPeak = b.value === peak.value && b.value > 0
          return (
            <div className="chart-col" key={i} title={`${b.full}: ${moneyFull(b.value)}`}>
              <div className="chart-track">
                {b.value > 0 && (
                  <div
                    className={`chart-fill${isPeak ? ' peak' : ''}`}
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                )}
              </div>
              <div className="chart-label">{b.label}</div>
            </div>
          )
        })}
      </div>
      <div className="chart-caption">
        Peak: {peak.full} · {money(peak.value)}
      </div>
    </div>
  )
}
