/*
 * GMSDK JS loader (docs/LOADING.md): the first and only script the page loads. Plain script (no module, ES2017), no
 * build step: copy to public/loader.js; it ships at the root of the package next to game.js.
 *
 *   <script src="loader.js"></script>                                  portal page: loads game.js
 *   <script src="loader.js" data-entry="src/main.js" data-module></script>   dev page (Vite)
 *
 * 1. Shows the loading screen at once (GM Loader v1: icons/loading.webp, logo, name, % bar), in the look of
 *    icons/loader.css: empty for the kit look, the game's CSS for its own look (docs/LOADING.md §1.1).
 * 2. Loads gmsdkjs.js and the game (game.js) side by side, each up to 3 tries (10 s each, 1 s then 2 s apart).
 *    These two files fill the bar to 30 %.
 * 3. gmsdkjs is required: after the 3rd failed try the screen says so and offers Reload; nothing else runs.
 *    Only the dev page (GMSDKJS_OPTIONS.platform 'dev') goes on without it, for working offline.
 * 4. The game takes over through window.GMLoader: await GMLoader.ready() (the SDK), GMLoader.progress(p) while it
 *    loads its assets (30 → 100 %), GMLoader.done() when its first screen is on (hides the screen, tells the SDK).
 *    The game reaches this through sdk/gmsdkjs-shim.js (loadSDK) and loading/loading.js (createLoader).
 *
 * Texts are English and hard-coded on purpose: they show before i18n/ has loaded.
 */
