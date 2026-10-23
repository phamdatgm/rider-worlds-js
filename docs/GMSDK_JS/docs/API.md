# API: `loadSDK()` / `getSDK()` và `window.GMSDKJS`

Tra cứu từng hàm. Cách dùng theo thứ tự trong một game: [INTEGRATION.md](INTEGRATION.md).

## 1. Lấy SDK

```js
import { loadSDK, getSDK } from './sdk/gmsdkjs-shim.js';
async function boot() {
  const sdk = await loadSDK({ gameCode: 'g131' }); // việc đầu tiên: chờ loader.js có gmsdkjs (LOADING.md)
  // …
}
// chỗ khác trong game: getSDK() trả cùng đối tượng. Không await ở cấp cao nhất (gói xuất là IIFE)
```

- **`gmsdkjs.js` do `loader.js` tải** (template không có thẻ `<script>` của nó): song song với `game.js`, tối đa 3 lần, URL ở `GMSDKJS_OPTIONS.sdkUrl`. **Bắt buộc**: 3 lần vẫn lỗi thì loader hiện màn "reload the page", game không chạy. Chỉ trang dev (`platform: 'dev'`) chạy tiếp không SDK. Chi tiết: [LOADING.md §1](LOADING.md).
- `loadSDK()` chờ `window.GMLoader.ready()` rồi trả `getSDK()`. Không có `loader.js` trên trang (test) thì trả ngay.
- **Game không gọi thẳng `window.GMSDKJS`**, mà luôn qua `sdk/gmsdkjs-shim.js` (JS thuần, không cần build, kit giữ):
  - Mỗi hàm tìm `window.GMSDKJS` **lúc gọi** và được bọc: thiếu hàm, hàm throw hay promise reject thì trả câu trả lời an toàn (không quảng cáo, không tracking).
  - **`sdk.storage` là bộ lưu của game** (`sdk/storage.js` của kit, §6), không qua gmsdkjs.
- `gameCode`: mã `g<số>` của game (ví dụ `g131`). `GMSDKJS_OPTIONS.gameCode` của trang được ưu tiên (tool build ghi mã thật vào đó); tham số chỉ dùng khi trang không có. Lấy từ `game.json`.
- Mỗi trang một SDK; gọi lại trả cùng đối tượng.
- Khai báo kiểu cho TypeScript: `sdk/gmsdkjs-shim.d.ts`, `sdk/storage.d.ts` (và `sdk/net.d.ts` cho `net.js`), đặt cạnh file `.js` cùng tên.

**Mọi hàm an toàn khi chưa `ready()`** (chờ bên trong) và **không bao giờ throw ra game**. Mọi lần chờ đều có giới hạn.

## 2. Khởi động

| Hàm | Trả về | Ghi chú |
| --- | --- | --- |
| `ready()` | `Promise<Info>` | Chờ API licence **tối đa 5 s**, gộp cấu hình quảng cáo, khởi động network quảng cáo và GMA. Không bao giờ reject. Gọi nhiều lần trả cùng một promise. SDK quảng cáo có thể còn đang khởi động sau đó, nên `info.adblock` và `rewardedAvailable()` có thể đổi về sau |
| `loadingProgress(p)` | | Tiến độ tải `0..1`. Chuyển cho portal nếu cần. `loader.js` tự gọi theo thanh % (gồm cả phần tải gmsdkjs + game.js) |
| `loadingDone()` | | Khi menu thật sự hiện ra. Gửi `loaded_game { load_time_ms }` (một lần). **`createLoader().hide()` đã gọi hàm này**: game không gọi lại |
| `info` | `Info` | Cấu hình đang dùng (đọc sau `ready()`) |
| `version` | `string` | Phiên bản gmsdkjs (`1.0.1`…), `'fallback'` khi không có SDK (trang dev) |

`Info`:

| Trường | Ý nghĩa |
| --- | --- |
| `adType` | Network quảng cáo đang chạy: `h5`, `gd`, `crazy`, `poki`, `wg` hoặc `none` |
| `licensed` | `false` khi API khoá site này (SDK tự tắt quảng cáo và hiện màn khoá) |
| `adblock` | `true` khi quảng cáo bị chặn: mọi quảng cáo trả `false` |
| `adsTest` | `true` ở chế độ thử quảng cáo (quảng cáo test của Google) |
| `adsInfo`, `gameInfo` | Cấu hình quảng cáo và `gameinfo` của API, hoặc `null`. Game thường không cần |
| `version`, `platform`, `sdkType`, `gameId` | Từ khối tuỳ chọn của template |

## 3. Quảng cáo

