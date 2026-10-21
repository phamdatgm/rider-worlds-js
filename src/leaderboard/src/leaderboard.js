/**
 * Leaderboard trên GM SDK v2. **Tầng dịch vụ — không đụng gì tới DOM.** UI nằm ở `ui/`, thay
 * được mà không phải sửa file này.
 *
 * **ĐỨNG TRÊN JS_GMSDK, không tự nạp SDK.** Game bắt buộc có SDK; leaderboard thì tuỳ, nhưng
 * đã có leaderboard thì chắc chắn đã có SDK. Nên việc nạp script, `init()`, khôi phục session
 * và đăng nhập ẩn danh đều là của tầng kia — ở đây chỉ còn ký điểm, gửi, và đọc về.
 *
 * Nối hai tầng lúc boot:
 *
 *   import { startGmSdk } from './sdk/gmsdk.js';
 *   import { connectSdk, leaderboard } from './leaderboard/src/leaderboard.js';
 *   connectSdk(startGmSdk);            // truyền HÀM, không phải kết quả
 *
 * Truyền hàm chứ không truyền đối tượng để leaderboard thử lại được khi lần đầu hỏng mạng.
 *
 * `gm-sdk.js` chỉ là ống dẫn; trình tự dưới đây sao lại đúng những gì bản Unity của cùng SDK
 * làm, nên hai bản chạy chung một backend cho kết quả như nhau:
 *
 *   boot     GMGameSDK.init('<gameId>-az', sdkHost)        ← template gmsoft-v9
 *   session  refreshSession() → GMDualSlot.onAppStart()     ← GMServiceSDK.InitAsync
 *   player   chưa có player sống thì signInAnonymously({ name, country }), rồi getMyProfile();
 *            profile rỗng thì seed bằng updateMyProfile     ← UserModuleBase.Initialize
 *   submit   leaderboard(id).submitScore(score, { metadata, token })
 *   read     leaderboard(id).getTopScores({ period, limit, offset })
 *
 * MỘT bảng, BỐN kỳ hạn — không phải bốn bảng riêng.
 *
 * @see ../README.md
 */

import { leaderboardConfig as cfg } from '../config.mjs';
import { hmacSha256, toHex } from './hmac.js';

/** Tên tab, theo đúng thứ tự khai báo trong config. UI đọc cái này để dựng tab. */
export const RANGES = Object.freeze(Object.keys(cfg.periods));

/** Hook analytics, tuỳ chọn. Không gắn thì không log — dịch vụ không phụ thuộc analytics. */
let track = () => {};
export function setAnalytics(fn) { track = typeof fn === 'function' ? fn : () => {}; }

/**
 * Nối vào tầng SDK. Gọi MỘT LẦN lúc boot, trước thao tác leaderboard đầu tiên.
 * @param {() => Promise<object|null>} readyFn  thường là `startGmSdk` của JS_GMSDK
 */
let sdkReady = async () => {
  console.error('[leaderboard] connectSdk() was never called - see the top of leaderboard.js. Nothing can be sent or read.');
  return null;
};
export function connectSdk(readyFn) {
  if (typeof readyFn !== 'function') throw new TypeError('connectSdk needs a FUNCTION returning a Promise');
  const TEMPLATE = new Set(['', 'null', 'undefined', 'idleaderboard', 'id-leaderboard', 'idgame']);
  if (TEMPLATE.has(String(cfg.leaderboardId ?? '').trim().toLowerCase())) {
    console.error([
      `[leaderboard] STOP: leaderboardId is still the PLACEHOLDER value ("${cfg.leaderboardId}").`,
      'ASK the portal operator for the real leaderboard id and put it in config.mjs.',
    ].join('\n'));
    return;
  }
  if (cfg.confirmedBoard !== cfg.leaderboardId) {
    console.error([
      `[leaderboard] STOP: confirmedBoard ("${cfg.confirmedBoard}") does not match`,
      `leaderboardId ("${cfg.leaderboardId}").`,
      'ASK the portal operator for the LEADERBOARD id of this game, do not guess, then set both lines.',
      'A wrong guess submits to a board nobody reads, and reads back from that same board.',
    ].join('\n'));
    return;                       // sdkReady giữ nguyên bản báo lỗi -> mọi thao tác trả false
  }
  sdkReady = readyFn;
}

/**
 * Nối API DANH TÍNH người chơi (tên + cờ). Gọi MỘT LẦN lúc boot, cạnh `connectSdk`:
 *
 *   import { getProfile, updateProfile } from './sdk/gmsdk.js';        // JS_GMSDK
 *   connectProfile({ getProfile, updateProfile });
 *
 * Vì sao tiêm vào chứ không import thẳng `JS_GMSDK`: bộ này không được ghim cứng đường dẫn
 * tới bộ kia. Hai thư mục có thể nằm cạnh nhau, lồng nhau, hay đổi tên - chỗ nối là việc của
 * dự án, không phải của kit.
 *
 * Tên và cờ vốn thuộc TẦNG SDK, nhưng UI chọn chúng thì nằm ở bộ này (`ui/profileUi.js`):
 * thứ duy nhất làm người chơi nhìn thấy tên và cờ của mình là bảng xếp hạng.
 */
