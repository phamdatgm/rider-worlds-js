// src/legacy-save.js check: node tools/qa/legacy-save.mjs
// Writes a JS_SDK_2.0 save (plain JSON at azgames.g2610211044) and a pre-SDK key, boots the dev page and checks that
// the kit's save (gm1 format) holds the old progress and the old keys are gone. Exits 1 when it does not.
import { launchBrowser } from '../browser.mjs';

const url = process.env.URL || 'http://localhost:5173/?preroll=0';
const KEY = 'azgames.g2610211044';
const old = {
  v: 1,
  save: { version: 2, currency: { soft: 12345, hard: 77, star: 3, bonus: 0 }, runs: { total: 9, endless: 9 }, tutorials: { FTUE_FirstRun: 1 } },
  sdk: { name: 'Old_Player', country: 'VN' },
};

const browser = await launchBrowser({ defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
  if (!cond) ok = false;
};
page.on('pageerror', (e) => {
  ok = false;
  console.log(`[pageerror] ${e.message}`);
});
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (key, data) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('rider-worlds-save-v2', JSON.stringify({ version: 2, currency: { soft: 1 } }));
    },
    KEY,
    old,
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__app && window.__game?.manager && !window.__app.loading, { timeout: 180000 });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await page.evaluate((key) => ({
    raw: localStorage.getItem(key)?.slice(0, 3),
    v2: localStorage.getItem('rider-worlds-save-v2'),
    dump: window.gmSave.dump(),
    soft: window.__save.data.currency.soft,
    state: window.__app.state,
  }), KEY);
  check('stored in the kit format (gm1)', r.raw === 'gm1');
  // the test save has no rank data, so the game adds its starting gems / rubies on top
  check('soft currency kept', r.soft >= 12345);
  check('hard currency kept', r.dump.save?.currency?.hard >= 77);
  check('name / flag moved to the leaderboard area', r.dump.leaderboard?.name === 'Old_Player' && r.dump.leaderboard?.country === 'VN');
  check('pre-SDK key removed', r.v2 === null);
  check('tutorial finished: boots into the menu', r.state === 'menu');
} catch (e) {
  ok = false;
  console.log(`[fail] ${e.message}`);
}
await browser.close();
process.exit(ok ? 0 : 1);
