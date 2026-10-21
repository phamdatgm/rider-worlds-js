// Player scripts ported from the Unity project (Player, PlayerMovement, collision/stunt/magnetism checkers, ...).
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { Time, WaitForSeconds, EventAction } from '../engine/core.js';
import { Mathf, angle2, perpendicularClockwise, rotate2, eulerZ } from '../engine/math.js';
import { Physics2D, ForceMode2D, RigidbodyType2D, RigidbodyConstraints2D } from '../engine/physics2d.js';
import { Instantiate, registerComponent } from '../engine/instantiate.js';
import { AudioService, AudioSampleID } from '../engine/audio.js';
import { LeanTouch } from '../engine/input.js';
import { MaterialPropertyBlock } from '../engine/render.js';
import { Game, DeathReason, EndState, Flips, JumpData } from './state.js';
import { Tutorials, FirstRunStep } from '../meta/tutorials.js';

const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
const xy = (v) => new THREE.Vector2(v.x, v.y);
const layerIncludes = (mask, go) => ((1 << go.layer) & mask) !== 0;

export class GroundData {
  constructor(grounded = false, forward = V2(), normal = V2(), point = V2()) {
    this.grounded = grounded;
    this.forward = forward;
    this.normal = normal;
    this.point = point;
  }
}

// ---------------------------------------------------------------- Player

export class Player extends MonoBehaviour {
  constructor() {
    super();
    this.lastValidY = 0;
    this.deathFallDistance = 15;
    this.isdead = false;
    this.lastVelocity = V2();
    this.lastAngularVelocity = 0;
    this.cannonState = false;
    this.CarVisuals = null;
    this.TrailEffect = null;
  }

  get Rigidbody2D() {
    return this.rigidbody;
  }

  get CollisionChecker() {
    return this.collisionChecker;
  }

  get StuntChecker() {
    return this.stuntChecker;
  }

  get Input() {
    return this.input;
  }

  get PerfectLandingEffect() {
    return this.perfectLandingEffect;
  }

  Awake() {
    this.state.SetPlayer(this);
    this._onObstacle = () => this.Die(DeathReason.Obstacle);
    this.collisionChecker.ObstacleHit.AddListener(this._onObstacle);
    this.InitializeCosmetics();
    this.OnVehicleChanged();
    this._onRunStarted = () => this.TrailEffect?.Show?.();
    this._onDied = () => {
      if (this.runState.RunEndState.deathReason === DeathReason.RunReset) this.Die(DeathReason.RunReset);
    };
    this.runState.runStarted.AddListener(this._onRunStarted);
    this.runState.playerDied.AddListener(this._onDied);
    this.OnBoosterChanged(false);
  }

  OnDestroy() {
    for (const go of this.onDestroy || []) if (go) Destroy(go);
    this.collisionChecker.ObstacleHit.RemoveListener(this._onObstacle);
    this.runState.runStarted.RemoveListener(this._onRunStarted);
    this.runState.playerDied.RemoveListener(this._onDied);
    if (this.state.Player === this) this.state.SetPlayer(null);
  }

  OnBoosterChanged(magnet) {
    if (this.pickupTrigger) this.pickupTrigger.radius = magnet ? 3 : 0;
  }

  Update() {
    this.CheckFallDeath();
    this.movement.OnUpdate();
    this.stuntChecker.OnUpdate();
    this.magnetismChecker.OnUpdate();
  }

  FixedUpdate() {
    this.lastVelocity = this.rigidbody.velocity;
    this.lastAngularVelocity = this.rigidbody.angularVelocity;
    this.movement.OnFixedUpdate();
    this.collisionChecker.OnFixedUpdate();
    this.stuntChecker.OnFixedUpdate();
    this.magnetismChecker.OnFixedUpdate();
    this.gravityModifiable.OnFixedUpdate();
  }

  CheckFallDeath() {
    const chunk = this.runState.RunChunkTracker?.CurrentChunk;
    const y = this.transform.position.y;
    if (chunk) {
      if (chunk.transform.position.y > y + this.deathFallDistance) this.Die(DeathReason.OutOfBounds);
      this.lastValidY = y;
    } else if (this.lastValidY > y + this.deathFallDistance) this.Die(DeathReason.OutOfBounds);
  }

  Die(reason) {
    if (this.isdead) return;
    this.isdead = true;
    this.rigidbody.simulated = false;
    for (const w of this.wheelsRb) w.simulated = false;
    this.deathFeedback?.PlayFeedbacks();
    this.runState.Finish(reason, EndState.Defeat);
  }

  InitializeCosmetics() {
    this.collisionChecker.FrontGrounder.SetLandingEffect(this.frontBasicLandingEffect);
    this.collisionChecker.BackGrounder.SetLandingEffect(this.backBasicLandingEffect);
    this.stuntChecker.SetPerfectLandingEffect(this.perfectLandingEffect);
  }

  OnVehicleChanged() {
    const cards = Game.cards;
    if (!cards) return;
    this.SetVehicle(cards.vehicle, cards.vehicleRank);
  }

  SetVehicle(card, rank) {
    if (!card) return;
    if (this.CarVisuals) Destroy(this.CarVisuals.gameObject);
    const item = card.items[Math.min(rank, card.items.length - 1)];
    this.CarVisuals = Instantiate(item, this.vehicleContainer.transform, false);
    this.CarVisuals.SetWheelTransform(this.wheelsRb[0].transform);
    this.OnColorChanged();
    this.OnLandingEffectChanged();
    this.OnTrailEffectChanged();
    this.OnDeathEffectChanged();
  }

  OnColorChanged() {
    const c = Game.cards;
    if (c?.color) this.CarVisuals.SetMaterial(c.color, c.colorRank);
  }

  OnLandingEffectChanged() {
    const c = Game.cards;
    if (c?.landing && this.perfectLandingEffect) {
      const item = c.landing.items[Math.min(c.landingRank, c.landing.items.length - 1)];
      if (item) this.perfectLandingEffect.SetEffect(item);
    }
  }

