// Ads through the kit's SDK (docs/GMSDK_JS/docs/INTEGRATION.md §3, §5): the game stands still around every ad, an
// interstitial between runs, and the rewarded videos behind the ad buttons of the Unity build (revive, shop, rank,
// bonus, chests, challenges), which the port used to grant at once.
import { getSDK } from './sdk/gmsdkjs-shim.js';
import { pauseLoop } from './engine/loop.js';
import { AudioService } from './engine/audio.js';
import { LeanTouch } from './engine/input.js';
import { Instantiate } from './engine/instantiate.js';
import { loadPrefabDeep } from './engine/assets.js';
import { Game } from './game/state.js';

/** the values of PaymentResponse, the answer of the Unity build's payment handlers */
export const AdResult = { Failure: 0, Cancelled: 1, Success: 2, NotAvailable: 3 };

const NO_AD_POPUP = 'GameObject/NoAdPopup';

let watching = false;
let runsEnded = 0;

/** onPause / onResume before anything can show an ad: no frame, no sound, no input while it is on screen */
export function initAds(sdk) {
  sdk.onPause(() => {
    pauseLoop(true);
    AudioService.setPaused(true);
    LeanTouch.blocked = true;
    LeanTouch.releaseAll();
  });
  sdk.onResume(() => {
    pauseLoop(false);
    AudioService.setPaused(false);
    LeanTouch.blocked = false;
  });
  // the Unity build's "No ads available" popup, shown when a player asks for a video that is not there
  loadPrefabDeep(NO_AD_POPUP).catch(() => {});
}

export const Ads = {
  /** a rewarded video is ready (and past the SDK's spacing): read it while an ad button is on screen */
  get available() {
    return getSDK().rewardedAvailable();
  },

  /**
   * The rewarded video of `placement` (docs/GMSDK_JS/analytics.json ad_placements). Call it from the button's click,
   * with nothing awaited before. Resolves an AdResult: Success only when the video was watched to the end.
   */
  rewarded(placement) {
    if (watching) return Promise.resolve(AdResult.Cancelled);
    if (!this.available) return Promise.resolve(AdResult.NotAvailable);
    watching = true;
    return getSDK()
      .rewarded(placement)
      .then((ok) => (ok ? AdResult.Success : AdResult.Cancelled))
      .finally(() => {
        watching = false;
      });
  },

  /** rewarded(), then `onWatched` on Success, the "No ads available" popup when there was none to show */
  watch(placement, onWatched, from) {
    return this.rewarded(placement).then((r) => {
      if (r === AdResult.Success) onWatched();
      else if (r === AdResult.NotAvailable) this.showNoAd(from);
      return r;
    });
  },

  /** the "No ads available" popup over the canvas of `from` (a component), or over the HUD */
  showNoAd(from) {
    const parent = from?.transform?.root ?? Game.manager?.hud?.transform;
    if (!parent) return null;
    try {
      return Instantiate(NO_AD_POPUP, parent, false);
    } catch {
      return null;
    }
  },

  /**
   * A run is over and the menu comes next: the interstitial of that natural break. Never after the first run of a
   * session (the player is still discovering the game) nor during the first-run tutorial; the SDK keeps the time gap.
   */
  runEnded(tutorial) {
    runsEnded++;
    if (tutorial || runsEnded < 2) return;
    getSDK().interstitial('run_end');
  },
};
