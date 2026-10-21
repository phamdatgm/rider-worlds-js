// Chunk / road elements ported from the Unity project.
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { Time, WaitForSeconds, WaitForFixedUpdate, WaitWhile } from '../engine/core.js';
import { Mathf, angle2, unityEuler, quatZ } from '../engine/math.js';
import { RigidbodyType2D } from '../engine/physics2d.js';
import { Instantiate, registerComponent } from '../engine/instantiate.js';
import { AudioService, AudioSampleID } from '../engine/audio.js';
import { MaterialPropertyBlock } from '../engine/render.js';
import { LoopHooks } from '../engine/loop.js';
import { Game, ChunkType, DeathReason, EndState, CurrencyType } from './state.js';
import { MMFeedbackAwaitTrigger } from './mmfeedbacks.js';
import { decodeIntArray } from './chunks.js';

const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
const layerIncludes = (mask, go) => ((1 << go.layer) & mask) !== 0;

/** PlayMMFeedbacksOnMain: defer MMFeedbacks.PlayFeedbacks() to the next Update (out of physics callbacks). */
export const PlayMMFeedbacksOnMain = {
  list: [],
  Add(fb) {
    if (fb) this.list.push(fb);
  },
};
LoopHooks.beforeUpdate.push(() => {
  const l = PlayMMFeedbacksOnMain.list;
  PlayMMFeedbacksOnMain.list = [];
  for (const fb of l) if (fb && !fb.gameObject._destroyed) fb.PlayFeedbacks();
});

export const RoadPieceType = { Static: 0, Gravity: 1, MoveAndRotate: 2, Magnetic: 3, MoveAndRotateFake: 4, Pivot: 5, Glass: 6 };
export const RoadPieceActivationType = { OnCollision: 0, OnTrigger: 1 };

// ---------------------------------------------------------------- DynamicChunkElement

export class DynamicChunkElement extends MonoBehaviour {
  get AnimateByTrigger() {
    return false;
  }

  get UsesAnimation() {
    return false;
  }

  Awake() {
    this.SetOrigPositions();
  }

  SetOrigPositions() {
    this.originalPosition = this.transform.localPosition;
    this.originalRotation = this.transform.localRotation;
  }

  ResetState() {
    if (!this.originalPosition) return;
    this.transform.localPosition = this.originalPosition;
    this.transform.localRotation = this.originalRotation;
  }

  HandleFeedbackTrigger() {}

  SetVisuals() {}
}

// ---------------------------------------------------------------- RoadPiece

export class RoadPiece extends DynamicChunkElement {
  constructor() {
    super();
    this.type = 0;
    this.activation = 1;
    this.nonLethal = 0;
    this.length = 0;
    this.gravityDelay = 0;
    this.animateOnce = 0;
    this.animationResetDelay = 2.5;
    this.isAnimationTriggered = false;
    this.resetAnimationCo = null;
    this.triggeredGravity = false;
    this.startGravity = null;
    this.isGlassBroken = false;
    this.lastCrackTime = 0;
  }

  get Type() {
    return this.type;
  }

  get IsNonStaticPiece() {
    return this.type !== RoadPieceType.Static;
  }

  get NonLethal() {
    return !!this.nonLethal;
  }

  get Length() {
    return Math.abs(this.length * this.transform.localScale.x);
  }

  get IsGlass() {
    return this.type === RoadPieceType.Glass;
  }

  get IsMagnetic() {
    return this.type === RoadPieceType.Magnetic;
  }

  get UsesAnimation() {
    return this.type === RoadPieceType.MoveAndRotate || this.type === RoadPieceType.Pivot;
  }

  get AnimateByTrigger() {
    return this.UsesAnimation && this.activation === RoadPieceActivationType.OnTrigger;
  }

  get AnimationFeedback() {
    return this.animationFeedback;
  }

  get SharedMesh() {
    return this.meshFilter?.sharedMesh;
  }

  Awake() {
    if (this.type === RoadPieceType.Gravity) this.rigidBody = this.GetComponent('Rigidbody2D');
    if (this.type === RoadPieceType.Magnetic) {
      const eff = Game.roadPieceSettings?.magneticEffect;
      if (eff) {
        try {
          const m = Instantiate(eff, this.transform);
          m.transform.localPosition = new THREE.Vector3();
          m.Setup?.(this);
        } catch (e) {
          /* effect prefab not exported */
        }
      }
    }
    if (this.type === RoadPieceType.Glass) {
      this.colliders = this.GetComponentsInChildren('Collider2D', true).filter((c) => c.isTrigger !== undefined);
      this.activation = RoadPieceActivationType.OnCollision;
      this.glassSettings = Game.roadPieceSettings?.glassRoadSettings || {};
    }
    super.Awake();
  }

