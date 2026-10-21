// In-game HUD canvas (MainGame.unity "HUD") and the run UI it spawns: score / level timer, bonus letter bar,
// jump score texts (JumpBonusManager), compliments, currency particles, flash, challenge run popups, markers.
import * as THREE from 'three';
import { MonoBehaviour, Destroy, World } from '../engine/scene.js';
import { EventAction, WaitForSeconds, Time } from '../engine/core.js';
import { registerComponent, Instantiate, PrefabRef } from '../engine/instantiate.js';
import { Assets } from '../engine/assets.js';
import { AnimationCurve, Gradient } from '../engine/math.js';
import { Render } from '../engine/render.js';
import { Physics2D } from '../engine/physics2d.js';
import { UISystem } from '../ugui/canvas.js';
import { Color } from '../ugui/graphic.js';
import { Game, RunMode, DeathReason, EndState } from '../game/state.js';
import { FeedbackEvents } from '../game/mmfeedbacks.js';
import { UI as UIHooks } from '../game/uihooks.js';
import { Tutorials, TutorialState } from '../meta/tutorials.js';
import { Save } from '../meta/save.js';
import { csFormat, localize, ev } from './common.js';
import { AudioSampleID, SettingsContainer, WorldManager, ChallengeManager, endlessHighScores } from './services.js';
import { getMenuState, TransitionScreen } from './scenes.js';

const v3 = (a) => (Array.isArray(a) ? new THREE.Vector3(a[0] || 0, a[1] || 0, -(a[2] || 0)) : a ? a.clone() : new THREE.Vector3());

/** little-endian int32 hex string -> int[] (Unity int array serialization) */
export function hexInts(h) {
  if (Array.isArray(h)) return h;
  const out = [];
  if (typeof h !== 'string') return out;
  for (let i = 0; i + 8 <= h.length; i += 8) out.push(parseInt(h.slice(i + 6, i + 8) + h.slice(i + 4, i + 6) + h.slice(i + 2, i + 4) + h.slice(i, i + 2), 16) | 0);
  return out;
}

const _p = new THREE.Vector3();

/** Camera.main.WorldToScreenPoint: three-space point -> UI screen pixels (origin bottom-left) */
export function worldToScreenPoint(p) {
  const cam = Render.camera;
  _p.copy(p).project(cam);
  return new THREE.Vector3(((_p.x + 1) / 2) * UISystem.width, ((_p.y + 1) / 2) * UISystem.height, _p.z);
}

function runState() {
  return Game.manager?.RunState;
}

// ---------------------------------------------------------------- HUD

export class HUD extends MonoBehaviour {
  static typeName = 'HUD';

  static Instance = null;

  constructor() {
    super();
    this.reviveDelay = 1;
    this.FTUE_TutorialBusy = false;
  }

  get BonusLetterTutorialSocket() {
    return this.bonusLetterBarSocket;
  }

  get PauseButton() {
    return this.pauseButton;
  }

  get TutorialTarget() {
    return this.tutorialTarget;
  }

  Initialize() {
    HUD.Instance = this;
    if (Game.manager) Game.manager.hud = this;
    const rs = this.runState;
    this._reset = () => this.OnRunReset();
    this.restartButton.onClick.AddListener(this._reset);
    this._prompt = () => this.OpenRevivalPrompt();
    rs.revivePrompted.AddListener(this._prompt);
    this._answered = (s) => this.OnRevivePromptAnswered(s);
    if (Tutorials.FirstRun.State === TutorialState.Started) this.OnTutorialStart();
    this._started = () => this.UpdateHUDState();
    rs.runStarted.AddListener(this._started);
    this.UpdateHUDState();
    this._focus = () => this.OnApplicationFocus(!document.hidden);
    document.addEventListener('visibilitychange', this._focus);
    this._key = (e) => this.OnKey(e);
    window.addEventListener('keydown', this._key);
  }

  OnDestroy() {
    const rs = this.runState;
    rs?.runStarted.RemoveListener(this._started);
    rs?.revivePrompted.RemoveListener(this._prompt);
    rs?.reviveAnswered.RemoveListener(this._answered);
    Tutorials.FirstRun.OnTutorialEnded?.RemoveListener(this._tutEnd);
    document.removeEventListener('visibilitychange', this._focus);
    window.removeEventListener('keydown', this._key);
    if (HUD.Instance === this) HUD.Instance = null;
  }

  OnApplicationFocus(hasFocus) {
    if (!hasFocus && this.runState.IsRunning && !Tutorials.IsActive) this.pauseMenu.SetActive(true);
  }

  /** keyboard: Esc / P toggle the pause menu like the pause button / its resume button */
  OnKey(e) {
    if (e.code !== 'Escape' && e.code !== 'KeyP') return;
    if (!this.pauseButton?.gameObject.activeInHierarchy && !this.pauseMenu.activeSelf) return;
    if (this.pauseMenu.activeSelf) this.pauseMenu.GetComponent('UI_PauseMenu')?.OnPressedResume?.();
    else if (this.runState.IsRunning && !Tutorials.IsActive && !this._reviveOpen) this.pauseButton.Press();
  }

  OpenNoAdPopUp() {
    return this.noAdPrefab ? Instantiate(this.noAdPrefab, this.transform, false) : null;
  }

  OnRunReset() {
    if (getMenuState().isSceneTransitioning) return;
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.runState.Finish(DeathReason.RunReset, EndState.Defeat);
  }

  OnTutorialStart() {
    this._tutEnd = () => this.OnTutorialEnd();
    Tutorials.FirstRun.OnTutorialEnded?.AddListener(this._tutEnd);
    this.FTUE_TutorialBusy = true;
    this.restartButton.gameObject.SetActive(false);
    this.currencyBar.SetActive(false);
    this.pauseButton.gameObject.SetActive(false);
  }

  OnTutorialEnd() {
    this.topContainerRevealAnimation?.gameObject.SetActive(true);
    Tutorials.FirstRun.OnTutorialEnded?.RemoveListener(this._tutEnd);
    this.restartButton.gameObject.SetActive(true);
    this.currencyBar.SetActive(true);
    this.pauseButton.gameObject.SetActive(true);
    this.FTUE_TutorialBusy = false;
    this.UpdateHUDState();
  }

  UpdateHUDState() {
    const rs = this.runState;
    if (!rs.IsRunning || !rs.Mode) return;
    const mode = rs.Mode.RunMode;
    if (!this.FTUE_TutorialBusy) {
      this.restartButton.gameObject.SetActive(mode === RunMode.TimedLevel);
      this.currencyBar.SetActive(mode !== RunMode.TimedLevel);
    }
    this.currencyBarBonus.SetActive(mode === RunMode.Bonus);
    this.currencyBar.SetActive(mode !== RunMode.Bonus && mode !== RunMode.TimedLevel);
    this.scoreDisplay.HandleRunStart();
    this.topContainerRevealAnimation?.DOPlay();
  }

  OpenRevivalPrompt() {
    if (this.currencyBar.activeInHierarchy) {
      this.currencyBar.SetActive(false);
      this.runState.reviveAnswered.AddListener(this._answered);
    }
    this.StartCoroutine(this.HandleRevivePrompt());
  }

  *HandleRevivePrompt() {
    yield new WaitForSeconds(this.reviveDelay);
    this._reviveOpen = true;
    const ui = Instantiate(this.revivePrefab, this.transform, false);
    ui.Open(-1, (state) => {
      this._reviveOpen = false;
      this.runState.reviveAnswered.Raise(state);
    });
  }

  OnRevivePromptAnswered() {
    this.runState.reviveAnswered.RemoveListener(this._answered);
    this.currencyBar.SetActive(true);
  }
}

// ---------------------------------------------------------------- score / level timer

export class GameplayScoreDisplay extends MonoBehaviour {
  static typeName = 'GameplayScoreDisplay';

  Awake() {
    this.scoreText.gameObject.SetActive(false);
    this.levelTimer.gameObject.SetActive(false);
    this.firstLevelPlayTutorial?.SetLevelHUDReference?.(this.levelTimer?.transform);
    this.lastHighScore = endlessHighScores(WorldManager.Instance.CurrentWorldIndex).highScore;
    this.didHighScoreFeedback = false;
    this._score = (s) => this.HandleScoreChanged(s);
    this._max = (b) => this.OnMaxChunkScoreReached(b);
  }

