// Canvas / CanvasScaler / CanvasGroup / GraphicRaycaster and the per-frame UI pass:
// screen-driven root canvases, layout, draw-order traversal (masks, clip rects, sorting) and raycasting.
import * as THREE from 'three';
import { MonoBehaviour, World } from '../engine/scene.js';
import { Assets } from '../engine/assets.js';
import { registerComponent } from '../engine/instantiate.js';
import { Graphic, Mask, RectMask2D, CanvasGroupBase, UIFades } from './graphic.js';
import { bumpLayout } from './rect.js';
import { LayoutSystem } from './layout.js';

const CMP = ['always', 'never', 'less', 'equal', 'lequal', 'greater', 'notequal', 'gequal', 'always'];
const OPS = ['keep', 'zero', 'replace', 'incr', 'incrwrap', 'decr', 'decrwrap', 'invert'];

/** stencil state of a custom UI material (_StencilComp / _Stencil ...) when no Mask drives the graphic */
function materialStencil(graphic) {
  const id = graphic.m_Material?.$mat;
  if (!id) return null;
  const f = Assets.materials[id]?.floats;
  if (!f || f._StencilComp === undefined || f._StencilComp === 8 || f._StencilComp === 0) return null;
  return { ref: f._Stencil | 0, func: CMP[f._StencilComp | 0], op: OPS[f._StencilOp | 0], read: f._StencilReadMask ?? 255, write: f._StencilWriteMask ?? 255, colorWrite: (f._ColorMask ?? 15) !== 0 };
}

export const RenderMode = { ScreenSpaceOverlay: 0, ScreenSpaceCamera: 1, WorldSpace: 2 };

export class Canvas extends MonoBehaviour {
  static typeName = 'Canvas';

  constructor() {
    super();
    this.m_RenderMode = 0;
    this.m_OverrideSorting = 0;
    this.m_SortingOrder = 0;
    this.m_PixelPerfect = 0;
    this.scaleFactor = 1;
    this.referencePixelsPerUnit = 100;
  }

  get renderMode() {
    return this.isRootCanvas ? this.m_RenderMode : this.rootCanvas.m_RenderMode;
  }

  set renderMode(v) {
    this.m_RenderMode = v;
  }

  get sortingOrder() {
    return this.m_SortingOrder;
  }

  set sortingOrder(v) {
    this.m_SortingOrder = v;
  }

  get overrideSorting() {
    return !!this.m_OverrideSorting;
  }

  set overrideSorting(v) {
    this.m_OverrideSorting = v ? 1 : 0;
  }

  get parentCanvas() {
    const p = this.transform.parent;
    return p ? p.gameObject.GetComponentInParent(Canvas) : null;
  }

  get isRootCanvas() {
    for (let p = this.transform.parent; p; p = p.parent) {
      const c = p.gameObject.GetComponent(Canvas);
      if (c && c.enabled) return false;
    }
    return true;
  }

  get rootCanvas() {
    let root = this;
    for (let p = this.transform.parent; p; p = p.parent) {
      const c = p.gameObject.GetComponent(Canvas);
      if (c && c.enabled) root = c;
    }
    return root;
  }

  get pixelRect() {
    return { x: 0, y: 0, width: UISystem.width, height: UISystem.height };
  }

  OnEnable() {
    UISystem.canvases.add(this);
    bumpLayout();
  }

  OnDisable() {
    UISystem.canvases.delete(this);
    bumpLayout();
  }

  static ForceUpdateCanvases() {
    UISystem.layout();
  }
}

export class CanvasScaler extends MonoBehaviour {
  static typeName = 'CanvasScaler';

  constructor() {
    super();
    this.m_UiScaleMode = 1;
    this.m_ReferencePixelsPerUnit = 100;
    this.m_ScaleFactor = 1;
    this.m_ReferenceResolution = [800, 600];
    this.m_ScreenMatchMode = 0;
    this.m_MatchWidthOrHeight = 0;
  }

  get referenceResolution() {
    return new THREE.Vector2(this.m_ReferenceResolution[0], this.m_ReferenceResolution[1]);
  }

  get matchWidthOrHeight() {
    return this.m_MatchWidthOrHeight;
  }

  set matchWidthOrHeight(v) {
    this.m_MatchWidthOrHeight = v;
  }

  /** CanvasScaler.HandleScaleWithScreenSize */
  computeScale(w, h) {
    if (this.m_UiScaleMode === 0) return this.m_ScaleFactor;
    if (this.m_UiScaleMode !== 1) return 1;
    const [rw, rh] = this.m_ReferenceResolution;
    switch (this.m_ScreenMatchMode) {
      case 1: // Expand
        return Math.min(w / rw, h / rh);
      case 2: // Shrink
        return Math.max(w / rw, h / rh);
      default: {
        const lw = Math.log2(w / rw);
        const lh = Math.log2(h / rh);
        return 2 ** (lw + (lh - lw) * this.m_MatchWidthOrHeight);
      }
    }
  }
}

