// Main menu shell + home page scripts (MainMenuManager, bottom bar, top container, home screen widgets).
import { RunsTracker } from '../meta/runstracker.js';
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { EventAction, WaitForSeconds, WaitUntil, WaitWhile, Time, Coroutines } from '../engine/core.js';
import { registerComponent, Instantiate, ComponentRegistry } from '../engine/instantiate.js';
import { AnimationCurve, Gradient } from '../engine/math.js';
import { Color } from '../ugui/graphic.js';
import { DOTween } from '../ugui/tween.js';
import { InputUIBlocker } from '../ugui/events.js';
import { Tutorials } from '../meta/tutorials.js';
import { grantReward } from '../meta/rewards.js';
import { Save } from '../meta/save.js';
import { RunMode } from '../game/state.js';
import { ev, localize, managedReference, registerSerializable } from './common.js';
import {
  AudioSampleID,
  PlayerRankManager,
  CurrencyService,
  CurrencyType,
  WorldManager,
  SettingsContainer,
  ChallengeManager,
  TimedLevelModeController,
  TimedLevelModeDifficulty,
  UnlockRewardAsset,
  UnlockTypeEnum,
  CardService,
  CardEvents,
  BonusState,
  GameManager,
  MusicManager,
  toLargeNumberString,
  endlessHighScores,
} from './services.js';
import { SceneSwitcher, TransitionScreen, getMenuState, getSceneSwitcher, EndlessModeID } from './scenes.js';
import { UIStatics } from './statics.js';

// ---------------------------------------------------------------- initializer / pages

export class ScriptInitializerMainMenu extends MonoBehaviour {
  static typeName = 'ScriptInitializerMainMenu';

  Start() {
    for (const s of this.scriptsToInit || []) s?.Initialize?.();
  }
}

export class MainMenuPage extends MonoBehaviour {
  static typeName = 'MainMenuPage';

  get IsBusy() {
    return false;
  }

  Initialize() {}
}

/** [Serializable] MenuSwitcher */
class MenuSwitcher {
  constructor(data) {
    Object.assign(this, data);
    this.needsOnDestroy = false;
    this._onRankUp = () => this.OnRankUp();
  }

  get UnlockRank() {
    return this.unlockRank;
  }

  get CurrentRank() {
    return PlayerRankManager.Instance.CurrentRank;
  }

  Initialize(i) {
    this.menuScreen?.Initialize?.();
    this.index = i;
    this.SetState(false);
    if (!this.IsUnlocked()) {
      this.menuButton.SetLocked(this.unlockRank);
      PlayerRankManager.Instance.RankUp.AddListener(this._onRankUp);
      this.needsOnDestroy = true;
    }
  }

  OnRankUp() {
    if (this.IsUnlocked()) {
      this.menuButton.SetUnlocked();
      PlayerRankManager.Instance.RankUp.RemoveListener(this._onRankUp);
    }
  }

  IsUnlocked() {
    return this.unlockRank >= 0 ? this.unlockRank - 1 <= this.CurrentRank : false;
  }

  SetState(enabled) {
    this.menuButton.SetState(enabled);
    this.menuScreen.gameObject.SetActive(enabled);
  }

  OnDestroy() {
    if (this.needsOnDestroy) PlayerRankManager.Instance.RankUp.RemoveListener(this._onRankUp);
  }
}

export class MainMenuManager extends MonoBehaviour {
  static typeName = 'MainMenuManager';

  static Instance = null;

  constructor() {
    super();
    this.OnMenuPageSwitch = new EventAction();
    this.currentMenu = null;
  }

  get RewardHandler() {
    return this.rewardHandler;
  }

  get HomeScreenManager() {
    return this.homeScreenManager;
  }

  get LootboxOpener() {
    return this.lootboxOpener;
  }

  get IsBusy() {
    return (this.switchers || []).some((s) => s.menuScreen?.IsBusy);
  }

  Initialize() {
    MainMenuManager.Instance = this;
    this.switchers = (this.menuSwitchers || []).map((d) => new MenuSwitcher(d));
    if (!this.switchers.length) return;
    this.switchers.forEach((ms, i) => {
      ms.Initialize(i);
      ms.menuButton.OnClicked.AddListener(() => this.DoMenuSwitch(ms));
    });
    this.LoadMenuPage();
    MusicManager.Instance?.PlayMenuMusic();
    getSceneSwitcher().AdditiveLoadGameScene();
    if (getMenuState().isMultiSceneLoading) this.StartCoroutine(this.WaitForMainGame());
  }

  OnDestroy() {
    InputUIBlocker.EnableInput();
    for (const s of this.switchers || []) s.OnDestroy();
    if (MainMenuManager.Instance === this) MainMenuManager.Instance = null;
  }

  LoadMenuPage() {
    const ms = getMenuState();
    const i = ms.currentMenuPageIndex;
    // the first page always opens: a rank-up popup pending from the menu this one replaces must not leave it empty
    if (i !== -1) {
      ms.currentMenuPageIndex = -1;
      this.DoMenuSwitch(this.switchers[i], true);
    } else this.DoMenuSwitch(this.switchers[0], true);
  }

  *WaitForMainGame() {
    while (!GameManager.Instance) yield null;
    GameManager.Instance.cameraRig?.MainCameraShow?.(this.currentMenu?.usesGameCamera);
  }

  DoMenuSwitch(ms, initial = false) {
    if (!initial && UIStatics.RankUpPopup.IsOpenOrActive) return;
    if (!ms.IsUnlocked()) {
      if (ms.UnlockRank < 0) MainMenuManager.PushTooltip(this.comingSoonText || { mTerm: 'UI/Unlock/ComingSoon' });
      else MainMenuManager.PushTooltip(this.localizedUnlockText, String(ms.UnlockRank));
      return;
    }
    if (ms === this.currentMenu) return;
    if (this.currentMenu) {
      if (this.currentMenu.menuScreen.IsBusy) return;
      this.currentMenu.SetState(false);
      GameManager.Instance?.cameraRig?.MainCameraShow?.(ms.usesGameCamera);
    }
    ms.SetState(true);
    this.topContainer?.UpdateState(ms.hudState);
    this.topContainer?.SetSettingsButtonState(!!ms.showSettingsButton);
    this.currentMenu = ms;
    getMenuState().currentMenuPageIndex = ms.index;
    this.OnMenuPageSwitch.Invoke(ms.index);
  }

  AnimateFadeOut() {
    InputUIBlocker.DisableInput();
    for (const a of this.GetComponentsInChildren('DOTweenAnimation')) a.DOPlayBackwards();
  }

  ShowPageContainer(show) {
    this.pageContainer?.SetActive(show);
  }

  static PushTooltip(term, message = '') {
    MainMenuManager.Instance?.tooltipHandler?.SpawnTooltip(term, message);
  }

  static ShowNotEnoughCurrencyPopUp(type) {
    const m = MainMenuManager.Instance;
    MainMenuManager.PushTooltip(type === CurrencyType.Soft ? m?.notEnoughSoftCurrencyText || { mTerm: 'UI/Shop/NotEnoughSoftCurrency' } : m?.notEnoughHardCurrencyText || { mTerm: 'UI/Shop/NotEnoughHardCurrency' });
  }

