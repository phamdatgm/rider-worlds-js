// Timed levels overlay: ScrollSnapRect difficulty pages, level buttons (+ result animations after a run).
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { EventAction, WaitForSeconds, WaitWhile, Time } from '../engine/core.js';
import { registerComponent, getRuntimeSO, Instantiate } from '../engine/instantiate.js';
import { Assets } from '../engine/assets.js';
import { Render } from '../engine/render.js';
import { Save } from '../meta/save.js';
import { LevelUnlocks } from '../meta/worlds.js';
import { RunState, DeathReason } from '../game/state.js';
import { TimedLevelMode as GameTimedLevelMode } from '../game/game.js';
import { Color } from '../ugui/graphic.js';
import { DOTween } from '../ugui/tween.js';
import { ev, playFeedbacksAtOnce } from './common.js';
import { AudioSampleID, WorldManager, SettingsContainer, TimedLevelModeController, RankTrack, UnlockTypeEnum, UnlockRewardAsset } from './services.js';
import { TimedLevelModeID, getSceneSwitcher, getMenuState } from './scenes.js';
import { MainMenuManager } from './home.js';
import { UIStatics } from './statics.js';

// ---------------------------------------------------------------- run results bookkeeping

/** TimedLevelMode.LastTimeInMilliseconds (runtime only, like the C# property on the SO) */
const lastTimes = new Map();
const baseFinished = GameTimedLevelMode.prototype.Finished;
GameTimedLevelMode.prototype.Finished = function (rs) {
  const r = baseFinished.call(this, rs);
  if (rs.RunEndState.IsVictorious && this.lastTime !== undefined) lastTimes.set(this.level.id, Math.round(this.lastTime * 1000));
  return r;
};

// the run end reason survives RunResetStats (the next scene's SetNewMode) for the level menu
const baseFinish = RunState.prototype.Finish;
RunState.prototype.Finish = function (reason, state) {
  if (this.IsRunning) this.lastDeathReason = reason;
  return baseFinish.call(this, reason, state);
};
// GameManager.OnGameOver and leaving the scene both clean up: keep the finished mode as PrevMode
const baseCleanUp = RunState.prototype.CleanUpPreviousRun;
RunState.prototype.CleanUpPreviousRun = function () {
  const prev = this.PrevMode;
  baseCleanUp.call(this);
  if (!this.PrevMode && prev) this.PrevMode = prev;
};

// ---------------------------------------------------------------- C# TimedLevelMode view of a manifest level

function msToUI(ms) {
  if (!(ms > 0)) return '-:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
}

const levelViews = new Map();

class LevelView {
  constructor(level) {
    this.level = level;
  }

  get UniqueName() {
    return this.level.name;
  }

  get ShortName() {
    return this.level.name;
  }

  get WorldID() {
    return this.level.world;
  }

  get Difficulty() {
    return this.level.difficulty;
  }

  get Number() {
    return this.level.number;
  }

  get Stars() {
    return Save.level(this.level.id).stars || 0;
  }

  get BestTimeInMilliseconds() {
    const b = Save.level(this.level.id).best;
    return b >= 0 ? Math.round(b * 1000) : -1;
  }

  get LastTimeInMilliseconds() {
    return lastTimes.get(this.level.id) || 0;
  }

  get IsUnlocked() {
    return TimedLevelModeController.Instance.IsUnlocked(this.level.difficulty);
  }

  get ModeID() {
    return new TimedLevelModeID(this.level);
  }

  GetBestTimeUIString() {
    return msToUI(this.BestTimeInMilliseconds);
  }
}

export function levelView(level) {
  if (!level) return null;
  let v = levelViews.get(level.id);
  if (!v) levelViews.set(level.id, (v = new LevelView(level)));
  return v;
}

const allLevels = () => Assets.manifest.levels;

