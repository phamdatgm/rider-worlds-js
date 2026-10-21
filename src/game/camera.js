// CameraRig + a small Cinemachine emulation (FramingTransposer with group framing, Composer, blends, noise/shake).
import * as THREE from 'three';
import { MonoBehaviour, GameObject, awakeObject } from '../engine/scene.js';
import { Time } from '../engine/core.js';
import { Mathf, Deg2Rad } from '../engine/math.js';
import { Render } from '../engine/render.js';
import { Instantiate, registerComponent } from '../engine/instantiate.js';
import { Game, RunMode } from './state.js';
import { FeedbackEvents } from './mmfeedbacks.js';

const damp = (initial, dampTime, dt) => (dampTime <= 1e-4 || dt <= 0 ? initial : initial * (1 - Math.exp((-4.60517 * dt) / dampTime)));

/** Settings of MainGame.unity "Default Cam" (CinemachineVirtualCamera + FramingTransposer). */
const DEFAULT_VCAM = {
  fov: 60,
  transposer: {
    m_ScreenX: 0.25,
    m_ScreenY: 0.45,
    m_XDamping: 0.5,
    m_YDamping: 0.4,
    m_ZDamping: 1,
    m_CameraDistance: 10,
    m_GroupFramingMode: 2,
    m_AdjustmentMode: 1,
    m_GroupFramingSize: 0.4,
    m_MinimumDistance: 1,
    m_MaximumDistance: 5000,
    m_TrackedObjectOffset: [0, 0, 0],
  },
};

/** Damped camera state for one virtual camera. */
class VcamState {
  constructor() {
    this.pos = null;
    this.quat = new THREE.Quaternion();
    this.fov = 60;
  }
}

function groupBounds(points) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) {
    min.min(p);
    max.max(p);
  }
  return { center: min.clone().add(max).multiplyScalar(0.5), size: max.clone().sub(min) };
}

/** Evaluate a FramingTransposer-driven camera: returns desired camera position (no damping). */
function framingTransposer(t, points, fov, aspect, screenX) {
  const b = groupBounds(points);
  const off = t.m_TrackedObjectOffset || [0, 0, 0];
  const target = b.center.clone().add(new THREE.Vector3(off[0], off[1], -(off[2] || 0)));
  let dist = t.m_CameraDistance ?? 10;
  const tanHalf = Math.tan((fov * Deg2Rad) / 2);
  if (points.length > 1 && (t.m_GroupFramingMode ?? 2) !== 3) {
    const mode = t.m_GroupFramingMode ?? 2;
    let h = 0;
    if (mode === 0) h = b.size.x / aspect;
    else if (mode === 1) h = b.size.y;
    else h = Math.max(b.size.y, b.size.x / aspect);
    h /= Math.max(t.m_GroupFramingSize ?? 0.8, 1e-3);
    if ((t.m_AdjustmentMode ?? 1) !== 0) dist = Mathf.Clamp(h / (2 * tanHalf), t.m_MinimumDistance ?? 1, t.m_MaximumDistance ?? 5000);
  }
  const hh = dist * tanHalf;
  const hw = hh * aspect;
  const sx = screenX ?? t.m_ScreenX ?? 0.5;
  const sy = t.m_ScreenY ?? 0.5;
  // Cinemachine screen space: x 0 = left, y 0 = top
  return new THREE.Vector3(target.x - (sx - 0.5) * 2 * hw, target.y + (sy - 0.5) * 2 * hh, target.z + dist);
}

function followPoints(follow) {
  if (!follow) return [];
  const group = follow.gameObject.GetComponent('CinemachineTargetGroup');
  if (group && group.m_Targets) {
    const pts = group.m_Targets.filter((x) => x.target && x.weight > 0).map((x) => x.target.position);
    if (pts.length) return pts;
  }
  return [follow.position];
}

/** Wrapper around an exported CinemachineVirtualCamera component (+ its "cm" pipeline child). */
export class VirtualCameraEval {
  constructor(vcamComp) {
    this.vcam = vcamComp;
    const cm = vcamComp.transform.children.find((c) => c.gameObject.GetComponent('CinemachinePipeline')) || vcamComp.transform;
    this.transposer = cm.gameObject.GetComponent('CinemachineFramingTransposer');
    this.composer = cm.gameObject.GetComponent('CinemachineComposer');
    this.state = new VcamState();
  }

