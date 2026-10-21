# JSGMSDK — tiêu chuẩn build game JS cho azgames.io

Tài liệu chuẩn để các dự án game JS khác làm theo. Tài liệu này là **spec**; kit `JS_SDK_2.0` thực thi nó (cổng chặn trong build, mẫu trong `template/`, tầng `sdk/`).


---

## A. Kit thực thi spec này thế nào

| Spec | Ở đâu trong kit | Ai bảo đảm |
|---|---|---|
| B.1 Bố cục build (`assets/`, `StreamingAssets/`, `Language/`, `Icons/`) | `setup.mjs` dựng khung; `build.mjs` chép | build |
| B.2 Tối đa 2 file JS | `config.maxJsFiles` | cổng đếm trong `build.mjs` |
| B.3 Key `azgames.g<ID>` | `sdk/storage.js` (+ migrate qua `config.legacyKeys`) | cổng "`localStorage` chỉ ở `sdk/storage.js`" |
| B.4 GMSDK / sự kiện | `sdk/gmsdk.js`, `portal.js`, `analytics.js`, vỏ portal trong `build.mjs` | cổng danh tính |
| B.5 Ngôn ngữ | `sdk/i18n.js`, `template/Language/en.json` | cổng `Language/en.json`, khoá `t('…')` |
| B.6 `Icons/` | `template/Icons/` (ảnh mẫu) | cổng thiếu file + cổng "còn là ảnh mẫu" |
| B.7 `AZ_SETTINGS` | `template/index.html` | cổng khớp config; ghi chú của khối được giữ |
| B.8 Bản quyền | `template/notice.js`, `notice-hash.mjs` | số băm FNV-1a + cổng hỏi người dùng |
| B.9 Danh tính / analytics | `setup.mjs` hỏi; `build.mjs` in tóm tắt, `Build/identity.json` | hỏi khi danh tính đổi |
| B.10 `preview.html` = `index.html` | `build.mjs` chép + so byte | cổng so byte |

## B. Tiêu chuẩn mới

### B.1. Bố cục bản build

```
Build/<v>/                          ← VỎ: thứ upload lên portal
├── index.html                      ← trang portal phục vụ
├── preview.html                    ← giống hệt index.html, từng byte (B.10)
├── version.txt                     ← đúng 8 byte, không newline cuối
└── <v>/                            ← build thật, addressed qua <base>
    ├── index.html                  ← mở file NÀY để test local
    ├── loader.js                   ← JS #1: làm rối, file duy nhất trang nạp
    ├── framework.js                ← JS #2: toàn bộ game, minify
    ├── css/style.css
    ├── Icons/                      ← icon thương hiệu, trang gọi TRƯỚC khi JS chạy
    │   ├── web.png                 ← web icon (favicon)
    │   ├── loading.webp            ← loading icon (key art màn loading)
    │   └── domain.webp             ← domain icon (logo AZGAMES)
    ├── Language/                   ← bảng dịch, mỗi ngôn ngữ một file
    │   ├── en.json                 ← BẮT BUỘC, mặc định
    │   └── es.json …               ← tuỳ chọn
    ├── assets/                     ← nhạc, ảnh, font, … (như hiện tại, GIỮ NGUYÊN)
    │   └── img/  art/  audio/  fonts/
    └── StreamingAssets/            ← CHỈ dữ liệu game loader nạp lúc chạy (JSON…)
        └── data/
```

