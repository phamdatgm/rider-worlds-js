# Gói xuất của game

Game chỉ xuất **gói dữ liệu thuần**. Trang HTML, khối `GMSDKJS_OPTIONS` (kể cả `sdkUrl` của `gmsdkjs.js`), nén, obfuscate, khoá domain và đẩy CDN là việc của **tool build trên api.1games.io**, theo từng platform. Cùng một gói chạy trên mọi platform.

## 1. Bố cục

```
<version>-<id>/
├── loader.js        của kit (loading/loader.js, chép nguyên): script DUY NHẤT trang nạp; hiện loading, tải gmsdkjs.js + game.js
├── game.json        manifest
├── game.js          toàn bộ code game: 1 file, ES2017+, đã minify, KHÔNG obfuscate; loader.js tải nó
├── i18n/<thẻ>.json  mỗi ngôn ngữ một file, thẻ BCP 47: en.json, en-US.json, zh-TW.json (INTEGRATION.md §7)
├── icons/           màn loading: loading.webp, logo.webp, loader.css (tên cố định, LOADING.md §1.1)
├── assets/…         ảnh, âm thanh, font, dữ liệu (giữ nguyên cấu trúc thư mục)
├── index.html       (sau bước ghép §7) trang gm: template của platform, đã điền
├── preview.html     (sau bước ghép §7) giống hệt index.html
└── <version>-<id>.zip  (bước cuối §8) cả thư mục này trong một file zip, để upload
```

Chỉ những mục đó ở gốc, không source map. **Tên thư mục và file phân biệt chữ hoa / thường** (CDN chạy Linux): `icons/` chứ không `Icons/`, code gọi `assets/Player.png` thì file phải đúng `Player.png`. Windows không phân biệt nên lỗi này chỉ lộ khi lên CDN; `check-export` so từng chữ và báo lỗi. `index.html` / `preview.html` chỉ được là trang gm do `tools/assemble.mjs` ghép (§7); game không có trang HTML riêng.

## 2. `game.json`

```json
{
  "id": "wheelie-spooky",
  "gameCode": "g131",
  "name": "Wheelie Spooky",
  "version": "26101701",
  "entry": "game.js",
  "orientation": "any",
  "languages": ["en", "es", "pt", "fr", "de", "it"],
  "defaultLanguage": "en",
  "portals": { "gd": { "gameKey": "0123456789abcdef0123456789abcdef" } }
}
```

| Trường | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `id` | ✓ | Slug của game trên portal (`a-z`, `0-9`, `-`). Tool build điền vào `GMSDKJS_OPTIONS.gameId` |
| `gameCode` | ✓ | `g<số>`: key lưu trữ `azgames.<gameCode>`. Tool build điền vào `GMSDKJS_OPTIONS.gameCode`, sửa được ở `index.html` sau khi build. Chủ game chưa có mã: `bump-version` đặt mã tạm `g` + năm tháng ngày giờ phút giây (`check-export` cảnh báo), đổi trước khi phát hành |
| `name` | ✓ | Tên hiển thị |
| `version` | ✓ | Quy chuẩn GM `yymmddXX`: ngày build và lần build trong ngày (`01`, `02`…), ví dụ `26101701`. Mỗi lần build tăng 1, bằng `tools/bump-version.mjs` (§4). Gửi GMA và hiện ở góc màn hình (`V26101701`) |
| `entry` | | Mặc định `game.js` |
| `orientation` | | `any` (mặc định), `landscape`, `portrait` |
| `languages` | ✓ | Thẻ BCP 47 có file trong `i18n/` (`en`, `en-US`, `zh-TW`…, đúng chữ hoa / thường). Phải có một tiếng Anh (`en` hoặc `en-XX`) |
| `defaultLanguage` | ✓ | Ngôn ngữ dự phòng, có file đủ mọi key. Người chơi chưa chọn và trang không đặt `language` thì game mở bằng ngôn ngữ này (INTEGRATION.md §7). `tools/assemble.mjs` điền nó vào `<!--LANGUAGE-->` của trang |
| `leaderboardId` | khi có bảng xếp hạng | Id bảng trên GMA ([LEADERBOARD.md](LEADERBOARD.md)); chép từ `config.json`. Không có khoá này = game không có bảng |
| `portals.gd.gameKey` | khi lên GameDistribution | Game ID của GameDistribution (32 hex), giá trị **mặc định**. Tool build điền vào `GMSDKJS_OPTIONS.gdKey` của template GD; ô GD key ở form game trên API (khối GMSDK JS), nếu điền, được dùng thay |