  static ShowComeBackTomorrowPopUp() {
    MainMenuManager.PushTooltip(MainMenuManager.Instance?.comeBackTomorrowString || { mTerm: 'UI/Shop/ComeBackTomorrow' });
  }
}

// ---------------------------------------------------------------- bottom bar buttons

class BaseGameNotificationHandler {
  Initialize(button) {
    this.button = button;
    this._check = () => this.CheckForPings();
    button.onUnlocked.AddListener(this._check);
    this.OnInitialized();
    this.CheckForPings();
  }

  CheckForPings() {
    if (!this.pingObject) return;
    if (this.button.IsLocked) this.pingObject.UpdatePingObject(0);
    else this.pingObject.UpdatePingObject(this.GetPingsCount());
  }

  OnInitialized() {}

  Dispose() {}

  GetPingsCount() {
    return 0;
  }
}

class ShopGameNotificationHandler extends BaseGameNotificationHandler {
  OnInitialized() {
    this._timer = setInterval(this._check, 1000);
    this.dailyDealShopData?.onRefresh?.AddListener(this._check);
    this.hardCurrencyShopGiftSettings?.onGiftReset?.AddListener(this._check);
  }

  Dispose() {
    clearInterval(this._timer);
    this.dailyDealShopData?.onRefresh?.RemoveListener(this._check);
    this.hardCurrencyShopGiftSettings?.onGiftReset?.RemoveListener(this._check);
  }

  GetPingsCount() {
    // UI_ShopPage is looked up by name: shop.js imports this module
    const page = ComponentRegistry.get('UI_ShopPage')?.Instance;
    let n = 0;
    if (page) {
      if (page.lootboxSection.CanGetFreeLootbox()) n++;
      if (page.lootboxSection.CanGetLargeLootbox()) n++;
    }
    // the rubies gift has no section in the web build (BaseShopController.UpdateSections)
    return n + (this.dailyDealShopData?.HasFree?.() ? 1 : 0);
  }
}

class MetaGameNotificationHandler extends BaseGameNotificationHandler {
  OnInitialized() {
    CardService.onCardUnseenStateChanged.AddListener(this._check);
  }

  Dispose() {
    CardService.onCardUnseenStateChanged.RemoveListener(this._check);
  }

  GetPingsCount() {
    return CardService.MetaPings;
  }
}

class EndlessGameNotificationHandler extends BaseGameNotificationHandler {
  OnInitialized() {
    this._world = () => this.CheckForPings();
    WorldManager.Instance.WorldUnlocked.AddListener(this._world);
    CurrencyService.Instance.BonusLetter.OnChangeCallback.AddListener(this._check);
  }

  Dispose() {
    WorldManager.Instance.WorldUnlocked.RemoveListener(this._world);
    CurrencyService.Instance.BonusLetter.OnChangeCallback.RemoveListener(this._check);
  }

  GetPingsCount() {
    return (BonusState.CollectedAllBonusRideLetters ? 1 : 0) + (WorldManager.Instance.HasUnseenWorld ? 1 : 0);
  }
}

registerSerializable(ShopGameNotificationHandler, 'ShopGameNotificationHandler');
registerSerializable(MetaGameNotificationHandler, 'MetaGameNotificationHandler');
registerSerializable(EndlessGameNotificationHandler, 'EndlessGameNotificationHandler');

export class MenuButtonState extends MonoBehaviour {
  static typeName = 'MenuButtonState';

  constructor() {
    super();
    this.OnClicked = new EventAction();
    this.onUnlocked = new EventAction();
    this.unlockSpriteSwapDelay = 0.9;
    this.IsLocked = false;
  }

  get TutorialCenterSocket() {
    // the landscape layout centres the tutorial's focus on the whole tab (src/ui2/home.js)
    const c = this._ui2TutorialCenter;
    return c && c.gameObject.activeInHierarchy ? c : this.activeState.transform;
  }

  get TutorialPressSocket() {
    return this.tutorialSocket;
  }

  Awake() {
    this.OnClicked = ev(this.OnClicked);
    this.onUnlocked = ev(this.onUnlocked);
    this._click = () => this.OnClick();
    this.button.onClick.AddListener(this._click);
    this.handler = managedReference(this, 'notificationHandler');
  }

  Start() {
    this.handler?.Initialize(this);
  }

  OnDestroy() {
    this.button.onClick.RemoveListener(this._click);
    this.handler?.Dispose();
  }

  SetState(enabled) {
    this.button.interactable = !enabled;
    this.image.overrideSprite = enabled ? this.activeButtonSprite : null;
    this.activeState.SetActive(enabled);
    this.inactiveState.SetActive(!enabled);
  }

  SetLocked(rank) {
    this.IsLocked = true;
    this.lockedRank = rank;
    if (rank >= 0) {
      this.starIndicator.Initialize(rank);
      this.starIndicator.gameObject.SetActive(true);
      this.inactiveImage.color = Color.from(this.lockedColor);
    } else this.inactiveImage.overrideSprite = this.lockedIconSprite;
    this.button.image.overrideSprite = this.lockedButtonSprite;
  }

  SetUnlocked() {
    if (!this.IsLocked) return;
    this.IsLocked = false;
    const self = this;
    this.StartCoroutine((function* () {
      yield null;
      self.unlockFeedback?.PlayFeedbacks();
      yield new WaitForSeconds(self.unlockSpriteSwapDelay);
      self.inactiveImage.gameObject.SetActive(true);
      self.button.image.overrideSprite = null;
      self.inactiveImage.overrideSprite = null;
      self.inactiveImage.color = Color.white;
      self.starIndicator.gameObject.SetActive(false);
      self.onUnlocked.Invoke();
    })());
  }

  OnClick() {
    this.OnClicked.Invoke();
    if (this.IsLocked) {
      AudioSampleID.UI_ButtonLocked.Play();
      this.lockedFeedback?.PlayFeedbacks();
      // owner's request: the tab shows a padlock (src/ui2/home.js), so a tap tells the rank it needs
      if (this.lockedRank >= 0) MainMenuManager.PushTooltip({ mTerm: 'UI/Unlock/FeatureUnlock' }, String(this.lockedRank));
    } else AudioSampleID.UI_ButtonClick_Generic.Play();
  }
}

// Button.image (the target graphic as an Image)
import { Button } from '../ugui/selectable.js';

Object.defineProperty(Button.prototype, 'image', {
  get() {
    return this.m_TargetGraphic;
  },
  set(v) {
    this.m_TargetGraphic = v;
  },
});

// ---------------------------------------------------------------- home page

export class HomeScreenManager extends MainMenuPage {
  static typeName = 'HomeScreenManager';

  get ChallengesButton() {
    return this.challengesButton;
  }

  get PlayButton() {
    return this.playButton;
  }

  Start() {
    this.playButton.onClick.AddListener(() => this.OnPlay());
    this._mainMenuManager = this.GetComponentInParent('MainMenuManager');
    const cd = this.challengeDisplay;
    // Opens by itself only with a challenge to claim (its burst, then the rank-up): the early ranks' auto-open showed
    // it on the first returns home with nothing to do (owner's request, 2026-10-30: "confusing").
    if (cd && !cd.IsOpen && ChallengeManager.Instance.GetActiveClaimableChallenges() >= 1) cd.TryOpen?.(true);
  }

