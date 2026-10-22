/**
 * In-memory fixed-window limiter keyed by client (IP). Adequate for a single
 * instance; put a shared store (Redis, the host's edge rate limiting) in front
 * if you scale out.
 */
export class RateLimiter {
  private readonly minute = new Map<string, { start: number; count: number }>();
  private readonly day = new Map<string, { start: number; count: number }>();

  private readonly perMinute: number;
  private readonly perDay: number;
  private readonly now: () => number;

  constructor(perMinute: number, perDay: number, now: () => number = Date.now) {
    this.perMinute = perMinute;
    this.perDay = perDay;
    this.now = now;
  }

  /** Returns 0 when allowed, otherwise the number of seconds to wait. */
  check(key: string): number {
    const t = this.now();
    const m = this.hit(this.minute, key, t, 60_000, this.perMinute);
    if (m > 0) return m;
    return this.hit(this.day, key, t, 86_400_000, this.perDay);
  }

  private hit(
    store: Map<string, { start: number; count: number }>,
    key: string,
    t: number,
    windowMs: number,
    limit: number,
  ): number {
    const entry = store.get(key);
    if (!entry || t - entry.start >= windowMs) {
      store.set(key, { start: t, count: 1 });
      if (store.size > 50_000) this.prune(store, t, windowMs);
      return 0;
    }
    if (entry.count >= limit) return Math.ceil((entry.start + windowMs - t) / 1000);
    entry.count++;
    return 0;
  }

  private prune(store: Map<string, { start: number; count: number }>, t: number, windowMs: number): void {
    for (const [key, entry] of store) if (t - entry.start >= windowMs) store.delete(key);
  }
}
