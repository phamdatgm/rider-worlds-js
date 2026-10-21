// DOTween subset used by the game: tweeners with DOTween's eases / loops / callbacks, sequences, punch &
// shake, the shortcut extension methods (transform.DOScale...) and the DOTweenAnimation component.
import * as THREE from 'three';
import { MonoBehaviour, Transform } from '../engine/scene.js';
import { Time, EventAction } from '../engine/core.js';
import { registerComponent } from '../engine/instantiate.js';
import { AnimationCurve, unityEuler, eulerZ } from '../engine/math.js';
import { Graphic, Image, Color } from './graphic.js';

// ---------------------------------------------------------------- eases (DG.Tweening.Core.Easing.EaseManager)

export const Ease = {
  Unset: 0, Linear: 1, InSine: 2, OutSine: 3, InOutSine: 4, InQuad: 5, OutQuad: 6, InOutQuad: 7, InCubic: 8, OutCubic: 9, InOutCubic: 10,
  InQuart: 11, OutQuart: 12, InOutQuart: 13, InQuint: 14, OutQuint: 15, InOutQuint: 16, InExpo: 17, OutExpo: 18, InOutExpo: 19,
  InCirc: 20, OutCirc: 21, InOutCirc: 22, InElastic: 23, OutElastic: 24, InOutElastic: 25, InBack: 26, OutBack: 27, InOutBack: 28,
  InBounce: 29, OutBounce: 30, InOutBounce: 31, Flash: 32, InFlash: 33, OutFlash: 34, InOutFlash: 35, INTERNAL_Zero: 36, INTERNAL_Custom: 37,
};
export const LoopType = { Restart: 0, Yoyo: 1, Incremental: 2 };

const PI_2 = Math.PI / 2;
const TWO_PI = Math.PI * 2;

