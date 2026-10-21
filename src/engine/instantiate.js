// Prefab instantiation: exported node trees -> GameObjects with live components, refs resolved.
import * as THREE from 'three';
import { GameObject, Behaviour, Component, MonoBehaviour, awakeObject, World } from './scene.js';
import { AnimationCurve, Gradient } from './math.js';
import { EventAction } from './core.js';
import { Assets, getPrefabJson } from './assets.js';
import { RectTransform } from '../ugui/rect.js';

export const ComponentRegistry = new Map();
export const SORegistry = new Map();

export function registerComponent(cls, name = cls.typeName || cls.name) {
  ComponentRegistry.set(name, cls);
  cls.typeName = name;
}

export function registerSO(cls, name = cls.typeName || cls.name) {
  SORegistry.set(name, cls);
  cls.typeName = name;
}

/** Placeholder for script types the web port does not implement (UI, Cinemachine data holders...). */
export class GenericBehaviour extends Behaviour {
  static typeName = 'Generic';
}

/** Reference to (a node/component inside) a prefab asset. Pass it to Instantiate(). */
export class PrefabRef {
  constructor(id, c, n) {
    this.id = id;
    this.c = c;
    this.n = n;
  }

  get json() {
    return getPrefabJson(this.id);
  }

  /** Read-only peek at the referenced component's raw data (like reading a prefab's serialized fields). */
  get data() {
    const j = this.json;
    if (!j || !this.c) return null;
    return j.nodes[this.c[0]]?.c?.[this.c[1]] || null;
  }

  get name() {
    return this.id.split('/').pop();
  }

  toString() {
    return this.name;
  }
}

// ---------------------------------------------------------------- ScriptableObjects

const soInstances = new Map();

export class ScriptableObject {
  static typeName = 'ScriptableObject';
}

export function getRuntimeSO(id) {
  if (soInstances.has(id)) return soInstances.get(id);
  const json = Assets.so[id];
  const cls = (json && SORegistry.get(json.$type)) || ScriptableObject;
  const so = new cls();
  so.name = json?.$name || id.split('/').pop();
  so._id = id;
  soInstances.set(id, so);
  if (json) {
    const ctx = { gos: null, comps: null };
    for (const [k, v] of Object.entries(json)) {
      if (k === '$type' || k === '$name' || k === '$fid' || k === '$sub' || k === 'm_Enabled') continue;
      const rv = resolveValue(v, ctx);
      if (so[k] instanceof EventAction) continue; // runtime events are never serialized data
      so[k] = rv;
    }
  }
  so.OnLoad?.();
  return so;
}

export function getRuntimeSOs() {
  return soInstances;
}

// ---------------------------------------------------------------- value resolution

export function resolveValue(v, ctx) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map((x) => resolveValue(x, ctx));
  if (typeof v !== 'object') return v;
  if ('$c' in v) {
    if (!ctx.comps) return null;
    const [n, i] = v.$c;
    return ctx.comps[n]?.[i] ?? null;
  }
  if ('$n' in v) return ctx.gos ? ctx.gos[v.$n] ?? null : null;
  if ('$t' in v) return ctx.gos ? ctx.gos[v.$t]?.transform ?? null : null;
  if ('$curve' in v) return AnimationCurve.from(v);
  if ('$grad' in v) return Gradient.from(v);
  if ('$so' in v) return getRuntimeSO(v.$so);
  if ('$prefab' in v) return new PrefabRef(v.$prefab, v.c, v.n);
  if ('$event' in v) {
    const e = new EventAction();
    e.persistent = resolveValue(v.$event, ctx);
    return e;
  }
  if ('$mat' in v || '$mesh' in v || '$tex' in v || '$sprite' in v || '$audio' in v || '$pmat' in v || '$builtinMesh' in v || '$builtin' in v || '$anim' in v || '$shader' in v || '$script' in v || '$asset' in v) return v;
  const out = {};
  for (const k in v) out[k] = resolveValue(v[k], ctx);
  return out;
}

// ---------------------------------------------------------------- Instantiate

/**
 * Instantiate(original, position?, rotation?, parent?)
 *  original: PrefabRef | prefab id string | GameObject/Component (clone of a live object is not supported)
 * Returns the GameObject, or the component the PrefabRef pointed at.
 */
