// Unity-style math helpers (Mathf, Vector2 ops, AnimationCurve, Gradient).
import * as THREE from 'three';

export const Deg2Rad = Math.PI / 180;
export const Rad2Deg = 180 / Math.PI;

export const Mathf = {
  Clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  Clamp01: (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
  Lerp: (a, b, t) => a + (b - a) * Mathf.Clamp01(t),
  LerpUnclamped: (a, b, t) => a + (b - a) * t,
  InverseLerp: (a, b, v) => (a !== b ? Mathf.Clamp01((v - a) / (b - a)) : 0),
  MoveTowards: (cur, target, maxDelta) =>
    Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta,
  Approximately: (a, b) => Math.abs(b - a) < Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), 1e-6 * 8),
  Repeat: (t, length) => Mathf.Clamp(t - Math.floor(t / length) * length, 0, length),
  PingPong: (t, length) => {
    t = Mathf.Repeat(t, length * 2);
    return length - Math.abs(t - length);
  },
  DeltaAngle: (a, b) => {
    let d = Mathf.Repeat(b - a, 360);
    if (d > 180) d -= 360;
    return d;
  },
  FloorToInt: Math.floor,
  Sign: (v) => (v >= 0 ? 1 : -1),
};

// ---------------------------------------------------------------- Vector2 helpers (plain {x,y})

export function v2(x = 0, y = 0) {
  if (Array.isArray(x)) return new THREE.Vector2(x[0] || 0, x[1] || 0);
  if (typeof x === 'object' && x !== null) return new THREE.Vector2(x.x, x.y);
  return new THREE.Vector2(x, y);
}

export function v3(x = 0, y = 0, z = 0) {
  if (Array.isArray(x)) return new THREE.Vector3(x[0] || 0, x[1] || 0, x[2] || 0);
  return new THREE.Vector3(x, y, z);
}

/** Unsigned angle in degrees between two 2D vectors (Vector2.Angle). */
export function angle2(a, b) {
  const d = Math.sqrt((a.x * a.x + a.y * a.y) * (b.x * b.x + b.y * b.y));
  if (d < 1e-15) return 0;
  const dot = Mathf.Clamp((a.x * b.x + a.y * b.y) / d, -1, 1);
  return Math.acos(dot) * Rad2Deg;
}

export function perpendicularClockwise(v) {
  return new THREE.Vector2(v.y, -v.x);
}

export function rotate2(v, deg) {
  const r = deg * Deg2Rad;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return new THREE.Vector2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// ---------------------------------------------------------------- rotations

const _qa = new THREE.Quaternion();
const _ax = new THREE.Vector3();

/** Quaternion for a rotation of `deg` degrees about Z (same in Unity and in our mirrored space). */
export function quatZ(deg, out = new THREE.Quaternion()) {
  return out.setFromAxisAngle(_ax.set(0, 0, 1), deg * Deg2Rad);
}

/** Unity `transform.eulerAngles.z` (ZXY order) for a quaternion in our mirrored space. */
export function eulerZ(q) {
  // convert back to Unity handedness: (x,y,z,w) -> (-x,-y,z,w)
  const x = -q.x;
  const y = -q.y;
  const z = q.z;
  const w = q.w;
  // Unity Euler order: Z first, then X, then Y (q = Qy * Qx * Qz). z = atan2(2(xy + wz), 1 - 2(x^2 + z^2))
  let deg = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * Rad2Deg;
  if (deg < 0) deg += 360;
  return deg;
}

/** Unity Quaternion.Euler(x, y, z) converted into our mirrored three.js space. */
export function unityEuler(xDeg, yDeg, zDeg, out = new THREE.Quaternion()) {
  const e = new THREE.Euler(-xDeg * Deg2Rad, -yDeg * Deg2Rad, zDeg * Deg2Rad, 'YXZ');
  return out.setFromEuler(e);
}

export function lerpAngleDeg(a, b, t) {
  return a + Mathf.DeltaAngle(a, b) * Mathf.Clamp01(t);
}

// ---------------------------------------------------------------- AnimationCurve

export class AnimationCurve {
  /** keys: [[time, value, inSlope, outSlope, (inWeight, outWeight, weightedMode)], ...] */
  constructor(keys = [], pre = 2, post = 2) {
    this.keys = keys.map((k) => ({
      time: k[0],
      value: k[1],
      inSlope: parseSlope(k[2]),
      outSlope: parseSlope(k[3]),
    }));
    this.pre = pre;
    this.post = post;
  }

  static from(json) {
    if (json instanceof AnimationCurve) return json;
    if (!json || !json.$curve) return new AnimationCurve([[0, 0, 0, 0], [1, 1, 0, 0]]);
    return new AnimationCurve(json.$curve, json.pre, json.post);
  }

  static Linear(t0, v0, t1, v1) {
    const s = (v1 - v0) / (t1 - t0);
    return new AnimationCurve([[t0, v0, s, s], [t1, v1, s, s]]);
  }

  get length() {
    return this.keys.length;
  }

  Evaluate(t) {
    const keys = this.keys;
    const n = keys.length;
    if (n === 0) return 0;
    if (n === 1) return keys[0].value;
    const first = keys[0].time;
    const last = keys[n - 1].time;
    const range = last - first;
    if (t < first) t = wrapTime(t, first, last, range, this.pre);
    else if (t > last) t = wrapTime(t, first, last, range, this.post);
    if (t <= first) return keys[0].value;
    if (t >= last) return keys[n - 1].value;
    // binary search
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (keys[mid].time <= t) lo = mid;
      else hi = mid;
    }
    return hermite(keys[lo], keys[hi], t);
  }
}

