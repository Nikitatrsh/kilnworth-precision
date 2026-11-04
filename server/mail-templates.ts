// The two emails of a quote request: one to the shop, one auto-reply to the visitor.
// Text and HTML are built from the same list of rows. Everything the visitor typed goes through
// esc() before it reaches HTML, and through oneLine() before it reaches a subject line.
import { site } from '../src/config/site.js';
import {
  DOCS_OPTIONS,
  FINISHING_OPTIONS,
  MATERIAL_OPTIONS,
  PROCESS_OPTIONS,
  TOLERANCE_OPTIONS,
  type Option,
} from '../src/lib/rfq-rules.js';
import { formatBytes } from '../src/lib/rfq-validate.js';
import type { RfqRequest } from './validate.js';

export interface FileLink {
  name: string;
  size: number;
  href: string;
}
export interface Mail {
  subject: string;
  text: string;
  html: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Control characters (CR and LF included) and right-to-left overrides that could disguise a subject.
const UNSAFE_IN_SUBJECT = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const oneLine = (s: string, max = 150) =>
  s.replace(UNSAFE_IN_SUBJECT, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const labelOf = (options: readonly Option[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value;
const labels = (options: readonly Option[], values: string[]) =>
  values.length ? values.map((v) => labelOf(options, v)).join(', ') : 'None';

type Row = [label: string, value: string];

/** The answers, as rows shared by both emails. */
function summaryRows(r: RfqRequest): Row[] {
  return [
    ['Part', r.part],
    ['Quantity', [r.quantity, r.breaks].filter(Boolean).join(', also: ')],
    ['Process', labelOf(PROCESS_OPTIONS, r.process)],
    ['Material', labelOf(MATERIAL_OPTIONS, r.material)],
    ['Tightest tolerance', labelOf(TOLERANCE_OPTIONS, r.tolerance)],
    ['Finishing', labels(FINISHING_OPTIONS, r.finishing)],
    ['Paperwork', labels(DOCS_OPTIONS, r.docs)],
    ['Needed by', r.date || 'Lead time requested'],
  ];
}

const textRows = (rows: Row[]) => rows.map(([k, v]) => `${k}: ${v}`).join('\n');
const htmlRows = (rows: Row[]) =>
  `<table role="presentation" cellpadding="6" style="border-collapse:collapse">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="color:#555;vertical-align:top">${esc(k)}</td><td>${esc(v)}</td></tr>`,
    )
    .join('')}</table>`;

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title></head>` +
  `<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">${body}</body></html>`;

const fileLine = (f: FileLink) => `${f.name} (${formatBytes(f.size)})`;

/** Email to the shop. The caller sets Reply-To to the visitor, so "Reply" answers the buyer. */
export function shopMail(r: RfqRequest, id: string, files: FileLink[]): Mail {
  const rows = summaryRows(r);
  const contact = `${r.name}, ${r.company}\n${r.email}${r.phone ? `\n${r.phone}` : ''}`;
  const longText = [
    ['Description', r.description],
    ['Notes', r.notes],
  ].filter(([, v]) => v);

  const text = [
    `New quote request ${id}`,
    textRows(rows),
    ...longText.map(([k, v]) => `${k}:\n${v}`),
    `Contact:\n${contact}`,
    files.length
      ? `Files (links work for 7 days; later, open the Blob store in the Vercel dashboard):\n${files
          .map((f) => `- ${fileLine(f)}: ${f.href}`)
          .join('\n')}`
      : 'No files attached.',
    'Reply to this email to answer the buyer directly.',
  ].join('\n\n');

  const link = (f: FileLink) =>
    f.href.startsWith('https://')
      ? `<a href="${esc(f.href)}">${esc(fileLine(f))}</a>`
      : esc(`${fileLine(f)}: ${f.href}`);
  const html = page(
    `Quote request ${id}`,
    [
      `<h1 style="font-size:20px">New quote request ${esc(id)}</h1>`,
      htmlRows(rows),
      ...longText.map(
        ([k, v]) =>
          `<h2 style="font-size:16px">${esc(k)}</h2><p style="white-space:pre-wrap">${esc(v)}</p>`,
      ),
      `<h2 style="font-size:16px">Contact</h2><p>${esc(r.name)}, ${esc(r.company)}<br>${esc(r.email)}${r.phone ? `<br>${esc(r.phone)}` : ''}</p>`,
      files.length
        ? `<h2 style="font-size:16px">Files</h2><p>Links work for 7 days.</p><ul>${files.map((f) => `<li>${link(f)}</li>`).join('')}</ul>`
        : '<p>No files attached.</p>',
      '<p>Reply to this email to answer the buyer directly.</p>',
    ].join(''),
  );

  return {
    subject: oneLine(`Quote request ${id}: ${r.part} x ${r.quantity}, ${r.company}`),
    text,
    html,
  };
}

/** Auto-reply to the visitor. It promises only what the site really does. */
export function customerMail(r: RfqRequest, id: string, files: FileLink[]): Mail {
  const rows = summaryRows(r);
  const fileNames = files.length ? files.map(fileLine).join(', ') : 'None';
  const promise = site.demo
    ? `This site is a portfolio demo by ${site.demoBy}. ${site.name} is a fictional company, so nobody will prepare a quote. Your details were used only to send you this message.`
    : `An engineer will read your request and reply within ${site.quoteTurnaround} with a price per quantity and any manufacturability notes.`;
  // A demo has no real shop to call.
  const contact = site.demo
    ? ''
    : `Questions? Call ${site.phone.display} (${site.hours}) and quote ${id}.`;

  const text = [
    `Hi ${r.name},`,
    `We received your quote request. Your request number is ${id}.`,
    promise,
    `What you sent:\n${textRows(rows)}\nFiles: ${fileNames}`,
    contact,
    site.name,
  ]
    .filter(Boolean)
    .join('\n\n');

  const html = page(
    `We received your quote request ${id}`,
    [
      `<p>Hi ${esc(r.name)},</p>`,
      `<p>We received your quote request. Your request number is <strong>${esc(id)}</strong>.</p>`,
      `<p>${esc(promise)}</p>`,
      `<h2 style="font-size:16px">What you sent</h2>${htmlRows(rows)}<p>Files: ${esc(fileNames)}</p>`,
      contact && `<p>${esc(contact)}</p>`,
      `<p>${esc(site.name)}</p>`,
    ]
      .filter(Boolean)
      .join(''),
  );

  return { subject: `We received your quote request ${id}`, text, html };
}
