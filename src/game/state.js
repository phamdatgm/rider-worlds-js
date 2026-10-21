// Runtime-state ScriptableObjects shared between components (RunState, PlayerState, RunTimer, ...).
import * as THREE from 'three';
import { EventAction, Time } from '../engine/core.js';
import { ScriptableObject, registerSO } from '../engine/instantiate.js';
import { AudioService, AudioSampleID } from '../engine/audio.js';
import { Currencies } from '../meta/currency.js';
import { RunsTracker } from '../meta/runstracker.js';

export const DeathReason = { None: 0, Obstacle: 1, OutOfBounds: 2, FloorImpact: 3, RunCancel: 4, RunReset: 5, TutorialFailure: 6 };
export const EndState = { None: 0, Victory: 1, Defeat: 2 };
export const RunMode = { Endless: 1, TimedLevel: 2, SeededEndless: 4, Bonus: 8 };
export const ChunkType = { Normal: 0, Start: 1, Finish: 2, Special: 3 };
export const CurrencyType = { Soft: 0, Hard: 1, Bonus: 2 };
export const RevivalState = { Prompt: 0, Success: 1, Cancelled: 2, Timeout: 3 };
export const ReviveQualification = { NoRevivesLeft: -1, None: 0, Distance: 1, Score: 2, Challenge: 3, BonusMeter: 4, Cheat: 5 };

export class ReviveQualificationData {
  constructor(reason, progress, challengeSlot = null) {
    this.reason = reason;
    this.progress = progress;
    this.timeShown = 0;
    this.challengeSlot = challengeSlot;
  }
}

/** Shared singletons the gameplay code reaches through GameManager.Instance in Unity. */
export const Game = {
  manager: null, // GameManager component
  get runState() {
    return Game.manager?.RunState;
  },
};

export class Flips {
  constructor() {
    this.currentFlips = 0;
    this.isFlippingForward = false;
    this.forwardFlips = 0;
    this.backwardFlips = 0;
    this.singleFlips = 0;
    this.doubleFlips = 0;
    this.tripleFlips = 0;
    this.quadrupleFlips = 0;
    this.quintupleFlips = 0;
  }

  get TotalFlips() {
    return this.forwardFlips + this.backwardFlips;
  }

  AddFlip() {
    this.currentFlips++;
    if (this.isFlippingForward) this.forwardFlips++;
    else this.backwardFlips++;
  }

  /** returns [didFlip, newCurrentRotationDegrees] */
  CheckFlip(lastRotationDegrees, currentRotationDegrees, leniencyDegrees) {
    const nextFullRotation = (Math.floor(lastRotationDegrees / 360) + 1) * 360;
    let rotation = currentRotationDegrees;
    if (this.TotalFlips === 0) {
      rotation += leniencyDegrees;
      if (rotation > nextFullRotation) currentRotationDegrees += leniencyDegrees;
    }
    if (rotation > nextFullRotation) {
      this.AddFlip();
      return [true, currentRotationDegrees];
    }
    return [false, currentRotationDegrees];
  }

  AddFlipCount(n) {
    if (n === 0) return;
    if (n === 1) this.singleFlips++;
    else if (n === 2) this.doubleFlips++;
    else if (n === 3) this.tripleFlips++;
    else if (n === 4) this.quadrupleFlips++;
    else this.quintupleFlips++;
  }

  clone() {
    return Object.assign(new Flips(), this);
  }
}

export class JumpData {
  constructor(flips = new Flips(), perfect = false, airtime = 0, front = null, back = null) {
    this.flips = flips.clone();
    this.perfect = perfect;
    this.airtime = airtime;
    this.frontPiece = front;
    this.backPiece = back;
  }

  get TotalFlips() {
    return this.flips.forwardFlips + this.flips.backwardFlips;
  }

  CalculateJumpScore(s) {
    let score = s.perFlip * this.TotalFlips;
    if (this.perfect) score *= s.perfectMultiplier;
    return score;
  }
}

// ---------------------------------------------------------------- PlayerState

export class PlayerState extends ScriptableObject {
  constructor() {
    super();
    this._player = null;
    this.StartingX = 0;
  }

  get Player() {
    return this._player;
  }

  SetPlayer(p) {
    this._player = p;
  }

  HasPlayer() {
    return !!this._player;
  }

  get IsDefeated() {
    return !!this._player && this._player.CollisionChecker.IsHit;
  }

  get FrontGroundData() {
    return this._player.CollisionChecker.FrontGroundData;
  }

  get BackGroundData() {
    return this._player.CollisionChecker.BackGroundData;
  }

