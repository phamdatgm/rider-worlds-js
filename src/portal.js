// Portal SDK wiring (JS_SDK_2.0 + JS_Leaderboard), the only place the game talks to them: SDK start-up, the
// publisher's standard analytics events (JS_SDK_2.0/docs/ANALYTICS.md section 4), the Endless score submit to
// leaderboard-highscore and the leaderboard button of the main menu.
import { analytics, startAnalytics, scoreBucket } from './sdk/analytics.js';
import { startGmSdk, getProfile, updateProfile } from './sdk/gmsdk.js';
import { connectSdk, connectProfile, setAnalytics, leaderboard } from './leaderboard/src/leaderboard.js';
import { LeaderboardPopup } from './leaderboard/ui/leaderboardPopup.js';
import { Time } from './engine/core.js';
import { Assets, getPrefabJson } from './engine/assets.js';
import { Instantiate } from './engine/instantiate.js';
import { LoopHooks } from './engine/loop.js';
import { RunMode, EndState, DeathReason } from './game/state.js';
import { SceneHost } from './uiscripts/scenes.js';
import { AudioSampleID } from './uiscripts/services.js';

let sdkReady = null;

/** at boot, before the first event: GMGameSDK load + init + anonymous sign-in; the leaderboard borrows it */
export function startPortal() {
  connectSdk(startGmSdk);
  connectProfile({ getProfile, updateProfile });
  setAnalytics((name, params) => analytics.log(name, params));
  sdkReady = startAnalytics().catch(() => null);
  addEventListener('error', (e) => analytics.log('error', { where: 'window', message: e?.message ?? '' }));
  addEventListener('unhandledrejection', (e) => analytics.log('error', { where: 'promise', message: e?.reason?.message ?? String(e?.reason) }));
  return sdkReady;
}

// ---------------------------------------------------------------- runs

const minutes = (s) => Math.round((s / 60) * 100) / 100;

/** "level" of the standard events: E1..E3 for the Endless worlds, the level id otherwise */
function levelOf(mode) {
  if (!mode) return '';
  if (mode.RunMode === RunMode.Endless) return `E${(mode.world ?? 0) + 1}`;
  return String(mode.level?.id ?? mode.RunMode);
}

let runIndex = 0;
let runStartedAt = 0;
let playSeconds = 0;
let sessionSeconds = 0;

/** PlayGame -> (LiveTime every 30 s) -> EndGame + DeathTime | CompleteGame + CompleteTime | QuitTime | RestartTime */
export function trackRuns(runState) {
  runState.runStarted.AddListener(() => {
    runIndex++;
    runStartedAt = performance.now();
    const mode = runState.Mode;
    analytics.log('PlayGame', { GameCount: runIndex });
    analytics.log('run_start', { run_index: runIndex, level: levelOf(mode) });
  });

  runState.runFinished.AddListener(() => {
    const mode = runState.Mode;
    const level = levelOf(mode);
    const end = runState.RunEndState;
    const score = Math.round(runState.StatTracker?.Score ?? 0);
    const time = minutes((performance.now() - runStartedAt) / 1000);
    const reason = end.deathReason;
    if (reason === DeathReason.RunCancel) analytics.log('QuitTime', { level, time });
    else if (reason === DeathReason.RunReset) analytics.log('RestartTime', { level, time });
    else if (end.endState === EndState.Victory) {
      analytics.log('CompleteGame', { Score: score });
      analytics.log('CompleteTime', { level, time });
    } else {
      analytics.log('EndGame', { Score: score });
      analytics.log('DeathTime', { level, time });
    }
    analytics.log('run_end', {
      level,
      score,
      score_bucket: scoreBucket(score, [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000]),
      cause: Object.keys(DeathReason).find((k) => DeathReason[k] === reason) ?? String(reason),
      duration_s: Math.round((performance.now() - runStartedAt) / 100) / 10,
      run_index: runIndex,
    });
    // every Endless world goes to the one board; the backend keeps the best score per period and refuses 0
    if (mode?.RunMode === RunMode.Endless && score > 0) leaderboard.postScore(score);
  });

  setInterval(() => {
    if (document.hidden) return;
    if (++sessionSeconds % 30 === 0) analytics.log('SessionTime', { Time: minutes(sessionSeconds) });
    if (runState.IsRunning && Time.timeScale > 0 && ++playSeconds % 30 === 0) {
      analytics.log('LiveTime', { level: levelOf(runState.Mode), time: minutes(playSeconds) });
    }
  }, 1000);
}

// ---------------------------------------------------------------- menu: loaded_game + leaderboard button

let popup = null;

