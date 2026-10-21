// Scene flow of the original (SceneSwitcher / MenuState / TransitionScreen): the Menu "scene" is the Main Menu
// canvas instantiated over the game scene, MainGame is the GameManager world + the HUD canvas.
import { MonoBehaviour, Destroy, World } from '../engine/scene.js';
import { WaitForSeconds, Coroutines, EventAction } from '../engine/core.js';
import { ScriptableObject, registerSO, registerComponent, Instantiate, getRuntimeSO } from '../engine/instantiate.js';
import { loadPrefabDeep, Assets } from '../engine/assets.js';
import { Ease } from '../ugui/tween.js';
import { InputUIBlocker } from '../ugui/events.js';
import { Tutorials } from '../meta/tutorials.js';
import { Save } from '../meta/save.js';
import { WorldManager, SettingsContainer, RankTrack } from './services.js';

// ---------------------------------------------------------------- host (set by main.js)

/**
 * SceneHost: what "loading a scene" means in the web port.
 *  loadGame(mode): prepare + start the GameManager world of a run mode (MainGame scene)
 *  activeMode(): the mode of the loaded game scene
 */
export const SceneHost = {
  loadGame: async () => {},
  startRun: () => {},
  activeMode: () => null,
  menuRoot: null,
  hudRoot: null,
};

function markPersistent(root) {
  for (const r of root._sceneRoots || [root]) r._persistent = true;
}

function destroyRoot(root) {
  if (!root) return;
  for (const r of root._sceneRoots || [root]) Destroy(r);
}

export const Scenes = {
  async loadMenu() {
    if (SceneHost.menuRoot) destroyRoot(SceneHost.menuRoot);
    await loadPrefabDeep(Assets.manifest.ui.menu);
    const root = Instantiate(Assets.manifest.ui.menu);
    markPersistent(root);
    SceneHost.menuRoot = root;
    return root;
  },
  unloadMenu() {
    destroyRoot(SceneHost.menuRoot);
    SceneHost.menuRoot = null;
  },
  get isMenuLoaded() {
    return !!SceneHost.menuRoot;
  },
  /** MainGame: GameManager world + HUD canvas (ScriptInitializerGame -> HUD.Initialize) */
  async loadGame(mode) {
    await loadPrefabDeep(Assets.manifest.ui.hud);
    await SceneHost.loadGame(mode);
    const hud = Instantiate(Assets.manifest.ui.hud);
    SceneHost.hudRoot = hud;
    for (const c of hud.GetComponentsInChildren('HUD', true)) c.Initialize?.();
    return hud;
  },
};

// ---------------------------------------------------------------- mode ids

export class EndlessModeID {
  constructor(world) {
    this.worldID = world;
  }

  get WorldID() {
    return this.worldID;
  }

  IsValid() {
    return this.worldID >= 0;
  }

  get RunStateMode() {
    return SceneHost.createEndless(this.worldID);
  }

  toString() {
    return 'Endless';
  }
}

export class TimedLevelModeID {
  constructor(level) {
    this.level = typeof level === 'string' ? Assets.manifest.levels.find((l) => l.id === level || l.name === level) : level;
  }

  IsValid() {
    return !!this.level;
  }

  get RunStateMode() {
    return SceneHost.createLevel(this.level);
  }

  toString() {
    return this.level?.name || '';
  }
}

function modeKey(mode) {
  if (!mode) return '';
  return mode.level ? mode.level.name : 'Endless';
}

// ---------------------------------------------------------------- MenuState

export class MenuState extends ScriptableObject {
  static typeName = 'MenuState';

  constructor() {
    super();
    this.currentScene = '';
    this.requestedScene = '';
    this.isSceneTransitioning = false;
    this.isMultiSceneLoading = false;
    this.currentMenuPageIndex = -1;
    this.isLevelScreenOpen = false;
  }
}

// ---------------------------------------------------------------- SceneSwitcher

export class SceneSwitcher extends ScriptableObject {
  static typeName = 'SceneSwitcher';

