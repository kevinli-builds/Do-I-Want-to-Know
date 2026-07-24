import { describe, it, expect } from 'vitest'
import type { LedgerEntry } from '@prisma/client'
import {
  DEFAULT_MULTIPLIER, MAX_MULTIPLIER, WATCH_MULTIPLIER,
  clampMultiplier, multiplierFor, nextMultiplier,
} from '../tolerance'
import { computeMonitor } from '../monitor'

describe('nextMultiplier', () => {
  it('raises the bar above the charge the user accepted', () => {
    // A 6x charge marked Expected → 6 * 1.25 headroom, so a repeat won't re-flag.
    expect(nextMultiplier(null, 6, true)).toBe(7.5)
  })

  it('never drops below the default when accepting a small spike', () => {
    // 3.1x * 1.25 = 3.875, above the default — but a 2x "spike" (only possible
    // once the vendor is already on WATCH) must not loosen past the default.
    expect(nextMultiplier(WATCH_MULTIPLIER, 2, true)).toBe(DEFAULT_MULTIPLIER)
  })

  it('never lowers an existing tolerance when accepting', () => {
    expect(nextMultiplier(10, 4, true)).toBe(10)
  })

  it('caps so one freak charge cannot silence a vendor forever', () => {
    expect(nextMultiplier(null, 500, true)).toBe(MAX_MULTIPLIER)
  })

  it('tightens to WATCH when the alert was useful', () => {
    expect(nextMultiplier(null, 6, false)).toBe(WATCH_MULTIPLIER)
    expect(nextMultiplier(20, 6, false)).toBe(WATCH_MULTIPLIER) // undoes an over-loosened vendor
  })

  it('falls back to nudging the current setting when the ratio is missing', () => {
    expect(nextMultiplier(8, NaN, true)).toBe(10) // 8 * 1.25
    expect(nextMultiplier(null, NaN, true)).toBe(DEFAULT_MULTIPLIER * 1.25)
  })
})

describe('clampMultiplier / multiplierFor', () => {
  it('bounds to [WATCH, MAX] and survives garbage', () => {
    expect(clampMultiplier(0)).toBe(WATCH_MULTIPLIER)
    expect(clampMultiplier(-5)).toBe(WATCH_MULTIPLIER)
    expect(clampMultiplier(1e9)).toBe(MAX_MULTIPLIER)
    expect(clampMultiplier(NaN)).toBe(DEFAULT_MULTIPLIER)
  })

  it('falls back to the default for an absent or invalid vendor setting', () => {
    expect(multiplierFor({}, 'Amazon')).toBe(DEFAULT_MULTIPLIER)
    expect(multiplierFor({ Amazon: 0 }, 'Amazon')).toBe(DEFAULT_MULTIPLIER)
    expect(multiplierFor({ Amazon: 7.5 }, 'Amazon')).toBe(7.5)
  })
})

// ── The detection side: does a stored tolerance actually silence the alert? ──
const NOW = new Date('2026-07-15T00:00:00Z')

const entry = (o: { vendor: string; amount: number; date: Date; category?: string }): LedgerEntry =>
  ({
    id: `${o.vendor}-${o.date.toISOString()}-${o.amount}`,
    category: o.category ?? 'order',
    currency: 'USD',
    description: '',
    ...o,
  }) as LedgerEntry

// Amazon: three $20 charges in prior months, then one $120 this month (6x).
function ledger(): LedgerEntry[] {
  return [
    entry({ vendor: 'Amazon', amount: 20, date: new Date('2026-04-10T00:00:00Z') }),
    entry({ vendor: 'Amazon', amount: 20, date: new Date('2026-05-10T00:00:00Z') }),
    entry({ vendor: 'Amazon', amount: 20, date: new Date('2026-06-10T00:00:00Z') }),
    entry({ vendor: 'Amazon', amount: 120, date: new Date('2026-07-05T00:00:00Z') }),
  ]
}

const amazonSpike = (tolerances: Record<string, number>) =>
  computeMonitor(ledger(), 'month', { USD: 1 }, NOW, [], tolerances)
    .anomalies.find(a => a.vendor === 'Amazon' && a.kind === 'spike')

describe('unusual-charge alerts respect the stored tolerance', () => {
  it('flags a 6x charge at the default sensitivity, with its reasoning', () => {
    const a = amazonSpike({})
    expect(a).toMatchObject({ kind: 'spike', vendor: 'Amazon', amount: 120, median: 20, ratio: 6, multiplier: 3 })
  })

  it('goes quiet once the user has marked that charge Expected', () => {
    // What the PUT route would have stored: nextMultiplier(null, 6, true) = 7.5
    expect(amazonSpike({ Amazon: 7.5 })).toBeUndefined()
  })

  it('still fires for a bigger charge than the one that was accepted', () => {
    const bigger = [...ledger(), entry({ vendor: 'Amazon', amount: 400, date: new Date('2026-07-08T00:00:00Z') })]
    const a = computeMonitor(bigger, 'month', { USD: 1 }, NOW, [], { Amazon: 7.5 })
      .anomalies.find(x => x.vendor === 'Amazon')
    expect(a).toMatchObject({ amount: 400, ratio: 20 })
  })

  it('surfaces a smaller spike once the vendor is on WATCH', () => {
    const smaller = [
      entry({ vendor: 'Amazon', amount: 20, date: new Date('2026-04-10T00:00:00Z') }),
      entry({ vendor: 'Amazon', amount: 20, date: new Date('2026-05-10T00:00:00Z') }),
      entry({ vendor: 'Amazon', amount: 20, date: new Date('2026-06-10T00:00:00Z') }),
      entry({ vendor: 'Amazon', amount: 50, date: new Date('2026-07-05T00:00:00Z') }), // 2.5x
    ]
    const at = (m: Record<string, number>) =>
      computeMonitor(smaller, 'month', { USD: 1 }, NOW, [], m).anomalies.find(a => a.vendor === 'Amazon')
    expect(at({})).toBeUndefined() // 2.5x < the default 3x
    expect(at({ Amazon: WATCH_MULTIPLIER })).toMatchObject({ ratio: 2.5 })
  })

  it('leaves brand-new vendors alone — no history to be personal about', () => {
    const withNew = [...ledger(), entry({ vendor: 'Peloton', amount: 900, date: new Date('2026-07-02T00:00:00Z') })]
    const a = computeMonitor(withNew, 'month', { USD: 1 }, NOW, [], { Peloton: MAX_MULTIPLIER })
      .anomalies.find(x => x.vendor === 'Peloton')
    expect(a).toMatchObject({ kind: 'new', amount: 900, median: null, ratio: null, multiplier: null })
  })
})
