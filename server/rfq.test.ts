import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from './config';
import { handleRfq } from './rfq';
import { browserPost, makeFakes, SITE, type Fakes } from './test-helpers';

const MB = 1024 * 1024;
const STEP_URL = 'https://store1.private.blob.vercel-storage.com/bracket-AbC123.step';
const text = (s: string) => new TextEncoder().encode(s);

const payload = (over: Record<string, unknown> = {}) => ({
  part: 'Bracket 4417-B',
  description: '',
  process: '5-axis-milling',
  material: 'al-6061',
  quantity: 250,
  breaks: '',
  tolerance: '0.0005',
  finishing: ['anodize'],
  docs: [],
  date: '2026-12-01',
  notes: '',
  name: 'Dana Whitfield',
  company: 'Northline Robotics',
  email: 'dana@northline.example',
  phone: '',
  kp_extra: '',
  files: [{ url: STEP_URL, name: 'bracket.step', size: 2 * MB }],
  ...over,
});

function withStepFile(fakes: Fakes, size = 2 * MB) {
  fakes.files.set(STEP_URL, { size, head: text('ISO-10303-21;\nHEADER;') });
  return fakes;
}

async function call(request: Request, fakes: Fakes = withStepFile(makeFakes())) {
  const response = await handleRfq(request, () => fakes.deps);
  return { status: response.status, json: await response.json(), headers: response.headers, fakes };
}
const submit = (
  over: Record<string, unknown> = {},
  fakes?: Fakes,
  headers?: Record<string, string>,
) => call(browserPost('/api/rfq', payload(over), headers), fakes);

describe('POST /api/rfq: success', () => {
  it('accepts a request with a file and sends the shop mail and the auto-reply with one number', async () => {
    const { status, json, fakes } = await submit();
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, id: 'KP-261104-TEST7' });

    expect(fakes.sent).toHaveLength(2);
    const [shop, customer] = fakes.sent;
    expect(shop.to).toBe('shop@kilnworth.example');
    expect(shop.replyTo).toBe('dana@northline.example');
    expect(shop.subject).toBe(
      'Quote request KP-261104-TEST7: Bracket 4417-B x 250, Northline Robotics',
    );
    expect(shop.text).toContain(`${STEP_URL}?signed=1`);
    expect(shop.idempotencyKey).toBe('rfq-shop/KP-261104-TEST7');
    expect(customer.to).toBe('dana@northline.example');
    expect(customer.subject).toContain('KP-261104-TEST7');
    expect(customer.replyTo).toBeUndefined();
  });

  it('accepts a request without files when the part is described', async () => {
    const { status, fakes } = await submit({ files: [], description: 'Aluminum plate 4 x 2 in' });
    expect(status).toBe(200);
    expect(fakes.sent[0].text).toContain('No files attached');
  });

  it('uses the real size from storage, not the one the browser claims', async () => {
    const fakes = withStepFile(makeFakes(), 3 * MB);
    const { status } = await submit(
      { files: [{ url: STEP_URL, name: 'bracket.step', size: 1 }] },
      fakes,
    );
    expect(status).toBe(200);
    expect(fakes.sent[0].text).toContain('bracket.step (3.0 MB)');
  });

  it('ignores fields it does not know', async () => {
    const { status, fakes } = await submit({
      isAdmin: true,
      to: 'victim@example.com',
      bcc: 'spy@example.com',
    });
    expect(status).toBe(200);
    expect(fakes.sent.map((m) => m.to)).toEqual([
      'shop@kilnworth.example',
      'dana@northline.example',
    ]);
    expect(JSON.stringify(fakes.sent)).not.toMatch(/victim|spy@|isAdmin/);
  });

  it('writes the log without names or addresses', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await submit();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('KP-261104-TEST7 accepted');
    expect(logged).not.toMatch(/dana|northline|bracket/i);
    log.mockRestore();
  });
});