  HandleFeedbackTrigger(trigger) {
    if (!this.AnimateByTrigger || this.HandleAnimation()) return;
    for (const f of this.animationFeedback?.list || []) {
      if (f instanceof MMFeedbackAwaitTrigger && f.IsPlaying) f.HandleTrigger(trigger);
    }
  }

  OnCollisionEnter2D(other) {
    if (this.activation === RoadPieceActivationType.OnCollision && layerIncludes(8, other.gameObject)) {
      this.HandleGravityOnCollision();
      if (this.UsesAnimation) this.HandleAnimation();
    }
  }

  ResetState() {
    switch (this.type) {
      case RoadPieceType.Gravity:
        this.ResetGravity();
        break;
      case RoadPieceType.MoveAndRotate:
      case RoadPieceType.Pivot:
        this.ResetAnimation();
        break;
      case RoadPieceType.Glass:
        this.ResetGlass();
        break;
      default:
        break;
    }
    super.ResetState();
  }

  SetVisuals(settings) {
    if (this.type === RoadPieceType.Pivot || !settings || !this.meshRenderer) return;
    const rv = this.type === RoadPieceType.Static ? settings.staticRoadVisuals : settings.dynamicRoadVisuals;
    if (this.type === RoadPieceType.Glass && settings.glassMaterial) {
      this.glassMaterial = settings.glassMaterial;
      this.crackedGlassMaterial = settings.glassCrackedMaterial;
      this.meshRenderer.materials = [settings.glassMaterial, settings.glassMaterial];
    } else if (this.type === RoadPieceType.Magnetic && settings.magneticMaterial) {
      this.meshRenderer.materials = [settings.magneticMaterial, settings.magneticMaterial];
    }
    const b = new MaterialPropertyBlock();
    b.SetColor('_PrimaryColor', rv.primaryColor);
    b.SetColor('_PrimaryEmission', rv.primaryEmission);
    b.SetColor('_SecondaryColor', rv.secondaryColor);
    b.SetColor('_SecondaryEmission', rv.secondaryEmission);
    if (this.type === RoadPieceType.Magnetic) {
      b.SetColor('OverlayColor', settings.magneticOverlayColor);
      b.SetColor('OverlayColorEmission', settings.magneticOverlayColorEmission);
    }
    this.meshRenderer.SetPropertyBlock(b);
  }

  HandleGlassOnCollision(hitData, forceBreak) {
    if (this.type !== RoadPieceType.Glass || this.isGlassBroken) return;
    const up = Game.runState.PlayerState.Player.transform.up;
    const a = angle2(hitData.normal, V2(up.x, up.y));
    if (a < (this.glassSettings.maxGlassSurvivalAngle ?? 45) && !forceBreak) {
      this.GlassCrack();
      return;
    }
    this.nonLethal = 1;
    this.GlassBreak();
  }

  GlassCrack() {
    if (this.lastCrackTime + (this.glassSettings.glassReCrackDelay ?? 0.2) > Time.time) {
      if (this.lastCrackTime === 0 && this.crackedGlassMaterial) this.meshRenderer.materials = [this.crackedGlassMaterial, this.crackedGlassMaterial];
      this.lastCrackTime = Time.time;
    }
  }

  GlassBreak() {
    this.isGlassBroken = true;
    this.meshRenderer.enabled = false;
    for (const c of this.colliders || []) c.enabled = false;
    const gs = this.glassSettings;
    Game.runState.PlayerState.Player.ApplyGlassRoadHit(gs.breakImpactVelocityMultiplier ?? 1, gs.breakImpactAngularVelocityMultiplier ?? 1);
  }

  ResetGlass() {
    if (this.lastCrackTime !== 0) {
      this.lastCrackTime = 0;
      if (this.glassMaterial) this.meshRenderer.materials = [this.glassMaterial, this.glassMaterial];
    }
    if (this.isGlassBroken) {
      this.isGlassBroken = false;
      this.meshRenderer.enabled = true;
      for (const c of this.colliders || []) c.enabled = true;
    }
  }

  HandleGravityOnCollision() {
    if (this.type !== RoadPieceType.Gravity || this.triggeredGravity || this.startGravity) return;
    this.triggeredGravity = true;
    const self = this;
    this.startGravity = this.StartCoroutine((function* () {
      yield new WaitForSeconds(self.gravityDelay);
      self.rigidBody.gravityScale = 1;
      self.rigidBody.bodyType = RigidbodyType2D.Dynamic;
      self.startGravity = null;
    })());
  }