`id`, `gameCode` và `portals.gd.gameKey` do chủ game cấp: **không đoán**. Chúng (cùng `name`, `languages`, `defaultLanguage`) được ghi trong `docs/GMSDK_JS/config.json`; `tools/bump-version.mjs` chép sang `game.json` mỗi lần build (§4). Không sửa tay ở `game.json`, không dùng `.env`.

**Một gói cho mọi portal.** Không build riêng `dist-gd`, `dist-poki`, `dist-crazygames`; không file `.env` theo portal. Khác biệt giữa 1games, GameDistribution, CrazyGames, Poki nằm trong template của tool build (`sdkType`, `gdKey`, mặc định quảng cáo); gmsdkjs tự dùng đúng SDK của portal. Code game không có `if (portal === …)`.

### Hỏi nhanh

- **"Build bình thường" và "build cho GD" khác gì?** Không còn khác. Chỉ có **một** gói xuất, dùng cho 1games, GameDistribution, CrazyGames và Poki. Tool build ghép gói đó với template của từng portal.
- **Chưa có key GD thì sao?** Gói vẫn hợp lệ và dùng được cho 1games, CrazyGames, Poki. `check-export` chỉ in ghi chú, vẫn báo `OK`. Khi có key: điền ô GD key ở form game trên API (không cần build lại game); hoặc ghi vào `gdKey` của `config.json` làm mặc định. Build cho portal nào, với thông số nào (Game code, GD key, AdSense pub id) là API quyết định ở trang Build SDK JS, không phải ở game. Key sai dạng (không phải 32 hex) thì `check-export` báo lỗi.
- **Publisher (1games, azgames, ofree) khai báo ở đâu?** **Không ở trong game.** Slug / `gid` giống nhau ở mọi publisher, nên `game.json` chỉ có một `id`. API, trang chủ, GMA, thương hiệu của từng publisher nằm trong `presets.json` của tool build (api.1games.io `lib/1games/gmsdkjs/templates/presets.json`); cùng một gói ra bản cho mọi publisher × portal.
- **`id` / `gameCode` có đổi khi chuyển sang gmsdkjs không?** **Không.** Giữ đúng slug game đang dùng trên portal và admin (`id` = `gid` gửi API licence, cũng là id GMA khi ghép `suffix`), để licence, cấu hình quảng cáo và số liệu GMA nối tiếp. `gameCode` giữ đúng mã đang đặt tên key lưu trữ: đổi mã là đổi key, người chơi mất tiến trình (trừ khi game tự chuyển dữ liệu từ key cũ một lần).

## 3. Quy tắc

- **Hai file JS**: `loader.js` (kit, trang nạp) và `game.js` (game, `loader.js` nạp song song với `gmsdkjs.js`). Tool build obfuscate cả hai.
- `game.js` là script thường (không phải module): xuất dạng IIFE hoặc script không có `import` / `export`. Nó có thể chạy **trước** khi `gmsdkjs.js` về, nên dòng đầu entry là `await loadSDK()` ([LOADING.md](LOADING.md)).
- **Không `await` ở cấp ngoài cùng của file** (top-level await), ví dụ `const sdk = await loadSDK()` nằm ngoài hàm. Gói IIFE không có được: Vite báo lỗi "Module format iife does not support top-level await", esbuild cũng vậy. Mọi `await` nằm trong hàm, thường là `async function boot()` ([LOADING.md](LOADING.md)). `check-export --src` cảnh báo dòng nghi là top-level await.
- Game vẽ vào phần tử `#game` của template (chiếm toàn trang).
- Không nạp script ngoài, không `import()` từ URL. `gmsdkjs.js` do `loader.js` lo; SDK quảng cáo và GMA do `gmsdkjs.js` lo.
- Mọi đường dẫn **tương đối** (`assets/…`, `i18n/…`): gói được đặt dưới một thư mục bất kỳ trên CDN.
- **Gói chỉ chứa thứ game dùng.** Bundler chép nguyên `public/`, nên thứ không dùng phải bỏ **ở `public/`** trước khi build: ảnh / nhạc / font / dữ liệu cũ hoặc thay thế, bản trùng, file thiết kế (`.psd`, `.ai`, `.xcf`, `.kra`, `.blend`, `.fla`), file tạm / sao lưu, file hệ thống (`Thumbs.db`, `.DS_Store`), ghi chú. Kit không đoán file nào thừa (tên ghép lúc chạy như `'level' + n + '.png'` chỉ game biết): game tự rà, bỏ, và ghi trong báo cáo đã bỏ gì (AI_INSTALL.md Bước 5). `check-export` cảnh báo các loại file chắc chắn không phải tài nguyên game.
- Không gọi `localStorage` / `sessionStorage` trực tiếp: lưu qua `sdk.storage` (bộ lưu của kit, `sdk/storage.js`).
- Không còn comment dev hay tiếng Việt trong `game.js` (minify bỏ comment; chữ hiển thị nằm trong `i18n/`).
- Chữ hiển thị nằm trong `i18n/`; trong code chỉ có key. Không có thư mục `Language/` (`check-export` báo lỗi).