  OnTrailEffectChanged() {
    const c = Game.cards;
    if (!c?.trail) return;
    if (this.TrailEffect) Destroy(this.TrailEffect.gameObject);
    const item = c.trail.items[Math.min(c.trailRank, c.trail.items.length - 1)];
    if (!item || !this.CarVisuals.trailSocket) return;
    try {
      this.TrailEffect = Instantiate(item, this.CarVisuals.trailSocket);
      this.TrailEffect.Show?.(this.runState.IsRunning);
    } catch (e) {
      console.warn('trail', e.message);
    }
  }

  OnDeathEffectChanged() {
    const c = Game.cards;
    if (c?.death && this.playerDeathParticle) {
      const item = c.death.items[Math.min(c.deathRank, c.death.items.length - 1)];
      if (item) this.playerDeathParticle.ParticlesPrefab = item;
    }
  }

  GetVelocity() {
    return this.rigidbody.velocity;
  }

  SetKinematic(active = true) {
    const g = active ? 0 : 1;
    const bodies = [this.rigidbody, ...this.wheelsRb];
    for (const rb of bodies) {
      rb.gravityScale = g;
      rb.bodyType = active ? RigidbodyType2D.Kinematic : RigidbodyType2D.Dynamic;
      rb.velocity = V2();
      rb.angularVelocity = 0;
    }
  }

  ApplyGlassRoadHit(vMul, aMul) {
    this.rigidbody.velocity = this.lastVelocity.clone().multiplyScalar(vMul);
    this.rigidbody.angularVelocity = this.lastAngularVelocity * aMul;
    for (const w of this.wheelsRb) {
      w.angularVelocity = this.lastAngularVelocity * aMul;
      w.velocity = this.lastVelocity.clone().multiplyScalar(vMul);
    }
  }

  EnableCannonState(cannonTrans) {
    if (this.cannonState) return;
    this.cannonState = true;
    this.SetKinematic();
    this.CarVisuals.gameObject.SetActive(false);
    this.transform.SetParent(cannonTrans);
    this.transform.SetPositionAndRotation(cannonTrans.position, cannonTrans.rotation);
    this.stuntChecker.enabled = false;
  }

  DisableCannonState(launchForce) {
    if (!this.cannonState) return;
    this.transform.SetParent(null);
    this.SetKinematic(false);
    this.CarVisuals.gameObject.SetActive(true);
    const r = this.transform.right;
    const force = V2(r.x * launchForce, r.y * launchForce);
    for (const w of this.wheelsRb) w.AddForce(force, ForceMode2D.Impulse);
    this.rigidbody.AddForce(force, ForceMode2D.Impulse);
    this.stuntChecker.ForceAngleUpdate();
    this.stuntChecker.enabled = true;
    this.cannonState = false;
  }
}

// ---------------------------------------------------------------- PlayerInput

export class PlayerInput extends MonoBehaviour {
  constructor() {
    super();
    this.Touching = false;
    this.lastTouch = null;
  }

  Awake() {
    this._down = (f) => this.HandleFingerDown(f);
    this._up = (f) => this.HandleFingerUp(f);
    this._run = () => {
      if (this.lastTouch && this.lastTouch.IsActive && !this.lastTouch.IsOverGui) this.HandleFingerDown(this.lastTouch);
    };
    this.runState.runStarted.AddListener(this._run);
    LeanTouch.OnFingerDown.AddListener(this._down);
    LeanTouch.OnFingerUp.AddListener(this._up);
  }

  OnDestroy() {
    this.runState.runStarted.RemoveListener(this._run);
    LeanTouch.OnFingerDown.RemoveListener(this._down);
    LeanTouch.OnFingerUp.RemoveListener(this._up);
  }

  ClearTouch() {
    this.Touching = false;
    this.lastTouch = null;
  }

  HandleFingerDown(f) {
    this.lastTouch = f;
    if (!f.IsOverGui && this.runState.IsRunning) this.Touching = true;
  }

  HandleFingerUp() {
    // multi-finger: stay touching while any non-GUI finger is held
    this.Touching = LeanTouch.anyFingerDown && this.runState.IsRunning;
  }
}

// ---------------------------------------------------------------- PlayerMovement

export class PlayerMovement extends MonoBehaviour {
  static didFirstAccelerate = false;

  constructor() {
    super();
    this._flipDelayCounter = 0;
    this._launch = false;
    this._launchForce = V2();
    this._launchTorque = 0;
    this.speedBoostExpireTime = 0;
    this.speedBoostDirection = V2(1, 0);
    this.Stuck = false;
    this.accelerationSound = null;
    this.flipSound = null;
  }

  get DefaultTopSpeed() {
    return this.defaultTopSpeed;
  }

  get CurrentVelocity() {
    return this.rb.velocity;
  }

  get VerticalForce() {
    if (this.Stuck) return -this.stuckUpForce;
    return this.groundedDownForce * Mathf.Clamp01(this.rb.velocity.length() / this.maxDownforceSpeed);
  }

  get SpeedBoostActive() {
    return Time.fixedTime <= this.speedBoostExpireTime && this.speedBoostExpireTime !== 0;
  }

  get IsPlayingAccelerationSound() {
    return !!this.accelerationSound || !!this.accelerationSoundFadeout;
  }

  Awake() {
    const p = this.flipPivot.localPosition;
    this.rb.centerOfMass = V2(p.x, p.y);
    this._onDeath = () => this.TryStopAccelerationSound();
    this._onStart = () => (PlayerMovement.didFirstAccelerate = false);
    this._onFinish = () => this.KillAccelerationSound();
    this.runState.playerDied.AddListener(this._onDeath);
    this.runState.runStarted.AddListener(this._onStart);
    this.runState.runFinished.AddListener(this._onFinish);
  }

  OnDestroy() {
    this.runState.playerDied.RemoveListener(this._onDeath);
    this.runState.runStarted.RemoveListener(this._onStart);
    this.runState.runFinished.RemoveListener(this._onFinish);
    this.KillAccelerationSound();
    this.flipSound?.Stop();
  }

  OnUpdate() {
    this.EndSpeedBoostEffect();
    if ((this.state.IsGrounded || !this.state.IsTouching) && this.flipSound && !this.flipSoundFadeout) {
      this.flipSoundFadeout = this.StartCoroutine(this.FadeOut('flipSound', 'flipSoundFadeout'));
    }
    if (!this.state.IsGrounded || !this.state.IsTouching) this.TryStopAccelerationSound();
  }

