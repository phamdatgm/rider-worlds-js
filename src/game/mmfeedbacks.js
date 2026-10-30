// MoreMountains Feedbacks (MMFeedbacks player + the feedback types used by the gameplay prefabs).
import * as THREE from 'three';
import { MonoBehaviour, Destroy, DestroyImmediate } from '../engine/scene.js';
import { Time, WaitForSeconds, WaitForSecondsRealtime, WaitForFixedUpdate, WaitWhile, EventAction } from '../engine/core.js';
import { Mathf, AnimationCurve, quatZ, unityEuler, eulerZ } from '../engine/math.js';
import { Instantiate, registerComponent } from '../engine/instantiate.js';

const curve = (c, def) => (c instanceof AnimationCurve ? c : def || AnimationCurve.Linear(0, 0, 1, 1));
/** Unity Vector3 field -> our mirrored space */
const u3 = (a) => (Array.isArray(a) ? new THREE.Vector3(a[0] || 0, a[1] || 0, -(a[2] || 0)) : a ? a.clone() : new THREE.Vector3());
const screenKey = () => `${window.innerWidth}x${window.innerHeight}`;
/** the top rect of a UI element gets the screen size from UISystem.layout: before that its world positions are 0 */
const uiLaidOut = (t) => {
  let root = t;
  for (let p = t.parent; p?.isRectTransform; p = p.parent) root = p;
  return !!root._driven;
};
const remap = (x, a, b, c, d) => c + ((x - a) * (d - c)) / (b - a);

/** Global feedback events (camera shake, flash, freeze frame) the camera/HUD listen to. */
export const FeedbackEvents = {
  cameraShake: new EventAction(), // (duration, amplitude, frequency)
  flash: new EventAction(), // (color, duration, alpha)
  freezeFrame: new EventAction(), // (duration)
  effect: new EventAction(), // (id, data)
};

// ---------------------------------------------------------------- base feedback

export class MMFeedback extends MonoBehaviour {
  constructor() {
    super();
    this.Active = 1;
    this.Label = 'MMFeedback';
    this.Chance = 100;
    this.Timing = {};
    this._initialized = false;
    this._lastPlayTimestamp = -1;
    this._playsLeft = 1;
    this.IsPlaying = false;
  }

  get timing() {
    const t = this.Timing || {};
    return {
      TimescaleMode: t.TimescaleMode ?? 0,
      ExcludeFromHoldingPauses: !!t.ExcludeFromHoldingPauses,
      ContributeToTotalDuration: t.ContributeToTotalDuration !== 0,
      InitialDelay: t.InitialDelay || 0,
      CooldownDuration: t.CooldownDuration || 0,
      NumberOfRepeats: t.NumberOfRepeats || 0,
      RepeatForever: !!t.RepeatForever,
      DelayBetweenRepeats: t.DelayBetweenRepeats ?? 1,
      PlayDirection: t.PlayDirection || 0,
      MMFeedbacksDirectionCondition: t.MMFeedbacksDirectionCondition || 0,
      ConstantIntensity: !!t.ConstantIntensity,
    };
  }

  get host() {
    return this._host || (this._host = this.GetComponent(MMFeedbacks));
  }

  get FeedbackTime() {
    return this.timing.TimescaleMode === 0 ? Time.time : Time.unscaledTime;
  }

  get FeedbackDeltaTime() {
    return this.timing.TimescaleMode === 0 ? Time.deltaTime : Time.unscaledDeltaTime;
  }

  ApplyTimeMultiplier(d) {
    return d * (this.host?.DurationMultiplier ?? 1);
  }

  get FeedbackDuration() {
    return 0;
  }

  get TotalDuration() {
    const t = this.timing;
    if (!t.ContributeToTotalDuration) return 0;
    let total = 0;
    if (t.InitialDelay) total += this.ApplyTimeMultiplier(t.InitialDelay);
    total += this.FeedbackDuration;
    if (t.NumberOfRepeats > 0) total += t.NumberOfRepeats * this.FeedbackDuration + t.NumberOfRepeats * this.ApplyTimeMultiplier(t.DelayBetweenRepeats);
    return total;
  }

  get InCooldown() {
    const cd = this.timing.CooldownDuration;
    return cd > 0 && this.FeedbackTime - this._lastPlayTimestamp < cd;
  }

  get Pause() {
    return null;
  }

  get HoldingPause() {
    return false;
  }

  get ScriptDrivenPause() {
    return !!this._scriptDrivenPause;
  }

  set ScriptDrivenPause(v) {
    this._scriptDrivenPause = v;
  }

  get NormalPlayDirection() {
    switch (this.timing.PlayDirection) {
      case 0:
        return (this.host?.Direction ?? 0) === 0;
      case 1:
        return (this.host?.Direction ?? 0) === 1;
      case 2:
        return true;
      case 3:
        return false;
      default:
        return true;
    }
  }

  get ShouldPlayInThisSequenceDirection() {
    switch (this.timing.MMFeedbacksDirectionCondition) {
      case 1:
        return (this.host?.Direction ?? 0) === 0;
      case 2:
        return (this.host?.Direction ?? 0) === 1;
      default:
        return true;
    }
  }

  get FinalNormalizedTime() {
    return this.NormalPlayDirection ? 1 : 0;
  }

  Initialization(owner) {
    this._initialized = true;
    this.Owner = owner;
    this._playsLeft = this.timing.NumberOfRepeats + 1;
    this.CustomInitialization(owner);
  }

  CustomInitialization() {}

  CustomPlayFeedback() {}

  CustomStopFeedback() {}

  CustomReset() {}

  Play(position, intensity = 1) {
    if (!this.Active) return;
    if (!this._initialized) this.Initialization(this.gameObject);
    if (this.InCooldown) return;
    const t = this.timing;
    if (t.InitialDelay > 0) {
      const self = this;
      this._playCo = this.StartCoroutine((function* () {
        yield t.TimescaleMode === 0 ? new WaitForSeconds(t.InitialDelay) : new WaitForSecondsRealtime(t.InitialDelay);
        self._lastPlayTimestamp = self.FeedbackTime;
        self.RegularPlay(position, intensity);
      })());
    } else {
      this._lastPlayTimestamp = this.FeedbackTime;
      this.RegularPlay(position, intensity);
    }
  }

