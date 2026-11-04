import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  fieldMessage,
  formatBytes,
  validateDescription,
  validateFiles,
  validateTargetDate,
} from './rfq-validate';

const file = (name: string, size = 1000) => ({ name, size });
const MB = 1024 * 1024;

describe('validateDescription', () => {
  it('is required when no file is attached, so a buyer with only a sketch can still ask', () => {
    expect(validateDescription('', 0)).toBe(
      'Attach a drawing, or describe the part: size, material, key tolerances.',
    );
    expect(validateDescription('   ', 0)).not.toBeNull();
  });
  it('is optional once a file is attached', () => {
    expect(validateDescription('', 1)).toBeNull();
  });
  it('accepts a description without a file', () => {
    expect(validateDescription('Aluminum bracket, 4 x 2 in, two 0.25 in holes', 0)).toBeNull();
  });
});

describe('validateFiles', () => {
  it('allows no files (a description can stand in for them)', () => {
    expect(validateFiles([])).toBeNull();
  });
  it('accepts every allowed extension, in any letter case', () => {
    // two batches, because one request takes at most 5 files
    expect(validateFiles(['a.step', 'b.STP', 'c.iges', 'd.IGS'].map((n) => file(n)))).toBeNull();
    expect(validateFiles(['e.dwg', 'f.dxf', 'g.Pdf'].map((n) => file(n)))).toBeNull();
  });
  it('rejects other extensions and names the file', () => {
    expect(validateFiles([file('bracket.zip')])).toBe(
      '"bracket.zip" is not a supported file. Use STEP, IGES, DWG, DXF or PDF.',
    );
  });
  it('judges only the last extension, so part.step.exe is rejected', () => {
    expect(validateFiles([file('part.step.exe')])).toMatch(/not a supported file/);
  });
  it('rejects names without an extension', () => {
    expect(validateFiles([file('housing')])).toMatch(/not a supported file/);
  });
  it('allows exactly 25 MB and rejects one byte more', () => {
    expect(validateFiles([file('a.step', MAX_FILE_BYTES)])).toBeNull();
    expect(validateFiles([file('big.step', MAX_FILE_BYTES + 1)])).toBe(
      '"big.step" is 25.0 MB. The limit is 25 MB per file; put a download link in Notes instead.',
    );
  });
  it('rejects empty files', () => {
    expect(validateFiles([file('a.pdf', 0)])).toBe('"a.pdf" is empty. Choose the file again.');
  });
  it('limits the number of files', () => {
    expect(validateFiles(Array.from({ length: 6 }, (_, i) => file(`${i}.pdf`)))).toBe(
      'Attach up to 5 files.',
    );
  });
});

describe('formatBytes', () => {
  it('uses KB under a megabyte and one decimal for MB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(26.2 * MB)).toBe('26.2 MB');
  });
});

describe('validateTargetDate', () => {
  const today = new Date(2026, 10, 3); // 3 Nov 2026, local time
  it('is optional', () => {
    expect(validateTargetDate('', today)).toBeNull();
  });
  it('rejects today and past dates', () => {
    expect(validateTargetDate('2026-11-03', today)).toBe('Pick a date after today.');
    expect(validateTargetDate('2025-01-01', today)).toBe('Pick a date after today.');
  });
  it('accepts future dates', () => {
    expect(validateTargetDate('2026-11-04', today)).toBeNull();
  });
  it('rejects text that is not a date', () => {
    expect(validateTargetDate('next week', today)).toBe('Use the format YYYY-MM-DD.');
  });
  it('rejects days that do not exist instead of rolling them into the next month', () => {
    expect(validateTargetDate('2027-02-30', today)).toBe('Use the format YYYY-MM-DD.');
    expect(validateTargetDate('2027-13-01', today)).toBe('Use the format YYYY-MM-DD.');
  });
});

describe('validateTargetDate on the server', () => {
  const tooEarly = 'Pick a date after today.';
  // Both ends of the UTC day: the answer must not depend on the time of day or the machine's zone.
  it.each(['2026-11-04T00:00:00Z', '2026-11-04T12:00:00Z', '2026-11-04T23:59:59Z'])(
    'accepts yesterday and later, refuses the day before yesterday (now %s UTC)',
    (iso) => {
      const now = new Date(iso);
      expect(validateTargetDate('2026-11-02', now, 'server')).toBe(tooEarly);
      expect(validateTargetDate('2026-11-03', now, 'server')).toBeNull(); // yesterday
      expect(validateTargetDate('2026-11-04', now, 'server')).toBeNull();
      expect(validateTargetDate('2026-11-05', now, 'server')).toBeNull();
    },
  );
  it('keeps the browser rule strict', () => {
    const today = new Date(2026, 10, 4);
    expect(validateTargetDate('2026-11-04', today)).toBe(tooEarly);
    expect(validateTargetDate('2026-11-04', today, 'local')).toBe(tooEarly);
  });
  it('still rejects text and days that do not exist', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    expect(validateTargetDate('soon', now, 'server')).toBe('Use the format YYYY-MM-DD.');
    expect(validateTargetDate('2027-02-30', now, 'server')).toBe('Use the format YYYY-MM-DD.');
  });
});

describe('fieldMessage', () => {
  const ok = {
    valueMissing: false,
    typeMismatch: false,
    rangeUnderflow: false,
    rangeOverflow: false,
    patternMismatch: false,
    tooLong: false,
    badInput: false,
    stepMismatch: false,
  };
  it('returns null for a valid field', () => {
    expect(fieldMessage(ok, { label: 'Quantity', kind: 'number' })).toBeNull();
  });
  it('words missing values by control type', () => {
    expect(
      fieldMessage({ ...ok, valueMissing: true }, { label: 'Part name or number', kind: 'text' }),
    ).toBe('Enter part name or number.');
    expect(fieldMessage({ ...ok, valueMissing: true }, { label: 'Material', kind: 'select' })).toBe(
      'Choose material.',
    );
  });
  it('explains email format with an example', () => {
    expect(
      fieldMessage({ ...ok, typeMismatch: true }, { label: 'Work email', kind: 'email' }),
    ).toBe('Enter an email address like name@company.com.');
  });
  it('asks for whole numbers when a fraction is typed into quantity', () => {
    expect(fieldMessage({ ...ok, stepMismatch: true }, { label: 'Quantity', kind: 'number' })).toBe(
      'Quantity must be a whole number.',
    );
  });
  it('states the allowed range for numbers', () => {
    expect(
      fieldMessage(
        { ...ok, rangeUnderflow: true },
        { label: 'Quantity', kind: 'number', min: '1' },
      ),
    ).toBe('Quantity must be at least 1.');
    expect(
      fieldMessage(
        { ...ok, rangeOverflow: true },
        { label: 'Quantity', kind: 'number', max: '100000' },
      ),
    ).toBe('Quantity must be 100,000 or less. For larger programs, call us.');
  });
});
