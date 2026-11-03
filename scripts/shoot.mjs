// Screenshots of the running site with local Chrome, via the DevTools protocol.
// Node built-ins only (global fetch and WebSocket, Node 22+). Start the site first: `npm run preview`.
//
//   npm run shoot                      -> the standard set into docs/screenshots/
//   npm run shoot -- /rfq 390 out.png  -> one page, one width, full height
//   add --no-js to render with JavaScript disabled
//
// Why not `chrome --screenshot`: headless Chrome will not open a window narrower than 500px,
// and it cannot disable JavaScript for a screenshot. CDP device emulation does both.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const MAX_HEIGHT = 14000; // px; Chrome's capture limit is about 16k, very long pages are cut here

const STANDARD = [
  ['/', 'home'],
  ['/rfq', 'rfq'],
  ['/capabilities', 'capabilities'],
  ['/work/sensor-housing-7075', 'case-study'],
  ['/about', 'about'],
].flatMap(([path, name]) => [
  { path, width: 1440, out: `docs/screenshots/${name}-desktop.png` },
  { path, width: 390, out: `docs/screenshots/${name}-mobile.png` },
]);

const args = process.argv.slice(2);
const noJs = args.includes('--no-js');
// --overflow: no screenshots; report pages that scroll sideways at common widths.
const overflowMode = args.includes('--overflow');
const cspMode = args.includes('--csp');
const OVERFLOW_WIDTHS = [360, 390, 768, 1024, 1440, 1920];
const PAGES = [
  '/',
  '/capabilities',
  '/capabilities/5-axis-milling',
  '/capabilities/cnc-turning',
  '/capabilities/swiss-turning',
  '/capabilities/wire-edm',
  '/capabilities/inspection-finishing',
  '/materials',
  '/industries',
  '/quality',
  '/work',
  '/work/sensor-housing-7075',
  '/work/bone-screw-ti',
  '/work/valve-manifold-316l',
  '/about',
  '/resources',
  '/resources/drawing-changes-that-cut-cost',
  '/resources/tolerances-on-your-rfq',
  '/rfq',
  '/contact',
  '/privacy',
  '/404',
];
const positional = args.filter((a) => !a.startsWith('--'));
const jobs = positional.length
  ? [
      {
        path: positional[0],
        width: Number(positional[1] ?? 1440),
        out: positional[2] ?? 'shot.png',
      },
    ]
  : STANDARD;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9222 + Math.floor(Math.random() * 1000);
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shoot-'))}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await sleep(100);
    }
  }
  if (!targets) throw new Error('Chrome did not start');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const waiting = new Map();
  const events = new Map(); // CDP event name -> handler
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) (waiting.get(msg.id)(msg.result), waiting.delete(msg.id));
    if (msg.method && events.has(msg.method)) events.get(msg.method)(msg.params);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      waiting.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  if (noJs) await send('Emulation.setScriptExecutionDisabled', { value: true });

  // --csp: serve every page with the Content-Security-Policy header from vercel.json (added to
  // the response in flight) and report violations. `npm run preview` sends no headers, so this
  // is how to test the CSP locally before deploying.
  if (cspMode) {
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    const policy = vercel.headers[0].headers
      .find((h) => h.key === 'Content-Security-Policy')
      .value.replace(/upgrade-insecure-requests;?/, ''); // would break http://localhost
    events.set(
      'Fetch.requestPaused',
      async ({ requestId, responseStatusCode, responseHeaders = [] }) => {
        const { body, base64Encoded } = await send('Fetch.getResponseBody', { requestId });
        await send('Fetch.fulfillRequest', {
          requestId,
          responseCode: responseStatusCode,
          responseHeaders: [...responseHeaders, { name: 'Content-Security-Policy', value: policy }],
          body: base64Encoded ? body : Buffer.from(body).toString('base64'),
        });
      },
    );
    await send('Fetch.enable', {
      patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }],
    });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__csp = [];
        document.addEventListener('securitypolicyviolation', (e) =>
          window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline')));`,
    });
    let total = 0;
    for (const path of PAGES) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send('Page.navigate', { url: BASE + path });
      await sleep(900);
      const { result } = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `({ v: window.__csp, js: document.documentElement.classList.contains('js'), banner: !!document.querySelector('.demo-close:not([hidden])') })`,
      });
      const { v, js, banner } = result.value;
      total += v.length;
      if (v.length || !js || !banner)
        console.log(
          `${path}: ${v.length} violations ${v.join('; ')}  boot.js ran: ${js}  module scripts ran: ${banner}`,
        );
    }
    console.log(`${PAGES.length} pages loaded under the CSP, ${total} violations.`);
    process.exitCode = total ? 1 : 0;
    jobs.length = 0;
  }

  if (overflowMode) {
    let problems = 0;
    for (const path of PAGES) {
      for (const width of OVERFLOW_WIDTHS) {
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await send('Page.navigate', { url: BASE + path });
        await sleep(700);
        const { result } = await send('Runtime.evaluate', {
          returnByValue: true,
          expression: `(() => {
            const w = document.documentElement.clientWidth;
            const wide = [...document.querySelectorAll('body *')]
              .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('[role=region]'))
              .slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + [...el.classList].join('.'));
            return { scroll: document.documentElement.scrollWidth, w, wide };
          })()`,
        });
        const v = result.value;
        if (v.scroll > v.w) {
          problems++;
          console.log(
            `OVERFLOW ${path} @${width}: scrollWidth ${v.scroll} > ${v.w}  ${v.wide.join(' ')}`,
          );
        }
      }
    }
    console.log(
      `${PAGES.length} pages × ${OVERFLOW_WIDTHS.length} widths checked, ${problems} with horizontal scroll.`,
    );
    process.exitCode = problems ? 1 : 0;
    jobs.length = 0;
  }

  for (const job of jobs) {
    const mobile = job.width < 768;
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width,
      height: 900,
      deviceScaleFactor: 1,
      mobile,
    });
    await send('Page.navigate', { url: BASE + job.path });
    await sleep(1800); // fonts, scripts and the hero animation settle
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    const height = Math.min(Math.ceil(cssContentSize.height), MAX_HEIGHT);
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
    await sleep(300);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(dirname(job.out), { recursive: true });
    writeFileSync(job.out, Buffer.from(data, 'base64'));
    console.log(`${job.out}  ${job.width}×${height}${noJs ? '  (no JS)' : ''}`);
  }
  ws.close();
} finally {
  chrome.kill();
}
