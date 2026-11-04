// Mail behind one small interface: `resend` (real) and `file` (mock, writes to .local/outbox/).
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Sending the same key twice delivers once (the provider remembers it for 24 hours). */
  idempotencyKey?: string;
  /**
   * Try once more after a timeout or a server error. Needs an idempotencyKey, so that the retry
   * cannot deliver twice. Default: no retry.
   */
  retry?: boolean;
}

export interface Mailer {
  /** Resolves when the mail is accepted; throws MailError when it is not. */
  send(message: MailMessage): Promise<void>;
}

export class MailError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Test mode: every mail goes to `recipient`, with the original address in the subject and on top
 * of the body. Needed while Resend only delivers to the account owner (no verified domain yet).
 */
export function withTestRecipient(mailer: Mailer, recipient: string): Mailer {
  return {
    send: (m) => {
      const notice = `TEST MODE: this mail was meant for ${m.to}`;
      const safe = notice.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      return mailer.send({
        ...m,
        to: recipient,
        subject: `[TEST -> ${m.to}] ${m.subject}`,
        text: `${notice}\n\n${m.text}`,
        // A function, not a string: a plain replacement would read "$&" in an address as a pattern.
        html: m.html.replace(/<body[^>]*>/i, (body) => `${body}<p><strong>${safe}</strong></p>`),
      });
    },
  };
}
