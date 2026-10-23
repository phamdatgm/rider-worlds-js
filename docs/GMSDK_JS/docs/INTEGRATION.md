# Gắn SDK vào game

Từng bước, theo thứ tự game chạy. Mẫu đầy đủ, chạy được: [`example/main.js`](../example/main.js). Tra cứu hàm: [API.md](API.md).

## 1. Cấu trúc trong repo game

**Quy chuẩn, mọi game theo kit đều phải theo.** Game ở gốc repo (`src/` + `public/`), không thư mục `web/`: mọi công cụ của kit chạy theo bố cục này không cần tham số.

```
<game>/
├── docs/
│   ├── GMSDK_JS/         kit (thay cả thư mục khi nâng cấp) + config.json, analytics.json, licenses.json của game
│   ├── gdd/              thiết kế game: game làm gì (README.md bắt buộc)
│   ├── plan/             kế hoạch: làm thế nào, tới đâu (README.md bắt buộc)
│   └── qa/               báo cáo QA, mỗi bản build một file <version>.md
├── export/               không commit: build/<version>-<id>/ (gói xuất), qa/<version>-<id>/ (ảnh QA), marketing/<version>-<id>/ (marketing kit, HANDOFF.md §3)
├── index.html            trang dev = template/index.html (KHÔNG nằm trong gói xuất)
├── vite.config.mjs       = template/vite.config.mjs (nếu dùng Vite)
├── public/
│   ├── loader.js         chép nguyên từ kit loading/loader.js: script đầu tiên của mọi trang (LOADING.md)
│   ├── game.json         manifest (EXPORT.md §2)
│   ├── i18n/en.json      (+ mỗi ngôn ngữ một file, tên theo thẻ BCP 47: en-US.json, zh-TW.json…)
│   ├── icons/            màn loading, tên cố định: loading.webp (key art), logo.webp, loader.css (giao diện: kit hoặc của game, LOADING.md §1.1)
│   └── assets/…
└── src/
    ├── main.js           entry của game
    └── sdk/              chép từ kit: gmsdkjs-shim.js, storage.js, i18n.js, net.js, copyright.js (+ .d.ts nếu dùng TypeScript)
        ├── loading/      chép từ kit: loading.js, điều khiển màn của loader.js (LOADING.md)
        └── leaderboard/  chép từ kit khi game có bảng xếp hạng (LEADERBOARD.md §2); cờ ở public/assets/leaderboard/
```

| Thư mục | Chứa | File chính |
| --- | --- | --- |
| `docs/gdd/` | **Game làm gì:** tổng quan, cách chơi, luật, màn chơi, kinh tế (xu, vật phẩm), UI và luồng màn hình, **bản đồ tính năng** ([UX.md §5](UX.md)), âm thanh, hình. Game port: đối chiếu bản gốc, những gì chủ game cho bỏ / chấp nhận khác | `README.md`: trang chính, mục lục, trạng thái từng phần |
| `docs/plan/` | **Làm thế nào, tới đâu:** kế hoạch theo bước, thiết kế kỹ thuật (spec), tiến độ, quyết định kỹ thuật | `README.md`: đang ở bước nào, việc tiếp theo |
| `docs/qa/` | Báo cáo QA theo mẫu [QA.md §6](QA.md), mỗi bản build một file | `<version>.md` (ví dụ `2026102001.md`) |

- Tên file: tiếng Việt không dấu, chữ thường, gạch nối (`docs/gdd/kinh-te.md`); kế hoạch / spec có ngày thì ngày đứng đầu (`docs/plan/2026-10-20-leaderboard.md`). Một chủ đề một file; cần thì để link, không chép nội dung sang nơi khác.
- **Công cụ AI có thói quen ghi chỗ khác** (ví dụ plugin superpowers của Claude ghi `docs/superpowers/plans/`, `docs/superpowers/specs/`): theo kit thì kế hoạch và spec vào `docs/plan/`, thiết kế game vào `docs/gdd/`. `check-export` cảnh báo khi thiếu `docs/gdd/README.md`, `docs/plan/README.md`, hoặc còn tài liệu ở `docs/superpowers/`.
- Thư mục làm việc khác ở gốc (`Apk/`, `_work/`, `tools/` của game port…) được phép: không vào gói vì bundler chỉ lấy `public/` và những gì `src/` dùng tới.

