/**
 * Mấy hàm DOM dùng chung cho các UI mẫu trong thư mục này (`leaderboardUi.js`,
 * `profileUi.js`).
 *
 * **Đây KHÔNG phải tầng dịch vụ.** Nó không biết gì về SDK hay bảng xếp hạng — chỉ là mấy
 * tiện ích dựng thẻ div, dán sprite và tải ảnh. Viết UI mới thì dùng lại hoặc bỏ, tuỳ; thay
 * `leaderboardUi.js` không làm hỏng `profileUi.js` và ngược lại, vì cả hai chỉ dựa vào file
 * này chứ không dựa vào nhau.
 *
 * HAI THỨ ĐÃ TRẢ GIÁ MỚI CÓ, đừng bỏ khi viết lại UI:
 *
 * 1. **Chờ ảnh rồi hiện MỘT LƯỢT.** Ảnh nền CSS trên phần tử `display:none` KHÔNG được trình
 *    duyệt tải cho tới khi phần tử hiện ra. Vẽ khung trước rồi để ảnh pop vào sau trông rất tệ.
 * 2. **Giữ tham chiếu ảnh đã tải** (`decodeImage`). Bỏ đi thì thứ duy nhất giữ ảnh là cache
 *    trình duyệt, mà cache bị xoá khi thiếu bộ nhớ hoặc khi tab nằm nền một lúc — quay lại
 *    trang, rê chuột, nút trắng trơn.
 */

/** Thư mục ảnh của các UI mẫu, tính từ gốc web. Chép `JS_Leaderboard/art/*` vào đây. */
export const DIR = 'assets/leaderboard/';
export const GREEN = '#00FF00';

export const box = (parent, { left, top, width, height }, style = {}) => {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute', left: `${left}px`, top: `${top}px`,
    width: `${width}px`, height: `${height}px`, ...style,
  });
  parent?.appendChild(el);
  return el;
};

export const centred = (parent, cx, cy, w, h, style) =>
  box(parent, { left: cx - w / 2, top: cy - h / 2, width: w, height: h }, style);

export function text(parent, cx, cy, value, size, style = {}) {
  const el = centred(parent, cx, cy, 0, 0, {
    display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'pre',
    fontSize: `${size}px`, color: GREEN, lineHeight: '1', ...style,
  });
  el.textContent = value;
  return el;
}

export const setSprite = (el, file, fit = '100% 100%') => {
  el.style.backgroundImage = `url("${DIR}${file}")`;
  el.style.backgroundSize = fit;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundPosition = 'center';
};

/** Ảnh 9-slice qua border-image. `tint` tô màu phần viền, dùng cho khung chọn. */
export function sliced(el, file, border, tint = null) {
  el.style.borderStyle = 'solid';
  el.style.borderWidth = `${border}px`;
  el.style.borderImage = `url("${DIR}${file}") ${border} fill / ${border}px stretch`;
  el.style.boxSizing = 'border-box';
  if (tint) {
    el.style.webkitMaskImage = `url("${DIR}${file}")`;
    el.style.maskImage = `url("${DIR}${file}")`;
    el.style.backgroundColor = tint;
  }
}

export const flagUrl = (iso) => `${DIR}flags/${String(iso ?? '').toUpperCase()}.png`;

/**
 * Tải + **giải mã** một ảnh, rồi **giữ lại**. `onload` mới chỉ là có bytes; giải mã vẫn rơi
 * vào frame vẽ đầu tiên nếu không gọi `decode()`. Xem điểm 2 ở đầu file.
 */
const held = new Map();
export function decodeImage(url) {
  const hit = held.get(url);
  if (hit) return hit.ready;
  const img = new Image();
  const ready = new Promise((resolve) => {
    const done = () => resolve();
    img.onload = () => (img.decode ? img.decode().then(done, done) : done());
    img.onerror = () => { held.delete(url); resolve(); };   // thiếu ảnh không được treo UI
    img.src = url;
  });
  held.set(url, { img, ready });
  return ready;
}

export const decodeImages = (urls) => Promise.all([...new Set(urls)].map(decodeImage));

/** Hover kiểu ButtonFx: đổi sprite + phóng to, 0.15s. `scale = 1` là chỉ đổi sprite. */
export function buttonFx(el, normal, hover, scale = 1.05) {
  let over = false;
  const base = (el.style.scale || '1').trim().split(/\s+/).map(Number);
  const bx = Number.isFinite(base[0]) ? base[0] : 1;
  const by = Number.isFinite(base[1]) ? base[1] : bx;
  const at = (k) => `${bx * k} ${by * k}`;
  el.style.cursor = 'pointer';
  el.style.transition = 'scale 0.15s cubic-bezier(0.5, 1, 0.89, 1)';
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;      // chạm không được "hover" dính lại
    over = true; setSprite(el, hover); el.style.scale = at(scale);
  });
  el.addEventListener('pointerleave', () => { over = false; setSprite(el, normal); el.style.scale = at(1); });
  el.addEventListener('pointerdown', () => { el.style.scale = at(1); });
  el.addEventListener('pointerup', () => { el.style.scale = at(over ? scale : 1); });
  setSprite(el, normal);
}

/** "LOADING…" ở giữa trong lúc chờ mạng và chờ ảnh. Xem điểm 1 ở đầu file. */
export function busyOverlay(parent, cx, cy) {
  const el = centred(parent, cx, cy, 0, 0, {
    display: 'none', alignItems: 'center', justifyContent: 'center', whiteSpace: 'pre',
    fontSize: '48px', color: GREEN, lineHeight: '1',
  });
  let timer = 0, dots = 0;
  return {
    show() {
      el.style.display = 'flex';
      clearInterval(timer);
      timer = setInterval(() => { dots = (dots + 1) % 4; el.textContent = `LOADING${'.'.repeat(dots)}`; }, 300);
      el.textContent = 'LOADING';
    },
    hide() { clearInterval(timer); timer = 0; el.style.display = 'none'; },
  };
}