function bounceOut(t, d) {
  if ((t /= d) < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

/** EaseManager.Evaluate(ease, time, duration, overshootOrAmplitude, period) */
export function evaluateEase(ease, time, duration, s = 1.70158, period = 0) {
  if (ease instanceof AnimationCurve) return ease.Evaluate(time / duration);
  if (typeof ease === 'function') return ease(time, duration, s, period);
  switch (ease) {
    case Ease.Linear:
      return time / duration;
    case Ease.InSine:
      return -Math.cos((time / duration) * PI_2) + 1;
    case Ease.OutSine:
      return Math.sin((time / duration) * PI_2);
    case Ease.InOutSine:
      return -0.5 * (Math.cos((Math.PI * time) / duration) - 1);
    case Ease.InQuad:
      return (time /= duration) * time;
    case Ease.InOutQuad:
      if ((time /= duration * 0.5) < 1) return 0.5 * time * time;
      return -0.5 * (--time * (time - 2) - 1);
    case Ease.InCubic:
      return (time /= duration) * time * time;
    case Ease.OutCubic:
      return (time = time / duration - 1) * time * time + 1;
    case Ease.InOutCubic:
      if ((time /= duration * 0.5) < 1) return 0.5 * time * time * time;
      return 0.5 * ((time -= 2) * time * time + 2);
    case Ease.InQuart:
      return (time /= duration) * time * time * time;
    case Ease.OutQuart:
      return -((time = time / duration - 1) * time * time * time - 1);
    case Ease.InOutQuart:
      if ((time /= duration * 0.5) < 1) return 0.5 * time * time * time * time;
      return -0.5 * ((time -= 2) * time * time * time - 2);
    case Ease.InQuint:
      return (time /= duration) * time * time * time * time;
    case Ease.OutQuint:
      return (time = time / duration - 1) * time * time * time * time + 1;
    case Ease.InOutQuint:
      if ((time /= duration * 0.5) < 1) return 0.5 * time * time * time * time * time;
      return 0.5 * ((time -= 2) * time * time * time * time + 2);
    case Ease.InExpo:
      return time === 0 ? 0 : 2 ** (10 * (time / duration - 1));
    case Ease.OutExpo:
      if (time === duration) return 1;
      return -(2 ** ((-10 * time) / duration)) + 1;
    case Ease.InOutExpo:
      if (time === 0) return 0;
      if (time === duration) return 1;
      if ((time /= duration * 0.5) < 1) return 0.5 * 2 ** (10 * (time - 1));
      return 0.5 * (-(2 ** (-10 * --time)) + 2);
    case Ease.InCirc:
      return -(Math.sqrt(1 - (time /= duration) * time) - 1);
    case Ease.OutCirc:
      return Math.sqrt(1 - (time = time / duration - 1) * time);
    case Ease.InOutCirc:
      if ((time /= duration * 0.5) < 1) return -0.5 * (Math.sqrt(1 - time * time) - 1);
      return 0.5 * (Math.sqrt(1 - (time -= 2) * time) + 1);
    case Ease.InElastic: {
      if (time === 0) return 0;
      if ((time /= duration) === 1) return 1;
      if (period === 0) period = duration * 0.3;
      let s0;
      if (s < 1) {
        s = 1;
        s0 = period / 4;
      } else s0 = (period / TWO_PI) * Math.asin(1 / s);
      return -(s * 2 ** (10 * (time -= 1)) * Math.sin(((time * duration - s0) * TWO_PI) / period));
    }
    case Ease.OutElastic: {
      if (time === 0) return 0;
      if ((time /= duration) === 1) return 1;
      if (period === 0) period = duration * 0.3;
      let s1;
      if (s < 1) {
        s = 1;
        s1 = period / 4;
      } else s1 = (period / TWO_PI) * Math.asin(1 / s);
      return s * 2 ** (-10 * time) * Math.sin(((time * duration - s1) * TWO_PI) / period) + 1;
    }
    case Ease.InOutElastic: {
      if (time === 0) return 0;
      if ((time /= duration * 0.5) === 2) return 1;
      if (period === 0) period = duration * (0.3 * 1.5);
      let s2;
      if (s < 1) {
        s = 1;
        s2 = period / 4;
      } else s2 = (period / TWO_PI) * Math.asin(1 / s);
      if (time < 1) return -0.5 * (s * 2 ** (10 * (time -= 1)) * Math.sin(((time * duration - s2) * TWO_PI) / period));
      return s * 2 ** (-10 * (time -= 1)) * Math.sin(((time * duration - s2) * TWO_PI) / period) * 0.5 + 1;
    }
    case Ease.InBack:
      return (time /= duration) * time * ((s + 1) * time - s);
    case Ease.OutBack:
      return (time = time / duration - 1) * time * ((s + 1) * time + s) + 1;
    case Ease.InOutBack:
      if ((time /= duration * 0.5) < 1) return 0.5 * (time * time * (((s *= 1.525) + 1) * time - s));
      return 0.5 * ((time -= 2) * time * (((s *= 1.525) + 1) * time + s) + 2);
    case Ease.InBounce:
      return 1 - bounceOut(duration - time, duration);
    case Ease.OutBounce:
      return bounceOut(time, duration);
    case Ease.InOutBounce:
      if (time < duration * 0.5) return (1 - bounceOut(duration - time * 2, duration)) * 0.5;
      return bounceOut(time * 2 - duration, duration) * 0.5 + 0.5;
    case Ease.INTERNAL_Zero:
      return 1;
    case Ease.OutQuad:
    default:
      return -(time /= duration) * (time - 2);
  }
}

// ---------------------------------------------------------------- value helpers

function kindOf(v) {
  if (typeof v === 'number') return 'n';
  if (v instanceof Color) return 'c';
  if (v && v.isVector3) return 'v3';
  if (v && v.isVector2) return 'v2';
  if (v && 'r' in v && 'a' in v) return 'c';
  return 'n';
}

function lerpValue(kind, a, b, t) {
  switch (kind) {
    case 'v3':
      return new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    case 'v2':
      return new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    case 'c':
      return new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
    default:
      return a + (b - a) * t;
  }
}

function addValue(kind, a, b) {
  switch (kind) {
    case 'v3':
      return new THREE.Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
    case 'v2':
      return new THREE.Vector2(a.x + b.x, a.y + b.y);
    case 'c':
      return new Color(a.r + b.r, a.g + b.g, a.b + b.b, a.a + b.a);
    default:
      return a + b;
  }
}

function subValue(kind, a, b) {
  switch (kind) {
    case 'v3':
      return new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
    case 'v2':
      return new THREE.Vector2(a.x - b.x, a.y - b.y);
    case 'c':
      return new Color(a.r - b.r, a.g - b.g, a.b - b.b, a.a - b.a);
    default:
      return a - b;
  }
}

function cloneValue(v) {
  return v && typeof v === 'object' && v.clone ? v.clone() : v;
}

// ---------------------------------------------------------------- tweens

const allTweens = new Set();

export class Tween {
  constructor() {
    this.duration = 0;
    this.delay = 0;
    this.delayLeft = 0;
    this.loops = 1;
    this.loopType = LoopType.Restart;
    this.ease = Ease.OutQuad;
    this.overshoot = 1.70158;
    this.period = 0;
    this.unscaled = false;
    this.autoKill = true;
    this.target = null;
    this.id = null;
    this.active = true;
    this.playing = true;
    this.backwards = false;
    this.position = 0;
    this.completedLoops = 0;
    this.started = false;
    this.isComplete = false;
    this.cb = {};
    this.sequenced = false;
    allTweens.add(this);
  }

  // ---- settings (chainable)
  SetEase(e, overshoot, period) {
    this.ease = e;
    if (overshoot !== undefined) this.overshoot = overshoot;
    if (period !== undefined) this.period = period;
    return this;
  }

  SetDelay(d) {
    this.delay = d;
    this.delayLeft = d;
    return this;
  }

  SetLoops(n, type = LoopType.Restart) {
    this.loops = n;
    this.loopType = type;
    return this;
  }

  SetUpdate(a, b) {
    // SetUpdate(bool isIndependentUpdate) | SetUpdate(UpdateType, bool isIndependentUpdate)
    this.unscaled = typeof a === 'boolean' ? a : !!b;
    return this;
  }

  SetAutoKill(v = true) {
    this.autoKill = v;
    return this;
  }

  SetTarget(t) {
    this.target = t;
    return this;
  }

  SetId(id) {
    this.id = id;
    return this;
  }

  SetRelative(v = true) {
    this.relative = v;
    return this;
  }

  SetSpeedBased() {
    this.speedBased = true;
    return this;
  }

  OnComplete(f) {
    this.cb.complete = f;
    return this;
  }

  OnUpdate(f) {
    this.cb.update = f;
    return this;
  }

  OnKill(f) {
    this.cb.kill = f;
    return this;
  }

  OnStart(f) {
    this.cb.start = f;
    return this;
  }

  OnPlay(f) {
    this.cb.play = f;
    return this;
  }

  OnStepComplete(f) {
    this.cb.step = f;
    return this;
  }

  OnRewind(f) {
    this.cb.rewind = f;
    return this;
  }

  // ---- control
  Play() {
    if (!this.active) return this;
    if (!this.playing) {
      this.playing = true;
      this.cb.play?.();
    }
    return this;
  }

  Pause() {
    this.playing = false;
    return this;
  }

  TogglePause() {
    this.playing = !this.playing;
    return this;
  }

  PlayForward() {
    if (!this.active) return;
    this.backwards = false;
    this.isComplete = false;
    this.playing = true;
  }

  PlayBackwards() {
    if (!this.active) return;
    if (!this.started) this.startup();
    this.backwards = true;
    this.isComplete = false;
    this.playing = true;
  }

  Restart(includeDelay = true) {
    if (!this.active) return;
    this.backwards = false;
    this.completedLoops = 0;
    this.position = 0;
    this.isComplete = false;
    this.delayLeft = includeDelay ? this.delay : 0;
    if (this.started) this.apply();
    this.playing = true;
  }

  Rewind(includeDelay = true) {
    if (!this.active) return;
    this.playing = false;
    this.backwards = false;
    this.completedLoops = 0;
    this.position = 0;
    this.isComplete = false;
    this.delayLeft = includeDelay ? this.delay : 0;
    if (this.started) this.apply();
    this.cb.rewind?.();
  }

  Complete(withCallbacks = false) {
    if (!this.active || this.loops === -1) return;
    if (!this.started) this.startup();
    this.completedLoops = this.loops - 1;
    this.position = this.duration;
    this.apply();
    this.finish(withCallbacks || true);
  }

  Goto(time, andPlay = false) {
    if (!this.started) this.startup();
    const d = Math.max(this.duration, 1e-6);
    this.completedLoops = Math.floor(time / d);
    if (this.loops !== -1) this.completedLoops = Math.min(this.completedLoops, this.loops - 1);
    this.position = Math.min(d, time - this.completedLoops * d);
    this.delayLeft = 0;
    this.apply();
    this.playing = andPlay;
  }

  Kill(complete = false) {
    if (!this.active) return;
    if (complete) this.Complete();
    this.active = false;
    this.playing = false;
    allTweens.delete(this);
    this.cb.kill?.();
  }

  IsActive() {
    return this.active;
  }

  IsPlaying() {
    return this.active && this.playing;
  }

  IsComplete() {
    return this.isComplete;
  }

  IsInitialized() {
    return this.started;
  }

  IsBackwards() {
    return this.backwards;
  }

  Duration(includeLoops = true) {
    return includeLoops && this.loops > 0 ? this.duration * this.loops : this.duration;
  }

  Elapsed() {
    return this.position + this.completedLoops * this.duration;
  }

  ElapsedPercentage() {
    return this.duration > 0 ? this.position / this.duration : 1;
  }

  /** yield in a coroutine until the tween completes or is killed */
  WaitForCompletion() {
    return { wait: () => !this.active || this.isComplete };
  }

  // ---- internals
  startup() {
    this.started = true;
  }

  eased() {
    const d = this.duration;
    let p = this.position;
    if (this.loopType === LoopType.Yoyo && this.completedLoops % 2 === 1) p = d - p;
    if (d <= 0) return 1;
    return evaluateEase(this.ease, Math.min(Math.max(p, 0), d), d, this.overshoot, this.period);
  }

  apply() {}

  finish(callbacks = true) {
    this.isComplete = true;
    this.playing = false;
    if (callbacks) {
      this.cb.step?.();
      this.cb.complete?.();
    }
    if (this.autoKill) this.Kill();
  }

  tick(dt) {
    if (!this.active || !this.playing) return;
    if (this.target && (this.target._destroyed || this.target.gameObject?._destroyed)) {
      this.Kill();
      return;
    }
    if (!this.backwards && this.delayLeft > 0) {
      this.delayLeft -= dt;
      if (this.delayLeft > 0) return;
      dt = -this.delayLeft;
      this.delayLeft = 0;
    }
    if (!this.started) {
      this.startup();
      this.cb.start?.();
    }
    const d = this.duration;
    if (!this.backwards) {
      this.position += dt;
      while (d > 0 && this.position >= d && (this.loops === -1 || this.completedLoops < this.loops - 1)) {
        this.position -= d;
        this.completedLoops++;
        this.onLoop?.();
        this.cb.step?.();
      }
      if (this.loops !== -1 && this.completedLoops >= this.loops - 1 && this.position >= d) {
        this.position = d;
        this.apply();
        this.cb.update?.();
        this.finish();
        return;
      }
    } else {
      this.position -= dt;
      while (this.position < 0 && this.completedLoops > 0) {
        this.position += d;
        this.completedLoops--;
      }
      if (this.position <= 0) {
        this.position = 0;
        this.apply();
        this.cb.update?.();
        this.playing = false;
        this.cb.rewind?.();
        return;
      }
    }
    this.apply();
    this.cb.update?.();
  }
}

export class Tweener extends Tween {
  constructor(getter, setter, endValue, duration) {
    super();
    this.getter = getter;
    this.setter = setter;
    this.endValue = cloneValue(endValue);
    this.duration = duration;
    this.kind = kindOf(endValue);
  }

  startup() {
    super.startup();
    if (this.fromApplied) return;
    this.startValue = cloneValue(this.getter());
    if (this.relative) this.endValue = addValue(this.kind, this.startValue, this.endValue);
  }

  /** change to a FROM tween: jumps to the from value immediately and tweens back to the current one */
  From(isRelative = false) {
    const cur = cloneValue(this.getter());
    const from = isRelative ? addValue(this.kind, cur, this.endValue) : this.endValue;
    this.startValue = from;
    this.endValue = cur;
    this.fromApplied = true;
    this.started = true;
    this.setter(cloneValue(from));
    return this;
  }

  ChangeEndValue(v, snapStart = false) {
    this.endValue = cloneValue(v);
    if (snapStart) this.startValue = cloneValue(this.getter());
    return this;
  }

  onLoop() {
    if (this.loopType === LoopType.Incremental) {
      const delta = subValue(this.kind, this.endValue, this.startValue);
      this.startValue = this.endValue;
      this.endValue = addValue(this.kind, this.endValue, delta);
    }
  }

  apply() {
    if (!this.started) return;
    this.setter(lerpValue(this.kind, this.startValue, this.endValue, this.eased()));
  }
}

/** DOTween.ToArray-like path tween (punch / shake): values relative to the start value */
class ArrayTweener extends Tweener {
  constructor(getter, setter, points, durations) {
    super(getter, setter, points[points.length - 1], durations.reduce((a, b) => a + b, 0));
    this.points = points;
    this.durations = durations;
  }

  startup() {
    this.started = true;
    this.startValue = cloneValue(this.getter());
  }

  apply() {
    if (!this.started) return;
    let t = this.position;
    let prev = new THREE.Vector3();
    for (let i = 0; i < this.points.length; i++) {
      const d = this.durations[i];
      if (t <= d || i === this.points.length - 1) {
        const k = d > 0 ? evaluateEase(this.ease, Math.min(t, d), d, this.overshoot, this.period) : 1;
        const p = this.points[i];
        const v = new THREE.Vector3(prev.x + (p.x - prev.x) * k, prev.y + (p.y - prev.y) * k, prev.z + (p.z - prev.z) * k);
        const s = this.startValue;
        this.setter(s.isVector2 ? new THREE.Vector2(s.x + v.x, s.y + v.y) : new THREE.Vector3(s.x + v.x, s.y + v.y, (s.z || 0) + v.z));
        return;
      }
      t -= d;
      prev = this.points[i];
    }
  }
}

function clampMagnitude(v, max) {
  const l = v.length();
  return l > max && l > 0 ? v.clone().multiplyScalar(max / l) : v.clone();
}

function punchPoints(direction, duration, vibrato = 10, elasticity = 1) {
  elasticity = Math.max(0, Math.min(1, elasticity));
  let strength = direction.length();
  let n = Math.floor(vibrato * duration);
  if (n < 2) n = 2;
  const decay = strength / n;
  const durs = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = duration * ((i + 1) / n);
    sum += d;
    durs.push(d);
  }
  const mul = duration / sum;
  for (let i = 0; i < n; i++) durs[i] *= mul;
  const pts = [];
  for (let i = 0; i < n; i++) {
    if (i < n - 1) {
      if (i === 0) pts.push(direction.clone());
      else if (i % 2 !== 0) pts.push(clampMagnitude(direction, strength * elasticity).negate());
      else pts.push(clampMagnitude(direction, strength));
      strength -= decay;
    } else pts.push(new THREE.Vector3());
  }
  return [pts, durs];
}

function shakePoints(duration, strength, vibrato = 10, randomness = 90, fadeOut = true) {
  const s = strength.isVector3 ? strength : new THREE.Vector3(strength, strength, strength);
  let n = Math.floor(vibrato * duration);
  if (n < 2) n = 2;
  const decay = 1 / n;
  const durs = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = duration * ((i + 1) / n);
    sum += d;
    durs.push(d);
  }
  const mul = duration / sum;
  for (let i = 0; i < n; i++) durs[i] *= mul;
  let ang = Math.random() * 360;
  const pts = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    if (i < n - 1) {
      if (i > 0) ang = ang - 180 + (Math.random() * 2 - 1) * randomness;
      const r = (ang * Math.PI) / 180;
      pts.push(new THREE.Vector3(Math.cos(r) * s.x * k, Math.sin(r) * s.y * k, 0));
      if (fadeOut) k -= decay;
    } else pts.push(new THREE.Vector3());
  }
  return [pts, durs];
}

