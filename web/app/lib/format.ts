// Shared currency formatting (single source of truth for the whole app).

// USD by default; pass a currency code for a foreign amount (¥, €, …). Falls
// back to USD if the code is missing/invalid so it never throws.
export function money(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(n)
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  }
}

// Whole-dollar USD (no cents) — for charts, KPI tiles, and axis labels.
export function moneyWhole(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