  OnDestroy() {
    this.runState?.scoreChanged.RemoveListener(this._score);
    Game.manager?.jumpBonusManager?.maxChunkScoreReached.RemoveListener(this._max);
  }

  HandleTimeChanged() {
    this.levelTimer.SetTime(this.runState.RunTimer);
  }

  PlayTimeReductionFeedback() {
    this.levelTimer.PlayTimeReductionFeedback();
  }

  PlayJumpScoreFeedback() {
    this.jumpScoreFeedback?.StopFeedbacks();
    this.jumpScoreFeedback?.PlayFeedbacks();
  }

  HandleRunStart() {
    const rs = this.runState;
    const mode = rs.Mode;
    const timed = mode.RunMode === RunMode.TimedLevel ? mode : null;
    if (mode.Settings.TracksTime) {
      this.levelTimer.Initialize(timed);
      this.levelTimer.gameObject.SetActive(true);
      this.HandleTimeChanged();
    } else this.levelTimer.gameObject.SetActive(false);
    if (mode.Settings.TracksScore) {
      this.scoreText.gameObject.SetActive(true);
      rs.scoreChanged.RemoveListener(this._score);
      rs.scoreChanged.AddListener(this._score);
      const jbm = Game.manager?.jumpBonusManager;
      jbm?.maxChunkScoreReached.RemoveListener(this._max);
      jbm?.maxChunkScoreReached.AddListener(this._max);
      this.HandleScoreChanged(rs.StatTracker.Score);
    } else this.scoreText.gameObject.SetActive(false);
  }

  HandleScoreChanged(score) {
    this.scoreText.text = String(score);
    if (this.runState.AnalyticsRunsTracker.TotalRunsPlayed >= 2 && !this.didHighScoreFeedback && score > this.lastHighScore) {
      this.newHighScoreFeedback?.PlayFeedbacks();
      this.didHighScoreFeedback = true;
    }
  }

  OnMaxChunkScoreReached(maxReached) {
    if (maxReached) {
      this.scoreUnlockedFeedback?.StopFeedbacks();
      this.scoreLockedFeedback?.PlayFeedbacks();
    } else {
      this.scoreLockedFeedback?.StopFeedbacks();
      this.scoreUnlockedFeedback?.PlayFeedbacks();
    }
  }
}

export class UILevelTimer extends MonoBehaviour {
  static typeName = 'UILevelTimer';

  constructor() {
    super();
    this.lastStars = 0;
  }

  get maxShow() {
    const m = this.maximumShowTime;
    if (!m) return 99.999;
    return (m.days || 0) * 86400 + (m.hours || 0) * 3600 + (m.minutes || 0) * 60 + (m.seconds || 0) + (m.milliseconds || 0) / 1000;
  }

  Initialize(mode) {
    this.timedLevelMode = mode;
  }

  SetTime(timer) {
    let t = timer.GetElapsedTime(true);
    const max = this.maxShow;
    if (t >= max) t = max;
    this.SetTimeText(t, max);
    this.UpdateFillBars(t);
    this.UpdateStars(t);
  }

  PlayTimeReductionFeedback() {
    this.timeReductionFeedback?.PlayFeedbacks();
  }

  SetTimeText(t, max) {
    const below = t < max;
    const c = Color.from(below ? this.timerDefaultColor : this.timerMaxedColor);
    // TimeSpan.TotalSeconds floor + Milliseconds component
    const secs = Math.floor(t + 1e-9);
    const ms = Math.floor(Math.abs(t - Math.trunc(t)) * 1000 + 1e-6) % 1000;
    this.secondsTimeText.text = String(secs);
    this.secondsTimeText.color = c;
    this.millisecondsTimeText.text = `.${String(ms).padStart(3, '0')}`;
    this.millisecondsTimeText.color = c;
  }

  UpdateFillBars(t) {
    const m = this.timedLevelMode;
    if (!m) return;
    const two = m.level.twoStarTime;
    this.clockFill.fillAmount = 1 - t / two;
    this.clockFillOverlayStar2.fillAmount = 1 - m.level.threeStarTime / two;
  }

  UpdateStars(t) {
    const m = this.timedLevelMode;
    if (!m) return;
    const stars = m.GetEarnedStars(t);
    if (this.lastStars !== stars) {
      this.lastStars = stars;
      const f = stars === 3 ? this.star3RemainingFeedback : stars === 2 ? this.star2RemainingFeedback : this.star1RemainingFeedback;
      f?.Initialization();
      f?.PlayFeedbacks();
    }
    this.star3TimerText.text = m.level.threeStarTime.toFixed(3);
    this.star2TimerText.text = m.level.twoStarTime.toFixed(3);
  }
}

export class TimedLevelNameDisplay extends MonoBehaviour {
  static typeName = 'TimedLevelNameDisplay';

  Awake() {
    const mode = Game.manager?.RunState?.Mode;
    const level = mode?.RunMode === RunMode.TimedLevel ? mode.level : null;
    const d = level ? level.difficulty : 0;
    const term = d === 0 ? this.easyText : d === 1 ? this.mediocreText : this.difficultText;
    this.idText?.SetTerm(term);
    this.idText?.SetText(level ? level.number : 0);
  }
}

// ---------------------------------------------------------------- bonus letters / bonus mode timer

export class UI_BonusLetterCurrency extends MonoBehaviour {
  static typeName = 'UI_BonusLetterCurrency';

  constructor() {
    super();
    this.previousValue = 0;
  }

  get CanShowBonusRideBar() {
    return SettingsContainer.Instance.bonusSettings.bonusModeState.IsUnlocked && this.runState?.Mode?.RunMode === RunMode.Endless;
  }

  Start() {
    this.showFeedback?.Initialization();
    this.UpdatePips();
    this._start = () => this.OnRunStart();
    this._end = () => this.OnRunEnd();
    this._changed = () => this.UpdatePips();
    this.runState.runStarted.AddListener(this._start);
    this.runState.runFinished.AddListener(this._end);
    // scene loads finish synchronously here: a run started by the load callback began before Start
    if (this.runState.IsRunning) this.OnRunStart();
  }

  OnDestroy() {
    this.runState.runStarted.RemoveListener(this._start);
    this.runState.runFinished.RemoveListener(this._end);
    this.runState.StatTracker?.OnBonusCurrencyChanged.RemoveListener(this._changed);
    this.showFeedback?.StopFeedbacks(true);
  }

  OnRunStart() {
    this._tracker?.OnBonusCurrencyChanged.RemoveListener(this._changed);
    this._tracker = this.runState.StatTracker;
    this._tracker.OnBonusCurrencyChanged.AddListener(this._changed);
    if (this.CanShowBonusRideBar) {
      this.gameObject.SetActive(true);
      this.UpdatePips();
    } else this.gameObject.SetActive(false);
  }

  OnRunEnd() {
    this._tracker?.OnBonusCurrencyChanged.RemoveListener(this._changed);
  }

  UpdatePips() {
    if (this.showFeedback) {
      if (this.showFeedback.IsPlaying) this.showFeedback.StopFeedbacks(true);
      this.showFeedback.PlayFeedbacks();
    }
    const total = this.runState.StatTracker?.BonusLetterCurrencyTotal ?? 0;
    const pips = this.pips || [];
    if (total >= 1 && total <= pips.length) this.particleTarget.position = pips[total - 1].transform.position;
    for (let i = this.previousValue; i < pips.length; i++) if (i < total) this.StartCoroutine(this.WaitForParticles(pips[i], i === pips.length - 1));
  }

  *WaitForParticles(pip, isLast) {
    yield null;
    while (UI_CurrencyParticles.Instance && UI_CurrencyParticles.Instance.HasBonusCurrencyParticles) yield null;
    pip.ActivateFeedback();
    if (isLast) {
      while (pip.feedbackOnActivate?.IsPlaying) yield null;
      this.bonusBarFullFeedback?.PlayFeedbacks();
    }
  }
}

export class UIBonusModeTimer extends MonoBehaviour {
  static typeName = 'UIBonusModeTimer';

  get CanShowBonusRideBar() {
    return this.runState?.Mode?.RunMode === RunMode.Bonus;
  }

  Start() {
    this._start = () => {
      this.gameObject.SetActive(this.CanShowBonusRideBar);
      this.triggeredTimerLow = false;
    };
    this.runState.runStarted.AddListener(this._start);
    this.gameObject.SetActive(false);
    if (this.runState.IsRunning && this.CanShowBonusRideBar) this._start();
  }

