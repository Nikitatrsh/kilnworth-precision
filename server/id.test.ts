import { describe, expect, it } from 'vitest';
import { newRequestId } from './id';

describe('newRequestId', () => {
  it('looks like KP-YYMMDD-XXXXX with the UTC date', () => {
    expect(newRequestId(new Date('2026-11-04T23:59:59Z'))).toMatch(/^KP-261104-[0-9A-Z]{5}$/);
    expect(newRequestId(new Date('2027-01-09T00:00:00Z'))).toMatch(/^KP-270109-/);
  });

  it('never uses characters that are easy to misread (I, L, O, U)', () => {
    const suffixes = Array.from({ length: 2000 }, () => newRequestId().slice(10)).join('');
    expect(suffixes).not.toMatch(/[ILOU]/);
  });

  it('gives different ids for different calls', () => {
    // 5 symbols = 33 million combinations a day; of 100 draws a repeat or two is a one-in-thousand chance, never a dozen.
    const ids = new Set(Array.from({ length: 100 }, () => newRequestId()));
    expect(ids.size).toBeGreaterThanOrEqual(98);
  });
});
