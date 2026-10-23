# Gắn GMSDK JS vào một game: các bước

Cho người hoặc AI làm theo, từ trên xuống: game mới, game có sẵn, hay nâng cấp kit. Lệnh giao cho AI: kéo [PROMPT.md](PROMPT.md) vào khung chat. Đọc trước [docs/INTEGRATION.md](docs/INTEGRATION.md), [docs/API.md](docs/API.md) và mẫu chạy được [example/main.js](example/main.js).

## Trường hợp

Xác định trước tiên, ghi vào đầu plan:

| Repo có | Trường hợp | Làm |
| --- | --- | --- |
| Chưa có code game | **Game mới** | [NEW_GAME.md](docs/NEW_GAME.md), mô tả game lấy từ `brief` của `config.json`. `brief` trống thì hỏi chủ game: thể loại, cách chơi, engine |
| Có code, chưa gọi `getSDK` (chưa có `src/sdk/gmsdkjs-shim.js`) | **Gắn SDK** | Bước 0 → 5 bên dưới |
| Đã gắn, còn **dấu hiệu** của một mục trong [CHANGELOG.md](CHANGELOG.md) | **Nâng cấp** | Phần "Game cần làm" của mọi mục còn dấu hiệu, từ cũ tới mới; chép lại `sdk/` nếu kit có bản mới; rồi Bước 5 |
| Đã gắn, không còn dấu hiệu nào | **Chỉ kiểm** | Bước 5 (build, `check-export`, QA), báo cáo; không sửa code nếu không được yêu cầu |

## Cách làm

- **Làm trên nhánh đang checkout**, không tạo nhánh mới, không đổi nhánh.
- Commit theo từng bước, không push. Ngoại lệ duy nhất: build xong, hỏi chủ game có commit và đẩy không; đồng ý thì làm theo [EXPORT.md §9](docs/EXPORT.md).
- **Game có sẵn:** khảo sát code trước, rồi lên plan gồm file bỏ / sửa / thêm và lý do, cùng những gì giữ lại vì là luật riêng của game. **Chờ chủ game duyệt rồi mới sửa code.** Plan có thêm phần rà trải nghiệm theo [UX.md](docs/UX.md): mỗi lớp L1–L5 và bản đồ tính năng, game đã có gì, còn thiếu gì. Phần thiếu chỉ là **đề xuất**: làm khi chủ game chọn.
- **Game có sẵn đang tự lưu dữ liệu** (localStorage, IndexedDB, cookie, API lưu của engine…, không qua `sdk.storage`): lúc khảo sát, **hỏi chủ game trước khi lên plan**, đúng câu này:
  > "Game đang lưu dữ liệu kiểu cũ, chưa đồng bộ SDK 1.0.1, nên người chơi cũ sẽ mất dữ liệu cũ! Có 3 phương án: 1 Kệ, 2 làm bộ chuyển đổi data cũ theo chuẩn mới, 3 người cũ vẫn lưu kiểu cũ, người mới lưu kiểu mới?"
  Làm theo phương án chủ game chọn; cách làm do AI tự quyết, ghi vào plan. Code đọc / ghi save cũ đặt trong `src/legacy-save.js` (`check-export` cho dùng `localStorage` ở file này). Game không lưu gì thì không hỏi.
- **Game mới:** làm theo [NEW_GAME.md](docs/NEW_GAME.md) (cấu trúc, các màn, lưu, bố cục, hướng dẫn người chơi, quảng cáo). Plan trước, chờ duyệt.
- Mỗi dòng trong `notes` của `config.json` là một yêu cầu riêng của game này: làm theo, và báo lại từng dòng trong báo cáo.
- **Cấu trúc repo và tài liệu theo quy chuẩn** [INTEGRATION.md §1](docs/INTEGRATION.md): game ở `src/` + `public/`; thiết kế game ghi vào `docs/gdd/`, kế hoạch và spec vào `docs/plan/`, báo cáo QA vào `docs/qa/<version>.md`. Kể cả khi công cụ AI quen ghi chỗ khác (`docs/superpowers/…`). Game có sẵn mà tài liệu đang ở chỗ khác: plan gồm cả việc chuyển về đúng chỗ.

## Bước 0. Giá trị của game: `config.json`, không đoán