  OnDestroy() {
    this.runState.runStarted.RemoveListener(this._start);
  }

  Update() {
    const rs = this.runState;
    if (!rs.Mode || !this.CanShowBonusRideBar) return;
    const dur = this.settings?.bonusRunDuration ?? 30;
    let rem = dur - rs.RunTimer.GetElapsedTime(false);
    if (rem < 0) rem = 0;
    if (rs.IsRunning && this.timerTxt) {
      const m = Math.floor(rem / 60);
      const s = rem - m * 60;
      this.timerTxt.text = `${m}:${s.toFixed(3).padStart(6, '0')}`;
    }
    if (rem <= (this.settings?.bonusRunAlmostOver ?? 5) && !this.triggeredTimerLow) {
      this.timerRunningLowFeedback?.PlayFeedbacks();
      this.triggeredTimerLow = true;
    }
  }
}

// ---------------------------------------------------------------- JumpBonusManager + JumpScoreText

export class JumpBonusManager extends MonoBehaviour {
  static typeName = 'JumpBonusManager';

  constructor() {
    super();
    this.jumpScoreCompleted = new EventAction();
    this.maxChunkScoreReached = new EventAction();
    this.jumpScoreAddDelay = 0.55;
    this.lastReachedMaxScoreThisChunk = false;
    this.currentScoreThisChunk = 0;
    this.maxScoreThisChunk = Infinity;
    this.distanceTraveledOnGround = 0;
    this.nextScoreDistance = 0;
    this.outstandingJumpScore = 0;
    this.currentFlipCount = 0;
    this.outstandingTimeReduction = 0;
    this.Player = null;
  }

  get TracksAnything() {
    return !!(this.SettingScore || this.SettingTimeReduction);
  }

  get TracksScore() {
    return !!this.SettingScore;
  }

  get TracksTime() {
    return !!this.SettingTimeReduction;
  }

  get ReachedMaxScoreThisChunk() {
    return this.currentScoreThisChunk >= this.maxScoreThisChunk;
  }

  Awake() {
    const rs = this.runState;
    this._jump = (d) => this.HandleJumpCompleted(d);
    this._flip = (f) => this.HandleFlip(f);
    this._respawn = () => this.OnRunRespawn();
    this._start = () => this.HandleRunStart();
    this._end = () => this.HandleRunEnded();
    this._chunk = (c) => this.OnCurrentChunkChangedEvent(c);
    rs.jumpCompleted.AddListener(this._jump);
    rs.flipsChanged.AddListener(this._flip);
    rs.runRespawnPlayer.AddListener(this._respawn);
    rs.runStarted.AddListener(this._start);
    rs.playerDied.AddListener(this._end);
    this.rcm = Game.manager?.RoadChunkManager;
    this.rcm?.CurrentChunkChanged.AddListener(this._chunk);
    this.maxScoreThisChunk = Infinity;
    // GameManager.jumpBonusManager (the HUD scene object); the player may already be spawned
    if (Game.manager) {
      Game.manager.jumpBonusManager = this;
      this.Player = Game.manager.player || null;
    }
  }

  OnDestroy() {
    const rs = this.runState;
    rs.jumpCompleted.RemoveListener(this._jump);
    rs.flipsChanged.RemoveListener(this._flip);
    rs.runRespawnPlayer.RemoveListener(this._respawn);
    rs.runStarted.RemoveListener(this._start);
    rs.playerDied.RemoveListener(this._end);
    this.rcm?.CurrentChunkChanged.RemoveListener(this._chunk);
  }

  Update() {
    const p = this.Player;
    if (!p || p.gameObject._destroyed) return;
    if (p.CollisionChecker.IsFrontGrounded || p.CollisionChecker.IsBackGrounded) {
      const d = p.Rigidbody2D.velocity.length() * Time.deltaTime;
      this.distanceTraveledOnGround += d;
      this.runState.StatTracker.AddDistanceOnRoad(d);
    }
    if (this.TracksScore) {
      const s = this.SettingScore;
      if (s.distancePerPoint > 0 && this.distanceTraveledOnGround >= this.nextScoreDistance) {
        this.AddScore(1);
        this.nextScoreDistance += s.distancePerPoint;
      }
      this.HandleMaxChunkScore();
    }
    if (this.TracksTime) this.scoreDisplay.HandleTimeChanged();
  }

  HandleRunStart() {
    const s = this.runState.Mode.Settings;
    this.SettingScore = s.JumpBonusScore || null;
    if (this.SettingScore) this.nextScoreDistance = this.SettingScore.distancePerPoint;
    this.SettingTimeReduction = s.JumpBonusTimeReduction || null;
  }

  HandleRunEnded() {
    if (this.jumpScoreTextInstance && !this.jumpScoreTextInstance.gameObject._destroyed) this.jumpScoreTextInstance.HandleJumpFailed();
    if (this.TracksScore) this.ResolveOutstandingJumpScore();
    if (this.TracksTime) this.HandleRunEndedTime();
    this.currentFlipCount = 0;
  }

  HandleRunEndedTime() {
    const rs = this.runState;
    if (rs.RunEndState.IsVictorious || rs.Mode.RunMode === RunMode.TimedLevel) {
      if (rs.PlayerState.IsJumping) this.HandleJumpCompleted(rs.PlayerState.GetCurrentJumpData(false));
      this.ResolveOutstandingJumpTimeReduction();
    }
  }

  HandleFlip(flips) {
    const rs = this.runState;
    if (!this.TracksAnything || !rs.Mode || rs.RunEndState.IsDefeated) return;
    const total = flips.TotalFlips;
    if (total !== this.currentFlipCount && total === 1) {
      this.jumpScoreTextInstance = Instantiate(this.jumpScoreTextPrefab, this.jumpScoreTextOrigin);
      const end = rs.Mode.RunMode === RunMode.TimedLevel ? this.jumpScoreLevelTextEnd : this.jumpScoreEndlessTextEnd;
      this.jumpScoreTextInstance.Initialize(this.Player?.transform, end, this.scoreDisplay);
    }
    this.currentFlipCount = flips.TotalFlips;
    const t = this.jumpScoreTextInstance;
    if (!t || t.gameObject._destroyed) return;
    if (this.TracksScore) {
      if (rs.Mode.RunMode === RunMode.Bonus) t.UpdateCurrency(this.currentFlipCount, this.SettingScore.perFlip * this.currentFlipCount, false);
      else t.UpdateScore(this.currentFlipCount, this.SettingScore.perFlip * this.currentFlipCount, false, this.ReachedMaxScoreThisChunk);
    } else if (this.TracksTime) t.UpdateTimeReduction(this.currentFlipCount, this.SettingTimeReduction.perFlip * this.currentFlipCount, false);
  }

  HandleJumpCompleted(data) {
    const t = this.jumpScoreTextInstance;
    if (!this.TracksAnything || !t || t.gameObject._destroyed || this.currentFlipCount === 0) return;
    const rs = this.runState;
    if (this.TracksScore) {
      let score = this.SettingScore.perFlip * data.TotalFlips;
      if (data.perfect) {
        score = this.SettingScore.perfectMultiplier * score;
        if (rs.Mode.RunMode === RunMode.Bonus) t.UpdateCurrency(this.currentFlipCount, score, true);
        else t.UpdateScore(this.currentFlipCount, score, true, this.ReachedMaxScoreThisChunk);
      }
      this.ResolveOutstandingJumpScore();
      this._scoreCo = this.StartCoroutine(this.ScoreAddRoutine(score, this.jumpScoreAddDelay));
      this.jumpScoreCompleted.Raise({ data, score });
    }
    if (this.TracksTime) {
      let tr = this.SettingTimeReduction.perFlip * this.currentFlipCount;
      if (data.perfect) {
        tr *= this.SettingTimeReduction.perfectMultiplier;
        t.UpdateTimeReduction(this.currentFlipCount, tr, true);
      }
      this.ResolveOutstandingJumpTimeReduction();
      this._timeCo = this.StartCoroutine(this.TimeSubtractRoutine(tr, this.jumpScoreAddDelay));
    }
    this.currentFlipCount = 0;
    t.HandleJumpComplete();
  }

  HandleMaxChunkScore() {
    const r = this.ReachedMaxScoreThisChunk;
    if (this.lastReachedMaxScoreThisChunk === r) return;
    this.lastReachedMaxScoreThisChunk = r;
    this.maxChunkScoreReached.Raise(r);
    const t = this.jumpScoreTextInstance;
    if (t && !t.gameObject._destroyed && this.TracksScore) t.UpdateScore(this.currentFlipCount, this.SettingScore.perFlip * this.currentFlipCount, false, r);
  }