let profileApi = null;
export function connectProfile(api) {
  if (typeof api?.getProfile !== 'function' || typeof api?.updateProfile !== 'function') {
    throw new TypeError('connectProfile needs { getProfile, updateProfile }');
  }
  profileApi = api;
}

const noProfile = () => {
  console.error([
    '[leaderboard] connectProfile() was never called - the player name and flag cannot be read or written.',
    "At boot: connectProfile({ getProfile, updateProfile }) from src/sdk/gmsdk.js.",
  ].join('\n'));
};

/** Tên + cờ của người chơi. `ui/profileUi.js` chỉ chạm vào đúng hai hàm này. */
export const profile = {
  /** @returns {{name: string, country: string}} */
  get() {
    if (!profileApi) { noProfile(); return { name: '', country: '' }; }
    return profileApi.getProfile();
  },
  /** @returns {Promise<boolean>} */
  async set({ name, country }) {
    if (!profileApi) { noProfile(); return false; }
    return profileApi.updateProfile({ name, country });
  },
};

/**
 * `GMBridge.ComputeScoreToken`.
 *
 * Ký bằng HMAC tự viết (`hmac.js`) chứ **KHÔNG dùng WebCrypto**: `crypto.subtle` chỉ tồn tại
 * trong secure context, mà portal phục vụ game qua **http thường** — ở đó mọi lần submit ném
 * `Cannot read properties of undefined (reading 'importKey')` và **không một điểm nào lên
 * bảng**. Lỗi đó đã lọt qua cả một bản phát hành, chỉ người chơi báo mới phát hiện.
 *
 * `src/check-hmac.mjs` ghim bản tự viết này vào `crypto` của Node — chạy nó sau khi sửa.
 */
function scoreToken(playerId, score) {
  const key = new Uint8Array(cfg.scoreSigningKeyHex.match(/../g).map((h) => parseInt(h, 16)));
  // C#: (long)(score * 1000.0) cắt về 0; UtcNow giây chia 30 là phép chia nguyên.
  const msg = `${playerId}:${Math.trunc(score * 1000)}:${Math.floor(Date.now() / 1000 / 30)}`;
  return toHex(hmacSha256(key, new TextEncoder().encode(msg)));
}

export const leaderboard = {
  /** Tiện ích: chỉ là `sdkReady()`. Tầng SDK mới là chỗ thật sự khởi động. */
  init() { return sdkReady(); },

  // profile / updateProfile KHÔNG còn ở đây: tên và cờ là danh tính NGƯỜI CHƠI, thuộc tầng
  // SDK (`getProfile` / `updateProfile` trong gmsdk.js). Game không có bảng xếp hạng vẫn có
  // người chơi. UI của leaderboard gọi thẳng tầng kia.

  /**
   * Một lần submit cho mỗi ván. Backend giữ **điểm cao nhất của mỗi kỳ hạn**, nên một ván
   * thấp hơn vẫn submit thành công mà bảng không đổi — đó không phải lỗi.
   *
   * @param {number} score
   * @returns {Promise<boolean>}
   */
  async postScore(score) {
    if (!(score >= 0)) return false;
    const sdk = await sdkReady();
    if (!sdk) return false;
    try {
      const playerId = sdk.getPlayerId();
      const token = scoreToken(playerId, score);
      await sdk.leaderboard(cfg.leaderboardId).submitScore(score, { metadata: null, token });
      // Log CẢ TRONG BẢN PHÁT HÀNH. Khi có người báo "điểm của tôi không lên bảng", đúng một
      // dòng này nói được: game có submit không, submit với tư cách ai, lên bảng nào.
      console.info(`[leaderboard] submitted ${score} as ${playerId} to ${cfg.leaderboardId}`);
      track('leaderboard_submit', { ok: 1, score });
      return true;
    } catch (e) {
      console.warn('[leaderboard] submit failed:', e?.message ?? e, e);
      // LÝ DO mới là thứ đáng tiền: xem chú thích ở scoreToken().
      track('leaderboard_submit', {
        ok: 0, score, reason: e?.message ?? e?.error ?? (e?.status ? `http ${e.status}` : 'unknown'),
      });
      return false;
    }
  },

  /**
   * @param {string} range  một khoá của `config.periods`
   * @returns {Promise<{total: number, entries: {rank: number, name: string, country: string,
   *   score: number, playerId: string}[]} | null>}  `null` khi request hỏng — KHÁC với bảng
   *   rỗng, và UI phải phân biệt hai cái đó.
   */
  async getScores(range, offset = 0, limit = cfg.pageSize) {
    const sdk = await sdkReady();
    if (!sdk) return null;
    try {
      const period = cfg.periods[range] ?? 'alltime';
      const page = await sdk.leaderboard(cfg.leaderboardId).getTopScores({ period, limit, offset });
      return {
        total: Number(page?.total ?? 0),
        entries: (page?.results ?? []).map((r) => ({
          rank: Number(r.rank),
          name: r.playerName ?? '',
          country: r.playerCountry ?? '',
          score: Number(r.score),
          playerId: r.playerId,
        })),
      };
    } catch (e) {
      console.warn('[leaderboard] fetch failed:', e);
      return null;
    }
  },
};
