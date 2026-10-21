# JS_SDK_2.0 — nén tài nguyên, màn loading và quy trình build/publish

Rút ra từ **Stickman Coin Flip** (port JS của *Gambler's Table*), bản build `26091102`: **4.74 MB**
tổng, từ **13.0 MB ảnh PNG + audio gốc**.

File này viết để **mang sang dự án khác**. Mọi con số đều là số đo thật, và chỗ nào là *quyết định*
thì có ghi lý do — vì khi sang game khác, lý do mới là thứ chuyển được, con số thì phải đo lại.

**Điều kiện áp dụng**: game HTML5 dựng bằng ES modules, phát hành qua portal **azgames.io / GMSDK**,
tài nguyên nạp bằng đường dẫn tương đối dựng lúc chạy.

---

## 0. Toàn cảnh — một lệnh, sáu chặng

```
node tools/build.mjs            # version tự tính: YYMMDD + số thứ tự trong ngày
node tools/build.mjs 26090799   # ép version
```

| # | Chặng | Kết quả |
|---|---|---|
| 1 | esbuild gộp ES modules → `game.js` | 40 module → 1 file, ~210 KB |
| 2 | Chép `index.html`, trỏ lại thẻ script + đóng dấu version | trang đã test **chính là** trang ship |
| 3 | Chép nguyên `assets/` | art, audio, data, font, atlas |
| 4 | **Nén audio** sang Opus | ~3.5 MB → ~300 KB |
| 5 | **Nén ảnh** sang WebP theo ba luật | 13.0 MB → 3.27 MB |
| 6 | Bọc vỏ portal GMSDK | 3 file cạnh thư mục version |

Nguyên tắc xuyên suốt: **nén trong BẢN SAO, nguồn giữ nguyên.** `assets/` gốc vẫn là PNG/MP3 để
pipeline Unity, các extractor và test đọc. Không có bước nào sửa file nguồn.

---

## 1. Nén ảnh — ba luật, và luật nào áp cho ảnh nào là câu hỏi khó nhất

`tools/webp-art.py`. **Câu hỏi quyết định không phải "ảnh trông thế nào" mà là "có cái gì ĐỌC nó
không".** Đây là điều dễ sai nhất và sai thì im lặng.

### Luật A — lossless (mặc định)

Ảnh bị **cắt thành ô** (sprite sheet) hoặc bị **lấy mẫu từng pixel** (mask, noise). Nén mất mát làm
màu tràn qua mép ô — một đồng xu nhặt phải viền của khung bên cạnh. Tệ hơn: `helper_hats_mask` được
so với ngưỡng `0.9 * 255`, kênh green lệch vài đơn vị là **mạ vàng sai pixel, không báo gì**.

### Luật B — lossy q90 (`LOSSY_DIRS` + `LOSSY_FILES`)

Ảnh **không ai đọc**: nền toàn khung, tranh minh hoạ, logo. Không cắt ô, không lấy mẫu.

```python
LOSSY_DIRS  = {'tables'}                                  # 7 mặt bàn
LOSSY_FILES = {'loading.png', 'azgames_logo.png'}     # màn loading
LOSSY_QUALITY = 90
```

Số đo trên **vùng nhìn thấy được** (alpha > 0), q90:

| | lossless | q90 | sai số TB | % kênh lệch >16 | alpha |
|---|---|---|---|---|---|
| 7 mặt bàn | 3 585K | 523K | 1–3 /255 | < 0.15% | chính xác |
| `loading.png` | 296K | 52K | 1.75 /255 | 0.58% | chính xác |
| `domain.png` | 76K | 52K | 1.06 /255 | 0.74% | chính xác |

> **Bài học đắt nhất của mục này**: hai ảnh màn loading **mặc định rơi vào luật A** vì bộ phân loại
> chạy theo *thư mục*, mà chúng nằm ở gốc `Art/`. Chúng làm build phình **+400 KB trong một bản** và
> không ai quyết định điều đó cả — nó là giá trị mặc định, và mặc định chưa từng bị đặt câu hỏi cho
> một bức tranh vẽ tay. **Sang dự án mới: rà file ở thư mục gốc trước tiên.**

### Luật C — cắt bit rồi lossless (`NEAR_LOSSLESS_BITS`)

Cho ảnh **không thuộc A cũng chẳng thuộc B**: bị cắt ô hoặc bị đọc, *nhưng* rất nặng vì là tranh vẽ
tay chứ không phải pixel art.

```python
NEAR_LOSSLESS_BITS = {'sacrifice': 5, 'achievements': 5, 'skill_tree': 5, 'thief': 5, 'coins': 5}
NEAR_LOSSLESS_SKIP = {'helper_hats_mask.png', 'helper_hats_mask_X2.png'}
```

Bỏ bit thấp của mỗi kênh R/G/B trước khi encode **lossless**. Khác lossy ở chỗ: nó dịch **mọi** pixel
đi một lượng **nhỏ và có chặn**, thay vì viết lại cả block — nên **không tràn qua mép ô** và **không
vượt ngưỡng nào**.

Cổng hiến tế: 1 737K → **769K (−56%)**, sai số TB 3.1, và **không một pixel nào lệch quá 16**.
4 bit tiết kiệm thêm 218K nhưng **bị loại bằng mắt** — quầng tím ngoài bắt đầu bị banding.

**Alpha tuyệt đối không đụng tới**, ở cả ba luật. Cổng composite lên mặt bàn nên mép lệch sẽ thành
viền sáng; và toàn bộ lý do chọn C thay vì B là để thay đổi có **chặn trên** và đoán trước được.

### Hai cửa chặn bắt buộc

```python
if name in LOSSY_FILES and NEAR_LOSSLESS_BITS.get(folder):
    raise SystemExit(f'{name} lossy nhưng nằm trong {folder} — thư mục có art bị lấy mẫu')

missing = sorted(LOSSY_FILES - seen_lossy_files)
if missing:
    raise SystemExit(f'đặt tên lossy nhưng không tìm thấy: {missing}')
```

Cái thứ hai quan trọng hơn vẻ ngoài của nó: **gõ sai một chữ trong tên file thì file vẫn ship, chỉ
là sai thiết lập**, và bằng chứng duy nhất là build nặng lên vài trăm KB. Đó đúng là cách hai ảnh
loading bị phát hiện.

### Viết lại đường dẫn — phải là một giao dịch

PNG đổi sang WebP thì **mọi tham chiếu `.png` trong file text đã ship** phải đổi theo: `game.js`,
`index.html`, `atlas.json`, và mọi `assets/data/*.json`.

```js
if (converted) { /* chỉ đổi đường dẫn KHI VÀ CHỈ KHI đã convert */ }
```

Chuyển đổi mà không đổi đường dẫn (hoặc ngược lại) = **game trắng trơn, console sạch sẽ**. Nếu thiếu
python/Pillow thì build ship PNG nguyên và **nói ra**, chứ không im lặng đi tiếp.

### Ảnh hi-res X2 — nén không cứu được zoom

Nếu game có bản vẽ lại X2 (`coins_X2.png`), nhớ: **trần độ phân giải là thứ giới hạn camera**.

`all_coins_spritesheet_X2` ra 4096×683 so với 2304×384 → **1.78×**, không phải 2 — **trần texture
4096 chặn, không phải ai chọn**. Nên đoạn intro zoom 8× đang **phóng to 4.5 lần** ảnh gốc và bị mờ.
Đo tỉ lệ **theo từng trục**, đừng giả định là 2.

---

## 2. Nén audio — Opus, và đừng đoán file nào là nhạc

```js
opus(from, to, kbps)   // ffmpeg -c:a libopus -b:a {kbps}k -ac 1
```

| loại | bitrate | kênh |
|---|---|---|
| nhạc nền (`bgm_*`) | **32k** | mono |
| hiệu ứng | **48k** | mono |

Ở bitrate thấp Opus thắng cả Vorbis lẫn MP3 — đó là thứ mua được mục tiêu 5 MB. Kết quả thực tế:
1 track + 28 hiệu ứng, **~3.5 MB → ~300 KB**.

**Lỗi đã mắc và phải tránh**: luật cũ là *"file .ogg từ 300 KB trở lên là nhạc"*. Đúng chừng nào mọi
track còn đến từ Vorbis. Nhạc nền do người dùng tự thêm vào ở dạng **MP3** và luật lặng lẽ xếp nó
vào nhóm hiệu ứng — encode 48k như một one-shot, trong khi nhạc nền chạy dưới tiếng xu là thứ *duy
nhất* nên ở 32k. Không lỗi, không cảnh báo, build chỉ nặng hơn cần thiết một phần ba.

Hỏi **bản đồ audio** chứ đừng hỏi file:

```js
const music = new Set(
  JSON.parse(readFileSync('assets/data/audio.json'))
    .filter((e) => e.key.startsWith('bgm_'))
    .flatMap((e) => e.files),
);
if (tracks === 0) console.warn('audio: không track nào khớp — thiếu key bgm_?');
```

`bgm_*` là thứ **code thật sự hỏi** khi gọi `playMusic`. Câu hỏi trung thực cho câu trả lời đúng, và
track có thể ở định dạng nào, nặng bao nhiêu cũng được.

Hai chi tiết kỹ thuật:
- Opus luôn nằm trong container `.ogg`, nên nguồn **đã là** `.ogg` phải đi qua file tạm — ffmpeg
  không đọc và ghi cùng một đường dẫn.
- Đổi `.mp3` → `.ogg` thì **phải rewrite `audio.json`** trong cùng một nhịp. File đổi tên dưới key
  chưa đổi = game câm.

**Safari không giải mã được cả Vorbis lẫn Opus.** Đây là quyết định có ý thức: đích ngắm là máy
Chrome/Edge ở trường học. Sang dự án có iOS thì phải giữ một bản AAC dự phòng.

### Font

Chỉ ship đúng face mà trang khai báo. Các biến thể còn lại là **đầu vào cho công cụ**, không phải
thứ tải về:

```js
for (const face of ['jersey_10_regular.ttf', 'jersey_10_smooth.ttf']) {
  rmSync(join(dist, 'assets', 'font', face), { force: true });
}
```

---

## 3. Màn loading

**GM Loader v1** (9.1.5.1) — mẫu của portal `api.azgame.io/static/lib/azgames/theme/sdk10/azgames_v1/game.css`,
bản sao trong `reference/azgames_v1/` (`preview.html` bấm thử từng trạng thái). Dán theo `template/loading.html`.

### Bố cục — một khối căn giữa trên nền ảnh mờ

```
#gmLoader (fixed inset 0, nền #0c0d14)
  ├ .gmLoaderBackdrop   key art phủ kín, blur 14px + tối .42, radial tối ở mép
  ├ .gmLoaderStage      cột căn giữa
  │    ├ ảnh nhỏ        cao clamp(80px, 20vh, 200px), max min(80vw, 400px), radius, đổ bóng
  │    ├ tên game       clamp(18px, 4.6vh, 34px), 800, một dòng (ellipsis)
  │    └ .gmLoaderProgress  rộng min(80vw, 1010px)
  │         ├ vòng xoay (trạng thái đầu)
  │         ├ thanh bar  cao clamp(10px, 2vh, 14px), gradient 3 màu lấy từ ảnh (--gm-c1..3)
  │         └ dòng chữ   "<b>45%</b>" / "Almost there..."
  ├ logo AZGAMES        góc dưới phải, cao clamp(30px, 7.5vh, 56px)
  └ version             góc dưới trái, 11px, opacity .4
```

| Trạng thái (class trên `#gmLoader`) | Hiện gì |
|---|---|
| (không có) | vòng xoay — chưa đếm được file nào |
| `.gmIsLoading` | vòng xoay ẩn, thanh bar + "N%" hiện |
| `.gmAlmost` (≥ 99%) | thanh đầy có vệt sáng chạy, "Almost there..." nhấp nháy, tới khi màn đầu sẵn sàng |

Màn thấp (`max-height: 420px`) thu nhỏ ảnh / thanh / logo; `prefers-reduced-motion` tắt hiệu ứng.

### Tiến trình — đếm file xong, không đếm byte

```js
const SHEETS_SHARE = 0.85;
const loadingLabel = (p) => (p >= 99 ? 'Almost there...' : `${p}%`);
```

Không đo được byte qua một trăm `await` nhỏ; thứ **trung thực** là số file đã xong. Sheet ảnh chiếm
85% thanh bar vì nó chiếm 85% số byte — 12 MB ảnh so với 400 KB mọi thứ khác. Thanh nhảy từng file
nên **fill phải có `transition` trong CSS**, không thì đọc ra như giật chứ không phải như đang tải.

### Bốn thứ dễ sai

1. **Dòng chữ buộc phải là tiếng Anh cứng.** Nó ở trên màn hình **trước khi** tải xong bảng dịch —
   không có gì để dịch nó cả. Từ được dịch đầu tiên của game không thể xuất hiện trước khi thứ mà
   màn này đang che đã tải xong.
2. **Font pixel dùng `font-display: block` thì không hiện gì cho tới khi tải xong font.** Sai hoàn
   toàn cho màn hình có nhiệm vụ *lên trước mọi thứ khác*. Dùng stack sẵn có của trang + `bold`.
3. **Số version đọc từ đúng một nguồn.** Build đóng dấu vào `GM_GAME.version`; góc màn hình đọc lại
   chính field đó, **không đóng dấu lần hai** — số trên màn hình và số trên dashboard không thể cãi nhau.
4. **Ẩn hẳn, đừng xoá rỗng** khi xong: nó có con, và hai trong số đó là ảnh.
5. **Dòng chữ vô hình cho tới `.gmIsLoading`.** Ghi lỗi vào `#load-text` (loader.js "Connection problem",
   dòng "trình duyệt quá cũ") thì phải bật class đó, không thì không ai thấy.

### Đo chữ, đừng đoán

Tôi từng thêm `max-width: 40ch` vì *cảm giác* câu 50 ký tự sẽ tràn. Font Jersey rất hẹp — **40ch chỉ
khoảng 420px**, hẹp hơn chính những câu nó định bảo vệ, và nó tạo ra cái xuống dòng chứ không phải
`nowrap`. Đọc advance width thẳng từ TTF:

```
This old table has one rule.                       278px
Every coin is worth something. Even the smallest.  516px   ← dài nhất
Jedes Vermoegen beginnt mit einer Muenze.          437px   ← câu dịch dài nhất
                                          khung:  1152px
```

---

## 4. Cấu trúc thư mục build + đặt tên

### Version = tên bản build

```
YYMMDD + số thứ tự trong ngày      →  26091102 = bản thứ 2 của 2026-09-11
```

Tự tính bằng cách đọc `Build/` xem hôm nay đã có gì. **Phải nhận được cả hai dạng tên thư mục**:

```js
const seen = /^(\d{8})$/.exec(entry) ?? /-v(\d{8})_/.exec(entry);
```

Vỏ portal ra đời sau những bản build nó chứa, nên có bản tên trần `26090701` và bản
`…-v26090701_azgames.io`. Chỉ đọc một dạng thì bộ đếm **quay về 01 và ghi đè lặng lẽ** một bản build
làm cách đó một tiếng.

### Bố cục

```
Build/26091102/                 ← VỎ: thứ upload lên portal
├── index.html                  ← trang portal phục vụ (3 file giống hệt nhau từng byte)
├── preview.html
├── version.txt                 ← đúng 8 byte, KHÔNG newline cuối
└── 26091102/                   ← build thật, addressed qua <base>
    ├── index.html              ← mở file NÀY để test local
    ├── game.js
    └── assets/
```

Version xuất hiện **hai lần**: một lần là thư mục upload, một lần là thư mục trang addressed bên
trong — và `<base>` nói về cái thứ hai.

### `<base>` thay vì rewrite đường dẫn — điểm khác biệt sống còn

```js
const head = [
  '<meta charset="utf-8" />',
  `    <base href="${version}/" />`,
  '    <meta name="robots" content="noindex, nofollow" />',
  `    <link rel="canonical" href="https://azgames.io/${GAME_ID}" />`,
].join('\n');
```

Mẫu của SDK là build Unity với **bốn tên file viết thẳng trong một khối config** — rewrite text là
đủ. Game JS này dựng đường dẫn **lúc chạy** bằng `webPathFor`. Rewrite text sẽ bắt được thẻ script
và **trượt mọi sprite sheet, trượt một cách im lặng** — game load được và không vẽ gì.

Một dòng `<base>` phủ cả hai, kể cả đường dẫn chưa tồn tại cho tới lúc bị hỏi tới.

`<base>` **phải đứng trước URL tương đối đầu tiên**, nên đặt ngay sau `charset` — mà `charset` thì
bắt buộc đứng đầu.

### Khối GMSDK trong vỏ

```html
<script src="https://gm.azgame.io/sdk/v3/gm-sdk.js"></script>
<script src="https://gm.azgame.io/sdk/v3/gm-iframe.js"></script>
<script>
  window['GMSOFT_SDKTYPE'] = 'gm';
  window['GMSOFT_SIGNED'] = '<chuỗi base64 của publisher>';
  var config = { gameId: 'stickman-coin-flip' };
  /* host check đã obfuscate, chép nguyên từ mẫu */
</script>
<script id="gmsoft-jssdk" src="https://api.azgame.io/static/lib/azgames/gmsdkv2.js"></script>
```

- `GMSOFT_SIGNED` (mẫu azgames_v1; trước đây `localStorage.gmsdksigndomain`, gmsdkv2.js không còn đọc) là **chữ ký trên domain của PUBLISHER**, không phải của từng game — nên nó
  chuyển được sang game khác. Nhưng nó **opaque**: portal mà từ chối build thì đây là dòng thay đầu tiên.
- `gmsdkv2.js` điền `GMSOFT_GAME_INFO`, thứ mà nút *More Games* đọc lúc bấm. **Thiếu nó thì nút luôn
  rơi về trang chủ azgames.io** thay vì catalogue của publisher — đúng cái bug đã âm thầm tồn tại.
- **HAI ID, ĐỪNG GỘP.** `var config = { gameId }` mà gmsdkv2.js đọc phải là **`portalGid`** (slug portal,
  KHÔNG có đuôi `-az`), KHÔNG phải `gameId` của SDK (`...-az`). Gửi nhầm `...-az` làm gid thì portal trả
  rỗng và More Games **luôn rơi về trang chủ, im lặng** — đã dính ở một dự án. `gameId` (có `-az`) chỉ dùng
  cho SDK v3 / analytics / leaderboard; `portalGid` (không `-az`) dùng cho gmsdkv2.js và canonical/redirect.
  Build lấy `config.portalGid`, null thì tự bỏ đuôi `-az` của `gameId`. Kiểm bản build: `grep 'gameId:'
  Build/<v>/index.html` phải ra slug KHÔNG có `-az`.
- Host check khiến **vỏ không mở được từ ổ đĩa** (không iframe, không referrer → redirect đi).
  Mở `26091102/index.html` để test local.

Cuối `</body>` cần các global shell: `gmEvent`, `gmStartGame`, `gmStartAds`, `isFirebaseReady`,
`firebaseLogEvent`, `firebaseLogEventParameter`.

### Ba cửa chặn khi bọc vỏ

```js
if (!page.includes(marker))        throw new Error('thẻ script module đã đổi chỗ');
if (!versionMarker.test(page))     throw new Error('field version trong GM_GAME đã đổi chỗ');
if (wrapped === portalPage)        throw new Error('vỏ portal không khớp gì cả');
```

Cả ba đều chống cùng một kiểu hỏng: **build thành công, ship ra thứ sai**.

### Xoá cả vỏ, không chỉ thư mục version

```js
rmSync(portal, { recursive: true, force: true });
```

Build lại cùng version mà không xoá vỏ thì ba file của lần trước nằm cạnh game vừa build xong.

### Biên nhận + mở thư mục

In kích thước **theo từng phần cấp một**, để một thứ nặng bất thường bị nhìn thấy ngay lúc build.
Xong thì mở Explorer vào **vỏ** — đó mới là thứ đem upload.

---

## 5. Publish

```
1. node tools/build.mjs
2. git commit -m "Build <version>"        # kèm body: bản này có gì
3. git fetch && kiểm tra ahead/behind     # ĐỪNG push mù
4. git push
5. In khối bàn giao
```

```
<Tên game> — Build <version>
Git: <url repo>
Nhánh: <branch>
Commit: Build <version>
```

**Chỉ commit thứ thuộc về build.** Mã nguồn và tài nguyên mà build tiêu thụ thì vào; editor churn
(scene bị Unity lưu lại, spritesheet re-save), thư mục nháp, file trùng thì **không** — gắn nhãn
`Build N` cho chúng là gắn nhãn sai. Để nguyên trong working tree và nói một dòng đã bỏ gì, vì sao.

Thư mục `Build/` nằm trong `.gitignore`.

---

## 6. Checklist mang sang dự án mới

- [ ] Liệt kê mọi ảnh, trả lời **"có cái gì ĐỌC nó không"** → chọn luật A / B / C
- [ ] **Rà thư mục gốc trước** — phân loại theo folder luôn bỏ sót file nằm ở gốc
- [ ] Đo sai số trên **vùng alpha > 0**, không phải cả ảnh
- [ ] Cửa chặn: tên trong `LOSSY_FILES` không khớp file nào → **dừng build**
- [ ] Rewrite `.png` → `.webp` **chỉ khi** đã convert, và phủ **hết** file text đã ship
- [ ] Nhạc nền nhận diện bằng **key trong data**, không bằng kích thước/định dạng file
- [ ] Đổi tên file audio thì rewrite manifest **trong cùng nhịp**
- [ ] Kiểm codec so với trình duyệt đích (Opus ⇒ không có Safari)
- [ ] Màn loading: chữ tiếng Anh cứng, font có sẵn của trang, version đọc từ **một** nguồn
- [ ] Đo chiều rộng chữ từ **TTF**, đừng đoán
- [ ] Bộ đếm version nhận **mọi** dạng tên thư mục đã từng dùng
- [ ] `<base>` chứ không rewrite, nếu đường dẫn dựng lúc chạy
- [ ] Ba cửa chặn khi bọc vỏ, để build sai thì **gãy** chứ không **ship**
- [ ] **`portalGid` (không `-az`) cho `var config` của gmsdkv2.js**, khác `gameId` của SDK — sai thì More Games im lặng rơi về trang chủ

---

## Phụ lục — file liên quan

| File | Việc |
|---|---|
| `tools/build.mjs` | toàn bộ 6 chặng, vỏ portal, biên nhận |
| `tools/webp-art.py` | ba luật nén ảnh + hai cửa chặn |
| `tools/sync-art.mjs` | đồng bộ art từ cây Unity sang `assets/art/` |
| `index.html` | markup + CSS màn loading, khối `GM_GAME` |
| `src/main.js` | `showLoading` / `hideLoading` / `loadingLabel`, `SHEETS_SHARE` |

**devDependencies**: `esbuild`, `ffmpeg-static`. Python + Pillow cho bước WebP (thiếu thì build ship
PNG và nói ra).
