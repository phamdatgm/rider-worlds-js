// Rendering: three.js renderer in a Unity-gamma-space style pipeline + bloom, and the renderer components.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { URPBloomPass } from './urpbloom.js';
import { Behaviour, Component, World } from './scene.js';
import { Assets, getGeometry, getTexture, getWhiteTexture } from './assets.js';
import { Time } from './core.js';
import { createUnityMaterial } from '../render/unityShaders.js';
import { UIRenderer } from '../ugui/render.js';

THREE.ColorManagement.enabled = false;

export const Render = {
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  bloom: null,
  shared: {
    uMainLightDir: { value: new THREE.Vector3(0, 0, 1) },
    uMainLightColor: { value: new THREE.Vector3(1, 1, 1) },
    uTime: { value: new THREE.Vector4() },
    uSinTime: { value: new THREE.Vector4() },
    uCosTime: { value: new THREE.Vector4() },
    // indirect specular color (reflection probe / environment)
    uEnvReflection: { value: new THREE.Vector3(0, 0, 0) },
  },
  materialCache: new Map(),
  bloomEnabled: true,
  /** 0..1 weight of the close-up menu cameras (FOV 20): the neon glow is toned down there */
  closeUpWeight: 0,
  /** shift of the rendered image as a fraction of the screen (UI panels covering part of the view) */
  viewShift: { x: 0, y: 0, cx: 0, cy: 0 },

  init(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.add(World.root);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 250);
    this.scene.add(this.camera);
    // Unity "Directional Light" of MainGame.unity: rotation (0.361, -0.209, 0.101, 0.903), color (0.075, 0.137, 0.529)
    const q = new THREE.Quaternion(-0.36126208, 0.20860976, 0.10080733, 0.90322185);
    const travel = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    this.shared.uMainLightDir.value.copy(travel).negate().normalize();
    // URP assets have m_MainLightRenderingMode: Disabled, so the light contributes nothing
    this.shared.uMainLightColor.value.set(0, 0, 0);

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Global Volume Profile -> Bloom: threshold 1, intensity 1.5, scatter 0.5 (URP 12, gamma color space)
    this.bloom = new URPBloomPass({ threshold: 1, intensity: 1.5, scatter: 0.5 });
    this.composer.addPass(this.bloom);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  /** the canvas fills the window (like the WebGL template of the H5 build) */
  viewSize() {
    return [window.innerWidth, window.innerHeight];
  },

  resize() {
    const [w, h] = this.viewSize();
    const c = this.renderer.domElement;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  setBackground(rgba) {
    this.scene.background = new THREE.Color(rgba[0], rgba[1], rgba[2]);
  },

  render() {
    const t = Time.time;
    this.shared.uTime.value.set(t / 20, t, t * 2, t * 3);
    this.shared.uSinTime.value.set(Math.sin(t / 8), Math.sin(t / 4), Math.sin(t / 2), Math.sin(t));
    this.shared.uCosTime.value.set(Math.cos(t / 8), Math.cos(t / 4), Math.cos(t / 2), Math.cos(t));
    this.bloom.bloomEnabled = this.bloomEnabled;
    const vs = this.viewShift;
    vs.cx += (vs.x - vs.cx) * 0.15;
    vs.cy += (vs.y - vs.cy) * 0.15;
    if (Math.abs(vs.cx) > 1e-3 || Math.abs(vs.cy) > 1e-3) {
      const [w, h] = this.viewSize();
      this.camera.setViewOffset(w, h, vs.cx * w, vs.cy * h, w, h);
    } else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    if (this.hideWorld) {
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear();
    } else this.composer.render();
    UIRenderer.render(this.renderer);
  },
};

// ---------------------------------------------------------------- materials

/** Material for a {$mat} reference (shared between renderers unless a property block is applied). */
export function getMaterial(ref, hasVertexColor = false) {
  if (!ref) return fallbackMaterial();
  if (ref.isMaterial) return ref;
  const id = ref.$mat || ref;
  const key = `${id}|${hasVertexColor ? 1 : 0}`;
  if (Render.materialCache.has(key)) return Render.materialCache.get(key);
  const json = Assets.materials[id];
  let mat = null;
  if (json) {
    try {
      mat = createUnityMaterial(json, { getTexture, shared: Render.shared, hasVertexColor, skinned: false, white: getWhiteTexture() });
    } catch (e) {
      console.warn('material', id, e);
    }
    if (mat === null && json) mat = genericMaterial(json, hasVertexColor);
  }
  if (!mat) mat = fallbackMaterial();
  mat.userData.unityId = id;
  Render.materialCache.set(key, mat);
  return mat;
}

let _fallback = null;
function fallbackMaterial() {
  if (!_fallback) _fallback = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  return _fallback;
}

function genericMaterial(json, hasVertexColor = false) {
  const c = json.colors?._BaseColor || json.colors?._Color || [1, 1, 1, 1];
  const texId = json.textures?._BaseMap?.tex || json.textures?._MainTex?.tex;
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), map: texId ? getTexture(texId) : null, vertexColors: hasVertexColor });
  // an additive shader (UI_Additive on a 3D particle: a legendary landing's halo) adds its glow: alpha-blended, the
  // glow texture's black square showed as a white plate over the scene
  if (/Additive/i.test(json.shader)) {
    m.blending = THREE.AdditiveBlending;
    m.transparent = true;
    m.depthWrite = false;
  } else if (json.queue >= 3000) {
    m.transparent = true;
    m.depthWrite = false;
  }
  return m;
}

