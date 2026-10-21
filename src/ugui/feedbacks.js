// MoreMountains feedbacks that drive UI components (Image / TMP / CanvasGroup / events / squash & stretch),
// ported from MoreMountains.Feedbacks. Registered over the no-op placeholders of game/mmfeedbacks.js.
import * as THREE from 'three';
import { MMFeedback } from '../game/mmfeedbacks.js';
import { EventAction, Time } from '../engine/core.js';
import { AnimationCurve, Gradient, Mathf } from '../engine/math.js';
import { registerComponent } from '../engine/instantiate.js';
import { Color } from './graphic.js';

// ---------------------------------------------------------------- MMTween

const inOut = (f) => (t) => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2);
const outOf = (f) => (t) => 1 - f(1 - t);
const inBounce = (t) => 2 ** (-10 * t) * Math.sin(((t - 0.3 / 4) * (2 * Math.PI)) / 0.3) + 1;
const inOverhead = (t) => t * t * (2.6 * t - 1.6);
const inExpo = (t) => (t === 0 ? 0 : 2 ** (10 * (t - 1)));
const inElastic = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  t -= 1;
  return -(2 ** (10 * t)) * Math.sin(((t - 0.1) * (2 * Math.PI)) / 0.4);
};
const inCirc = (t) => 1 - Math.sqrt(1 - t * t);
const inSine = (t) => 1 + Math.sin((Math.PI / 2) * t - Math.PI / 2);
const pow = (n) => (t) => t ** n;

/** MMTween.MMTweenCurve order */
const TWEENS = [
  (t) => t,
  pow(2),
  outOf(pow(2)),
  inOut(pow(2)),
  pow(3),
  outOf(pow(3)),
  inOut(pow(3)),
  pow(4),
  outOf(pow(4)),
  inOut(pow(4)),
  pow(5),
  outOf(pow(5)),
  inOut(pow(5)),
  inSine,
  outOf(inSine),
  inOut(inSine),
  inBounce,
  outOf(inBounce),
  inOut(inBounce),
  inOverhead,
  outOf(inOverhead),
  inOut(inOverhead),
  inExpo,
  outOf(inExpo),
  inOut(inExpo),
  inElastic,
  outOf(inElastic),
  inOut(inElastic),
  inCirc,
  outOf(inCirc),
  inOut(inCirc),
  (t) => 1 - t,
  (t) => t * t * (2 - t),
];

/** MMTweenType {MMTweenDefinitionType, MMTweenCurve, Curve} | AnimationCurve -> evaluate(t) */
export function mmEvaluate(tt, t) {
  if (!tt) return t;
  if (tt instanceof AnimationCurve) return tt.Evaluate(t);
  if (tt.MMTweenDefinitionType === 1) return AnimationCurve.from(tt.Curve).Evaluate(t);
  const f = TWEENS[tt.MMTweenCurve ?? 4] || TWEENS[0];
  return f(t);
}

export function mmTween(t, t0, t1, a, b, tt) {
  const x = t1 !== t0 ? (t - t0) / (t1 - t0) : 0;
  return a + mmEvaluate(tt, x) * (b - a);
}

const remap = (x, a, b, c, d) => c + ((x - a) * (d - c)) / (b - a);
const grad = (g) => (g instanceof Gradient ? g : Gradient.from(g));

/** shared "journey" loop of the over-time feedbacks */
function* journey(fb, apply) {
  const d = fb.FeedbackDuration;
  let j = fb.NormalPlayDirection ? 0 : d;
  fb.IsPlaying = true;
  while (j >= 0 && j <= d && d > 0) {
    apply(remap(j, 0, d, 0, 1));
    j += fb.NormalPlayDirection ? fb.FeedbackDeltaTime : -fb.FeedbackDeltaTime;
    yield null;
  }
  apply(fb.FinalNormalizedTime);
}

// ---------------------------------------------------------------- Image

export class MMFeedbackImageAlpha extends MMFeedback {
  constructor() {
    super();
    this.SetImageActiveState = 1;
    this.Mode = 0;
    this.Duration = 0.2;
    this.InstantAlpha = 1;
    this.CurveRemapZero = 0;
    this.CurveRemapOne = 1;
    this.DestinationAlpha = 1;
  }

