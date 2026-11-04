import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

describe('loadConfig: no keys, running locally', () => {
  it('falls back to the mocks, with the shop address from the site config', () => {
    const config = loadConfig({});
    expect(config.onVercel).toBe(false);
    expect(config.mail).toMatchObject({
      mode: 'file',
      from: 'onboarding@resend.dev',
      toShop: 'quotes@kilnworth.example',
    });
    expect(config.storage.mode).toBe('local');
    expect(config.mail.testRecipient).toBeUndefined();
  });

  it('treats empty and blank values as not set', () => {
    const config = loadConfig({
      RESEND_API_KEY: '',
      BLOB_READ_WRITE_TOKEN: '  ',
      MAIL_TEST_RECIPIENT: ' ',
    });
    expect(config.mail.mode).toBe('file');
    expect(config.storage.mode).toBe('local');
    expect(config.mail.testRecipient).toBeUndefined();
  });
});

describe('loadConfig: keys present', () => {
  const full = {
    RESEND_API_KEY: 'key-for-test',
    BLOB_READ_WRITE_TOKEN: 'token-for-test',
    MAIL_FROM: 'quotes@kilnworth.example',
    MAIL_TO_SHOP: 'owner@kilnworth.example',
    MAIL_TEST_RECIPIENT: 'me@example.com',
  };

  it('switches to the real adapters', () => {
    expect(loadConfig({ ...full, VERCEL: '1' })).toEqual({
      onVercel: true,
      mail: {
        mode: 'resend',
        apiKey: 'key-for-test',
        from: 'quotes@kilnworth.example',
        toShop: 'owner@kilnworth.example',
        testRecipient: 'me@example.com',
      },
      storage: { mode: 'blob', token: 'token-for-test' },
    });
  });

  it('wants a shop address once mail is real', () => {
    const { MAIL_TO_SHOP, ...without } = full;
    expect(() => loadConfig(without)).toThrow(
      new ConfigError('MAIL_TO_SHOP is required when RESEND_API_KEY is set.'),
    );
  });

  it('rejects addresses that are not plain emails, including header-injection attempts', () => {
    for (const bad of ['not an email', 'a@b.co\r\nBcc: x@y.z', 'Name <a@b.co>', 'a@b.co, c@d.co']) {
      expect(() => loadConfig({ ...full, MAIL_TO_SHOP: bad }), bad).toThrow(ConfigError);
      expect(() => loadConfig({ ...full, MAIL_FROM: bad }), bad).toThrow(ConfigError);
      expect(() => loadConfig({ ...full, MAIL_TEST_RECIPIENT: bad }), bad).toThrow(ConfigError);
    }
  });

  it('never puts a value into an error message', () => {
    expect(() => loadConfig({ ...full, MAIL_TO_SHOP: 'secret-looking value' })).toThrow(
      'MAIL_TO_SHOP is not a plain email address.',
    );
  });
});

describe('loadConfig: on Vercel', () => {
  it('refuses to run on mocks, because they would swallow real requests', () => {
    expect(() => loadConfig({ VERCEL: '1' })).toThrow(
      'On Vercel the quote API needs RESEND_API_KEY and BLOB_READ_WRITE_TOKEN (missing: RESEND_API_KEY, BLOB_READ_WRITE_TOKEN). Set them, or set ALLOW_MOCKS=1 for a throwaway preview.',
    );
    expect(() => loadConfig({ VERCEL: '1', RESEND_API_KEY: 'k', MAIL_TO_SHOP: 'a@b.co' })).toThrow(
      'missing: BLOB_READ_WRITE_TOKEN',
    );
  });

  it('allows mocks when ALLOW_MOCKS=1 says so', () => {
    expect(loadConfig({ VERCEL: '1', ALLOW_MOCKS: '1' }).mail.mode).toBe('file');
  });
});
