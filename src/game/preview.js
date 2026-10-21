// VehicleMovingPreview subclasses (garage): loop the car visuals along a path and play the landing,
// explosion or trail effect of the selected card on the menu player.
import * as THREE from 'three';
import { Time } from '../engine/core.js';
import { Destroy } from '../engine/scene.js';
import { quatZ } from '../engine/math.js';
import { Instantiate, PrefabRef } from '../engine/instantiate.js';
import { getPrefabJson } from '../engine/assets.js';
import { Game } from './state.js';

const easeIn = (t) => t * t; // AnimationCurve (0,0,slope 0) -> (1,1,slope 2)
const linear = (t) => t;

function lerpAngle(a, b, t) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a + d * t;
}

const PREVIEWS = {
  landing: { start: [-3.5, 6], target: [0, 0], a0: -275, a1: 0, duration: 0.425, curve: easeIn, repeatDelay: 1.5 },
  death: { start: [-2.5, 8], target: [0, 0], a0: 120, a1: 215, duration: 0.5, curve: easeIn, repeatDelay: 2 },
  trail: { start: [-8, 0], target: [12, 0], a0: 0, a1: 0, duration: 1.6, curve: linear, repeatDelay: 1 },
};

function typedRef(id, type) {
  const json = getPrefabJson(id);
  const idx = json ? (json.nodes[0].c || []).findIndex((c) => c.$type === type) : -1;
  return json ? new PrefabRef(id, idx >= 0 ? [0, idx] : undefined) : null;
}

export const VehiclePreview = {
  co: null,
  kind: null,
  player: null,
  spawned: [],

  setLocal(pos, angle) {
    const cv = this.player?.CarVisuals;
    if (!cv || cv.gameObject._destroyed) return;
    const base = cv._localPosition || new THREE.Vector3();
    cv.transform.localPosition = new THREE.Vector3(pos[0] + base.x, pos[1] + base.y, base.z);
    cv.transform.localRotation = quatZ(angle, new THREE.Quaternion());
  },

  start(kind) {
    this.stop();
    const gm = Game.manager;
    const player = gm?.player;
    if (!player || !PREVIEWS[kind]) return;
    this.player = player;
    this.kind = kind;
    const cfg = PREVIEWS[kind];
    const self = this;
    if (kind === 'trail') player.TrailEffect?.Show?.(true);
    this.co = gm.StartCoroutine((function* () {
      for (;;) {
        self.setLocal(cfg.start, cfg.a0);
        self.onStartFall();
        let t = 0;
        while (t < 1) {
          yield null;
          t += Time.deltaTime / cfg.duration;
          const v = cfg.curve(Math.min(t, 1));
          self.setLocal([cfg.start[0] + (cfg.target[0] - cfg.start[0]) * v, cfg.start[1] + (cfg.target[1] - cfg.start[1]) * v], lerpAngle(cfg.a0, cfg.a1, Math.min(t, 1)));
        }
        self.setLocal(cfg.target, cfg.a1);
        self.onEndFall();
        let w = 0;
        while (w < cfg.repeatDelay) {
          yield null;
          w += Time.deltaTime;
        }
      }
    })());
  },

  onStartFall() {
    if (this.kind === 'death') {
      this.clearSpawned();
      this.player.CarVisuals?.gameObject.SetActive(true);
    }
  },

  onEndFall() {
    const p = this.player;
    if (this.kind === 'landing') p.PerfectLandingEffect?.PlayLandingParticle();
    else if (this.kind === 'death') {
      const pos = p.CarVisuals.transform.position.clone();
      const c = Game.cards;
      const item = c?.death?.items[Math.min(c.deathRank, c.death.items.length - 1)];
      try {
        const ex = typedRef('GameObject/Player Explosion', 'PlayerExplosion');
        if (ex) this.spawned.push(Instantiate(ex, pos, p.CarVisuals.transform.rotation).gameObject);
        if (item) {
          const ps = Instantiate(item, pos, new THREE.Quaternion());
          ps.Play?.();
          this.spawned.push(ps.gameObject);
        }
      } catch (e) {
        console.warn('death preview', e.message);
      }
      p.CarVisuals.gameObject.SetActive(false);
    }
  },

  clearSpawned() {
    for (const g of this.spawned) if (g && !g._destroyed) Destroy(g);
    this.spawned = [];
  },

  stop() {
    if (this.co) Game.manager?.StopCoroutine(this.co);
    this.co = null;
    this.clearSpawned();
    const p = this.player;
    if (p && !p.gameObject._destroyed) {
      p.CarVisuals?.gameObject.SetActive(true);
      this.setLocal([0, 0], 0);
      if (this.kind === 'trail') p.TrailEffect?.Show?.(false);
    }
    this.kind = null;
  },
};
