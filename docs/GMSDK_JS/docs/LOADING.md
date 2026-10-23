# Màn loading và dòng bản quyền

## 1. Luồng tải: `loader.js` đi đầu

Trang của mọi portal **chỉ nạp một script: `loader.js`** (của kit, nằm ở gốc gói cạnh `game.js`). Nó hiện màn loading ngay, rồi mới tải SDK và game:

```
Trang mở (template của portal: GMSDKJS_OPTIONS + <script src="loader.js">)
└─ loader.js
   ├─ hiện màn loading ngay: icons/loading.webp, logo, tên game, thanh %
   ├─ tải SONG SONG gmsdkjs.js (GMSDKJS_OPTIONS.sdkUrl) và game.js
   │    mỗi file tối đa 3 lần, mỗi lần chờ 10 giây, nghỉ 1 rồi 2 giây; hai file này chạy thanh 0 → 30 %
   ├─ gmsdkjs.js BẮT BUỘC: 3 lần vẫn lỗi → "Connection problem. Please check your network and reload the page."
   │    + nút Reload; game không chạy. (Chỉ trang dev, platform 'dev', được chạy tiếp không SDK.)
   └─ đủ hai file → game.js chạy tiếp:
        sdk = await loadSDK({ gameCode })            chờ gmsdkjs (trong boot(): không await cấp cao nhất)
        tải tài nguyên → loader.progress(p)          thanh 30 → 100 %
        menu hiện → loader.hide()                    ẩn màn, gọi sdk.loadingDone() (loaded_game, portal)
```

Giao diện là GM Loader v1 của azgames (bộ của kit 2.x), giữ nguyên: nền key art làm mờ, ảnh nhỏ + tên game + vòng xoay → thanh % tô theo 3 màu nổi của key art → "Almost there..." từ 99 %, phiên bản ở góc trái, logo publisher ở góc phải.

| Từ kit | Vào game |
| --- | --- |
| `loading/loader.js` | `public/loader.js` (trong gói: `loader.js` ở gốc). **Chép nguyên, không sửa**: `check-export` so với bản của kit |
| `loading/loading.js` (+ `loading.d.ts` nếu dùng TypeScript) | `src/sdk/loading/`: phần `game.js` dùng để điều khiển màn |
| `loading/icons/loading.webp`, `logo.webp`, `loader.css` | `public/icons/` (trong gói: `icons/` ở gốc). `loader.css` là giao diện của màn (§1.1) |

- **Ảnh của màn loading nằm riêng trong `icons/`, tên file cố định**, để sau này dễ tìm, dễ thay: thay ảnh là chép đè `public/icons/loading.webp` rồi build lại (hoặc chép đè `icons/loading.webp` trong gói đã build rồi đóng lại zip, [EXPORT.md §8](EXPORT.md)). Không để ảnh loading ở chỗ khác, không đổi tên.
- **`loading.webp` là key art của game** (16:9 hoặc vuông, cạnh dài ≥ 1024): thay ảnh mẫu của kit. `check-export` cảnh báo khi còn ảnh mẫu, báo lỗi khi thiếu file.
- **`logo.webp`** là logo AZGAMES của kit 2.x, dùng chung mọi game: không sửa. Khi build, SDK Game Builder thay nó bằng logo brand của publisher (`templates/brand/<publisher>.webp`: 1games là gamesforfree.io, azgames là azgames.io). Trên trang GameDistribution / CrazyGames / Poki (`sdkType` `gd` / `crazy` / `poki`, hoặc `trademark: false`) màn tự bỏ logo (không thương hiệu publisher ở đó, [QA.md](QA.md) 7.4).
- Chữ trên màn (`Loading...`, `Connecting again (2/3)...`, `Almost there...`, thông báo lỗi, `Reload`) **tiếng Anh cứng**: hiện trước khi `i18n/` tải xong.
- Font Nunito nạp từ Google Fonts chỉ cho màn này; chưa tải kịp thì dùng font hệ thống.
- **Trang dev** (`template/index.html`): `<script src="loader.js" data-entry="src/main.js" data-module>`: loader tải entry của Vite thay cho `game.js`. `data-icons` đổi thư mục ảnh (mặc định `icons/`).

```js
import { loadSDK } from './sdk/gmsdkjs-shim.js';
import { createLoader } from './sdk/loading/loading.js';

const loader = createLoader();                   // màn của loader.js, phần tải của game
let sdk;

async function boot() {
  sdk = await loadSDK({ gameCode });             // việc đầu tiên: chờ loader.js có gmsdkjs
  const manifest = await loadJSON('game.json');
  loader.setTitle(manifest.name);
  await loadAssets((p) => loader.progress(p));   // 0..1 → thanh 30 → 100 %, chuyển cho sdk.loadingProgress
  await sdk.ready();
  showMenu();
  loader.hide();                                 // menu đã hiện: ẩn màn + sdk.loadingDone() (không gọi lại)
}
boot().catch(() => loader.error());              // tài nguyên lúc mở lỗi: cùng màn Reload
```