Mọi giá trị định danh nằm trong **`docs/GMSDK_JS/config.json`**, ngay trong folder kit: chép kit sang dự án khác là mang theo cấu hình. Chủ game chép từ [config.example.json](config.example.json) rồi điền. File này không vào gói xuất, và bản gốc của kit không có nó (nâng cấp kit là chép đè folder mà vẫn giữ `config.json`, `analytics.json` và `licenses.json`).

| Khoá | Ví dụ | Dùng ở |
| --- | --- | --- |
| `id`: slug của game trên portal | `wheelie-spooky` | `game.json`, trang dev |
| `gameCode`: `g<số>` | `g131` | `game.json`, trang dev, `loadSDK({ gameCode })` |
| `name`: tên hiển thị | `Wheelie Spooky` | `game.json` |
| `languages`, `defaultLanguage` | `["en", "es", "zh-TW"]` / `en` (thẻ BCP 47) | `game.json`, `i18n/` |
| `compress` | `{ "images": "normal", "audio": "normal", "keep": [] }` | Mức nén ảnh / nhạc khi build (`tools/compress.mjs`, [EXPORT.md §4](docs/EXPORT.md)). **Hỏi chủ game một lần:** "Nén ảnh (PNG → WebP) và nhạc (MP3) theo mức kit khuyến nghị không?" Mặc định có (`normal`); không thì `off`; ảnh code đọc từng điểm ảnh thì liệt kê ở `keep` |
| `loadingScreen` | `"kit"` hoặc `"game"` | Giao diện màn loading ([LOADING.md §1.1](docs/LOADING.md)). **Luôn hỏi chủ game một lần**, kể cả game chưa có màn loading riêng: "Màn loading: dùng mẫu mặc định của kit, hay dùng giao diện màn loading của game?" `"game"`: dựng giao diện của game trong `public/icons/loader.css` (+ ảnh trong `icons/`); luồng vẫn của kit |
| `gdKey`: Game ID GameDistribution | 32 ký tự hex, ghi thẳng vào đây; `null` = chưa lên GD. **Không dùng file `.env`** | `game.json` → `portals.gd.gameKey` |
| `leaderboardId` | `leaderboard-topscore` hoặc `null` | Id bảng xếp hạng trên GMA ([LEADERBOARD.md](docs/LEADERBOARD.md)); `null` = game không có bảng |
| `brief` | `"Đua xe một bánh, giữ thăng bằng, Phaser"` hoặc `null` | Mô tả game mới; game có sẵn để `null` |
| `notes` | `["Save cũ ở azgames.g0: chuyển sang azgames.g475"]` | Luật riêng của game |

Cạnh `config.json` còn có **`analytics.json`**: từ điển sự kiện của game (level, màn, item, tính năng…) để phân tích trên GMA. **Không ai viết tay:** AI sinh nó sau khi gắn sự kiện ở Bước 3 ([ANALYTICS.md §6](docs/ANALYTICS.md)).

Và **`licenses.json`**: nguồn và giấy phép của mọi font, âm thanh, ảnh ([ASSETS.md](docs/ASSETS.md)). Game có sẵn: AI rà asset, ghi từng nhóm file. File nào không rõ nguồn thì ghi `"origin": "unknown"` và hỏi chủ game, **không đoán giấy phép**.

Kiểm trước khi làm, ở gốc repo: `node docs/GMSDK_JS/tools/check-export.mjs` phải báo `OK`.

**`config.json` là nguồn duy nhất.** `tools/bump-version.mjs` (bước đầu của mọi lần build) chép `id`, `gameCode`, `name`, `languages`, `defaultLanguage`, `gdKey` sang `public/game.json` và trang dev `index.html`. Đổi giá trị thì chỉ sửa `config.json`; không sửa tay `game.json`, không dùng `.env`.

