// uGUI graphics: Graphic / Image / RawImage / Mask / RectMask2D / CanvasRenderer (ported from Unity's UI sources).
import * as THREE from 'three';
import { MonoBehaviour, Component, Behaviour } from '../engine/scene.js';
import { Time } from '../engine/core.js';
import { registerComponent } from '../engine/instantiate.js';
import { getWhiteTexture } from '../engine/assets.js';
import { UISprites } from './sprites.js';
import { bumpLayout } from './rect.js';

// ---------------------------------------------------------------- Color

export class Color {
  constructor(r = 1, g = 1, b = 1, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  static from(v, fallback = null) {
    if (v instanceof Color) return v.clone();
    if (Array.isArray(v)) return new Color(v[0] ?? 1, v[1] ?? 1, v[2] ?? 1, v[3] ?? 1);
    if (v && typeof v === 'object') {
      if ('rgba' in v) {
        const n = v.rgba >>> 0;
        return new Color((n & 255) / 255, ((n >>> 8) & 255) / 255, ((n >>> 16) & 255) / 255, ((n >>> 24) & 255) / 255);
      }
      if ('r' in v) return new Color(v.r, v.g, v.b, v.a ?? 1);
    }
    return fallback ? fallback.clone() : new Color();
  }

  clone() {
    return new Color(this.r, this.g, this.b, this.a);
  }

  equals(o) {
    return !!o && o.r === this.r && o.g === this.g && o.b === this.b && o.a === this.a;
  }

  mul(o) {
    return new Color(this.r * o.r, this.g * o.g, this.b * o.b, this.a * o.a);
  }

  withAlpha(a) {
    return new Color(this.r, this.g, this.b, a);
  }

  static Lerp(a, b, t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
  }

  static LerpUnclamped(a, b, t) {
    return new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
  }

  static get white() {
    return new Color(1, 1, 1, 1);
  }

  static get black() {
    return new Color(0, 0, 0, 1);
  }

  static get clear() {
    return new Color(0, 0, 0, 0);
  }

  static get gray() {
    return new Color(0.5, 0.5, 0.5, 1);
  }

  toArray() {
    return [this.r, this.g, this.b, this.a];
  }
}

export const ColorUtility = {
  TryParseHtmlString(s) {
    if (!s) return null;
    s = s.trim();
    if (s[0] !== '#') {
      const named = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#00ff00', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#a020f0', grey: '#808080', gray: '#808080' };
      s = named[s.toLowerCase()];
      if (!s) return null;
    }
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return new Color(n(0), n(2), n(4), h.length === 8 ? n(6) : 1);
  },
  ToHtmlStringRGB(c) {
    const x = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0').toUpperCase();
    return x(c.r) + x(c.g) + x(c.b);
  },
};

// ---------------------------------------------------------------- mesh building (VertexHelper)

export class UIMesh {
  constructor() {
    this.pos = []; // x, y (local space)
    this.uv = []; // u, v
    this.col = []; // r, g, b, a (0..1)
    this.extra = null; // per-vertex extra floats (TMP: scale + underlay offset)
    this.idx = [];
  }

  clear() {
    this.pos.length = 0;
    this.uv.length = 0;
    this.col.length = 0;
    this.idx.length = 0;
    if (this.extra) this.extra.length = 0;
  }

  get vertCount() {
    return this.pos.length / 2;
  }

  addVert(x, y, c, u, v) {
    this.pos.push(x, y);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b, c.a);
  }

  /** quad from min/max corners */
  addQuad(x0, y0, x1, y1, c, u0, v0, u1, v1) {
    const i = this.vertCount;
    this.addVert(x0, y0, c, u0, v0);
    this.addVert(x0, y1, c, u0, v1);
    this.addVert(x1, y1, c, u1, v1);
    this.addVert(x1, y0, c, u1, v0);
    this.idx.push(i, i + 1, i + 2, i + 2, i + 3, i);
  }

  /** quad from 4 positions / uvs (bottom-left, top-left, top-right, bottom-right) */
  addQuad4(xy, uv, c) {
    const i = this.vertCount;
    for (let k = 0; k < 4; k++) this.addVert(xy[k][0], xy[k][1], c, uv[k][0], uv[k][1]);
    this.idx.push(i, i + 1, i + 2, i + 2, i + 3, i);
  }
}

// ---------------------------------------------------------------- CanvasRenderer

