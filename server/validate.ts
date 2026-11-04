// Server-side check of a quote request. It never trusts the browser: the rules come from the same
// table the form is built from (src/lib/rfq-rules.ts) and the messages from the same function the
// form uses (fieldMessage), so a visitor sees the same sentence from both.
import {
  EMAIL_PATTERN,
  FIELDS,
  MAX_FILE_NAME,
  type FieldName,
  type FieldRule,
} from '../src/lib/rfq-rules.js';
import {
  fieldMessage,
  validateDescription,
  validateFiles,
  validateTargetDate,
} from '../src/lib/rfq-validate.js';
import { stripBidi } from './text.js';

export interface RfqFile {
  url: string;
  name: string;
  size: number;
}

/** What is left after validation: only known fields, with their final types. */
export interface RfqRequest {
  part: string;
  description: string;
  process: string;
  material: string;
  quantity: number;
  breaks: string;
  tolerance: string;
  finishing: string[];
  docs: string[];
  date: string;
  notes: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  files: RfqFile[];
}

/** One message per field. `form` is for problems that belong to no field. */
export type Errors = Partial<Record<FieldName | 'files' | 'form', string>>;
export type Parsed = { ok: true; value: RfqRequest } | { ok: false; errors: Errors };

type Flags = Parameters<typeof fieldMessage>[0];
type Kind = Parameters<typeof fieldMessage>[1]['kind'];
const NO_FLAGS: Flags = {
  valueMissing: false,
  typeMismatch: false,
  rangeUnderflow: false,
  rangeOverflow: false,
  patternMismatch: false,
  tooLong: false,
  badInput: false,
  stepMismatch: false,
};

const MAX_URL = 2048;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
// Control characters. Line breaks and tabs are fine in a textarea, never in a one-line field.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const CONTROL_ONE_LINE = /[\u0000-\u001f\u007f]/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates one text, number, date or select field. Returns the clean value or the message. */
function scalar(
  rule: FieldRule,
  raw: unknown,
  now: Date,
): { value: string | number } | { error: string } {
  const info = {
    label: rule.label,
    kind: rule.kind as Kind,
    min: rule.min?.toString(),
    max: rule.max?.toString(),
  };
  const fail = (flags: Partial<Flags>) => ({
    error: fieldMessage({ ...NO_FLAGS, ...flags }, info) ?? `Check ${lower(rule.label)}.`,
  });
  if (raw === undefined || raw === null) raw = '';
  if (rule.kind === 'number') return number(rule, raw, fail);
  if (typeof raw !== 'string') return fail({ badInput: true });
  // Direction marks are dropped, not refused: they can come from pasted text.
  const clean = stripBidi(raw);
  const text = clean.trim();
  if ((rule.kind === 'textarea' ? CONTROL : CONTROL_ONE_LINE).test(clean))
    return fail({ badInput: true });
  if (text === '') return rule.required ? fail({ valueMissing: true }) : { value: '' };
  if (rule.maxLength !== undefined && clean.length > rule.maxLength) return fail({ tooLong: true });
  if (rule.kind === 'email' && !EMAIL_PATTERN.test(text)) return fail({ typeMismatch: true });
  // "v" flag, like the browser (see PHONE_PATTERN).
  if (rule.pattern && !new RegExp(`^(?:${rule.pattern})$`, 'v').test(text))
    return fail({ patternMismatch: true });
  if (rule.kind === 'select' && !rule.options?.some((o) => o.value === text))
    return fail({ badInput: true });
  if (rule.kind === 'date') {
    const message = validateTargetDate(text, now, 'server');
    if (message) return { error: message };
  }
  return { value: text };
}

function number(
  rule: FieldRule,
  raw: unknown,
  fail: (flags: Partial<Flags>) => { error: string },
): { value: number } | { error: string } {
  if (raw === '' && rule.required) return fail({ valueMissing: true });
  const n = typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fail({ badInput: true });
  if (!Number.isInteger(n)) return fail({ stepMismatch: true });
  if (rule.min !== undefined && n < rule.min) return fail({ rangeUnderflow: true });
  if (rule.max !== undefined && n > rule.max) return fail({ rangeOverflow: true });
  return { value: n };
}

function choices(rule: FieldRule, raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  const allowed = rule.options?.map((o) => o.value) ?? [];
  const ok =
    Array.isArray(raw) &&
    raw.every((v) => typeof v === 'string' && allowed.includes(v)) &&
    new Set(raw).size === raw.length;
  return ok ? (raw as string[]) : null;
}

/** File entries as the browser reports them after upload: {url, name, size}. */
function files(raw: unknown): RfqFile[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const list: RfqFile[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const { url, size } = item;
    const name = typeof item.name === 'string' ? stripBidi(item.name) : item.name;
    if (typeof url !== 'string' || url === '' || url.length > MAX_URL) return null;
    if (
      typeof name !== 'string' ||
      name === '' ||
      name.length > MAX_FILE_NAME ||
      CONTROL_ONE_LINE.test(name)
    )
      return null;
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) return null;
    list.push({ url, name, size });
  }
  return new Set(list.map((f) => f.url)).size === list.length ? list : null;
}

export function parseRfq(input: unknown, now: Date = new Date()): Parsed {
  if (!isRecord(input))
    return { ok: false, errors: { form: 'Send the request as a JSON object.' } };
  const errors: Errors = {};
  const out: Record<string, unknown> = {};

  for (const name of Object.keys(FIELDS) as FieldName[]) {
    const rule: FieldRule = FIELDS[name];
    const raw = Object.hasOwn(input, name) ? input[name] : undefined;
    if (rule.kind === 'choices') {
      const picked = choices(rule, raw);
      if (picked) out[name] = picked;
      else errors[name] = `Check ${lower(rule.label)}.`;
      continue;
    }
    const result = scalar(rule, raw, now);
    if ('error' in result) errors[name] = result.error;
    else out[name] = result.value;
  }

  const list = files(Object.hasOwn(input, 'files') ? input.files : undefined);
  if (list === null) errors.files = 'Check the attached files.';
  else {
    const problem = validateFiles(list);
    if (problem) errors.files = problem;
    const missing = validateDescription(String(out.description ?? ''), list.length);
    if (missing) errors.description = missing;
    out.files = list;
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, value: out as unknown as RfqRequest };
}
