// POST /api/rfq: validates a quote request, checks the uploaded files, sends the two emails.
// Order matters: nothing is emailed until the request and every file have passed.
import { HONEYPOT_FIELD } from '../src/lib/rfq-rules.js';
import { MAX_FILE_BYTES, validateFiles } from '../src/lib/rfq-validate.js';
import type { Deps } from './deps.js';
import { contentProblem } from './file-check.js';
import {
  FALLBACK_CONTACT,
  HttpError,
  checkOrigin,
  clientIp,
  json,
  readJson,
  requireMethod,
  respond,
  tooManyRequests,
} from './http.js';
import { customerMail, shopMail, type FileLink } from './mail-templates.js';
import { parseRfq, type RfqFile, type RfqRequest } from './validate.js';

const MAX_BODY_BYTES = 32 * 1024;
const HOUR_MS = 60 * 60 * 1000;
const REQUESTS_PER_HOUR = 60; // every call, valid or not: keeps probing and guessing slow
const SUBMISSIONS_PER_HOUR = 5; // accepted requests

async function limit(deps: Deps, key: string, max: number): Promise<void> {
  const { allowed, retryAfterSeconds } = await deps.limiter.hit(key, max, HOUR_MS);
  if (!allowed) throw tooManyRequests(retryAfterSeconds);
}

const isFilled = (body: unknown) => {
  const value = (body as Record<string, unknown> | null)?.[HONEYPOT_FIELD];
  return value !== undefined && value !== null && String(value).trim() !== '';
};

/**
 * Looks every file up in storage and trusts only what it finds there: size and first bytes.
 * Returns the files with their real sizes.
 */
async function verifyFiles(deps: Deps, files: RfqFile[]): Promise<RfqFile[]> {
  const found = await Promise.all(files.map((f) => deps.storage.inspect(f.url)));
  const checked = files.map((f, i) => ({ ...f, size: found[i]?.size ?? 0 }));

  const missing = files.find((_, i) => !found[i]);
  if (missing)
    throw new HttpError(400, { files: `"${missing.name}" did not arrive. Attach it again.` });

  if (checked.some((f) => f.size > MAX_FILE_BYTES)) {
    throw new HttpError(413, { files: validateFiles(checked) ?? 'A file is over the size limit.' });
  }
  const problem = validateFiles(checked);
  if (problem) throw new HttpError(400, { files: problem });

  for (const [i, file] of files.entries()) {
    const wrong = contentProblem(file.name, found[i]!.head);
    if (wrong) throw new HttpError(415, { files: wrong });
  }
  return checked;
}

async function sendMails(deps: Deps, request: RfqRequest, id: string): Promise<void> {
  const hrefs = request.files.length
    ? await deps.storage.shareLinks(request.files.map((f) => f.url))
    : [];
  const links: FileLink[] = request.files.map((f, i) => ({
    name: f.name,
    size: f.size,
    href: hrefs[i],
  }));

  try {
    await deps.mail.send({
      to: deps.config.mail.toShop,
      ...shopMail(request, id, links),
      replyTo: request.email,
      idempotencyKey: `rfq-shop/${id}`,
    });
  } catch (error) {
    console.error(`[rfq] ${id} shop mail failed:`, (error as Error)?.message);
    throw new HttpError(500, { form: `We could not send your request. ${FALLBACK_CONTACT}` });
  }

  // The request is accepted once the shop has it; a failed auto-reply must not make the visitor send it again.
  try {
    await deps.mail.send({
      to: request.email,
      ...customerMail(request, id, links),
      idempotencyKey: `rfq-customer/${id}`,
    });
  } catch (error) {
    console.error(`[rfq] ${id} auto-reply failed:`, (error as Error)?.message);
  }
}

export function handleRfq(request: Request, getDeps: () => Deps): Promise<Response> {
  return respond(async () => {
    const deps = getDeps();
    requireMethod(request, 'POST');
    checkOrigin(request, !deps.config.onVercel);
    const ip = clientIp(request);
    await limit(deps, `rfq-any:${ip}`, REQUESTS_PER_HOUR);

    const body = await readJson(request, MAX_BODY_BYTES);
    const now = deps.now();

    // A filled trap field means a bot. It gets the same "ok" a person gets, and nothing happens.
    if (isFilled(body)) {
      console.log('[rfq] honeypot filled, request dropped');
      return json({ ok: true, id: deps.newId(now) });
    }

    const parsed = parseRfq(body, now);
    if (!parsed.ok) throw new HttpError(400, parsed.errors);

    const value = { ...parsed.value, files: await verifyFiles(deps, parsed.value.files) };
    // Counted last, right before mail goes out: a visitor fixing a mistake does not use up the hour.
    await limit(deps, `rfq-ok:${ip}`, SUBMISSIONS_PER_HOUR);
    const id = deps.newId(now);
    await sendMails(deps, value, id);
    console.log(`[rfq] ${id} accepted, files: ${value.files.length}`); // no names, no addresses
    return json({ ok: true, id });
  }, 'rfq');
}
