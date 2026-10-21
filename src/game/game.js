// GameManager, run modes (Endless / Timed Level), revive rules, progress saving (scoring: HUD JumpBonusManager).
import * as THREE from 'three';
import { MonoBehaviour, GameObject, World, awakeObject, Destroy, DestroyImmediate, flushDestroy } from '../engine/scene.js';
import { Time, WaitForSeconds, WaitForSecondsRealtime, Coroutines } from '../engine/core.js';
import { Physics2D } from '../engine/physics2d.js';
import { Instantiate, PrefabRef, getRuntimeSO } from '../engine/instantiate.js';
import { Assets, loadPrefabDeep, getPrefabJson, loadWantedMeshes } from '../engine/assets.js';
import { AudioService } from '../engine/audio.js';
import { Game, RunMode, EndState, DeathReason, StatisticsTrackerState, RevivalState, ReviveQualification, ReviveQualificationData } from './state.js';
import { BaseChunkManager, RoadChunkManager, ChunkCollection, SpawnStyle, EndlessChunkProcess } from './chunks.js';
import { CameraRig } from './camera.js';
import { SoftCurrencyPool } from './world.js';
import { FeedbackEvents } from './mmfeedbacks.js';
import { UI } from './uihooks.js';
import { PlayerRank } from '../meta/rank.js';
import { MAX_BONUS_LETTERS } from '../meta/bonus.js';
import { Save } from '../meta/save.js';
import { CardService, CardType, RANK_TYPES } from '../meta/cards.js';
import { ChallengeManager } from '../meta/challenges.js';
import { LevelUnlocks } from '../meta/worlds.js';
import { Tutorials } from '../meta/tutorials.js';

// ---------------------------------------------------------------- worlds / cosmetics

export function worldSettings(i) {
  return getRuntimeSO(Assets.manifest.worlds[i].settings);
}

/** Prefab ref pointing at the first component of `type` on the prefab root (like a typed prefab field). */
function typedRef(id, type) {
  const json = getPrefabJson(id);
  const idx = json ? (json.nodes[0].c || []).findIndex((c) => c.$type === type) : -1;
  return new PrefabRef(id, idx >= 0 ? [0, idx] : undefined);
}

const ITEM_COMPONENT = { 10000: 'PlayerVehicle', 30000: 'TrailEffect', 31000: 'ParticleSystem', 32000: 'ParticleSystem' };

function cardItems(card) {
  const comp = ITEM_COMPONENT[card.Type];
  return (card.def.items || []).map((it) => (it?.$prefab && comp ? typedRef(it.$prefab, comp) : it));
}

/**
 * Game.cards = the equipped cosmetics (card items + selected rank) the Player reads. `overrides` maps a card
 * type to {card, rank} for temporary previews in the garage.
 */
export function setupCards(overrides = {}) {
  const pick = (type) => {
    const o = overrides[type];
    const card = o?.card || CardService.Equipped(type);
    return [card ? { items: cardItems(card) } : null, o ? o.rank : card?.CurrentRank || 0];
  };
  const [vehicle, vehicleRank] = pick(CardType.Vehicle);
  const [color, colorRank] = pick(CardType.VehicleColor);
  const [trail, trailRank] = pick(CardType.VehicleTrail);
  const [landing, landingRank] = pick(CardType.VehicleLanding);
  const [death, deathRank] = pick(CardType.VehicleDeath);
  Game.cards = { vehicle, vehicleRank, color, colorRank, trail, trailRank, landing, landingRank, death, deathRank };
}

/** prefab ids of a card's items (all ranks) */
export function cardPrefabIds(card) {
  return (card?.def.items || []).filter((it) => it?.$prefab).map((it) => it.$prefab);
}

export function cosmeticPrefabIds() {
  return RANK_TYPES.flatMap((t) => cardPrefabIds(CardService.Equipped(t)));
}

/** load the prefabs + meshes of cards before showing them on the player (garage) */
export async function loadCards(cards) {
  const ids = [...new Set(cards.flatMap((c) => cardPrefabIds(c)))];
  await Promise.all(ids.map((id) => loadPrefabDeep(id).catch((e) => console.warn('prefab', id, e.message))));
  await loadWantedMeshes();
}