export function Instantiate(original, position = null, rotation = null, parent = null, worldPositionStays = true) {
  if (position && position.isTransform) {
    // Instantiate(prefab, parent) / Instantiate(prefab, parent, worldPositionStays)
    parent = position;
    worldPositionStays = rotation === null ? false : !!rotation;
    position = null;
    rotation = null;
  } else if (position && position.transform && position.gameObject && !position.isVector3) {
    parent = position.transform;
    worldPositionStays = rotation === null ? false : !!rotation;
    position = null;
    rotation = null;
  }
  let ref = original;
  if (typeof original === 'string') ref = new PrefabRef(original);
  if (original && original._prefabRef) ref = original._prefabRef; // a component of an instance made from a prefab
  if (!(ref instanceof PrefabRef)) throw new Error('Instantiate: unsupported original ' + original);
  const json = getPrefabJson(ref.id);
  if (!json) throw new Error(`Prefab not loaded: ${ref.id}`);
  const { gos, comps } = build(json, ref);
  const root = gos[0];
  const tr = root.transform;
  if (parent) {
    tr.SetParent(parent.transform || parent, false);
    if (worldPositionStays === false && !position) {
      // keep prefab local pose under the parent (Unity Instantiate(prefab, parent))
    }
  }
  if (position) tr.position = new THREE.Vector3(position.x, position.y, position.z ?? tr.position.z);
  if (rotation) tr.rotation = rotation;
  if (root.activeInHierarchy) awakeObject(root);
  // scenes exported as prefabs can have several roots
  const extraRoots = [];
  for (let i = 1; i < json.nodes.length; i++) if (json.nodes[i].p === undefined) extraRoots.push(gos[i]);
  for (const r of extraRoots) if (r.activeInHierarchy) awakeObject(r);
  if (extraRoots.length) root._sceneRoots = [root, ...extraRoots];
  if (ref.c) return comps[ref.c[0]]?.[ref.c[1]] ?? root;
  if (ref.n !== undefined && ref.n !== null) return gos[ref.n] ?? root;
  return root;
}

function build(json, ref) {
  const nodes = json.nodes;
  const gos = new Array(nodes.length);
  const comps = new Array(nodes.length);
  // pass 1: objects + hierarchy (parents always precede children)
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    const go = nd.rect ? new GameObject(nd.n, RectTransform) : new GameObject(nd.n);
    if (nd.rect) go.transform.setFromData(nd.rect);
    go.layer = nd.l || 0;
    go.tag = nd.tag || 'Untagged';
    if (nd.a === 0) go.activeSelf = false;
    const o = go.transform.obj;
    if (nd.t) o.position.set(nd.t[0], nd.t[1], nd.t[2]);
    if (nd.r) o.quaternion.set(nd.r[0], nd.r[1], nd.r[2], nd.r[3]);
    if (nd.s) o.scale.set(nd.s[0], nd.s[1], nd.s[2]);
    if (nd.p !== undefined) {
      const parent = gos[nd.p].transform;
      parent.obj.add(o);
      go.transform.parent = parent;
      parent.children.push(go.transform);
    }
    gos[i] = go;
  }
  for (const go of gos) go.transform.obj.visible = go.activeInHierarchy;
  World.hierarchyVersion++;
  // pass 2: component instances
  for (let i = 0; i < nodes.length; i++) {
    const list = nodes[i].c || [];
    comps[i] = list.map((cd) => {
      const cls = ComponentRegistry.get(cd.$type);
      const c = cls ? new cls() : new GenericBehaviour();
      c.gameObject = gos[i];
      c._typeName = cd.$type;
      gos[i].components.push(c);
      return c;
    });
  }
  // pass 3: data
  const ctx = { gos, comps };
  for (let i = 0; i < nodes.length; i++) {
    const list = nodes[i].c || [];
    for (let k = 0; k < list.length; k++) {
      const cd = list[k];
      const c = comps[i][k];
      const data = resolveValue(cd, ctx);
      const cls = c.constructor;
      if (typeof cls.fromData === 'function') {
        cls.fromData(c, data);
      } else {
        if ('m_Enabled' in data && c instanceof Behaviour) c._enabled = data.m_Enabled !== 0;
        for (const key in data) {
          if (key === '$type' || key === 'm_Enabled') continue;
          if (c[key] instanceof EventAction && !(data[key] instanceof EventAction)) continue;
          try {
            c[key] = data[key];
          } catch {
            // getter-only property of the ported class: the raw value stays readable through c._data
          }
        }
      }
      c._data = data;
      if (ref && i === 0) c._prefabRef = new PrefabRef(ref.id, [i, k]);
      else if (ref) c._prefabRef = new PrefabRef(ref.id, [i, k]);
      c.OnDeserialize?.();
    }
  }
  gos[0]._prefabId = ref?.id;
  return { gos, comps };
}

/** new GameObject(name) with components, Unity-style. */
export function createGameObject(name, ...types) {
  const go = new GameObject(name);
  for (const t of types) go.AddComponent(t);
  awakeObject(go);
  return go;
}

export { MonoBehaviour, Component };