/** Holds the per-renderer color / alpha that Selectable transitions and CrossFade* animate. */
export class CanvasRenderer extends Component {
  static typeName = 'CanvasRenderer';

  constructor() {
    super();
    this.color = new Color(1, 1, 1, 1);
    this.cull = false;
    this._fade = null;
  }

  SetColor(c) {
    this.color = Color.from(c);
  }

  GetColor() {
    return this.color.clone();
  }

  SetAlpha(a) {
    this.color.a = a;
  }

  GetAlpha() {
    return this.color.a;
  }

  GetInheritedAlpha() {
    return this.color.a * (this.gameObject ? groupAlpha(this.gameObject.transform) : 1);
  }
}

/** product of the CanvasGroup alphas above t (stops at ignoreParentGroups) */
export function groupAlpha(t) {
  let a = 1;
  for (let p = t; p; p = p.parent) {
    const g = p.gameObject.GetComponent('CanvasGroup');
    if (g && g.enabled) {
      a *= g.alpha;
      if (g.ignoreParentGroups) break;
    }
  }
  return a;
}

// ---------------------------------------------------------------- Graphic

const _white = () => getWhiteTexture();

export class Graphic extends MonoBehaviour {
  static typeName = 'Graphic';

  constructor() {
    super();
    this._color = new Color();
    this.m_RaycastTarget = 1;
    this.m_RaycastPadding = [0, 0, 0, 0];
    this.m_Maskable = 1;
    this.m_Material = null;
    this._mesh = new UIMesh();
    this._vdirty = true;
    this._meshKey = '';
    this.depth = -1;
    this._cr = null;
  }

  OnDeserialize() {
    if (this._data?.m_Color) this._color = Color.from(this._data.m_Color);
  }

  get rectTransform() {
    return this.gameObject.transform;
  }

  get canvasRenderer() {
    if (!this._cr || this._cr.gameObject !== this.gameObject) {
      this._cr = this.gameObject.GetComponent(CanvasRenderer);
      if (!this._cr) this._cr = this.gameObject.AddComponent(CanvasRenderer);
    }
    return this._cr;
  }

  get canvas() {
    return this.GetComponentInParent('Canvas');
  }

  get color() {
    return this._color.clone();
  }

  set color(c) {
    const n = Color.from(c);
    if (n.equals(this._color)) return;
    this._color = n;
    this.SetVerticesDirty();
  }

  get raycastTarget() {
    return !!this.m_RaycastTarget;
  }

  set raycastTarget(v) {
    this.m_RaycastTarget = v ? 1 : 0;
  }

  get maskable() {
    return !!this.m_Maskable;
  }

  set maskable(v) {
    this.m_Maskable = v ? 1 : 0;
  }

  get material() {
    return this.m_Material;
  }

  set material(m) {
    this.m_Material = m;
  }

  get mainTexture() {
    return _white();
  }

  SetVerticesDirty() {
    this._vdirty = true;
  }

  SetMaterialDirty() {}

  SetAllDirty() {
    this._vdirty = true;
    bumpLayout();
  }

  SetLayoutDirty() {
    bumpLayout();
  }

  SetNativeSize() {}

  OnEnable() {
    this._vdirty = true;
  }

  /** local-space mesh, rebuilt when dirty or when the rect changed */
  getMesh() {
    const rt = this.rectTransform;
    const key = rt.isRectTransform ? `${rt.width}|${rt.height}|${rt._pivot.x}|${rt._pivot.y}` : '';
    if (this._vdirty || key !== this._meshKey) {
      this._mesh.clear();
      this.OnPopulateMesh(this._mesh);
      this._meshKey = key;
      this._vdirty = false;
    }
    return this._mesh;
  }

  OnPopulateMesh(m) {
    const r = this.rectTransform.rect;
    m.addQuad(r.x, r.y, r.xMax, r.yMax, this._color, 0, 0, 1, 1);
  }

  // ---- CanvasRenderer cross fades (Selectable color tint, CrossFadeAlpha)
  CrossFadeColor(target, duration, ignoreTimeScale, useAlpha, useRGB = true) {
    const cr = this.canvasRenderer;
    const from = cr.GetColor();
    const to = Color.from(target);
    if (!useRGB) {
      to.r = from.r;
      to.g = from.g;
      to.b = from.b;
    }
    if (!useAlpha) to.a = from.a;
    if (duration <= 0 || !this.gameObject.activeInHierarchy) {
      cr.SetColor(to);
      cr._fade = null;
      return;
    }
    cr._fade = { from, to, t: 0, duration, unscaled: !!ignoreTimeScale };
    UIFades.add(cr);
  }

