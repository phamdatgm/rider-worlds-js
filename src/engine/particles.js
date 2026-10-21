// A compact CPU implementation of Unity's Shuriken ParticleSystem covering the modules the game uses:
// main (lifetime/speed/size/color/rotation/gravity), emission (rate over time/distance, bursts),
// shape (sphere/hemisphere/cone/box/circle/edge), velocity/size/color/rotation over lifetime.
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
    this.playing = false;
    if (this.mesh) this.mesh.visible = false;
  }

  _destroy() {
    this._deactivate();
    if (this.mesh) {
      this.mesh.removeFromParent();
      if (!this.mesh.userData.instanced) this.mesh.geometry.dispose();
      this.mesh = null;
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
      if (clear) s.particles.length = 0;
    }
  }

  Pause(withChildren = true) {
    for (const s of this._systems(withChildren)) s.paused = true;
  }

  Clear(withChildren = true) {
    for (const s of this._systems(withChildren)) s.particles.length = 0;
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
    if (this.playing) {
      if (this.delay > 0) this.delay -= sim;
      else this._emit(sim);
    }
    this._integrate(sim);
    if (!this.playing && this.particles.length === 0 && this._wasAlive) {
      this._wasAlive = false;
      if (this.stopAction === 2) Destroy(this.gameObject);
      else if (this.stopAction === 1) this.gameObject.SetActive(false);
    }
    this._render();
  }

  _emit(dt) {
    const em = this.d.EmissionModule || {};
    const t0 = this.time;
    this.time += dt;
    const norm = Mathf.Clamp01(this.time / this.duration);
    if (em.enabled) {
      const rate = this.rateOverride ?? evalCurve(em.rateOverTime, norm, 0.5);
      this.emitAcc += rate * dt;
      const pos = this.transform.position;
      const distRate = evalCurve(em.rateOverDistance, norm, 0.5);
      if (distRate > 0 && this.lastPos) this.distAcc += pos.distanceTo(this.lastPos) * distRate;
      this.lastPos = pos;
      let n = Math.floor(this.emitAcc) + Math.floor(this.distAcc);
      this.emitAcc -= Math.floor(this.emitAcc);
      this.distAcc -= Math.floor(this.distAcc);
      (em.m_Bursts || []).forEach((b, i) => {
        const st = this.burstState[i];
        const cycles = b.cycleCount || 1;
        const interval = b.repeatInterval || 0.01;
        while (st.cycles < cycles && this.time >= (b.time || 0) + st.cycles * interval) {
          if (rnd() <= (b.probability ?? 1)) n += Math.round(evalCurve(b.countCurve ?? { scalar: b.minCount ?? 30 }));
          st.cycles++;
        }
        void t0;
      });
      for (let i = 0; i < n; i++) this._spawn(norm);
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

  _spawn(norm = 0) {
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
    this.particles.push({
      p,
      v: vel,
      age: 0,
      life,
      size,
      color,
      rot: evalCurve(m.startRotation) * (m.startRotation?.scalar > 7 ? Deg2Rad : 1),
      rr: rnd(),
      gravity: evalCurve(m.gravityModifier, norm),
      frame: this.startFrameOverride ?? evalCurve(this.d.UVModule?.startFrame, norm),
    });
    this._wasAlive = true;
  }

  _integrate(dt) {
    const vm = this.d.VelocityModule || {};
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.age += dt;
      if (q.age >= q.life) {
        ps.splice(i, 1);
        continue;
      }
      if (q.gravity) q.v.y -= 9.81 * q.gravity * dt;
      let vx = q.v.x;
      let vy = q.v.y;
      let vz = q.v.z;
      if (vm.enabled) {
        const t = q.age / q.life;
        vx += evalCurve(vm.x, t, q.rr);
        vy += evalCurve(vm.y, t, q.rr);
        vz -= evalCurve(vm.z, t, q.rr);
      }
      q.p.x += vx * dt;
      q.p.y += vy * dt;
      q.p.z += vz * dt;
      const rm = this.d.RotationModule;
      if (rm?.enabled) q.rot += evalCurve(rm.curve, q.age / q.life, q.rr) * dt;
    }
  }

  _ensureMesh() {
    if (this.mesh) return this.mesh;
    const r = this.renderer;
    if (!r || !r.enabled) return null;
    const n = this.maxParticles;
    if (r.renderMode === 4) {
      // Mesh particles: one instance per particle
      const geo = getGeometry(r.meshRef);
      if (!geo) return null;
      const ref = (r._materialRefs || [])[0];
      const hasColor = !!geo.attributes.color;
      const mat = ref ? getMaterial(ref, hasColor) : new THREE.MeshBasicMaterial();
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
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4 * 2), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4 * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 4 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    const idx = new Uint16Array(n * 6);
    const uv = geo.attributes.uv.array;
    for (let i = 0; i < n; i++) {
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    }
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

  _render() {
    if (this._ui) {
      if (this.mesh) this.mesh.visible = false;
      return;
    }
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
    if (this.worldSpace) mesh.matrix.identity();
    else this._simMatrix(mesh.matrix);
    mesh.matrixWorldNeedsUpdate = true;
    const r = this.renderer;
    if (mesh.userData.instanced) return this._renderInstances(mesh);
    const stretch = r.renderMode === 1;
    const pos = mesh.geometry.attributes.position.array;
    const col = mesh.geometry.attributes.color.array;
    const sizeM = this.d.SizeModule;
    const colM = this.d.ColorModule;
    const colG = this.colorOverride || (colM?.enabled ? colM.gradient : null);
    const scale = this.worldSpace ? 1 : 1;
    const c = [1, 1, 1, 1];
    // ParticleSystemRenderer.maxParticleSize: size limited to a fraction of the viewport height
    const cam = Render.camera;
    const maxSize = r.maxParticleSize;
    const toView = cam && maxSize > 0 ? _mv.multiplyMatrices(cam.matrixWorldInverse, mesh.matrix) : null;
    const tanHalf = cam ? Math.tan((cam.fov * Deg2Rad) / 2) : 0;
    let n = 0;
    for (const q of ps) {
      const t = q.age / q.life;
      let s = q.size * scale;
      if (sizeM?.enabled) s *= evalCurve(sizeM.curve, t, q.rr);
      if (toView) {
        const depth = -_pv.copy(q.p).applyMatrix4(toView).z;
        if (depth > 0) s = Math.min(s, maxSize * 2 * depth * tanHalf);
      }
      const h = s / 2;
      let ax = h;
      let ay = 0;
      let bx = 0;
      let by = h;
      if (stretch) {
        const vl = Math.hypot(q.v.x, q.v.y) || 1e-5;
        const ux = q.v.x / vl;
        const uy = q.v.y / vl;
        const len = h * (r.lengthScale ?? 2) + vl * (r.velocityScale ?? 0) * 0.5;
        ax = ux * len;
        ay = uy * len;
        bx = -uy * h;
        by = ux * h;
      } else if (q.rot) {
        const cs = Math.cos(q.rot);
        const sn = Math.sin(q.rot);
        ax = cs * h;
        ay = sn * h;
        bx = -sn * h;
        by = cs * h;
      }
      const o = n * 12;
      const x = q.p.x;
      const y = q.p.y;
      const z = q.p.z;
      pos[o] = x - ax - bx;
      pos[o + 1] = y - ay - by;
      pos[o + 2] = z;
      pos[o + 3] = x + ax - bx;
      pos[o + 4] = y + ay - by;
      pos[o + 5] = z;
      pos[o + 6] = x + ax + bx;
      pos[o + 7] = y + ay + by;
      pos[o + 8] = z;
      pos[o + 9] = x - ax + bx;
      pos[o + 10] = y - ay + by;
      pos[o + 11] = z;
      if (colG) evalGradient(colG, t, q.rr, c);
      else c[0] = c[1] = c[2] = c[3] = 1;
      const cr = q.color[0] * c[0];
      const cg = q.color[1] * c[1];
      const cb = q.color[2] * c[2];
      const ca = q.color[3] * c[3];
      for (let k = 0; k < 4; k++) {
        const ci = n * 16 + k * 4;
        col[ci] = cr;
        col[ci + 1] = cg;
        col[ci + 2] = cb;
        col[ci + 3] = ca;
      }
      n++;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
    mesh.geometry.setDrawRange(0, n * 6);
  }
}

const _mv = new THREE.Matrix4();
const _pv = new THREE.Vector3();
const _im = new THREE.Matrix4();
const _iq = new THREE.Quaternion();
const _is = new THREE.Vector3();
const _ip = new THREE.Vector3();
const _iz = new THREE.Vector3(0, 0, 1);

ParticleSystem.prototype._renderInstances = function (mesh) {
  const sizeM = this.d.SizeModule;
  let n = 0;
  for (const q of this.particles) {
    let s = q.size;
    if (sizeM?.enabled) s *= evalCurve(sizeM.curve, q.age / q.life, q.rr);
    _iq.setFromAxisAngle(_iz, q.rot || 0);
    _is.set(s, s, s);
    _im.compose(_ip.copy(q.p), _iq, _is);
    mesh.setMatrixAt(n++, _im);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
};

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