  RegularPlay(position, intensity) {
    if (this.Chance === 0) return;
    if (this.Chance !== 100 && Math.random() * 100 > this.Chance) return;
    const t = this.timing;
    const self = this;
    if (t.RepeatForever) {
      this._repeatCo = this.StartCoroutine((function* () {
        for (;;) {
          self._lastPlayTimestamp = self.FeedbackTime;
          self.CustomPlayFeedback(position, intensity);
          yield new WaitForSeconds(t.DelayBetweenRepeats);
        }
      })());
      return;
    }
    if (t.NumberOfRepeats > 0) {
      this._repeatCo = this.StartCoroutine((function* () {
        while (self._playsLeft > 0) {
          self._lastPlayTimestamp = self.FeedbackTime;
          self._playsLeft--;
          self.CustomPlayFeedback(position, intensity);
          yield new WaitForSeconds(t.DelayBetweenRepeats);
        }
        self._playsLeft = t.NumberOfRepeats + 1;
      })());
      return;
    }
    this.CustomPlayFeedback(position, intensity);
  }

  Stop(position, intensity = 1) {
    if (this._playCo) this.StopCoroutine(this._playCo);
    if (this._repeatCo) this.StopCoroutine(this._repeatCo);
    this._lastPlayTimestamp = 0;
    this._playsLeft = this.timing.NumberOfRepeats + 1;
    if (this.timing.InterruptsOnStop !== 0) this.CustomStopFeedback(position, intensity);
  }

  ResetFeedback() {
    this._playsLeft = this.timing.NumberOfRepeats + 1;
    this.CustomReset();
  }
}

// ---------------------------------------------------------------- MMFeedbacks player

export class MMFeedbacks extends MonoBehaviour {
  constructor() {
    super();
    this.Feedbacks = [];
    this.InitializationMode = 2;
    this.Direction = 0;
    this.AutoPlayOnStart = 0;
    this.AutoPlayOnEnable = 0;
    this.DurationMultiplier = 1;
    this.CooldownDuration = 0;
    this.InitialDelay = 0;
    this.CanPlay = 1;
    this.CanPlayWhileAlreadyPlaying = 1;
    this.ChanceToPlay = 100;
    this.FeedbacksIntensity = 1;
    this.PlayerTimescaleMode = 1;
    this.IsPlaying = false;
    this._lastStartAt = -Infinity;
    this._initialized = false;
  }

  get list() {
    return (this.Feedbacks || []).filter(Boolean);
  }

  GetTime() {
    return this.PlayerTimescaleMode === 0 ? Time.time : Time.unscaledTime;
  }

  get TotalDuration() {
    let total = 0;
    for (const f of this.list) if (f.Active && f.TotalDuration > total) total = f.TotalDuration;
    return total + (this.InitialDelay || 0);
  }

  Awake() {
    if (this.InitializationMode === 1) this.Initialization(this.gameObject);
  }

  Start() {
    if (this.InitializationMode === 2) this.Initialization(this.gameObject);
    // AutoPlayOnEnable also covers the first enable (Unity's MMFeedbacksEnabler)
    if (this.AutoPlayOnStart || this.AutoPlayOnEnable) this.PlayFeedbacks();
  }

  OnEnable() {
    if (this.AutoPlayOnEnable && this._started) this.PlayFeedbacks();
  }

  Initialization(owner = this.gameObject) {
    this._initialized = true;
    this.IsPlaying = false;
    this._lastStartAt = -Infinity;
    for (const f of this.list) f.Initialization(owner);
  }

  PlayFeedbacks(position = null, intensity = this.FeedbacksIntensity) {
    if (!this.CanPlay) return;
    if (this.IsPlaying && !this.CanPlayWhileAlreadyPlaying) return;
    if (this.ChanceToPlay === 0 || (this.ChanceToPlay !== 100 && Math.random() * 100 > this.ChanceToPlay)) return;
    if (this.CooldownDuration > 0 && this.GetTime() - this._lastStartAt < this.CooldownDuration) return;
    if (!this.gameObject.activeInHierarchy) return;
    if (!this._initialized) this.Initialization(this.gameObject);
    position = position || this.transform.position;
    this.ResetFeedbacks();
    this.IsPlaying = true;
    this._startTime = this.GetTime();
    this._lastStartAt = this._startTime;
    this._totalDuration = this.TotalDuration;
    if (this._seqCo) this.StopCoroutine(this._seqCo);
    const self = this;
    if (this.InitialDelay > 0) {
      this._seqCo = this.StartCoroutine((function* () {
        yield new WaitForSecondsRealtime(self.InitialDelay);
        yield* self._prepare(position, intensity);
      })());
    } else {
      this._seqCo = this.StartCoroutine(this._prepare(position, intensity));
    }
  }

