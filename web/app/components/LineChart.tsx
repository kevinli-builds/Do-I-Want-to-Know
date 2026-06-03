'use client'

import { moneyWhole } from '../lib/format'

export interface LineSeries {
  name: string
  color: string
  values: number[]
}

// Lightweight multi-series SVG line chart — no chart library.
// All series must share the same x-axis (labels).
export function LineChart({
  labels,
  series,
  format = 'count',
  height = 180,
}: {
  labels: string[]
  series: LineSeries[]
  format?: 'money' | 'count'
  height?: number
}) {
  const W = 600
  const H = height
  const padL = 44
  const padR = 12
  const padT = 12
  const padB = 24

  const fmt = (n: number) => (format === 'money' ? moneyWhole(n) : `${Math.round(n)}`)

  const max = Math.max(1, ...series.flatMap(s => s.values))
  const n = labels.length
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / max) * innerH

  // 3 horizontal gridlines + value labels
  const ticks = [0, 0.5, 1].map(t => ({ v: max * t, y: padT + innerH - t * innerH }))

  return (
    <div className="linechart-wrap">
      <svg
        className="linechart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Line chart"
      >
        {/* gridlines + y labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#ececf5" strokeWidth={1} />
            <text x={padL - 6} y={t.y + 3} textAnchor="end" fontSize={10} fill="#9a9ab0">
              {fmt(t.v)}
            </text>
          </g>
        ))}

        {/* x labels (skip some if crowded) */}
        {labels.map((lab, i) => {
          if (n > 8 && i % 2 !== 0 && i !== n - 1) return null
          return (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#9a9ab0">
              {lab}
            </text>
          )
        })}

        {/* series lines + dots */}
        {series.map(s => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
          return (
            <g key={s.name}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color}>
                  <title>{`${s.name} · ${labels[i]}: ${fmt(v)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>

      {series.length > 1 && (
        <div className="linechart-legend">
          {series.map(s => (
            <span key={s.name} className="legend-item">
              <span className="legend-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
