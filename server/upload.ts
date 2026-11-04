// POST /api/upload: the browser asks for permission to upload one file straight to storage.
// The server decides here whether that file is acceptable (name, extension, declared size) and,
// when it is, gives the storage a chance to issue a short-lived token.
// PUT /api/upload: local mock only; receives the bytes itself.
import { UploadError, type UploadLimits } from './adapters/storage.js';
import type { Deps } from './deps.js';
import {
  HttpError,
  checkOrigin,
  clientIp,
  json,
  readJson,
  requireMethod,
  respond,
  tooManyRequests,
} from './http.js';
import { MAX_FILE_BYTES, validateFiles } from '../src/lib/rfq-validate.js';

const TOKENS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
const MAX_EVENT_BYTES = 4096;
const MAX_NAME = 150;

/** Name and extension of a file the browser wants to upload. */
function checkName(pathname: unknown): void {
  // Slashes are refused so that nobody picks a folder in our store.
  if (
    typeof pathname !== 'string' ||
    pathname === '' ||
    pathname.length > MAX_NAME ||
    /[\u0000-\u001f\u007f/\\]/.test(pathname)
  ) {
    throw new UploadError('Check the file name.', 400);
  }
  const problem = validateFiles([{ name: pathname, size: 1 }]);
  if (problem) throw new UploadError(problem, 415);
}

/**
 * Checks the browser's request before the storage sees it. The browser may announce the size as
 * clientPayload, so a too-large file is refused before a single byte is sent.
 */
function checkEvent(event: unknown): void {
  const payload = (event as { payload?: { pathname?: unknown; clientPayload?: unknown } } | null)
    ?.payload;
  checkName(payload?.pathname);
  const declared = payload?.clientPayload;
  if (declared === undefined || declared === null) return; // the token still caps the real size
  // Digits only: no sign, no fraction, no text. Anything else is not a size this site sends.
  if (typeof declared !== 'string' || !/^\d{1,15}$/.test(declared))
    throw new UploadError('Check the file size.', 400);
  const size = Number(declared);
  const problem = validateFiles([{ name: String(payload?.pathname), size }]);
  if (problem) throw new UploadError(problem, size > MAX_FILE_BYTES ? 413 : 400);
}

const limits: UploadLimits = { maxBytes: MAX_FILE_BYTES, checkName };

async function enforceLimit(deps: Deps, request: Request): Promise<void> {
  const { allowed, retryAfterSeconds } = await deps.limiter.hit(
    `upload:${clientIp(request)}`,
    TOKENS_PER_HOUR,
    HOUR_MS,
  );
  if (!allowed) throw tooManyRequests(retryAfterSeconds);
}

async function receiveBytes(request: Request, deps: Deps): Promise<Response> {
  checkOrigin(request, !deps.config.onVercel);
  if (!deps.storage.saveLocal) throw new HttpError(404, { form: 'Not found.' });
  if (Number(request.headers.get('content-length')) > MAX_FILE_BYTES)
    throw new UploadError('That file is over the size limit.', 413);
  const pathname = new URL(request.url).searchParams.get('pathname') ?? '';
  const saved = await deps.storage.saveLocal(
    pathname,
    request.body ?? new Response('').body!,
    limits,
  );
  return json({ ok: true, ...saved });
}

export function handleUploadRoute(request: Request, getDeps: () => Deps): Promise<Response> {
  return respond(async () => {
    const deps = getDeps();
    if (request.method === 'PUT') return receiveBytes(request, deps);
    requireMethod(request, 'POST');
    checkOrigin(request, !deps.config.onVercel);
    await enforceLimit(deps, request);
    const event = await readJson(request, MAX_EVENT_BYTES);
    checkEvent(event);
    return json(await deps.storage.issueUpload(event, request, limits));
  }, 'upload');
}
