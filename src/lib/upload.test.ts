import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { uploadFile, type UploadDeps } from './upload';

const file = new File([new Uint8Array(2048)], 'bracket.step');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Deps where every call is recorded; each test overrides what it needs. */
function deps(overrides: Partial<UploadDeps> = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const base: UploadDeps = {
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return json({
        type: 'blob.generate-client-token',
        uploadUrl: '/api/upload?pathname=bracket.step',
      });
    },
    putBlob: async () => {
      throw new Error('not expected');
    },
    putLocal: async () =>
      json({ ok: true, url: 'local:abc-bracket.step', pathname: 'bracket.step', size: 2048 }),
  };
  return { calls, deps: { ...base, ...overrides } };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('uploadFile', () => {
  it('asks /api/upload for a token with the file name and size', async () => {
    const { calls, deps: d } = deps();
    await uploadFile(file, () => {}, d);
    expect(calls).toEqual([
      {
        url: '/api/upload',
        body: {
          type: 'blob.generate-client-token',
          payload: { pathname: 'bracket.step', clientPayload: '2048', multipart: false },
        },
      },
    ]);
  });

  it('local mock: PUTs the bytes to uploadUrl and returns the stored url', async () => {
    let putTo = '';
    const { deps: d } = deps({
      putLocal: async (url, body, onProgress) => {
        putTo = url;
        expect(body).toBe(file);
        onProgress(1);
        return json({ ok: true, url: 'local:abc-bracket.step', size: 2048 });
      },
    });
    const progress: number[] = [];
    const result = await uploadFile(file, (p) => progress.push(p), d);
    expect(putTo).toBe('/api/upload?pathname=bracket.step');
    expect(result).toEqual({ url: 'local:abc-bracket.step', name: 'bracket.step', size: 2048 });
    expect(progress).toEqual([1]);
  });

  it('blob mode: hands the client token to putBlob and uses the url it returns', async () => {
    let token = '';
    const { deps: d } = deps({
      fetch: async () =>
        json({ type: 'blob.generate-client-token', clientToken: 'vercel_blob_client_x' }),
      putBlob: async (body, clientToken) => {
        expect(body).toBe(file);
        token = clientToken;
        return 'https://store.private.blob.vercel-storage.com/bracket-Ab12.step';
      },
    });
    const result = await uploadFile(file, () => {}, d);
    expect(token).toBe('vercel_blob_client_x');
    expect(result.url).toBe('https://store.private.blob.vercel-storage.com/bracket-Ab12.step');
  });

  it('passes the token refusal through with the server wording (415, 429)', async () => {
    const { deps: d } = deps({
      fetch: async () =>
        json({ ok: false, errors: { files: '"x.exe" is not a supported file.' } }, 415),
    });
    const error = await failure(uploadFile(file, () => {}, d));
    expect(error.status).toBe(415);
    expect(error.errors.files).toBe('"x.exe" is not a supported file.');
  });

  it('passes a refused local PUT through (413 from the receiver)', async () => {
    const { deps: d } = deps({
      putLocal: async () =>
        json({ ok: false, errors: { files: 'That file is over the size limit.' } }, 413),
    });
    const error = await failure(uploadFile(file, () => {}, d));
    expect(error.status).toBe(413);
    expect(error.errors.files).toMatch(/size limit/);
  });

  it('names the file when the bytes do not get through', async () => {
    const { deps: d } = deps({
      fetch: async () => json({ type: 'blob.generate-client-token', clientToken: 't' }),
      putBlob: async () => {
        throw new Error('network');
      },
    });
    const error = await failure(uploadFile(file, () => {}, d));
    expect(error.status).toBe(0);
    expect(error.errors.files).toMatch(/"bracket\.step" did not upload/);
  });

  it('refuses an answer with neither a token nor an upload url', async () => {
    const { deps: d } = deps({ fetch: async () => json({ type: 'blob.generate-client-token' }) });
    const error = await failure(uploadFile(file, () => {}, d));
    expect(error.errors.files).toMatch(/did not upload/);
  });
});
