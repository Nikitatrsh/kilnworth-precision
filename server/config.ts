// Reads the environment once and decides which adapters to use. No keys: mocks, so the form works
// on a fresh clone. On Vercel, missing keys are an error instead: a mock there would say "sent"
// and lose the request.
import { site } from '../src/config/site.js';
import { EMAIL_PATTERN } from '../src/lib/rfq-rules.js';

export class ConfigError extends Error {}

export interface Config {
  onVercel: boolean;
  mail: {
    mode: 'resend' | 'file';
    apiKey?: string;
    from: string;
    toShop: string;
    testRecipient?: string;
  };
  storage: { mode: 'blob' | 'local'; token?: string };
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): Config {
  const get = (name: string) => env[name]?.trim() || undefined;
  /** An address from the environment: one plain address, nothing that could add a header. */
  const email = (name: string) => {
    const value = get(name);
    if (value !== undefined && !EMAIL_PATTERN.test(value))
      throw new ConfigError(`${name} is not a plain email address.`);
    return value;
  };

  const apiKey = get('RESEND_API_KEY');
  const token = get('BLOB_READ_WRITE_TOKEN');
  const onVercel = Boolean(env.VERCEL);

  const missing = [!apiKey && 'RESEND_API_KEY', !token && 'BLOB_READ_WRITE_TOKEN'].filter(Boolean);
  if (onVercel && missing.length > 0 && get('ALLOW_MOCKS') !== '1') {
    throw new ConfigError(
      `On Vercel the quote API needs RESEND_API_KEY and BLOB_READ_WRITE_TOKEN (missing: ${missing.join(', ')}). Set them, or set ALLOW_MOCKS=1 for a throwaway preview.`,
    );
  }

  const toShop = email('MAIL_TO_SHOP');
  if (apiKey && !toShop)
    throw new ConfigError('MAIL_TO_SHOP is required when RESEND_API_KEY is set.');

  return {
    onVercel,
    mail: {
      mode: apiKey ? 'resend' : 'file',
      apiKey,
      from: email('MAIL_FROM') ?? 'onboarding@resend.dev',
      toShop: toShop ?? site.email,
      testRecipient: email('MAIL_TEST_RECIPIENT'),
    },
    storage: { mode: token ? 'blob' : 'local', token },
  };
}
