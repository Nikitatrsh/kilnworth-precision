// Capability explorer logic: which processes can make a part, given material, size and tolerance.
// Pure functions; the page script (CapabilityExplorer.astro) only wires them to the form and URL.
import { inchToMm, mmToInch, type Unit } from './units';

export interface ProcessItem {
  id: string;
  maxSize: number; // inches, largest single dimension
  toleranceBest: number; // inches, tightest ± by agreement
  materials: string[]; // material ids
}

export interface Criteria {
  process: string[]; // empty = any
  material: string | null;
  size: number | null; // inches
  tolerance: number | null; // inches, the ± the part needs
}

export interface Match {
  id: string;
  materials: string[]; // the materials to show for this process
}

export function filterProcesses(items: readonly ProcessItem[], c: Criteria): Match[] {
  return items
    .filter(
      (p) =>
        (c.process.length === 0 || c.process.includes(p.id)) &&
        (c.size === null || p.maxSize >= c.size) &&
        (c.tolerance === null || p.toleranceBest <= c.tolerance) &&
        (c.material === null || p.materials.includes(c.material)),
    )
    .map((p) => ({ id: p.id, materials: c.material ? [c.material] : p.materials }));
}

type Key = keyof Criteria;
const EMPTY: Criteria = { process: [], material: null, size: null, tolerance: null };

/** For an empty result: how many processes come back if each single filter is removed. */
export function relaxations(
  items: readonly ProcessItem[],
  c: Criteria,
): { key: Key; count: number }[] {
  return (Object.keys(EMPTY) as Key[])
    .filter((key) => (key === 'process' ? c.process.length > 0 : c[key] !== null))
    .map((key) => ({ key, count: filterProcesses(items, { ...c, [key]: EMPTY[key] }).length }))
    .filter((r) => r.count > 0);
}

const positive = (raw: string | null) => {
  const n = Number(raw);
  return raw !== null && raw !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** Reads criteria from a query string. Unknown ids and bad numbers are ignored, never thrown. */
export function parseCriteria(
  search: string,
  known: { processes: readonly string[]; materials: readonly string[] },
): Criteria {
  const q = new URLSearchParams(search);
  const material = q.get('material');
  const size = positive(q.get('size'));
  return {
    process: q.getAll('process').filter((id) => known.processes.includes(id)),
    material: material && known.materials.includes(material) ? material : null,
    size: size === null ? null : q.get('unit') === 'mm' ? mmToInch(size) : size,
    tolerance: positive(q.get('tol')),
  };
}

/** Writes criteria to a query string ("" when nothing is set). Size is written in `unit`. */
export function criteriaToQuery(c: Criteria, unit: Unit = 'in'): string {
  const q = new URLSearchParams();
  for (const id of c.process) q.append('process', id);
  if (c.material) q.set('material', c.material);
  if (c.size !== null) {
    const value = unit === 'mm' ? inchToMm(c.size) : c.size;
    q.set('size', String(Number(value.toFixed(3)))); // trims float noise like 11.811023622
    if (unit === 'mm') q.set('unit', 'mm');
  }
  if (c.tolerance !== null) q.set('tol', String(c.tolerance));
  const s = q.toString();
  return s ? `?${s}` : '';
}