  *ScoreAddRoutine(score, delay) {
    this.outstandingJumpScore = score;
    let t = 0;
    while (t < delay) {
      t += Time.deltaTime;
      yield null;
    }
    this.ResolveOutstandingJumpScore();
  }

  *TimeSubtractRoutine(tr, delay) {
    this.outstandingTimeReduction = tr;
    let t = 0;
    while (t < delay) {
      t += Time.deltaTime;
      yield null;
    }
    this.ResolveOutstandingJumpTimeReduction();
  }

  ResolveOutstandingJumpScore() {
    if (this.TracksScore && this.outstandingJumpScore >= 1) {
      if (this._scoreCo) {
        this.StopCoroutine(this._scoreCo);
        this._scoreCo = null;
      }
      this.AddScore(this.outstandingJumpScore);
      this.outstandingJumpScore = 0;
    }
  }

  ResolveOutstandingJumpTimeReduction() {
    if (this.TracksTime && this.outstandingTimeReduction > 0) {
      if (this._timeCo) {
        this.StopCoroutine(this._timeCo);
        this._timeCo = null;
      }
      this.runState.RunTimer.SubtractTime(this.outstandingTimeReduction);
      this.scoreDisplay.PlayTimeReductionFeedback();
      this.outstandingTimeReduction = 0;
    }
  }

  AddScore(score) {
    const add = this.currentScoreThisChunk < this.maxScoreThisChunk ? score : 0;
    this.currentScoreThisChunk += add;
    this.runState.StatTracker.AddScore(add);
  }

  OnRunRespawn() {
    if (this.TracksScore && this.SettingScore.resetChunkScoreLimitOnRevive) this.currentScoreThisChunk = 0;
  }

  OnCurrentChunkChangedEvent(chunk) {
    this.currentScoreThisChunk = 0;
    this.maxScoreThisChunk = chunk?.MaxAchievableChunkScore ?? 0;
  }
}

export class JumpScoreText extends MonoBehaviour {
  static typeName = 'JumpScoreText';

  constructor() {
    super();
    this.currencyPrefix = '+<sprite=2>';
    this.scorePrefix = '+';
    this.timeFormat = '{0:0.##} s';
    this.endDelay = 0.2;
    this.ending = false;
    this.endRemainingTime = 0;
  }

  Awake() {
    this.sizes = hexInts(this.textSizes);
    if (!this.sizes.length) this.sizes = [70, 80, 90, 100, 110, 120];
    this.updateFeedback?.Initialization();
    this.failFeedback?.Initialization();
    this.completeFeedback?.Initialization();
  }

  LateUpdate() {
    if (this.ending) {
      if (this.endRemainingTime > 0) {
        this.endRemainingTime -= Time.deltaTime;
        if (!(this.endRemainingTime > 0)) this.completeFeedback?.PlayFeedbacks();
      }
    } else if (this.followPlayer && this.followTarget && !this.followTarget.gameObject._destroyed) {
      this.transform.position = worldToScreenPoint(this.followTarget.position.add(v3(this.followOffset)));
    }
  }

  Initialize(follow, endMoveTarget, display) {
    this.scoreDisplay = display;
    this.followTarget = follow;
    const pos = (this.completeFeedback?.Feedbacks || []).find((f) => f?._typeName === 'MMFeedbackPosition');
    if (pos) pos.DestinationPositionTransform = endMoveTarget;
  }

  UpdateScore(flips, score, perfect, maxReached) {
    AudioSampleID.UI_FlipScoreAdd.Play();
    this.HandleNewText(flips, perfect, this.scorePrefix + String(score), maxReached);
  }

  UpdateCurrency(flips, score, perfect) {
    AudioSampleID.UI_FlipScoreAdd.Play();
    this.HandleNewText(flips, perfect, this.currencyPrefix + String(score));
  }

  UpdateTimeReduction(flips, tr, perfect) {
    this.HandleNewText(flips, perfect, csFormat(this.timeFormat, tr));
  }

  HandleJumpComplete() {
    this.ending = true;
    this.endRemainingTime = this.endDelay;
  }

  HandleJumpFailed() {
    this.ending = true;
    this.failFeedback?.PlayFeedbacks();
  }

  PlayFeedbackOnScoreDisplay() {
    if (!this.maxScoreReached) this.scoreDisplay?.PlayJumpScoreFeedback();
  }

  HandleNewText(flips, perfect, text, maxReached = false) {
    if (this.ending) return;
    this.maxScoreReached = maxReached;
    if (maxReached) {
      text = `${this.scorePrefix}0`;
      flips = 0;
    }
    this.updateFeedback?.StopFeedbacks();
    this.perfectObject?.SetActive(perfect);
    if (this.scoreText) {
      this.scoreText.fontSize = this.sizes[Math.max(0, Math.min(flips - 1, this.sizes.length - 1))];
      this.scoreText.color = Color.from(maxReached ? this.lockedTextColor : perfect ? this.perfectTextColor : this.defaultTextColor);
      this.scoreText.text = text;
    }
    this.updateFeedback?.PlayFeedbacks();
  }
}

// ---------------------------------------------------------------- compliments

/** CW PrefabPool<TextFloater> */
class TextFloaterPool {
  constructor(prefab, node) {
    this.prefab = prefab;
    this.spawnNode = node;
    this.active = [];
    this.inactive = [];
    this.id = -1;
  }

  Activate() {
    let f = this.inactive.shift();
    if (!f || f.gameObject._destroyed) {
      f = Instantiate(this.prefab, this.spawnNode || null);
      f.gameObject.name = `${this.prefab.name} ${++this.id}`;
      f.SetPool(this);
    }
    this.active.push(f);
    return f;
  }

  Deactivate(item, hide = false) {
    if (hide) item.gameObject.SetActive(false);
    const i = this.active.indexOf(item);
    if (i >= 0) {
      this.active.splice(i, 1);
      this.inactive.push(item);
    }
  }
}

export class ComplimentSpawner extends MonoBehaviour {
  static typeName = 'ComplimentSpawner';

  get settings() {
    return SettingsContainer.Instance.complimentSettings;
  }

  Start() {
    this._jump = (d) => this.HandleJumpCompleted(d);
    this.runState.jumpCompleted.AddListener(this._jump);
    const s = this.settings;
    this.floaterPools = (s.complimentQualities || []).map((p) => new TextFloaterPool(p, null));
    this.perfectPool = new TextFloaterPool(s.perfectFollower, null);
    this.previousCompliment = null;
  }

  OnDestroy() {
    this.runState.jumpCompleted.RemoveListener(this._jump);
  }

  HandleJumpCompleted(data) {
    const rs = this.runState;
    if (!rs.Mode?.Settings.ComplimentLanding) return;
    if (data.perfect && data.flips.TotalFlips > 0) {
      const pf = this.perfectPool.Activate();
      this.perfectFloaterSpawner.SpawnTextFloater(pf, rs.PlayerState.Position, 1, null);
      pf.SetStartPos(rs.PlayerState.Position.add(v3(this.perfectFloaterSpawner.spawnOffset)));
    }
    const set = this.GetRandomComplimentSet(data);
    if (!set) return;
    if (this.lastComplimentFloater && !this.lastComplimentFloater.gameObject._destroyed) this.lastComplimentFloater.CutShort();
    const comp = getRandomComplimentFromSet(set, this.previousCompliment);
    const floater = this.floaterPools[set.complimentQuality - 1]?.Activate();
    if (!floater) return;
    floater.SetInactiveCallback(() => (this.lastComplimentFloater = null));
    const text = comp ? localize(comp) : null;
    if (text !== null && text !== undefined) {
      this.lastComplimentFloater = this.textFloaterSpawner.SpawnTextFloater(floater, rs.PlayerState.Position, set.scale, text);
      AudioSampleID.UI_Compliment.Play();
      this.previousCompliment = comp;
    }
  }

  GetRandomComplimentSet(data) {
    const r = this.DetermineComplimentSets(data, data.flips);
    if (!r) return null;
    return (
      r.sets
        .filter((x) => !x.ignore && r.threshold >= x.flipThreshold)
        .sort((a, b) => b.flipThreshold - a.flipThreshold)[0] || null
    );
  }