- Các file trong `src/sdk/` và `public/loader.js` **chép nguyên từ kit**, không sửa. Cập nhật thì chép lại từ kit.
- Không dùng Vite thì giữ đúng bố cục gói xuất ([EXPORT.md](EXPORT.md)) bằng bundler của game.

## 2. Thứ tự khởi động

Trang chỉ nạp `loader.js`: màn loading đã hiện, `gmsdkjs.js` và `game.js` được tải song song (LOADING.md §1). Entry của game bắt đầu bằng việc chờ SDK:

```js
import { loadSDK } from './sdk/gmsdkjs-shim.js';
import { initI18n } from './sdk/i18n.js';
import { loadJSON } from './sdk/net.js';
import { createLoader } from './sdk/loading/loading.js';

const loader = createLoader();                     //    màn của loader.js: phần tải của game (LOADING.md)
let sdk;

async function boot() {
  sdk = await loadSDK({ gameCode: 'g131' });       // 1. chờ loader.js có gmsdkjs (lỗi thì loader đã báo Reload)
  sdk.onPause(pauseGame);                          // 2. tạm dừng / chạy lại, trước mọi quảng cáo
  sdk.onResume(resumeGame);
  const manifest = await loadJSON('game.json');    // 3. manifest + tiếng Anh: lỗi thì "Try again"
  await initI18n({ languages: manifest.languages, defaultLanguage: manifest.defaultLanguage, storage: sdk.storage });
  sdk.storage.migrate({ 'mygame.save': 'profile' }); // 4. key cũ của chính game (nếu game từng tự lưu)
  loader.setTitle(manifest.name);
  await loadAssets((p) => loader.progress(p));     // 5. tải tài nguyên, tiến độ 0..1 → thanh 30 → 100 %
  await sdk.ready();                               // 6. licence + cấu hình quảng cáo (≤ 5 s)
  showMenu();
  loader.hide();                                   // 7. menu đã hiện: ẩn màn + sdk.loadingDone() (loaded_game)
  await sdk.preroll();                             // 8. preroll nếu API bật (≤ 15 s), rồi cho chơi
}
boot().catch(() => loader.error());              // "Connection problem…" + Reload
```

- **Không `await` ở cấp cao nhất của module** (`const sdk = await loadSDK()` ngoài hàm): gói xuất là IIFE, Vite báo lỗi. Đặt trong `boot()` như trên.
- `sdk.ready()` có thể chạy song song với bước tải tài nguyên. Chỉ cần xong trước khi hiện menu.
- Không chờ quảng cáo trước khi hiện menu; preroll chạy khi menu đã hiện, game đã dừng nhờ `onPause`.
- Màn loading là của `loader.js` ([LOADING.md](LOADING.md)), mọi game dùng chung luồng: game không tự vẽ màn loading trong code, chỉ báo tiến độ và `hide()`. Giao diện là mẫu của kit hoặc của game qua `icons/loader.css` (`loadingScreen`, [LOADING.md §1.1](LOADING.md)).

## 3. Tạm dừng khi có quảng cáo

```js
sdk.onPause(() => { audio.mute(); loop.stop(); input.block(); });
sdk.onResume(() => { audio.unmute(); loop.start(); input.unblock(); });
```

- SDK gọi hai hàm này quanh **mọi** quảng cáo, kể cả quảng cáo network tự chạy, và tự đếm lồng nhau. Game chỉ làm đúng việc tắt / bật.
- Quảng cáo treo thì sau 30 s SDK vẫn gọi `onResume`.
- Khi site bị khoá, SDK gọi `onPause` và không bao giờ gọi `onResume`: game đứng yên dưới màn khoá. Đó là ý muốn.
- Âm thanh: tắt bằng `onPause`, nhưng **giữ lựa chọn tắt tiếng của người chơi** (bật lại ở `onResume` chỉ khi người chơi không tắt).

## 4. Đang chơi

