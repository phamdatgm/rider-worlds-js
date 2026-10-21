// uGUI auto layout: LayoutUtility, Horizontal/Vertical/Grid layout groups, LayoutElement,
// ContentSizeFitter, AspectRatioFitter (ported from Unity's UI package). LayoutSystem.run() does what
// LayoutRebuilder does for a dirty root: inputs bottom-up then sizes top-down, horizontal before vertical.
import * as THREE from 'three';
import { MonoBehaviour } from '../engine/scene.js';
import { registerComponent } from '../engine/instantiate.js';
import { bumpLayout } from './rect.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------- LayoutUtility

function isLayoutElement(c) {
  return c && 'preferredWidth' in c && 'minWidth' in c && 'flexibleWidth' in c;
}

function layoutProperty(rt, prop, def) {
  let maxPriority = -Infinity;
  let result = def;
  for (const c of rt.gameObject.components) {
    if (!isLayoutElement(c)) continue;
    if ('enabled' in c && !c.enabled) continue;
    const priority = c.layoutPriority ?? 0;
    if (priority < maxPriority) continue;
    const v = c[prop];
    if (v < 0 || v === undefined || Number.isNaN(v)) continue;
    if (priority > maxPriority) {
      result = v;
      maxPriority = priority;
    } else if (v > result) result = v;
  }
  return result;
}

export const LayoutUtility = {
  GetMinSize: (rt, axis) => (axis === 0 ? LayoutUtility.GetMinWidth(rt) : LayoutUtility.GetMinHeight(rt)),
  GetPreferredSize: (rt, axis) => (axis === 0 ? LayoutUtility.GetPreferredWidth(rt) : LayoutUtility.GetPreferredHeight(rt)),
  GetFlexibleSize: (rt, axis) => (axis === 0 ? layoutProperty(rt, 'flexibleWidth', 0) : layoutProperty(rt, 'flexibleHeight', 0)),
  GetMinWidth: (rt) => layoutProperty(rt, 'minWidth', 0),
  GetMinHeight: (rt) => layoutProperty(rt, 'minHeight', 0),
  GetPreferredWidth: (rt) => Math.max(layoutProperty(rt, 'minWidth', 0), layoutProperty(rt, 'preferredWidth', 0)),
  GetPreferredHeight: (rt) => Math.max(layoutProperty(rt, 'minHeight', 0), layoutProperty(rt, 'preferredHeight', 0)),
};

// ---------------------------------------------------------------- LayoutElement

export class LayoutElement extends MonoBehaviour {
  static typeName = 'LayoutElement';

  constructor() {
    super();
    this.m_IgnoreLayout = 0;
    this.m_MinWidth = -1;
    this.m_MinHeight = -1;
    this.m_PreferredWidth = -1;
    this.m_PreferredHeight = -1;
    this.m_FlexibleWidth = -1;
    this.m_FlexibleHeight = -1;
    this.m_LayoutPriority = 1;
  }

  get ignoreLayout() {
    return !!this.m_IgnoreLayout;
  }

  set ignoreLayout(v) {
    this.m_IgnoreLayout = v ? 1 : 0;
    bumpLayout();
  }

  get minWidth() {
    return this.m_MinWidth;
  }

  set minWidth(v) {
    this.m_MinWidth = v;
    bumpLayout();
  }

  get minHeight() {
    return this.m_MinHeight;
  }

  set minHeight(v) {
    this.m_MinHeight = v;
    bumpLayout();
  }

  get preferredWidth() {
    return this.m_PreferredWidth;
  }

  set preferredWidth(v) {
    this.m_PreferredWidth = v;
    bumpLayout();
  }

  get preferredHeight() {
    return this.m_PreferredHeight;
  }

  set preferredHeight(v) {
    this.m_PreferredHeight = v;
    bumpLayout();
  }

  get flexibleWidth() {
    return this.m_FlexibleWidth;
  }

  set flexibleWidth(v) {
    this.m_FlexibleWidth = v;
    bumpLayout();
  }

  get flexibleHeight() {
    return this.m_FlexibleHeight;
  }

  set flexibleHeight(v) {
    this.m_FlexibleHeight = v;
    bumpLayout();
  }