  DetermineComplimentSets(data, f) {
    const s = this.settings;
    if (f.backwardFlips > 0 && f.forwardFlips > 0) return { threshold: f.forwardFlips + f.backwardFlips, sets: (data.perfect ? s.perfectFlipFBCompliments : s.flipFBCompliments) || [] };
    if (f.backwardFlips > 0) return { threshold: f.backwardFlips, sets: (data.perfect ? s.perfectFlipBCompliments : s.flipBCompliments) || [] };
    if (f.forwardFlips > 0) return { threshold: f.forwardFlips, sets: (data.perfect ? s.perfectFlipFCompliments : s.flipFCompliments) || [] };
    if (f.TotalFlips === 0) return { threshold: data.airtime, sets: (data.perfect ? s.perfectAirTimeCompliments : s.airTimeCompliments) || [] };
    return null;
  }
}

/** ComplimentSet.GetRandomComplimentFromSet: a localized compliment different from the previous one */
function getRandomComplimentFromSet(set, prev) {
  const list = set.localizedCompliments || [];
  if (!list.length) return null;
  let pool = list.filter((x) => x.mTerm !== prev?.mTerm);
  if (!pool.length) pool = [prev];
  return pool[Math.floor(Math.random() * pool.length)];
}

export class TextFloaterSpawner extends MonoBehaviour {
  static typeName = 'TextFloaterSpawner';

  get SpawnOffset() {
    return v3(this.spawnOffset);
  }

  SpawnTextFloater(floater, worldPos, scale, text) {
    if (!floater) return null;
    floater.gameObject.SetActive(true);
    const rt = floater.transform;
    if (this.fixedSpawnPoint) {
      rt.SetParent(this.spawnPoint, true);
      rt.localPosition = new THREE.Vector3();
      const sd = rt.sizeDelta;
      rt.sizeDelta = new THREE.Vector2(sd.x * scale, sd.y * scale);
      rt.localScale = new THREE.Vector3(1, 1, 1);
    } else {
      rt.SetParent(this.canvas.transform, true);
      const ro = this.randomOffset || { min: 0, max: 0 };
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * (ro.min + Math.random() * (ro.max - ro.min));
      const wp = worldPos.clone().add(v3(this.spawnOffset)).add(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0));
      const sp = worldToScreenPoint(wp);
      const l = this.transform.InverseTransformPoint(new THREE.Vector3(sp.x, sp.y, 0));
      rt.anchoredPosition = new THREE.Vector2(l.x, l.y);
      rt.localScale = new THREE.Vector3(scale, scale, scale);
    }
    const ad = this.randomAngleDegrees || { min: 0, max: 0 };
    const ang = ad.min + Math.random() * (ad.max - ad.min);
    const flip = Math.random() < (this.chanceToFlipAngle?.chance ?? 0.5);
    rt.localRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ((flip ? -ang : ang) * Math.PI) / 180);
    floater.Initialize(text);
    return floater;
  }
}

export class TextFloater extends MonoBehaviour {
  static typeName = 'TextFloater';

  constructor() {
    super();
    this.lifetime = 2;
    this.panicZeroScaleTime = 0.1;
    this._timePassed = 0;
  }

  get Settings() {
    return Game.manager?.RunState?.Mode?.Settings?.VisualSettings;
  }

  SetPool(pool) {
    this.pool = pool;
  }

  Initialize(text) {
    this.inactiveCallback = null;
    this._timePassed = 0;
    if (text) this.textField?.SetText(text);
    this.SetVisuals(this.Settings);
    this.feedbacks?.Initialization();
    this.feedbacks?.PlayFeedbacks();
  }

  SetVisuals(s) {
    if (!s) return;
    if (this.effect) this.effect.Gradient = s.floaterGradient;
    this.callOutEffect?.SetColor(s.floaterEffectStartColor, s.floaterEffectFlashColor);
  }

  CutShort() {
    if (!this.gameObject.activeSelf) return;
    this.feedbacks?.StopFeedbacks();
    this.transform.DOScale(new THREE.Vector3(), this.panicZeroScaleTime).SetAutoKill(true).OnComplete(() => this.OnDone());
  }

  Update() {
    this._timePassed += Time.deltaTime;
    if (this._timePassed >= this.lifetime) this.OnDone();
  }

  OnDone() {
    if (!this.gameObject.activeSelf) return;
    this.inactiveCallback?.();
    if (this.pool) this.pool.Deactivate(this, true);
  }

  SetInactiveCallback(cb) {
    this.inactiveCallback = cb;
  }
}

export class TextFloaterWorldPos extends TextFloater {
  static typeName = 'TextFloaterWorldPos';

  constructor() {
    super();
    this.stayOnScreen = 1;
    this.startPos = new THREE.Vector3();
  }

  SetStartPos(p) {
    this.startPos = p.clone();
  }

  LateUpdate() {
    this.transform.position = worldToScreenPoint(this.startPos);
    if (this.stayOnScreen) this.KeepOnScreen();
  }

  KeepOnScreen() {
    const rt = this.transform;
    const pr = rt.parentRect;
    if (!pr) return;
    const a = pr.rect;
    const b = rt.rect;
    const lp = rt.localPosition;
    lp.x = Math.min(Math.max(lp.x, a.x - b.x), a.xMax - b.xMax);
    lp.y = Math.min(Math.max(lp.y, a.y - b.y), a.yMax - b.yMax);
    rt.localPosition = lp;
  }
}

export class CallOutEffect extends MonoBehaviour {
  static typeName = 'CallOutEffect';

  SetColor(color, flashColor) {
    if (this.particle && color) this.particle.SetColors?.(color, this.particle.colorOverride);
    if (this.flash && flashColor) this.flash.SetColorOverLifetime?.(flashColor);
  }
}

// ---------------------------------------------------------------- TextMesh Pro effects (Plugins/TextMeshProEffect)

const EffectType = { Waves: 0, Grow: 1, Unfold: 2, UnfoldAndWaves: 3, Sketch: 4, Bounce: 5 };

export class TextMeshProEffect extends MonoBehaviour {
  static typeName = 'TextMeshProEffect';

  constructor() {
    super();
    this.Type = 0;
    this.DurationInSeconds = 0.5;
    this.Amplitude = 1;
    this.CharacterDurationRatio = 0;
    this.CharactersPerDuration = 0;
    this.Mix = 0;
    this.AutoPlay = 1;
    this.Repeat = 0;
    this.ForWords = '';
    this.IsFinished = false;
    this._playing = false;
    this._sketchFrame = 0;
    this._rand = new Float32Array(10);
    this._nextSketch = -1;
  }

  Awake() {
    this.text = this.GetComponent('TMP_Text');
    this._mod = (m, info) => this.Modify(m, info);
  }

  Apply() {
    this.text = this.GetComponent('TMP_Text');
    this.clamped = this.Type === EffectType.Grow || this.Type === EffectType.Unfold || this.Type === EffectType.Bounce;
    this.sketch = this.Type === EffectType.Sketch;
    this._nextSketch = -1;
  }

  OnEnable() {
    if (this.AutoPlay) this.Play();
    this.attach();
  }

  OnDisable() {
    this.detach();
  }

  OnDestroy() {
    this.detach();
  }

  attach() {
    if (!this.text) return;
    const list = (this.text.vertexModifiers ||= []);
    if (!list.includes(this._mod)) list.push(this._mod);
  }

  detach() {
    const list = this.text?.vertexModifiers;
    const i = list ? list.indexOf(this._mod) : -1;
    if (i >= 0) list.splice(i, 1);
  }

  Play() {
    this.Apply();
    this.IsFinished = false;
    this._start = Time.realtimeSinceStartup;
    this._playing = true;
  }

  Finish() {
    this._start = -Infinity;
  }

  get gradient() {
    return this.Gradient instanceof Gradient ? this.Gradient : Gradient.from(this.Gradient);
  }