```js
function startRun() { sdk.gameplayStart(); sdk.track('PlayGame', { GameCount: ++runs }); /* … */ }
function endRun(score) { sdk.gameplayStop(); sdk.track('EndGame', { Score: score }); /* … */ }
```

- `gameplayStart()` khi người chơi bắt đầu điều khiển; `gameplayStop()` khi thua, thắng, về menu, mở bảng tạm dừng của game.
- **Trước mọi quảng cáo xen giữa phải là `gameplayStop()`**, sau quảng cáo mới `gameplayStart()` (luật của Poki / CrazyGames; SDK giữ đúng thứ tự gửi).

## 5. Quảng cáo

**Xen giữa:** ở chỗ nghỉ tự nhiên (hết ván, qua màn, về menu), **không bao giờ trong lúc chơi**.

```js
await sdk.interstitial('run_end'); // true / false đều đi tiếp; không chặn luồng game vì kết quả
```

- SDK giữ khoảng cách thời gian theo API. Luật riêng của game (không quảng cáo sau ván đầu, chỉ sau khi thua…) thì game tự kiểm trước khi gọi.

**Thưởng:**

```js
button.hidden = !sdk.rewardedAvailable();       // chỉ hiện nút khi có quảng cáo
button.onclick = () => {
  button.disabled = true;
  sdk.rewarded('revive').then((watched) => { if (watched) revive(); else backToMenu(); });
};
```

- Gọi `rewarded()` **ngay trong handler click**, không `await` gì trước đó (AFG cần lời gọi sát cú bấm).
- **Chỉ thưởng khi `true`.** Đóng sớm, không có quảng cáo hay bị chặn đều là `false`.
- Kiểm `rewardedAvailable()` mỗi lần hiện màn có nút (sau `ready()`, sau mỗi quảng cáo), và **cập nhật nút suốt lúc nó còn trên màn**: giá trị đổi theo thời gian. Bảng dựng ngay sau preroll mà chỉ đọc một lần thì nút xám mãi.

**Preroll:** chỉ `await sdk.preroll()` một lần sau khi menu hiện (§2). Không có cờ của API thì xong ngay.

## 6. Lưu trữ

```js
const profile = sdk.storage.get('profile', { best: 0, coins: 0 });
sdk.storage.patch('profile', { best: Math.max(profile.best, score) });
sdk.storage.patch('settings', { muted: true });
```

- **`sdk.storage` là bộ lưu của game** ([`sdk/storage.js`](../sdk/storage.js), kit), không phải của gmsdkjs: một key `azgames.<gameCode>` (`azgames.dev` khi chưa có mã thật). gmsdkjs chỉ giữ tên GMA ở key riêng `gma_<gameCode>.name`, không đụng save của game.
- **Giá trị lưu được nén và trộn**: JSON → nén LZ (chuỗi UTF-16, khoảng 15 bit mỗi ký tự; localStorage tính theo ký tự) → trộn theo key → thêm mã kiểm. Save 9 KB JSON còn khoảng 1 KB. Mở DevTools không đọc được; **sửa tay một ký tự là hỏng**: save đó bị bỏ, người chơi chơi lại từ đầu, gửi tracking `save_tampered`. Chống sửa tay, không phải chống người đọc được code.
- Mọi bước chạy đồng bộ (vài ms với save 40 KB) để lần ghi cuối lúc đóng tab chắc chắn xong.
- Vùng `settings` cho cài đặt, `profile` cho tiến trình. Thêm vùng riêng nếu cần (ví dụ `levels`).
- `get` trả bản sao: sửa xong phải `set` / `patch` lại.
- Không cần tự gọi `flush()`: ghi sau 300 ms, và ngay khi tab ẩn hoặc đóng. Gọi `flush()` sau lúc quan trọng (mua hàng) nếu muốn chắc; `false` = chưa ghi được (đầy, bị chặn), dữ liệu vẫn giữ trong bộ nhớ và được ghi lại lần sau, có tracking `save_failed`.
- Debug: `sdk.storage.dump()` trả cả save dạng rõ (DevTools chỉ thấy chuỗi mã hoá); trang dev có sẵn `gmSave.dump()` ở console.
- **Lưu gọn, vì save của mọi game cùng domain chia chung khoảng 5 MB trên máy người chơi**: không lưu thứ tính lại được (tổng sao, cấp từ điểm kinh nghiệm…), không lưu giá trị bằng mặc định, số nguyên thay số lẻ dài, danh sách dài thì gom gọn (sao của 100 màn: chuỗi `"3302…"` thay vì 100 object). Không đổi tên khoá thành a / b / c: nén đã lo phần lặp tên khoá. Save quá 128 K ký tự: tracking `save_large`.
- Game từng tự lưu key khác: gọi `migrate()` một lần lúc khởi động (§2).