const tmpColor = new THREE.Vector4();

function toVec4(c) {
  if (c instanceof THREE.Vector4) return c;
  if (Array.isArray(c)) return tmpColor.set(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1).clone();
  if (c && 'r' in c) return new THREE.Vector4(c.r, c.g, c.b, c.a ?? 1);
  return new THREE.Vector4(1, 1, 1, 1);
}

export class MaterialPropertyBlock {
  constructor() {
    this.values = new Map();
  }

  SetColor(name, c) {
    this.values.set(name, { kind: 'color', v: toVec4(c) });
  }

  SetFloat(name, f) {
    this.values.set(name, { kind: 'float', v: f });
  }

  SetVector(name, v) {
    this.values.set(name, { kind: 'color', v: toVec4(v) });
  }

  SetTexture(name, t) {
    this.values.set(name, { kind: 'tex', v: t });
  }

  GetColor(name) {
    return this.values.get(name)?.v;
  }

  Clear() {
    this.values.clear();
  }

  copyFrom(other) {
    for (const [k, v] of other.values) this.values.set(k, v);
  }
}

function applyBlock(mat, block) {
  if (!mat || !block) return;
  const u = mat.uniforms;
  for (const [name, { kind, v }] of block.values) {
    if (u && u[name]) {
      if (kind === 'color') {
        if (u[name].value && u[name].value.isVector4) u[name].value.copy(v);
        else if (u[name].value && u[name].value.isColor) u[name].value.setRGB(v.x, v.y, v.z);
        else u[name].value = v.clone();
      } else u[name].value = kind === 'tex' ? (v?.isTexture ? v : getTexture(v)) : v;
    } else if (!u && kind === 'color' && (name === '_BaseColor' || name === '_Color') && mat.color) {
      mat.color.setRGB(v.x, v.y, v.z);
    }
  }
}

// ---------------------------------------------------------------- Renderer components

export class Renderer extends Behaviour {
  static typeName = 'Renderer';

  constructor() {
    super();
    this.mesh = null;
    this._materialRefs = [];
    this._mats = null;
    this._blocks = [];
    this.sortingOrder = 0;
  }

  static fromData(r, d) {
    r._enabled = d.m_Enabled !== 0;
    r._materialRefs = d.m_Materials || [];
    r.sortingOrder = d.m_SortingOrder || 0;
  }