  get FeedbackDuration() {
    return this.Mode === 1 ? 0 : this.ApplyTimeMultiplier(this.Duration);
  }

  CustomPlayFeedback() {
    if (!this.Active || !this.BoundImage) return;
    this.Turn(true);
    if (this.Mode === 1) {
      this.BoundImage.color = this.BoundImage.color.withAlpha(this.InstantAlpha);
      return;
    }
    if (!this.AllowAdditivePlays && this._co) return;
    const self = this;
    this._co = this.StartCoroutine((function* () {
      const img = self.BoundImage;
      const initial = img.color.a;
      yield* journey(self, (t) => {
        const a = self.Mode === 0 ? mmTween(t, 0, 1, self.CurveRemapZero, self.CurveRemapOne, self.Curve) : mmTween(t, 0, 1, initial, self.DestinationAlpha, self.Curve);
        img.color = img.color.withAlpha(a);
      });
      self._co = null;
      self.IsPlaying = false;
    })());
  }

  CustomStopFeedback() {
    if (!this.Active) return;
    this.IsPlaying = false;
    if (this._co) this.StopCoroutine(this._co);
    this.Turn(false);
    this._co = null;
  }

  Turn(status) {
    if (this.SetImageActiveState && this.BoundImage) {
      this.BoundImage.gameObject.SetActive(status);
      this.BoundImage.enabled = status;
    }
  }
}

export class MMFeedbackImage extends MMFeedback {
  constructor() {
    super();
    this.Mode = 0;
    this.Duration = 0.2;
    this.StartsOff = 0;
    this.DisableOnStop = 1;
    this.ModifyColor = 1;
  }

  get FeedbackDuration() {
    return this.Mode === 1 ? 0 : this.ApplyTimeMultiplier(this.Duration);
  }

  CustomInitialization() {
    if (this.Active && this.StartsOff) this.Turn(false);
  }

  CustomPlayFeedback() {
    if (!this.Active || !this.BoundImage) return;
    this.Turn(true);
    if (this.Mode === 1) {
      if (this.ModifyColor) this.BoundImage.color = Color.from(this.InstantColor);
      return;
    }
    if (this.Mode !== 0) return;
    if (!this.AllowAdditivePlays && this._co) return;
    const self = this;
    this._co = this.StartCoroutine((function* () {
      yield* journey(self, (t) => {
        if (self.ModifyColor) self.BoundImage.color = Color.from(grad(self.ColorOverTime).Evaluate(t));
      });
      if (self.StartsOff) self.Turn(false);
      self.IsPlaying = false;
      self._co = null;
    })());
  }

  CustomStopFeedback() {
    if (!this.Active) return;
    this.IsPlaying = false;
    if (this._co) this.StopCoroutine(this._co);
    if (this.DisableOnStop) this.Turn(false);
    this._co = null;
  }

  Turn(status) {
    if (!this.BoundImage) return;
    this.BoundImage.gameObject.SetActive(status);
    this.BoundImage.enabled = status;
  }
}

// ---------------------------------------------------------------- TextMesh Pro

export class MMFeedbackTMPAlpha extends MMFeedback {
  constructor() {
    super();
    this.AlphaMode = 1;
    this.Duration = 0.2;
    this.InstantAlpha = 1;
    this.CurveRemapZero = 0;
    this.CurveRemapOne = 1;
    this.DestinationAlpha = 1;
  }

  get FeedbackDuration() {
    return this.AlphaMode === 0 ? 0 : this.ApplyTimeMultiplier(this.Duration);
  }

  CustomInitialization() {
    if (this.TargetTMPText) this._initial = this.TargetTMPText.alpha;
  }

  CustomPlayFeedback() {
    const txt = this.TargetTMPText;
    if (!this.Active || !txt) return;
    if (this.AlphaMode === 0) {
      txt.alpha = this.InstantAlpha;
      return;
    }
    if (!this.AllowAdditivePlays && this._co) return;
    if (this.AlphaMode === 2) this._initial = txt.alpha;
    const self = this;
    this._co = this.StartCoroutine((function* () {
      yield* journey(self, (t) => {
        txt.alpha = self.AlphaMode === 1 ? mmTween(t, 0, 1, self.CurveRemapZero, self.CurveRemapOne, self.Curve) : mmTween(t, 0, 1, self._initial, self.DestinationAlpha, self.Curve);
      });
      self._co = null;
      self.IsPlaying = false;
    })());
  }

