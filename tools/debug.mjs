// node tools/debug.mjs "<js expression evaluated after starting scenario>" [scenario]
import { launchBrowser } from './browser.mjs';
const expr = process.argv[2];
const scenario = process.argv[3] || 'endless';
const browser = await launchBrowser();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log(`[${m.type()}]`, m.text()); });
await page.goto('http://localhost:5173/?preroll=0');
await page.waitForFunction(() => window.__app && window.__app.state === 'menu', { timeout: 180000 });
if (scenario === 'endless') await page.evaluate(() => window.__app.playEndless(0));
else await page.evaluate((id) => window.__app.playLevel(id), scenario);
await page.waitForFunction(() => ['ready', 'running'].includes(window.__app.state), { timeout: 120000 });
await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 200)));
console.log(await page.evaluate(expr));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
