// Chunk spawning (BaseChunkManager / RoadChunkManager) and the endless difficulty FlowDirector.
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { EventAction } from '../engine/core.js';
import { SeededRandom, pickRandom } from '../engine/math.js';
import { Instantiate, getRuntimeSO, PrefabRef } from '../engine/instantiate.js';
import { getPrefabJson } from '../engine/assets.js';
import { Tutorials } from '../meta/tutorials.js';
import { Game, ChunkType, RunMode } from './state.js';
import { Save } from '../meta/save.js';
import { Bonus, MAX_BONUS_LETTERS } from '../meta/bonus.js';
import { PlayerRank } from '../meta/rank.js';

export const SpawnStyle = { Endless: 0, FixedChunk: 1 };

/** ChunkCollection: PrefabRefs to RiderChunk components; type/difficulty read from the prefab data. */
export class ChunkCollection {
  constructor(chunks) {
    this.chunks = chunks.filter(Boolean);
  }

  static fromSO(so) {
    return new ChunkCollection(so?.chunks || []);
  }

  static info(ref) {
    const d = ref.data || {};
    return { type: d.type ?? 0, difficulty: d.difficulty ?? 1, spawners: (d.currencySpawners || []).length };
  }

  GetAllChunks() {
    return this.chunks;
  }

  GetAllChunksOfType(type = ChunkType.Normal) {
    return this.chunks.filter((c) => ChunkCollection.info(c).type === type);
  }

  GetAllChunksOfTypeAndDiff(type, diff) {
    return this.chunks.filter((c) => {
      const i = ChunkCollection.info(c);
      return i.type === type && i.difficulty === diff;
    });
  }

  GetRandomChunk(type, rng) {
    return pickRandom(this.GetAllChunksOfType(type), rng);
  }

  GetRandomChunkWithSpawners(type, rng) {
    return pickRandom(this.GetAllChunksOfType(type).filter((c) => ChunkCollection.info(c).spawners > 0), rng);
  }
}

// ---------------------------------------------------------------- BaseChunkManager

export class BaseChunkManager extends MonoBehaviour {
  constructor() {
    super();
    this.ChunkSpawned = new EventAction();
    this.CurrentChunkChanged = new EventAction();
    this.ChunkIndexChanged = new EventAction();
    this.spawnStyle = SpawnStyle.Endless;
    this.activeChunksBehind = 2;
    this.activeChunksAhead = 1;
    this.useStartChunk = true;
    this.chunksPerSpawn = 1;
    this.chunkSpawnTarget = null;
    this.lastChunkSpawned = null;
    this.overrideChunks = [];
    this.randomGenerator = null;
    this.currentSpawnPos = new THREE.Vector3();
    this.activeChunks = [];
    this.slowUpdate = 0;
    this.CurrentChunk = null;
    this.PreviousChunk = null;
    this.CurrentChunkIndex = 0;
    this.CurrentChunkCount = 0;
    this.CurrentChunksSpawned = 0;
    this.IsStartInitialized = false;
    this.IsFullyInitialized = false;
  }

  configure(cfg) {
    Object.assign(this, cfg);
    return this;
  }

  get IsEndless() {
    return this.spawnStyle === SpawnStyle.Endless;
  }

  get HasStartChunkToSpawn() {
    return this.useStartChunk;
  }

  get HasSpecialChunkQueued() {
    return this.overrideChunks.length > 0;
  }

  get PeekNextChunk() {
    return this.GetChunkByIndex(this.CurrentChunkIndex + 1);
  }

  Initialize(runState) {
    this.runstate = runState;
    this.currentSpawnPos = this.transform.position;
    if (!this.randomGenerator) {
      let seed = (Math.random() * 0x7fffffff) | 0;
      if (runState.Mode && runState.Mode.RunMode === RunMode.TimedLevel) seed = hashCode(runState.Mode.UniqueName);
      this.SetSpecificSeed(seed);
    }
    this.ChunkInitialization();
  }

