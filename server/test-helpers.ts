// Shared by the endpoint tests: a Deps with fakes, and a way to build browser-like requests.
import { vi } from 'vitest';
import { memoryRateLimiter } from './adapters/ratelimit.js';
import type { MailMessage } from './adapters/mail.js';
import type { Storage, StoredFile } from './adapters/storage.js';
import type { Deps } from './deps.js';

export const SITE = 'https://kilnworth.example';

export interface Fakes {
  deps: Deps;
  sent: MailMessage[];
  /** Make the next mails fail: the first n calls, or only those whose recipient matches. */
  failMail(match?: (m: MailMessage) => boolean): void;
  files: Map<string, StoredFile>;
  inspect: ReturnType<typeof vi.fn>;
}

export function makeFakes(storageMode: 'blob' | 'local' = 'blob'): Fakes {
  const sent: MailMessage[] = [];
  const files = new Map<string, StoredFile>();
  let fails: ((m: MailMessage) => boolean) | null = null;
  const inspect = vi.fn(async (url: string) => files.get(url) ?? null);

  const storage: Storage = {
    mode: storageMode,
    issueUpload: vi.fn(async (body) => ({
      type: 'blob.generate-client-token',
      clientToken: 'token-for-test',
      echo: body,
    })),
    inspect,
    shareLinks: async (urls) => urls.map((u) => `${u}?signed=1`),
  };

  const deps: Deps = {
    config: {
      onVercel: false,
      mail: { mode: 'file', from: 'onboarding@resend.dev', toShop: 'shop@kilnworth.example' },
      storage: { mode: storageMode },
    },
    mail: {
      send: async (m) => {
        if (fails?.(m)) throw new Error('mail provider down: dana@northline.example');
        sent.push(m);
      },
    },
    storage,
    limiter: memoryRateLimiter(),
    now: () => new Date('2026-11-04T12:00:00Z'),
    newId: () => 'KP-261104-TEST7',
  };

  return { deps, sent, files, inspect, failMail: (match = () => true) => (fails = match) };
}

/** A request as the site's own page would make it. */
export function browserPost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${SITE}${path}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: SITE,
      host: 'kilnworth.example',
      'x-real-ip': '203.0.113.7',
      ...headers,
    },
  });
}
