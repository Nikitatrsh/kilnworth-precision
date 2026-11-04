// End-to-end check of the quote API in mock mode: starts the local API on its own port, plays the
// browser (token request, file upload, quote request) and looks into .local/ for the results.
//   npm run smoke:rfq
// Needs no accounts and no keys. Leaves its test mails and files in .local/ (ignored by git).
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const ORIGIN = 'http://localhost:4321'; // what `astro dev` sends
const MB = 1024 * 1024;

const env = { ...process.env, API_PORT: String(PORT) };
for (const key of ['RESEND_API_KEY', 'BLOB_READ_WRITE_TOKEN', 'MAIL_TEST_RECIPIENT', 'VERCEL'])
  delete env[key];
const server = spawn('node', ['scripts/dev-api.mjs'], {
  env,
  stdio: ['ignore', 'pipe', 'inherit'],
});
let ready;
const started = new Promise((resolve) => (ready = resolve));
server.stdout.on('data', (chunk) => String(chunk).includes('API on') && ready());
await Promise.race([started, sleep(15_000)]);

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures++;
}

const post = (path, body, headers = {}) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** A STEP-looking file of `size` bytes. */
const stepFile = (size) =>
  Buffer.concat([Buffer.from('ISO-10303-21;\nHEADER;\n'), Buffer.alloc(size - 22, 0x20)]);

/** What the browser does: ask for permission, then send the bytes. Returns the file entry for /api/rfq or the refusal. */
async function upload(name, bytes) {
  const event = {
    type: 'blob.generate-client-token',
    payload: { pathname: name, clientPayload: String(bytes.length), multipart: false },
  };
  const permit = await post('/api/upload', event);
  if (!permit.ok) return { refused: permit.status, body: await permit.json() };
  const { uploadUrl } = await permit.json();
  const put = await fetch(BASE + uploadUrl, {
    method: 'PUT',
    headers: { origin: ORIGIN },
    body: bytes,
  });
  const stored = await put.json();
  return put.ok
    ? { url: stored.url, name, size: stored.size }
    : { refused: put.status, body: stored };
}

const form = (over = {}) => ({
  part: 'Smoke test bracket',
  description: '',
  process: '5-axis-milling',
  material: 'al-6061',
  quantity: 25,
  breaks: '',
  tolerance: '0.0005',
  finishing: [],
  docs: [],
  date: '',
  notes: '',
  name: 'Smoke Test',
  company: 'Test Company',
  email: 'smoke@example.com',
  phone: '',
  kp_extra: '',
  files: [],
  ...over,
});

async function outbox() {
  const names = await readdir('.local/outbox').catch(() => []);
  return Promise.all(
    names
      .filter((n) => n.endsWith('.json'))
      .map(async (n) => JSON.parse(await readFile(`.local/outbox/${n}`, 'utf8'))),
  );
}
const mailsFor = async (id) => (await outbox()).filter((m) => m.subject.includes(id));

try {
  // 1. A 24 MB file goes through and both mails carry the same number.
  const big = await upload('smoke-24mb.step', stepFile(24 * MB));
  check('24 MB file uploads', Boolean(big.url), JSON.stringify(big));
  const withFile = await (await post('/api/rfq', form({ files: [big] }))).json();
  check(
    'request with a 24 MB file is accepted',
    withFile.ok === true && /^KP-\d{6}-[0-9A-Z]{5}$/.test(withFile.id),
    JSON.stringify(withFile),
  );
  const mails = await mailsFor(withFile.id);
  check(
    'two mails with the same number (shop and customer)',
    mails.length === 2,
    `found ${mails.length}`,
  );
  check(
    'shop mail has Reply-To and the file',
    mails.some((m) => m.replyTo === 'smoke@example.com' && m.text.includes('smoke-24mb')),
  );
  const saved = (await readdir('.local/uploads')).find((n) => n.endsWith('smoke-24mb.step'));
  check(
    'file is in .local/uploads with its full size',
    saved && (await stat(`.local/uploads/${saved}`)).size === 24 * MB,
  );

  // 2. A 26 MB file is refused, before and during the upload.
  const tooBig = await upload('smoke-26mb.step', stepFile(26 * MB));
  check(
    '26 MB file is refused with 413 at the token request',
    tooBig.refused === 413,
    JSON.stringify(tooBig),
  );
  const sneaky = await fetch(`${BASE}/api/upload?pathname=smoke-sneaky.step`, {
    method: 'PUT',
    headers: { origin: ORIGIN },
    body: stepFile(26 * MB),
  });
  check(
    '26 MB sent without announcing it is refused with 413 during the upload',
    sneaky.status === 413,
    String(sneaky.status),
  );

  // 3. No file, with a description.
  const noFile = await (
    await post('/api/rfq', form({ description: 'Plate 4 x 2 in, two holes' }))
  ).json();
  check('request without a file is accepted', noFile.ok === true, JSON.stringify(noFile));

  // 4. Wrong file types.
  const exe = await upload('setup.exe', Buffer.from('MZ'));
  check('.exe is refused with 415', exe.refused === 415, JSON.stringify(exe));
  const disguised = await upload(
    'disguised.step',
    Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(100)]),
  );
  const disguisedRes = await post('/api/rfq', form({ files: [disguised] }));
  check(
    'a program renamed to .step is refused with 415',
    disguisedRes.status === 415,
    String(disguisedRes.status),
  );

  // 5. Bots and strangers.
  const before = (await outbox()).length;
  const bot = await (await post('/api/rfq', form({ kp_extra: 'http://spam.example' }))).json();
  check('honeypot gets "ok" and an id', bot.ok === true && Boolean(bot.id));
  check('honeypot sends no mail', (await outbox()).length === before);
  const foreign = await post('/api/rfq', form(), { origin: 'https://evil.example' });
  check('foreign origin is refused with 403', foreign.status === 403, String(foreign.status));
  const notJson = await post('/api/rfq', 'part=x', { 'content-type': 'text/plain' });
  check('non-JSON is refused with 415', notJson.status === 415, String(notJson.status));

  // 6. The limit: 5 accepted requests an hour (2 are used up already).
  let accepted = 2;
  let limited;
  for (let i = 0; i < 6 && !limited; i++) {
    const res = await post('/api/rfq', form({ description: 'rate limit probe' }));
    if (res.status === 429) limited = res;
    else accepted++;
  }
  check(
    'the 6th accepted request in an hour gets 429',
    accepted === 5 && limited?.status === 429,
    `accepted ${accepted}`,
  );
  check(
    '429 carries Retry-After and a readable message',
    Number(limited?.headers.get('retry-after')) > 0 &&
      (await limited.json()).errors.form.startsWith('Too many requests'),
  );
} finally {
  server.kill();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
