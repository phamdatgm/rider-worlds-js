// CW.Tutorial (TutorialService / BaseTutorial) + RiderBaseTutorial + FirstRunTutorial.
// The tutorial assets (MonoBehaviour/Tutorials collection) are ScriptableObjects: each class is registered
// by its C# name so every SO reference resolves to the live tutorial. The menu tutorials and the
// TutorialUtility overlay live in src/uiscripts/tutorials.js; UI-side lookups go through Tutorials.hooks.
import { EventAction, Time, Coroutines } from '../engine/core.js';
import { ScriptableObject, registerSO, getRuntimeSO } from '../engine/instantiate.js';
import { Assets } from '../engine/assets.js';
import { Analytics } from '../analytics/index.js';
import { Save } from './save.js';

export const TutorialState = { NotStarted: 0, Completed: 1, Skipped: 2, Started: 3 };
export const FirstRunStep = { Inactive: 0, AwaitRunStart: 1, AwaitPlayerReady: 2, HoldToAccelerate: 3, AwaitJumpApex: 4, HoldToFlip: 5, LandSafely: 6, Done: 7 };
const STEP_NAMES = Object.fromEntries(Object.entries(FirstRunStep).map(([k, v]) => [v, k]));

const TUTORIALS_COLLECTION = 'MonoBehaviour/Tutorials';

// ---------------------------------------------------------------- BaseTutorial

export class BaseTutorial extends ScriptableObject {
  static typeName = 'BaseTutorial';

  constructor() {
    super();
    this.state = TutorialState.NotStarted;
    this.service = null;
  }

  get SaveName() {
    return this.name;
  }

  get State() {
    return this.state;
  }

  get IsFinished() {
    return this.state === TutorialState.Completed || this.state === TutorialState.Skipped;
  }

  get CanCompleteNow() {
    return this.CanSkip();
  }

  HandleUpdate() {}

  Initialize(service) {
    this.service = service;
    this.LoadState();
    this.OnInitialize();
    this.CheckStateOnLoad();
  }

  OnInitialize() {}

  LoadState() {
    this.state = this.service.GetTutorialState(this);
  }

  CheckStateOnLoad() {
    if (this.state === TutorialState.NotStarted && this.CanSkip()) this.state = TutorialState.Skipped;
    if (this.state === TutorialState.NotStarted) {
      this.service.AddTutorial(this);
      this.PrepareTriggers();
    }
  }

  PrepareTriggers() {}

  Activate() {
    this.state = TutorialState.Started;
  }

  OnStepStarted() {}

  OnStepCompleted() {}

  Complete() {
    if (this.state === TutorialState.NotStarted && this.CanSkip()) this.state = TutorialState.Skipped;
    else this.state = TutorialState.Completed;
    this.service.SetTutorialState(this);
  }

  CanStart() {
    return this.state === TutorialState.NotStarted;
  }

  CanSkip() {
    return false;
  }
}

// ---------------------------------------------------------------- RiderBaseTutorial

export class RiderBaseTutorial extends BaseTutorial {
  static typeName = 'RiderBaseTutorial';

  constructor() {
    super();
    this.ignore = 0;
    this.startDelay = 1;
    this.OnTutorialStarted = new EventAction();
    this.OnTutorialCompleted = new EventAction();
    this.dismissRoutine = null;
    this.isDelaying = false;
  }

  get Utility() {
    return Tutorials.hooks.utility();
  }

  get StartDelay() {
    return this.startDelay;
  }

  get IsStarted() {
    return this.state === TutorialState.Started;
  }

  get IsNotStarted() {
    return this.state === TutorialState.NotStarted;
  }

  get IsFinished() {
    return this.state === TutorialState.Completed || this.state === TutorialState.Skipped || !!this.ignore;
  }

  get IsDismissTimerActive() {
    return !!this.dismissRoutine;
  }

  CanStart() {
    if (!super.CanStart() || this.ignore) return false;
    return !Tutorials.hooks.rankPopupBlocked();
  }

  Activate() {
    super.Activate();
    this.OnTutorialStarted.Invoke();
    this.isDelaying = false;
    Coroutines.start(this.DelayedStart(), null);
  }

  *DelayedStart() {
    this.Utility?.DisableTouch();
    while (Tutorials.hooks.transition()?.IsTransitioning) yield null;
    yield* this.WaitForTimeOrBlockers(this.startDelay);
    this.Utility?.EnableTouch();
    this.OnActivated();
  }

  OnActivated() {}

  TryStartDismissDelay(content, showContinueButton, continueCallback = null) {
    if (content?.useDismissDelay) this.dismissRoutine = Coroutines.start(this.PlayDismissDelay(content.delay, !!content.showTapToContinue, !!content.pauseGame, showContinueButton, continueCallback), null);
  }

