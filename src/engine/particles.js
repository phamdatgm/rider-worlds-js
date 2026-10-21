// A compact CPU implementation of Unity's Shuriken ParticleSystem covering the modules the game uses:
// main (lifetime/speed/size/color/rotation/gravity, 3D size/rotation), emission (rate over time/distance, bursts),
// shape (sphere/hemisphere/cone/box/circle/edge), velocity/force/size/color/rotation over lifetime,
// limit velocity (+ drag), noise, texture sheet animation and trails (per particle and ribbon).
// Particles are camera-facing quads in the XY plane (the gameplay camera never rotates).
import * as THREE from 'three';
import { Behaviour, Destroy, World } from './scene.js';
import { Time } from './core.js';
import { Mathf, AnimationCurve, Gradient, Deg2Rad } from './math.js';
import { getMaterial, Render } from './render.js';
import { getGeometry } from './assets.js';

const MAX_PARTICLES = 256;
const rnd = Math.random;

export function evalCurve(mmc, t = 0, r = rnd()) {
  if (mmc === undefined || mmc === null) return 0;
  if (typeof mmc === 'number') return mmc;
  const s = mmc.scalar ?? 0;
  switch (mmc.minMaxState) {
    case 1:
      return (mmc.maxCurve instanceof AnimationCurve && mmc.maxCurve.length ? mmc.maxCurve.Evaluate(t) : 1) * s;
    case 2: {
      const a = mmc.minCurve instanceof AnimationCurve && mmc.minCurve.length ? mmc.minCurve.Evaluate(t) : 0;
      const b = mmc.maxCurve instanceof AnimationCurve && mmc.maxCurve.length ? mmc.maxCurve.Evaluate(t) : 1;
      return (a + (b - a) * r) * s;
    }
    case 3:
      return (mmc.minScalar ?? 0) + (s - (mmc.minScalar ?? 0)) * r;
    default:
      return s;
  }
}

const _c = [0, 0, 0, 0];
export function evalGradient(g, t = 0, r = rnd(), out = [1, 1, 1, 1]) {
  if (!g) {
    out[0] = out[1] = out[2] = out[3] = 1;
    return out;
  }
  const lerp4 = (a, b, f) => {
    for (let i = 0; i < 4; i++) out[i] = a[i] + (b[i] - a[i]) * f;
    return out;
  };
  switch (g.minMaxState) {
    case 1:
      return g.maxGradient instanceof Gradient ? g.maxGradient.Evaluate(t, out) : out.fill(1);
    case 2:
      return lerp4(g.minColor || [1, 1, 1, 1], g.maxColor || [1, 1, 1, 1], r);
    case 3: {
      const a = (g.minGradient instanceof Gradient ? g.minGradient.Evaluate(t, [0, 0, 0, 0]) : [1, 1, 1, 1]).slice();
      const b = g.maxGradient instanceof Gradient ? g.maxGradient.Evaluate(t, _c).slice() : [1, 1, 1, 1];
      return lerp4(a, b, r);
    }
    case 4:
      return g.maxGradient instanceof Gradient ? g.maxGradient.Evaluate(r, out) : out.fill(1);
    default: {
      const c = g.maxColor || [1, 1, 1, 1];
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      out[3] = c[3];
      return out;
    }
  }
}

// smooth value noise in [-1, 1] (NoiseModule stand-in for Unity's curl/perlin noise)
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const fx = s(x - xi);
  const fy = s(y - yi);
  const fz = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = l(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = l(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = l(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = l(c(0, 1, 1), c(1, 1, 1), fx);
  return l(l(x00, x10, fy), l(x01, x11, fy), fz) * 2 - 1;
}

function noise3(x, y, z, octaves, nm) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, z * f) * amp;
    norm += amp;
    amp *= nm.octaveMultiplier ?? 0.5;
    f *= nm.octaveScale ?? 2;
  }
  return sum / norm;
}

/** TextureSheetAnimation (grid mode): uv rect [u0, v0, u1, v1] of a particle's current tile, or null */
export function sheetUV(ps, q) {
  const uvm = ps.d?.UVModule;
  if (!uvm?.enabled || uvm.mode !== 0) return null;
  const tx = uvm.tilesX || 1;
  const ty = uvm.tilesY || 1;
  const n = tx * ty;
  // startFrame is normalized over the whole sheet (TextureSheetAnimationModule.startFrame)
  const f = (q.frame || 0) + evalCurve(uvm.frameOverTime, q.age / q.life, q.rr) * (uvm.cycles || 1);
  const i = Math.min(n - 1, Math.max(0, Math.floor((f % 1) * n + 1e-4)));
  const col = i % tx;
  const row = Math.floor(i / tx);
  return [col / tx, 1 - (row + 1) / ty, (col + 1) / tx, 1 - row / ty];
}

export class ParticleSystem extends Behaviour {
  static typeName = 'ParticleSystem';

  constructor() {
    super();
    this.particles = [];
    this.playing = false;
    this.paused = false;
    this.time = 0;
    this.emitAcc = 0;
    this.distAcc = 0;
    this.burstState = [];
    this.mesh = null;
    this.colorOverride = null;
    this.startColorOverride = null;
    this.rateOverride = null;
  }

