// Boot + scene flow. The UI is the original uGUI canvases (Menu.unity / MainGame HUD / Core) rendered by
// src/ugui and driven by the ported scripts in src/uiscripts; scene switches follow SceneSwitcher.
import './style.css';
import * as THREE from 'three';
import { Time, Coroutines } from './engine/core.js';
import { loadCore, Assets, loadPrefabDeep, AssetEvents } from './engine/assets.js';
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
import { loadSDK } from './sdk/gmsdkjs-shim.js';
import { createLoader } from './sdk/loading/loading.js';
import { initI18n } from './sdk/i18n.js';
import { loadJSON } from './sdk/net.js';
import { convertLegacySave } from './legacy-save.js';
import { initAds, Ads } from './ads.js';
import { Analytics } from './analytics/index.js';
import { startPortal, trackRuns, menuReady, leaderboardOpen } from './portal.js';
import { MainMenuManager } from './uiscripts/home.js';
import { TimedLevelModeController, TimedLevelModeDifficulty } from './uiscripts/services.js';
import { PlayerRank } from './meta/rank.js';
import { Shop } from './meta/shop.js';

for (const cls of [Rigidbody2D, BoxCollider2D, CircleCollider2D, PolygonCollider2D, EdgeCollider2D, CapsuleCollider2D, WheelJoint2D, MeshFilter, MeshRenderer, SkinnedMeshRenderer, SpriteRenderer, Light, ParticleSystem, ParticleSystemRenderer, MMAutoDestroyParticleSystem]) {
  registerComponent(cls, cls.typeName);
}

// ---------------------------------------------------------------- loading screen (loader.js of the kit, until the first scene is up)

/** docs/GMSDK_JS/config.json gameCode: the save key when the page has none (the page's GMSDKJS_OPTIONS wins) */
const GAME_CODE = 'g2610211044';

const loader = createLoader();

// ---------------------------------------------------------------- scene host

let loadingGame = null;

SceneHost.createEndless = (w) => new EndlessMode(w);
SceneHost.createLevel = (level) => new TimedLevelMode(level);
SceneHost.activeMode = () => (Game.manager ? Game.manager.RunState.Mode : null);
SceneHost.leaveGame = () => leaveGame();
SceneHost.loadGame = async (mode) => {
  const run = (async () => {
    await prepareMode(mode, (p) => loader.progress(0.8 + p * 0.2));
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
  const tutorial = Tutorials.FirstRun.State === TutorialState.Started;
  Ads.runEnded(tutorial);
  if (tutorial) ss.ReloadGameScene();
  else ss.ReturnToMainMenu();
};
Game.onLevelOver = () => {
  Ads.runEnded(false);
  getSceneSwitcher().ReturnToMainMenu();
};

/** the platform template's #game element holds the canvas (the dev page has the same) */
function gameCanvas() {
  const host = document.getElementById('game') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'game' }));
  return host.querySelector('canvas') ?? host.appendChild(document.createElement('canvas'));
}

/** docs/GMSDK_JS/docs/INTEGRATION.md §2, in this order */
async function boot() {
  // 1. the SDK (loader.js loads gmsdkjs.js next to this file), then the pause around every ad
  const sdk = await loadSDK({ gameCode: GAME_CODE });
  initAds(sdk);
  // 2. saves of older builds, before anything reads sdk.storage (src/legacy-save.js)
  const converted = convertLegacySave(sdk.storage);
  // 3. the manifest and English: failing, the loading screen offers Reload
  const manifest = await loadJSON('game.json');
  await initI18n({ languages: manifest.languages, defaultLanguage: manifest.defaultLanguage, storage: sdk.storage });
  loader.setTitle(manifest.name);
  Analytics.init(sdk, { convertedSave: converted });
  AssetEvents.loadError = (file) => Analytics.loadError(file);
  startPortal(sdk, manifest);
  const sdkReady = sdk.ready();
  // 4. the game's assets: the bar's last 70 %
  const canvas = gameCanvas();
  await loadCore((p) => loader.progress(p * 0.5));
  await UISprites.load();
  loader.progress(0.6);
  Physics2D.init(Assets.manifest.physics2d);
  Time.fixedDeltaTime = Assets.manifest.physics2d.fixedTimestep || 0.011;
  Render.init(canvas);
  AudioService.init();
  LeanTouch.init(canvas);
  initUGUI(canvas);
  const runState = getRuntimeSO('MonoBehaviour/Run State');
  await initMeta(runState);
  trackRuns(runState);
  Analytics.attach({
    runState,
    menuPage: () => MainMenuManager.Instance?.currentMenu?.index ?? -1,
    menuUp: () => !!SceneHost.menuRoot && !!MainMenuManager.Instance,
    leaderboardOpen,
    // docs/GMSDK_JS/analytics.json features: what opens them (the menu pages: MenuSwitcher.unlockRank)
    unlocks: {
      garage: () => PlayerRank.CurrentRank >= 1,
      shop: () => PlayerRank.CurrentRank >= 2,
      levels: () => TimedLevelModeController.Instance.IsUnlocked(TimedLevelModeDifficulty.Easy),
      bonus: () => PlayerRank.IsBonusUnlocked,
      worlds: () => PlayerRank.IsWorldNavigationUnlocked,
      gifts: () => Shop.IsGiftUnlocked,
    },
  });
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
  // 5. the licence answer and the ad config (5 s at most) by the time the menu is up, then 6. the menu, 7. the preroll
  await sdkReady;
  await new Promise((resolve) => {
    const menuUp = () => (Game.manager && !getSceneSwitcher().menuStateSO.isSceneTransitioning ? resolve() : requestAnimationFrame(menuUp));
    menuUp();
  });
  loader.hide();
  menuReady();
  Analytics.sessionStart();
  await sdk.preroll();
}

boot().catch((e) => {
  console.error('boot failed:', e);
  Analytics.loadError(e?.message ?? 'boot');
  loader.error();
});