  KillAccelerationSound() {
    if (this.accelerationSound) {
      this.accelerationSound.Stop();
      this.accelerationSound = null;
    }
    if (this.accelerationSoundFadeout) {
      this.StopCoroutine(this.accelerationSoundFadeout);
      this.accelerationSoundFadeout = null;
    }
  }

  TryStopAccelerationSound() {
    if (this.accelerationSound && !this.accelerationSoundFadeout) {
      this.accelerationSoundFadeout = this.StartCoroutine(this.FadeOut('accelerationSound', 'accelerationSoundFadeout'));
    }
  }

  *FadeOut(key, coKey) {
    const snd = this[key];
    const fade = 0.2;
    const start = snd.Source.volume;
    let t = 0;
    while (t < fade) {
      yield null;
      t += Time.deltaTime;
      snd.Source.volume = Mathf.Lerp(start, 0, t / fade);
    }
    snd.Stop();
    this[key] = null;
    this[coKey] = null;
  }

  HandleTutorial() {
    const ft = Tutorials.FirstRun;
    const rb = this.rb;
    if (ft.IsStarted && !this.tutorialConstrained) {
      if (ft.CurrentStep === FirstRunStep.HoldToFlip) {
        this.tutorialConstrained = true;
        this.frozenVelocity = rb.velocity.clone();
        rb.constraints = RigidbodyConstraints2D.FreezePosition;
      }
    } else if (this.tutorialConstrained && ft.CurrentStep === FirstRunStep.LandSafely) {
      this.tutorialConstrained = false;
      rb.constraints = RigidbodyConstraints2D.None;
      rb.velocity = this.frozenVelocity;
      for (const j of this.GetComponents('WheelJoint2D')) if (j.connectedBody) j.connectedBody.velocity = this.frozenVelocity;
      rb.AddTorque(ft.extraReleaseTorque);
    }
    if (ft.IsStarted && ft.CurrentStep === FirstRunStep.HoldToFlip) {
      rb.constraints = this.state.IsTouching ? RigidbodyConstraints2D.FreezePosition : RigidbodyConstraints2D.FreezeAll;
    }
    if (!Tutorials.IsActive && rb.constraints !== RigidbodyConstraints2D.None) rb.constraints = RigidbodyConstraints2D.None;
  }

  OnFixedUpdate() {
    if (this.state.IsDefeated) return;
    this.fixedDeltaTime = Time.fixedDeltaTime;
    const st = this.state;
    if (st.IsFullyGrounded) {
      this.speedBoostGrounded = true;
      const f1 = st.FrontGroundData.forward;
      const f2 = st.BackGroundData.forward;
      const right = xy(this.transform.right);
      this.speedBoostDirection = angle2(f1, right) < angle2(f2, right) ? f1 : f2;
    } else if (this.magnetismChecker.IsBeingAttracted) {
      if (st.IsGrounded) this.speedBoostDirection = (st.FrontGroundData.grounded ? st.FrontGroundData : st.BackGroundData).forward;
      else this.speedBoostDirection = xy(this.transform.right);
    }
    if (this._launch) this.HandleLaunch();
    else if (st.IsGrounded) {
      this.rb.drag = this.groundedLinearDrag;
      this.rb.angularDrag = this.groundedAngularDrag;
      this.HandleGroundMovement();
      this._flipDelayCounter = 0;
    } else {
      this.rb.drag = this.airLinearDrag;
      this.rb.angularDrag = this.airLinearDrag; // (sic) Unity uses airLinearDrag here
      this.HandleAirMovement();
    }
    this.ApplySpeedBoost();
    this.HandleTutorial();
  }

  HandleGroundMovement() {
    this.HandleGroundMovementFor(this.state.FrontGroundData);
    this.HandleGroundMovementFor(this.state.BackGroundData);
    if (this.Stuck) this.HandleAirMovement();
  }

  HandleGroundMovementFor(g) {
    if (!g.grounded) return;
    const up = this.transform.up;
    const vf = this.VerticalForce;
    let accel;
    if (this.state.IsTouching) {
      if (!PlayerMovement.didFirstAccelerate) {
        PlayerMovement.didFirstAccelerate = true;
        this.runState.playerFirstAccelerate.Raise();
      }
      const k = this.accelerationCurve.Evaluate(this.rb.velocity.length() / this.defaultTopSpeed) * this.acceleration * this.fixedDeltaTime;
      accel = g.forward.clone().multiplyScalar(k);
    } else accel = V2();
    const f = V2(accel.x - up.x * vf * this.fixedDeltaTime, accel.y - up.y * vf * this.fixedDeltaTime);
    if (!this.state.IsFullyGrounded) f.multiplyScalar(0.5);
    if (this.applyAccelerationToWheelPositions) this.rb.AddForceAtPosition(f, g.point);
    else this.rb.AddForce(f);
    if (!this.IsPlayingAccelerationSound && this.state.IsTouching && f.length() > 1) {
      this.accelerationSound = AudioService.Play(AudioSampleID.Bike_Acceleration);
    }
  }

  HandleAirMovement() {
    this._flipDelayCounter += this.fixedDeltaTime;
    if (this.state.IsTouching) this.HandleAirAcceleration();
    else this.HandleAirDeceleration();
  }

  HandleAirAcceleration() {
    if (this._flipDelayCounter < this.secondsFlipDelay) return;
    if (!this.flipSound) {
      this.flipSound = AudioService.PlayLooping(AudioSampleID.Bike_Stunt);
      if (this.flipSound) this.flipSound.Source.loop = false;
    }
    const torque = this.flipBackwards ? this.flipAcceleration * this.fixedDeltaTime : -this.flipAcceleration * this.fixedDeltaTime;
    if (this.rb.angularVelocity < this.maxAngularVelocity * (this.flipBackwards ? 1 : -1)) this.rb.AddTorque(torque);
  }

