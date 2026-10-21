/**
 * DÒNG BẢN QUYỀN + VERSION — copy vào src/notice.js. Đọc docs/BUILD_RULES.md mục 1.
 *
 * Hiển thị: version (vd "V1.0") góc dưới TRÁI, bản quyền (vd "© 2026 Azgames.io") góc dưới PHẢI của panel
 * Cài đặt (Settings). Game KHÔNG có Settings -> HỎI chủ game muốn đặt ở đâu (màn Home, màn Pause, popup Info…),
 * đừng tự chọn.
 *
 * Dòng bản quyền bị KHOÁ:
 *   EXPECT     số băm FNV-1a 32-bit của config.notice, chốt cứng ở đây. tools/build.mjs tính lại từ config và DỪNG
 *              build nếu lệch. Đổi dòng bản quyền: sửa config.notice, chạy `node JS_SDK_2.0/tools/notice-hash.mjs`
 *              để lấy số mới, dán vào EXPECT.
 *   __gmnk     bản build: loader.js (file DUY NHẤT bị làm rối mạnh) đặt số băm này trước khi nạp framework.js.
 *              Sửa dòng © trong framework.js -> băm không khớp -> game dừng (halt). Nạp thẳng framework.js bỏ
 *              qua loader -> thiếu __gmnk -> game dừng.
 *   __GM_BUILD__  build.mjs define = true. Ở dev (src/ chạy trực tiếp) không có loader nên chỉ so với EXPECT.
 *
 * Dùng:
 *   import { NOTICE, APP_VERSION, noticeOk, halt } from './notice.js';
 *   // lúc boot, TRƯỚC khi chạy game:
 *   if (!noticeOk()) { halt(); return; }
 *   // khi dựng panel Settings:
 *   footer.innerHTML = `<span class="ver">${APP_VERSION}</span><span class="copy">${NOTICE}</span>`;
 *   if (!noticeOk(footer.querySelector('.copy').textContent)) halt();   // so cả chữ đang hiện
 *   // vòng lặp game: if (globalThis.__gmHalt) return;
 */
import { config } from './config.mjs';   // cần có: notice, appVersion

export const EXPECT = 0x44f6b5a2;
export const NOTICE = config.notice;
export const APP_VERSION = `V${config.appVersion}`;

function fnv1a(s) {
  let x = 0x811c9dc5;
  for (const ch of s) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
  return x;
}

/* global __GM_BUILD__ */
const BUILD = typeof __GM_BUILD__ !== 'undefined' && __GM_BUILD__;

/** dòng bản quyền còn nguyên? (chuỗi trong code; và nếu truyền vào: chữ đang hiện trên màn hình) */
export function noticeOk(shownText) {
  const h = fnv1a(NOTICE);
  if (h !== EXPECT) return false;
  if (BUILD && globalThis.__gmnk !== h) return false;
  if (!BUILD && globalThis.__gmnk !== undefined && globalThis.__gmnk !== h) return false;
  if (shownText !== undefined && fnv1a(String(shownText).trim()) !== h) return false;
  return true;
}

/** dừng hẳn game: cờ cho vòng lặp + ẩn giao diện. Không báo lỗi gì ra màn hình. Sửa id cho hợp game. */
export function halt() {
  globalThis.__gmHalt = true;
  for (const id of ['ui', 'stage', 'game']) {
    const n = document.getElementById(id);
    if (n) n.style.visibility = 'hidden';
  }
}