// ---------------------------------------------------------------- modes

export class EndlessMode {
  constructor(world) {
    this.world = world;
    this.RunMode = RunMode.Endless;
    this.UniqueName = `Endless_World${world}`;
    const ws = worldSettings(world);
    this.ws = ws;
    this.endlessSettings = getRuntimeSO('MonoBehaviour/Endless Mode Settings');
    this.Settings = { JumpBonusScore: this.endlessSettings.jumpBonusScore, JumpBonusTimeReduction: null, VisualSettings: ws.visualSettings, ComplimentLanding: true, TracksScore: true, TracksTime: false };
    this.ChunkProcess = EndlessChunkProcess;
    this.AreFtueChunksAllowed = false;
  }

  get RoadChunks() {
    return ChunkCollection.fromSO(this.ws.roadChunks);
  }

  get BackgroundChunks() {
    return ChunkCollection.fromSO(this.ws.backgroundChunks);
  }

  get FlowDirectorConfig() {
    return this.ws.flowDirectorConfig;
  }

  prefabIds() {
    return [...(this.ws.roadChunks?.chunks || []), ...(this.ws.backgroundChunks?.chunks || [])].filter(Boolean).map((r) => r.id);
  }

  Initialize(rs) {
    rs.RunStartState.mode = this;
  }

  Begin(rs) {
    rs.AnalyticsRunsTracker.AddEndlessRun();
    // EndlessModeID.Update: endless play time while the run lasts
    Coroutines.start(
      (function* () {
        while (rs.IsRunning) {
          rs.AnalyticsRunsTracker.AddEndlessRunTime();
          yield null;
        }
      })(),
      null,
    );
    // EndlessModeChunkProcess.OnRunStart listens to runStarted (raised after the stat tracker is reset)
    const once = () => {
      rs.runStarted.RemoveListener(once);
      this.ChunkProcess.OnRunStart(rs);
    };
    rs.runStarted.AddListener(once);
  }

  Finished(rs) {
    const st = rs.StatTracker;
    this.ChunkProcess.OnRunFinish(rs);
    this.ProcessRunStats(st);
    // EndlessModeID.GetRewards: gems collected + bonus letters (XP is 0 in the shipped data); claimed in the menu
    const mult = this.endlessSettings.calculateSoftCurrency?.values?.global ?? 1;
    const rewards = [
      { id: 'Currency_Soft', amount: Math.round(st.SoftCurrency * mult), type: 'Endless' },
      { id: 'Currency_Bonus', amount: st.BonusLetterCurrency, type: 'Endless' },
    ].filter((r) => r.amount > 0);
    Save.data.runEarnings = rewards.length ? rewards : null;
    Save.save();
  }

  /** EndlessModeSaveDataHandler.ProcessRunStats */
  ProcessRunStats(st) {
    const hs = Save.endless(this.world);
    const max = (k, v) => {
      if (hs[k] < v) {
        hs[k] = v;
        return true;
      }
      return false;
    };
    hs.lastScore = st.Score;
    this.newBest = max('highScore', st.Score);
    max('softCurrency', st.SoftCurrency);
    max('bonusLetterCurrency', st.BonusLetterCurrency);
    max('jumps', st.Jumps);
    max('flips', st.TotalFlips);
    max('airtime', st.jumpData.airtime);
    max('distanceTraveled', st.Distance);
    max('distanceTraveledOnRoad', st.DistanceOnRoad);
    const today = new Date().toDateString();
    if (!hs.daily || hs.daily.date !== today) hs.daily = { date: today, runs: 0, totalScore: 0, totalDistance: 0 };
    hs.daily.runs++;
    hs.daily.totalScore += st.Score;
    hs.daily.totalDistance += st.Distance;
    hs.chunksPassed += Math.max(0, st.ChunksPassed - 1);
    hs.runs++;
    hs.previousDistance = st.Distance;
  }