  HandleAirDeceleration() {
    const w = this.rb.angularVelocity;
    const num = (this.flipBackwards ? -1 : 1) * (w > 0 ? 1 : -1);
    if (num <= 0) {
      const k = this.flipDecelerationCurve.Evaluate(Mathf.Clamp01(Math.abs(w) / this.maxAngularVelocity));
      if (w !== 0) this.rb.AddTorque(k * (this.flipDeceleration * this.fixedDeltaTime * num));
    }
  }

  TriggerLaunch(force, torque) {
    AudioService.Play(AudioSampleID.Bike_JumpPad);
    this._launchForce = force;
    this._launchTorque = torque;
    this._launch = true;
  }

  HandleLaunch() {
    this.rb.angularDrag = this.airAngularDrag;
    this.rb.AddForce(this._launchForce, ForceMode2D.Impulse);
    this.rb.AddTorque(this._launchTorque, ForceMode2D.Impulse);
    this._launchTorque = 0;
    this._launch = false;
    this._launchForce = V2();
  }

  TriggerSpeedBoost(accel, topSpeed, duration) {
    this.speedBoostAcceleration = accel;
    this.speedBoostTopSpeed = topSpeed;
    this.speedBoostExpireTime = Time.fixedTime + duration;
    this.speedBoostFeedback?.PlayFeedbacks();
    this.speedBoostGrounded = this.state.IsFullyGrounded;
  }

  ApplySpeedBoost() {
    if (this.SpeedBoostActive && this.rb.velocity.length() < this.speedBoostTopSpeed && this.speedBoostGrounded) {
      const k = this.speedBoostAcceleration * this.fixedDeltaTime * this.rb.mass;
      this.rb.AddForce(this.speedBoostDirection.clone().multiplyScalar(k));
    }
  }

  EndSpeedBoostEffect() {
    if (this.speedBoostExpireTime > 0 && !this.SpeedBoostActive) {
      this.speedBoostFeedback?.StopFeedbacks();
      this.speedBoostExpireTime = 0;
    }
  }
}

// ---------------------------------------------------------------- Grounder

export class Grounder extends MonoBehaviour {
  constructor() {
    super();
    this.groundCheckDistance = 0.5;
    this.ungroundDelay = 0.2;
    this.minAirtimeBetweenGroundFeedbacks = 0.2;
    this.ungroundTimer = 0;
    this.ungroundDetected = false;
    this.airtime = 0;
    this.landingEffect = null;
    this.currentCollider = null;
    this.IsGrounded = false;
    this.GroundData = new GroundData();
    this.CurrentRoadPiece = null;
  }

  SetLandingEffect(e) {
    this.landingEffect = e;
  }

  CalledFixedUpdate() {
    const pos = this.transform.position;
    const up = this.transform.up;
    const hits = Physics2D.RaycastNoTriggers(pos, V2(-up.x, -up.y), this.groundCheckDistance + 1, this.groundLayer, 2);
    let hit = null;
    for (const h of hits) {
      if (h.distance <= this.groundCheckDistance) {
        this.GroundData = new GroundData(true, perpendicularClockwise(h.normal), h.normal.clone(), xy(pos));
        this.ungroundTimer = 0;
        this.UpdateGroundedState(true);
        hit = h;
        break;
      }
    }
    if (!hit) {
      this.GroundData = new GroundData();
      if (!this.ungroundDetected) this.ungroundTimer = this.ungroundDelay;
      this.airtime += Time.fixedDeltaTime;
      this.ungroundDetected = true;
      this.HandleUngroundDetected();
    }
    if (!this.currentCollider || !hit || hit.collider !== this.currentCollider) this.FindConnectableGround(hits);
  }

  FindConnectableGround(hits) {
    for (const h of hits) {
      const col = h.collider;
      if (layerIncludes(this.visibleGroundLayer, col.gameObject)) {
        const piece = col.GetComponent('RoadPiece');
        if (piece) {
          this.currentCollider = col;
          this.CurrentRoadPiece = piece;
          break;
        }
      }
    }
  }

  HandleUngroundDetected() {
    if (this.IsGrounded) {
      this.ungroundTimer -= Time.fixedDeltaTime;
      if (!(this.ungroundTimer > 0)) this.UpdateGroundedState(false);
    }
  }

  UpdateGroundedState(grounded) {
    if (this.IsGrounded === grounded) return;
    this.IsGrounded = grounded;
    if (grounded) {
      this.ungroundDetected = false;
      if (this.landingEffect && this.airtime >= this.minAirtimeBetweenGroundFeedbacks) this.landingEffect.Play(this.CurrentRoadPiece);
      this.airtime = 0;
    }
  }
}

// ---------------------------------------------------------------- PlayerCollisionChecker

export class PlayerCollisionChecker extends MonoBehaviour {
  constructor() {
    super();
    this.IsFrontGrounded = false;
    this.IsBackGrounded = false;
    this.IsHit = false;
    this.Jumped = new EventAction();
    this.GroundedFront = new EventAction();
    this.GroundedBack = new EventAction();
    this.Grounded = new EventAction();
    this.FullyGrounded = new EventAction();
    this.ObstacleHit = new EventAction();
  }

  get FrontGroundData() {
    return this.frontGrounder.GroundData;
  }

  get BackGroundData() {
    return this.backGrounder.GroundData;
  }

  get IsPartiallyGrounded() {
    return this.IsFrontGrounded || this.IsBackGrounded;
  }

  get IsFullyGrounded() {
    return this.IsFrontGrounded && this.IsBackGrounded;
  }

  get FrontGrounder() {
    return this.frontGrounder;
  }

  get BackGrounder() {
    return this.backGrounder;
  }

  Awake() {
    this._wheel = (c) => this.CheckWheelCollision(c);
    this.frontWheelCollision.wheelCollisionEvent.AddListener(this._wheel);
    this.backWheelCollision.wheelCollisionEvent.AddListener(this._wheel);
  }

  Start() {
    this.IsFrontGrounded = true;
    this.IsBackGrounded = true;
  }

  OnFixedUpdate() {
    this.bottomGrounder.CalledFixedUpdate();
    this.frontGrounder.CalledFixedUpdate();
    this.backGrounder.CalledFixedUpdate();
    this.UpdateGroundedState();
  }