  OnStartGameMode(mode) {
    this._mainMenuManager.AnimateFadeOut();
    getSceneSwitcher().StartMode(mode);
    AudioSampleID.UI_ButtonClick_Generic.Play();
  }

  OnPlay() {
    if (!UIStatics.RankUpPopup.WasPopBlocked && !UIStatics.RankUpPopup.IsOpenOrActive) {
      this.challengeDisplay?.TryClose?.();
      this.OnStartGameMode(new EndlessModeID(WorldManager.Instance.CurrentWorldIndex));
    }
  }

  OnEnable() {
    this.challengeDisplay?.ParentMenuOpened?.();
  }
}

export class UI_MainMenuTopContainer extends MonoBehaviour {
  static typeName = 'UI_MainMenuTopContainer';

  UpdateState(state) {
    switch (state) {
      case 0:
        this.SetWorldButtonState(true);
        this.gameObject.SetActive(true);
        break;
      case 2:
        this.SetWorldButtonState(false);
        this.gameObject.SetActive(true);
        break;
      case 1:
        this.gameObject.SetActive(false);
        break;
      default:
    }
  }

  SetWorldButtonState(active) {
    for (const img of this.worldActiveBg || []) if (img) img.enabled = active;
    if (this.worldInactiveBg) this.worldInactiveBg.enabled = !active;
    this.worldStatsButton?.gameObject.SetActive(active);
  }

  SetSettingsButtonState(active) {
    this.settingsObject?.SetActive(active);
  }
}

export class StarRequireIndicator extends MonoBehaviour {
  static typeName = 'StarRequireIndicator';

  Initialize(stars) {
    this.txt?.SetText(stars);
  }
}

export class UI_PlayerRank extends MonoBehaviour {
  static typeName = 'UI_PlayerRank';

  constructor() {
    super();
    this.startDelay = 0.5;
    this.barAnimationTime = 1;
    this.fullBarsToGain = 0;
    this.ParticleInstanceCount = 0;
    this._co = null;
  }

  get IsBusy() {
    return !!this.rankFillBar?.IsAnimating || !!this._co;
  }

  get RankValue() {
    return PlayerRankManager.Instance.CurrentRank + 1;
  }

  get CurrentStars() {
    const m = PlayerRankManager.Instance;
    return m.CurrentStarsRequired - m.CurrentStarsLeft;
  }

  set RankNumber(v) {
    this.rankNumber?.SetText(v);
    this.nextRankNumber?.SetText(v + 1);
  }

  Start() {
    this.RankNumber = this.RankValue;
    this._progress = () => {
      if (this.isActiveAndEnabled) this.StartAnimation(true);
    };
    this._rankUp = () => this.fullBarsToGain++;
    PlayerRankManager.Instance.ProgressChanged.AddListener(this._progress);
    PlayerRankManager.Instance.RankUp.AddListener(this._rankUp);
    this.fullBarsToGain = 0;
    this.StartAnimation(false);
  }

  OnDestroy() {
    PlayerRankManager.Instance.ProgressChanged.RemoveListener(this._progress);
    PlayerRankManager.Instance.RankUp.RemoveListener(this._rankUp);
  }

  SetCurrentStars() {
    this.StartAnimation(false);
    this.rankFillBar.SetText(this.CurrentStars, PlayerRankManager.Instance.CurrentStarsRequired);
  }

  StartAnimation(wait) {
    if (this._co) this.StopCoroutine(this._co);
    this._co = this.StartCoroutine(this.AnimateUpdatedRank(wait));
  }

  *AnimateUpdatedRank(initialWait) {
    const m = PlayerRankManager.Instance;
    this.rankNumber?.SetText(this.RankValue - this.fullBarsToGain);
    if (initialWait) yield new WaitForSeconds(this.startDelay);
    while (this.fullBarsToGain > 0) {
      this.rankFillBar.SetFill(1, true);
      this.fullBarsToGain--;
      yield new WaitForSeconds(this.barAnimationTime);
      this.RankNumber = this.RankValue - this.fullBarsToGain;
      this.rankFillBar.SetFill(0, false);
    }
    this.rankFillBar.SetFill(this.CurrentStars, 0, m.CurrentStarsRequired, true);
    yield new WaitForSeconds(this.barAnimationTime);
    const f = this.toNewValueFeedbacks;
    if (f) {
      f.Initialization();
      f.StopFeedbacks();
      f.ResetFeedbacks();
      f.PlayFeedbacks();
    }
    this.RankNumber = this.RankValue;
    this.rankFillBar.SetFill(m.CurrentRankProgress, false);
    this._co = null;
  }
}

export class UI_Currency extends MonoBehaviour {
  static typeName = 'UI_Currency';

  constructor() {
    super();
    this.display = 0;
    this.toNewValueDelay = 0.5;
    this.toNewValueDuration = 1;
    this.isFirstUpdate = true;
    this.lastDisplayedValue = 0;
    this.ParticleInstanceCount = 0;
  }

  Awake() {
    if (!this.text) this.text = this.GetComponent('TMP_Text');
    this._change = () => this.OnCurrencyChangeCallback();
  }

  OnEnable() {
    this.currency = CurrencyService.Instance.GetCurrency(this.display);
    this.currency.OnChangeCallback.AddListener(this._change);
    this.OnCurrencyChangeCallback();
  }

  OnDisable() {
    this.StopAllCoroutines();
    this.currency?.OnChangeCallback.RemoveListener(this._change);
    this.currency = null;
  }

  OnCurrencyChangeCallback() {
    const v = this.currency.CurrentValue;
    if (this.isFirstUpdate) {
      this.text.text = toLargeNumberString(v);
      this.lastDisplayedValue = v;
      this.isFirstUpdate = false;
      return;
    }
    if (this._anim) this.StopCoroutine(this._anim);
    this._anim = this.StartCoroutine(this.AnimateUpdatedCurrency(v, this.lastDisplayedValue));
  }

  *AnimateUpdatedCurrency(newValue, oldValue) {
    yield null;
    while (this.ParticleInstanceCount > 0) yield null;
    if (this.toNewValueDuration > 0) {
      yield new WaitForSeconds(this.toNewValueDelay);
      let t = 0;
      while (t < this.toNewValueDuration) {
        t += Time.deltaTime;
        const v = Math.floor((t / this.toNewValueDuration) * (newValue - oldValue) + oldValue);
        if (this.lastDisplayedValue !== v) {
          this.text.text = toLargeNumberString(v);
          this.lastDisplayedValue = v;
        }
        yield null;
      }
    }
    this.text.text = toLargeNumberString(newValue);
    this.lastDisplayedValue = newValue;
  }
}

export class EndlessHighScoresDisplay extends MonoBehaviour {
  static typeName = 'EndlessHighScoresDisplay';

  Start() {
    this.HandleHighScore(endlessHighScores(WorldManager.Instance.CurrentWorldIndex));
    this.SetVisuals(SettingsContainer.Instance.WorldVisualSettings);
  }

  SetVisuals(vs) {
    if (!vs) return;
    const c = Color.from(vs.uiHighlightColor);
    if (this.containerBestImg) this.containerBestImg.color = c;
    if (this.highScoreTitleText) this.highScoreTitleText.color = c;
  }

