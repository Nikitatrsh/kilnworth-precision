import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UploadError, readHead, type UploadLimits } from './storage';
import { localStorage } from './storage-local';

const limits: UploadLimits = { maxBytes: 100, checkName: () => {} };
const stream = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(new TextEncoder().encode(p));
      controller.close();
    },
  });
const newDir = () => mkdtemp(join(tmpdir(), 'uploads-'));

describe('localStorage', () => {
  it('saves an upload under a random-prefixed safe name and can find it again', async () => {
    const dir = await newDir();
    const storage = localStorage(dir);
    const saved = await storage.saveLocal!(
      'my part (v2).step',
      stream('ISO-10303-21;', ' rest'),
      limits,
    );

    expect(saved.size).toBe(18);
    expect(saved.url).toMatch(/^local:[0-9a-f]{8}-my_part__v2_.step$/);
    expect(await readFile(join(dir, saved.pathname), 'utf8')).toBe('ISO-10303-21; rest');

    const found = await storage.inspect(saved.url);
    expect(found?.size).toBe(18);
    expect(new TextDecoder().decode(found!.head)).toBe('ISO-10303-21; rest');
  });

  it('does not let two uploads with the same name overwrite each other', async () => {
    const dir = await newDir();
    const storage = localStorage(dir);
    await storage.saveLocal!('a.pdf', stream('one'), limits);
    await storage.saveLocal!('a.pdf', stream('two'), limits);
    expect(await readdir(dir)).toHaveLength(2);
  });

  it('refuses a file over the limit and an empty file', async () => {
    const storage = localStorage(await newDir());
    await expect(
      storage.saveLocal!('a.pdf', stream('x'.repeat(60), 'x'.repeat(60)), limits),
    ).rejects.toMatchObject({ status: 413 });
    await expect(storage.saveLocal!('a.pdf', stream(), limits)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('runs the name check before it reads anything', async () => {
    const storage = localStorage(await newDir());
    const strict: UploadLimits = {
      maxBytes: 100,
      checkName: () => {
        throw new UploadError('bad name', 415);
      },
    };
    await expect(storage.saveLocal!('a.exe', stream('x'), strict)).rejects.toMatchObject({
      status: 415,
    });
  });

  it('only finds files it saved: no paths, no other schemes', async () => {
    const dir = await newDir();
    await writeFile(join(dir, '.hidden'), 'x');
    const storage = localStorage(dir);
    for (const url of [
      'local:../secret',
      'local:a/b',
      'local:/etc/passwd',
      'local:.hidden',
      'local:',
      'local:missing.pdf',
      'https://x.example/a.pdf',
      'file:///etc/passwd',
      '../x',
    ])
      expect(await storage.inspect(url), url).toBeNull();
  });

  it('shows where the file is on this computer', async () => {
    const dir = await newDir();
    expect(await localStorage(dir).shareLinks(['local:abc-a.pdf'])).toEqual([
      join(dir, 'abc-a.pdf'),
    ]);
  });
});

describe('localStorage.issueUpload', () => {
  const event = (pathname: unknown) => ({
    type: 'blob.generate-client-token',
    payload: { pathname },
  });

  it('tells the browser where to send the bytes, after the name check', async () => {
    const storage = localStorage(await newDir());
    const answer = await storage.issueUpload(
      event('my part.step'),
      new Request('http://localhost'),
      limits,
    );
    expect(answer).toEqual({
      type: 'blob.generate-client-token',
      uploadUrl: '/api/upload?pathname=my%20part.step',
    });
  });

  it('refuses other events and names that fail the check', async () => {
    const storage = localStorage(await newDir());
    const request = new Request('http://localhost');
    await expect(
      storage.issueUpload({ type: 'blob.upload-completed' }, request, limits),
    ).rejects.toMatchObject({ status: 400 });
    await expect(storage.issueUpload(event(42), request, limits)).rejects.toMatchObject({
      status: 400,
    });
    const strict: UploadLimits = {
      maxBytes: 1,
      checkName: () => {
        throw new UploadError('no', 415);
      },
    };
    await expect(storage.issueUpload(event('a.exe'), request, strict)).rejects.toMatchObject({
      status: 415,
    });
  });
});

describe('readHead', () => {
  it('returns the first bytes and stops reading', async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(600).fill(65));
      },
      cancel() {
        cancelled = true;
      },
    });
    const head = await readHead(source, 1024);
    expect(head).toHaveLength(1024);
    expect(cancelled).toBe(true);
  });

  it('returns everything of a short file', async () => {
    expect(new TextDecoder().decode(await readHead(stream('%PDF-1.7')))).toBe('%PDF-1.7');
  });
});
