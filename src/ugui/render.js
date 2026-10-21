// UI renderer: batches the UISystem draw list into three.js meshes drawn after the 3D frame
// (Screen Space Overlay canvases are not post-processed). Shaders: UI/Default (premultiplied, soft rect
// clipping as in UnityUI.cginc) and TextMeshPro Distance Field / Mobile Distance Field.
import * as THREE from 'three';
import { getWhiteTexture } from '../engine/assets.js';
import { UISystem } from './canvas.js';

const VS_UI = /* glsl */ `
  attribute vec4 color;
  uniform vec2 uScreen;
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vPos;
  void main() {
    vUv = uv;
    vColor = color;
    vPos = position.xy;
    gl_Position = vec4(position.xy / uScreen * 2.0 - 1.0, 0.0, 1.0);
  }`;

const CLIP = /* glsl */ `
  uniform vec4 uClip;
  uniform float uClipOn;
  uniform vec2 uSoftness;
  float clipAlpha(vec2 p) {
    if (uClipOn < 0.5) return 1.0;
    vec2 mask = p * 2.0 - uClip.xy - uClip.zw;
    vec2 k = 0.25 / (0.25 * uSoftness + vec2(1.0));
    vec2 m = clamp((uClip.zw - uClip.xy - abs(mask)) * k, 0.0, 1.0);
    return m.x * m.y;
  }`;

const FS_UI = /* glsl */ `
  uniform sampler2D map;
  uniform float uAlphaClip;
  uniform float uAdditive;
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vPos;
  ${CLIP}
  void main() {
    vec4 c = vColor * texture2D(map, vUv);
    c.a *= clipAlpha(vPos);
    if (uAlphaClip > 0.5 && c.a < 0.001) discard;
    c.rgb *= c.a;
    if (uAdditive > 0.5) c.a = 0.0;
    gl_FragColor = c;
  }`;

const VS_SDF = /* glsl */ `
  attribute vec4 color;
  attribute float xscale;
  uniform vec2 uScreen;
  uniform float uGradientScale, uSharpness, uWeightNormal, uWeightBold, uFaceDilate, uScaleRatioA, uScaleRatioB, uScaleRatioC;
  uniform float uOutlineWidth, uOutlineSoftness, uGlowOn, uGlowOffset, uGlowOuter;
  uniform float uUnderlayOn, uUnderlaySoftness, uUnderlayDilate, uUnderlayOffsetX, uUnderlayOffsetY, uTexW, uTexH, uMobile;
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vPos;
  varying vec4 vParam;
  varying vec4 vUnder;
  void main() {
    vUv = uv;
    vColor = color;
    vPos = position.xy;
    gl_Position = vec4(position.xy / uScreen * 2.0 - 1.0, 0.0, 1.0);
    float bold = step(xscale, 0.0);
    float scale = 1.41421356 * abs(xscale) * uGradientScale * (uSharpness + 1.0);
    float weight = mix(uWeightNormal, uWeightBold, bold) / 4.0;
    weight = (weight + uFaceDilate) * uScaleRatioA * 0.5;
    vec2 bOffset = vec2(-(uUnderlayOffsetX * uScaleRatioC) * uGradientScale / uTexW, -(uUnderlayOffsetY * uScaleRatioC) * uGradientScale / uTexH);
    if (uMobile > 0.5) {
      float layerScale = scale;
      scale /= 1.0 + (uOutlineSoftness * uScaleRatioA * scale);
      float bias = (0.5 - weight) * scale - 0.5;
      float outline = uOutlineWidth * uScaleRatioA * 0.5 * scale;
      vParam = vec4(scale, bias - outline, bias + outline, bias);
      layerScale /= 1.0 + ((uUnderlaySoftness * uScaleRatioC) * layerScale);
      float layerBias = (0.5 - weight) * layerScale - 0.5 - ((uUnderlayDilate * uScaleRatioC) * 0.5 * layerScale);
      vUnder = vec4(uv + bOffset, layerScale, layerBias);
    } else {
      float bias = (0.5 - weight) + (0.5 / scale);
      float alphaClip = (1.0 - uOutlineWidth * uScaleRatioA - uOutlineSoftness * uScaleRatioA);
      if (uGlowOn > 0.5) alphaClip = min(alphaClip, 1.0 - uGlowOffset * uScaleRatioB - uGlowOuter * uScaleRatioB);
      alphaClip = alphaClip / 2.0 - (0.5 / scale) - weight;
      vParam = vec4(alphaClip, scale, bias, weight);
      float bScale = scale;
      bScale /= 1.0 + ((uUnderlaySoftness * uScaleRatioC) * bScale);
      float bBias = (0.5 - weight) * bScale - 0.5 - ((uUnderlayDilate * uScaleRatioC) * 0.5 * bScale);
      vUnder = vec4(uv + bOffset, bScale, bBias);
    }
  }`;

