# Hướng dẫn nhanh cho dev

## 1. Cài kit vào game

1. Chép thư mục kit vào dự án thành **`docs/GMSDK_JS/`**.
2. Trong thư mục đó, chép `config.example.json` thành **`config.json`** và điền thông tin game (mục 2).
3. Mở Claude Code (hoặc Codex) ở gốc dự án, **kéo `docs/GMSDK_JS/PROMPT.md` vào khung chat** (hoặc gõ `@docs/GMSDK_JS/PROMPT.md`) rồi Enter.

AI tự làm phần còn lại: khảo sát game, đưa plan, **chờ bạn duyệt** rồi mới sửa code. Chỗ nào thiếu thông tin thì AI hỏi.

## 2. Cần chuẩn bị

| Thông tin | Ví dụ |
| --- | --- |
| `name`: tên game | `Wheelie Spooky` |
| `id`: slug trên portal | `wheelie-spooky` |
| `gameCode`: mã game bên vận hành cấp | `g131` (chưa có thì để `null`, build đặt mã tạm; phải thay trước khi phát hành) |
| `languages`, `defaultLanguage` | `["en", "vi"]`, `en` |
| `leaderboardId` (nếu có bảng xếp hạng) | `leaderboard-topscore`, không có thì `null` |
| `gdKey` (nếu lên GameDistribution) | 32 ký tự hex, chưa có thì `null` |
| `brief` (chỉ game mới) | Mô tả ngắn game cần làm |

Thêm: **ảnh key art** của game (màn loading, 16:9 hoặc vuông, cạnh dài ≥ 1024).

Lúc cài, AI sẽ hỏi thêm: nén ảnh / nhạc không; màn loading dùng mẫu của kit hay giao diện của game; game đang tự lưu dữ liệu thì xử lý save của người chơi cũ thế nào.

## 3. Build

```bash
npm run build
```

Ra **`export/build/<version>-<id>/<version>-<id>.zip`**: file để upload. Build xong, AI hỏi hai việc dưới đây. Chưa cần thì trả lời "không", lần build sau AI hỏi lại; làm rồi thì không hỏi nữa (muốn làm lại thì tự bảo AI).

### Ảnh QA

- **Là gì:** ảnh chụp game ở 8 cỡ màn hình (máy tính, điện thoại dọc / ngang, iPad), kèm bảng kết quả: chữ bị cắt, nút chồng nhau, viền đen…
- **Làm gì:** kiểm giao diện ở mọi cỡ; ảnh lúc chơi còn dùng làm mẫu vẽ banner cho marketing.
- **Khi nào:** khi **đồ hoạ đã là bản cuối**. Chỉ làm một lần. Ra `export/qa/<version>-<id>/`.

### Marketing

- **Là gì:** bộ tài liệu để làm trang game và store:
  - mô tả game (tiếng Việt, tiếng Anh, bản HTML);
  - 8 cỡ ảnh icon / cover / thumbnail / banner.
- **Làm gì:** AI viết nội dung từ game thật, và viết prompt cho các ảnh còn thiếu. Bạn chạy prompt, duyệt ảnh.
- **Khi nào:** khi **game đã hoàn thiện** và **đã có ảnh QA** (ảnh marketing vẽ theo ảnh gameplay). Chỉ làm một lần. Ra `export/marketing/<version>-<id>/`.

Chi tiết: [AI_INSTALL.md](AI_INSTALL.md) (cài), [docs/EXPORT.md](docs/EXPORT.md) (build), [docs/QA.md](docs/QA.md), [docs/HANDOFF.md](docs/HANDOFF.md) (marketing, bàn giao).