const BUTTON_PREFAB = 'Runtime/LeaderboardButton';
const TOP_CONTAINER = 'UI Container/BodyContainer/PageContainer/Home Screen/TopContainer';

/**
 * The Home screen's leaderboard button, in the uGUI like the rest of the menu: a copy of the world arrow button's
 * serialized data (WorldNav/Right: S_Button_Main_5 hexagon, colour transition, appear tween) with the S_Icon_Crown
 * icon, on the right of the High Score display. The free spot in both layouts: the bottom corners belong to the
 * Levels / Challenges buttons and the world arrows, and the portrait reference (1080x1920) leaves nothing beside Play.
 */
function buttonPrefab() {
  let json = getPrefabJson(BUTTON_PREFAB);
  if (json) return json;
  const menu = getPrefabJson('Scenes/Menu');
  const nav = menu?.nodes.findIndex((n) => n.n === 'WorldNav');
  const btn = nav >= 0 && menu.nodes.find((n) => n.n === 'Right' && n.p === nav);
  const icon = btn && menu.nodes.find((n) => n.n === 'Arrow' && menu.nodes[n.p] === btn);
  if (!icon) return null;
  const keep = ['CanvasRenderer', 'Image', 'Button', 'DOTweenAnimation'];
  const comps = btn.c.filter((c) => keep.includes(c.$type)).map((c) => {
    if (c.$type === 'Button') return { ...c, m_TargetGraphic: { $c: [0, 1] } };
    if (c.$type === 'DOTweenAnimation') return { ...c, onComplete: { $event: [] }, target: { $t: 0 } };
    return c;
  });
  // driven every frame from the High Score display's CanvasGroup (see addLeaderboardButton)
  comps.push({ $type: 'CanvasGroup', m_Enabled: 1, m_Alpha: 1, m_Interactable: 1, m_BlocksRaycasts: 1, m_IgnoreParentGroups: 0 });
  json = {
    id: BUTTON_PREFAB,
    nodes: [
      {
        ...btn,
        n: 'LeaderboardButton',
        p: undefined,
        // centred on the High Score display (ScoreDisplay), just past the end of its gradient
        rect: { m_AnchorMin: [0.5, 0.5], m_AnchorMax: [0.5, 0.5], m_AnchoredPosition: [255, 0], m_SizeDelta: [135, 130], m_Pivot: [0.5, 0.5] },
        c: comps,
      },
      {
        ...icon,
        n: 'Crown',
        p: 0,
        r: undefined,
        rect: { ...icon.rect, m_AnchoredPosition: [0, 8], m_SizeDelta: [80, 80] },
        c: icon.c.map((c) => (c.$type === 'Image' ? { ...c, m_RaycastTarget: 0, m_Sprite: { ...c.m_Sprite, $sprite: 'Sprite/SA_Icons/S_Icon_Crown' } } : c)),
      },
    ],
  };
  Assets.prefabs.set(BUTTON_PREFAB, json);
  return json;
}

/** @returns the per-frame sync of the button with the High Score display, or null */
function addLeaderboardButton(menuRoot) {
  const main = (menuRoot._sceneRoots || [menuRoot]).find((r) => r.name === 'Main Menu');
  const top = main?.transform.Find(TOP_CONTAINER);
  if (!top || !buttonPrefab()) return null;
  const go = Instantiate(BUTTON_PREFAB, top);
  go.GetComponent('Button').onClick.AddListener(() => {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    popup.show();
  });
  // the Challenges / Claim Bonus overlays fade the High Score display out through its CanvasGroup (MMFeedbacks
  // Transition In/Out); that group is never interactable, so the button copies it instead of sitting under it
  const score = top.Find('ScoreDisplay')?.gameObject;
  const scoreGroup = score?.GetComponent('CanvasGroup');
  const group = go.GetComponent('CanvasGroup');
  return () => {
    const a = score?.activeInHierarchy ? scoreGroup?.alpha ?? 1 : 0;
    group.alpha = a;
    group.interactable = group.blocksRaycasts = a > 0.5;
  };
}

/** the first menu frame is on screen */
export async function menuReady(ready = sdkReady) {
  const loadTimeMs = Math.round(performance.now() - (window.GM_LOAD_START ?? 0));
  popup = new LeaderboardPopup(document.body);
  // the Menu scene is instantiated again every time the player comes back from a run
  let decorated = null;
  let sync = null;
  LoopHooks.beforeUpdate.push(() => {
    const root = SceneHost.menuRoot;
    if (root && root !== decorated) {
      decorated = root;
      sync = addLeaderboardButton(root);
    }
    if (root) sync?.();
    if (!root && popup.isOpen) popup.hide();
  });
  await ready;
  analytics.log('loaded_game', { load_time_ms: loadTimeMs });
}