  static fromData(ps, d) {
    ps._enabled = true;
    ps.d = d;
    const im = d.InitialModule || {};
    ps.main = im;
    ps.duration = d.lengthInSec ?? 5;
    ps.looping = !!d.looping;
    ps.playOnAwake = d.playOnAwake !== 0;
    ps.worldSpace = (d.moveWithTransform ?? 0) === 1;
    ps.stopAction = d.stopAction || 0;
    ps.scalingMode = d.scalingMode ?? 1; // 0 Hierarchy, 1 Local, 2 Shape
    ps.maxParticles = Math.min(im.maxNumParticles ?? 1000, MAX_PARTICLES);
  }

  get isPlaying() {
    return this.playing && !this.paused;
  }

  get particleCount() {
    return this.particles.length;
  }

  get renderer() {
    return this.GetComponent('ParticleSystemRenderer');
  }

  _activate() {
    if (this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = true;
    // systems inside a canvas are drawn by the UI (UIParticle), never in the 3D scene
    if (this._ui === undefined) this._ui = !!this.gameObject.GetComponentInParent('Canvas');
    World.behaviours.add(this);
    if (this.playOnAwake && !this.playing) this.PlaySelf();
  }

  _deactivate() {
    if (!this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = false;
    World.behaviours.delete(this);
    this.particles.length = 0;
    this.orphans = null;
    this.playing = false;
    if (this.mesh) this.mesh.visible = false;
    if (this.trailMesh) this.trailMesh.visible = false;
  }

  _destroy() {
    this._deactivate();
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.trailMesh) {
      this.trailMesh.removeFromParent();
      this.trailMesh.geometry.dispose();
      this.trailMesh = null;
    }
  }

  _systems(withChildren) {
    return withChildren ? this.gameObject.GetComponentsInChildren(ParticleSystem, true) : [this];
  }

  PlaySelf() {
    // Play() on a paused system resumes it (time is kept)
    if (!this.playing) {
      this.time = 0;
      this.emitAcc = 0;
      this.burstState = (this.d.EmissionModule?.m_Bursts || []).map(() => ({ cycles: 0, next: 0 }));
      this.delay = evalCurve(this.d.startDelay);
      this.lastPos = this.transform.position;
    }
    this.playing = true;
    this.paused = false;
  }

  Play(withChildren = true) {
    for (const s of this._systems(withChildren)) if (s.gameObject.activeInHierarchy) s.PlaySelf();
  }

  Stop(withChildren = true, clear = false) {
    for (const s of this._systems(withChildren)) {
      s.playing = false;
      s.paused = false;
      if (clear) {
        s.particles.length = 0;
        s.orphans = null;
      }
    }
  }

  Pause(withChildren = true) {
    for (const s of this._systems(withChildren)) s.paused = true;
  }

  Clear(withChildren = true) {
    for (const s of this._systems(withChildren)) {
      s.particles.length = 0;
      s.orphans = null;
    }
  }

  Emit(n) {
    for (let i = 0; i < n; i++) this._spawn();
  }

  /** helpers used by the ported game scripts instead of module structs */
  SetColors(startColor, colorOverLifetime) {
    this.startColorOverride = startColor || null;
    this.colorOverride = colorOverLifetime || null;
  }

  SetColorOverLifetime(g) {
    this.colorOverride = g;
  }

  SetEmissionRate(r) {
    this.rateOverride = r;
  }

  /** Particle space -> world: position/rotation of the transform, scale according to scalingMode. */
  _simMatrix(out = new THREE.Matrix4()) {
    const tr = this.transform;
    tr.updateWorld();
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const lossy = new THREE.Vector3();
    tr.obj.matrixWorld.decompose(pos, rot, lossy);
    const sc = this.scalingMode === 0 ? lossy : this.scalingMode === 1 ? tr.obj.scale.clone() : new THREE.Vector3(1, 1, 1);
    return out.compose(pos, rot, sc);
  }

  // ---- simulation
  Update() {
    const dt = this.d.useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
    if (this.paused) return this._render();
    const sim = dt * (this.d.simulationSpeed ?? 1);
    // step the live particles first: new ones are only aged by their sub-frame time (see _emit)
    this._integrate(sim);
    if (this.playing) {
      if (this.delay > 0) this.delay -= sim;
      else this._emit(sim);
    }
    if (!this.playing && this.particles.length === 0 && this._wasAlive) {
      this._wasAlive = false;
      if (this.stopAction === 2) Destroy(this.gameObject);
      else if (this.stopAction === 1) this.gameObject.SetActive(false);
    }
    this._render();
  }

  _emit(dt) {
    const em = this.d.EmissionModule || {};
    this.time += dt;
    const norm = Mathf.Clamp01(this.time / this.duration);
    const pos = this.transform.position;
    const prev = this.lastPos || pos;
    this.lastPos = pos;
    if (em.enabled) {
      const rate = this.rateOverride ?? evalCurve(em.rateOverTime, norm, 0.5);
      this.emitAcc += rate * dt;
      const distRate = evalCurve(em.rateOverDistance, norm, 0.5);
      if (distRate > 0) this.distAcc += pos.distanceTo(prev) * distRate;
      const n = Math.floor(this.emitAcc) + Math.floor(this.distAcc);
      this.emitAcc -= Math.floor(this.emitAcc);
      this.distAcc -= Math.floor(this.distAcc);
      // continuous emission is spread over the frame like Unity: world-space particles are placed along the path
      // the emitter travelled and pre-aged by their sub-frame time, so trails/ribbons stay continuous at any fps
      const back = this.worldSpace ? _back.subVectors(prev, pos) : null;
      for (let i = 0; i < n; i++) {
        const lag = 1 - (i + 1) / n; // 0 = emitted at the end of the frame
        this._spawn(norm, back, lag, dt);
      }
      let nb = 0;
      (em.m_Bursts || []).forEach((b, i) => {
        const st = this.burstState[i];
        const cycles = b.cycleCount || 1;
        const interval = b.repeatInterval || 0.01;
        while (st.cycles < cycles && this.time >= (b.time || 0) + st.cycles * interval) {
          if (rnd() <= (b.probability ?? 1)) nb += Math.round(evalCurve(b.countCurve ?? { scalar: b.minCount ?? 30 }));
          st.cycles++;
        }
      });
      for (let i = 0; i < nb; i++) this._spawn(norm);
    }
    if (this.time >= this.duration) {
      if (this.looping) {
        this.time -= this.duration;
        this.burstState.forEach((s) => (s.cycles = 0));
      } else this.playing = false;
    }
  }

  _shapePoint() {
    const sh = this.d.ShapeModule || {};
    const p = new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0, -1); // Unity local +Z
    if (!sh.enabled) return { p, dir: new THREE.Vector3(0, 0, -1) };
    const radius = sh.radius?.value ?? 1;
    const rt = sh.radiusThickness ?? 1;
    const r = radius * (1 - rt * rnd());
    const randDir = () => new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
    switch (sh.type) {
      case 0:
      case 1: {
        const d = randDir();
        p.copy(d).multiplyScalar(sh.type === 1 ? radius : r);
        dir.copy(d);
        break;
      }
      case 2:
      case 3: {
        const d = randDir();
        if (d.z > 0) d.z = -d.z;
        p.copy(d).multiplyScalar(sh.type === 3 ? radius : r);
        dir.copy(d);
        break;
      }
      case 4:
      case 7:
      case 8:
      case 9: {
        const a = (sh.arc?.value ?? 360) * Deg2Rad * rnd();
        const rr = sh.type === 7 || sh.type === 9 ? radius : r;
        p.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
        const ang = (sh.angle ?? 25) * Deg2Rad;
        const spread = Math.tan(ang) * (rr / Math.max(radius, 1e-5));
        dir.set(Math.cos(a) * spread, Math.sin(a) * spread, -1).normalize();
        break;
      }
      case 5:
      case 15:
      case 16:
        p.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
        dir.set(0, 0, -1);
        break;
      case 10:
      case 11: {
        const a = (sh.arc?.value ?? 360) * Deg2Rad * rnd();
        const rr = sh.type === 11 ? radius : r;
        p.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
        dir.set(Math.cos(a), Math.sin(a), 0);
        break;
      }
      case 12:
        p.set((rnd() * 2 - 1) * radius, 0, 0);
        dir.set(0, 1, 0);
        break;
      case 18:
        p.set(rnd() - 0.5, rnd() - 0.5, 0);
        dir.set(0, 0, -1);
        break;
      default: {
        const d = randDir();
        p.copy(d).multiplyScalar(r);
        dir.copy(d);
      }
    }
    // shape transform (Unity values -> mirrored space)
    const sp = sh.m_Position || [0, 0, 0];
    const sr = sh.m_Rotation || [0, 0, 0];
    const ss = sh.m_Scale || [1, 1, 1];
    p.multiply(new THREE.Vector3(ss[0], ss[1], ss[2]));
    if (sr[0] || sr[1] || sr[2]) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-sr[0] * Deg2Rad, -sr[1] * Deg2Rad, sr[2] * Deg2Rad, 'YXZ'));
      p.applyQuaternion(q);
      dir.applyQuaternion(q);
    }
    p.add(new THREE.Vector3(sp[0], sp[1], -sp[2]));
    if (sh.randomDirectionAmount) dir.lerp(randDir(), sh.randomDirectionAmount).normalize();
    return { p, dir };
  }

  _spawn(norm = 0, back = null, lag = 0, dt = 0) {
    if (this.particles.length >= this.maxParticles) return;
    const m = this.main;
    const life = Math.max(evalCurve(m.startLifetime, norm), 0.01);
    const speed = evalCurve(m.startSpeed, norm);
    const size = evalCurve(m.startSize, norm);
    const color = evalGradient(this.startColorOverride || m.startColor, norm, rnd(), [1, 1, 1, 1]).slice();
    const { p, dir } = this._shapePoint();
    const vel = dir.multiplyScalar(speed);
    if (this.worldSpace) {
      p.applyMatrix4(this._simMatrix());
      vel.applyQuaternion(this.transform.rotation);
    }
    const rad = (c) => evalCurve(c) * (c?.scalar > 7 ? Deg2Rad : 1);
    const tm = this.d.TrailModule;
    const q = {
      p,
      v: vel,
      vt: vel.clone(), // total velocity of the last step (stretched billboards)
      age: 0,
      life,
      size,
      // InitialModule.size3D: per-axis start size (startSize is X)
      sy: m.size3D ? evalCurve(m.startSizeY, norm) : size,
      sz: m.size3D ? evalCurve(m.startSizeZ, norm) : size,
      color,
      rot: rad(m.startRotation),
      rx: m.rotation3D ? rad(m.startRotationX) : 0,
      ry: m.rotation3D ? rad(m.startRotationY) : 0,
      rr: rnd(),
      rf: [rnd(), rnd(), rnd()], // ForceModule random-between-constants picks
      seed: rnd() * 100,
      gravity: evalCurve(m.gravityModifier, norm),
      frame: this.startFrameOverride ?? evalCurve(this.d.UVModule?.startFrame, norm),
    };
    if (m.randomizeRotationDirection && rnd() < m.randomizeRotationDirection) q.flip = -1;
    if (lag > 0) {
      const age = Math.min(lag * dt, life * 0.999);
      if (back) p.addScaledVector(back, lag);
      p.addScaledVector(vel, age);
      q.age = age;
    }
    if (tm?.enabled && tm.mode === 0 && rnd() <= (tm.ratio ?? 1)) {
      q.trail = [];
      q.trailLife = Math.max(evalCurve(tm.lifetime, norm, q.rr), 0) * life;
    }
    this.particles.push(q);
    this._wasAlive = true;
  }

  _integrate(dt) {
    const d = this.d;
    const vm = d.VelocityModule || {};
    const fm = d.ForceModule;
    const cv = d.ClampVelocityModule;
    const nm = d.NoiseModule;
    const rm = d.RotationModule;
    const tm = d.TrailModule?.enabled && d.TrailModule.mode === 0 ? d.TrailModule : null;
    const sizeM = d.SizeModule;
    const ps = this.particles;
    this._noiseTime = (this._noiseTime || 0) + dt;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.age += dt;
      if (q.age >= q.life) {
        ps.splice(i, 1);
        // Trails.dieWithParticles = false: the trail stays and fades on its own
        if (q.trail?.length && tm && !tm.dieWithParticles) this._orphan(q);
        continue;
      }
      const t = q.age / q.life;
      if (q.gravity) q.v.y -= 9.81 * q.gravity * dt;
      if (fm?.enabled) {
        // ForceOverLifetime accumulates into the particle velocity (z mirrored like the rest of the port)
        const r = fm.randomizePerFrame ? [rnd(), rnd(), rnd()] : q.rf;
        q.v.x += evalCurve(fm.x, t, r[0]) * dt;
        q.v.y += evalCurve(fm.y, t, r[1]) * dt;
        q.v.z -= evalCurve(fm.z, t, r[2]) * dt;
      }
      if (cv?.enabled) this._limitVelocity(cv, q, t, dt, sizeM);
      let vx = q.v.x;
      let vy = q.v.y;
      let vz = q.v.z;
      if (vm.enabled) {
        vx += evalCurve(vm.x, t, q.rr);
        vy += evalCurve(vm.y, t, q.rr);
        vz -= evalCurve(vm.z, t, q.rr);
      }
      if (nm?.enabled) {
        // NoiseModule: smooth 3D noise added as a velocity (position amount), scrolled over time
        const freq = nm.frequency || 0.5;
        const scroll = evalCurve(nm.scrollSpeed, t, q.rr) * this._noiseTime;
        const amt = evalCurve(nm.positionAmount, t, q.rr);
        const sx = evalCurve(nm.strength, t, q.rr);
        const sy = nm.separateAxes ? evalCurve(nm.strengthY, t, q.rr) : sx;
        const sz = nm.separateAxes ? evalCurve(nm.strengthZ, t, q.rr) : sx;
        // Damping: strength scales with frequency so the motion amplitude stays the same
        const k = (nm.damping ? freq : 1) * amt;
        const oct = Math.max(1, nm.octaves || 1);
        vx += noise3(q.p.x * freq + scroll, q.p.y * freq, q.p.z * freq + q.seed, oct, nm) * sx * k;
        vy += noise3(q.p.x * freq + 31.7, q.p.y * freq + scroll, q.p.z * freq + q.seed, oct, nm) * sy * k;
        vz += noise3(q.p.x * freq + 71.3, q.p.y * freq + 17.9, q.p.z * freq + q.seed + scroll, oct, nm) * sz * k;
      }
      q.vt.set(vx, vy, vz);
      q.p.x += vx * dt;
      q.p.y += vy * dt;
      q.p.z += vz * dt;
      if (rm?.enabled) {
        const dir = q.flip || 1;
        q.rot += evalCurve(rm.curve, t, q.rr) * dt * dir;
        if (rm.separateAxes) {
          q.rx += evalCurve(rm.x, t, q.rr) * dt * dir;
          q.ry += evalCurve(rm.y, t, q.rr) * dt * dir;
        }
      }
      if (q.trail) this._recordTrail(q, tm);
    }
    this._ageOrphans(dt);
  }

  /** LimitVelocityOverLifetime: dampen the speed above the limit, then apply drag */
  _limitVelocity(cv, q, t, dt, sizeM) {
    // dampen is the fraction removed per (30 fps) frame above the limit, made frame-rate independent
    const keep = Math.pow(1 - Mathf.Clamp01(cv.dampen ?? 0), dt * 30);
    if (cv.separateAxis) {
      const lim = [evalCurve(cv.x, t, q.rr), evalCurve(cv.y, t, q.rr), evalCurve(cv.z, t, q.rr)];
      for (const [k, l] of [['x', lim[0]], ['y', lim[1]], ['z', lim[2]]]) {
        const a = Math.abs(q.v[k]);
        if (a > l) q.v[k] = Math.sign(q.v[k]) * (l + (a - l) * keep);
      }
    } else {
      const lim = evalCurve(cv.magnitude, t, q.rr);
      const sp = q.v.length();
      if (sp > lim && sp > 1e-6) q.v.multiplyScalar((lim + (sp - lim) * keep) / sp);
    }
    let drag = evalCurve(cv.drag, t, q.rr);
    if (drag > 0) {
      if (cv.multiplyDragByParticleSize) {
        const s = q.size * (sizeM?.enabled ? evalCurve(sizeM.curve, t, q.rr) : 1);
        drag *= s * s;
      }
      if (cv.multiplyDragByParticleVelocity) drag *= q.v.length();
      q.v.multiplyScalar(Math.max(0, 1 - drag * dt));
    }
  }

  // ---- trails (TrailModule, mode PerParticle): vertex history behind each particle
  _recordTrail(q, tm) {
    const tr = q.trail;
    const now = this._noiseTime;
    const last = tr[tr.length - 1];
    const minD = tm.minVertexDistance ?? 0.2;
    if (!last || (q.p.x - last.x) ** 2 + (q.p.y - last.y) ** 2 + (q.p.z - last.z) ** 2 >= minD * minD) tr.push({ x: q.p.x, y: q.p.y, z: q.p.z, t: now });
    while (tr.length && now - tr[0].t > q.trailLife) tr.shift();
  }

  _orphan(q) {
    (this.orphans ||= []).push({ trail: q.trail, trailLife: q.trailLife, size: q.size, color: q.color, t: 1, rr: q.rr, p: q.trail[q.trail.length - 1] });
  }

  _ageOrphans() {
    if (!this.orphans?.length) return;
    const now = this._noiseTime;
    this.orphans = this.orphans.filter((o) => {
      while (o.trail.length && now - o.trail[0].t > o.trailLife) o.trail.shift();
      return o.trail.length > 1;
    });
  }

  _ensureMesh() {
    if (this.mesh) return this.mesh;
    const r = this.renderer;
    if (!r || !r.enabled) return null;
    const n = this.maxParticles;
    if (r.renderMode === 4) {
      // Mesh particles: one instance per particle, with the particle color as a per-instance vertex color
      const src = getGeometry(r.meshRef);
      if (!src) return null;
      const geo = src.clone();
      geo.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(n * 4).fill(1), 4).setUsage(THREE.DynamicDrawUsage));
      const ref = (r._materialRefs || [])[0];
      const mat = ref ? getMaterial(ref, true) : new THREE.MeshBasicMaterial();
      this.mesh = new THREE.InstancedMesh(geo, mat, n);
      this.mesh.count = 0;
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = (mat.userData?.renderQueue ?? 3000) + (r.sortingOrder || 0) * 0.001;
      this.mesh.matrixAutoUpdate = false;
      this.mesh.userData.instanced = true;
      World.root.add(this.mesh);
      return this.mesh;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4 * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4 * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 4 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    const idx = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const ref = (r._materialRefs || [])[0];
    let mat = ref ? getMaterial(ref, true) : null;
    if (!mat || mat === getMaterial(null)) mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = (mat.userData?.renderQueue ?? 3000) + (r.sortingOrder || 0) * 0.001;
    // always parented to the world root: local-space systems get their matrix from _simMatrix() each frame
    this.mesh.matrixAutoUpdate = false;
    World.root.add(this.mesh);
    return this.mesh;
  }

  /** particle color at normalized age t (start color x color over lifetime) */
  _particleColor(q, t, out) {
    const colM = this.d.ColorModule;
    const colG = this.colorOverride || (colM?.enabled ? colM.gradient : null);
    if (colG) evalGradient(colG, t, q.rr, out);
    else out[0] = out[1] = out[2] = out[3] = 1;
    for (let k = 0; k < 4; k++) out[k] *= q.color[k];
    return out;
  }

  /** current [x, y, z] size of a particle (start size x size over lifetime) */
  _particleSize(q, t, out) {
    const sizeM = this.d.SizeModule;
    out[0] = q.size;
    out[1] = q.sy;
    out[2] = q.sz;
    if (sizeM?.enabled) {
      const sx = evalCurve(sizeM.curve, t, q.rr);
      if (sizeM.separateAxes) {
        out[0] *= sx;
        out[1] *= evalCurve(sizeM.y, t, q.rr);
        out[2] *= evalCurve(sizeM.z, t, q.rr);
      } else {
        out[0] *= sx;
        out[1] *= sx;
        out[2] *= sx;
      }
    }
    return out;
  }

  _render() {
    if (this._ui) {
      if (this.mesh) this.mesh.visible = false;
      if (this.trailMesh) this.trailMesh.visible = false;
      return;
    }
    this._renderParticles();
    this._renderTrails();
  }

  /**
   * Frame used to place a system's particles. ParticleSystemRenderer.renderAlignment View (0), World (1) and
   * Facing (3) orient particles by the camera, so local-space systems only move their positions through the
   * system matrix; Local (2) keeps the whole transform (the mesh matrix). Returns null for the Local case.
   */
  _viewFrame() {
    const cam = Render.camera;
    cam.updateMatrixWorld();
    cam.getWorldQuaternion(_cq);
    _cr.set(1, 0, 0).applyQuaternion(_cq);
    _cu.set(0, 1, 0).applyQuaternion(_cq);
    if (this.worldSpace || this.renderer.renderAlignment === 2) return this.worldSpace ? { sim: null } : null;
    this._simMatrix(_sm).decompose(_sp, _sq, _ss);
    _ss.set(Math.abs(_ss.x), Math.abs(_ss.y), Math.abs(_ss.z));
    return { sim: _sm };
  }

  _renderParticles() {
    const ps = this.particles;
    if (!ps.length) {
      if (this.mesh) {
        if (this.mesh.userData.instanced) this.mesh.count = 0;
        else this.mesh.geometry.setDrawRange(0, 0);
      }
      return;
    }
    const mesh = this._ensureMesh();
    if (!mesh) return;
    mesh.visible = this.gameObject.activeInHierarchy;
    const frame = this._viewFrame();
    if (frame) mesh.matrix.identity();
    else this._simMatrix(mesh.matrix);
    mesh.matrixWorldNeedsUpdate = true;
    const r = this.renderer;
    if (mesh.userData.instanced) return this._renderInstances(mesh, frame);
    const stretch = r.renderMode === 1;
    const pos = mesh.geometry.attributes.position.array;
    const col = mesh.geometry.attributes.color.array;
    const uvs = mesh.geometry.attributes.uv.array;
    const c = [1, 1, 1, 1];
    const sz = [1, 1, 1];
    // quad axes: camera right/up for view-aligned particles, the system's local X/Y otherwise
    const R = frame ? _cr : _ux;
    const U = frame ? _cu : _uy;
    const sim = frame?.sim;
    // ParticleSystemRenderer.maxParticleSize: size limited to a fraction of the viewport height
    const cam = Render.camera;
    const maxSize = r.maxParticleSize;
    const toView = cam && maxSize > 0 ? _mv.multiplyMatrices(cam.matrixWorldInverse, mesh.matrix) : null;
    const tanHalf = cam ? Math.tan((cam.fov * Deg2Rad) / 2) : 0;
    let n = 0;
    for (const q of ps) {
      const t = q.age / q.life;
      this._particleSize(q, t, sz);
      const P = sim ? _pc.copy(q.p).applyMatrix4(sim) : _pc.copy(q.p);
      let w = sz[0] * (sim ? _ss.x : 1);
      let hgt = sz[1] * (sim ? _ss.y : 1);
      if (toView) {
        const depth = -_pv.copy(P).applyMatrix4(toView).z;
        if (depth > 0) {
          const lim = maxSize * 2 * depth * tanHalf;
          const k = Math.min(1, lim / Math.max(w, hgt, 1e-6));
          w *= k;
          hgt *= k;
        }
      }
      const hw = w / 2;
      const hh = hgt / 2;
      let ax = hw;
      let ay = 0;
      let bx = 0;
      let by = hh;
      if (stretch) {
        // velocity in the quad plane (world velocity projected on the camera axes for view-aligned systems)
        const v = _vv.copy(q.vt);
        if (sim) v.applyQuaternion(_sq).multiply(_ss);
        const vx = frame ? v.dot(R) : v.x;
        const vy = frame ? v.dot(U) : v.y;
        const vl = Math.hypot(vx, vy) || 1e-5;
        const ux = vx / vl;
        const uy = vy / vl;
        const len = hw * (r.lengthScale ?? 2) + vl * (r.velocityScale ?? 0) * 0.5;
        ax = ux * len;
        ay = uy * len;
        bx = -uy * hh;
        by = ux * hh;
      } else if (q.rot) {
        // Unity billboard rotation is clockwise for positive angles on screen (same as UIParticle)
        const cs = Math.cos(-q.rot);
        const sn = Math.sin(-q.rot);
        ax = cs * hw;
        ay = sn * hw;
        bx = -sn * hh;
        by = cs * hh;
      }
      const corner = (o, cx, cy) => {
        pos[o] = P.x + R.x * cx + U.x * cy;
        pos[o + 1] = P.y + R.y * cx + U.y * cy;
        pos[o + 2] = P.z + R.z * cx + U.z * cy;
      };
      const o = n * 12;
      corner(o, -ax - bx, -ay - by);
      corner(o + 3, ax - bx, ay - by);
      corner(o + 6, ax + bx, ay + by);
      corner(o + 9, -ax + bx, -ay + by);
      const uv = sheetUV(this, q) || UV01;
      uvs.set([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], n * 8);
      this._particleColor(q, t, c);
      for (let k = 0; k < 4; k++) col.set(c, n * 16 + k * 4);
      n++;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
    mesh.geometry.attributes.uv.needsUpdate = true;
    mesh.geometry.setDrawRange(0, n * 6);
  }

  _renderInstances(mesh, frame) {
    const col = mesh.geometry.attributes.color;
    const c = [1, 1, 1, 1];
    const sz = [1, 1, 1];
    const sim = frame?.sim;
    let n = 0;
    for (const q of this.particles) {
      const t = q.age / q.life;
      this._particleSize(q, t, sz);
      // Unity euler (x, y, z) -> mirrored space (-x, -y, z), applied Z, X, Y like Unity
      _ie.set(-q.rx, -q.ry, q.rot || 0, 'YXZ');
      _iq.setFromEuler(_ie);
      // view-aligned meshes are rotated in camera space; Local ones inherit the system transform via mesh.matrix
      if (frame) _iq.premultiply(_cq);
      _is.set(sz[0], sz[1], sz[2]);
      if (sim) _is.multiply(_ss);
      _ip.copy(q.p);
      if (sim) _ip.applyMatrix4(sim);
      _im.compose(_ip, _iq, _is);
      mesh.setMatrixAt(n, _im);
      this._particleColor(q, t, c);
      col.array.set(c, n * 4);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
  }

  // ---- trails: ParticleSystemRenderer trail material (m_Materials[1]), camera-facing strips
  _ensureTrailMesh() {
    if (this.trailMesh) return this.trailMesh;
    const r = this.renderer;
    const ref = (r?._materialRefs || [])[1];
    if (!r || !r.enabled || !ref) return null;
    const geo = new THREE.BufferGeometry();
    const mat = getMaterial(ref, true);
    this.trailMesh = new THREE.Mesh(geo, mat);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.renderOrder = (mat.userData?.renderQueue ?? 3000) + (r.sortingOrder || 0) * 0.001;
    this.trailMesh.matrixAutoUpdate = false;
    this.trailCap = 0;
    World.root.add(this.trailMesh);
    return this.trailMesh;
  }

  _trailBuffers(verts) {
    const m = this.trailMesh;
    if (verts <= this.trailCap) return;
    const cap = Math.max(64, 1 << Math.ceil(Math.log2(verts)));
    const geo = m.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cap * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    const idx = new Uint32Array(cap * 3);
    geo.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.trailCap = cap;
  }

  /** collect the strips: [{pts: [{x,y,z}], w: [..], c: [[r,g,b,a]..]}], index 0 = trail head */
  _trailStrips() {
    const tm = this.d.TrailModule;
    if (!tm?.enabled) return [];
    const strips = [];
    const c = [1, 1, 1, 1];
    const sz = [1, 1, 1];
    const g = [1, 1, 1, 1];
    const tint = (base, ageT, u, rr) => {
      const out = tm.inheritParticleColor ? base.slice() : [1, 1, 1, 1];
      evalGradient(tm.colorOverLifetime, ageT, rr, g);
      for (let k = 0; k < 4; k++) out[k] *= g[k];
      evalGradient(tm.colorOverTrail, u, rr, g);
      for (let k = 0; k < 4; k++) out[k] *= g[k];
      return out;
    };
    const widthAt = (u, size, rr) => evalCurve(tm.widthOverTrail, u, rr) * (tm.sizeAffectsWidth ? size : 1);
    if (tm.mode === 1) {
      // Ribbon: particles joined in age order (oldest = 0 .. newest = 1), ribbonCount ribbons round-robin
      const ribbons = Math.max(1, tm.ribbonCount || 1);
      const sorted = this.particles.slice().sort((a, b) => b.age - a.age);
      for (let rb = 0; rb < ribbons; rb++) {
        const list = sorted.filter((_, i) => i % ribbons === rb);
        if (list.length < 2) continue;
        const s = { pts: [], w: [], c: [] };
        list.forEach((q, i) => {
          const u = i / (list.length - 1);
          const t = q.age / q.life;
          this._particleSize(q, t, sz);
          this._particleColor(q, t, c);
          s.pts.push(q.p);
          s.w.push(widthAt(u, sz[0], q.rr));
          s.c.push(tint(c, t, u, q.rr));
        });
        strips.push(s);
      }
      return strips;
    }
    const add = (trail, head, size, color, ageT, rr) => {
      const pts = [head];
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        if (i === trail.length - 1 && Math.abs(p.x - head.x) + Math.abs(p.y - head.y) < 1e-4) continue;
        pts.push(p);
      }
      if (pts.length < 2) return;
      const s = { pts, w: [], c: [] };
      pts.forEach((_, i) => {
        const u = i / (pts.length - 1);
        s.w.push(widthAt(u, size, rr));
        s.c.push(tint(color, ageT, u, rr));
      });
      strips.push(s);
    };
    for (const q of this.particles) {
      if (!q.trail) continue;
      const t = q.age / q.life;
      this._particleSize(q, t, sz);
      this._particleColor(q, t, c);
      add(q.trail, q.p, sz[0], c, t, q.rr);
    }
    for (const o of this.orphans || []) add(o.trail, o.p, o.size, o.color, 1, o.rr);
    return strips;
  }

  _renderTrails() {
    if (!this.d.TrailModule?.enabled && !this.trailMesh) return;
    const strips = this._trailStrips();
    let verts = 0;
    for (const s of strips) verts += s.pts.length * 2;
    if (!verts) {
      if (this.trailMesh) this.trailMesh.geometry.setDrawRange(0, 0);
      return;
    }
    const mesh = this._ensureTrailMesh();
    if (!mesh) return;
    this._trailBuffers(verts);
    mesh.visible = this.gameObject.activeInHierarchy;
    // trails are built in world space and face the camera (local-space points go through the system matrix)
    mesh.matrix.identity();
    mesh.matrixWorldNeedsUpdate = true;
    this._viewFrame();
    const sim = this.worldSpace ? null : this._simMatrix(_sm);
    const W = (p) => (sim ? new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(sim) : p);
    const geo = mesh.geometry;
    const pos = geo.attributes.position.array;
    const uv = geo.attributes.uv.array;
    const col = geo.attributes.color.array;
    const idx = geo.index.array;
    let v = 0;
    let ii = 0;
    for (const s of strips) {
      const n = s.pts.length;
      const v0 = v;
      const pts = s.pts.map(W);
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(n - 1, i + 1)];
        // tangent in the camera plane, the strip widens along its perpendicular
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        let tx = dx * _cr.x + dy * _cr.y + dz * _cr.z;
        let ty = dx * _cu.x + dy * _cu.y + dz * _cu.z;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const hw = s.w[i] / 2;
        const ox = (-ty * _cr.x + tx * _cu.x) * hw;
        const oy = (-ty * _cr.y + tx * _cu.y) * hw;
        const oz = (-ty * _cr.z + tx * _cu.z) * hw;
        pos.set([p.x + ox, p.y + oy, p.z + oz, p.x - ox, p.y - oy, p.z - oz], v * 3);
        // TrailTextureMode.Stretch: u runs along the whole trail
        const u = i / (n - 1);
        uv.set([u, 1, u, 0], v * 2);
        col.set(s.c[i], v * 4);
        col.set(s.c[i], v * 4 + 4);
        if (i > 0) {
          const k = v0 + (i - 1) * 2;
          idx.set([k, k + 1, k + 2, k + 1, k + 3, k + 2], ii);
          ii += 6;
        }
        v += 2;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.index.needsUpdate = true;
    geo.setDrawRange(0, ii);
  }
}

