// Checks every internal link and asset in dist/ points at a file that exists.
// Run after `npm run build`: `npm run check-links`. No dependencies, Node only.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.html')) htmlFiles.push(path);
  }
})(dist);

// A clean URL like /about can be served from about.html or about/index.html (Vercel cleanUrls).
function resolves(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/\/$/, '');
  return [clean, `${clean}.html`, `${clean}/index.html`].some(
    (p) => existsSync(join(dist, p)) && statSync(join(dist, p)).isFile(),
  );
}

const idsIn = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

let broken = 0;
let checked = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const ids = idsIn(html);
  for (const [, attr, raw] of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(raw)) continue; // external: not checked here
    checked++;
    const [path, hash] = raw.split('#');
    if (path === '') {
      if (hash && !ids.has(hash)) {
        broken++;
        console.error(`${relative(dist, file)}: ${attr}="${raw}" (no element with that id)`);
      }
      continue;
    }
    const target = path.split('?')[0];
    if (!target.startsWith('/') || !resolves(target === '/' ? '/index' : target)) {
      broken++;
      console.error(`${relative(dist, file)}: ${attr}="${raw}" (not found in dist)`);
    }
  }
}

console.log(`${htmlFiles.length} pages, ${checked} internal links checked, ${broken} broken.`);
process.exit(broken ? 1 : 0);