  get layoutPriority() {
    return this.m_LayoutPriority;
  }
}

// ---------------------------------------------------------------- LayoutGroup

function pad(p) {
  return { left: p?.m_Left || 0, right: p?.m_Right || 0, top: p?.m_Top || 0, bottom: p?.m_Bottom || 0 };
}

function setChildAlongAxis(rect, axis, pos, size, scaleFactor = 1) {
  rect._anchorMin.set(0, 1);
  rect._anchorMax.set(0, 1);
  const k = axis === 0 ? 'x' : 'y';
  if (size === undefined) size = rect._sizeDelta[k];
  else rect._sizeDelta[k] = size;
  rect._anchoredPosition[k] = axis === 0 ? pos + size * rect._pivot[k] * scaleFactor : -pos - size * (1 - rect._pivot[k]) * scaleFactor;
  bumpLayout();
}

function setChildPosAlongAxis(rect, axis, pos, scaleFactor = 1) {
  rect._anchorMin.set(0, 1);
  rect._anchorMax.set(0, 1);
  const k = axis === 0 ? 'x' : 'y';
  rect._anchoredPosition[k] = axis === 0 ? pos + rect._sizeDelta[k] * rect._pivot[k] * scaleFactor : -pos - rect._sizeDelta[k] * (1 - rect._pivot[k]) * scaleFactor;
  bumpLayout();
}

export class LayoutGroup extends MonoBehaviour {
  static typeName = 'LayoutGroup';

  constructor() {
    super();
    this.m_Padding = { m_Left: 0, m_Right: 0, m_Top: 0, m_Bottom: 0 };
    this.m_ChildAlignment = 0;
    this._total = [
      [0, 0, 0],
      [0, 0, 0],
    ]; // [axis][min, preferred, flexible]
    this.rectChildren = [];
  }

  get padding() {
    return pad(this.m_Padding);
  }

  get childAlignment() {
    return this.m_ChildAlignment;
  }

  set childAlignment(v) {
    this.m_ChildAlignment = v;
    bumpLayout();
  }

  get rectTransform() {
    return this.transform;
  }

  get layoutPriority() {
    return 0;
  }

  get minWidth() {
    return this._total[0][0];
  }

  get preferredWidth() {
    return this._total[0][1];
  }

  get flexibleWidth() {
    return this._total[0][2];
  }

  get minHeight() {
    return this._total[1][0];
  }

  get preferredHeight() {
    return this._total[1][1];
  }

  get flexibleHeight() {
    return this._total[1][2];
  }

  collectChildren() {
    this.rectChildren = [];
    for (const ch of this.transform.children) {
      if (!ch.isRectTransform || !ch.gameObject.activeInHierarchy) continue;
      let ignore = false;
      for (const c of ch.gameObject.components) {
        if (c instanceof LayoutElement && c.enabled && c.ignoreLayout) ignore = true;
      }
      if (!ignore) this.rectChildren.push(ch);
    }
  }

  setLayoutInputForAxis(min, pref, flex, axis) {
    this._total[axis] = [min, pref, flex];
  }

  alignmentOnAxis(axis) {
    const a = this.m_ChildAlignment;
    return axis === 0 ? (a % 3) * 0.5 : Math.floor(a / 3) * 0.5;
  }

  startOffset(axis, requiredWithoutPadding) {
    const p = this.padding;
    const required = requiredWithoutPadding + (axis === 0 ? p.left + p.right : p.top + p.bottom);
    const available = axis === 0 ? this.transform.width : this.transform.height;
    return (axis === 0 ? p.left : p.top) + (available - required) * this.alignmentOnAxis(axis);
  }

  CalculateLayoutInputHorizontal() {
    this.collectChildren();
  }

  CalculateLayoutInputVertical() {}

  SetLayoutHorizontal() {}

  SetLayoutVertical() {}

  OnEnable() {
    bumpLayout();
  }

  OnDisable() {
    bumpLayout();
  }
}

export class HorizontalOrVerticalLayoutGroup extends LayoutGroup {
  static typeName = 'HorizontalOrVerticalLayoutGroup';