  evaluate(dt, aspect) {
    const v = this.vcam;
    const fov = v.m_Lens?.FieldOfView ?? 60;
    const follow = v.m_Follow;
    const lookAt = v.m_LookAt;
    const st = this.state;
    st.fov = fov;
    if (this.transposer && follow) {
      const desired = framingTransposer(this.transposer, followPoints(follow), fov, aspect);
      dampTowards(st, desired, this.transposer, dt);
      st.quat.identity();
    } else {
      st.pos = v.transform.position;
      if (this.composer && lookAt) {
        const m = new THREE.Matrix4().lookAt(st.pos, lookAt.position, new THREE.Vector3(0, 1, 0));
        st.quat.setFromRotationMatrix(m);
      } else st.quat.copy(v.transform.rotation);
    }
    return st;
  }
}

function dampTowards(st, desired, t, dt) {
  if (!st.pos || dt <= 0) {
    st.pos = desired.clone();
    return;
  }
  const d = desired.clone().sub(st.pos);
  st.pos.x += damp(d.x, t.m_XDamping ?? 1, dt);
  st.pos.y += damp(d.y, t.m_YDamping ?? 1, dt);
  st.pos.z += damp(d.z, t.m_ZDamping ?? 1, dt);
}

/** Static menu / garage preview vcams of the MainGame "Camera Rig" (Unity coords, converted on use). */
const STATIC_CAMS = {
  menu: { p: [12, 5.5, -13], q: [0.15249424, -0.3178016, 0.051866636, 0.93437546], fov: 20 },
  vehicle: { p: [12, 4.17, -13], q: [0.15229456, -0.3213171, 0.052439205, 0.933173], fov: 20 },
  trail: { p: [31.55, 4.3, -26.1], q: [0.083288, -0.39271995, 0.035740305, 0.9151813], fov: 20 },
  landing: { p: [27.31, 3.6, -42.22], q: [0.06637249, -0.26702303, 0.018437913, 0.961225], fov: 20 },
  death: { p: [12.59, 2.6, -62.7], q: [0.05544798, -0.08441646, 0.0047048316, 0.99487555], fov: 20 },
};

function staticEval(name) {
  const c = STATIC_CAMS[name];
  const st = new VcamState();
  st.pos = new THREE.Vector3(c.p[0], c.p[1], -c.p[2]);
  st.quat.set(-c.q[0], -c.q[1], c.q[2], c.q[3]);
  st.fov = c.fov;
  return { evaluate: () => st };
}

// ---------------------------------------------------------------- CameraRig

export class CameraRig extends MonoBehaviour {
  constructor() {
    super();
    this.respawnPanTime = 1;
    this.flipScreenXWhenMovingBackward = true;
    this.screenXTransitionDistance = 25;
    this.screenXLeftOffset = -0.15;
    this.followBody = null;
    this.defaultState = new VcamState();
    this.override = null; // { eval, weight, target, duration }
    this.blends = [];
    this.shake = null;
    this.instant = true;
  }

  Awake() {
    Game.cameraRig = this;
    this.camera = Render.camera;
    this.screenXMovingRight = DEFAULT_VCAM.transposer.m_ScreenX;
    this.screenXMovingLeft = 1 - this.screenXMovingRight + this.screenXLeftOffset;
    this.screenX = this.screenXMovingRight;
    this.ResetSpeedData();
    // targets: vehicle target + Min/Max Y markers (SameXCoordinateAsOther) like the scene's Camera Rig
    this.camTarget = new THREE.Vector3();
    this.minY = { startY: -2, y: -2 };
    this.maxY = { startY: 10, y: 10 };
    this._targetStartY = null;
    this._shake = (dur, amp, freq) => (this.shake = { t: 0, dur, amp: Math.min(amp, 2), freq });
    FeedbackEvents.cameraShake.AddListener(this._shake);
  }

  OnDestroy() {
    FeedbackEvents.cameraShake.RemoveListener(this._shake);
  }

