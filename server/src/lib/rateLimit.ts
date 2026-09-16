// Minimal in-memory fixed-window limiter for the public, unauthenticated
// booking-request endpoint. Good enough to blunt casual abuse/spam on a
// single-instance deployment; not a substitute for a real WAF at scale.
const hits = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
