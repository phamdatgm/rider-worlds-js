/**
 * TẢI QUA MẠNG CHẬP CHỜN — copy vào src/sdk/ cùng các file khác.
 *
 * Lý do tồn tại (rút ra từ Ant Flow): `fetch` / `new Image()` trần có ba kiểu hỏng làm game kẹt:
 *   1. request TREO không trả lời -> Promise không bao giờ xong -> màn loading đứng mãi, console sạch
 *   2. lỗi một lần rồi kết quả lỗi bị cache trong Map -> tài nguyên đó hỏng tới khi tải lại trang
 *   3. trình duyệt giữ bản lỗi trong HTTP cache -> thử lại vẫn lỗi
 * Ở đây: mỗi lần thử có GIỚI HẠN THỜI GIAN, thử lại tối đa NET.TRIES lần (nghỉ tăng dần), lần thử lại thêm ?r=n.
 *
 *   import { loadImage, loadJSON, fetchRetry, fontsReady } from './sdk/net.js';
 *   const img = await loadImage('assets/img/box.png');
 *   const lv  = await loadJSON('assets/levels/12.json');
 *   await fontsReady();            // chờ font tối đa 4s, không bao giờ treo
 *
 * Cache của game: nếu giữ Promise trong Map thì XOÁ khi Promise lỗi, ví dụ
 *   cache.set(k, loadJSON(url).catch(e => { cache.delete(k); throw e; }));
 *
 * Log viết tiếng Anh (bản build không được có tiếng Việt ngoài bảng dịch — xem docs/BUILD_RULES.md).
 */

export const NET = {
  TRIES: 3,            // tổng số lần thử
  TIMEOUT: 15000,      // ms cho MỖI lần thử (request treo cũng tính lỗi)
  BACKOFF: [600, 1500] // ms nghỉ trước lần thử 2, 3
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bust = (url, i) => (i ? `${url}${url.includes('?') ? '&' : '?'}r=${i}` : url);

/** chạy fn(lầnThử) tới khi thành công hoặc hết NET.TRIES lần; ném lỗi cuối cùng */
export async function withRetry(fn, label = '') {
  let err;
  for (let i = 0; i < NET.TRIES; i++) {
    try { return await fn(i); } catch (e) { err = e; }
    if (i < NET.TRIES - 1) {
      console.warn(`[net] retry ${i + 1} ${label}`);
      await wait(NET.BACKOFF[i] ?? 2000);
    }
  }
  throw err;
}

function loadImageOnce(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    const timer = setTimeout(() => { im.onload = im.onerror = null; im.src = ''; rej(new Error(`timeout ${url}`)); }, NET.TIMEOUT);
    im.onload = () => { clearTimeout(timer); res(im); };
    im.onerror = () => { clearTimeout(timer); rej(new Error(`image ${url}`)); };
    im.src = url;
  });
}

/** HTMLImageElement đã tải xong (thử lại + giới hạn thời gian) */
export const loadImage = (url) => withRetry((i) => loadImageOnce(bust(url, i)), url);

/** fetch có giới hạn thời gian + thử lại; trả Response đã kiểm r.ok */
export function fetchRetry(url, init) {
  return withRetry(async (i) => {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ac && ac.abort(), NET.TIMEOUT);
    try {
      const r = await fetch(bust(url, i), ac ? { ...init, signal: ac.signal } : init);
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      return r;
    } finally { clearTimeout(timer); }
  }, url);
}

export const loadJSON = async (url) => (await fetchRetry(url)).json();
export const loadArrayBuffer = async (url) => (await fetchRetry(url)).arrayBuffer();

/** chờ font của trang, tối đa `ms` — font lỗi / treo thì dùng font dự phòng, KHÔNG treo màn loading */
export const fontsReady = (ms = 4000) =>
  Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(ms)]);
