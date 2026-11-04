// Local stand-in for Vercel Functions: serves /api/* from the files in api/, on one Node server.
// `npm run dev:api` starts it; `astro dev` forwards /api to it (astro.config.mjs).
// Vite loads the TypeScript on the fly (it is already installed with Astro), and reloads on change.
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createServer as createVite } from 'vite';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);

const port = Number(process.env.API_PORT) || 8787;
const vite = await createVite({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});

/** Node's request as the Web Request a Vercel function receives. */
function toRequest(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers))
    headers.set(name, [value].flat().join(', '));
  headers.set('x-real-ip', req.socket.remoteAddress ?? 'local'); // what Vercel adds in production
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: 'half',
  });
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const name = /^\/api\/([a-z-]+)$/.exec(pathname)?.[1];
  const file = name && `api/${name}.ts`;
  let response;
  if (!file || !existsSync(file)) {
    response = Response.json({ ok: false, errors: { form: 'Not found.' } }, { status: 404 });
  } else {
    const handler = (await vite.ssrLoadModule(`/${file}`))[req.method];
    response = handler
      ? await handler(toRequest(req))
      : Response.json({ ok: false, errors: { form: 'Method not allowed.' } }, { status: 405 });
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

createServer((req, res) =>
  handle(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500).end();
  }),
).listen(port, () => console.log(`API on http://localhost:${port}/api/ (rfq, upload)`));
