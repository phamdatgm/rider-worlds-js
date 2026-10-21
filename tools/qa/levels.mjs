// Bot-play timed levels: record errors, deaths (auto-revive restarts), victory and stalls per level.
// LEVELS=<substring list> to filter, SECS=<seconds per level>.
import fs from 'node:fs';
import { boot, sampler } from './common.mjs';
const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
const F = process.env.LEVELS ? process.env.LEVELS.split(',') : null;
const levels = manifest.levels.filter((l) => !F || F.some((f) => l.id.includes(f)));
const SECS = Number(process.env.SECS || 35);

export default async (h) => {
  await boot(h);
  const summary = [];
  for (const l of levels) {
    await h.eval((id) => window.__app.playLevel(id), l.id);
    try {
      await h.wait(() => window.__app.state !== 'menu' && !window.__app.loading, 60000);
    } catch {
      summary.push(`${l.name}: did not start`);
      continue;
    }
    await h.sleep(500);
    await h.bot(true);
    let maxX = -1e9, deaths = 0, lastEnd = 0, victory = false, errs = [], stall = 0, lastX = null, maxStall = 0, minY = 1e9;
    const t0 = Date.now();
    while (Date.now() - t0 < SECS * 1000) {
      await h.sleep(500);
      const s = await sampler(h);
      errs.push(...s.errs);
      if (s.x !== undefined) {
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        if (lastX !== null && Math.abs(s.x - lastX) < 0.05 && s.end === 0) stall += 0.5;
        else stall = 0;
        maxStall = Math.max(maxStall, stall);
        lastX = s.x;
        if (s.end === 2 && lastEnd !== 2) deaths++;
        if (s.end === 1) victory = true;
        lastEnd = s.end;
      }
      if (victory) break;
    }
    await h.bot(false);
    const line = `${l.name} (${l.chunks[0]}): ${victory ? 'VICTORY' : 'no finish'} deaths=${deaths} maxX=${maxX.toFixed(1)} minY=${minY.toFixed(1)} maxStall=${maxStall}s errs=${errs.length}`;
    console.log(line);
    for (const e of [...new Set(errs)].slice(0, 5)) console.log('   ERR ' + e);
    summary.push(line + (errs.length ? '\n   ' + [...new Set(errs)].slice(0, 3).join('\n   ') : ''));
    if (maxStall >= 3 || errs.length) await h.shot(l.name.replace(/\W+/g, '_'));
  }
  console.log('==== SUMMARY ====\n' + summary.join('\n'));
};
