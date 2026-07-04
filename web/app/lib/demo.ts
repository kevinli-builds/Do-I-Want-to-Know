// ── Demo mode engine ─────────────────────────────────────────────────────────
//
// The app is gated behind invite-only Google OAuth (Testing mode). A visitor who
// can't connect Gmail would otherwise hit a wall. Demo mode gives them the full
// Wrapped/Monitor/Audit experience on realistic *fictional* data, entirely
// client-side — no backend calls, no Claude cost. It's also the screenshot /
// marketing surface.
//
// Rather than ship a frozen JSON blob, we generate a deterministic ledger from a
// fixed seed, with dates anchored relative to "now" so the demo always looks
// current (recent syncs, active subscriptions, upcoming renewals). The client
// then runs the SAME aggregation the backend does (ported below) so every number
// is internally consistent: the hero total equals the sum of the transactions,
// the category rows match their drill-downs, etc.
//
// api.ts calls into this module when demo mode is on (see setDemoMode).

import type {
  Transaction,
  WrappedData,
  WrappedStats,
  WrappedScope,
  SubscriptionInsight,
  SpammerStat,
  MonitorData,
  KpiPair,
  UpcomingItem,
  Renewal,
  Promotion,
} from './types'

export const DEMO_USER_ID = 'demo'
export const DEMO_EMAIL = 'alex.rivera.demo@gmail.com'

// Categories that count as real financial spend (mirror of the backend's
// SPEND_CATEGORIES — marketing/shipping/charity/refund are excluded).
const SPEND = new Set(['order', 'clothes', 'subscription', 'travel', 'food', 'entertainment', 'other'])

// Static FX table (matches lib/fx.ts fallbacks closely enough for a demo).
const FX: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, JPY: 0.0067, CAD: 0.73 }

const NOW = new Date()
const DAY = 86_400_000

function round2(n: number) { return Math.round(n * 100) / 100 }
function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function iso(d: Date) { return d.toISOString() }

// Deterministic PRNG (mulberry32) so the demo is identical on every load.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Ledger generation ────────────────────────────────────────────────────────

let _txns: Transaction[] | null = null

function daysAgo(n: number) { return new Date(NOW.getTime() - n * DAY) }
function monthsAgo(k: number, day: number) {
  return new Date(NOW.getFullYear(), NOW.getMonth() - k, day, 12, 0, 0)
}

