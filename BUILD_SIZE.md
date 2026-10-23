# Dung lượng build – Rider Worlds (bản web)

- **Ngày đo:** 21/10/2026
- **Bản build:** `Build/26102102` (`npm run build`, JS_SDK_2.0), tổng **128 MB** trên đĩa
- **Cách đo:** dung lượng file trong thư mục build; lượng tải thật đo bằng Chrome headless trên dev server (`npm run dev`, chưa nén gzip)

## Tóm tắt

- Game tải theo nhu cầu: mesh tải từng đoạn byte (HTTP Range) từ `meshes.bin`, prefab chunk tải khi cần. Người chơi không tải cả 128 MB.
- Phần lớn nhất là prefab JSON (53 MB), nhưng nén gzip chỉ còn khoảng 3,5 MB. Portal **phải** phục vụ `.json` có nén gzip/brotli.
- Texture vẫn là PNG vì bước chuyển WebP của kit đang tắt. Bật lên giảm được 12–16 MB.
- Khoảng 21 MB trong gói không bao giờ được tải: atlas UI DOM cũ (3,5 MB) và nội dung World 3 "Coming Soon" (khoảng 17 MB).

## Dung lượng theo từng phần

| Phần | Trên đĩa | Sau gzip | Ghi chú |
|---|---|---|---|
| `assets/prefabs/` (626 file JSON) | 53 MB | ~3,5 MB | Chunk (298 file) 18,9 MB · Other (156 file) 17,3 MB · FX (120 file) 8,9 MB · Level (49 file) 6,0 MB |
| `assets/meshes.bin` (1.430 mesh) | 33,3 MB | ~12,5 MB | Mesh nào cũng có chỗ dùng |
| `assets/textures/` (358 PNG + font) | 22 MB | — | PNG chiếm 20,7 MB, đã nén sẵn nên gzip không giảm thêm |
| `assets/audio/` (44 file .ogg) | 6,3 MB | — | Bước nén audio của kit đang tắt |
| `assets/ui/` (atlas WebP uGUI) | 3,8 MB | — | Đang dùng |
| `ui/atlas/` (gốc build) | 3,5 MB | — | **Không dùng**: chỉ `src/game/sprites.js` (lớp UI DOM cũ) trỏ tới |
| `framework.js` | 1,6 MB | ~0,4 MB | |

### File lớn nhất từng loại

- **Prefab:** `Menu.json` 3,6 MB, `HUD.json` 0,9 MB, `DailyDealsShopConfirmation.json` 0,9 MB.
- **Mesh:** cảnh nền World 1/2. Lớn nhất là `Frame` 1,28 MB (trong `W1_BG_Segment_6`), `Factoy2` 1,11 MB, `Frame1` 0,86 MB, `MS_Factory1` 0,69 MB.
- **Texture:** `TX_Concrete_tilable_Variant.png` 1,97 MB, `TX_W3_Background_WorldTransition.png` 1,29 MB, `TX_FX_Death_Helix.png` 0,68 MB.
- **Audio:** nhạc nền `chrome.ogg` 1,31 MB, `momentum` 1,05 MB, `hyperdrive` 0,93 MB, `gridlock` 0,91 MB.

### Nội dung World 3

World 3 là "Coming Soon" (`comingSoon: 1`, không bậc rank nào mở) nên người chơi không vào được. Phần này vẫn nằm trong gói:

- 116 prefab, 12,6 MB
- 40 texture, 4,3 MB

## Lượng tải thật khi chơi

Đo trên dev server, chưa nén gzip.

| Thời điểm | Tải thêm | Gồm |
|---|---|---|
| Vào game (tới menu) | ~26 MB | mesh 9,2 MB · prefab 7,3 MB · atlas UI 3,7 MB · nhạc 2,8 MB · `so_bundle` 0,65 MB · texture 0,6 MB |
| 30 giây Endless | ~14,7 MB | prefab chunk 12,3 MB (còn khoảng 1 MB nếu có gzip) · mesh 1,5 MB |

Tổng lúc vào game trên dev server là 39,7 MB, nhưng khoảng 14 MB trong đó là `node_modules`/`src` chỉ có ở chế độ dev. Bản build gói phần này vào `framework.js`.

## Hướng giảm dung lượng

Xếp theo mức có lợi cho người chơi.

| # | Việc | Giảm được | Ai được lợi |
|---|---|---|---|
| 1 | Bảo đảm portal nén gzip/brotli cho `.json` và `.bin` | Prefab 53 → ~3,5 MB, mesh 33 → ~12,5 MB | Người chơi (băng thông) |
| 2 | Bật bước PNG → WebP trong `JS_SDK_2.0/config.mjs` | 20,7 MB → 8,0 MB (lossless) hoặc 4,3 MB (q85) | Người chơi + gói |
| 3 | Bỏ `cache: 'no-store'` khi tải đoạn mesh, hoặc nén số liệu vertex (quantize) | ~9 MB mỗi lần mở game | Người chơi |
| 4 | Xoá `ui/atlas/` cùng lớp UI DOM cũ (`src/ui/*`, `src/game/ui.js`, `src/game/sprites.js`) | 3,5 MB | Gói upload |
| 5 | Loại nội dung World 3 khỏi bản build cho tới khi mở | ~17 MB | Gói upload |

Lưu ý cho từng việc:

- **WebP:** tên PNG được ghi thẳng trong JSON export, nên bật WebP phải sửa cả đường dẫn texture. Cần soát texture có alpha (FX, UI) trước khi dùng q85.
- **Cache mesh:** `cache: 'no-store'` đang dùng cho request Range. Bỏ nó cần thử xem trình duyệt và CDN của portal có cache đúng phản hồi 206 hay không.
- **Audio:** thông tin build ghi "Audio mp3" nhưng file thật là `.ogg`. Safari đời cũ có thể không phát được (case `DEV-02` trong checklist QA).
