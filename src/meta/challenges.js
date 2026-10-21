// ChallengeManager + world challenges (Score / SoftCurrency / LandFlips / PerfectLand / PlayRuns).
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Meta } from './data.js';
import { Currencies } from './currency.js';
import { grantReward } from './rewards.js';
import { WorldManager } from './worlds.js';

export const ChallengeState = { Uninitialized: 0, Inactive: 1, Active: 2, Completed: 3, Claimed: 4, Done: 10 };
export const SetupType = { X: 0, XY: 1, XZ: 2, XYZ: 3 };
export const ResetReason = { Invalid: 0, TimerSkip: 1, ChallengeSkip: 2 };
const RUN_MODE_ENDLESS = 1;

function cstate() {
  return (Save.data.challenges ||= { started: 0, w1Claimed: 0, totalClaimed: 0, maxSlotUnlocked: 0, states: {} });
}

export class Challenge {
  constructor(def, world) {
    this.def = def;
    this.world = world;
    this.stepValue = 0; // in-run step counter (XZ)
    this.prevStepValue = 0;
    this.prevValue = 0;
    this.last = 0; // last polled stat value
  }

  get id() {
    return this.def.id;
  }

  get s() {
    return cstate().states[this.def.id] || null;
  }

  ensure() {
    const all = cstate().states;
    return (all[this.def.id] ||= { state: ChallengeState.Inactive, slot: -1, current: 0, goal: 0, runs: 0, completeTime: 0, lockout: 0, world: -1 });
  }

  get State() {
    return this.s?.state ?? ChallengeState.Inactive;
  }

  set State(v) {
    if (v === ChallengeState.Inactive) delete cstate().states[this.def.id];
    else this.ensure().state = v;
    Save.setDirty();
  }

  get IsActive() {
    return this.State === ChallengeState.Active;
  }

  get IsCompleted() {
    return this.State === ChallengeState.Completed;
  }

  get IsClaimed() {
    return this.State === ChallengeState.Claimed;
  }

  get IsDone() {
    return this.State === ChallengeState.Done;
  }

  get UseSteps() {
    return this.def.setup === SetupType.XZ || this.def.setup === SetupType.XYZ;
  }

  get HasY() {
    return this.def.setup === SetupType.XY || this.def.setup === SetupType.XYZ;
  }

  get CurrentValue() {
    return this.s?.current || 0;
  }

  get GoalValue() {
    return this.s?.goal || (this.UseSteps ? this.def.z : this.def.x) || 1;
  }

  get StepGoal() {
    return this.UseSteps ? this.def.x : this.GoalValue;
  }

  get CurrentStepValue() {
    return this.UseSteps ? this.stepValue : this.CurrentValue;
  }

  set CurrentStepValue(v) {
    this.prevStepValue = this.stepValue;
    this.prevValue = this.CurrentValue;
    if (this.UseSteps) this.stepValue = v;
    else {
      this.ensure().current = v;
      Save.setDirty();
    }
    ChallengeManager.OnActiveChallengeChanged.Raise(this);
  }

  get Progress() {
    return Math.min(1, this.CurrentValue / this.GoalValue);
  }

  stepProgressOf(step, cur) {
    if (this.UseSteps) return this.HasY && step > this.def.y ? 0 : step / this.def.x;
    return this.HasY && cur > this.def.y ? 0 : cur / this.GoalValue;
  }

  get StepProgress() {
    return this.stepProgressOf(this.stepValue, this.CurrentValue);
  }

  get PreviousStepProgress() {
    return this.stepProgressOf(this.prevStepValue, this.prevValue);
  }

  get CanBeSkipped() {
    return this.IsActive && (this.s?.runs || 0) >= Meta.data.challenges.settings.allowSkipAfterRuns;
  }

  get CanTriggerRevive() {
    return this.def.cls !== 'PlayRunsChallenge';
  }

  get lockoutRemaining() {
    const s = this.s;
    if (!s || this.State !== ChallengeState.Claimed) return 0;
    return Math.max(0, s.lockout - (Date.now() - s.completeTime) / 1000);
  }

  get ResetReason() {
    if (this.IsClaimed) return ResetReason.TimerSkip;
    if (this.IsActive) return ResetReason.ChallengeSkip;
    return ResetReason.Invalid;
  }

  /** UI text with {[X]} {[Y]} {[Z]} {[W]} substituted */
  get Text() {
    return String(this.def.text)
      .split('{[X]}').join(this.def.x)
      .split('{[Y]}').join(this.def.y)
      .split('{[Z]}').join(this.def.z)
      .split('{[W]}').join(this.world + 1);
  }

  get Rewards() {
    const st = Meta.data.challenges.settings;
    return [...(this.def.reward || []), this.def.hard ? st.hardReward : st.normalReward];
  }