- **Không có `config.json`, hoặc file báo lỗi:** dừng lại, hỏi chủ game. **Không tự đặt, không suy từ tên game.**
- **Chủ game chưa có giá trị:** vẫn hỏi trước. Chưa có `gameCode` thì để `null`: lần chạy đầu của `tools/bump-version.mjs` đặt **mã tạm** `g` + năm tháng ngày giờ phút giây (ví dụ `g20261020143205`) và ghi vào `config.json`, cố định từ đó. Có mã thật thì đổi ở `config.json` trước khi build, hoặc sửa `gameCode` trong `index.html` của gói sau khi build. Giá trị khác (`id`…) chưa có thì để placeholder `<!--GAME_ID-->`. Ghi rõ trong báo cáo là còn chờ.
- **`version`:** quy chuẩn GM `yymmddXX` (ngày build + lần build trong ngày), do `tools/bump-version.mjs` tăng mỗi lần build ([EXPORT.md §2, §4](docs/EXPORT.md)). Không lấy từ `package.json`.
- **Giá trị không định danh khác** (`orientation`, `entry`): lấy từ code của game (cấu hình canvas).

## Bước 1. Chép file

| Từ kit | Vào game | Ghi chú |
| --- | --- | --- |
| `loading/loader.js` | `public/loader.js` | **Bắt buộc, chép nguyên.** Script đầu tiên của mọi trang: màn loading, tải `gmsdkjs.js` + `game.js` ([LOADING.md](docs/LOADING.md)) |
| `loading/loading.js` (+ `loading.d.ts`); `loading/icons/` | `src/sdk/loading/`; `public/icons/` | Phần game điều khiển màn của `loader.js`. Thay `loading.webp` bằng key art của game. `icons/loader.css` theo `loadingScreen` (Bước 0): `"kit"` để nguyên bản của kit, `"game"` viết giao diện của game ([LOADING.md §1.1](docs/LOADING.md)). Màn loading tự vẽ trong code game (nếu có) bỏ: màn luôn là của `loader.js` |
| `sdk/gmsdkjs-shim.js`, `sdk/storage.js`, `sdk/i18n.js`, `sdk/net.js`, `sdk/copyright.js` (+ các `.d.ts`) | `src/sdk/` | Chép nguyên, không sửa. Luôn có `gmsdkjs-shim.js` và `storage.js` (+ các `.d.ts` nếu game dùng TypeScript). Game đã có i18n / tải có thử lại đạt [INTEGRATION.md §7–§8](docs/INTEGRATION.md) thì giữ của game, không chép `i18n.js` / `net.js`, chỉ đổi chỗ lưu sang `sdk.storage` |
| `template/index.html` | `index.html` ở gốc | Trang dev. Game đã có `index.html`: thêm khối `GMSDKJS_OPTIONS` vào `<head>`, `<div id="game">`, và **chỉ một script** `<script src="loader.js" data-entry="src/main.js" data-module>` thay cho thẻ entry. Bỏ mọi thẻ `gmsdkjs.js`, `gmsdkv2.js`, Firebase, `gm-sdk.js`, SDK portal |
| `template/vite.config.mjs` | gốc repo | Chỉ khi dùng Vite. Đã có cấu hình thì gộp theo [EXPORT.md §4](docs/EXPORT.md) |
| `leaderboard/leaderboard.js`, `hmac.js`, `ui.js` (+ `.d.ts`); `leaderboard/flags/`, `countries.json` | `src/sdk/leaderboard/`; `public/assets/leaderboard/` | Chỉ khi `leaderboardId` khác `null` ([LEADERBOARD.md §2](docs/LEADERBOARD.md)). Bỏ `JS_GMSDK/Leaderboard` cũ |

## Bước 2. Manifest và bảng dịch

- Tạo `public/game.json` theo [EXPORT.md §2](docs/EXPORT.md).
- Chuyển mọi chữ hiển thị vào `public/i18n/<defaultLanguage>.json` (key `snake_case`, nhóm được); thêm file cho từng ngôn ngữ, tên theo thẻ BCP 47 ([INTEGRATION.md §7](docs/INTEGRATION.md)). Thêm `load_failed`, `try_again` cho màn lỗi tải.

## Bước 3. Nối SDK vào game

