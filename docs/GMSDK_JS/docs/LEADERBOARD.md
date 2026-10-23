# Bảng xếp hạng (Leaderboard)

Bảng xếp hạng của game chạy trên gmsdkjs: gửi điểm, xem top theo hôm nay / tuần / tháng / mọi lúc, hạng của người chơi, tên và cờ. Code ở [`leaderboard/`](../leaderboard/): `leaderboard.js` (dịch vụ), `ui.js` (màn hình mặc định), `hmac.js` (ký điểm), `flags/` + `countries.json` (cờ). Mẫu chạy được: [`example/main.js`](../example/main.js).

## 1. Cách nó chạy

```
Game ──► leaderboard.js ──► GMGameSDK (gm-sdk.js của GMA) ──► máy chủ GMA ──► bảng <leaderboardId>
                              ▲
gmsdkjs.js đã nạp, init bằng gma.host + (id + gma.suffix) của portal, đăng nhập ẩn danh
```

- **Không tự init GMA.** Mỗi trang chỉ có một `GMGameSDK`; gmsdkjs nạp và đăng nhập nó cho tracking (template của portal điền `gma`). `leaderboard.js` chờ người chơi đã đăng nhập rồi dùng lại đúng đối tượng đó. Đây là chỗ duy nhất game chạm `GMGameSDK`, và chỉ qua module này.
- **Một bảng cho mọi portal.** Key GMA khác nhau theo portal (đuôi `-az`, `-1games`…), máy chủ đưa điểm của mọi key về cùng bảng. Game chỉ ghi id bảng (`leaderboardId`), không ghi host hay key.
- **Ký điểm ở đây.** `gm-sdk.js` không ký; thiếu token hợp lệ thì máy chủ từ chối điểm. Khoá ký nằm trong `leaderboard.js` (không phải bí mật: bản Unity WebGL cũng mang nó). `hmac.js` tự tính HMAC vì trang portal chạy http thường, ở đó không có `crypto.subtle`.
- **Không bao giờ throw.** Lỗi là `false` / `null`, lý do in ra console và vào sự kiện `leaderboard_*` (§6).

## 2. Gắn vào game

1. `config.json`: `"leaderboardId": "<id bảng chủ game cấp>"` (ví dụ `leaderboard-topscore`); game không có bảng thì `null`. `tools/bump-version.mjs` chép sang `game.json`. **Không đoán:** id sai thì máy chủ báo lỗi 500, không có bảng nào nhận điểm.
2. Chép code:

| Từ kit | Vào game |
| --- | --- |
| `leaderboard/leaderboard.js`, `hmac.js` (+ `leaderboard.d.ts` nếu dùng TypeScript) | `src/sdk/leaderboard/` |
| `leaderboard/ui.js` (nếu dùng màn hình mặc định) | `src/sdk/leaderboard/` |
| `leaderboard/flags/`, `leaderboard/countries.json` (nếu dùng màn hình mặc định, hoặc game tự vẽ có cờ) | `public/assets/leaderboard/` |

3. Chữ: thêm nhóm `leaderboard` vào `i18n/<thẻ>.json` (§4). Thiếu key thì màn hình mặc định hiện tiếng Anh, không hiện key.

```js
import { createLeaderboard } from './sdk/leaderboard/leaderboard.js';
import { openLeaderboard } from './sdk/leaderboard/ui.js';

// Sau getSDK() và game.json (INTEGRATION.md §2). Tạo sớm: nó tự chờ gmsdkjs đăng nhập.
const board = manifest.leaderboardId ? createLeaderboard({ sdk, boardId: manifest.leaderboardId }) : null;

// Hết ván: gửi một lần, máy chủ giữ điểm cao nhất của từng kỳ.
const r = await board?.submit(score); // { rank, score } | null

// Nút Bảng xếp hạng ở menu.
openLeaderboard({ board, t, onClose: resumeMenu });
```

## 3. Hàm

| Hàm | Trả về | Ghi chú |
| --- | --- | --- |
| `createLeaderboard({ sdk, boardId, waitMs? })` | `board` | `sdk` = `getSDK()` (bản sao tên / cờ trong save của game, gửi sự kiện). `waitMs` mặc định 20 000. **Tên và cờ lấy từ hồ sơ GMA** (`getMyProfile`): đặt ở game nào cùng người chơi GMA thì game khác cũng thấy. Bản trong save chỉ dùng khi không đọc được GMA; riêng khi GMA còn tên ngẫu nhiên `playerXXXXXX` mà máy có tên người chơi đã chọn thì tên đó được gửi lên |
| `board.ready()` | `Promise<boolean>` | Đã đăng nhập, dùng được. Lần đầu chờ gmsdkjs tối đa `waitMs`; `false` thì lần gọi sau thử lại |
| `board.player()` | `{ id, name, country } \| null` | `null` trước khi `ready()`. `country` là mã ISO (`US`, `VN`, `GB-ENG`), `''` = chưa chọn |
| `board.needsName()` | `boolean` | Người chơi còn tên mặc định `playerXXXXXX` |
| `board.setPlayer({ name?, country? })` | `Promise<boolean>` | Đổi tên / cờ. Bản trên máy chỉ đổi khi máy chủ nhận. **Luật tên của máy chủ:** 1–20 ký tự `A-Z a-z 0-9 _ -`; `cleanName()` tự đổi dấu cách thành `_`, bỏ dấu (é → e) và ký tự khác |
| `board.submit(score, metadata?)` | `Promise<{ rank, score } \| null>` | Ký rồi gửi. `null` = điểm không lên bảng (mạng, token, chưa đăng nhập) |
| `board.top(period?, { offset?, limit? })` | `Promise<{ period, total, entries } \| null>` | `period`: `daily` / `weekly` / `monthly` / `alltime` (mặc định). **`null` = không tải được**, khác bảng trống (`entries: []`) |
| `board.me(period?)` | `Promise<entry \| null \| undefined>` | Hạng của người chơi. `null` = chưa có điểm kỳ này, `undefined` = không tải được |