  ResetGravity() {
    this.triggeredGravity = false;
    if (this.startGravity) {
      this.StopCoroutine(this.startGravity);
      this.startGravity = null;
    }
    if (this.rigidBody) {
      this.rigidBody.gravityScale = 0;
      this.rigidBody.bodyType = RigidbodyType2D.Kinematic;
      this.rigidBody.velocity = V2();
      this.rigidBody.angularVelocity = 0;
    }
  }

  HandleAnimation() {
    if ((this.animateOnce && this.isAnimationTriggered) || this.resetAnimationCo) return false;
    this.isAnimationTriggered = true;
    PlayMMFeedbacksOnMain.Add(this.animationFeedback);
    if (this.animationResetDelay >= 0) {
      const self = this;
      this.resetAnimationCo = this.StartCoroutine((function* () {
        yield new WaitForSeconds(self.animationResetDelay);
        self.animationFeedback?.PlayFeedbacks();
        self.resetAnimationCo = null;
      })());
    }
    return true;
  }

  ResetAnimation() {
    if (!this.isAnimationTriggered) return;
    this.isAnimationTriggered = false;
    if (this.animationFeedback) {
      this.animationFeedback.StopFeedbacks(true);
      this.animationFeedback.ResetFeedbacks();
    }
    if (this.resetAnimationCo) {
      this.StopCoroutine(this.resetAnimationCo);
      this.resetAnimationCo = null;
    }
  }
}

// ---------------------------------------------------------------- RiderChunk

export class RiderChunk extends MonoBehaviour {
  constructor() {
    super();
    this.type = ChunkType.Normal;
    this.difficulty = 1;
    this.currencySpawners = [];
    this.chunkElements = [];
    this.maxAchievableChunkScore = 0;
    this.pooledCurrency = [];
  }

  get Type() {
    return this.type;
  }

  get ID() {
    return `${this.name}\tD${this.difficulty}`;
  }

  get HasCurrencySpawners() {
    return (this.currencySpawners || []).length !== 0;
  }

  get MaxAchievableChunkScore() {
    return this.maxAchievableChunkScore;
  }

  Awake() {
    const vs = Game.visualSettings;
    for (const e of this.chunkElements || []) e?.SetVisuals?.(vs);
  }

  OnDestroy() {
    for (const c of this.pooledCurrency) Game.softCurrencyPool?.Deactivate(c);
    this.pooledCurrency = [];
  }

  GetChunkStart() {
    return [this.chunkStart.localPosition, this.chunkStart.rotation];
  }

  GetChunkEnd() {
    return [this.chunkEnd.localPosition, this.chunkEnd.rotation];
  }

  ResetState() {
    for (const e of this.chunkElements || []) e?.ResetState?.();
  }

  AddPooledCurrency(c) {
    this.pooledCurrency.push(c);
  }
}

export class CurrencySpawner extends MonoBehaviour {
  get LocalSpawnPoints() {
    return (this.localSpawnPoints || []).map((p) => V2(p[0], p[1]));
  }
}

// ---------------------------------------------------------------- Interactables

export class Interactable extends MonoBehaviour {
  constructor() {
    super();
    this.triggerLayer = 8;
    this.cooldown = 0.5;
    this.canUseTime = -1;
  }

  OnTriggerEnter2D(other) {
    if (layerIncludes(this.triggerLayer, other.gameObject) && Time.time > this.canUseTime) {
      this.canUseTime = Time.time + this.cooldown;
      if (this.triggerFeedback) PlayMMFeedbacksOnMain.Add(this.triggerFeedback);
      this.HandleInteraction(other);
    }
  }

  HandleInteraction() {}
}

export class FeedbackTrigger extends Interactable {
  HandleInteraction() {
    for (const t of this.targets || []) t?.HandleFeedbackTrigger(this);
  }
}

export class JumpPad extends Interactable {
  Start() {
    const s = Game.visualSettings;
    if (!s) return;
    const b = new MaterialPropertyBlock();
    if (this.buttonRenderer) {
      b.SetColor('_BaseColor', s.jumpPadButtonColor);
      b.SetColor('_EmissionColor', s.jumpPadButtonEmission);
      this.buttonRenderer.SetPropertyBlock(b);
    }
    if (this.rampRenderer) {
      const r = new MaterialPropertyBlock();
      r.SetColor('_PrimaryColor', s.staticRoadVisuals.primaryColor);
      r.SetColor('_PrimaryEmission', s.staticRoadVisuals.primaryEmission);
      r.SetColor('_SecondaryColor', s.staticRoadVisuals.secondaryColor);
      r.SetColor('_SecondaryEmission', s.staticRoadVisuals.secondaryEmission);
      this.rampRenderer.SetPropertyBlock(r);
    }
  }

