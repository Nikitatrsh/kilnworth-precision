import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withTestRecipient, type MailMessage, type Mailer } from './mail';
import { fileMailer } from './mail-file';

const message: MailMessage = {
  to: 'dana@northline.example',
  subject: 'Hello',
  text: 'Plain body',
  html: '<!doctype html><html><body style="x"><p>Body</p></body></html>',
  replyTo: 'reply@northline.example',
  idempotencyKey: 'rfq-shop/KP-261104-AAAAA',
};

describe('fileMailer', () => {
  it('writes the mail as .json and .html into the folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outbox-'));
    await fileMailer(dir).send(message);
    await fileMailer(dir).send({ ...message, to: 'shop@kilnworth.example' });

    const files = (await readdir(dir)).sort();
    expect(files).toHaveLength(4);
    const json = JSON.parse(
      await readFile(
        join(
          dir,
          files.find((f) => f.endsWith('.json'))!,
        ),
        'utf8',
      ),
    );
    expect(json).toMatchObject({
      to: 'dana@northline.example',
      subject: 'Hello',
      replyTo: 'reply@northline.example',
    });
    expect(
      await readFile(
        join(
          dir,
          files.find((f) => f.endsWith('.html'))!,
        ),
        'utf8',
      ),
    ).toBe(message.html);
  });

  it('keeps a hostile recipient from escaping the folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outbox-'));
    await fileMailer(dir).send({ ...message, to: '../../etc/passwd' });
    expect((await readdir(dir)).every((f) => !f.includes('/'))).toBe(true);
  });
});

describe('withTestRecipient', () => {
  it('redirects every mail and says where it was meant to go', async () => {
    const sent: MailMessage[] = [];
    const inner: Mailer = { send: async (m) => void sent.push(m) };
    await withTestRecipient(inner, 'owner@example.com').send(message);

    expect(sent[0].to).toBe('owner@example.com');
    expect(sent[0].subject).toBe('[TEST -> dana@northline.example] Hello');
    expect(
      sent[0].text.startsWith('TEST MODE: this mail was meant for dana@northline.example'),
    ).toBe(true);
    expect(sent[0].html).toContain(
      '<body style="x"><p><strong>TEST MODE: this mail was meant for dana@northline.example</strong></p><p>Body</p>',
    );
    expect(sent[0].replyTo).toBe('reply@northline.example');
    expect(sent[0].idempotencyKey).toBe(message.idempotencyKey);
  });

  it('copes with characters in the original address that mean something to HTML or to replace()', async () => {
    const sent: MailMessage[] = [];
    await withTestRecipient({ send: async (m) => void sent.push(m) }, 'owner@example.com').send({
      ...message,
      to: "a$&b'c&d@example.com",
    });
    expect(sent[0].html).toContain('meant for a$&#38;b&#39;c&#38;d@example.com');
    expect(sent[0].html).not.toContain('a$&b');
  });
});
