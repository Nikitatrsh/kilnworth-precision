// Validation rules for the quote request form. Pure functions, no DOM, so they are unit-tested
// and the same rules can be reused on a server when the form is wired to a real backend.
// Client-side checks are for the visitor's convenience only: a server must check again
// (extension, size AND file content), because anything in the browser can be bypassed.

export const ALLOWED_EXTENSIONS = [
  '.step',
  '.stp',
  '.iges',
  '.igs',
  '.dwg',
  '.dxf',
  '.pdf',
] as const;
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(',');
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 5;
const FORMATS = 'STEP, IGES, DWG, DXF or PDF';

interface FileLike {
  name: string;
  size: number;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`;
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
};

/** First problem with the chosen files, or null if they are fine. No files is fine too:
 *  the description then becomes required (validateDescription). */
export function validateFiles(files: readonly FileLike[]): string | null {
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files.`;
  for (const f of files) {
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(f.name))) {
      return `"${f.name}" is not a supported file. Use ${FORMATS}.`;
    }
    if (f.size === 0) return `"${f.name}" is empty. Choose the file again.`;
    if (f.size > MAX_FILE_BYTES) {
      return `"${f.name}" is ${formatBytes(f.size)}. The limit is 25 MB per file; put a download link in Notes instead.`;
    }
  }
  return null;
}

/** Part description: required only when no file is attached. */
export function validateDescription(text: string, fileCount: number): string | null {
  return fileCount === 0 && text.trim() === ''
    ? 'Attach a drawing, or describe the part: size, material, key tolerances.'
    : null;
}

/**
 * Optional target date: must be a real date after `today`.
 * The browser counts "today" in the visitor's time zone ('local', strict). The server cannot know
 * that zone, so it counts in UTC and also accepts yesterday ('server'): a visitor in the Americas
 * who picked "tomorrow" in the evening would otherwise pass the form and be refused after Send.
 */
export function validateTargetDate(
  value: string,
  today: Date = new Date(),
  mode: 'local' | 'server' = 'local',
): string | null {
  if (value === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return 'Use the format YYYY-MM-DD.';
  const picked = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // new Date() rolls 30 February over to March; the browser's date input never sends that, a server can see it.
  if (picked.getMonth() !== Number(m[2]) - 1) return 'Use the format YYYY-MM-DD.';
  const startOfToday =
    mode === 'server'
      ? new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 2)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return picked > startOfToday ? null : 'Pick a date after today.';
}

type Validity = Pick<
  ValidityState,
  | 'valueMissing'
  | 'typeMismatch'
  | 'rangeUnderflow'
  | 'rangeOverflow'
  | 'patternMismatch'
  | 'tooLong'
  | 'badInput'
  | 'stepMismatch'
>;

interface FieldInfo {
  label: string;
  kind: 'text' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'file';
  min?: string;
  max?: string;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const grouped = (n: string) => Number(n).toLocaleString('en-US');

/** Human message for the browser's validity flags, written next to the field. */
export function fieldMessage(v: Validity, f: FieldInfo): string | null {
  if (v.valueMissing)
    return f.kind === 'select' ? `Choose ${lower(f.label)}.` : `Enter ${lower(f.label)}.`;
  if (v.typeMismatch && f.kind === 'email') return 'Enter an email address like name@company.com.';
  if (v.badInput || v.stepMismatch) {
    return f.kind === 'number' ? `${f.label} must be a whole number.` : `Check ${lower(f.label)}.`;
  }
  if (v.rangeUnderflow) return `${f.label} must be at least ${grouped(f.min ?? '0')}.`;
  if (v.rangeOverflow)
    return `${f.label} must be ${grouped(f.max ?? '0')} or less. For larger programs, call us.`;
  if (v.patternMismatch && f.kind === 'tel')
    return 'Use digits, spaces, dashes, dots or parentheses.';
  if (v.tooLong) return `${f.label} is too long.`;
  if (v.patternMismatch || v.typeMismatch) return `Check ${lower(f.label)}.`;
  return null;
}
