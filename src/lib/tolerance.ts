// Data and math for the tolerance ruler (components/interactive/ToleranceRuler.astro).
// Values are inches, as strings, like everywhere else (see units.ts).

export const TOLERANCE_STEPS = [
  { value: '0.005', note: 'Our standard on any dimension the drawing does not call out.' },
  { value: '0.001', note: 'Typical for slip fits, dowel holes and locating features.' },
  { value: '0.0005', note: 'Held on bores, bearing fits and datum features when the print asks.' },
  {
    value: '0.0002',
    note: 'By agreement on selected features, with the measuring method agreed first.',
  },
] as const;

export const DEFAULT_STEP = 2; // ±0.0005 in, the number in the home headline

// Everyday things at the same scale. Sizes are typical values, rounded.
export const REFERENCES = [
  { label: 'Sheet of copy paper', value: '0.004' },
  { label: 'Human hair', value: '0.003' },
  { label: 'Red blood cell', value: '0.0003' },
] as const;

const HAIR = 0.003;
const FULL_WIDTH = 0.01; // inches shown across 100% of the ruler: the ±0.005 band

/** Width of the whole ± band as a percentage of the ruler. */
export const bandPercent = (tolInch: number) => ((2 * tolInch) / FULL_WIDTH) * 100;

/** Width of an object as a percentage of the ruler. */
export const sizePercent = (inch: number) => (inch / FULL_WIDTH) * 100;

export function hairComparison(tolInch: number): string {
  const ratio = (2 * tolInch) / HAIR;
  return ratio >= 1
    ? `${ratio.toFixed(1)} hairs wide`
    : `${Math.round(ratio * 100)}% of a hair's width`;
}