  ChunkInitialization() {}

  InitializeStartChunk() {
    if (this.IsStartInitialized) return;
    if (this.spawnStyle !== SpawnStyle.FixedChunk && this.useStartChunk) {
      const start = this.currentCollection.GetRandomChunk(ChunkType.Start);
      if (start) {
        this.activeChunks.push(this.SpawnChunk(start));
        this.HandleChunkCompleted();
      }
    }
    this.IsStartInitialized = true;
  }

  InitializeNonStartChunks() {
    if (this.IsFullyInitialized) return;
    if (this.spawnStyle === SpawnStyle.FixedChunk) this.activeChunks.push(...this.SpawnChunks(this.currentCollection.GetAllChunks()));
    if (this.activeChunks.length === 0) this.activeChunks.push(this.SpawnNextChunk());
    this.HandleChunkCompleted();
    this.IsFullyInitialized = true;
  }

  Update() {
    if (!this.IsFullyInitialized) return;
    if (++this.slowUpdate < 5) return;
    this.slowUpdate = 0;
    if (this.activeChunks.length - this.CurrentChunkIndex <= this.activeChunksAhead) {
      if (this.spawnStyle === SpawnStyle.FixedChunk) return;
      this.activeChunks.push(this.SpawnNextChunk());
    }
    this.CheckChunkChange();
  }

  CheckChunkChange() {
    if (!this.chunkSpawnTarget || this.chunkSpawnTarget.gameObject._destroyed || !this.CurrentChunk) return;
    const end = this.CurrentChunk.transform.TransformPoint(this.CurrentChunk.GetChunkEnd()[0]);
    if (this.chunkSpawnTarget.position.x - end.x > 0) this.HandleChunkChange();
  }

  GetChunkByIndex(i) {
    return i < 0 || i >= this.activeChunks.length ? null : this.activeChunks[i];
  }

  SetChunkSpawnTarget(t) {
    this.chunkSpawnTarget = t;
  }

  SetSpecificSeed(seed) {
    this.RandomSeed = seed;
    this.randomGenerator = new SeededRandom(seed);
  }

  SetStyle(s) {
    this.spawnStyle = s;
  }

  SetChunkCollection(c) {
    if (c) this.currentCollection = c;
  }

  QueueOverrideChunk(c) {
    this.overrideChunks.push(c);
  }

  SpawnNextChunk() {
    return this.SpawnNextChunks(1)[0];
  }

  SpawnNextChunks(amount = 1) {
    if (this.HasSpecialChunkQueued) return this.SpawnChunks([this.overrideChunks.shift()]);
    const available = this.currentCollection.GetAllChunksOfType();
    const list = [];
    for (let i = 0; i < amount; i++) list.push(this.GetNextRandomChunk(available) || available[0]);
    return this.SpawnChunks(list);
  }

  GetNextRandomChunk(list) {
    const cands = list.filter((c) => c !== this.lastChunkSpawned);
    return cands.length ? pickRandom(cands, this.randomGenerator) : null;
  }

  IsChunkDuplicate(c) {
    return c === this.lastChunkSpawned;
  }

  SpawnChunk(ref) {
    this.lastChunkSpawned = ref;
    const chunk = Instantiate(ref, this.currentSpawnPos, new THREE.Quaternion());
    const start = chunk.GetChunkStart()[0];
    chunk.transform.Translate(new THREE.Vector3(-start.x, -start.y, -start.z));
    this.currentSpawnPos = chunk.transform.TransformPoint(chunk.GetChunkEnd()[0]);
    chunk._ref = ref;
    this.CurrentChunksSpawned++;
    this.ProcessSpawnedChunk(chunk);
    this.ChunkSpawned.Invoke(chunk);
    return chunk;
  }

  ProcessSpawnedChunk() {}

  SpawnChunks(refs) {
    return refs.map((r) => this.SpawnChunk(r));
  }