// ---------------------------------------------------------------- sequences

export class Sequence extends Tween {
  constructor() {
    super();
    this.items = []; // {start, tween} | {start, callback}
    this.ease = Ease.Linear;
    this.lastTime = 0;
  }

  _add(start, t) {
    if (t instanceof Tween) {
      t.sequenced = true;
      allTweens.delete(t);
      t.playing = false;
      t.autoKill = false;
      this.items.push({ start, tween: t });
      this.duration = Math.max(this.duration, start + t.delay + t.Duration());
    }
    return this;
  }

  Append(t) {
    const start = this.duration;
    this._add(start, t);
    this._lastStart = start;
    return this;
  }

  Join(t) {
    this._add(this._lastStart ?? 0, t);
    return this;
  }

  Insert(at, t) {
    this._add(at, t);
    this._lastStart = at;
    return this;
  }

  Prepend(t) {
    const d = t.delay + t.Duration();
    for (const it of this.items) it.start += d;
    this.items.unshift({ start: 0, tween: t });
    t.sequenced = true;
    allTweens.delete(t);
    t.autoKill = false;
    this.duration += d;
    return this;
  }

  AppendInterval(d) {
    this.duration += d;
    return this;
  }

  PrependInterval(d) {
    for (const it of this.items) it.start += d;
    this.duration += d;
    return this;
  }