  CustomStopFeedback() {
    if (!this.Active) return;
    this.IsPlaying = false;
    if (this._co) this.StopCoroutine(this._co);
    this._co = null;
  }
}

export class MMFeedbackTMPColor extends MMFeedback {
  constructor() {
    super();
    this.ColorMode = 2;
    this.Duration = 0.2;
  }

  get FeedbackDuration() {
    return this.ColorMode === 0 ? 0 : this.ApplyTimeMultiplier(this.Duration);
  }

  CustomInitialization() {
    if (this.TargetTMPText) this._initial = this.TargetTMPText.color;
  }

  CustomPlayFeedback() {
    const txt = this.TargetTMPText;
    if (!this.Active || !txt) return;
    if (this.ColorMode === 0) {
      txt.color = Color.from(this.InstantColor);
      return;
    }
    if (!this.AllowAdditivePlays && this._co) return;
    const self = this;
    this._co = this.StartCoroutine((function* () {
      yield* journey(self, (t) => {
        if (self.ColorMode === 1) txt.color = Color.from(grad(self.ColorGradient).Evaluate(t));
        else txt.color = Color.LerpUnclamped(self._initial || txt.color, Color.from(self.DestinationColor), AnimationCurve.from(self.ColorCurve).Evaluate(t));
      });
      self._co = null;
      self.IsPlaying = false;
    })());
  }

  CustomStopFeedback() {
    if (!this.Active) return;
    this.IsPlaying = false;
    if (this._co) this.StopCoroutine(this._co);
    this._co = null;
  }
}

// ---------------------------------------------------------------- CanvasGroup (MMFeedbackBase)

export class MMFeedbackCanvasGroup extends MMFeedback {
  constructor() {
    super();
    this.Mode = 0;
    this.Duration = 0.2;
    this.ControlActiveState = 1;
    this.StartsOff = 0;
    this.DisableOnStop = 0;
    this.RelativeValues = 1;
    this.RemapZero = 0;
    this.RemapOne = 1;
    this.InstantAlpha = 0;
  }

  get FeedbackDuration() {
    return this.Mode === 1 ? 0 : this.ApplyTimeMultiplier(this.Duration);
  }

  CustomInitialization() {
    this._initialLevel = this.TargetCanvasGroup ? this.TargetCanvasGroup.alpha : 0;
    if (this.Active && this.StartsOff) this.Turn(false);
  }

  CustomPlayFeedback(position, intensity = 1) {
    const g = this.TargetCanvasGroup;
    if (!this.Active || !g) return;
    this.Turn(true);
    if (this.Mode === 1) {
      g.alpha = this.InstantAlpha;
      return;
    }
    if (!this.AllowAdditivePlays && this._co) return;
    const k = this.timing.ConstantIntensity ? 1 : intensity;
    const self = this;
    this._co = this.StartCoroutine((function* () {
      yield* journey(self, (t) => {
        let v = mmTween(t, 0, 1, self.RemapZero, self.RemapOne, self.AlphaCurve);
        if (self.RelativeValues) v += self._initialLevel;
        g.alpha = k * v;
      });
      if (self.StartsOff) self.Turn(false);
      self.IsPlaying = false;
      self._co = null;
    })());
  }

  CustomStopFeedback() {
    if (!this.Active) return;
    if (this._co) this.StopCoroutine(this._co);
    this._co = null;
    this.IsPlaying = false;
    if (this.DisableOnStop) this.Turn(false);
  }

  Turn(status) {
    if (!this.ControlActiveState || !this.TargetCanvasGroup) return;
    this.TargetCanvasGroup.gameObject.SetActive(status);
  }
}

// ---------------------------------------------------------------- events / squash & stretch

export class MMFeedbackEvents extends MMFeedback {
  CustomInitialization() {
    if (this.Active && this.InitializationEvents instanceof EventAction) this.InitializationEvents.Invoke();
  }

  CustomPlayFeedback() {
    if (this.Active && this.PlayEvents instanceof EventAction) this.PlayEvents.Invoke();
  }

  CustomStopFeedback() {
    if (this.Active && this.StopEvents instanceof EventAction) this.StopEvents.Invoke();
  }