  HandleChunkChange() {
    if (!this.GetChunkByIndex(this.CurrentChunkIndex + 1)) return;
    this.CurrentChunkIndex++;
    this.CurrentChunkCount++;
    this.CurrentChunk = this.GetChunkByIndex(this.CurrentChunkIndex) || this.CurrentChunk;
    const old = this.CurrentChunkIndex - this.activeChunksBehind - 1;
    if (old >= 0 && this.activeChunks[old]) {
      Destroy(this.activeChunks[old].gameObject);
      this.activeChunks[old] = null;
    }
    if (this.spawnStyle === SpawnStyle.Endless) this.activeChunks.push(...this.SpawnNextChunks(this.chunksPerSpawn));
    this.HandleChunkCompleted();
    this.CurrentChunkChanged.Invoke(this.CurrentChunk);
    this.ChunkIndexChanged.Invoke(this.CurrentChunkIndex);
  }

  HandleChunkCompleted() {
    const cur = this.GetChunkByIndex(this.CurrentChunkIndex);
    const prev = this.GetChunkByIndex(this.CurrentChunkIndex - 1);
    this.CurrentChunk = cur || this.activeChunks[0];
    this.PreviousChunk = prev || this.activeChunks[0];
  }

  DestroyAll() {
    for (const c of this.activeChunks) if (c) Destroy(c.gameObject);
    this.activeChunks = [];
  }
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------- RoadChunkManager

export class RoadChunkManager extends BaseChunkManager {
  constructor() {
    super();
    this.SpawnNextChunkWithSpawners = false;
    this.flowDirectorSpawnIndex = 0;
    this.chunkGrabBag = new Map();
    this.lastChunkInBag = new Map();
  }

  get FlowDirector() {
    return this.runstate.FlowDirector;
  }

  SetFlowDirectorConfig(cfg) {
    this.runstate.SetFlowDirector(cfg ? new FlowDirector(cfg, this.randomGenerator) : null);
  }

  SetChunkCollection(c) {
    super.SetChunkCollection(c);
    this.chunkGrabBag.clear();
    this.lastChunkInBag.clear();
    for (const ch of c.GetAllChunksOfType(ChunkType.Normal)) {
      const d = ChunkCollection.info(ch).difficulty;
      if (!this.chunkGrabBag.has(d)) {
        this.chunkGrabBag.set(d, []);
        this.lastChunkInBag.set(d, null);
      }
      this.chunkGrabBag.get(d).push(ch);
    }
  }

  ProcessSpawnedChunk(chunk) {
    this.runstate.Mode?.ChunkProcess?.ProcessSpawnedChunk(chunk);
  }

  /** TrySpawnFirstRunChunk: the controls tutorial chunk comes right after the start chunk */
  ChunkInitialization() {
    const ft = Tutorials.FirstRun;
    if ((ft.IsStarted || ft.IsNotStarted) && this.runstate.Mode?.RunMode === RunMode.Endless) {
      const json = getPrefabJson(ft.tutorialChunkId);
      if (!json) return;
      const idx = (json.nodes[0].c || []).findIndex((c) => c.$type === 'RiderChunk');
      this.QueueOverrideChunk(new PrefabRef(ft.tutorialChunkId, idx >= 0 ? [0, idx] : undefined));
    }
  }

  SpawnNextChunks(amount = 1) {
    if (this.HasSpecialChunkQueued) return this.SpawnChunks([this.overrideChunks.shift()]);
    const list = [];
    for (let i = 0; i < amount; i++) list.push(this.FlowDirector ? this.GetChunkFlowDirector() : this.GetGrabBagChunk(1, false) || this.currentCollection.GetRandomChunk(ChunkType.Normal, this.randomGenerator));
    return this.SpawnChunks(list);
  }

  GetCurrentChunkStartPoint() {
    return this.CurrentChunk.chunkStart.position;
  }

