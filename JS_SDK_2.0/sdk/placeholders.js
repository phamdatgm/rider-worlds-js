/**
 * Những giá trị MẪU — nhìn là biết ngay chưa ai điền.
 *
 * Cố tình đặt tên chung chung (`idgame`, `tengame`, `idleaderboard`) chứ không phải một id
 * trông giống thật. Đọc config thấy `gameId: 'idgame'` là hiểu ngay "chưa điền", còn thấy
 * `gameId: 'slope-rush'` ở một game tên khác thì **không ai nhận ra** — giá trị thật của game
 * trước trông hoàn toàn bình thường. Đó là cái bẫy nguy hiểm nhất khi mang kit đi nơi khác.
 *
 * Danh sách này được dùng ở HAI chỗ, và phải là cùng một danh sách:
 *   - `tools/setup.mjs` — từ chối nhận, hỏi lại
 *   - `sdk/gmsdk.js`    — từ chối khởi động lúc chạy
 */

/** Mẫu của chính kit này, cộng id của các game đã dùng kit (đừng để kế thừa ngầm). */
export const PLACEHOLDERS = new Set([
  '', 'null', 'undefined',
  'idgame', 'tengame', 'idleaderboard', 'tiento',
  'id-game', 'ten-game', 'id-leaderboard',
  'slope-rush', 'slope rush', 'xlope-2', 'slope', 'game-moi',
]);

/** @param {unknown} v @returns {boolean} giá trị này còn là mẫu / của game khác? */
export const isPlaceholder = (v) => PLACEHOLDERS.has(String(v ?? '').trim().toLowerCase());
