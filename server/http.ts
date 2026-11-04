// Small helpers shared by both endpoints: JSON replies, origin check, size-limited JSON reading,
// and one place that turns thrown errors into the API's error format.
import { site } from '../src/config/site.js';
import { UploadError } from './adapters/storage.js';
import { ConfigError } from './config.js';
import type { Errors } from './validate.js';

/** A problem with the request itself, answered with `status` and `{ ok: false, errors }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly errors: Errors,
    readonly headers: Record<string, string> = {},
  ) {
    super(`HTTP ${status}`);
  }
}

export const FALLBACK_CONTACT = `Please call ${site.phone.display} or email ${site.email}.`;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function tooManyRequests(retryAfterSeconds: number): HttpError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new HttpError(
    429,
    {
      form: `Too many requests. Please try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, or call ${site.phone.display}.`,
    },
    { 'Retry-After': String(retryAfterSeconds) },
  );
}

export function requireMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new HttpError(405, { form: 'Method not allowed.' }, { Allow: method });
  }
}

/** Browser posts must come from this site. localhost is accepted only while developing. */
export function checkOrigin(request: Request, allowLocalhost: boolean): void {
  const forbidden = () => new HttpError(403, { form: 'This request is not allowed from here.' });
  const origin = request.headers.get('origin');
  if (!origin) throw forbidden();
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw forbidden();
  }
  const host = request.headers.get('host') ?? new URL(request.url).host;
  const local = allowLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.host !== host && !local) throw forbidden();
}

/** The visitor's address as Vercel reports it (it overwrites these headers, so they cannot be forged there). */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'local'
  );
}

/** Reads a JSON body of at most `maxBytes`. Counts the bytes itself, because Content-Length can be missing or wrong. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    throw new HttpError(415, { form: 'Send the request as JSON.' });
  }
  const tooBig = () => new HttpError(413, { form: 'That request is too large.' });
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooBig();

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    for await (const chunk of request.body) {
      size += chunk.length;
      if (size > maxBytes) throw tooBig();
      chunks.push(chunk);
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, { form: 'Send the request as valid JSON.' });
  }
}

/** Runs an endpoint and makes sure whatever goes wrong comes out as the API's error format, without internals. */
export async function respond(run: () => Promise<Response>, tag: string): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ ok: false, errors: error.errors }, error.status, error.headers);
    if (error instanceof UploadError)
      return json({ ok: false, errors: { files: error.message } }, error.status);
    // Only the kind of error is logged: messages from other systems can contain addresses.
    if (error instanceof ConfigError) console.error(`[${tag}] misconfigured: ${error.message}`);
    else console.error(`[${tag}] unexpected error:`, (error as Error)?.name);
    return json(
      { ok: false, errors: { form: `Something went wrong on our side. ${FALLBACK_CONTACT}` } },
      500,
    );
  }
}