  *_prepare(position, intensity) {
    this._holdingMax = 0;
    const pauseFound = this.list.some((f) => f.Active && f.ShouldPlayInThisSequenceDirection && (f.Pause !== null || f.HoldingPause));
    if (!pauseFound) {
      for (const f of this.list) if (this._canPlay(f)) f.Play(position, intensity);
      // wait for total duration, then wait for still playing feedbacks
      const end = this.GetTime() + this._totalDuration;
      while (this.GetTime() < end) yield null;
      while (this.list.some((f) => f.IsPlaying)) yield null;
      this.IsPlaying = false;
      return;
    }
    const list = this.list;
    let i = this.Direction === 0 ? 0 : list.length - 1;
    while (i >= 0 && i < list.length) {
      if (!this.IsPlaying) return;
      const f = list[i];
      if (f.Active && f.ScriptDrivenPause) {
        this.InScriptDrivenPause = true;
        const auto = f.ScriptDrivenPauseAutoResume > 0;
        const t0 = this.GetTime();
        while (this.InScriptDrivenPause) {
          if (auto && this.GetTime() - t0 > f.ScriptDrivenPauseAutoResume) this.InScriptDrivenPause = false;
          yield null;
        }
      }
      if (f.Active && f.HoldingPause && f.ShouldPlayInThisSequenceDirection) {
        while (this.GetTime() - this._lastStartAt < this._holdingMax) yield null;
        this._holdingMax = 0;
        this._lastStartAt = this.GetTime();
      }
      if (this._canPlay(f)) f.Play(position, intensity);
      const pause = f.Active && f.ShouldPlayInThisSequenceDirection ? f.Pause : null;
      if (pause) {
        yield pause;
        this._lastStartAt = this.GetTime();
        this._holdingMax = 0;
      }
      if (f.Active && f.Pause === null && f.ShouldPlayInThisSequenceDirection && !f.timing.ExcludeFromHoldingPauses) {
        this._holdingMax = Math.max(f.TotalDuration, this._holdingMax);
      }
      i += this.Direction === 0 ? 1 : -1;
    }
    const tEnd = this.GetTime();
    while (this.GetTime() - tEnd < this._holdingMax) yield null;
    while (this.list.some((f) => f.IsPlaying)) yield null;
    this.IsPlaying = false;
  }

  _canPlay(f) {
    return f && f.Active && f.ShouldPlayInThisSequenceDirection;
  }

  StopFeedbacks(stopAll = true) {
    if (stopAll) for (const f of this.list) f.Stop(this.transform.position);
    this.IsPlaying = false;
    if (this._seqCo) this.StopCoroutine(this._seqCo);
    this._seqCo = null;
  }

  ResetFeedbacks() {
    for (const f of this.list) if (f.Active) f.ResetFeedback();
    this.IsPlaying = false;
  }

  PauseFeedbacks() {
    this.InScriptDrivenPause = true;
  }

  ResumeFeedbacks() {
    this.InScriptDrivenPause = false;
  }
}

// ---------------------------------------------------------------- feedback types

export class MMFeedbackPause extends MMFeedback {
  constructor() {
    super();
    this.PauseDuration = 1;
  }

  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.PauseDuration);
  }

  get Pause() {
    return this.timing.TimescaleMode === 0 ? new WaitForSeconds(this.PauseDuration) : new WaitForSecondsRealtime(this.PauseDuration);
  }

  CustomInitialization() {
    this.ScriptDrivenPause = !!this.ScriptDriven;
    this.ScriptDrivenPauseAutoResume = this.AutoResume ? this.AutoResumeAfter : -1;
    if (this.RandomizePauseDuration) this.PauseDuration = Mathf.Lerp(this.MinPauseDuration, this.MaxPauseDuration, Math.random());
  }
}

export class MMFeedbackHoldingPause extends MMFeedbackPause {
  get HoldingPause() {
    return true;
  }
}

export class MMFeedbackAwaitTrigger extends MMFeedback {
  constructor() {
    super();
    this.trigger = null;
    this.isAwaitingTrigger = false;
  }

  get IsPlaying() {
    return this.isAwaitingTrigger;
  }

  set IsPlaying(v) {}

  get FeedbackDuration() {
    return 1;
  }

  get Pause() {
    return new WaitWhile(() => this.isAwaitingTrigger);
  }

  CustomInitialization() {
    this.ScriptDrivenPause = false;
    this.ScriptDrivenPauseAutoResume = -1;
    this.isAwaitingTrigger = true;
  }

  CustomPlayFeedback() {
    if (this.Active) this.isAwaitingTrigger = true;
  }

  CustomReset() {
    this.isAwaitingTrigger = false;
  }

  HandleTrigger(caller) {
    if (this.isAwaitingTrigger && (!this.trigger || caller === this.trigger)) this.isAwaitingTrigger = false;
  }
}

/** Rider/Road Rotate: rotates a (kinematic) Rigidbody2D in FixedUpdate steps. */
export class MMFeedbackRoadRotate extends MMFeedback {
  constructor() {
    super();
    this.target = null;
    this.rotation = 0;
    this.animationLength = 1;
    this.lerpCurve = null;
    this.AllowAdditivePlays = 0;
    this.DetermineRotationsOnPlay = 0;
    this.routine = null;
    this.autoResetTime = 0;
  }

  get InCooldown() {
    return this.routine !== null && !this.routine.done;
  }

  get FeedbackDuration() {
    return this.animationLength + Math.max(this.autoResetTime, 0);
  }

  CustomInitialization() {
    if (this.Active && this.target && !this.DetermineRotationsOnPlay) this.DetermineRotations();
  }

  DetermineRotations() {
    this.startRotation = this.target.rotation;
    this.endRotation = this.startRotation + this.rotation;
  }

  CustomPlayFeedback() {
    if (!this.Active || (!this.AllowAdditivePlays && this.InCooldown) || !this.target) return;
    if (this.DetermineRotationsOnPlay) this.DetermineRotations();
    this.StartAnimation();
  }

  ResetFeedback() {
    this.ResetAnimation();
    super.ResetFeedback();
  }

  StartAnimation() {
    if (this.routine) this.StopCoroutine(this.routine);
    this.routine = this.StartCoroutine(this.RotateElement());
  }

  *RotateElement() {
    yield* this.LerpRotation(this.startRotation, this.endRotation);
    if (this.autoResetTime > 0) {
      yield new WaitForSeconds(this.autoResetTime);
      yield* this.LerpRotation(this.endRotation, this.startRotation);
    }
    this.routine = null;
  }

  *LerpRotation(start, end) {
    let progress = 0;
    const c = curve(this.lerpCurve);
    if (this.animationLength > 0.03) yield WaitForFixedUpdate;
    while (progress < 1) {
      progress = Math.min(progress + Time.fixedDeltaTime * (1 / this.animationLength), 1);
      this.target.SetRotation(Mathf.Lerp(start, end, c.Evaluate(progress)));
      yield WaitForFixedUpdate;
    }
  }

