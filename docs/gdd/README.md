# Rider Worlds: thiết kế game

Bản port web của game Unity *Rider Worlds* (project `D:\SourceGame\09\rider-worlds`): đua xe 2.5D một chạm, tăng tốc trên mặt đất, lộn (flip) trên không, tiếp đất an toàn. Gameplay và meta game theo đúng bản gốc. Chi tiết kỹ thuật của bản port nằm ở [README.md](../../README.md) ở gốc repo.

| Phần | Trạng thái |
| --- | --- |
| Gameplay (Endless 3 world, 49 timed level) | Xong, theo bản gốc |
| Meta game (card, garage, rank, challenge, shop, lootbox, bonus, tutorial) | Xong, theo bản gốc |
| SDK GMSDK_JS 1.0.1 (loading, quảng cáo, lưu, tracking, leaderboard) | Xong: [docs/plan/2026-10-23-gmsdk-1.0.1.md](../plan/2026-10-23-gmsdk-1.0.1.md) |

## Cách chơi

- Giữ chuột / chạm / Space / ↑ để tăng tốc khi xe trên mặt đất, và lộn khi xe trên không. Thả ra để tiếp đất. Lộn rồi tiếp đất đẹp (Perfect) được thưởng điểm.
- `Esc` / `P`: tạm dừng.
- **Endless** (World 1, World 2; World 3 "Coming Soon" như dữ liệu gốc): chạy càng xa càng nhiều điểm. Chết thì có thể hồi sinh: miễn phí bằng quảng cáo thưởng hoặc trả ruby. Điểm gửi lên bảng xếp hạng `leaderboard-highscore`.
- **Timed level** (Easy / Moderate / Difficult theo world): về đích trong thời gian để nhận 1–3 sao.

## Kinh tế

| Tiền | Id tracking | Nhận | Tiêu |
| --- | --- | --- | --- |
| Gem (soft) | `gems` | Nhặt trong run, bonus, rank, rương | Rương, daily deal |
| Ruby (hard) | `rubies` | Rank, quà ruby (quảng cáo), rương dư | Hồi sinh, skip challenge, làm mới daily deal |
| Star | `rank_stars` | Rank card mới, 3 sao level | Lên rank |
| Chữ B-O-N-U-S | `bonus_letters` | Nhặt trong Endless (từ rank 3) | Đủ 5 chữ đổi gem |

## Bản đồ tính năng (UX.md §5)

| Tính năng | Mở khi | Chỗ vào | Người chơi biết bằng | Lớp | Sự kiện |
| --- | --- | --- | --- | --- | --- |
| Garage (card, skin) | Rank 1 | Nút Meta ở thanh dưới | Nút mở khoá ở rank 1, chấm đỏ card mới | L4, L5 | `feature_open garage`, `item_equip` |
| Shop | Rank 2 | Nút Store ở thanh dưới | Nút mở khoá, tutorial shop | L5 | `feature_open shop` |
| Timed level | Rank track mở Easy | Nút Levels ở Home | Nút hiện khi mở + tutorial level đầu | L5 | `level_start` (`mode: timed_level`) |
| Challenge | Từ đầu | Nút Challenges ở Home | Tutorial claim challenge, chấm đỏ khi xong | L4 | `feature_open challenges`, `feature_action` |
| Rank track | Từ đầu | Thanh sao ở top bar | Popup lên rank | L5 | `feature_open reward_track` |
| Bonus | Rank 3 | Nút Bonus ở Home | Chữ B-O-N-U-S trong run | L2, L4 | `feature_action bonus` |
| Chuyển world | Rank track mở World 2 | Mũi tên world ở Home | Tutorial mở world | L5 | `feature_unlock worlds` |
| Rương (lootbox) | Rương đầu | Shop, phần thưởng | Hoạt cảnh mở rương | L5 | `feature_action chests` |
| Quà ruby hằng ngày | Rank của gift | Shop | Chấm đỏ ở Store | L4 | `ad_offer shop_gift` |
| Bảng xếp hạng | Từ đầu | Nút vương miện cạnh High Score | Nút luôn hiện ở Home | | `feature_open leaderboard` |

## Quảng cáo

Theo [docs/GMSDK_JS/docs/INTEGRATION.md](../GMSDK_JS/docs/INTEGRATION.md) §5. Mã: `src/ads.js`.

- **Preroll**: SDK quyết (một lần, sau khi menu hiện).
- **Xen giữa** `run_end`: hết một run, trước khi về menu. Không sau run đầu tiên của phiên, không trong tutorial.
- **Thưởng**: mọi nút xem quảng cáo của bản gốc: hồi sinh, rương miễn phí, daily deal, làm mới daily deal, quà ruby, Free Rewards (RV track), x2 ruby khi lên rank, xN gem khi đổi BONUS, card thêm của rương, skip / hoàn thành challenge. Không có quảng cáo sẵn thì nút báo không có quảng cáo (biểu tượng NoWifi hoặc popup "No ads available" của bản gốc). Danh sách `placement`: `docs/GMSDK_JS/analytics.json` → `ad_placements`.