Object.assign(TimedLevelModeController.Instance, {
  GetAllTimedLevels: (world) => allLevels().filter((l) => l.world === world).map(levelView),
  GetTimedLevels: (world, d) =>
    allLevels()
      .filter((l) => l.world === world && l.difficulty === d)
      .sort((a, b) => a.number - b.number)
      .map(levelView),
  GetUnlockLevel: (world, d) => RankTrack.Instance.GetRankForLevelDifficultyUnlock(world, d),
  GetCurrentTotalStarsGained() {
    return this.GetWorldTotalStarsGained(WorldManager.Instance.CurrentWorldIndex);
  },
  SetDifficultySeenCurrentWorld: (d) => LevelUnlocks.SetSeen(WorldManager.Instance.CurrentWorldIndex, d),
  GetWorldDifficulty3StarsGained: (world, d) => allLevels().filter((l) => l.world === world && l.difficulty === d && (Save.level(l.id).stars || 0) >= 3).length,
  GetDifficultyGroupCount: (world, d) => allLevels().filter((l) => l.world === world && l.difficulty === d).length,
});

const runState = () => getRuntimeSO('MonoBehaviour/Run State');

/** IInputBlocker -> nothing blocks */
const noBlocker = { IsBlocking: false };

// ---------------------------------------------------------------- ScrollSnapRect

export class ScrollSnapRect extends MonoBehaviour {
  static typeName = 'ScrollSnapRect';

  constructor() {
    super();
    this.autoOpen = 1;
    this.startingPage = 0;
    this.fastSwipeMaxTime = 0.3;
    this.fastSwipeFraction = 0.2;
    this.smoothMovePrecision = 0.25;
    this.decelerationRate = 10;
    this.pageCount = 0;
    this.targetPage = 0;
    this.currentPage = 0;
    this.pagePositions = [];
    this.timeStamp = 0;
    this.startPosition = new THREE.Vector2();
    this.IsDragging = false;
    this._move = null;
    this.blocker = null;
    this.newPageSelected = new EventAction();
    this.arrivedAtPage = new EventAction();
  }

  OnDeserialize() {
    this.newPageSelected = ev(this.newPageSelected);
    this.arrivedAtPage = ev(this.arrivedAtPage);
  }

  get ScrollRect() {
    return this.scrollRect;
  }

  get content() {
    return this.scrollRect.content;
  }

  get viewPort() {
    return this.scrollRect.viewport || this.scrollRect.transform;
  }

  get IsFastSwipe() {
    return Time.unscaledTime - this.timeStamp < this.fastSwipeMaxTime;
  }

  get blocking() {
    return !!this.blocker?.IsBlocking;
  }

  AddInputBlocker(b) {
    this.blocker = b;
  }

  Start() {
    this.nextButton?.onClick.AddListener(() => this.NextScreen());
    this.prevButton?.onClick.AddListener(() => this.PreviousScreen());
  }

  Update() {
    const b = this.blocking;
    if (b === this.scrollRect.enabled) this.scrollRect.enabled = !b;
    // OnRectTransformDimensionsChange
    const w = this.viewPort.rect.width;
    const h = this.viewPort.rect.height;
    if (this._dim && (this._dim[0] !== w || this._dim[1] !== h)) this.OpenPage(this.targetPage);
    this._dim = [w, h];
  }

  OnEnable() {
    if (this.autoOpen) this.OpenPage(this.startingPage);
  }

  OnDisable() {
    this._move = null;
    this.currentPage = -1;
  }

  *activeChildren() {
    for (const t of this.content.children) if (t.isRectTransform && t.gameObject.activeSelf) yield t;
  }

  OpenPage(page = -1, pages = -1) {
    if (page < 0) page = this.startingPage;
    this._move = null;
    if (pages < 0) this.pageCount = [...this.activeChildren()].length;
    this.isHorizontal = this.scrollRect.horizontal;
    this.SetPagePositions();
    this.currentPage = -1;
    this.SnapToPage(page);
  }

  OnBeginDrag() {
    if (this.blocking) return;
    this.currentPage = this.targetPage = this.GetNearestPage();
    this.StopMoving();
    this.IsDragging = false;
  }

  OnEndDrag() {
    if (this.blocking) return;
    const ap = this.content.anchoredPosition;
    let d;
    let size;
    if (this.isHorizontal) {
      d = this.startPosition.x - ap.x;
      size = Render.renderer ? Render.renderer.domElement.width : 1;
    } else {
      d = ap.y - this.startPosition.y;
      size = Render.renderer ? Render.renderer.domElement.height : 1;
    }
    if (this.IsFastSwipe && Math.abs(d / size) > this.fastSwipeFraction && Math.abs(d) < this.fastSwipeThresholdLimit) {
      if (d > 0) this.NextScreen();
      else this.PreviousScreen();
    } else this.MoveToPage(this.GetNearestPage());
    this.IsDragging = false;
  }

