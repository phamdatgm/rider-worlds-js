// A tiny "game" that uses every part of the SDK the way a real game should (docs/INTEGRATION.md).
// A run is: press Tap until the time is up. Plain JS modules, no build step.
import { loadSDK } from '../sdk/gmsdkjs-shim.js';
import { copyrightText } from '../sdk/copyright.js';
import { createLoader } from '../loading/loading.js';
import { initI18n, languageList, onLangChange, setLang, t } from '../sdk/i18n.js';
import { loadJSON } from '../sdk/net.js';
import { createLeaderboard } from '../leaderboard/leaderboard.js';
import { openLeaderboard } from '../leaderboard/ui.js';

// The loading screen of loader.js, for the game's own loading (30 % → 100 % of the bar, docs/LOADING.md).
const loader = createLoader();
/** The SDK: set first thing in boot() (no top-level await: the export package is an iife, docs/EXPORT.md §3). */
let sdk;

const root = document.getElementById('game');
const log = (text) => {
  const li = document.createElement('li');
  li.textContent = text;
  document.getElementById('log').prepend(li);
};

let paused = false;

const el = (tag, text, onClick) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (onClick) node.addEventListener('click', onClick);
  return node;
};

let manifest;
/** The board of game.json leaderboardId (docs/LEADERBOARD.md); null when the game has none. */
let board = null;

async function boot() {
  // 1. The SDK: loader.js already shows the loading screen and loads gmsdkjs.js; wait for it.
  //    gameCode is the game's own: the save key if the page has no options block.
  sdk = await loadSDK({ gameCode: 'g0' });
  // 2. Pause / resume before anything can show an ad: mute, stop the loop, block input.
  sdk.onPause(() => {
    paused = true;
    root.classList.add('paused');
    log('onPause');
  });
  sdk.onResume(() => {
    paused = false;
    root.classList.remove('paused');
    log('onResume');
  });

  // 3. The manifest, then English: if they cannot load, the player gets "Try again" (never a frozen screen).
  manifest = await loadJSON('game.json');
  await initI18n({ languages: manifest.languages, defaultLanguage: manifest.defaultLanguage, storage: sdk.storage });
  loader.setTitle(manifest.name);
  loader.progress(0.5);

  // 4. Old saves, once: a key this game used before azgames.<gameCode>.
  sdk.storage.migrate({ 'gmsdk-example.best': 'profile' });

  // ...load the game's assets here, calling loader.progress(0..1) (forwarded to sdk.loadingProgress)...
  loader.progress(1);

  // The leaderboard rides on the GMA sign-in gmsdkjs does: create it now, it signs in in the background.
  if (manifest.leaderboardId) {
    board = createLeaderboard({ sdk, boardId: manifest.leaderboardId });
    board.ready().then((ok) => log(`leaderboard ready → ${ok}`));
  }

  // 5. The SDK's licence answer and ad config (5 s at most), then the menu is really on screen.
  const info = await sdk.ready();
  log(`ready: ${info.adType}${info.adsTest ? ' (test ads)' : ''}`);
  showMenu();
  loader.hide(); // hides the screen and calls sdk.loadingDone() (loaded_game): when the menu is visible

  // 6. The preroll: only when the API asks for one (h5 / GameDistribution); false at once otherwise.
  log(`preroll → ${await sdk.preroll()}`);
}

function showMenu() {
  root.replaceChildren();
  const best = sdk.storage.get('profile', { best: 0 }).best;
  root.append(el('h1', manifest.name), el('div', t('best_score', best)), el('button', t('play'), startRun));

  // Leaderboard: the default screen of the kit (leaderboard/ui.js). Pause what runs while it is open.
  if (board) {
    root.append(
      el('button', t('leaderboard_button'), () => {
        root.classList.add('paused');
        openLeaderboard({ board, t, assets: '../leaderboard/', onClose: () => root.classList.remove('paused') });
      }),
    );
  }

  // More games: the API's URL, or no button. On the dev page the shim gives https://azgames.io, so the button shows.
  const url = sdk.moreGamesUrl();
  if (url) root.append(el('button', t('more_games'), () => window.open(url, '_blank', 'noopener')));

  const langs = el('div');
  for (const { code, name } of languageList()) langs.append(el('button', name, () => setLang(code)));
  root.append(langs);

  let muted = sdk.storage.get('settings', {}).muted === true;
  const mute = el('button', muted ? t('sound_off') : t('sound_on'), () => {
    muted = !muted;
    sdk.storage.patch('settings', { muted });
    sdk.setMuted(muted); // AFG picks ads with or without sound
    mute.textContent = muted ? t('sound_off') : t('sound_on');
  });
  root.append(mute);

  document.getElementById('version').textContent = `V${manifest.version}`;
  document.getElementById('trademark').textContent = copyrightText(sdk); // "© 2026 Azgames.io" unless the server says otherwise; '' = show nothing
}

let runs = 0;
function startRun() {
  runs++;
  let score = 0;
  let left = 5;
  sdk.gameplayStart(); // the first one of the page also sends start_game
  sdk.track('PlayGame', { GameCount: runs });
  root.replaceChildren();
  const label = el('div', t('score', score));
  root.append(label, el('button', t('tap'), () => !paused && label.replaceChildren(t('score', ++score))));
  const timer = setInterval(() => {
    if (paused) return;
    if (--left > 0) return;
    clearInterval(timer);
    endRun(score);
  }, 1000);
}

async function endRun(score) {
  sdk.gameplayStop(); // before any ad (Poki / CrazyGames order)
  sdk.track('EndGame', { Score: score });
  const best = Math.max(score, sdk.storage.get('profile', { best: 0 }).best);
  sdk.storage.patch('profile', { best });

  root.replaceChildren(el('h2', t('game_over')), el('div', t('score', score)));
  // One submit per run: the server keeps each period's best and answers with the rank.
  if (board) {
    const rank = el('div');
    root.append(rank);
    board.submit(score).then((r) => {
      if (r) rank.textContent = t('rank', r.rank);
      log(`submit ${score} → ${r ? `rank ${r.rank}` : 'not sent'}`);
    });
  }
  // Rewarded: the button only when an ad is ready; call rewarded() straight from the click.
  if (sdk.rewardedAvailable()) {
    const bonus = el('button', t('double_score'), () => {
      bonus.disabled = true;
      sdk.rewarded('double_score').then((watched) => {
        if (watched) sdk.storage.patch('profile', { best: Math.max(best, score * 2) });
        log(`rewarded → ${watched}`);
      });
    });
    root.append(bonus);
  }
  root.append(el('button', t('menu'), async () => {
    // Interstitial at a natural break; the SDK keeps the time gap, the game decides where (never in play).
    if (runs > 1) log(`interstitial → ${await sdk.interstitial('run_end')}`);
    showMenu();
  }));
}

onLangChange(() => manifest && showMenu());

boot().catch((e) => {
  console.error(e);
  loader.error(); // "Connection problem…" + Reload on the loading screen
});
