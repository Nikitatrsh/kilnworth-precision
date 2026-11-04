import { describe, expect, it } from 'vitest';
import { memoryRateLimiter } from './ratelimit';

const HOUR = 3_600_000;

describe('memoryRateLimiter', () => {
  it('allows up to the limit, then refuses with a retry time', async () => {
    let now = 0;
    const limiter = memoryRateLimiter(() => now);
    for (let i = 0; i < 5; i++) expect((await limiter.hit('ip-1', 5, HOUR)).allowed).toBe(true);
    now = 60_000;
    const sixth = await limiter.hit('ip-1', 5, HOUR);
    expect(sixth).toEqual({ allowed: false, retryAfterSeconds: 3540 });
  });

  it('counts each key on its own', async () => {
    const limiter = memoryRateLimiter(() => 0);
    await limiter.hit('a', 1, HOUR);
    expect((await limiter.hit('a', 1, HOUR)).allowed).toBe(false);
    expect((await limiter.hit('b', 1, HOUR)).allowed).toBe(true);
  });

  it('lets requests through again once the window has passed', async () => {
    let now = 0;
    const limiter = memoryRateLimiter(() => now);
    await limiter.hit('a', 1, HOUR);
    now = HOUR + 1;
    expect((await limiter.hit('a', 1, HOUR)).allowed).toBe(true);
  });

  it('does not count refused requests, so waiting is enough', async () => {
    let now = 0;
    const limiter = memoryRateLimiter(() => now);
    await limiter.hit('a', 1, HOUR);
    for (now = 1; now < 1000; now += 100) await limiter.hit('a', 1, HOUR);
    now = HOUR + 1;
    expect((await limiter.hit('a', 1, HOUR)).allowed).toBe(true);
  });

  it('does not grow without bound under many different keys', async () => {
    let now = 0;
    const limiter = memoryRateLimiter(() => now);
    for (let i = 0; i < 20_000; i++) {
      now = i;
      await limiter.hit(`ip-${i}`, 5, 1000);
    }
    expect(limiter.size()).toBeLessThanOrEqual(10_000);
  });
});
