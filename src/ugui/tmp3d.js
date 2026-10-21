// TextMeshPro (3D component): the TMP layout of tmp.js rendered as a mesh in the three.js scene with the
// Distance Field shader (pixel size from the perspective projection, like TMP_SDF's vertex shader).
import * as THREE from 'three';
import { registerComponent } from '../engine/instantiate.js';
import { getWhiteTexture } from '../engine/assets.js';
import { Render } from '../engine/render.js';
import { TMP_Text } from './tmp.js';
import { FS_SDF } from './render.js';

const VS_SDF3D = /* glsl */ `
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
    vPos = vec2(0.0);
    vec4 vPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vPosition;
    vec2 pixelSize = vec2(vPosition.w) / abs(vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * uScreen);
    float scale = inversesqrt(dot(pixelSize, pixelSize));
    scale *= abs(xscale) * uGradientScale * (uSharpness + 1.0);
    float bold = step(xscale, 0.0);
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

const FLOATS = ['uGradientScale', 'uSharpness', 'uWeightNormal', 'uWeightBold', 'uFaceDilate', 'uScaleRatioA', 'uScaleRatioB', 'uScaleRatioC', 'uOutlineWidth', 'uOutlineSoftness', 'uGlowOn', 'uGlowOffset', 'uGlowInner', 'uGlowOuter', 'uGlowPower', 'uUnderlayOn', 'uUnderlaySoftness', 'uUnderlayDilate', 'uUnderlayOffsetX', 'uUnderlayOffsetY', 'uTexW', 'uTexH', 'uMobile', 'uClipOn'];

function makeMaterial(overlay) {
  const uniforms = { map: { value: null }, uScreen: { value: new THREE.Vector2(1, 1) }, uClip: { value: new THREE.Vector4() }, uSoftness: { value: new THREE.Vector2() } };
  for (const k of FLOATS) uniforms[k] = { value: 0 };
  for (const k of ['uFaceColor', 'uOutlineColor', 'uUnderlayColor', 'uGlowColor']) uniforms[k] = { value: new THREE.Vector4(1, 1, 1, 1) };
  return new THREE.ShaderMaterial({
    vertexShader: VS_SDF3D,
    fragmentShader: FS_SDF,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: !overlay,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

const _size = new THREE.Vector2();

export class TextMeshPro extends TMP_Text {
  static typeName = 'TextMeshPro';

  constructor() {
    super();
    this.m_isOrthographic = 0;
    this._mesh3d = null;
  }

  ensure3D() {
    if (this._mesh3d) return this._mesh3d;
    const geo = new THREE.BufferGeometry();
    const mat = makeMaterial(this.renderMaterial?.kind === 'overlay');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3000;
    mesh.onBeforeRender = () => this.updateUniforms();
    this.transform.obj.add(mesh);
    this._mesh3d = mesh;
    return mesh;
  }

  OnEnable() {
    super.OnEnable?.();
    if (this._mesh3d) this._mesh3d.visible = true;
  }

  OnDisable() {
    if (this._mesh3d) this._mesh3d.visible = false;
  }

  OnDestroy() {
    if (!this._mesh3d) return;
    this._mesh3d.removeFromParent();
    this._mesh3d.geometry.dispose();
    this._mesh3d.material.dispose();
    this._mesh3d = null;
  }

  LateUpdate() {
    const calls = this.getDrawCalls();
    const call = calls.find((c) => c.sdf);
    const mesh = this.ensure3D();
    mesh.visible = this.gameObject.activeInHierarchy && !!call;
    if (!call) return;
    const m = call.mesh;
    const n = m.vertCount;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const xs = new Float32Array(n);
    const lossy = this.transform.lossyScale.y;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = m.pos[i * 2];
      pos[i * 3 + 1] = m.pos[i * 2 + 1];
      xs[i] = (m.extra?.[i] ?? 1) * Math.abs(lossy);
    }
    for (let i = 0; i < n * 4; i++) col[i] = m.col[i];
    const g = mesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(m.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setAttribute('xscale', new THREE.BufferAttribute(xs, 1));
    g.setIndex(m.idx.slice());
    this._call = call;
  }

  updateUniforms() {
    const call = this._call;
    const s = call?.sdf;
    if (!s || !this._mesh3d) return;
    const u = this._mesh3d.material.uniforms;
    u.map.value = call.texture || getWhiteTexture();
    Render.renderer.getDrawingBufferSize(_size);
    u.uScreen.value.copy(_size);
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
    const img = call.texture?.image;
    u.uTexW.value = img?.width || s.texW;
    u.uTexH.value = img?.height || s.texH;
    u.uMobile.value = s.kind === 'mobile' ? 1 : 0;
    u.uClipOn.value = 0;
  }
}

registerComponent(TextMeshPro);