  Modify(mesh, info) {
    if (!this._playing || this.DurationInSeconds <= 0) return;
    if (this.Repeat && this.IsFinished) this.Play();
    const chars = (info.characterInfo || []).filter(Boolean);
    const count = chars.length;
    if (!count) {
      this.IsFinished = true;
      return;
    }
    let time = Time.realtimeSinceStartup - this._start;
    const text = this.text.text || '';
    const dur = this.CharactersPerDuration >= 1 ? (this.DurationInSeconds * text.length) / this.CharactersPerDuration : this.DurationInSeconds;
    if (this.sketch && time >= this._nextSketch) {
      this._nextSketch = time + dur;
      this._sketchFrame++;
      if (count * 2 > this._rand.length) this._rand = new Float32Array(count * 2);
      for (let i = 0; i < this._rand.length; i++) this._rand[i] = Math.random();
    }
    if (time > dur && this.clamped) {
      time = dur;
      this.IsFinished = true;
    }
    let nt = time / dur;
    if (!this.clamped) nt %= 1;
    const ratio = Math.min(1, Math.max(0, this.CharacterDurationRatio));
    const charDur = 1 / count + (1 - 1 / count) * ratio;
    const grad = this.gradient;
    const c = [0, 0, 0, 0];
    let idx = 0;
    for (const ch of chars) {
      if (!ch.isVisible || ch.vertexIndex === undefined) continue;
      const start = (idx / count) * (1 - ratio);
      const progress = Math.min(1, Math.max(0, (nt - start) / charDur));
      const colorTime = this.sketch ? this._rand[Math.abs((ch.index + this._sketchFrame) % this._rand.length)] : progress;
      grad.Evaluate(colorTime, c);
      const vi = ch.vertexIndex;
      for (let k = 0; k < 4; k++) {
        const o = (vi + k) * 4;
        if (this.Mix === 0) {
          mesh.col[o] *= c[0];
          mesh.col[o + 1] *= c[1];
          mesh.col[o + 2] *= c[2];
          mesh.col[o + 3] *= c[3];
        } else {
          mesh.col[o] = Math.min(1, mesh.col[o] + c[0]);
          mesh.col[o + 1] = Math.min(1, mesh.col[o + 1] + c[1]);
          mesh.col[o + 2] = Math.min(1, mesh.col[o + 2] + c[2]);
          mesh.col[o + 3] = Math.min(1, mesh.col[o + 3] + c[3]);
        }
      }
      this.moveVerts(mesh, ch, vi, nt, progress);
      idx++;
    }
  }

  moveVerts(mesh, ch, vi, nt, p) {
    const P = mesh.pos;
    const get = (k) => [P[(vi + k) * 2], P[(vi + k) * 2 + 1]];
    const set = (k, x, y) => {
      P[(vi + k) * 2] = x;
      P[(vi + k) * 2 + 1] = y;
    };
    const A = this.Amplitude;
    const ps = ch.pointSize || 36;
    const wave = () => {
      for (let k = 0; k < 4; k++) {
        const [x, y] = get(k);
        set(k, x, y - Math.cos(((vi + k) >> 2) * 0.3 - nt * Math.PI * 2) * ps * 0.3 * A);
      }
    };
    const lerpU = (a, b, t) => a + (b - a) * t;
    switch (this.Type) {
      case EffectType.Waves:
        wave();
        break;
      case EffectType.Grow: {
        const v = [0, 1, 2, 3].map(get);
        const n1 = [v[0][0] + (v[1][0] - v[0][0]) * p, v[0][1] + (v[1][1] - v[0][1]) * p];
        const n2 = [v[3][0] + (v[2][0] - v[3][0]) * p, v[3][1] + (v[2][1] - v[3][1]) * p];
        set(1, lerpU(v[1][0], n1[0], A), lerpU(v[1][1], n1[1], A));
        set(2, lerpU(v[2][0], n2[0], A), lerpU(v[2][1], n2[1], A));
        break;
      }
      case EffectType.Unfold:
      case EffectType.UnfoldAndWaves: {
        const v = [0, 1, 2, 3].map(get);
        const top = [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2];
        const bot = [(v[3][0] + v[2][0]) / 2, (v[3][1] + v[2][1]) / 2];
        const n = [
          [top[0] + (v[0][0] - top[0]) * p, top[1] + (v[0][1] - top[1]) * p],
          [top[0] + (v[1][0] - top[0]) * p, top[1] + (v[1][1] - top[1]) * p],
          [bot[0] + (v[2][0] - bot[0]) * p, bot[1] + (v[2][1] - bot[1]) * p],
          [bot[0] + (v[3][0] - bot[0]) * p, bot[1] + (v[3][1] - bot[1]) * p],
        ];
        for (let k = 0; k < 4; k++) set(k, lerpU(v[k][0], n[k][0], A), lerpU(v[k][1], n[k][1], A));
        if (this.Type === EffectType.UnfoldAndWaves) wave();
        break;
      }
      case EffectType.Sketch: {
        for (let k = 0; k < 4; k++) {
          const [x, y] = get(k);
          const size = ps * 0.1 * A;
          const seed = (vi + k) << this._sketchFrame;
          const r = (s) => this._rand[Math.abs(s % this._rand.length)];
          set(k, x - r(seed) * size, y - size * r(seed >> 5));
        }
        break;
      }
      case EffectType.Bounce: {
        const dy = Math.cos(p * -Math.PI * 2) * ps * 0.3 * A;
        for (let k = 0; k < 4; k++) {
          const [x, y] = get(k);
          set(k, x, y - dy);
        }
        break;
      }
      default:
    }
  }
}

export class TextMeshProFlyInEffect extends MonoBehaviour {
  static typeName = 'TextMeshProFlyInEffect';

  constructor() {
    super();
    this.duration = 1;
    this.startCharacterSpacing = 100;
    this.endCharacterSpacing = 0;
  }

  OnEnable() {
    if (this._co) this.StopCoroutine(this._co);
    this._co = this.StartCoroutine(this.EffectRoutine());
  }

  OnDisable() {
    if (this._co) this.StopCoroutine(this._co);
  }

  *EffectRoutine() {
    const t = this.textMeshPro;
    if (!t) return;
    const curve = AnimationCurve.from(this.animationCurve);
    t.characterSpacing = this.startCharacterSpacing;
    let passed = 0;
    while (passed < this.duration) {
      passed += Time.deltaTime;
      t.characterSpacing = this.startCharacterSpacing + (this.endCharacterSpacing - this.startCharacterSpacing) * Math.min(1, Math.max(0, curve.Evaluate(passed / this.duration)));
      yield null;
    }
    t.characterSpacing = this.endCharacterSpacing;
  }
}

// ---------------------------------------------------------------- currency particles

/** ParticleEffectStarter<SingleShotData>: queued bursts at a position (ParticleBrain.SetupForBursting) */
export class SingleShotEffect extends MonoBehaviour {
  static typeName = 'SingleShotEffect';

  constructor() {
    super();
    this.bursts = [];
  }

  Awake() {
    const ps = this.control;
    if (ps) {
      ps.worldSpace = true;
      ps.playOnAwake = false;
      if (!this.effectTransform) this.effectTransform = ps.transform;
    }
  }

  Queue(info) {
    this.bursts.push(info);
  }

  Update() {
    const ps = this.control;
    if (!ps) return;
    while (this.bursts.length) {
      const info = this.bursts.shift();
      ps.transform.position = info.position;
      // main.startSizeMultiplier = scale
      const im = ps.main;
      if (im?.startSize) im.startSize = { ...im.startSize, scalar: info.scale };
      ps.Emit(1);
    }
  }
}

export class ParticleSeekLinear extends MonoBehaviour {
  static typeName = 'ParticleSeekLinear';

  constructor() {
    super();
    this.force = 10;
    this.dieDistance = 1;
  }

  LateUpdate() {
    const sys = this.system;
    if (!sys || !this.target || !sys.particles?.length) return;
    const tp = this.target.position;
    const target = sys.worldSpace ? tp : this.transform.InverseTransformPoint(tp);
    const step = this.force * Time.deltaTime;
    for (const q of sys.particles) {
      if (this.dieDistance > 0 && q.p.distanceTo(target) <= this.dieDistance) q.age = q.life + 1;
      const d = target.clone().sub(q.p);
      const len = d.length();
      if (len <= step || len === 0) q.p.copy(target);
      else q.p.addScaledVector(d, step / len);
    }
  }
}

export class UISoftCurrencyParticle extends MonoBehaviour {
  static typeName = 'UISoftCurrencyParticle';

  get ParticleSystem() {
    return this.singleShot?.control;
  }

  Queue(data) {
    const m = this.runState?.Mode?.RunMode;
    if (m === RunMode.Bonus) this.seeker.target = this.targetBonusRide;
    else if (m) this.seeker.target = this.targetNormal;
    this.singleShot.Queue(data);
  }
}

