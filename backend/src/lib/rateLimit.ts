// Minimal in-memory per-key rate limiter. Single-instance deploy, so an
// in-process Map is sufficient (no Redis needed). Each call counts one hit;
// returns true when the key has exceeded `max` hits inside the current window.
//
// Expired entries are swept opportunistically so the Map can't grow unbounded
// as distinct keys (e.g. attacker IPs) accumulate over the life of the process.
export function makeRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  let lastSweep = Date.now()

  function sweep(now: number) {
    for (const [k, rec] of hits) {
      if (rec.resetAt < now) hits.delete(k)
    }
    lastSweep = now
  }

  return function limited(key: string): boolean {
    const now = Date.now()
    // Periodically drop expired buckets (at most once per window) to bound memory.
    if (now - lastSweep > windowMs) sweep(now)

    const rec = hits.get(key)
    if (!rec || rec.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return false
    }
    rec.count++
    return rec.count > max
  }
}
