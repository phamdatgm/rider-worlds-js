# Thay đổi của kit

[VERSION](VERSION) là phiên bản của kit, dạng **`MAJOR.MINOR.PATCH`** (semver). Phiên bản của **game** là chuyện khác: `yymmddXX` trong `game.json`, do `tools/bump-version.mjs` tăng mỗi lần build ([EXPORT.md §2](docs/EXPORT.md)). Game **không** ghi phiên bản kit nào: AI nhìn vào repo để biết còn thiếu gì.

| Tăng | Khi |
| --- | --- |
| **MAJOR** (`2.0.0`) | Thay đổi phá vỡ: game không sửa theo thì build hỏng hoặc `check-export` báo lỗi (đổi cấu trúc, đổi hàm bắt buộc) |
| **MINOR** (`1.1.0`) | Thêm yêu cầu hoặc tính năng mà game phải làm theo (mục có "Game cần làm") |
| **PATCH** (`1.0.2`) | Sửa lỗi tool, SDK hay tài liệu; game chỉ cần chép đè kit |

**Nâng cấp một game** (từ bản kit sau):
1. Chép đè cả folder kit mới vào `docs/GMSDK_JS/`, **giữ `config.json`, `analytics.json` và `licenses.json`**.
2. Kéo [PROMPT.md](PROMPT.md) vào khung chat.

AI xét từng mục, từ cũ (dưới cùng) tới mới. Repo còn **dấu hiệu** của mục nào thì làm phần "Game cần làm" của mục đó. Không còn dấu hiệu nào là game đã theo kịp kit.

**Người sửa kit:** mỗi thay đổi mà game phải làm theo thì:
- tăng `VERSION` theo bảng trên;
- thêm một mục ở đầu danh sách, tiêu đề `## <x.y.z> — <yyyy-mm-dd>`, gồm "Thay đổi", "Dấu hiệu" (kiểm được trên repo: file, khoá, lệnh) và "Game cần làm".

Thay đổi chỉ ở tài liệu thì không cần mục.

## 1.0.1 — 2026-10-22

### Bản đầu

Kit gắn **gmsdkjs 1.0.1** (trên server ở thư mục riêng `…/gmsdkjs/1.0.1/`, template ở `…/gmsdkjs/templates/1.0.1/`: [SERVER_NOTES.md](docs/SERVER_NOTES.md)) vào game web. Tổng quan cả hệ thống: [OVERVIEW.md](docs/OVERVIEW.md).

