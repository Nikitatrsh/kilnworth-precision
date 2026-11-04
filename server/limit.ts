// The hourly request limits of both endpoints: one window length and one way to say "too many".
import type { Deps } from './deps.js';
import { tooManyRequests } from './http.js';

const HOUR_MS = 60 * 60 * 1000;

/** Counts one hit for `key`; throws the 429 answer (with Retry-After) once `max` per hour is passed. */
export async function limitPerHour(deps: Deps, key: string, max: number): Promise<void> {
  const { allowed, retryAfterSeconds } = await deps.limiter.hit(key, max, HOUR_MS);
  if (!allowed) throw tooManyRequests(retryAfterSeconds);
}
