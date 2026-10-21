/**
 * GIAO DIỆN CHỈ HIỆN KHI ẢNH ĐÃ TẢI XONG + vòng xoay "Loading…" — copy vào src/sdk/.
 *
 * Game DOM (popup, HUD, menu) hay bị "nháy": khung hiện ra trước, ảnh nút / icon / nền CSS hiện sau.
 * revealWhenReady(node) giữ node ẩn (visibility) tới khi MỌI <img> và ảnh nền CSS bên trong đã tải + giải mã,
 * tối đa `maxWait` ms (quá thì vẫn hiện — không bao giờ kẹt). Chờ > `delay` ms thì hiện overlay busy.
 *
 *   import { revealWhenReady, busy, setBusyLabel } from './sdk/uiReady.js';
 *   setBusyLabel(() => t('loadingDots'));             // chữ đã dịch (mặc định 'Loading…')
 *   root.appendChild(popupEl); revealWhenReady(popupEl); // gọi NGAY SAU khi gắn vào DOM
 *   busy(true); const lv = await loadLevel(n); busy(false);   // tải dữ liệu không có ảnh (đếm lồng nhau)
 *
 * CSS cần có (dán vào stylesheet của game; đổi màu cho hợp game):
 *   .ui-wait { visibility: hidden !important; }
 *   .ui-wait, .ui-wait * { animation: none !important; }   // hiệu ứng mở chạy khi HIỆN, không chạy lúc ẩn
 *   .gm-busy { position: absolute; inset: 0; z-index: 70; display: flex; flex-direction: column;
 *     align-items: center; justify-content: center; gap: 12px; background: #0004; color: #fff; font: 700 24px sans-serif; }
 *   .gm-busy .spin { width: 64px; height: 64px; border-radius: 50%; border: 8px solid #fff;
 *     border-top-color: #f59a1d; animation: gm-spin .8s linear infinite; }
 *   @keyframes gm-spin { to { transform: rotate(360deg); } }
 *
 * Overlay gắn vào `host` (mặc định document.body; truyền phần tử stage của game qua setBusyHost) — đặt NGOÀI
 * lớp UI mà game hay xoá sạch, nếu không overlay bị xoá cùng.
 */

let busyN = 0, busyTimer = 0, busyEl = null;
let label = () => 'Loading…';
let host = () => document.body;
export const setBusyLabel = (fn) => { label = fn; };
export const setBusyHost = (fn) => { host = fn; };

/** bật/tắt overlay "Loading…" (đếm lồng nhau; chỉ hiện nếu chờ > delay ms để mạng nhanh không nháy) */
export function busy(on, delay = 150) {
  busyN = Math.max(0, busyN + (on ? 1 : -1));
  if (busyN > 0 && !busyTimer && !(busyEl && busyEl.isConnected)) {
    busyTimer = setTimeout(() => {
      busyTimer = 0;
      if (busyN <= 0) return;
      busyEl = document.createElement('div');
      busyEl.className = 'gm-busy';
      busyEl.innerHTML = '<div class="spin"></div><div class="lbl"></div>';
      busyEl.querySelector('.lbl').textContent = label();
      host().appendChild(busyEl);
    }, delay);
  }
  if (busyN === 0) {
    clearTimeout(busyTimer); busyTimer = 0;
    if (busyEl) { busyEl.remove(); busyEl = null; }
  }
}

const cache = new Map();   // url -> Promise<void> (lỗi thì xoá để lần sau thử lại)
function loadUrl(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((res) => {
      const im = new Image();
      im.onload = () => (im.decode ? im.decode().catch(() => { }) : Promise.resolve()).then(res);
      im.onerror = () => { cache.delete(url); res(); };   // lỗi: không chặn giao diện
      im.src = url;
    }));
  }
  return cache.get(url);
}

/** ẩn `node` (ĐÃ gắn vào DOM) tới khi ảnh bên trong tải xong; trả Promise xong khi hiện */
export function revealWhenReady(node, maxWait = 8000) {
  node.classList.add('ui-wait');
  const urls = new Set();
  for (const im of node.querySelectorAll('img')) if (im.src && !im.complete) urls.add(im.src);
  for (const e of [node, ...node.querySelectorAll('*')]) {
    const bg = getComputedStyle(e).backgroundImage;
    if (bg && bg !== 'none') for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(m[1]);
  }
  const done = () => node.classList.remove('ui-wait');
  const pending = [...urls].map(loadUrl);
  if (!pending.length) { done(); return Promise.resolve(); }
  busy(true);
  return Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, maxWait))])
    .then(() => { busy(false); done(); });
}
