# JS_SDK_2.0

Bộ công cụ build + publish game HTML5 lên portal **azgames.io / GMSDK**. **Copy nguyên thư mục này sang dự án mới, chạy một lệnh, xong.**

Chuẩn kit thực thi: **[docs/JSGMSDK.md](docs/JSGMSDK.md)** (bố cục build, key `azgames.g<ID>`, ngôn ngữ, Icons, `AZ_SETTINGS`, bản quyền, `preview.html`).

---

## Cho AI: khi người dùng bảo "cài SDK" / "build"

> Đầy đủ và ngắn gọn trong **[AI_INSTALL.md](AI_INSTALL.md)**: bảo AI đọc file đó.

**Cài.** Chỉ hỏi người dùng **3 thứ** (chỉ bên vận hành portal biết, không được đoán): *tên game*, *ID game* (vd `soccer-kick-az`), *mã game* (giữ chữ G, vd `G131`). Rồi chạy, không cần tương tác:

```bash
node JS_SDK_2.0/tools/setup.mjs --name "Soccer Kick" --id soccer-kick-az --gid G131
```

Mọi thứ khác lấy **mặc định** (version `1.0`, bản quyền `© <năm> Azgames.io`, ngôn ngữ `en`, thư mục web tự dò hoặc `web`, signDomain / Firebase / SDK host của publisher). Setup in **bảng thông tin game** (mục, giá trị, chỉnh ở đâu). **Chép bảng đó lại cho người dùng** và hỏi có muốn đổi mục nào không. Đổi mặc định ngay lúc cài bằng `--version`, `--notice`, `--language`, `--web`, `--sign`.

Xem lại thông tin bất cứ lúc nào: `node JS_SDK_2.0/tools/setup.mjs --info`. Cài cho game khác trong cùng thư mục: thêm `--yes`.

Sau khi cài: `npm i -D esbuild javascript-obfuscator ffmpeg-static`, thay `Icons/web.png` + `Icons/loading.webp` bằng ảnh của game, làm panel Settings hiện version + bản quyền (chưa có thì **hỏi người dùng** đặt ở đâu).

**Build.** `npm run build`. Build in lại **bảng thông tin game của bản này** (cùng cột "chỉnh ở đâu"): chép cho người dùng xem. Build dừng và nói rõ lý do nếu có gì sai (danh tính, ngôn ngữ, bản quyền, Icons, `localStorage`, số file JS…); nếu hỏi lại danh tính đã đổi hay chưa, **hỏi người dùng**, đừng tự trả lời `y`.

---

## Người dùng tự cài

Mở terminal ở thư mục gốc dự án (VS Code: Terminal → New Terminal), copy `JS_SDK_2.0/` vào đó, rồi:

```bash
node JS_SDK_2.0/tools/setup.mjs        # hỏi 3 câu: tên game, ID game, mã game (G131)
npm i -D esbuild javascript-obfuscator ffmpeg-static
npm run build
```

Setup dựng khung (chỉ ghi file chưa có, không bao giờ đè): `index.html` (AZ_SETTINGS + màn loading), `src/main.js` mẫu, `src/sdk/*`, `Language/en.json`, `Icons/`, script `build`, `.gitignore`.

---

## Trong kit có gì

```
JS_SDK_2.0/
├── README.md           ← file này
├── AI_INSTALL.md       ← AI đọc file này để cài / build
├── docs/               ← tài liệu
│   ├── JSGMSDK.md        CHUẨN (spec): bố cục build, key azgames.g<ID>, ngôn ngữ, Icons, AZ_SETTINGS, bản quyền
│   ├── BUILD_RULES.md    bản quyền + version, không ghi chú / tiếng Việt, tải không treo
│   ├── BUILD_PIPELINE.md các chặng build, nén ảnh/audio, màn loading, vỏ portal, publish
│   ├── ANALYTICS.md      sự kiện, luật đặt tên, bộ sự kiện chuẩn
│   └── MOREGAMES.md      nút More Games
├── config.example.mjs  ← setup sinh config.mjs từ file này (config.mjs mang danh tính game, KHÔNG copy giữa các game)
├── sdk/                ← gmsdk, portal, analytics, storage, i18n, net, uiReady, placeholders
├── template/           ← index.html, main.example.js, Language/en.json, Icons/, css/, loading.*, notice.js, config.runtime.mjs
├── tools/              ← setup.mjs, build.mjs, check_build.py, notice-hash.mjs, webp-art.py
└── art/  reference/    ← logo AZGAMES, key art mẫu, mẫu loading gốc của portal
```

## Lưu ý

- `config.mjs` (sinh ra) mang `gameId`, `gameCode`, `signDomain` của game: **không copy nó sang game khác**, chạy `setup.mjs` lại.
- Game cũ đã phát hành với key localStorage khác: khai báo `legacyKeys` / `legacySdkFields` trong `src/config.mjs` để gộp dữ liệu người chơi vào `azgames.g<ID>` một lần (xem `sdk/storage.js`).
- Opus không chạy trên Safari (xem `config.audio.format`). Vỏ portal không mở được từ ổ đĩa: test bằng `Build/<v>/<v>/index.html` qua server tĩnh.
- Sau khi build, sửa tay `gameId` / `portalGid` / `language` ở `Build/<v>/index.html` rồi chép đè sang `preview.html` (docs/JSGMSDK.md B.7, B.10).