**Có gì**
- **Màn loading đi đầu** ([LOADING.md](docs/LOADING.md)): `loader.js` (`loading/loader.js` → `public/loader.js`) là script **duy nhất** trang nạp. Hiện màn loading ngay, tải `gmsdkjs.js` và `game.js` song song, mỗi file tối đa 3 lần (10 giây mỗi lần, nghỉ 1 rồi 2 giây). gmsdkjs **bắt buộc**: 3 lần vẫn lỗi thì "Connection problem… reload the page" + nút Reload (trang dev chạy tiếp không SDK). Game điều khiển màn qua `loading/loading.js` (`createLoader()`: `progress`, `setTitle`, `error`, `hide`).
- **Giao diện màn loading: mẫu kit hoặc của game** ([LOADING.md §1.1](docs/LOADING.md)): AI luôn hỏi chủ game một lần, ghi `config.json` → `loadingScreen` (`"kit"` | `"game"`). Ảnh và giao diện nằm trong `public/icons/` (tên cố định: `loading.webp`, `logo.webp`, `loader.css`); `"game"` thì `loader.css` mang giao diện của game (ảnh, logo, thanh tải, vị trí, màu, font), luồng vẫn của kit. `loader.js` chờ `loader.css` tối đa 0,5 giây trước khi hiện màn.
- **Bắt đầu game:** `sdk = await loadSDK({ gameCode })` là việc đầu tiên trong `async function boot()`. **Không `await` ở cấp ngoài cùng của file** (gói IIFE; `check-export --src` cảnh báo).
- **Lưu dữ liệu là của kit** (`sdk/storage.js`, [INTEGRATION.md §6](docs/INTEGRATION.md)): key `azgames.<gameCode>`, giá trị `gm1` + mã kiểm + JSON nén LZ (lz-string 1.5.0, MIT) trộn theo key: nhỏ khoảng 10 lần, không đọc được, sửa tay là save bị bỏ. Đồng bộ; tracking `save_tampered`, `save_failed`, `save_large`; trang dev có `gmSave.dump()`. gmsdkjs chỉ giữ tên GMA ở `gma_<gameCode>.name`.
- **Bảng xếp hạng** ([LEADERBOARD.md](docs/LEADERBOARD.md)): `leaderboard/` gửi điểm có ký HMAC, top hôm nay / tuần / tháng / mọi lúc, hạng của người chơi; tên và cờ lấy từ hồ sơ GMA (save chỉ là bản sao dự phòng); `ui.js` màn hình mặc định, 252 cờ. `config.json` → `leaderboardId`.
- **Ngôn ngữ** ([INTEGRATION.md §7](docs/INTEGRATION.md)): `i18n/<thẻ BCP 47>.json`; lúc mở game theo lựa chọn đã lưu → `GMSDKJS_OPTIONS.language` → `defaultLanguage`.
- **Loại thiết bị** ([API.md §10](docs/API.md)): `GMGameSDK.getDeviceType()` (`desktop` | `mobile` | `tablet`); GMA tới sau `loadSDK()`, có hàm chờ mẫu.
- **Build một gói cho mọi portal** ([EXPORT.md](docs/EXPORT.md)): `bump-version` (version `yymmddXX`, mã game tạm khi chưa có) → Vite → `compress` (PNG → WebP, nhạc → MP3; không đụng `icons/`) → `assemble` (trang gm từ template 1.0.1) → `check-export` → `zip`. Ra **`export/build/<version>-<id>/<version>-<id>.zip`**. Hỏi rồi mới commit và đẩy git.
- **`check-export`** kiểm cả tên file **đúng chữ hoa / thường** (Windows không phân biệt, CDN có): chỉ chặn build khi chắc chắn hỏng trên CDN (code gọi tên khác chữ hoa / thường với file trong gói, kể cả thư mục trước `${…}` của đường dẫn ghép lúc chạy); không tìm thấy file chỉ cảnh báo (có thể là khoá atlas); file của kit không cần ghi trong `licenses.json`; `loader.js` đúng bản kit, `icons/` và skin của màn loading, dòng bản quyền chỉ từ `sdk/copyright.js` (mặc định `© 2026 Azgames.io`), giấy phép asset, sự kiện tracking, quy chuẩn repo.
- **Game trong iframe, nhiều tên miền** ([EMBED.md](docs/EMBED.md)): luật ngắn trong `PROMPT.md` (file khác tên miền, đọc điểm ảnh, worker, nhiều luồng, âm thanh, toàn màn hình, phím, trang cha: được dùng khi đủ điều kiện, có đường lui); `check-export` báo lỗi file `http://`, nhắc file từ tên miền khác, ảnh ngoài chưa đặt `crossOrigin`, Worker từ URL, `SharedArrayBuffer` chưa kiểm `crossOriginIsolated`; QA 7.9.
- **More Games trên trang dev:** server không trả link trên localhost nên nút bị ẩn, không kiểm được. Shim trả `https://azgames.io` (`DEV_MORE_GAMES`) trên trang dev (`platform: 'dev'`): nút luôn hiện để kiểm; trên portal vẫn theo server ([INTEGRATION.md §9](docs/INTEGRATION.md)).
- **Game có sẵn đang tự lưu dữ liệu:** AI hỏi chủ game 3 phương án (kệ / chuyển đổi / người cũ giữ kiểu cũ), làm theo phương án được chọn ([AI_INSTALL.md](AI_INSTALL.md), Cách làm). Code save cũ đặt ở `src/legacy-save.js`, file duy nhất ngoài kit `check-export` cho dùng `localStorage`.
- **QA** ([QA.md](docs/QA.md)): checklist theo portal; **ảnh 8 cỡ màn hình** (`tools/screens.mjs`) chụp **một lần mỗi game** khi chủ game đồng ý (cần đồ hoạ bản cuối), ra `export/qa/<version>-<id>/`.
- **Marketing kit** ([HANDOFF.md](docs/HANDOFF.md), [PROMPT_MARKETING.md](PROMPT_MARKETING.md)): làm **một lần mỗi game**, hỏi sau khi có ảnh QA (cần bản game hoàn thiện), ra `export/marketing/<version>-<id>/`; cover / banner vẽ theo ảnh gameplay thật.
- **Quy chuẩn repo game** ([INTEGRATION.md §1](docs/INTEGRATION.md)): game ở gốc (`src/` + `public/`), tài liệu `docs/gdd/`, `docs/plan/`, `docs/qa/<version>.md`, kit ở `docs/GMSDK_JS/`.

**Dấu hiệu:** game chưa có `docs/GMSDK_JS/` hoặc `src/sdk/gmsdkjs-shim.js`; còn SDK cũ (`JS_GMSDK/`, `JS_SDK_*/`, `gmsdkv2.js`, `AZ_SETTINGS`, `Language/`).

**Game cần làm:** cài kit theo [AI_INSTALL.md](AI_INSTALL.md) (game mới: [NEW_GAME.md](docs/NEW_GAME.md); game có sẵn: trường hợp "Gắn SDK", kể cả Bước 4 bỏ SDK cũ).
