// Minimal in-memory per-key rate limiter. Single-instance deploy, so an
// in-process Map is sufficient (no Redis needed). Each call counts one hit;
// returns true when the key has exceeded `max` hits inside the current window.
export function makeRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return function limited(key: string): boolean {
    const now = Date.now()
    const rec = hits.get(key)
    if (!rec || rec.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return false
    }
    rec.count++
    return rec.count > max
  }
}
