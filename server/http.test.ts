import { describe, expect, it, vi } from 'vitest';
import {
  HttpError,
  checkOrigin,
  clientIp,
  json,
  readJson,
  requireMethod,
  respond,
  tooManyRequests,
} from './http';
import { UploadError } from './adapters/storage';

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('https://kilnworth.example/api/rfq', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      origin: 'https://kilnworth.example',
      ...headers,
    },
  });

const status = async (run: () => unknown) => {
  try {
    await run();
    return 'no error';
  } catch (e) {
    return e instanceof HttpError ? e.status : e;
  }
};

describe('json', () => {
  it('sends JSON that nobody may cache or sniff', async () => {
    const response = json({ ok: true }, 201, { 'Retry-After': '5' });
    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('retry-after')).toBe('5');
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('requireMethod', () => {
  it('lets the right method through', () => {
    expect(() =>
      requireMethod(new Request('https://x.example', { method: 'POST' }), 'POST'),
    ).not.toThrow();
  });

  it('answers 405 with an Allow header for other methods', () => {
    const error = (() => {
      try {
        requireMethod(new Request('https://x.example', { method: 'GET' }), 'POST');
      } catch (e) {
        return e as HttpError;
      }
    })();
    expect(error?.status).toBe(405);
    expect(error?.headers).toEqual({ Allow: 'POST' });
  });
});

describe('checkOrigin', () => {
  const req = (origin: string | null, host = 'kilnworth.example') =>
    new Request('https://kilnworth.example/api/rfq', {
      method: 'POST',
      headers: { ...(origin && { origin }), host },
    });

  it('accepts the site itself', () => {
    expect(() => checkOrigin(req('https://kilnworth.example'), false)).not.toThrow();
  });

  it('refuses another site, a missing origin and nonsense, with 403', async () => {
    for (const origin of [
      'https://evil.example',
      'https://kilnworth.example.evil.example',
      'null',
      'not a url',
      null,
    ]) {
      expect(await status(() => checkOrigin(req(origin), false)), String(origin)).toBe(403);
    }
  });

  it('lets localhost through only when not on Vercel', async () => {
    const local = req('http://localhost:4321', 'localhost:8787');
    expect(() => checkOrigin(local, true)).not.toThrow();
    expect(() => checkOrigin(req('http://127.0.0.1:4321'), true)).not.toThrow();
    expect(await status(() => checkOrigin(local, false))).toBe(403);
  });
});

describe('clientIp', () => {
  it('prefers x-real-ip, then the first x-forwarded-for entry, then "local"', () => {
    const ip = (h: Record<string, string>) =>
      clientIp(new Request('https://x.example', { headers: h }));
    expect(ip({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })).toBe(
      '203.0.113.7',
    );
    expect(ip({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })).toBe('198.51.100.1');
    expect(ip({})).toBe('local');
  });
});

describe('readJson', () => {
  it('parses a JSON body', async () => {
    expect(await readJson(post('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it('answers 415 when the body is not declared as JSON', async () => {
    expect(
      await status(() => readJson(post('{"a":1}', { 'content-type': 'text/plain' }), 100)),
    ).toBe(415);
    expect(
      await status(() =>
        readJson(post('a=1', { 'content-type': 'application/x-www-form-urlencoded' }), 100),
      ),
    ).toBe(415);
  });

  it('answers 413 for a body over the limit, announced or not', async () => {
    expect(await status(() => readJson(post('{}', { 'content-length': '5000' }), 100))).toBe(413);
    expect(await status(() => readJson(post(JSON.stringify({ a: 'x'.repeat(200) })), 100))).toBe(
      413,
    );
  });

  it('answers 400 for broken JSON and for an empty body', async () => {
    expect(await status(() => readJson(post('{"a":'), 100))).toBe(400);
    expect(await status(() => readJson(post(''), 100))).toBe(400);
  });

  it('accepts a charset on the content type', async () => {
    expect(
      await readJson(post('[1]', { 'content-type': 'Application/JSON; charset=utf-8' }), 100),
    ).toEqual([1]);
  });
});

describe('respond', () => {
  const body = async (r: Response) => ({
    status: r.status,
    json: await r.json(),
    retry: r.headers.get('retry-after'),
  });

  it('turns an HttpError into a JSON error', async () => {
    const r = await respond(async () => {
      throw tooManyRequests(90);
    }, 'test');
    expect(await body(r)).toEqual({
      status: 429,
      json: {
        ok: false,
        errors: {
          form: 'Too many requests. Please try again in 2 minutes, or call (610) 555-0147.',
        },
      },
      retry: '90',
    });
  });

  it('turns an UploadError into an error on the files field', async () => {
    const r = await respond(async () => {
      throw new UploadError('That file is over the size limit.', 413);
    }, 'test');
    expect(await body(r)).toMatchObject({
      status: 413,
      json: { ok: false, errors: { files: 'That file is over the size limit.' } },
    });
  });

  it('hides everything else behind a generic 500 with a way to reach the shop', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await respond(async () => {
      throw new Error('ECONNREFUSED 10.0.0.5 dana@northline.example');
    }, 'rfq');
    const { status, json } = await body(r);
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain('ECONNREFUSED');
    expect(json.errors.form).toContain('(610) 555-0147');
    expect(log).toHaveBeenCalledWith('[rfq] unexpected error:', 'Error');
    expect(JSON.stringify(log.mock.calls)).not.toContain('dana@');
    log.mockRestore();
  });

  it('passes a normal response through', async () => {
    const r = await respond(async () => json({ ok: true }), 'test');
    expect(r.status).toBe(200);
  });
});
