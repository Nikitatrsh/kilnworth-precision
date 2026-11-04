// File storage behind one small interface: `blob` (Vercel Blob, private store) and `local`
// (mock, writes to .local/uploads/). The browser code is the same for both; only where the bytes
// land differs. See README, "Quote form backend".

export interface StoredFile {
  size: number;
  /** First bytes of the file, enough to recognise its format. */
  head: Uint8Array;
}

/** An upload the server refuses; `status` is the HTTP code to answer with. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415,
  ) {
    super(message);
  }
}

export interface UploadLimits {
  maxBytes: number;
  /** Throws UploadError when the file name is not acceptable. */
  checkName(pathname: string): void;
}

export interface Storage {
  mode: 'blob' | 'local';
  /**
   * Blob mode: answers the browser's request for an upload token (protocol of @vercel/blob/client).
   * Local mode does not use it.
   */
  handleClientUpload?(body: unknown, request: Request, limits: UploadLimits): Promise<unknown>;
  /** Local mode: receives the bytes itself, because there is no Blob to send them to. */
  saveLocal?(
    pathname: string,
    body: ReadableStream<Uint8Array>,
    limits: UploadLimits,
  ): Promise<{ url: string; pathname: string; size: number }>;
  /** Looks a file up by the URL the browser sent. null: not ours, or not there. Never trusts the URL. */
  inspect(url: string): Promise<StoredFile | null>;
  /** Links the shop can open, in the same order as `urls`. */
  shareLinks(urls: string[]): Promise<string[]>;
}

/** Reads at most `limit` bytes, then stops the stream (the rest of a 25 MB file is not needed). */
export async function readHead(
  stream: ReadableStream<Uint8Array>,
  limit = 1024,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return new Uint8Array(Buffer.concat(chunks).subarray(0, limit));
}