  OnCollisionEnter2D(collision) {
    if (this.IsHit) return;
    // only collisions of the colliders attached to this body (not the wheels, which have their own body)
    if (collision.otherCollider.attachedRigidbody?.gameObject !== this.gameObject) return;
    if (layerIncludes(this.groundLayer, collision.gameObject)) this.CheckGroundCollision(collision);
    else if (layerIncludes(this.obstacleLayer, collision.gameObject)) this.OnObstacleHit();
  }

  CheckGroundCollision(collision) {
    const piece = collision.collider.GetComponent('RoadPiece');
    if (piece) {
      const c = collision.contacts[0];
      this.UpdateRoadPiece(new GroundData(true, perpendicularClockwise(c.normal), c.normal.clone(), c.point.clone()), piece, true);
    }
    if (!this.deathIgnoreColliders.includes(collision.otherCollider) && (!piece || !piece.NonLethal)) this.OnObstacleHit();
  }

  CheckWheelCollision(collision) {
    const piece = collision.collider.GetComponent('RoadPiece');
    if (piece) {
      const c = collision.contacts[0];
      this.UpdateRoadPiece(new GroundData(true, perpendicularClockwise(c.normal), c.normal.clone(), c.point.clone()), piece, false);
    }
    if (layerIncludes(this.obstacleLayer, collision.gameObject)) this.OnObstacleHit();
  }

  UpdateGroundedState() {
    this.movement.Stuck = this.bottomGrounder.IsGrounded;
    const f = this.frontGrounder.IsGrounded;
    const b = this.backGrounder.IsGrounded;
    if (f && !this.IsFrontGrounded) this.GroundedFront.Raise();
    if (b && !this.IsBackGrounded) this.GroundedBack.Raise();
    const any = f || b;
    if (this.IsPartiallyGrounded && !any) this.Jumped.Raise();
    else if (!this.IsPartiallyGrounded && any) this.OnGrounded();
    else if (!this.IsFullyGrounded && f && b) this.OnFullyGrounded();
    this.IsFrontGrounded = f;
    this.IsBackGrounded = b;
  }

  OnGrounded() {
    this.Grounded.Raise();
    const g = this.frontGrounder.IsGrounded ? this.frontGrounder : this.backGrounder;
    this.UpdateRoadPiece(g.GroundData, g.CurrentRoadPiece, false);
  }

  OnFullyGrounded() {
    this.FullyGrounded.Raise();
    const g = this.frontGrounder.IsGrounded !== this.IsFrontGrounded ? this.frontGrounder : this.backGrounder;
    this.UpdateRoadPiece(g.GroundData, g.CurrentRoadPiece, false);
  }

  OnObstacleHit() {
    if (this.IsHit) return;
    this.IsHit = true;
    this.ObstacleHit.Raise();
  }

  UpdateRoadPiece(gd, piece, forceBreak) {
    piece?.HandleGlassOnCollision(gd, forceBreak);
  }
}

export class WheelCollisionPropagate extends MonoBehaviour {
  constructor() {
    super();
    this.wheelCollisionEvent = new EventAction();
  }

  OnCollisionEnter2D(collision) {
    if (collision.otherCollider.attachedRigidbody?.gameObject !== this.gameObject) return;
    this.wheelCollisionEvent.Invoke(collision);
  }
}

// ---------------------------------------------------------------- PlayerStuntChecker

export class PlayerStuntChecker extends MonoBehaviour {
  constructor() {
    super();
    this.currentAngle = 0;
    this.currentRotationDegrees = 0;
    this.lastRotationDegrees = 0;
    this.deltaRot = 0;
    this.previousAngle = 0;
    this.flips = new Flips();
    this.previousPosition = new THREE.Vector3();
    this.previousUpTransform = new THREE.Vector3(0, 1, 0);
    this.CurrentAirTime = 0;
    this.IsJumping = false;
    this.perfectLandingEffect = null;
  }

  get TotalFlips() {
    return this.flips.TotalFlips;
  }

  Awake() {
    this.collisionChecker = this.GetComponent(PlayerCollisionChecker);
    this._grounded = () => this.HandleGrounded();
    this.collisionChecker.Grounded.AddListener(this._grounded);
  }

  OnDestroy() {
    this.collisionChecker.Grounded.RemoveListener(this._grounded);
  }

  OnUpdate() {
    if (!this.enabled) return;
    if (this.IsJumping) this.CurrentAirTime += Time.deltaTime;
    else if (!this.collisionChecker.IsPartiallyGrounded) {
      this.Reset();
      this.IsJumping = true;
    }
  }

  OnFixedUpdate() {
    if (!this.enabled || !this.IsJumping) return;
    this.lastRotationDegrees = this.currentRotationDegrees;
    this.UpdateAngle();
    // UpdateRotationTracking
    this.deltaRot = this.previousAngle - this.currentAngle;
    if (Math.abs(this.previousAngle - this.currentAngle) >= 300) this.deltaRot += this.deltaRot > 0 ? -360 : 360;
    this.currentRotationDegrees += Math.abs(this.deltaRot);
    // CheckDirectionChange
    if (this.deltaRot > 0.001 !== this.flips.isFlippingForward) {
      this.flips.isFlippingForward = this.deltaRot > 0.001;
      this.currentRotationDegrees = 0;
    }
    this.previousPosition = this.transform.position;
    this.previousUpTransform = this.transform.up;
    const [did, cur] = this.flips.CheckFlip(this.lastRotationDegrees, this.currentRotationDegrees, this.leniencyDegrees);
    this.currentRotationDegrees = cur;
    if (did) {
      const f = new Flips();
      f.forwardFlips = this.flips.forwardFlips;
      f.backwardFlips = this.flips.backwardFlips;
      this.runState.flipsChanged.Raise(f);
    }
  }

  SetPerfectLandingEffect(e) {
    this.perfectLandingEffect = e;
  }

  GetCurrentJumpData(perfect, front, back) {
    return new JumpData(this.flips, perfect, this.CurrentAirTime, front, back);
  }

  UpdateAngle() {
    this.previousAngle = this.currentAngle;
    this.currentAngle = eulerZ(this.transform.rotation);
  }