function buildLedger(): Transaction[] {
  const rand = mulberry32(0xC0FFEE)
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
  const randInt = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  // amount around `base` ± spread%
  const amt = (base: number, spread = 0.25) => round2(base * (1 + (rand() * 2 - 1) * spread))

  const out: Transaction[] = []
  let n = 0
  const hex = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('')

  function push(t: Partial<Omit<Transaction, 'date'>> & { category: string; vendor: string; date: Date; description: string }) {
    const currency = t.currency ?? 'USD'
    const amount = t.amount ?? null
    out.push({
      id: `demo-${++n}`,
      date: iso(t.date),
      category: t.category,
      vendor: t.vendor,
      amount,
      currency,
      amountUsd: amount == null ? null : round2(amount * (FX[currency] ?? 1)),
      description: t.description,
      emailId: hex(),
      senderEmail: t.senderEmail ?? null,
      unsubscribe: t.unsubscribe ?? null,
      termMonths: t.termMonths ?? null,
      categoryLocked: false,
    })
  }

  // 1. Subscriptions — recurring monthly (+ one annual, one lapsed, one brand-new).
  interface Sub {
    vendor: string; base: number; sender: string; startK: number; endK: number
    priceFrom?: number; changeK?: number
  }
  const subs: Sub[] = [
    { vendor: 'Netflix',         base: 17.99, sender: 'info@account.netflix.com', startK: 16, endK: 0, priceFrom: 15.49, changeK: 2 },
    { vendor: 'Spotify',         base: 11.99, sender: 'no-reply@spotify.com',      startK: 18, endK: 0 },
    { vendor: 'ChatGPT Plus',    base: 20.00, sender: 'noreply@openai.com',        startK: 12, endK: 0 },
    { vendor: 'iCloud+',         base: 2.99,  sender: 'no_reply@email.apple.com',  startK: 20, endK: 0 },
    { vendor: 'YouTube Premium', base: 13.99, sender: 'payments-noreply@google.com', startK: 14, endK: 0 },
    { vendor: 'Disney+',         base: 13.99, sender: 'disneyplus@mail.disneyplus.com', startK: 15, endK: 5 }, // lapsed
    { vendor: 'Audible',         base: 14.95, sender: 'no-reply@audible.com',      startK: 1,  endK: 0 },       // brand-new
  ]
  for (const s of subs) {
    for (let k = s.startK; k >= s.endK; k--) {
      const base = s.priceFrom && s.changeK != null && k > s.changeK ? s.priceFrom : s.base
      push({
        category: 'subscription', vendor: s.vendor,
        date: monthsAgo(k, ((s.vendor.length * 7) % 26) + 1),
        amount: base, description: `${s.vendor} monthly membership`, senderEmail: s.sender,
      })
    }
  }
  // Annual: Amazon Prime (covers 12 months) — twice across the window.
  for (const k of [20, 8]) {
    push({ category: 'subscription', vendor: 'Amazon Prime', date: monthsAgo(k, 4), amount: 139, termMonths: 12, description: 'Amazon Prime annual membership', senderEmail: 'auto-confirm@amazon.com' })
  }

  // 2. Orders — Amazon dominant; one flagship big-ticket buy (biggest purchase).
  const orderVendors = ['Amazon', 'Target', 'Best Buy', 'Etsy', 'IKEA', 'Walmart', 'Chewy']
  for (let i = 0; i < 46; i++) {
    const vendor = rand() < 0.4 ? 'Amazon' : pick(orderVendors)
    push({
      category: 'order', vendor,
      date: daysAgo(randInt(1, 760)),
      amount: amt(pick([24, 39, 58, 74, 112, 149]), 0.4),
      description: pick(['Household essentials', 'USB-C cables (3-pack)', 'Coffee beans, 2lb', 'Wireless mouse', 'Kitchen storage set', 'Phone case + screen protector', 'Running socks', 'Desk lamp']),
      senderEmail: `auto-confirm@${vendor.toLowerCase().replace(/[^a-z]/g, '')}.com`,
    })
  }
  push({ category: 'order', vendor: 'Apple Store', date: daysAgo(212), amount: 1999, description: 'MacBook Pro 14" (M-series)', senderEmail: 'no_reply@email.apple.com' })
  push({ category: 'order', vendor: 'Etsy', date: daysAgo(96), amount: 68, currency: 'EUR', description: 'Handmade ceramic mug set (Lisbon seller)', senderEmail: 'transaction@etsy.com' })

  // 3. Clothes
  const clothes = ['Uniqlo', 'Zara', 'Nike', 'Lululemon', 'J.Crew', 'Everlane']
  for (let i = 0; i < 19; i++) {
    push({
      category: 'clothes', vendor: pick(clothes),
      date: daysAgo(randInt(1, 730)),
      amount: amt(pick([29, 48, 69, 98, 128]), 0.35),
      description: pick(['Merino crewneck', 'Slim chinos', 'Everyday tee (3-pack)', 'Running shorts', 'Wool overshirt', 'Denim jacket']),
    })
  }

  // 4. Food & delivery — DoorDash-heavy (a "relationship"), some late-night.
  const food = ['DoorDash', 'Uber Eats', 'Starbucks', 'Chipotle', 'Sweetgreen', 'Grubhub']
  for (let i = 0; i < 48; i++) {
    const vendor = rand() < 0.42 ? 'DoorDash' : pick(food)
    const late = rand() < 0.4
    const d = daysAgo(randInt(1, 740)); d.setHours(late ? randInt(22, 23) : randInt(11, 20))
    push({
      category: 'food', vendor,
      date: d,
      amount: amt(pick([14, 19, 27, 34, 42]), 0.3),
      description: pick(['Dinner delivery', 'Lunch order', 'Late-night snack run', 'Coffee & pastry', 'Burrito bowl', 'Salad + drink']),
    })
  }

  // 5. Travel — larger, some foreign currency.
  push({ category: 'travel', vendor: 'United Airlines', date: daysAgo(180), amount: 428, description: 'SFO → JFK round trip', senderEmail: 'no-reply@united.com' })
  push({ category: 'travel', vendor: 'Delta',           date: daysAgo(365), amount: 512, description: 'LAX → SEA round trip' })
  push({ category: 'travel', vendor: 'Airbnb',          date: daysAgo(178), amount: 640, description: '3 nights, Brooklyn loft', senderEmail: 'automated@airbnb.com' })
  push({ category: 'travel', vendor: 'The Hoxton',      date: daysAgo(300), amount: 540, currency: 'GBP', description: '2 nights, London Shoreditch' })
  push({ category: 'travel', vendor: 'Hotel Gracery',   date: daysAgo(430), amount: 62000, currency: 'JPY', description: '4 nights, Tokyo Shinjuku' })
  push({ category: 'travel', vendor: 'Le Relais',       date: daysAgo(250), amount: 380, currency: 'EUR', description: '3 nights, Paris 11e' })
  push({ category: 'travel', vendor: 'Uber',            date: daysAgo(179), amount: 47, description: 'Airport ride' })
  for (let i = 0; i < 7; i++) push({ category: 'travel', vendor: pick(['Uber', 'Lyft', 'Amtrak', 'Marriott']), date: daysAgo(randInt(1, 720)), amount: amt(pick([38, 62, 118, 205]), 0.4), description: pick(['Rideshare', 'Train ticket', '1 night stay', 'Airport parking']) })

  // 6. Entertainment
  const ent = ['Ticketmaster', 'Steam', 'AMC Theatres', 'Eventbrite']
  for (let i = 0; i < 10; i++) push({ category: 'entertainment', vendor: pick(ent), date: daysAgo(randInt(1, 700)), amount: amt(pick([18, 32, 59, 89, 145]), 0.35), description: pick(['Concert tickets', 'Game purchase', 'Movie night (x2)', 'Comedy show', 'Festival pass']) })

  // 7. Charity / donations
  push({ category: 'charity', vendor: 'Wikimedia Foundation', date: daysAgo(120), amount: 25, description: 'Annual donation', senderEmail: 'donate@wikimedia.org' })
  push({ category: 'charity', vendor: 'charity: water',       date: daysAgo(300), amount: 40, description: 'Monthly giving', senderEmail: 'hello@charitywater.org' })
  push({ category: 'charity', vendor: 'Red Cross',            date: daysAgo(210), amount: 50, description: 'Disaster relief fund' })
  push({ category: 'charity', vendor: 'charity: water',       date: daysAgo(60),  amount: 40, description: 'Monthly giving' })
  push({ category: 'charity', vendor: 'Doctors Without Borders', date: daysAgo(400), amount: 75, description: 'One-time gift' })

  // 8. Refunds (netted against spend)
  push({ category: 'refund', vendor: 'Amazon', date: daysAgo(150), amount: 74, description: 'Returned: wireless earbuds' })
  push({ category: 'refund', vendor: 'Zara',   date: daysAgo(88),  amount: 48, description: 'Returned: denim jacket' })
  push({ category: 'refund', vendor: 'Amazon', date: daysAgo(40),  amount: 22, description: 'Price adjustment credit' })
  push({ category: 'refund', vendor: 'Best Buy', date: daysAgo(310), amount: 70, description: 'Returned: HDMI switch' })

  // 9. Shipping updates (not spend)
  for (let i = 0; i < 8; i++) push({ category: 'shipping', vendor: pick(['UPS', 'FedEx', 'USPS', 'Amazon Logistics']), date: daysAgo(randInt(1, 400)), description: pick(['Your package is out for delivery', 'Shipment delivered', 'Label created', 'In transit']) })

  // 10. Marketing — the inbox noise. Weighted so a few senders dominate.
  const promos: { vendor: string; sender: string; unsub: string | null }[] = [
    { vendor: 'Old Navy',    sender: 'deals@oldnavy.com',       unsub: 'https://email.oldnavy.com/unsub?u=demo' },
    { vendor: 'DoorDash',    sender: 'no-reply@doordash.com',   unsub: 'https://doordash.com/consumer/unsubscribe?u=demo' },
    { vendor: 'Groupon',     sender: 'noreply@r.groupon.com',   unsub: 'https://r.groupon.com/unsubscribe?u=demo' },
    { vendor: 'J.Crew',      sender: 'jcrew@e.jcrew.com',       unsub: 'https://e.jcrew.com/unsub?u=demo' },
    { vendor: 'Wayfair',     sender: 'save@emails.wayfair.com', unsub: 'https://emails.wayfair.com/unsub?u=demo' },
    { vendor: 'Booking.com', sender: 'news@booking.com',        unsub: 'https://booking.com/unsubscribe?u=demo' },
    { vendor: 'Sephora',     sender: 'sephora@email.sephora.com', unsub: 'mailto:unsubscribe@sephora.com' },
    { vendor: 'Nike',        sender: 'nike@notifications.nike.com', unsub: 'https://nike.com/email/unsub?u=demo' },
    { vendor: 'Grubhub',     sender: 'no-reply@eat.grubhub.com', unsub: null },
    { vendor: 'Best Buy',    sender: 'BestBuyInfo@emailinfo.bestbuy.com', unsub: 'https://emailinfo.bestbuy.com/unsub?u=demo' },
    { vendor: "Macy's",      sender: 'macys@email.macys.com',   unsub: 'https://email.macys.com/unsub?u=demo' },
    { vendor: 'Expedia',     sender: 'travel@mail.expedia.com', unsub: 'https://mail.expedia.com/unsub?u=demo' },
  ]
  const promoSubjects = [
    'Your exclusive offer is waiting', 'Up to 50% off — this weekend only', 'We miss you — here’s 20% off',
    'Flash sale ends tonight', 'New arrivals just dropped', 'Members get early access', 'Free shipping on everything',
    'Last chance: your cart is expiring', 'A little something for you', 'Deals you don’t want to miss',
  ]
  for (let i = 0; i < 118; i++) {
    // Zipf-ish weighting toward the first few senders.
    const idx = Math.min(promos.length - 1, Math.floor(Math.pow(rand(), 2.2) * promos.length))
    const p = promos[idx]
    push({ category: 'marketing', vendor: p.vendor, date: daysAgo(randInt(1, 500)), description: pick(promoSubjects), senderEmail: p.sender, unsubscribe: p.unsub })
  }

  // 11. Other
  for (let i = 0; i < 5; i++) push({ category: 'other', vendor: pick(['USPS', 'DMV', 'City Utilities', 'AAA']), date: daysAgo(randInt(1, 600)), amount: amt(pick([12, 35, 89]), 0.3), description: pick(['Membership renewal', 'Service fee', 'Utility payment', 'Registration']) })

  return out.sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first, like the API
}