  AppendCallback(fn) {
    this.items.push({ start: this.duration, callback: fn });
    return this;
  }

  InsertCallback(at, fn) {
    this.items.push({ start: at, callback: fn });
    this.duration = Math.max(this.duration, at);
    return this;
  }

  apply() {
    const time = this.position;
    const prev = this.lastTime;
    for (const it of this.items) {
      if (it.callback) {
        if (!this.backwards && prev <= it.start && time >= it.start && !(prev === it.start && prev !== 0)) it.callback();
        continue;
      }
      const tw = it.tween;
      const local = time - it.start - tw.delay;
      if (local < 0 && !tw.started) continue;
      if (!tw.started) {
        tw.startup();
        tw.cb.start?.();
      }
      const d = tw.duration;
      const total = tw.loops === -1 ? Infinity : d * tw.loops;
      const lt = Math.max(0, Math.min(total, local));
      tw.completedLoops = d > 0 ? Math.min(Math.floor(lt / d), tw.loops === -1 ? Infinity : tw.loops - 1) : 0;
      tw.position = d > 0 ? lt - tw.completedLoops * d : d;
      tw.apply();
      tw.cb.update?.();
      if (local >= total && !tw.isComplete) {
        tw.isComplete = true;
        tw.cb.complete?.();
      }
    }
    this.lastTime = time;
  }

