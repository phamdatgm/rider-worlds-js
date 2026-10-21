// Selectable / Button / Toggle / ToggleGroup / ScrollRect (ported from Unity's UI package).
import * as THREE from 'three';
import { MonoBehaviour } from '../engine/scene.js';
import { EventAction, Time } from '../engine/core.js';
import { registerComponent } from '../engine/instantiate.js';
import { Color } from './graphic.js';
import { UISprites } from './sprites.js';
import { EventSystem } from './events.js';

const State = { Normal: 0, Highlighted: 1, Pressed: 2, Selected: 3, Disabled: 4 };
export const SelectionState = State;
export const Transition = { None: 0, ColorTint: 1, SpriteSwap: 2, Animation: 3 };

export class Selectable extends MonoBehaviour {
  static typeName = 'Selectable';

  constructor() {
    super();
    this.m_Transition = 1;
    this.m_Interactable = 1;
    this.m_TargetGraphic = null;
    this.m_Colors = null;
    this.m_SpriteState = {};
    this.m_Navigation = { m_Mode: 3 };
    this.isPointerInside = false;
    this.isPointerDown = false;
    this.hasSelection = false;
    this._colors = null;
  }

  get colors() {
    if (!this._colors) {
      const c = this.m_Colors || {};
      this._colors = {
        normalColor: Color.from(c.m_NormalColor, Color.white),
        highlightedColor: Color.from(c.m_HighlightedColor, new Color(0.96, 0.96, 0.96, 1)),
        pressedColor: Color.from(c.m_PressedColor, new Color(0.78, 0.78, 0.78, 1)),
        selectedColor: Color.from(c.m_SelectedColor, new Color(0.96, 0.96, 0.96, 1)),
        disabledColor: Color.from(c.m_DisabledColor, new Color(0.78, 0.78, 0.78, 0.5)),
        colorMultiplier: c.m_ColorMultiplier ?? 1,
        fadeDuration: c.m_FadeDuration ?? 0.1,
      };
    }
    return this._colors;
  }

  set colors(v) {
    this._colors = v;
    this.OnSetProperty();
  }

  get targetGraphic() {
    return this.m_TargetGraphic;
  }

  set targetGraphic(g) {
    this.m_TargetGraphic = g;
    this.OnSetProperty();
  }

  get image() {
    return this.m_TargetGraphic && 'sprite' in this.m_TargetGraphic ? this.m_TargetGraphic : null;
  }

  get transition() {
    return this.m_Transition;
  }

  set transition(v) {
    this.m_Transition = v;
    this.OnSetProperty();
  }

  get interactable() {
    return !!this.m_Interactable;
  }

  set interactable(v) {
    v = v ? 1 : 0;
    if (v === this.m_Interactable) return;
    this.m_Interactable = v;
    if (!v && EventSystem.currentSelectedGameObject === this.gameObject) EventSystem.SetSelectedGameObject(null);
    this.OnSetProperty();
  }

  /** interactable and allowed by every CanvasGroup above */
  IsInteractable() {
    if (!this.m_Interactable) return false;
    for (let t = this.transform; t; t = t.parent) {
      const g = t.gameObject.GetComponent('CanvasGroup');
      if (g && g.enabled) {
        if (!g.interactable) return false;
        if (g.ignoreParentGroups) break;
      }
    }
    return true;
  }

  IsActive() {
    return this.isActiveAndEnabled;
  }

  get currentSelectionState() {
    if (!this.IsInteractable()) return State.Disabled;
    if (this.isPointerDown) return State.Pressed;
    if (this.hasSelection) return State.Selected;
    if (this.isPointerInside) return State.Highlighted;
    return State.Normal;
  }

  OnEnable() {
    this.isPointerDown = false;
    this.hasSelection = EventSystem.currentSelectedGameObject === this.gameObject;
    this.DoStateTransition(this.currentSelectionState, true);
  }

  OnDisable() {
    this.isPointerInside = false;
    this.isPointerDown = false;
    this.hasSelection = false;
    this.DoStateTransition(State.Normal, true);
  }

  OnSetProperty() {
    if (this.gameObject?._awoken) this.DoStateTransition(this.currentSelectionState, false);
  }

  Evaluate() {
    if (!this.IsActive()) return;
    this.DoStateTransition(this.currentSelectionState, false);
  }

