// Builds the adapters the endpoints use, from the environment. One place decides "real or mock".
import { join } from 'node:path';
import { site } from '../src/config/site.js';
import { fileMailer } from './adapters/mail-file.js';
import { withTestRecipient, type Mailer } from './adapters/mail.js';
import { resendMailer } from './adapters/mail-resend.js';
import { memoryRateLimiter, type RateLimiter } from './adapters/ratelimit.js';
import type { Storage } from './adapters/storage.js';
import { blobStorage } from './adapters/storage-blob.js';
import { localStorage } from './adapters/storage-local.js';
import { loadConfig, type Config } from './config.js';
import { newRequestId } from './id.js';

export interface Deps {
  config: Config;
  mail: Mailer;
  storage: Storage;
  limiter: RateLimiter;
  now: () => Date;
  newId: (now: Date) => string;
}

export function buildDeps(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): Deps {
  const config = loadConfig(env);
  const local = join(cwd, '.local');

  let mail: Mailer;
  if (config.mail.mode === 'resend') {
    mail = resendMailer({
      apiKey: config.mail.apiKey!,
      from: `${site.name} <${config.mail.from}>`,
    });
  } else {
    console.warn(
      '[rfq] RESEND_API_KEY is not set: emails are written to .local/outbox/ instead of being sent (mock).',
    );
    mail = fileMailer(join(local, 'outbox'));
  }
  if (config.mail.testRecipient) {
    console.warn(
      '[rfq] MAIL_TEST_RECIPIENT is set: every email is redirected to the test address.',
    );
    mail = withTestRecipient(mail, config.mail.testRecipient);
  }

  let storage: Storage;
  if (config.storage.mode === 'blob') {
    storage = blobStorage(config.storage.token!);
  } else {
    console.warn(
      '[rfq] BLOB_READ_WRITE_TOKEN is not set: uploads are kept in .local/uploads/ (mock).',
    );
    storage = localStorage(join(local, 'uploads'));
  }

  return {
    config,
    mail,
    storage,
    limiter: memoryRateLimiter(),
    now: () => new Date(),
    newId: newRequestId,
  };
}

let shared: Deps | undefined;

/** Built on first use and kept for the life of the server instance (the rate limiter needs its memory). */
export function getDeps(): Deps {
  return (shared ??= buildDeps());
}
