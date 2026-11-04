import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localStorage } from './adapters/storage-local';
import { browserPost, makeFakes, SITE } from './test-helpers';
import { handleUploadRoute } from './upload';

const MB = 1024 * 1024;
const event = (pathname: string, size?: number) => ({
  type: 'blob.generate-client-token',
  payload: { pathname, clientPayload: size === undefined ? null : String(size), multipart: false },
});

async function call(request: Request, fakes = makeFakes()) {
  const response = await handleUploadRoute(request, () => fakes.deps);
  return { status: response.status, json: await response.json(), headers: response.headers };
}

describe('POST /api/upload (token for a direct upload)', () => {
  it('hands the storage the browser event and returns its answer', async () => {
    const r = await call(browserPost('/api/upload', event('bracket.step', 2 * MB)));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      type: 'blob.generate-client-token',
      clientToken: 'token-for-test',
    });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a disallowed extension with 415', async () => {
    const r = await call(browserPost('/api/upload', event('setup.exe')));
    expect(r.status).toBe(415);
    expect(r.json.errors.files).toBe(
      '"setup.exe" is not a supported file. Use STEP, IGES, DWG, DXF or PDF.',
    );
  });

  it('refuses a disguised extension, odd names and slashes', async () => {
    for (const name of [
      'part.step.exe',
      'noextension',
      '../etc/passwd.pdf',
      'a\\b.pdf',
      'a\r\nb.pdf',
      'a'.repeat(200) + '.pdf',
      '',
    ]) {
      const r = await call(browserPost('/api/upload', event(name)));
      expect([400, 415], name).toContain(r.status);
      expect(r.json.ok).toBe(false);
    }
  });

  it.each(['-1', 'abc', '1.5', '', ' ', '1e3', 'NaN', '0x10', '12 ', '9'.repeat(16)])(
    'refuses a declared size of %j with 400 in the usual error format',
    async (declared) => {
      const body = event('a.step');
      body.payload.clientPayload = declared as never;
      const r = await call(browserPost('/api/upload', body));
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ ok: false, errors: { files: 'Check the file size.' } });
    },
  );

  it('refuses a declared size that is not a string', async () => {
    const body = event('a.step');
    body.payload.clientPayload = 2048 as never;
    expect((await call(browserPost('/api/upload', body))).status).toBe(400);
  });

  it('refuses a declared size over 25 MB with 413 and an empty one with 400', async () => {
    expect((await call(browserPost('/api/upload', event('a.step', 25 * MB + 1)))).status).toBe(413);
    expect((await call(browserPost('/api/upload', event('a.step', 25 * MB)))).status).toBe(200);
    expect((await call(browserPost('/api/upload', event('a.step', 0)))).status).toBe(400);
  });

  it('only answers requests from this site', async () => {
    expect(
      (await call(browserPost('/api/upload', event('a.pdf'), { origin: 'https://evil.example' })))
        .status,
    ).toBe(403);
    const noOrigin = new Request(`${SITE}/api/upload`, {
      method: 'POST',
      body: JSON.stringify(event('a.pdf')),
      headers: { 'content-type': 'application/json' },
    });
    expect((await call(noOrigin)).status).toBe(403);
  });

  it('answers 415 for non-JSON, 413 for a huge body, 400 for broken JSON', async () => {
    expect(
      (await call(browserPost('/api/upload', 'a=1', { 'content-type': 'text/plain' }))).status,
    ).toBe(415);
    expect((await call(browserPost('/api/upload', { junk: 'x'.repeat(5000) }))).status).toBe(413);
    expect((await call(browserPost('/api/upload', '{"type":'))).status).toBe(400);
  });

  it('allows 30 tokens an hour per address, then 429 with Retry-After', async () => {
    const fakes = makeFakes();
    for (let i = 0; i < 30; i++)
      expect((await call(browserPost('/api/upload', event('a.pdf')), fakes)).status).toBe(200);
    const r = await call(browserPost('/api/upload', event('a.pdf')), fakes);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(r.json.errors.form).toContain('Too many requests');
    // another visitor is not affected
    expect(
      (
        await call(
          browserPost('/api/upload', event('a.pdf'), { 'x-real-ip': '198.51.100.9' }),
          fakes,
        )
      ).status,
    ).toBe(200);
  });

  it('answers 405 to other methods', async () => {
    const r = await call(
      new Request(`${SITE}/api/upload`, { method: 'DELETE', headers: { origin: SITE } }),
    );
    expect(r.status).toBe(405);
  });

  it('turns a failing storage into a generic 500', async () => {
    const fakes = makeFakes();
    fakes.deps.storage.issueUpload = async () => {
      throw new Error('BLOB token abc rejected');
    };
    const r = await call(browserPost('/api/upload', event('a.pdf')), fakes);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain('abc');
  });
});

describe('PUT /api/upload (local mock receives the bytes)', () => {
  async function localFakes() {
    const dir = await mkdtemp(join(tmpdir(), 'up-'));
    const fakes = makeFakes('local');
    fakes.deps.storage = localStorage(dir);
    return { fakes, dir };
  }
  const put = (pathname: string, body: BodyInit, headers: Record<string, string> = {}) =>
    new Request(`${SITE}/api/upload?pathname=${encodeURIComponent(pathname)}`, {
      method: 'PUT',
      body,
      headers: {
        origin: SITE,
        host: 'kilnworth.example',
        'content-type': 'application/octet-stream',
        ...headers,
      },
    });

  it('stores the file and returns a url that /api/rfq can check', async () => {
    const { fakes, dir } = await localFakes();
    const r = await call(put('part.step', 'ISO-10303-21;'), fakes);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, size: 13 });
    expect(r.json.url).toMatch(/^local:[0-9a-f]{8}-part\.step$/);
    expect(await readFile(join(dir, r.json.pathname), 'utf8')).toBe('ISO-10303-21;');
  });

  it('applies the same name, size and origin rules', async () => {
    const { fakes, dir } = await localFakes();
    expect((await call(put('a.exe', 'MZ'), fakes)).status).toBe(415);
    expect((await call(put('a.step', ''), fakes)).status).toBe(400);
    expect(
      (await call(put('a.step', 'x', { 'content-length': String(26 * MB) }), fakes)).status,
    ).toBe(413);
    expect((await call(put('a.step', new Uint8Array(25 * MB + 1)), fakes)).status).toBe(413);
    expect((await call(put('a.step', 'x', { origin: 'https://evil.example' }), fakes)).status).toBe(
      403,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  it('does not exist in blob mode', async () => {
    expect((await call(put('a.step', 'x'))).status).toBe(404);
  });
});