  CrossFadeAlpha(alpha, duration, ignoreTimeScale) {
    this.CrossFadeColor(new Color(1, 1, 1, alpha), duration, ignoreTimeScale, true, false);
  }

  // ---- raycasting (Graphic.Raycast)
  Raycast(sp) {
    if (!this.isActiveAndEnabled) return false;
    let ignoreParentGroups = false;
    let continueTraversal = true;
    for (let t = this.transform; t; t = continueTraversal ? t.parent : null) {
      for (const c of t.gameObject.components) {
        if (c._typeName === 'Canvas' && c.overrideSorting) continueTraversal = false;
        if (typeof c.IsRaycastLocationValid !== 'function') continue;
        let valid = true;
        if (c instanceof CanvasGroupBase) {
          if (!c.enabled) continue;
          if (!ignoreParentGroups && c.ignoreParentGroups) {
            ignoreParentGroups = true;
            valid = c.IsRaycastLocationValid(sp);
          } else if (!ignoreParentGroups) valid = c.IsRaycastLocationValid(sp);
        } else valid = c.IsRaycastLocationValid(sp);
        if (!valid) return false;
      }
    }
    return true;
  }
}

/** base for CanvasGroup so Graphic.Raycast can recognize it without importing canvas.js */
export class CanvasGroupBase extends Behaviour {}

/** running CanvasRenderer fades, ticked by the UI system each frame */
export const UIFades = {
  list: new Set(),
  add(cr) {
    this.list.add(cr);
  },
  tick() {
    for (const cr of this.list) {
      const f = cr._fade;
      if (!f) {
        this.list.delete(cr);
        continue;
      }
      f.t += f.unscaled ? Time.unscaledDeltaTime : Time.deltaTime;
      const k = Math.min(1, f.t / f.duration);
      cr.color = Color.Lerp(f.from, f.to, k);
      if (k >= 1) {
        cr._fade = null;
        this.list.delete(cr);
      }
    }
  },
};

// ---------------------------------------------------------------- Image

export const ImageType = { Simple: 0, Sliced: 1, Tiled: 2, Filled: 3 };
export const FillMethod = { Horizontal: 0, Vertical: 1, Radial90: 2, Radial180: 3, Radial360: 4 };

const lerp = (a, b, t) => a + (b - a) * (t < 0 ? 0 : t > 1 ? 1 : t);

export class Image extends Graphic {
  static typeName = 'Image';

  constructor() {
    super();
    this._sprite = null;
    this.m_Type = 0;
    this.m_PreserveAspect = 0;
    this.m_FillCenter = 1;
    this.m_FillMethod = 4;
    this.m_FillAmount = 1;
    this.m_FillClockwise = 1;
    this.m_FillOrigin = 0;
    this.m_UseSpriteMesh = 0;
    this.m_PixelsPerUnitMultiplier = 1;
    this.alphaHitTestMinimumThreshold = 0;
  }

  OnDeserialize() {
    super.OnDeserialize();
    this._sprite = UISprites.get(this._data?.m_Sprite);
    this._overrideSprite = null;
  }

  get sprite() {
    return this._sprite;
  }

  set sprite(s) {
    const n = UISprites.get(s);
    if (n === this._sprite) return;
    this._sprite = n;
    this.SetAllDirty();
  }

  get overrideSprite() {
    return this._overrideSprite || this._sprite;
  }

  set overrideSprite(s) {
    this._overrideSprite = UISprites.get(s);
    this.SetAllDirty();
  }

  get activeSprite() {
    return this._overrideSprite || this._sprite;
  }

  get mainTexture() {
    return this.activeSprite?.texture || _white();
  }

  get type() {
    return this.m_Type;
  }

  set type(v) {
    this.m_Type = v;
    this.SetVerticesDirty();
  }

  get fillAmount() {
    return this.m_FillAmount;
  }

  set fillAmount(v) {
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    if (v === this.m_FillAmount) return;
    this.m_FillAmount = v;
    this.SetVerticesDirty();
  }

  get fillMethod() {
    return this.m_FillMethod;
  }

  set fillMethod(v) {
    this.m_FillMethod = v;
    this.SetVerticesDirty();
  }