  ResetAnimation() {
    if (this.routine) {
      this.StopCoroutine(this.routine);
      this.routine = null;
    }
    if (!this.DetermineRotationsOnPlay && this.target && this.startRotation !== undefined) this.target.SetRotation(this.startRotation);
  }

  OnDestroy() {
    this.routine = null;
  }
}

/** Rider/Road Position Move */
export class MMFeedbackRoadPosition extends MMFeedback {
  constructor() {
    super();
    this.target = null;
    this.moveTarget = null;
    this.movement = [1, 1];
    this.animationLength = 1;
    this.lerpCurve = null;
    this.AllowAdditivePlays = 0;
    this.DeterminePositionsOnPlay = 0;
    this.routine = null;
    this.autoResetTime = 0;
  }

  get InCooldown() {
    return this.routine !== null && !this.routine.done;
  }

  get FeedbackDuration() {
    return this.animationLength + Math.max(this.autoResetTime, 0);
  }

  CustomInitialization() {
    if (this.Active && this.target && !this.DeterminePositionsOnPlay) this.DeterminePositions();
  }

  DeterminePositions() {
    const tp = this.target.position;
    let mv = new THREE.Vector2(this.movement[0] ?? this.movement.x, this.movement[1] ?? this.movement.y);
    if (this.moveTarget) {
      const p = this.moveTarget.position;
      mv = new THREE.Vector2(p.x - tp.x, p.y - tp.y);
    }
    this.startPosition = tp.clone();
    this.endPosition = tp.clone().add(mv);
  }

  CustomPlayFeedback() {
    if (!this.Active || (!this.AllowAdditivePlays && this.InCooldown) || !this.target) return;
    if (this.DeterminePositionsOnPlay) this.DeterminePositions();
    this.StartAnimation();
  }

  ResetFeedback() {
    this.ResetAnimation();
    super.ResetFeedback();
  }

  StartAnimation() {
    if (this.routine) this.StopCoroutine(this.routine);
    this.routine = this.StartCoroutine(this.MoveElement());
  }

  *MoveElement() {
    yield* this.LerpPosition(this.startPosition, this.endPosition);
    if (this.autoResetTime > 0) {
      yield new WaitForSeconds(this.autoResetTime);
      yield* this.LerpPosition(this.endPosition, this.startPosition);
    }
    this.routine = null;
  }

  *LerpPosition(start, end) {
    this.target.MovePosition(start);
    let progress = 0;
    const c = curve(this.lerpCurve);
    if (this.animationLength > 0.03) yield WaitForFixedUpdate;
    while (progress < 1) {
      progress = Math.min(progress + Time.fixedDeltaTime * (1 / this.animationLength), 1);
      const t = Mathf.Clamp01(c.Evaluate(progress));
      this.target.MovePosition(new THREE.Vector2(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t));
      yield WaitForFixedUpdate;
    }
  }

  ResetAnimation() {
    if (this.routine) {
      this.StopCoroutine(this.routine);
      this.routine = null;
    }
    if (!this.DeterminePositionsOnPlay && this.target && this.startPosition) this.target.MovePosition(this.startPosition);
  }
}