  DoStateTransition(state, instant) {
    if (!this.gameObject?.activeInHierarchy) return;
    const c = this.colors;
    let tint;
    let sprite = null;
    let trigger = '';
    switch (state) {
      case State.Highlighted:
        tint = c.highlightedColor;
        sprite = this.m_SpriteState?.m_HighlightedSprite;
        trigger = 'Highlighted';
        break;
      case State.Pressed:
        tint = c.pressedColor;
        sprite = this.m_SpriteState?.m_PressedSprite;
        trigger = 'Pressed';
        break;
      case State.Selected:
        tint = c.selectedColor;
        sprite = this.m_SpriteState?.m_SelectedSprite;
        trigger = 'Selected';
        break;
      case State.Disabled:
        tint = c.disabledColor;
        sprite = this.m_SpriteState?.m_DisabledSprite;
        trigger = 'Disabled';
        break;
      default:
        tint = c.normalColor;
        trigger = 'Normal';
    }
    switch (this.m_Transition) {
      case Transition.ColorTint: {
        const g = this.m_TargetGraphic;
        if (!g) break;
        const m = c.colorMultiplier;
        g.CrossFadeColor(new Color(tint.r * m, tint.g * m, tint.b * m, tint.a * m), instant ? 0 : c.fadeDuration, true, true);
        break;
      }
      case Transition.SpriteSwap:
        if (this.image) this.image.overrideSprite = sprite && sprite.$sprite ? UISprites.get(sprite) : null;
        break;
      case Transition.Animation: {
        const anim = this.GetComponent('Animator');
        anim?.SetTrigger?.(this.m_AnimationTriggers?.[`m_${trigger}Trigger`] || trigger);
        break;
      }
      default:
    }
  }

  // ---- pointer events
  OnPointerDown(e) {
    if (e.button !== 0) return;
    if (this.IsInteractable() && this.m_Navigation?.m_Mode !== 0) EventSystem.SetSelectedGameObject(this.gameObject, e);
    this.isPointerDown = true;
    this.Evaluate();
  }

  OnPointerUp(e) {
    if (e.button !== 0) return;
    this.isPointerDown = false;
    this.Evaluate();
  }

  OnPointerEnter() {
    this.isPointerInside = true;
    this.Evaluate();
  }

  OnPointerExit() {
    this.isPointerInside = false;
    this.Evaluate();
  }

  OnSelect() {
    this.hasSelection = true;
    this.Evaluate();
  }

  OnDeselect() {
    this.hasSelection = false;
    this.Evaluate();
  }

  Select() {
    EventSystem.SetSelectedGameObject(this.gameObject);
  }
}

// selection changes notify OnSelect / OnDeselect (EventSystem.SetSelectedGameObject)
const baseSetSelected = EventSystem.SetSelectedGameObject.bind(EventSystem);
EventSystem.SetSelectedGameObject = function (go, data) {
  const prev = this.currentSelectedGameObject;
  if (prev === go) return;
  baseSetSelected(go);
  if (prev && !prev._destroyed) for (const c of prev.components) if (typeof c.OnDeselect === 'function' && c.isActiveAndEnabled) c.OnDeselect(data);
  if (go) for (const c of go.components) if (typeof c.OnSelect === 'function' && c.isActiveAndEnabled) c.OnSelect(data);
};

export class Button extends Selectable {
  static typeName = 'Button';

  constructor() {
    super();
    this.m_OnClick = new EventAction();
  }

  get onClick() {
    return this.m_OnClick;
  }

  Press() {
    if (!this.IsActive() || !this.IsInteractable()) return;
    this.m_OnClick.Invoke();
  }

  OnPointerClick(e) {
    if (e.button !== 0) return;
    this.Press();
  }
}

export class Toggle extends Selectable {
  static typeName = 'Toggle';

  constructor() {
    super();
    this.m_IsOn = 1;
    this.toggleTransition = 1;
    this.graphic = null;
    this.m_Group = null;
    this.onValueChanged = new EventAction();
  }

  OnDeserialize() {
    const d = this._data || {};
    if (d.onValueChanged) this.onValueChanged = d.onValueChanged instanceof EventAction ? d.onValueChanged : this.onValueChanged;
  }