  get IsGrounded() {
    if (!this._player) return false;
    return this.FrontGroundData.grounded || this.BackGroundData.grounded;
  }

  get IsFullyGrounded() {
    if (!this._player) return false;
    return this.FrontGroundData.grounded && this.BackGroundData.grounded;
  }

  get IsTouching() {
    return !!this._player && this._player.Input.Touching;
  }

  get FlipsInCurrJump() {
    return this._player ? this._player.StuntChecker.TotalFlips : 0;
  }

  get IsJumping() {
    return !!this._player && this._player.StuntChecker.IsJumping;
  }

  get CurrentAirTime() {
    return this._player ? this._player.StuntChecker.CurrentAirTime : 0;
  }

  get Position() {
    return this._player ? this._player.transform.position : new THREE.Vector3();
  }

  get DistanceX() {
    return this.Position.x - this.StartingX;
  }

  GetCurrentJumpData(perfect) {
    return this._player ? this._player.StuntChecker.GetCurrentJumpData(perfect, null, null) : new JumpData();
  }

  ResetStartPositionTracker() {
    this.StartingX = this.Position.x;
  }

  ReplaceWithCurrentVehicle() {
    this._player?.OnVehicleChanged();
  }

  GetVelocity() {
    return this._player.GetVelocity();
  }
}

// ---------------------------------------------------------------- RunStartState / RunEndState / RunTimer

export class RunStartState extends ScriptableObject {
  constructor() {
    super();
    this.seed = 0;
    this.mode = null;
  }

  get RunMode() {
    return this.mode ? this.mode.RunMode : RunMode.Endless;
  }

  get HasActiveMode() {
    return !!this.mode;
  }

  Reset() {
    this.mode = null;
    this.seed = 0;
  }
}

export class RunEndState extends ScriptableObject {
  constructor() {
    super();
    this.endState = EndState.None;
    this.deathReason = DeathReason.None;
  }

  get IsDefeated() {
    return this.endState === EndState.Defeat;
  }

  get IsVictorious() {
    return this.endState === EndState.Victory;
  }

  Reset() {
    this.endState = EndState.None;
    this.deathReason = DeathReason.None;
  }
}

/** Stopwatch based on real time (like System.Diagnostics.Stopwatch) that pauses with timeScale 0. */
export class RunTimer extends ScriptableObject {
  constructor() {
    super();
    this.elapsed = 0;
    this.running = false;
    this.subtract = 0;
  }

  Initialize(runState) {
    this.runState = runState;
    this._start = () => this.StartTimer();
    this._stop = () => this.StopTimer();
    this._reset = () => this.ResetTimer();
    runState.playerFirstAccelerate.AddListener(this._start);
    runState.runFinished.AddListener(this._stop);
    runState.playerDied.AddListener(this._stop);
    runState.runStarted.AddListener(this._reset);
    this.StartTimer();
  }

  DeInitialize() {
    const rs = this.runState;
    if (!rs) return;
    rs.playerFirstAccelerate.RemoveListener(this._start);
    rs.runFinished.RemoveListener(this._stop);
    rs.playerDied.RemoveListener(this._stop);
    rs.runStarted.RemoveListener(this._reset);
  }

  tick(dt) {
    if (this.running && Time.timeScale > 0) this.elapsed += dt;
  }

  StartTimer() {
    this.subtract = 0;
    this.elapsed = 0;
    this.running = true;
  }

  StopTimer() {
    this.running = false;
  }

  ResetTimer() {
    this.subtract = 0;
    this.elapsed = 0;
    this.running = false;
  }

  GetElapsedTime(applyReduction = true) {
    return applyReduction ? this.elapsed - this.subtract : this.elapsed;
  }

  DidTimerStart() {
    return this.elapsed > 0;
  }

  SubtractTime(seconds) {
    this.subtract += seconds;
  }

  GetSubtractedTime() {
    return this.subtract;
  }
}

// ---------------------------------------------------------------- statistics

export class StatisticsTrackerState {
  constructor(runState) {
    this.runState = runState;
    this.OnSoftCurrencyChanged = new EventAction();
    this.OnHardCurrencyChanged = new EventAction();
    this.OnBonusCurrencyChanged = new EventAction();
    this.jumpData = new JumpData();
    this.Score = 0;
    this.DistanceRaw = 0;
    this.ChunksPassed = 0;
    this.DistanceOnRoad = 0;
    this.DistancePenalty = 0;
    this.SoftCurrency = 0;
    this.BonusLetterCurrency = 0;
    this.HardCurrency = 0;
    this.Jumps = 0;
    this.PerfectLandings = 0;
    this.Revives = 0;
    this.RvRevivesClaimed = 0;
    this.RevivesClaimed = 0;
    this.LastReviveQualification = null;
    this.LastReviveDismissTime = 0;
    this._onJump = (j) => this.OnJumpCompleted(j);
  }