  constructor() {
    super();
    this.m_Spacing = 0;
    this.m_ChildForceExpandWidth = 1;
    this.m_ChildForceExpandHeight = 1;
    this.m_ChildControlWidth = 1;
    this.m_ChildControlHeight = 1;
    this.m_ChildScaleWidth = 0;
    this.m_ChildScaleHeight = 0;
    this.m_ReverseArrangement = 0;
  }

  get spacing() {
    return this.m_Spacing;
  }

  set spacing(v) {
    this.m_Spacing = v;
    bumpLayout();
  }

  childSizes(child, axis, controlSize, forceExpand) {
    let min;
    let pref;
    let flex;
    if (!controlSize) {
      min = axis === 0 ? child._sizeDelta.x : child._sizeDelta.y;
      pref = min;
      flex = 0;
    } else {
      min = LayoutUtility.GetMinSize(child, axis);
      pref = LayoutUtility.GetPreferredSize(child, axis);
      flex = LayoutUtility.GetFlexibleSize(child, axis);
    }
    if (forceExpand) flex = Math.max(flex, 1);
    return [min, pref, flex];
  }

  calcAlongAxis(axis, isVertical) {
    const p = this.padding;
    const combinedPadding = axis === 0 ? p.left + p.right : p.top + p.bottom;
    const controlSize = axis === 0 ? this.m_ChildControlWidth : this.m_ChildControlHeight;
    const useScale = axis === 0 ? this.m_ChildScaleWidth : this.m_ChildScaleHeight;
    const forceExpand = axis === 0 ? this.m_ChildForceExpandWidth : this.m_ChildForceExpandHeight;
    let totalMin = combinedPadding;
    let totalPref = combinedPadding;
    let totalFlex = 0;
    const alongOther = isVertical !== (axis === 1);
    for (const child of this.rectChildren) {
      let [min, pref, flex] = this.childSizes(child, axis, controlSize, forceExpand);
      if (useScale) {
        const s = axis === 0 ? child.obj.scale.x : child.obj.scale.y;
        min *= s;
        pref *= s;
        flex *= s;
      }
      if (alongOther) {
        totalMin = Math.max(min + combinedPadding, totalMin);
        totalPref = Math.max(pref + combinedPadding, totalPref);
        totalFlex = Math.max(flex, totalFlex);
      } else {
        totalMin += min + this.m_Spacing;
        totalPref += pref + this.m_Spacing;
        totalFlex += flex;
      }
    }
    if (!alongOther && this.rectChildren.length > 0) {
      totalMin -= this.m_Spacing;
      totalPref -= this.m_Spacing;
    }
    totalPref = Math.max(totalMin, totalPref);
    this.setLayoutInputForAxis(totalMin, totalPref, totalFlex, axis);
  }