  Initialize(runState) {
    this.runState = runState;
    this._died = () => this.HandlePlayerDeath();
    this._spawned = (p) => this.FollowPlayer(p);
    runState.playerDied.AddListener(this._died);
    runState.playerSpawned.AddListener(this._spawned);
  }

  DeInitialize() {
    this.runState?.playerDied.RemoveListener(this._died);
    this.runState?.playerSpawned.RemoveListener(this._spawned);
  }

  SetVisuals(settings) {
    if (!settings) return;
    Render.setBackground(settings.cameraBackgroundColor || [0, 0.1, 0.35, 1]);
    if (this.worldFx) this.worldFx.gameObject?.SetActive?.(false);
    if (settings.cameraEffectPrefab) {
      try {
        if (!this.fxHolder) {
          this.fxHolder = new GameObject('World FX Container');
          awakeObject(this.fxHolder);
        }
        this.worldFx = Instantiate(settings.cameraEffectPrefab, this.fxHolder.transform, false);
      } catch (e) {
        console.warn('camera fx', e.message);
      }
    }
  }

  PauseWorldFx(shouldPause) {
    const systems = this.worldFx?.GetComponentsInChildren?.('ParticleSystem', true) || [];
    for (const ps of systems) {
      if (shouldPause) ps.Pause(false);
      else ps.Play(false);
    }
  }

  /** Camera.WorldToViewportPoint of the main camera */
  WorldToViewportPoint(p) {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    return { x: (v.x + 1) / 2, y: (v.y + 1) / 2, z: v.z };
  }

  WorldToScreenPoint(p) {
    const v = this.WorldToViewportPoint(p);
    const [w, h] = Render.viewSize();
    return { x: v.x * w, y: v.y * h, z: v.z };
  }

  ResetSpeedData() {
    this.screenXTransitionValue = this.screenXTransitionDistance;
  }

  ResetValuesForGameMode() {
    this.ResetSpeedData();
  }

  FollowPlayer(player) {
    this.followBody = player.Rigidbody2D;
    const p = player.transform.position;
    if (!this.playerIsDead) this.camTarget.copy(p);
    this.playerIsDead = false;
    if (this._targetStartY === null) {
      this._targetStartY = p.y;
      this.minY.offset0 = p.y - this.minY.startY;
      this.maxY.offset0 = p.y - this.maxY.startY;
      this.lastOrigin = p.clone();
    }
    this.following = true;
  }

  HandlePlayerDeath() {
    this.playerIsDead = true;
    this.followBody = null;
    this.following = false;
    this.ResetSpeedData();
  }

  SnapNextFrame() {
    this.instant = true;
  }

  MoveToRespawnPos(target, cb) {
    const start = this.camTarget.clone();
    this.lastOrigin = target.clone();
    const self = this;
    if (this.moveCo) this.StopCoroutine(this.moveCo);
    this.moveCo = this.StartCoroutine((function* () {
      let l = 0;
      const speed = 1 / self.respawnPanTime;
      while (l < 1) {
        l += Time.deltaTime * speed;
        self.camTarget.lerpVectors(start, target, Math.min(l, 1));
        yield null;
      }
      cb?.();
      self.moveCo = null;
    })());
  }

  /** Called by CameraOverrideVolume */
  ActivateOverride(vcamComp, blendIn) {
    if (!vcamComp) return;
    if (!vcamComp._eval) vcamComp._eval = new VirtualCameraEval(vcamComp);
    if (this.override && this.override.vcam === vcamComp) {
      this.override.target = 1;
      this.override.duration = blendIn;
      return;
    }
    if (this.override) this.blends.push({ ...this.override, target: 0 });
    vcamComp._eval.state.pos = null;
    this.override = { vcam: vcamComp, eval: vcamComp._eval, weight: 0, target: 1, duration: blendIn };
  }

  DeactivateOverride(vcamComp, blendOut) {
    if (this.override && this.override.vcam === vcamComp) {
      this.override.target = 0;
      this.override.duration = blendOut;
    }
  }

  ClearOverrides() {
    this.override = null;
    this.blends = [];
  }

  /** menu / garage cameras (Menu Cam, VehiclePreviewCam, ...); null returns to the gameplay camera */
  // ---- CameraRig API used by the menu UI (Cinemachine priorities -> static views)
  SwitchToMetaScreen() {
    this._metaBlend = 0.25;
  }

