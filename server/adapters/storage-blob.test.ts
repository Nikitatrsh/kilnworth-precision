import { describe, expect, it, vi } from 'vitest';
import { UploadError, type UploadLimits } from './storage';
import { blobStorage } from './storage-blob';

// Looks like a real token's shape without being one: the store id is "abc123store".
const TOKEN = ['vercel', 'blob', 'rw', 'abc123store', 'notarealsecret'].join('_');
const HOST = 'https://abc123store.private.blob.vercel-storage.com';

const limits: UploadLimits = { maxBytes: 25 * 1024 * 1024, checkName: vi.fn() };

function fakeSdk(over: Record<string, unknown> = {}) {
  return {
    handleUpload: vi.fn(async (o: { onBeforeGenerateToken: (p: string) => Promise<unknown> }) => ({
      type: 'blob.generate-client-token',
      clientToken: 'token-for-test',
      constraints: await o.onBeforeGenerateToken('part.step'),
    })),
    get: vi.fn(),
    issueSignedToken: vi.fn(async () => ({
      delegationToken: 'd',
      clientSigningToken: 'c',
      validUntil: 0,
    })),
    presignUrl: vi.fn(async (_t: unknown, o: { pathname: string }) => ({
      presignedUrl: `${HOST}/${o.pathname}?sig=1`,
    })),
    ...over,
  } as never;
}

describe('blobStorage.issueUpload', () => {
  it('asks the SDK for a token limited to 25 MB, a random name and one try', async () => {
    const sdk = fakeSdk();
    const request = new Request('https://site.example/api/upload', { method: 'POST' });
    const body = {
      type: 'blob.generate-client-token',
      payload: { pathname: 'part.step', clientPayload: null, multipart: false },
    };
    const answer = (await blobStorage(TOKEN, sdk).issueUpload(body, request, limits)) as {
      constraints: Record<string, unknown>;
    };

    const [options] = (sdk as { handleUpload: { mock: { calls: [Record<string, unknown>][] } } })
      .handleUpload.mock.calls[0];
    expect(options.token).toBe(TOKEN);
    expect(options.request).toBe(request);
    expect(options.onUploadCompleted).toBeUndefined();
    expect(answer.constraints).toMatchObject({
      maximumSizeInBytes: 25 * 1024 * 1024,
      addRandomSuffix: true,
      allowOverwrite: false,
    });
    expect(limits.checkName).toHaveBeenCalledWith('part.step');
  });

  it('answers only token requests, not other event types', async () => {
    const sdk = fakeSdk();
    for (const body of [{ type: 'blob.upload-completed', payload: {} }, {}, null]) {
      await expect(
        blobStorage(TOKEN, sdk).issueUpload(body, new Request('https://x.example'), limits),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(
      (sdk as { handleUpload: { mock: { calls: unknown[] } } }).handleUpload.mock.calls,
    ).toHaveLength(0);
  });

  it('does not issue a token when the name check refuses the file', async () => {
    const strict: UploadLimits = {
      ...limits,
      checkName: () => {
        throw new UploadError('no', 415);
      },
    };
    const sdk = fakeSdk({
      handleUpload: async (o: { onBeforeGenerateToken: (p: string) => Promise<unknown> }) =>
        o.onBeforeGenerateToken('a.exe'),
    });
    const body = { type: 'blob.generate-client-token', payload: { pathname: 'a.exe' } };
    await expect(
      blobStorage(TOKEN, sdk).issueUpload(body, new Request('https://x.example'), strict),
    ).rejects.toMatchObject({ status: 415 });
  });
});

describe('blobStorage.inspect', () => {
  const streamOf = (text: string) => new Response(text).body!;

  it('returns the size and first bytes of a file in our store', async () => {
    const get = vi.fn(async () => ({
      statusCode: 200,
      stream: streamOf('%PDF-1.7 ...'),
      blob: { size: 4321 },
    }));
    const found = await blobStorage(TOKEN, fakeSdk({ get })).inspect(`${HOST}/part-xYz.pdf`);
    expect(found?.size).toBe(4321);
    expect(new TextDecoder().decode(found!.head)).toBe('%PDF-1.7 ...');
    expect(get).toHaveBeenCalledWith(`${HOST}/part-xYz.pdf`, { access: 'private', token: TOKEN });
  });

  it('returns null when the file is not there', async () => {
    expect(
      await blobStorage(TOKEN, fakeSdk({ get: async () => null })).inspect(`${HOST}/gone.pdf`),
    ).toBeNull();
  });

  it('never calls out for a URL that is not in our private store', async () => {
    const get = vi.fn();
    const storage = blobStorage(TOKEN, fakeSdk({ get }));
    for (const url of [
      'http://abc123store.private.blob.vercel-storage.com/a.pdf', // not https
      'https://otherstore.private.blob.vercel-storage.com/a.pdf', // someone else's store
      'https://abc123store.public.blob.vercel-storage.com/a.pdf', // public store
      'https://abc123store.private.blob.vercel-storage.com.evil.example/a.pdf',
      'https://evil.example/abc123store.private.blob.vercel-storage.com/a.pdf',
      'https://user:pw@abc123store.private.blob.vercel-storage.com/a.pdf',
      'https://abc123store.private.blob.vercel-storage.com:8443/a.pdf',
      'local:whatever.pdf',
      'not a url',
      '',
    ]) {
      expect(await storage.inspect(url), url).toBeNull();
    }
    expect(get).not.toHaveBeenCalled();
  });

  it('accepts any private Blob host when the token does not reveal the store id', async () => {
    const get = vi.fn(async () => null);
    await blobStorage('opaque-token', fakeSdk({ get })).inspect(
      'https://anystore.private.blob.vercel-storage.com/a.pdf',
    );
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('blobStorage.shareLinks', () => {
  it('signs one 7-day link per file with a single token request', async () => {
    const sdk = fakeSdk();
    const links = await blobStorage(TOKEN, sdk).shareLinks([
      `${HOST}/a-1.step`,
      `${HOST}/b%20c-2.pdf`,
    ]);
    expect(links).toEqual([`${HOST}/a-1.step?sig=1`, `${HOST}/b c-2.pdf?sig=1`]);
    const s = sdk as unknown as { issueSignedToken: { mock: { calls: unknown[][] } } };
    expect(s.issueSignedToken.mock.calls).toHaveLength(1);
  });

  it('falls back to the plain URLs when signing fails, without failing the request', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sdk = fakeSdk({
      issueSignedToken: async () => {
        throw new Error('boom');
      },
    });
    expect(await blobStorage(TOKEN, sdk).shareLinks([`${HOST}/a-1.step`])).toEqual([
      `${HOST}/a-1.step`,
    ]);
    quiet.mockRestore();
  });
});