export function demoTransactions(): Transaction[] {
  if (!_txns) _txns = buildLedger()
  return _txns
}

// ── Aggregation (ports of backend lib/stats.ts, operating on USD-normalized
//    amounts that the demo ledger already carries) ────────────────────────────

const usd = (t: Transaction) => t.amountUsd ?? t.amount ?? 0
const dt = (t: Transaction) => new Date(t.date)

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const factUsd = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const factDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

function computeFunFacts(spend: Transaction[]): WrappedStats['funFacts'] {
  const facts: NonNullable<WrappedStats['funFacts']> = []
  if (spend.length === 0) return facts
  const sorted = [...spend].sort((a, b) => dt(a).getTime() - dt(b).getTime())
  const withAmt = sorted.filter(e => usd(e) > 0)

  const first = sorted[0]
  facts.push({ emoji: '🌱', label: 'First purchase', value: factDate(dt(first)), detail: first.vendor })

  const byDay = new Map<number, { sum: number; count: number; date: Date }>()
  for (const e of withAmt) {
    const k = dayStart(dt(e))
    const cur = byDay.get(k) ?? { sum: 0, count: 0, date: dt(e) }
    cur.sum += usd(e); cur.count++
    byDay.set(k, cur)
  }
  if (byDay.size > 0) {
    const big = [...byDay.values()].reduce((m, d) => (d.sum > m.sum ? d : m))
    facts.push({ emoji: '💥', label: 'Biggest spending day', value: factDate(big.date), detail: `${factUsd(big.sum)} · ${big.count} purchase${big.count === 1 ? '' : 's'}` })
  }

  if (withAmt.length > 0) {
    const dow = Array(7).fill(0)
    for (const e of withAmt) dow[dt(e).getDay()] += usd(e)
    let top = 0
    for (let i = 1; i < 7; i++) if (dow[i] > dow[top]) top = i
    if (dow[top] > 0) facts.push({ emoji: '📅', label: 'Favorite spending day', value: `${WEEKDAYS[top]}s`, detail: `${factUsd(dow[top])} total` })
  }

  const byMonth = new Map<string, { count: number; date: Date }>()
  for (const e of sorted) {
    const k = ym(dt(e))
    const cur = byMonth.get(k) ?? { count: 0, date: new Date(dt(e).getFullYear(), dt(e).getMonth(), 1) }
    cur.count++
    byMonth.set(k, cur)
  }
  if (byMonth.size > 1) {
    const busy = [...byMonth.values()].reduce((m, d) => (d.count > m.count ? d : m))
    facts.push({ emoji: '🔥', label: 'Busiest month', value: busy.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), detail: `${busy.count} purchases` })
  }

  const vendors = new Set(sorted.map(e => e.vendor))
  if (vendors.size >= 2) facts.push({ emoji: '🏪', label: 'Vendors visited', value: `${vendors.size}`, detail: 'different merchants' })

  return facts
}