export class MMFeedbackPosition extends MMFeedback {
  constructor() {
    super();
    this.AnimatePositionTarget = null;
    this.Mode = 0;
    this.TimeScale = 0;
    this.Space = 0;
    this.AnimatePositionDuration = 0.2;
    this.RemapCurveZero = 0;
    this.RemapCurveOne = 1;
    this.RelativePosition = 1;
    this.DeterminePositionsOnPlay = 0;
    this._co = null;
  }

  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.AnimatePositionDuration);
  }

  dt() {
    return this.TimeScale === 0 ? this.FeedbackDeltaTime : Time.unscaledDeltaTime;
  }

  CustomInitialization() {
    if (!this.Active || !this.AnimatePositionTarget) return;
    this._initPos = u3(this.InitialPosition);
    this._destPos = u3(this.DestinationPosition);
    if (!this.DeterminePositionsOnPlay) this.DeterminePositions();
  }

  // Spaces: World 0, Local 1, RectTransform 2 (anchoredPosition of the animated target), Self 3
  GetPosition(t) {
    if (this.Space === 0) return t.position;
    if (this.Space === 1) return t.localPosition;
    if (this.Space === 2) {
      const a = t.anchoredPosition;
      return a ? new THREE.Vector3(a.x, a.y, 0) : new THREE.Vector3();
    }
    return new THREE.Vector3();
  }

  SetPosition(t, p) {
    if (this.Space === 0) t.position = p;
    else if (this.Space === 1) t.localPosition = p;
    else if (this.Space === 2) {
      const rt = this.AnimatePositionTarget?.transform;
      if (rt?.isRectTransform) rt.anchoredPosition = new THREE.Vector2(p.x, p.y);
    }
  }

  DeterminePositions() {
    if (this.DeterminePositionsOnPlay && this.RelativePosition && this._initPos.lengthSq() > 0) return;
    if (this.Mode === 2) return;
    const tgt = this.AnimatePositionTarget.transform;
    // world positions of UI elements are screen pixels: remember the screen size and the target's resting layout
    // so a resized window (never happens on the mobile original) can re-determine them on the next play
    if (this.Space === 0 && tgt.isRectTransform) {
      // feedbacks initialized on Awake of a fresh menu run before its first layout: determined again on play
      this._screenKey = uiLaidOut(tgt) ? screenKey() : 'not laid out';
      this._restAnchored ??= tgt.anchoredPosition.clone();
    }
    if (this.InitialPositionTransform) this.InitialPositionV = this.GetPosition(this.InitialPositionTransform);
    else this.InitialPositionV = this.RelativePosition ? this.GetPosition(tgt).add(this._initPos) : this.GetPosition(tgt);
    if (this.DestinationPositionTransform) this.DestinationPositionV = this.GetPosition(this.DestinationPositionTransform);
    else this.DestinationPositionV = this.RelativePosition ? this.GetPosition(tgt).add(this._destPos) : this._destPos.clone();
  }

  CustomPlayFeedback(position, intensity = 1) {
    if (!this.Active || !this.AnimatePositionTarget) return;
    if (this.DeterminePositionsOnPlay && this.NormalPlayDirection) this.DeterminePositions();
    else if (this._screenKey && this._screenKey !== screenKey() && !(this._co && !this._co.done)) {
      // the window was resized since the positions were taken: put the target back in its layout slot first
      this.AnimatePositionTarget.transform.anchoredPosition = this._restAnchored.clone();
      this.DeterminePositions();
    }
    const tgt = this.AnimatePositionTarget;
    if (this.Mode === 2) {
      const a = this.GetPosition(tgt.transform);
      let b = this.RelativePosition ? a.clone().add(this._destPos) : this._destPos.clone();
      if (this.DestinationPositionTransform) b = this.GetPosition(this.DestinationPositionTransform);
      this._co = this.StartCoroutine(this.MoveFromTo(tgt, a, b, this.FeedbackDuration, curve(this.AnimatePositionCurve)));
    } else if (this.Mode === 0) {
      if (!this.AllowAdditivePlays && this._co && !this._co.done) return;
      this._co = this.StartCoroutine(this.MoveFromTo(tgt, this.InitialPositionV, this.DestinationPositionV, this.FeedbackDuration, curve(this.AnimatePositionCurve)));
    } else {
      if (!this.AllowAdditivePlays && this._co && !this._co.done) return;
      const k = this.timing.ConstantIntensity ? 1 : intensity;
      this._co = this.StartCoroutine(this.MoveAlongCurve(tgt, this.InitialPositionV, this.FeedbackDuration, k));
    }
  }

  ComputeNewCurvePosition(obj, initial, percent, k) {
    const vx = remap(curve(this.AnimatePositionCurveX).Evaluate(percent), 0, 1, this.RemapCurveZero * k, this.RemapCurveOne * k);
    const vy = remap(curve(this.AnimatePositionCurveY).Evaluate(percent), 0, 1, this.RemapCurveZero * k, this.RemapCurveOne * k);
    const vz = -remap(curve(this.AnimatePositionCurveZ).Evaluate(percent), 0, 1, this.RemapCurveZero * k, this.RemapCurveOne * k);
    const p = initial.clone();
    if (this.RelativePosition) {
      if (this.AnimateX) p.x = initial.x + vx;
      if (this.AnimateY) p.y = initial.y + vy;
      if (this.AnimateZ) p.z = initial.z + vz;
    } else {
      if (this.AnimateX) p.x = vx;
      if (this.AnimateY) p.y = vy;
      if (this.AnimateZ) p.z = vz;
    }
    this.SetPosition(obj.transform, p);
  }

  *MoveAlongCurve(obj, initial, duration, k) {
    this.IsPlaying = true;
    let j = this.NormalPlayDirection ? 0 : duration;
    while (j >= 0 && j <= duration && duration > 0) {
      this.ComputeNewCurvePosition(obj, initial, Mathf.Clamp01(j / duration), k);
      j += this.NormalPlayDirection ? this.dt() : -this.dt();
      yield null;
    }
    this.ComputeNewCurvePosition(obj, initial, this.FinalNormalizedTime, k);
    this._co = null;
    this.IsPlaying = false;
  }

  *MoveFromTo(obj, a, b, duration, c) {
    this.IsPlaying = true;
    let j = this.NormalPlayDirection ? 0 : duration;
    while (j >= 0 && j <= duration && duration > 0) {
      const t = c.Evaluate(Mathf.Clamp01(j / duration));
      this.SetPosition(obj.transform, a.clone().lerp(b, t));
      j += this.NormalPlayDirection ? this.dt() : -this.dt();
      yield null;
    }
    this.SetPosition(obj.transform, this.NormalPlayDirection ? b : a);
    this._co = null;
    this.IsPlaying = false;
  }

  CustomStopFeedback() {
    if (this._co) {
      this.IsPlaying = false;
      this.StopCoroutine(this._co);
      this._co = null;
    }
  }

  OnDisable() {
    this._co = null;
  }
}

/** Rigidbody/PhysicsPosition: like MMFeedbackPosition but moves through Rigidbody2D.MovePosition in fixed steps. */
export class MMFeedbackPhysicsPosition extends MMFeedbackPosition {
  CustomInitialization(owner) {
    if (this.Active && this.AnimatePositionTarget) this.rb2D = this.AnimatePositionTarget.GetComponent('Rigidbody2D');
    super.CustomInitialization(owner);
  }

  GetPosition(t) {
    if (t.gameObject === this.AnimatePositionTarget && this.rb2D) {
      const p = this.rb2D.position;
      return new THREE.Vector3(p.x, p.y, t.position.z);
    }
    return super.GetPosition(t);
  }

  SetPosition(t, p) {
    if (t.gameObject === this.AnimatePositionTarget && this.rb2D) this.rb2D.MovePosition(p);
    else super.SetPosition(t, p);
  }

  *MoveAlongCurve(obj, initial, duration, k) {
    yield WaitForFixedUpdate;
    let j = this.NormalPlayDirection ? 0 : duration;
    while (j >= 0 && j <= duration && duration > 0) {
      this.ComputeNewCurvePosition(obj, initial, Mathf.Clamp01(j / duration), k);
      j += this.NormalPlayDirection ? Time.fixedDeltaTime : -Time.fixedDeltaTime;
      yield WaitForFixedUpdate;
    }
    this.ComputeNewCurvePosition(obj, initial, this.FinalNormalizedTime, k);
    this._co = null;
  }

  *MoveFromTo(obj, a, b, duration, c) {
    yield WaitForFixedUpdate;
    let j = this.NormalPlayDirection ? 0 : duration;
    while (j >= 0 && j <= duration && duration > 0) {
      this.SetPosition(obj.transform, a.clone().lerp(b, c.Evaluate(Mathf.Clamp01(j / duration))));
      j += this.NormalPlayDirection ? Time.fixedDeltaTime : -Time.fixedDeltaTime;
      yield WaitForFixedUpdate;
    }
    this.SetPosition(obj.transform, this.NormalPlayDirection ? b : a);
    this._co = null;
  }
}