  OnDrag() {
    if (this.blocking || this.IsDragging) return;
    this.IsDragging = true;
    this.timeStamp = Time.unscaledTime;
    this.startPosition = this.content.anchoredPosition;
    this.UpdateTargetPage(this.GetNearestPage());
  }

  MoveToPage(i) {
    this.StopMoving();
    i = this.UpdateTargetPage(i);
    this._move = this.StartCoroutine(this.SmoothMoveToPage(i));
  }

  UpdateButtonVisibility(page) {
    this.prevButton?.gameObject.SetActive(page !== 0);
    this.nextButton?.gameObject.SetActive(page !== this.pageCount - 1);
  }

  SetPagePositions() {
    if (!this.pageCount) return;
    this.pagePositions = [];
    const content = this.content;
    if (this.isHorizontal) {
      const w = this.viewPort.rect.width;
      content.pivot = new THREE.Vector2(0, content.pivot.y);
      for (const it of this.activeChildren()) {
        it.sizeDelta = new THREE.Vector2(w, it.sizeDelta.y);
        it.pivot = new THREE.Vector2(0, it.pivot.y);
      }
      this.fastSwipeThresholdLimit = w;
      let n = 0;
      for (const _ of this.activeChildren()) this.pagePositions[n] = new THREE.Vector2(-w * n++, 0);
      return;
    }
    const h = this.viewPort.rect.height;
    content.pivot = new THREE.Vector2(content.pivot.x, 0);
    for (const it of this.activeChildren()) {
      it.sizeDelta = new THREE.Vector2(it.sizeDelta.x, h);
      it.pivot = new THREE.Vector2(it.pivot.x, 0);
    }
    this.fastSwipeThresholdLimit = h;
    let n = 0;
    for (const _ of this.activeChildren()) this.pagePositions[n] = new THREE.Vector2(0, -h * n++);
  }

  SnapToPage(i) {
    i = Math.max(0, Math.min(i, this.pageCount - 1));
    if (this.pagePositions[i]) this.content.anchoredPosition = this.pagePositions[i];
    this.scrollRect.velocity?.set(0, 0);
    this.StopMoving();
    if (i !== this.targetPage) this.newPageSelected.Invoke(i);
    if (i !== this.currentPage) this.arrivedAtPage.Invoke(i);
    this.targetPage = i;
    this.currentPage = i;
    this.UpdateButtonVisibility(i);
  }

  UpdateTargetPage(i) {
    i = Math.max(0, Math.min(i, this.pageCount - 1));
    if (this.targetPage !== i) {
      this.newPageSelected.Invoke(i);
      this.targetPage = i;
      this.UpdateButtonVisibility(i);
    }
    return i;
  }

  *SmoothMoveToPage(page) {
    this.targetPage = page;
    const target = this.pagePositions[page];
    while (target && this.content.anchoredPosition.distanceToSquared(target) > this.smoothMovePrecision) {
      const t = Math.min(this.decelerationRate * Time.unscaledDeltaTime, 1);
      this.content.anchoredPosition = this.content.anchoredPosition.lerp(target, t);
      yield null;
    }
    this.SnapToPage(page);
  }

  StopMoving() {
    if (this._move) {
      this.StopCoroutine(this._move);
      this._move = null;
    }
  }

  NextScreen() {
    if (this.blocking) return;
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.MoveToPage(this.targetPage + 1);
  }

  PreviousScreen() {
    if (this.blocking) return;
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.MoveToPage(this.targetPage - 1);
  }

  GetNearestPage() {
    const ap = this.content.anchoredPosition;
    let best = Infinity;
    let r = this.currentPage;
    for (let i = 0; i < this.pageCount; i++) {
      const d = ap.distanceToSquared(this.pagePositions[i]);
      if (d < best) {
        best = d;
        r = i;
      }
    }
    return r;
  }
}

export class UI_ScrollPips extends MonoBehaviour {
  static typeName = 'UI_ScrollPips';

  Initialize(n) {
    this.transform.DestroyChildren();
    this.pips = [];
    for (let i = 0; i < n; i++) this.pips.push(Instantiate(this.pipPrefab, this.transform, false));
  }

