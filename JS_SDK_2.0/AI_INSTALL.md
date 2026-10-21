# AI_INSTALL — hướng dẫn cho AI cài và build JS_SDK_2.0

Đọc file này khi người dùng bảo **"cài SDK"**, **"build"** hoặc **"kiểm tra thông tin game"**. Chuẩn đầy đủ: `docs/JSGMSDK.md`. Không cần đọc file khác để cài.

## Cài SDK

1. **Hỏi người dùng 3 thứ.** Chỉ bên vận hành portal biết, không được đoán, không được lấy của game khác:
   - tên game (vd `Soccer Kick`)
   - ID game, nguyên văn kể cả đuôi (vd `soccer-kick-az`)
   - mã game, giữ chữ G (vd `G131`)

   Không hỏi gì thêm.

2. **Chạy** ở thư mục gốc dự án (nơi có thư mục `JS_SDK_2.0/`):
   ```
   node JS_SDK_2.0/tools/setup.mjs --name "Soccer Kick" --id soccer-kick-az --gid G131
   ```
   Thiếu hoặc sai giá trị thì lệnh báo rõ thiếu gì: hỏi lại người dùng, đừng tự điền. Đã cài rồi (có `JS_SDK_2.0/config.mjs`) thì lệnh chỉ in thông tin hiện tại; cài cho game khác mới thêm `--yes`.

3. **Báo lại cho người dùng bảng thông tin game** mà lệnh in ra (mục, giá trị, chỉnh ở đâu). Có cả các mục mặc định: version `1.0`, bản quyền `© <năm> Azgames.io`, ngôn ngữ `en`, thư mục web, Firebase, SDK host… Hỏi người dùng có muốn đổi mục nào không. Muốn đổi ngay lúc cài thì chạy lại với `--yes` và thêm `--version`, `--notice`, `--language`, `--web`.

4. **Làm tiếp:**
   - `npm i -D esbuild javascript-obfuscator ffmpeg-static` (build cần Python 3 + Pillow cho bước WebP).
   - Thay `<webDir>/Icons/web.png` và `<webDir>/Icons/loading.webp` bằng ảnh của game. Build dừng nếu còn là ảnh mẫu.
   - Version và bản quyền phải hiện cho người chơi, ưu tiên chân panel Settings (version trái, bản quyền phải). Game chưa có Settings thì **hỏi người dùng** đặt ở đâu, đừng tự chọn.
   - Chữ cho người chơi nằm trong `<webDir>/Language/en.json`, gọi bằng `t('key')`. Mọi lưu trữ đi qua `src/sdk/storage.js` (không gọi `localStorage` trực tiếp).

## Xem lại thông tin game

```
node JS_SDK_2.0/tools/setup.mjs --info
```

## Build

```
npm run build
```

- Build in lại **bảng thông tin game của bản này**: chép cho người dùng xem, kèm thư mục kết quả `Build/<version>/`.
- Build **dừng và nói rõ lý do** khi có gì sai (danh tính, ngôn ngữ, bản quyền, Icons, `localStorage`, quá số file JS, còn ghi chú dev…). Sửa nguyên nhân rồi build lại; đừng bỏ qua cổng nào.
- Nếu build hỏi *"Identity changed since the last build… Did you ask the portal operator?"* thì **hỏi người dùng**, đừng tự trả lời `y`.
- Nếu build hỏi game hiện dòng `© 2026 Azgames.io` ở đâu thì hỏi người dùng, đừng đoán.

## Không làm

- Không copy `JS_SDK_2.0/config.mjs` giữa các game: nó mang danh tính của game (chạy lại `setup.mjs`).
- Không sửa số băm bản quyền (`EXPECT`) bằng tay; đổi dòng bản quyền thì chạy `node JS_SDK_2.0/tools/notice-hash.mjs`.
- Không thêm file JS ngoài `loader.js` và `framework.js` vào bản build.