export const FS_SDF = /* glsl */ `
  uniform sampler2D map;
  uniform vec4 uFaceColor, uOutlineColor, uUnderlayColor, uGlowColor;
  uniform float uScaleRatioA, uScaleRatioB, uOutlineWidth, uOutlineSoftness;
  uniform float uUnderlayOn, uGlowOn, uGlowOffset, uGlowInner, uGlowOuter, uGlowPower, uMobile;
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vPos;
  varying vec4 vParam;
  varying vec4 vUnder;
  ${CLIP}
  vec4 GetColor(float d, vec4 faceColor, vec4 outlineColor, float outline, float softness) {
    float faceAlpha = 1.0 - clamp((d - outline * 0.5 + softness * 0.5) / (1.0 + softness), 0.0, 1.0);
    float outlineAlpha = clamp((d + outline * 0.5), 0.0, 1.0) * sqrt(min(1.0, outline));
    faceColor.rgb *= faceColor.a;
    outlineColor.rgb *= outlineColor.a;
    faceColor = mix(faceColor, outlineColor, outlineAlpha);
    faceColor *= faceAlpha;
    return faceColor;
  }
  vec4 GetGlowColor(float d, float scale) {
    float glow = d - (uGlowOffset * uScaleRatioB) * 0.5 * scale;
    float t = mix(uGlowInner, (uGlowOuter * uScaleRatioB), step(0.0, glow)) * 0.5 * scale;
    glow = clamp(abs(glow / (1.0 + t)), 0.0, 1.0);
    glow = 1.0 - pow(glow, uGlowPower);
    glow *= sqrt(min(1.0, t));
    return vec4(uGlowColor.rgb, clamp(uGlowColor.a * glow * 2.0, 0.0, 1.0));
  }
  void main() {
    float c = texture2D(map, vUv).a;
    vec4 col;
    if (uMobile > 0.5) {
      float d = c * vParam.x;
      vec4 face = vec4(vColor.rgb, vColor.a) * uFaceColor;
      face.rgb *= face.a;
      col = face * clamp(d - vParam.w, 0.0, 1.0);
      if (uUnderlayOn > 0.5) {
        float du = texture2D(map, vUnder.xy).a * vUnder.z;
        col += vec4(uUnderlayColor.rgb * uUnderlayColor.a, uUnderlayColor.a) * vColor.a * clamp(du - vUnder.w, 0.0, 1.0) * (1.0 - col.a);
      }
    } else {
      if (uUnderlayOn < 0.5 && c < vParam.x) discard;
      float scale = vParam.y;
      float bias = vParam.z;
      float sd = (bias - c) * scale;
      float outline = (uOutlineWidth * uScaleRatioA) * scale;
      float softness = (uOutlineSoftness * uScaleRatioA) * scale;
      vec4 faceColor = uFaceColor;
      faceColor.rgb *= vColor.rgb;
      col = GetColor(sd, faceColor, uOutlineColor, outline, softness);
      if (uUnderlayOn > 0.5) {
        float d = texture2D(map, vUnder.xy).a * vUnder.z;
        col += vec4(uUnderlayColor.rgb * uUnderlayColor.a, uUnderlayColor.a) * clamp(d - vUnder.w, 0.0, 1.0) * (1.0 - col.a);
      }
      if (uGlowOn > 0.5) {
        vec4 glowColor = GetGlowColor(sd, scale);
        col.rgb += glowColor.rgb * glowColor.a;
      }
      col *= vColor.a;
    }
    col *= clipAlpha(vPos);
    gl_FragColor = col;
  }`;

const STENCIL_FUNC = {
  always: THREE.AlwaysStencilFunc,
  never: THREE.NeverStencilFunc,
  less: THREE.LessStencilFunc,
  equal: THREE.EqualStencilFunc,
  lequal: THREE.LessEqualStencilFunc,
  greater: THREE.GreaterStencilFunc,
  notequal: THREE.NotEqualStencilFunc,
  gequal: THREE.GreaterEqualStencilFunc,
};
const STENCIL_OP = {
  keep: THREE.KeepStencilOp,
  replace: THREE.ReplaceStencilOp,
  zero: THREE.ZeroStencilOp,
  incr: THREE.IncrementStencilOp,
  incrwrap: THREE.IncrementWrapStencilOp,
  decr: THREE.DecrementStencilOp,
  decrwrap: THREE.DecrementWrapStencilOp,
  invert: THREE.InvertStencilOp,
};