`entry` = `{ rank, playerId, name, country, score }`. Kỳ là giờ **UTC** của máy chủ: "hôm nay" đổi lúc 0 h UTC, tuần bắt đầu thứ Hai (ISO).

## 4. Màn hình mặc định (`ui.js`)

`openLeaderboard({ board, t, assets?, period?, pageSize?, onClose? })` mở một lớp phủ HTML trên canvas (mọi engine): bốn tab kỳ, top 20 kèm nút xem thêm, dòng của người chơi (hạng và điểm, hoặc "chưa có điểm"), nút đổi tên + cờ. Esc, nút × hoặc bấm ra ngoài để đóng; trả về `{ close() }`.

- `assets`: thư mục chứa `flags/` và `countries.json` trong gói, mặc định `assets/leaderboard/`.
- Trong lúc mở: game tự dừng thứ đang chạy (ví dụ thêm lớp `paused` như example), tiếp tục ở `onClose`.
- Muốn giao diện riêng: bỏ `ui.js`, tự vẽ bằng các hàm §3. Cờ: `assets/leaderboard/flags/<mã>.png`, `GLOBE.png` khi chưa chọn.

Khoá chữ (nhóm `leaderboard`, `t('leaderboard.title')`…):

```json
{
  "leaderboard": {
    "title": "Leaderboard", "daily": "Today", "weekly": "This week", "monthly": "This month", "alltime": "All time",
    "loading": "Loading…", "offline": "Could not load the leaderboard.", "retry": "Try again",
    "empty": "No scores yet. Be the first!", "you": "You", "no_score": "No score yet", "more": "More",
    "edit_profile": "Name & flag", "name": "Name", "name_rule": "Up to 20 letters, numbers, _ or -", "country": "Flag", "save": "Save", "cancel": "Cancel",
    "save_failed": "Could not save. Check the name and try again.", "close": "Close"
  }
}
```

## 5. Thử trên máy

Trang dev phải nạp GMA thì mới có bảng: `gma: { host: 'https://gm.azgame.io', suffix: '-az' }` (key = `gameId` + `suffix`, phải là key có thật trên GMA) và `gameId` đúng của game. `example/` để sẵn giá trị thử của Duet (`duet` / `-az` / `leaderboard-topscore`).

- Chạy trên `localhost` / `127.0.0.1`: đăng nhập và bảng xếp hạng chạy, nhưng **API sự kiện của GMA chặn CORS** (`/api/v1/events`), console báo `flush failed`. Không ảnh hưởng bảng; tracking thật xem trên server.
- Trình duyệt chạy ẩn (Playwright headless): quảng cáo test preroll của Google có thể không kết thúc, game đứng ở `onPause`. Thử bảng thì để `enable_preroll: 'no'`.
- Điểm gửi khi thử là **điểm thật** trên bảng của game: dùng bảng thử, hoặc xoá trên admin GMA.

## 6. Sự kiện và lỗi thường gặp

`leaderboard.js` gửi qua `sdk.track`: `leaderboard_ready { ok }`, `leaderboard_submit { ok, score, reason? }`, `leaderboard_profile { ok, reason? }`. Console luôn in một dòng khi gửi điểm (`[leaderboard] submitted 120 as <playerId> to <board>: rank 5`), kể cả bản phát hành: người chơi báo "điểm không lên" thì dòng này trả lời.

| Thấy | Nguyên nhân |
| --- | --- |
| `ready()` → `false`, console `the GM SDK did not sign in` | Trang không có `gma` (trang dev chưa điền), mất mạng, hoặc trình chặn quảng cáo chặn `gm-sdk.js` |
| `submit` → `null`, lý do `invalid request` (400) | Token sai / hết hạn (giờ máy lệch quá 30 phút), hoặc điểm ngoài giới hạn của bảng |
| `top` → `null`, lỗi 500 `server error` | `leaderboardId` không có trên GMA (id sai, hoặc chưa tạo bảng cho game) |
| `setPlayer` → `false`, lý do `invalid name` | Tên ngoài luật của máy chủ (dấu cách, có dấu, quá 20 ký tự): đưa qua `cleanName()` trước; `ui.js` tự lọc khi gõ |
| Cờ `US`, tên `playerXXXXXX` | Người chơi chưa chọn: gmsdkjs đăng nhập lần đầu với giá trị mặc định. Chọn trong màn hình tên + cờ là lưu lên máy chủ |

## 7. QA

Thêm vào checklist [QA.md §3.5](QA.md): mở bảng (4 kỳ), chơi một ván rồi thấy điểm + hạng, đổi tên + cờ rồi tải lại trang vẫn giữ, tắt mạng thì bảng báo "không tải được" (không treo, không trống im lặng), game tạm dừng khi bảng mở.
