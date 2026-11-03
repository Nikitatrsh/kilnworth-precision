// Behavior for CapabilityExplorer.astro. Filtering rules: src/lib/filter.ts (unit-tested).
import {
  type Criteria,
  criteriaToQuery,
  filterProcesses,
  parseCriteria,
  relaxations,
} from '../../lib/filter';
import { inchToMm, mmToInch, type Unit } from '../../lib/units';

const root = document.querySelector<HTMLElement>('[data-explorer]');
if (root) init(root);

function init(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-filters]')!;
  const rows = [...root.querySelectorAll<HTMLLIElement>('[data-process]')];
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const hint = root.querySelector<HTMLElement>('[data-empty-hint]')!;
  const actions = root.querySelector<HTMLElement>('[data-empty-actions]')!;
  const material = form.elements.namedItem('material') as HTMLSelectElement;
  const size = form.elements.namedItem('size') as HTMLInputElement;
  const tol = form.elements.namedItem('tol') as HTMLSelectElement;
  const processBoxes = [...form.querySelectorAll<HTMLInputElement>('input[name=process]')];

  const items = rows.map((li) => ({
    id: li.dataset.process!,
    maxSize: Number(li.dataset.max),
    toleranceBest: Number(li.dataset.tol),
    materials: li.dataset.materials!.split(' '),
  }));
  const known = {
    processes: items.map((i) => i.id),
    materials: [...material.options].map((o) => o.value).filter(Boolean),
  };
  const unit = () => (document.documentElement.dataset.unit === 'mm' ? 'mm' : 'in') as Unit;
  const labels: Record<keyof Criteria, string> = {
    process: 'the process choice',
    material: 'the material',
    size: 'the size limit',
    tolerance: 'the tolerance',
  };

  function readForm(): Criteria {
    const typed = Number(size.value);
    const sizeIn = size.value && typed > 0 ? (unit() === 'mm' ? mmToInch(typed) : typed) : null;
    return {
      process: processBoxes.filter((b) => b.checked).map((b) => b.value),
      material: material.value || null,
      size: sizeIn,
      tolerance: tol.value ? Number(tol.value) : null,
    };
  }

  function writeForm(c: Criteria) {
    material.value = c.material ?? '';
    tol.value = c.tolerance === null ? '' : String(c.tolerance);
    const shown = c.size === null ? null : unit() === 'mm' ? inchToMm(c.size) : c.size;
    size.value = shown === null ? '' : String(Number(shown.toFixed(3)));
    for (const b of processBoxes) b.checked = c.process.includes(b.value);
  }

  function apply(c: Criteria, updateUrl = true) {
    const matches = filterProcesses(items, c);
    const byId = new Map(matches.map((m) => [m.id, m]));
    for (const li of rows) {
      const m = byId.get(li.dataset.process!);
      li.hidden = !m;
      for (const chip of li.querySelectorAll<HTMLElement>('[data-material]')) {
        const hit = c.material !== null && chip.dataset.material === c.material;
        chip.toggleAttribute('data-hit', hit);
      }
    }
    status.textContent = `${matches.length} of ${items.length} processes match.`;
    empty.hidden = matches.length > 0;
    if (!matches.length) renderHint(c);
    if (updateUrl)
      history.replaceState(null, '', `${location.pathname}${criteriaToQuery(c, unit())}`);
  }

  // Empty result: one button per single filter whose removal brings results back.
  function renderHint(c: Criteria) {
    const options = relaxations(items, c);
    hint.textContent = options.length
      ? 'Remove one filter to see options:'
      : 'Try clearing the filters.';
    actions.replaceChildren(
      ...options.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `Remove ${labels[o.key]} (${o.count} ${o.count === 1 ? 'match' : 'matches'})`;
        b.addEventListener('click', () => {
          const next = { ...c, [o.key]: o.key === 'process' ? [] : null };
          writeForm(next);
          apply(next);
        });
        return b;
      }),
    );
  }

  form.addEventListener('input', () => apply(readForm()));
  form.addEventListener('change', () => apply(readForm()));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('reset', () => setTimeout(() => apply(readForm()))); // after the browser clears fields
  document.addEventListener('unitchange', () => {
    // Keep the same physical size when the unit changes; rewrite the number in the new unit.
    const c = parseCriteria(location.search, known);
    writeForm(c);
    apply(c);
  });

  const initial = parseCriteria(location.search, known);
  writeForm(initial);
  apply(initial, false);
}