  HandleHighScore(hs) {
    if (!this.highScoreText) return;
    this.highScoreText.text = String(hs.highScore);
    if (hs.IsNewHighScore) this.newHighScoreFeedback?.PlayFeedbacks();
  }
}

// ---------------------------------------------------------------- world navigation

export class UI_WorldNavButtons extends MonoBehaviour {
  static typeName = 'UI_WorldNavButtons';

  static localWorldSelected = -1;

  get Player() {
    return this.runState?.PlayerState?.Player;
  }

  get tutorialAllows() {
    const t = Tutorials.byName?.('FTUE_UnlockWorld');
    return !t || t.IsFinished || t.IsNotStarted;
  }

  Awake() {
    this.leftBtn.onClick.AddListener(() => this.ButtonWorldChange(-1));
    this.rightBtn.onClick.AddListener(() => this.ButtonWorldChange(1));
    this._world = () => {
      UI_WorldNavButtons.localWorldSelected = WorldManager.Instance.CurrentWorldIndex;
      this.UpdateButtons();
    };
    this._rank = () => this.UpdateButtons();
    WorldManager.Instance.CurrentWorldChanged.AddListener(this._world);
    PlayerRankManager.Instance.RankUp.AddListener(this._rank);
    if (UI_WorldNavButtons.localWorldSelected === -1) UI_WorldNavButtons.localWorldSelected = WorldManager.Instance.CurrentWorldIndex;
    this.worldTutorial?.SetNextWorldButtonReference?.(this.rightBtn);
    UIStatics.worldNextButton = this.rightBtn;
    this._end = () => this.EndTransition();
    TransitionScreen.Instance?.onEndTransition.AddListener(this._end);
  }

  OnEnable() {
    this.UpdateButtons();
  }

  EndTransition() {
    const p = this.Player;
    if (p && this.runState.Mode?.RunMode !== RunMode.TimedLevel) {
      p.CarVisuals?.Show?.();
      UIStatics.vehicleMoveIn?.(p);
    }
  }

  OnDestroy() {
    WorldManager.Instance.CurrentWorldChanged.RemoveListener(this._world);
    PlayerRankManager.Instance.RankUp.RemoveListener(this._rank);
    TransitionScreen.Instance?.onEndTransition.RemoveListener(this._end);
  }

  ButtonWorldChange(direction) {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    InputUIBlocker.DisableInput();
    const self = this;
    Coroutines.start(
      (function* () {
        while (!self.Player) yield null;
        if (UIStatics.vehicleMoveOut) yield* UIStatics.vehicleMoveOut(self.Player);
        self.Player?.CarVisuals?.Hide?.();
        self.ChangeLocalWorld(direction);
        while (TransitionScreen.Instance?.IsTransitioning) yield null;
        InputUIBlocker.EnableInput();
      })(),
      null,
    );
  }

  OnDisable() {
    InputUIBlocker.EnableInput();
  }

  ChangeLocalWorld(direction) {
    const w = UI_WorldNavButtons.localWorldSelected + direction;
    if (w >= 0 && w <= WorldManager.Instance.HighestWorldIndex) this.LoadCurrentWorld(w);
  }

  LoadCurrentWorld(w) {
    const prev = UI_WorldNavButtons.localWorldSelected;
    UI_WorldNavButtons.localWorldSelected = w;
    TransitionScreen.Instance?.SetWorldNavigationState(true, prev, w);
    if (WorldManager.Instance.IsWorldUnlocked(w)) WorldManager.Instance.SetCurrentWorld(w);
    getSceneSwitcher().ReturnToMainMenu();
    this.UpdateButtons();
  }

  UpdateButtons() {
    const nav = PlayerRankManager.Instance.IsWorldNavigationUnlocked;
    const w = UI_WorldNavButtons.localWorldSelected;
    this.leftBtn.gameObject.SetActive(nav && w !== 0 && this.tutorialAllows);
    this.rightBtn.gameObject.SetActive(nav && w !== WorldManager.Instance.HighestWorldIndex);
  }
}

export class UI_BackgroundSwapper extends MonoBehaviour {
  static typeName = 'UI_BackgroundSwapper';

  constructor() {
    super();
    this.tweenDuration = 0.25;
    this.initialized = false;
    this._co = null;
  }

  get IsBusy() {
    return !!this._co;
  }

  Awake() {
    this.start = this.parentTrans.localPosition;
    this.parentWidth = this.parentTrans.rect.width;
    for (const img of [this.leftImg, this.rightImg]) {
      const rt = img.transform;
      rt.sizeDelta = new THREE.Vector2(this.parentWidth, rt.sizeDelta.y);
    }
  }

  ChangeBackground(focusPage, center, left, right) {
    if (this.initialized) {
      if (this._co) this.StopCoroutine(this._co);
      this._co = this.StartCoroutine(this.ChangeCo(focusPage, center, left, right));
    } else {
      this.initialized = true;
      this.Swap(center, left, right);
    }
  }

  *ChangeCo(focusPage, center, left, right) {
    const s = this.start;
    const end = focusPage === -1 ? s.clone().add(new THREE.Vector3(this.parentWidth, 0, 0)) : focusPage === 1 ? s.clone().sub(new THREE.Vector3(this.parentWidth, 0, 0)) : focusPage === 0 ? s.clone() : new THREE.Vector3();
    this.parentTrans.DOLocalMove(new THREE.Vector3(end.x, end.y, -end.z), this.tweenDuration).SetEase(AnimationCurve.from(this.tweenCurve)).SetAutoKill(true);
    yield new WaitForSeconds(this.tweenDuration);
    this.Swap(center, left, right);
    this.parentTrans.localPosition = this.start;
    this._co = null;
  }

  Swap(center, left, right) {
    this.centerImg.overrideSprite = center;
    this.leftImg.overrideSprite = left;
    this.rightImg.overrideSprite = right;
    this.leftImg.color = left ? Color.white : Color.black;
    this.rightImg.color = right ? Color.white : Color.black;
  }
}

// ---------------------------------------------------------------- home buttons

export class UI_ChallengesButton extends MonoBehaviour {
  static typeName = 'UI_ChallengesButton';

  get Home() {
    return MainMenuManager.Instance.HomeScreenManager;
  }

  Start() {
    const vs = SettingsContainer.Instance.CurrentWorldSettings.visualSettings;
    this.button.image.color = Color.from(vs.uiHighlightColor);
    this.button.onClick.AddListener(() => this.ToggleChallengeView());
    const cd = this.Home.challengeDisplay;
    this._open = () => this.OnOverlay(true);
    this._close = () => this.OnOverlay(false);
    cd?.OnOpen?.AddListener(this._open);
    cd?.OnClose?.AddListener(this._close);
    this._change = () => this.UpdateNotifications();
    ChallengeManager.Instance.OnChallengeStart.AddListener(this._change);
    ChallengeManager.Instance.OnChallengeComplete.AddListener(this._change);
    this.UpdateNotifications();
  }