## 4. Xuất bằng Vite

`template/vite.config.mjs` (chép về gốc repo game) đọc `public/game.json` và xuất thẳng ra `export/build/<version>-<id>/`:

```js
import { readFileSync } from 'node:fs';

const game = JSON.parse(readFileSync('public/game.json', 'utf8'));

export default {
  base: './',
  build: {
    outDir: `export/build/${game.version}-${game.id}`,
    emptyOutDir: true,
    target: 'es2017',
    modulePreload: false,
    copyPublicDir: true,
    rollupOptions: {
      input: 'src/main.js',
      output: { format: 'iife', entryFileNames: 'game.js', inlineDynamicImports: true, assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
};
```

- Mỗi lần build chạy `node docs/GMSDK_JS/tools/bump-version.mjs` **trước** `vite build`:
  - chép giá trị của game từ `docs/GMSDK_JS/config.json` (nguồn duy nhất) sang `public/game.json` (`id`, `gameCode`, `name`, `languages`, `defaultLanguage`, `portals.gd.gameKey`) và trang dev `index.html` (`gameId`, `gameCode`);
  - tăng version: cùng ngày thì `XX` tăng 1, sang ngày mới thì về `01`; ghi vào `public/game.json` và ô `version` của trang dev.
- **Script build chuẩn**, đúng thứ tự:

  ```json
  "build": "node docs/GMSDK_JS/tools/bump-version.mjs && vite build && node docs/GMSDK_JS/tools/compress.mjs && node docs/GMSDK_JS/tools/assemble.mjs && node docs/GMSDK_JS/tools/check-export.mjs export/build/<version>-<id> --src src && node docs/GMSDK_JS/tools/zip.mjs"
  ```

  `<version>-<id>` đổi mỗi lần build, nên bước `check-export` thường gọi qua một script nhỏ của game đọc `public/game.json` (Wheelie: `tools/check-package.mjs`). Game có bước riêng (kiểm chữ, typecheck) thì chen vào trước `vite build` hoặc ngay sau nó, trước `assemble`.
- **Nén (`tools/compress.mjs`)**, ngay sau bundler, trên gói xuất (ảnh / nhạc gốc trong `public/` để nguyên). Cần `npm i -D sharp ffmpeg-static`.
  - Ảnh: PNG → WebP (trừ `icons/`: màn loading gọi theo tên cố định, không đổi). Nhạc (`mp3`, `wav`, `ogg`, `m4a`, `flac`) → MP3; dài hơn 20 giây là nhạc nền, ngắn hơn là hiệu ứng. Không dùng Opus: Safari / iPhone cũ không phát được.
  - Chỉ thay khi file mới nhỏ hơn; MP3 đã ở mức đích thì để nguyên; file lỗi giữ nguyên (cảnh báo, không hỏng build).
  - Tên file đổi (`.png` → `.webp`, `.wav` / `.ogg` → `.mp3`) được sửa trong `game.js` và các file chữ của gói (JSON, CSS, atlas…). Hai file trùng tên ở hai thư mục mà một file giữ nguyên thì chỉ sửa theo đường dẫn đầy đủ. Đường dẫn ghép lúc chạy (`'img/' + name + '.png'`) không sửa được: dùng `keep` hoặc tự đổi trong code. `check-export` cảnh báo khi `game.js` gọi file `assets/…` không có trong gói.
  - In bảng: số file, dung lượng trước / sau, các file lớn nhất, cách nén thêm.

  | `config.json` `compress` | Ảnh | Nhạc nền / hiệu ứng |
  | --- | --- | --- |
  | `normal` (mặc định) | WebP chất lượng 90, giữ nguyên kênh trong suốt: thường nhỏ hơn PNG 50–70%, mắt thường khó thấy khác | MP3 128 / 96 kbps |
  | `more` | WebP chất lượng 80 | MP3 96 / 64 kbps |
  | `lossless` (chỉ ảnh) | WebP không mất chất lượng (pixel art, ảnh code đọc từng điểm) | – |
  | `off` | Giữ PNG | Giữ nguyên |
  | `keep: ["assets/maps/**"]` | Không đụng các file khớp (`*` trong thư mục, `**` qua thư mục) | |

  Nén thêm khi truyền (`.br` / `.gz`) là việc của server (§6); không xung đột, nhưng với ảnh / nhạc đã nén thì gần như không nhỏ thêm.
