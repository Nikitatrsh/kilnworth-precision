// Rate limit behind one small interface, so Upstash or a Vercel WAF rule can replace the in-memory
// version later without touching the handlers.
export interface RateLimiter {
  /** Counts one request for `key`. Refused requests are not counted. */
  hit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

const MAX_KEYS = 10_000;

/**
 * shortcut: counts per server instance. On serverless every warm instance has its own memory, so
 * the real limit is looser than the number set here; upgrade to Upstash or a Vercel WAF rule
 * before a client relies on it.
 */
export function memoryRateLimiter(now: () => number = Date.now): RateLimiter & { size(): number } {
  const hits = new Map<string, { times: number[]; windowMs: number }>();

  function forget() {
    const t = now();
    for (const [key, entry] of hits) {
      if (entry.times.every((time) => time <= t - entry.windowMs)) hits.delete(key);
    }
    // Still too many live keys (a flood from many addresses): drop the oldest.
    for (const key of hits.keys()) {
      if (hits.size <= MAX_KEYS) break;
      hits.delete(key);
    }
  }

  return {
    size: () => hits.size,
    async hit(key, limit, windowMs) {
      const t = now();
      if (hits.size >= MAX_KEYS) forget();
      const entry = hits.get(key) ?? { times: [], windowMs };
      entry.windowMs = windowMs;
      entry.times = entry.times.filter((time) => time > t - windowMs);
      hits.set(key, entry);
      if (entry.times.length >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((entry.times[0] + windowMs - t) / 1000),
        };
      }
      entry.times.push(t);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