  *PlayDismissDelay(length, showTapToContinue, pauseGame, showContinueButton, continueCallback) {
    let t = length;
    while (t > 0) {
      t -= Time.unscaledDeltaTime;
      yield null;
    }
    if (showTapToContinue) this.Utility?.ShowTapToContinue(pauseGame);
    if (showContinueButton) this.Utility?.ShowContinueButton(continueCallback, pauseGame);
    this.dismissRoutine = null;
  }

  Complete() {
    super.Complete();
    if (this.state === TutorialState.Completed) this.OnTutorialCompleted.Invoke();
  }

  BeginDelay(duration, startAction, endAction, enableTouchOnEnd = true) {
    if (this.isDelaying) return;
    this.isDelaying = true;
    this.Utility?.DisableTouch();
    const self = this;
    Coroutines.start(
      (function* () {
        startAction?.();
        yield* self.WaitForTimeOrBlockers(duration);
        endAction?.();
        if (enableTouchOnEnd) self.Utility?.EnableTouch();
        self.isDelaying = false;
      })(),
      null,
    );
  }

  *WaitForTimeOrBlockers(duration) {
    let t = 0;
    const hasMainMenu = !!Tutorials.hooks.mainMenu();
    const shouldWait = () => {
      if (t < duration) return true;
      const mm = Tutorials.hooks.mainMenu();
      // a menu reload in progress counts as busy (Unity reloads the menu within the delay; web loads can be slower)
      if (hasMainMenu && (!mm || mm.gameObject?._destroyed || !mm.HomeScreenManager)) return true;
      if (hasMainMenu && (mm.IsBusy || mm.RewardHandler?.AreAnyParticleInstancesActive)) return true;
      return !!Tutorials.hooks.transition()?.IsTransitioning;
    };
    do {
      yield null;
      t += Time.unscaledDeltaTime;
    } while (shouldWait());
  }
}

// ---------------------------------------------------------------- FirstRunTutorial

export class FirstRunTutorial extends RiderBaseTutorial {
  static typeName = 'FirstRunTutorial';

  constructor() {
    super();
    this.flipsDuringTutorial = 2;
    this.extraReleaseTorque = 500;
    this.minApexJumpHeight = 24;
    this.currentStep = FirstRunStep.Inactive;
    this.OnTutorialEnded = new EventAction();
    this.jumpsPerformedCached = 0;
  }

  get SaveName() {
    return 'FTUE_FirstRun';
  }

  /** prefab id of the controls tutorial chunk (serialized RiderChunk reference) */
  get tutorialChunkId() {
    const r = this.tutorialChunk;
    return r?.id || r?.$prefab || 'GameObject/Chunk 1-0-1J - Controls Tutorial';
  }

  get runStateSO() {
    return this.runState?.StartRun ? this.runState : getRuntimeSO('MonoBehaviour/Run State');
  }

  get CurrentStep() {
    return this.currentStep;
  }

  /** compat: the old field name */
  get step() {
    return this.currentStep;
  }

  setStep(value) {
    if (value !== FirstRunStep.AwaitRunStart && this.currentStep !== FirstRunStep.Inactive) {
      this.OnStepCompleted();
      Analytics.tutorialStep(this.SaveName, this.currentStep, STEP_NAMES[this.currentStep], 'done');
    }
    this.currentStep = value;
    if (value !== FirstRunStep.Done) Analytics.tutorialStep(this.SaveName, value, STEP_NAMES[value], 'shown');
    if (value !== FirstRunStep.Done) {
      this.OnStepStarted();
      return;
    }
    this.Complete();
    this.OnTutorialEnded.Invoke();
  }

  PrepareTriggers() {
    const rs = this.runStateSO;
    this._started = () => {
      if (this.currentStep === FirstRunStep.AwaitRunStart) this.setStep(FirstRunStep.AwaitPlayerReady);
    };
    this._jump = () => {
      if (this.currentStep === FirstRunStep.LandSafely) {
        this.Utility?.Hide();
        this.setStep(FirstRunStep.Done);
        Tutorials.hooks.pauseWorldFx(false);
      }
    };
    this._died = () => rs.AnalyticsRunsTracker.AddFailedFirstRun();
    rs.runStarted.AddListener(this._started);
    rs.jumpCompleted.AddListener(this._jump);
    rs.playerDied.AddListener(this._died);
  }

  Unsubscribe() {
    const rs = this.runStateSO;
    rs.runStarted.RemoveListener(this._started);
    rs.jumpCompleted.RemoveListener(this._jump);
    rs.playerDied.RemoveListener(this._died);
  }

  OnActivated() {
    this.setStep(FirstRunStep.AwaitRunStart);
  }