Quy tắc:
- **Gốc `<v>/` chỉ chứa:** `index.html`, `loader.js`, `framework.js`, `css/`, `Icons/`, `Language/`, `assets/`, `StreamingAssets/` (thư mục cuối chỉ có khi game có dữ liệu streaming). Không đặt file khác ở gốc.
- **`assets/`: nhạc, ảnh, font, sprite** — giữ đúng như hiện tại, kit nén WebP/Opus như cũ. Không đổi tên, không đổi đường dẫn.
- **`StreamingAssets/`: dữ liệu game** (JSON màn chơi, bảng cân bằng lớn, cấu hình sự kiện…) mà loader `fetch` lúc chạy. Không để ảnh/âm thanh ở đây. Game không có dữ liệu loại này thì **không cần tạo thư mục**.
- Dữ liệu nhỏ, nạp ngay lúc khởi động và không đổi (hằng số, bảng cân bằng) được phép nằm trong `framework.js`. Chỉ dữ liệu lớn hoặc tách theo màn mới ra `StreamingAssets/data/*.json`.
- `Language/` đặt **ngang hàng** `StreamingAssets/`, không nằm trong đó, để bên vận hành thêm ngôn ngữ mà không đụng tài nguyên. *(Giả định theo yêu cầu "đặt trong thư mục Language". Muốn gộp vào `StreamingAssets/Language/` thì chỉ đổi một hằng số, xem B.5.)*
- Đường dẫn trong code **luôn tương đối** và dựng từ một hằng số duy nhất:

```js
export const STREAMING = 'StreamingAssets/';   // chỉ dữ liệu; ảnh/nhạc vẫn 'assets/…'
export const LANG_DIR  = 'Language/';
// dùng: loadImage(STREAMING + 'img/ball.webp')
```

`<base href="<v>/">` do build đóng dấu (BUILD_PIPELINE §4) lo phần còn lại. Không viết đường dẫn tuyệt đối ở bất cứ đâu.

### B.2. Gói JS

- Bản build **tối đa 2 file JS**: `loader.js` + `framework.js`. Nghiêm cấm thêm `<script src>` ngoài hai file này và khối GMSDK của vỏ portal.
- Nếu game quá lớn cần tách (hiếm), tối đa **4 file** và phải có lý do. Mặc định không tách.
- Cổng chặn mới trong `build.mjs`: đếm `*.js` trong `<v>/`, quá ngưỡng (`config.maxJsFiles`, mặc định 2) thì **dừng build**.
- JSON dữ liệu / ngôn ngữ **không tính** là file JS. Không được đổi đuôi `.json` thành `.js` để né cổng.

### B.3. Key localStorage

**Một key duy nhất cho mỗi game:**

```
azgames.g<ID>        ví dụ: azgames.g205
```

- `<ID>` là **ID số do bên vận hành cấp** (trong ví dụ là `205`), lấy từ `config.gameCode`. Không tự đặt, không đoán. Phải hỏi, giống `gameId` và `portalGid`.
- Giá trị là **một object JSON**, chia vùng theo module. Không tạo thêm key rời.

```json
{
  "v": 1,
  "settings": { "lang": "en", "music": true, "sound": true },
  "profile":  { "coins": 120, "level": 3 },
  "sdk":      { "name": "player123", "country": "US" }
}
```

- `v` là version của **lược đồ dữ liệu** (không phải version build). Khi đổi cấu trúc thì tăng `v` và viết hàm migrate.
- **Mọi truy cập bọc try/catch** (cửa sổ riêng tư, bị chặn cookie, hết quota). Lỗi thì lùi về mặc định, không được làm sập game.
- **Chỉ một module chạm vào `localStorage`:** `src/sdk/storage.js`. Code game gọi qua đó, không gọi `localStorage` trực tiếp. Build thêm cổng kiểm: `localStorage.` chỉ được xuất hiện trong file này.
- Ghi gộp: đổi nhiều trường liên tiếp thì ghi một lần (debounce ~300 ms, và ghi ngay khi `pagehide`).

Mẫu `src/sdk/storage.js`:

```js
import { config as cfg } from '../config.mjs';

const KEY = `azgames.g${cfg.gameCode}`;
const SCHEMA = 1;
let cache = null;

function load() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { /* blocked or corrupt */ }
  cache = (raw && typeof raw === 'object') ? raw : { v: SCHEMA };
  return cache;
}

function flush() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); return true; } catch { return false; }
}

export const gameData = {
  get(area, fallback = {}) { return { ...fallback, ...(load()[area] ?? {}) }; },
  set(area, value)         { load()[area] = value; return flush(); },
  patch(area, part)        { return this.set(area, { ...(load()[area] ?? {}), ...part }); },
};
```

