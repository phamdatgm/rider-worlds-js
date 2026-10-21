// Bot-play endless in each world, accept every revive, and check chunk elements at each respawn.
import { boot, sampler } from './common.mjs';
const WORLDS = (process.env.WORLDS || '0,1,2').split(',').map(Number);
const SECS = Number(process.env.SECS || 90);

export default async (h) => {
  await boot(h);
  for (const w of WORLDS) {
    if ((await h.eval(() => window.__app.state)) !== 'menu') {
      await h.page.reload();
      await h.wait(() => window.__app && window.__game?.manager && !window.__app.loading && window.__app.state === 'menu', 180000);
      await h.sleep(1000);
    }
    await h.eval((w) => window.__app.playEndless(w), w);
    await h.wait(() => window.__app.state !== 'menu' && !window.__app.loading, 120000);
    await h.sleep(500);
    await h.eval(() => {
      window.__reviveChecks = [];
      const rs = window.__game.manager.RunState;
      const check = (chunk, tag) => {
        const bad = [];
        if (!chunk) return bad;
        for (const e of chunk.chunkElements || []) {
          if (!e || e._destroyed) continue;
          const t = e.transform;
          const name = `${tag}:${chunk.name}/${e.gameObject.name}`;
          if (e.originalPosition && t.localPosition.distanceTo(e.originalPosition) > 0.05) bad.push(`${name} pos off ${t.localPosition.distanceTo(e.originalPosition).toFixed(2)}`);
          if (e.originalRotation && t.localRotation.angleTo(e.originalRotation) > 0.01) bad.push(`${name} rot off ${((t.localRotation.angleTo(e.originalRotation) * 180) / Math.PI).toFixed(1)}`);
          if (e.isAnimationTriggered) bad.push(`${name} still animation-triggered`);
          if (e.triggeredGravity) bad.push(`${name} still gravity-triggered`);
          if (e.isGlassBroken) bad.push(`${name} glass still broken`);
        }
        return bad;
      };
      rs.runRespawnPlayer.AddListener(() => {
        const rcm = window.__game.manager.RoadChunkManager;
        // the deferred checks run after the respawn frame so pending kinematic moves are applied
        setTimeout(() => {
          const cur = check(rcm.CurrentChunk, 'cur');
          const next = check(rcm.PeekNextChunk, 'next');
          window.__reviveChecks.push({ chunk: rcm.CurrentChunk?.name, cur, next });
        }, 50);
      });
    });
    await h.bot(true);
    let revives = 0, maxX = -1e9, errs = [], gameOver = false;
    const t0 = Date.now();
    while (Date.now() - t0 < SECS * 1000) {
      await h.sleep(500);
      // revive prompt: accept as if the rewarded video succeeded
      const accepted = await h.eval(async () => {
        const { World } = await import('/src/engine/scene.js');
        const ui = [...World.behaviours].find((b) => typeof b.OnAcceptAd === 'function' && b.gameObject.activeInHierarchy && b.callback);
        if (!ui) return false;
        ui.chosenPayment = ui.adPayDefinition;
        ui.StopTimer?.();
        ui.HandlePaymentResponse(2);
        return true;
      });
      if (accepted) revives++;
      const s = await sampler(h);
      errs.push(...s.errs);
      if (s.x !== undefined) maxX = Math.max(maxX, s.x);
      if (s.state === 'menu' || (s.end === 2 && !accepted && (await h.eval(() => !window.__game.manager.RunState.IsInRun)))) {
        gameOver = true;
        break;
      }
    }
    await h.bot(false);
    const checks = await h.eval(() => window.__reviveChecks);
    console.log(`World ${w + 1}: revives=${revives} respawns=${checks.length} maxX=${maxX.toFixed(1)} gameOver=${gameOver} errs=${errs.length}`);
    for (const c of checks) if (c.cur.length || c.next.length) console.log(`   respawn in ${c.chunk}:\n      ` + [...c.cur, ...c.next].join('\n      '));
    for (const e of [...new Set(errs)].slice(0, 8)) console.log('   ERR ' + e);
    await h.shot(`endless-w${w + 1}`);
    // leave the run
    await h.page.reload();
    await h.wait(() => window.__app && window.__game?.manager && !window.__app.loading, 180000);
    await h.sleep(1000);
  }
};
