import { describe, expect, it } from 'vitest';
import { formatInch, formatMm, inchToMm, mmToInch } from './units';

describe('inchToMm / mmToInch', () => {
  it('uses the exact 25.4 definition', () => {
    expect(inchToMm(1)).toBe(25.4);
    expect(mmToInch(25.4)).toBe(1);
  });
});

describe('formatInch', () => {
  it('keeps the precision written in the source, trailing zeros included', () => {
    expect(formatInch('2.250')).toBe('2.250 in');
    expect(formatInch('12')).toBe('12 in');
  });
  it('prefixes tolerances with ±', () => {
    expect(formatInch('0.0005', { tol: true })).toBe('±0.0005 in');
  });
});

describe('formatMm', () => {
  it('drops one decimal against the inch value for sizes', () => {
    expect(formatMm('2.250')).toBe('57.15 mm');
    expect(formatMm('12')).toBe('305 mm');
    expect(formatMm('0.5')).toBe('13 mm');
  });
  it('shows tolerances to three decimals, so tight ones do not round to zero', () => {
    expect(formatMm('0.005', { tol: true })).toBe('±0.127 mm');
    expect(formatMm('0.0005', { tol: true })).toBe('±0.013 mm');
    expect(formatMm('0.0002', { tol: true })).toBe('±0.005 mm');
  });
  it('groups thousands for long envelopes', () => {
    expect(formatMm('48')).toBe('1,219 mm');
  });
  it('can omit the unit, as dimensions on a drawing do', () => {
    expect(formatMm('1.250', { bare: true })).toBe('31.75');
    expect(formatInch('1.250', { bare: true })).toBe('1.250');
  });
  it('rejects input that is not a plain decimal number', () => {
    expect(() => formatMm('abc')).toThrow();
    expect(() => formatInch('-1')).toThrow();
  });
});