function parseSlope(s) {
  if (s === 'Infinity') return Infinity;
  if (s === '-Infinity') return -Infinity;
  return s || 0;
}

function wrapTime(t, first, last, range, mode) {
  if (range <= 0) return first;
  // Unity internal wrap: 0 ping-pong, 1 repeat, 2 clamp
  if (mode === 1) return first + Mathf.Repeat(t - first, range);
  if (mode === 0) return first + Mathf.PingPong(t - first, range);
  return t < first ? first : last;
}

function hermite(k0, k1, t) {
  const dt = k1.time - k0.time;
  if (dt <= 0) return k0.value;
  if (!Number.isFinite(k0.outSlope) || !Number.isFinite(k1.inSlope)) return k0.value;
  const u = (t - k0.time) / dt;
  const m0 = k0.outSlope * dt;
  const m1 = k1.inSlope * dt;
  const u2 = u * u;
  const u3 = u2 * u;
  const a = 2 * u3 - 3 * u2 + 1;
  const b = u3 - 2 * u2 + u;
  const c = -2 * u3 + 3 * u2;
  const d = u3 - u2;
  return a * k0.value + b * m0 + c * k1.value + d * m1;
}

// ---------------------------------------------------------------- Gradient

export class Gradient {
  constructor(colorKeys = [[0, 1, 1, 1], [1, 1, 1, 1]], alphaKeys = [[0, 1], [1, 1]], mode = 0) {
    this.colorKeys = colorKeys;
    this.alphaKeys = alphaKeys;
    this.mode = mode;
  }

  static from(json) {
    if (json instanceof Gradient) return json;
    if (!json || !json.$grad) return new Gradient();
    return new Gradient(json.$grad, json.a, json.mode);
  }

  /** Returns [r,g,b,a]. */
  Evaluate(t, out = [0, 0, 0, 0]) {
    const c = sampleKeys(this.colorKeys, t, 3, this.mode);
    const a = sampleKeys(this.alphaKeys, t, 1, this.mode);
    out[0] = c[0];
    out[1] = c[1];
    out[2] = c[2];
    out[3] = a[0];
    return out;
  }
}

function sampleKeys(keys, t, dim, mode) {
  if (!keys || keys.length === 0) return dim === 3 ? [1, 1, 1] : [1];
  if (t <= keys[0][0]) return keys[0].slice(1, 1 + dim);
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last.slice(1, 1 + dim);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const k0 = keys[i - 1];
      const k1 = keys[i];
      if (mode === 1) return k1.slice(1, 1 + dim);
      const f = (t - k0[0]) / Math.max(k1[0] - k0[0], 1e-6);
      const out = [];
      for (let d = 1; d <= dim; d++) out.push(k0[d] + (k1[d] - k0[d]) * f);
      return out;
    }
  }
  return last.slice(1, 1 + dim);
}

// ---------------------------------------------------------------- random (System.Random-like, seeded)

export class SeededRandom {
  constructor(seed = (Math.random() * 0x7fffffff) | 0) {
    this.s = (seed >>> 0) || 1;
  }

  /** float in [0,1) — mulberry32 */
  NextDouble() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** int in [min, max) */
  Next(min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return min + Math.floor(this.NextDouble() * (max - min));
  }
}

export const Random = {
  Range(min, max) {
    return min + Math.random() * (max - min);
  },
  RangeInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
  },
};

export function pickRandom(list, rng) {
  if (!list || list.length === 0) return null;
  const i = rng ? rng.Next(0, list.length) : Math.floor(Math.random() * list.length);
  return list[i];
}

export function hashString(s) {
  // C#-like deterministic string hash (not identical to .NET but stable)
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