export function computeSubscriptionInsights(subEntries: Transaction[]): {
  insights: SubscriptionInsight[]; monthlyCost: number; annualCost: number
} {
  const byVendor: Record<string, Transaction[]> = {}
  for (const e of subEntries) (byVendor[e.vendor] ??= []).push(e)

  const insights: SubscriptionInsight[] = Object.entries(byVendor).map(([vendor, list]) => {
    const sorted = [...list].sort((a, b) => dt(a).getTime() - dt(b).getTime())
    const withAmount = sorted.filter(e => usd(e) > 0)
    const lastWith = withAmount.length ? withAmount[withAmount.length - 1] : null
    const lastAmount = lastWith ? usd(lastWith) : null
    const lastTerm = lastWith?.termMonths ?? null

    let medianGap = 30.44
    if (sorted.length >= 2) {
      const gaps: number[] = []
      for (let i = 1; i < sorted.length; i++) gaps.push((dt(sorted[i]).getTime() - dt(sorted[i - 1]).getTime()) / DAY)
      gaps.sort((a, b) => a - b)
      medianGap = gaps[Math.floor(gaps.length / 2)] || 30.44
    }

    let cadence: SubscriptionInsight['cadence']
    if (lastTerm && lastTerm >= 12) cadence = 'annual'
    else if (medianGap <= 10) cadence = 'weekly'
    else if (medianGap > 250) cadence = 'annual'
    else cadence = 'monthly'

    const monthlyEstimate = lastAmount == null ? 0
      : lastTerm && lastTerm > 1 ? round2(lastAmount / lastTerm)
      : round2(lastAmount * (30.44 / medianGap))

    const lastCharge = dt(sorted[sorted.length - 1])
    const ageDays = (NOW.getTime() - lastCharge.getTime()) / DAY
    const active = cadence === 'annual' ? ageDays <= 400 : ageDays <= 45

    return { vendor, monthlyEstimate, lastAmount, cadence, lastCharge: lastCharge.toISOString().slice(0, 10), chargeCount: list.length, active }
  })

  insights.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
  const monthlyCost = round2(insights.filter(i => i.active).reduce((s, i) => s + i.monthlyEstimate, 0))
  return { insights, monthlyCost, annualCost: round2(monthlyCost * 12) }
}