  OnDestroy() {
    const cd = MainMenuManager.Instance?.HomeScreenManager?.challengeDisplay;
    cd?.OnOpen?.RemoveListener(this._open);
    cd?.OnClose?.RemoveListener(this._close);
    ChallengeManager.Instance.OnChallengeStart.RemoveListener(this._change);
    ChallengeManager.Instance.OnChallengeComplete.RemoveListener(this._change);
  }

  UpdateNotifications() {
    this.notification?.UpdatePingObject(ChallengeManager.Instance.GetActiveRunningChallengesCount());
  }

  ToggleChallengeView() {
    const cd = this.Home.challengeDisplay;
    if (!cd) return;
    if (cd.IsOpen) cd.TryClose();
    else cd.TryOpen(false);
  }

  OnOverlay(open) {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.openVisual?.SetActive(!open);
    this.closeVisual?.SetActive(open);
  }
}

export class UI_LevelsButton extends MonoBehaviour {
  static typeName = 'UI_LevelsButton';

  get Home() {
    return MainMenuManager.Instance.HomeScreenManager;
  }

  Start() {
    const vs = SettingsContainer.Instance.CurrentWorldSettings.visualSettings;
    this.button.image.color = Color.from(vs.uiHighlightColor);
    this.isUnlockedAtStart = TimedLevelModeController.Instance.IsUnlocked(TimedLevelModeDifficulty.Easy);
    this.gameObject.SetActive(this.isUnlockedAtStart);
    this._reward = (d) => {
      if (d.unlockType === UnlockTypeEnum.LevelDifficultyEasy) this.gameObject.SetActive(true);
    };
    if (!this.isUnlockedAtStart) UnlockRewardAsset.UnlockRewardGiven.AddListener(this._reward);
    this.button.onClick.AddListener(() => this.ToggleOverlay());
    const tl = this.Home.timedLevelsDisplay;
    this._open = () => this.OnOverlay(true);
    this._close = () => this.OnOverlay(false);
    tl?.OnOpen?.AddListener(this._open);
    tl?.OnClose?.AddListener(this._close);
    this._unseen = () => this.UpdateNotification();
    TimedLevelModeController.Instance.UnseenStateChanged.AddListener(this._unseen);
    this.UpdateNotification();
    if (getMenuState().isLevelScreenOpen && tl && !tl.IsOpen) tl.TryOpen();
  }

  OnDestroy() {
    const tl = MainMenuManager.Instance?.HomeScreenManager?.timedLevelsDisplay;
    tl?.OnOpen?.RemoveListener(this._open);
    tl?.OnClose?.RemoveListener(this._close);
    TimedLevelModeController.Instance.UnseenStateChanged.RemoveListener(this._unseen);
    UnlockRewardAsset.UnlockRewardGiven.RemoveListener(this._reward);
  }

  UpdateNotification() {
    const n = TimedLevelModeController.Instance.GetUnseenDifficultiesCurrentWorld();
    this.notificationText?.UpdatePingObject(n > 0);
    this.notificationText?.UpdatePingObject(n);
  }

  ToggleOverlay() {
    if (UIStatics.RankUpPopup.WasPopBlocked || UIStatics.RankUpPopup.IsOpenOrActive) return;
    const tl = this.Home.timedLevelsDisplay;
    if (!tl) return;
    if (tl.IsOpen) tl.TryClose();
    else tl.TryOpen();
  }

  OnOverlay(open) {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.openVisual?.SetActive(!open);
    this.closeVisual?.SetActive(open);
  }

  PlayUnlockFeedbacks() {
    this.gameObject.SetActive(true);
    this.unlockFeedbacks?.Initialization();
    this.unlockFeedbacks?.PlayFeedbacks();
  }
}

// ---------------------------------------------------------------- tooltips

export class UI_ToolTipHandler extends MonoBehaviour {
  static typeName = 'UI_ToolTipHandler';

  SpawnTooltip(term, message = '') {
    const popup = Instantiate(this.tooltipPrefab, this.tooltipContainer);
    popup.Show(term, message);
  }
}

export class UI_TooltipPopup extends MonoBehaviour {
  static typeName = 'UI_TooltipPopup';

  Show(term, message = '') {
    if (term === undefined) {
      this.gameObject.SetActive(true);
      return;
    }
    this.gameObject.SetActive(true);
    this.text?.SetTerm(term);
    this.text?.SetText(message);
    this._co = this.StartCoroutine(this.ShowTooltip());
  }

  *ShowTooltip() {
    yield new WaitForSeconds(this.feedback?.TotalDuration ?? 1);
    this._co = null;
    Destroy(this.gameObject);
  }
}

// ---------------------------------------------------------------- rewards flying to the top bar

export class ParticleSeekCurved extends MonoBehaviour {
  static typeName = 'ParticleSeekCurved';

  constructor() {
    super();
    this.force = 10;
    this.dieDistance = 1;
    this.tracker = null;
  }

  IncrementTrackerParticleCount(tracker) {
    this.tracker = tracker;
    if (tracker) tracker.ParticleInstanceCount = (tracker.ParticleInstanceCount || 0) + 1;
  }

  Start() {
    const lt = this.system?.main?.startLifetime;
    this.minimumLifetime = lt ? minCurveValue(lt) : 1;
    this.curve = AnimationCurve.from(this.influenceOverLifetime);
  }

  OnDestroy() {
    this.ClearTracker();
  }

  ClearTracker() {
    if (this.tracker) {
      this.tracker.ParticleInstanceCount--;
      this.tracker = null;
    }
  }

  LateUpdate() {
    const sys = this.system;
    if (!sys || !this.target) return;
    if (!sys.particles.length) {
      if (!sys.playing || sys._wasAlive === false) this.ClearTracker();
      return;
    }
    const tp = this.target.position;
    const target = sys.worldSpace ? tp : this.transform.InverseTransformPoint(tp);
    const step = this.force * Time.deltaTime;
    for (const q of sys.particles) {
      if (this.dieDistance > 0 && q.p.distanceTo(target) <= this.dieDistance) q.age = q.life + 1;
      const k = this.curve.Evaluate(1 - Math.min(1, Math.max(0, (q.life - q.age) / this.minimumLifetime)));
      const d = target.clone().sub(q.p);
      const len = d.length();
      const move = k * step;
      if (len <= move || len === 0) q.p.copy(target);
      else q.p.addScaledVector(d, move / len);
    }
  }
}

function minCurveValue(c) {
  if (typeof c === 'number') return c;
  const mode = c.minMaxState ?? 0;
  if (mode === 0) return c.scalar ?? 1;
  if (mode === 3) return Math.min(c.minScalar ?? c.scalar ?? 1, c.scalar ?? 1);
  const keys = c.maxCurve?.$curve || [];
  return keys.length ? Math.min(...keys.map((k) => k[1])) * (c.scalar ?? 1) : c.scalar ?? 1;
}

/** reward ids of the run earnings -> UI particle targets */
function rewardIdOf(def) {
  return def?.rewardID || def?.id;
}

export class MainMenuRunRewardHandler extends MonoBehaviour {
  static typeName = 'MainMenuRunRewardHandler';

  constructor() {
    super();
    this.rewardClaimDelay = 0.5;
    this.maxParticleCount = 15;
  }

  get AreAnyParticleInstancesActive() {
    return (this.rewardParticlesEndData || []).some((d) => d.particleTracker?.ParticleInstanceCount > 0);
  }

