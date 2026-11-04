import { describe, expect, it } from 'vitest';
import { parseRfq, type Errors, type RfqRequest } from './validate';

const today = new Date(2026, 10, 4);
const MB = 1024 * 1024;

const file = (over = {}) => ({
  url: 'https://store1.private.blob.vercel-storage.com/bracket-AbC123.step',
  name: 'bracket.step',
  size: 2 * MB,
  ...over,
});

/** A request the form would send. Each test changes one thing. */
const valid = (over: Record<string, unknown> = {}) => ({
  part: 'Bracket 4417-B',
  description: '',
  process: '5-axis-milling',
  material: 'al-6061',
  quantity: 250,
  breaks: '50, 1000',
  tolerance: '0.0005',
  finishing: ['anodize'],
  docs: ['material-certs', 'fai'],
  date: '2026-12-01',
  notes: 'Bore is a bearing fit.',
  name: 'Dana Whitfield',
  company: 'Northline Robotics',
  email: 'dana@northline.example',
  phone: '(610) 555-0123',
  kp_extra: '',
  files: [file()],
  ...over,
});

const errorsOf = (over: Record<string, unknown>): Errors => {
  const r = parseRfq(valid(over), today);
  if (r.ok) throw new Error('expected errors');
  return r.errors;
};

describe('parseRfq: valid input', () => {
  it('returns a clean, typed request', () => {
    const r = parseRfq(valid(), today);
    expect(r).toEqual({
      ok: true,
      value: {
        part: 'Bracket 4417-B',
        description: '',
        process: '5-axis-milling',
        material: 'al-6061',
        quantity: 250,
        breaks: '50, 1000',
        tolerance: '0.0005',
        finishing: ['anodize'],
        docs: ['material-certs', 'fai'],
        date: '2026-12-01',
        notes: 'Bore is a bearing fit.',
        name: 'Dana Whitfield',
        company: 'Northline Robotics',
        email: 'dana@northline.example',
        phone: '(610) 555-0123',
        files: [file()],
      } satisfies RfqRequest,
    });
  });

  it('accepts a description instead of files, and leaves optional fields empty', () => {
    const r = parseRfq(
      valid({
        files: [],
        description: 'Aluminum plate 4 x 2 in',
        breaks: '',
        finishing: [],
        docs: undefined,
        date: '',
        notes: '',
        phone: '',
      }),
      today,
    );
    expect(r.ok).toBe(true);
  });

  it('trims text and accepts a quantity sent as a digit string', () => {
    const r = parseRfq(
      valid({ part: '  Bracket  ', quantity: '12', email: ' dana@northline.example ' }),
      today,
    );
    expect(r.ok && r.value).toMatchObject({
      part: 'Bracket',
      quantity: 12,
      email: 'dana@northline.example',
    });
  });

  it('drops fields it does not know instead of passing them on', () => {
    const r = parseRfq(
      valid({ isAdmin: true, to: 'victim@example.com', __proto__: { polluted: 1 } }),
      today,
    );
    expect(r.ok).toBe(true);
    const keys = Object.keys(r.ok ? r.value : {});
    expect(keys).not.toContain('isAdmin');
    expect(keys).not.toContain('to');
    expect(keys).not.toContain('kp_extra'); // the honeypot is read by the handler, never forwarded
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps HTML as plain text (escaping is the email template job)', () => {
    const r = parseRfq(valid({ part: '<img src=x onerror=alert(1)>' }), today);
    expect(r.ok && r.value.part).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('parseRfq: messages are the ones the form shows', () => {
  it('asks for every required field', () => {
    const r = parseRfq({}, today);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toMatchObject({
      part: 'Enter part name or number.',
      process: 'Choose process.',
      material: 'Choose material.',
      quantity: 'Enter quantity.',
      tolerance: 'Choose tightest tolerance on the drawing.',
      name: 'Enter your name.',
      company: 'Enter company.',
      email: 'Enter work email.',
      description: 'Attach a drawing, or describe the part: size, material, key tolerances.',
    });
  });

  it('treats whitespace-only text as missing', () => {
    expect(errorsOf({ part: '   ' }).part).toBe('Enter part name or number.');
  });

  it('checks text length at the limit', () => {
    expect(parseRfq(valid({ part: 'x'.repeat(120) }), today).ok).toBe(true);
    expect(errorsOf({ part: 'x'.repeat(121) }).part).toBe('Part name or number is too long.');
    expect(errorsOf({ notes: 'x'.repeat(2001) }).notes).toBe('Notes for the engineer is too long.');
    expect(errorsOf({ breaks: 'x'.repeat(81) }).breaks).toBe(
      'Other quantities to price is too long.',
    );
  });

  it('checks the quantity range and that it is a whole number', () => {
    expect(parseRfq(valid({ quantity: 1 }), today).ok).toBe(true);
    expect(parseRfq(valid({ quantity: 100000 }), today).ok).toBe(true);
    expect(errorsOf({ quantity: 0 }).quantity).toBe('Quantity must be at least 1.');
    expect(errorsOf({ quantity: 100001 }).quantity).toBe(
      'Quantity must be 100,000 or less. For larger programs, call us.',
    );
    expect(errorsOf({ quantity: 2.5 }).quantity).toBe('Quantity must be a whole number.');
    expect(errorsOf({ quantity: 'abc' }).quantity).toBe('Quantity must be a whole number.');
    expect(errorsOf({ quantity: '1e3' }).quantity).toBe('Quantity must be a whole number.');
    expect(errorsOf({ quantity: Number.NaN }).quantity).toBe('Quantity must be a whole number.');
  });

  it('checks the email shape', () => {
    expect(errorsOf({ email: 'dana@' }).email).toBe(
      'Enter an email address like name@company.com.',
    );
    expect(errorsOf({ email: 'a b@c.co' }).email).toBe(
      'Enter an email address like name@company.com.',
    );
  });

  it('checks the phone pattern', () => {
    expect(parseRfq(valid({ phone: '+1 610.555.0123' }), today).ok).toBe(true);
    expect(errorsOf({ phone: 'call me' }).phone).toBe(
      'Use digits, spaces, dashes, dots or parentheses.',
    );
    expect(errorsOf({ phone: '12345' }).phone).toBe(
      'Use digits, spaces, dashes, dots or parentheses.',
    );
  });

  it('only accepts listed select values', () => {
    expect(errorsOf({ process: 'laser-cutting' }).process).toBe('Check process.');
    expect(errorsOf({ material: 'unobtainium' }).material).toBe('Check material.');
    expect(errorsOf({ tolerance: '0.1' }).tolerance).toBe(
      'Check tightest tolerance on the drawing.',
    );
  });

  it('only accepts listed checkbox values, once each', () => {
    expect(errorsOf({ finishing: ['rust'] }).finishing).toBe('Check finishing and secondary work.');
    expect(errorsOf({ docs: ['coc', 'coc'] }).docs).toBe('Check paperwork with the parts.');
    expect(errorsOf({ docs: 'coc' }).docs).toBe('Check paperwork with the parts.');
  });

  it('checks the target date', () => {
    expect(errorsOf({ date: '2026-11-04' }).date).toBe('Pick a date after today.');
    expect(errorsOf({ date: '2027-02-30' }).date).toBe('Use the format YYYY-MM-DD.');
    expect(errorsOf({ date: 'soon' }).date).toBe('Use the format YYYY-MM-DD.');
  });

  it('wants a file or a description', () => {
    const msg = 'Attach a drawing, or describe the part: size, material, key tolerances.';
    expect(errorsOf({ files: [], description: '' }).description).toBe(msg);
    expect(errorsOf({ files: undefined, description: '  ' }).description).toBe(msg);
  });
});

describe('parseRfq: wrong types and hostile values', () => {
  it('rejects a body that is not an object', () => {
    for (const body of [null, 'text', 42, [], undefined]) {
      const r = parseRfq(body, today);
      expect(r).toEqual({ ok: false, errors: { form: 'Send the request as a JSON object.' } });
    }
  });

  it('rejects values of the wrong type', () => {
    expect(errorsOf({ part: 123 }).part).toBe('Check part name or number.');
    expect(errorsOf({ part: ['a'] }).part).toBe('Check part name or number.');
    expect(errorsOf({ name: { first: 'Dana' } }).name).toBe('Check your name.');
    expect(errorsOf({ email: true }).email).toBe('Check work email.');
    expect(errorsOf({ quantity: [5] }).quantity).toBe('Quantity must be a whole number.');
  });

  it('rejects control characters, including line breaks in one-line fields', () => {
    expect(errorsOf({ name: 'Dana\r\nBcc: spy@example.com' }).name).toBe('Check your name.');
    expect(errorsOf({ company: 'Acme\u0000' }).company).toBe('Check company.');
    expect(errorsOf({ part: 'a\tb' }).part).toBe('Check part name or number.');
    expect(parseRfq(valid({ notes: 'line one\nline two' }), today).ok).toBe(true);
    expect(errorsOf({ notes: 'bell\u0007' }).notes).toBe('Check notes for the engineer.');
  });
});

describe('parseRfq: files', () => {
  it('accepts up to five files, rejects six', () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      file({ url: `https://s.private.blob.vercel-storage.com/p${i}.pdf`, name: `p${i}.pdf` }),
    );
    expect(parseRfq(valid({ files: five }), today).ok).toBe(true);
    expect(errorsOf({ files: [...five, file()] }).files).toBe('Attach up to 5 files.');
  });

  it('rejects a disallowed or disguised extension', () => {
    expect(errorsOf({ files: [file({ name: 'setup.exe' })] }).files).toBe(
      '"setup.exe" is not a supported file. Use STEP, IGES, DWG, DXF or PDF.',
    );
    expect(errorsOf({ files: [file({ name: 'part.step.exe' })] }).files).toContain(
      'not a supported file',
    );
    expect(errorsOf({ files: [file({ name: 'noextension' })] }).files).toContain(
      'not a supported file',
    );
  });

  it('rejects empty and oversized files, at the limit', () => {
    expect(parseRfq(valid({ files: [file({ size: 25 * MB })] }), today).ok).toBe(true);
    expect(errorsOf({ files: [file({ size: 0 })] }).files).toBe(
      '"bracket.step" is empty. Choose the file again.',
    );
    expect(errorsOf({ files: [file({ size: 25 * MB + 1 })] }).files).toContain(
      'The limit is 25 MB',
    );
  });

  it('rejects malformed file entries', () => {
    for (const bad of [
      'x',
      null,
      {},
      { url: 1, name: 'a.pdf', size: 1 },
      { url: 'https://a', name: 'a.pdf', size: '1' },
      { url: 'https://a', name: 'a.pdf', size: -5 },
    ]) {
      expect(errorsOf({ files: [bad] }).files, JSON.stringify(bad)).toBe(
        'Check the attached files.',
      );
    }
    expect(errorsOf({ files: 'a.pdf' }).files).toBe('Check the attached files.');
  });

  it('rejects the same file twice', () => {
    expect(errorsOf({ files: [file(), file()] }).files).toBe('Check the attached files.');
  });

  it('cuts nothing silently: an over-long file name is an error', () => {
    expect(errorsOf({ files: [file({ name: 'a'.repeat(300) + '.pdf' })] }).files).toBe(
      'Check the attached files.',
    );
  });
});