export class CanvasGroup extends CanvasGroupBase {
  static typeName = 'CanvasGroup';

  constructor() {
    super();
    this.m_Alpha = 1;
    this.m_Interactable = 1;
    this.m_BlocksRaycasts = 1;
    this.m_IgnoreParentGroups = 0;
  }

  get alpha() {
    return this.m_Alpha;
  }

  set alpha(v) {
    this.m_Alpha = v < 0 ? 0 : v > 1 ? 1 : v;
  }

  get interactable() {
    return !!this.m_Interactable;
  }

  set interactable(v) {
    this.m_Interactable = v ? 1 : 0;
  }

  get blocksRaycasts() {
    return !!this.m_BlocksRaycasts;
  }

  set blocksRaycasts(v) {
    this.m_BlocksRaycasts = v ? 1 : 0;
  }

  get ignoreParentGroups() {
    return !!this.m_IgnoreParentGroups;
  }

  set ignoreParentGroups(v) {
    this.m_IgnoreParentGroups = v ? 1 : 0;
  }

  IsRaycastLocationValid() {
    return this.blocksRaycasts;
  }
}

export class GraphicRaycaster extends MonoBehaviour {
  static typeName = 'GraphicRaycaster';
}

// ---------------------------------------------------------------- the UI pass

/**
 * Draw item: {graphic, mesh, texture, sdf?, matrix (world), alpha, color (CanvasRenderer), stencil, clip, kind}
 *  stencil: null | {ref, func ('always'|'equal'), op ('keep'|'replace'|'zero'), read, write, colorWrite}
 *  clip: null | [x0, y0, x1, y1] in screen space
 */
