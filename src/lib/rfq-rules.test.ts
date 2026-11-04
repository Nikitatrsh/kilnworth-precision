import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_PATTERN,
  FIELDS,
  HONEYPOT_FIELD,
  MATERIAL_OPTIONS,
  PROCESS_OPTIONS,
  formAttrs,
  type FieldRule,
} from './rfq-rules';

const ids = (options: readonly { value: string }[]) => options.map((o) => o.value);

describe('rules table', () => {
  it('has unique option values and non-empty labels', () => {
    for (const [name, rule] of Object.entries<FieldRule>(FIELDS)) {
      const values = ids(rule.options ?? []);
      expect(new Set(values).size, name).toBe(values.length);
      expect(values, name).not.toContain('');
      expect(rule.label, name).not.toBe('');
    }
  });

  it('lists every material in src/content/materials.json (add new ones to rfq-rules.ts)', () => {
    const json: { id: string }[] = JSON.parse(readFileSync('src/content/materials.json', 'utf8'));
    expect(ids(MATERIAL_OPTIONS).filter((v) => v !== 'other')).toEqual(json.map((m) => m.id));
  });

  it('lists every quoted process in src/content/processes (add new ones to rfq-rules.ts)', () => {
    const files = readdirSync('src/content/processes')
      .map((f) => f.replace(/\.md$/, ''))
      .filter((id) => id !== 'inspection-finishing');
    expect(
      ids(PROCESS_OPTIONS)
        .filter((v) => v !== 'not-sure')
        .sort(),
    ).toEqual(files.sort());
  });

  it('turns a rule into form attributes', () => {
    expect(formAttrs('quantity')).toMatchObject({ required: true, min: '1', max: '100000' });
    expect(formAttrs('phone').pattern).toBe('[0-9+\\(\\)\\-. ]{7,20}');
    // The browser compiles the pattern with the "v" flag; a pattern that fails there is ignored.
    expect(() => new RegExp(`^(?:${formAttrs('phone').pattern})$`, 'v')).not.toThrow();
    expect(formAttrs('notes')).toMatchObject({ required: false, maxlength: 2000 });
  });

  it('accepts and rejects the same email shapes as the browser', () => {
    for (const ok of ['a@b.co', 'first.last+tag@sub.example.com', "o'neil@example.org"])
      expect(EMAIL_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ['a@', '@b.co', 'a b@c.co', 'a@b..co', 'a@-b.co', 'a@b.co\r\nBcc: x@y.z'])
      expect(EMAIL_PATTERN.test(bad), bad).toBe(false);
  });
});

// Form parity: the built page and the table must agree on every attribute that has a rule.
// Needs `npm run build` first (`npm run verify` does both); skipped when dist/ is missing.
const FORM_HTML = 'dist/rfq.html';
const built = existsSync(FORM_HTML);
if (!built) console.warn('rfq-rules parity test skipped: run `npm run build` first.');

type Attrs = Record<string, string | true>;
const attrsOf = (tag: string): Attrs => {
  const out: Attrs = {};
  for (const m of tag.matchAll(/\s([a-zA-Z-]+)(?:="([^"]*)")?/g)) out[m[1]] = m[2] ?? true;
  return out;
};
const tagsOf = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => attrsOf(m[0]));

describe.skipIf(!built)('built form matches the rules table', () => {
  const html = built ? readFileSync(FORM_HTML, 'utf8') : '';
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  const controls = [
    ...tagsOf(form, 'input'),
    ...tagsOf(form, 'select'),
    ...tagsOf(form, 'textarea'),
  ];
  const named = (name: string) => controls.filter((c) => c.name === name);

  it('has a rule for every control, and a control for every rule', () => {
    const inForm = new Set(controls.map((c) => String(c.name)));
    inForm.delete('files'); // files have their own rules in rfq-validate.ts
    inForm.delete(HONEYPOT_FIELD);
    expect([...inForm].sort()).toEqual(Object.keys(FIELDS).sort());
  });

  for (const [name, rule] of Object.entries<FieldRule>(FIELDS)) {
    it(`field "${name}"`, () => {
      const [control] = named(name);
      expect(control, 'control exists').toBeDefined();
      if (rule.kind === 'choices') {
        expect(named(name).map((c) => c.value)).toEqual(ids(rule.options ?? []));
        expect(named(name).every((c) => c.type === 'checkbox')).toBe(true);
        return;
      }
      expect(control['data-label']).toBe(rule.label);
      expect(control.required === true, 'required').toBe(rule.required ?? false);
      expect(control.maxlength, 'maxlength').toBe(rule.maxLength?.toString());
      expect(control.min, 'min').toBe(rule.min?.toString());
      expect(control.max, 'max').toBe(rule.max?.toString());
      expect(control.pattern, 'pattern').toBe(rule.pattern);
      if (rule.kind === 'select') {
        const block = form.slice(form.indexOf(`name="${name}"`));
        const select = block.slice(0, block.indexOf('</select>'));
        const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)]
          .filter((m) => m[1] !== '')
          .map((m) => ({ value: m[1], label: m[2].trim() }));
        expect(options).toEqual(rule.options);
      } else if (rule.kind !== 'textarea') {
        expect(control.type, 'type').toBe(rule.kind);
      }
    });
  }
});