/** MonoBehaviour/GameFeatureSettings.asset (enableCurrencyParticles: 0) */
const GameFeatureSettings = { EnableCurrencyParticles: false };

export class UI_CurrencyParticles extends MonoBehaviour {
  static typeName = 'UI_CurrencyParticles';

  static Instance = null;

  get HasBonusCurrencyParticles() {
    return (this.bonusCurrencyHandler?.bonusCurrencyParticle?.control?.particles?.length || 0) > 0;
  }

  Awake() {
    UI_CurrencyParticles.Instance = this;
    const rs = this.runState;
    const soft = this.softCurrencyHandler || {};
    const bonus = this.bonusCurrencyHandler || {};
    const spawnAt = (fx, scale, extra) => {
      const sp = worldToScreenPoint(rs.PlayerState.Position);
      extra?.();
      fx?.Queue({ position: new THREE.Vector3(sp.x, sp.y, 0), scale });
    };
    this._soft = (gained) => {
      const t = String(rs.StatTracker.SoftCurrency);
      soft.currencyBarText?.SetText(t);
      soft.currencyBarBonusText?.SetText(t);
      if (gained && GameFeatureSettings.EnableCurrencyParticles) spawnAt(soft.softCurrencyParticle, soft.softCurrencyParticleScale ?? 60);
    };
    this._bonus = () => {
      const total = rs.StatTracker.BonusLetterCurrencyTotal;
      if (total > this.currentBonusLetterAmount) {
        spawnAt(bonus.bonusCurrencyParticle, bonus.bonusParticleScale ?? 200, () => {
          // textureSheetAnimation.startFrame = letter index / tile count
          const ps = bonus.bonusCurrencyParticleSystem;
          const uvm = ps?.d?.UVModule;
          if (ps) ps.startFrameOverride = (total - 1) / ((uvm?.tilesX || 1) * (uvm?.tilesY || 1));
        });
      }
      this.currentBonusLetterAmount = total;
    };
    this._start = () => {
      this._tracker?.OnSoftCurrencyChanged.RemoveListener(this._soft);
      this._tracker?.OnBonusCurrencyChanged.RemoveListener(this._bonus);
      this._tracker = rs.StatTracker;
      this._tracker.OnSoftCurrencyChanged.AddListener(this._soft);
      this._soft(0);
      this._tracker.OnBonusCurrencyChanged.AddListener(this._bonus);
      this.currentBonusLetterAmount = this._tracker.BonusLetterCurrencyTotal;
    };
    this._end = () => {
      this._tracker?.OnSoftCurrencyChanged.RemoveListener(this._soft);
      this._tracker?.OnBonusCurrencyChanged.RemoveListener(this._bonus);
    };
    rs.runStarted.AddListener(this._start);
    rs.runFinished.AddListener(this._end);
  }

  OnDestroy() {
    this._end?.();
    this.runState.runStarted.RemoveListener(this._start);
    this.runState.runFinished.RemoveListener(this._end);
    if (UI_CurrencyParticles.Instance === this) UI_CurrencyParticles.Instance = null;
  }
}

// ---------------------------------------------------------------- MMFlash

export class MMFlash extends MonoBehaviour {
  static typeName = 'MMFlash';

  constructor() {
    super();
    this.Channel = 0;
    this.FlashID = 0;
    this.Interruptable = 0;
    this._flashing = false;
    this._direction = 1;
    this._delta = 0;
  }

  GetTime() {
    return this._timescale === 0 ? Time.time : Time.unscaledTime;
  }

  GetDeltaTime() {
    return this._timescale === 0 ? Time.deltaTime : Time.unscaledDeltaTime;
  }

  Start() {
    this._image = this.GetComponent('Image');
    this._group = this.GetComponent('CanvasGroup');
  }

  OnEnable() {
    this._ev = (color, duration, alpha, flashID = 0, channel = 0, timescale = 1, stop = false) => this.OnMMFlashEvent(color, duration, alpha, flashID, channel, timescale, stop);
    FeedbackEvents.flash.AddListener(this._ev);
  }

  OnDisable() {
    FeedbackEvents.flash.RemoveListener(this._ev);
  }

  Update() {
    if (!this._image) return;
    if (this._flashing) {
      this._image.enabled = true;
      const d2 = this._duration / 2;
      if (this.GetTime() - this._start > d2) this._direction = -1;
      this._delta += (this._direction === 1 ? 1 : -1) * (this.GetDeltaTime() / d2);
      if (this.GetTime() - this._start > this._duration) this._flashing = false;
      this._group.alpha = this._targetAlpha * Math.min(1, Math.max(0, this._delta));
    } else this._image.enabled = false;
  }

  OnMMFlashEvent(color, duration, alpha, flashID, channel, timescale, stop) {
    if ((flashID ?? 0) !== this.FlashID) return;
    if (stop) {
      this._flashing = false;
      return;
    }
    if (channel !== this.Channel && channel !== -1 && this.Channel !== -1) return;
    if (this._flashing) {
      if (!this.Interruptable) return;
      this._flashing = false;
    }
    this._flashing = true;
    this._direction = 1;
    if (this._group) this._group.alpha = 0;
    this._targetAlpha = alpha;
    this._delta = 0;
    if (this._image) this._image.color = Color.from(color);
    this._duration = duration;
    this._timescale = timescale ?? 1;
    this._start = this.GetTime();
  }
}

// ---------------------------------------------------------------- challenge popups during the run

export const ChallengeRunPopUpType = { Progress: 0, Failure: 1, Success: 2 };

/** UI_ChallengePopupHandler<TPopup>: spawned popups are shown one after another */
export class ChallengePopupHandlerBase extends MonoBehaviour {
  constructor() {
    super();
    this.spawnDelay = 0.5;
    this.currentSpawnDelay = 0;
    this.popupsToSpawn = [];
  }

  Start() {
    this.Hook();
  }

  OnDestroy() {
    this.Unhook();
    this.Clear();
  }

  Hook() {}

  Unhook() {}

  Update() {
    if (this.currentSpawnDelay > 0) this.currentSpawnDelay -= Time.deltaTime;
    if (this.currentSpawnDelay <= 0 && this.popupsToSpawn.length) {
      const p = this.popupsToSpawn.shift();
      this.currentSpawnDelay = this.spawnDelay;
      p.gameObject.SetActive(true);
    }
  }

  Clear() {
    this.container?.transform.DestroyChildren();
    for (const p of this.popupsToSpawn) Destroy(p.gameObject);
    this.popupsToSpawn.length = 0;
  }

  SpawnPopup() {
    const p = Instantiate(this.popupPrefab, this.container.transform);
    p.gameObject.SetActive(false);
    this.popupsToSpawn.push(p);
    return p;
  }
}

const challengeSetup = (c) => c.Setup ?? c.def?.setup;

export class UI_ChallengeRunPopupHandler extends ChallengePopupHandlerBase {
  static typeName = 'UI_ChallengeRunPopupHandler';

  Hook() {
    this._changed = (c) => this.OnChallengeRunChanged(c);
    ChallengeManager.Instance.OnActiveChallengeChanged.AddListener(this._changed);
  }

  Unhook() {
    ChallengeManager.Instance.OnActiveChallengeChanged.RemoveListener(this._changed);
  }

  SpawnRunPopup(challenge, type) {
    this.SpawnPopup().UpdateUI(challenge, type);
  }

  OnChallengeRunChanged(c) {
    if (!Game.manager?.RunState?.IsRunning) return;
    if (c.UseSteps) this.HandleStepped(c);
    else this.HandleProgress(c);
  }

  HandleStepped(c) {
    const sp = c.StepProgress;
    const pp = c.PreviousStepProgress;
    if (c.CurrentValue === c.GoalValue - 1) {
      if (sp !== pp && sp >= 1 && pp < 1) this.SpawnRunPopup(c, ChallengeRunPopUpType.Success);
    } else if (sp !== pp) {
      if (challengeSetup(c) === 2 && sp >= 1 && pp < 1) this.SpawnRunPopup(c, ChallengeRunPopUpType.Progress);
      else if (pp >= 1 && sp < 1) this.SpawnRunPopup(c, ChallengeRunPopUpType.Failure);
    }
  }

  HandleProgress(c) {
    if (c.IsCompleted || c.StepProgress === c.PreviousStepProgress) return;
    if (c.StepProgress >= 1 && c.PreviousStepProgress < 1) this.SpawnRunPopup(c, ChallengeRunPopUpType.Success);
    else if (c.PreviousStepProgress >= 1 && c.StepProgress < 1) this.SpawnRunPopup(c, ChallengeRunPopUpType.Failure);
  }
}

