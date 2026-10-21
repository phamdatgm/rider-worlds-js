// GameObject / Transform / Component model mirroring Unity's API surface used by the game scripts.
import * as THREE from 'three';
import { Coroutines } from './core.js';
import { eulerZ, quatZ, unityEuler, Deg2Rad } from './math.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// ---------------------------------------------------------------- World (scene graph + update lists)

export const World = {
  root: new THREE.Group(),
  objects: new Set(), // all live GameObjects
  behaviours: new Set(), // enabled+active MonoBehaviours (for Update/FixedUpdate/LateUpdate)
  pendingStart: [],
  pendingDestroy: [],
  onRemoveObject3D: null,
  hierarchyVersion: 0,
};
World.root.name = 'World';

// ---------------------------------------------------------------- Transform

export class Transform {
  constructor(gameObject) {
    this.gameObject = gameObject;
    this.obj = new THREE.Object3D();
    this.obj.userData.transform = this;
    this.children = [];
    this.parent = null;
    World.root.add(this.obj);
    this._changed = 0; // bumps when changed from script (physics sync)
  }

  get transform() {
    return this;
  }

  get isTransform() {
    return true;
  }

  get name() {
    return this.gameObject.name;
  }

  get childCount() {
    return this.children.length;
  }

  GetChild(i) {
    return this.children[i];
  }

  markChanged() {
    this._changed++;
    for (const c of this.children) c.markChanged();
  }

  // ---- local
  get localPosition() {
    return this.obj.position.clone();
  }

  set localPosition(v) {
    this.obj.position.set(v.x, v.y, v.z ?? this.obj.position.z);
    this.obj.updateMatrix();
    this.markChanged();
  }

  get localRotation() {
    return this.obj.quaternion.clone();
  }

  set localRotation(q) {
    this.obj.quaternion.copy(q);
    this.markChanged();
  }

  get localScale() {
    return this.obj.scale.clone();
  }

  set localScale(v) {
    if (typeof v === 'number') this.obj.scale.set(v, v, v);
    else this.obj.scale.set(v.x, v.y, v.z ?? 1);
    this.markChanged();
  }

  get localEulerZ() {
    return eulerZ(this.obj.quaternion);
  }

  // ---- world
  updateWorld() {
    this.obj.updateWorldMatrix(true, false);
    return this.obj.matrixWorld;
  }

  get position() {
    this.updateWorld();
    return new THREE.Vector3().setFromMatrixPosition(this.obj.matrixWorld);
  }

  set position(v) {
    const z = v.z !== undefined ? v.z : this.position.z;
    _v.set(v.x, v.y, z);
    if (this.parent) {
      this.parent.updateWorld();
      _m.copy(this.parent.obj.matrixWorld).invert();
      _v.applyMatrix4(_m);
    }
    this.obj.position.copy(_v);
    this.markChanged();
  }

  get rotation() {
    this.updateWorld();
    const q = new THREE.Quaternion();
    this.obj.getWorldQuaternion(q);
    return q;
  }

  set rotation(q) {
    if (this.parent) {
      this.parent.obj.getWorldQuaternion(_q);
      this.obj.quaternion.copy(_q.invert().multiply(q));
    } else {
      this.obj.quaternion.copy(q);
    }
    this.markChanged();
  }

  get lossyScale() {
    this.updateWorld();
    return new THREE.Vector3().setFromMatrixScale(this.obj.matrixWorld);
  }

  /** Unity eulerAngles.z of the world rotation. */
  get eulerZ() {
    return eulerZ(this.rotation);
  }

  get eulerAngles() {
    const q = this.rotation;
    return new THREE.Vector3(0, 0, eulerZ(q));
  }

  set eulerAngles(v) {
    this.rotation = unityEuler(v.x || 0, v.y || 0, v.z || 0);
  }

  SetPositionAndRotation(p, q) {
    this.position = p;
    this.rotation = q;
  }

