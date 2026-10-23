# Báo cáo kiểm thử – Rider Worlds (bản web)

- **Ngày:** 21/10/2026
- **Người chạy:** Claude (test tự động), cùng nhóm QA (test tay)
- **Môi trường:** Chrome headless trên Windows, render bằng SwiftShader. Chỉ chạy khoảng 9 fps nên không đo được fps thật; âm thanh không nghe được.
- **Checklist dùng chung:** https://claude.ai/artifact/NBMixHcEh8NmqfiYUtRiyE (78 case, kết quả lưu cho cả nhóm). Ghi chú bắt đầu bằng **[Claude · tự động]** là kết quả của bộ kịch bản trong `tools/qa/`.

## Tóm tắt

| | Số case |
|---|---|
| Đã kiểm tự động | 49 / 78 |
| Pass | 41 |
| Fail | 1 (`CTRL-06`: phím R) |
| Đã chạy một phần, cần test tay nốt | 7 |
| Chưa kiểm (cần thiết bị thật hoặc test tay) | 29 |

Bot đã chơi đủ **49/49 timed level** và **Endless ở cả 3 world** (41 lần chết rồi hồi sinh), không có lỗi JS nào.

## Lỗi đã sửa trong đợt này

| Commit | Lỗi | Nguyên nhân | Đã kiểm |
|---|---|---|---|
| `ef7fc50` | Mũi tên ">>>" của speed booster nằm ngang trên dốc, xếp thành bậc thang | Particle mesh có `alignToDirection` bị bỏ hết góc xoay và chỉ quay theo camera | Ảnh chụp chunk 1-1-010: mũi tên nghiêng theo pad, chỗ phẳng không đổi |
| `f836228` | Tấm xanh (FallingDip, đường rơi, máy nghiền, cannon…) không về chỗ cũ sau khi hồi sinh, nằm chắn đường, chạm vào là chết | `Rigidbody2D.position/rotation` trả về vị trí body cũ khi chunk vừa được dời tới chỗ spawn, nên animation ghi nhầm điểm xuất phát (lệch đúng bằng offset `ChunkStart`). Unity gốc bật `autoSyncTransforms` | Quét 185 chunk/level với `ResetState()`, 41 lần hồi sinh thật: mọi tấm về đúng vị trí |
| (commit kèm báo cáo này) | Tấm/vòng xoay liên tục giật một cái mỗi khi quay hết vòng (Chunk 1-3-007, 1-3-015…) | Nội suy góc của `Rigidbody2D` lấy hiệu số thô, nên khi góc quấn vòng (-360° rồi về 0°, hoặc solver chuẩn hoá về ±180°) tấm quay vụt gần trọn vòng trong một khung hình | `tools/qa/snap-scan.mjs`: hai chunk trên không còn cú nhảy |

## Lỗi và việc còn mở

1. **Phím R không chơi lại được** (`CTRL-06`, `LVL-06`). README ghi "`R` chơi lại", nhưng code chỉ xử lý Esc/P (tạm dừng) và Space/↑/W/→/Enter (tăng tốc). Cần thêm xử lý phím R, hoặc sửa README cho khớp.
2. **Xe đứng yên sau khi level khởi động lại** (cần test tay, `LVL-03`). Ở Level 1-Difficult-5 và 1-Difficult-7, bot giữ phím xuyên qua lúc level khởi động lại thì xe đứng yên 7–15 giây ở vạch xuất phát, đồng hồ 0.000. Có thể game chỉ nhận lần nhấn mới. Cần thử bằng tay xem người chơi giữ nút liên tục có bị kẹt như vậy không.
3. **Code UI cũ không dùng tới.** `src/ui/*` và `src/game/ui.js` (khoảng 2.400 dòng, lớp UI DOM) không được file nào import. UI thật chạy bằng uGUI trong `src/uiscripts`. Có thể xoá.
4. **World 3 không mở được bằng rank.** Dữ liệu gốc đặt `comingSoon: 1` cho World 3. Đúng với bản Unity, chỉ ghi lại để biết.
5. **Chunk 2-2-011R (`r_circleOpen_9`)** có hai feedback xoay +180° và -180° chạy cùng lúc nên tấm nhảy góc ở khung đầu. Code cũ và mới chạy giống nhau, coi như dữ liệu sẵn có của chunk.

## Kết quả theo khu vực

