// Boot + scene flow. The UI is the original uGUI canvases (Menu.unity / MainGame HUD / Core) rendered by
// src/ugui and driven by the ported scripts in src/uiscripts; scene switches follow SceneSwitcher.
import './style.css';
import * as THREE from 'three';
import { Time, Coroutines } from './engine/core.js';
import { loadCore, Assets, loadPrefabDeep } from './engine/assets.js';
import { registerComponent, getRuntimeSO, Instantiate } from './engine/instantiate.js';
import { Physics2D, Rigidbody2D, BoxCollider2D, CircleCollider2D, PolygonCollider2D, EdgeCollider2D, CapsuleCollider2D, WheelJoint2D } from './engine/physics2d.js';
import { Render, MeshFilter, MeshRenderer, SkinnedMeshRenderer, SpriteRenderer, Light } from './engine/render.js';
import { ParticleSystem, ParticleSystemRenderer, MMAutoDestroyParticleSystem } from './engine/particles.js';
import { AudioService } from './engine/audio.js';
import { LeanTouch } from './engine/input.js';
import { startLoop, LoopHooks } from './engine/loop.js';
import './game/state.js';
import './game/mmfeedbacks.js';
import './game/player.js';
import './game/world.js';
import './game/camera.js';
import { Game } from './game/state.js';
import { applySettings } from './game/settings.js';
import { EndlessMode, TimedLevelMode, prepareMode, startMode, leaveGame } from './game/game.js';
import { initMeta } from './meta/index.js';
import { Save } from './meta/save.js';
import { Tutorials, TutorialState } from './meta/tutorials.js';
import * as MetaDebug from './meta/debug.js';
import * as UGUI from './ugui/index.js';
import { UISprites, initUGUI } from './ugui/index.js';
import './uiscripts/index.js';
import { SceneHost, TransitionScreen, getSceneSwitcher, EndlessModeID, TimedLevelModeID } from './uiscripts/scenes.js';
import { UIState, WorldManager } from './uiscripts/services.js';
import { noticeOk, halt } from './notice.js';
import { showLoading, hideLoading } from './loading.js';
import { initI18n, t } from './sdk/i18n.js';
import { startPortal, trackRuns, menuReady } from './portal.js';

for (const cls of [Rigidbody2D, BoxCollider2D, CircleCollider2D, PolygonCollider2D, EdgeCollider2D, CapsuleCollider2D, WheelJoint2D, MeshFilter, MeshRenderer, SkinnedMeshRenderer, SpriteRenderer, Light, ParticleSystem, ParticleSystemRenderer, MMAutoDestroyParticleSystem]) {
  registerComponent(cls, cls.typeName);
}

// ---------------------------------------------------------------- loading screen (GM Loader in index.html, until the first scene is up)

const boot = {
  progress: showLoading,
  /** the kit's load error: the English fallback covers a failed Language/en.json */
  error() {
    const el = document.getElementById('gmLoader');
    const text = document.getElementById('load-text');
    if (!el || !text) return;
    el.hidden = false;
    el.classList.add('gmIsLoading');
    el.classList.remove('gmAlmost');
    text.textContent = '';
    const msg = document.createElement('div');
    const lf = t('load_failed');
    msg.textContent = lf === 'load_failed' ? "Couldn't load the game. Please check your internet connection and try again." : lf;
    const btn = document.createElement('button');
    btn.textContent = t('try_again') === 'try_again' ? 'Try again' : t('try_again');
    btn.onclick = () => location.reload();
    text.append(msg, btn);
  },
  hide: hideLoading,
};

// ---------------------------------------------------------------- scene host

let loadingGame = null;

SceneHost.createEndless = (w) => new EndlessMode(w);
SceneHost.createLevel = (level) => new TimedLevelMode(level);
SceneHost.activeMode = () => (Game.manager ? Game.manager.RunState.Mode : null);
SceneHost.leaveGame = () => leaveGame();
SceneHost.loadGame = async (mode) => {
  const run = (async () => {
    await prepareMode(mode, (p) => boot.progress(0.8 + p * 0.2));
    Time.timeScale = 1;
    startMode(mode);
    // CameraRig.OnSceneLoaded: the Menu Cam has priority while the menu scene is up
    const menuUp = !!SceneHost.menuRoot || getSceneSwitcher().menuStateSO.requestedScene === 'Menu';
    Game.cameraRig?.SetStaticView(menuUp ? 'menu' : null, 0);
  })();
  loadingGame = run;
  await run;
  if (loadingGame === run) loadingGame = null;
};
SceneHost.startRun = () => {
  // CameraRig.GoToGameplayCamera (runStarted): blend from the menu camera
  Game.cameraRig?.SetStaticView(null, 0.8);
  Game.manager?.StartRun();
};

