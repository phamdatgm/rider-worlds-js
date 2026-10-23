// SDK wiring check on the dev page: node tools/qa/sdk-check.mjs [outDir]
// Boots a fresh profile (preroll off), prints every gmsdkjs track call with its parameters, failed requests and page
// errors, then plays a run and returns to the menu. Exits 1 on a page error.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../browser.mjs';

const out = process.argv[2] || 'smoke-out/sdk';
const url = process.env.URL || 'http://localhost:5173/?preroll=0';
fs.mkdirSync(out, { recursive: true });

const browser = await launchBrowser({ defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const lines = [];
let failed = false;
const log = (s) => {
  lines.push(s);
  console.log(s);
};
page.on('pageerror', (e) => {
  failed = true;
  log(`[pageerror] ${e.stack || e.message}`);
});
page.on('requestfailed', (r) => log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => r.status() >= 400 && log(`[http ${r.status()}] ${r.url()}`));
await page.exposeFunction('__track', (name, params) => log(`[track] ${name} ${JSON.stringify(params)}`));
// every track call, with its parameters (the debug log prints [object Object])
await page.evaluateOnNewDocument(() => {
  let real;
  Object.defineProperty(window, 'GMSDKJS', {
    configurable: true,
    get: () => real,
    set(v) {
      real = v;
      const track = v?.track?.bind(v);
      if (track)
        v.track = (n, p) => {
          window.__track(n, p ?? null);
          return track(n, p);
        };
    },
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__app && window.__game?.manager && !window.__app.loading, { timeout: 180000 });
  await sleep(2000);
  log(`[state] ${await page.evaluate(() => window.__app.state)}`);
  log(`[save] ${await page.evaluate(() => JSON.stringify(Object.keys(window.gmSave?.dump?.() ?? {})))}`);
  await page.screenshot({ path: path.join(out, 'boot.png') });
} catch (e) {
  failed = true;
  log(`[fail] ${e.message}`);
}
fs.writeFileSync(path.join(out, 'log.txt'), lines.join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
