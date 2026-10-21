// Shared helpers for the QA scenarios (run them with: node tools/scenario.mjs tools/qa/<name>.mjs <outDir>).
import fs from 'node:fs';
import path from 'node:path';

/** Reload with console/error capture, then make sure the app sits in the menu with every tutorial skipped. */
export async function boot(h) {
  await h.page.evaluateOnNewDocument(() => {
    window.__errs = [];
    const ce = console.error;
    console.error = (...a) => {
      window.__errs.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 400));
      ce.apply(console, a);
    };
    window.addEventListener('error', (e) => window.__errs.push('onerror ' + (e.error?.stack || e.message).slice(0, 400)));
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection ' + String(e.reason?.stack || e.reason).slice(0, 400)));
  });
  await h.page.reload();
  await h.wait(() => window.__app && window.__game?.manager && !window.__app.loading, 180000);
  await h.sleep(1500);
  if ((await h.eval(() => window.__app.state)) !== 'menu') {
    await h.eval(async () => {
      const { Tutorials } = await import('/src/meta/tutorials.js');
      const { Save } = await import('/src/meta/save.js');
      Save.data.tutorials ||= {};
      for (const t of Tutorials.all) Save.data.tutorials[t.SaveName] = 2;
      Save.save();
    });
    await h.page.reload();
    await h.wait(() => window.__app && window.__game?.manager && !window.__app.loading && window.__app.state === 'menu', 180000);
    await h.sleep(1000);
  }
}

/** Player / run snapshot plus the console errors collected since the last call. */
export function sampler(h) {
  return h.eval(() => {
    const gm = window.__game?.manager;
    const rs = gm?.RunState;
    const p = rs?.PlayerState?.Player;
    const out = { state: window.__app.state, loading: window.__app.loading, errs: window.__errs.splice(0) };
    if (p) {
      const pos = p.transform.position;
      Object.assign(out, { x: pos.x, y: pos.y, end: rs.RunEndState.endState, reason: rs.RunEndState.deathReason, t: rs.RunTimer?.GetElapsedTime?.() });
    }
    return out;
  });
}

/** Chunk / level prefabs that hold dynamic elements (moving road pieces, triggers, gravity fields). */
export function dynamicChunks(filter = process.env.ONLY) {
  const dir = 'public/assets/prefabs/GameObject';
  const out = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const nodes = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).nodes;
    if (!(nodes[0].c || []).some((c) => c.$type === 'RiderChunk')) continue;
    const dyn = nodes.some((n) =>
      (n.c || []).some((c) => (c.$type === 'RoadPiece' && [1, 2, 4, 5].includes(c.type)) || ['FeedbackTrigger', 'GravityModifier', 'GravityModifierSwitch'].includes(c.$type)),
    );
    if (dyn) out.push('GameObject/' + f.slice(0, -5));
  }
  const only = filter ? filter.split(',') : null;
  return only ? out.filter((c) => only.some((o) => c.includes(o))) : out;
}
