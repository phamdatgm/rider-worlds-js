// The game's tracking (docs/GMSDK_JS/docs/ANALYTICS.md): the publisher's standard set (§3, same names as the Unity
// games) and the analysis set (§4), sent through sdk.track. Every id lives here; the game calls these functions, never
// sdk.track itself. docs/GMSDK_JS/analytics.json describes what is sent and must change with this file.
//
// The SDK sends loaded_game, start_game, SessionTime, LiveTime and the ad_* events itself: not sent here.
import { getSDK } from '../sdk/gmsdkjs-shim.js';
import { Save } from '../meta/save.js';
import { World } from '../engine/scene.js';
import { LoopHooks } from '../engine/loop.js';
import { Assets } from '../engine/assets.js';
import { DeathReason, EndState, RunMode } from '../game/state.js';

// ---------------------------------------------------------------- ids

/** "VCL_1_DarkRider" -> "vcl_1_dark_rider", "FTUE_FirstRun" -> "ftue_first_run" */
export const snake = (s) =>
  String(s ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const DIFFICULTIES = ['easy', 'moderate', 'difficult'];

const timedId = (l) => `w${(l.world ?? 0) + 1}_${DIFFICULTIES[l.difficulty] ?? l.difficulty}_${l.number}`;
const timedOrder = (l) => (l.world * 10 + l.difficulty) * 100 + l.number;
let timedIndex = null;

/**
 * level / level_index of a run mode (analytics.json levels, tools/gen-analytics.mjs): the Endless worlds endless_w1..3
 * are 1..3, the timed levels w<world>_<difficulty>_<n> follow in world / difficulty / number order
 */
export function levelOf(mode) {
  if (!mode) return { level: '', level_index: 0 };
  const worlds = Assets.manifest?.worlds?.length ?? 3;
  if (mode.RunMode === RunMode.Endless) return { level: `endless_w${(mode.world ?? 0) + 1}`, level_index: (mode.world ?? 0) + 1 };
  if (!timedIndex) {
    const sorted = [...(Assets.manifest?.levels ?? [])].sort((a, b) => timedOrder(a) - timedOrder(b));
    timedIndex = new Map(sorted.map((l, i) => [timedId(l), worlds + i + 1]));
  }
  const level = timedId(mode.level ?? {});
  return { level, level_index: timedIndex.get(level) ?? 0 };
}

/** the "level" of the standard events, as sent by the JS_SDK_2.0 builds: E1..E3 for Endless, the level SO id otherwise */
function standardLevel(mode) {
  if (!mode) return '';
  if (mode.RunMode === RunMode.Endless) return `E${(mode.world ?? 0) + 1}`;
  return String(mode.level?.id ?? mode.RunMode);
}

// by value, not by the enums of src/game/state.js: this module loads inside that module's import cycle
/** RunMode */
const MODES = { 1: 'endless', 2: 'timed_level', 4: 'seeded_endless', 8: 'bonus' };
/** DeathReason (RunCancel / RunReset are the quit / restart results) */
const CAUSES = { 1: 'obstacle', 2: 'out_of_bounds', 3: 'floor_impact', 6: 'tutorial_failure' };

/** soft / hard / bonus / star of src/meta/currency.js */
const CURRENCIES = ['gems', 'rubies', 'bonus_letters', 'rank_stars'];

/** CardType of src/meta/cards.js */
const ITEM_TYPES = { 10000: 'vehicle', 20000: 'color', 30000: 'trail', 31000: 'explosion', 32000: 'landing', 40000: 'booster' };

/** first-session funnel (UX.md §2): new players start straight in the first-run tutorial, the menu comes after it */
export const ONBOARDING = ['first_play', 'first_input', 'tutorial_done', 'menu_shown', 'second_play', 'first_feature', 'first_purchase'];

const scoreBucket = (s) => (s < 100 ? '0-99' : s < 500 ? '100-499' : s < 1000 ? '500-999' : s < 2000 ? '1000-1999' : s < 5000 ? '2000-4999' : s < 10000 ? '5000-9999' : '10000+');
const distanceBucket = (m) => (m < 100 ? '0-99' : m < 250 ? '100-249' : m < 500 ? '250-499' : m < 1000 ? '500-999' : m < 2000 ? '1000-1999' : m < 5000 ? '2000-4999' : '5000+');
const minutes = (s) => Math.round((s / 60) * 100) / 100;
const day = (ms = Date.now()) => Math.floor(ms / 86400000);

// ---------------------------------------------------------------- state (storage area "analytics")

const AREA = 'analytics';
let sdk = null;
let state = null;
let session = 0;

function save() {
  sdk?.storage.set(AREA, state);
}

/** §4.1, on every event of the analysis set */
function common() {
  return {
    session_index: session,
    days_since_install: state ? day() - state.installDay : 0,
    // the player's rank: the game's progress through its content (worlds, garage, shop unlock with it)
    progress: Save.data?.rank?.currentRank ?? 0,
  };
}

function send(name, params) {
  sdk?.track(name, { ...params, ...common() });
}

/** the standard set (§3): its own parameters only, as the Unity games send them */
function sendStandard(name, params) {
  sdk?.track(name, params);
}

// ---------------------------------------------------------------- screens

/** the active screen, polled: topmost first (popups over pages, the challenges overlay opens by itself on the Home
 * page when a challenge starts); the menu page from MainMenuManager */
const SCREEN_OF = [
  ['UI_NoAdPopup', 'no_ad'],
  ['UI_Revive', 'revive'],
  ['PlayerRankUpPopupUI', 'rank_up'],
  ['UI_LootboxOpenAnimation', 'chest_open'],
  ['UI_RewardTrack', 'reward_track'],
  ['UI_ChallengeOverlay', 'challenges'],
  ['UI_TimedLevelMenu', 'levels'],
  ['UI_WorldStatsMenu', 'world_stats'],
  ['UI_ClaimBonusOverlay', 'bonus_claim'],
];
const PAGES = ['home', 'shop', 'garage', 'settings', 'placeholder'];
/** screen -> feature (feature_open) */
const FEATURE_OF = { shop: 'shop', garage: 'garage', levels: 'levels', challenges: 'challenges', reward_track: 'reward_track', world_stats: 'world_stats', bonus_claim: 'bonus', chest_open: 'chests', leaderboard: 'leaderboard' };

let hooks = { runState: null, menuPage: () => -1, menuUp: () => false, leaderboardOpen: () => false, unlocks: {} };
let screen = 'loading';
let lastPoll = 0;

function isOpen(b) {
  if (!b._isActiveAndEnabled) return false;
  const open = b.IsOpen ?? b.constructor.IsOpen;
  return open === undefined ? true : !!open;
}

function currentScreen() {
  // the leaderboard is a DOM overlay above the whole canvas
  if (hooks.leaderboardOpen()) return 'leaderboard';
  const rs = hooks.runState;
  const found = new Set();
  for (const b of World.behaviours) {
    const name = b.constructor.typeName;
    if (name && SCREEN_OF.some(([t]) => t === name) && isOpen(b)) found.add(name);
    if (name === 'UI_PauseMenu' && b.gameObject.activeInHierarchy) found.add(rs?.IsInRun ? 'pause' : 'settings');
  }
  for (const [t, s] of SCREEN_OF) if (found.has(t)) return s;
  if (found.has('pause')) return 'pause';
  if (found.has('settings')) return 'settings';
  if (rs?.IsInRun) return 'game';
  if (hooks.menuUp()) return PAGES[hooks.menuPage()] ?? 'home';
  return screen;
}

function pollScreen() {
  const now = performance.now();
  if (now - lastPoll < 250) return;
  lastPoll = now;
  const next = currentScreen();
  if (next !== screen) {
    const from = screen;
    screen = next;
    Analytics.screenView(next, from);
  }
  if (now - (pollScreen.unlockAt ?? 0) > 1000) {
    pollScreen.unlockAt = now;
    checkUnlocks(false);
  }
}

function checkUnlocks(silent) {
  if (!Save.data?.rank) return;
  for (const [feature, test] of Object.entries(hooks.unlocks)) {
    if (state.unlocked.includes(feature)) continue;
    let ok = false;
    try {
      ok = !!test();
    } catch {
      ok = false;
    }
    if (!ok) continue;
    state.unlocked.push(feature);
    save();
    if (!silent) send('feature_unlock', { feature });
  }
}

// ---------------------------------------------------------------- runs

let runIndex = 0;
let run = null;

function startRun(rs) {
  runIndex++;
  const mode = rs.Mode;
  const { level, level_index } = levelOf(mode);
  const attempt = (state.attempts[level] = (state.attempts[level] ?? 0) + 1);
  save();
  run = { level, level_index, attempt, mode: MODES[mode?.RunMode] ?? '', startedAt: performance.now(), items: new Map() };
  sendStandard('PlayGame', { GameCount: runIndex });
  send('level_start', { level, level_index, attempt, mode: run.mode });
  Analytics.onboarding(state.runs === 0 ? 'first_play' : 'second_play');
}

function endRun(rs) {
  if (!run) return;
  const mode = rs.Mode;
  const end = rs.RunEndState;
  const st = rs.StatTracker;
  const reason = end.deathReason;
  const seconds = (performance.now() - run.startedAt) / 1000;
  const score = Math.round(st?.Score ?? 0);
  const time = minutes(seconds);
  const lvl = standardLevel(mode);
  let result = 'lose';
  if (reason === DeathReason.RunCancel) result = 'quit';
  else if (reason === DeathReason.RunReset) result = 'restart';
  else if (end.endState === EndState.Victory) result = 'win';
  if (result === 'quit') sendStandard('QuitTime', { level: lvl, time });
  else if (result === 'restart') sendStandard('RestartTime', { level: lvl, time });
  else if (result === 'win') {
    sendStandard('CompleteGame', { Score: score });
    sendStandard('CompleteTime', { level: lvl, time });
  } else {
    sendStandard('EndGame', { Score: score });
    sendStandard('DeathTime', { level: lvl, time });
  }
  const distance = Math.round(st?.DistanceRaw ?? 0);
  send('level_end', {
    level: run.level,
    level_index: run.level_index,
    attempt: run.attempt,
    mode: run.mode,
    result,
    duration_s: Math.round(seconds * 10) / 10,
    distance_bucket: distanceBucket(distance),
    distance_m: distance,
    score,
    score_bucket: scoreBucket(score),
    cause: result === 'lose' ? CAUSES[reason] ?? 'other' : null,
    revived: (st?.RevivesClaimed ?? 0) > 0,
    stars: mode?.RunMode === RunMode.TimedLevel && result === 'win' ? mode.earned ?? null : null,
  });
  for (const [item, v] of run.items) send('item_use', { item_type: v.type, item, level: run.level, count: v.count });
  state.runs++;
  save();
  if (state.runs === 1) Analytics.onboarding('first_end');
  run = null;
}

// ---------------------------------------------------------------- API

export const Analytics = {
  /** at boot, after loadSDK (sdk.storage is the kit's save) */
  init(theSdk, { convertedSave = null } = {}) {
    sdk = theSdk;
    const stored = sdk.storage.get(AREA, null);
    state = { sessions: 0, installDay: day(), runs: 0, onboarding: [], opened: [], unlocked: [], attempts: {}, seeded: false, ...(stored ?? {}) };
    state.sessions++;
    session = state.sessions;
    save();
    if (convertedSave) send('save_converted', { from: convertedSave });
    addEventListener('error', (e) => this.error('window', e?.message ?? ''));
    addEventListener('unhandledrejection', (e) => this.error('promise', e?.reason?.message ?? String(e?.reason ?? '')));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      send('app_hidden', { screen, level: run?.level ?? null, playing: !!hooks.runState?.IsRunning });
    });
  },

  /**
   * After the save and the scenes are up: run tracking, screen polling and the unlock tests of the features.
   * @param {object} o
   * @param {object} o.runState      MonoBehaviour/Run State
   * @param {() => number} o.menuPage   MainMenuManager's page index (-1 without menu)
   * @param {() => boolean} o.menuUp     the menu scene is up
   * @param {() => boolean} o.leaderboardOpen
   * @param {Record<string, () => boolean>} o.unlocks  feature -> unlocked now
   */
  attach(o) {
    hooks = { ...hooks, ...o };
    const rs = o.runState;
    rs.runStarted.AddListener(() => startRun(rs));
    rs.runFinished.AddListener(() => endRun(rs));
    rs.playerFirstAccelerate?.AddListener(() => this.onboarding('first_input'));
    rs.revivePrompted.AddListener(() => {
      if (!run) return;
      const st = rs.StatTracker;
      send('death', { level: run.level, cause: CAUSES[rs.RunEndState.deathReason] ?? 'other', distance_bucket: distanceBucket(st?.DistanceRaw ?? 0), revives_claimed: st?.RevivesClaimed ?? 0 });
    });
    // players of older builds: what is unlocked already is not news
    if (!state.seeded) {
      checkUnlocks(session > 1 || (Save.data?.runs?.total ?? 0) > 0);
      state.seeded = true;
      save();
    }
    LoopHooks.beforeUpdate.push(pollScreen);
  },

  /** §4.2, once per page load, once the menu is up */
  sessionStart() {
    send('session_start', { first_session: session === 1 });
  },

  screenView(name, from) {
    send('screen_view', { screen: name, from });
    if (name === 'home' || PAGES.includes(name)) this.onboarding('menu_shown');
    const feature = FEATURE_OF[name];
    if (feature) this.featureOpen(feature, from);
  },

  /** §4.3: each step once in the player's life */
  onboarding(stepName) {
    if (!state || state.onboarding.includes(stepName)) return;
    const step = ONBOARDING.indexOf(stepName) + 1;
    if (!step) return;
    state.onboarding.push(stepName);
    save();
    send('onboarding_step', { step, step_name: stepName });
  },

  /** action: shown | done | skipped */
  tutorialStep(tutorial, step, stepName, action) {
    send('tutorial_step', { tutorial: snake(tutorial), step, step_name: snake(stepName), action });
    if (action !== 'shown' && snake(tutorial) === 'ftue_first_run' && stepName === 'end') this.onboarding('tutorial_done');
  },

  /** §4.5: a Currency.Gain / Spend of src/meta/currency.js (type = CurrencyType) */
  currency(type, delta, source) {
    const currency = CURRENCIES[type] ?? String(type);
    const where = snake(source) || 'unknown';
    if (delta > 0) send('currency_earn', { currency, amount: delta, source: where });
    else if (delta < 0) {
      send('currency_spend', { currency, amount: -delta, sink: where });
      this.onboarding('first_purchase');
    }
  },

  /** a card of src/meta/cards.js added (item_get), method: buy | reward | unlock | gift */
  itemGet(card, count, source) {
    const itemType = ITEM_TYPES[card.Type];
    if (!itemType || count <= 0) return;
    const buy = ['shop', 'daily_deals', 'chests'].includes(snake(source));
    send('item_get', { item_type: itemType, item: snake(card.def.name), method: buy ? 'buy' : 'reward', count, source: snake(source) || 'unknown' });
  },

  itemEquip(card) {
    const itemType = ITEM_TYPES[card.Type];
    if (itemType) send('item_equip', { item_type: itemType, item: snake(card.def.name) });
  },

  /** a booster consumed: summed up, sent with level_end */
  itemUse(card) {
    const item = snake(card.def.name);
    if (!run) {
      send('item_use', { item_type: ITEM_TYPES[card.Type] ?? 'booster', item, level: null, count: 1 });
      return;
    }
    const v = run.items.get(item) ?? { type: ITEM_TYPES[card.Type] ?? 'booster', count: 0 };
    v.count++;
    run.items.set(item, v);
  },

  /** §4.6 */
  featureOpen(feature, from) {
    const first = !state.opened.includes(feature);
    if (first) {
      state.opened.push(feature);
      save();
    }
    send('feature_open', { feature, from: from ?? screen, first });
    this.onboarding('first_feature');
  },

  featureAction(feature, action, item = null) {
    send('feature_action', { feature, action, item: item === null ? null : snake(item) });
  },

  /** §4.7: a rewarded-ad button appears (once each time it shows) */
  adOffer(placement) {
    send('ad_offer', { placement, level: run?.level ?? null });
  },

  settingChange(setting, value) {
    send('setting_change', { setting, value: String(value) });
  },

  error(where, message) {
    send('error', { where, message: String(message).slice(0, 100) });
  },

  loadError(file, tries = 3) {
    send('load_error', { file: String(file).slice(0, 100), tries });
  },
};