**Chuyển từ key cũ (migration một lần):** lần đầu mở bản mới, nếu `azgames.g<ID>` chưa có thì đọc các key cũ (`soccerkick.*`, `ssremake.*`…), gộp vào object mới, ghi, **rồi xoá key cũ**. Người chơi cũ không mất tiến trình.

Kiểm bản build: mở DevTools → Application → Local Storage, chỉ thấy đúng một key `azgames.g<ID>`.

### B.4. GMSDK JS / GMA EVENT

**Giữ nguyên quy cách hiện tại**, không đổi:

- Vỏ portal nạp `gm-sdk.js` + `gm-iframe.js` (v3), đặt `GMSOFT_SIGNED`, nạp `gmsdkv2.js`, rồi mới tới game.
- `var config = { gameId }` của `gmsdkv2.js` dùng **`portalGid`** (không đuôi `-az`). `GMGameSDK.init` dùng **`gameId`** (có `-az`). Hai ID khác nhau, đừng gộp.
- Cuối `</body>` có đủ global shell: `gmEvent`, `gmStartGame`, `gmStartAds`, `isFirebaseReady`, `firebaseLogEvent`, `firebaseLogEventParameter`.
- Game khởi động bằng `await startAnalytics()` **trước** sự kiện đầu tiên, rồi `analytics.log('loaded_game', …)` lúc người chơi thật sự thấy menu.
- Bộ sự kiện chuẩn: `loaded_game`, `PlayGame`, `LiveTime`, `SessionTime`, `EndGame`, `DeathTime`, `CompleteGame`, `CompleteTime`, `RestartTime`, `QuitTime`. Chi tiết trong `docs/ANALYTICS.md`.
- Quảng cáo đi qua `gmStartGame(cb)` / `gmStartAds(cb)`.

Chi tiết đầy đủ: `docs/ANALYTICS.md`, `docs/BUILD_PIPELINE.md` §4, `sdk/gmsdk.js`, `sdk/portal.js`.

### B.5. Đa ngôn ngữ

**Quy tắc**

- Mặc định tiếng Anh. Mỗi game **bắt buộc** có `Language/en.json` chứa **toàn bộ** key của game. Ngôn ngữ khác là tuỳ chọn.
- Không còn bảng dịch dạng module JS. Không còn chuỗi hiển thị cho người chơi nằm cứng trong code.
- Tên file là mã ngôn ngữ ISO 639-1 viết thường: `en.json`, `es.json`, `pt.json`, `fr.json`, `de.json`, `sv.json`, `vi.json`…
- File là JSON phẳng `{ "key": "value" }`, UTF-8 không BOM. Không lồng nhau, không ghi chú.
- Key viết `snake_case`, đặt theo **ý nghĩa** (`play`, `game_over`), không đặt theo câu chữ.
- Tham số trong chuỗi dùng `{0}`, `{1}`… (giữ như hiện tại).

`Language/en.json`:

```json
{
  "play": "Play",
  "settings": "Settings",
  "game_over": "Game Over",
  "x_wins": "{0} wins this game!",
  "load_error": "Couldn't load the game. Please check your internet connection and try again.",
  "try_again": "Try again"
}
```

**Nạp và lùi key**

1. `en.json` được nạp **trước khi hiện UI đầu tiên** (qua `loadJSON` của `sdk/net.js`, có timeout và thử lại).
2. Ngôn ngữ người chơi chọn nạp **lười**, khi chọn. Lỗi nạp thì dùng `en`, không chặn game.
3. Thiếu key ở ngôn ngữ đang chọn thì lùi về `en`; thiếu cả ở `en` thì trả về **chính key** và `console.warn` ở chế độ `?debug`.

Mẫu `src/sdk/i18n.js`:

