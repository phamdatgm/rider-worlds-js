# BUILD_RULES — quy tắc bắt buộc cho mọi game dùng kit

Rút ra từ **Ant Flow** (10/2026). Đọc trước khi build bản đầu tiên. Mỗi mục có **cổng chặn** trong `tools/build.mjs`: làm sai thì build **dừng**, không ra bản lỗi.

---

## 1. Dòng bản quyền + version

**Hiển thị:** trong panel **Settings (Cài đặt)**:
- **góc dưới trái:** version, ví dụ `V1.0`;
- **góc dưới phải:** dòng bản quyền, ví dụ `© 2026 Azgames.io`.

> **Game không có panel Settings?** Thì **HỎI chủ game** muốn đặt ở đâu (màn Home, màn Pause, popup Info…), đừng tự chọn.
> AI hoặc dev làm game phải dừng lại hỏi câu này trước khi đặt.

**Cài đặt:**
1. Copy `template/config.runtime.mjs` → `<webDir>/src/config.mjs`, điền `appVersion` và `notice`.
2. Copy `template/notice.js` → `<webDir>/src/notice.js`, chạy `node JS_SDK_2.0/tools/notice-hash.mjs`, dán dòng `EXPECT` nó in ra.
3. Trong game:
   ```js
   import { NOTICE, APP_VERSION, noticeOk, halt } from './notice.js';
   // boot, TRƯỚC khi chạy game
   if (!noticeOk()) { halt(); return; }
   // dựng panel Settings
   foot.innerHTML = `<span class="ver">${APP_VERSION}</span><span class="copy">${NOTICE}</span>`;
   if (!noticeOk(foot.querySelector('.copy').textContent)) halt();
   // vòng lặp game
   if (globalThis.__gmHalt) return;
   ```

**Dòng bản quyền bị khoá:**
- `EXPECT` là số băm FNV-1a của `notice`. Build tính lại từ config: lệch thì **dừng** và in ra số đúng.
- Bản build tách **`loader.js`** (file **duy nhất** trang nạp, **làm rối mạnh** bằng javascript-obfuscator: chuỗi mã hoá rc4, làm phẳng luồng, chèn mã chết, selfDefending) và **`framework.js`** (toàn bộ game, chỉ minify).
- Loader tự kiểm dòng bản quyền, đặt `window.__gmnk` = số băm, rồi mới nạp framework.
- Sửa `©` trong framework.js → băm không khớp → `halt()`, game dừng. Nạp thẳng framework.js bỏ qua loader → thiếu `__gmnk` → game cũng dừng.
- Build kiểm thêm: framework.js phải còn đúng dòng bản quyền; loader.js **không được** còn đọc được chuỗi bản quyền.

Đổi dòng bản quyền (ví dụ sang năm 2027): sửa `notice` → chạy `notice-hash.mjs` → dán `EXPECT` mới. Đổi version thì chỉ sửa `appVersion`.

---

## 2. Bản build không được còn ghi chú dev / tiếng Việt

Code nguồn cứ ghi chú tiếng Việt thoải mái. **Bản build thì không được còn:**
- **JS:** esbuild gộp và minify với `legalComments: 'none'`, nên mọi ghi chú bị bỏ.
- **CSS** (`config.cssFiles`): minify, nên mọi ghi chú bị bỏ.
- **HTML:** xoá `<!-- -->` (trừ cái chứa `PRODUCT_VERSION` của portal), minify `<script>` và `<style>` viết thẳng trong trang, cả ở `index.html` lẫn vỏ portal.
- **Tiếng Việt chỉ được nằm trong bảng dịch:** các file khai báo ở `config.check.allowVietnamese`, thường là file i18n có khối `vi`.
  - Mọi chuỗi tiếng Việt khác (log, lỗi, thông báo) đều tính là lỗi.
  - **Log / console / thông báo lỗi cho dev: viết tiếng Anh.**
  - Chữ cho người chơi: đặt trong bảng dịch.

**Cổng chặn:** `tools/check_build.py` chạy **tự động cuối mỗi lần build**:
- quét **mọi file văn bản** trong `Build/<v>/` (html, js, css, json, txt), tìm ghi chú `<!-- -->`, `/* */`, `//` đầu dòng và chữ tiếng Việt ngoài bảng dịch;
- gặp lỗi thì build **dừng** (exit 1) và liệt kê từng chỗ.

Chạy tay: `python JS_SDK_2.0/tools/check_build.py Build/<v> --allow web/src/i18n.js`.

Thiếu Python thì build **cảnh báo to** là chưa quét. Đừng ship bản chưa quét.

---

## 3. Tải tài nguyên: không bao giờ treo, không bao giờ kẹt