  get isOn() {
    return !!this.m_IsOn;
  }

  set isOn(v) {
    this.Set(v, true);
  }

  get group() {
    return this.m_Group;
  }

  set group(g) {
    this.m_Group?.UnregisterToggle?.(this);
    this.m_Group = g;
    if (g && this.isActiveAndEnabled) g.RegisterToggle(this);
  }

  SetIsOnWithoutNotify(v) {
    this.Set(v, false);
  }

  Set(value, sendCallback) {
    value = value ? 1 : 0;
    if (this.m_IsOn === value) return;
    this.m_IsOn = value;
    if (this.m_Group && this.m_Group.isActiveAndEnabled && this.isActiveAndEnabled) {
      if (value || (!this.m_Group.AnyTogglesOn() && !this.m_Group.allowSwitchOff)) {
        this.m_IsOn = 1;
        this.m_Group.NotifyToggleOn(this, sendCallback);
      }
    }
    this.PlayEffect(this.toggleTransition === 0);
    if (sendCallback) this.onValueChanged.Invoke(!!this.m_IsOn);
  }

  PlayEffect(instant) {
    if (!this.graphic) return;
    this.graphic.CrossFadeAlpha(this.m_IsOn ? 1 : 0, instant ? 0 : 0.1, true);
  }

  OnEnable() {
    super.OnEnable();
    if (this.m_Group) this.m_Group.RegisterToggle?.(this);
    this.PlayEffect(true);
  }

  OnDisable() {
    super.OnDisable();
    this.m_Group?.UnregisterToggle?.(this);
  }

  InternalToggle() {
    if (!this.IsActive() || !this.IsInteractable()) return;
    this.isOn = !this.isOn;
  }

  OnPointerClick(e) {
    if (e.button !== 0) return;
    this.InternalToggle();
  }
}

export class ToggleGroup extends MonoBehaviour {
  static typeName = 'ToggleGroup';

  constructor() {
    super();
    this.m_AllowSwitchOff = 0;
    this.toggles = [];
  }

  get allowSwitchOff() {
    return !!this.m_AllowSwitchOff;
  }

  RegisterToggle(t) {
    if (!this.toggles.includes(t)) this.toggles.push(t);
  }

  UnregisterToggle(t) {
    const i = this.toggles.indexOf(t);
    if (i >= 0) this.toggles.splice(i, 1);
  }

  NotifyToggleOn(t, sendCallback = true) {
    for (const o of this.toggles) {
      if (o === t) continue;
      if (sendCallback) o.isOn = false;
      else o.SetIsOnWithoutNotify(false);
    }
  }

  AnyTogglesOn() {
    return this.toggles.some((t) => t.isOn);
  }

  SetAllTogglesOff(sendCallback = true) {
    const old = this.m_AllowSwitchOff;
    this.m_AllowSwitchOff = 1;
    for (const t of this.toggles) {
      if (sendCallback) t.isOn = false;
      else t.SetIsOnWithoutNotify(false);
    }
    this.m_AllowSwitchOff = old;
  }
}

// ---------------------------------------------------------------- ScrollRect

export function SmoothDamp(current, target, vel, smoothTime, maxSpeed, dt) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * smoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  target = current - change;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  if (originalTo - current > 0 === output > originalTo) {
    output = originalTo;
    vel.v = (output - originalTo) / dt;
  }
  return output;
}

class Bounds2 {
  constructor(cx = 0, cy = 0, sx = 0, sy = 0) {
    this.cx = cx;
    this.cy = cy;
    this.sx = sx;
    this.sy = sy;
  }

  get minX() {
    return this.cx - this.sx / 2;
  }

  get maxX() {
    return this.cx + this.sx / 2;
  }

  get minY() {
    return this.cy - this.sy / 2;
  }

  get maxY() {
    return this.cy + this.sy / 2;
  }

  equals(o) {
    return o && o.cx === this.cx && o.cy === this.cy && o.sx === this.sx && o.sy === this.sy;
  }
}

export class ScrollRect extends MonoBehaviour {
  static typeName = 'ScrollRect';

