// RectTransform: Unity's anchor / pivot layout model on top of the engine Transform.
// The pivot position (obj.position.xy) is derived from the parent rect, anchors and anchoredPosition;
// every change bumps a global version so rects are recomputed lazily (parents first).
import * as THREE from 'three';
import { Transform, World } from '../engine/scene.js';

export const RectVersion = { v: 1 };

export function bumpLayout() {
  RectVersion.v++;
}

export class Rect {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get xMin() {
    return this.x;
  }

  get yMin() {
    return this.y;
  }

  get xMax() {
    return this.x + this.width;
  }

  get yMax() {
    return this.y + this.height;
  }

  get center() {
    return new THREE.Vector2(this.x + this.width / 2, this.y + this.height / 2);
  }

  get size() {
    return new THREE.Vector2(this.width, this.height);
  }

  get min() {
    return new THREE.Vector2(this.x, this.y);
  }

  get max() {
    return new THREE.Vector2(this.x + this.width, this.y + this.height);
  }

  Contains(p) {
    return p.x >= this.x && p.x < this.x + this.width && p.y >= this.y && p.y < this.y + this.height;
  }
}

const v2 = (a, d = 0) => (a ? new THREE.Vector2(a[0] ?? a.x ?? d, a[1] ?? a.y ?? d) : new THREE.Vector2(d, d));
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class RectTransform extends Transform {
  constructor(gameObject) {
    super(gameObject);
    this._anchorMin = new THREE.Vector2(0.5, 0.5);
    this._anchorMax = new THREE.Vector2(0.5, 0.5);
    this._anchoredPosition = new THREE.Vector2(0, 0);
    this._sizeDelta = new THREE.Vector2(100, 100);
    this._pivot = new THREE.Vector2(0.5, 0.5);
    this._w = 100;
    this._h = 100;
    this._ver = 0;
    /** set by a root Canvas: the rect is driven by the screen instead of the parent */
    this._driven = null;
  }

  get isRectTransform() {
    return true;
  }

  setFromData(r) {
    this._anchorMin = v2(r.m_AnchorMin, 0.5);
    this._anchorMax = v2(r.m_AnchorMax, 0.5);
    this._anchoredPosition = v2(r.m_AnchoredPosition, 0);
    this._sizeDelta = v2(r.m_SizeDelta, 100);
    this._pivot = v2(r.m_Pivot, 0.5);
    this._ver = 0;
  }

  // ---------------------------------------------------------------- layout math

  get parentRect() {
    const p = this.parent;
    return p && p.isRectTransform ? p : null;
  }

  /** recompute size + pivot position from the parent if anything changed since the last time */
  _sync() {
    if (this._ver === RectVersion.v) return;
    const p = this.parentRect;
    let pw = 0;
    let ph = 0;
    let px = 0;
    let py = 0;
    if (p) {
      p._sync();
      pw = p._w;
      ph = p._h;
      px = -p._pivot.x * pw;
      py = -p._pivot.y * ph;
    }
    if (this._driven) {
      this._w = this._sizeDelta.x;
      this._h = this._sizeDelta.y;
    } else {
      const amin = this._anchorMin;
      const amax = this._anchorMax;
      this._w = (amax.x - amin.x) * pw + this._sizeDelta.x;
      this._h = (amax.y - amin.y) * ph + this._sizeDelta.y;
      if (!p && this.parent) {
        // RectTransform under a plain Transform (world-space TextMeshPro): the parent rect is empty at the origin
        this.obj.position.x = this._anchoredPosition.x;
        this.obj.position.y = this._anchoredPosition.y;
      }
      if (p) {
        // anchor reference point: the pivot's position inside the anchor rectangle
        const ax = px + pw * (amin.x + (amax.x - amin.x) * this._pivot.x);
        const ay = py + ph * (amin.y + (amax.y - amin.y) * this._pivot.y);
        this.obj.position.x = ax + this._anchoredPosition.x;
        this.obj.position.y = ay + this._anchoredPosition.y;
      }
    }
    this._ver = RectVersion.v;
  }

  /** anchoredPosition from the current local position (after a localPosition / position write) */
  _fromLocal() {
    const p = this.parentRect;
    if (!p) {
      if (this.parent) {
        this._anchoredPosition.set(this.obj.position.x, this.obj.position.y);
        bumpLayout();
      }
      return;
    }
    p._sync();
    const pw = p._w;
    const ph = p._h;
    const amin = this._anchorMin;
    const amax = this._anchorMax;
    const ax = -p._pivot.x * pw + pw * (amin.x + (amax.x - amin.x) * this._pivot.x);
    const ay = -p._pivot.y * ph + ph * (amin.y + (amax.y - amin.y) * this._pivot.y);
    this._anchoredPosition.set(this.obj.position.x - ax, this.obj.position.y - ay);
    bumpLayout();
  }

  get rect() {
    this._sync();
    return new Rect(-this._pivot.x * this._w, -this._pivot.y * this._h, this._w, this._h);
  }

  get width() {
    this._sync();
    return this._w;
  }

  get height() {
    this._sync();
    return this._h;
  }

  // ---------------------------------------------------------------- properties (value semantics like C# structs)

  get anchorMin() {
    return this._anchorMin.clone();
  }

  set anchorMin(v) {
    this._anchorMin.set(v.x, v.y);
    bumpLayout();
  }

  get anchorMax() {
    return this._anchorMax.clone();
  }

  set anchorMax(v) {
    this._anchorMax.set(v.x, v.y);
    bumpLayout();
  }

  get anchoredPosition() {
    return this._anchoredPosition.clone();
  }

  set anchoredPosition(v) {
    this._anchoredPosition.set(v.x, v.y);
    bumpLayout();
    this.markChanged();
  }

  get anchoredPosition3D() {
    return new THREE.Vector3(this._anchoredPosition.x, this._anchoredPosition.y, -this.obj.position.z);
  }

  set anchoredPosition3D(v) {
    this._anchoredPosition.set(v.x, v.y);
    this.obj.position.z = -(v.z || 0);
    bumpLayout();
  }

  get sizeDelta() {
    return this._sizeDelta.clone();
  }

  set sizeDelta(v) {
    this._sizeDelta.set(v.x, v.y);
    bumpLayout();
  }

  get pivot() {
    return this._pivot.clone();
  }

  set pivot(v) {
    this._pivot.set(v.x, v.y);
    bumpLayout();
  }

  get offsetMin() {
    this._sync();
    return new THREE.Vector2(this._anchoredPosition.x - this._sizeDelta.x * this._pivot.x, this._anchoredPosition.y - this._sizeDelta.y * this._pivot.y);
  }

  set offsetMin(v) {
    const d = new THREE.Vector2(v.x, v.y).sub(this.offsetMin);
    this._sizeDelta.sub(d);
    this._anchoredPosition.add(new THREE.Vector2(d.x * (1 - this._pivot.x), d.y * (1 - this._pivot.y)));
    bumpLayout();
  }

  get offsetMax() {
    return new THREE.Vector2(this._anchoredPosition.x + this._sizeDelta.x * (1 - this._pivot.x), this._anchoredPosition.y + this._sizeDelta.y * (1 - this._pivot.y));
  }

  set offsetMax(v) {
    const d = new THREE.Vector2(v.x, v.y).sub(this.offsetMax);
    this._sizeDelta.add(d);
    this._anchoredPosition.add(new THREE.Vector2(d.x * this._pivot.x, d.y * this._pivot.y));
    bumpLayout();
  }

  /** RectTransform.SetSizeWithCurrentAnchors(axis 0 = horizontal / 1 = vertical, size) */
  SetSizeWithCurrentAnchors(axis, size) {
    const p = this.parentRect;
    const ps = p ? (axis === 0 ? p.width : p.height) : 0;
    const k = axis === 0 ? 'x' : 'y';
    this._sizeDelta[k] = size - ps * (this._anchorMax[k] - this._anchorMin[k]);
    bumpLayout();
  }

  /** SetInsetAndSizeFromParentEdge(edge 0 Left 1 Right 2 Top 3 Bottom, inset, size) */
  SetInsetAndSizeFromParentEdge(edge, inset, size) {
    const axis = edge === 2 || edge === 3 ? 1 : 0;
    const end = edge === 2 || edge === 1;
    const k = axis === 0 ? 'x' : 'y';
    const a = end ? 1 : 0;
    this._anchorMin[k] = a;
    this._anchorMax[k] = a;
    this._sizeDelta[k] = size;
    this._anchoredPosition[k] = end ? -inset - size * (1 - this._pivot[k]) : inset + size * this._pivot[k];
    bumpLayout();
  }

  // ---------------------------------------------------------------- Transform overrides (keep anchoredPosition in sync)

  updateWorld() {
    for (let t = this; t; t = t.parent) if (t.isRectTransform) t._sync();
    return super.updateWorld();
  }

  get localPosition() {
    this._sync();
    return super.localPosition;
  }

  set localPosition(v) {
    super.localPosition = v;
    this._fromLocal();
  }

  get position() {
    this.updateWorld();
    return super.position;
  }

  set position(v) {
    this.parent?.updateWorld();
    super.position = v;
    this._fromLocal();
  }

  SetParent(parent, worldPositionStays = true) {
    const newParent = parent ? parent.transform : null;
    if (newParent === this.parent) return;
    let w = 0;
    let h = 0;
    if (worldPositionStays) {
      this.updateWorld();
      w = this._w * this.lossyScale.x;
      h = this._h * this.lossyScale.y;
    }
    super.SetParent(parent, worldPositionStays);
    if (worldPositionStays && newParent?.isRectTransform) {
      // keep the world-space size: Unity re-derives sizeDelta under the new parent
      const ls = this.lossyScale;
      newParent._sync();
      this._sizeDelta.set(
        (ls.x ? w / ls.x : w) - newParent._w * (this._anchorMax.x - this._anchorMin.x),
        (ls.y ? h / ls.y : h) - newParent._h * (this._anchorMax.y - this._anchorMin.y),
      );
      this._fromLocal();
    }
    bumpLayout();
  }

  /** corners in world space (bottom-left, top-left, top-right, bottom-right) */
  GetWorldCorners(out = []) {
    const r = this.rect;
    const m = this.updateWorld();
    const pts = [
      [r.x, r.y],
      [r.x, r.yMax],
      [r.xMax, r.yMax],
      [r.xMax, r.y],
    ];
    for (let i = 0; i < 4; i++) out[i] = new THREE.Vector3(pts[i][0], pts[i][1], 0).applyMatrix4(m);
    return out;
  }

  GetLocalCorners(out = []) {
    const r = this.rect;
    out[0] = new THREE.Vector3(r.x, r.y, 0);
    out[1] = new THREE.Vector3(r.x, r.yMax, 0);
    out[2] = new THREE.Vector3(r.xMax, r.yMax, 0);
    out[3] = new THREE.Vector3(r.xMax, r.y, 0);
    return out;
  }

  /** world point -> local point (z ignored); null when the transform is degenerate (zero scale) */
  worldToLocal2(x, y) {
    const e = this.updateWorld().elements;
    // 2D part of the matrix: [e0 e4; e1 e5] (+ translation e12, e13)
    const det = e[0] * e[5] - e[4] * e[1];
    if (Math.abs(det) < 1e-9) return null;
    const dx = x - e[12];
    const dy = y - e[13];
    return { x: (e[5] * dx - e[4] * dy) / det, y: (-e[1] * dx + e[0] * dy) / det };
  }
}

/** RectTransformUtility subset (screen space == world space for overlay canvases) */
export const RectTransformUtility = {
  RectangleContainsScreenPoint(rt, p) {
    if (!rt?.isRectTransform) return false;
    const l = rt.worldToLocal2(p.x, p.y);
    return !!l && rt.rect.Contains(l);
  },
  ScreenPointToLocalPointInRectangle(rt, p) {
    const l = rt.worldToLocal2(p.x, p.y);
    return new THREE.Vector2(l.x, l.y);
  },
  WorldToScreenPoint(cam, p) {
    if (!cam) return new THREE.Vector2(p.x, p.y);
    return cam.WorldToScreenPoint(p);
  },
};

World.uiVersion = 0;