  get right() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.rotation);
  }

  get up() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.rotation);
  }

  set up(v) {
    // Unity: rotation = FromToRotation(Vector3.up, v)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v.set(v.x, v.y, v.z || 0).normalize());
    this.rotation = q;
  }

  set right(v) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), _v.set(v.x, v.y, v.z || 0).normalize());
    this.rotation = q;
  }

  /** Unity forward (+Z) expressed in our mirrored space. */
  get forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.rotation);
  }

  TransformPoint(p) {
    this.updateWorld();
    return new THREE.Vector3(p.x, p.y, p.z || 0).applyMatrix4(this.obj.matrixWorld);
  }

  InverseTransformPoint(p) {
    this.updateWorld();
    _m.copy(this.obj.matrixWorld).invert();
    return new THREE.Vector3(p.x, p.y, p.z || 0).applyMatrix4(_m);
  }

  TransformDirection(d) {
    return new THREE.Vector3(d.x, d.y, d.z || 0).applyQuaternion(this.rotation);
  }

  InverseTransformDirection(d) {
    return new THREE.Vector3(d.x, d.y, d.z || 0).applyQuaternion(this.rotation.invert());
  }

  Translate(v, relativeTo = 'self') {
    if (relativeTo === 'world') {
      const p = this.position.add(v);
      this.position = p;
    } else {
      const d = this.TransformDirection(v);
      this.position = this.position.add(d);
    }
  }

  /** Unity Transform.Rotate(x, y, z, space) with euler degrees. */
  Rotate(x, y, z, space = 'self') {
    const r = unityEuler(x, y, z, _q);
    if (space === 'self') this.obj.quaternion.multiply(r);
    else {
      const world = this.rotation;
      this.rotation = r.clone().multiply(world);
      return;
    }
    this.markChanged();
  }

  RotateAround(point, axisZSign, angleDeg) {
    const q = quatZ(angleDeg * axisZSign);
    const p = this.position.sub(point).applyQuaternion(q).add(point);
    this.position = p;
    this.rotation = q.multiply(this.rotation);
  }

  SetParent(parent, worldPositionStays = true) {
    const newParent = parent ? parent.transform : null;
    if (newParent === this.parent) return;
    const oldActive = this.gameObject.activeInHierarchy;
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }
    this.parent = newParent;
    const target = newParent ? newParent.obj : World.root;
    if (worldPositionStays) target.attach(this.obj);
    else target.add(this.obj);
    if (newParent) newParent.children.push(this);
    World.hierarchyVersion++;
    this.markChanged();
    const nowActive = this.gameObject.activeInHierarchy;
    if (oldActive !== nowActive) this.gameObject._propagateActive(nowActive);
  }

  get root() {
    let t = this;
    while (t.parent) t = t.parent;
    return t;
  }

  GetSiblingIndex() {
    return this.parent ? this.parent.children.indexOf(this) : 0;
  }

  SetSiblingIndex(i) {
    if (!this.parent) return;
    const list = this.parent.children;
    const cur = list.indexOf(this);
    if (cur < 0) return;
    list.splice(cur, 1);
    list.splice(Math.max(0, Math.min(i, list.length)), 0, this);
    World.hierarchyVersion++;
  }

  SetAsLastSibling() {
    this.SetSiblingIndex(Infinity);
  }

  SetAsFirstSibling() {
    this.SetSiblingIndex(0);
  }

  IsChildOf(t) {
    for (let p = this; p; p = p.parent) if (p === t) return true;
    return false;
  }

  Find(path) {
    const parts = path.split('/');
    let cur = this;
    for (const p of parts) {
      cur = cur.children.find((c) => c.gameObject.name === p);
      if (!cur) return null;
    }
    return cur;
  }

  DestroyChildren() {
    for (const c of this.children.slice()) Destroy(c.gameObject);
  }
}

// ---------------------------------------------------------------- GameObject

export class GameObject {
  constructor(name = 'GameObject', TransformType = Transform) {
    this.name = name;
    this.layer = 0;
    this.tag = 'Untagged';
    this.activeSelf = true;
    this.components = [];
    this.transform = new TransformType(this);
    this.transform.obj.name = name;
    this._destroyed = false;
    this._awoken = false;
    World.objects.add(this);
  }

  get gameObject() {
    return this;
  }

  get activeInHierarchy() {
    let t = this.transform;
    while (t) {
      if (!t.gameObject.activeSelf) return false;
      t = t.parent;
    }
    return !this._destroyed;
  }

