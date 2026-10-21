/**
 * TẦNG SDK — **một chỗ duy nhất sở hữu GMGameSDK.** Analytics và leaderboard đều đi qua đây.
 *
 * Vì sao nằm trong JS chứ không chỉ trong vỏ HTML: vỏ sai thì mất sạch dữ liệu mà không có
 * một dấu hiệu nào (đã xảy ra thật — xem docs/ANALYTICS.md). Tầng JS thì chạy được cả trên dev
 * server, kiểm được bằng test, và **tự nói ra khi thiếu**.
 *
 * Vỏ portal có nhúng sẵn `gm-sdk.js` thì càng tốt — `ready()` nhận ra và dùng luôn, không nạp
 * lại. Vỏ thiếu thì tầng này tự nạp. **Không phụ thuộc vào việc vỏ có đúng hay không.**
 *
 *   await sdk.ready()      → đối tượng GMGameSDK đã init, hoặc null
 *   sdk.diagnose()         → in ra CHÍNH XÁC đang thiếu gì
 */

import { config } from '../config.mjs';
import { store } from './storage.js';
import { isPlaceholder } from './placeholders.js';

const SDK_HOST = config.sdkHost ?? 'https://gm.azgame.io';
// index.html AZ_SETTINGS.gameId is the live value (editable after a build); the build checks it equals config.gameId
const GAME_ID = globalThis.AZ_SETTINGS?.gameId ?? config.gameId;

/**
 * **CẢ HAI, đúng thứ tự này.**
 *
 * `gm-iframe.js` là cầu nối tới trang portal: trên portal game chạy trong iframe, và script
 * đó mới trả lời postMessage của trang cha rồi bàn giao token người chơi. **Thiếu nó thì trên
 * portal không có player nào backend chấp nhận** — trong khi trên dev server mọi thứ vẫn chạy
 * hoàn hảo. Kiểu lỗi chỉ lộ sau khi phát hành.
 */
const SCRIPTS = [
  // BẮT BUỘC: không có nó thì không có GMGameSDK, không có gì chạy được.
  { url: `${SDK_HOST}/sdk/v3/gm-sdk.js`, has: () => !!globalThis.GMGameSDK, name: 'gm-sdk.js', required: true },
  // TỐT NHẤT LÀ CÓ, nhưng không bắt buộc. Trên trang thường (dev server, build tĩnh) đăng
  // nhập ẩn danh chạy được mà không cần nó, và adblock hay chặn đúng file này. Để nó là bắt
  // buộc thì một script phụ hỏng kéo sập cả analytics lẫn leaderboard - đã dựng test và dính.
  { url: `${SDK_HOST}/sdk/v3/gm-iframe.js`, has: () => !!(globalThis.GMIframe || globalThis.GMIframeClient), name: 'gm-iframe.js', required: false },
];

/** Thẻ script bị chặn có thể KHÔNG bắn cả `load` lẫn `error` (adblock, CSP, proxy nuốt). */
const SCRIPT_TIMEOUT_MS = 10000;

function loadScript({ url, has }) {
  return new Promise((resolve, reject) => {
    if (has()) { resolve(); return; }
    const existing = document.querySelector(`script[src="${url}"]`);
    const el = existing ?? document.createElement('script');
    const timer = setTimeout(() => reject(new Error(`timed out loading ${url}`)), SCRIPT_TIMEOUT_MS);
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    el.addEventListener('load', () => done(resolve), { once: true });
    el.addEventListener('error', () => done(reject, new Error(`failed to load ${url}`)), { once: true });
    if (!existing) { el.src = url; el.async = true; document.head.appendChild(el); }
  });
}

let readyPromise = null;
let initialised = false;

/**
 * Danh tính phải được XÁC NHẬN, không được kế thừa ngầm từ game trước. Xem `confirmedFor`
 * trong config.mjs.
 */