  _activate() {
    if (!this._enabled || this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = true;
    if (!this.mesh) this._createMesh();
    if (this.mesh) this.mesh.visible = true;
  }

  _deactivate() {
    if (!this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = false;
    if (this.mesh) this.mesh.visible = false;
  }

  _destroy() {
    this._deactivate();
    if (this.mesh) {
      this.mesh.removeFromParent();
      // owned material copies are not disposed: a material holds no GPU memory of its own (its textures are
      // shared), and disposing the last user of a shader variant deleted the compiled program, so every vehicle
      // rebuild (page switch, garage swap) recompiled it. The programs stay bounded by the shader variants.
      this.mesh = null;
    }
  }

  _createMesh() {}

  /** Shared (non-instanced) materials. */
  get sharedMaterials() {
    return this._mats || [];
  }

  get material() {
    return this.materials[0];
  }

  set material(m) {
    this.materials = [m];
  }

  get materials() {
    this._ensureOwned();
    return this._mats;
  }

  set materials(list) {
    this._materialRefs = list;
    this._ownsMats = false;
    this._mats = null;
    if (this.mesh) this._applyMaterials();
  }

  _resolveMats() {
    const hasColor = !!this.mesh?.geometry?.attributes?.color;
    return this._materialRefs.map((r) => getMaterial(r, hasColor));
  }

  _applyMaterials() {
    this._mats = this._resolveMats();
    if (this._blocks.some(Boolean)) {
      this._ensureOwned();
      this._blocks.forEach((b, i) => b && applyBlock(this._mats[i], b));
    }
    this._assign();
  }

  _assign() {
    if (!this.mesh) return;
    const mats = this._mats;
    this.mesh.material = mats.length === 1 ? mats[0] : mats;
    const q = Math.max(...mats.map((m) => m.userData?.renderQueue ?? 2000));
    this.mesh.renderOrder = q + this.sortingOrder * 0.001;
  }

  _ensureOwned() {
    if (!this._mats) this._mats = this._resolveMats();
    if (!this._ownsMats) {
      this._mats = this._mats.map((m) => {
        const c = m.clone();
        c.userData = { ...m.userData };
        if (m.uniforms) {
          // keep shared engine uniforms shared, and share textures (UniformsUtils.clone copies them, and a copy
          // made before the image finished loading would never receive it)
          for (const k of Object.keys(Render.shared)) if (m.uniforms[k]) c.uniforms[k] = Render.shared[k];
          for (const k of Object.keys(m.uniforms)) if (m.uniforms[k].value && m.uniforms[k].value.isTexture) c.uniforms[k].value = m.uniforms[k].value;
        }
        return c;
      });
      this._ownsMats = true;
      this._assign();
    }
  }

  GetPropertyBlock(block, index = 0) {
    const b = this._blocks[index];
    block.Clear();
    if (b) block.copyFrom(b);
  }

  SetPropertyBlock(block, index = -1) {
    const copy = new MaterialPropertyBlock();
    copy.copyFrom(block);
    if (index < 0) {
      const n = Math.max(this._materialRefs.length, 1);
      for (let i = 0; i < n; i++) this._blocks[i] = copy;
    } else this._blocks[index] = copy;
    if (!this.mesh) return;
    this._ensureOwned();
    if (index < 0) this._mats.forEach((m) => applyBlock(m, copy));
    else applyBlock(this._mats[index], copy);
  }

  get bounds() {
    if (!this.mesh) return null;
    const b = new THREE.Box3().setFromObject(this.mesh);
    return b;
  }
}

export class MeshFilter extends Component {
  static typeName = 'MeshFilter';

  static fromData(f, d) {
    f.meshRef = d.m_Mesh || null;
  }

  get sharedMesh() {
    return getGeometry(this.meshRef);
  }

  set sharedMesh(ref) {
    this.meshRef = ref;
    const r = this.GetComponent(MeshRenderer);
    if (r && r.mesh) r.mesh.geometry = getGeometry(ref) || r.mesh.geometry;
  }
}

export class MeshRenderer extends Renderer {
  static typeName = 'MeshRenderer';

  _createMesh() {
    const filter = this.GetComponent(MeshFilter);
    const geo = filter ? getGeometry(filter.meshRef) : null;
    if (!geo) return;
    this.mesh = new THREE.Mesh(geo, fallbackMaterial());
    this.mesh.matrixAutoUpdate = true;
    this.mesh.userData.renderer = this;
    this.transform.obj.add(this.mesh);
    this._applyMaterials();
    // a geometry with N submeshes and fewer materials: Unity renders the extra submeshes with the last material
    const groups = geo.groups.length;
    if (Array.isArray(this.mesh.material) && this.mesh.material.length < groups) {
      const last = this.mesh.material[this.mesh.material.length - 1];
      while (this.mesh.material.length < groups) this.mesh.material.push(last);
    }
  }
}

export class SkinnedMeshRenderer extends MeshRenderer {
  static typeName = 'SkinnedMeshRenderer';
}

// ---------------------------------------------------------------- SpriteRenderer

export class SpriteRenderer extends Renderer {
  static typeName = 'SpriteRenderer';

  static fromData(r, d) {
    Renderer.fromData(r, d);
    r.spriteRef = d.m_Sprite || null;
    r._color = d.m_Color ? [...d.m_Color] : [1, 1, 1, 1];
    r.flipX = !!d.m_FlipX;
    r.flipY = !!d.m_FlipY;
    r.drawMode = d.m_DrawMode || 0;
    r.drawSize = d.m_Size || null;
  }

  get color() {
    return { r: this._color[0], g: this._color[1], b: this._color[2], a: this._color[3] };
  }

  set color(c) {
    this._color = Array.isArray(c) ? [...c] : [c.r, c.g, c.b, c.a ?? 1];
    this._applyColor();
  }

  _createMesh() {
    const ref = this.spriteRef;
    if (!ref || !ref.$sprite) return;
    const tex = getTexture(ref.$sprite);
    const info = Assets.textureInfo[ref.$sprite] || {};
    const size = info.size || [256, 256];
    const ppu = info.ppu || 100;
    let rect = [0, 0, size[0], size[1]];
    let pivot = info.pivot || [0.5, 0.5];
    if (info.sprites && info.sprites.length) {
      const s = info.sprites.find((x) => String(x.id) === String(ref.fid)) || info.sprites[0];
      rect = s.rect;
      pivot = s.pivot || pivot;
    }
    const w = rect[2] / ppu;
    const h = rect[3] / ppu;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate((0.5 - pivot[0]) * w, (0.5 - pivot[1]) * h, 0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (rect[0] + u * rect[2]) / size[0], (rect[1] + v * rect[3]) / size[1]);
    }
    if (this.flipX) geo.scale(-1, 1, 1);
    if (this.flipY) geo.scale(1, -1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ref0 = this._materialRefs[0];
    const mj = ref0 && Assets.materials[ref0.$mat];
    if (mj && /Additive/i.test(mj.shader + mj.name)) mat.blending = THREE.AdditiveBlending;
    this._mats = [mat];
    this._ownsMats = true;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 3000 + this.sortingOrder * 0.001;
    this.transform.obj.add(this.mesh);
    this._applyColor();
  }

  _applyColor() {
    if (!this.mesh) return;
    const m = this.mesh.material;
    m.color.setRGB(this._color[0], this._color[1], this._color[2]);
    m.opacity = this._color[3];
  }
}

// ---------------------------------------------------------------- Light (scene lights are fixed; kept for completeness)

export class Light extends Behaviour {
  static typeName = 'Light';

  static fromData(l, d) {
    l._enabled = d.m_Enabled !== 0;
    l.type = d.m_Type;
    l.color = d.m_Color;
    l.intensity = d.m_Intensity;
  }
}