  ResetCurrentChunk() {
    this.CurrentChunk?.ResetState();
  }

  GetChunkFlowDirector() {
    const n = this.flowDirectorSpawnIndex++;
    const withSpawners = this.SpawnNextChunkWithSpawners;
    if (withSpawners) this.SpawnNextChunkWithSpawners = false;
    const fd = this.FlowDirector;
    if (fd.GeneratedDifficultySequence.length <= n) fd.LoadNextDifficultySpike(n === 0);
    const diff = fd.GeneratedDifficultySequence[n];
    let c = this.GetGrabBagChunk(diff, withSpawners);
    if (c) return c;
    if (withSpawners) {
      c = this.currentCollection.GetRandomChunkWithSpawners(ChunkType.Normal, this.randomGenerator);
      if (c) return c;
    }
    return this.currentCollection.GetRandomChunk(ChunkType.Normal, this.randomGenerator);
  }

  GetGrabBagChunk(diff, searchForSpawners) {
    const bag = this.chunkGrabBag.get(diff);
    if (!bag || bag.length === 0) return null;
    let c = pickRandom(bag);
    if (searchForSpawners) {
      const l = bag.filter((x) => ChunkCollection.info(x).spawners > 0);
      c = l.length ? pickRandom(l) : pickRandom(this.currentCollection.GetAllChunksOfTypeAndDiff(ChunkType.Normal, diff).filter((x) => ChunkCollection.info(x).spawners > 0 && x !== this.lastChunkSpawned)) || c;
    }
    const i = bag.indexOf(c);
    if (i >= 0) bag.splice(i, 1);
    if (bag.length === 0) {
      bag.push(...this.currentCollection.GetAllChunksOfTypeAndDiff(ChunkType.Normal, diff));
      if (bag.length >= 2) {
        const j = bag.indexOf(c);
        if (j >= 0) bag.splice(j, 1);
      }
    }
    return c;
  }

  SpawnChunk(ref) {
    this.lastChunkInBag.set(ChunkCollection.info(ref).difficulty, ref);
    return super.SpawnChunk(ref);
  }
}

// ---------------------------------------------------------------- FlowDirector

export function decodeIntArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string' || !v) return [];
  const out = [];
  for (let i = 0; i + 8 <= v.length; i += 8) {
    const b = v.slice(i, i + 8).match(/../g).map((h) => parseInt(h, 16));
    out.push(b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24));
  }
  return out;
}

const mmRandInc = (mm, rng) => (mm.min ?? 0) + rng.Next(0, (mm.max ?? 0) - (mm.min ?? 0) + 1);

export class FlowDirector {
  constructor(config, rng) {
    this.config = config;
    this.random = rng;
    this.spikes = (config.difficultySpikes || []).map((s) => {
      const d = decodeIntArray(s.deltaDifficultyDifferencesInOrder);
      return { deltas: d, rating: d.length ? Math.max(...d) : 0 };
    });
    const rated = this.spikes.filter((s) => s.rating > 0).map((s) => s.rating);
    this.range = { min: Math.min(...rated), max: Math.max(...rated) };
    this.lastDDR = this.range.min - 1;
    this.currentReliefDR = -1;
    this.lastGenerated = { rating: 0 };
    this.currentStepsAtSameDR = 0;
    this.requiredStepsAtSameDR = 0;
    this.currentStepsAtSameReliefDR = 0;
    this.requiredStepsAtSameReliefDR = 0;
    this.lastDir = 0;
    this.stepsInDir = 0;
    this.requiredStepsInDir = 0;
    this.GeneratedDifficultySequence = [];
  }

  LoadNextDifficultySpike(forceRelief) {
    const s = this.GetNext(forceRelief);
    this.lastGenerated = s;
    for (const d of s.deltas) this.GeneratedDifficultySequence.push((this.config.baselineDifficulty || 0) + d);
  }