  Awake() {
    for (const d of this.rewardParticlesEndData || []) {
      const go = d.particleTrackerObject;
      d.particleTracker = go?.components?.find((c) => 'ParticleInstanceCount' in c) || null;
    }
    this.mainMenu = this.GetComponentInParent('MainMenuManager');
    this.pending = Save.data.runEarnings;
    if (this.pending && this.pending.length) this.StartCoroutine(this.HandleUnclaimedRewards());
  }

  OnDestroy() {
    this.ClaimPendingEarnings();
  }

  *HandleUnclaimedRewards() {
    yield new WaitForSeconds(this.rewardClaimDelay);
    while (this.mainMenu?.IsBusy) yield null;
    const rewards = this.pending || [];
    this.ClaimPendingEarnings();
    this.SpawnReward(rewards);
  }

  ClaimPendingEarnings() {
    if (!this.pending) return;
    for (const r of this.pending) grantReward(r, r.type || 'Run');
    this.pending = null;
    Save.data.runEarnings = null;
    Save.setDirty();
  }

  SpawnReward(defs) {
    for (const d of defs) if (d && d.amount) this.TrySpawnParticles(d);
  }

  OverrideParticleStart(rewardType, spawnAt, delay = 0) {
    const list = (this.rewardParticlesStartData ||= []);
    const e = list.find((x) => x.rewardType === rewardType);
    if (e) {
      e.spawnAtTransform = spawnAt;
      e.startDelay = delay;
    } else list.push({ rewardType, spawnAtTransform: spawnAt, startDelay: delay });
  }

  TrySpawnParticles(def) {
    const id = rewardIdOf(def);
    const end = (this.rewardParticlesEndData || []).find((x) => (x.rewards || []).some((r) => (r?.id ?? r?.$so ?? r) === id || String(r?.$so || '').endsWith(id)));
    const rtype = def.rewardType ?? rewardTypeOf(def.type);
    const start = (this.rewardParticlesStartData || []).find((x) => x.rewardType === rtype);
    if (!start || !end || !end.particlesPrefab) return;
    const n = Math.max(1, Math.min(this.maxParticleCount, Math.floor(def.amount / (end.rewardTypeDivider || 1))));
    const seek = Instantiate(end.particlesPrefab, this.transform);
    const sys = seek.system;
    if (sys) {
      sys.d.startDelay = { scalar: start.startDelay || 0, minMaxState: 0 };
      start.startDelay = 0;
      const em = sys.d.EmissionModule;
      if (em?.m_Bursts?.length) em.m_Bursts[0] = { ...em.m_Bursts[0], time: 0, countCurve: { scalar: n, minMaxState: 0 }, minCount: n, maxCount: n };
    }
    seek.transform.position = start.spawnAtTransform.position;
    seek.target = end.particlesFlyTarget;
    sys?.Play();
    seek.IncrementTrackerParticleCount(end.particleTracker);
  }
}

/** UI_RewardType of a reward id (SoftCurrency = 0, HardCurrency = 1, Star = 2 ...) */
/** UI_RewardType (Endless 0, Challenge 1, BonusRide 2, TimedLevel 3, PlayerRank 4, CosmeticLevel 5, Shop 6) of an earnings source */
function rewardTypeOf(source) {
  const i = ['Endless', 'Challenge', 'BonusRide', 'TimedLevel', 'PlayerRank', 'CosmeticLevel', 'Shop'].indexOf(source);
  return i >= 0 ? i : 0;
}

// ---------------------------------------------------------------- rank up popups on the menu

export class MainMenuRankUpPopupOpener extends MonoBehaviour {
  static typeName = 'MainMenuRankUpPopupOpener';

  static get IsOpenOrActive() {
    return UIStatics.RankUpPopup.IsOpenOrActive;
  }

  static get WasPopBlocked() {
    return UIStatics.RankUpPopup.WasPopBlocked;
  }

  constructor() {
    super();
    this.showDelay = 0.2;
    this.spawned = null;
  }

  get RankManager() {
    return PlayerRankManager.Instance;
  }

  OnEnable() {
    this._rankUp = (r) => this.RankUpEvent(r);
    this.RankManager.RankUp.AddListener(this._rankUp);
    this.RankUpEvent(this.RankManager.LastPresentedRank() + 1);
  }

  OnDisable() {
    this.RankManager.RankUp.RemoveListener(this._rankUp);
    // the popup and its delayed spawn go with this menu: clear the static state, OnEnable opens the rank again
    this.Close();
    UIStatics.RankUpPopup.WasPopBlocked = false;
  }

  Update() {
    const st = UIStatics.RankUpPopup;
    if (st.WasPopBlocked) {
      st.WasPopBlocked = false;
      if (this.RankManager.LastPresentedRank() < this.RankManager.CurrentRank) this.Open(this.RankManager.LastPresentedRank() + 1);
    }
  }

  get blocked() {
    const home = MainMenuManager.Instance?.HomeScreenManager;
    // The claim burst, then the popup (owner's request, 2026-10-30): it no longer waits for the reward stars to fly to
    // the rank bar (they land under the popup), only for the challenge claim itself.
    return UIStatics.TutorialActive() || !!home?.challengeDisplay?.IsAutoClaiming || !!home?.timedLevelsDisplay?.IsBusy;
  }

  Open(newRank) {
    const st = UIStatics.RankUpPopup;
    if (this.blocked) {
      st.WasPopBlocked = true;
      return;
    }
    st.IsOpenOrActive = true;
    const self = this;
    this.StartCoroutine((function* () {
      yield new WaitForSeconds(self.showDelay);
      if (UIStatics.TutorialActive()) {
        // nothing is open while the tutorial runs (the C# kept IsOpenOrActive, locking the pages under the tutorial)
        st.IsOpenOrActive = false;
        st.WasPopBlocked = true;
      } else if (!self.spawned) {
        if (self.debugInstantClaim) {
          self.OnClaimEvent();
          return;
        }
        self.spawned = Instantiate(self.rankUpPopupPrefab, self.spawnPopupAtTransform);
        self.spawned.Initialize?.(newRank, () => self.OnClaimEvent());
      }
    })());
  }

  Close() {
    if (this.spawned) {
      Destroy(this.spawned.gameObject);
      this.spawned = null;
    }
    UIStatics.RankUpPopup.IsOpenOrActive = false;
  }

  RankUpEvent(newRank) {
    if (newRank !== 0 && this.RankManager.LastPresentedRank() < this.RankManager.CurrentRank) this.Open(this.RankManager.LastPresentedRank() + 1);
  }

  OnClaimEvent() {
    const m = this.RankManager;
    if (m.LastPresentedRank() < m.CurrentRank) m.UpPresentedRank();
    if (m.LastPresentedRank() < m.CurrentRank) {
      this.Close();
      this.Open(m.LastPresentedRank() + 1);
    } else {
      // not after the first rank-up, rank 1 to 2: the track has nothing to show yet (owner's request, 2026-10-30)
      if (m.CurrentRank > 2) this.openRewardTrack?.OpenTrack?.();
      this.Close();
      // the Challenges popup the claim opened goes with the last rank-up (owner's request, 2026-10-30)
      MainMenuManager.Instance?.HomeScreenManager?.challengeDisplay?.TryClose?.();
    }
  }
}

