// Resend through its REST API with fetch: no SDK, one dependency less.
// Docs: https://resend.com/docs/api-reference/emails/send-email
import { MailError, type Mailer } from './mail.js';

const ENDPOINT = 'https://api.resend.com/emails';
// Per attempt. Shop mail: two attempts (10 s at most); auto-reply: one (5 s). See README, "Quote form backend".
const TIMEOUT_MS = 5_000;

interface Options {
  apiKey: string;
  /** "Name <address>" or a plain address. */
  from: string;
  fetch?: typeof fetch;
  /** Per attempt; only tests change it. */
  timeoutMs?: number;
}

export function resendMailer({
  apiKey,
  from,
  fetch: fetchImpl = fetch,
  timeoutMs = TIMEOUT_MS,
}: Options): Mailer {
  async function attempt(body: string, idempotencyKey?: string) {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return;
    // Only the error name (like "validation_error") goes into the message, never the body: it can echo addresses.
    const name = await response.json().then(
      (j: { name?: unknown }) => String(j.name ?? ''),
      () => '',
    );
    throw new MailError(`Resend answered ${response.status} ${name}`.trim(), response.status);
  }

  // A timeout or a dropped connection is not a MailError yet; only its name goes into the message.
  const asMailError = (e: unknown) =>
    e instanceof MailError
      ? e
      : new MailError(`Resend request failed: ${e instanceof Error ? e.name : 'unknown'}`);

  return {
    async send(m) {
      const body = JSON.stringify({
        from,
        to: [m.to],
        subject: m.subject,
        text: m.text,
        html: m.html,
        ...(m.replyTo && { reply_to: m.replyTo }),
      });
      try {
        await attempt(body, m.idempotencyKey);
      } catch (first) {
        const error = asMailError(first);
        // A client error (bad key, bad address) will not get better; a timeout, a server error or a
        // dropped connection may. The idempotency key makes the retry safe: it cannot deliver twice.
        const retryable =
          m.retry === true &&
          m.idempotencyKey !== undefined &&
          (error.status === undefined || error.status >= 500 || error.status === 429);
        if (!retryable) throw error;
        await attempt(body, m.idempotencyKey).catch((second) => {
          throw asMailError(second);
        });
      }
    },
  };
}