Theo [INTEGRATION.md](docs/INTEGRATION.md), đúng thứ tự. Phần riêng của engine (tạm dừng, tắt tiếng, input, tiến độ tải, `#game`): [ENGINES.md](docs/ENGINES.md).
1. `sdk = await loadSDK({ gameCode })` là việc đầu tiên trong hàm khởi động (chờ `loader.js` có gmsdkjs; không `await` cấp cao nhất vì gói là IIFE); `const loader = createLoader()`; `onPause` / `onResume` ngay sau đó (§2, §3).
2. Khởi động: `game.json` → `initI18n` → `migrate` (nếu game từng tự lưu key khác) → tải tài nguyên với `loader.progress` → `ready()` → hiện menu → `loader.hide()` (đã gồm `loadingDone()`) → `preroll()` (§2).
   **Không `await` ở cấp ngoài cùng của file** (gói IIFE không build được): mọi `await` nằm trong `async function boot()` ([EXPORT.md §3](docs/EXPORT.md)).
3. `gameplayStart` / `gameplayStop` quanh lúc chơi thật (§4).
4. Xen giữa ở chỗ nghỉ; thưởng với `rewardedAvailable()` + `rewarded()` ngay trong click (§5).
5. Mọi lưu trữ qua `sdk.storage` (§6); mọi tải file qua `sdk/net.js` (§8).
6. More Games, trademark, `V<version>` (§9).
   Có bảng xếp hạng: `createLeaderboard` sau `game.json`, `submit` một lần mỗi ván, nút mở bảng ([LEADERBOARD.md](docs/LEADERBOARD.md)).
7. Tracking để phân tích game: làm theo quy trình [ANALYTICS.md §6](docs/ANALYTICS.md), không chờ ai viết sẵn.
   - đọc code, gắn bộ chuẩn §3 và bộ phân tích §4 qua một module tracking của game;
   - rồi **sinh** `docs/GMSDK_JS/analytics.json` từ chính những gì đã gắn.

## Bước 4. Game cũ: bỏ những gì SDK đã làm

| Cũ | Mới |
| --- | --- |
| `gmsdkv2.js`, `GMSOFT_SDKTYPE`, `GMSOFT_SIGNED`, `GMSOFT_ADS_INFO`, `GMSOFT_GAME_INFO` | Bỏ hết. Template mới không còn global `GMSOFT_*` |
| Gọi thẳng `PokiSDK`, `CrazyGames.SDK`, `gdsdk`, `adsbygoogle`, WeeGoo | `sdk.interstitial` / `rewarded` / `preroll` / `gameplayStart`… |
| Tự giãn cách quảng cáo theo thời gian, tự đếm tạm dừng lồng nhau | Bỏ: SDK làm. Giữ luật theo nhịp game (không quảng cáo sau ván đầu…) |
| Tự khoá domain, tự chuyển hướng (`isDiffHost`, danh sách host) | Bỏ: licence của API và tool build làm |
| Firebase, `firebaseLogEvent`, `gmEvent`, `gmStartGame`, `GMGameSDK` tự nạp | `sdk.track`. Bỏ `loaded_game`, `start_game`, `SessionTime`, `LiveTime`, `ad_*` tự gửi: SDK đã gửi |
| `localStorage` trực tiếp, nhiều key | `sdk.storage` một key; key cũ chuyển bằng `migrate` |
| `AZ_SETTINGS.gameCode`, `AZ_SETTINGS.language` | `game.json` (`gameCode`, `defaultLanguage`) |
| Build riêng cho từng portal (`dist-gd`, `dist-poki`, `dist-crazygames`, `.env.<portal>`, `VITE_PORTAL`, obfuscate riêng cho GD) | **Một** gói xuất ([EXPORT.md §2](docs/EXPORT.md)). Key GD vào `config.json` → `gdKey` (build chép sang `game.json`); preset từng portal nằm trong template của tool build. Bỏ mọi `if (portal === …)` trong code |

Tìm những chỗ còn sót: `grep -rnE "localStorage|GMSOFT_|gmsdkv2|PokiSDK|CrazyGames|gdsdk|adsbygoogle|firebase|GMGameSDK" src`. Chỉ `src/sdk/storage.js` được phép còn `localStorage`.

## Bước 5. Thử và giao