  // ------------------------------------------------ lifecycle
  Activate(slot) {
    if (this.State !== ChallengeState.Inactive) return;
    const s = this.ensure();
    s.state = ChallengeState.Active;
    s.slot = slot;
    s.world = WorldManager.CurrentWorldIndex;
    s.current = 0;
    s.goal = this.UseSteps ? this.def.z : this.def.x;
    this.stepValue = 0;
    Save.setDirty();
  }

  Complete() {
    if (this.State !== ChallengeState.Active) return;
    this.State = ChallengeState.Completed;
    ChallengeManager.OnChallengeComplete.Raise(this);
  }

  TryComplete() {
    if (this.CurrentValue >= this.GoalValue) this.Complete();
  }

  ClaimRewards() {
    if (this.State !== ChallengeState.Completed) return null;
    const results = this.Rewards.map((r) => grantReward(r, `Mission_${this.id}`));
    const s = this.ensure();
    if (!s.completeTime) {
      s.completeTime = Date.now();
      const m = ChallengeManager;
      s.lockout = WorldManager.CurrentWorldIndex === 0 ? m.GetWorldChallengeTimeOut(cstate().w1Claimed + 1) : Meta.data.challenges.settings.maxTimeout;
    }
    this.State = ChallengeState.Claimed;
    return results;
  }

  // ------------------------------------------------ run tracking
  get tracking() {
    const rs = ChallengeManager.runState;
    return this.IsActive && rs?.Mode?.RunMode === this.def.mode && this.s?.world === WorldManager.CurrentWorldIndex;
  }

  OnRunStart() {
    this.stepValue = 0;
    this.prevStepValue = 0;
    this.last = 0;
  }

  Poll(stats) {
    if (!this.tracking) return;
    const v = this.def.cls === 'ScoreChallenge' ? stats.Score : this.def.cls === 'SoftCurrencyChallenge' ? stats.SoftCurrency : null;
    if (v === null) return;
    const d = v - this.last;
    if (d >= 1) this.CurrentStepValue = this.CurrentStepValue + d;
    this.last = v;
  }

  OnJump(data) {
    if (!this.tracking) return;
    const cls = this.def.cls;
    if (cls !== 'LandFlipsChallenge' && cls !== 'PerfectLandChallenge') return;
    if (this.def.special?.length) {
      const t = this.def.special[0];
      if (data.frontPiece?.type !== t && data.backPiece?.type !== t) return;
    }
    const flips = data.TotalFlips;
    if (flips < 1) return;
    if (cls === 'LandFlipsChallenge') {
      if (this.def.minimalFlips <= 1) this.CurrentStepValue = this.CurrentStepValue + flips;
      else if (flips >= this.def.minimalFlips) this.CurrentStepValue = this.CurrentStepValue + 1;
    } else if (data.perfect) this.CurrentStepValue = this.CurrentStepValue + 1;
  }

  OnRunEnd(stats) {
    if (!this.tracking) return;
    this.Poll(stats);
    if (this.def.cls === 'PlayRunsChallenge') this.CurrentStepValue = this.CurrentStepValue + 1;
    const s = this.ensure();
    s.runs++;
    let failed = false;
    const x = this.def.x;
    const step = this.stepValue;
    if (this.def.setup === SetupType.XY) {
      if (s.current < s.goal || s.current > this.def.y) s.current = 0;
    } else if (this.def.setup === SetupType.XZ) {
      if (step >= x) s.current++;
      else failed = true;
    } else if (this.def.setup === SetupType.XYZ) {
      if (step >= x && step <= this.def.y) s.current++;
      else failed = true;
    }
    if (failed && this.def.inARow) s.current = 0;
    if (this.UseSteps) this.stepValue = 0;
    Save.setDirty();
    this.TryComplete();
  }
}