| Hàm | Làm gì |
| --- | --- |
| `loadSDK({ gameCode })` | Chờ `loader.js` có gmsdkjs, trả SDK. Gọi một lần, việc đầu tiên của hàm khởi động. **Không `await` ở cấp cao nhất của module**: gói xuất là IIFE, Vite báo lỗi "iife does not support top-level await" |
| `createLoader()` | Lấy màn của `loader.js` (`window.GMLoader`). Không có `loader.js` trên trang thì mọi hàm không làm gì |
| `loader.progress(f)` | Phần tải của game (0..1): thanh từ 30 % tới 100 %, "Almost there..." từ 99 %. Tự chuyển cho `sdk.loadingProgress` |
| `loader.setTitle(name)` | Tên game (sau khi đọc `game.json`) |
| `loader.error(text?)` | Tải lỗi: thông báo + nút Reload |
| `loader.hide()` | Màn đầu của game đã sẵn: ẩn màn loading, gọi `sdk.loadingDone()` |

Tiến độ của game đếm theo **file đã tải xong**, không theo byte: thanh đi theo bước, CSS làm mượt. Tài nguyên nặng (atlas, nhạc) nên chiếm phần lớn thanh; chia tỉ lệ theo game.

### 1.1 Giao diện: mẫu của kit hoặc của game

**Luôn hỏi chủ game một lần** (AI_INSTALL.md Bước 0), kể cả khi game chưa có màn loading riêng, rồi ghi vào `config.json` → `loadingScreen`:

> "Màn loading: dùng mẫu mặc định của kit, hay dùng giao diện màn loading của game?"

| `loadingScreen` | Giao diện | `public/icons/loader.css` |
| --- | --- | --- |
| `"kit"` | GM Loader v1 của kit (ở trên), key art của game ở `loading.webp` | Bản của kit, **để nguyên** (không có luật CSS) |
| `"game"` | Giao diện của game: ảnh, logo game, thanh tải, vị trí, màu, font | CSS của game, viết đè lên khung của kit |

Hai lựa chọn chỉ khác **cách hiển thị**. **Luồng luôn là của kit**: `loader.js` chép nguyên, vẫn là script duy nhất trang nạp, vẫn tải gmsdkjs + `game.js` 3 lần, cùng thanh % (0 → 30 → 100 %), cùng chữ, cùng màn Reload, cùng `loadSDK()` / `createLoader()`. Game **không** tự vẽ màn loading trong `game.js`, không thêm script.

- `loader.js` nạp `icons/loader.css` ngay sau CSS của kit (luật của game thắng), và giữ màn ẩn tới khi file này tải xong (tối đa 0,5 giây), nên giao diện kit không chớp lên trước. Không có file thì dùng giao diện kit.
- Viết theo khung có sẵn: tên class và biến màu ở chú thích đầu `loading/icons/loader.css`. Đổi được: ảnh nền, ảnh giữa, ẩn hoặc đổi chỗ ảnh nhỏ và tên game, kiểu thanh tải và màu, vị trí từng phần, font. Muốn giữ màu riêng cho thanh thì đặt `--gm-tint: off` (không lấy màu theo key art).
- Ảnh và font của skin để trong `public/icons/` cạnh `loader.css`, gọi bằng đường dẫn tương đối (`url(splash.webp)` là `icons/splash.webp`). Không tải gì từ ngoài gói, không `@import`. Giữ file nhỏ (dưới 30 KB) vì màn chờ nó.
- **Không được giấu** thanh %, dòng chữ dưới thanh, nút Reload, logo publisher (`.gmLoaderBrand`, build tool thay bằng logo của publisher): chỉ đổi chỗ, đổi kiểu.
- Game có sẵn màn loading riêng: chọn `"game"` thì dựng lại giao diện đó bằng `loader.css` + ảnh trong `icons/`, rồi **bỏ** màn loading trong code game; chọn `"kit"` thì bỏ màn cũ, dùng mẫu kit.
- `check-export` kiểm: có `icons/loader.css`; không tải từ ngoài, không `@import`, ảnh gọi tới có trong `icons/`; không giấu các phần trên. `"game"` mà file không có luật CSS là lỗi; `"kit"` mà file có luật thì cảnh báo; chưa có `loadingScreen` thì cảnh báo (chưa hỏi).

## 2. Dòng bản quyền

Mặc định luôn là **`© 2026 Azgames.io`**; chỉ đổi khi server gửi khác. Lấy bằng [`sdk/copyright.js`](../sdk/copyright.js):

```js
import { copyrightText } from './sdk/copyright.js';
copyrightLabel.textContent = copyrightText(sdk);   // sau sdk.ready(); '' = không hiện gì
```

| Server (`gameinfo.trademark`, qua `sdk.brand.trademark()`) | Hiện |
| --- | --- |
| Không có SDK / API không trả lời / chủ bản quyền mặc định | `© 2026 Azgames.io` |
| Tên miền hoặc tên khác | `© 2026 <tên đó>` |
| `0` (tắt), và mọi trang GameDistribution / CrazyGames / Poki | Không hiện |

- Năm cố định `2026` (`COPYRIGHT_YEAR` trong `copyright.js`), đổi ở đó khi cần.
- Game **không tự viết** `©`, `Azgames.io`, `AZ Games`… ở chỗ khác: `check-export` cảnh báo (trừ chuỗi của `copyright.js`).
- Chỗ đặt: góc menu hoặc chân bảng Settings, cạnh `V<version>` ([INTEGRATION.md §9](INTEGRATION.md)).