  Reset() {
    this.IsJumping = false;
    this.CurrentAirTime = 0;
    this.flips = new Flips();
    this.currentRotationDegrees = 0;
    this.UpdateAngle();
  }

  HandleGrounded() {
    if (!this.IsJumping) return;
    if (this.CurrentAirTime < this.minimumAirTime) this.Reset();
    else this.StartCoroutine(this.AwaitPerfectLandingWindow());
  }

  *AwaitPerfectLandingWindow() {
    let t = 0;
    let perfect = false;
    const up = this.previousUpTransform;
    const hit = Physics2D.RaycastNoTriggers(this.previousPosition, V2(-up.x, -up.y), this.perfectLandingRayCastDistance, this.perfectLandingRayCastMask);
    let hitAngle = 0;
    if (hit) hitAngle = angle2(xy(up), hit.normal);
    do {
      t += Time.deltaTime;
      if (this.collisionChecker.IsFullyGrounded) {
        perfect = !!hit && hitAngle < this.perfectLandingMaxAngle;
        break;
      }
      yield null;
    } while (t < this.perfectTimingWindow);
    const jd = this.GetCurrentJumpData(perfect, this.frontGrounder.CurrentRoadPiece, this.backGrounder.CurrentRoadPiece);
    Game.runState.CompleteJump(jd);
    if (perfect && this.flips.TotalFlips >= 1) {
      this.perfectLandingEffect?.Play();
      AudioService.Play(AudioSampleID.Bike_PerfectLanding);
    }
    this.Reset();
  }

  ForceAngleUpdate() {
    this.currentAngle = eulerZ(this.transform.rotation);
    this.previousAngle = this.currentAngle;
  }
}

// ---------------------------------------------------------------- PlayerMagnetismChecker

const MagnetStatus = { None: 0, NonMagnetic: 1, Magnetic: 2 };
const mmLerp = (mm, t) => mm.min + (mm.max - mm.min) * t;
const mmClamp = (mm, v) => Mathf.Clamp(v, mm.min, mm.max);

export class PlayerMagnetismChecker extends MonoBehaviour {
  constructor() {
    super();
    this.timeSinceLastGroundedInput = 0;
    this.isBeingAttracted = false;
  }

  get IsBeingAttracted() {
    return this.isBeingAttracted;
  }

  get IsSpeedBoosting() {
    return this.movement.SpeedBoostActive;
  }

  Awake() {
    const n = this.raycastResolution;
    const step = this.raycastAngle / (n - 1);
    let a = this.raycastAngle * -0.5;
    this.anglesToCast = [];
    for (let i = 0; i < n; i++) {
      this.anglesToCast.push(a);
      a += step;
    }
    this.anglesToCast.sort((x, y) => Math.abs(x) - Math.abs(y));
    this.defaultDrag = this.frameRigidbody.drag;
    this.defaultGravityScale = this.frontWheel.gravityScale;
  }

  OnUpdate() {
    const fx = (this.magnetismEffect || []).filter(Boolean);
    if (!fx.length) return;
    if (this.isBeingAttracted && !fx[0].isPlaying) fx.forEach((p) => p.Play?.());
    else if (!this.isBeingAttracted && fx[0].isPlaying) fx.forEach((p) => p.Stop?.());
  }

  OnFixedUpdate() {
    const a = this.HandleMagnetism(this.frontWheel, this.backWheel);
    const b = this.HandleMagnetism(this.backWheel, this.frontWheel);
    this.isBeingAttracted = a || b;
    this.frameRigidbody.gravityScale = this.isBeingAttracted ? this.magneticGravityScale : this.defaultGravityScale;
    this.timeSinceLastGroundedInput += Time.fixedDeltaTime;
    if (this.input.Touching || !this.collisionCheck.IsPartiallyGrounded) this.timeSinceLastGroundedInput = 0;
  }

  HandleMagnetism(target, other) {
    const hit = this.TryFindAttractionPoint(target);
    target.gravityScale = hit ? this.magneticGravityScale : this.defaultGravityScale;
    target.drag = hit ? this.CalculateDrag(target, other, hit) : this.defaultDrag;
    return !!hit;
  }

  TryFindAttractionPoint(rb) {
    let best = null;
    const up = this.transform.up;
    const down = V2(-up.x, -up.y);
    for (const ang of this.anglesToCast) {
      const dir = rotate2(down, ang);
      const [status, h] = this.TryFindMagneticPoint(rb.position, dir, this.attractionRange.max);
      if (status === MagnetStatus.None) continue;
      if (status === MagnetStatus.NonMagnetic) break;
      if (!best || h.distance < best.distance) best = h;
    }
    return best;
  }

  CalculateDrag(target, other, hit) {
    const force = this.CalculateAttractionForce(target, hit);
    target.AddForce(force);
    this.TryStabilizeWheel(other, force);
    return mmLerp(this.dragRange, this.speedDragCurve.Evaluate(Math.max(this.timeSinceLastGroundedInput, 0) / this.dragMaximizationTime));
  }

  CalculateAttractionForce(target, hit) {
    const p = target.position;
    const dir = V2(hit.point.x + hit.normal.x * this.roadSnapOffset - p.x, hit.point.y + hit.normal.y * this.roadSnapOffset - p.y).normalize();
    const d = mmClamp(this.attractionRange, hit.distance);
    const t = this.forceCurve.Evaluate((d - this.attractionRange.min) / (this.attractionRange.max - this.attractionRange.min));
    return dir.multiplyScalar(mmLerp(this.IsSpeedBoosting ? this.attractionForceBoosted : this.attractionForce, t));
  }

  TryStabilizeWheel(target, force) {
    const [status] = this.TryFindMagneticPoint(target.position, force, this.stabilizationDistance);
    if (status === MagnetStatus.Magnetic) target.AddForce(force);
  }

  TryFindMagneticPoint(pos, dir, dist) {
    const hit = Physics2D.RaycastNoTriggers(pos, dir, dist, this.magneticMask);
    if (!hit) return [MagnetStatus.None, null];
    const piece = hit.collider.GetComponent('RoadPiece');
    if (!piece || !piece.IsMagnetic) return [MagnetStatus.NonMagnetic, hit];
    return [MagnetStatus.Magnetic, hit];
  }
}

