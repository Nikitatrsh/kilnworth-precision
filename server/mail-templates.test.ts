import { describe, expect, it } from 'vitest';
import { customerMail, shopMail } from './mail-templates';
import type { RfqRequest } from './validate';

const request: RfqRequest = {
  part: 'Bracket 4417-B',
  description: 'Aluminum plate, two bores.',
  process: '5-axis-milling',
  material: 'al-6061',
  quantity: 250,
  breaks: '50, 1000',
  tolerance: '0.0005',
  finishing: ['anodize', 'marking'],
  docs: ['fai'],
  date: '2026-12-01',
  notes: 'Bore is a bearing fit.',
  name: 'Dana Whitfield',
  company: 'Northline Robotics',
  email: 'dana@northline.example',
  phone: '(610) 555-0123',
  files: [],
};
const links = [
  {
    name: 'bracket.step',
    size: 2 * 1024 * 1024,
    href: 'https://store.private.blob.vercel-storage.com/bracket.step?sig=1',
  },
];
const ID = 'KP-261104-7K3QX';

describe('shopMail', () => {
  const mail = shopMail(request, ID, links);

  it('puts the request number and the part in the subject', () => {
    expect(mail.subject).toBe(
      'Quote request KP-261104-7K3QX: Bracket 4417-B x 250, Northline Robotics',
    );
  });

  it('lists every answer with readable labels, in text and html', () => {
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('5-axis milling');
      expect(body).toContain('Aluminum 6061-T6');
      expect(body).toContain('±0.0005 in');
      expect(body).toContain('Anodize (Type II or III)');
      expect(body).toContain('First article report (AS9102)');
      expect(body).toContain('2026-12-01');
      expect(body).toContain('dana@northline.example');
      expect(body).toContain(ID);
    }
  });

  it('links each file with its size', () => {
    expect(mail.text).toContain(
      'bracket.step (2.0 MB): https://store.private.blob.vercel-storage.com/bracket.step?sig=1',
    );
    expect(mail.html).toContain(
      'href="https://store.private.blob.vercel-storage.com/bracket.step?sig=1"',
    );
  });

  it('says so when no file was attached', () => {
    expect(shopMail(request, ID, []).text).toContain('No files attached');
  });

  it('escapes HTML from the visitor, so nothing runs in the shop mail client', () => {
    const hostile = {
      ...request,
      part: '<script>alert(1)</script>',
      notes: '"><img src=x onerror=alert(1)>',
      company: 'A&B <b>',
    };
    const html = shopMail(hostile, ID, links).html;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A&amp;B &lt;b&gt;');
  });

  it('keeps line breaks and control characters out of the subject', () => {
    const hostile = {
      ...request,
      part: 'Bracket\r\nBcc: spy@example.com',
      company: 'Acme\u202eevil',
    };
    expect(shopMail(hostile, ID, links).subject).not.toMatch(/[\r\n\u202e]/);
  });

  it('shortens a very long subject', () => {
    expect(
      shopMail({ ...request, part: 'x'.repeat(120), company: 'y'.repeat(120) }, ID, links).subject
        .length,
    ).toBeLessThanOrEqual(150);
  });

  it('does not turn a non-https file link into a clickable link', () => {
    const html = shopMail(request, ID, [{ ...links[0], href: 'javascript:alert(1)' }]).html;
    expect(html).not.toContain('href="javascript');
  });
});

describe('customerMail', () => {
  const mail = customerMail(request, ID, links);

  it('carries the request number in the subject and body', () => {
    expect(mail.subject).toBe('We received your quote request KP-261104-7K3QX');
    expect(mail.text).toContain(ID);
    expect(mail.html).toContain(ID);
  });

  it('greets by name and repeats what was asked, without file links', () => {
    expect(mail.text).toContain('Hi Dana Whitfield,');
    expect(mail.text).toContain('Bracket 4417-B');
    expect(mail.text).toContain('bracket.step');
    expect(mail.text).not.toContain('https://store.private');
  });

  it('is honest that this is a portfolio demo and no quote will follow', () => {
    expect(mail.text).toContain('portfolio demo');
    expect(mail.text).toMatch(/fictional/i);
    expect(mail.html).toMatch(/fictional/i);
    expect(mail.text).not.toContain('Call (610)'); // no real phone to call in a demo
  });

  it.each([true, false])(
    'says where the data went and never claims it was used only here (demo: %s)',
    (demo) => {
      const m = customerMail(request, ID, links, demo);
      for (const body of [m.text, m.html]) {
        expect(body).not.toContain('used only to send you this message');
        expect(body).toContain('emailed to');
        expect(body).toContain('private file store');
        expect(body).toContain('Privacy page');
      }
      expect(m.text).toContain(demo ? "the site owner's inbox" : "the shop's inbox");
    },
  );

  it('does not mention a file store when no file was attached', () => {
    expect(customerMail(request, ID, []).text).not.toContain('file store');
  });

  it('keeps the real turnaround promise outside the demo', () => {
    const m = customerMail(request, ID, links, false);
    expect(m.text).toContain('An engineer will read your request');
    expect(m.text).not.toMatch(/fictional/i);
  });

  it('escapes the visitor name in html', () => {
    expect(customerMail({ ...request, name: '<b>Dana</b>' }, ID, []).html).not.toContain('<b>Dana');
  });
});