Mạng portal (mobile, wifi trường học) chập chờn. Có **ba kiểu hỏng làm game kẹt**, và cả ba đều đã xảy ra:

| Kiểu hỏng | Hậu quả |
|---|---|
| Request **treo, không trả lời** | `fetch` / `new Image()` không bao giờ xong → **màn loading đứng mãi**, console sạch |
| Lỗi một lần, Promise lỗi bị **giữ trong cache** (Map) | Tài nguyên đó hỏng tới khi tải lại trang (ví dụ: một màn không vào được nữa) |
| `await document.fonts.ready` mà font treo | Màn loading đứng |

**Dùng `sdk/net.js`** (copy vào `src/sdk/`):
```js
import { loadImage, loadJSON, fetchRetry, fontsReady, NET } from './sdk/net.js';
```
- Mỗi lần thử có **giới hạn thời gian** (`NET.TIMEOUT` = 15s). Treo cũng tính là lỗi.
- **Thử lại** tối đa `NET.TRIES` = 3 lần, nghỉ 0,6s rồi 1,5s; lần thử lại thêm `?r=n` để tránh bản lỗi trong HTTP cache.
- `fontsReady(4000)`: chờ font tối đa 4s.
- **Cache Promise thì phải xoá khi lỗi:**
  ```js
  cache.set(k, loadJSON(url).catch(e => { cache.delete(k); throw e; }));
  ```
- **Lỗi lúc khởi động** thì hiện **popup cho người chơi** (chữ đã dịch, ví dụ "Couldn't load the game. Please check your internet connection and try again.") kèm nút **Try again** (`location.reload()`). **Không** hiện câu dành cho dev.
- **Ảnh chỉ để trang trí** (icon DOM) lỗi thì đừng chặn game.
- **`loader.js` của bản build** tự thử nạp `framework.js` 3 lần; hỏng hẳn thì dòng `#load-text` của màn loading hiện "Connection problem. Tap to retry.".

---

## 4. Giao diện chỉ hiện khi ảnh đã tải xong

Game DOM hay **nháy**: khung popup hiện trước, icon / nút / nền hiện sau. **Dùng `sdk/uiReady.js`:**
```js
import { revealWhenReady, busy, setBusyLabel, setBusyHost } from './sdk/uiReady.js';
setBusyLabel(() => t('loadingDots'));                    // "Loading…" đã dịch
setBusyHost(() => document.getElementById('stage'));     // NGOÀI lớp UI mà game hay xoá sạch
root.appendChild(popup); revealWhenReady(popup);          // gọi NGAY sau khi gắn vào DOM: Home, HUD, mọi popup
busy(true); const lv = await loadLevel(n); busy(false);   // tải dữ liệu (màn mới…)
```
- Node bị ẩn (`visibility`) tới khi **mọi `<img>` và ảnh nền CSS** bên trong đã tải và giải mã xong.
- Chờ quá 150ms thì hiện vòng xoay **"Loading…"**. Mạng nhanh hoặc ảnh có sẵn thì hiện ngay, không nháy.
- Chờ **tối đa 8s**; quá thì vẫn hiện, để **không bao giờ kẹt**.
- CSS cần dán vào stylesheet của game: xem đầu file `sdk/uiReady.js` (`.ui-wait`, `.gm-busy`, `@keyframes gm-spin`). Hiệu ứng mở popup phải tắt khi đang `.ui-wait`, để nó chạy lúc popup hiện ra.

**Đã kiểm ở Ant Flow** (giả lập mạng bằng Chrome DevTools Protocol):

| Tình huống | Kết quả |
|---|---|
| Mạng nhanh | Không hiện "Loading…" |
| Trễ 0,7s, 400 KB/s | Popup hiện sau khoảng 2s với đủ ảnh |
| Ảnh bắt buộc bị chặn | Thử 3 lần → popup "Oops!" + Try again |
| Request treo | Popup lỗi sau khoảng 50s, không đứng mãi |
| framework.js lỗi | Loader báo "Connection problem" |

---

## 5. Checklist trước khi upload

- [ ] `config.mjs` và `src/config.mjs`: `confirmedFor === gameId` (đã hỏi bên vận hành), `portalGid` không có `-az`.
- [ ] Version `appVersion` đã tăng; dòng bản quyền hiện đúng chỗ (Settings, hoặc chỗ chủ game đã chọn).
- [ ] `npm run build` qua hết: cổng danh tính, EXPECT, WebP, **check_build OK**.
- [ ] Mở `Build/<v>/<v>/index.html` qua server tĩnh: chơi được, chân Settings đúng.
- [ ] Mở `Build/<v>/preview.html` (vỏ thật, `?debug`): console có `[analytics] loaded_game`.
- [ ] Upload thư mục `Build/<v>/` (`index.html`, `preview.html`, `version.txt`, `<v>/`).
