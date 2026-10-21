// Trigger every animated road piece and sample its pose each frame; report sudden jumps (snaps) in the timeline.
import { boot, dynamicChunks } from './common.mjs';
const list = dynamicChunks();

export default async (h) => {
  await boot(h);
  await h.eval(() => window.__app.playEndless(0));
  await h.wait(() => window.__app.state !== 'menu' && !window.__app.loading, 120000);
  await h.sleep(1000);
  const B = 10;
  for (let i = 0; i < list.length; i += B) {
    const res = await h.eval(async (batch) => {
      const { loadPrefabDeep, getPrefabJson } = await import('/src/engine/assets.js');
      const { PrefabRef } = await import('/src/engine/instantiate.js');
      const { Destroy } = await import('/src/engine/scene.js');
      const rcm = window.__game.manager.RoadChunkManager;
      rcm.currentSpawnPos.y += 400;
      const spawned = [];
      for (const id of batch) {
        await loadPrefabDeep(id);
        const idx = (getPrefabJson(id).nodes[0].c || []).findIndex((c) => c.$type === 'RiderChunk');
        const c = rcm.SpawnChunks([new PrefabRef(id, [0, idx])])[0];
        rcm.currentSpawnPos.x += 60;
        const pieces = c.GetComponentsInChildren('RoadPiece', true).filter((r) => r.animationFeedback);
        spawned.push({ id, c, pieces, tl: pieces.map(() => []) });
      }
      await new Promise((r) => setTimeout(r, 300));
      for (const s of spawned) {
        for (const t of s.c.GetComponentsInChildren('FeedbackTrigger', true)) t.HandleInteraction(null);
        for (const r of s.pieces) if (r.activation === 0) r.HandleAnimation();
      }
      const t0 = performance.now();
      await new Promise((resolve) => {
        const step = () => {
          const t = performance.now() - t0;
          for (const s of spawned)
            s.pieces.forEach((r, k) => {
              const tr = r.transform;
              s.tl[k].push([t, tr.position.x, tr.position.y, tr.eulerZ]);
            });
          if (t < 7000) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      const report = [];
      for (const s of spawned) {
        s.pieces.forEach((r, k) => {
          const tl = s.tl[k];
          const jumps = [];
          for (let j = 1; j < tl.length; j++) {
            const [t, x, y, a] = tl[j];
            const [, px, py, pa] = tl[j - 1];
            const da = Math.abs(((a - pa + 540) % 360) - 180);
            const dp = Math.hypot(x - px, y - py);
            if (da > 45) jumps.push(`t=${(t / 1000).toFixed(2)}s da=${da.toFixed(0)} dp=${dp.toFixed(2)}`);
          }
          const first = tl[0], last = tl[tl.length - 1];
          const back = Math.abs(((last[3] - first[3] + 540) % 360) - 180) < 1 && Math.hypot(last[1] - first[1], last[2] - first[2]) < 0.05;
          const moved = tl.some((p) => Math.abs(((p[3] - first[3] + 540) % 360) - 180) > 1 || Math.hypot(p[1] - first[1], p[2] - first[2]) > 0.05);
          if (jumps.length) report.push({ id: s.id, piece: r.gameObject.name, resetDelay: r.animationResetDelay, once: r.animateOnce, moved, endsAtStart: back, jumps: jumps.slice(0, 4) });
        });
        Destroy(s.c.gameObject);
      }
      return report;
    }, list.slice(i, i + B));
    for (const r of res) console.log('JERK ' + JSON.stringify(r));
  }
  console.log('DONE');
};
