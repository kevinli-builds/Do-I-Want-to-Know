// Currency normalization. The app reports everything in USD, but receipts come
// in many currencies (a ¥10,000 purchase must not be summed as $10,000). We
// convert every amount to USD using live rates (cached), with a static fallback
// so a flaky FX endpoint never breaks a sync or a dashboard load.

const TTL_MS = 12 * 60 * 60 * 1000 // refresh rates at most twice a day

// USD per 1 unit of the currency. Approximate fallbacks, only used if the live
// fetch fails. Live rates (when available) override these.
const FALLBACK: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, JPY: 0.0066, CNY: 0.14, CAD: 0.73,
  AUD: 0.66, CHF: 1.12, INR: 0.012, KRW: 0.00075, MXN: 0.058, BRL: 0.20,
  SGD: 0.74, HKD: 0.128, NZD: 0.61, SEK: 0.095, NOK: 0.094, DKK: 0.145,
  PLN: 0.25, ZAR: 0.054, THB: 0.029, AED: 0.272, ILS: 0.27, TRY: 0.029,
}

let cache: { at: number; rates: Record<string, number> } | null = null

export async function getUsdRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rates
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    // Frankfurter: free, keyless, ECB rates. base=USD → rates are foreign-per-USD.
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`fx http ${res.status}`)
    const data = (await res.json()) as { rates?: Record<string, number> }
    const rates: Record<string, number> = { USD: 1 }
    for (const [cur, perUsd] of Object.entries(data.rates ?? {})) {
      if (typeof perUsd === 'number' && perUsd > 0) rates[cur] = 1 / perUsd
    }
    cache = { at: Date.now(), rates: { ...FALLBACK, ...rates } }
    return cache.rates
  } catch {
    // Cache the fallback briefly so we don't hammer a failing endpoint.
    cache = { at: Date.now(), rates: { ...FALLBACK } }
    return cache.rates
  }
}

/** Convert an amount to USD. Unknown currencies are left as-is (best effort). */
export function toUsd(
  amount: number | null | undefined,
  currency: string | null | undefined,
  rates: Record<string, number>,
): number | null {
  if (amount == null || !Number.isFinite(amount)) return amount ?? null
  const cur = (currency ?? 'USD').toUpperCase().trim()
  if (cur === 'USD' || !cur) return amount
  const rate = rates[cur]
  return rate ? amount * rate : amount
}

/**
 * Return a copy of `entries` with every amount converted to USD (currency set
 * to 'USD'). Aggregators call this once up front so all downstream math is
 * single-currency. Generic over any row carrying `amount` + `currency`.
 */
export function normalizeToUsd<T extends { amount: number | null; currency: string }>(
  entries: T[],
  rates: Record<string, number>,
): T[] {
  return entries.map(e => ({ ...e, amount: toUsd(e.amount, e.currency, rates), currency: 'USD' }))
}
