// Per-vendor sensitivity for unusual-charge alerts (§9 A8).
//
// The spike test is "this charge >= median(the vendor's prior charges) ×
// multiplier". Everyone starts at DEFAULT; marking an alert Expected or
// Not expected stores a personal multiplier for that vendor, so the alerts
// get more useful the more the user corrects them. House rule: this only ever
// compares the user to their own history — never to other users.

/** Sensitivity when the user has said nothing about a vendor. */
export const DEFAULT_MULTIPLIER = 3

/** "Not expected" — watch this vendor more closely than the default. */
export const WATCH_MULTIPLIER = 2

/** Ceiling, so one freak charge can't silence a vendor forever. */
export const MAX_MULTIPLIER = 25

/** Headroom over the charge the user just accepted, so a repeat won't re-flag. */
const HEADROOM = 1.25

export function clampMultiplier(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MULTIPLIER
  return Math.min(MAX_MULTIPLIER, Math.max(WATCH_MULTIPLIER, Math.round(n * 100) / 100))
}

/**
 * The multiplier to store when the user judges an alert.
 *
 * `expected` → raise the bar just above the charge they accepted (never below
 * the default, never above the cap), so this vendor stops crying wolf.
 * `!expected` → the alert was useful; tighten to WATCH so smaller spikes from
 * this vendor also surface.
 *
 * `ratio` is the flagged charge ÷ the vendor's median. A missing or nonsense
 * ratio falls back to nudging the current setting up by the headroom.
 */
export function nextMultiplier(current: number | null, ratio: number, expected: boolean): number {
  if (!expected) return WATCH_MULTIPLIER
  const base = current ?? DEFAULT_MULTIPLIER
  const target = Number.isFinite(ratio) && ratio > 0 ? ratio * HEADROOM : base * HEADROOM
  return clampMultiplier(Math.max(base, target, DEFAULT_MULTIPLIER))
}

/** The multiplier in force for a vendor (personal setting, else the default). */
export function multiplierFor(tolerances: Record<string, number>, vendor: string): number {
  const t = tolerances[vendor]
  return Number.isFinite(t) && t > 0 ? t : DEFAULT_MULTIPLIER
}