## 7. Ngôn ngữ (`sdk/i18n.js`)

Chuẩn chung (như i18next, LayaAir `i18n/`): **`i18n/<thẻ>.json`** ở gốc gói, mỗi ngôn ngữ một file.

- **Thẻ ngôn ngữ BCP 47**, đúng chữ hoa / thường: ngôn ngữ viết thường (ISO 639-1), vùng viết hoa (ISO 3166). Ví dụ `en`, `es`, `en-US`, `pt-BR`, `zh-CN`, `zh-TW`, `ko-KR`, `ar`. Chỉ thêm vùng khi chữ thật sự khác (`zh-CN` giản thể / `zh-TW` phồn thể, `pt-BR` / `pt`); còn lại dùng mã ngôn ngữ (`es`, `fr`, `ja`).
- **Bảng** là object UTF-8 không BOM: phẳng `{ "play": "Play" }`, hoặc lồng theo nhóm `{ "game": { "score": "Score" }, "setting": { "sound_on": "Sound: ON" } }` và gọi `t('game.score')`. Key `snake_case`; giá trị chỉ là chuỗi (không số, không mảng).
- **Tham số:** `{0}`, `{1}` theo vị trí (`t('x_wins', name)`), hoặc `{name}` theo tên (`t('hi', { name })`).
- **File của `defaultLanguage` bắt buộc và đủ mọi key.** Phải có ít nhất một tiếng Anh (`en` hoặc `en-XX`).
- **Thiếu chữ:** ngôn ngữ đang dùng → ngôn ngữ gốc của nó (`zh-TW` → `zh`, nếu game có) → `defaultLanguage` → hiện key.
- `game.json` liệt kê `languages` (các thẻ) và `defaultLanguage`; truyền vào `initI18n()` (§2).
- **Lúc mở game:** lựa chọn đã lưu của người chơi → **ngôn ngữ của trang** (`GMSDKJS_OPTIONS.language` trong `index.html`, đặt theo từng portal: bên vận hành sửa ở trang, không cần build lại) → `defaultLanguage` của `game.json`. **Không** tự chọn theo ngôn ngữ trình duyệt, không đọc `?lang=`: trang quyết định, người chơi đổi trong game. Thẻ của trang không có trong `languages` thì lấy thẻ cùng ngôn ngữ (`zh` → `zh-TW`), không có thì bỏ qua. Lựa chọn lưu ở `settings.language` qua `sdk.storage` (lưu nguyên thẻ, ví dụ `zh-TW`).
- **Viết từ phải sang trái** (`ar`, `he`, `fa`, `ur`): `i18n.js` đặt `<html dir="rtl">`; game tự lật bố cục nếu cần.
- **Menu ngôn ngữ:** `languageList()` trả `[{ code, name }]`, `name` viết bằng chính ngôn ngữ đó (`繁體中文`, `한국어`). `setLang(code)` đổi và lưu; `onLangChange(fn)` để vẽ lại giao diện. `matchLanguage(tag, languages)` tìm thẻ gần nhất.
- Chữ trên màn loading (trước khi có bảng dịch) viết cứng tiếng Anh.

## 8. Tải không bao giờ treo (`sdk/net.js`)