describe('POST /api/rfq: bad input', () => {
  it('answers 400 with a message per field and sends nothing', async () => {
    const { status, json, fakes } = await submit({ part: '', quantity: 0, email: 'nope' });
    expect(status).toBe(400);
    expect(json).toEqual({
      ok: false,
      errors: {
        part: 'Enter part name or number.',
        quantity: 'Quantity must be at least 1.',
        email: 'Enter an email address like name@company.com.',
      },
    });
    expect(fakes.sent).toHaveLength(0);
    expect(fakes.inspect).not.toHaveBeenCalled();
  });

  it('refuses line breaks in names, so no header can be injected', async () => {
    const { status, json, fakes } = await submit({ name: 'Dana\r\nBcc: spy@example.com' });
    expect(status).toBe(400);
    expect(json.errors.name).toBe('Check your name.');
    expect(fakes.sent).toHaveLength(0);
  });

  it('puts HTML from the visitor into the mail as text', async () => {
    const { status, fakes } = await submit({ company: '<img src=x onerror=alert(1)>' });
    expect(status).toBe(200);
    expect(fakes.sent[0].html).not.toContain('<img');
    expect(fakes.sent[0].html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('refuses six files', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      url: `${STEP_URL}${i}`,
      name: `p${i}.step`,
      size: MB,
    }));
    const { status, json } = await submit({ files });
    expect(status).toBe(400);
    expect(json.errors.files).toBe('Attach up to 5 files.');
  });

  it('answers 415 for non-JSON, 413 for a huge body, 400 for broken JSON', async () => {
    const fakes = withStepFile(makeFakes());
    expect(
      (
        await call(
          browserPost('/api/rfq', 'part=x', {
            'content-type': 'application/x-www-form-urlencoded',
          }),
          fakes,
        )
      ).status,
    ).toBe(415);
    expect(
      (await call(browserPost('/api/rfq', payload({ notes: 'x'.repeat(40_000) })), fakes)).status,
    ).toBe(413);
    expect((await call(browserPost('/api/rfq', '{"part":'), fakes)).status).toBe(400);
    expect(fakes.sent).toHaveLength(0);
  });

  it('answers 405 to GET', async () => {
    const r = await call(
      new Request(`${SITE}/api/rfq`, { method: 'GET', headers: { origin: SITE } }),
    );
    expect(r.status).toBe(405);
  });
});

describe('POST /api/rfq: where the request comes from', () => {
  it('refuses another origin and a missing origin with 403', async () => {
    const fakes = withStepFile(makeFakes());
    expect((await submit({}, fakes, { origin: 'https://evil.example' })).status).toBe(403);
    const noOrigin = new Request(`${SITE}/api/rfq`, {
      method: 'POST',
      body: JSON.stringify(payload()),
      headers: { 'content-type': 'application/json' },
    });
    expect((await call(noOrigin, fakes)).status).toBe(403);
    expect(fakes.sent).toHaveLength(0);
  });

  it('refuses localhost on Vercel and accepts it in development', async () => {
    const dev = withStepFile(makeFakes());
    expect((await submit({}, dev, { origin: 'http://localhost:4321' })).status).toBe(200);
    const live = withStepFile(makeFakes());
    live.deps.config.onVercel = true;
    expect((await submit({}, live, { origin: 'http://localhost:4321' })).status).toBe(403);
  });
});

describe('POST /api/rfq: bots', () => {
  it('answers a filled honeypot with the same ok, and does nothing else', async () => {
    const fakes = withStepFile(makeFakes());
    const { status, json } = await submit({ kp_extra: 'http://spam.example' }, fakes);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, id: 'KP-261104-TEST7' });
    expect(fakes.sent).toHaveLength(0);
    expect(fakes.inspect).not.toHaveBeenCalled();
  });

  it('drops the request even when the other fields are junk', async () => {
    const { status, fakes } = await submit({ kp_extra: 'x', part: '', email: 'bad' });
    expect(status).toBe(200);
    expect(fakes.sent).toHaveLength(0);
  });
});