  SetPipIndex(index) {
    (this.pips || []).forEach((p, i) => (p.color = Color.from(index === i ? this.activeColor : this.inactiveColor)));
  }
}

// ---------------------------------------------------------------- level buttons

/** UI_TimedLevelMode.previousSelectedTimedLevelData (static across menu reloads) */
let previousSelected = null;

export class UI_TimedLevelModeNumber extends MonoBehaviour {
  static typeName = 'UI_TimedLevelModeNumber';

  SetText(term, id) {
    this.setNumber?.SetTerm(term);
    this.setNumber?.SetText(id);
  }
}

export class UI_TimedLevelMode extends MonoBehaviour {
  static typeName = 'UI_TimedLevelMode';

  constructor() {
    super();
    this.changeAnimationDelay = 0.5;
    this.changeAnimationDuration = 1;
    this.starPunchScale = 1;
    this.starParticleDelay = 1;
    this._co = null;
    this._starCo = null;
    this._timeCo = null;
  }

  get TutorialButton() {
    return this.buttonSelect;
  }

  get IsBusy() {
    return !!(this._co || this._starCo || this._timeCo);
  }

  get VisualSettings() {
    return SettingsContainer.Instance.WorldVisualSettings;
  }

  Initialize(id, blocker) {
    this.blocker = blocker || noBlocker;
    this.selected = id;
    this.gameObject.name = id.toString();
    this.Setup();
  }

  SetFormat(format) {
    this.levelName?.SetTerm(format);
  }

  Setup() {
    const lv = levelView(this.selected.level);
    this.timedLevelMode = lv;
    if (!lv) {
      this.gameObject.SetActive(false);
      return;
    }
    this.levelName?.SetText(lv.Number);
    this.buttonSelect?.onClick.AddListener(() => this.OnClick());
    const hl = Color.from(this.VisualSettings.uiHighlightColor);
    for (const f of this.positiveTimeChangeFeedback?.Feedbacks || []) if (f && f.TargetTMPText === this.bestTimeText && 'DestinationColor' in f) f.DestinationColor = hl;
    const rs = runState();
    const reason = rs.lastDeathReason ?? rs.RunEndState.deathReason;
    if (reason !== DeathReason.RunCancel && previousSelected && previousSelected.id === lv.ShortName) {
      this._co = this.StartCoroutine(this.ValueChangeRoutine());
      return;
    }
    this.SetStarCount(lv.Stars);
    this.SetBestTime(lv.GetBestTimeUIString());
    this.SetVisualState(lv.Stars);
  }

  OnClick() {
    if (this.blocker.IsBlocking) return;
    AudioSampleID.UI_ButtonClick_Generic.Play();
    const lv = this.timedLevelMode;
    previousSelected = { id: lv.ShortName, bestTimeInMilliseconds: lv.BestTimeInMilliseconds, stars: lv.Stars };
    (this.sceneSwitcher?.StartMode ? this.sceneSwitcher : getSceneSwitcher()).StartMode(lv.ModeID);
  }

  *ValueChangeRoutine() {
    const prevStars = previousSelected.stars;
    const prevTime = previousSelected.bestTimeInMilliseconds;
    previousSelected = null;
    const ms = this.menuState?.isSceneTransitioning !== undefined ? this.menuState : getMenuState();
    while (ms.isSceneTransitioning || ms.isMultiSceneLoading) yield null;
    MainMenuManager.Instance?.RewardHandler?.OverrideParticleStart(3, this.star2.transform, this.starParticleDelay);
    this.SetBestTime(msToUI(prevTime));
    this.SetStarCount(prevStars);
    yield new WaitForSeconds(this.changeAnimationDelay);
    this.updateHighlightFeedback?.PlayFeedbacks();
    this._starCo = this.StartCoroutine(this.AnimateStarChange(prevStars, this.timedLevelMode.Stars));
    this._timeCo = this.StartCoroutine(this.AnimateTimeChange(prevTime, this.timedLevelMode.LastTimeInMilliseconds));
    while (this.updateHighlightFeedback?.IsPlaying) yield null;
    this._co = null;
  }

