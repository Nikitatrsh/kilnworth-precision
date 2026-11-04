import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from './config';
import { buildDeps } from './deps';

const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('buildDeps', () => {
  it('uses the mocks without keys, says so in the console, and writes under .local', async () => {
    const warn = quiet();
    const cwd = await mkdtemp(join(tmpdir(), 'kp-'));
    const deps = buildDeps({}, cwd);

    expect(deps.config.mail.mode).toBe('file');
    expect(deps.storage.mode).toBe('local');
    const said = warn.mock.calls.map((c) => c[0]).join('\n');
    expect(said).toContain('RESEND_API_KEY is not set');
    expect(said).toContain('BLOB_READ_WRITE_TOKEN is not set');

    await deps.mail.send({ to: 'a@b.co', subject: 's', text: 't', html: '<p>h</p>' });
    expect(await readdir(join(cwd, '.local', 'outbox'))).toHaveLength(2);
    warn.mockRestore();
  });

  it('uses the real adapters when keys are set, and redirects mail in test mode', () => {
    const warn = quiet();
    const deps = buildDeps({
      RESEND_API_KEY: 'k',
      BLOB_READ_WRITE_TOKEN: 'token-for-test',
      MAIL_TO_SHOP: 'shop@kilnworth.example',
      MAIL_TEST_RECIPIENT: 'owner@example.com',
    });
    expect(deps.config.mail.mode).toBe('resend');
    expect(deps.storage.mode).toBe('blob');
    expect(warn.mock.calls.map((c) => c[0]).join('\n')).toContain('MAIL_TEST_RECIPIENT is set');
    warn.mockRestore();
  });

  it('fails on Vercel without keys', () => {
    expect(() => buildDeps({ VERCEL: '1' })).toThrow(ConfigError);
  });
});