export class UI_ChallengeRunPopup extends MonoBehaviour {
  static typeName = 'UI_ChallengeRunPopup';

  constructor() {
    super();
    this.worldText = 'World Challenge {0}';
    this.timedText = 'Timed Challenge {0}';
  }

  Start() {
    this.spawnFeedacks?.Initialization(this.gameObject);
    this.spawnFeedacks?.PlayFeedbacks();
    if (this.isProgress) this.StartCoroutine(this.UpdateProgressFillbar(this.challenge));
  }

  UpdateUI(c, type) {
    this.challenge = c;
    this.isProgress = type === ChallengeRunPopUpType.Progress;
    this.statusView?.gameObject.SetActive(!this.isProgress);
    this.progressView?.gameObject.SetActive(this.isProgress);
    const timed = !!c.IsTimedChallenge;
    const world = timed ? c.WorldIndex : WorldManager.Instance.CurrentWorldIndex;
    this.SetText(c, world, type);
    this.UpdateWorldVisuals(world, !timed);
    if (!this.isProgress) {
      const ok = type === ChallengeRunPopUpType.Success;
      this.successIcon?.gameObject.SetActive(ok);
      this.failureIcon?.gameObject.SetActive(!ok);
      (ok ? AudioSampleID.UI_ChallengePopupComplete : AudioSampleID.UI_ChallengePopupFailed).Play();
    }
  }

  SetText(c, world, type) {
    const status = type === ChallengeRunPopUpType.Success ? this.completedState : this.failedState;
    this.statusDescription?.SetColor(Color.from(status?.uiColor));
    const text = this.showFullDescription ? (c.GetUiText ? c.GetUiText(world) : c.Text) : csFormat(c.IsTimedChallenge ? this.timedText : this.worldText, status?.text ?? '');
    this.statusDescription?.SetText(text);
    this.progressDescription?.SetText(text);
  }

  UpdateWorldVisuals(world, setBackground) {
    if (world === -1) {
      if (this.worldIcon) this.worldIcon.sprite = this.worldAnyIconAsset;
      return;
    }
    const vs = SettingsContainer.Instance.WorldSettings[world].visualSettings;
    if (this.worldIcon) this.worldIcon.sprite = vs.worldSelectIcon;
    if (setBackground && this.backgroundImage) this.backgroundImage.color = Color.from(vs.uiHighlightColor);
  }

  *UpdateProgressFillbar(c) {
    yield null;
    this.progressBar?.SetFill(c.CurrentValue + 1, c.GoalValue, false);
  }
}

// ---------------------------------------------------------------- world-space helpers

export class TutorialTarget extends MonoBehaviour {
  static typeName = 'TutorialTarget';

  FollowTarget(target) {
    this.gameObject.SetActive(true);
    this.followTarget = target;
  }

  StopFollowing() {
    this.followTarget = null;
    this.gameObject.SetActive(false);
  }

  LateUpdate() {
    if (!this.followTarget || this.followTarget.gameObject?._destroyed) return;
    this.transform.position = worldToScreenPoint(this.followTarget.position);
  }
}

/** GameManager.SetDistanceMarkers markers (PositionalMarkerBase prefab) */
export class PositionalMarker extends MonoBehaviour {
  static typeName = 'PositionalMarker';

  constructor() {
    super();
    this.activeDistanceFromPlayer = 20;
    this.minimalXPositionToShow = 10;
    this.raycastDistanceUpward = 50;
    this.raycastRelativeHeight = -15;
    this.ySpacing = 1;
    this.didPosition = false;
    this.didRaycast = false;
  }

  get ChunkManager() {
    return Game.manager?.RoadChunkManager;
  }

  SetPositionalMarker(player, positionX, stepY, text) {
    this.player = player;
    this.trans = this.transform;
    if (this.minimalXPositionToShow < positionX) {
      const p = this.transform.position;
      p.x = positionX;
      this.trans.position = p;
      if (this.txt) this.txt.text = text;
      const lp = this.container.localPosition;
      lp.y = this.ySpacing * stepY;
      this.container.localPosition = lp;
    } else this.gameObject.SetActive(false);
  }

  Update() {
    const pl = this.player;
    if (!pl || !pl.HasPlayer?.()) return;
    const pos = pl.Position;
    const x = this.trans.position.x;
    if (pos.x < x - this.activeDistanceFromPlayer) return;
    if ((this.ChunkManager?.currentSpawnPos?.x ?? Infinity) < x) return;
    if (this.didPosition) {
      if (pos.x > x + this.activeDistanceFromPlayer) Destroy(this.gameObject);
    } else this.TryPosition(pos);
  }

  TryPosition(pos) {
    if (!this.didRaycast) {
      const o = this.trans.position;
      const hit = Physics2D.RaycastNoTriggers(new THREE.Vector2(o.x, o.y + this.raycastRelativeHeight), new THREE.Vector2(0, 1), this.raycastDistanceUpward, this.roadLayers ?? 576);
      if (hit) {
        const p = this.trans.position;
        p.y = hit.point.y;
        this.trans.position = p;
        this.didPosition = true;
        return;
      }
      this.didRaycast = true;
    }
    if (pos.x > this.trans.position.x) {
      this.didPosition = true;
      return;
    }
    const p = this.trans.position;
    p.y = pos.y;
    this.trans.position = p;
  }
}

/** spawned by GameManager.IntializeRun for endless runs */
export function setDistanceMarkers(gm) {
  const rs = gm.RunState;
  const mode = rs.Mode;
  if (!mode || mode.RunMode !== RunMode.Endless) return;
  const id = Assets.manifest.positionalMarker || 'GameObject/PositionalMarkerBase';
  const hs = Save.endless(mode.world);
  const today = new Date().toDateString();
  // EndlessSaveDataHandler.ValidateDailyScores
  if (!hs.daily || hs.daily.date !== today) hs.daily = { date: today, runs: 0, totalScore: 0, totalDistance: 0 };
  const high = hs.distanceTraveled || 0;
  const runs = hs.daily.runs || 0;
  const avg = runs ? hs.daily.totalDistance / runs : 0;
  let prev = 0;
  const pm = rs.PrevMode;
  if (pm && rs.PreviousStatTracker && (pm.RunMode === RunMode.Endless || pm.RunMode === RunMode.SeededEndless)) prev = rs.PreviousStatTracker.Distance;
  let count = 0;
  const spawn = (x, term) => {
    try {
      const m = Instantiate(new PrefabRef(id), new THREE.Vector3(), new THREE.Quaternion());
      const comp = m.GetComponent('PositionalMarker');
      comp?.SetPositionalMarker(rs.PlayerState, x, count, localize(term));
      count++;
    } catch (e) {
      console.warn('positional marker', e);
    }
  };
  if (high > 0) spawn(high, 'Markers/Highscore');
  if (avg > 0 && runs >= 4) spawn(avg, 'Markers/DailyAverage');
  if (prev > 0 && Math.abs(high - prev) > 1e-6) spawn(prev, 'Markers/Previous');
}

// ---------------------------------------------------------------- gameplay -> HUD hooks

Game.setDistanceMarkers = setDistanceMarkers;

UIHooks.fadeToBlack = function* () {
  const ts = TransitionScreen.Instance;
  if (!ts) return;
  let blocked = true;
  ts.FadeToBlack(() => (blocked = false));
  while (blocked) yield null;
};
UIHooks.fadeFromBlack = function* () {
  TransitionScreen.Instance?.FadeToScene(null);
  yield null;
};

for (const cls of [
  HUD,
  GameplayScoreDisplay,
  UILevelTimer,
  TimedLevelNameDisplay,
  UI_BonusLetterCurrency,
  UIBonusModeTimer,
  JumpBonusManager,
  JumpScoreText,
  ComplimentSpawner,
  TextFloaterSpawner,
  TextFloater,
  TextFloaterWorldPos,
  CallOutEffect,
  TextMeshProEffect,
  TextMeshProFlyInEffect,
  SingleShotEffect,
  ParticleSeekLinear,
  UISoftCurrencyParticle,
  UI_CurrencyParticles,
  MMFlash,
  UI_ChallengeRunPopupHandler,
  UI_ChallengeRunPopup,
  TutorialTarget,
  PositionalMarker,
])
  registerComponent(cls);

void World;
void ev;