export class MMFeedbackScale extends MMFeedback {
  constructor() {
    super();
    this.Mode = 0;
    this.TimeScale = 0;
    this.AnimateScaleTarget = null;
    this.AnimateScaleDuration = 0.2;
    this.RemapCurveZero = 1;
    this.RemapCurveOne = 2;
    this.Offset = 0;
    this.AnimateX = 1;
    this.AnimateY = 1;
    this.AnimateZ = 1;
    this._co = null;
  }

  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.AnimateScaleDuration);
  }

  dt() {
    return this.TimeScale === 0 ? this.FeedbackDeltaTime : Time.unscaledDeltaTime;
  }

  CustomInitialization() {
    if (this.Active && this.AnimateScaleTarget) this._initialScale = this.AnimateScaleTarget.localScale;
  }

  CustomPlayFeedback(position, intensity = 1) {
    if (!this.Active || !this.AnimateScaleTarget) return;
    if (this.DetermineScaleOnPlay && this.NormalPlayDirection) this._initialScale = this.AnimateScaleTarget.localScale;
    const k = this.timing.ConstantIntensity ? 1 : intensity;
    if (!this.AllowAdditivePlays && this._co && !this._co.done) return;
    if (this.Mode === 2) this._co = this.StartCoroutine(this.ScaleToDestination());
    else this._co = this.StartCoroutine(this.AnimateScale(this.AnimateScaleTarget, this.FeedbackDuration, this.RemapCurveZero * k, this.RemapCurveOne * k));
  }

  *ScaleToDestination() {
    const t = this.AnimateScaleTarget;
    const d = this.FeedbackDuration;
    if (!t || d === 0) return;
    const dest = Array.isArray(this.DestinationScale) ? new THREE.Vector3(...this.DestinationScale) : new THREE.Vector3(0.5, 0.5, 0.5);
    const init = t.localScale;
    this.IsPlaying = true;
    let j = this.NormalPlayDirection ? 0 : d;
    while (j >= 0 && j <= d) {
      const p = Mathf.Clamp01(j / d);
      const s = t.localScale;
      if (this.AnimateX) s.x = remap(Mathf.LerpUnclamped(init.x, dest.x, curve(this.AnimateScaleX).Evaluate(p) + this.Offset), 0, 1, this.RemapCurveZero, this.RemapCurveOne);
      if (this.AnimateY) s.y = remap(Mathf.LerpUnclamped(init.y, dest.y, curve(this.AnimateScaleY).Evaluate(p) + this.Offset), 0, 1, this.RemapCurveZero, this.RemapCurveOne);
      if (this.AnimateZ) s.z = remap(Mathf.LerpUnclamped(init.z, dest.z, curve(this.AnimateScaleZ).Evaluate(p) + this.Offset), 0, 1, this.RemapCurveZero, this.RemapCurveOne);
      t.localScale = s;
      j += this.NormalPlayDirection ? this.dt() : -this.dt();
      yield null;
    }
    t.localScale = this.NormalPlayDirection ? dest : init;
    this._co = null;
    this.IsPlaying = false;
  }

  _scaleAt(t, p, z0, z1) {
    const init = this._initialScale || t.localScale;
    const cur = t.localScale;
    const v = new THREE.Vector3();
    const comp = (anim, c, i, k) => {
      if (!anim) return cur[k];
      let x = remap(curve(c).Evaluate(p) + this.Offset, 0, 1, z0, z1);
      if (this.Mode === 1) x += init[k];
      return x;
    };
    v.x = comp(this.AnimateX, this.AnimateScaleX, 0, 'x');
    v.y = comp(this.AnimateY, this.AnimateScaleY, 1, 'y');
    v.z = comp(this.AnimateZ, this.AnimateScaleZ, 2, 'z');
    return v;
  }

  *AnimateScale(t, duration, z0, z1) {
    if (!t || duration === 0) return;
    this._initialScale = t.localScale;
    this.IsPlaying = true;
    let j = this.NormalPlayDirection ? 0 : duration;
    while (j >= 0 && j <= duration) {
      t.localScale = this._scaleAt(t, Mathf.Clamp01(j / duration), z0, z1);
      j += this.NormalPlayDirection ? this.dt() : -this.dt();
      yield null;
    }
    t.localScale = this._scaleAt(t, this.FinalNormalizedTime, z0, z1);
    this._co = null;
    this.IsPlaying = false;
  }

  CustomStopFeedback() {
    if (this._co) {
      this.StopCoroutine(this._co);
      this._co = null;
      this.IsPlaying = false;
    }
  }
}

export class MMFeedbackRotation extends MMFeedback {
  constructor() {
    super();
    this.AnimateRotationTarget = null;
    this.Mode = 0; // Absolute, Additive, ToDestination
    this.RotationSpace = 0;
    this.AnimateRotationDuration = 0.2;
    this.RemapCurveZero = 0;
    this.RemapCurveOne = 360;
  }

  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.AnimateRotationDuration);
  }

  CustomInitialization() {
    if (this.AnimateRotationTarget) this._initial = this.AnimateRotationTarget.localRotation;
  }

  CustomPlayFeedback() {
    if (!this.Active || !this.AnimateRotationTarget) return;
    if (this._co && !this._co.done && !this.AllowAdditivePlays) return;
    if (this.Mode === 1) this._initial = this.AnimateRotationTarget.localRotation;
    this._co = this.StartCoroutine(this.Animate());
  }

  apply(p) {
    const t = this.AnimateRotationTarget;
    const x = this.AnimateX ? remap(curve(this.AnimateRotationX).Evaluate(p), 0, 1, this.RemapCurveZero, this.RemapCurveOne) : 0;
    const y = this.AnimateY ? remap(curve(this.AnimateRotationY).Evaluate(p), 0, 1, this.RemapCurveZero, this.RemapCurveOne) : 0;
    const z = this.AnimateZ ? remap(curve(this.AnimateRotationZ).Evaluate(p), 0, 1, this.RemapCurveZero, this.RemapCurveOne) : 0;
    t.localRotation = this._initial.clone().multiply(unityEuler(x, y, z));
  }

  *Animate() {
    const d = this.FeedbackDuration;
    this.IsPlaying = true;
    let j = this.NormalPlayDirection ? 0 : d;
    while (j >= 0 && j <= d && d > 0) {
      this.apply(Mathf.Clamp01(j / d));
      j += this.NormalPlayDirection ? this.FeedbackDeltaTime : -this.FeedbackDeltaTime;
      yield null;
    }
    this.apply(this.FinalNormalizedTime);
    this.IsPlaying = false;
    this._co = null;
  }
}