export const ChallengeManager = {
  OnChallengeUpdate: new EventAction(),
  OnActiveChallengeChanged: new EventAction(),
  OnChallengeComplete: new EventAction(),
  OnChallengeClaimed: new EventAction(),
  OnSlotUnlocked: new EventAction(),
  OnChallengeStart: new EventAction(),
  worlds: [],
  slots: [null, null, null],
  runState: null,

  init() {
    this.worlds = Meta.data.challenges.worlds.map((list, w) => list.map((d) => new Challenge(d, w)));
    WorldManager.CurrentWorldChanged.AddListener(() => this.UpdateChallengeSlots());
    this.UpdateChallengeSlots();
    setInterval(() => this.Tick(), 500);
  },

  /** subscribe to the gameplay RunState (once) */
  attach(runState) {
    if (this.runState === runState) return;
    this.runState = runState;
    runState.runStarted.AddListener(() => {
      for (const c of this.Slotted) c.OnRunStart();
    });
    runState.jumpCompleted.AddListener((j) => {
      for (const c of this.Slotted) c.OnJump(j);
    });
    runState.runFinished.AddListener(() => {
      const st = runState.StatTracker;
      for (const c of this.Slotted) c.OnRunEnd(st);
      this.OnChallengeUpdate.Raise();
    });
    setInterval(() => {
      if (!runState.IsRunning || !runState.StatTracker) return;
      for (const c of this.Slotted) c.Poll(runState.StatTracker);
    }, 250);
  },

  get settings() {
    return Meta.data.challenges.settings;
  },

  get save() {
    return cstate();
  },

  get Slotted() {
    return this.slots.filter(Boolean);
  },

  IsSlotUnlocked(i) {
    return i <= cstate().maxSlotUnlocked;
  },

  get CurrentList() {
    return this.worlds[WorldManager.CurrentWorldIndex] || [];
  },

  GetWorldChallengeTimeOut(n) {
    for (const [until, t] of this.settings.world1Timeouts) if (until - 1 >= n) return t;
    return this.settings.maxTimeout;
  },

  UpdateChallengeSlots() {
    const w = WorldManager.CurrentWorldIndex;
    for (let i = 0; i < 3; i++) {
      const c = this.slots[i];
      if (c && (c.IsDone || c.world !== w)) this.slots[i] = null;
    }
    for (let i = 0; i < 3; i++) this.AssignChallengeToSlot(i);
    this.OnChallengeUpdate.Raise();
  },

  AssignChallengeToSlot(i) {
    if (!this.IsSlotUnlocked(i) || this.slots[i]) return;
    const list = this.CurrentList;
    let ch = list.find((c) => c.s?.slot === i && !c.IsDone && c.State >= ChallengeState.Active && !this.slots.includes(c));
    if (!ch) {
      ch = list.find((c) => c.State === ChallengeState.Inactive && !this.slots.includes(c));
      if (!ch) return;
      cstate().started++;
      ch.Activate(i);
      this.OnChallengeStart.Raise(ch);
    }
    this.slots[i] = ch;
    Save.setDirty();
  },

  /** claim one completed challenge (main menu overlay) */
  Claim(ch) {
    if (!this.slots.includes(ch) || !ch.IsCompleted) return null;
    const res = ch.ClaimRewards();
    const st = cstate();
    if (WorldManager.CurrentWorldIndex === 0) st.w1Claimed++;
    const prev = st.maxSlotUnlocked;
    st.totalClaimed++;
    if (st.maxSlotUnlocked <= 0 && st.totalClaimed >= this.settings.slot1) st.maxSlotUnlocked = 1;
    if (st.maxSlotUnlocked <= 1 && st.totalClaimed >= this.settings.slot2) st.maxSlotUnlocked = 2;
    Save.setDirty();
    if (st.maxSlotUnlocked !== prev) this.OnSlotUnlocked.Raise();
    this.OnChallengeClaimed.Raise(ch, res);
    this.CheckTimeout(ch);
    this.UpdateChallengeSlots();
    return res;
  },

  CheckTimeout(ch) {
    if (!ch.IsClaimed) return;
    const active = this.Slotted.filter((c) => c.IsActive || c.IsCompleted).length;
    // faithful quirk: compares the global claim count with the current world's list length
    if (cstate().totalClaimed + active >= this.CurrentList.length || ch.lockoutRemaining <= 0) {
      ch.State = ChallengeState.Done;
      this.UpdateChallengeSlots();
    }
  },

  /** timers resolve only while not in a run */
  Tick() {
    if (this.runState?.IsInRun) return;
    for (const c of this.Slotted) if (c.IsClaimed) this.CheckTimeout(c);
  },

  get ActiveRunningCount() {
    return this.Slotted.filter((c) => !c.IsCompleted && !c.IsClaimed).length;
  },

  get ClaimableCount() {
    return this.Slotted.filter((c) => c.IsCompleted).length;
  },

  WorldStats(w) {
    const list = this.worlds[w] || [];
    return { total: list.length, progress: list.filter((c) => c.State > ChallengeState.Active).length };
  },

  /** pay to skip the cooldown or to complete an active challenge; `free` = the ad option */
  Reset(ch, free) {
    const reason = ch.ResetReason;
    if (reason === ResetReason.Invalid) return false;
    const cost = reason === ResetReason.TimerSkip ? this.settings.skipTimerCost : this.settings.skipChallengeCost;
    if (!free && !Currencies.Hard.Spend(cost, 'Challenges')) return false;
    if (reason === ResetReason.TimerSkip) ch.ensure().lockout = 0;
    else ch.Complete();
    Save.setDirty();
    this.CheckTimeout(ch);
    this.UpdateChallengeSlots();
    return true;
  },

  /** EndlessReviveSettings.QualifiesWithChallenges */
  ReviveCandidate() {
    for (const c of this.Slotted) {
      if (!c.tracking || !c.CanTriggerRevive || c.IsCompleted || c.IsClaimed || !c.UseSteps) continue;
      const p = c.StepProgress;
      if (p >= 0.5 && Math.round(p * 100) < 100) return c;
    }
    return null;
  },
};
