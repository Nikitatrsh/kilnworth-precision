// Vercel Blob, private store. The browser uploads straight to Blob with a short-lived token that
// this server hands out (so a 25 MB file never passes through a function, which is capped at 4.5 MB).
// Docs: https://vercel.com/docs/vercel-blob/client-upload and /private-storage
import { get, issueSignedToken, presignUrl } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { UploadError, readHead, type Storage } from './storage.js';

const HOST_SUFFIX = '.private.blob.vercel-storage.com';
const TOKEN_LIFETIME_MS = 30 * 60 * 1000; // time the browser has to finish one upload
const LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000 - 60_000; // Vercel's maximum is 7 days

type Sdk = {
  handleUpload: typeof handleUpload;
  get: typeof get;
  issueSignedToken: typeof issueSignedToken;
  presignUrl: typeof presignUrl;
};

/** Tokens look like vercel_blob_rw_<storeId>_<secret>; the store id is also the first part of the host. */
const storeIdOf = (token: string) =>
  /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(token)?.[1]?.toLowerCase();

export function blobStorage(
  token: string,
  sdk: Sdk = { handleUpload, get, issueSignedToken, presignUrl },
): Storage {
  const storeId = storeIdOf(token);

  /** The URL must point into OUR private store: the server later sends our token to it. */
  function ownUrl(raw: string): URL | null {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const hostOk = storeId
      ? url.hostname === `${storeId}${HOST_SUFFIX}`
      : url.hostname.endsWith(HOST_SUFFIX);
    const plain = url.protocol === 'https:' && !url.port && !url.username && !url.password;
    return hostOk && plain ? url : null;
  }

  return {
    mode: 'blob',

    async handleClientUpload(body, request, limits) {
      const type = (body as { type?: unknown } | null)?.type;
      if (type !== 'blob.generate-client-token') throw new UploadError('Unsupported request.', 400);
      return sdk.handleUpload({
        body: body as Parameters<typeof handleUpload>[0]['body'],
        request,
        token,
        onBeforeGenerateToken: async (pathname) => {
          limits.checkName(pathname);
          return {
            maximumSizeInBytes: limits.maxBytes,
            addRandomSuffix: true, // the stored name cannot be guessed
            allowOverwrite: false,
            validUntil: Date.now() + TOKEN_LIFETIME_MS,
          };
        },
        // No onUploadCompleted: it cannot run on localhost, and /api/rfq checks the file itself.
      });
    },

    async inspect(raw) {
      const url = ownUrl(raw);
      if (!url) return null;
      const result = await sdk.get(url.href, { access: 'private', token });
      if (!result || result.statusCode !== 200) return null;
      return { size: result.blob.size, head: await readHead(result.stream) };
    },

    async shareLinks(urls) {
      try {
        const signed = await sdk.issueSignedToken({
          operations: ['get'],
          validUntil: Date.now() + LINK_LIFETIME_MS,
          token,
        });
        return await Promise.all(
          urls.map(async (raw) => {
            const pathname = decodeURIComponent(new URL(raw).pathname.slice(1));
            const { presignedUrl } = await sdk.presignUrl(signed, {
              operation: 'get',
              pathname,
              access: 'private',
              validUntil: Date.now() + LINK_LIFETIME_MS,
            });
            return presignedUrl;
          }),
        );
      } catch (error) {
        // The request itself is fine; the shop can still open the file from the Vercel dashboard.
        console.error(
          '[rfq] could not sign file links:',
          error instanceof Error ? error.name : 'unknown',
        );
        return urls;
      }
    },
  };
}
