// Animator (Mecanim subset): plays the AnimatorControllers exported by tools/export_anim.py — states, triggers /
// bool / float / int parameters, any-state transitions, exit times, cross-fades, transform / m_IsActive /
// material float curves (Hermite keys like AnimationCurve).
import * as THREE from 'three';
import { MonoBehaviour } from './scene.js';
import { Time } from './core.js';
import { registerComponent } from './instantiate.js';
import { assetUrl } from './assets.js';
import { MaterialPropertyBlock } from './render.js';

const controllers = new Map();

export function loadController(id) {
  if (!controllers.has(id)) {
    controllers.set(
      id,
      fetch(assetUrl(`anim/${id}.json`))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return controllers.get(id);
}

const STEP = 1e29;

/** Hermite sample of key rows [t, v0..vn-1, in0.., out0..] (n = dims) */
function sample(keys, t, n, out) {
  const last = keys.length - 1;
  if (t <= keys[0][0] || last === 0) {
    for (let i = 0; i < n; i++) out[i] = keys[0][1 + i];
    return out;
  }
  if (t >= keys[last][0]) {
    for (let i = 0; i < n; i++) out[i] = keys[last][1 + i];
    return out;
  }
  let k = 0;
  while (k < last && keys[k + 1][0] < t) k++;
  const a = keys[k];
  const b = keys[k + 1];
  const dt = b[0] - a[0];
  const s = dt > 0 ? (t - a[0]) / dt : 0;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  for (let i = 0; i < n; i++) {
    const p0 = a[1 + i];
    const p1 = b[1 + i];
    const m0 = a[1 + 2 * n + i];
    const m1 = b[1 + n + i];
    if (Math.abs(m0) >= STEP || Math.abs(m1) >= STEP) out[i] = p0;
    else out[i] = h00 * p0 + h10 * m0 * dt + h01 * p1 + h11 * m1 * dt;
  }
  return out;
}

const DIMS = { pos: 3, rot: 4, scale: 3, euler: 3 };

/** sampled pose of a clip: Map(key -> {target, prop, value[]}) */
function evaluateClip(anim, clip, time, pose) {
  for (const c of clip.curves) {
    if (!c.keys.length) continue;
    const n = c.prop.startsWith('float:') ? 1 : DIMS[c.prop];
    const key = `${c.path}|${c.prop}`;
    let e = pose.get(key);
    if (!e) {
      e = { path: c.path, prop: c.prop, value: new Array(n).fill(0) };
      pose.set(key, e);
    }
    sample(c.keys, time, n, e.value);
  }
  return pose;
}

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Animator extends MonoBehaviour {
  static typeName = 'Animator';

  constructor() {
    super();
    this.speed = 1;
    this.params = new Map();
    this.triggers = new Set();
    this.controller = null;
    this.state = null; // {name, def, time}
    this.next = null; // cross-fade target {name, def, time, t, duration}
    this.bindings = new Map();
    this._blocks = new Map();
  }

  OnDeserialize() {
    this.controllerId = this._data?.m_Controller?.$anim || null;
    if (this.controllerId) {
      loadController(this.controllerId).then((c) => {
        if (!c || this._destroyed) return;
        this.controller = c;
        for (const p of c.params) if (!this.params.has(p.name)) this.params.set(p.name, p.type === 4 ? !!p.default : p.default);
        if (!this.state) this.Play(c.layers[0]?.default);
      });
    }
  }

  get isInitialized() {
    return !!this.controller;
  }

  get runtimeAnimatorController() {
    return this.controller;
  }

  // ---- parameters
  pname(p) {
    return typeof p === 'string' ? p : p?.parameter || p?.name || String(p);
  }

  SetTrigger(p) {
    this.triggers.add(this.pname(p));
  }

  ResetTrigger(p) {
    this.triggers.delete(this.pname(p));
  }

  SetBool(p, v) {
    this.params.set(this.pname(p), !!v);
  }

  GetBool(p) {
    return !!this.params.get(this.pname(p));
  }

  SetFloat(p, v) {
    this.params.set(this.pname(p), v);
  }

  GetFloat(p) {
    return this.params.get(this.pname(p)) || 0;
  }

  SetInteger(p, v) {
    this.params.set(this.pname(p), v | 0);
  }

  GetInteger(p) {
    return this.params.get(this.pname(p)) | 0;
  }

  // ---- states
  stateDef(name) {
    return this.controller?.layers[0]?.states[name] || null;
  }

  clipOf(def) {
    return def?.clip ? this.controller.clips[def.clip] : null;
  }

  Play(name, layer = 0, normalizedTime = 0) {
    const def = this.stateDef(name);
    if (!def) {
      this._pendingPlay = name;
      return;
    }
    const clip = this.clipOf(def);
    this.state = { name, def, time: (clip?.length || 0) * normalizedTime };
    this.next = null;
    this.apply();
  }

  CrossFade(name, duration) {
    const def = this.stateDef(name);
    if (!def) return;
    this.next = { name, def, time: 0, t: 0, duration };
  }

  GetCurrentAnimatorStateInfo() {
    const s = this.state;
    const len = this.clipOf(s?.def)?.length || 0;
    return {
      normalizedTime: len > 0 ? s.time / len : 1,
      length: len,
      IsName: (n) => s?.name === n,
      name: s?.name,
    };
  }

  condOk(c) {
    const v = this.params.get(c.param);
    switch (c.mode) {
      case 1:
        return this.triggers.has(c.param) || v === true;
      case 2:
        return !v;
      case 3:
        return (v || 0) > c.threshold;
      case 4:
        return (v || 0) < c.threshold;
      case 6:
        return (v | 0) === c.threshold;
      case 7:
        return (v | 0) !== c.threshold;
      default:
        return false;
    }
  }

  tryTransition(list, fromTime, len, prevTime) {
    for (const tr of list) {
      if (!tr.dst) continue;
      if (tr.hasExitTime) {
        const et = tr.exitTime * len;
        if (!(prevTime < et && fromTime >= et) && !(len === 0 && fromTime >= 0 && prevTime <= 0)) continue;
      }
      if (!tr.conds.every((c) => this.condOk(c))) continue;
      for (const c of tr.conds) if (c.mode === 1) this.triggers.delete(c.param);
      const def = this.stateDef(tr.dst);
      if (!def) continue;
      const dur = tr.fixed ? tr.duration : tr.duration * len;
      const clip = this.clipOf(def);
      const st = { name: tr.dst, def, time: tr.offset * (clip?.length || 0) };
      if (dur > 0) this.next = { ...st, t: 0, duration: dur };
      else {
        this.state = st;
        this.next = null;
      }
      return true;
    }
    return false;
  }

  Update() {
    if (!this.controller) return;
    if (this._pendingPlay) {
      const n = this._pendingPlay;
      this._pendingPlay = null;
      this.Play(n);
    }
    if (!this.state) return;
    const dt = Time.deltaTime * this.speed;
    const s = this.state;
    const clip = this.clipOf(s.def);
    const len = clip?.length || 0;
    const prev = s.time;
    s.time += dt * (s.def.speed ?? 1);
    if (this.next) {
      this.next.time += dt * (this.next.def.speed ?? 1);
      this.next.t += dt;
      if (this.next.t >= this.next.duration) {
        const { name, def, time } = this.next;
        this.state = { name, def, time };
        this.next = null;
      }
    } else {
      const layer = this.controller.layers[0];
      if (!this.tryTransition(layer.any, s.time, len, prev)) this.tryTransition(s.def.transitions, s.time, len, prev);
    }
    this.apply();
  }

  clipTime(st) {
    const clip = this.clipOf(st.def);
    if (!clip) return 0;
    if (clip.loop && clip.length > 0) return st.time % clip.length;
    return Math.min(st.time, clip.length);
  }

  apply() {
    const s = this.state;
    if (!s) return;
    const clip = this.clipOf(s.def);
    if (!clip) return;
    const pose = evaluateClip(this, clip, this.clipTime(s), new Map());
    if (this.next) {
      const nclip = this.clipOf(this.next.def);
      if (nclip) {
        const w = Math.min(1, this.next.t / this.next.duration);
        const p2 = evaluateClip(this, nclip, this.clipTime(this.next), new Map());
        for (const [k, e2] of p2) {
          const e1 = pose.get(k);
          if (!e1) {
            pose.set(k, e2);
            continue;
          }
          if (e1.prop === 'rot') {
            _q1.set(...e1.value).normalize();
            _q2.set(...e2.value).normalize();
            _q1.slerp(_q2, w);
            e1.value = [_q1.x, _q1.y, _q1.z, _q1.w];
          } else if (e1.prop.startsWith('float:1:')) e1.value = w < 0.5 ? e1.value : e2.value;
          else e1.value = e1.value.map((v, i) => v + (e2.value[i] - v) * w);
        }
      }
    }
    for (const e of pose.values()) this.write(e);
  }

  bind(path) {
    if (this.bindings.has(path)) return this.bindings.get(path);
    const t = path ? this.transform.Find(path) : this.transform;
    this.bindings.set(path, t || null);
    return t || null;
  }

  write(e) {
    const t = this.bind(e.path);
    if (!t) return;
    const v = e.value;
    switch (e.prop) {
      case 'pos':
        t.obj.position.set(v[0], v[1], v[2]);
        t.markChanged();
        break;
      case 'rot':
        t.obj.quaternion.set(v[0], v[1], v[2], v[3]).normalize();
        t.markChanged();
        break;
      case 'scale':
        t.obj.scale.set(v[0], v[1], v[2]);
        t.markChanged();
        break;
      case 'euler':
        _e.set(v[0] * THREE.MathUtils.DEG2RAD, v[1] * THREE.MathUtils.DEG2RAD, v[2] * THREE.MathUtils.DEG2RAD, 'YXZ');
        t.obj.quaternion.setFromEuler(_e);
        t.markChanged();
        break;
      default: {
        const [, cls, attr] = e.prop.split(':');
        if (cls === '1' && attr === 'm_IsActive') {
          const on = v[0] > 0.5;
          if (t.gameObject.activeSelf !== on) t.gameObject.SetActive(on);
        } else if (attr?.startsWith('material.')) {
          const r = t.gameObject.GetComponent('Renderer') || t.gameObject.GetComponent('MeshRenderer') || t.gameObject.GetComponent('SkinnedMeshRenderer');
          if (!r?.SetPropertyBlock) break;
          const name = attr.slice(9);
          let b = this._blocks.get(r);
          if (!b) {
            b = new MaterialPropertyBlock();
            this._blocks.set(r, b);
          }
          r.GetPropertyBlock?.(b);
          b.SetFloat(name, v[0]);
          r.SetPropertyBlock(b);
        }
      }
    }
  }
}

registerComponent(Animator);