  Kill(complete) {
    for (const it of this.items) if (it.tween?.active) it.tween.Kill();
    super.Kill(complete);
  }
}

// ---------------------------------------------------------------- DOTween static API

export const DOTween = {
  To(getter, setter, endValue, duration) {
    return new Tweener(getter, setter, endValue, duration);
  },
  /** DOTween.To for ints: the setter receives rounded values */
  ToInt(getter, setter, endValue, duration) {
    return new Tweener(getter, (v) => setter(Math.round(v)), endValue, duration);
  },
  Sequence() {
    return new Sequence();
  },
  Punch(getter, setter, direction, duration, vibrato, elasticity) {
    const [pts, durs] = punchPoints(direction, duration, vibrato, elasticity);
    return new ArrayTweener(getter, setter, pts, durs);
  },
  Shake(getter, setter, duration, strength, vibrato, randomness, fadeOut) {
    const [pts, durs] = shakePoints(duration, strength, vibrato, randomness, fadeOut);
    return new ArrayTweener(getter, setter, pts, durs).SetEase(Ease.Linear);
  },
  byTarget(target) {
    const out = [];
    for (const t of allTweens) if (t.target === target || t.id === target) out.push(t);
    return out;
  },
  Kill(target, complete = false) {
    let n = 0;
    for (const t of this.byTarget(target)) {
      t.Kill(complete);
      n++;
    }
    return n;
  },
  Play(target) {
    for (const t of this.byTarget(target)) t.Play();
  },
  Pause(target) {
    for (const t of this.byTarget(target)) t.Pause();
  },
  TogglePause(target) {
    for (const t of this.byTarget(target)) t.TogglePause();
  },
  PlayForward(target) {
    for (const t of this.byTarget(target)) t.PlayForward();
  },
  PlayBackwards(target) {
    for (const t of this.byTarget(target)) t.PlayBackwards();
  },
  Restart(target) {
    for (const t of this.byTarget(target)) t.Restart();
  },
  Rewind(target) {
    for (const t of this.byTarget(target)) t.Rewind();
  },
  Complete(target) {
    for (const t of this.byTarget(target)) t.Complete();
  },
  IsTweening(target) {
    return this.byTarget(target).some((t) => t.IsPlaying());
  },
  KillAll() {
    for (const t of [...allTweens]) t.Kill();
  },
  tick() {
    const dt = Time.deltaTime;
    const udt = Time.unscaledDeltaTime;
    for (const t of [...allTweens]) if (!t.sequenced) t.tick(t.unscaled ? udt : dt);
  },
};

// ---------------------------------------------------------------- shortcut extensions

const TP = Transform.prototype;
const v3 = (v) => (typeof v === 'number' ? new THREE.Vector3(v, v, v) : new THREE.Vector3(v.x, v.y, v.z ?? 0));

