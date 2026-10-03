/**
 * Rate limiting behind a small interface so a shared store (Redis) can replace the
 * in-memory implementation when running more than one instance.
 */
export type RateResult = { ok: boolean; retryAfterSec: number };

export interface RateLimitStore {
  /** Count a hit for `key`; returns the new count and when the window ends. */
  hit(key: string, windowMs: number): { count: number; resetAt: number };
  peek(key: string): { count: number; resetAt: number } | null;
  reset(key: string): void;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, windowMs: number) {
    const now = Date.now();
    this.sweep(now);
    const cur = this.buckets.get(key);
    if (!cur || cur.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    cur.count += 1;
    return cur;
  }

  peek(key: string) {
    const cur = this.buckets.get(key);
    return cur && cur.resetAt > Date.now() ? cur : null;
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  private sweep(now: number) {
    if (this.buckets.size < 5000) return;
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const { count, resetAt } = store.hit(key, windowMs);
  if (count > limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) };
  return { ok: true, retryAfterSec: 0 };
}

/** Is `key` currently over `limit`? Does not count a hit. */
export function isLimited(key: string, limit: number): RateResult {
  const cur = store.peek(key);
  if (cur && cur.count >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - Date.now()) / 1000)) };
  return { ok: true, retryAfterSec: 0 };
}

export function recordFailure(key: string, windowMs: number) {
  return store.hit(key, windowMs).count;
}

export function clearKey(key: string) {
  store.reset(key);
}