  setChildrenAlongAxis(axis, isVertical) {
    const p = this.padding;
    const size = axis === 0 ? this.transform.width : this.transform.height;
    const controlSize = axis === 0 ? this.m_ChildControlWidth : this.m_ChildControlHeight;
    const useScale = axis === 0 ? this.m_ChildScaleWidth : this.m_ChildScaleHeight;
    const forceExpand = axis === 0 ? this.m_ChildForceExpandWidth : this.m_ChildForceExpandHeight;
    const align = this.alignmentOnAxis(axis);
    const alongOther = isVertical !== (axis === 1);
    const innerSize = size - (axis === 0 ? p.left + p.right : p.top + p.bottom);
    const children = this.m_ReverseArrangement ? this.rectChildren.slice().reverse() : this.rectChildren;
    if (alongOther) {
      for (const child of children) {
        const [min, pref, flex] = this.childSizes(child, axis, controlSize, forceExpand);
        const sf = useScale ? (axis === 0 ? child.obj.scale.x : child.obj.scale.y) : 1;
        const required = clamp(innerSize, min, flex > 0 ? size : pref);
        const start = this.startOffset(axis, required * sf);
        if (controlSize) setChildAlongAxis(child, axis, start, required, sf);
        else {
          const off = (required - (axis === 0 ? child._sizeDelta.x : child._sizeDelta.y)) * align;
          setChildPosAlongAxis(child, axis, start + off, sf);
        }
      }
      return;
    }
    let pos = axis === 0 ? p.left : p.top;
    let itemFlexMul = 0;
    const [tMin, tPref, tFlex] = this._total[axis];
    const surplus = size - tPref;
    if (surplus > 0) {
      if (tFlex === 0) pos = this.startOffset(axis, tPref - (axis === 0 ? p.left + p.right : p.top + p.bottom));
      else if (tFlex > 0) itemFlexMul = surplus / tFlex;
    }
    let minMaxLerp = 0;
    if (tMin !== tPref) minMaxLerp = clamp01((size - tMin) / (tPref - tMin));
    for (const child of children) {
      const [min, pref, flex] = this.childSizes(child, axis, controlSize, forceExpand);
      const sf = useScale ? (axis === 0 ? child.obj.scale.x : child.obj.scale.y) : 1;
      let childSize = min + (pref - min) * minMaxLerp;
      childSize += flex * itemFlexMul;
      if (controlSize) setChildAlongAxis(child, axis, pos, childSize, sf);
      else {
        const off = (childSize - (axis === 0 ? child._sizeDelta.x : child._sizeDelta.y)) * align;
        setChildPosAlongAxis(child, axis, pos + off, sf);
      }
      pos += childSize * sf + this.m_Spacing;
    }
  }
}

export class HorizontalLayoutGroup extends HorizontalOrVerticalLayoutGroup {
  static typeName = 'HorizontalLayoutGroup';

  CalculateLayoutInputHorizontal() {
    super.CalculateLayoutInputHorizontal();
    this.calcAlongAxis(0, false);
  }

  CalculateLayoutInputVertical() {
    this.calcAlongAxis(1, false);
  }

  SetLayoutHorizontal() {
    this.setChildrenAlongAxis(0, false);
  }

  SetLayoutVertical() {
    this.setChildrenAlongAxis(1, false);
  }
}

export class VerticalLayoutGroup extends HorizontalOrVerticalLayoutGroup {
  static typeName = 'VerticalLayoutGroup';

  CalculateLayoutInputHorizontal() {
    super.CalculateLayoutInputHorizontal();
    this.calcAlongAxis(0, true);
  }

  CalculateLayoutInputVertical() {
    this.calcAlongAxis(1, true);
  }

  SetLayoutHorizontal() {
    this.setChildrenAlongAxis(0, true);
  }

  SetLayoutVertical() {
    this.setChildrenAlongAxis(1, true);
  }
}

export class GridLayoutGroup extends LayoutGroup {
  static typeName = 'GridLayoutGroup';

  constructor() {
    super();
    this.m_StartCorner = 0;
    this.m_StartAxis = 0;
    this.m_CellSize = [100, 100];
    this.m_Spacing = [0, 0];
    this.m_Constraint = 0;
    this.m_ConstraintCount = 2;
  }

  get cellSize() {
    return new THREE.Vector2(this.m_CellSize[0], this.m_CellSize[1]);
  }

  set cellSize(v) {
    this.m_CellSize = [v.x, v.y];
    bumpLayout();
  }

  get spacing() {
    return new THREE.Vector2(this.m_Spacing[0], this.m_Spacing[1]);
  }

  set spacing(v) {
    this.m_Spacing = [v.x, v.y];
    bumpLayout();
  }

  get constraintCount() {
    return this.m_ConstraintCount;
  }

  set constraintCount(v) {
    this.m_ConstraintCount = v;
    bumpLayout();
  }

  CalculateLayoutInputHorizontal() {
    super.CalculateLayoutInputHorizontal();
    const n = this.rectChildren.length;
    let minCols;
    let prefCols;
    if (this.m_Constraint === 1) minCols = prefCols = this.m_ConstraintCount;
    else if (this.m_Constraint === 2) minCols = prefCols = Math.ceil(n / this.m_ConstraintCount - 0.001);
    else {
      minCols = 1;
      prefCols = Math.ceil(Math.sqrt(n));
    }
    const p = this.padding;
    const [cx] = this.m_CellSize;
    const [sx] = this.m_Spacing;
    this.setLayoutInputForAxis(p.left + p.right + (cx + sx) * minCols - sx, p.left + p.right + (cx + sx) * prefCols - sx, -1, 0);
  }

