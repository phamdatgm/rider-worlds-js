# Làm game mới theo kit, từ đầu

Thứ tự làm một game web mới để ra đúng chuẩn kit ngay từ lần đầu: gắn SDK, lưu, ngôn ngữ, bố cục, hướng dẫn người chơi, quảng cáo, QA, xuất gói. Game có sẵn thì làm theo [AI_INSTALL.md](../AI_INSTALL.md), rồi rà thêm phần trải nghiệm theo [UX.md](UX.md).

Mỗi bước ghi: **làm gì**, **xong khi nào**, **tài liệu chi tiết**.

## Bước 0. Giá trị của game

- `docs/GMSDK_JS/config.json` (chép từ `config.example.json`, ngay trong folder kit): điền `id`, `gameCode`, `name`, `languages`, `defaultLanguage`, `leaderboardId` (game có bảng xếp hạng), `gdKey` theo giá trị chủ game cấp, và `brief` mô tả game. Chưa có thì để `null` hoặc hỏi, **không đoán** ([AI_INSTALL.md](../AI_INSTALL.md) Bước 0).
- Xong khi: `node docs/GMSDK_JS/tools/check-export.mjs` báo `OK`.

## Bước 1. Engine và khung repo

- Chọn engine (JS thuần, Phaser, PixiJS, Three.js…) và bundler (khuyên dùng Vite). Phần khác nhau theo engine: [ENGINES.md](ENGINES.md).
- Dựng đúng cấu trúc [INTEGRATION.md §1](INTEGRATION.md): `index.html` (trang dev, từ `template/`), `vite.config` (từ `template/`), `public/game.json`, `public/i18n/en.json`, `src/sdk/` (chép từ kit), `src/main`; tài liệu `docs/gdd/README.md` (thiết kế từ `brief`), `docs/plan/README.md` (kế hoạch các bước), `docs/qa/`.
- Entry khởi động trong `async function boot()`: `await loadSDK()` là việc đầu tiên; **không `await` ở cấp ngoài cùng của file** (gói IIFE, [EXPORT.md §3](EXPORT.md)).
- Mọi lời gọi SDK đi qua một module của game (ví dụ `src/platform/sdk.ts`), lưu trữ qua một module (ví dụ `src/save/Save.ts`).
- Script build: `bump-version` → build → `compress` → `assemble` → `check-export` → `zip` ([EXPORT.md](EXPORT.md) §4, §7, §8). `npm i -D sharp ffmpeg-static` cho bước nén.
- Xong khi: `npm run dev` mở được trang dev; `npm run build` ra gói, báo `OK` và ra file zip.

## Bước 2. Các màn và luồng

Luồng tối thiểu. Người mới phải vào được gameplay sau **tối đa 1 cú bấm** ([UX.md](UX.md) §1).

| Màn | Bắt buộc có | SDK |
| --- | --- | --- |
| Loading | Màn của `loader.js` (GM Loader v1, [LOADING.md](LOADING.md)) với key art của game ở `public/icons/loading.webp`; giao diện mẫu kit hoặc của game qua `icons/loader.css` (hỏi chủ game, `loadingScreen`, LOADING.md §1.1); game không tự vẽ màn trong code | `await loadSDK()`, `createLoader()`, `loader.progress(p)`, `ready()` |
| Menu (hoặc vào chơi luôn) | Nút chơi to nhất màn; Settings; chỗ vào các tính năng ([UX.md](UX.md) §5) | `loader.hide()` khi menu hiện (gồm `loadingDone()`), rồi `preroll()` |
| Gameplay | HUD; nút pause (và phím ESC / P); lớp điều khiển cho người mới | `gameplayStart()` ở input đầu tiên |
| Pause | Tiếp tục, chơi lại, về menu | `gameplayStop()` |
| Thua / thắng | Kết quả, lý do thua + mẹo, Retry 1 cú bấm, nút thưởng (nếu có); hạng vừa đạt (nếu có bảng xếp hạng) | `gameplayStop()`, `rewarded()` trong click, `board.submit(score)` |
| Bảng xếp hạng (nếu có `leaderboardId`) | Mở từ menu và màn kết quả; 4 kỳ, hạng của người chơi, đổi tên + cờ ([LEADERBOARD.md](LEADERBOARD.md)) | `openLeaderboard()` hoặc màn tự vẽ |
| Về menu sau ván | Chỗ nghỉ tự nhiên | `interstitial()` theo luật của game |
| Settings | Âm lượng nhạc / hiệu ứng, ngôn ngữ, Show tutorial, More Games, `V<version>`, dòng bản quyền | `setMuted()`, `moreGamesUrl()`, `copyrightText(sdk)` |

Thứ tự gọi SDK: [INTEGRATION.md](INTEGRATION.md) §2–§5, §9.

## Bước 3. Dữ liệu và lưu

- Viết kiểu save trước khi viết gameplay: vùng `settings` (âm lượng, ngôn ngữ, tutorial) và `profile` (tiến trình, tiền, mở khoá, `guide`).
- Có `defaultSave()` và `sanitize()`: đọc bất kỳ thứ gì từ storage ra một save hợp lệ (bỏ id lạ, kẹp số, điền thiếu). Thêm trường mới thì có giá trị mặc định, save cũ vẫn đọc được.
- Chỉ đọc / ghi qua `sdk.storage` ([INTEGRATION.md §6](INTEGRATION.md)). Ghi ngay sau lúc quan trọng (mua hàng, hết ván): `flush()`.
- Xong khi: test `sanitize` với save rỗng, hỏng, cũ.

## Bước 4. Bố cục, input, âm thanh