// GameManager.HandleGameOver: the first-run tutorial reloads the game scene, everything else returns to the menu
Game.onEndlessOver = (mode) => {
  UIState.lastRunNewBest = !!mode?.newBest;
  UIState.lastRunWorld = mode?.world ?? -1;
  const ss = getSceneSwitcher();
  if (Tutorials.FirstRun.State === TutorialState.Started) ss.ReloadGameScene();
  else ss.ReturnToMainMenu();
};
Game.onLevelOver = () => getSceneSwitcher().ReturnToMainMenu();

async function main() {
  // docs/BUILD_RULES.md section 1: the copyright line is locked by its hash
  if (!noticeOk()) {
    halt();
    return;
  }
  // GMGameSDK + analytics + leaderboard sign-in run while the assets load
  const sdkReady = startPortal();
  const canvas = document.getElementById('game');
  try {
    await initI18n();
    await loadCore((p) => boot.progress(p * 0.5));
    await UISprites.load();
  } catch (e) {
    console.error(`Failed to load assets: ${e.message}. Run "npm run export-assets" first.`);
    boot.error();
    throw e;
  }
  boot.progress(0.6);
  Physics2D.init(Assets.manifest.physics2d);
  Time.fixedDeltaTime = Assets.manifest.physics2d.fixedTimestep || 0.011;
  Render.init(canvas);
  AudioService.init();
  LeanTouch.init(canvas);
  initUGUI(canvas);
  const runState = getRuntimeSO('MonoBehaviour/Run State');
  await initMeta(runState);
  trackRuns(runState);
  applySettings(Save.data.settings);
  LoopHooks.beforeUpdate.push(() => Tutorials.Update());

  // Core: Transition Screen + TutorialUtility (DontDestroyOnLoad)
  await loadPrefabDeep(Assets.manifest.ui.core);
  const core = Instantiate(Assets.manifest.ui.core);
  for (const r of core._sceneRoots || [core]) {
    r._persistent = true;
    for (const c of r.GetComponentsInChildren('TransitionScreen', true)) c.Initialize();
    for (const c of r.GetComponentsInChildren('TutorialUtility', true)) c.Initialize?.();
  }
  TransitionScreen.Instance?.Toggle(true, null, true);

  startLoop();
  Object.assign(window, { __game: Game, __phys: Physics2D, __time: Time, __render: Render, __THREE: THREE, __save: Save, __meta: MetaDebug, __ugui: UGUI, __scenes: SceneHost });
  window.__app = {
    get state() {
      if (Game.manager?.RunState?.IsRunning) return 'running';
      return SceneHost.menuRoot ? 'menu' : 'game';
    },
    get loading() {
      return !!loadingGame || getSceneSwitcher().menuStateSO.isSceneTransitioning;
    },
    // debug / headless-test entry points (tools/smoke.mjs, tools/debug.mjs)
    get menuWorld() {
      return WorldManager.Instance.CurrentWorldIndex;
    },
    playEndless(world = this.menuWorld) {
      getSceneSwitcher().StartMode(new EndlessModeID(world));
    },
    playLevel(id) {
      getSceneSwitcher().StartMode(new TimedLevelModeID(id));
    },
  };
  // SceneSwitcher.LoadAppStart (Menu + MainGame, or straight into the first-run tutorial)
  Coroutines.start(getSceneSwitcher().LoadAppStart(), null);
  const hideBoot = () => {
    if (Game.manager && !getSceneSwitcher().menuStateSO.isSceneTransitioning) {
      boot.hide();
      menuReady(sdkReady);
    } else requestAnimationFrame(hideBoot);
  };
  hideBoot();
}

main();
