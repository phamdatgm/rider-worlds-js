// The game's only door to gmsdkjs (docs/API.md). Plain JS, no build step: copy to src/sdk/ with storage.js.
//
//   async function boot() { const sdk = await loadSDK({ gameCode: 'g131' }); … }   // waits for loader.js (docs/LOADING.md)
//   (no top-level await: the export package is an iife)
//   sdk.interstitial('level_end'); sdk.storage.patch('profile', { best });
//
// - Every call goes to window.GMSDKJS, looked up at call time; a missing function, a throw or a rejected promise
//   falls back to a safe answer (no ad, nothing tracked), so the game never breaks on the SDK.
// - sdk.storage is the game's own save (sdk/storage.js): one key azgames.<gameCode>, compressed and scrambled.
//   gmsdkjs keeps its own key; nothing of the game's save goes through it.
// - Without gmsdkjs (only the dev page gets that far, loader.js stops elsewhere) the game runs with no ads.

import { createStorage } from './storage.js';

export const METHODS = [
  'ready',
  'loadingProgress',
  'loadingDone',
  'preroll',
  'gameplayStart',
  'gameplayStop',
  'interstitial',
  'rewardedAvailable',
  'rewarded',
  'onPause',
  'onResume',
  'track',
  'moreGamesUrl',
  'happyTime',
  'setMuted',
];

/** More Games on the dev page (platform 'dev'), where the server gives none: the button shows and can be checked. */
export const DEV_MORE_GAMES = 'https://azgames.io';

const noop = () => {};
const no = async () => false;

function attempt(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** The page's gameCode (GMSDKJS_OPTIONS) wins over the one the game passes: the build tool writes the real one there. */
function gameCodeOf(g, given) {
  const code = attempt(() => g.GMSDKJS_OPTIONS?.gameCode, undefined);
  return typeof code === 'string' && /^g\d+$/i.test(code.trim()) ? code.trim() : given;
}

const FALLBACK_INFO = {
  version: 'fallback',
  platform: 'unknown',
  sdkType: 'gm',
  gameId: '',
  adType: 'none',
  licensed: true,
  adblock: false,
  adsTest: false,
  adsInfo: null,
  gameInfo: null,
};

/** No SDK: every call answers safely. */
export function createFallback() {
  return {
    version: 'fallback',
    info: FALLBACK_INFO,
    ready: async () => FALLBACK_INFO,
    loadingProgress: noop,
    loadingDone: noop,
    preroll: no,
    gameplayStart: noop,
    gameplayStop: noop,
    interstitial: no,
    rewardedAvailable: () => false,
    rewarded: no,
    onPause: noop,
    onResume: noop,
    track: noop,
    moreGamesUrl: () => null,
    happyTime: noop,
    setMuted: noop,
    brand: { name: '', logo: '', url: '', loadLogo: async () => null, trademark: () => '' },
  };
}

const cache = new WeakMap();

/** The SDK for this page (one per page). Safe to call any time; calls reach gmsdkjs as soon as it is there. */
export function getSDK({ gameCode = '', g = globalThis } = {}) {
  if (cache.has(g)) return cache.get(g);
  const fallback = createFallback();
  const real = () => {
    const s = attempt(() => g.GMSDKJS, null);
    return s && typeof s === 'object' ? s : null;
  };
  const sdk = {
    get version() {
      const r = real();
      return r && typeof r.version === 'string' ? r.version : fallback.version;
    },
    get info() {
      const r = real();
      return (r && attempt(() => r.info, null)) || fallback.info;
    },
    get brand() {
      const b = attempt(() => real()?.brand, null);
      return b && typeof b.loadLogo === 'function' && typeof b.trademark === 'function' ? b : fallback.brand;
    },
  };
  for (const m of METHODS) {
    sdk[m] = (...args) => {
      const r = real();
      const f = r?.[m];
      if (typeof f !== 'function') return fallback[m](...args);
      try {
        const out = f.apply(r, args);
        return out && typeof out.then === 'function' ? Promise.resolve(out).catch(() => fallback[m](...args)) : out;
      } catch {
        return fallback[m](...args);
      }
    };
  }
  // The game's save: reports go to tracking (save_tampered / save_failed / save_large) through the SDK.
  sdk.storage = createStorage({
    gameCode: gameCodeOf(g, gameCode),
    g,
    onEvent: (kind, info) => sdk.track(`save_${kind}`, { chars: info.chars ?? null, error: info.error ?? null }),
  });
  if (attempt(() => g.GMSDKJS_OPTIONS?.platform, '') === 'dev') {
    // Dev page only: the save in the console (gmSave.dump()), since DevTools shows it scrambled on purpose.
    attempt(() => (g.gmSave = sdk.storage));
    // Dev page only: the server gives no More Games link on localhost, so the button would never show and its place
    // could not be checked. Here it always has one (the server's when it gives one, else DEV_MORE_GAMES).
    const serverMoreGames = sdk.moreGamesUrl;
    sdk.moreGamesUrl = () => serverMoreGames() || DEV_MORE_GAMES;
  }
  cache.set(g, sdk);
  return sdk;
}

/**
 * Wait for loader.js to have gmsdkjs.js (docs/LOADING.md), then the SDK. Use it once at the top of the entry module:
 * the game's code starts after this. Without loader.js on the page (tests) it answers at once.
 */
export async function loadSDK({ gameCode = '', g = globalThis } = {}) {
  const loader = attempt(() => g.GMLoader, null);
  if (loader && typeof loader.ready === 'function') await loader.ready();
  return getSDK({ gameCode, g });
}