  *AnimateTimeChange(prev, cur) {
    this.SetVisualState(this.timedLevelMode.Stars);
    if (prev !== cur) {
      if (prev >= 1 && cur >= prev) {
        this.negativeTimeChangeFeedback?.PlayFeedbacks();
        yield null;
        while (this.negativeTimeChangeFeedback?.IsPlaying) yield null;
      } else {
        this.positiveTimeChangeFeedback?.PlayFeedbacks();
        let time = prev;
        DOTween.ToInt(() => time, (x) => (time = x), cur, this.changeAnimationDuration).OnUpdate(() => this.SetBestTime(msToUI(time)));
        // C# yields the tween itself: the coroutine resumes on the next frame
        yield null;
      }
    }
    this._timeCo = null;
  }

  *AnimateStarChange(prev, cur) {
    if (prev !== cur) {
      let stars = prev;
      let last = prev;
      const anim = DOTween.ToInt(() => stars, (x) => (stars = x), cur, this.changeAnimationDuration).OnUpdate(() => {
        if (stars > last) {
          last = stars;
          const star = this.GetStar(stars);
          if (star) {
            star.Handle(true);
            AudioSampleID.UI_StarAdded.Play();
            star.transform.DOPunchScale(new THREE.Vector3(1, 1, 1).multiplyScalar(this.starPunchScale), this.changeAnimationDuration * 0.333, 0, 1);
          }
        }
      });
      if (cur === 3) {
        while (anim.IsPlaying()) yield null;
        this.fullyCompletedFeedback?.PlayFeedbacks();
        yield null;
        while (this.fullyCompletedFeedback?.IsPlaying) yield null;
      }
      while (anim.active && anim.IsPlaying()) yield null;
      this.SetVisualState(cur);
    }
    this._starCo = null;
  }

  SetStarCount(n) {
    for (let i = 1; i <= 3; i++) this.GetStar(i)?.Handle(i <= n);
  }

  SetBestTime(s) {
    if (this.bestTimeText) this.bestTimeText.text = s;
  }

  SetVisualState(n) {
    const c = n === 3 ? Color.from(this.VisualSettings.uiHighlightColor) : Color.white;
    if (this.backgroundImage) this.backgroundImage.color = c;
    if (this.highlightImage) this.highlightImage.color = c;
    this.completionHighlight?.SetActive(n > 2);
  }

  GetStar(i) {
    return i === 1 ? this.star1 : i === 2 ? this.star2 : i === 3 ? this.star3 : null;
  }
}

// ---------------------------------------------------------------- pages

export class UI_TimedLevelsPage extends MonoBehaviour {
  static typeName = 'UI_TimedLevelsPage';

  constructor() {
    super();
    this.timedLevelUIs = [];
    this.difficulty = 0;
    this.IsInitialized = false;
  }

  get TutorialTimedLevelUIs() {
    return this.timedLevelUIs;
  }

  get IsBusy() {
    return (this.timedLevelUIs || []).some((u) => u && !u.gameObject._destroyed && u.IsBusy);
  }

  get Difficulty() {
    return this.difficulty;
  }

  get CurrentWorld() {
    return WorldManager.Instance.CurrentWorldIndex;
  }

  SetTimedLevelIDs() {
    let idx = 0;
    for (const ui of this.timedLevelUIs || []) {
      if (!ui) continue;
      const lv = this.timedLevels[idx];
      if (lv) {
        ui.gameObject.SetActive(true);
        ui.SetFormat(this.localizedLevelFormat);
        ui.Initialize(new TimedLevelModeID(lv.level), this.blocker);
        idx++;
      } else Destroy(ui.gameObject);
    }
  }

  Initialize(blocker) {
    this.blocker = blocker;
    this.timedLevels = TimedLevelModeController.Instance.GetTimedLevels(this.CurrentWorld, this.difficulty);
    if (this.levelDifficultyBackground) this.levelDifficultyBackground.color = Color.from(SettingsContainer.Instance.WorldVisualSettings.uiHighlightColor);
    this.SetTimedLevelIDs();
    this.UpdateLocks();
    this.IsInitialized = true;
  }

  UpdateState() {
    if (this.IsInitialized) this.UpdateLocks();
  }

  UpdateLocks() {
    const c = TimedLevelModeController.Instance;
    if (c.IsUnlocked(this.difficulty)) {
      this.lockedFade?.gameObject.SetActive(false);
      return;
    }
    this.lockedFade?.gameObject.SetActive(true);
    this.lockedFade?.SetAsLastSibling();
    this.starsRequired?.Initialize(c.GetUnlockLevel(this.CurrentWorld, this.difficulty));
  }
}

