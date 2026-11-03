// Behavior for ToleranceRuler.astro: the slider moves the band and rewrites the readout.
// Math and data: src/lib/tolerance.ts (unit-tested).
import { TOLERANCE_STEPS, bandPercent, hairComparison } from '../../lib/tolerance';
import { formatInch, formatMm } from '../../lib/units';

for (const ruler of document.querySelectorAll<HTMLElement>('[data-ruler]')) {
  const input = ruler.querySelector<HTMLInputElement>('input[type=range]')!;
  const out = (name: string) => ruler.querySelector<HTMLElement>(`[data-out="${name}"]`)!;
  const bandRect = ruler.querySelector('[data-band]')!;
  const lo = ruler.querySelector('[data-edge="lo"]')!;
  const hi = ruler.querySelector('[data-edge="hi"]')!;

  const render = () => {
    const step = TOLERANCE_STEPS[Number(input.value)];
    const tol = Number(step.value);
    const w = bandPercent(tol);
    // SVG attributes, not inline styles, so the CSP needs no 'unsafe-inline'
    bandRect.setAttribute('x', `${50 - w / 2}%`);
    bandRect.setAttribute('width', `${w}%`);
    for (const [line, x] of [
      [lo, 50 - w / 2],
      [hi, 50 + w / 2],
    ] as const) {
      line.setAttribute('x1', `${x}%`);
      line.setAttribute('x2', `${x}%`);
    }
    out('in').textContent = formatInch(step.value, { tol: true });
    out('mm').textContent = formatMm(step.value, { tol: true });
    out('hair').textContent = hairComparison(tol);
    out('note').textContent = step.note;
    const mm = document.documentElement.dataset.unit === 'mm';
    input.setAttribute(
      'aria-valuetext',
      mm ? formatMm(step.value, { tol: true }) : formatInch(step.value, { tol: true }),
    );
  };
  input.addEventListener('input', render);
  document.addEventListener('unitchange', render);
}