  SetActive(v) {
    v = !!v;
    if (v === this.activeSelf) return;
    const was = this.activeInHierarchy;
    this.activeSelf = v;
    const now = this.activeInHierarchy;
    if (was !== now) this._propagateActive(now);
  }

  _propagateActive(active) {
    this.transform.obj.visible = active;
    if (active) {
      for (const c of this.components) {
        if (!this._awoken) break;
        c._activate();
      }
      if (!this._awoken) awakeObject(this);
    } else {
      for (const c of this.components) c._deactivate();
    }
    for (const ch of this.transform.children) {
      if (ch.gameObject.activeSelf) ch.gameObject._propagateActive(active);
    }
  }

  AddComponent(Type, data) {
    const c = new Type();
    c.gameObject = this;
    this.components.push(c);
    if (data) c._data = data;
    if (this._awoken && this.activeInHierarchy) {
      c._awake();
      c._activate();
    }
    return c;
  }

  GetComponent(type) {
    for (const c of this.components) if (matchType(c, type)) return c;
    return null;
  }

  GetComponents(type) {
    return this.components.filter((c) => matchType(c, type));
  }

  GetComponentInChildren(type, includeInactive = false) {
    const own = this.GetComponent(type);
    if (own && (includeInactive || this.activeInHierarchy)) return own;
    for (const ch of this.transform.children) {
      if (!includeInactive && !ch.gameObject.activeSelf) continue;
      const r = ch.gameObject.GetComponentInChildren(type, includeInactive);
      if (r) return r;
    }
    return null;
  }

  GetComponentsInChildren(type, includeInactive = false, out = []) {
    if (!includeInactive && !this.activeInHierarchy) return out;
    for (const c of this.components) if (matchType(c, type)) out.push(c);
    for (const ch of this.transform.children) ch.gameObject.GetComponentsInChildren(type, includeInactive, out);
    return out;
  }

  GetComponentInParent(type) {
    let t = this.transform;
    while (t) {
      const c = t.gameObject.GetComponent(type);
      if (c) return c;
      t = t.parent;
    }
    return null;
  }
}

function matchType(c, type) {
  if (typeof type === 'string') {
    if (c._typeName === type) return true;
    // match the class or any base class by its registered Unity type name
    for (let p = c.constructor; p && p !== Function.prototype; p = Object.getPrototypeOf(p)) {
      if (Object.prototype.hasOwnProperty.call(p, 'typeName') && p.typeName === type) return true;
    }
    return false;
  }
  return c instanceof type;
}

// ---------------------------------------------------------------- Components

export class Component {
  static typeName = 'Component';

  get transform() {
    return this.gameObject.transform;
  }

  get name() {
    return this.gameObject.name;
  }

  GetComponent(t) {
    return this.gameObject.GetComponent(t);
  }

  GetComponents(t) {
    return this.gameObject.GetComponents(t);
  }

  GetComponentInChildren(t, inc) {
    return this.gameObject.GetComponentInChildren(t, inc);
  }

  GetComponentsInChildren(t, inc) {
    return this.gameObject.GetComponentsInChildren(t, inc);
  }

  GetComponentInParent(t) {
    return this.gameObject.GetComponentInParent(t);
  }

  CompareLayer(mask) {
    return ((1 << this.gameObject.layer) & mask) !== 0;
  }

  // lifecycle plumbing (overridden by Behaviour)
  _awake() {}

  _activate() {}

  _deactivate() {}

  _destroy() {}
}

export class Behaviour extends Component {
  constructor() {
    super();
    this._enabled = true;
    this._isActiveAndEnabled = false;
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(v) {
    v = !!v;
    if (v === this._enabled) return;
    this._enabled = v;
    if (!this.gameObject || !this.gameObject._awoken) return;
    if (v && this.gameObject.activeInHierarchy) this._activate();
    else if (!v) this._deactivate();
  }

  get isActiveAndEnabled() {
    return this._isActiveAndEnabled;
  }
}

/** Base class for ported game scripts. Override Awake/OnEnable/Start/Update/FixedUpdate/LateUpdate/OnDisable/OnDestroy. */
export class MonoBehaviour extends Behaviour {
  static typeName = 'MonoBehaviour';