function computeStats(entries: Transaction[]): WrappedStats {
  const spend     = entries.filter(e => SPEND.has(e.category))
  const marketing = entries.filter(e => e.category === 'marketing')
  const charity   = entries.filter(e => e.category === 'charity')
  const refunds   = entries.filter(e => e.category === 'refund')

  const refundTotal = round2(refunds.reduce((s, e) => s + usd(e), 0))
  const totalSpend = round2(spend.reduce((s, e) => s + usd(e), 0) - refundTotal)

  const byCategory: WrappedStats['byCategory'] = {}
  for (const e of entries) {
    (byCategory[e.category] ??= { count: 0, spend: 0 })
    byCategory[e.category].count++
    byCategory[e.category].spend += usd(e)
  }
  for (const c of Object.keys(byCategory)) byCategory[c].spend = round2(byCategory[c].spend)

  const freq: Record<string, number> = {}
  for (const e of spend) freq[e.vendor] = (freq[e.vendor] ?? 0) + 1
  const topVendors = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([vendor, count]) => ({ vendor, count }))

  const withAmount = spend.filter(e => usd(e) > 0)
  const me = withAmount.length ? withAmount.reduce((max, e) => (usd(e) > usd(max) ? e : max)) : null

  const monthlySpend: Record<string, number> = {}
  for (const e of spend) { if (!usd(e)) continue; const k = ym(dt(e)); monthlySpend[k] = round2((monthlySpend[k] ?? 0) + usd(e)) }
  for (const e of refunds) { if (!usd(e)) continue; const k = ym(dt(e)); monthlySpend[k] = round2((monthlySpend[k] ?? 0) - usd(e)) }

  const subEntries = entries.filter(e => e.category === 'subscription')
  const subscriptions = [...new Set(subEntries.map(e => e.vendor))]
  const radar = computeSubscriptionInsights(subEntries)

  const spamAcc: Record<string, SpammerStat> = {}
  for (const e of marketing) {
    const s = (spamAcc[e.vendor] ??= { vendor: e.vendor, count: 0, senderEmail: e.senderEmail, unsubscribe: e.unsubscribe })
    s.count++
    if (!s.senderEmail && e.senderEmail) s.senderEmail = e.senderEmail
    if (!s.unsubscribe && e.unsubscribe) s.unsubscribe = e.unsubscribe
  }
  const topSpammers = Object.values(spamAcc).sort((a, b) => b.count - a.count).slice(0, 10)

  const charityMap: Record<string, { count: number; total: number }> = {}
  for (const e of charity) { (charityMap[e.vendor] ??= { count: 0, total: 0 }); charityMap[e.vendor].count++; charityMap[e.vendor].total += usd(e) }
  const charities = Object.entries(charityMap).sort((a, b) => b[1].total - a[1].total).map(([vendor, { count, total }]) => ({ vendor, count, total: round2(total) }))
  const charityTotal = round2(charity.reduce((s, e) => s + usd(e), 0))

  return {
    totalSpend, refundTotal, byCategory, topVendors,
    mostExpensive: me ? { vendor: me.vendor, amount: usd(me), description: me.description, date: me.date, emailId: me.emailId, termMonths: me.termMonths } : null,
    monthlySpend, subscriptions, subscriptionCount: subscriptions.length,
    subscriptionInsights: radar.insights, monthlySubscriptionCost: radar.monthlyCost, annualSubscriptionCost: radar.annualCost,
    topSpammers, charities, charityTotal, funFacts: computeFunFacts(spend),
  }
}