  HandleInteraction(collider) {
    const m = collider.GetComponentInParent('PlayerMovement');
    if (!m) return;
    const d = V2(...(this.forceDirection || [0, 1])).normalize().multiplyScalar(this.forceStrength ?? 250);
    m.TriggerLaunch(d, (this.torqueStrength || 0) * Mathf.Clamp01(m.CurrentVelocity.length() / (this.maxPlayerSpeed ?? 10)));
  }
}

export class SpeedBooster extends Interactable {
  HandleInteraction(collider) {
    const m = collider.GetComponentInParent('PlayerMovement');
    if (!m) return;
    m.TriggerSpeedBoost(this.acceleration ?? 100000, this.topSpeed ?? 25, this.duration ?? 2);
    AudioService.Play(AudioSampleID.Bike_Boost);
  }
}

export class CannonLauncher extends Interactable {
  Start() {
    const s = Game.visualSettings;
    if (!s) return;
    for (const r of this.renderers || []) {
      if (!r) continue;
      const g = new MaterialPropertyBlock();
      g.SetColor('_GlowColor', s.cannonGlowColor);
      r.SetPropertyBlock(g, 0);
      const b = new MaterialPropertyBlock();
      b.SetColor('_BaseColor', s.cannonBaseColor);
      b.SetColor('_EmissionColor', s.cannonEmissionColor);
      r.SetPropertyBlock(b, 1);
    }
  }

  HandleInteraction() {
    if (!this.isOnCooldown) this.StartCoroutine(this.ActivationRoutine());
  }

  *ActivationRoutine() {
    this.isOnCooldown = true;
    const ps = Game.runState.PlayerState;
    ps.Player.EnableCannonState(this.transform);
    const fb = this.roadPiece?.AnimationFeedback;
    if (fb) {
      yield new WaitWhile(() => !fb.IsPlaying);
      yield new WaitWhile(() => fb.IsPlaying);
    }
    const force = (this.launchForce ?? 300) * 0.3333;
    yield WaitForFixedUpdate;
    ps.Player?.DisableCannonState(force);
    this.launchFeedbacks?.PlayFeedbacks();
    yield new WaitForSeconds(this.enterCooldownAfterLaunch ?? 0.5);
    this.isOnCooldown = false;
  }
}

export class FinishlineTrigger extends Interactable {
  Start() {
    const s = Game.visualSettings;
    if (!s) return;
    if (this.glow) this.glow.color = s.finishLineGlowColor;
    if (this.mesh) {
      const b = new MaterialPropertyBlock();
      b.SetColor('ColorOverlay', s.finishLineColor);
      this.mesh.SetPropertyBlock(b);
    }
  }

  HandleInteraction() {
    if (this.runState.IsRunning) AudioService.Play(AudioSampleID.UI_LevelComplete);
    this.runState.Finish(DeathReason.None, EndState.Victory);
  }
}

// ---------------------------------------------------------------- Gravity

export const GravityModifierState = { Off: 0, Left: 1, Up: 2, Right: 3 };
const DIRECTION_MAP = { 0: V2(0, 0), 1: V2(-1, 0), 2: V2(0, 1), 3: V2(1, 0) };
const ROTATION_MAP = { 0: 0, 1: 270, 2: 180, 3: 90 };

export class GravityModifier extends DynamicChunkElement {
  constructor() {
    super();
    this.states = [0, 0];
    this.counter = 0;
    this.gravityEnabled = false;
    this.currentModifier = V2();
    this.modifiables = [];
  }

  get AnimateByTrigger() {
    return true;
  }

  get UsesAnimation() {
    return true;
  }

  get CurrentState() {
    return this.states[this.counter];
  }

  setCounter(v) {
    this.counter = v < this.states.length ? v : 0;
    this.gravityEnabled = this.CurrentState !== GravityModifierState.Off;
    this.currentModifier = DIRECTION_MAP[this.CurrentState].clone().multiplyScalar(13);
  }

  OnDeserialize() {
    // enum arrays are serialized as little-endian int32 hex blobs
    if (!Array.isArray(this.states)) this.states = decodeIntArray(this.states);
    if (!this.states.length) this.states = [0];
  }

  Awake() {
    super.Awake();
    this.ResetState();
  }