  HandleUpdate() {
    const rs = this.runStateSO;
    const ps = rs.PlayerState;
    const u = this.Utility;
    switch (this.currentStep) {
      case FirstRunStep.AwaitPlayerReady:
        if (!rs.IsRunning || !ps.IsGrounded) return;
        this.BeginDelay(0.2, null, () => {
          this.setStep(FirstRunStep.HoldToAccelerate);
          u?.ShowText(this.accelerateTextContent);
        });
        break;
      case FirstRunStep.HoldToAccelerate:
        if (ps.IsJumping) {
          u?.Hide();
          this.setStep(FirstRunStep.AwaitJumpApex);
        }
        break;
      case FirstRunStep.AwaitJumpApex:
        if (ps.IsJumping && ps.GetVelocity().y <= 0 && ps.Position.y >= this.minApexJumpHeight) {
          this.jumpsPerformedCached = ps.FlipsInCurrJump;
          u?.ShowText(this.flipTextContent);
          this.setStep(FirstRunStep.HoldToFlip);
          if (u && this.rotateFocus) {
            this.rotateFocus.target = u.SetUITarget(ps.Player.CarVisuals?.transform || ps.Player.transform);
            u.FocusOn(this.rotateFocus, true);
          }
          Tutorials.hooks.pauseWorldFx(true);
        } else if (!ps.IsJumping && ps.GetVelocity().y <= 0) {
          rs.Finish(6 /* DeathReason.TutorialFailure */, 2 /* EndState.Defeat */);
          this.setStep(FirstRunStep.AwaitRunStart);
        }
        break;
      case FirstRunStep.HoldToFlip:
        if (ps.FlipsInCurrJump >= this.flipsDuringTutorial + this.jumpsPerformedCached) {
          u?.Hide();
          this.setStep(FirstRunStep.LandSafely);
          Tutorials.hooks.pauseWorldFx(false);
        }
        break;
      default:
    }
    if (ps.IsDefeated && this.currentStep !== FirstRunStep.AwaitRunStart) {
      u?.Hide();
      Tutorials.hooks.pauseWorldFx(false);
      this.setStep(FirstRunStep.AwaitRunStart);
    }
  }

  Complete() {
    super.Complete();
    this.Unsubscribe();
  }
}

// ---------------------------------------------------------------- TutorialService

export const Tutorials = {
  onTutorialChanged: new EventAction(),
  remaining: [],
  activeTutorial: null,
  all: [],
  initialized: false,
  /** UI-side lookups (set by src/uiscripts/tutorials.js) */
  hooks: {
    utility: () => null,
    mainMenu: () => null,
    transition: () => null,
    rankPopupBlocked: () => false,
    pauseWorldFx: () => {},
  },

  get save() {
    return (Save.data.tutorials ||= {});
  },

  init() {
    if (this.initialized) return;
    this.initialized = true;
    const coll = Assets.so[TUTORIALS_COLLECTION];
    const ids = (coll?.assets || []).map((r) => r?.$so).filter(Boolean);
    this.all = ids.map((id) => getRuntimeSO(id)).filter((t) => t instanceof BaseTutorial);
    for (const t of this.all) t.Initialize(this);
  },

  GetTutorialState(t) {
    return this.save[t.SaveName] || TutorialState.NotStarted;
  },

  SetTutorialState(t) {
    const s = t.State === TutorialState.Completed || t.State === TutorialState.Skipped ? t.State : TutorialState.NotStarted;
    if ((this.save[t.SaveName] || 0) !== s) {
      if (s) this.save[t.SaveName] = s;
      else delete this.save[t.SaveName];
      Save.setDirty();
    }
    if (this.activeTutorial === t && t.IsFinished) this.activeTutorial = null;
    if (t.IsFinished) Analytics.tutorialStep(t.SaveName, 100, 'end', t.State === TutorialState.Skipped ? 'skipped' : 'done');
    this.onTutorialChanged.Raise(t);
  },

  AddTutorial(t) {
    this.remaining.push(t);
  },

  get ActiveTutorial() {
    return this.activeTutorial;
  },

  get IsActive() {
    return !!this.activeTutorial;
  },

  /** compat for older callers */
  get IsShowing() {
    return this.IsActive;
  },

  get FirstRun() {
    return this.all.find((t) => t instanceof FirstRunTutorial) || getRuntimeSO('MonoBehaviour/FirstRunTutorial');
  },

  byName(saveName) {
    return this.all.find((t) => t.SaveName === saveName) || null;
  },

  /** IUpdatable.Update */
  Update() {
    if (!this.initialized) return;
    if (this.activeTutorial) {
      this.activeTutorial.HandleUpdate();
      return;
    }
    for (let i = 0; i < this.remaining.length; i++) {
      const t = this.remaining[i];
      if (t.CanSkip()) {
        t.Complete();
        this.remaining.splice(i, 1);
        i--;
      } else if (t.CanStart()) {
        this.activeTutorial = t;
        t.Activate();
        Analytics.tutorialStep(t.SaveName, 0, 'start', 'shown');
        this.remaining.splice(i, 1);
        return;
      }
    }
  },
};

registerSO(BaseTutorial, 'BaseTutorial');
registerSO(RiderBaseTutorial, 'RiderBaseTutorial');
registerSO(FirstRunTutorial, 'FirstRunTutorial');