function inScope(t: Transaction, scope: WrappedScope): boolean {
  const d = dt(t)
  if (scope.mode === 'year') return d.getFullYear() === scope.year
  if (scope.mode === 'month') { const [y, m] = scope.month.split('-').map(Number); return d.getFullYear() === y && d.getMonth() + 1 === m }
  if (scope.mode === 'custom') {
    const from = new Date(scope.from); const to = new Date(scope.to); to.setHours(23, 59, 59, 999)
    return d >= from && d <= to
  }
  return true
}

export function demoWrapped(scope: WrappedScope = { mode: 'total' }): WrappedData {
  const all = demoTransactions()
  const availableYears = [...new Set(all.map(e => dt(e).getFullYear()))].sort((a, b) => b - a)
  const availableMonths = [...new Set(all.map(e => ym(dt(e))))].sort((a, b) => (a < b ? 1 : -1))
  const scoped = all.filter(t => inScope(t, scope))
  return {
    connected: true,
    email: DEMO_EMAIL,
    totalEntries: scoped.length,
    year: scope.mode === 'year' ? scope.year : null,
    from: scope.mode === 'custom' ? scope.from : null,
    to: scope.mode === 'custom' ? scope.to : null,
    availableYears,
    availableMonths,
    stats: scoped.length ? computeStats(scoped) : null,
  }
}

// ── Monitor deck ─────────────────────────────────────────────────────────────

function lastNMonths(n: number): string[] {
  const arr: string[] = []
  for (let i = n - 1; i >= 0; i--) arr.push(ym(new Date(NOW.getFullYear(), NOW.getMonth() - i, 1)))
  return arr
}
function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function kpi(value: number, prev: number): KpiPair {
  const deltaPct = prev > 0 ? Math.round(((value - prev) / prev) * 100) : null
  return { value: round2(value), prev: round2(prev), deltaPct }
}
const netSpend = (list: Transaction[]) =>
  list.filter(e => SPEND.has(e.category)).reduce((s, e) => s + usd(e), 0) -
  list.filter(e => e.category === 'refund').reduce((s, e) => s + usd(e), 0)