  /** EndlessReviveSettings.CheckAllReviveQualifications (first match wins) */
  CheckAllReviveQualifications(rs) {
    const s = this.endlessSettings.revive || {};
    const st = rs.StatTracker;
    // QualifiedWithBonusMeter
    if (PlayerRank.IsBonusUnlocked) {
      const remaining = MAX_BONUS_LETTERS - st.BonusLetterCurrencyTotal;
      if (remaining <= (s.bonusLetters ?? 5) && this.ChunkProcess.IsLetterNearby(s.chunksAwayFromNextBonusLetter ?? 1)) return new ReviveQualificationData(ReviveQualification.BonusMeter, remaining * 100);
    }
    // QualifiesWithScore: strictly between 0 and the world high score, at least highScore.chance of the way
    const high = Save.endless(this.world).highScore || 0;
    if (st.Score > 0 && st.Score < high) {
      const p = st.Score / high;
      if (p >= (s.highScore?.chance ?? 0)) return new ReviveQualificationData(ReviveQualification.Score, Math.round(p * 100));
    }
    // QualifiesWithChallenges
    for (const c of ChallengeManager.Slotted) {
      if (!c.tracking || !c.CanTriggerRevive || c.IsCompleted || c.IsClaimed || !c.UseSteps) continue;
      const p = c.StepProgress;
      const pct = Math.round(p * 100);
      if (p >= (s.challenge?.chance ?? 0) && pct < 100) {
        const i = ChallengeManager.slots.indexOf(c);
        return new ReviveQualificationData(ReviveQualification.Challenge, pct, getRuntimeSO(`MonoBehaviour/World Challenge Slot ${i + 1}`));
      }
    }
    // QualifiedWithDistance (distance / minimumDistance >= 1)
    const progress = st.Distance / (s.minimumDistance ?? 30);
    if (progress >= 1) return new ReviveQualificationData(ReviveQualification.Distance, Number.isFinite(progress) ? Math.floor(progress * 100) : 0);
    return new ReviveQualificationData(ReviveQualification.None, 0);
  }

  /** EndlessModeID.ResumeWithRevive: the HUD shows the revive prompt (revivePrompted -> reviveAnswered) */
  ResumeWithRevive(rs, die, revive) {
    // RunState.Finish only offers revives once the first-run tutorial is finished
    if (rs.RunEndState.deathReason === DeathReason.RunCancel || !Tutorials.FirstRun.IsFinished) return false;
    const q = this.CheckAllReviveQualifications(rs);
    if (q.reason < ReviveQualification.Distance) return false;
    rs.StatTracker.AddRevive(q);
    const answer = (state) => {
      rs.reviveAnswered.RemoveListener(answer);
      rs.StatTracker.AddReviveClaimResult(state === RevivalState.Success, 1);
      if (state === RevivalState.Success) revive();
      else die();
    };
    rs.reviveAnswered.AddListener(answer);
    rs.revivePrompted.Raise();
    return true;
  }
}

export class TimedLevelMode {
  constructor(level) {
    this.level = level;
    this.RunMode = RunMode.TimedLevel;
    this.UniqueName = `Level ${level.world + 1}-${['Easy', 'Moderate', 'Difficult'][level.difficulty]}-${level.number}`;
    this.ws = worldSettings(level.world);
    const ctrl = getRuntimeSO('MonoBehaviour/TimedLevelModeController');
    this.Settings = {
      JumpBonusScore: null,
      JumpBonusTimeReduction: ctrl?.settings?.jumpBonusTimeReduction || { perFlip: 0.5, perfectMultiplier: 2 },
      VisualSettings: this.ws.visualSettings,
      ComplimentLanding: false,
      TracksScore: false,
      TracksTime: true,
    };
    this.ChunkProcess = null;
    this.FlowDirectorConfig = null;
    this.AreFtueChunksAllowed = false;
  }

  get RoadChunks() {
    return new ChunkCollection(this.level.chunks.map((id) => typedRef(id, 'RiderChunk')));
  }

  get BackgroundChunks() {
    return ChunkCollection.fromSO(this.ws.backgroundChunks);
  }

  prefabIds() {
    return [...this.level.chunks, ...(this.ws.backgroundChunks?.chunks || []).filter(Boolean).map((r) => r.id)];
  }

  Initialize(rs) {
    rs.RunStartState.mode = this;
  }

  Begin(rs) {
    rs.AnalyticsRunsTracker.AddTimedLevelRun();
    Save.level(this.level.id, true).attempts++;
    Save.setDirty();
  }