TP.DOScale = function (end, duration) {
  return DOTween.To(() => this.localScale, (v) => (this.localScale = v), v3(end), duration).SetTarget(this);
};
TP.DOScaleX = function (end, duration) {
  return DOTween.To(() => this.localScale.x, (x) => (this.localScale = new THREE.Vector3(x, this.obj.scale.y, this.obj.scale.z)), end, duration).SetTarget(this);
};
TP.DOScaleY = function (end, duration) {
  return DOTween.To(() => this.localScale.y, (y) => (this.localScale = new THREE.Vector3(this.obj.scale.x, y, this.obj.scale.z)), end, duration).SetTarget(this);
};
// positions are in Unity space (z mirrored by the engine): read/write through the Transform API
TP.DOLocalMove = function (end, duration) {
  const unityLocal = () => {
    const p = this.localPosition;
    return new THREE.Vector3(p.x, p.y, -p.z);
  };
  return DOTween.To(unityLocal, (v) => (this.localPosition = new THREE.Vector3(v.x, v.y, -v.z)), v3(end), duration).SetTarget(this);
};
TP.DOLocalMoveX = function (end, duration) {
  return DOTween.To(() => this.localPosition.x, (x) => (this.localPosition = new THREE.Vector3(x, this.obj.position.y, this.obj.position.z)), end, duration).SetTarget(this);
};
TP.DOLocalMoveY = function (end, duration) {
  return DOTween.To(() => this.localPosition.y, (y) => (this.localPosition = new THREE.Vector3(this.obj.position.x, y, this.obj.position.z)), end, duration).SetTarget(this);
};
TP.DOMove = function (end, duration) {
  const unityPos = () => {
    const p = this.position;
    return new THREE.Vector3(p.x, p.y, -p.z);
  };
  return DOTween.To(unityPos, (v) => (this.position = new THREE.Vector3(v.x, v.y, -v.z)), v3(end), duration).SetTarget(this);
};
TP.DOAnchorPos = function (end, duration) {
  return DOTween.To(() => this.anchoredPosition, (v) => (this.anchoredPosition = v), new THREE.Vector2(end.x, end.y), duration).SetTarget(this);
};
TP.DOAnchorPosX = function (end, duration) {
  return DOTween.To(() => this.anchoredPosition.x, (x) => (this.anchoredPosition = new THREE.Vector2(x, this._anchoredPosition.y)), end, duration).SetTarget(this);
};
TP.DOAnchorPosY = function (end, duration) {
  return DOTween.To(() => this.anchoredPosition.y, (y) => (this.anchoredPosition = new THREE.Vector2(this._anchoredPosition.x, y)), end, duration).SetTarget(this);
};
TP.DOAnchorPos3D = function (end, duration) {
  return DOTween.To(() => this.anchoredPosition3D, (v) => (this.anchoredPosition3D = v), v3(end), duration).SetTarget(this);
};
TP.DOSizeDelta = function (end, duration) {
  return DOTween.To(() => this.sizeDelta, (v) => (this.sizeDelta = v), new THREE.Vector2(end.x, end.y), duration).SetTarget(this);
};
function eulerTween(tr, end, duration, local) {
  const get = () => {
    const q = local ? tr.localRotation : tr.rotation;
    return new THREE.Vector3(0, 0, eulerZ(q));
  };
  const set = (v) => {
    const q = unityEuler(v.x, v.y, v.z);
    if (local) tr.localRotation = q;
    else tr.rotation = q;
  };
  const tw = DOTween.To(get, set, v3(end), duration).SetTarget(tr);
  // RotateMode.Fast: take the shortest way around on z
  const base = tw.startup.bind(tw);
  tw.startup = () => {
    base();
    const dz = ((((tw.endValue.z - tw.startValue.z) % 360) + 540) % 360) - 180;
    tw.endValue = new THREE.Vector3(tw.endValue.x, tw.endValue.y, tw.startValue.z + dz);
  };
  return tw;
}
TP.DORotate = function (end, duration) {
  return eulerTween(this, end, duration, false);
};
TP.DOLocalRotate = function (end, duration) {
  return eulerTween(this, end, duration, true);
};
TP.DOPunchScale = function (punch, duration, vibrato = 10, elasticity = 1) {
  return DOTween.Punch(() => this.localScale, (v) => (this.localScale = v), v3(punch), duration, vibrato, elasticity).SetTarget(this);
};
TP.DOPunchPosition = function (punch, duration, vibrato = 10, elasticity = 1) {
  return DOTween.Punch(() => this.localPosition, (v) => (this.localPosition = v), v3(punch), duration, vibrato, elasticity).SetTarget(this);
};
TP.DOPunchAnchorPos = function (punch, duration, vibrato = 10, elasticity = 1) {
  return DOTween.Punch(() => this.anchoredPosition, (v) => (this.anchoredPosition = v), v3(punch), duration, vibrato, elasticity).SetTarget(this);
};
TP.DOPunchRotation = function (punch, duration, vibrato = 10, elasticity = 1) {
  return DOTween.Punch(
    () => new THREE.Vector3(0, 0, eulerZ(this.localRotation)),
    (v) => (this.localRotation = unityEuler(v.x, v.y, v.z)),
    v3(punch),
    duration,
    vibrato,
    elasticity,
  ).SetTarget(this);
};
TP.DOShakePosition = function (duration, strength = 1, vibrato = 10, randomness = 90, snapping = false, fadeOut = true) {
  return DOTween.Shake(() => this.localPosition, (v) => (this.localPosition = v), duration, strength, vibrato, randomness, fadeOut).SetTarget(this);
};
TP.DOShakeAnchorPos = function (duration, strength = 100, vibrato = 10, randomness = 90, snapping = false, fadeOut = true) {
  return DOTween.Shake(() => this.anchoredPosition, (v) => (this.anchoredPosition = v), duration, strength, vibrato, randomness, fadeOut).SetTarget(this);
};
TP.DOShakeScale = function (duration, strength = 1, vibrato = 10, randomness = 90, fadeOut = true) {
  return DOTween.Shake(() => this.localScale, (v) => (this.localScale = v), duration, strength, vibrato, randomness, fadeOut).SetTarget(this);
};
TP.DOShakeRotation = function (duration, strength = 90, vibrato = 10, randomness = 90, fadeOut = true) {
  return DOTween.Shake(
    () => new THREE.Vector3(0, 0, eulerZ(this.localRotation)),
    (v) => (this.localRotation = unityEuler(v.x, v.y, v.z)),
    duration,
    strength,
    vibrato,
    randomness,
    fadeOut,
  ).SetTarget(this);
};
TP.DOKill = function (complete = false) {
  return DOTween.Kill(this, complete);
};
TP.DOComplete = function () {
  DOTween.Complete(this);
};