  GetNext(forceRelief) {
    if (forceRelief || this.lastGenerated.rating > this.currentReliefDR) return this.Relief();
    const dir = this.NextDirection();
    this.lastDDR = Math.min(Math.max(this.lastDDR + dir, this.range.min), this.range.max);
    return this.WithRating(this.lastDDR);
  }

  WithRating(r) {
    let c = this.spikes.filter((s) => s.rating === r);
    if (!c.length) {
      const above = this.spikes.map((s) => s.rating).find((x) => r < x) ?? 0;
      const below = this.spikes.map((s) => s.rating).find((x) => r > x) ?? 0;
      const closest = above - r > r - below ? below : above;
      c = this.spikes.filter((s) => s.rating === closest);
      if (!c.length) return pickRandom(this.spikes, this.random);
    }
    return pickRandom(c, this.random);
  }

  NextDirection() {
    const cfg = this.config;
    if (this.currentStepsAtSameDR < this.requiredStepsAtSameDR) {
      this.currentStepsAtSameDR++;
      return 0;
    }
    this.requiredStepsAtSameDR = mmRandInc(cfg.stepsBetweenDDRFluctuation, this.random);
    this.currentStepsAtSameDR = 0;
    let dir = this.lastDir;
    if (dir === 0) {
      dir = 1;
      this.stepsInDir = 1;
      this.requiredStepsInDir = mmRandInc(cfg.DDRStepsUpRangeBeforeComingDown, this.random);
    } else if (this.stepsInDir < this.requiredStepsInDir) this.stepsInDir++;
    else {
      dir = -dir;
      this.stepsInDir = 1;
      this.requiredStepsInDir = mmRandInc(dir > 0 ? cfg.DDRStepsUpRangeBeforeComingDown : cfg.DDRStepsDownRangeBeforeGoingUp, this.random);
    }
    this.lastDir = dir;
    return dir;
  }

  Relief() {
    if (this.currentStepsAtSameReliefDR < this.requiredStepsAtSameReliefDR) this.currentStepsAtSameReliefDR++;
    else {
      this.currentStepsAtSameReliefDR = 1;
      if (this.currentReliefDR < this.config.maxReliefDR) {
        this.currentReliefDR++;
        this.requiredStepsAtSameReliefDR = mmRandInc(this.config.stepsBetweenReliefDRIncrements, this.random);
      }
    }
    return this.WithRating(this.currentReliefDR);
  }
}

function spawnSoft(chunk, p) {
  const c = Game.softCurrencyPool.Activate();
  c.transform.SetPositionAndRotation(p, new THREE.Quaternion());
  chunk.AddPooledCurrency(c);
}

/**
 * EndlessModeChunkProcess: pooled soft currency on every currency spawn point, plus the B-O-N-U-S letters
 * (one letter replaces the last spawn point of a chunk every 5-8 chunks while the bonus is available).
 */
