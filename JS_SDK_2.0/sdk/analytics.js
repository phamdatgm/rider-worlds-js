/**
 * Analytics cho game HTML5 trên portal GMSDK.
 *
 * Import `analytics` rồi gọi `analytics.log(...)`. Tầng SDK (`gmsdk.js`) lo phần nạp và init;
 * `portal.js` lo phần bù các hàm toàn cục nếu vỏ trang thiếu. Gọi `startAnalytics()` một lần
 * lúc boot là xong cả ba. Xem `JS_SDK_2.0/ANALYTICS.md`.
 *
 * ĐƯỜNG ĐI CỦA MỘT SỰ KIỆN
 *
 *   analytics.log(name, params)
 *        │
 *        ├── window.firebaseLogEventParameter(name, params)   ← vỏ portal định nghĩa
 *        │        ├── firebase.analytics().logEvent(...)
 *        │        └── GMGameSDK.trackEventParams(...)
 *        │
 *        ├── GMGameSDK.trackEventParams(...)   ← nếu không có vỏ portal nhưng SDK đã nạp
 *        └── console.debug(...)                ← nếu không có gì cả (dev server)
 *
 * Ba trường hợp đó là cố ý: **file này không bao giờ ném lỗi vào game.** Analytics hỏng thì
 * im lặng, game vẫn chạy.
 */

import { startGmSdk, diagnose } from './gmsdk.js';
import { installPortalGlobals } from './portal.js';

/**
 * Chặn theo cấp độ, giống `Analytics.level` bên Unity: server hạ `analyticsLevel` xuống thì
 * các sự kiện chi tiết tự tắt mà không cần build lại. Mặc định 9999 = gửi hết.
 */
const LEVEL = Number(globalThis.GM_GAME?.analyticsLevel ?? 9999);

/**
 * Một lệnh gọi lúc boot, lo hết: bù các hàm toàn cục còn thiếu, nạp và init GMGameSDK, và
 * với `?debug` thì in bảng chẩn đoán.
 *
 * **Gọi nó trước sự kiện đầu tiên.** `_enqueue()` của SDK thoát sớm khi `_initialized` còn
 * false, nên mọi thứ log trước init đều bị bỏ, im lặng.
 */
export async function startAnalytics() {
  installPortalGlobals();
  const inst = await startGmSdk();   // nạp + init + session + người chơi
  if (DEBUG) diagnose();
  return inst;
}

/** Bật log ra console khi chạy dev server hoặc mở với `?debug`. */
const DEBUG = !!import.meta.env?.DEV
  || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'));

/**
 * Firebase giới hạn: tên sự kiện và tên tham số **≤ 40 ký tự**, giá trị chuỗi **≤ 100**.
 * Cắt ở đây thay vì để Firebase lặng lẽ bỏ cả sự kiện.
 */
const clean = (params) => {
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    out[String(k).slice(0, 40)] = typeof v === 'number' ? v : String(v).slice(0, 100);
  }
  return out;
};

/**
 * Chia điểm thành khoảng. Firebase bản miễn phí không vẽ được phân bố của một số nguyên tự
 * do, nhưng vẽ được phân bố của ~10 nhãn — nên gửi kèm cả số thật lẫn khoảng.
 *
 * Sửa `bands` cho hợp thang điểm của game.
 */
export function scoreBucket(score, bands = [0, 1, 3, 5, 10, 20, 40, 75, 150, 300]) {
  let lo = 0;
  for (const b of bands) if (score >= b) lo = b;
  const hi = bands[bands.indexOf(lo) + 1];
  return hi === undefined ? `${lo}+` : lo === hi - 1 ? `${lo}` : `${lo}-${hi - 1}`;
}

/** Mọi sự kiện đã gửi trong phiên, theo thứ tự — để test tự động đọc lại. */
const sent = [];

export const analytics = {
  /** @returns {{name: string, params: object|null}[]} */
  get sent() { return sent; },

  /**
   * Gọi MỘT LẦN lúc vào game. Thuộc tính người dùng dính vào mọi sự kiện sau đó, nên đây là
   * chỗ đặt version, loại thiết bị, host…
   *
   * LƯU Ý: vỏ portal hiện **không định nghĩa** `firebaseSetUserProperties`. Gọi vẫn an toàn
   * (try/catch nuốt), nhưng muốn chắc chắn có thì thêm shim vào vỏ — xem docs/ANALYTICS.md.
   */
  setUser(props) {
    const p = clean(props);
    try { globalThis.firebaseSetUserProperties?.(p); } catch { /* không bao giờ phá game */ }
    if (DEBUG) console.debug('[analytics] user', p);
  },

  /**
   * @param {string} name    snake_case, ≤ 40 ký tự. **Chi tiết đi vào params, không vào tên.**
   * @param {object} [params]
   * @param {number} [level] 0 = luôn gửi; số lớn hơn = chỉ gửi khi server nâng analyticsLevel
   */
  log(name, params = null, level = 0) {
    if (level > LEVEL) return;
    const p = params ? clean(params) : null;
    sent.push({ name, params: p });
    try {
      if (p) {
        if (globalThis.firebaseLogEventParameter) globalThis.firebaseLogEventParameter(name, p);
        else globalThis.GMGameSDK?.trackEventParams?.(name, p);
      } else if (globalThis.firebaseLogEvent) globalThis.firebaseLogEvent(name);
      else globalThis.GMGameSDK?.trackEvent?.(name);
    } catch { /* backend analytics không bao giờ được làm sập game */ }
    if (DEBUG) console.debug('[analytics]', name, p ?? '');
  },
};