// ---------------------------------------------------------------- bonus letters on the menu

export class UI_BonusPip extends MonoBehaviour {
  static typeName = 'UI_BonusPip';

  Awake() {
    this.Deactivate();
  }

  ActivateNoFeedback() {
    this.activateGO?.SetActive(true);
  }

  Deactivate() {
    this.activateGO?.SetActive(false);
  }

  OnDestroy() {
    this.feedbackOnActivate?.StopFeedbacks(true);
    this.feedbackOnDeplete?.StopFeedbacks(true);
  }

  ActivateFeedback() {
    this.ActivateNoFeedback();
    this.feedbackOnActivate?.PlayFeedbacks();
  }

  PlayDepleteFeedback(length) {
    if (!this.feedbackOnDeplete) return;
    if (this.depleteParticles) this.depleteParticles.Timing = { ...(this.depleteParticles.Timing || {}), InitialDelay: length };
    if (this.depleteImage) this.depleteImage.Duration = length;
    if (this.depleteSetActive) this.depleteSetActive.Timing = { ...(this.depleteSetActive.Timing || {}), InitialDelay: length };
    if (this.depleteScale) this.depleteScale.AnimateScaleDuration = length;
    this.feedbackOnDeplete.PlayFeedbacks();
  }
}

export class UIBonusLetterBarMainMenu extends MonoBehaviour {
  static typeName = 'UIBonusLetterBarMainMenu';

  static previousBonusLetters = -1;

  constructor() {
    super();
    this.addedParticlesPerPip = 5;
    this.delayForPipAnimation = 2;
    this.delayPerPip = 0.25;
  }

  get CanShowBonusRideBar() {
    return BonusState.IsUnlocked;
  }

  Start() {
    this.gameObject.SetActive(false);
    this.currency = CurrencyService.Instance.BonusLetter;
    if (UIBonusLetterBarMainMenu.previousBonusLetters === -1 && this.CanShowBonusRideBar) UIBonusLetterBarMainMenu.previousBonusLetters = this.currency.CurrentValue;
    if (!this.gameObject.activeSelf && this.CanShowBonusRideBar) this.gameObject.SetActive(true);
    this.UpdatePips();
    this._update = () => this.UpdatePips();
    this.currency.OnChangeCallback.AddListener(this._update);
  }

  OnDestroy() {
    this.currency?.OnChangeCallback.RemoveListener(this._update);
    if (this._anim) Coroutines.stop(this._anim);
  }

  UpdatePips() {
    if (this._anim) Coroutines.stop(this._anim);
    if (this.currency.CurrentValue !== 0) this._anim = Coroutines.start(this.AnimatePips(), null);
    else for (const p of this.pips || []) p.Deactivate();
    const ps = this.streamParticles;
    if (ps?.d?.EmissionModule) ps.rateOverride = this.addedParticlesPerPip * this.currency.CurrentValue;
  }

  *AnimatePips() {
    const value = this.currency.CurrentValue;
    const prev = UIBonusLetterBarMainMenu.previousBonusLetters;
    const pips = this.pips || [];
    for (let j = 0; j < pips.length; j++) if (j < value && j < prev) pips[j].ActivateNoFeedback();
    yield new WaitForSeconds(this.delayForPipAnimation);
    for (let i = 0; i < pips.length; i++) {
      if (i < value && i >= prev) {
        pips[i].ActivateFeedback();
        AudioSampleID.UI_BonusLetterMenu.Play();
        yield new WaitForSeconds(this.delayPerPip);
      }
    }
    UIBonusLetterBarMainMenu.previousBonusLetters = value;
    this._anim = null;
    if (BonusState.CollectedAllBonusRideLetters) AudioSampleID.UI_BonusRideReady.Play();
  }
}

export class UI_MainMenuBonusButton extends MonoBehaviour {
  static typeName = 'UI_MainMenuBonusButton';

  Start() {
    this.gameObject.SetActive(false);
    this.bonusButton.onClick.AddListener(() => this.OnBonusButtonClicked());
    this.currency = CurrencyService.Instance.BonusLetter;
    this._update = () => this.UpdateBonusRideButton();
    this.currency.OnChangeCallback.AddListener(this._update);
    this.UpdateBonusRideButton();
  }

  OnDestroy() {
    this.currency?.OnChangeCallback.RemoveListener(this._update);
  }

  UpdateBonusRideButton() {
    if (BonusState.ShouldShowBonusLetterButton) {
      this.gameObject.SetActive(true);
      const all = BonusState.CollectedAllBonusRideLetters;
      this.notificationIcon?.UpdatePingObject(all);
      this.buttonBackground?.gameObject.SetActive(all);
      if (all) this.buttonEnableFeedback?.gameObject.SetActive(true);
      this.disableOnCooldown?.SetActive(BonusState.bonusCurrencyTimerExpired);
    } else this.gameObject.SetActive(false);
  }

  OnBonusButtonClicked() {
    if (this.activeOverlay && !this.activeOverlay.gameObject._destroyed) return;
    if (!BonusState.CollectedAllBonusRideLetters) return;
    this.activeOverlay = Instantiate(this.bonusPopupPrefab, MainMenuManager.Instance.popupTransform);
  }
}

// ---------------------------------------------------------------- world stats button (top center)

export class UI_WorldStatsButton extends MonoBehaviour {
  static typeName = 'UI_WorldStatsButton';

  static CurrentProgress = new Map();

  static worldID = -1;

  get IsPlaying() {
    return !!this._co || !!this.progressStartFeedback?.IsPlaying || !!this.progressIncrementFeedback?.IsPlaying || !!this.progressStartOtherFeedback?.IsPlaying || !!this.progressIncrementOtherFeedback?.IsPlaying;
  }

  get Home() {
    return MainMenuManager.Instance?.HomeScreenManager;
  }

  Start() {
    const wm = WorldManager.Instance;
    if (RunsTracker.CountSessionEndless === 1 || UI_WorldStatsButton.worldID === -1) UI_WorldStatsButton.worldID = wm.CurrentWorldIndex;
    this.worldSelectButton.onClick.AddListener(() => this.ToggleWorldStatsOpen());
    for (let i = 0; i <= wm.HighestWorldIndex; i++) if (!UI_WorldStatsButton.CurrentProgress.has(i)) UI_WorldStatsButton.CurrentProgress.set(i, this.GetWorldProgress(i));
    this.overrideColorsToOtherWorld = feedbackWithTarget(this.progressStartOtherFeedback, this.fillbar);
    this.overrideColorsToWorld = feedbackWithTarget(this.progressIncrementOtherFeedback, this.fillbar);
    this.OnWorldChanged(wm.CurrentWorldIndex);
    this._dirty = () => (this.isProgressionDirty = true);
    CardEvents.OnUnlockedNewVehicle.AddListener(this._dirty);
    ChallengeManager.Instance.OnChallengeClaimed.AddListener(this._dirty);
    MainMenuManager.Instance?.OnMenuPageSwitch.AddListener(this._dirty);
  }

