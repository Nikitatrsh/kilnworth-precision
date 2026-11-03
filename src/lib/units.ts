// Inch/mm conversion and formatting. Source data is always written in inches, as strings,
// so the precision a machinist wrote ("2.250", not 2.25) survives into the page.

export type Unit = 'in' | 'mm';

const MM_PER_INCH = 25.4; // exact by definition

export const inchToMm = (inch: number) => inch * MM_PER_INCH;
export const mmToInch = (mm: number) => mm / MM_PER_INCH;

interface FormatOptions {
  /** Tolerance: prefix with ± and, in mm, always show three decimals. */
  tol?: boolean;
  /** Number only, no " in"/" mm" (drawings state the unit once, in the title block). */
  bare?: boolean;
}

function parse(value: string): { n: number; decimals: number } {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`Not a plain decimal inch value: "${value}"`);
  return { n: Number(value), decimals: value.split('.')[1]?.length ?? 0 };
}

const prefix = (tol?: boolean) => (tol ? '±' : '');

const suffix = (unit: Unit, bare?: boolean) => (bare ? '' : ` ${unit}`);

export function formatInch(value: string, { tol, bare }: FormatOptions = {}): string {
  parse(value);
  return `${prefix(tol)}${value}${suffix('in', bare)}`;
}

export function formatMm(value: string, { tol, bare }: FormatOptions = {}): string {
  const { n, decimals } = parse(value);
  // One mm decimal less than the inch value carries roughly the same precision (1 mm ≈ 0.04 in).
  const mmDecimals = tol ? 3 : Math.min(Math.max(decimals - 1, 0), 3);
  const text = inchToMm(n).toLocaleString('en-US', {
    minimumFractionDigits: mmDecimals,
    maximumFractionDigits: mmDecimals,
  });
  return `${prefix(tol)}${text}${suffix('mm', bare)}`;
}

export const format = (value: string, unit: Unit, options?: FormatOptions) =>
  unit === 'mm' ? formatMm(value, options) : formatInch(value, options);