  CalculateLayoutInputVertical() {
    const n = this.rectChildren.length;
    const p = this.padding;
    let minRows;
    if (this.m_Constraint === 1) minRows = Math.ceil(n / this.m_ConstraintCount - 0.001);
    else if (this.m_Constraint === 2) minRows = this.m_ConstraintCount;
    else {
      const w = this.transform.width;
      const cellX = Math.max(1, Math.floor((w - p.left - p.right + this.m_Spacing[0] + 0.001) / (this.m_CellSize[0] + this.m_Spacing[0])));
      minRows = Math.ceil(n / cellX);
    }
    const minSpace = p.top + p.bottom + (this.m_CellSize[1] + this.m_Spacing[1]) * minRows - this.m_Spacing[1];
    this.setLayoutInputForAxis(minSpace, minSpace, -1, 1);
  }

  SetLayoutHorizontal() {
    for (const r of this.rectChildren) {
      r._anchorMin.set(0, 1);
      r._anchorMax.set(0, 1);
      r._sizeDelta.set(this.m_CellSize[0], this.m_CellSize[1]);
    }
    bumpLayout();
  }

  SetLayoutVertical() {
    const n = this.rectChildren.length;
    const p = this.padding;
    const w = this.transform.width;
    const h = this.transform.height;
    const [cx, cy] = this.m_CellSize;
    const [sx, sy] = this.m_Spacing;
    let cellCountX = 1;
    let cellCountY = 1;
    if (this.m_Constraint === 1) {
      cellCountX = this.m_ConstraintCount;
      if (n > cellCountX) cellCountY = Math.floor(n / cellCountX) + (n % cellCountX > 0 ? 1 : 0);
    } else if (this.m_Constraint === 2) {
      cellCountY = this.m_ConstraintCount;
      if (n > cellCountY) cellCountX = Math.floor(n / cellCountY) + (n % cellCountY > 0 ? 1 : 0);
    } else {
      cellCountX = cx + sx <= 0 ? Infinity : Math.max(1, Math.floor((w - p.left - p.right + sx + 0.001) / (cx + sx)));
      cellCountY = cy + sy <= 0 ? Infinity : Math.max(1, Math.floor((h - p.top - p.bottom + sy + 0.001) / (cy + sy)));
    }
    const cornerX = this.m_StartCorner % 2;
    const cornerY = Math.floor(this.m_StartCorner / 2);
    let perMain;
    let actualX;
    let actualY;
    if (this.m_StartAxis === 0) {
      perMain = cellCountX;
      actualX = clamp(cellCountX, 1, n);
      actualY = clamp(cellCountY, 1, Math.ceil(n / perMain));
    } else {
      perMain = cellCountY;
      actualY = clamp(cellCountY, 1, n);
      actualX = clamp(cellCountX, 1, Math.ceil(n / perMain));
    }
    const reqX = actualX * cx + (actualX - 1) * sx;
    const reqY = actualY * cy + (actualY - 1) * sy;
    const ox = this.startOffset(0, reqX);
    const oy = this.startOffset(1, reqY);
    for (let i = 0; i < n; i++) {
      let px;
      let py;
      if (this.m_StartAxis === 0) {
        px = i % perMain;
        py = Math.floor(i / perMain);
      } else {
        px = Math.floor(i / perMain);
        py = i % perMain;
      }
      if (cornerX === 1) px = actualX - 1 - px;
      if (cornerY === 1) py = actualY - 1 - py;
      setChildAlongAxis(this.rectChildren[i], 0, ox + (cx + sx) * px, cx);
      setChildAlongAxis(this.rectChildren[i], 1, oy + (cy + sy) * py, cy);
    }
  }
}

// ---------------------------------------------------------------- self controllers

export class ContentSizeFitter extends MonoBehaviour {
  static typeName = 'ContentSizeFitter';

  constructor() {
    super();
    this.m_HorizontalFit = 0;
    this.m_VerticalFit = 0;
  }