function identityConfirmed() {
  // Giá trị MẪU bị chặn riêng, trước cả phép so khớp: đặt confirmedFor: 'idgame' cho khớp
  // gameId: 'idgame' thì hai dòng "khớp" nhau, nhưng vẫn chưa ai điền gì cả.
  for (const [key, val] of [['gameId', config.gameId], ['gameName', config.gameName]]) {
    if (isPlaceholder(val)) {
      console.error([
        `[gmsdk] STOP: config.${key} is still the PLACEHOLDER value ("${val}").`,
        'Run `node JS_SDK_2.0/tools/setup.mjs` to fill it in, or edit config.mjs by hand.',
        'The real value must be ASKED of the portal operator - a wrong guess sends the data to another game.',
      ].join('\n'));
      return false;
    }
  }
  if (config.confirmedFor === config.gameId) return true;
  console.error([
    `[gmsdk] STOP: config.confirmedFor ("${config.confirmedFor}") does not match`,
    `config.gameId ("${config.gameId}").`,
    '',
    'This kit was just carried over to a new game. ASK THE PORTAL OPERATOR, do not guess:',
    '  1. GAME NAME      -> config.gameName',
    '  2. GAME ID        -> config.gameId        (copied verbatim from the operator)',
    '  3. ID LEADERBOARD -> JS_Leaderboard/config.mjs: leaderboardId',
    '  4. signDomain, gameCode',
    '',
    `Once filled in, set confirmedFor: '${config.gameId}'.`,
    'A wrong guess sends the data to another game without any sign.',
  ].join('\n'));
  return false;
}

async function boot() {
  if (!identityConfirmed()) throw new Error('identity not confirmed - see the message above');
  for (const s of SCRIPTS) {
    try {
      await loadScript(s);
    } catch (e) {
      if (s.required) throw e;
      // Cảnh báo to, vì TRÊN PORTAL thiếu gm-iframe.js nghĩa là không có player nào backend
      // chấp nhận và mọi điểm gửi đi rơi vào hư không - trong khi trên trang thường thì
      // không sao cả. Triệu chứng giống hệt nhau, nên phải nói ra ở đây.
      console.warn(`[gmsdk] ${s.name} failed to load (${e.message ?? e}). `
        + 'Harmless on a plain page; ON THE PORTAL, player sign-in will break.');
    }
  }

  const inst = globalThis.GMGameSDK;
  if (!inst) throw new Error('GMGameSDK undefined after gm-sdk.js loaded');

  // init() KHÔNG idempotent theo nghĩa vô hại: nó reset consent và session. Vỏ portal có thể
  // đã gọi rồi (template Unity gọi), nên chỉ gọi khi chưa có player - getPlayerId() trả về
  // giá trị chỉ sau khi init + đăng nhập.
  if (!initialised && typeof inst.init === 'function') {
    inst.init(GAME_ID, SDK_HOST, {
      adblockCheck: false,
      publisherHost: config.publisherHost ?? 'azgames.io',
    });
    const version = globalThis.GM_GAME?.version;
    if (version) inst.setVersion?.(version);
    initialised = true;
  }
  return inst;
}

/**
 * Trả về GMGameSDK đã init, hoặc **null** khi không với tới được (offline, adblock, CSP).
 * Null chứ không ném lỗi: không một thứ gì ở tầng này được phép làm sập game.
 */
export function ready() {
  readyPromise ??= boot().catch((e) => {
    console.warn('[gmsdk] unavailable:', e.message ?? e);
    readyPromise = null;              // cho phép thử lại ở lần gọi sau
    return null;
  });
  return readyPromise;
}

/** Đã init xong chưa, hỏi đồng bộ - dùng cho chẩn đoán, đừng dùng để quyết định luồng. */
export const isReady = () => !!globalThis.GMGameSDK && initialised;

/**
 * **In ra CHÍNH XÁC đang thiếu gì.** Tồn tại vì chế độ hỏng của tầng này là sự im lặng: hàm
 * chạy, catch nuốt lỗi, console sạch, 0 request, mất 100% dữ liệu. Gọi nó trong console khi
 * nghi ngờ, hoặc để `?debug` tự gọi.
 */
