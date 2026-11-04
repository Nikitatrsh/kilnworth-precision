import { describe, expect, it, vi } from 'vitest';
import { MailError, type MailMessage } from './mail';
import { resendMailer } from './mail-resend';

const message: MailMessage = {
  to: 'dana@northline.example',
  subject: 'Hello',
  text: 'Plain body',
  html: '<!doctype html><html><body style="x"><p>Body</p></body></html>',
  replyTo: 'reply@northline.example',
  idempotencyKey: 'rfq-shop/KP-261104-AAAAA',
};

// Shop mail asks for a retry; the auto-reply does not.
const retrying: MailMessage = { ...message, retry: true };

const ok = () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 });
const failure = (status: number, name = 'validation_error') =>
  new Response(
    JSON.stringify({ statusCode: status, name, message: 'secret detail dana@northline.example' }),
    { status },
  );

describe('resendMailer', () => {
  it('posts the mail to the Resend API with the key and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    await resendMailer({
      apiKey: 'test-key',
      from: 'Kilnworth <onboarding@resend.dev>',
      fetch: fetchMock,
    }).send(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'rfq-shop/KP-261104-AAAAA',
    });
    expect(JSON.parse(init.body)).toEqual({
      from: 'Kilnworth <onboarding@resend.dev>',
      to: ['dana@northline.example'],
      subject: 'Hello',
      text: 'Plain body',
      html: message.html,
      reply_to: 'reply@northline.example',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves out reply_to and the idempotency key when there are none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    await resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock }).send({
      ...message,
      replyTo: undefined,
      idempotencyKey: undefined,
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).not.toHaveProperty('reply_to');
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
  });

  it('fails at once on a client error, without echoing the response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(failure(422));
    const error = await resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock })
      .send(message)
      .catch((e) => e);
    expect(error).toBeInstanceOf(MailError);
    expect(error.status).toBe(422);
    expect(error.message).toBe('Resend answered 422 validation_error');
    expect(error.message).not.toContain('dana@');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once after a server error, with the same idempotency key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure(503, 'application_error'))
      .mockResolvedValueOnce(ok());
    await resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock }).send(retrying);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe('rfq-shop/KP-261104-AAAAA');
  });

  it('gives up after the second server error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(failure(500, 'application_error'));
    await expect(
      resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock }).send(retrying),
    ).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries after a dropped connection, then reports it as a MailError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const error = await resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock })
      .send(retrying)
      .catch((e) => e);
    expect(error).toBeInstanceOf(MailError);
    expect(error.message).toBe('Resend request failed: TypeError');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a mail that did not ask for it (the auto-reply)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(failure(503, 'application_error'));
    await expect(
      resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock }).send(message),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const dropped = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: dropped }).send(message),
    ).rejects.toBeInstanceOf(MailError);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('does not retry without an idempotency key, which would risk a double delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(failure(500, 'application_error'));
    await expect(
      resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock }).send({
        ...retrying,
        idempotencyKey: undefined,
      }),
    ).rejects.toBeInstanceOf(MailError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('survives an error response that is not JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 400 }));
    await expect(
      resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock }).send(message),
    ).rejects.toMatchObject({
      message: 'Resend answered 400',
      status: 400,
    });
  });

  describe('when Resend hangs', () => {
    // A fetch that never answers; it ends only when the caller's signal fires, like the real one.
    const hanging = () =>
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
          ),
      );

    it('gives up after the timeout and, for the shop mail, tries once more', async () => {
      const fetchMock = hanging();
      const started = Date.now();
      const error = await resendMailer({
        apiKey: 'k',
        from: 'a@b.co',
        fetch: fetchMock as unknown as typeof fetch,
        timeoutMs: 20,
      })
        .send(retrying)
        .catch((e) => e);
      expect(error).toBeInstanceOf(MailError);
      expect(error.message).toBe('Resend request failed: TimeoutError');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it('gives up after one timeout for the auto-reply', async () => {
      const fetchMock = hanging();
      await expect(
        resendMailer({
          apiKey: 'k',
          from: 'a@b.co',
          fetch: fetchMock as unknown as typeof fetch,
          timeoutMs: 20,
        }).send(message),
      ).rejects.toMatchObject({ message: 'Resend request failed: TimeoutError' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('allows five seconds per attempt by default', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      const fetchMock = vi.fn().mockResolvedValue(ok());
      await resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: fetchMock }).send(message);
      expect(timeout).toHaveBeenCalledWith(5000);
      timeout.mockRestore();
    });
  });
});