| Hàm | Trả về | Ghi chú |
| --- | --- | --- |
| `preroll()` | `Promise<boolean>` | Quảng cáo đầu game. **Chỉ chạy khi API bật cờ** (`h5`, `gd`); không có cờ thì trả `false` ngay. Tối đa **15 s** tính từ lúc gọi. Một lần mỗi trang |
| `interstitial(placement?)` | `Promise<boolean>` | Quảng cáo xen giữa. `true` khi đã hiện. SDK tự giữ khoảng cách thời gian (`time_show_inter` của API); vừa xem quảng cáo thưởng thì cũng chưa hiện xen giữa. Quảng cáo không bắt đầu trong 10 s thì trả `false` |
| `rewardedAvailable()` | `boolean` | Có quảng cáo thưởng sẵn sàng, qua giãn cách, không bị chặn. Dùng để **hiện hay ẩn nút** xem quảng cáo |
| `rewarded(placement?)` | `Promise<boolean>` | **`true` chỉ khi xem hết**: chỉ thưởng khi `true`. Gọi **ngay trong handler click** của người chơi |
| `onPause(fn)` / `onResume(fn)` | | SDK gọi `fn` trước và sau **mọi** quảng cáo, kể cả quảng cáo network tự chạy. Game tắt tiếng, dừng vòng lặp, chặn input. Quảng cáo treo thì sau 30 s SDK tự gọi `onResume` |
| `setMuted(muted)` | | Người chơi bật / tắt tiếng. AFG chọn quảng cáo có tiếng hay không |

- `placement` là tên chỗ đặt quảng cáo (`'run_end'`, `'revive'`, `'double_coins'`…). Được ghi vào tracking.
- Chỉ một quảng cáo một lúc: gọi khi đang có quảng cáo thì trả `false` ngay. Bấm hai lần không chạy hai quảng cáo.
- Không có cấu hình quảng cáo, bị chặn quảng cáo, hay site bị khoá: mọi hàm trả `false`, game chơi bình thường.

## 4. Portal

| Hàm | Ghi chú |
| --- | --- |
| `gameplayStart()` / `gameplayStop()` | Báo lúc người chơi **đang chơi thật** (không tính menu, màn kết thúc, tạm dừng). Poki / CrazyGames bắt buộc. Gọi trùng thì bỏ qua. `gameplayStart()` đầu tiên của trang gửi `start_game` |
| `happyTime()` | Khoảnh khắc vui (kỷ lục mới, thắng lớn). Chỉ CrazyGames dùng |
| `moreGamesUrl()` | URL "More games" của API (chỉ http/https), hoặc `null`: **`null` thì ẩn nút**. Trên GD, CrazyGames, Poki luôn là `null` (template tắt). Trang dev (`platform: 'dev'`): không bao giờ `null`, server không có link thì là `https://azgames.io` (`DEV_MORE_GAMES`), để nút hiện mà kiểm ([INTEGRATION.md §9](INTEGRATION.md)) |

## 5. Tracking

| Hàm | Ghi chú |
| --- | --- |
| `track(name, params?)` | Sự kiện riêng của game, gửi GMA. Tên ≤ 40 ký tự, tối đa 25 tham số, chuỗi ≤ 100 ký tự, boolean thành `1` / `0`, `null` / `undefined` bị bỏ |

SDK tự gửi các sự kiện chuẩn. Danh sách và quy tắc đặt tên: [ANALYTICS.md](ANALYTICS.md).

## 6. Lưu trữ: `sdk.storage`

Bộ lưu **của game** ([`sdk/storage.js`](../sdk/storage.js), kit), không phải của gmsdkjs. Một key `localStorage` cho mỗi game: **`azgames.<gameCode>`** (`azgames.dev` khi chưa có mã thật). Giá trị: `gm1` + 8 ký tự mã kiểm + JSON đã nén LZ (UTF-16) và trộn theo key; cách lưu và luật lưu gọn: [INTEGRATION.md §6](INTEGRATION.md).

| Hàm | Trả về | Ghi chú |
| --- | --- | --- |
| `get(area, fallback)` | bản sao giá trị | `fallback` khi vùng chưa có |
| `set(area, value)` | `boolean` | Ghi cả vùng. `value` phải là dữ liệu JSON. `set(area, undefined)` xoá vùng |
| `patch(area, part)` | `boolean` | Gộp `part` (object) vào vùng |
| `migrate({ 'key.cũ': 'vùng' })` | `string[]` | Chuyển key cũ **của chính game** (trước khi dùng kit) sang vùng, **một lần**, chỉ khi chưa có save. Xoá key cũ sau khi chuyển |
| `flush()` | `boolean` | Ghi ngay (bình thường gộp ghi sau 300 ms và ghi ngay khi tab ẩn / đóng). `false` = chưa ghi được (đầy / bị chặn), giữ trong bộ nhớ, ghi lại lần sau |
| `dump()` | object | Cả save dạng rõ, để debug |
| `tampered` | `boolean` | Save đã lưu không giải được (sửa tay / hỏng) nên bị bỏ: người chơi bắt đầu lại |
| `key` | `string` | `azgames.<gameCode>` |