- `public/` chứa `game.json`, `i18n/`, `assets/`: Vite chép nguyên vào gói.
- `npx vite` (dev) dùng `index.html` ở gốc repo (trang dev, [TESTING.md](TESTING.md)); `npx vite build` không đụng tới nó.
- Game đã có cấu hình Vite riêng (plugin, alias…): giữ phần của game, chỉ đổi `base`, `build.outDir` và `build.rollupOptions` như trên.
- Bundler khác (esbuild, Rollup, webpack): miễn ra đúng bố cục §1, `game.js` một file IIFE.

## 5. Kiểm gói

```bash
node docs/GMSDK_JS/tools/check-export.mjs export/build/<version>-<id> --src src
```

Chạy ở gốc repo. Tool tự đọc `docs/GMSDK_JS/config.json` (giá trị của game) để so với `game.json`; `--config <file>` nếu muốn trỏ chỗ khác.

- **Lỗi** (exit 1): thiếu / sai `game.json`; `game.json` khác `config.json` (id, gameCode, name, ngôn ngữ, key GD); thiếu `en` hay file ngôn ngữ; ngôn ngữ khác có key mà `en.json` không có; có `index.html` / `preview.html` không phải trang gm do `assemble` ghép (trang riêng của game, hai file khác nhau, còn `<!--…-->`, `gameId` / `gameCode` / `version` khác `game.json`); đường dẫn tuyệt đối; `import()` từ URL; mã nguồn gọi `localStorage` trực tiếp.
- **Cảnh báo**: file lạ ở gốc, ngôn ngữ thiếu key (sẽ hiện tiếng Anh), BOM, source map, tạo thẻ `<script>`, `game.js` không nhắc tới SDK.
- Chạy trước mỗi lần giao gói. Gói lỗi thì không giao.

## 6. Sau khi giao gói

Giao `export/build/<version>-<id>/<version>-<id>.zip` (§8) cho người vận hành API. Trên admin API (api.1games.io `GMSDK_JS/docs/GUIDE.md`):
- **Build SDK JS:** chọn game và template (gm, gd, crazy, poki), thả zip. Tool kiểm gói (`check-export`), ghép template của portal (khối `GMSDKJS_OPTIONS` với `gameId`, `version` của `game.json`; `gameCode`, key GD lấy từ form game trên API, trống thì lấy `game.json`; `sdkUrl`; `#game`; `<script src="loader.js">`, từ kit 1.0.1), obfuscate `loader.js` + `game.js` và khoá domain, ra một zip của portal đó;
- **zip gm:** form game → khung SOURCE: thả zip, server nén `.br` / `.gz`, ra bản xem thử `game.1games.io/<id>/<version>/`; duyệt xong bấm "Dùng bản này" thì asset lên CDN `gdn.1games.io/game/<id>/<version>/` và người chơi mở `game.1games.io/<id>/`;
- **zip gd / crazy / poki:** tải về nộp lên portal.

Game không cần biết bước này.

## 7. Trang gm trong gói: `index.html` + `preview.html`

```bash
node docs/GMSDK_JS/tools/assemble.mjs
```

