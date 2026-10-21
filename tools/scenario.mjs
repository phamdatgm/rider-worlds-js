// Scripted headless session: node tools/scenario.mjs <scenario.mjs> [outDir]
// The scenario module default-exports async (h) => {...} with helpers:
//   h.page, h.shot(name), h.sleep(ms), h.eval(fn, ...args), h.wait(fn, timeoutMs), h.click(selector), h.bot(on)
// SAVE=<json file> preloads localStorage before the page boots.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';

const script = process.argv[2];
const out = process.argv[3] || 'scenario-out';
const url = process.env.URL || 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });

const browser = await launchBrowser({ defaultViewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => {
  const t = `[${m.type()}] ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error' || m.type() === 'warn' || process.env.VERBOSE) console.log(t);
});
page.on('pageerror', (e) => {
  logs.push(`[pageerror] ${e.stack || e.message}`);
  console.log('[pageerror]', e.stack || e.message);
});
page.on('response', (r) => r.status() >= 400 && console.log(`[http ${r.status()}] ${r.url()}`));
const save = process.env.SAVE ? fs.readFileSync(process.env.SAVE, 'utf8') : null;
await page.evaluateOnNewDocument((s) => {
  if (s === null) return;
  try {
    localStorage.clear();
    if (s) localStorage.setItem('rider-worlds-save-v2', s);
  } catch {}
}, save ?? (process.env.FRESH ? '' : null));

const h = {
  page,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  shot: (name) => page.screenshot({ path: path.join(out, `${name}.png`) }),
  eval: (fn, ...a) => page.evaluate(fn, ...a),
  wait: (fn, timeout = 120000, ...a) => page.waitForFunction(fn, { timeout }, ...a),
  click: async (sel) => {
    await page.waitForSelector(sel, { visible: true, timeout: 20000 });
    await page.click(sel);
  },
  /** auto-rider: hold on the ground, flip in the air until upright */
  bot: (on = true) =>
    page.evaluate((on) => {
      clearInterval(window.__botTimer);
      if (!on) return window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
      let held = false;
      const send = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'ArrowUp' }));
      window.__botTimer = setInterval(() => {
        const p = window.__game?.manager?.RunState?.PlayerState?.Player;
        if (!p) return;
        const g = p.CollisionChecker.IsFrontGrounded || p.CollisionChecker.IsBackGrounded;
        const a = p.transform.eulerZ;
        const want = g || (p.StuntChecker.CurrentAirTime > 0.25 && a > 40 && a < 320 && p.StuntChecker.CurrentAirTime < 2);
        if (want !== held) {
          held = want;
          send(want ? 'keydown' : 'keyup');
        }
      }, 16);
    }, on),
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const mod = await import(pathToFileURL(path.resolve(script)).href);
  await mod.default(h);
} catch (e) {
  console.log('SCENARIO FAILED:', e.message);
  await h.shot('zz-failure').catch(() => {});
} finally {
  fs.writeFileSync(path.join(out, 'console.log'), logs.join('\n'));
  await browser.close();
}
