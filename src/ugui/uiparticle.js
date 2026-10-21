// Coffee.UIExtensions.UIParticle: renders ParticleSystems inside the canvas (baked into UI meshes, so they
// follow the draw order, masks and CanvasGroup alpha). Vertices = (position relative to the UIParticle +
// particle position) * scale3D * root canvas scale, in the UIParticle's local space (UIParticleUpdater.BakeMesh).
import * as THREE from 'three';
import { Assets, getTexture, getWhiteTexture } from '../engine/assets.js';
import { registerComponent } from '../engine/instantiate.js';
import { Graphic, UIMesh, Color } from './graphic.js';
import { sheetUV } from '../engine/particles.js';

const ADDITIVE_SHADERS = new Set(['UI_Additive', 'builtin:10720:0000000000000000f000000000000000', 'Shader Graphs_Particle_ZTest_Additive', 'Shader Graphs_Particle_Emission']);

const matCache = new Map();
const UV01 = [0, 0, 1, 1];

/** particle material -> {texture, tint, additive} for the UI shader */
function uiMaterial(ref) {
  const id = ref?.$mat;
  if (!id) return { texture: getWhiteTexture(), tint: new Color(), additive: true, id: 'none' };
  let m = matCache.get(id);
  if (!m) {
    const json = Assets.materials[id] || {};
    const texRef = json.textures?._MainTex?.tex || json.textures?._BaseMap?.tex;
    const c = json.colors?._TintColor || json.colors?._Color || json.colors?._BaseColor || [1, 1, 1, 1];
    const tint = Color.from(c);
    // Legacy particle shaders double the tint (2.0 * _TintColor)
    if (json.colors?._TintColor) {
      tint.r *= 2;
      tint.g *= 2;
      tint.b *= 2;
      tint.a *= 2;
    }
    m = { texture: (texRef && getTexture(texRef)) || getWhiteTexture(), tint, additive: ADDITIVE_SHADERS.has(json.shader), id };
    matCache.set(id, m);
  }
  return m;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class UIParticle extends Graphic {
  static typeName = 'UIParticle';

  constructor() {
    super();
    this.m_Particles = [];
    this.m_Scale3D = [10, 10, 10];
    this.m_IgnoreCanvasScaler = 1;
    this._meshes = new Map();
  }

  get particles() {
    return (this.m_Particles || []).filter((p) => p && !p.gameObject?._destroyed);
  }

  get scale() {
    return this.m_Scale3D[0];
  }

  set scale(v) {
    this.m_Scale3D = [v, v, v];
  }

  get scale3D() {
    return new THREE.Vector3(...this.m_Scale3D);
  }

  set scale3D(v) {
    this.m_Scale3D = [v.x, v.y, v.z];
  }

  get ignoreCanvasScaler() {
    return !!this.m_IgnoreCanvasScaler;
  }

  OnEnable() {
    super.OnEnable();
    for (const ps of this.particles) ps._ui = true;
    this.ModifyScale();
    this.Play();
  }

  Play() {
    for (const ps of this.particles) ps.Play(false);
  }

  Stop() {
    for (const ps of this.particles) ps.Stop(false);
  }

  Clear() {
    for (const ps of this.particles) ps.Clear(false);
  }

  RefreshParticles() {
    this.m_Particles = this.gameObject.GetComponentsInChildren('ParticleSystem', true);
    for (const ps of this.m_Particles) ps._ui = true;
  }

  SetParticleSystemInstance(go) {
    go.transform.SetParent(this.transform, false);
    this.RefreshParticles();
  }

  /** UIParticleUpdater.ModifyScale: cancel the root canvas scale */
  ModifyScale() {
    if (!this.m_IgnoreCanvasScaler) return;
    const c = this.canvas?.rootCanvas;
    const s = c ? c.scaleFactor || 1 : 1;
    const k = 1 / s;
    const cur = this.transform.obj.scale;
    if (Math.abs(cur.x - k) > 1e-6 || Math.abs(cur.y - k) > 1e-6) this.transform.localScale = new THREE.Vector3(k, k, k);
  }

  LateUpdate() {
    this.ModifyScale();
  }

  get mainTexture() {
    return getWhiteTexture();
  }

  getDrawCalls() {
    this.ModifyScale();
    const root = this.transform;
    const c = this.canvas?.rootCanvas;
    const cs = this.m_IgnoreCanvasScaler && c ? c.scaleFactor || 1 : 1;
    const K = new THREE.Vector3(this.m_Scale3D[0] * cs, this.m_Scale3D[1] * cs, this.m_Scale3D[2] * cs);
    const rootInv = _m.copy(root.updateWorld()).invert();
    const calls = [];
    const used = new Set();
    for (const ps of this.particles) {
      if (!ps.particles?.length || !ps.gameObject.activeInHierarchy) continue;
      const r = ps.renderer;
      if (!r || !r.enabled || r.renderMode === 4 || r.renderMode === 5) continue;
      const mat = uiMaterial((r._materialRefs || [])[0]);
      const key = ps;
      let mesh = this._meshes.get(key);
      if (!mesh) {
        mesh = new UIMesh();
        this._meshes.set(key, mesh);
      }
      mesh.clear();
      used.add(key);
      this.bakeSystem(ps, r, mesh, mat, K, rootInv);
      if (mesh.idx.length) calls.push({ mesh, texture: mat.texture, additive: mat.additive });
    }
    for (const k of [...this._meshes.keys()]) if (!used.has(k)) this._meshes.delete(k);
    return calls;
  }

  bakeSystem(ps, r, mesh, mat, K, rootInv) {
    const tr = ps.transform;
    const world = tr.updateWorld();
    // local simulation: particle positions are in the system's space (rotation only, scale cancelled)
    _q.setFromRotationMatrix(world);
    const rel = _v.setFromMatrixPosition(world).applyMatrix4(rootInv).clone();
    const rot = _q.clone();
    const stretch = r.renderMode === 1;
    const tint = mat.tint;
    const cc = [1, 1, 1, 1];
    const sz = [1, 1, 1];
    const p = new THREE.Vector3();
    for (const q of ps.particles) {
      const t = q.age / q.life;
      ps._particleSize(q, t, sz);
      if (ps.worldSpace) p.copy(q.p).applyMatrix4(rootInv);
      else p.copy(q.p).applyQuaternion(rot).add(rel);
      const cx = p.x * K.x;
      const cy = p.y * K.y;
      const hw = (sz[0] / 2) * K.x;
      const hh = (sz[1] / 2) * K.x;
      let ax = hw;
      let ay = 0;
      let bx = 0;
      let by = hh;
      if (stretch) {
        const v = q.vt || q.v;
        const vl = Math.hypot(v.x, v.y) || 1e-5;
        const ux = v.x / vl;
        const uy = v.y / vl;
        const len = hw * (r.lengthScale ?? 2) + vl * K.x * (r.velocityScale ?? 0) * 0.5;
        ax = ux * len;
        ay = uy * len;
        bx = -uy * hh;
        by = ux * hh;
      } else if (q.rot) {
        // Unity particle rotation is clockwise for positive angles on screen
        const cs = Math.cos(-q.rot);
        const sn = Math.sin(-q.rot);
        ax = cs * hw;
        ay = sn * hw;
        bx = -sn * hh;
        by = cs * hh;
      }
      ps._particleColor(q, t, cc);
      const col = new Color(cc[0] * tint.r, cc[1] * tint.g, cc[2] * tint.b, cc[3] * tint.a);
      const i = mesh.vertCount;
      const uv = sheetUV(ps, q) || UV01;
      mesh.addVert(cx - ax - bx, cy - ay - by, col, uv[0], uv[1]);
      mesh.addVert(cx - ax + bx, cy - ay + by, col, uv[0], uv[3]);
      mesh.addVert(cx + ax + bx, cy + ay + by, col, uv[2], uv[3]);
      mesh.addVert(cx + ax - bx, cy + ay - by, col, uv[2], uv[1]);
      mesh.idx.push(i, i + 1, i + 2, i + 2, i + 3, i);
    }
  }

  // particles are never raycast targets in practice (Coffee's UIParticle forces raycastTarget off)
  get raycastTarget() {
    return false;
  }

  set raycastTarget(v) {}
}

registerComponent(UIParticle);