/** Rigidbody/PhysicsRotation */
export class MMFeedbackPhysicsRotate extends MMFeedbackRotation {
  CustomInitialization(owner) {
    super.CustomInitialization(owner);
    this.rb2D = this.AnimateRotationTarget ? this.AnimateRotationTarget.GetComponent('Rigidbody2D') : null;
  }

  apply(p) {
    if (!this.rb2D) return super.apply(p);
    const z = this.AnimateZ ? remap(curve(this.AnimateRotationZ).Evaluate(p), 0, 1, this.RemapCurveZero, this.RemapCurveOne) : 0;
    this.rb2D.MoveRotation(eulerZ(this._initial) + z);
  }

  *Animate() {
    const d = this.FeedbackDuration;
    yield WaitForFixedUpdate;
    let j = this.NormalPlayDirection ? 0 : d;
    while (j >= 0 && j <= d && d > 0) {
      this.apply(Mathf.Clamp01(j / d));
      j += this.NormalPlayDirection ? Time.fixedDeltaTime : -Time.fixedDeltaTime;
      yield WaitForFixedUpdate;
    }
    this.apply(this.FinalNormalizedTime);
    this._co = null;
  }
}

export class MMFeedbackSetActive extends MMFeedback {
  SetStatus(state) {
    let v = false;
    if (state === 0) v = this.NormalPlayDirection;
    else if (state === 1) v = !this.NormalPlayDirection;
    else v = !this.TargetGameObject.activeInHierarchy;
    this.TargetGameObject.SetActive(v);
  }

  CustomInitialization() {
    if (this.Active && this.TargetGameObject && this.SetStateOnInit) this.SetStatus(this.StateOnInit);
  }

  CustomPlayFeedback() {
    if (this.Active && this.TargetGameObject && this.SetStateOnPlay) this.SetStatus(this.StateOnPlay);
  }

  CustomStopFeedback() {
    if (this.Active && this.TargetGameObject && this.SetStateOnStop) this.SetStatus(this.StateOnStop);
  }

  CustomReset() {
    if (this.InCooldown) return;
    if (this.Active && this.TargetGameObject && this.SetStateOnReset) this.SetStatus(this.StateOnReset);
  }
}

export class MMFeedbackDestroy extends MMFeedback {
  CustomPlayFeedback() {
    if (!this.Active || !this.TargetGameObject) return;
    if (this.Mode === 0) Destroy(this.TargetGameObject);
    else if (this.Mode === 1) DestroyImmediate(this.TargetGameObject);
    else this.TargetGameObject.SetActive(false);
  }
}

export class MMFeedbackParticles extends MMFeedback {
  CustomInitialization() {
    this.StopParticles();
  }

  CustomPlayFeedback(position) {
    if (!this.Active) return;
    const rnd = (this.RandomParticleSystems || []).filter(Boolean);
    const bound = this.BoundParticleSystem;
    if (this.MoveToPosition && position) {
      if (bound) bound.transform.position = position;
      for (const s of rnd) s.transform.position = position;
    }
    if (this.ActivateOnPlay) {
      bound?.gameObject.SetActive(true);
      for (const s of rnd) s.gameObject.SetActive(true);
    }
    const target = rnd.length ? rnd[Math.floor(Math.random() * rnd.length)] : bound;
    if (!target) return;
    if (this.Mode === 0) target.Play?.();
    else if (this.Mode === 1) target.Stop?.();
    else target.Pause?.();
  }

  CustomStopFeedback() {
    if (this.Active) this.StopParticles();
  }

  CustomReset() {
    if (!this.InCooldown) this.StopParticles();
  }

  StopParticles() {
    for (const s of this.RandomParticleSystems || []) s?.Stop?.();
    this.BoundParticleSystem?.Stop?.();
  }
}

export class MMFeedbackParticlesInstantiation extends MMFeedback {
  constructor() {
    super();
    this.Mode = 0;
    this.PositionMode = 0;
    this.NestParticles = 1;
    this.CachedRecycle = 1;
    this._inst = null;
  }

  CustomInitialization() {
    if (this.Active && this.Mode === 0) this.InstantiateParticleSystem();
  }

  InstantiateParticleSystem() {
    if (this.CachedRecycle && this._inst && !this._inst.gameObject._destroyed) {
      this.PositionParticleSystem(this._inst);
      return;
    }
    let parent = null;
    if (this.NestParticles) {
      if (this.PositionMode === 0) parent = this.transform;
      if (this.PositionMode === 1) parent = this.InstantiateParticlesPosition;
    }
    const prefabs = (this.RandomParticlePrefabs || []).filter(Boolean);
    const prefab = prefabs.length ? prefabs[Math.floor(Math.random() * prefabs.length)] : this.ParticlesPrefab;
    if (!prefab) return;
    try {
      this._inst = Instantiate(prefab, null, null, parent);
    } catch (e) {
      console.warn('particles prefab', e.message);
      this._inst = null;
      return;
    }
    this.PositionParticleSystem(this._inst);
  }

