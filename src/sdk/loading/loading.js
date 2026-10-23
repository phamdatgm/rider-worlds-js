// The game's handle on the loading screen (docs/LOADING.md). The screen itself is loader.js (loading/loader.js →
// public/loader.js): the page loads it first, it shows the screen and loads gmsdkjs.js and game.js. This module is
// what game.js uses to drive it. Plain JS, no build step: copy to src/sdk/loading/.

/**
 * The loading screen of loader.js, for the game's own loading (after gmsdkjs.js and game.js, which fill the first 30 %):
 *
 *   const loader = createLoader();
 *   ...each loaded asset:   loader.progress(done / total);   // 0..1 → the bar from 30 % to 100 %
 *   ...game.json loaded:    loader.setTitle(manifest.name);
 *   ...menu on screen:      loader.hide();                   // hides the screen, tells the SDK (sdk.loadingDone)
 *   ...load failed:         loader.error();                  // "Connection problem…" + Reload
 *
 * Without loader.js on the page (a test page) every call does nothing.
 */
export function createLoader() {
  let l = null;
  try {
    l = globalThis.GMLoader ?? null;
  } catch {
    l = null;
  }
  if (!l) console.warn('[loading] no loader.js on this page (docs/LOADING.md): the loading screen is off');
  return {
    /** fraction 0..1 of the game's own loading. */
    progress(fraction) {
      l?.progress(fraction);
    },
    /** The game's name, once game.json is loaded. */
    setTitle(title) {
      l?.setTitle(title);
    },
    /** Load failed: "Connection problem. Please check your network and reload the page." + Reload. */
    error(text) {
      l?.fail(text);
    },
    /** The first screen of the game is ready: hide the screen and tell the SDK (do not call sdk.loadingDone too). */
    hide() {
      l?.done();
    },
  };
}
