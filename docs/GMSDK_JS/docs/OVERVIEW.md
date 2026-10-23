# Tổng quan: kit GMSDK JS 1.0.1 + gmsdkjs 1.0.1

Một trang để thấy cả hệ thống: game chạy từ lúc mở trang tới lúc chơi qua những bước nào, phần nào nằm ở đâu, kit quy định những gì. Chi tiết từng phần ở các file được dẫn.

## 1. Gói game

```
<version>-<id>/
├── index.html      template của portal (tool build ghép; kit ghép trang gm bằng assemble)
├── loader.js       của kit (loading/loader.js, chép nguyên): script DUY NHẤT trang nạp
├── game.js         code game + các module của kit, Vite bundle thành 1 file
├── game.json       id, gameCode, name, version (yymmddXX), languages, leaderboardId…
├── icons/          loading.webp (key art), logo.webp, loader.css (giao diện: kit hoặc của game): màn loading, tên cố định
├── i18n/           <thẻ ngôn ngữ>.json
└── assets/         ảnh, nhạc, dữ liệu
```

## 2. Luồng chạy

```
1. Trình duyệt mở index.html
   └─ GMSDKJS_OPTIONS (inline: platform, sdkType, gameId, gameCode, sdkUrl, language, api, gma, brand…)
      + <div id="game"> + <script src="loader.js">           (script duy nhất của trang)

2. loader.js chạy ngay
   ├─ dựng màn loading: icons/loading.webp, logo (không có trên gd / crazy / poki), tên game, thanh %; giao diện theo icons/loader.css
   ├─ tải SONG SONG, mỗi file tối đa 3 lần (10 giây mỗi lần, nghỉ 1 rồi 2 giây):
   │    ├─ gmsdkjs.js (sdkUrl; mặc định …/gmsdkjs/1.0.1/gmsdkjs.js)   kiểm thêm: phải có window.GMSDKJS
   │    └─ game.js
   │   hai file này chạy thanh 0 → 30 %
   ├─ gmsdkjs 3 lần vẫn lỗi → "Connection problem. Please check your network and reload the page." + nút Reload; DỪNG
   │    (chỉ trang dev, platform 'dev', chạy tiếp không SDK để làm game khi mất mạng)
   └─ đủ hai file → window.GMLoader.ready() trả SDK cho game

3. gmsdkjs.js chạy (ngay khi tải xong)
   ├─ licence: chuyển trang nếu mở ngoài portal; màn khoá nếu site không được phép
   ├─ quảng cáo: tải SDK của mạng (H5 / GD / CrazyGames / Poki / WeeGoo), giãn cách, tạm dừng game khi có quảng cáo
   └─ GMA: tải gm-sdk.js, đăng nhập ẩn danh (tên ở key gma_<gameCode>.name), tracking

4. game.js chạy
   ├─ boot(): sdk = await loadSDK({ gameCode })          chờ bước 2 xong
   ├─ sdk.storage (bộ lưu của kit) mở key azgames.<gameCode>, giải mã
   ├─ initI18n: bảng dịch theo lựa chọn đã lưu → language của trang → defaultLanguage
   ├─ tải tài nguyên → loader.progress(p)               thanh 30 → 100 %, chuyển cho gmsdkjs → portal
   ├─ dựng menu
   └─ loader.hide()                                     ẩn màn + sdk.loadingDone() → preroll → người chơi thấy menu

5. Trong lúc chơi
   ├─ quảng cáo, tạm dừng, tracking: gmsdkjs (qua sdk.*)
   ├─ lưu: sdk.storage (ghi sau 300 ms, ghi ngay khi tab ẩn / đóng)
   └─ bảng xếp hạng: leaderboard/ của kit, dùng GMGameSDK mà gmsdkjs đã đăng nhập
```

## 3. Phần nào ở đâu

| Việc | Ở đâu | Ai giữ |
| --- | --- | --- |
| Template từng portal (`GMSDKJS_OPTIONS`, nạp `loader.js`) | Server, `templates/gamesforfree-<portal>.html` (hai host) | Server |
| Màn loading, thanh %, tải và thử lại gmsdkjs + `game.js`, màn Reload | `loading/loader.js` → `loader.js` | Kit |
| Licence, màn khoá, chuyển trang | `gmsdkjs.js` | Server |
| Quảng cáo mọi mạng, giãn cách, tạm dừng, adblock | `gmsdkjs.js` | Server |
| Tracking GMA, sự kiện tự gửi, đăng nhập ẩn danh (`gma_<gameCode>.name`) | `gmsdkjs.js` | Server |
| Thương hiệu, More Games, trademark | `gmsdkjs.js` | Server |
| **Lưu dữ liệu game** (`azgames.<gameCode>`, nén + mã hoá, chống sửa tay) | `sdk/storage.js` (trong `game.js`) | Kit |
| `loadSDK()` / `getSDK()`, bọc mọi hàm an toàn, `sdk.storage` | `sdk/gmsdkjs-shim.js` | Kit |
| Điều khiển màn loading từ game | `loading/loading.js` | Kit |
| Ngôn ngữ, tải file có thử lại, dòng bản quyền | `sdk/i18n.js`, `net.js`, `copyright.js` | Kit |
| Bảng xếp hạng | `leaderboard/` | Kit |
| Gameplay, tài nguyên, tiến độ tải, chỗ đặt quảng cáo | Code game | Game (AI theo kit) |
| Build: bump-version → Vite → nén → `assemble` → `check-export` → zip | `tools/` | Kit |
| Obfuscate `loader.js` + `game.js`, khoá domain, trang từng portal, CDN | Tool build trên API | Server |