  static get Instance() {
    return getSceneSwitcher();
  }

  get menuStateSO() {
    return this.menuState instanceof MenuState ? this.menuState : getMenuState();
  }

  get runStateSO() {
    return this.runState?.StartRun ? this.runState : getRuntimeSO('MonoBehaviour/Run State');
  }

  get Transition() {
    return TransitionScreen.Instance;
  }

  get delay() {
    return this.menuUnloadDelayWhenGameStartedFromMenu ?? 0.5;
  }

  /** SceneSwitcher.LoadAppStart */
  *LoadAppStart() {
    const ms = this.menuStateSO;
    if (Tutorials.FirstRun.IsStarted || !Tutorials.FirstRun.IsFinished) {
      this.runStateSO.SetNewMode(new EndlessModeID(0).RunStateMode);
      this.GoToGame(true);
    } else {
      ms.isMultiSceneLoading = true;
      this.LoadSceneAsync('Menu', true, null, () => this.loadGameAdditive(true), null);
    }
    yield null;
  }

  async loadGameAdditive(withFade) {
    const rs = this.runStateSO;
    if (!rs.Mode) rs.SetNewMode(new EndlessModeID(WorldManager.Instance.CurrentWorldIndex).RunStateMode);
    await Scenes.loadGame(rs.Mode);
    if (withFade) {
      this.Transition.FadeToBlackAndBack(null, () => {
        this.menuStateSO.isMultiSceneLoading = false;
      });
    }
  }

  StartMode(modeID) {
    const ms = this.menuStateSO;
    if (ms.isSceneTransitioning || !modeID?.IsValid()) return;
    const rs = this.runStateSO;
    if (modeID.toString() !== modeKey(rs.Mode)) rs.SetNewMode(modeID.RunStateMode);
    // RunState.ModeRequiresSceneReload: anything but Endless reloads the game scene
    this.GoToGame(rs.Mode?.RunMode !== 1);
  }

  ReturnToMainMenu() {
    if (!this.menuStateSO.isSceneTransitioning) this.GoToMenu();
  }

  ReloadGameScene() {
    if (!this.menuStateSO.isSceneTransitioning) this.LoadSceneAsync('MainGame', true, null, () => this.StartRun(), null);
  }

  AdditiveLoadGameScene() {
    const ms = this.menuStateSO;
    if (!ms.isMultiSceneLoading && !SceneHost.activeMode()) {
      this.LoadSceneAsync('MainGame', false, null, null, () => this.Transition.FadeToScene());
    }
  }

  GoToGame(reloadGameScene) {
    if (reloadGameScene) {
      this.LoadSceneAsync('MainGame', true, null, null, () => this.StartRun());
      return;
    }
    const self = this;
    this.Transition.StartCoroutine(
      (function* () {
        yield new WaitForSeconds(self.delay);
        Scenes.unloadMenu();
        self.StartRun();
      })(),
    );
  }

  GoToMenu() {
    const id = ++this._loadingID;
    this.Transition.FadeToBlack(() => {
      if (id !== this._loadingID) return;
      Save.save();
      const ms = this.menuStateSO;
      this.LoadSceneAsync(
        'Menu',
        false,
        () => {
          ms.isMultiSceneLoading = true;
        },
        async () => {
          if (id !== this._loadingID) return;
          this.runStateSO.CleanUpPreviousRun?.();
          const rs = this.runStateSO;
          rs.SetNewMode(new EndlessModeID(WorldManager.Instance.CurrentWorldIndex).RunStateMode);
          await Scenes.loadGame(rs.Mode);
          this.Transition.FadeToScene();
          ms.isMultiSceneLoading = false;
        },
        null,
      );
      const wm = WorldManager.Instance;
      if (wm.IsWorldUnlocked(wm.CurrentWorldIndex)) wm.SetUnlockedWorldSelected(wm.CurrentWorldIndex);
    });
  }