(function () {
  'use strict';
  var g = window;
  if (g.GMLoader) return; // one loader per page

  var SDK_URL = 'https://games.1games.io/lib/1games/gmsdkjs/1.0.1/gmsdkjs.js'; // gmsdkjs 1.0.1, the version this kit is made for (docs/SERVER_NOTES.md)
  var TRIES = 3;
  var TIMEOUT_MS = 10000;
  var WAITS_MS = [1000, 2000];
  var FILES_SHARE = 0.3; // gmsdkjs + game file: the first 30 % of the bar

  var me = document.currentScript;
  var data = (me && me.dataset) || {};
  var entry = data.entry || 'game.js';
  var entryModule = 'module' in data;
  var icons = data.icons || 'icons/';
  var opts = {};
  try {
    opts = g.GMSDKJS_OPTIONS || {};
  } catch (e) {
    opts = {};
  }
  var sdkUrl = typeof opts.sdkUrl === 'string' && opts.sdkUrl ? opts.sdkUrl : SDK_URL;
  var dev = String(opts.platform || '') === 'dev';
  var debug = opts.debug === true;
  var log = function () {
    if (debug) console.log.apply(console, ['[loader]'].concat([].slice.call(arguments)));
  };

  var CSS = `
#gmLoader{--gm-font:"Nunito","Segoe UI",system-ui,-apple-system,Arial,sans-serif;--gm-bg:#0c0d14;--gm-track:#000000;--gm-white:#ffffff;--gm-muted:#8f90a6}
#gmLoader,#gmLoader *,#gmLoader *::before,#gmLoader *::after{box-sizing:border-box}
#gmLoader[hidden]{display:none}
#gmLoader.gmSkinWait>*{visibility:hidden}
#gmLoader{position:fixed;font-family:var(--gm-font);color:var(--gm-white);-webkit-font-smoothing:antialiased;inset:0;z-index:10;overflow:hidden;background:var(--gm-bg);user-select:none;-webkit-user-select:none;--gm-c1:104,66,255;--gm-c2:140,96,255;--gm-c3:176,140,255}
.gmLoaderBackdrop{position:absolute;inset:0;z-index:0;background-position:center;background-size:cover;background-repeat:no-repeat;filter:blur(14px) brightness(.42) saturate(1.05);transform:scale(1.08)}
.gmLoaderBackdrop::after{content:"";position:absolute;inset:0;background:radial-gradient(90% 80% at 50% 45%,rgba(12,13,20,.15),rgba(12,13,20,.55))}
.gmLoaderStage{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center}
.gmLoaderThumb{display:block;height:clamp(80px,20vh,200px);width:auto;max-width:min(80vw,400px);object-fit:cover;border-radius:clamp(6px,1.2vh,10px);box-shadow:0 8px 28px rgba(0,0,0,.45);background:#1a1b26;animation:gmFadeUp .4s ease-out both}
.gmLoaderTitle{margin:clamp(10px,2.6vh,20px) 0 0;max-width:90vw;color:var(--gm-white);font-size:clamp(18px,4.6vh,34px);font-weight:800;line-height:1.2;letter-spacing:-.005em;text-shadow:0 2px 10px rgba(0,0,0,.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;animation:gmFadeUp .4s .05s ease-out both}
.gmLoaderProgress{position:relative;width:min(80vw,1010px);height:clamp(64px,13vh,96px);margin-top:clamp(14px,4.6vh,40px)}
.gmLoaderSpinner{position:absolute;left:50%;top:0;width:clamp(32px,7vh,48px);height:clamp(32px,7vh,48px);margin-left:calc(clamp(32px,7vh,48px) / -2);border-radius:50%;border:4px solid rgba(255,255,255,.18);border-top-color:rgba(255,255,255,.85);border-right-color:rgba(255,255,255,.85);animation:gmSpin .8s linear infinite}
.gmLoaderBar,.gmLoaderInfo{opacity:0;transition:opacity .25s ease}
.gmLoaderBar{width:100%;height:clamp(10px,2vh,14px);border-radius:999px;background:var(--gm-track);overflow:hidden}
#gmLoaderFill{position:relative;width:0;height:100%;border-radius:999px;background:linear-gradient(90deg,rgb(var(--gm-c1)),rgb(var(--gm-c2)) 55%,rgb(var(--gm-c3))) 0 0 / min(80vw,1010px) 100% no-repeat rgb(var(--gm-c1));box-shadow:0 0 12px rgba(var(--gm-c1),.45);transition:width .25s ease;overflow:hidden}
.gmLoaderInfo{margin-top:clamp(10px,2.2vh,16px);font-size:clamp(12px,2.4vh,16px);font-weight:600;line-height:1.2;color:var(--gm-white)}
.gmLoaderInfo b{font-weight:800}
#gmLoader.gmIsLoading .gmLoaderSpinner{display:none}
#gmLoader.gmIsLoading .gmLoaderBar,#gmLoader.gmIsLoading .gmLoaderInfo{opacity:1}
#gmLoader.gmAlmost #gmLoaderFill{width:100% !important}
#gmLoader.gmAlmost #gmLoaderFill::after{content:"";position:absolute;top:0;bottom:0;left:0;width:52%;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.45) 60%,rgba(255,255,255,0));animation:gmAlmost 1.6s ease-in-out infinite}
#gmLoader.gmAlmost .gmLoaderInfo{color:var(--gm-muted);font-weight:800;animation:gmBlink 1.6s ease-in-out infinite}
#gmLoader.gmFailed .gmLoaderInfo{max-width:90vw;white-space:normal;line-height:1.4}
.gmLoaderBrand{position:absolute;z-index:1;right:clamp(10px,2vw,22px);bottom:clamp(8px,1.8vw,18px);opacity:.9;pointer-events:none}
.gmLoaderBrand img{display:block;height:clamp(30px,7.5vh,56px);width:auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.gmLoaderVersion{position:absolute;z-index:1;left:clamp(10px,2vw,22px);bottom:clamp(8px,1.8vw,18px);font:600 11px/1 var(--gm-font);letter-spacing:.06em;color:var(--gm-white);opacity:.4;pointer-events:none}
@media (max-height:420px){.gmLoaderThumb{height:clamp(64px,26vh,120px)}.gmLoaderProgress{height:56px;margin-top:12px}.gmLoaderBrand img{height:28px}}
@keyframes gmSpin{to{transform:rotate(360deg)}}
@keyframes gmFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes gmAlmost{0%{transform:translateX(-105%)}100%{transform:translateX(200%)}}
@keyframes gmBlink{0%,100%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion: reduce){.gmLoaderThumb,.gmLoaderTitle,#gmLoader.gmAlmost .gmLoaderInfo,#gmLoader.gmAlmost #gmLoaderFill::after{animation:none}.gmLoaderSpinner{animation-duration:2.4s}#gmLoaderFill{transition:none}}
.gmLoaderRetry{margin-top:clamp(12px,2.6vh,20px);padding:.7em 1.8em;border:0;border-radius:999px;background:rgb(var(--gm-c1));color:#fff;font:800 clamp(13px,2.4vh,16px)/1 var(--gm-font);cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.gmLoaderRetry[hidden]{display:none}
`;

  /** The template's gmTintFromArt, unchanged: the bar takes up to 3 strong colours of the key art; failure keeps purple. */
  function tintFromArt(img, root) {
    try {
      if (!img.naturalWidth) return;
      const n = 32;
      const c = document.createElement('canvas');
      c.width = n;
      c.height = n;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, n, n);
      const d = ctx.getImageData(0, 0, n, n).data;
      const bins = {};
      const order = [];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (d[i + 3] < 200) continue;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        if (mx < 50 || mx - mn < 40) continue;
        const k = `${r >> 5},${g >> 5},${b >> 5}`;
        let e = bins[k];
        if (!e) {
          e = bins[k] = { n: 0, r: 0, g: 0, b: 0 };
          order.push(e);
        }
        e.n++;
        e.r += r;
        e.g += g;
        e.b += b;
      }
      if (!order.length) return;
      for (const e of order) {
        const r = e.r / e.n;
        const g = e.g / e.n;
        const b = e.b / e.n;
        const m = Math.max(r, g, b);
        e.s = e.n * Math.pow((m - Math.min(r, g, b)) / m, 1.5);
      }
      order.sort((p, q) => q.s - p.s);
      const bright = (e) => {
        const v = [e.r / e.n, e.g / e.n, e.b / e.n];
        const m = Math.max(v[0], v[1], v[2]) || 1;
        const f = m < 225 ? 225 / m : 1;
        const avg = (v[0] + v[1] + v[2]) / 3;
        return v.map((x) => Math.max(0, Math.min(255, Math.round((avg + (x - avg) * 1.3) * f))));
      };
      const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 90;
      const pick = [];
      for (let j = 0; j < order.length && pick.length < 3; j++) {
        if (order[j].n < 3) break;
        const col = bright(order[j]);
        if (pick.every((p) => far(p, col))) pick.push(col);
      }
      if (!pick.length) pick.push(bright(order[0]));
      while (pick.length < 3) {
        const t = pick.length * 0.22;
        pick.push(pick[0].map((x) => Math.round(x + (255 - x) * t)));
      }
      root.style.setProperty('--gm-c1', pick[0].join(','));
      root.style.setProperty('--gm-c2', pick[1].join(','));
      root.style.setProperty('--gm-c3', pick[2].join(','));
    } catch (e) {
      // keep the CSS default purple
    }
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  // --- the screen -----------------------------------------------------------------------------------------------
  var font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;800&display=swap';
  document.head.appendChild(font);
  var style = el('style');
  style.id = 'gmLoaderStyle';
  style.textContent = CSS;
  document.head.appendChild(style);
  // The game's look (docs/LOADING.md §1.1): icons/loader.css, after the kit CSS so it wins. Only how the screen looks
  // (images, logo, bar, positions, colours); the flow above stays the kit's. The kit's own file is empty. The screen
  // stays invisible until the skin is in (at most SKIN_WAIT_MS), so the kit look never flashes first.
  var SKIN_WAIT_MS = 500;
  var skinDone = false;
  var skin = el('link');
  skin.rel = 'stylesheet';
  skin.id = 'gmLoaderSkin';
  skin.href = icons + 'loader.css';
  document.head.appendChild(skin);

  var art = icons + 'loading.webp';
  var root = el('div');
  root.id = 'gmLoader';
  var backdrop = el('div', 'gmLoaderBackdrop');
  backdrop.style.backgroundImage = "url('" + art + "')";
  var stage = el('div', 'gmLoaderStage');
  var thumb = el('img', 'gmLoaderThumb');
  thumb.src = art;
  var name = el('h1', 'gmLoaderTitle');
  var progressBox = el('div', 'gmLoaderProgress');
  var spinner = el('div', 'gmLoaderSpinner');
  spinner.setAttribute('aria-hidden', 'true');
  var bar = el('div', 'gmLoaderBar');
  var fill = el('div');
  fill.id = 'gmLoaderFill';
  bar.appendChild(fill);
  var info = el('div', 'gmLoaderInfo');
  info.textContent = 'Loading...';
  var retry = el('button', 'gmLoaderRetry');
  retry.type = 'button';
  retry.textContent = 'Reload';
  retry.hidden = true;
  retry.onclick = function () {
    location.reload();
  };
  progressBox.appendChild(spinner);
  progressBox.appendChild(bar);
  progressBox.appendChild(info);
  progressBox.appendChild(retry);
  stage.appendChild(thumb);
  stage.appendChild(name);
  stage.appendChild(progressBox);
  // The publisher's logo; not on GameDistribution / CrazyGames / Poki pages (no publisher branding there, QA 7.4).
  var portalPage = ['gd', 'crazy', 'poki'].indexOf(String(opts.sdkType || '').toLowerCase()) >= 0 || opts.trademark === false;
  var brand = el('div', 'gmLoaderBrand');
  brand.setAttribute('aria-hidden', 'true');
  if (!portalPage) {
    var logo = el('img');
    logo.alt = '';
    logo.src = icons + 'logo.webp';
    logo.onerror = function () {
      if (brand.parentNode) brand.parentNode.removeChild(brand);
    };
    brand.appendChild(logo);
  }
  var corner = el('div', 'gmLoaderVersion');
  corner.textContent = typeof opts.version === 'string' && opts.version.indexOf('<!--') < 0 ? opts.version : '';
  root.appendChild(backdrop);
  root.appendChild(stage);
  root.appendChild(brand);
  root.appendChild(corner);
  root.className = 'gmSkinWait';
  (document.body || document.documentElement).appendChild(root);

  // The bar takes the key art's colours once both the art and the skin are in, unless the skin sets --gm-tint: off.
  var tinted = false;
  function tint() {
    if (tinted || !skinDone || !(thumb.complete && thumb.naturalWidth)) return;
    tinted = true;
    var off = '';
    try {
      off = getComputedStyle(root).getPropertyValue('--gm-tint').trim();
    } catch (e) {
      off = '';
    }
    if (off !== 'off') tintFromArt(thumb, root);
  }
  function skinIn() {
    if (skinDone) return;
    skinDone = true;
    root.classList.remove('gmSkinWait');
    tint();
  }
  skin.onload = skinIn;
  skin.onerror = skinIn; // no icons/loader.css: the kit look
  setTimeout(skinIn, SKIN_WAIT_MS);
  thumb.addEventListener('load', tint);
  tint();

  function setTitle(t) {
    name.textContent = t == null ? '' : String(t);
    thumb.alt = name.textContent;
  }
  setTitle(document.title);

  // --- progress -------------------------------------------------------------------------------------------------
  var filesDone = 0; // 0, 1, 2 of the two files
  var gameShare = 0; // 0..1 reported by the game
  var failed = false;
  var hidden = false;
  function sdkCall(fn, arg) {
    try {
      var s = g.GMSDKJS;
      if (s && typeof s[fn] === 'function') s[fn](arg);
    } catch (e) {
      // the screen goes on without the SDK
    }
  }
  function show() {
    if (failed) return;
    var f = (filesDone / 2) * FILES_SHARE + gameShare * (1 - FILES_SHARE);
    sdkCall('loadingProgress', f);
    var pct = Math.round(f * 100);
    if (pct <= 0) return;
    root.classList.add('gmIsLoading');
    fill.style.width = pct + '%';
    if (pct >= 99) {
      root.classList.add('gmAlmost');
      info.textContent = 'Almost there...';
    } else {
      root.classList.remove('gmAlmost');
      var b = el('b');
      b.textContent = pct + '%';
      info.textContent = '';
      info.appendChild(b);
    }
  }
  function note(text) {
    if (failed) return;
    root.classList.add('gmIsLoading');
    info.textContent = text;
  }
  function fail(text) {
    if (failed) return;
    failed = true;
    root.hidden = false;
    root.classList.remove('gmAlmost');
    root.classList.add('gmIsLoading', 'gmFailed');
    info.textContent = text || 'Connection problem. Please check your network and reload the page.';
    retry.hidden = false;
  }

  // --- files ----------------------------------------------------------------------------------------------------
  function withTry(url, n) {
    return n === 0 ? url : url + (url.indexOf('?') >= 0 ? '&' : '?') + 'retry=' + n;
  }
  /** One try: resolves true once the script ran, false on error / timeout (the tag is removed). */
  function loadScript(url, module, id) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      var timer;
      var finish = function (ok) {
        clearTimeout(timer);
        s.onload = s.onerror = null;
        if (!ok && s.parentNode) s.parentNode.removeChild(s);
        resolve(ok);
      };
      if (module) s.type = 'module';
      if (id) s.id = id;
      s.src = url;
      s.onload = function () {
        finish(true);
      };
      s.onerror = function () {
        finish(false);
      };
      timer = setTimeout(function () {
        finish(false);
      }, TIMEOUT_MS);
      document.head.appendChild(s);
    });
  }
  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  /** Up to TRIES tries; `good()` checks the file really did its job (gmsdkjs: window.GMSDKJS exists). */
  function loadWithRetry(label, url, module, id, good) {
    var n = 0;
    var next = function () {
      return loadScript(withTry(url, n), module, n === 0 ? id : null).then(function (ok) {
        if (ok && good()) return true;
        n++;
        log(label + ': try ' + n + ' of ' + TRIES + ' failed');
        if (n >= TRIES) return false;
        note('Connecting again (' + (n + 1) + '/' + TRIES + ')...');
        return wait(WAITS_MS[n - 1] || 2000).then(next);
      });
    };
    return next();
  }

  var sdkOk = function () {
    try {
      return !!g.GMSDKJS && typeof g.GMSDKJS === 'object';
    } catch (e) {
      return false;
    }
  };
  var resolveReady;
  var readyPromise = new Promise(function (r) {
    resolveReady = r;
  });
  var state = { sdk: 'loading', game: 'loading' };

  var sdkLoad = (sdkOk() ? Promise.resolve(true) : loadWithRetry('gmsdkjs', sdkUrl, false, 'gmsoft-jssdk', sdkOk)).then(
    function (ok) {
      state.sdk = ok ? 'ok' : 'failed';
      if (ok) {
        filesDone++;
        show();
        resolveReady(g.GMSDKJS);
        return;
      }
      if (dev) {
        // Dev page only: go on without the SDK (no ads, no tracking), so the game can be worked on offline.
        console.warn('[loader] gmsdkjs.js did not load: dev page goes on without the SDK');
        filesDone++;
        show();
        resolveReady(null);
        return;
      }
      fail();
    }
  );
  var gameLoad = loadWithRetry('game', entry, entryModule, null, function () {
    return true;
  }).then(function (ok) {
    state.game = ok ? 'ok' : 'failed';
    if (!ok) return fail();
    filesDone++;
    show();
  });
  Promise.all([sdkLoad, gameLoad]).then(function () {
    log('files', state);
  });

  // --- what the game uses ---------------------------------------------------------------------------------------
  g.GMLoader = {
    /** Resolves with window.GMSDKJS once gmsdkjs.js has loaded (null: dev page without it). Never on failure. */
    ready: function () {
      return readyPromise;
    },
    /** The game's own loading, 0..1: the bar goes from 30 % to 100 %; "Almost there..." from 99 %. */
    progress: function (fraction) {
      var f = Math.min(Math.max(Number(fraction) || 0, 0), 1);
      if (f > gameShare) gameShare = f;
      show();
    },
    /** The game's name, once game.json is loaded. */
    setTitle: setTitle,
    /** The game's first screen is on: hide the screen, tell the SDK (loaded_game, portal SDKs). */
    done: function () {
      if (hidden || failed) return;
      hidden = true;
      gameShare = 1;
      show();
      root.hidden = true;
      sdkCall('loadingDone');
    },
    /** The game's own loading failed (an asset that is needed at start): the same Reload screen. */
    fail: fail,
    /** Where loading is: { sdk, game } each 'loading' | 'ok' | 'failed'. */
    state: state,
  };
})();
