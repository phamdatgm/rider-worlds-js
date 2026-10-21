// URP 12 Bloom + Uber composite for a Gamma color space project (PostProcessPass.SetupBloom / Bloom.shader /
// UberPost.shader): prefilter (threshold + soft knee) at half resolution, gaussian pyramid (9-tap H with 2x
// downsample, 5-tap bilinear V), upsample with lerp(high, low, scatter), then
// out = LinearToSRGB(SRGBToLinear(scene) + bloom * intensity).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PREFILTER = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec4 uParams; // scatter, clamp, threshold, knee
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(tSource, vUv).rgb;
    color = min(vec3(uParams.y), color);
    float brightness = max(color.r, max(color.g, color.b));
    float softness = clamp(brightness - uParams.z + uParams.w, 0.0, 2.0 * uParams.w);
    softness = (softness * softness) / (4.0 * uParams.w + 1e-4);
    float multiplier = max(brightness - uParams.z, softness) / max(brightness, 1e-4);
    color *= multiplier;
    gl_FragColor = vec4(max(color, 0.0), 1.0);
  }`;

const BLUR_H = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uTexel; // source texel size
  varying vec2 vUv;
  vec3 s(float o) { return texture2D(tSource, vUv + vec2(o, 0.0)).rgb; }
  void main() {
    float t = uTexel.x * 2.0;
    vec3 c = s(-t * 4.0) * 0.01621622 + s(-t * 3.0) * 0.05405405 + s(-t * 2.0) * 0.12162162 + s(-t) * 0.19459459
      + s(0.0) * 0.22702703 + s(t) * 0.19459459 + s(t * 2.0) * 0.12162162 + s(t * 3.0) * 0.05405405 + s(t * 4.0) * 0.01621622;
    gl_FragColor = vec4(c, 1.0);
  }`;

const BLUR_V = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 s(float o) { return texture2D(tSource, vUv + vec2(0.0, o)).rgb; }
  void main() {
    float t = uTexel.y;
    vec3 c = s(-t * 3.23076923) * 0.07027027 + s(-t * 1.38461538) * 0.31621622 + s(0.0) * 0.22702703
      + s(t * 1.38461538) * 0.31621622 + s(t * 3.23076923) * 0.07027027;
    gl_FragColor = vec4(c, 1.0);
  }`;

const UPSAMPLE = /* glsl */ `
  uniform sampler2D tSource;
  uniform sampler2D tLow;
  uniform float uScatter;
  varying vec2 vUv;
  void main() {
    vec3 high = texture2D(tSource, vUv).rgb;
    vec3 low = texture2D(tLow, vUv).rgb;
    gl_FragColor = vec4(mix(high, low, uScatter), 1.0);
  }`;

const UBER = /* glsl */ `
  uniform sampler2D tSource;
  uniform sampler2D tBloom;
  uniform float uIntensity;
  uniform float uBloomOn;
  varying vec2 vUv;
  vec3 srgbToLinear(vec3 c) {
    c = min(c, vec3(100.0));
    vec3 lo = c / 12.92;
    vec3 hi = pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
    return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.04045))));
  }
  vec3 linearToSrgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
  }
  void main() {
    vec3 color = srgbToLinear(texture2D(tSource, vUv).rgb);
    if (uBloomOn > 0.5) color += texture2D(tBloom, vUv).rgb * uIntensity;
    gl_FragColor = vec4(clamp(linearToSrgb(color), 0.0, 1.0), 1.0);
  }`;

const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });

export class URPBloomPass extends Pass {
  /** settings of the "Bloom" volume component */
  constructor({ threshold = 1, intensity = 1.5, scatter = 0.5, clamp = 65472, skipIterations = 0 } = {}) {
    super();
    this.threshold = threshold;
    this.intensity = intensity;
    this.scatter = scatter;
    this.clampMax = clamp;
    this.skipIterations = skipIterations;
    this.bloomEnabled = true;
    this.needsSwap = false;
    this.quad = new FullScreenQuad(null);
    this.prefilter = mat(PREFILTER, { tSource: { value: null }, uParams: { value: new THREE.Vector4() } });
    this.blurH = mat(BLUR_H, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.blurV = mat(BLUR_V, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upsample = mat(UPSAMPLE, { tSource: { value: null }, tLow: { value: null }, uScatter: { value: 0.5 } });
    this.uber = mat(UBER, { tSource: { value: null }, tBloom: { value: null }, uIntensity: { value: 1.5 }, uBloomOn: { value: 1 } });
    this.down = [];
    this.up = [];
    this.w = 0;
    this.h = 0;
  }

  rt(w, h) {
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }

  setSize(width, height) {
    if (width === this.w && height === this.h) return;
    this.w = width;
    this.h = height;
    for (const r of [...this.down, ...this.up]) r?.dispose();
    let tw = width >> 1;
    let th = height >> 1;
    const iterations = Math.floor(Math.log2(Math.max(tw, th)) - 1) - this.skipIterations;
    this.mipCount = Math.max(1, Math.min(iterations, 16));
    this.down = [];
    this.up = [];
    for (let i = 0; i < this.mipCount; i++) {
      this.down.push(this.rt(tw, th));
      this.up.push(this.rt(tw, th));
      tw = Math.max(1, tw >> 1);
      th = Math.max(1, th >> 1);
    }
  }

  blit(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const src = readBuffer.texture;
    if (this.bloomEnabled) {
      const threshold = this.threshold; // GammaToLinearSpace(threshold) in a gamma project: unchanged for 1
      this.prefilter.uniforms.tSource.value = src;
      this.prefilter.uniforms.uParams.value.set(0, this.clampMax, threshold, threshold * 0.5);
      this.blit(renderer, this.prefilter, this.down[0]);
      let last = this.down[0];
      for (let i = 1; i < this.mipCount; i++) {
        this.blurH.uniforms.tSource.value = last.texture;
        this.blurH.uniforms.uTexel.value.set(1 / last.width, 1 / last.height);
        this.blit(renderer, this.blurH, this.up[i]);
        this.blurV.uniforms.tSource.value = this.up[i].texture;
        this.blurV.uniforms.uTexel.value.set(1 / this.up[i].width, 1 / this.up[i].height);
        this.blit(renderer, this.blurV, this.down[i]);
        last = this.down[i];
      }
      const scatter = 0.05 + (0.95 - 0.05) * this.scatter;
      for (let i = this.mipCount - 2; i >= 0; i--) {
        const low = i === this.mipCount - 2 ? this.down[i + 1] : this.up[i + 1];
        this.upsample.uniforms.tSource.value = this.down[i].texture;
        this.upsample.uniforms.tLow.value = low.texture;
        this.upsample.uniforms.uScatter.value = scatter;
        this.blit(renderer, this.upsample, this.up[i]);
      }
    }
    this.uber.uniforms.tSource.value = src;
    this.uber.uniforms.tBloom.value = (this.mipCount > 1 ? this.up[0] : this.down[0]).texture;
    this.uber.uniforms.uIntensity.value = this.intensity;
    this.uber.uniforms.uBloomOn.value = this.bloomEnabled ? 1 : 0;
    this.blit(renderer, this.uber, this.renderToScreen ? null : writeBuffer);
  }
}