- Vùng chuẩn: `settings` (âm thanh, ngôn ngữ…), `profile` (tiến trình, điểm, tiền); `leaderboard` của module bảng xếp hạng (tên, cờ).
- Tracking tự gửi qua SDK: `save_tampered`, `save_failed` (`{ chars, error }`), `save_large` (save quá 128 K ký tự), mỗi loại một lần mỗi trang.
- `localStorage` bị chặn (iframe sandbox, chặn cookie): lưu trong bộ nhớ suốt phiên, không lỗi.
- **Game không gọi `localStorage` trực tiếp.** `tools/check-export.mjs --src` kiểm điều này.
- gmsdkjs chỉ giữ một thứ: tên người chơi ẩn danh của GMA, ở key riêng `gma_<gameCode>.name`.

## 7. Thương hiệu: `sdk.brand`

| Thuộc tính / hàm | Ghi chú |
| --- | --- |
| `name`, `logo`, `url` | Publisher của template (ví dụ GamesForFree) |
| `loadLogo()` | `Promise<HTMLImageElement \| null>`: logo đã nạp (CORS, vẽ WebGL được), hoặc `null` |
| `trademark()` | Chữ bản quyền, theo `gameinfo.trademark` của API: `0` → `''` (**không hiện gì**); `1` (mặc định, cả khi API không trả lời) → tên miền chủ bản quyền (`azgames.io`); `2` → tên chủ bản quyền (`AZ Games`). Chủ bản quyền là `copyright` trong preset của tool build, giống nhau ở mọi publisher. Trên GD, CrazyGames, Poki luôn là `''` (template tắt). **Game không tự viết chữ bản quyền**: dùng `copyrightText(sdk)` của `sdk/copyright.js` (mặc định `© 2026 Azgames.io`, [LOADING.md §2](LOADING.md)) |

## 8. Bảng xếp hạng

Không nằm trong `sdk`: module `leaderboard/` của kit, dùng lần đăng nhập GMA của gmsdkjs. Hàm, lỗi, màn hình mặc định: [LEADERBOARD.md](LEADERBOARD.md).

## 9. Những gì SDK tự làm, game không đụng tới

- Kiểm licence với API; site không được phép thì tắt quảng cáo và hiện màn khoá.
- Chuyển hướng trang mở trực tiếp không qua portal (`force_redirect` của API).
- API chậm quá 5 s hay lỗi thì game vẫn được chơi; câu trả lời đến muộn không khoá, không chuyển hướng.
- Nạp SDK của network quảng cáo (AFG, GameDistribution, CrazyGames, Poki, WeeGoo) và GMA.

## 10. Loại thiết bị: `GMGameSDK.getDeviceType()`

Game cần biết đang chạy trên điện thoại hay máy tính (đổi cách điều khiển, cỡ nút, gợi ý xoay màn…) thì hỏi SDK của GMA, không tự đoán theo `userAgent`:

```js
const type = globalThis.GMGameSDK?.getDeviceType?.() ?? 'desktop';
const isMobile = type === 'mobile' || type === 'tablet';
```

| Giá trị | Máy (đã thử trong Edge giả lập) |
| --- | --- |
| `'desktop'` | Máy tính |
| `'mobile'` | Điện thoại: iPhone, Android |
| `'tablet'` | Máy tính bảng: iPad |

- `?.` và `?? 'desktop'` giữ cho game không lỗi khi chưa có `GMGameSDK` (trang dev không SDK, GMA bị chặn).
- **`GMGameSDK` tới muộn.** gmsdkjs nạp SDK của GMA sau, không chờ: đo trên gói thật, `loadSDK()` xong khoảng 0,8–1,3 s, `sdk.ready()` khoảng 1,5–1,9 s, còn `GMGameSDK` khoảng 2,3–2,8 s sau khi mở trang. Gọi dòng trên ngay trong `boot()` thì **điện thoại vẫn ra `'desktop'`**. Cần biết lúc khởi động thì chờ ngắn, hết hạn thì đoán theo màn cảm ứng:

```js
/** 'desktop' | 'mobile' | 'tablet': chờ GMGameSDK tối đa `ms`, không có thì đoán theo màn cảm ứng. */
async function deviceType(ms = 3000) {
  for (let t = 0; t < ms && !globalThis.GMGameSDK?.getDeviceType; t += 100) await new Promise((r) => setTimeout(r, 100));
  return globalThis.GMGameSDK?.getDeviceType?.() ?? (matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop');
}

const type = await deviceType();                 // trong boot(), sau loadSDK(); chạy song song với tải tài nguyên được
const isMobile = type === 'mobile' || type === 'tablet';
```

- Đọc một lần là đủ. Bố cục theo khung màn (dọc / ngang, cỡ) vẫn đi theo kích thước cửa sổ, không theo loại máy ([UX.md](UX.md)).