  get Distance() {
    return this.DistanceRaw - this.DistancePenalty;
  }

  get TotalFlips() {
    return this.jumpData.flips.TotalFlips;
  }

  get BonusLetterCurrencyTotal() {
    return this.BonusLetterCurrency + Currencies.Bonus.value;
  }

  Start() {
    this.runState.jumpCompleted.AddListener(this._onJump);
  }

  Stop() {
    this.runState.jumpCompleted.RemoveListener(this._onJump);
  }

  OnJumpCompleted(jump) {
    this.jumpData.airtime += jump.airtime;
    this.jumpData.flips.backwardFlips += jump.flips.backwardFlips;
    this.jumpData.flips.forwardFlips += jump.flips.forwardFlips;
    this.jumpData.flips.AddFlipCount(jump.TotalFlips);
    this.Jumps++;
    if (jump.perfect) this.PerfectLandings++;
  }

  SetDistance(d) {
    this.DistanceRaw = d;
  }

  SetChunksPassed(n) {
    this.ChunksPassed = n;
  }

  AddDistancePenalty(p) {
    if (p > 0) this.DistancePenalty += p;
  }

  AddScore(add) {
    this.Score += add;
    this.runState.scoreAdded.Raise(add);
    this.runState.scoreChanged.Raise(this.Score);
  }

  AddDistanceOnRoad(d) {
    this.DistanceOnRoad += d;
  }

  AddSoftCurrency(n) {
    this.SoftCurrency += n;
    this.OnSoftCurrencyChanged.Invoke(this.SoftCurrency);
  }

  AddHardCurrency(n) {
    this.HardCurrency += n;
    this.OnHardCurrencyChanged.Invoke(this.HardCurrency);
  }

  AddRevive(qualification) {
    this.LastReviveQualification = qualification;
    this.Revives++;
  }

  AddRvRevive() {
    this.RvRevivesClaimed++;
  }

  AddReviveClaimResult(didClaim, dismissTime) {
    if (didClaim) this.RevivesClaimed++;
    this.LastReviveDismissTime = dismissTime;
  }

  AddBonusLetterCurrency(n) {
    this.BonusLetterCurrency += n;
    this.OnBonusCurrencyChanged.Invoke(this.BonusLetterCurrencyTotal);
  }
}

// ---------------------------------------------------------------- RunState

export class RunState extends ScriptableObject {
  constructor() {
    super();
    this.runStarted = new EventAction();
    this.initializeChunks = new EventAction();
    this.playerFirstAccelerate = new EventAction();
    this.playerDied = new EventAction();
    this.runFinished = new EventAction();
    this.flipsChanged = new EventAction();
    this.jumpCompleted = new EventAction();
    this.scoreChanged = new EventAction();
    this.scoreAdded = new EventAction();
    this.runRespawnPlayer = new EventAction();
    this.playerSpawned = new EventAction();
    this.revivePrompted = new EventAction();
    this.reviveAnswered = new EventAction();
    this.IsRunning = false;
    this.IsInRun = false;
    this.FlowDirector = null;
    this.statTracker = null;
    this.previousStatTracker = null;
    this.GameManager = null;
    this.PrevMode = null;
  }

  // serialized refs: placement, playerState, runStartState, runTimer, runEndState, pickupController, ...
  get PlayerState() {
    return this.playerState;
  }

  get RunStartState() {
    return this.runStartState;
  }

  get AnalyticsRunsTracker() {
    return RunsTracker;
  }

  get RunTimer() {
    return this.runTimer;
  }

  get RunEndState() {
    return this.runEndState;
  }

  get PickupController() {
    return this.pickupController;
  }

  get StatTracker() {
    return this.statTracker;
  }

  get PreviousStatTracker() {
    return this.previousStatTracker;
  }

  get Mode() {
    return this.runStartState.mode;
  }

  get RunChunkTracker() {
    return this.GameManager?.RoadChunkManager;
  }

  Initialize(gm) {
    this.GameManager = gm;
  }

  SetFlowDirector(fd) {
    this.FlowDirector = fd;
  }

  SetNewMode(mode) {
    this.runStartState.Reset();
    this.RunResetStats();
    mode?.Initialize(this);
  }

  StartRun() {
    if (!this.runStartState.mode) return;
    this.initializeChunks.Raise();
    this.IsRunning = true;
    this.IsInRun = true;
    this.Mode.Begin(this);
    this.RunResetStats();
    this.statTracker.Start();
    this.playerState.ResetStartPositionTracker();
    this.playerState.ReplaceWithCurrentVehicle();
    Game.music?.PlayGameMusic();
    this.runStarted.Raise();
  }