describe('POST /api/rfq: rate limit', () => {
  it('accepts five requests an hour from one address, then 429 with Retry-After', async () => {
    const fakes = withStepFile(makeFakes());
    for (let i = 0; i < 5; i++) expect((await submit({}, fakes)).status).toBe(200);
    const sixth = await submit({}, fakes);
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(3000);
    expect(sixth.json.errors.form).toMatch(/^Too many requests\. Please try again in \d+ minutes/);
    expect(fakes.sent).toHaveLength(10);
    expect((await submit({}, fakes, { 'x-real-ip': '198.51.100.9' })).status).toBe(200);
  });

  it('does not use up the hourly quota with mistakes the visitor corrects', async () => {
    const fakes = withStepFile(makeFakes());
    for (let i = 0; i < 10; i++) expect((await submit({ part: '' }, fakes)).status).toBe(400);
    expect((await submit({}, fakes)).status).toBe(200);
  });

  it('does not use it up with files that did not arrive or were refused either', async () => {
    const fakes = makeFakes(); // knows no files
    for (let i = 0; i < 8; i++) expect((await submit({}, fakes)).status).toBe(400);
    withStepFile(fakes);
    for (let i = 0; i < 5; i++) expect((await submit({}, fakes)).status).toBe(200);
    expect((await submit({}, fakes)).status).toBe(429);
  });

  it('still limits a flood of broken requests', async () => {
    const fakes = withStepFile(makeFakes());
    for (let i = 0; i < 60; i++) await submit({ part: '' }, fakes);
    expect((await submit({ part: '' }, fakes)).status).toBe(429);
  });
});

describe('POST /api/rfq: files', () => {
  it('refuses a link that is not in our storage', async () => {
    const fakes = makeFakes(); // the storage knows no files
    const { status, json } = await submit(
      { files: [{ url: 'https://evil.example/a.step', name: 'a.step', size: MB }] },
      fakes,
    );
    expect(status).toBe(400);
    expect(json.errors.files).toBe('"a.step" did not arrive. Attach it again.');
    expect(fakes.sent).toHaveLength(0);
  });

  it('refuses a program renamed to .step (content does not match) with 415', async () => {
    const fakes = makeFakes();
    fakes.files.set(STEP_URL, { size: 5000, head: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) });
    const { status, json } = await submit({}, fakes);
    expect(status).toBe(415);
    expect(json.errors.files).toBe('"bracket.step" does not look like a real STEP file.');
    expect(fakes.sent).toHaveLength(0);
  });

  it('refuses part.step.exe by its name', async () => {
    const { status, json } = await submit({
      files: [{ url: STEP_URL, name: 'part.step.exe', size: MB }],
    });
    expect(status).toBe(400);
    expect(json.errors.files).toContain('not a supported file');
  });

  it('refuses an empty file and an oversized one, by what storage reports', async () => {
    const empty = await submit({}, withStepFile(makeFakes(), 0));
    expect(empty.status).toBe(400);
    expect(empty.json.errors.files).toBe('"bracket.step" is empty. Choose the file again.');
    const big = await submit({}, withStepFile(makeFakes(), 26 * MB));
    expect(big.status).toBe(413);
    expect(big.json.errors.files).toContain('The limit is 25 MB');
  });

  it('accepts exactly 25 MB', async () => {
    expect((await submit({}, withStepFile(makeFakes(), 25 * MB))).status).toBe(200);
  });
});

describe('POST /api/rfq: mail trouble', () => {
  it('fails with 500 and a way to reach the shop when the shop mail fails, and sends no auto-reply', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakes = withStepFile(makeFakes());
    fakes.failMail();
    const { status, json } = await submit({}, fakes);
    expect(status).toBe(500);
    expect(json.errors.form).toBe(
      'We could not send your request. Please call (610) 555-0147 or email quotes@kilnworth.example.',
    );
    expect(fakes.sent).toHaveLength(0);
    log.mockRestore();
  });

  it('still accepts the request when only the auto-reply fails, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakes = withStepFile(makeFakes());
    fakes.failMail((m) => m.to === 'dana@northline.example');
    const { status, json } = await submit({}, fakes);
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(fakes.sent.map((m) => m.to)).toEqual(['shop@kilnworth.example']);
    expect(log.mock.calls[0][0]).toBe('[rfq] KP-261104-TEST7 auto-reply failed:');
    log.mockRestore();
  });

  it('never shows internals in an error response', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakes = withStepFile(makeFakes());
    fakes.failMail();
    const { json } = await submit({}, fakes);
    expect(JSON.stringify(json)).not.toMatch(/provider|stack|at .*\(|node_modules|dana@northline/i);
    log.mockRestore();
  });

  it('answers 500 when the server is misconfigured, without naming what is missing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleRfq(browserPost('/api/rfq', payload()), () => {
      throw new ConfigError('On Vercel the quote API needs RESEND_API_KEY');
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('RESEND');
    expect(log.mock.calls[0][0]).toContain('misconfigured');
    log.mockRestore();
  });
});