  get fillOrigin() {
    return this.m_FillOrigin;
  }

  set fillOrigin(v) {
    this.m_FillOrigin = v;
    this.SetVerticesDirty();
  }

  get fillClockwise() {
    return !!this.m_FillClockwise;
  }

  set fillClockwise(v) {
    this.m_FillClockwise = v ? 1 : 0;
    this.SetVerticesDirty();
  }

  get fillCenter() {
    return !!this.m_FillCenter;
  }

  set fillCenter(v) {
    this.m_FillCenter = v ? 1 : 0;
    this.SetVerticesDirty();
  }

  get preserveAspect() {
    return !!this.m_PreserveAspect;
  }

  set preserveAspect(v) {
    this.m_PreserveAspect = v ? 1 : 0;
    this.SetVerticesDirty();
  }

  get pixelsPerUnitMultiplier() {
    return this.m_PixelsPerUnitMultiplier;
  }

  set pixelsPerUnitMultiplier(v) {
    this.m_PixelsPerUnitMultiplier = Math.max(0.01, v);
    this.SetVerticesDirty();
  }

  get hasBorder() {
    return !!this.activeSprite?.hasBorder;
  }

  get pixelsPerUnit() {
    const s = this.activeSprite;
    const sp = s ? s.pixelsPerUnit : 100;
    const ref = this.canvas?.referencePixelsPerUnit || 100;
    return sp / ref;
  }

  get multipliedPixelsPerUnit() {
    return this.pixelsPerUnit * this.m_PixelsPerUnitMultiplier;
  }

  // ---- ILayoutElement
  get minWidth() {
    return 0;
  }

  get minHeight() {
    return 0;
  }

  get preferredWidth() {
    const s = this.activeSprite;
    if (!s) return 0;
    if (this.m_Type === ImageType.Sliced || this.m_Type === ImageType.Tiled) return (s.border.x + s.border.z) / this.pixelsPerUnit;
    return s.rect.width / this.pixelsPerUnit;
  }

  get preferredHeight() {
    const s = this.activeSprite;
    if (!s) return 0;
    if (this.m_Type === ImageType.Sliced || this.m_Type === ImageType.Tiled) return (s.border.y + s.border.w) / this.pixelsPerUnit;
    return s.rect.height / this.pixelsPerUnit;
  }

  get flexibleWidth() {
    return -1;
  }

  get flexibleHeight() {
    return -1;
  }

  SetNativeSize() {
    const s = this.activeSprite;
    if (!s) return;
    const rt = this.rectTransform;
    rt.anchorMax = rt.anchorMin;
    rt.sizeDelta = new THREE.Vector2(s.rect.width / this.pixelsPerUnit, s.rect.height / this.pixelsPerUnit);
    this.SetAllDirty();
  }

  // ---- mesh generation
  OnPopulateMesh(m) {
    if (!this.activeSprite) {
      super.OnPopulateMesh(m);
      return;
    }
    switch (this.m_Type) {
      case ImageType.Sliced:
      case ImageType.Tiled:
        this.generateSliced(m);
        break;
      case ImageType.Filled:
        this.generateFilled(m, !!this.m_PreserveAspect);
        break;
      default:
        this.generateSimple(m, !!this.m_PreserveAspect);
    }
  }

  getDrawingDimensions(preserve) {
    const s = this.activeSprite;
    const r = this.rectTransform.rect;
    let { x, y, width: w, height: h } = r;
    if (preserve && s && s.rect.width > 0 && s.rect.height > 0) {
      const pv = this.rectTransform._pivot;
      const spriteRatio = s.rect.width / s.rect.height;
      const rectRatio = w / h;
      if (spriteRatio > rectRatio) {
        const old = h;
        h = w * (1 / spriteRatio);
        y += (old - h) * pv.y;
      } else {
        const old = w;
        w = h * spriteRatio;
        x += (old - w) * pv.x;
      }
    }
    return [x, y, x + w, y + h];
  }

  generateSimple(m, preserve) {
    const v = this.getDrawingDimensions(preserve);
    const [u0, v0, u1, v1] = this.activeSprite.outerUV;
    m.addQuad(v[0], v[1], v[2], v[3], this._color, u0, v0, u1, v1);
  }