  PositionParticleSystem(sys) {
    if (!sys) return;
    if (!this.InstantiateParticlesPosition && this.Owner) this.InstantiateParticlesPosition = this.Owner.transform;
    sys.Stop?.();
    const off = u3(this.Offset);
    let pos;
    if (this.PositionMode === 1 && this.InstantiateParticlesPosition) pos = this.InstantiateParticlesPosition.position.add(off);
    else if (this.PositionMode === 2) pos = u3(this.TargetWorldPosition).add(off);
    else pos = this.transform.position.add(off);
    sys.transform.position = pos;
    if (this.ApplyRotation) sys.transform.rotation = this.transform.rotation;
    if (this.ApplyScale) sys.transform.localScale = this.transform.localScale;
    sys.Clear?.();
  }

  CustomPlayFeedback(position) {
    if (!this.Active) return;
    if (this.Mode === 1 || !this._inst || this._inst.gameObject?._destroyed) this.InstantiateParticleSystem();
    else this.PositionParticleSystem(this._inst);
    if (!this._inst) return;
    if (this.PositionMode === 3 && position) this._inst.transform.position = position.clone().add(u3(this.Offset));
    if (this.ForceSetActiveOnPlay) this._inst.gameObject.SetActive(true);
    this._inst.Play?.();
  }

  CustomStopFeedback() {
    this._inst?.Stop?.();
  }
}

export class MMFeedbackInstantiateObject extends MMFeedback {
  CustomPlayFeedback(position) {
    if (!this.Active || !this.GameObjectToInstantiate) return;
    try {
      const go = Instantiate(this.GameObjectToInstantiate);
      const off = u3(this.PositionOffset);
      const obj = go.gameObject || go;
      if (this.PositionMode === 1 && this.TargetTransform) obj.transform.position = this.TargetTransform.position.add(off);
      else if (this.PositionMode === 2) obj.transform.position = u3(this.TargetPosition).add(off);
      else if (this.PositionMode === 3 && position) obj.transform.position = position.clone().add(off);
      else obj.transform.position = this.transform.position.add(off);
      if (this.AlsoApplyRotation) obj.transform.rotation = (this.TargetTransform || this.transform).rotation;
    } catch (e) {
      console.warn('InstantiateObject', e.message);
    }
  }
}

export class MMFeedbackCameraShake extends MMFeedback {
  get props() {
    const p = this.CameraShakeProperties || {};
    return { Duration: p.Duration ?? 0.1, Amplitude: p.Amplitude ?? 0.2, Frequency: p.Frequency ?? 40 };
  }

  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.props.Duration);
  }

  CustomPlayFeedback(position, intensity = 1) {
    if (!this.Active) return;
    const k = this.timing.ConstantIntensity ? 1 : intensity;
    const p = this.props;
    FeedbackEvents.cameraShake.Raise(this.FeedbackDuration, p.Amplitude * k, p.Frequency);
  }
}

/** Cinemachine flavour used by the camera override volumes; same behaviour for us. */
export class MMFeedbackCinemachineShake extends MMFeedbackCameraShake {}

export class MMFeedbackFlash extends MMFeedback {
  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.FlashDuration ?? 0.2);
  }

  CustomPlayFeedback() {
    if (!this.Active) return;
    FeedbackEvents.flash.Raise(this.FlashColor || [1, 1, 1, 1], this.FeedbackDuration, this.FlashAlpha ?? 1, this.FlashID ?? 0, this.Channel ?? 0, this.Timing?.TimescaleMode ?? 0);
  }
}

export class MMFeedbackFreezeFrame extends MMFeedback {
  get FeedbackDuration() {
    return this.ApplyTimeMultiplier(this.FreezeFrameDuration ?? 0.02);
  }

  CustomPlayFeedback() {
    if (!this.Active || Time.timeScale < (this.MinimumTimescaleThreshold ?? 0.1)) return;
    FeedbackEvents.freezeFrame.Raise(this.FeedbackDuration);
  }
}

export class MMFeedbackEffect extends MMFeedback {
  CustomPlayFeedback(position) {
    if (!this.Active) return;
    FeedbackEvents.effect.Raise(this.id, { position: (position || this.transform.position).clone().add(u3(this.offset)), scale: this.scale ?? 1 });
  }
}

/** Feedback types we only need to exist (UI / sound-only) */
class NoopFeedback extends MMFeedback {}

for (const [cls, name] of [
  [MMFeedbacks, 'MMFeedbacks'],
  [MMFeedbackPause, 'MMFeedbackPause'],
  [MMFeedbackHoldingPause, 'MMFeedbackHoldingPause'],
  [MMFeedbackAwaitTrigger, 'MMFeedbackAwaitTrigger'],
  [MMFeedbackRoadRotate, 'MMFeedbackRoadRotate'],
  [MMFeedbackRoadPosition, 'MMFeedbackRoadPosition'],
  [MMFeedbackPosition, 'MMFeedbackPosition'],
  [MMFeedbackPhysicsPosition, 'MMFeedbackPhysicsPosition'],
  [MMFeedbackScale, 'MMFeedbackScale'],
  [MMFeedbackRotation, 'MMFeedbackRotation'],
  [MMFeedbackPhysicsRotate, 'MMFeedbackPhysicsRotate'],
  [MMFeedbackSetActive, 'MMFeedbackSetActive'],
  [MMFeedbackDestroy, 'MMFeedbackDestroy'],
  [MMFeedbackParticles, 'MMFeedbackParticles'],
  [MMFeedbackParticlesInstantiation, 'MMFeedbackParticlesInstantiation'],
  [MMFeedbackInstantiateObject, 'MMFeedbackInstantiateObject'],
  [MMFeedbackCameraShake, 'MMFeedbackCameraShake'],
  [MMFeedbackFlash, 'MMFeedbackFlash'],
  [MMFeedbackFreezeFrame, 'MMFeedbackFreezeFrame'],
  [MMFeedbackEffect, 'MMFeedbackEffect'],
]) {
  registerComponent(cls, name);
}
for (const name of ['MMFeedbackCanvasGroup', 'MMFeedbackTMPColor', 'MMFeedbackTMPAlpha', 'MMFeedbackImage', 'MMFeedbackImageAlpha', 'MMFeedbackSound', 'MMFeedbackAudioSource']) {
  registerComponent(class extends NoopFeedback {}, name);
}
