// Shared UI scripts of the Unity project (CW UI kit, I2 Localize, small helpers) + the C# extension methods
// the ported scripts rely on (GameObject.Show, Component.SetActive, RectTransform.SetBottom...).
import * as THREE from 'three';
import { MonoBehaviour, GameObject, Component, Transform } from '../engine/scene.js';
import { EventAction, WaitForSeconds, Time } from '../engine/core.js';
import { registerComponent } from '../engine/instantiate.js';
import { Meta } from '../meta/data.js';
import { RectTransform } from '../ugui/rect.js';
import { Color } from '../ugui/graphic.js';
import { UISystem } from '../ugui/canvas.js';

// ---------------------------------------------------------------- C# helpers

/** C# string.Format subset: {0}, {0:N0}, {0:0.0}, {0:D2}, {0:F1}, {0:P0}, {0:#,0}, {{ }} escapes */
export function csFormat(fmt, ...args) {
  if (fmt === null || fmt === undefined) return '';
  return String(fmt).replace(/\{\{|\}\}|\{(\d+)(?:,(-?\d+))?(?::([^}]*))?\}/g, (m, i, align, spec) => {
    if (m === '{{') return '{';
    if (m === '}}') return '}';
    let v = args[+i];
    let s = formatValue(v, spec);
    if (align) {
      const w = +align;
      s = w > 0 ? s.padStart(w) : s.padEnd(-w);
    }
    return s;
  });
}