  OnDestroy() {
    CardEvents.OnUnlockedNewVehicle.RemoveListener(this._dirty);
    ChallengeManager.Instance.OnChallengeClaimed.RemoveListener(this._dirty);
    MainMenuManager.Instance?.OnMenuPageSwitch.RemoveListener(this._dirty);
  }

  ToggleWorldStatsOpen() {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    const ws = this.Home?.worldStatsDisplay;
    if (ws && !ws.IsOpen) ws.TryOpen();
  }

  Update() {
    const home = this.Home;
    if (
      this.isProgressionDirty &&
      !this.IsPlaying &&
      !UIStatics.RankUpPopup.WasPopBlocked &&
      !UIStatics.RankUpPopup.IsOpenOrActive &&
      !UIStatics.RewardTrackOpen &&
      !home?.challengeDisplay?.IsAutoClaiming &&
      !PlayerRankManager.Instance.HasRanksLeftToShow &&
      !this.TryPlayProgressionAny()
    )
      this.isProgressionDirty = false;
  }

  SetVisuals(vs) {
    const c = Color.from(vs.uiHighlightColor);
    if (this.fillbar) this.fillbar.color = c;
    if (this.worldSelectImage) this.worldSelectImage.sprite = vs.worldSelectIcon;
    for (const ps of this.progressParticles || []) ps?.SetColors?.({ minMaxState: 0, maxColor: [c.r, c.g, c.b, c.a] });
    if (this.incrementTMPColor) this.incrementTMPColor.DestinationColor = c;
  }

  SetParticleAndText(vs) {
    const c = Color.from(vs.uiHighlightColor);
    for (const ps of this.progressParticles || []) ps?.SetColors?.({ minMaxState: 0, maxColor: [c.r, c.g, c.b, c.a] });
    if (this.incrementTMPColor) this.incrementTMPColor.DestinationColor = c;
    if (this.incrementTMPColorOther) this.incrementTMPColorOther.DestinationColor = c;
  }

  TryPlayProgressionAny() {
    const id = UI_WorldStatsButton.worldID;
    if (this.TryPlayProgression(id)) return true;
    for (let i = 0; i < WorldManager.Instance.HighestUnlockedWorld() + 1; i++) if (i !== id && this.TryPlayProgression(i)) return true;
    return false;
  }

  TryPlayProgression(id) {
    const prev = UI_WorldStatsButton.CurrentProgress.get(id) ?? 0;
    const cur = this.GetWorldProgress(id);
    if (UI_WorldStatsButton.worldID === id) {
      this.worldText?.SetText(String(UI_WorldStatsButton.worldID + 1));
      this.SetProgress(cur);
    }
    if (prev === cur || this._co) return false;
    this._co = this.StartCoroutine(UI_WorldStatsButton.worldID === id ? this.AnimateProgression(prev, cur) : this.AnimateProgressionOther(id, prev, cur));
    UI_WorldStatsButton.CurrentProgress.set(id, cur);
    return true;
  }

  SetProgress(amount) {
    this.progressText?.SetText(String(amount));
    if (this.fillbar) this.fillbar.fillAmount = amount / 100;
  }

  GetWorldProgress(id) {
    const wm = WorldManager.Instance;
    const e = wm.GetWorldEndlessProgressPercentage(id);
    const t = wm.GetWorldTimedLevelProgressPercentage(id);
    const c = wm.GetWorldCollectionProgressPercentage(id);
    return Math.floor(((e + t + c) / 3) * 100);
  }

  *AnimateProgression(start, end) {
    this.SetProgress(start);
    while (TransitionScreen.Instance?.IsTransitioning) yield null;
    this.SetVisuals(SettingsContainer.Instance.WorldVisualSettings);
    this.worldSelectImageOther?.gameObject.SetActive(false);
    this.progressStartFeedback?.PlayFeedbacks();
    yield new WaitForSeconds(this.progressStartFeedback?.TotalDuration ?? 0);
    this.progressIncrementFeedback?.PlayFeedbacks();
    while (this.progressIncrementFeedback && !this.progressIncrementFeedback.InScriptDrivenPause && this.progressIncrementFeedback.IsPlaying) yield null;
    this.progressIncrementFeedback?.ResumeFeedbacks();
    this.SetProgress(end);
    this._co = null;
  }

  *AnimateProgressionOther(other, start, end) {
    this.SetProgress(start);
    while (TransitionScreen.Instance?.IsTransitioning) yield null;
    const ws = SettingsContainer.Instance.WorldSettings;
    const a = ws[UI_WorldStatsButton.worldID].visualSettings;
    const b = ws[other].visualSettings;
    this.SetParticleAndText(b);
    if (this.overrideColorsToOtherWorld) this.overrideColorsToOtherWorld.ColorOverTime = gradient2(a.uiHighlightColor, b.uiHighlightColor);
    if (this.overrideColorsToWorld) this.overrideColorsToWorld.ColorOverTime = gradient2(b.uiHighlightColor, a.uiHighlightColor);
    if (this.worldSelectImageOther) this.worldSelectImageOther.sprite = b.worldSelectIcon;
    this.progressStartOtherFeedback?.PlayFeedbacks();
    yield new WaitForSeconds(this.progressStartOtherFeedback?.TotalDuration ?? 0);
    this.progressIncrementOtherFeedback?.PlayFeedbacks();
    while (this.progressIncrementOtherFeedback && !this.progressIncrementOtherFeedback.InScriptDrivenPause && this.progressIncrementOtherFeedback.IsPlaying) yield null;
    this.progressIncrementOtherFeedback?.ResumeFeedbacks();
    this.SetProgress(end);
    this._co = null;
  }

  OnWorldChanged(id) {
    UI_WorldStatsButton.worldID = id;
    this.SetVisuals(SettingsContainer.Instance.WorldVisualSettings);
    this.isProgressionDirty = true;
  }
}

function gradient2(a, b) {
  const ca = Color.from(a);
  const cb = Color.from(b);
  return new Gradient(
    [
      [0, ca.r, ca.g, ca.b],
      [1, cb.r, cb.g, cb.b],
    ],
    [
      [0, 1],
      [1, 1],
    ],
  );
}

/** MMFeedbacksUtilities.FindFeedbackComponentsWithTarget: the MMFeedbackImage of a player bound to an Image */
function feedbackWithTarget(player, target) {
  if (!player || !target) return null;
  return (player.Feedbacks || []).find((f) => f && f.BoundImage === target) || null;
}

for (const cls of [
  ScriptInitializerMainMenu,
  MainMenuPage,
  MainMenuManager,
  MenuButtonState,
  HomeScreenManager,
  UI_MainMenuTopContainer,
  StarRequireIndicator,
  UI_PlayerRank,
  UI_Currency,
  EndlessHighScoresDisplay,
  UI_WorldNavButtons,
  UI_BackgroundSwapper,
  UI_ChallengesButton,
  UI_LevelsButton,
  UI_ToolTipHandler,
  UI_TooltipPopup,
  ParticleSeekCurved,
  MainMenuRunRewardHandler,
  MainMenuRankUpPopupOpener,
  UI_BonusPip,
  UIBonusLetterBarMainMenu,
  UI_MainMenuBonusButton,
  UI_WorldStatsButton,
])
  registerComponent(cls);

void localize;
void DOTween;
void WaitUntil;
void WaitWhile;
void SceneSwitcher;
