// Behavior for RfqForm.astro: steps, inline validation, file list, demo confirmation.
// Rules live in src/lib/rfq-validate.ts (unit-tested). All user text is written with
// textContent, never innerHTML.
import {
  fieldMessage,
  formatBytes,
  validateDescription,
  validateFiles,
  validateTargetDate,
} from '../../lib/rfq-validate';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Kind = Parameters<typeof fieldMessage>[1]['kind'];

const form = document.querySelector<HTMLFormElement>('[data-rfq]');
if (form) init(form);

function init(form: HTMLFormElement) {
  form.noValidate = true; // we show our own messages next to each field
  const steps = [...form.querySelectorAll<HTMLFieldSetElement>('[data-step]')];
  const stepper = document.querySelector<HTMLElement>('[data-stepper]')!;
  const stepperItems = [...stepper.querySelectorAll<HTMLElement>('li')];
  const success = document.querySelector<HTMLElement>('[data-success]')!;
  const summary = success.querySelector<HTMLElement>('[data-summary]')!;
  const fileInput = form.querySelector<HTMLInputElement>('input[type=file]')!;
  const fileList = form.querySelector<HTMLElement>('[data-file-list]')!;
  const description = form.elements.namedItem('description') as HTMLTextAreaElement;
  const fileCount = () => fileInput.files?.length ?? 0;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  let current = 0;

  submit.disabled = false;
  stepper.hidden = false;

  // Links from a process page arrive as /rfq?process=<id>: preselect it if it is a real option.
  const wanted = new URLSearchParams(location.search).get('process');
  const processSelect = form.elements.namedItem('process') as HTMLSelectElement;
  if (wanted && [...processSelect.options].some((o) => o.value === wanted))
    processSelect.value = wanted;

  const controls = (scope: ParentNode) => [...scope.querySelectorAll<Control>('[data-kind]')];

  function check(el: Control): string | null {
    const kind = el.dataset.kind as Kind;
    let msg =
      kind === 'file'
        ? validateFiles([...((el as HTMLInputElement).files ?? [])])
        : fieldMessage(el.validity, {
            label: el.dataset.label ?? el.name,
            kind,
            min: el.getAttribute('min') ?? undefined,
            max: el.getAttribute('max') ?? undefined,
          });
    if (!msg && kind === 'date') msg = validateTargetDate(el.value);
    if (!msg && el === description) msg = validateDescription(el.value, fileCount());
    const error = document.getElementById(`${el.id}-error`)!;
    error.textContent = msg ?? '';
    error.hidden = !msg;
    if (msg) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
    return msg;
  }

  /** Validates one step; returns the first invalid control, if any. */
  const firstInvalid = (i: number) => controls(steps[i]).filter((el) => check(el))[0];

  function show(i: number) {
    current = i;
    steps.forEach((s, n) => (s.hidden = n !== i));
    stepperItems.forEach((li, n) => {
      if (n === i) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      li.toggleAttribute('data-done', n < i);
    });
  }

  function go(i: number) {
    show(i);
    const legend = steps[i];
    legend.tabIndex = -1;
    legend.focus({ preventScroll: true });
    stepper.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function next() {
    const bad = firstInvalid(current);
    if (bad) return bad.focus();
    go(current + 1);
  }

  form.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-next], [data-back]');
    if (!target) return;
    if (target.hasAttribute('data-next')) next();
    else go(current - 1);
  });

  // Fix-as-you-type: once a field shows an error, re-check it on every change.
  form.addEventListener('input', (e) => {
    const el = e.target as Control;
    if (el.hasAttribute('aria-invalid')) check(el);
  });

  fileInput.addEventListener('change', () => {
    fileList.replaceChildren(
      ...[...(fileInput.files ?? [])].map((f) => {
        const li = document.createElement('li');
        li.textContent = `${f.name}, ${formatBytes(f.size)}`;
        return li;
      }),
    );
    check(fileInput);
    // Attaching a file can clear "describe the part"; removing one can bring it back.
    if (description.hasAttribute('aria-invalid')) check(description);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (current < steps.length - 1) return next(); // Enter in a field moves one step, not to the end
    for (let i = 0; i < steps.length; i++) {
      const bad = firstInvalid(i);
      if (bad) {
        show(i);
        return bad.focus();
      }
    }
    // A filled honeypot means a bot. A real backend would drop the request silently;
    // the demo shows the same confirmation so the bot learns nothing.
    renderSummary(new FormData(form));
    form.hidden = true;
    stepper.hidden = true;
    success.hidden = false;
    success.focus();
    success.scrollIntoView({ block: 'start' });
  });

  success.querySelector('[data-again]')!.addEventListener('click', () => {
    form.reset();
    fileList.replaceChildren();
    controls(form).forEach((el) => {
      el.removeAttribute('aria-invalid');
      document.getElementById(`${el.id}-error`)!.hidden = true;
    });
    success.hidden = true;
    form.hidden = false;
    stepper.hidden = false;
    go(0);
  });

  function selectedText(name: string) {
    const el = form.elements.namedItem(name) as HTMLSelectElement;
    return el.selectedOptions[0]?.text ?? '';
  }

  function renderSummary(data: FormData) {
    const files = [...(fileInput.files ?? [])].map((f) => f.name).join(', ');
    const rows: [string, string][] = [
      ['Part', String(data.get('part'))],
      ['Files', files || 'None; description given'],
      ['Process', selectedText('process')],
      ['Material', selectedText('material')],
      ['Quantity', [data.get('quantity'), data.get('breaks')].filter(Boolean).join(', ')],
      ['Tolerance', selectedText('tolerance')],
      ['Needed by', String(data.get('date') || 'Lead time requested')],
      ['Reply to', `${data.get('name')}, ${data.get('company')}, ${data.get('email')}`],
    ];
    summary.replaceChildren(
      ...rows.map(([term, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = term;
        dd.textContent = value;
        row.append(dt, dd);
        return row;
      }),
    );
  }

  show(0);
}