  constructor() {
    super();
    this.m_Content = null;
    this.m_Horizontal = 1;
    this.m_Vertical = 1;
    this.m_MovementType = 1;
    this.m_Elasticity = 0.1;
    this.m_Inertia = 1;
    this.m_DecelerationRate = 0.135;
    this.m_ScrollSensitivity = 1;
    this.m_Viewport = null;
    this.m_OnValueChanged = new EventAction();
    this.velocity = new THREE.Vector2();
    this.m_Dragging = false;
    this.m_Scrolling = false;
    this.m_ViewBounds = new Bounds2();
    this.m_ContentBounds = new Bounds2();
    this.m_PrevViewBounds = null;
    this.m_PrevContentBounds = null;
    this.m_PrevPosition = new THREE.Vector2();
    this.m_ContentStartPosition = new THREE.Vector2();
    this.m_PointerStartLocalCursor = new THREE.Vector2();
  }

  get content() {
    return this.m_Content;
  }

  set content(v) {
    this.m_Content = v;
  }

  get horizontal() {
    return !!this.m_Horizontal;
  }

  set horizontal(v) {
    this.m_Horizontal = v ? 1 : 0;
  }

  get vertical() {
    return !!this.m_Vertical;
  }

  set vertical(v) {
    this.m_Vertical = v ? 1 : 0;
  }

  get viewport() {
    return this.m_Viewport;
  }

  get onValueChanged() {
    return this.m_OnValueChanged;
  }

  get viewRect() {
    return this.m_Viewport || this.transform;
  }

  get inertia() {
    return !!this.m_Inertia;
  }

  set inertia(v) {
    this.m_Inertia = v ? 1 : 0;
  }

  get movementType() {
    return this.m_MovementType;
  }

  set movementType(v) {
    this.m_MovementType = v;
  }

  StopMovement() {
    this.velocity.set(0, 0);
  }

  localCursor(e) {
    return this.viewRect.worldToLocal2(e.position.x, e.position.y) || { x: 0, y: 0 };
  }

  OnInitializePotentialDrag(e) {
    if (e.button !== 0) return;
    this.velocity.set(0, 0);
  }

  OnBeginDrag(e) {
    if (e.button !== 0 || !this.IsActive()) return;
    this.UpdateBounds();
    const l = this.localCursor(e);
    this.m_PointerStartLocalCursor.set(l.x, l.y);
    this.m_ContentStartPosition.copy(this.m_Content.anchoredPosition);
    this.m_Dragging = true;
  }

  OnEndDrag(e) {
    if (e.button !== 0) return;
    this.m_Dragging = false;
  }

  OnDrag(e) {
    if (!this.m_Dragging || e.button !== 0 || !this.IsActive()) return;
    const l = this.localCursor(e);
    this.UpdateBounds();
    const pos = new THREE.Vector2(l.x - this.m_PointerStartLocalCursor.x, l.y - this.m_PointerStartLocalCursor.y).add(this.m_ContentStartPosition);
    const offset = this.CalculateOffset(pos.clone().sub(this.m_Content.anchoredPosition));
    pos.add(offset);
    if (this.m_MovementType === 1) {
      if (offset.x !== 0) pos.x -= rubberDelta(offset.x, this.m_ViewBounds.sx);
      if (offset.y !== 0) pos.y -= rubberDelta(offset.y, this.m_ViewBounds.sy);
    }
    this.SetContentAnchoredPosition(pos);
  }

  OnScroll(data) {
    if (!this.IsActive()) return;
    this.UpdateBounds();
    const delta = data.scrollDelta.clone();
    delta.y *= -1;
    if (this.vertical && !this.horizontal) {
      if (Math.abs(delta.x) > Math.abs(delta.y)) delta.y = delta.x;
      delta.x = 0;
    }
    if (this.horizontal && !this.vertical) {
      if (Math.abs(delta.y) > Math.abs(delta.x)) delta.x = delta.y;
      delta.y = 0;
    }
    if (data.IsScrolling?.()) this.m_Scrolling = true;
    const pos = this.m_Content.anchoredPosition;
    pos.addScaledVector(delta, this.m_ScrollSensitivity * 40);
    if (this.m_MovementType === 2) pos.add(this.CalculateOffset(pos.clone().sub(this.m_Content.anchoredPosition)));
    this.SetContentAnchoredPosition(pos);
    this.UpdateBounds();
  }

  IsActive() {
    return this.isActiveAndEnabled && !!this.m_Content;
  }