  OnTriggerEnter2D(other) {
    const m = other.GetComponent('GravityModifiable');
    if (m && !this.modifiables.includes(m)) {
      this.modifiables.push(m);
      if (this.gravityEnabled) m.AddGravityOverride(this.currentModifier);
    }
  }

  OnTriggerExit2D(other) {
    const m = other.GetComponent('GravityModifiable');
    const i = m ? this.modifiables.indexOf(m) : -1;
    if (i >= 0) {
      this.modifiables.splice(i, 1);
      if (this.gravityEnabled) m.RemoveGravityOverride(this.currentModifier);
    }
  }

  HandleFeedbackTrigger() {
    let wasDisabled;
    if (this.gravityEnabled) {
      this.ClearModifier();
      wasDisabled = false;
    } else wasDisabled = true;
    this.setCounter(this.counter + 1);
    if (this.gravityEnabled) {
      this.ApplyModifier();
      if (wasDisabled) this.visuals?.SetActiveState(true);
      else this.visuals?.StartDirectionChange(this.CurrentState);
    } else {
      this.ClearModifier();
      this.visuals?.SetActiveState(false);
    }
  }

  ResetState() {
    this.setCounter(0);
    const next = this.counter + 1 < this.states.length ? this.counter + 1 : 0;
    this.visuals?.SetPlaneState(this.CurrentState, this.states[next]);
    for (const m of this.modifiables) m.ResetState();
  }

  ApplyModifier() {
    for (const m of this.modifiables) m.AddGravityOverride(this.currentModifier);
  }

  ClearModifier() {
    for (const m of this.modifiables) m.RemoveGravityOverride(this.currentModifier);
  }
}

export class GravityModifierVisuals extends MonoBehaviour {
  constructor() {
    super();
    this.arrowTilingThreshold = [8, 5];
    this.lineTilingThreshold = [10, 13];
    this.movementSpeed = -0.35;
    this.activeToggleAnimationDuration = 0.5;
    this.materialActiveOffStateTargetValue = 1;
    this.directionChangeAnimationDuration = 0.5;
    this.isActive = false;
    this.isActivating = false;
    this.currentOffStateValue = 0;
    this.currentTime = 0;
    this.block = new MaterialPropertyBlock();
  }

  apply() {
    this.affectedRenderer?.SetPropertyBlock(this.block);
  }

  Start() {
    const s = Game.visualSettings;
    if (!s || !this.affectedRenderer) return;
    this.affectedRenderer.GetPropertyBlock(this.block);
    this.block.SetColor('_Color_Main', s.gravityFieldMainColor);
    this.block.SetColor('_Background_color', s.gravityFieldBackgroundColor);
    this.block.SetColor('_Color_Main_Off', s.gravityFieldMainOffColor);
    this.block.SetColor('_Color_Background_Off', s.gravityFieldBackgroundOffColor);
    this.block.SetColor('_Sparks_Color', s.gravityFieldSparksColor);
    this.block.SetColor('_Gradient_Color', s.gravityFieldGradientColor);
    this.apply();
    this.flashMain = s.gravityFieldDirectionSwitchMainColor;
    this.flashBg = s.gravityFieldDirectionSwitchBackgroundColor;
  }

  Update() {
    if (!this.affectedRenderer || !(this.isActive || this.isActivating)) return;
    this.currentTime += Time.deltaTime * (1 - this.currentOffStateValue);
    this.block.SetFloat('_Time_Anim', this.currentTime);
    this.apply();
  }

  SetPlaneState(cur, next) {
    this.isActive = cur !== GravityModifierState.Off;
    this.SetTiling(cur !== GravityModifierState.Off ? cur : next);
    this.currentOffStateValue = this.isActive ? 0 : this.materialActiveOffStateTargetValue;
    this.block.SetFloat('_Activate_off_state', this.currentOffStateValue);
    this.apply();
  }

  SetTiling(state) {
    const rot = state !== GravityModifierState.Up;
    const sc = this.transform.localScale;
    const tiling = (th) => [Math.max(Math.round(sc.x / (rot ? th[1] : th[0])), 1), Math.max(Math.round(sc.y / (rot ? th[0] : th[1])), 1), 0, 0];
    this.block.SetVector('_Tiling_Main', tiling(this.arrowTilingThreshold));
    this.block.SetVector('_Tiling_sparks', tiling(this.lineTilingThreshold));
    this.block.SetFloat('_Rotate', ROTATION_MAP[state]);
    const d = DIRECTION_MAP[state];
    this.block.SetVector('_Movement_Speed', [d.x * this.movementSpeed, d.y * this.movementSpeed, 0, 0]);
    this.apply();
  }