const UV01 = [0, 0, 1, 1];
const _back = new THREE.Vector3();
const _cq = new THREE.Quaternion();
const _cr = new THREE.Vector3();
const _cu = new THREE.Vector3();
const _ux = new THREE.Vector3(1, 0, 0);
const _uy = new THREE.Vector3(0, 1, 0);
const _sm = new THREE.Matrix4();
const _sp = new THREE.Vector3();
const _sq = new THREE.Quaternion();
const _ss = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _vv = new THREE.Vector3();
const _mv = new THREE.Matrix4();
const _pv = new THREE.Vector3();
const _im = new THREE.Matrix4();
const _iq = new THREE.Quaternion();
const _ie = new THREE.Euler();
const _is = new THREE.Vector3();
const _ip = new THREE.Vector3();

export class ParticleSystemRenderer extends Behaviour {
  static typeName = 'ParticleSystemRenderer';

  static fromData(r, d) {
    r._enabled = d.m_Enabled !== 0;
    r._materialRefs = d.m_Materials || [];
    r.renderMode = d.m_RenderMode || 0;
    r.meshRef = d.m_Mesh || null;
    r.lengthScale = d.m_LengthScale ?? 2;
    r.velocityScale = d.m_VelocityScale ?? 0;
    r.maxParticleSize = d.m_MaxParticleSize ?? 0.5;
    r.sortingOrder = d.m_SortingOrder || 0;
    r.renderAlignment = d.m_RenderAlignment || 0; // View, World, Local, Facing, Velocity
  }

  _activate() {
    this._isActiveAndEnabled = this._enabled;
  }

  _deactivate() {
    this._isActiveAndEnabled = false;
  }
}

/** MMAutoDestroyParticleSystem */
export class MMAutoDestroyParticleSystem extends Behaviour {
  static typeName = 'MMAutoDestroyParticleSystem';
}
