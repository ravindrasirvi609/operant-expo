/**
 * Single-instance, in-memory sliding-window rate limiter. Good enough to blunt
 * casual abuse of public auth/booking endpoints on a single deployment; it is
 * NOT a distributed limiter — a multi-instance deployment needs a shared store
 * (e.g. Redis) instead. Swap the implementation behind this same function
 * signature when that becomes necessary.
 */
const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, options: { limit: number; windowMs: number }) {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const existing = (hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
  const allowed = existing.length < options.limit;
  if (allowed) existing.push(now);
  hits.set(key, existing);
  return { allowed, remaining: Math.max(0, options.limit - existing.length) };
}