  SetActiveState(on) {
    this.isActive = on;
    if (this.activeCo) this.StopCoroutine(this.activeCo);
    const self = this;
    this.activeCo = this.StartCoroutine((function* () {
      const start = self.currentOffStateValue;
      const target = on ? 0 : self.materialActiveOffStateTargetValue;
      let t = 0;
      self.isActivating = true;
      while (t < self.activeToggleAnimationDuration) {
        t += Time.deltaTime;
        self.currentOffStateValue = Mathf.Lerp(start, target, t / self.activeToggleAnimationDuration);
        self.block.SetFloat('_Activate_off_state', self.currentOffStateValue);
        self.apply();
        yield null;
      }
      self.isActivating = false;
    })());
  }

  StartDirectionChange(state) {
    if (this.dirCo) this.StopCoroutine(this.dirCo);
    const self = this;
    this.dirCo = this.StartCoroutine((function* () {
      const startBg = self.block.GetColor('_Background_color')?.clone() || new THREE.Vector4(1, 1, 1, 1);
      const startMain = self.block.GetColor('_Color_Main')?.clone() || new THREE.Vector4(1, 1, 1, 1);
      const toV = (c) => (Array.isArray(c) ? new THREE.Vector4(...c) : new THREE.Vector4(1, 1, 1, 1));
      const fBg = toV(self.flashBg);
      const fMain = toV(self.flashMain);
      let tp = 0;
      let last = 0;
      let switched = false;
      while (tp < self.directionChangeAnimationDuration) {
        const time = Mathf.Clamp01(tp / self.directionChangeAnimationDuration);
        const p = self.directionChangeAnimationCurve ? self.directionChangeAnimationCurve.Evaluate(time) : Math.sin(time * Math.PI);
        self.block.SetColor('_Background_color', startBg.clone().lerp(fBg, p));
        self.block.SetColor('_Color_Main', startMain.clone().lerp(fMain, p));
        if (self.directionChangeGradientAnimCurve) self.block.SetFloat('_Gradient_Anim', self.directionChangeGradientAnimCurve.Evaluate(time));
        if (!switched && p < last) {
          switched = true;
          self.SetTiling(state);
        }
        self.apply();
        last = p;
        tp += Time.deltaTime;
        yield null;
      }
      if (!switched) self.SetTiling(state);
    })());
  }
}

export class GravityModifierSwitch extends DynamicChunkElement {
  get UsesAnimation() {
    return true;
  }

  get AnimateByTrigger() {
    return true;
  }

  Awake() {
    super.Awake();
    this.initialState = this.state = this.controllerModifier ? this.controllerModifier.states[0] !== GravityModifierState.Off : false;
    const hasOff = !this.controllerModifier || this.controllerModifier.states.some((s) => s === GravityModifierState.Off);
    const prefab = hasOff ? this.onOffPrefab : this.directionalPrefab;
    try {
      this.visuals = prefab ? Instantiate(prefab, this.transform) : null;
    } catch (e) {
      this.visuals = null;
    }
    this.ResetState();
  }

  Start() {
    this.visuals?.SetVisuals?.(Game.visualSettings);
  }

  ResetState() {
    this.state = this.initialState;
    this.visuals?.SetState?.(this.state);
  }

  HandleFeedbackTrigger() {
    this.state = !this.state;
    this.visuals?.AnimateState?.(this.state);
  }
}

export class GravityModifierSwitchVisuals extends MonoBehaviour {
  SetVisuals(s) {
    if (!s) return;
    if (this.buttonRenderer) {
      const b = new MaterialPropertyBlock();
      b.SetColor('_PrimaryColor', s.gravitySwitchColorsBase);
      b.SetColor('_PrimaryEmission', s.gravitySwitchColorsBaseEmission);
      b.SetColor('_SecondaryColor', s.gravitySwitchColorSide);
      b.SetColor('_SecondaryEmission', s.gravitySwitchColorSideEmission);
      this.buttonRenderer.SetPropertyBlock(b);
    }
    for (const r of this.directionalLightsRenderers || []) {
      if (!r) continue;
      const b = new MaterialPropertyBlock();
      b.SetColor('ColorOverlay', s.gravitySwitchDirectionalOverlayColor);
      r.SetPropertyBlock(b);
    }
  }

  SetState(active) {
    if (this.animateOn?.IsPlaying) this.animateOn.StopFeedbacks();
    if (this.animateOff?.IsPlaying) this.animateOff.StopFeedbacks();
    (active ? this.setOn : this.setOff)?.PlayFeedbacks();
  }