  CustomReset() {
    if (this.Active && this.ResetEvents instanceof EventAction) this.ResetEvents.Invoke();
  }
}

export class MMFeedbackSquashAndStretch extends MMFeedback {
  constructor() {
    super();
    this.Mode = 0;
    this.Axis = 3;
    this.TimeScale = 0;
    this.AnimateScaleDuration = 0.2;
    this.RemapCurveZero = 1;
    this.RemapCurveOne = 2;
    this.Offset = 0;
    this.DestinationScale = 2;
  }

  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.AnimateScaleDuration);
  }

  CustomInitialization() {
    if (this.Active && this.SquashAndStretchTarget) this._initialScale = this.SquashAndStretchTarget.localScale;
  }

  axisScale() {
    const s = this.SquashAndStretchTarget.localScale;
    return this.Axis <= 2 ? s.x : this.Axis <= 5 ? s.y : s.z;
  }

  applyScale(v) {
    const inv = 1 / Math.sqrt(v);
    const i = this._initialScale;
    const n = new THREE.Vector3(i.x, i.y, i.z);
    switch (this.Axis) {
      case 0:
        n.set(v, inv, inv);
        break;
      case 1:
        n.set(v, inv, i.z);
        break;
      case 2:
        n.set(v, i.y, inv);
        break;
      case 3:
        n.set(inv, v, inv);
        break;
      case 4:
        n.set(inv, v, i.z);
        break;
      case 5:
        n.set(v, i.y, inv);
        break;
      case 6:
        n.set(inv, inv, v);
        break;
      case 7:
        n.set(inv, i.y, v);
        break;
      case 8:
        n.set(i.x, inv, v);
        break;
      default:
    }
    return n;
  }

  dt() {
    return this.TimeScale === 0 ? this.FeedbackDeltaTime : Time.unscaledDeltaTime;
  }

  CustomPlayFeedback(position, intensity = 1) {
    const t = this.SquashAndStretchTarget;
    if (!this.Active || !t) return;
    if (this.DetermineScaleOnPlay && this.NormalPlayDirection) this._initialScale = t.localScale;
    const axis0 = this.axisScale();
    const k = this.timing.ConstantIntensity ? 1 : intensity;
    if (!this.AllowAdditivePlays && this._co) return;
    const curve = AnimationCurve.from(this.AnimateCurve);
    const self = this;
    const d = this.FeedbackDuration;
    if (!d) return;
    this._co = this.StartCoroutine((function* () {
      self._initialScale = t.localScale;
      self.IsPlaying = true;
      let j = self.NormalPlayDirection ? 0 : d;
      const value = (p) => {
        if (self.Mode === 2) return remap(Mathf.LerpUnclamped(axis0, self.DestinationScale, curve.Evaluate(p) + self.Offset), 0, 1, self.RemapCurveZero, self.RemapCurveOne);
        let v = remap(curve.Evaluate(p) + self.Offset, 0, 1, self.RemapCurveZero * k, self.RemapCurveOne * k);
        if (self.Mode === 1) v += axis0;
        return v;
      };
      while (j >= 0 && j <= d) {
        t.localScale = self.applyScale(value(Mathf.Clamp01(j / d)));
        j += self.NormalPlayDirection ? self.dt() : -self.dt();
        yield null;
      }
      t.localScale = self.Mode === 2 ? (self.NormalPlayDirection ? self.applyScale(self.DestinationScale) : self._initialScale) : self.applyScale(value(self.FinalNormalizedTime));
      self._co = null;
      self.IsPlaying = false;
    })());
  }

  CustomStopFeedback() {
    if (this._co) this.StopCoroutine(this._co);
    this._co = null;
    this.IsPlaying = false;
  }
}

for (const [cls, name] of [
  [MMFeedbackImageAlpha, 'MMFeedbackImageAlpha'],
  [MMFeedbackImage, 'MMFeedbackImage'],
  [MMFeedbackTMPAlpha, 'MMFeedbackTMPAlpha'],
  [MMFeedbackTMPColor, 'MMFeedbackTMPColor'],
  [MMFeedbackCanvasGroup, 'MMFeedbackCanvasGroup'],
  [MMFeedbackEvents, 'MMFeedbackEvents'],
  [MMFeedbackSquashAndStretch, 'MMFeedbackSquashAndStretch'],
])
  registerComponent(cls, name);
