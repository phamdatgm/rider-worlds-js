/**
 * Game data in localStorage: ONE key per game, `azgames.<gameCode>` (e.g. azgames.g598), holding one JSON
 * object split into areas: { v, settings, profile, sdk, ... }. docs/JSGMSDK.md B.3.
 *
 * `gameCode` comes from window.AZ_SETTINGS (index.html). This is the ONLY module that touches
 * localStorage (the build checks it). Every access is guarded: private windows, blocked storage and a
 * full quota must never break the game. Writes are batched (one flush per 300 ms and on pagehide).
 *
 * `legacyKeys` / `legacySdkFields` (config.mjs) list keys of older builds; their data is merged in once, then the old keys are removed.
 */
import { config as cfg } from '../config.mjs';

const CODE = globalThis.AZ_SETTINGS?.gameCode;
if (!/^g\d+$/.test(CODE ?? '')) console.error('[storage] window.AZ_SETTINGS.gameCode is missing or malformed:', CODE);
const KEY = `azgames.${CODE}`;
const SCHEMA = 1;

// Keys of builds made before the azgames.<gameCode> standard, from config.mjs (optional, default: none):
//   legacyKeys:      { 'old.key': 'area' }   the old JSON value becomes that area
//   legacySdkFields: { name: 'old.name' }    single values that go into the `sdk` area
const LEGACY_AREAS = cfg.legacyKeys ?? {};
const LEGACY_SDK_FIELDS = cfg.legacySdkFields ?? {};

let cache = null;
let timer = 0;

function readRaw(k) {
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}

function migrate(d) {
  for (const [oldKey, area] of Object.entries(LEGACY_AREAS)) {
    const v = readRaw(oldKey);
    if (v && typeof v === 'object' && !d[area]) d[area] = v;
  }
  for (const [field, oldKey] of Object.entries(LEGACY_SDK_FIELDS)) {
    const v = readRaw(oldKey);
    if (v !== null && v !== undefined) (d.sdk ??= {})[field] = v;
  }
  return d;
}

function removeLegacy() {
  try {
    for (const k of [...Object.keys(LEGACY_AREAS), ...Object.values(LEGACY_SDK_FIELDS)]) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
}

function load() {
  if (cache) return cache;
  const raw = readRaw(KEY);
  const fresh = !raw || typeof raw !== 'object';
  cache = fresh ? migrate({ v: SCHEMA }) : raw;
  if (fresh && flushNow()) removeLegacy();
  return cache;
}

function flushNow() {
  clearTimeout(timer); timer = 0;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); return true; } catch { return false; }
}

function schedule() {
  if (!timer) timer = setTimeout(flushNow, 300);
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => { if (cache) flushNow(); });
  addEventListener('visibilitychange', () => { if (cache && document.visibilityState === 'hidden') flushNow(); });
}

export const gameData = {
  get(area, fallback = {}) { return { ...fallback, ...(load()[area] ?? {}) }; },
  set(area, value) { load()[area] = value; schedule(); },
  patch(area, part) { this.set(area, { ...(load()[area] ?? {}), ...part }); },
  flush() { if (cache) flushNow(); },
};

/** Player name and flag (SDK area). */
export const store = {
  get playerName() { return gameData.get('sdk').name ?? ''; },
  set playerName(v) { gameData.patch('sdk', { name: v }); },

  get country() { return gameData.get('sdk').country ?? ''; },
  set country(v) { gameData.patch('sdk', { country: v }); },
};