export function demoMonitor(period: 'month' | 'year'): MonitorData {
  const all = demoTransactions()

  // Current / previous comparison windows.
  const curKey = ym(NOW)
  const prevKey = ym(new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1))
  const inKey = (t: Transaction, k: string) => ym(dt(t)) === k
  const inYear = (t: Transaction, y: number) => dt(t).getFullYear() === y
  const curYear = NOW.getFullYear()

  const cur = period === 'month' ? all.filter(t => inKey(t, curKey)) : all.filter(t => inYear(t, curYear))
  const prev = period === 'month' ? all.filter(t => inKey(t, prevKey)) : all.filter(t => inYear(t, curYear - 1))

  const sumCat = (list: Transaction[], cat: string) => list.filter(e => e.category === cat).reduce((s, e) => s + usd(e), 0)
  const countCat = (list: Transaction[], cat: string) => list.filter(e => e.category === cat).length

  const kpis = {
    spend:            kpi(netSpend(cur), netSpend(prev)),
    transactions:     kpi(cur.filter(e => SPEND.has(e.category)).length, prev.filter(e => SPEND.has(e.category)).length),
    subscriptionSpend: kpi(sumCat(cur, 'subscription'), sumCat(prev, 'subscription')),
    promoEmails:      kpi(countCat(cur, 'marketing'), countCat(prev, 'marketing')),
    donations:        kpi(sumCat(cur, 'charity'), sumCat(prev, 'charity')),
  }

  // Analytics — last 12 months, per category.
  const months = lastNMonths(12)
  const cats = [...new Set(all.map(e => e.category))]
  const countByCategory: Record<string, number[]> = {}
  const spendByCategory: Record<string, number[]> = {}
  for (const c of cats) {
    countByCategory[c] = months.map(() => 0)
    spendByCategory[c] = months.map(() => 0)
  }
  const mIndex = new Map(months.map((m, i) => [m, i]))
  for (const e of all) {
    const i = mIndex.get(ym(dt(e)))
    if (i == null) continue
    countByCategory[e.category][i]++
    spendByCategory[e.category][i] = round2(spendByCategory[e.category][i] + usd(e))
  }

  // Subscription monitor.
  const subEntries = all.filter(e => e.category === 'subscription')
  const radar = computeSubscriptionInsights(subEntries)
  const firstChargeInWindow = (vendor: string) => {
    const first = subEntries.filter(e => e.vendor === vendor).sort((a, b) => dt(a).getTime() - dt(b).getTime())[0]
    return first ? (period === 'month' ? inKey(first, curKey) : inYear(first, curYear)) : false
  }
  const newlyDetected = radar.insights.filter(i => firstChargeInWindow(i.vendor)).map(i => ({ vendor: i.vendor, monthlyEstimate: i.monthlyEstimate }))

  const priceChanges: { vendor: string; from: number; to: number }[] = []
  const byVendor: Record<string, Transaction[]> = {}
  for (const e of subEntries) (byVendor[e.vendor] ??= []).push(e)
  for (const [vendor, list] of Object.entries(byVendor)) {
    const amts = list.filter(e => usd(e) > 0).sort((a, b) => dt(a).getTime() - dt(b).getTime()).map(usd)
    for (let i = amts.length - 1; i > 0; i--) {
      if (Math.abs(amts[i] - amts[i - 1]) > 0.5) { priceChanges.push({ vendor, from: amts[i - 1], to: amts[i] }); break }
    }
  }

  const renewals = predictRenewals(radar.insights, 45)

  // Top marketing senders, current vs previous window.
  const senderCur: Record<string, number> = {}
  const senderPrev: Record<string, number> = {}
  for (const e of cur) if (e.category === 'marketing') senderCur[e.vendor] = (senderCur[e.vendor] ?? 0) + 1
  for (const e of prev) if (e.category === 'marketing') senderPrev[e.vendor] = (senderPrev[e.vendor] ?? 0) + 1
  const topSenders = Object.entries(senderCur)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([vendor, count]) => ({ vendor, count, prevCount: senderPrev[vendor] ?? 0 }))

  // Budgets (this month), so the bars are meaningful.
  const thisMonth = all.filter(t => inKey(t, curKey))
  const budgets = [
    { category: 'overall', label: 'Overall', amount: 2500 },
    { category: 'food', label: 'Food & Delivery', amount: 300 },
  ].map(b => {
    const spent = b.category === 'overall' ? netSpend(thisMonth) : sumCat(thisMonth, b.category)
    return { ...b, spent: round2(spent), pct: Math.round((spent / b.amount) * 100) }
  })

  // Auto-flags.
  const flags: MonitorData['flags'] = []
  if (kpis.spend.deltaPct != null && kpis.spend.deltaPct >= 15) flags.push({ kind: 'up', text: `Spending up ${kpis.spend.deltaPct}% vs last ${period === 'month' ? 'month' : 'year'}` })
  if (kpis.spend.deltaPct != null && kpis.spend.deltaPct <= -15) flags.push({ kind: 'down', text: `Spending down ${Math.abs(kpis.spend.deltaPct)}% — nice` })
  if (newlyDetected.length) flags.push({ kind: 'new', text: `New subscription detected: ${newlyDetected[0].vendor}` })
  const overBudget = budgets.find(b => b.pct >= 100)
  if (overBudget) flags.push({ kind: 'up', text: `${overBudget.label} budget ${overBudget.pct}% used this month` })

  // Trend block (MoM + YoY), independent of the toggle.
  const momFrom = netSpend(all.filter(t => inKey(t, prevKey)))
  const momTo = netSpend(all.filter(t => inKey(t, curKey)))
  const yoyKey = ym(new Date(NOW.getFullYear() - 1, NOW.getMonth(), 1))
  const yoyFrom = netSpend(all.filter(t => inKey(t, yoyKey)))
  const mkTrend = (fromLabel: string, toLabel: string, from: number, to: number) => ({
    fromLabel, toLabel, from: round2(from), to: round2(to),
    deltaPct: from > 0 ? Math.round(((to - from) / from) * 100) : null,
  })

  return {
    connected: true,
    email: DEMO_EMAIL,
    empty: false,
    period,
    currentLabel: period === 'month' ? monthName(curKey) : String(curYear),
    previousLabel: period === 'month' ? monthName(prevKey) : String(curYear - 1),
    kpis,
    analytics: { months, categories: cats, countByCategory, spendByCategory },
    subscriptions: { monthlyBurn: radar.monthlyCost, activeCount: radar.insights.filter(i => i.active).length, newlyDetected, priceChanges, renewals },
    topSenders,
    budgets,
    flags,
    trend: {
      mom: mkTrend(monthName(prevKey), monthName(curKey), momFrom, momTo),
      yoy: mkTrend(monthName(yoyKey), monthName(curKey), yoyFrom, momTo),
    },
  }
}