  AnimateState(active) {
    PlayMMFeedbacksOnMain.Add(active ? this.animateOn : this.animateOff);
  }
}

// ---------------------------------------------------------------- pickups

export class BasePickup extends MonoBehaviour {
  constructor() {
    super();
    this.gainOnPickup = 1;
    this.pickedUp = false;
  }

  OnEnable() {
    this.pickedUp = false;
  }

  HandlePickup() {
    this.HandleGain();
    this.animationPickup?.PlayFeedbacks();
  }

  HandleGain() {}

  OnTriggerEnter2D() {
    if (this.pickedUp) return;
    this.pickedUp = true;
    this.HandlePickup();
  }

  ResetFromPool() {
    this.animationPickup?.ResetFeedbacks();
  }
}

export class CurrencyPickup extends BasePickup {
  HandleGain() {
    Game.runState.PickupController.ProcessCurrencyPickup(this.currencyType ?? CurrencyType.Soft, this.gainOnPickup);
    this.animationPickup?.PlayFeedbacks();
    this.Hide();
  }

  Hide() {
    // Unity's `this.Hide()` extension: hides renderers / disables colliders while the pickup feedback plays
    for (const r of this.GetComponentsInChildren('Renderer', true)) r.enabled = false;
    for (const c of this.GetComponentsInChildren('Collider2D', true)) c.enabled = false;
  }

  Show() {
    for (const r of this.GetComponentsInChildren('Renderer', true)) r.enabled = true;
    for (const c of this.GetComponentsInChildren('Collider2D', true)) c.enabled = true;
  }
}

/** SoftCurrencyPool (PoolController.softCurrencyPool) */
export class SoftCurrencyPool {
  constructor(prefab) {
    this.prefab = prefab;
    this.free = [];
  }

  Activate() {
    let c = this.free.pop();
    if (!c || c.gameObject._destroyed) c = Instantiate(this.prefab);
    c = c.GetComponent ? c.GetComponent('CurrencyPickup') || c : c;
    c.gameObject.SetActive(true);
    c.ResetFromPool?.();
    c.Show?.();
    return c;
  }

  Deactivate(c) {
    if (!c || c.gameObject._destroyed) return;
    c.gameObject.SetActive(false);
    c.transform.SetParent(null);
    this.free.push(c);
  }
}

// ---------------------------------------------------------------- simple motion scripts

export class RotateScript extends MonoBehaviour {
  Update() {
    const s = Time.deltaTime * (this.speed || 0);
    if (this.ForwardX) this.transform.Rotate(s, 0, 0);
    if (this.ForwardY) this.transform.Rotate(0, s, 0);
    if (this.ForwardZ) this.transform.Rotate(0, 0, s);
    if (this.ReverseX) this.transform.Rotate(-s, 0, 0);
    if (this.ReverseY) this.transform.Rotate(0, -s, 0);
    if (this.ReverseZ) this.transform.Rotate(0, 0, -s);
  }
}

export class MMAutoRotate extends MonoBehaviour {
  constructor() {
    super();
    this.Rotating = 1;
    this.RotationSpace = 1; // Space.Self == 1 in Unity
    this.UpdateMode = 0;
    this.RotationSpeed = [100, 0, 0];
  }

  rotate() {
    if (!this.Rotating) return;
    const s = this.RotationSpeed;
    const dt = Time.deltaTime;
    this.transform.Rotate(s[0] * dt, s[1] * dt, s[2] * dt, this.RotationSpace === 0 ? 'world' : 'self');
  }

  Update() {
    if (this.UpdateMode === 0) this.rotate();
  }

  FixedUpdate() {
    if (this.UpdateMode === 2) this.rotate();
  }

  LateUpdate() {
    if (this.UpdateMode === 1) this.rotate();
  }
}

export class PhysicsRotator2D extends MonoBehaviour {
  Awake() {
    this._rb = this.GetComponent('Rigidbody2D');
  }

  FixedUpdate() {
    this._rb?.MoveRotation(this._rb.rotation + (this.rotationSpeed ?? 360) * Time.deltaTime);
  }
}

export class SimpleOscillate extends MonoBehaviour {
  Awake() {
    this.startPos = this.transform.localPosition;
  }

  Update() {
    const t = Mathf.PingPong(Time.time * (this.oscillationSpeed ?? 1), 1);
    const l = (m) => (m ? m.min + (m.max - m.min) * t : 0);
    this.transform.localPosition = this.startPos.clone().add(new THREE.Vector3(l(this.x), l(this.y), -l(this.z)));
  }
}

export class LockToAxis extends MonoBehaviour {
  Start() {
    this.startPosition = this.transform.position;
  }