```js
import { loadJSON } from './net.js';
import { gameData } from './storage.js';

const LANG_DIR = 'Language/';
const DEFAULT = 'en';
const tables = {};
let current = DEFAULT;
const listeners = [];

async function ensure(code) {
  if (tables[code]) return true;
  try { tables[code] = await loadJSON(`${LANG_DIR}${code}.json`); return true; }
  catch { return false; }
}

export async function initI18n(wanted = gameData.get('settings').lang) {
  await ensure(DEFAULT);                         // en phải có, lỗi thì để lỗi nổi lên (popup Try again)
  await setLang(wanted || DEFAULT);
}

export async function setLang(code) {
  if (!(await ensure(code))) code = DEFAULT;
  current = code;
  document.documentElement.lang = code;
  gameData.patch('settings', { lang: code });
  listeners.forEach((fn) => fn(code));
}

export function t(key, ...args) {
  const s = tables[current]?.[key] ?? tables[DEFAULT]?.[key] ?? key;
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '') : s;
}

export const onLangChange = (fn) => listeners.push(fn);
export const currentLang = () => current;
```

**Ngoại lệ bắt buộc, giữ nguyên:** dòng chữ trên màn loading (`Almost there...`, `Connection problem. Tap to retry.`) vẫn là **tiếng Anh cứng** trong `index.html` / `loader.js`, vì chúng hiện trước khi `Language/en.json` kịp tải (BUILD_PIPELINE §3).

**Danh sách ngôn ngữ cho menu chọn:** khai báo trong code (`code`, tên hiển thị bằng chính ngôn ngữ đó, ví dụ `Español`), không đọc từ thư mục. Menu chỉ liệt kê ngôn ngữ thật sự có file.

**Quét tiếng Việt:** `check_build.py` sẽ quét thêm `Language/*.json`. `Language/vi.json` và các ngôn ngữ có dấu được khai báo ở `check.allowVietnamese` (đổi từ `src/data/lang.js` sang `Language/*.json`). Mọi nơi khác vẫn cấm.

**Cổng chặn mới trong build**

- Thiếu `Language/en.json` → dừng.
- File ngôn ngữ nào có key **không có trong `en.json`** → cảnh báo (key mồ côi).
- File ngôn ngữ nào **thiếu key** so với `en.json` → cảnh báo kèm số lượng (vẫn build được, vì có lùi key).
- JSON không hợp lệ, hoặc giá trị không phải chuỗi → dừng.
- Mọi `t('key')` / `data-i18n="key"` trong nguồn mà `en.json` không có → dừng.

### B.6. Icon thương hiệu: thư mục `Icons/`

Ba loại icon do **`index.html` gọi trực tiếp** (thẻ `<link rel="icon">`, màn loading), hiện trước khi `framework.js` chạy. Vì vậy chúng **không** nằm trong `assets/` hay `StreamingAssets/` (thứ loader nạp bằng JS và đếm vào thanh %). Gom vào một thư mục riêng, **tên file cố định** để mọi dự án thay ảnh mà không phải sửa HTML:

| File | Là gì | Kích thước đề xuất | Dùng ở |
|---|---|---|---|
| `Icons/web.png` | **Web icon** (favicon) | 256×256, vuông, PNG nền trong | `<link rel="icon" href="Icons/web.png">` |
| `Icons/loading.webp` | **Loading icon** (key art của game) | 16:9 hoặc vuông, cạnh dài ≥ 1024 | nền mờ + ảnh nhỏ ở `#gmLoader` |
| `Icons/domain.webp` | **Domain icon** (logo AZGAMES, góc dưới phải màn loading) | cao ≥ 112 px, nền trong | `.gmLoaderBrand` |

Quy tắc:
- **Tên file cố định**, không đổi theo game. Chỉ thay nội dung `web.png` và `loading.webp`; `domain.webp` dùng chung mọi game của publisher (kit đã có sẵn bản gốc).
- Đường dẫn trong `index.html` là tương đối (`Icons/…`), đi qua `<base>` như mọi đường dẫn khác.
- Nén theo luật B (lossy q90) của kit: `webp-art.py` coi cả thư mục `Icons/` là lossy, trừ `web.png` (giữ PNG cho tương thích trình duyệt). Không ai cắt ô hay lấy mẫu các ảnh này.
- Rewrite `.png` → `.webp` không đụng tới `web.png` (cho vào danh sách bỏ qua).
- Cổng chặn: thiếu một trong ba file → **dừng build**. (Việc nhận ra ảnh mẫu chưa thay chưa được kiểm tự động, tự rà bằng mắt.)
- Ảnh gốc độ phân giải cao để ở ngoài bản ship (`exclude`), chỉ ship bản đã nén.

