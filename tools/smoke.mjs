// Headless smoke test: node tools/smoke.mjs [outDir] [scenario]
// Opens the dev server, starts an endless run (or a level), holds "accelerate" and saves screenshots + console log.
// Exits with code 1 on an uncaught page error or a failed step, so it can gate a change.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './browser.mjs';

const out = process.argv[2] || 'smoke-out';
const scenario = process.argv[3] || 'endless';
const url = process.env.URL || 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });

const browser = await launchBrowser({ defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const logs = [];
let failed = false;
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => {
  failed = true;
  logs.push(`[pageerror] ${e.stack || e.message}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`);
});
const shot = async (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // a fresh profile boots straight into the first-run tutorial (game scene), a finished one into the menu
  await page.waitForFunction(() => window.__app && window.__game?.manager && !window.__app.loading, { timeout: 180000 });
  await sleep(1500);
  const start = await page.evaluate(() => window.__app.state);
  logs.push(`[state boot] ${start}`);
  await shot(`01-${start}`);
  if (start === 'menu') {
    if (scenario === 'endless') {
      await page.evaluate(() => window.__app.playEndless());
    } else {
      await page.evaluate((id) => window.__app.playLevel(id), scenario);
    }
    await page.waitForFunction(() => window.__app.state !== 'menu' && !window.__app.loading, { timeout: 120000 });
  }
  await sleep(500);
  await shot('02-ready');
  const bot = process.env.BOT === '1';
  await page.keyboard.down('Space');
  if (bot) {
    await page.keyboard.up('Space');
    await page.evaluate(() => {
      let held = false;
      const send = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'ArrowUp' }));
      setInterval(() => {
        const p = window.__game?.manager?.RunState?.PlayerState?.Player;
        if (!p) return;
        const g = p.CollisionChecker.IsFrontGrounded || p.CollisionChecker.IsBackGrounded;
        // hold on the ground; in the air flip until the bike is roughly upright again
        const a = p.transform.eulerZ;
        const want = g || (p.StuntChecker.CurrentAirTime > 0.25 && a > 40 && a < 320 && p.StuntChecker.CurrentAirTime < 2);
        if (want !== held) {
          held = want;
          send(want ? 'keydown' : 'keyup');
        }
      }, 16);
    });
  }
  const N = Number(process.env.SECS || 6);
  for (let i = 0; i < N; i++) {
    await sleep(1000);
    await shot(`03-run-${i}`);
    const st = await page.evaluate(() => {
      const gm = window.__game?.manager;
      const p = gm?.RunState?.PlayerState?.Player;
      if (!p) return { state: window.__app.state };
      const pos = p.transform.position;
      const v = p.Rigidbody2D.velocity;
      return { state: window.__app.state, x: pos.x.toFixed(2), y: pos.y.toFixed(2), vx: v.x.toFixed(2), vy: v.y.toFixed(2), score: gm.RunState.StatTracker?.Score, t: gm.RunState.RunTimer.GetElapsedTime().toFixed(2), end: gm.RunState.RunEndState.endState + ':' + gm.RunState.RunEndState.deathReason, grounded: p.CollisionChecker.IsFrontGrounded + '/' + p.CollisionChecker.IsBackGrounded };
    });
    logs.push(`[state t=${i + 1}s] ${JSON.stringify(st)}`);
    if (!bot && i === 2) await page.keyboard.up('Space');
    if (!bot && i === 3) await page.keyboard.down('Space');
  }
  await page.keyboard.up('Space');
  await sleep(1500);
  await shot('04-end');
} catch (e) {
  failed = true;
  logs.push(`[smoke] ${e.stack || e}`);
  await shot('99-error').catch(() => {});
} finally {
  fs.writeFileSync(path.join(out, 'console.txt'), logs.join('\n'));
  await browser.close();
}
console.log(logs.filter((l) => /error|pageerror|state|smoke|warn/i.test(l)).slice(0, 80).join('\n'));
console.log(failed ? 'SMOKE FAILED' : 'SMOKE OK');
process.exitCode = failed ? 1 : 0;
