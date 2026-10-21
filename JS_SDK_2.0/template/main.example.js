// Entry module example (<webDir>/src/main.js). tools/build.mjs bundles it into framework.js.
// The order matters: copyright check -> SDK/analytics (in parallel) -> language -> game -> hide loading -> loaded_game.
import { analytics, startAnalytics } from './sdk/analytics.js';
import { initI18n, t } from './sdk/i18n.js';
import { gameData } from './sdk/storage.js';
import { NOTICE, APP_VERSION, noticeOk, halt } from './notice.js';
import { showLoading, hideLoading } from './loading.js';

function showLoadError(e) {
  console.error('[boot]', e);
  const el = document.getElementById('gmLoader'), text = document.getElementById('load-text');
  if (!el || !text) return;
  el.hidden = false; el.classList.add('gmIsLoading'); el.classList.remove('gmAlmost');
  text.textContent = '';
  const msg = document.createElement('div');
  const lf = t('load_failed');
  msg.textContent = lf === 'load_failed' ? "Couldn't load the game. Please check your internet connection and try again." : lf;
  const btn = document.createElement('button');
  btn.textContent = t('try_again') === 'try_again' ? 'Try again' : t('try_again');
  btn.onclick = () => location.reload();
  text.append(msg, btn);
}

async function start() {
  if (!noticeOk()) { halt(); return; }                     // docs/BUILD_RULES.md section 1
  const sdkReady = startAnalytics().catch(() => null);     // must finish before the first event
  try {
    await initI18n();                                      // Language/en.json + the player's / default language
    // TODO: load your assets here (sdk/net.js: loadImage, loadJSON) and call showLoading(done / total) as each lands
    showLoading(1);

    // TODO: build your game. The copyright line must be shown to the player (version bottom-left, notice
    // bottom-right of the Settings panel). This placeholder footer stands in until you have a Settings panel.
    const stage = document.getElementById('stage');
    stage.insertAdjacentHTML('beforeend',
      `<div style="position:fixed;left:12px;right:12px;bottom:8px;display:flex;justify-content:space-between;`
      + `font:600 11px sans-serif;color:#fff;opacity:.5"><span>${APP_VERSION}</span><span>${NOTICE}</span></div>`);
    gameData.patch('settings', { lastRun: Date.now() });   // all saves go through sdk/storage.js
  } catch (e) {
    showLoadError(e);
    return;
  }
  await new Promise((r) => requestAnimationFrame(r));      // the first frame is drawn in this tick
  hideLoading();
  const loadTimeMs = Math.round(performance.now() - (window.GM_LOAD_START ?? 0));
  await sdkReady;
  analytics.log('loaded_game', { load_time_ms: loadTimeMs });
}

start();