const GP = Graphic.prototype;
GP.DOFade = function (end, duration) {
  return DOTween.To(() => this.color.a, (a) => (this.color = this.color.withAlpha(a)), end, duration).SetTarget(this);
};
GP.DOColor = function (end, duration) {
  return DOTween.To(() => this.color, (c) => (this.color = c), Color.from(end), duration).SetTarget(this);
};
GP.DOKill = function (complete = false) {
  return DOTween.Kill(this, complete);
};
Image.prototype.DOFillAmount = function (end, duration) {
  return DOTween.To(() => this.fillAmount, (v) => (this.fillAmount = v), Math.max(0, Math.min(1, end)), duration).SetTarget(this);
};

/** CanvasGroup.DOFade: installed by canvas.js on its class (avoids a circular import) */
export function installCanvasGroupTweens(CanvasGroup) {
  CanvasGroup.prototype.DOFade = function (end, duration) {
    return DOTween.To(() => this.alpha, (a) => (this.alpha = a), end, duration).SetTarget(this);
  };
  CanvasGroup.prototype.DOKill = function (complete = false) {
    return DOTween.Kill(this, complete);
  };
}

// ---------------------------------------------------------------- DOTweenAnimation (DOTween Pro)

const AnimType = { None: 0, Move: 1, LocalMove: 2, Rotate: 3, LocalRotate: 4, Scale: 5, Color: 6, Fade: 7, Text: 8, PunchPosition: 9, PunchRotation: 10, PunchScale: 11, ShakePosition: 12, ShakeRotation: 13, ShakeScale: 14, UIWidthHeight: 21, FillAmount: 22 };
const TargetType = { Unset: 0, Camera: 1, CanvasGroup: 2, Image: 3, Light: 4, RectTransform: 5, Renderer: 6, SpriteRenderer: 7, Rigidbody: 8, Rigidbody2D: 9, Text: 10, Transform: 11, TextMeshPro: 14, TextMeshProUGUI: 15 };

export class DOTweenAnimation extends MonoBehaviour {
  static typeName = 'DOTweenAnimation';

  constructor() {
    super();
    this.tween = null;
    this.isActive = 1;
    this.autoGenerate = 1;
    this.autoPlay = 1;
    this.isValid = 1;
    this.onComplete = null;
  }

  Awake() {
    if (!this.isActive || !this.autoGenerate) return;
    if (this.animationType !== AnimType.Move || !this.useTargetAsV3) {
      this.CreateTween(false, !!this.autoPlay);
      this._generated = true;
    }
  }

  Start() {
    if (this._generated || !this.isActive || !this.autoGenerate) return;
    this.CreateTween(false, !!this.autoPlay);
    this._generated = true;
  }

  OnDestroy() {
    if (this.tween?.active) this.tween.Kill();
    this.tween = null;
  }

  get tweenTarget() {
    return this.tweenTargetIsTargetGO ? (this.targetIsSelf ? this.gameObject : this.targetGO || this.gameObject) : this.gameObject;
  }