### B.7. Khu vực cài đặt AZGAMES trong `index.html`

`index.html` có **một khối cài đặt duy nhất** của portal, đặt trong script inline **đầu tiên** (trước `GM_GAME`). Đây là chỗ đổi mã game và ngôn ngữ mặc định khi mang game sang dự án khác, không phải tìm trong code.

```html
<script>
  /* ===== AZGAMES SETTINGS ===== */
  window.AZ_SETTINGS = {
    // Game code from the portal operator. Used as the localStorage key: azgames.<gameCode>
    gameCode:  'g205',
    // Default language for new players. Must match a file in Language/ (en -> Language/en.json)
    language:  'en',
    // SDK game id (ends with -az). Used by GMGameSDK.init: analytics events, leaderboard
    gameId:    'ten-game-az',
    // Portal slug (no -az). Used by gmsdkv2.js: More Games, ads, portal redirect
    portalGid: 'ten-game'
  };
  /* ============================ */
  window.GM_GAME = { id: 'ten-game-az', version: 'dev' };
  window.GM_LOAD_START = performance.now();
</script>
```

**Ghi chú trong khối này được giữ lại ở bản build.** Đây là ngoại lệ duy nhất của `docs/BUILD_RULES.md` §2: build tách khối giữa hai dòng `AZGAMES SETTINGS` ra trước khi minify rồi đặt lại nguyên văn, và `check_build.py` bỏ qua khối này. Ghi chú trong khối **phải bằng tiếng Anh** (quy tắc không tiếng Việt vẫn áp dụng).

| Trường | Ý nghĩa | Ràng buộc |
|---|---|---|
| `gameCode` | Mã game dạng `g<ID>` | Khớp `^g\d+$`. Bằng `g` + `config.gameCode`. Là nguồn duy nhất cho key `azgames.<gameCode>` (B.3). |
| `language` | Mã ngôn ngữ mặc định, ứng với file `Language/<language>.json` | Phải có file tương ứng trong `Language/` và nằm trong danh sách ngôn ngữ của game. Mặc định `en`. |

Khối chia hai nhóm:
- **Chỉnh tay:** `gameCode`, `language`. Đây là nguồn thật, code đọc từ đây.
- **`gameId`, `portalGid` (sửa được cả sau khi build):** lúc chạy, SDK và vỏ portal **đọc thẳng từ `AZ_SETTINGS`**, không đọc từ giá trị đã gộp sẵn trong `framework.js`. Nên mở `index.html` trong bản build, sửa hai dòng này là có hiệu lực, không cần build lại. Build vẫn kiểm khớp `config.mjs` lúc build để bản ra lò luôn đúng; sau đó ai sửa tay là tự chịu trách nhiệm. `GM_GAME.id` cũng đọc từ `gameId` này.
- **Quy tắc khi sửa tay sau build:** `gameId` có đuôi `-az`, `portalGid` không có. Sửa ở **`Build/<v>/index.html`** (file ngoài, trang portal phục vụ thật), rồi chép đè sang `preview.html` để hai file vẫn giống hệt nhau (B.10). File trong `Build/<v>/<v>/index.html` chỉ để test local, sửa khi cần thử với giá trị mới. Sửa xong mở `?debug` kiểm `[analytics] loaded_game` và Network.

Cách code đọc:
- `sdk/storage.js` lấy key từ `AZ_SETTINGS.gameCode` (không tự ghép từ chỗ khác): `const KEY = 'azgames.' + AZ_SETTINGS.gameCode`.
- `sdk/i18n.js` chọn ngôn ngữ theo thứ tự: **lựa chọn đã lưu của người chơi** → `AZ_SETTINGS.language` → `en`. Ngôn ngữ mặc định chỉ có tác dụng với người chơi mới.
- Thiếu `AZ_SETTINGS`, hoặc `gameCode` sai dạng → `sdk` **từ chối khởi động** và báo rõ (tiếng Anh) cái gì thiếu.