- **Bố cục:** chơi được cả ngang lẫn dọc, phủ kín màn hình; vẽ lại khi đổi kích thước hay xoay; chữ đọc được ở DPR 1 và trên điện thoại; canvas không lớn hơn số điểm ảnh thật ([QA.md](QA.md) §3.2, 6.3).
- **Input:** cảm ứng và bàn phím, hiện đúng loại theo thiết bị. Không dùng phím có sẵn hành vi của trình duyệt. Mũi tên / Space không cuộn trang cha ([QA.md](QA.md) 2.6).
- **Âm thanh:** nhạc và hiệu ứng có âm lượng riêng; bắt đầu sau lần chạm đầu; dừng khi tab ẩn; tắt khi có quảng cáo nhưng giữ lựa chọn tắt tiếng của người chơi ([QA.md](QA.md) §3.3).

## Bước 5. Chữ và ngôn ngữ

- Mọi chữ hiển thị là key trong `i18n/<defaultLanguage>.json` (key `snake_case`, nhóm được: `game.score`), kể cả chữ hướng dẫn và lý do thua ([INTEGRATION.md §7](INTEGRATION.md)). Chỉ màn lỗi tải trước khi có bảng dịch được viết cứng tiếng Anh.
- Có test: không chữ viết cứng trong code; mọi ngôn ngữ đủ key của `en.json` và đúng tham số `{n}`.

## Bước 6. Hướng dẫn người chơi và tính năng

Thiết kế **cùng lúc với gameplay**, không để cuối:
- Viết kịch bản phiên đầu ([UX.md §2](UX.md)) và bản đồ tính năng ([UX.md §5](UX.md)) trước khi làm UI.
- Làm các lớp L1–L5 ([UX.md §3](UX.md)); trạng thái lưu trong `profile.guide` ([UX.md §4](UX.md)).
- Xong khi: một người chưa từng chơi, không ai chỉ, chơi 5 phút mà biết mục tiêu, biết vì sao thua, và mở được ít nhất một tính năng ngoài màn chơi chính.

## Bước 7. Quảng cáo

- Chọn chỗ đặt từ đầu: xen giữa ở chỗ nghỉ (hết ván, qua màn, về menu); thưởng ở chỗ người chơi được lợi rõ (hồi sinh, x2 tiền, quà ngày). Luật nhịp riêng của game (không sau ván đầu…) do game giữ; giãn cách theo thời gian là của SDK ([INTEGRATION.md §5](INTEGRATION.md)).
- `onPause` / `onResume`: dừng vòng lặp, tắt tiếng, chặn input; ván đang chạy chuyển sang màn pause ([INTEGRATION.md §3](INTEGRATION.md)).
- Nút thưởng theo `rewardedAvailable()` **trong suốt lúc nút còn trên màn** (giá trị đổi theo thời gian, sau `ready()`, sau mỗi quảng cáo).

## Bước 8. Tracking

- Gắn theo quy trình [ANALYTICS.md §6](ANALYTICS.md): một module tracking của game gửi bộ chuẩn của nhà phát hành (`PlayGame`, `EndGame`, `DeathTime`…) **và** bộ phân tích bắt buộc (`session_start`, `screen_view`, `onboarding_step`, `level_start` / `level_end`, `currency_*`, `item_*`, `feature_*`, `ad_offer`…), tự gắn tham số chung. Sự kiện SDK tự gửi thì game không gửi lại.
- Gắn xong thì AI **sinh** `docs/GMSDK_JS/analytics.json` từ chính những gì đã gắn; không ai viết tay.
- Xong khi: chơi theo kịch bản [ANALYTICS.md §9](ANALYTICS.md) thấy đủ sự kiện; `check-export` không còn cảnh báo "never names these events".

## Bước 9. Thử, QA, giao

- Trang dev với `adsTest` ([TESTING.md](TESTING.md)), rồi gói xuất thật; checklist [QA.md §3](QA.md), kể cả §3.9 trải nghiệm.
- `npm run build`: ra `export/build/<version>-<id>/` (gói + trang gm `index.html` + `preview.html`), qua `check-export`, và `export/build/<version>-<id>/<version>-<id>.zip` để upload. Trang của từng portal do tool build trên API làm ([EXPORT.md §7, §8](EXPORT.md)).
- Trước khi build bản giao: rà `public/`, bỏ asset không dùng ([EXPORT.md §3](EXPORT.md)).
- Báo cáo theo [QA.md §6](QA.md).
- Marketing kit và ghi chú bàn giao theo [HANDOFF.md](HANDOFF.md): kéo [PROMPT_MARKETING.md](../PROMPT_MARKETING.md) vào khung chat.

## Xong khi

- [ ] `check-export … --src src`: `OK`; có `export/build/<version>-<id>/<version>-<id>.zip`
- [ ] Vào gameplay ≤ 1 cú bấm; thời gian tới lúc chơi được ≤ 10 s
- [ ] Đủ màn của Bước 2, chạy ngang và dọc, cảm ứng và bàn phím
- [ ] Save qua `sdk.storage`, có `sanitize`, có test
- [ ] Game gửi đủ bộ phân tích, `analytics.json` đã sinh ([ANALYTICS.md](ANALYTICS.md) §4, §6, §9)
- [ ] Mọi chữ trong `i18n/` (thẻ BCP 47), đủ mọi ngôn ngữ
- [ ] L1–L5 của UX.md, bản đồ tính năng không còn dòng trống
- [ ] Quảng cáo đúng chỗ; game dừng hẳn khi có quảng cáo
- [ ] QA.md §3 không còn mục Major
- [ ] `licenses.json` ghi mọi asset, không còn `unknown` ([ASSETS.md](ASSETS.md))
- [ ] `check-marketing`: `OK` (brief + đủ ảnh store / portal), ghi chú bàn giao theo [HANDOFF.md §2](HANDOFF.md)