## 4. gmsdkjs 1.0.1 trên server

Kit này dùng **gmsdkjs 1.0.1** ở **thư mục riêng** `…/gmsdkjs/1.0.1/` (`https://games.1games.io/lib/1games/gmsdkjs/1.0.1/gmsdkjs.js`; az: `api.azgame.io/static/lib/azgames/gmsdkjs/1.0.1/`). Chi tiết, thứ tự đưa lên, quy ước thư mục theo phiên bản: [SERVER_NOTES.md](SERVER_NOTES.md).

- **Không lưu dữ liệu game**: lưu là của kit (`sdk/storage.js`). gmsdkjs chỉ giữ tên GMA ở key riêng **`gma_<gameCode>.name`**.
- Được `loader.js` chèn bằng code (không có thẻ `gmsdkjs.js` trong template).
- **Template 1.0.1** (`templates/1.0.1/`, 4 portal × 2 host): chỉ `<script src="loader.js">`; `GMSDKJS_OPTIONS` có `sdkUrl` (gmsdkjs 1.0.1 của chính host đó) và `language: "<!--LANGUAGE-->"`.
- **Tool build** trên API: obfuscate `loader.js` + `game.js`; thay `icons/logo.webp` bằng logo brand của publisher; các file khác trong `icons/` (`loading.webp`, `loader.css`, ảnh của giao diện game) giữ nguyên.

## 5. Kit quy định những gì

| Phần | Quy định |
| --- | --- |
| Màn loading | **`loader.js`** dựng ngay khi trang mở, tải gmsdkjs + `game.js` song song 3 lần, lỗi thì báo **tải lại trang** (gmsdkjs bắt buộc, trừ trang dev); `loading.js` để game điều khiển (`progress`, `setTitle`, `error`, `hide`) |
| Giao diện màn loading | Luôn hỏi chủ game (`config.json` → `loadingScreen`): `"kit"` mẫu kit, `"game"` giao diện của game trong `icons/loader.css` (ảnh, logo, thanh, vị trí, màu); luồng vẫn là `loader.js` của kit (LOADING.md §1.1) |
| Bắt đầu game | `sdk = await loadSDK()` là việc đầu tiên trong `boot()`; **không `await` ở cấp ngoài cùng của file** (gói IIFE) |
| Lưu dữ liệu | **`sdk/storage.js`** của kit: nén LZ (UTF-16) + trộn + mã kiểm. Nhỏ khoảng 10 lần, không đọc được, sửa tay là save bị bỏ. Đồng bộ (ghi chắc lúc đóng tab). Báo `save_tampered`, `save_failed`, `save_large` |
| Shim | `sdk/gmsdkjs-shim.js`: `loadSDK()`, tìm `window.GMSDKJS` mỗi lần gọi, bọc mọi hàm an toàn; trang dev có `gmSave.dump()` |
| Gói | `loader.js` + `game.js` + `game.json` + `i18n/` + `icons/` + `assets/`; tên file đúng chữ hoa / thường (CDN phân biệt) |
| Build | `export/build/<version>-<id>/<version>-<id>.zip`; `check-export` đòi `loader.js` bằng bản kit, `icons/` đủ, skin hợp lệ, tên file khớp từng chữ |
| Trang dev | `<script src="loader.js" data-entry="src/main.js" data-module>` |
| QA | 1.4: chặn gmsdkjs → màn Reload sau 3 lần; 1.6: màn loading hiện ngay; 5.1: save không đọc được; 5.6: sửa tay save → bỏ |
| QA 8 cỡ màn hình | §2.1: 8 cỡ (4 máy tính, 3 điện thoại, 1 iPad); `tools/screens.mjs` chụp menu, AI chụp lúc chơi; **một lần mỗi game**, AI hỏi sau khi build (cần đồ hoạ bản cuối); ảnh ở `export/qa/<version>-<id>/`, không commit |
| Marketing | **Một lần mỗi game**, AI hỏi sau khi có ảnh QA (cần bản game hoàn thiện); kit ra `export/marketing/<version>-<id>/`. 3–5 ảnh gameplay thật (từ ảnh QA) đính kèm mọi prompt; ảnh phải sát gameplay, không thêm thứ game không có, không UI |
| Loại thiết bị | `GMGameSDK.getDeviceType()`: tới sau `loadSDK()`, chờ ngắn (API.md §10) |

Cài kit vào game: [AI_INSTALL.md](../AI_INSTALL.md).

## 6. Con số đã đo (máy dev, Edge)

| Việc | Kết quả |
| --- | --- |
| Màn loading hiện sau khi mở trang | ~110 ms |
| gmsdkjs bị chặn → màn Reload (3 lần, lỗi nhanh) | ~3,4 giây |
| Lần 1 treo, lần 2 được | vào game sau ~10 giây |
| Save JSON 9 KB → lưu | ~1 KB (11 %) |
| Save JSON 40 KB: mã hoá / giải mã | ~8 ms / ~2 ms |
