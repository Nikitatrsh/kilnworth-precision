// Behavior for RfqForm.astro: steps, inline validation, file list, sending to /api.
// Rules live in src/lib/rfq-validate.ts and rfq-rules.ts (unit-tested), the network part in
// src/lib/api.ts and upload.ts. All user and server text is written with textContent, never innerHTML.
import { ApiError, NETWORK_TEXT, postJson } from '../../lib/api';
import { FIELDS, requestBody } from '../../lib/rfq-rules';
import {
  fieldMessage,
  formatBytes,
  validateDescription,
  validateFiles,
  validateTargetDate,
} from '../../lib/rfq-validate';
import { uploadFile, type UploadedFile } from '../../lib/upload';

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
  const submitText = submit.textContent;
  const sendError = form.querySelector<HTMLElement>('[data-send-error]')!;
  const statusText = form.querySelector<HTMLElement>('[data-status-text]')!;
  const progress = form.querySelector<HTMLProgressElement>('[data-progress]')!;
  // Files already in storage, kept across retries so a second try does not upload them again.
  const uploaded = new Map<File, UploadedFile>();
  let sending = false;
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
    setFieldError(el, msg);
    return msg;
  }

  function setFieldError(el: Control, msg: string | null) {
    const error = document.getElementById(`${el.id}-error`)!;
    error.textContent = msg ?? '';
    error.hidden = !msg;
    if (msg) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
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

  const chosenFiles = () => [...(fileInput.files ?? [])];

  function renderFiles() {
    fileList.replaceChildren(
      ...chosenFiles().map((f) => {
        const li = document.createElement('li');
        li.textContent = `${f.name}, ${formatBytes(f.size)}`;
        if (uploaded.has(f)) {
          const done = document.createElement('span');
          done.className = 'done';
          done.textContent = ', uploaded';
          li.append(done);
        }
        return li;
      }),
    );
  }

  fileInput.addEventListener('change', () => {
    const chosen = chosenFiles();
    for (const f of uploaded.keys()) if (!chosen.includes(f)) uploaded.delete(f);
    renderFiles();
    check(fileInput);
    // Attaching a file can clear "describe the part"; removing one can bring it back.
    if (description.hasAttribute('aria-invalid')) check(description);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending) return; // a second click while the first request runs does nothing
    if (current < steps.length - 1) return next(); // Enter in a field moves one step, not to the end
    for (let i = 0; i < steps.length; i++) {
      const bad = firstInvalid(i);
      if (bad) {
        show(i);
        return bad.focus();
      }
    }
    void send();
  });

  function setBusy(busy: boolean) {
    sending = busy;
    form.setAttribute('aria-busy', String(busy));
    submit.disabled = busy;
    submit.textContent = busy ? 'Sending…' : submitText;
    form.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => (b.disabled = busy));
    if (!busy) {
      statusText.textContent = '';
      progress.hidden = true;
    }
  }

  /** Uploads the files not yet in storage, then posts the request. Errors keep every entry. */
  async function send() {
    const data = new FormData(form); // what the visitor confirmed; later edits wait for the next try
    const files = chosenFiles();
    setBusy(true);
    sendError.hidden = true;
    let posted = false;
    try {
      const sent: UploadedFile[] = [];
      for (const [i, file] of files.entries()) {
        let done = uploaded.get(file);
        if (!done) {
          statusText.textContent = `Uploading ${file.name} (file ${i + 1} of ${files.length})…`;
          progress.value = 0;
          progress.hidden = false;
          done = await uploadFile(file, (fraction) => (progress.value = fraction));
          uploaded.set(file, done);
          renderFiles();
        }
        sent.push(done);
      }
      progress.hidden = true;
      statusText.textContent = 'Sending your request…';
      posted = true;
      const { id } = await postJson<{ id: string }>('/api/rfq', requestBody(data, sent));
      setBusy(false);
      showSuccess(id, data);
    } catch (error) {
      setBusy(false);
      const known = error instanceof ApiError ? error : new ApiError(0, { form: NETWORK_TEXT });
      // /api/rfq could not find or accept a stored file: upload the files again on the next try.
      if (posted && known.errors.files) {
        uploaded.clear();
        renderFiles();
      }
      showErrors(known);
    }
  }

  /** Server messages go next to their field; the rest into the box above the buttons. */
  function showErrors({ errors }: ApiError) {
    const general: string[] = [];
    let first: Control | null = null;
    for (const [name, message] of Object.entries(errors) as [string, string][]) {
      const el = form.querySelector<Control>(`#f-${CSS.escape(name)}[data-kind]`);
      if (!el || name === 'files') {
        const label = (FIELDS as Record<string, { label: string }>)[name]?.label;
        general.push(label ? `${label}: ${message}` : message);
        continue;
      }
      setFieldError(el, message);
      // The first field in page order gets the focus.
      if (!first || first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
        first = el;
    }
    renderGeneral(general, 'files' in errors);
    if (first) {
      show(steps.findIndex((step) => step.contains(first)));
      first.focus();
    } else sendError.focus();
  }

  function renderGeneral(messages: string[], fileProblem: boolean) {
    const kept = document.createElement('p');
    kept.className = 'kept';
    kept.textContent = fileProblem
      ? 'Your other entries are kept.'
      : 'Your entries and any uploaded files are kept.';
    const toFiles = document.createElement('button');
    toFiles.type = 'button';
    toFiles.textContent = 'Change the files';
    toFiles.addEventListener('click', () => {
      show(0);
      fileInput.focus();
    });
    sendError.replaceChildren(
      ...messages.map((m) => Object.assign(document.createElement('p'), { textContent: m })),
      kept,
      ...(fileProblem ? [toFiles] : []),
    );
    sendError.hidden = !messages.length;
  }

  function showSuccess(id: string, data: FormData) {
    success.querySelector('[data-request-id]')!.textContent = id;
    const replyTo = success.querySelector('[data-reply-email]');
    if (replyTo) replyTo.textContent = String(data.get('email'));
    renderSummary(data);
    form.hidden = true;
    stepper.hidden = true;
    success.hidden = false;
    success.focus();
    success.scrollIntoView({ block: 'start' });
  }

  success.querySelector('[data-again]')!.addEventListener('click', () => {
    form.reset();
    uploaded.clear();
    fileList.replaceChildren();
    sendError.hidden = true;
    controls(form).forEach((el) => setFieldError(el, null));
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
    const files = chosenFiles()
      .map((f) => f.name)
      .join(', ');
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