  GetEarnedStars(seconds) {
    if (seconds <= this.level.threeStarTime) return 3;
    if (seconds <= this.level.twoStarTime) return 2;
    return 1;
  }

  Finished(rs) {
    if (this.reviveCo) Coroutines.stop(this.reviveCo);
    if (!rs.RunEndState.IsVictorious) return;
    const t = rs.RunTimer.GetElapsedTime(true);
    const s = Save.level(this.level.id, true);
    this.lastTime = t;
    this.earned = this.GetEarnedStars(t);
    this.newStars = this.earned > s.stars;
    // TimedLevelModeID.GetRewards: one rank star the first time the level gets 3 stars
    Save.data.runEarnings = this.newStars && this.earned === 3 ? [{ id: 'Currency_Star', amount: 1, type: 'TimedLevel' }] : null;
    s.stars = Math.max(s.stars, this.earned);
    this.newBest = s.best < 0 || t < s.best;
    if (this.newBest) s.best = t;
    Save.save();
  }

  /** TimedLevelMode.ResumeWithRevive: restart the level from its start behind a fade */
  ResumeWithRevive(rs, die, revive) {
    // RunState.Finish only offers revives once the first-run tutorial is finished
    if (rs.RunEndState.deathReason === DeathReason.RunCancel || !Tutorials.FirstRun.IsFinished) return false;
    if (this.reviveCo) Coroutines.stop(this.reviveCo);
    const delay = getRuntimeSO('MonoBehaviour/TimedLevelSettings')?.reviveRespawnDelay ?? 1;
    const gm = Game.manager;
    this.reviveCo = gm.StartCoroutine((function* () {
      yield new WaitForSeconds(delay);
      if (!rs.Mode) return;
      yield* UI.fadeToBlack();
      rs.RunResetStats();
      revive();
      rs.StatTracker.Start();
      rs.PlayerState.ResetStartPositionTracker();
      rs.PlayerState.ReplaceWithCurrentVehicle();
      rs.runStarted.Raise();
      gm.RoadChunkManager.ResetCurrentChunk();
      rs.RunTimer.ResetTimer();
      yield* UI.fadeFromBlack();
    })());
    return true;
  }

  get NextLevel() {
    const l = this.level;
    return Assets.manifest.levels.find((x) => x.world === l.world && x.difficulty === l.difficulty && x.number === l.number + 1) || null;
  }
}

/** levels unlock per difficulty page through the rank track */
export function isLevelUnlocked(level) {
  return LevelUnlocks.IsLevelUnlocked(level);
}

export function worldStars(world) {
  return Assets.manifest.levels.filter((l) => l.world === world).reduce((a, l) => a + Save.level(l.id).stars, 0);
}

// ---------------------------------------------------------------- scene reset

export function clearScene() {
  // persistent roots (DontDestroyOnLoad UI, the Menu scene canvas) survive the game scene reload
  for (const go of [...World.objects]) if (!go.transform.parent && !go._persistent) DestroyImmediate(go);
  // behaviours of the persistent roots (a Menu loaded before this reload) keep their Start/Update
  const alive = (b) => !b._destroyed && b.gameObject && !b.gameObject._destroyed;
  World.pendingStart = World.pendingStart.filter(alive);
  World.pendingDestroy = [];
  for (const b of [...World.behaviours]) if (!alive(b)) World.behaviours.delete(b);
  Physics2D.events = [];
  Physics2D.pairs.clear();
  Coroutines.list = Coroutines.list.filter((c) => !c.done && (!c.owner || (c.owner.gameObject && !c.owner.gameObject._destroyed)));
}

// ---------------------------------------------------------------- GameManager

export class GameManager extends MonoBehaviour {
  constructor() {
    super();
    this.gameOverScreenDelay = 1;
    this.player = null;
  }

  get RoadChunkManager() {
    return this.roadChunkManager;
  }

  get CameraRig() {
    return this.cameraRig;
  }