export const EndlessChunkProcess = {
  letterSpawnedChunk: -1,
  didSpawn: false,
  shouldSpawnLetter: false,

  get settings() {
    return getRuntimeSO('MonoBehaviour/Endless Chunk Process');
  },

  get rcm() {
    return Game.manager?.RoadChunkManager;
  },

  get total() {
    return Game.runState?.StatTracker?.BonusLetterCurrencyTotal ?? Bonus.Letters;
  },

  get CanSpawnLetter() {
    return PlayerRank.IsBonusUnlocked && this.total < MAX_BONUS_LETTERS && Bonus.TimerExpired;
  },

  get ChunksFromNextBonusLetter() {
    return this.CanSpawnLetter ? Bonus.save.target - Bonus.save.cur : Infinity;
  },

  get CurrentlySpawnedLetter() {
    return this.letterSpawnedChunk !== -1 && this.rcm && this.letterSpawnedChunk >= this.rcm.CurrentChunkIndex - 1;
  },

  IsLetterNearby(d) {
    return this.CanSpawnLetter && (this.CurrentlySpawnedLetter || this.ChunksFromNextBonusLetter <= d);
  },

  OnRunStart(rs) {
    if (Bonus.save.target <= 0) this.SetNextChunkTarget(true);
    this.letterSpawnedChunk = -1;
    this._gathered = () => {
      this.letterSpawnedChunk = -1;
      this.SetNextChunkTarget(true);
    };
    this._chunk = () => {
      if (rs.Mode?.RunMode === RunMode.Endless && this.rcm.CurrentChunkIndex >= 2) {
        Bonus.save.cur++;
        Save.setDirty();
      }
    };
    rs.StatTracker.OnBonusCurrencyChanged.AddListener(this._gathered);
    this.rcm.CurrentChunkChanged.AddListener(this._chunk);
    this._rs = rs;
  },

  OnRunFinish(rs) {
    if (this.ChunksFromNextBonusLetter <= 1 || this.CurrentlySpawnedLetter) this.SetNextChunkTarget(false);
    this.letterSpawnedChunk = -1;
    this.didSpawn = false;
    this.shouldSpawnLetter = false;
    rs.StatTracker?.OnBonusCurrencyChanged.RemoveListener(this._gathered);
    this.rcm?.CurrentChunkChanged.RemoveListener(this._chunk);
  },

  SetNextChunkTarget(gathered) {
    const collected = this.total;
    const s = Bonus.save;
    if (collected >= MAX_BONUS_LETTERS) {
      s.target = -1;
      Save.setDirty();
      return;
    }
    this.didSpawn = false;
    const st = this.settings;
    const mm = st?.bonusLetterSpawns?.[collected] || { min: 5, max: 8 };
    let t = mm.min + Math.floor(Math.random() * (mm.max - mm.min + 1));
    const respawns = decodeIntArray(st?.bonusLetterRespawns);
    if (!gathered && collected < respawns.length) t = respawns[collected];
    s.cur = 0;
    s.target = t;
    Save.setDirty();
  },

  ProcessSpawnedChunk(chunk) {
    const rs = Game.runState;
    if (rs?.IsRunning && rs.Mode?.RunMode === RunMode.Endless && this.CanSpawnLetter) {
      const s = Bonus.save;
      const spawnNext = !this.didSpawn && s.cur >= s.target - 2 && !this.CurrentlySpawnedLetter;
      if (this.shouldSpawnLetter && this.TrySpawnLetterThisChunk(chunk)) return;
      if (spawnNext) {
        this.shouldSpawnLetter = true;
        this.rcm.SpawnNextChunkWithSpawners = true;
      }
    }
    for (const sp of chunk.currencySpawners || []) {
      if (!sp) continue;
      for (const lp of sp.LocalSpawnPoints) spawnSoft(chunk, sp.transform.TransformPoint(lp));
    }
  },

  TrySpawnLetterThisChunk(chunk) {
    this.shouldSpawnLetter = false;
    this.didSpawn = this.TrySpawnBonusLetter(chunk, 1);
    if (!this.didSpawn) return false;
    this.SetNextChunkTarget(false);
    this.letterSpawnedChunk = this.rcm.CurrentChunkIndex;
    return true;
  },

  TrySpawnBonusLetter(chunk, n) {
    const spawners = (chunk.currencySpawners || []).filter(Boolean);
    if (!spawners.length) return false;
    const letters = this.settings?.bonusCurrencyPickups || [];
    let k = 0;
    spawners.forEach((sp, i) => {
      const pts = sp.LocalSpawnPoints;
      pts.forEach((lp, j) => {
        const p = sp.transform.TransformPoint(lp);
        if (i === spawners.length - 1 && j >= pts.length - n && letters.length) {
          Instantiate(letters[(this.total + k) % letters.length], p, new THREE.Quaternion(), chunk.transform);
          k++;
        } else spawnSoft(chunk, p);
      });
    });
    return true;
  },
};