  constructor() {
    super();
    this._started = false;
    this._didAwake = false;
    this._destroyed = false;
  }

  _awake() {
    if (this._didAwake) return;
    this._didAwake = true;
    if (this.Awake) safe(() => this.Awake(), this);
  }

  _activate() {
    if (!this._enabled || this._isActiveAndEnabled || this._destroyed) return;
    this._isActiveAndEnabled = true;
    if (!this._didAwake) this._awake();
    if (this.OnEnable) safe(() => this.OnEnable(), this);
    World.behaviours.add(this);
    if (!this._started) World.pendingStart.push(this);
  }

  _deactivate() {
    if (!this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = false;
    World.behaviours.delete(this);
    if (this.OnDisable) safe(() => this.OnDisable(), this);
    if (!this.gameObject.activeInHierarchy || this._destroyed) Coroutines.stopOwner(this);
  }

  _destroy() {
    this._deactivate();
    this._destroyed = true;
    if (this._didAwake && this.OnDestroy) safe(() => this.OnDestroy(), this);
    Coroutines.stopOwner(this);
  }

  StartCoroutine(gen) {
    if (!gen) return null;
    return Coroutines.start(gen, this);
  }

  StopCoroutine(co) {
    Coroutines.stop(co);
  }

  StopAllCoroutines() {
    Coroutines.stopOwner(this);
  }

  Invoke(name, delay) {
    const self = this;
    this.StartCoroutine((function* () {
      const t0 = performance.now();
      while ((performance.now() - t0) / 1000 < delay) yield null;
      self[name]();
    })());
  }
}

function safe(fn, owner) {
  try {
    fn();
  } catch (e) {
    console.error(`[${owner.constructor.name} on ${owner.gameObject?.name}]`, e);
  }
}

// ---------------------------------------------------------------- lifecycle helpers

/** Call Awake + OnEnable on an object hierarchy that just became active for the first time. */
export function awakeObject(go) {
  if (go._awoken || !go.activeInHierarchy) return;
  go._awoken = true;
  for (const c of go.components) {
    c._awake();
    if (c instanceof Behaviour) c._activate();
    else c._activate();
  }
  for (const ch of go.transform.children) awakeObject(ch.gameObject);
}

export function Destroy(obj, delay = 0) {
  if (!obj) return;
  if (delay > 0) {
    setTimeout(() => Destroy(obj), delay * 1000);
    return;
  }
  if (obj instanceof GameObject) {
    if (!obj._pendingDestroy) {
      obj._pendingDestroy = true;
      World.pendingDestroy.push(obj);
    }
  } else if (obj instanceof Component) {
    obj._destroy();
    const go = obj.gameObject;
    const i = go.components.indexOf(obj);
    if (i >= 0) go.components.splice(i, 1);
  }
}

export function DestroyImmediate(go) {
  destroyNow(go);
}

function destroyNow(go) {
  if (go._destroyed) return;
  for (const ch of go.transform.children.slice()) destroyNow(ch.gameObject);
  for (const c of go.components) c._destroy();
  go._destroyed = true;
  if (go.transform.parent) {
    const p = go.transform.parent;
    const i = p.children.indexOf(go.transform);
    if (i >= 0) p.children.splice(i, 1);
  }
  go.transform.obj.removeFromParent();
  if (World.onRemoveObject3D) World.onRemoveObject3D(go.transform.obj);
  World.objects.delete(go);
}

export function flushDestroy() {
  const list = World.pendingDestroy;
  World.pendingDestroy = [];
  for (const go of list) destroyNow(go);
}

export function runPendingStarts() {
  const list = World.pendingStart;
  World.pendingStart = [];
  for (const b of list) {
    // inactive ones are queued again by _activate()
    if (b._started || b._destroyed || !b._isActiveAndEnabled) continue;
    b._started = true;
    if (b.Start) {
      const r = (() => {
        try {
          return b.Start();
        } catch (e) {
          console.error(`[${b.constructor.name} on ${b.gameObject?.name}] Start`, e);
          return null;
        }
      })();
      if (r && typeof r.next === 'function') b.StartCoroutine(r);
    }
  }
}

export { Deg2Rad };
