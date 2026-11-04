// Upload of one attached file, before the quote request is sent. Two steps:
// 1. POST /api/upload asks the server whether this file may be uploaded (name, extension, size).
// 2. The bytes go straight to storage: with `clientToken` to Vercel Blob through put() from
//    @vercel/blob/client; with `uploadUrl` (local mock) as a plain PUT to our own API.
// The SDK's upload() helper is not used: it hides the server's 415/429 wording behind one message.
import { ApiError, postJson, readAnswer } from './api';

export interface UploadedFile {
  url: string;
  name: string;
  size: number;
}

/** Fraction from 0 to 1. */
export type OnProgress = (fraction: number) => void;

export interface UploadDeps {
  fetch: typeof fetch;
  /** Sends the file to Vercel Blob; resolves with the stored URL. */
  putBlob(file: File, clientToken: string, onProgress: OnProgress): Promise<string>;
  /** Sends the file with PUT to the local receiver; resolves with its answer. */
  putLocal(url: string, file: File, onProgress: OnProgress): Promise<Response>;
}

interface TokenAnswer {
  clientToken?: string;
  uploadUrl?: string;
}

const browserDeps: UploadDeps = {
  fetch: (input, init) => fetch(input, init),
  async putBlob(file, token, onProgress) {
    // About 32 KB gzipped: loaded only when a file is actually going to Blob.
    const { put } = await import('@vercel/blob/client');
    const blob = await put(file.name, file, {
      access: 'private',
      token,
      onUploadProgress: (e) => onProgress(e.percentage / 100),
    });
    return blob.url;
  },
  // XMLHttpRequest, not fetch: fetch cannot report upload progress.
  putLocal: (url, file, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () =>
        resolve(
          new Response(xhr.responseText, {
            status: xhr.status,
            headers: { 'retry-after': xhr.getResponseHeader('retry-after') ?? '' },
          }),
        );
      xhr.onerror = xhr.onabort = xhr.ontimeout = () => reject(new TypeError('upload failed'));
      xhr.send(file);
    }),
};

export async function uploadFile(
  file: File,
  onProgress: OnProgress,
  deps: UploadDeps = browserDeps,
): Promise<UploadedFile> {
  const answer = await postJson<TokenAnswer>(
    '/api/upload',
    {
      type: 'blob.generate-client-token',
      payload: { pathname: file.name, clientPayload: String(file.size), multipart: false },
    },
    { fetch: deps.fetch, timeoutMs: 15_000 },
  );

  const lost = () =>
    new ApiError(0, {
      files: `"${file.name}" did not upload. Check your connection and send the request again.`,
    });
  let url: string;
  try {
    if (answer.clientToken) url = await deps.putBlob(file, answer.clientToken, onProgress);
    else if (answer.uploadUrl) {
      const response = await deps.putLocal(answer.uploadUrl, file, onProgress);
      url = (await readAnswer<{ url: string }>(response)).url;
    } else throw lost();
  } catch (error) {
    throw error instanceof ApiError ? error : lost();
  }
  return { url, name: file.name, size: file.size };
}
