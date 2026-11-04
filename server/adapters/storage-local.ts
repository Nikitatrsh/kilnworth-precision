// Mock storage: files land in a folder (.local/uploads/). Only for working without an account.
import { mkdir, open, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { UploadError, type Storage } from './storage.js';

const PREFIX = 'local:';
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export function localStorage(dir: string): Storage {
  return {
    mode: 'local',

    async issueUpload(body, _request, limits) {
      const event = body as { type?: unknown; payload?: { pathname?: unknown } } | null;
      const pathname = event?.payload?.pathname;
      if (event?.type !== 'blob.generate-client-token' || typeof pathname !== 'string')
        throw new UploadError('Unsupported request.', 400);
      limits.checkName(pathname);
      return {
        type: event.type,
        uploadUrl: `/api/upload?pathname=${encodeURIComponent(pathname)}`,
      };
    },

    async saveLocal(pathname, body, limits) {
      limits.checkName(pathname);
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of body) {
        size += chunk.length;
        if (size > limits.maxBytes) throw new UploadError('That file is over the size limit.', 413);
        chunks.push(chunk);
      }
      if (size === 0) throw new UploadError('That file is empty.', 400);

      // Random prefix: same-named files do not overwrite each other. Unsafe characters become "_".
      const name = `${crypto.randomUUID().slice(0, 8)}-${pathname.replace(/[^A-Za-z0-9._-]/g, '_')}`;
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), Buffer.concat(chunks));
      return { url: PREFIX + name, pathname: name, size };
    },

    async inspect(url) {
      const name = url.startsWith(PREFIX) ? url.slice(PREFIX.length) : '';
      if (!SAFE_NAME.test(name) || name.startsWith('.')) return null; // no paths, no "..", no hidden files
      try {
        const { size } = await stat(join(dir, name));
        const file = await open(join(dir, name));
        try {
          const { buffer, bytesRead } = await file.read(Buffer.alloc(1024), 0, 1024, 0);
          return { size, head: new Uint8Array(buffer.subarray(0, bytesRead)) };
        } finally {
          await file.close();
        }
      } catch {
        return null;
      }
    },

    // The path on this computer; a mock has no real link to give.
    shareLinks: async (urls) => urls.map((u) => resolve(dir, u.slice(PREFIX.length))),
  };
}
