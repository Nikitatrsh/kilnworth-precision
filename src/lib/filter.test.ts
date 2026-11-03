import { describe, expect, it } from 'vitest';
import {
  type ProcessItem,
  criteriaToQuery,
  filterProcesses,
  parseCriteria,
  relaxations,
} from './filter';

const items: ProcessItem[] = [
  { id: 'mill', maxSize: 30, toleranceBest: 0.0005, materials: ['al', 'ss', 'delrin'] },
  { id: 'swiss', maxSize: 12, toleranceBest: 0.0002, materials: ['ss', 'ti'] },
  { id: 'edm', maxSize: 23.6, toleranceBest: 0.0002, materials: ['ss', 'tool'] },
];
const known = {
  processes: ['mill', 'swiss', 'edm'],
  materials: ['al', 'ss', 'ti', 'tool', 'delrin'],
};
const none = { process: [], material: null, size: null, tolerance: null };
const ids = (c: Parameters<typeof filterProcesses>[1]) =>
  filterProcesses(items, c).map((r) => r.id);

describe('filterProcesses', () => {
  it('returns everything with no criteria', () => {
    expect(ids(none)).toEqual(['mill', 'swiss', 'edm']);
  });
  it('keeps processes whose envelope fits the part', () => {
    expect(ids({ ...none, size: 20 })).toEqual(['mill', 'edm']);
    expect(ids({ ...none, size: 30 })).toEqual(['mill']); // exactly at the limit fits
  });
  it('keeps processes that can hold the tolerance or tighter', () => {
    expect(ids({ ...none, tolerance: 0.0002 })).toEqual(['swiss', 'edm']);
  });
  it('narrows by material and lists only that material', () => {
    const r = filterProcesses(items, { ...none, material: 'ti' });
    expect(r).toEqual([{ id: 'swiss', materials: ['ti'] }]);
  });
  it('limits to the chosen processes', () => {
    expect(ids({ ...none, process: ['edm', 'mill'] })).toEqual(['mill', 'edm']);
  });
  it('combines all criteria', () => {
    expect(ids({ process: [], material: 'ss', size: 15, tolerance: 0.0002 })).toEqual(['edm']);
  });
});

describe('relaxations', () => {
  it('says which single filter to drop to get results back', () => {
    const c = { ...none, material: 'delrin', tolerance: 0.0002 };
    expect(ids(c)).toEqual([]);
    expect(relaxations(items, c)).toEqual([
      { key: 'material', count: 2 },
      { key: 'tolerance', count: 1 },
    ]);
  });
});

describe('parseCriteria', () => {
  it('reads processes, material, size and tolerance from the query', () => {
    expect(
      parseCriteria('?process=mill&process=edm&material=ss&size=12&tol=0.0005', known),
    ).toEqual({
      process: ['mill', 'edm'],
      material: 'ss',
      size: 12,
      tolerance: 0.0005,
    });
  });
  it('converts a size given in mm to inches', () => {
    expect(parseCriteria('?size=254&unit=mm', known).size).toBeCloseTo(10);
  });
  it('drops unknown ids and nonsense numbers instead of failing', () => {
    expect(parseCriteria('?process=laser&material=gold&size=-3&tol=abc', known)).toEqual(none);
    expect(parseCriteria('?size=Infinity', known).size).toBeNull();
  });
});

describe('criteriaToQuery', () => {
  it('round-trips through parseCriteria', () => {
    const c = { process: ['swiss'], material: 'ti', size: 4, tolerance: 0.0002 };
    expect(parseCriteria(criteriaToQuery(c), known)).toEqual(c);
  });
  it('writes size in mm when the visitor works in mm', () => {
    expect(criteriaToQuery({ ...none, size: 10 }, 'mm')).toBe('?size=254&unit=mm');
  });
  it('is empty for no criteria, so the URL stays clean', () => {
    expect(criteriaToQuery(none)).toBe('');
  });
});
