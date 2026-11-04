import { describe, expect, it } from 'vitest';
import { ApiError, postJson } from './api';

const answer =
  (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('postJson', () => {
  it('sends JSON and returns the answer', async () => {
    let sent: RequestInit | undefined;
    const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = init;
      return new Response(JSON.stringify({ ok: true, id: 'KP-261105-ABCDE' }));
    };
    const result = await postJson<{ id: string }>('/api/rfq', { part: 'x' }, { fetch });
    expect(result.id).toBe('KP-261105-ABCDE');
    expect(sent?.method).toBe('POST');
    expect(new Headers(sent?.headers).get('content-type')).toBe('application/json');
    expect(sent?.body).toBe('{"part":"x"}');
  });

  it('passes the server field errors through as they are', async () => {
    const errors = { email: 'Enter an email address like name@company.com.', files: 'Bad file.' };
    const error = await failure(
      postJson('/api/rfq', {}, { fetch: answer({ ok: false, errors }, 400) }),
    );
    expect(error.status).toBe(400);
    expect(error.errors).toEqual(errors);
  });

  it('keeps the server text on 429 and reads Retry-After', async () => {
    const fetch = answer(
      { ok: false, errors: { form: 'Too many requests. In 12 minutes.' } },
      429,
      {
        'Retry-After': '700',
      },
    );
    const error = await failure(postJson('/api/rfq', {}, { fetch }));
    expect(error.errors.form).toBe('Too many requests. In 12 minutes.');
    expect(error.retryAfterSeconds).toBe(700);
  });

  it('writes its own 429 text from Retry-After when the body is not JSON', async () => {
    const error = await failure(
      postJson('/api/rfq', {}, { fetch: answer('Too Many', 429, { 'Retry-After': '61' }) }),
    );
    expect(error.errors.form).toMatch(/try again in 2 minutes/i);
  });

  it('explains a server error without a JSON body and gives the shop contacts', async () => {
    const error = await failure(
      postJson('/api/rfq', {}, { fetch: answer('<html>Bad gateway', 502) }),
    );
    expect(error.status).toBe(502);
    expect(error.errors.form).toMatch(/555-0147/);
    expect(error.errors.form).toMatch(/quotes@kilnworth\.example/);
  });

  it('treats an empty errors object like no errors', async () => {
    const error = await failure(
      postJson('/api/rfq', {}, { fetch: answer({ ok: false, errors: {} }, 413) }),
    );
    expect(error.errors.form).toMatch(/too large/i);
  });

  it('turns a dropped connection into a network error with status 0', async () => {
    const fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const error = await failure(postJson('/api/rfq', {}, { fetch }));
    expect(error.status).toBe(0);
    expect(error.errors.form).toMatch(/could not reach the server/i);
  });

  it('gives up after the timeout', async () => {
    const fetch = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
      );
    const error = await failure(postJson('/api/rfq', {}, { fetch, timeoutMs: 10 }));
    expect(error.status).toBe(0);
    expect(error.errors.form).toMatch(/taking too long/i);
  });
});