  SetContentAnchoredPosition(pos) {
    const cur = this.m_Content.anchoredPosition;
    if (!this.m_Horizontal) pos.x = cur.x;
    if (!this.m_Vertical) pos.y = cur.y;
    if (pos.x !== cur.x || pos.y !== cur.y) {
      this.m_Content.anchoredPosition = pos;
      this.UpdateBounds();
    }
  }

  LateUpdate() {
    if (!this.m_Content) return;
    this.UpdateBounds();
    const dt = Time.unscaledDeltaTime;
    let offset = this.CalculateOffset(new THREE.Vector2());
    if (dt > 0 && !this.m_Dragging && (offset.x !== 0 || offset.y !== 0 || this.velocity.x !== 0 || this.velocity.y !== 0)) {
      const pos = this.m_Content.anchoredPosition;
      for (const k of ['x', 'y']) {
        if (this.m_MovementType === 1 && offset[k] !== 0) {
          const speed = { v: this.velocity[k] };
          let smooth = this.m_Elasticity;
          if (this.m_Scrolling) smooth *= 3;
          const cur = this.m_Content.anchoredPosition[k];
          pos[k] = SmoothDamp(cur, cur + offset[k], speed, smooth, Infinity, dt);
          if (Math.abs(speed.v) < 1) speed.v = 0;
          this.velocity[k] = speed.v;
        } else if (this.m_Inertia) {
          this.velocity[k] *= this.m_DecelerationRate ** dt;
          if (Math.abs(this.velocity[k]) < 1) this.velocity[k] = 0;
          pos[k] += this.velocity[k] * dt;
        } else this.velocity[k] = 0;
      }
      if (this.m_MovementType === 2) {
        offset = this.CalculateOffset(pos.clone().sub(this.m_Content.anchoredPosition));
        pos.add(offset);
      }
      this.SetContentAnchoredPosition(pos);
    }
    if (this.m_Dragging && this.m_Inertia && dt > 0) {
      const nv = this.m_Content.anchoredPosition.sub(this.m_PrevPosition).divideScalar(dt);
      this.velocity.lerp(nv, Math.min(1, dt * 10));
    }
    const ap = this.m_Content.anchoredPosition;
    if (!this.m_ViewBounds.equals(this.m_PrevViewBounds) || !this.m_ContentBounds.equals(this.m_PrevContentBounds) || !ap.equals(this.m_PrevPosition)) {
      this.m_OnValueChanged.Invoke(this.normalizedPosition);
      this.UpdatePrevData();
    }
    this.m_Scrolling = false;
  }

  UpdatePrevData() {
    this.m_PrevPosition.copy(this.m_Content.anchoredPosition);
    this.m_PrevViewBounds = new Bounds2(this.m_ViewBounds.cx, this.m_ViewBounds.cy, this.m_ViewBounds.sx, this.m_ViewBounds.sy);
    this.m_PrevContentBounds = new Bounds2(this.m_ContentBounds.cx, this.m_ContentBounds.cy, this.m_ContentBounds.sx, this.m_ContentBounds.sy);
  }