// ---------------------------------------------------------------- GravityModifiable

export class GravityModifiable extends MonoBehaviour {
  constructor() {
    super();
    this.affectedRigidbodies = [];
    this.activeGravityModifiers = [];
    this.isBeingModified = false;
    this.currentGravityModifier = V2();
  }

  OnFixedUpdate() {
    if (!this.isBeingModified) return;
    const g = Physics2D.gravity;
    for (const rb of this.affectedRigidbodies) {
      if (!rb) continue;
      const k = rb.mass * rb.gravityScale;
      rb.AddForce(V2((this.currentGravityModifier.x - g.x) * k, (this.currentGravityModifier.y - g.y) * k));
    }
  }

  UpdateCurrentGravityModifier(mod) {
    this.isBeingModified = mod;
    if (mod) {
      const sum = V2();
      for (const v of this.activeGravityModifiers) sum.add(v);
      this.currentGravityModifier = sum.divideScalar(this.activeGravityModifiers.length);
    } else this.currentGravityModifier = V2();
  }

  _index(v) {
    return this.activeGravityModifiers.findIndex((x) => x.x === v.x && x.y === v.y);
  }

  AddGravityOverride(v) {
    if (this._index(v) < 0) {
      this.activeGravityModifiers.push(v.clone());
      this.UpdateCurrentGravityModifier(true);
    }
  }

  RemoveGravityOverride(v) {
    const i = this._index(v);
    if (i >= 0) {
      this.activeGravityModifiers.splice(i, 1);
      this.UpdateCurrentGravityModifier(this.activeGravityModifiers.length > 0);
    }
  }

  ResetState() {
    this.activeGravityModifiers = [];
    this.UpdateCurrentGravityModifier(false);
  }
}

export class GravityModifiableSelfUpdate extends GravityModifiable {
  FixedUpdate() {
    this.OnFixedUpdate();
  }
}

// ---------------------------------------------------------------- helpers on the player prefab

export class EdgeColliderStretcher extends MonoBehaviour {
  constructor() {
    super();
    this.lastLength = 0;
  }

  OnEnable() {
    this.UpdateCollider();
  }

  FixedUpdate() {
    this.UpdateCollider();
  }

  UpdateCollider() {
    if (!this.edgeCollider || !this.anchorsInOrder) return;
    let len = 0;
    const pts = this.anchorsInOrder.map((a) => {
      const p = this.transform.InverseTransformPoint(a.position);
      return V2(p.x, p.y);
    });
    for (let i = 1; i < pts.length; i++) len += pts[i - 1].distanceTo(pts[i]);
    if (Math.abs(len - this.lastLength) > 0.003) {
      this.edgeCollider.points = pts;
      this.lastLength = len;
    }
  }
}

export class FakeFloor extends MonoBehaviour {
  Awake() {
    this.transform.SetParent(null);
    this._edge = this.GetComponent('EdgeCollider2D');
    this._rb = this.GetComponent('Rigidbody2D');
    this._lastFollowPos = xy(this.followTarget.position);
    this._lastUp = V2(0, 1);
  }

  FixedUpdate() {
    if (!this.followTarget || this.followTarget.gameObject._destroyed) return;
    this._edge.enabled = this.playerState.IsGrounded || Math.abs(this.followRigidbody.angularVelocity) <= this.maxFollowAngularVelocity;
    const fp = this.followTarget.position;
    const vel = V2(fp.x - this._lastFollowPos.x, fp.y - this._lastFollowPos.y);
    const dt = Time.fixedDeltaTime;
    const fu = this.followTarget.up;
    const origin = V2(fp.x + vel.x * dt, fp.y + vel.y * dt);
    const hit = Physics2D.RaycastNoTriggers(origin, V2(-fu.x, -fu.y), this.maxGroundCheckDistance, this.groundLayer);
    let targetUp;
    let pos;
    if (hit) {
      pos = new THREE.Vector3(hit.point.x + hit.normal.x * this.followOffset, hit.point.y + hit.normal.y * this.followOffset, this.transform.position.z);
      targetUp = hit.normal.clone();
    } else {
      pos = new THREE.Vector3(fp.x - fu.x * this.maxGroundCheckDistance, fp.y - fu.y * this.maxGroundCheckDistance, this.transform.position.z);
      targetUp = V2(fu.x, fu.y);
    }
    this._lastFollowPos = xy(fp);
    if (angle2(this._lastUp, targetUp) >= this.rotationSmoothingThresholdAngle) {
      const d = this._lastUp.clone().sub(targetUp);
      const maxStep = this.rotationSmoothingFactor * Time.deltaTime;
      const l = d.length();
      targetUp = l <= maxStep ? targetUp : this._lastUp.clone().add(targetUp.clone().sub(this._lastUp).multiplyScalar(maxStep / l));
    }
    // kinematic body: move it like Unity's transform write + autoSyncTransforms
    this.transform.position = pos;
    this.transform.up = new THREE.Vector3(targetUp.x, targetUp.y, 0);
    this._lastUp = targetUp;
  }
}

export class PlayerSnapToGroundOnSpawn extends MonoBehaviour {
  Awake() {
    this.StartCoroutine(this.SnapToGround(3));
  }

  *SnapToGround(maxFrames) {
    for (let i = 0; i < maxFrames; i++) {
      const up = this.transform.up;
      const hit = Physics2D.RaycastNoTriggers(this.transform.position, V2(-up.x, -up.y), this.groundCheckDistance + 1, this.groundLayer);
      if (hit) {
        const off = this.groundSpawnOffset || [0, 0];
        this.transform.position = new THREE.Vector3(hit.point.x + off[0], hit.point.y + off[1], this.transform.position.z);
        return;
      }
      yield null;
    }
  }
}

// ---------------------------------------------------------------- vehicle visuals

export class PlayerVehicle extends MonoBehaviour {
  Awake() {
    this._localPosition = this.transform.localPosition;
    this.enabled = !!this.wheelPhysicsTrans;
  }

  get TrailSocket() {
    return this.trailSocket;
  }