Cổng chặn trong `build.mjs` (đọc khối này bằng regex, giống cách đang đọc `GM_GAME`):
- `gameId`, `portalGid` khác giá trị trong config → dừng.
- `gameCode` khác `g` + `config.gameCode` → dừng.
- `language` không có file `Language/<language>.json` → dừng.
- `language` không thuộc danh sách ngôn ngữ của game → dừng.
- Còn giá trị mẫu (`g000`, `xx`) → dừng.

Khối này giữ nguyên trong bản build (không xoá bằng minify), để bên vận hành đọc được mã game ngay trong `index.html`. Chỉ phần ghi chú bị bỏ, đúng quy tắc `docs/BUILD_RULES.md` §2.

### B.8. Bản quyền `© 2026 Azgames.io`

Quy cách đầy đủ ở `docs/BUILD_RULES.md` §1. Tóm tắt phần bắt buộc:

- Game hiển thị đúng dòng **`© 2026 Azgames.io`** cho người chơi. Version (`V1.0`) đi kèm. Chỗ ưu tiên là chân panel Settings: version trái, bản quyền phải.
- **Vị trí không quá quan trọng.** Đặt ở Settings, Home, Pause hay popup Info đều được, miễn người chơi nhìn thấy được.
- **Dòng bản quyền chỉ cần khoá bằng số băm FNV-1a:** `notice` trong `src/config.mjs` được băm, `src/notice.js` giữ `EXPECT`, game gọi `noticeOk()` lúc boot và `halt()` nếu lệch. Sửa dòng chữ mà không cập nhật `EXPECT` thì build dừng, và bản chạy cũng dừng.
- Đổi năm hoặc nội dung: sửa `notice`, chạy `node JS_SDK_2.0/tools/notice-hash.mjs`, dán `EXPECT` mới. Đổi version chỉ sửa `appVersion`.

**Cổng hỏi người dùng khi build**

Build quét nguồn game (`webDir`: `src/`, `index.html`, `Language/*.json`) tìm chuỗi `© 2026 Azgames.io`, và dùng `noticeOk()` / `EXPECT` để kiểm số băm.

| Tình huống | Build làm gì |
|---|---|
| Tìm thấy chuỗi và số băm khớp | Đi tiếp. In một dòng: `copyright: found in <file>`. |
| **Không tìm thấy chuỗi ở đâu cả** | **Dừng và hỏi người dùng** (xem dưới). |
| Tìm thấy nhưng số băm lệch | Dừng, in số đúng (như hiện tại). |

Câu hỏi khi không tìm thấy (build chạy trong terminal tương tác):

```
Không tìm thấy "© 2026 Azgames.io" trong game.
  1) Game đã có dòng này rồi, nhưng build không nhận ra  → hỏi: nó nằm ở file/màn nào?
  2) Chưa có → build dừng; hãy thêm theo BUILD_RULES §1 rồi build lại
Chọn [1/2]:
```

- Chọn **1**: người dùng nhập vị trí (ví dụ `Settings panel, src/scenes/settings.js`). Build in lại vị trí đó và hỏi xác nhận: *"Đã đúng quy cách SDK chưa (hiển thị `© 2026 Azgames.io`, khoá bằng FNV-1a)?"*. Trả lời **có** thì build đi tiếp và ghi vị trí vào biên nhận build; **không** thì dừng.
- Chọn **2** hoặc không trả lời: build dừng (exit 1).
- **Môi trường không tương tác** (CI, không có TTY): không hỏi được thì **dừng**, không bao giờ tự bỏ qua. Chỉ cho phép bỏ qua khi đặt `config.copyright.confirmedAt = '<vị trí>'` (đã có người xác nhận trước), khi đó build in vị trí đó ra.
- Không có cờ nào để tắt hẳn cổng này.

### B.9. Analytics và danh tính game: lấy ở đâu, ai hỏi

Analytics **không có "key" riêng cho từng game**. Sự kiện đi theo định danh của game, cộng cấu hình Firebase dùng chung của publisher:

| Thứ | Lấy ở đâu | Dùng cho |
|---|---|---|
| `gameId` (có đuôi `-az`) | **Bên vận hành portal cấp**, chép nguyên văn | `GMGameSDK.init`, analytics, leaderboard, canonical |
| `portalGid` (không `-az`) | Bên vận hành cấp (hoặc tự bỏ `-az` của `gameId`) | `gmsdkv2.js` (More Games, quảng cáo), redirect |
| `gameCode` (`g205`) | Bên vận hành cấp | key localStorage (B.3), khối `AZ_SETTINGS` (B.7) |
| ID leaderboard | Bên vận hành cấp (nếu có bảng xếp hạng) | leaderboard |
| `signDomain` | Bên portal cấp, **chung cho publisher** | `GMSOFT_SIGNED` trong vỏ portal |
| `firebase` (`apiKey`, `projectId`, `measurementId`…) | Project Firebase **dùng chung** của publisher, có sẵn trong `config.mjs` | nhánh Firebase của analytics |
| `publisherHost`, `sdkHost` | Mặc định của publisher (`azgames.io`, `https://gm.azgame.io`) | `GMGameSDK.init`, nhận sự kiện |

Các game chung một project Firebase, **phân biệt nhau bằng `gameId`** gửi kèm. Vì vậy sai `gameId` thì số liệu chảy sang game khác mà không có dấu hiệu gì.

**Ai hỏi người dùng, lúc nào**

| Bước | Hỏi gì | Hiện trạng |
|---|---|---|
| `node JS_SDK_2.0/tools/setup.mjs` (một lần, khi bắt đầu dự án) | **Chỉ 3 thứ:** tên game, `gameId`, mã game (`G131`, giữ chữ G). Mọi thứ khác lấy mặc định rồi in thành bảng thông tin | AI chạy bằng `--name --id --gid`, người dùng chạy trong terminal. Từ chối giá trị mẫu và id của game khác |
| `npm run build` | Không hỏi các giá trị trên; in lại bảng thông tin game của bản build | Build chỉ **kiểm**, rồi dừng nếu sai |

Build kiểm (cổng danh tính, đã có):
- `confirmedFor === gameId` ở `JS_SDK_2.0/config.mjs`;
- `gameId` và `confirmedFor` trong `src/config.mjs` khớp file kia;
- `GM_GAME.id` trong `index.html` khớp `gameId`;
- SDK lúc chạy cũng từ chối khởi động nếu `gameId` hay `gameName` còn là giá trị mẫu.

**Cổng bổ sung:** khối `AZ_SETTINGS` ở B.7 chính là nơi hiển thị danh tính đang chọn trong `index.html`. Ngoài ra đầu mỗi lần build in **một khối tóm tắt danh tính** để người build nhìn lại trước khi upload:

```
Identity:  Soccer Kick | gameId soccer-kick-az | portalGid soccer-kick | code g205
Firebase:  gmsoft-sdk (shared) | SDK host https://gm.azgame.io
Copyright: © 2026 Azgames.io (found in src/scenes/settings.js) | EXPECT ok   ← chỉ in ở console khi build, không nằm trong AZ_SETTINGS
Language:  default en | Language/ en es pt fr de sv
```

Khi build tương tác và danh tính **khác lần build trước** (so với `Build/<v-trước>/identity.json`, hoặc `gameId` đổi), build hỏi một câu: *"Danh tính đã đổi so với bản trước. Đã hỏi bên vận hành chưa? (y/N)"*. Không trả lời `y` thì dừng. Môi trường không tương tác thì in cảnh báo to và dừng.

Kiểm analytics sau build: mở `preview.html?debug`, console phải có `[analytics] loaded_game`; tab Network có `POST …/api/v1/events` (GMSDK) hoặc `google-analytics.com/g/collect` (Firebase). Chi tiết: `docs/ANALYTICS.md` §6.

### B.10. `preview.html` giống hệt `index.html`

Các kit trước sinh `preview.html` là một trang bọc chỉ chứa `<iframe>`. Từ 2.0: **`preview.html` là bản sao nguyên văn từng byte của `index.html`** ở cùng thư mục (vỏ portal).

```
Build/<v>/
├── index.html      ← trang portal phục vụ
├── preview.html    ← bản sao GIỐNG HỆT index.html, từng byte
├── version.txt
└── <v>/ …
```

