// Portal wiring (GMSDK_JS 1.0.1, docs/GMSDK_JS/docs/INTEGRATION.md): the manifest, gameplayStart / gameplayStop
// around real play, the leaderboard (board, the Endless score submit to leaderboard-highscore, the main menu's
// button) and the version + copyright line of the Settings popup. Ads: src/ads.js; tracking: src/analytics/.
import { copyrightText } from './sdk/copyright.js';
import { t } from './sdk/i18n.js';
import { createLeaderboard } from './sdk/leaderboard/leaderboard.js';
import { openLeaderboard } from './ui2/leaderboard.js';
import { Assets, getPrefabJson } from './engine/assets.js';
import { Instantiate } from './engine/instantiate.js';
import { LoopHooks } from './engine/loop.js';
import { RunMode } from './game/state.js';
import { SceneHost } from './uiscripts/scenes.js';
import { AudioSampleID } from './uiscripts/services.js';
import { UI_PauseMenu } from './uiscripts/settings.js';
import { Analytics } from './analytics/index.js';

export const Portal = {
  sdk: null,
  /** public/game.json */
  manifest: null,
  /** createLeaderboard() of the kit; null when game.json has no leaderboardId */
  board: null,
};

/** at boot, right after game.json: the leaderboard signs in through gmsdkjs in the background */
export function startPortal(sdk, manifest) {
  Portal.sdk = sdk;
  Portal.manifest = manifest;
  Portal.board = manifest.leaderboardId ? createLeaderboard({ sdk, boardId: manifest.leaderboardId }) : null;
}

/** "V<version>" and the copyright line ('' on the portals that show none): the Settings popup's footer */
export function footerText() {
  const version = Portal.manifest ? `V${Portal.manifest.version}` : '';
  return [version, copyrightText(Portal.sdk)].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- runs

/**
 * gameplayStart while the player really plays: a run is going and no pause menu is open (the revive prompt and the
 * end of a run have IsRunning false). Every run ends with one score submit for Endless.
 */
export function trackRuns(runState) {
  let playing = false;
  LoopHooks.beforeUpdate.push(() => {
    const now = !!runState.IsRunning && ![...UI_PauseMenu.Instances].some((m) => m.gameObject.activeInHierarchy);
    if (now === playing) return;
    playing = now;
    if (now) Portal.sdk?.gameplayStart();
    else Portal.sdk?.gameplayStop();
  });
  runState.runFinished.AddListener(() => {
    const score = Math.round(runState.StatTracker?.Score ?? 0);
    // every Endless world goes to the one board; the server keeps the best score per period and refuses 0
    if (runState.Mode?.RunMode === RunMode.Endless && score > 0) Portal.board?.submit(score);
  });
}

// ---------------------------------------------------------------- menu: leaderboard button

/** the open leaderboard screen of the kit (sdk/leaderboard/ui.js), or null */
let popup = null;

function openBoard() {
  if (popup || !Portal.board) return;
  Analytics.featureOpen('leaderboard', 'home');
  popup = openLeaderboard({ board: Portal.board, t, onClose: () => (popup = null) });
}

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
    openBoard();
  });
  // the Challenges / Claim Bonus overlays fade the High Score display out through its CanvasGroup (MMFeedbacks
  // Transition In/Out); that group is never interactable, so the button copies it instead of sitting under it
  const score = top.Find('ScoreDisplay')?.gameObject;
  const scoreGroup = score?.GetComponent('CanvasGroup');
  const group = go.GetComponent('CanvasGroup');
  return () => {
    // the landscape layout (src/ui2/layout.js) places the button with the Home launchers and shows it itself
    if (group._ui2Owned?.()) return;
    const a = score?.activeInHierarchy ? scoreGroup?.alpha ?? 1 : 0;
    group.alpha = a;
    group.interactable = group.blocksRaycasts = a > 0.5;
  };
}

/** the leaderboard screen is open (src/analytics/ screen tracking) */
export const leaderboardOpen = () => !!popup;

/** the first menu frame is on screen */
export function menuReady() {
  if (!Portal.board) return;
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
    if (!root) popup?.close();
  });
}