- Mọi tải file đi qua `loadImage`, `loadJSON`, `loadArrayBuffer`, `fetchRetry`: mỗi lần thử tối đa 15 s, thử 3 lần, lần sau thêm `?r=n` để tránh cache lỗi.
- `fontsReady()` chờ font tối đa 4 s.
- Cache Promise thì xoá khi lỗi: `cache.set(k, loadJSON(url).catch((e) => { cache.delete(k); throw e; }))`.
- Khởi động lỗi (mất mạng): hiện "Try again" (`load_failed`, `try_again` trong `en.json`), bấm thì `location.reload()`. Không bao giờ để màn loading đứng mãi.

## 9. Nút More Games, trademark, phiên bản

```js
const url = sdk.moreGamesUrl();
moreButton.hidden = !url;                                   // null: không có nút (trang dev: luôn có, mặc định azgames.io)
moreButton.onclick = () => window.open(url, '_blank', 'noopener');
copyrightLabel.textContent = copyrightText(sdk);           // "© 2026 Azgames.io" trừ khi server đổi; '' = không hiện gì
versionLabel.textContent = `V${manifest.version}`;          // từ game.json
```

- Đọc `moreGamesUrl()` và `copyrightText(sdk)` **sau `ready()`**: giá trị đến từ API.
- More Games mở tab mới, không bao giờ `location.href` (người chơi mất ván).
- **Luôn làm nút More Games** (theo mẫu trên), kể cả khi lúc làm chưa thấy link: trên portal, server quyết có nút hay không. Trang dev (`platform: 'dev'`) server không trả link, nên shim trả **`https://azgames.io`** (`DEV_MORE_GAMES`): nút luôn hiện trên trang dev để kiểm chỗ đặt, chữ, bấm mở tab mới. Gói build lên portal thì theo server (GD, CrazyGames, Poki: không có nút).
- Trademark và phiên bản thường đặt ở góc màn hình menu hoặc bảng Settings.
- **Chữ bản quyền chỉ lấy từ `copyrightText(sdk)`** (`sdk/copyright.js`, [LOADING.md §2](LOADING.md)): mặc định `© 2026 Azgames.io`; server đổi (`gameinfo.trademark`: tên miền / tên khác) thì theo server; `0` và trang GD / CrazyGames / Poki thì `''`, không hiện gì. Không viết `©`, `AZ Games`, `azgames.io`, `1games.io`… ở chỗ khác trong code hay `i18n/*.json`: `check-export` cảnh báo.

## 10. Bảng xếp hạng

Game có `leaderboardId` trong `game.json`: tạo bảng sau khi đọc `game.json`, gửi điểm một lần mỗi ván (sau `gameplayStop`), mở bảng từ menu và tạm dừng game khi bảng mở. Chi tiết: [LEADERBOARD.md](LEADERBOARD.md).

```js
const board = manifest.leaderboardId ? createLeaderboard({ sdk, boardId: manifest.leaderboardId }) : null;
// hết ván
board?.submit(score).then((r) => r && showRank(r.rank));
// nút ở menu
openLeaderboard({ board, t, onClose: resumeMenu });
```

## 11. Không được làm

- Gọi thẳng `window.GMSDKJS`, `localStorage`, hay SDK của network (Poki, CrazyGames, AFG…): mọi thứ qua `sdk`. Ngoại lệ duy nhất: `src/legacy-save.js`, code đọc / ghi save kiểu cũ của game (phương án 2, 3 ở AI_INSTALL.md, Cách làm).
- Nạp script ngoài, đường dẫn tuyệt đối (`/assets/…`), tự kiểm domain hay tự chuyển hướng.
- Dùng file từ tên miền khác, đọc điểm ảnh, worker, nhiều luồng, âm thanh, toàn màn hình, phím, trang cha mà chưa đủ điều kiện chạy trong iframe nhiều tên miền: luật ở `PROMPT.md`, cách làm từng trường hợp ở [EMBED.md](EMBED.md).
- Tự đặt giờ giãn cách quảng cáo theo thời gian (SDK làm); chỉ thêm luật theo nhịp game.
- Đoán `gameId`, `gameCode` hay bất kỳ giá trị định danh nào: chủ game cung cấp.
- Để comment dev hay tiếng Việt trong code xuất ra (chỉ bảng dịch `i18n/` được có).