// Predict the next charge date per active subscription, within `withinDays`.
function predictRenewals(insights: SubscriptionInsight[], withinDays: number): Renewal[] {
  const interval: Record<SubscriptionInsight['cadence'], number> = { weekly: 7, monthly: 30, annual: 365 }
  const out: Renewal[] = []
  for (const i of insights) {
    if (!i.active) continue
    const step = interval[i.cadence]
    let next = new Date(i.lastCharge)
    while (next.getTime() <= NOW.getTime()) next = new Date(next.getTime() + step * DAY)
    const daysAway = Math.round((next.getTime() - NOW.getTime()) / DAY)
    if (daysAway <= withinDays) out.push({ vendor: i.vendor, amount: i.lastAmount, cadence: i.cadence, date: next.toISOString().slice(0, 10), daysAway })
  }
  return out.sort((a, b) => a.daysAway - b.daysAway)
}

// ── Upcoming + Promotions (anchored to "now" so they always look current) ──────

export function demoUpcoming(): { upcoming: UpcomingItem[]; renewals: Renewal[] } {
  const future = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()
  const upcoming: UpcomingItem[] = [
    { id: 'up-1', category: 'order',         vendor: 'Amazon',          description: 'Echo Dot (5th Gen) — arriving', eventDate: future(2),  emailId: 'demo0000000000a1' },
    { id: 'up-2', category: 'order',         vendor: 'IKEA',            description: 'HEMNES dresser delivery',       eventDate: future(5),  emailId: 'demo0000000000a2' },
    { id: 'up-3', category: 'travel',        vendor: 'United Airlines', description: 'SFO → JFK, seat 14C',            eventDate: future(9),  emailId: 'demo0000000000a3' },
    { id: 'up-4', category: 'travel',        vendor: 'Airbnb',          description: 'Check-in: Brooklyn loft',        eventDate: future(11), emailId: 'demo0000000000a4' },
    { id: 'up-5', category: 'entertainment', vendor: 'Ticketmaster',    description: 'Tame Impala — Chase Center',     eventDate: future(21), emailId: 'demo0000000000a5' },
  ]
  const { subscriptions } = demoMonitor('month')
  return { upcoming, renewals: subscriptions?.renewals ?? [] }
}

export function demoPromotions(): Promotion[] {
  const future = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()
  return [
    { id: 'promo-1', vendor: 'Old Navy',    description: '50% off everything + free shipping', promoCode: 'SAVE50',   discount: '50% off', expiresAt: future(3),  emailId: 'demo0000000000b1' },
    { id: 'promo-2', vendor: 'Best Buy',    description: 'Open-box clearance event',           promoCode: 'OPENBOX',  discount: null,      expiresAt: future(2),  emailId: 'demo0000000000b2' },
    { id: 'promo-3', vendor: 'DoorDash',    description: '$15 off your next 2 orders',         promoCode: 'DASH15',   discount: '$15 off', expiresAt: future(6),  emailId: 'demo0000000000b3' },
    { id: 'promo-4', vendor: 'Booking.com', description: 'Early getaway deals',                promoCode: null,       discount: '15% off', expiresAt: future(9),  emailId: 'demo0000000000b4' },
    { id: 'promo-5', vendor: 'Sephora',     description: 'Spring savings event',               promoCode: 'BEAUTY20', discount: '20% off', expiresAt: future(14), emailId: 'demo0000000000b5' },
    { id: 'promo-6', vendor: 'Nike',        description: 'Member exclusive — extra 25%',       promoCode: 'MEMBER25', discount: '25% off', expiresAt: null,       emailId: 'demo0000000000b6' },
  ]
}