  /** LoadSceneAsync(sceneName, Single, useTransition, transitionIn, sceneLoaded, finish) */
  LoadSceneAsync(sceneName, useTransition, transitionInCallback, sceneLoadedCallback, finishCallback) {
    const ms = this.menuStateSO;
    if (ms.isSceneTransitioning) return;
    ms.requestedScene = sceneName;
    ms.isSceneTransitioning = true;
    const load = async () => {
      transitionInCallback?.();
      if (sceneName === 'Menu') {
        SceneHost.leaveGame?.();
        await Scenes.loadMenu();
      } else {
        // single load of MainGame: the menu goes away
        if (Scenes.isMenuLoaded) Scenes.unloadMenu();
        await Scenes.loadGame(this.runStateSO.Mode);
      }
      await sceneLoadedCallback?.();
      if (useTransition) this.Transition.FadeToScene();
      finishCallback?.();
      ms.currentScene = sceneName;
      ms.isSceneTransitioning = false;
    };
    if (useTransition) this.Transition.FadeToBlack(() => load());
    else load();
  }

  StartRun() {
    SceneHost.startRun();
  }
}
SceneSwitcher.prototype._loadingID = 0;

let sceneSwitcher = null;
let menuState = null;

export function getSceneSwitcher() {
  if (!sceneSwitcher) {
    const id = Object.keys(Assets.so).find((k) => Assets.so[k].$type === 'SceneSwitcher');
    sceneSwitcher = id ? getRuntimeSO(id) : new SceneSwitcher();
  }
  return sceneSwitcher;
}

export function getMenuState() {
  if (!menuState) {
    const id = Object.keys(Assets.so).find((k) => Assets.so[k].$type === 'MenuState');
    menuState = id ? getRuntimeSO(id) : new MenuState();
  }
  return menuState;
}

// ---------------------------------------------------------------- TransitionScreen

export class TransitionScreen extends MonoBehaviour {
  static typeName = 'TransitionScreen';

  static Instance = null;

  constructor() {
    super();
    this.fadeDuration = 0.2;
    this.fadeEase = 0;
    this.worldTransitionWait = 1.5;
    this.isTransitioning = false;
    this.targetWorldID = -1;
    this.canLoadTargetWorld = false;
    this.onStartTransition = new EventAction();
    this.onEndTransition = new EventAction();
  }

  get IsTransitioning() {
    return this.isTransitioning;
  }

  get WorldTransitionActive() {
    return !!this.worldTransitionGO?.activeSelf;
  }

  Initialize() {
    if (TransitionScreen.Instance && TransitionScreen.Instance !== this) {
      Destroy(this.gameObject);
      return;
    }
    TransitionScreen.Instance = this;
    this.transform.SetParent(null, false);
    this.gameObject._persistent = true;
    this.Toggle(false, null, true);
  }

  FadeToBlack(cb = null) {
    this.Toggle(true, cb);
  }

  FadeToScene(cb = null) {
    this.Toggle(false, cb);
  }

  FadeToBlackAndBack(cbBlack = null, cbScene = null) {
    this.Toggle(true, () => {
      cbBlack?.();
      this.Toggle(false, cbScene);
    });
  }

  Toggle(active, callback, instant = false) {
    this.onStartTransition.Raise();
    const targetAlpha = active ? 1 : 0;
    this.isTransitioning = true;
    if (instant) {
      this.canvasGroup.alpha = targetAlpha;
      this.canvas.enabled = active;
      if (!active) this.worldTransitionGO?.SetActive(false);
      this.isTransitioning = false;
      return;
    }
    this.canvas.enabled = true;
    this.transitionTween?.Kill();
    this.transitionTween = this.canvasGroup
      .DOFade(targetAlpha, this.fadeDuration)
      .SetEase(this.fadeEase || Ease.OutQuad)
      .OnComplete(() => {
        if (this.canLoadTargetWorld || !this.WorldTransitionActive) {
          if (callback) this.StartCoroutine(this.DelayedCallback(callback, this.WorldTransitionActive && active));
          else this.onEndTransition.Raise();
        }
        if (targetAlpha === 0) {
          this.canvas.enabled = active;
          this.worldTransitionGO?.SetActive(false);
        } else if (this.WorldTransitionActive && active) {
          this.worldTransition?.SwapToWorld(this.targetWorldID, () => this.UpdateTargetWorldStatus());
        }
        this.transitionTween = null;
        this.isTransitioning = false;
      });
  }

