// MMF_Player (MoreMountains "MMF" feedbacks): the [SerializeReference] FeedbacksList is rebuilt with the
// MMFeedback* ports (same fields; MMTweenType curves are wrapped as AnimationCurves).
import { EventAction } from '../engine/core.js';
import { registerComponent } from '../engine/instantiate.js';
import { AnimationCurve } from '../engine/math.js';
import { MMFeedbacks, MMFeedbackPosition, MMFeedbackScale, MMFeedbackSetActive, MMFeedbackParticles, MMFeedbackHoldingPause, MMFeedbackPause, MMFeedback } from '../game/mmfeedbacks.js';
import { MMFeedbackCanvasGroup, MMFeedbackImage, MMFeedbackImageAlpha, MMFeedbackTMPAlpha, MMFeedbackTMPColor, mmEvaluate } from '../ugui/feedbacks.js';

/** MMTweenType seen through the AnimationCurve API (MMFeedback ports evaluate curves) */
class TweenCurve extends AnimationCurve {
  constructor(tt) {
    super([]);
    this.tt = tt;
  }

  Evaluate(t) {
    return mmEvaluate(this.tt, t);
  }
}

const tc = (tt) => (tt ? new TweenCurve(tt) : undefined);

class MMF_Animation extends MMFeedback {
  CustomPlayFeedback() {
    const a = this.BoundAnimator;
    if (!this.Active || !a) return;
    if (this.UpdateTrigger) a.SetTrigger?.(this.TriggerParameterName);
    if (this.UpdateBool) a.SetBool?.(this.BoolParameterName, !!this.BoolParameterValue);
  }
}

const MMF_TYPES = {
  MMF_Position: [MMFeedbackPosition, (f) => {
    f.AnimatePositionCurve = tc(f.AnimatePositionTween);
    f.AnimatePositionCurveX = tc(f.AnimatePositionTweenX);
    f.AnimatePositionCurveY = tc(f.AnimatePositionTweenY);
    f.AnimatePositionCurveZ = tc(f.AnimatePositionTweenZ);
  }],
  MMF_Scale: [MMFeedbackScale, (f) => {
    f.AnimateScaleX = tc(f.AnimateScaleTweenX);
    f.AnimateScaleY = tc(f.AnimateScaleTweenY);
    f.AnimateScaleZ = tc(f.AnimateScaleTweenZ);
  }],
  MMF_CanvasGroup: [MMFeedbackCanvasGroup],
  MMF_SetActive: [MMFeedbackSetActive],
  MMF_Particles: [MMFeedbackParticles],
  MMF_HoldingPause: [MMFeedbackHoldingPause],
  MMF_Pause: [MMFeedbackPause],
  MMF_Image: [MMFeedbackImage],
  MMF_ImageAlpha: [MMFeedbackImageAlpha],
  MMF_TMPAlpha: [MMFeedbackTMPAlpha],
  MMF_TMPColor: [MMFeedbackTMPColor],
  MMF_Animation: [MMF_Animation],
};

export class MMF_Player extends MMFeedbacks {
  static typeName = 'MMF_Player';

  constructor() {
    super();
    this.Events = { OnPlay: new EventAction(), OnComplete: new EventAction(), OnPause: new EventAction(), OnResume: new EventAction(), OnRevert: new EventAction() };
    this._wasPlaying = false;
  }

  OnDeserialize() {
    const refs = this.references?.RefIds || this._data?.references?.RefIds || [];
    const list = [];
    for (const r of this.FeedbacksList || []) {
      const entry = refs.find((x) => x.rid === r?.rid);
      const spec = MMF_TYPES[entry?.type?.class];
      if (!spec) {
        if (entry?.type?.class) console.warn('MMF_Player: unsupported', entry.type.class);
        continue;
      }
      const [Cls, adapt] = spec;
      const f = new Cls();
      Object.assign(f, entry.data || {});
      adapt?.(f);
      // lives on the player's GameObject like a component (coroutines, timing through the host)
      f.gameObject = this.gameObject;
      f._host = this;
      f._typeName = entry.type.class;
      list.push(f);
    }
    this.Feedbacks = list;
    // the serialized Events struct replaced the field: rebuild it with its UnityEvents
    const ev = this._data?.Events || {};
    this.Events = {};
    for (const k of ['OnPlay', 'OnComplete', 'OnPause', 'OnResume', 'OnRevert']) this.Events[k] = ev[k] instanceof EventAction ? ev[k] : new EventAction();
  }

  PlayFeedbacks(...a) {
    super.PlayFeedbacks(...a);
    if (this.IsPlaying) {
      this._wasPlaying = true;
      this.Events.OnPlay.Invoke();
    }
  }

  Update() {
    if (this._wasPlaying && !this.IsPlaying) {
      this._wasPlaying = false;
      this.Events.OnComplete.Invoke();
    }
  }

  OnDisable() {
    if (this.ForceStopFeedbacksOnDisable && this.IsPlaying) this.StopFeedbacks();
  }

  GetFeedbackOfType(name) {
    return this.Feedbacks.find((f) => f._typeName === name) || null;
  }
}

registerComponent(MMF_Player);