  MetaScreenSwitchToMenu() {
    this.SetStaticView('menu', this._metaBlend ?? 0.25);
  }

  MetaScreenSwitchToVehiclePreview() {
    this.SetStaticView('vehicle', this._metaBlend ?? 0.25);
  }

  MetaScreenSwitchToTrailEffectsPreview() {
    this.SetStaticView('trail', this._metaBlend ?? 0.25);
  }

  MetaScreenSwitchToLandEffectsPreview() {
    this.SetStaticView('landing', this._metaBlend ?? 0.25);
  }

  MetaScreenSwitchToDeathEffectsPreview() {
    this.SetStaticView('death', this._metaBlend ?? 0.25);
  }

  /** MainCamera.Show(bool): pages without the game camera (shop, settings) hide the 3D view */
  MainCameraShow(show) {
    Render.hideWorld = !show;
  }

  SetStaticView(name, blend = 0.25) {
    if ((this.staticView?.name || null) === (name || null)) return;
    if (this.staticView) this.blends.push({ ...this.staticView, target: 0, duration: blend });
    this.staticView = name ? { name, eval: staticEval(name), weight: 0, target: 1, duration: blend } : null;
    if (blend <= 0 && this.staticView) this.staticView.weight = 1;
  }

  sameX(m) {
    // SameXCoordinateAsOther with maxYDistanceBeforeFollow 18 / maxYDistanceDownBeforeFollow -2
    const delta = this.camTarget.y - m.startY - m.offset0;
    let y = m.startY;
    if (delta >= 18) y = m.startY + (delta - 18);
    else if (delta <= -2) y = m.startY + (delta + 2);
    m.y = y;
    return new THREE.Vector3(this.camTarget.x, y, 0);
  }

  LateUpdate() {
    const dt = this.instant ? 0 : Time.deltaTime;
    if (this.following && this.followBody && !this.followBody.gameObject._destroyed) {
      const p = this.followBody.transform.position;
      this.camTarget.set(p.x, p.y, 0);
      if (this.flipScreenXWhenMovingBackward && this.lastOrigin) {
        this.screenXTransitionValue = Mathf.Clamp(this.screenXTransitionValue + (p.x - this.lastOrigin.x), 0, this.screenXTransitionDistance);
        this.screenX = Mathf.Lerp(this.screenXMovingLeft, this.screenXMovingRight, this.screenXTransitionValue / this.screenXTransitionDistance);
        this.lastOrigin = p.clone();
      }
    }
    if (this.minY.offset0 === undefined) return;
    const aspect = this.camera.aspect;
    // default vcam
    const pts = [this.camTarget.clone(), this.sameX(this.minY), this.sameX(this.maxY)];
    const desired = framingTransposer(DEFAULT_VCAM.transposer, pts, DEFAULT_VCAM.fov, aspect, this.screenX);
    dampTowards(this.defaultState, desired, DEFAULT_VCAM.transposer, dt);
    let pos = this.defaultState.pos.clone();
    let quat = new THREE.Quaternion();
    let fov = DEFAULT_VCAM.fov;
    // blends (outgoing overrides first, then the current one)
    const layers = [...this.blends, this.override, this.staticView].filter(Boolean);
    for (const L of layers) {
      const st = L.eval.evaluate(dt, aspect);
      const speed = L.duration > 0 ? Time.deltaTime / L.duration : 1;
      if (L.target > L.weight) L.weight = Math.min(L.weight + speed, L.target);
      else if (L.target < L.weight) L.weight = Math.max(L.weight - speed, L.target);
      if (this.instant) L.weight = L.target;
      const w = L.weight * L.weight * (3 - 2 * L.weight); // ease in-out
      pos.lerp(st.pos, w);
      quat.slerp(st.quat, w);
      fov += (st.fov - fov) * w;
    }
    this.blends = this.blends.filter((b) => b.weight > 0 || b.target > 0);
    const sv = this.staticView?.weight ?? 0;
    Render.closeUpWeight = Math.max(sv, ...this.blends.filter((b) => b.name).map((b) => b.weight));
    if (this.override && this.override.target === 0 && this.override.weight <= 0) this.override = null;
    // shake (MMCinemachineCameraShaker)
    if (this.shake) {
      const s = this.shake;
      s.t += Time.deltaTime;
      if (s.t >= s.dur) this.shake = null;
      else {
        const k = s.amp * (1 - s.t / s.dur) * 0.15;
        const ph = s.t * s.freq;
        pos.x += Math.sin(ph * 6.1) * k;
        pos.y += Math.sin(ph * 7.3 + 1.7) * k;
      }
    }
    this.camera.position.copy(pos);
    this.camera.quaternion.copy(quat);
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    // "World FX Container" is a child of the vcam: it sits at the camera
    if (this.fxHolder) this.fxHolder.transform.position = pos.clone();
    this.instant = false;
  }
}