// ---------------------------------------------------------------- overlay

let previousTotalStarsGained = -1;

export class UI_TimedLevelMenu extends MonoBehaviour {
  static typeName = 'UI_TimedLevelMenu';

  constructor() {
    super();
    this.OnOpen = new EventAction();
    this.OnClose = new EventAction();
    this.starChangeAnimationDuration = 1;
    this.starChangeAnimationDelay = 0.5;
    this.activePageRemap = new Map();
    this.currentlySelectedPage = 0;
    this._co = null;
  }

  OnDeserialize() {
    this.OnOpen = ev(this.OnOpen);
    this.OnClose = ev(this.OnClose);
  }

  get IsOpen() {
    return this.gameObject.activeSelf;
  }

  get IsBusy() {
    return (this.pages || []).some((p) => p?.IsBusy);
  }

  get IsBlocking() {
    return this.IsBusy || UIStatics.RankUpPopup.IsOpenOrActive || UIStatics.RankUpPopup.WasPopBlocked;
  }

  get TutorialCurrentDifficulty() {
    return this.currentlySelectedPage;
  }

  get CurrentWorld() {
    return WorldManager.Instance.CurrentWorldIndex;
  }

  get VisualSettings() {
    return SettingsContainer.Instance.WorldSettings[this.CurrentWorld].visualSettings;
  }

  TutorialGetLevelTransform(i) {
    return this.pages[this.currentlySelectedPage].TutorialTimedLevelUIs[i].TutorialButton.transform;
  }

  Awake() {
    this.scrollSnapRect?.AddInputBlocker(this);
    this.closeBtn?.onClick.AddListener(() => this.TryClose());
    this._unlock = (d) => this.OnUnlock(d);
    UnlockRewardAsset.UnlockRewardGiven.AddListener(this._unlock);
    this._page = (i) => this.OnPageChanged(i);
    this.scrollSnapRect?.newPageSelected.AddListener(this._page);
    this._scroll = () => this.OnScrolling();
    this.scrollSnapRect?.ScrollRect.onValueChanged.AddListener(this._scroll);
    this._world = () => this.OnWorldChanged();
    WorldManager.Instance.CurrentWorldChanged.AddListener(this._world);
    this._dot = () => this.UpdateNotificationDot();
    TimedLevelModeController.Instance.UnseenStateChanged.AddListener(this._dot);
    this.OnWorldChanged();
    this.pages.forEach((p, i) => {
      if (p.gameObject.activeSelf) this.activePageRemap.set(this.activePageRemap.size, i);
    });
    const available = [...this.activePageRemap.values()].map((i) => this.pages[i].Difficulty);
    const rs = runState();
    const cur = rs.Mode?.level ? rs.Mode : null;
    const prev = rs.PrevMode?.level ? rs.PrevMode : null;
    const mode = cur || prev;
    if (!mode) {
      const lv = TimedLevelModeController.Instance.GetAllTimedLevels(this.CurrentWorld)
        .sort((a, b) => a.Stars - b.Stars || a.Difficulty - b.Difficulty || a.Number - b.Number)
        .find((c) => c.IsUnlocked && available.includes(c.Difficulty));
      this.OpenPage(lv ? lv.Difficulty : 0);
    } else this.OpenPage(mode.level.difficulty);
    const btn = this.pages[0]?.TutorialTimedLevelUIs?.[0]?.TutorialButton;
    this.firstLevelPlayTutorial?.SetLevelButtonReference?.(btn);
    UIStatics.firstLevelPlayButton = btn;
    UIStatics.timedLevelMenu = this;
  }

  OnScrolling() {
    this.scrollSnapRect.ScrollRect.onValueChanged.RemoveListener(this._scroll);
    for (const p of this.pages) if (!p.IsInitialized) p.Initialize(this);
  }

  OnDestroy() {
    UnlockRewardAsset.UnlockRewardGiven.RemoveListener(this._unlock);
    this.scrollSnapRect?.newPageSelected.RemoveListener(this._page);
    WorldManager.Instance.CurrentWorldChanged.RemoveListener(this._world);
    TimedLevelModeController.Instance.UnseenStateChanged.RemoveListener(this._dot);
    if (UIStatics.timedLevelMenu === this) UIStatics.timedLevelMenu = null;
  }