1. Chạy trang dev (`adsTest: true`) theo [TESTING.md](docs/TESTING.md), kiểm theo [QA.md §3](docs/QA.md) những mục kiểm được trên máy này (quảng cáo, tạm dừng, âm thanh, lưu trữ, ngôn ngữ, bố cục ở cả hai chiều, tracking, gói xuất).
2. Chạy typecheck / lint / test có sẵn của repo.
3. Build theo đúng thứ tự `bump-version` → xuất gói (`npx vite build` hoặc bundler của game) → nén (`node docs/GMSDK_JS/tools/compress.mjs`, cần `npm i -D sharp ffmpeg-static`; chép bảng nén vào báo cáo) → ghép trang gm (`node docs/GMSDK_JS/tools/assemble.mjs`, [EXPORT.md §7](docs/EXPORT.md)) → `node docs/GMSDK_JS/tools/check-export.mjs export/build/<version>-<id> --src src` cho tới khi `OK` (kiểm cả việc `game.json` khớp `config.json`) → đóng zip `node docs/GMSDK_JS/tools/zip.mjs` ([EXPORT.md §8](docs/EXPORT.md)). Cả chuỗi nằm trong một script `npm run build`. Kết quả: `export/build/<version>-<id>/` và `export/build/<version>-<id>/<version>-<id>.zip`.
4. **Ảnh QA và marketing: mỗi game làm một lần, hỏi trước khi làm.** Build xong:
   - `export/qa/` chưa có thư mục nào: hỏi chủ game "Đã build xong `<version>`. Chụp ảnh QA 8 cỡ màn hình không? Ảnh để hỗ trợ làm Banner cho chuẩn nên cần đồ họa bản cuối cùng." Đồng ý thì chụp theo [QA.md §2.1](docs/QA.md): `node docs/GMSDK_JS/tools/screens.mjs` (màn menu), rồi tự vào chơi ở từng cỡ, chụp lúc chơi và màn kết quả; xem từng ảnh, ghi bảng "Màn hình" vào `docs/qa/<version>.md`. Ảnh ở `export/qa/<version>-<id>/`, không commit.
   - Đã có ảnh QA mà `export/marketing/` chưa có thư mục nào (kể cả ngay sau khi vừa chụp xong): hỏi "Viết marketing không? Nội dung để hỗ trợ làm thông tin game nên cần bản game hoàn thiện cuối cùng." Đồng ý thì làm theo [PROMPT_MARKETING.md](PROMPT_MARKETING.md), ra `export/marketing/<version>-<id>/`.
   - Chủ game bảo không thì bỏ qua, lần build sau hỏi lại. Đã có thư mục thì không hỏi nữa; chủ game muốn chụp lại / viết lại thì tự yêu cầu (ra thư mục mới theo `<version>` lúc đó).
5. Hỏi chủ game: "Đã build xong `<version>`. Commit và đẩy lên git không?" Đồng ý thì commit `Build <version>`, kiểm máy chủ có commit mới chưa (có thì dừng, không đẩy), đẩy, rồi in khối thông tin git ([EXPORT.md §9](docs/EXPORT.md)). Không đồng ý thì bỏ qua.
6. Báo cáo cho chủ game:
   - những gì đã thay;
   - file đã bỏ khỏi `public/` vì không dùng (gói chỉ chứa thứ game dùng, [EXPORT.md §3](docs/EXPORT.md)), dung lượng gói trước / sau;
   - trường hợp đã làm (game mới / gắn SDK / nâng cấp: các mục CHANGELOG đã làm);
   - sự kiện đã gắn và `analytics.json` đã sinh (mục nào của ANALYTICS §4 game không có, vì sao);
   - `licenses.json`: asset nào còn `unknown`, giấy phép nào cần ghi công, cần chủ game xác nhận gì;
   - giá trị còn chờ (Bước 0);
   - từng dòng `notes` đã làm thế nào;
   - kết quả QA theo mẫu [QA.md §6](docs/QA.md), kể cả §3.9 trải nghiệm: mỗi mục Pass / Major / Minor / N/A; mục cần máy thật (iPhone, Android, Chromebook) hoặc portal thật thì ghi "chưa kiểm được" kèm lý do, không ghi Pass;
   - phần trải nghiệm ([UX.md](docs/UX.md)) còn thiếu, kèm đề xuất;
   - ảnh QA và marketing kit: đã có ở thư mục nào, hoặc chủ game chưa đồng ý làm (bước 4); có kit thì ghi kết quả `node docs/GMSDK_JS/tools/check-marketing.mjs` ([HANDOFF.md](docs/HANDOFF.md)). Không tự làm khi chưa được đồng ý.