  /** Build the MainGame scene for `mode` (prefabs must be loaded) */
  Setup(mode) {
    Game.manager = this;
    this.RunState = getRuntimeSO('MonoBehaviour/Run State');
    const rs = this.RunState;
    rs.Initialize(this);
    rs.SetNewMode(mode);
    Game.visualSettings = mode.Settings.VisualSettings;
    Game.roadPieceSettings = getRuntimeSO('MonoBehaviour/RoadPieceSettings');
    Game.softCurrencyPool = new SoftCurrencyPool(new PrefabRef(Assets.manifest.softCurrencyPickup));

    const mk = (name, Type, pos) => {
      const go = new GameObject(name);
      if (pos) go.transform.position = pos;
      const c = go.AddComponent(Type);
      awakeObject(go);
      return c;
    };
    this.cameraRig = mk('Camera Rig', CameraRig);
    this.cameraRig.Initialize(rs);
    this.cameraRig.SetVisuals(Game.visualSettings);
    this.roadChunkManager = mk('Chunk Controller', RoadChunkManager).configure({ activeChunksBehind: 2, activeChunksAhead: 1, useStartChunk: true, chunksPerSpawn: 1 });
    this.backgroundChunkManager = mk('Background Chunk Controller', BaseChunkManager, new THREE.Vector3(-50, 0, 0)).configure({ activeChunksBehind: 3, activeChunksAhead: 1, useStartChunk: false, chunksPerSpawn: 1 });
    // the HUD canvas' JumpBonusManager registers itself (Awake) when the HUD scene loads
    this.jumpBonusManager = null;
    this.roadChunkManager.Initialize(rs);
    this.backgroundChunkManager.Initialize(rs);

    this._respawn = (p) => this.SpawnPlayer(p);
    this._over = () => this.OnGameOver();
    this._init = () => this.OnInitializeChunks();
    rs.runRespawnPlayer.AddListener(this._respawn);
    rs.runFinished.AddListener(this._over);
    rs.initializeChunks.AddListener(this._init);
    rs.RunTimer.Initialize(rs);
    this._freeze = (d) => this.StartCoroutine(this.FreezeFrame(d));
    FeedbackEvents.freezeFrame.AddListener(this._freeze);
    this.IntializeRun();
  }

  OnDestroy() {
    const rs = this.RunState;
    if (!rs) return;
    rs.RunTimer.DeInitialize();
    rs.runRespawnPlayer.RemoveListener(this._respawn);
    rs.runFinished.RemoveListener(this._over);
    rs.initializeChunks.RemoveListener(this._init);
    this.cameraRig?.DeInitialize();
    FeedbackEvents.freezeFrame.RemoveListener(this._freeze);
    Time.timeScale = 1;
  }

  *FreezeFrame(d) {
    Time.timeScale = 0;
    yield new WaitForSecondsRealtime(d);
    Time.timeScale = 1;
  }

  Update() {
    if (Time.timeScale > 0) this.RunState.RunTimer.tick(Time.unscaledDeltaTime);
  }

  IntializeRun() {
    const rs = this.RunState;
    const mode = rs.Mode;
    const rcm = this.roadChunkManager;
    rcm.SetStyle(mode.RunMode === RunMode.TimedLevel ? SpawnStyle.FixedChunk : SpawnStyle.Endless);
    rcm.SetFlowDirectorConfig(mode.FlowDirectorConfig);
    if (mode.RunMode === RunMode.Endless) Game.setDistanceMarkers?.(this);
    this.SpawnPlayer(new THREE.Vector3(2, 0.5, 0));
    rcm.SetChunkCollection(mode.RoadChunks);
    this.backgroundChunkManager.SetChunkCollection(mode.BackgroundChunks);
    rcm.InitializeStartChunk();
    this.backgroundChunkManager.InitializeStartChunk();
    if (!this.backgroundChunkManager.HasStartChunkToSpawn) this.backgroundChunkManager.InitializeNonStartChunks();
    this.cameraRig.SnapNextFrame();
  }

  OnInitializeChunks() {
    this.roadChunkManager.InitializeNonStartChunks();
    if (this.backgroundChunkManager.HasStartChunkToSpawn) this.backgroundChunkManager.InitializeNonStartChunks();
  }

  SpawnPlayer(position) {
    if (this.player) Destroy(this.player.gameObject);
    this.player = Instantiate(new PrefabRef(Assets.manifest.player, [0, 0]), position, new THREE.Quaternion());
    if (this.jumpBonusManager) this.jumpBonusManager.Player = this.player;
    this.cameraRig.ClearOverrides();
    this.RunState.playerSpawned.Raise(this.player);
    this.roadChunkManager.SetChunkSpawnTarget(this.player.transform);
    this.backgroundChunkManager.SetChunkSpawnTarget(this.player.transform);
  }