  Finish(reason, state) {
    if (!this.IsRunning) return;
    this.IsRunning = false;
    this.runEndState.endState = state;
    this.runEndState.deathReason = reason;
    this.playerDied.Raise();
    this.statTracker.SetChunksPassed(this.GameManager.RoadChunkManager.CurrentChunkIndex);
    this.statTracker.SetDistance(this.playerState.DistanceX);
    if (state !== EndState.Victory) {
      if (this.Mode.ResumeWithRevive(this, () => this.FinalizeRunFinish(), () => this.ReviveResumeRun())) return;
    }
    this.FinalizeRunFinish();
  }

  RunResetStats() {
    this.previousStatTracker = this.statTracker;
    this.statTracker = new StatisticsTrackerState(this);
    this.runEndState.Reset();
  }

  CleanUpPreviousRun() {
    this.PrevMode = this.runStartState.mode;
    this.runStartState.mode = null;
    this.statTracker?.Stop();
  }

  CompleteJump(jumpData) {
    this.jumpCompleted.Raise(jumpData);
  }

  ReviveResumeRun() {
    this.runEndState.Reset();
    const gm = this.GameManager;
    const respawn = gm.RoadChunkManager.GetCurrentChunkStartPoint().add(new THREE.Vector3(1, 1, 0));
    const done = () => {
      gm.RoadChunkManager.ResetCurrentChunk();
      this.runRespawnPlayer.Raise(respawn);
      gm.CameraRig.ResetValuesForGameMode();
    };
    if (this.Mode.RunMode === RunMode.TimedLevel) done();
    else {
      gm.CameraRig.MoveToRespawnPos(respawn, done);
      this.statTracker.AddDistancePenalty(this.playerState.DistanceX - this.statTracker.DistanceRaw);
    }
    this.IsRunning = true;
  }

  FinalizeRunFinish() {
    this.IsInRun = false;
    this.runFinished.Raise();
    this.statTracker.Stop();
    this.Mode.Finished(this);
  }
}

// ---------------------------------------------------------------- PickupController

/** Unity serializes int/enum arrays as little-endian int32 hex strings */
function hexInts(h) {
  const out = [];
  for (let i = 0; i + 8 <= h.length; i += 8) out.push(parseInt(h.slice(i + 6, i + 8) + h.slice(i + 4, i + 6) + h.slice(i + 2, i + 4) + h.slice(i, i + 2), 16) | 0);
  return out;
}

export class PickupController extends ScriptableObject {
  constructor() {
    super();
    this.pitchResetTime = 0.5;
    this.lastSoftCurrencyTime = -10;
    this.lastSoftCurrencyCount = -1;
  }

  get tracker() {
    return this.runState.StatTracker;
  }

  ProcessCurrencyPickup(type, amount) {
    if (type === CurrencyType.Soft) this.HandleSoftCurrencyPickup(amount);
    else if (type === CurrencyType.Hard) this.tracker.AddHardCurrency(amount);
    else this.tracker.AddBonusLetterCurrency(amount);
  }

  HandleSoftCurrencyPickup(amount) {
    const now = performance.now() / 1000;
    if (now >= this.lastSoftCurrencyTime + this.pitchResetTime) this.lastSoftCurrencyCount = -1;
    this.tracker.AddSoftCurrency(amount);
    if (typeof this.softCurrencySounds === 'string') this.softCurrencySounds = hexInts(this.softCurrencySounds);
    const sounds = this.softCurrencySounds && this.softCurrencySounds.length ? this.softCurrencySounds : [3001, 3002, 3003, 3004, 3005, 3006, 3007];
    this.lastSoftCurrencyCount = Math.min(this.lastSoftCurrencyCount + 1, sounds.length - 1);
    AudioService.Play(sounds[this.lastSoftCurrencyCount]);
    this.lastSoftCurrencyTime = now;
  }
}

export class TutorialStub extends ScriptableObject {
  get IsStarted() {
    return false;
  }

  get IsNotStarted() {
    return false;
  }

  get IsFinished() {
    return true;
  }

  get State() {
    return 2;
  }
}

for (const [cls, name] of [
  [PlayerState, 'PlayerState'],
  [RunStartState, 'RunStartState'],
  [RunEndState, 'RunEndState'],
  [RunTimer, 'RunTimer'],
  [RunState, 'RunState'],
  [PickupController, 'PickupController'],
]) {
  registerSO(cls, name);
}

export { AudioSampleID };
