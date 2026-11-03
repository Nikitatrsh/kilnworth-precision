import { describe, expect, it } from 'vitest';
import { TOLERANCE_STEPS, bandPercent, hairComparison } from './tolerance';

describe('bandPercent', () => {
  it('maps the widest band (±0.005 in, 0.010 in total) to the full width', () => {
    expect(bandPercent(0.005)).toBe(100);
  });
  it('is linear, so the picture stays honest', () => {
    expect(bandPercent(0.0005)).toBeCloseTo(10);
    expect(bandPercent(0.0002)).toBeCloseTo(4);
  });
});

describe('hairComparison', () => {
  it('counts hairs when the band is wider than one', () => {
    expect(hairComparison(0.005)).toBe('3.3 hairs wide');
  });
  it('uses a percentage when the band is narrower than a hair', () => {
    expect(hairComparison(0.0005)).toBe("33% of a hair's width");
    expect(hairComparison(0.0002)).toBe("13% of a hair's width");
  });
});

describe('TOLERANCE_STEPS', () => {
  it('runs from loose to tight, so the slider reads left to right', () => {
    const values = TOLERANCE_STEPS.map((s) => Number(s.value));
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });
});
