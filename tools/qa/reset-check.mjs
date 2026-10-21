// Spawn every chunk with dynamic elements, trigger everything, ResetState() like a revive and diff the poses.
import { boot, dynamicChunks } from './common.mjs';
const list = dynamicChunks();

export default async (h) => {
  await boot(h);
  await h.eval(() => window.__app.playEndless(0));
  await h.wait(() => window.__app.state !== 'menu' && !window.__app.loading, 120000);
  await h.sleep(1000);
  const bad = [];
  const B = Number(process.env.BATCH || 12);
  for (let i = 0; i < list.length; i += B) {
    const batch = list.slice(i, i + B);
    const res = await h.eval(async (batch) => {
      const { loadPrefabDeep, getPrefabJson } = await import('/src/engine/assets.js');
      const { PrefabRef } = await import('/src/engine/instantiate.js');
      const { Destroy } = await import('/src/engine/scene.js');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const rcm = window.__game.manager.RoadChunkManager;
      rcm.currentSpawnPos.y += 400; // far away from the run
      const spawned = [];
      for (const id of batch) {
        try {
          await loadPrefabDeep(id);
          const idx = (getPrefabJson(id).nodes[0].c || []).findIndex((c) => c.$type === 'RiderChunk');
          const c = rcm.SpawnChunks([new PrefabRef(id, [0, idx])])[0];
          rcm.currentSpawnPos.x += 60;
          spawned.push({ id, c });
        } catch (e) {
          spawned.push({ id, err: String(e) });
        }
      }
      await sleep(300);
      const snap = (c) => {
        const out = new Map();
        const objs = new Set([...c.GetComponentsInChildren('RoadPiece', true), ...c.GetComponentsInChildren('Rigidbody2D', true), ...c.GetComponentsInChildren('DynamicChunkElement', true)]);
        for (const o of objs) {
          const t = o.transform;
          const key = t.gameObject.name + '#' + t.gameObject._id;
          out.set(t.gameObject, { name: t.gameObject.name, x: t.position.x, y: t.position.y, a: t.eulerZ, active: t.gameObject.activeInHierarchy, en: o.meshRenderer ? o.meshRenderer.enabled : null });
        }
        return out;
      };
      for (const s of spawned) if (s.c) s.before = snap(s.c);
      for (const s of spawned) {
        if (!s.c) continue;
        try {
          for (const t of s.c.GetComponentsInChildren('FeedbackTrigger', true)) t.HandleInteraction(null);
          for (const r of s.c.GetComponentsInChildren('RoadPiece', true)) {
            if (r.activation === 0) {
              r.HandleGravityOnCollision();
              if (r.UsesAnimation) r.HandleAnimation();
            }
          }
        } catch (e) {
          s.trigErr = String(e);
        }
      }
      await sleep(3500);
      for (const s of spawned) if (s.c) s.mid = snap(s.c);
      for (const s of spawned) if (s.c) s.c.ResetState();
      await sleep(700);
      const report = [];
      for (const s of spawned) {
        if (!s.c) {
          report.push({ id: s.id, err: s.err });
          continue;
        }
        const after = snap(s.c);
        const diffs = [];
        let moved = 0;
        for (const [go, b] of s.before) {
          const a = after.get(go);
          const m = s.mid.get(go);
          if (m && (Math.hypot(m.x - b.x, m.y - b.y) > 0.05 || Math.abs(((m.a - b.a + 540) % 360) - 180) > 0.5)) moved++;
          if (!a) continue;
          const dp = Math.hypot(a.x - b.x, a.y - b.y);
          const da = Math.abs(((a.a - b.a + 540) % 360) - 180);
          if (dp > 0.05 || da > 0.5 || a.active !== b.active || a.en !== b.en) diffs.push(`${b.name}: d=${dp.toFixed(2)} da=${da.toFixed(1)} act ${b.active}->${a.active} ren ${b.en}->${a.en}`);
        }
        report.push({ id: s.id, moved, diffs, trigErr: s.trigErr });
        Destroy(s.c.gameObject);
      }
      return report;
    }, batch);
    for (const r of res) {
      const line = `${r.id} moved=${r.moved ?? '-'} ${r.err ? 'ERR ' + r.err : ''}${r.trigErr ? ' TRIGERR ' + r.trigErr : ''}${r.diffs?.length ? '\n    ' + r.diffs.join('\n    ') : ''}`;
      console.log(line);
      if (r.err || r.diffs?.length) bad.push(line);
    }
  }
  console.log('==== NOT RESET ====\n' + bad.join('\n'));
};