  getAdjustedBorders(border, r) {
    const orig = this.rectTransform.rect;
    const size = [r.width, r.height];
    const osize = [orig.width, orig.height];
    for (let axis = 0; axis < 2; axis++) {
      if (osize[axis] !== 0) {
        const k = size[axis] / osize[axis];
        border[axis] *= k;
        border[axis + 2] *= k;
      }
      const combined = border[axis] + border[axis + 2];
      if (size[axis] < combined && combined !== 0) {
        const k = size[axis] / combined;
        border[axis] *= k;
        border[axis + 2] *= k;
      }
    }
    return border;
  }

  generateSliced(m) {
    const s = this.activeSprite;
    if (!s.hasBorder) {
      this.generateSimple(m, false);
      return;
    }
    const outer = s.outerUV;
    const inner = s.innerUV;
    const r = this.rectTransform.rect;
    const ppu = this.multipliedPixelsPerUnit;
    const b = this.getAdjustedBorders([s.border.x / ppu, s.border.y / ppu, s.border.z / ppu, s.border.w / ppu], r);
    const vx = [r.x, r.x + b[0], r.x + r.width - b[2], r.x + r.width];
    const vy = [r.y, r.y + b[1], r.y + r.height - b[3], r.y + r.height];
    const ux = [outer[0], inner[0], inner[2], outer[2]];
    const uy = [outer[1], inner[1], inner[3], outer[3]];
    const fillCenter = !!this.m_FillCenter;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        if (!fillCenter && x === 1 && y === 1) continue;
        m.addQuad(vx[x], vy[y], vx[x + 1], vy[y + 1], this._color, ux[x], uy[y], ux[x + 1], uy[y + 1]);
      }
    }
  }

  generateFilled(m, preserve) {
    const amount = this.m_FillAmount;
    if (amount < 0.001) return;
    const v = this.getDrawingDimensions(preserve);
    let [tx0, ty0, tx1, ty1] = this.activeSprite.outerUV;
    const method = this.m_FillMethod;
    const origin = this.m_FillOrigin;
    if (method === FillMethod.Horizontal || method === FillMethod.Vertical) {
      if (method === FillMethod.Horizontal) {
        const fill = (tx1 - tx0) * amount;
        if (origin === 1) {
          v[0] = v[2] - (v[2] - v[0]) * amount;
          tx0 = tx1 - fill;
        } else {
          v[2] = v[0] + (v[2] - v[0]) * amount;
          tx1 = tx0 + fill;
        }
      } else {
        const fill = (ty1 - ty0) * amount;
        if (origin === 1) {
          v[1] = v[3] - (v[3] - v[1]) * amount;
          ty0 = ty1 - fill;
        } else {
          v[3] = v[1] + (v[3] - v[1]) * amount;
          ty1 = ty0 + fill;
        }
      }
    }
    const xy = [
      [v[0], v[1]],
      [v[0], v[3]],
      [v[2], v[3]],
      [v[2], v[1]],
    ];
    const uv = [
      [tx0, ty0],
      [tx0, ty1],
      [tx1, ty1],
      [tx1, ty0],
    ];
    const cw = !!this.m_FillClockwise;
    const c = this._color;
    if (amount < 1 && method !== FillMethod.Horizontal && method !== FillMethod.Vertical) {
      if (method === FillMethod.Radial90) {
        if (radialCut(xy, uv, amount, cw, origin)) m.addQuad4(xy, uv, c);
      } else if (method === FillMethod.Radial180) {
        for (let side = 0; side < 2; side++) {
          let fx0, fx1, fy0, fy1;
          const even = origin > 1 ? 1 : 0;
          if (origin === 0 || origin === 2) {
            fy0 = 0;
            fy1 = 1;
            if (side === even) {
              fx0 = 0;
              fx1 = 0.5;
            } else {
              fx0 = 0.5;
              fx1 = 1;
            }
          } else {
            fx0 = 0;
            fx1 = 1;
            if (side === even) {
              fy0 = 0.5;
              fy1 = 1;
            } else {
              fy0 = 0;
              fy1 = 0.5;
            }
          }
          const [qxy, quv] = subQuad(v, tx0, ty0, tx1, ty1, fx0, fx1, fy0, fy1);
          const val = cw ? amount * 2 - side : amount * 2 - (1 - side);
          if (radialCut(qxy, quv, Math.min(1, Math.max(0, val)), cw, (side + origin + 3) % 4)) m.addQuad4(qxy, quv, c);
        }
      } else if (method === FillMethod.Radial360) {
        for (let corner = 0; corner < 4; corner++) {
          let fx0, fx1, fy0, fy1;
          if (corner < 2) {
            fx0 = 0;
            fx1 = 0.5;
          } else {
            fx0 = 0.5;
            fx1 = 1;
          }
          if (corner === 0 || corner === 3) {
            fy0 = 0;
            fy1 = 0.5;
          } else {
            fy0 = 0.5;
            fy1 = 1;
          }
          const [qxy, quv] = subQuad(v, tx0, ty0, tx1, ty1, fx0, fx1, fy0, fy1);
          const val = cw ? amount * 4 - ((corner + origin) % 4) : amount * 4 - (3 - ((corner + origin) % 4));
          if (radialCut(qxy, quv, Math.min(1, Math.max(0, val)), cw, (corner + 2) % 4)) m.addQuad4(qxy, quv, c);
        }
      }
    } else m.addQuad4(xy, uv, c);
  }

  /** ICanvasRaycastFilter: alpha hit testing is not used by the game (threshold 0) */
  IsRaycastLocationValid() {
    return true;
  }
}