  StartRun() {
    this.RunState.StartRun();
  }

  /** abandon the run (pause menu -> quit / restart) */
  CancelRun() {
    const rs = this.RunState;
    if (rs.IsRunning) {
      rs.IsRunning = false;
      rs.runEndState.endState = EndState.Defeat;
      rs.runEndState.deathReason = DeathReason.RunCancel;
    }
    rs.CleanUpPreviousRun();
  }

  /** GameManager.HandleGameOver: endless returns to the menu (rewards are claimed there), levels show results */
  OnGameOver() {
    const self = this;
    const rs = this.RunState;
    const endless = rs.Mode?.RunMode === RunMode.Endless;
    const declinedRevive = endless && rs.StatTracker.Revives !== rs.StatTracker.RevivesClaimed;
    this.StartCoroutine((function* () {
      // ShouldUseDelay: no delay after a declined revive prompt
      if (declinedRevive) yield null;
      else yield new WaitForSeconds(self.gameOverScreenDelay);
      // the run state is cleaned up by SceneSwitcher.GoToMenu; a reload keeps the mode for the next run
      const mode = rs.Mode;
      if (endless) Game.onEndlessOver?.(mode);
      else Game.onLevelOver?.(mode);
    })());
  }
}

// ---------------------------------------------------------------- run lifecycle helpers used by the UI

let gmObject = null;

export async function prepareMode(mode, onProgress) {
  const ids = [Assets.manifest.player, Assets.manifest.softCurrencyPickup, 'GameObject/Player Explosion', ...cosmeticPrefabIds(), ...mode.prefabIds()];
  if (!Tutorials.FirstRun.IsFinished) ids.push(Tutorials.FirstRun.tutorialChunkId);
  const cp = getRuntimeSO('MonoBehaviour/Endless Chunk Process');
  for (const r of cp?.bonusCurrencyPickups || []) if (r?.id) ids.push(r.id);
  const extra = [];
  // HUD prefabs referenced through ScriptableObjects: compliment floaters, distance markers
  const cs = getRuntimeSO('MonoBehaviour/ComplimentSettings');
  for (const r of [...(cs?.complimentQualities || []), cs?.perfectFollower]) if (r?.id) extra.push(r.id);
  if (mode.RunMode === RunMode.Endless) extra.push(Assets.manifest.positionalMarker || 'GameObject/PositionalMarkerBase');
  const rps = getRuntimeSO('MonoBehaviour/RoadPieceSettings');
  if (rps?.magneticEffect?.id) extra.push(rps.magneticEffect.id);
  const vs = mode.Settings.VisualSettings;
  if (vs?.cameraEffectPrefab?.id) extra.push(vs.cameraEffectPrefab.id);
  const all = [...new Set([...ids, ...extra])];
  let done = 0;
  await Promise.all(
    all.map((id) =>
      loadPrefabDeep(id)
        .catch((e) => console.warn('prefab', id, e.message))
        .then(() => onProgress?.((++done / all.length) * 0.3)),
    ),
  );
  await loadWantedMeshes((p) => onProgress?.(0.3 + p * 0.7));
}

export function startMode(mode) {
  if (gmObject) {
    Game.manager?.CancelRun();
  }
  clearScene();
  flushDestroy();
  setupCards();
  gmObject = new GameObject('GameManager');
  const gm = gmObject.AddComponent(GameManager);
  awakeObject(gmObject);
  gm.Setup(mode);
  Game.music.PlayGameMusic();
  return gm;
}

export function leaveGame() {
  if (Game.manager) Game.manager.CancelRun();
  clearScene();
  gmObject = null;
  Game.manager = null;
}

Game.music = {
  PlayGameMusic() {
    AudioService.playMusic(Assets.manifest.music?.gameplayMusic, 'game');
  },
  PlayMenuMusic() {
    AudioService.playMusic(Assets.manifest.music?.menuMusic, 'menu');
  },
};

export { StatisticsTrackerState, Save };