Quy tắc:
- Build ghi `index.html` xong thì **chép nguyên file đó** thành `preview.html`. Không sinh nội dung riêng, không có khác biệt nào, kể cả khối `AZ_SETTINGS`, `GM_GAME`, `<base>`, GMSDK, Firebase.
- Cách bật debug không đổi: mở `preview.html?debug` (hoặc `index.html?debug`). Mã game đọc `?debug` từ URL, nên hai file chạy y hệt nhau và `startAnalytics()` tự gọi `diagnose()`.
- Mục đích của `preview.html`: cùng một trang với bản sẽ upload, dùng để kiểm tra mà không đụng tới URL chính. Vì giống hệt nên **sửa tay sau build (B.7) phải làm ở cả hai file** `index.html` và `preview.html`, hoặc sửa `index.html` rồi chép đè sang `preview.html`.
- Không còn iframe, nên log và Network của `preview.html` là của chính trang game.

**Cổng chặn trong `build.mjs`** (sau bước gỡ ghi chú / minify trang, tức bước cuối chạm vào các trang ship):

```js
// preview.html must be byte-identical to index.html
const a = readFileSync(join(portal, 'index.html'));
const b = readFileSync(join(portal, 'preview.html'));
if (!a.equals(b)) throw new Error('preview.html differs from index.html');
```

- Thứ tự: bước 7 ghi `index.html` → chép sang `preview.html` → bước 8 (gỡ ghi chú, minify) chạy trên cả hai **hoặc** chạy trên `index.html` trước rồi mới chép. Chọn cách thứ hai để hai file không thể lệch nhau.
- Khác nhau dù chỉ một byte → **dừng build**.
- Cổng cũ "ba cửa chặn khi bọc vỏ" giữ nguyên.
- `check_build.py` quét cả hai file như mọi trang ship.
- Biên nhận build in thêm: `preview.html == index.html (sha256 <8 ký tự đầu>)`.

---

## C. Checklist cho dự án mới

- [ ] Game hiển thị `© 2026 Azgames.io` (vị trí tuỳ chọn, ưu tiên Settings); `EXPECT` khớp; build không phải hỏi, hoặc đã xác nhận vị trí.
- [ ] `index.html` có khối `AZ_SETTINGS` với `gameCode` (`g<ID>`) và `language` (có file trong `Language/`).
- [ ] Hỏi bên vận hành: `gameId`, `portalGid`, **`gameCode` (ID số)**, ID leaderboard (nếu có).
- [ ] Nhạc/ảnh/font nằm trong `assets/`; dữ liệu loader nạp lúc chạy (nếu có) nằm trong `StreamingAssets/`.
- [ ] `Icons/` có đủ `web.png`, `loading.webp`, `domain.webp`; `loading.webp` và `web.png` là của game, không phải ảnh mẫu.
- [ ] `preview.html` giống hệt `index.html` từng byte (build tự so).
- [ ] Bản build có đúng `loader.js` + `framework.js` (≤ `maxJsFiles`), không file JS nào khác.
- [ ] `localStorage` chỉ có key `azgames.g<ID>`; chỉ `sdk/storage.js` chạm vào `localStorage`.
- [ ] Có migrate từ key cũ (nếu game đã từng phát hành).
- [ ] `startAnalytics()` chạy trước sự kiện đầu tiên; `loaded_game` bắn khi menu hiện; bộ sự kiện chuẩn đủ.
- [ ] `Language/en.json` có **toàn bộ** key; mọi `t('…')` đều có key tương ứng.
- [ ] Không còn chuỗi người chơi nhìn thấy nằm cứng trong code (ngoại lệ: dòng chữ màn loading).
- [ ] `npm run build` qua hết mọi cổng, `check_build.py` OK.
- [ ] Chạy thử `Build/<v>/<v>/index.html` qua server tĩnh: Network không có 404, Local Storage đúng một key, đổi ngôn ngữ chạy được.
- [ ] Chạy thử `preview.html?debug`: console có `[analytics] loaded_game`.
- [ ] Các mục trong `docs/BUILD_RULES.md` §5.