  TryOpen() {
    if (this._co) return false;
    this.gameObject.SetActive(true);
    // opens at once (owner's request): the transition lands on its end state instead of playing over 0.5 s
    if (this.transitionFeedbackIn) {
      this.transitionFeedbackIn.Initialization();
      playFeedbacksAtOnce(this.transitionFeedbackIn);
    }
    getMenuState().isLevelScreenOpen = true;
    this.OnOpen.Invoke();
    return true;
  }

  // closes at once (owner's request) instead of playing transitionFeedbackOut (0.5 s) and the tweens backwards; the
  // feedback still lands on its end state, for what it restores outside the screen
  TryClose() {
    if (this._co || !this.isActiveAndEnabled) return false;
    playFeedbacksAtOnce(this.transitionFeedbackOut);
    Render.hideWorld = false;
    for (const a of this.GetComponentsInChildren('DOTweenAnimation')) a.DORewind();
    getMenuState().isLevelScreenOpen = false;
    this.OnClose.Invoke();
    this.gameObject.SetActive(false);
    return true;
  }

  OpenPage(i) {
    this.scrollSnapRect?.OpenPage(i);
    if (i === -1) return;
    const page = this.pages[i];
    if (page.IsInitialized) page.UpdateState();
    else page.Initialize(this);
  }

  OnEnable() {
    const cur = TimedLevelModeController.Instance.GetCurrentTotalStarsGained();
    if (previousTotalStarsGained === -1) previousTotalStarsGained = cur;
    this.totalStarsTMP?.SetText(cur);
    if (previousTotalStarsGained !== cur) this.StartCoroutine(this.StarsGainedUpdateRoutine(previousTotalStarsGained, cur));
    previousTotalStarsGained = cur;
    if (this.totalStarsTitle) this.totalStarsTitle.color = Color.from(this.VisualSettings.uiHighlightColor);
    Render.hideWorld = true;
    if (this.activePageRemap.size) this.OnPageChanged(this.currentlySelectedPage);
  }

  OnDisable() {
    Render.hideWorld = false;
  }

  *StarsGainedUpdateRoutine(prev, cur) {
    this.totalStarsTMP?.SetText(prev);
    yield new WaitForSeconds(this.starChangeAnimationDelay);
    let stars = prev;
    let last = prev;
    DOTween.ToInt(() => stars, (x) => (stars = x), cur, this.starChangeAnimationDuration).OnUpdate(() => {
      if (stars > last) {
        last = stars;
        this.totalStarsTMP?.SetText(stars);
        previousTotalStarsGained = stars;
        this.starGainedFeedback?.PlayFeedbacks();
      }
    });
  }

  UpdateNotificationDot() {
    const page = this.pages[this.activePageRemap.get(this.currentlySelectedPage)];
    if (!page) return;
    TimedLevelModeController.Instance.SetDifficultySeenCurrentWorld(page.Difficulty);
    if (page.Difficulty === 2) this.notificationDotRight?.UpdatePingObject(false);
    else this.notificationDotRight?.UpdatePingObject(TimedLevelModeController.Instance.GetUnseenDifficultiesCurrentWorld() > 0);
  }

  OnPageChanged(i) {
    const page = this.pages[this.activePageRemap.get(i)];
    if (this.currentlySelectedPage !== i) {
      this.currentlySelectedPage = i;
      if (page && !page.IsInitialized) page.Initialize(this);
    }
    this.UpdateNotificationDot();
  }

  OnWorldChanged() {
    previousTotalStarsGained = -1;
    if (this.worldBackground) this.worldBackground.sprite = this.VisualSettings.worldSelectBackground;
  }

  OnUnlock(d) {
    if (d.unlockType >= UnlockTypeEnum.LevelDifficultyEasy && d.unlockType <= UnlockTypeEnum.LevelDifficultyHard) for (const p of this.pages) p.UpdateState();
  }
}

for (const cls of [ScrollSnapRect, UI_ScrollPips, UI_TimedLevelModeNumber, UI_TimedLevelMode, UI_TimedLevelsPage, UI_TimedLevelMenu]) registerComponent(cls);

void WaitWhile;