- Game build ra **một** bản: `export/build/<version>-<id>/` = gói + trang gm. `index.html` là template `gamesforfree-gm.html`, điền `name`, `id`, `gameCode`, `version` từ `game.json`; `preview.html` **giống hệt** `index.html` từng byte. Mở `preview.html?debug` để thử với API licence, GMA và quảng cáo thật.
- Trang của từng publisher × portal (GD, CrazyGames, Poki, azgames, ofree), obfuscate và khoá domain là việc của **tool build trên API**, từ chính gói này: nó thay `index.html` / `preview.html`. Game không build riêng cho portal nào.
- Chạy `check-export` **sau** bước ghép: nó nhận đúng trang gm này (template, hai file giống nhau, đúng giá trị của `game.json`) và vẫn báo lỗi mọi trang HTML khác.
- Template lấy từ CDN (`https://games.1games.io/lib/1games/gmsdkjs/templates/1.0.1/`), cùng bản với api.1games.io `lib/1games/gmsdkjs/templates/1.0.1/`. Kit chỉ dùng thư mục `1.0.1/` này. Không có mạng thì dùng `--templates <thư mục>`.
- **Template** chỉ nạp `<script src="loader.js">` và ghi `sdkUrl` (chỗ của `gmsdkjs.js`) trong `GMSDKJS_OPTIONS`; không có thẻ `gmsdkjs.js` hay `game.js`. `assemble` và `check-export` báo lỗi khi template nạp thẳng hai file đó.
- **Chỉ khi phải tự nộp tay lên một portal** mà tool build chưa làm được: `--portal gd` (hoặc `crazy`, `poki`) chép gói ra `export/build/<version>-<id>-<portal>/` với trang của portal đó (SDK quảng cáo của portal, key GD, tắt More Games / trademark). Không chạy `check-export` trên bản chép này.

## 8. Zip: một file để upload

```bash
node docs/GMSDK_JS/tools/zip.mjs
```

- Bước **cuối** của build, sau `check-export`: đóng `export/build/<version>-<id>/` thành **`export/build/<version>-<id>/<version>-<id>.zip`**, nằm ngay trong thư mục gói, cạnh `index.html`.
- Trong zip là mọi file của thư mục, `index.html` ở **gốc** zip (không có thư mục bọc ngoài). File `.zip` ở gốc thư mục (chính nó, bản cũ) không được đóng vào.
- `check-export` chấp nhận đúng file `<version>-<id>.zip` này ở gốc gói; `assemble --portal` không chép nó sang thư mục `-<portal>`.
- Đây là file giao đi: upload lên trang Build SDK JS trên API (ghép trang theo publisher × portal, obfuscate, khoá domain; §6), hoặc gửi cho người test.
- **Tất định:** file xếp theo tên, ngày giờ mọi file là ngày của version. Cùng một thư mục thì ra cùng một zip từng byte.
- Ảnh, âm thanh, video, font, file đã nén: để nguyên (store). Còn lại nén deflate mức 9.
- Viết xong, tool đọc lại zip và so từng file với thư mục; lệch là báo lỗi, exit 1.
- Thiếu `index.html` (chưa chạy `assemble`) thì không đóng zip.
- Không chạy được trên thư mục `-<portal>` của §7: zip chỉ dành cho gói gm.

## 9. Sau khi build: commit và đẩy git (hỏi trước)

Không tự làm. Build xong (`npm run build` báo `OK`, có file zip), AI **hỏi** chủ game một câu: "Đã build xong `<version>`. Commit và đẩy lên git không?". Không đồng ý thì dừng ở đây. Đồng ý thì làm đúng thứ tự (như kit 2.x):

1. **Commit chỉ thứ thuộc bản build**, ghi chú `Build <version>`, thân là bản này có gì (mỗi ý một dòng, lời thường):
   - vào: mã nguồn, tài nguyên mà build dùng, `public/game.json`, `docs/GMSDK_JS/config.json`, tài liệu của bản (`docs/qa/<version>.md`…);
   - không vào: file editor tự lưu lại, thư mục nháp, file trùng, `export/` (đã trong `.gitignore`). Để nguyên trong working tree và nói một dòng đã bỏ gì, vì sao.
   - Không có gì thay đổi thì commit trống (`git commit --allow-empty -m "Build <version>"`) để đánh dấu bản build.
2. **`git fetch`, kiểm ahead / behind** của nhánh: máy chủ có commit mới mà máy chưa có thì **dừng, không đẩy mù**; báo chủ game kéo về (pull) trước.
3. **`git push`** (nhánh chưa theo dõi máy chủ thì `git push -u origin <nhánh>`).
4. **In khối thông tin git** để chủ game chép đi:

   ```
   <Tên game> — Build <version>
   Git: <url repo, không có token>
   Nhánh: <nhánh>
   Commit: Build <version> (<mã commit ngắn>)
   ```

Dự án chưa gắn máy chủ git (`git remote` trống): chỉ commit, ghi `Git: (chưa gắn máy chủ)`, không đẩy.