  LateUpdate() {
    if (!this.startPosition) return;
    const p = this.transform.position;
    this.transform.position = new THREE.Vector3(this.x ? this.startPosition.x : p.x, this.y ? this.startPosition.y : p.y, this.z ? this.startPosition.z : p.z);
  }
}

export class SameXCoordinateAsOther extends MonoBehaviour {
  Start() {
    this.startY = this.transform.position.y;
    this.startYOffset = this.otherTransform ? this.otherTransform.position.y - this.startY : 0;
  }

  Update() {
    if (!this.otherTransform || this.startY === undefined) return;
    const other = this.otherTransform.position;
    let y = this.startY;
    const delta = other.y - this.startY - this.startYOffset;
    if (delta >= this.maxYDistanceBeforeFollow) y = Mathf.Clamp(delta - this.maxYDistanceBeforeFollow + this.startY, this.startY + this.minYOffset, this.startY + this.maxYOffset);
    else if (delta <= this.maxYDistanceDownBeforeFollow) y = Mathf.Clamp(delta - this.maxYDistanceDownBeforeFollow + this.startY, this.startY + this.minYOffset, this.startY + this.maxYOffset);
    this.transform.position = new THREE.Vector3(other.x, y, this.transform.position.z);
  }
}

export class ChunkDistanceModifier extends MonoBehaviour {
  Awake() {
    const x = this.transform.position.x;
    for (const m of this.modifiers || []) {
      const w = m.withinDistance || { min: 0, max: 0 };
      if (!(x < w.min) && x < w.max) {
        for (const g of m.disableObjects || []) g?.SetActive(false);
        for (const g of m.enableObjects || []) g?.SetActive(true);
      }
    }
  }
}

/** DOTweenAnimation (only the color/alpha pulse on finish lines matters for gameplay visuals). */
export class DOTweenAnimation extends MonoBehaviour {
  Start() {
    this.t = 0;
    this.sr = this.GetComponent('SpriteRenderer');
    this.from = this.sr ? [this.sr._color[0], this.sr._color[1], this.sr._color[2], this.sr._color[3]] : null;
  }

  Update() {
    if (!this.sr || !this.endValueColor || !this.autoPlay) return;
    const d = this.duration || 1;
    this.t += Time.deltaTime;
    const p = this.loops === -1 || this.loops > 1 ? Mathf.PingPong(this.t / d, 1) : Mathf.Clamp01(this.t / d);
    const e = this.endValueColor;
    const f = this.from;
    this.sr.color = [f[0] + (e[0] - f[0]) * p, f[1] + (e[1] - f[1]) * p, f[2] + (e[2] - f[2]) * p, f[3] + (e[3] - f[3]) * p];
  }
}

export class MagneticRoadEffect extends MonoBehaviour {
  Setup(piece) {
    const len = piece.Length;
    this.particlesGlow?.SetEmissionRate?.((this.emitGlowPerUnitSize ?? 5) * len);
    this.particlesElectricity?.SetEmissionRate?.((this.emitElectricPerUnitSize ?? 1) * len);
  }
}

for (const [cls, name] of [
  [DynamicChunkElement, 'DynamicChunkElement'],
  [RoadPiece, 'RoadPiece'],
  [RiderChunk, 'RiderChunk'],
  [CurrencySpawner, 'CurrencySpawner'],
  [FeedbackTrigger, 'FeedbackTrigger'],
  [JumpPad, 'JumpPad'],
  [SpeedBooster, 'SpeedBooster'],
  [CannonLauncher, 'CannonLauncher'],
  [FinishlineTrigger, 'FinishlineTrigger'],
  [GravityModifier, 'GravityModifier'],
  [GravityModifierVisuals, 'GravityModifierVisuals'],
  [GravityModifierSwitch, 'GravityModifierSwitch'],
  [GravityModifierSwitchVisuals, 'GravityModifierSwitchVisuals'],
  [CurrencyPickup, 'CurrencyPickup'],
  [RotateScript, 'RotateScript'],
  [MMAutoRotate, 'MMAutoRotate'],
  [PhysicsRotator2D, 'PhysicsRotator2D'],
  [SimpleOscillate, 'SimpleOscillate'],
  [LockToAxis, 'LockToAxis'],
  [SameXCoordinateAsOther, 'SameXCoordinateAsOther'],
  [ChunkDistanceModifier, 'ChunkDistanceModifier'],
  [DOTweenAnimation, 'DOTweenAnimation'],
  [MagneticRoadEffect, 'MagneticRoadEffect'],
]) {
  registerComponent(cls, name);
}