// ---------------------------------------------------------------- CameraOverrideVolume / ConstrainedFollowTarget

export class CameraOverrideVolume extends MonoBehaviour {
  constructor() {
    super();
    this.triggerLayer = 8;
    this.deactivateOnRespawnInsteadOfDeath = 1;
    this.activationCooldown = 1;
    this.blendInDuration = 1;
    this.useSeparateBlendOut = 0;
    this.blendOutDuration = 1;
    this.isActive = false;
    this.timeSince = 0;
  }

  Awake() {
    this._respawn = () => {
      this.activationRequested = false;
      this.deactivationRequested = false;
      if (this.deactivateOnRespawnInsteadOfDeath) this.Deactivate(true);
    };
    Game.runState?.playerSpawned.AddListener(this._respawn);
  }

  OnDestroy() {
    Game.runState?.playerSpawned.RemoveListener(this._respawn);
    if (this.isActive) Game.cameraRig?.DeactivateOverride(this.targetVirtualCamera, 0.5);
  }

  Update() {
    this.timeSince += Time.deltaTime;
    if (this.timeSince < this.activationCooldown) return;
    if (this.activationRequested) this.Activate();
    if (this.deactivationRequested) this.Deactivate();
  }

  OnTriggerEnter2D(other) {
    if (((1 << other.gameObject.layer) & this.triggerLayer) !== 0) {
      this.activationRequested = true;
      this.deactivationRequested = false;
    }
  }

  OnTriggerExit2D(other) {
    if (((1 << other.gameObject.layer) & this.triggerLayer) !== 0 && (!this.deactivateOnRespawnInsteadOfDeath || !Game.runState.PlayerState.IsDefeated)) {
      this.activationRequested = false;
      this.deactivationRequested = true;
    }
  }

  Activate() {
    if (this.isActive || !this.targetVirtualCamera) return;
    this.activationRequested = false;
    this.isActive = true;
    this.timeSince = 0;
    Game.cameraRig?.ActivateOverride(this.targetVirtualCamera, this.blendInDuration);
  }

  Deactivate(force) {
    if (!this.isActive && !force) return;
    this.isActive = false;
    this.deactivationRequested = false;
    this.timeSince = 0;
    Game.cameraRig?.DeactivateOverride(this.targetVirtualCamera, this.useSeparateBlendOut ? this.blendOutDuration : this.blendInDuration);
  }
}

export class ConstrainedFollowTarget extends MonoBehaviour {
  LateUpdate() {
    const player = Game.runState?.PlayerState?.Player;
    if (!player || !this.selfConstraint || !this.followTargetConstraint || !this.retarget) return;
    const p = player.transform.position;
    const tb = this.followTargetConstraint.bounds;
    const tx = Mathf.InverseLerp(tb.min.x, tb.max.x, p.x);
    const ty = Mathf.InverseLerp(tb.min.y, tb.max.y, p.y);
    const sb = this.selfConstraint.bounds;
    this.retarget.position = new THREE.Vector3(Mathf.Lerp(sb.min.x, sb.max.x, tx), Mathf.Lerp(sb.min.y, sb.max.y, ty), this.retarget.position.z);
  }
}

for (const [cls, name] of [
  [CameraOverrideVolume, 'CameraOverrideVolume'],
  [ConstrainedFollowTarget, 'ConstrainedFollowTarget'],
]) {
  registerComponent(cls, name);
}
