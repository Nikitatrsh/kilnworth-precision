// The one table of quote-form fields. The form (HTML attributes), the server (validation) and the
// emails (labels) all read it, so a rule is changed in one place. rfq-rules.test.ts checks the
// built form against this table, so the two cannot drift apart unnoticed.
// Imports use ".js" because the server functions run as plain ESM on Vercel.
import { TOLERANCE_STEPS } from './tolerance.js';

export interface Option {
  value: string;
  label: string;
}

export interface FieldRule {
  label: string;
  kind: 'text' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'choices';
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** HTML pattern syntax: matches the whole value. */
  pattern?: string;
  options?: readonly Option[];
}

// Ids match src/content/processes (without inspection-finishing, which is not a quoted process).
export const PROCESS_OPTIONS: readonly Option[] = [
  { value: '5-axis-milling', label: '5-axis milling' },
  { value: 'cnc-turning', label: 'CNC turning' },
  { value: 'swiss-turning', label: 'Swiss-type turning' },
  { value: 'wire-edm', label: 'Wire EDM' },
  { value: 'not-sure', label: 'Not sure, suggest one' },
];

// Ids match src/content/materials.json.
export const MATERIAL_OPTIONS: readonly Option[] = [
  { value: 'al-6061', label: 'Aluminum 6061-T6' },
  { value: 'al-7075', label: 'Aluminum 7075-T6/T651' },
  { value: 'ss-303', label: 'Stainless 303' },
  { value: 'ss-304', label: 'Stainless 304' },
  { value: 'ss-316l', label: 'Stainless 316L' },
  { value: 'ss-17-4', label: 'Stainless 17-4 PH' },
  { value: 'ti-gr2', label: 'Titanium Grade 2' },
  { value: 'ti-gr5', label: 'Titanium Grade 5 (6Al-4V)' },
  { value: 'brass-360', label: 'Brass C360' },
  { value: 'tool-steel', label: 'Tool steel (A2, D2, O1)' },
  { value: 'inconel-718', label: 'Inconel 718' },
  { value: 'delrin', label: 'Delrin (acetal, POM)' },
  { value: 'peek', label: 'PEEK' },
  { value: 'ultem', label: 'Ultem (PEI)' },
  { value: 'other', label: 'Other or not sure (add it in notes)' },
];

export const TOLERANCE_OPTIONS: readonly Option[] = [
  { value: 'per-drawing', label: 'As on the drawing' },
  ...TOLERANCE_STEPS.map((s) => ({ value: s.value, label: `±${s.value} in` })),
];

export const FINISHING_OPTIONS: readonly Option[] = [
  { value: 'anodize', label: 'Anodize (Type II or III)' },
  { value: 'passivate', label: 'Passivation' },
  { value: 'heat-treat', label: 'Heat treatment' },
  { value: 'plating', label: 'Plating or black oxide' },
  { value: 'marking', label: 'Laser marking' },
  { value: 'assembly', label: 'Inserts or light assembly' },
];

export const DOCS_OPTIONS: readonly Option[] = [
  { value: 'material-certs', label: 'Material certifications' },
  { value: 'fai', label: 'First article report (AS9102)' },
  { value: 'coc', label: 'Certificate of conformance' },
  { value: 'cmm', label: 'CMM report per lot' },
];

// Parentheses are escaped on purpose: browsers compile `pattern` with the "v" flag, where a bare ( or )
// inside [...] is a syntax error, and an invalid pattern is silently ignored.
export const PHONE_PATTERN = '[0-9+\\(\\)\\-. ]{7,20}';

export const FIELDS = {
  part: { label: 'Part name or number', kind: 'text', required: true, maxLength: 120 },
  description: { label: 'Describe the part', kind: 'textarea', maxLength: 2000 },
  process: { label: 'Process', kind: 'select', required: true, options: PROCESS_OPTIONS },
  material: { label: 'Material', kind: 'select', required: true, options: MATERIAL_OPTIONS },
  quantity: { label: 'Quantity', kind: 'number', required: true, min: 1, max: 100000 },
  breaks: { label: 'Other quantities to price', kind: 'text', maxLength: 80 },
  tolerance: {
    label: 'Tightest tolerance on the drawing',
    kind: 'select',
    required: true,
    options: TOLERANCE_OPTIONS,
  },
  finishing: {
    label: 'Finishing and secondary work',
    kind: 'choices',
    options: FINISHING_OPTIONS,
  },
  docs: { label: 'Paperwork with the parts', kind: 'choices', options: DOCS_OPTIONS },
  date: { label: 'Parts needed by', kind: 'date' },
  notes: { label: 'Notes for the engineer', kind: 'textarea', maxLength: 2000 },
  name: { label: 'Your name', kind: 'text', required: true, maxLength: 80 },
  company: { label: 'Company', kind: 'text', required: true, maxLength: 120 },
  email: { label: 'Work email', kind: 'email', required: true, maxLength: 120 },
  phone: { label: 'Phone', kind: 'tel', maxLength: 20, pattern: PHONE_PATTERN },
} as const satisfies Record<string, FieldRule>;

export type FieldName = keyof typeof FIELDS;

/** Hidden trap field: people never see it, bots fill it. */
export const HONEYPOT_FIELD = 'website';

/** Same check as the browser's type="email" (WHATWG spec), so both sides accept the same addresses. */
export const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Attributes the form puts on a control, taken from the table (label is the visible label). */
export function formAttrs(name: FieldName) {
  const rule: FieldRule = FIELDS[name];
  return {
    label: rule.label,
    required: rule.required ?? false,
    maxlength: rule.maxLength,
    min: rule.min === undefined ? undefined : String(rule.min),
    max: rule.max === undefined ? undefined : String(rule.max),
    pattern: rule.pattern,
  };
}