| Khu vực | Pass | Còn lại | Ghi chú chính |
|---|---|---|---|
| Khởi động & Tutorial | 01, 02, 03, 05 | 04 (cố tình ngã), 06 (tutorial menu) | Profile mới tải xong khoảng 13 giây (headless), tutorial đi đủ 5 bước. Sau tutorial, lượt chạy tiếp tục như Endless |
| Điều khiển | 01 | **06 Fail**, 04, 02/03/05/07 chưa kiểm | Giữ ↑ 2 giây: đi 22.6 m, tốc độ 13.8 m/s |
| Phần tử đường đua | 01, 05, 10 | 02–04, 06–09 chưa kiểm riêng | Đã quét reset và cú nhảy góc cho 185 chunk/level |
| Endless | 01, 02, 03, 05, 06 | 07 (màn kết quả), 04 chưa kiểm | 3 world, mỗi world khoảng 2 phút, xe đi 200–340 m |
| Chết & hồi sinh | 01–05, 07 | 06 (vùng trọng lực) | Quảng cáo 3 lần/run (`rvRevivesPerRun = 3`), hồi sinh bằng rubies trừ đúng giá, hết giờ sau khoảng 10 giây |
| Timed Levels | 02, 03 | 06, 01/04/05 chưa kiểm | Bot về đích ở 7 level: 1-Easy-1, 1-Easy-2, 1-Easy-4, 1-Moderate-1, 2-Easy-3, 2-Easy-4, 2-Easy-6 |
| Tiến trình & phần thưởng | 01–09 | — | Rank 0→8 kèm thưởng rank track, rương (cả màn ưu đãi LOSE IT / GET IT), rương ngày, BONUS (400 gem, hồi chiêu 1 giờ), challenge, world stats |
| Shop & Garage | 01–07 | — | Rương 500 gem, daily deal 30 rubies (+2 thẻ), quà 20 rubies/ngày, track quảng cáo (mốc 3 → 250 gem), đổi xe/hiệu ứng, nâng cấp thẻ |
| Cài đặt & tạm dừng | 01, 02, 03 | 04–06 chưa kiểm | Nhạc/SFX/Bloom giữ sau khi tải lại; Esc/P tạm dừng và tiếp tục |
| Portal, save & leaderboard | 01 | 03 (cố ý bỏ qua), 02/04–07 chưa kiểm | Save giống hệt sau khi tải lại, chỉ `sessionID` tăng. Không gửi điểm tự động để tránh làm bẩn bảng xếp hạng thật |
| Thiết bị & hiệu năng | — | 01 (mới chạy Chrome headless), 02–06 | Cần máy thật |

## Cần test tay

- Safari (macOS/iOS), Android Chrome dọc và ngang, cảm ứng nhiều ngón, đổi kích thước cửa sổ, chơi liên tục 15 phút.
- Chạy trong iframe portal azgames.io, quảng cáo thật, gói rubies tiền thật, leaderboard (gửi điểm, popup, đổi tên và cờ), sự kiện analytics.
- Hiệu ứng nhìn và nghe: âm thanh, hiệu ứng nổ/tiếp đất/trail trong run, màn kết quả cuối run, hiệu ứng kỷ lục mới.
- Overlay Challenges trên Home, nút bonus, rương Small miễn phí, nút làm mới Daily Deals, Reset progress.
- Từng phần tử đường đua: jump pad, cannon, kính, từ tính, vùng trọng lực, chướng ngại.

## Bộ kịch bản QA (`tools/qa/`)

Cần `npm run dev` đang chạy. Mỗi kịch bản chạy bằng `node tools/scenario.mjs tools/qa/<tên>.mjs <thư mục kết quả>`; ảnh chụp và `console.log` nằm trong thư mục kết quả.

| Kịch bản | Nội dung | Thời gian (headless) |
|---|---|---|
| `functional.mjs` | Profile mới: tutorial, cài đặt, tăng tốc, tạm dừng, phím R, các kiểu hồi sinh, kỷ lục, save. In dòng `RESULT {...}` theo mã case | ~8 phút |
| `meta.mjs` | Khoá trang theo rank, tiền tệ, rank-up + rank track, Shop (rương, deal, quà, track quảng cáo), mở rương, rương ngày, BONUS, challenge, Garage, nâng cấp thẻ | ~5 phút |
| `levels.mjs` | Bot chơi timed level, ghi số lần chết, về đích, đứng yên, lỗi. `LEVELS=Level 1-Easy-,...` để lọc, `SECS=35` | ~35 giây/level |
| `endless.mjs` | Bot chơi Endless từng world, tự nhận hồi sinh và kiểm mọi phần tử động lúc respawn. `WORLDS=0,1,2`, `SECS=120` | ~2 phút/world |
| `reset-check.mjs` | Tạo mọi chunk/level có phần tử động, kích hoạt hết, `ResetState()` rồi so vị trí. `ONLY=<tên chunk>` để lọc | ~5 phút |
| `snap-scan.mjs` | Ghi góc/vị trí của từng tấm có animation theo từng khung hình để tìm cú nhảy. Ngưỡng 45° là do lấy mẫu chậm, nên cannon và lưỡi cưa xoay nhanh vẫn hiện trong danh sách | ~5 phút |

`common.mjs` chứa phần khởi động dùng chung: bắt lỗi console, bỏ qua tutorial, danh sách chunk động.