  CreateTween(regenerate = false, andPlay = true) {
    if (!this.isValid) return;
    if (this.tween) {
      if (this.tween.active) {
        if (regenerate) this.tween.Kill();
        else return;
      }
      this.tween = null;
    }
    const target = this.target;
    const tgo = this.targetIsSelf ? this.gameObject : this.targetGO || target?.gameObject || this.gameObject;
    const tr = tgo.transform;
    const d = this.duration;
    const fv = this.endValueFloat;
    const ev3 = new THREE.Vector3(...(this.endValueV3 || [0, 0, 0]));
    const ev2 = new THREE.Vector2(...(this.endValueV2 || [0, 0]));
    const col = Color.from(this.endValueColor);
    const b0 = !!this.optionalBool0;
    let tw = null;
    switch (this.animationType) {
      case AnimType.Move:
        tw = this.targetType === TargetType.RectTransform && tr.isRectTransform ? tr.DOAnchorPos3D(ev3, d) : tr.DOMove(ev3, d);
        break;
      case AnimType.LocalMove:
        tw = tr.DOLocalMove(ev3, d);
        break;
      case AnimType.Rotate:
        tw = tr.DORotate(ev3, d);
        break;
      case AnimType.LocalRotate:
        tw = tr.DOLocalRotate(ev3, d);
        break;
      case AnimType.Scale:
        tw = tr.DOScale(b0 ? new THREE.Vector3(fv, fv, fv) : ev3, d);
        break;
      case AnimType.UIWidthHeight:
        tw = tr.DOSizeDelta(b0 ? new THREE.Vector2(fv, fv) : ev2, d);
        break;
      case AnimType.FillAmount:
        tw = target?.DOFillAmount?.(fv, d);
        break;
      case AnimType.Color:
        tw = target?.DOColor?.(col, d);
        break;
      case AnimType.Fade:
        tw = target?.DOFade?.(fv, d);
        break;
      case AnimType.PunchPosition:
        tw = tr.isRectTransform && this.targetType === TargetType.RectTransform ? tr.DOPunchAnchorPos(ev3, d, this.optionalInt0, this.optionalFloat0) : tr.DOPunchPosition(ev3, d, this.optionalInt0, this.optionalFloat0);
        break;
      case AnimType.PunchScale:
        tw = tr.DOPunchScale(ev3, d, this.optionalInt0, this.optionalFloat0);
        break;
      case AnimType.PunchRotation:
        tw = tr.DOPunchRotation(ev3, d, this.optionalInt0, this.optionalFloat0);
        break;
      case AnimType.ShakePosition:
        tw = tr.isRectTransform && this.targetType === TargetType.RectTransform ? tr.DOShakeAnchorPos(d, ev3, this.optionalInt0, this.optionalFloat0) : tr.DOShakePosition(d, ev3, this.optionalInt0, this.optionalFloat0);
        break;
      case AnimType.ShakeScale:
        tw = tr.DOShakeScale(d, ev3, this.optionalInt0, this.optionalFloat0);
        break;
      case AnimType.ShakeRotation:
        tw = tr.DOShakeRotation(d, ev3, this.optionalInt0, this.optionalFloat0);
        break;
      default:
    }
    if (!tw) return;
    if (this.isFrom) tw.From?.(!!this.isRelative);
    else tw.SetRelative(!!this.isRelative);
    tw.SetTarget(this.tweenTarget).SetDelay(this.delay || 0).SetLoops(this.loops ?? 1, this.loopType || 0).SetAutoKill(!!this.autoKill);
    const prevKill = tw.cb.kill;
    tw.OnKill(() => {
      prevKill?.();
      if (this.tween === tw) this.tween = null;
    });
    if (this.easeType === Ease.INTERNAL_Custom) tw.SetEase(AnimationCurve.from(this.easeCurve));
    else tw.SetEase(this.easeType ?? Ease.OutQuad);
    if (this.id) tw.SetId(this.id);
    tw.SetUpdate(!!this.isIndependentUpdate);
    if (this.hasOnComplete && this.onComplete instanceof EventAction) tw.OnComplete(() => this.onComplete.Invoke());
    if (this.hasOnStart && this.onStart instanceof EventAction) tw.OnStart(() => this.onStart.Invoke());
    if (this.hasOnPlay && this.onPlay instanceof EventAction) tw.OnPlay(() => this.onPlay.Invoke());
    if (this.hasOnStepComplete && this.onStepComplete instanceof EventAction) tw.OnStepComplete(() => this.onStepComplete.Invoke());
    if (this.hasOnRewind && this.onRewind instanceof EventAction) tw.OnRewind(() => this.onRewind.Invoke());
    if (andPlay) tw.Play();
    else tw.Pause();
    this.tween = tw;
    if (this.hasOnTweenCreated && this.onTweenCreated instanceof EventAction) this.onTweenCreated.Invoke();
  }

  DOPlay() {
    DOTween.Play(this.tweenTarget);
  }

  DOPlayBackwards() {
    DOTween.PlayBackwards(this.tweenTarget);
  }

  DOPlayForward() {
    DOTween.PlayForward(this.tweenTarget);
  }

  DOPause() {
    DOTween.Pause(this.tweenTarget);
  }

  DOTogglePause() {
    DOTween.TogglePause(this.tweenTarget);
  }

  DORewind() {
    const anims = this.gameObject.GetComponents(DOTweenAnimation);
    for (let i = anims.length - 1; i >= 0; i--) {
      const t = anims[i].tween;
      if (t && t.IsInitialized()) t.Rewind();
    }
  }

  DORestart() {
    if (!this.tween) return;
    DOTween.Restart(this.tweenTarget);
  }

  DOComplete() {
    DOTween.Complete(this.tweenTarget);
  }

  DOKill() {
    DOTween.Kill(this.tweenTarget);
    this.tween = null;
  }

  RewindThenRecreateTween() {
    if (this.tween?.active) this.tween.Rewind();
    this.CreateTween(true, false);
  }

  RewindThenRecreateTweenAndPlay() {
    if (this.tween?.active) this.tween.Rewind();
    this.CreateTween(true, true);
  }

  RecreateTween() {
    this.CreateTween(true, false);
  }

  RecreateTweenAndPlay() {
    this.CreateTween(true, true);
  }

  GetTweens() {
    return this.gameObject.GetComponents(DOTweenAnimation).map((a) => a.tween).filter((t) => t && t.active);
  }
}

registerComponent(DOTweenAnimation);