export function formatValue(v, spec) {
  if (v === null || v === undefined) return '';
  if (!spec) return typeof v === 'number' && !Number.isInteger(v) ? String(+v.toFixed(7)) : String(v);
  const n = Number(v);
  const sp = spec.trim();
  let m;
  if ((m = /^[Nn](\d*)$/.exec(sp))) return n.toLocaleString('en-US', { minimumFractionDigits: +(m[1] || 0), maximumFractionDigits: +(m[1] || 0) });
  if ((m = /^[Ff](\d*)$/.exec(sp))) return n.toFixed(+(m[1] === '' ? 2 : m[1]));
  if ((m = /^[Dd](\d*)$/.exec(sp))) return String(Math.trunc(n)).padStart(+(m[1] || 0), '0');
  if ((m = /^[Pp](\d*)$/.exec(sp))) return `${(n * 100).toFixed(+(m[1] || 0))}%`;
  if (/^#,##?0$|^#,0$/.test(sp)) return Math.round(n).toLocaleString('en-US');
  if ((m = /^(0+)(?:\.(0+|#+))?$/.exec(sp))) {
    const dec = m[2] ? m[2].length : 0;
    const s = m[2] && m[2][0] === '#' ? String(+n.toFixed(dec)) : n.toFixed(dec);
    const [ip, fp] = s.split('.');
    return ip.padStart(m[1].length, '0') + (fp ? '.' + fp : '');
  }
  if ((m = /^#+(?:\.(#+))?$/.exec(sp))) return String(+n.toFixed(m[1] ? m[1].length : 0));
  return String(v);
}

/** I2 LocalizedString / term -> English text */
export function localize(term) {
  if (!term) return '';
  const t = typeof term === 'string' ? term : term.mTerm;
  if (!t) return '';
  const s = Meta.data?.loc?.[t];
  return s === undefined ? t : s;
}

/** I2 parameter substitution: {[NAME]} */
export function applyParams(s, getParam) {
  return String(s).replace(/\{\[([^\]]+)\]\}/g, (m, k) => {
    const v = getParam(k);
    return v === null || v === undefined ? m : String(v);
  });
}

// GameObject / Component extensions (CW.Core)
GameObject.prototype.Show = function (show = true) {
  this.SetActive(show);
};
GameObject.prototype.Hide = function () {
  this.SetActive(false);
};
Component.prototype.SetActive = function (active) {
  this.gameObject.SetActive(active);
};
Component.prototype.Show = function (show = true) {
  this.gameObject.SetActive(show);
};
Component.prototype.Hide = function () {
  this.gameObject.SetActive(false);
};
Component.prototype.IsVisible = function () {
  return this.gameObject.activeInHierarchy;
};
Transform.prototype.ResetTransform = function () {
  this.localPosition = new THREE.Vector3();
  this.localRotation = new THREE.Quaternion();
  this.localScale = new THREE.Vector3(1, 1, 1);
};
Transform.prototype.GetComponentsInImmediateChildren = function (type) {
  const out = [];
  for (const ch of this.children) {
    const c = ch.gameObject.GetComponent(type);
    if (c) out.push(c);
  }
  return out;
};
const RP = RectTransform.prototype;
RP.SetLeft = function (v) {
  this.offsetMin = new THREE.Vector2(v, this.offsetMin.y);
};
RP.SetRight = function (v) {
  this.offsetMax = new THREE.Vector2(-v, this.offsetMax.y);
};
RP.SetTop = function (v) {
  this.offsetMax = new THREE.Vector2(this.offsetMax.x, -v);
};
RP.SetBottom = function (v) {
  this.offsetMin = new THREE.Vector2(this.offsetMin.x, v);
};
RP.MMSetLeft = RP.SetLeft;
RP.MMSetRight = RP.SetRight;
RP.MMSetTop = RP.SetTop;
RP.MMSetBottom = RP.SetBottom;
RP.GetLeft = function () {
  return this.offsetMin.x;
};
RP.GetRight = function () {
  return -this.offsetMax.x;
};
RP.GetTop = function () {
  return -this.offsetMax.y;
};
RP.GetBottom = function () {
  return this.offsetMin.y;
};

/** event field helper: serialized UnityEvent or a fresh one */
export function ev(v) {
  return v instanceof EventAction ? v : new EventAction();
}

// ---------------------------------------------------------------- I2 Localize

const TERM_MODIFIERS = {
  0: (s) => s,
  1: (s) => s.toUpperCase(),
  2: (s) => s.toLowerCase(),
  3: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  4: (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
};

export class Localize extends MonoBehaviour {
  static typeName = 'Localize';

  constructor() {
    super();
    this.mTerm = '';
    this.PrimaryTermModifier = 0;
    this.LocalizeOnAwake = 1;
    this.AllowParameters = 1;
  }

  get Term() {
    return this.mTerm;
  }

  set Term(t) {
    this.SetTerm(t);
  }

  Awake() {
    if (this.LocalizeOnAwake) this.OnLocalize(true);
  }

  OnEnable() {
    this.OnLocalize(false);
  }

  SetTerm(term) {
    if (term && typeof term === 'object') term = term.mTerm;
    this.mTerm = term || '';
    this.OnLocalize(true);
  }

  /** text of the term with the parameters of every ILocalizationParamsManager on this object */
  get translation() {
    let s = localize(this.mTerm);
    if (this.AllowParameters) {
      const managers = this.gameObject.components.filter((c) => typeof c.GetParameterValue === 'function');
      s = applyParams(s, (k) => {
        for (const m of managers) {
          const v = m.GetParameterValue(k);
          if (v !== null && v !== undefined) return v;
        }
        return null;
      });
    }
    return (TERM_MODIFIERS[this.PrimaryTermModifier] || TERM_MODIFIERS[0])(s);
  }

  OnLocalize(force = false) {
    if (!this.mTerm) return;
    const target = this.gameObject.GetComponent('TMP_Text');
    if (target) target.text = this.translation;
    if (this.LocalizeCallBack instanceof EventAction) this.LocalizeCallBack.Invoke();
  }
}

// ---------------------------------------------------------------- CW UI kit text setters

export class SetTextCore extends MonoBehaviour {
  static typeName = 'SetTextCore';

  constructor() {
    super();
    this.showOnSet = 0;
    this.stringFormat = '{0}';
    this.onUpdateLocalization = new EventAction();
  }

  SetText(value) {
    this.ValidateStringFormat();
    this.SetTextFormat(value);
  }

  FormatValue(value) {
    return csFormat(this.stringFormat, value);
  }

  SetTextFormat(value) {
    this.SetTextNoFormat(this.FormatValue(value));
  }

  SetTextNoFormat(text) {
    if (this.showOnSet && !this.gameObject.activeSelf) this.gameObject.SetActive(true);
  }

  ValidateStringFormat() {
    this.stringFormat = String(this.stringFormat ?? '{0}').replace('[value]', '{0}');
  }

  OnUpdateLocalization() {
    ev(this.onUpdateLocalization).Invoke();
  }

  SetColor() {}
}

export class SetTextMeshPro extends SetTextCore {
  static typeName = 'SetTextMeshPro';

  SetTextNoFormat(text) {
    super.SetTextNoFormat(text);
    if (this.textMesh) this.textMesh.text = text;
  }

  SetColor(color) {
    if (this.textMesh) this.textMesh.color = color;
  }
}

export class SetTextI2 extends SetTextCore {
  static typeName = 'SetTextI2';

  SetTerm(set) {
    const t = set && typeof set === 'object' ? set.mTerm : set;
    if (t) this.localize?.SetTerm(t);
  }

  SetTextNoFormat(text) {
    super.SetTextNoFormat(text);
    this.parameter1 = text;
    this.localize?.OnLocalize(true);
  }

  ValidateStringFormat() {}

  FormatValue(value) {
    return String(value);
  }

  SetColor(color) {
    ev(this.onColor).Invoke(color);
  }

  GetParameterValue(p) {
    return p === '0' ? this.parameter1 : null;
  }
}

export class SetColor extends MonoBehaviour {
  static typeName = 'SetColor';

  SetColorOverride(color) {
    ev(this.onSetColor).Invoke(color);
  }

  SetActive(set) {
    if (set === undefined || set === true) ev(this.onSetColor).Invoke(Color.from(this.colorActive));
    else ev(this.onSetColor).Invoke(Color.from(this.colorInactive));
  }

  SetInactive() {
    ev(this.onSetColor).Invoke(Color.from(this.colorInactive));
  }
}

export class BooleanEventHandler extends MonoBehaviour {
  static typeName = 'BooleanEventHandler';

  OnTrue() {
    ev(this.onTrue).Invoke();
  }

  OnFalse() {
    ev(this.onFalse).Invoke();
  }

  Handle(value) {
    if (value) ev(this.onTrue).Invoke();
    else ev(this.onFalse).Invoke();
  }
}

export class Fillbar extends MonoBehaviour {
  static typeName = 'Fillbar';

  constructor() {
    super();
    this.animate = 0;
    this.animSpeed = 3;
    this.format = '{0} / {1}';
    this.animateWithUnscaledTime = 0;
    this.currentGoal = -1;
    this.currentLerp = 0;
    this.current = 0;
    this.min = 0;
    this.max = 0;
    this._anim = null;
  }

  get IsAnimating() {
    return !!this._anim;
  }

  OnDisable() {
    if (this._anim) {
      this.StopCoroutine(this._anim);
      this._anim = null;
    }
  }

  SetFormat(f) {
    this.format = f;
  }

  SetText(current, max) {
    this.txtElement?.SetTextNoFormat(csFormat(this.format, current, max));
  }

  /** SetFill(current, max[, animate]) | SetFill(current, min, max[, animate]) | SetFill(lerp[, animate]) */
  SetFill(a, b, c, d) {
    if (b === undefined || typeof b === 'boolean') return this.setLerp(a, b ?? true);
    if (c === undefined || typeof c === 'boolean') return this.SetFill(a, 0, b, c ?? true);
    this.current = a >>> 0;
    this.min = b >>> 0;
    this.max = c >>> 0;
    const lerp = this.min === this.max ? 0 : Math.min(1, Math.max(0, (a - b) / (c - b)));
    return this.setLerp(lerp, d ?? true);
  }

  setLerp(lerp, animateRequested = true) {
    if (animateRequested && Math.abs(lerp - this.currentGoal) < 1e-6) {
      this.SetText(this.current, this.max);
      return false;
    }
    this.currentGoal = lerp;
    if (animateRequested && this.animate) {
      if (!this._anim) this._anim = this.StartCoroutine(this.moveToGoal());
    } else {
      this.currentLerp = lerp;
      if (this.fill) this.fill.fillAmount = lerp;
      this.setTextInternal();
    }
    return true;
  }

  *moveToGoal() {
    while (Math.abs(this.currentGoal - this.currentLerp) > 1e-6 || Math.abs(this.currentLerp - (this.fill?.fillAmount ?? this.currentLerp)) > 1e-6) {
      const maxDelta = (this.animateWithUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime) * this.animSpeed;
      const d = this.currentGoal - this.currentLerp;
      this.currentLerp = Math.abs(d) <= maxDelta ? this.currentGoal : this.currentLerp + Math.sign(d) * maxDelta;
      this.setTextInternal();
      if (this.fill) this.fill.fillAmount = this.currentLerp;
      yield null;
    }
    this._anim = null;
  }

  setTextInternal() {
    const v = Math.min(1, Math.max(0, this.currentLerp)) * (Math.max(this.current, this.max) - this.min) + this.min;
    this.SetText(Math.ceil(v - 1e-6), this.max);
  }
}

export class UI_GameNotification extends MonoBehaviour {
  static typeName = 'UI_GameNotification';

  constructor() {
    super();
    this.useText = 1;
  }

  UpdatePingObject(v) {
    if (typeof v === 'boolean') {
      this.pingObject?.SetActive(v);
      return;
    }
    this.pingObject?.SetActive(v > 0);
    if (this.useText) this.pingText?.SetText(String(v));
  }
}

export class ParticleStarter extends MonoBehaviour {
  static typeName = 'ParticleStarter';

  constructor() {
    super();
    this.justPlay = 1;
    this.burstAmount = 10;
    this.betweenDelay = -1;
    this.emitBursts = [];
    this.bursts = [];
  }

  get HasEmitArray() {
    return !!this.emitBursts?.length;
  }

  /** Burst() | Burst(amount) | Burst(position) | Burst(component) */
  Burst(arg) {
    if (arg === undefined) return this.burstCount(this.burstAmount);
    if (typeof arg === 'number') return this.burstCount(arg);
    if (arg.isVector3) {
      this.bursts.push(arg.clone());
      return;
    }
    if (arg.transform) this.bursts.push(arg.transform.position);
  }

  Update() {
    if (!this.bursts.length) return;
    for (const p of this.bursts) {
      this.system.transform.position = p;
      if (this.justPlay) this.system.Play();
      else this.burstCount(this.burstAmount);
    }
    this.bursts.length = 0;
  }

  burstCount(amount) {
    if (!this.system) return;
    if (amount < 0) amount = this.system.maxParticles;
    this.StartCoroutine(this.burstParticles(amount));
  }

  *burstParticles(amount) {
    const sys = this.system;
    if (this.emitBursts?.length) {
      for (const b of this.emitBursts) {
        if ((b.delay ?? -1) >= -0.1) yield new WaitForSeconds(b.delay);
        sys.Emit(b.emit ?? 1);
      }
    } else if (this.betweenDelay > -1) {
      while (amount-- > 0) {
        sys.Emit(1);
        yield new WaitForSeconds(this.betweenDelay);
      }
    } else {
      sys.Emit(amount);
      yield null;
    }
  }
}

export class AutoLayoutElement extends MonoBehaviour {
  static typeName = 'AutoLayoutElement';

  constructor() {
    super();
    this.priority = 0;
    this._w = 0;
    this._h = 0;
  }

  get minWidth() {
    return this._w;
  }

  get preferredWidth() {
    return this._w;
  }

  get flexibleWidth() {
    return this._w;
  }

  get minHeight() {
    return this._h;
  }

  get preferredHeight() {
    return this._h;
  }

  get flexibleHeight() {
    return this._h;
  }

  get layoutPriority() {
    return this.priority;
  }

  topElement(child, prop) {
    let best = null;
    for (const c of child.gameObject.components) {
      if (!('preferredWidth' in c) || !('minWidth' in c)) continue;
      if (!best || (c.layoutPriority ?? 0) > (best.layoutPriority ?? 0)) best = c;
    }
    return best ? best[prop] : -1;
  }

  CalculateLayoutInputHorizontal() {
    this._w = 0;
    for (const ch of this.transform.children) {
      if (!ch.isRectTransform) continue;
      const v = this.topElement(ch, 'minWidth');
      if (v >= 0) this._w += v;
    }
  }

  CalculateLayoutInputVertical() {
    this._h = 0;
    for (const ch of this.transform.children) {
      if (!ch.isRectTransform) continue;
      const v = this.topElement(ch, 'minHeight');
      if (v >= 0) this._h += v;
    }
  }

  // no-ops: LayoutSystem only runs the inputs of components that also have SetLayout* (Unity's
  // LayoutRebuilder calls CalculateLayoutInput* on every ILayoutElement)
  SetLayoutHorizontal() {}

  SetLayoutVertical() {}
}

/** Game Boy mode easter egg (15 presses): not reproduced, the counter is harmless */
export class GBAdvance extends MonoBehaviour {
  static typeName = 'GBAdvance';
}

/** banner ads were removed from the project: the container keeps a 0 bottom inset (debug: ?banner=px) */
export class UI_SpaceManager extends MonoBehaviour {
  static typeName = 'UI_SpaceManager';

  OnEnable() {
    this.ReCalculateBannerSize();
  }

  Update() {
    this.ReCalculateBannerSize();
  }

  ReCalculateBannerSize() {
    const rt = this.thisRectTransform || this.transform;
    if (!rt?.isRectTransform) return;
    const canvas = this.parentCanvas || this.GetComponentInParent('Canvas');
    const px = UI_SpaceManager.bannerPixels;
    const s = canvas?.rootCanvas?.scaleFactor || 1;
    const bottom = px ? px / s : 0;
    if (rt.GetBottom() !== bottom) rt.SetBottom(bottom);
  }
}
UI_SpaceManager.bannerPixels = Number(new URLSearchParams(globalThis.location?.search || '').get('banner')) || 0;

for (const cls of [Localize, SetTextCore, SetTextMeshPro, SetTextI2, SetColor, BooleanEventHandler, Fillbar, UI_GameNotification, ParticleStarter, AutoLayoutElement, GBAdvance, UI_SpaceManager]) registerComponent(cls);

void UISystem;

// ---------------------------------------------------------------- [SerializeReference] fields

export const SerializableRegistry = new Map();

/** register a plain C# class used through [SerializeReference] */
export function registerSerializable(cls, name) {
  SerializableRegistry.set(name, cls);
}

/** instance of the managed reference stored in `field` of a component ({rid} + references.RefIds) */
export function managedReference(component, field) {
  const ref = component[field] ?? component._data?.[field];
  const rid = ref?.rid;
  if (rid === undefined || rid === -2) return null;
  const refs = component.references?.RefIds || component._data?.references?.RefIds || [];
  const entry = refs.find((r) => r.rid === rid);
  const name = entry?.type?.class;
  if (!name) return null;
  const Cls = SerializableRegistry.get(name);
  if (!Cls) {
    console.warn('SerializeReference: no class', name);
    return null;
  }
  const obj = new Cls();
  Object.assign(obj, entry.data || {});
  return obj;
}

// ---------------------------------------------------------------- UI_OverlayBase (challenge / levels / world stats overlays)

import { InputUIBlocker } from '../ugui/events.js';

export class UI_OverlayBase extends MonoBehaviour {
  static typeName = 'UI_OverlayBase';

  constructor() {
    super();
    this.OnOpen = new EventAction();
    this.OnClose = new EventAction();
    this.disableInputWhenTransitioning = 0;
    this._overlayCo = null;
  }

  OnDeserialize() {
    this.OnOpen = ev(this.OnOpen);
    this.OnClose = ev(this.OnClose);
  }

  get IsOpen() {
    return this.gameObject.activeSelf;
  }

  TryOpen() {
    if (this._overlayCo) return false;
    this.gameObject.SetActive(true);
    if (this.transitionFeedbackIn) {
      if (this.disableInputWhenTransitioning) InputUIBlocker.DisableInput();
      this.transitionFeedbackIn.PlayFeedbacks();
    }
    this._overlayCo = this.StartCoroutine(this.WaitForOpen());
    this.OnOpen.Invoke();
    return true;
  }

  TryClose() {
    if (this._overlayCo || !this.isActiveAndEnabled) return false;
    if (this.transitionFeedbackOut) {
      if (this.disableInputWhenTransitioning) InputUIBlocker.DisableInput();
      this.transitionFeedbackOut.PlayFeedbacks();
    }
    this._overlayCo = this.StartCoroutine(this.WaitForClose());
    this.OnClose.Invoke();
    return true;
  }

  *WaitForOpen() {
    if (this.transitionFeedbackIn) yield new WaitForSeconds(this.transitionFeedbackIn.TotalDuration);
    if (this.additionalOpen) while (this.additionalOpen.IsPlaying) yield null;
    this._overlayCo = null;
    this.OpenFinished();
  }

  *WaitForClose() {
    if (this.transitionFeedbackOut) yield new WaitForSeconds(this.transitionFeedbackOut.TotalDuration);
    if (this.additionalClose) while (this.additionalClose.IsPlaying) yield null;
    this._overlayCo = null;
    this.gameObject.SetActive(false);
    this.CloseFinished();
  }

  OnDisable() {
    if (this._overlayCo) {
      this._overlayCo = null;
      this.gameObject.SetActive(false);
      this.CloseFinished();
    }
    this._overlayCo = null;
  }

  OpenFinished() {
    if (this.disableInputWhenTransitioning) InputUIBlocker.EnableInput();
  }

  CloseFinished() {
    if (this.disableInputWhenTransitioning) InputUIBlocker.EnableInput();
  }
}

registerComponent(UI_OverlayBase);