function subQuad(v, tx0, ty0, tx1, ty1, fx0, fx1, fy0, fy1) {
  const x0 = lerp(v[0], v[2], fx0);
  const x1 = lerp(v[0], v[2], fx1);
  const y0 = lerp(v[1], v[3], fy0);
  const y1 = lerp(v[1], v[3], fy1);
  const u0 = lerp(tx0, tx1, fx0);
  const u1 = lerp(tx0, tx1, fx1);
  const w0 = lerp(ty0, ty1, fy0);
  const w1 = lerp(ty0, ty1, fy1);
  return [
    [
      [x0, y0],
      [x0, y1],
      [x1, y1],
      [x1, y0],
    ],
    [
      [u0, w0],
      [u0, w1],
      [u1, w1],
      [u1, w0],
    ],
  ];
}

function radialCut(xy, uv, fill, invert, corner) {
  if (fill < 0.001) return false;
  if ((corner & 1) === 1) invert = !invert;
  if (!invert && fill > 0.999) return true;
  let angle = Math.min(1, Math.max(0, fill));
  if (invert) angle = 1 - angle;
  angle *= Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  radialCutPts(xy, cos, sin, invert, corner);
  radialCutPts(uv, cos, sin, invert, corner);
  return true;
}

function radialCutPts(xy, cos, sin, invert, corner) {
  const i0 = corner;
  const i1 = (corner + 1) % 4;
  const i2 = (corner + 2) % 4;
  const i3 = (corner + 3) % 4;
  if ((corner & 1) === 1) {
    if (sin > cos) {
      cos /= sin;
      sin = 1;
      if (invert) {
        xy[i1][0] = lerp(xy[i0][0], xy[i2][0], cos);
        xy[i2][0] = xy[i1][0];
      }
    } else if (cos > sin) {
      sin /= cos;
      cos = 1;
      if (!invert) {
        xy[i2][1] = lerp(xy[i0][1], xy[i2][1], sin);
        xy[i3][1] = xy[i2][1];
      }
    } else {
      cos = 1;
      sin = 1;
    }
    if (!invert) xy[i3][0] = lerp(xy[i0][0], xy[i2][0], cos);
    else xy[i1][1] = lerp(xy[i0][1], xy[i2][1], sin);
  } else {
    if (cos > sin) {
      sin /= cos;
      cos = 1;
      if (!invert) {
        xy[i1][1] = lerp(xy[i0][1], xy[i2][1], sin);
        xy[i2][1] = xy[i1][1];
      }
    } else if (sin > cos) {
      cos /= sin;
      sin = 1;
      if (invert) {
        xy[i2][0] = lerp(xy[i0][0], xy[i2][0], cos);
        xy[i3][0] = xy[i2][0];
      }
    } else {
      cos = 1;
      sin = 1;
    }
    if (invert) xy[i3][1] = lerp(xy[i0][1], xy[i2][1], sin);
    else xy[i1][0] = lerp(xy[i0][0], xy[i2][0], cos);
  }
}

// ---------------------------------------------------------------- RawImage

export class RawImage extends Graphic {
  static typeName = 'RawImage';

  constructor() {
    super();
    this._tex = null;
    this.m_UVRect = { x: 0, y: 0, width: 1, height: 1 };
  }

