// Mock mailer: writes each mail to a folder instead of sending it, so the form can be tried
// without any account. Open the .html file in a browser to see the mail as the reader would.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Mailer } from './mail.js';

const slug = (s: string) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function fileMailer(dir: string): Mailer {
  let count = 0;
  return {
    async send(message) {
      await mkdir(dir, { recursive: true });
      const base = join(
        dir,
        `${new Date().toISOString().replace(/[:.]/g, '-')}-${count++}-${slug(message.to)}`,
      );
      const { html, ...meta } = message;
      await writeFile(`${base}.json`, JSON.stringify({ ...meta, html }, null, 2));
      await writeFile(`${base}.html`, html);
    },
  };
}