  get horizontalFit() {
    return this.m_HorizontalFit;
  }

  set horizontalFit(v) {
    this.m_HorizontalFit = v;
    bumpLayout();
  }

  get verticalFit() {
    return this.m_VerticalFit;
  }

  set verticalFit(v) {
    this.m_VerticalFit = v;
    bumpLayout();
  }

  fitAxis(axis) {
    const fit = axis === 0 ? this.m_HorizontalFit : this.m_VerticalFit;
    if (!fit) return;
    const rt = this.transform;
    const size = fit === 1 ? LayoutUtility.GetMinSize(rt, axis) : LayoutUtility.GetPreferredSize(rt, axis);
    rt.SetSizeWithCurrentAnchors(axis, size);
  }

  SetLayoutHorizontal() {
    this.fitAxis(0);
  }

  SetLayoutVertical() {
    this.fitAxis(1);
  }
}

export class AspectRatioFitter extends MonoBehaviour {
  static typeName = 'AspectRatioFitter';

  constructor() {
    super();
    this.m_AspectMode = 0;
    this.m_AspectRatio = 1;
  }

  get aspectRatio() {
    return this.m_AspectRatio;
  }

  set aspectRatio(v) {
    this.m_AspectRatio = v;
    bumpLayout();
  }

  updateRect() {
    const rt = this.transform;
    const ar = this.m_AspectRatio;
    switch (this.m_AspectMode) {
      case 2:
        rt.SetSizeWithCurrentAnchors(0, rt.height * ar);
        break;
      case 1:
        rt.SetSizeWithCurrentAnchors(1, rt.width / ar);
        break;
      case 3:
      case 4: {
        const p = rt.parentRect;
        if (!p) return;
        const pw = p.width;
        const ph = p.height;
        rt._anchorMin.set(0, 0);
        rt._anchorMax.set(1, 1);
        rt._anchoredPosition.set(0, 0);
        const sd = new THREE.Vector2(0, 0);
        if ((ph * ar < pw) !== (this.m_AspectMode === 3)) sd.y = pw / ar - ph;
        else sd.x = ph * ar - pw;
        rt._sizeDelta.copy(sd);
        bumpLayout();
        break;
      }
      default:
    }
  }
}

// ---------------------------------------------------------------- the pass

export const LayoutSystem = {
  run(root) {
    const groups = [];
    const fitters = [];
    const aspects = [];
    const order = [];
    const visit = (t) => {
      const go = t.gameObject;
      if (!go.activeSelf) return;
      let any = false;
      for (const c of go.components) {
        if (!c.enabled) continue;
        if (c instanceof LayoutGroup) {
          groups.push(c);
          any = true;
        } else if (c instanceof ContentSizeFitter) {
          fitters.push(c);
          any = true;
        } else if (c instanceof AspectRatioFitter) {
          aspects.push(c);
        } else if (typeof c.CalculateLayoutInputHorizontal === 'function' && typeof c.SetLayoutHorizontal === 'function') {
          any = true; // custom ILayoutGroup scripts (UI_MetaGridLayout...)
        }
      }
      if (any) order.push(go);
      for (const ch of t.children) visit(ch);
    };
    visit(root);
    for (const a of aspects) a.updateRect();
    if (!order.length) return;
    const controllers = (go) => go.components.filter((c) => c.enabled && (typeof c.SetLayoutHorizontal === 'function' || typeof c.CalculateLayoutInputHorizontal === 'function'));
    const lists = order.map(controllers);
    for (let i = lists.length - 1; i >= 0; i--) for (const c of lists[i]) c.CalculateLayoutInputHorizontal?.();
    for (const l of lists) for (const c of l) c.SetLayoutHorizontal?.();
    for (let i = lists.length - 1; i >= 0; i--) for (const c of lists[i]) c.CalculateLayoutInputVertical?.();
    for (const l of lists) for (const c of l) c.SetLayoutVertical?.();
  },
};

for (const cls of [LayoutElement, HorizontalLayoutGroup, VerticalLayoutGroup, GridLayoutGroup, ContentSizeFitter, AspectRatioFitter]) registerComponent(cls);