export const UISystem = {
  canvases: new Set(),
  width: 1,
  height: 1,
  items: [],
  raycastables: [],
  hooks: { particles: null },

  setScreen(w, h) {
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      bumpLayout();
    }
  },

  rootCanvases() {
    const roots = [];
    for (const c of this.canvases) if (c.isActiveAndEnabled && c.isRootCanvas) roots.push(c);
    return roots;
  },

  /** drive the root canvases from the screen size + CanvasScaler, then run the layout controllers */
  layout() {
    this.hooks.beforeLayout?.();
    for (const c of this.rootCanvases()) {
      const rt = c.transform;
      const scaler = c.GetComponent(CanvasScaler);
      const s = scaler && scaler.enabled ? scaler.computeScale(this.width, this.height) : 1;
      c.scaleFactor = s;
      c.referencePixelsPerUnit = scaler ? scaler.m_ReferencePixelsPerUnit : 100;
      const w = this.width / s;
      const h = this.height / s;
      if (rt.isRectTransform) {
        if (!rt._driven || rt._sizeDelta.x !== w || rt._sizeDelta.y !== h || rt.obj.scale.x !== s) {
          rt._driven = true;
          rt._sizeDelta.set(w, h);
          rt._pivot.set(0.5, 0.5);
          rt._anchorMin.set(0, 0);
          rt._anchorMax.set(0, 0);
          rt.obj.scale.set(s, s, s);
          rt.obj.position.set(this.width / 2, this.height / 2, 0);
          bumpLayout();
        }
      }
      LayoutSystem.run(rt);
    }
    this.hooks.afterLayout?.();
  },

  /** build the ordered draw list for every active root canvas */
  collect() {
    UIFades.tick();
    this.layout();
    const lists = [];
    for (const c of this.rootCanvases()) {
      const ctx = { lists, canvas: c };
      const list = { order: c.sortingOrder, items: [], canvas: c };
      lists.push(list);
      this.walk(c.transform, list, ctx, 1, 0, null, true);
    }
    // stable sort by sorting order (root canvases + override-sorting nested canvases)
    lists.forEach((l, i) => (l.i = i));
    lists.sort((a, b) => a.order - b.order || a.i - b.i);
    const items = [];
    for (const l of lists) for (const it of l.items) items.push(it);
    this.items = items;
    let depth = 0;
    this.raycastables = [];
    for (const it of items) {
      if (!it.graphic || it.unmask) continue;
      it.graphic.depth = depth++;
      if (it.raycast) this.raycastables.push(it);
    }
    return items;
  },

  walk(t, list, ctx, alpha, stencilDepth, clip, raycastCanvas) {
    const go = t.gameObject;
    if (!go.activeSelf) return;
    if (t.isRectTransform) t._sync();
    const comps = go.components;
    let graphic = null;
    let mask = null;
    let canvasHere = null;
    for (const c of comps) {
      if (c instanceof Graphic) {
        if (!graphic && c.enabled) graphic = c;
      } else if (c instanceof CanvasGroup) {
        if (c.enabled) alpha = c.ignoreParentGroups ? c.alpha : alpha * c.alpha;
      } else if (c instanceof Mask) {
        if (c.enabled) mask = c;
      } else if (c instanceof RectMask2D) {
        if (c.enabled) {
          const r = c.worldClipRect();
          clip = clip ? [Math.max(clip[0], r[0]), Math.max(clip[1], r[1]), Math.min(clip[2], r[2]), Math.min(clip[3], r[3])] : r;
        }
      } else if (c instanceof Canvas && c.enabled && t !== ctx.canvas.transform) canvasHere = c;
    }
    if (canvasHere) {
      raycastCanvas = !!go.GetComponent(GraphicRaycaster);
      if (canvasHere.overrideSorting) {
        // its own draw list, sorted with the root canvases; masks above it do not apply
        const nl = { order: canvasHere.sortingOrder, items: [], canvas: canvasHere };
        ctx.lists.push(nl);
        list = nl;
        stencilDepth = 0;
      }
    }
    let maskActive = false;
    if (graphic) {
      const cr = graphic.canvasRenderer;
      const a = alpha * cr.color.a;
      if (mask && mask.isActiveAndEnabled) {
        maskActive = true;
        const bit = 1 << stencilDepth;
        const st =
          bit === 1
            ? { ref: 1, func: 'always', op: 'replace', read: 255, write: 255, colorWrite: mask.showMaskGraphic }
            : { ref: bit | (bit - 1), func: 'equal', op: 'replace', read: bit - 1, write: bit | (bit - 1), colorWrite: mask.showMaskGraphic };
        this.emit(list, graphic, a, cr, st, clip, raycastCanvas, false);
      } else {
        const st = stencilDepth > 0 && graphic.maskable ? { ref: (1 << stencilDepth) - 1, func: 'equal', op: 'keep', read: (1 << stencilDepth) - 1, write: 0, colorWrite: true } : materialStencil(graphic);
        this.emit(list, graphic, a, cr, st, clip, raycastCanvas, false);
      }
    }
    if (this.hooks.particles) for (const c of comps) if (c._typeName === 'UIParticle' && c.enabled) this.hooks.particles(c, list, alpha, stencilDepth, clip);
    const childDepth = maskActive ? stencilDepth + 1 : stencilDepth;
    for (const ch of t.children) this.walk(ch, list, ctx, alpha, childDepth, clip, raycastCanvas);
    if (maskActive) {
      const bit = 1 << stencilDepth;
      const st = bit === 1 ? { ref: 1, func: 'always', op: 'zero', read: 255, write: 255, colorWrite: false } : { ref: bit - 1, func: 'equal', op: 'replace', read: bit - 1, write: bit | (bit - 1), colorWrite: false };
      this.emit(list, graphic, 1, graphic.canvasRenderer, st, clip, false, true);
    }
  },

  emit(list, graphic, alpha, cr, stencil, clip, raycastCanvas, unmask) {
    const calls = graphic.getDrawCalls ? graphic.getDrawCalls() : [{ mesh: graphic.getMesh(), texture: graphic.mainTexture }];
    const matrix = graphic.transform.obj.matrixWorld;
    graphic.transform.updateWorld();
    let first = true;
    for (const call of calls) {
      list.items.push({
        graphic: first ? graphic : null,
        mesh: call.mesh,
        texture: call.texture,
        sdf: call.sdf || null,
        matrix,
        alpha,
        color: cr.color,
        stencil,
        clip,
        unmask,
        raycast: first && raycastCanvas && graphic.raycastTarget && !unmask,
        custom: call.custom || null,
        additive: !!call.additive,
      });
      first = false;
    }
    if (!calls.length) list.items.push({ graphic, mesh: null, matrix, alpha, color: cr.color, stencil, clip, unmask, raycast: raycastCanvas && graphic.raycastTarget && !unmask });
  },

  /** GraphicRaycaster: graphics under a screen point, top-most first */
  raycast(x, y) {
    const hits = [];
    const sp = { x, y };
    for (let i = this.raycastables.length - 1; i >= 0; i--) {
      const it = this.raycastables[i];
      const g = it.graphic;
      if (!g.isActiveAndEnabled || g.canvasRenderer.cull) continue;
      const rt = g.rectTransform;
      if (!rt.isRectTransform) continue;
      const l = rt.worldToLocal2(x, y);
      if (!l) continue;
      const r = rt.rect;
      const p = g.m_RaycastPadding || [0, 0, 0, 0];
      if (l.x < r.x + p[0] || l.x > r.xMax - p[2] || l.y < r.y + p[1] || l.y > r.yMax - p[3]) continue;
      if (it.clip && (x < it.clip[0] || x > it.clip[2] || y < it.clip[1] || y > it.clip[3])) continue;
      if (!g.Raycast(sp)) continue;
      hits.push(g);
    }
    return hits;
  },
};

World.uiSystem = UISystem;

for (const cls of [Canvas, CanvasScaler, CanvasGroup, GraphicRaycaster]) registerComponent(cls);