  SetWheelTransform(t) {
    this.wheelPhysicsTrans = t;
    this.enabled = !!t;
  }

  LateUpdate() {
    if (!this.wheelPhysicsTrans) return;
    const q = this.wheelPhysicsTrans.rotation;
    for (const w of this.wheelPositions || []) if (w) w.rotation = q;
  }

  SetMaterial(card, rank) {
    const mat = card.items[Math.min(rank, card.items.length - 1)];
    const vs = Game.visualSettings;
    const block = new MaterialPropertyBlock();
    for (const r of this.renderers || []) {
      if (!r) continue;
      r.materials = [mat];
      r.GetPropertyBlock(block);
      block.SetFloat('_EmissionAmount', vs?.bikeEmission ?? 1);
      r.SetPropertyBlock(block);
    }
  }
}

export class BasicLandingEffect extends MonoBehaviour {
  Play(piece) {
    if (this.runState.IsRunning && !piece) return;
    const vs = Game.visualSettings;
    if (vs) {
      const v = piece?.IsNonStaticPiece ? vs.dynamicRoadVisuals : vs.staticRoadVisuals;
      const bl = v?.basicLanding;
      if (bl) {
        this.sparks?.SetColors?.(bl.sparksStartColor, bl.sparksColorOverLifetime);
        this.impact?.SetColors?.(bl.impactStartColor, bl.impactColorOverLifetime);
        this.flash?.SetColors?.(bl.flashStartColor, bl.flashColorOverLifetime);
      }
    }
    this.feedback?.PlayFeedbacks();
  }
}

export class PerfectLandingEffect extends MonoBehaviour {
  Play() {
    if (this.runState.IsRunning) this.feedback?.PlayFeedbacks();
  }

  SetEffect(prefab) {
    if (!this.particlePlay) return;
    if (this.particlePlay.BoundParticleSystem) Destroy(this.particlePlay.BoundParticleSystem.gameObject);
    try {
      this.particlePlay.BoundParticleSystem = Instantiate(prefab, this.transform);
    } catch (e) {
      console.warn('landing effect', e.message);
    }
  }

  PlayLandingParticle() {
    this.particlePlay?.BoundParticleSystem?.Play?.();
  }
}

export class TrailEffect extends MonoBehaviour {
  Show(v = true) {
    this.gameObject.SetActive(!!v);
  }
}

export class PlayerExplosion extends MonoBehaviour {
  static instances = [];

  Awake() {
    if (!this.runState?.Mode) return;
    if (this.runState.IsRunning || this.runState.RunEndState.deathReason === DeathReason.RunReset) AudioService.Play(AudioSampleID.Bike_Death);
    const len = this.disappearLength || { min: 8, max: 10 };
    for (const p of this.parts || []) p?.Setup(len.min + Math.random() * (len.max - len.min), this.despawnBelow ?? -10);
    PlayerExplosion.instances.push(this.gameObject);
    if (PlayerExplosion.instances.length >= 4) {
      const old = PlayerExplosion.instances.shift();
      if (old && !old._destroyed) Destroy(old);
    }
  }

  Update() {
    if (this.transform.childCount === 0) {
      PlayerExplosion.instances = PlayerExplosion.instances.filter((g) => g !== this.gameObject);
      Destroy(this.gameObject);
    }
  }
}

export class PlayerExplosionPart extends MonoBehaviour {
  constructor() {
    super();
    this.disappearTime = -1;
    this.currentTime = 0;
    this.despawnBelow = -10;
  }

  Setup(len, h) {
    this.disappearTime = len;
    this.currentTime = len;
    this.despawnBelow = h;
  }

  Update() {
    if (this.transform.position.y < this.despawnBelow) Destroy(this.gameObject);
    else if (this.disappearTime >= 0) {
      this.currentTime -= Time.deltaTime;
      const s = this.animationScale ? this.animationScale.Evaluate((this.disappearTime - this.currentTime) / this.disappearTime) : 1;
      this.transform.localScale = new THREE.Vector3(s, s, s);
      if (this.currentTime <= 0) Destroy(this.gameObject);
    }
  }
}

export class RandomForce2D extends MonoBehaviour {
  Start() {
    const rb = this.GetComponent('Rigidbody2D');
    if (!rb) return;
    const f = this.force || this.forceRange || { min: 2, max: 6 };
    const mag = typeof f === 'number' ? f : (f.min ?? 2) + Math.random() * ((f.max ?? 6) - (f.min ?? 2));
    const ang = Math.random() * Math.PI * 2;
    rb.AddForce(V2(Math.cos(ang) * mag, Math.abs(Math.sin(ang)) * mag), ForceMode2D.Impulse);
    if (this.torque) rb.AddTorque((Math.random() * 2 - 1) * (this.torque.max ?? this.torque), ForceMode2D.Impulse);
  }
}

for (const [cls, name] of [
  [Player, 'Player'],
  [PlayerInput, 'PlayerInput'],
  [PlayerMovement, 'PlayerMovement'],
  [Grounder, 'Grounder'],
  [PlayerCollisionChecker, 'PlayerCollisionChecker'],
  [WheelCollisionPropagate, 'WheelCollisionPropagate'],
  [PlayerStuntChecker, 'PlayerStuntChecker'],
  [PlayerMagnetismChecker, 'PlayerMagnetismChecker'],
  [GravityModifiable, 'GravityModifiable'],
  [GravityModifiableSelfUpdate, 'GravityModifiableSelfUpdate'],
  [EdgeColliderStretcher, 'EdgeColliderStretcher'],
  [FakeFloor, 'FakeFloor'],
  [PlayerSnapToGroundOnSpawn, 'PlayerSnapToGroundOnSpawn'],
  [PlayerVehicle, 'PlayerVehicle'],
  [BasicLandingEffect, 'BasicLandingEffect'],
  [PerfectLandingEffect, 'PerfectLandingEffect'],
  [TrailEffect, 'TrailEffect'],
  [PlayerExplosion, 'PlayerExplosion'],
  [PlayerExplosionPart, 'PlayerExplosionPart'],
  [RandomForce2D, 'RandomForce2D'],
]) {
  registerComponent(cls, name);
}
