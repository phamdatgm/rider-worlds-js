/**
 * Các hàm toàn cục mà portal gọi vào, và mà `analytics.js` gọi ra.
 *
 * Vỏ build (`tools/build.mjs`) đã dán một bản vào trang. **Bản này là lưới an toàn**: nếu vỏ
 * thiếu — vỏ tự viết, kit bản cũ, hay chạy trên dev server — thì import file này là có đủ.
 * Đã có sẵn thì KHÔNG ghi đè, vì bản của portal có thể làm nhiều hơn bản ở đây.
 *
 * Lý do tồn tại: đã có một đội mất 100% sự kiện vì trang khai báo hàm gọi mà không có gì
 * nhận. Xem docs/ANALYTICS.md.
 */

import { ready } from './gmsdk.js';

/** Đặt một global CHỈ KHI chưa có. */
function provide(name, fn) {
  if (typeof globalThis[name] === 'function') return false;
  globalThis[name] = fn;
  return true;
}

const firebaseLive = () => {
  try {
    return typeof globalThis.firebase !== 'undefined' && globalThis.firebase.apps?.length > 0;
  } catch { return false; }
};

/**
 * Mỗi backend một `try` RIÊNG. Gộp chung thì backend đầu ném lỗi là backend thứ hai không
 * bao giờ chạy — đúng cái bẫy đã làm mất dữ liệu: `firebase` không tồn tại, ném ngay, và
 * `GMGameSDK` phía sau không được gọi.
 */
function toBoth(send) {
  try { if (firebaseLive()) send.firebase(); } catch (e) { /* nhánh kia vẫn phải chạy */ }
  try {
    const gm = globalThis.GMGameSDK;
    if (gm) send.gm(gm);
    else ready().then((inst) => { try { if (inst) send.gm(inst); } catch { /* ignore */ } });
  } catch { /* không bao giờ ném vào game */ }
}

/**
 * Gắn lưới an toàn. Gọi MỘT LẦN, sớm, trước sự kiện đầu tiên.
 * @returns {string[]} tên những global mà file này đã phải tự cấp
 */
export function installPortalGlobals() {
  const added = [];
  const add = (n, f) => { if (provide(n, f)) added.push(n); };

  add('firebaseLogEvent', (name) => toBoth({
    firebase: () => globalThis.firebase.analytics().logEvent(name),
    gm: (inst) => inst.trackEvent?.(name),
  }));

  add('firebaseLogEventParameter', (name, params) => toBoth({
    firebase: () => globalThis.firebase.analytics().logEvent(name, params),
    gm: (inst) => inst.trackEventParams?.(name, params),
  }));

  // Vỏ của kit trước đây KHÔNG có hàm này, template Unity thì có - nên analytics.setUser()
  // đã đi vào hư không suốt thời gian đó.
  add('firebaseSetUserProperties', (props) => {
    try { if (firebaseLive()) globalThis.firebase.analytics().setUserProperties(props); } catch { /* ignore */ }
  });

  // Portal gọi vào hai hàm này. Bản tối thiểu, chỉ để không ném lỗi khi vỏ thiếu.
  add('gmEvent', () => {});
  add('gmStartGame', (cb) => { try { cb?.(); } finally { globalThis.firebaseLogEvent?.('start_game'); } });
  add('gmStartAds', (cb) => { cb?.(); });

  if (added.length) {
    console.info(`[gmsdk] the page shell lacked ${added.length} function(s), provided: ${added.join(', ')}`);
  }
  return added;
}
