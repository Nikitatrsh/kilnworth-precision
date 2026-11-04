// Talking to /api from the browser: one JSON POST helper and one error type, so the quote form
// reads every answer the same way. Server messages are written for the visitor and shown as they
// are; the texts here cover answers that carry none (a dropped connection, a proxy error page).
import { site } from '../config/site';

/** Message per form field; `form` and `files` belong to the form as a whole. */
export type Errors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when no answer arrived. */
    readonly status: number,
    readonly errors: Errors,
    readonly retryAfterSeconds = 0,
  ) {
    super(Object.values(errors)[0] ?? `HTTP ${status}`);
  }
}

const CONTACT = `call ${site.phone.display} or email ${site.email}`;
export const NETWORK_TEXT = `We could not reach the server. Check your connection and try again, or ${CONTACT}.`;
const TIMEOUT_TEXT = `The server is taking too long to answer. Try again in a minute, or ${CONTACT}.`;

function fallback(status: number, retryAfterSeconds: number): Errors {
  if (status === 429) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return {
      form: `Too many requests. Please try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, or ${CONTACT}.`,
    };
  }
  if (status === 413) return { form: `That request is too large. Please ${CONTACT}.` };
  if (status >= 500)
    return {
      form: `Something went wrong on our side and nothing was sent. Try again, or ${CONTACT}.`,
    };
  return { form: `The request was refused (error ${status}). Try again, or ${CONTACT}.` };
}

/** Reads an API answer: the JSON body when it is ok, otherwise throws ApiError with its errors. */
export async function readAnswer<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (response.ok && data && data.ok !== false) return data as T;
  const retryAfter = Number(response.headers.get('retry-after')) || 0;
  const errors =
    data?.errors && typeof data.errors === 'object' && Object.keys(data.errors).length
      ? (data.errors as Errors)
      : fallback(response.status, retryAfter);
  throw new ApiError(response.status, errors, retryAfter);
}

interface PostOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  { fetch: send = fetch, timeoutMs = 30_000 }: PostOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await send(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = (error as Error)?.name === 'TimeoutError';
    throw new ApiError(0, { form: timedOut ? TIMEOUT_TEXT : NETWORK_TEXT });
  }
  return readAnswer<T>(response);
}