  OnDeserialize() {
    super.OnDeserialize();
    this._tex = UISprites.get(this._data?.m_Texture);
    const r = this._data?.m_UVRect;
    if (r) this.m_UVRect = { x: r.x ?? 0, y: r.y ?? 0, width: r.width ?? 1, height: r.height ?? 1 };
  }

  get texture() {
    return this._tex;
  }

  set texture(t) {
    this._tex = t && t.isTexture ? new TextureSpriteLike(t) : UISprites.get(t);
    this.SetVerticesDirty();
  }

  get uvRect() {
    return { ...this.m_UVRect };
  }

  set uvRect(r) {
    this.m_UVRect = { x: r.x, y: r.y, width: r.width, height: r.height };
    this.SetVerticesDirty();
  }

  get mainTexture() {
    return this._tex?.texture || _white();
  }

  OnPopulateMesh(m) {
    const r = this.rectTransform.rect;
    const s = this._tex;
    const uvr = this.m_UVRect;
    const u0 = s ? s.u0 : 0;
    const v0 = s ? s.v0 : 0;
    const du = s ? s.u1 - s.u0 : 1;
    const dv = s ? s.v1 - s.v0 : 1;
    m.addQuad(r.x, r.y, r.xMax, r.yMax, this._color, u0 + uvr.x * du, v0 + uvr.y * dv, u0 + (uvr.x + uvr.width) * du, v0 + (uvr.y + uvr.height) * dv);
  }

  get preferredWidth() {
    return this._tex?.rect.width || 0;
  }

  get preferredHeight() {
    return this._tex?.rect.height || 0;
  }
}

class TextureSpriteLike {
  constructor(tex) {
    this.texture = tex;
    this.u0 = 0;
    this.v0 = 0;
    this.u1 = 1;
    this.v1 = 1;
    this.rect = { width: tex.image?.width || 1, height: tex.image?.height || 1 };
  }
}

// ---------------------------------------------------------------- masks

export class Mask extends MonoBehaviour {
  static typeName = 'Mask';

  constructor() {
    super();
    this.m_ShowMaskGraphic = 1;
  }

  get showMaskGraphic() {
    return !!this.m_ShowMaskGraphic;
  }

  set showMaskGraphic(v) {
    this.m_ShowMaskGraphic = v ? 1 : 0;
  }

  get graphic() {
    return this.GetComponent(Graphic);
  }

  get rectTransform() {
    return this.transform;
  }

  MaskEnabled() {
    return this.isActiveAndEnabled && !!this.graphic;
  }

  IsRaycastLocationValid(sp) {
    if (!this.isActiveAndEnabled) return true;
    const rt = this.transform;
    const l = rt.worldToLocal2(sp.x, sp.y);
    return !!l && rt.rect.Contains(l);
  }
}

export class RectMask2D extends MonoBehaviour {
  static typeName = 'RectMask2D';

  constructor() {
    super();
    this.m_Padding = [0, 0, 0, 0]; // left, bottom, right, top
    this.m_Softness = [0, 0];
  }

  get padding() {
    return this.m_Padding;
  }

  get rectTransform() {
    return this.transform;
  }

  /** clip rect in world (screen) space: axis-aligned bounds of the padded rect */
  worldClipRect() {
    const rt = this.transform;
    const r = rt.rect;
    const p = this.m_Padding || [0, 0, 0, 0];
    const m = rt.updateWorld().elements;
    const pts = [
      [r.x + p[0], r.y + p[1]],
      [r.xMax - p[2], r.yMax - p[3]],
    ];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of [pts[0], [pts[0][0], pts[1][1]], pts[1], [pts[1][0], pts[0][1]]]) {
      const wx = m[0] * x + m[4] * y + m[12];
      const wy = m[1] * x + m[5] * y + m[13];
      x0 = Math.min(x0, wx);
      y0 = Math.min(y0, wy);
      x1 = Math.max(x1, wx);
      y1 = Math.max(y1, wy);
    }
    return [x0, y0, x1, y1];
  }

  IsRaycastLocationValid(sp) {
    if (!this.isActiveAndEnabled) return true;
    const [x0, y0, x1, y1] = this.worldClipRect();
    return sp.x >= x0 && sp.x <= x1 && sp.y >= y0 && sp.y <= y1;
  }
}

for (const cls of [CanvasRenderer, Image, RawImage, Mask, RectMask2D]) registerComponent(cls);