function baseMaterial(vs, fs, extra = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: vs,
    fragmentShader: fs,
    uniforms: {
      map: { value: null },
      uScreen: { value: new THREE.Vector2(1, 1) },
      uClip: { value: new THREE.Vector4() },
      uClipOn: { value: 0 },
      uSoftness: { value: new THREE.Vector2() },
      uAlphaClip: { value: 0 },
      uAdditive: { value: 0 },
      ...extra,
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}

function sdfUniforms() {
  const u = {};
  for (const k of ['uGradientScale', 'uSharpness', 'uWeightNormal', 'uWeightBold', 'uFaceDilate', 'uScaleRatioA', 'uScaleRatioB', 'uScaleRatioC', 'uOutlineWidth', 'uOutlineSoftness', 'uGlowOn', 'uGlowOffset', 'uGlowInner', 'uGlowOuter', 'uGlowPower', 'uUnderlayOn', 'uUnderlaySoftness', 'uUnderlayDilate', 'uUnderlayOffsetX', 'uUnderlayOffsetY', 'uTexW', 'uTexH', 'uMobile'])
    u[k] = { value: 0 };
  for (const k of ['uFaceColor', 'uOutlineColor', 'uUnderlayColor', 'uGlowColor']) u[k] = { value: new THREE.Vector4(1, 1, 1, 1) };
  return u;
}

class Batch {
  constructor(sdf) {
    this.sdf = sdf;
    this.cap = 0;
    this.geo = new THREE.BufferGeometry();
    this.material = sdf ? baseMaterial(VS_SDF, FS_SDF, sdfUniforms()) : baseMaterial(VS_UI, FS_UI);
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.ensure(256, 384);
  }

  ensure(nv, ni) {
    if (nv <= this.cap && ni <= this.icap) return;
    this.cap = Math.max(nv, this.cap * 2 || 256);
    this.icap = Math.max(ni, this.icap * 2 || 384);
    this.pos = new Float32Array(this.cap * 3);
    this.uv = new Float32Array(this.cap * 2);
    this.col = new Float32Array(this.cap * 4);
    this.idx = new Uint32Array(this.icap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    if (this.sdf) {
      this.xs = new Float32Array(this.cap);
      g.setAttribute('xscale', new THREE.BufferAttribute(this.xs, 1).setUsage(THREE.DynamicDrawUsage));
    }
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.dispose();
    this.geo = g;
    this.mesh.geometry = g;
  }
}

function itemKey(it) {
  const st = it.stencil;
  const s = st ? `${st.ref},${st.func},${st.op},${st.read},${st.write},${st.colorWrite}` : '-';
  const c = it.clip ? it.clip.join(',') : '-';
  return `${it.sdf ? 'S' + it.sdf.id + '@' + it.sdf.version : 'U'}|${it.texture?.uuid}|${s}|${c}|${it.additive ? 1 : 0}`;
}

export const UIRenderer = {
  scene: new THREE.Scene(),
  camera: new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1),
  pools: { ui: [], sdf: [] },
  stats: { batches: 0, items: 0 },

  render(renderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    UISystem.setScreen(size.x, size.y);
    const items = UISystem.collect();
    // group consecutive compatible items
    const batches = [];
    let cur = null;
    let curKey = null;
    for (const it of items) {
      if (!it.mesh || !it.mesh.idx.length) continue;
      const a = it.alpha * it.color.a;
      if (a <= 0 && !it.stencil) continue;
      const key = itemKey(it);
      if (!cur || key !== curKey) {
        cur = { items: [], sdf: it.sdf, texture: it.texture, stencil: it.stencil, clip: it.clip, additive: it.additive, nv: 0, ni: 0 };
        batches.push(cur);
        curKey = key;
      }
      cur.items.push(it);
      cur.nv += it.mesh.vertCount;
      cur.ni += it.mesh.idx.length;
    }
    for (const p of Object.values(this.pools)) for (const b of p) b.mesh.visible = false;
    const used = { ui: 0, sdf: 0 };
    let order = 0;
    for (const bt of batches) {
      const kind = bt.sdf ? 'sdf' : 'ui';
      const pool = this.pools[kind];
      let b = pool[used[kind]++];
      if (!b) {
        b = new Batch(kind === 'sdf');
        pool.push(b);
        this.scene.add(b.mesh);
      }
      b.ensure(bt.nv, bt.ni);
      this.fill(b, bt);
      b.mesh.visible = true;
      b.mesh.renderOrder = order++;
      this.setupMaterial(b, bt, size);
    }
    this.stats.batches = batches.length;
    this.stats.items = items.length;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearStencil();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  },

  fill(b, bt) {
    let v = 0;
    let n = 0;
    const { pos, uv, col, idx } = b;
    for (const it of bt.items) {
      const m = it.mesh;
      const e = it.matrix.elements;
      const a = it.alpha;
      const cr = it.color;
      const base = v;
      const nv = m.vertCount;
      const sy = Math.hypot(e[4], e[5]);
      for (let i = 0; i < nv; i++) {
        const x = m.pos[i * 2];
        const y = m.pos[i * 2 + 1];
        pos[v * 3] = e[0] * x + e[4] * y + e[12];
        pos[v * 3 + 1] = e[1] * x + e[5] * y + e[13];
        pos[v * 3 + 2] = 0;
        uv[v * 2] = m.uv[i * 2];
        uv[v * 2 + 1] = m.uv[i * 2 + 1];
        col[v * 4] = m.col[i * 4] * cr.r;
        col[v * 4 + 1] = m.col[i * 4 + 1] * cr.g;
        col[v * 4 + 2] = m.col[i * 4 + 2] * cr.b;
        col[v * 4 + 3] = m.col[i * 4 + 3] * cr.a * a;
        if (b.sdf) b.xs[v] = (m.extra?.[i] ?? 1) * sy;
        v++;
      }
      for (let i = 0; i < m.idx.length; i++) idx[n++] = m.idx[i] + base;
    }
    const g = b.geo;
    for (const k of ['position', 'uv', 'color', 'xscale']) {
      const at = g.attributes[k];
      if (!at) continue;
      at.needsUpdate = true;
      at.clearUpdateRanges?.();
      at.addUpdateRange?.(0, v * at.itemSize);
    }
    g.index.needsUpdate = true;
    g.index.clearUpdateRanges?.();
    g.index.addUpdateRange?.(0, n);
    g.setDrawRange(0, n);
  },

  setupMaterial(b, bt, size) {
    const m = b.material;
    const u = m.uniforms;
    u.map.value = bt.texture || getWhiteTexture();
    u.uScreen.value.set(size.x, size.y);
    if (bt.clip) {
      u.uClipOn.value = 1;
      u.uClip.value.set(bt.clip[0], bt.clip[1], bt.clip[2], bt.clip[3]);
    } else u.uClipOn.value = 0;
    u.uAdditive.value = bt.additive ? 1 : 0;
    const st = bt.stencil;
    if (st) {
      m.stencilWrite = true;
      m.stencilFunc = STENCIL_FUNC[st.func];
      m.stencilRef = st.ref;
      m.stencilFuncMask = st.read;
      m.stencilWriteMask = st.write;
      m.stencilFail = THREE.KeepStencilOp;
      m.stencilZFail = THREE.KeepStencilOp;
      m.stencilZPass = STENCIL_OP[st.op];
      m.colorWrite = st.colorWrite;
      u.uAlphaClip.value = st.op !== 'keep' ? 1 : 0;
    } else {
      m.stencilWrite = false;
      m.colorWrite = true;
      u.uAlphaClip.value = 0;
    }
    if (bt.additive) {
      m.blendDst = THREE.OneFactor;
    } else m.blendDst = THREE.OneMinusSrcAlphaFactor;
    const s = bt.sdf;
    if (s) {
      const v4 = (k, c) => u[k].value.set(c.r, c.g, c.b, c.a);
      v4('uFaceColor', s.faceColor);
      v4('uOutlineColor', s.outlineColor);
      v4('uUnderlayColor', s.underlayColor);
      v4('uGlowColor', s.glowColor);
      u.uGradientScale.value = s.gradientScale;
      u.uSharpness.value = s.sharpness;
      u.uWeightNormal.value = s.weightNormal;
      u.uWeightBold.value = s.weightBold;
      u.uFaceDilate.value = s.faceDilate;
      u.uScaleRatioA.value = s.scaleRatioA;
      u.uScaleRatioB.value = s.scaleRatioB;
      u.uScaleRatioC.value = s.scaleRatioC;
      u.uOutlineWidth.value = s.outlineWidth;
      u.uOutlineSoftness.value = s.outlineSoftness;
      u.uGlowOn.value = s.glow ? 1 : 0;
      u.uGlowOffset.value = s.glowOffset;
      u.uGlowInner.value = s.glowInner;
      u.uGlowOuter.value = s.glowOuter;
      u.uGlowPower.value = s.glowPower;
      u.uUnderlayOn.value = s.underlay ? 1 : 0;
      u.uUnderlaySoftness.value = s.underlaySoftness;
      u.uUnderlayDilate.value = s.underlayDilate;
      u.uUnderlayOffsetX.value = s.underlayOffsetX;
      u.uUnderlayOffsetY.value = s.underlayOffsetY;
      const img = bt.texture?.image;
      u.uTexW.value = img?.width || s.texW;
      u.uTexH.value = img?.height || s.texH;
      u.uMobile.value = s.kind === 'mobile' ? 1 : 0;
    }
  },
};