export function diagnose() {
  const fb = typeof globalThis.firebase !== 'undefined' && globalThis.firebase.apps?.length > 0;
  const gm = typeof globalThis.GMGameSDK !== 'undefined';
  const rows = [
    ['gm-sdk.js  (GMGameSDK)', gm],
    ['gm-iframe.js (GMIframe / v3 GMIframeClient) - required on the portal only', !!(globalThis.GMIframe || globalThis.GMIframeClient)],
    ['GMGameSDK.init() called', gm && initialised],
    ['có playerId', gm && !!globalThis.GMGameSDK.getPlayerId?.()],
    ['firebase initializeApp done', fb],
    ['firebaseLogEventParameter', typeof globalThis.firebaseLogEventParameter === 'function'],
    ['firebaseSetUserProperties', typeof globalThis.firebaseSetUserProperties === 'function'],
  ];
  console.group('[gmsdk] diagnose');
  for (const [label, ok] of rows) console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!gm && !fb) {
    console.warn('NO route is alive. Every event is disappearing silently.');
  } else if (!gm) {
    console.warn('Firebase only. GMSDK receives nothing (the leaderboard will break too).');
  } else if (!fb) {
    console.info('GMSDK only. Nothing goes to Firebase - normal if config.firebase is empty.');
  }
  console.groupEnd();
  return Object.fromEntries(rows);
}

// ------------------------------------------------------------------ người chơi
//
// Session + đăng nhập ẩn danh + profile nằm ở TẦNG SDK, không phải leaderboard: game không
// có bảng xếp hạng vẫn cần một người chơi để analytics gắn `user_id` vào. Leaderboard chỉ
// mượn lại, không tự làm.

const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const randomName = () => (config.defaultNamePrefix ?? 'player')
  + Array.from({ length: 6 }, () => NAME_CHARS[(Math.random() * NAME_CHARS.length) | 0]).join('');

let profile = { name: '', country: '' };
let signedIn = null;

/** Tên + cờ hiện tại. Bản sao — sửa vào đây không ảnh hưởng gì. */
export const getProfile = () => ({ ...profile });

/**
 * `updateMyProfile` với **cả hai** trường (`UserModuleBase.SaveProfileAsync`). Bản local chỉ
 * đổi **sau khi** backend chấp nhận, nên một cái tên bị từ chối để lại tên cũ nguyên vẹn.
 */
export async function updateProfile({ name, country }) {
  const inst = await ready();
  if (!inst) return false;
  const next = { name: name ?? profile.name, country: country ?? profile.country };
  try {
    await inst.updateMyProfile(next);
    profile = next;
    store.playerName = next.name;
    store.country = next.country;
    return true;
  } catch (e) {
    console.warn('[gmsdk] profile update rejected:', e);
    return false;
  }
}

/** Khôi phục session rồi đảm bảo có một người chơi. Chạy một lần; lần sau dùng lại kết quả. */
async function signIn(inst) {
  try { await inst.refreshSession({}); } catch { /* chưa có session lưu sẵn */ }
  try { await globalThis.GMDualSlot?.onAppStart?.(); } catch (e) { console.warn('[gmsdk] onAppStart', e); }

  const name = store.playerName || randomName();
  const country = store.country || config.defaultCountry || 'US';
  if (!inst.getPlayerId() || inst.isTokenExpired()) {
    await inst.signInAnonymously({ name, country });
  }
  const p = (await inst.getMyProfile()) ?? {};
  profile = { name: p.name || name, country: p.country || country };
  // Server trả profile rỗng thì gieo hạt, đúng như UserModuleBase.Initialize bên Unity.
  if (!p.name || !p.country) {
    try { await inst.updateMyProfile(profile); } catch (e) { console.warn('[gmsdk] seed profile', e); }
  }
  store.playerName = profile.name;
  store.country = profile.country;
  return inst;
}

/**
 * **Một lệnh gọi lúc boot cho cả tầng SDK.** Nạp script, `init()`, khôi phục session, đảm
 * bảo có người chơi. Trả về đối tượng SDK đã sẵn sàng, hoặc `null`.
 *
 * Gọi TRƯỚC sự kiện analytics đầu tiên và trước mọi thao tác leaderboard: `_enqueue()` thoát
 * sớm khi `_initialized` còn false, và submit không có player thì server từ chối.
 */
export function startGmSdk() {
  signedIn ??= ready().then((inst) => (inst ? signIn(inst) : null)).catch((e) => {
    console.warn('[gmsdk] sign-in failed:', e?.message ?? e);
    signedIn = null;
    return null;
  });
  return signedIn;
}

export const sdk = { ready, startGmSdk, isReady, diagnose, getProfile, updateProfile };