  getContentBounds() {
    const view = this.viewRect;
    const corners = this.m_Content.GetWorldCorners();
    const inv = new THREE.Matrix4().copy(view.updateWorld()).invert();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of corners) {
      const p = c.applyMatrix4(inv);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return new Bounds2((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0);
  }

  UpdateBounds() {
    const vr = this.viewRect.rect;
    this.m_ViewBounds = new Bounds2(vr.x + vr.width / 2, vr.y + vr.height / 2, vr.width, vr.height);
    if (!this.m_Content) return;
    const cb = this.getContentBounds();
    const pivot = this.m_Content.pivot;
    adjustBounds(this.m_ViewBounds, pivot, cb);
    this.m_ContentBounds = cb;
    if (this.m_MovementType === 2) {
      const vb = this.m_ViewBounds;
      const d = new THREE.Vector2();
      if (vb.maxX > cb.maxX) d.x = Math.min(vb.minX - cb.minX, vb.maxX - cb.maxX);
      else if (vb.minX < cb.minX) d.x = Math.max(vb.minX - cb.minX, vb.maxX - cb.maxX);
      if (vb.minY < cb.minY) d.y = Math.max(vb.minY - cb.minY, vb.maxY - cb.maxY);
      else if (vb.maxY > cb.maxY) d.y = Math.min(vb.minY - cb.minY, vb.maxY - cb.maxY);
      if (d.lengthSq() > 1e-12) {
        if (!this.m_Horizontal) d.x = 0;
        if (!this.m_Vertical) d.y = 0;
        cb.cx += d.x;
        cb.cy += d.y;
        adjustBounds(this.m_ViewBounds, pivot, cb);
      }
    }
  }

  CalculateOffset(delta) {
    const off = new THREE.Vector2();
    if (this.m_MovementType === 0) return off;
    const vb = this.m_ViewBounds;
    const cb = this.m_ContentBounds;
    if (this.m_Horizontal) {
      const minX = cb.minX + delta.x;
      const maxX = cb.maxX + delta.x;
      const maxOffset = vb.maxX - maxX;
      const minOffset = vb.minX - minX;
      if (minOffset < -0.001) off.x = minOffset;
      else if (maxOffset > 0.001) off.x = maxOffset;
    }
    if (this.m_Vertical) {
      const minY = cb.minY + delta.y;
      const maxY = cb.maxY + delta.y;
      const maxOffset = vb.maxY - maxY;
      const minOffset = vb.minY - minY;
      if (maxOffset > 0.001) off.y = maxOffset;
      else if (minOffset < -0.001) off.y = minOffset;
    }
    return off;
  }

  get horizontalNormalizedPosition() {
    this.UpdateBounds();
    const vb = this.m_ViewBounds;
    const cb = this.m_ContentBounds;
    if (cb.sx <= vb.sx || Math.abs(cb.sx - vb.sx) < 1e-4) return vb.minX > cb.minX ? 1 : 0;
    return (vb.minX - cb.minX) / (cb.sx - vb.sx);
  }

  set horizontalNormalizedPosition(v) {
    this.SetNormalizedPosition(v, 0);
  }

  get verticalNormalizedPosition() {
    this.UpdateBounds();
    const vb = this.m_ViewBounds;
    const cb = this.m_ContentBounds;
    if (cb.sy <= vb.sy || Math.abs(cb.sy - vb.sy) < 1e-4) return vb.minY > cb.minY ? 1 : 0;
    return (vb.minY - cb.minY) / (cb.sy - vb.sy);
  }

  set verticalNormalizedPosition(v) {
    this.SetNormalizedPosition(v, 1);
  }

  get normalizedPosition() {
    return new THREE.Vector2(this.horizontalNormalizedPosition, this.verticalNormalizedPosition);
  }

  set normalizedPosition(v) {
    this.SetNormalizedPosition(v.x, 0);
    this.SetNormalizedPosition(v.y, 1);
  }

  SetNormalizedPosition(value, axis) {
    this.UpdateBounds();
    const vb = this.m_ViewBounds;
    const cb = this.m_ContentBounds;
    const hidden = axis === 0 ? cb.sx - vb.sx : cb.sy - vb.sy;
    const vmin = axis === 0 ? vb.minX : vb.minY;
    const cmin = axis === 0 ? cb.minX : cb.minY;
    const contentMin = vmin - value * hidden;
    const lp = this.m_Content.localPosition;
    const k = axis === 0 ? 'x' : 'y';
    const next = lp[k] + contentMin - cmin;
    if (Math.abs(lp[k] - next) > 0.01) {
      lp[k] = next;
      this.m_Content.localPosition = lp;
      this.velocity[k] = 0;
      this.UpdateBounds();
    }
  }
}

function adjustBounds(view, pivot, cb) {
  const ex = view.sx - cb.sx;
  const ey = view.sy - cb.sy;
  if (ex > 0) {
    cb.cx -= ex * (pivot.x - 0.5);
    cb.sx = view.sx;
  }
  if (ey > 0) {
    cb.cy -= ey * (pivot.y - 0.5);
    cb.sy = view.sy;
  }
}

function rubberDelta(over, viewSize) {
  return (1 - 1 / ((Math.abs(over) * 0.55) / viewSize + 1)) * viewSize * Math.sign(over);
}

for (const cls of [Selectable, Button, Toggle, ToggleGroup, ScrollRect]) registerComponent(cls);
