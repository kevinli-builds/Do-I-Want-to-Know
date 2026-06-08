import type { SubscriptionInsight } from './stats'

export interface Renewal {
  vendor: string
  amount: number | null  // best-known charge amount (USD)
  cadence: 'weekly' | 'monthly' | 'annual'
  date: string           // ISO date (YYYY-MM-DD) of the predicted next charge
  daysAway: number
}

function addCadence(d: Date, cadence: Renewal['cadence']): Date {
  const n = new Date(d)
  if (cadence === 'weekly') n.setDate(n.getDate() + 7)
  else if (cadence === 'annual') n.setFullYear(n.getFullYear() + 1)
  else n.setMonth(n.getMonth() + 1)
  return n
}

// Predict the next charge date for each ACTIVE subscription (roll its last
// charge forward by its cadence until it lands in the future) and return those
// due within `horizonDays`, soonest first.
export function computeRenewals(
  insights: SubscriptionInsight[],
  now = new Date(),
  horizonDays = 45,
): Renewal[] {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const horizon = new Date(startOfToday.getTime() + horizonDays * 86_400_000)

  const out: Renewal[] = []
  for (const s of insights) {
    if (!s.active) continue
    const last = new Date(s.lastCharge)
    if (isNaN(last.getTime())) continue

    let next = addCadence(last, s.cadence)
    let guard = 0
    while (next < startOfToday && guard++ < 70) next = addCadence(next, s.cadence)
    if (next > horizon) continue

    out.push({
      vendor: s.vendor,
      amount: s.lastAmount ?? (s.monthlyEstimate > 0 ? s.monthlyEstimate : null),
      cadence: s.cadence,
      date: next.toISOString().slice(0, 10),
      daysAway: Math.round((next.getTime() - startOfToday.getTime()) / 86_400_000),
    })
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return out
}