  HandleInTransition(actionWhenDone) {
    if (this.isTransitioning) {
      const once = () => {
        this.onEndTransition.RemoveListener(once);
        actionWhenDone?.();
      };
      this.onEndTransition.AddListener(once);
    } else actionWhenDone?.();
  }

  SetWorldNavigationState(active, initWorldID = -1, targetWorldID = -1) {
    if (active) {
      this.canLoadTargetWorld = WorldManager.Instance.IsWorldUnlocked(targetWorldID);
      this.targetWorldID = targetWorldID;
    }
    this.worldTransitionGO?.SetActive(active);
    if (active) this.worldTransition?.Initialize(initWorldID);
  }

  UpdateTargetWorldStatus() {
    const vs = SettingsContainer.Instance.WorldSettings[this.targetWorldID]?.visualSettings;
    if (this.lockedWorldImage && vs) this.lockedWorldImage.sprite = vs.worldTransitionBackground;
    this.lockedWorld?.SetActive(!this.canLoadTargetWorld);
    if (!this.canLoadTargetWorld) this.starsRequiredWorld?.Initialize(RankTrack.Instance.GetRankForWorldUnlock(this.targetWorldID));
    const soon = WorldManager.Instance.IsWorldComingSoon(this.targetWorldID);
    this.starsRequiredWorld?.gameObject.SetActive(!soon);
    this.comingSoonObject?.SetActive(soon);
  }

  *DelayedCallback(callback, worldWait) {
    if (worldWait) yield new WaitForSeconds(this.worldTransitionWait);
    else yield null;
    callback?.();
    this.onEndTransition.Raise();
  }
}

export class UI_WorldTransitionIndicator extends MonoBehaviour {
  static typeName = 'UI_WorldTransitionIndicator';

  constructor() {
    super();
    this.worldID = -1;
    this.didInit = false;
  }

  Initialize(worldID) {
    if (!this.didInit) {
      this.ChangeWorld(worldID);
      this.didInit = true;
    }
  }

  SwapToWorld(next, cb) {
    if (this._co) this.StopCoroutine(this._co);
    this.ChangeWorld(next);
    this._co = this.StartCoroutine(this.WorldButtonSwap(cb));
  }

  ChangeWorld(next) {
    const prev = this.worldID;
    this.worldID = next;
    const ws = SettingsContainer.Instance.WorldSettings;
    if (this.worldImage) this.worldImage.sprite = ws[Math.max(prev, 0)].visualSettings.worldSelectIcon;
    if (this.otherWorldImage) this.otherWorldImage.sprite = ws[next].visualSettings.worldSelectIcon;
  }

  *WorldButtonSwap(cb) {
    this.inWorldTransition?.PlayFeedbacks();
    while (this.inWorldTransition?.IsPlaying) yield null;
    cb?.();
    const vs = SettingsContainer.Instance.WorldSettings[this.worldID].visualSettings;
    if (this.coloredRingImg) this.coloredRingImg.color = vs.uiHighlightColor;
    this.worldNumberText?.SetText(this.worldID + 1);
    this.outWorldTransition?.PlayFeedbacks();
    while (this.outWorldTransition?.IsPlaying) yield null;
    this._co = null;
  }
}

export { InputUIBlocker, Coroutines, World };

registerSO(MenuState, 'MenuState');
registerSO(SceneSwitcher, 'SceneSwitcher');
registerComponent(TransitionScreen);
registerComponent(UI_WorldTransitionIndicator);
