# Trải nghiệm người chơi: người mới hiểu game, không bỏ sót tính năng

Chuẩn cho mọi game theo kit, dùng khi **làm game mới** ([NEW_GAME.md](NEW_GAME.md)) và khi **rà game có sẵn** ([AI_INSTALL.md](../AI_INSTALL.md)). Checklist nghiệm thu nằm ở [QA.md §3.9](QA.md).

Nguồn ghi như QA.md: **[Poki]**, **[CG]** là yêu cầu hoặc khuyến nghị của portal; **[Nội bộ]** là bài học từ Wheelie Spooky (repo wheelie-life-web, `src/guide/`).

## 1. Nguyên tắc

| # | Nguyên tắc | Nguồn |
| --- | --- | --- |
| 1 | **Vào chơi ngay.** Người mới vào gameplay luôn, hoặc tối đa 1 cú bấm. Ít màn, ít menu trước khi chơi | [CG] [Poki] |
| 2 | **Dạy bằng cách cho chơi**, không bằng chữ. Hình, icon, chỉ tay hơn đoạn văn | [CG] [Poki] |
| 3 | **Chỉ dạy phần cốt lõi lúc đầu.** Tính năng phụ dạy đúng lúc người chơi gặp nó | [CG] |
| 4 | **Bỏ qua được.** Phần hướng dẫn, intro, cutscene đều bỏ qua được; không chặn người đã biết chơi | [CG] [Poki] |
| 5 | **Hiện đúng điều khiển theo thiết bị.** Cảm ứng thì vẽ vùng chạm; bàn phím thì vẽ phím. Tablet dùng điều khiển cảm ứng | [Poki] [CG] |
| 6 | **Mục tiêu rõ, đạt được.** Người chơi biết phải làm gì và vì sao thua | [CG] |
| 7 | **Không ngắt lúc đang chơi.** Không popup, không quảng cáo, không gợi ý che màn khi người chơi đang điều khiển khó | [Nội bộ] |
| 8 | **Mỗi tính năng có ít nhất một đường để người chơi tự tìm ra** (§5) | [Nội bộ] |

## 2. Phiên đầu tiên, từng bước

Kịch bản người chơi mới đi qua. Game nào cũng nên viết kịch bản này ra trước khi làm UI.

| Bước | Người chơi | Game làm | Ví dụ Wheelie Spooky |
| --- | --- | --- | --- |
| 1. Tải (≤ 10 s) | Thấy màn loading của game, thanh tiến độ chạy | `loadingProgress`; logo publisher qua `sdk.brand` | Splash có logo, thanh tiến độ, logo GamesForFree |
| 2. Màn đầu | Thấy ngay nút chơi to nhất màn hình | Menu một bước; `loadingDone()`, preroll nếu API bật | Garage, nút PLAY |
| 3. Lần chạm đầu | Bắt đầu điều khiển | Lớp điều khiển (§3 L1) + **một dòng mục tiêu**; `gameplayStart()` ở input đầu tiên | Khung phím / vùng chạm + "giữ bánh trước, đừng lật" |
| 4. 30 giây đầu | Làm được thao tác cốt lõi | Không gợi ý nào trong 3 s đầu; thao tác thành công thì có phản hồi rõ (âm thanh, điểm bay lên) | Hệ số điểm to dần, đổi màu, có nốt nhạc (`multiplierFx`) |
| 5. Gặp thứ mới | Thấy vật phẩm, kỹ năng lần đầu | Gợi ý một dòng, một lần trong đời save (§3 L2) | "Wheelie để lấy đồ trên cao" |
| 6. Thua lần đầu | Hiểu vì sao thua | Lý do + mẹo sửa (§3 L3); Retry 1 cú bấm (phím Space) | "Lật xe: phanh để hạ mũi" |
| 7. Về menu lần đầu | Thấy có việc để làm | Chấm đỏ ở chỗ làm được ngay (§3 L4). Không quảng cáo xen giữa sau ván đầu | Chấm đỏ UPGRADE khi đủ xu |
| 8. Mở khoá đầu tiên | Biết mình vừa mở được gì | Báo một lần + nhãn NEW tới khi mở (§3 L5) | Map mới mở |
| 9. Phiên thứ hai | Có lý do quay lại | Quà ngày, nhiệm vụ ngày có chấm đỏ | Quà ngày tự mở lần đầu trong ngày |

## 3. Năm lớp hướng dẫn

Lớp 1, 2 là **hướng dẫn** (tắt được bằng Settings → Show tutorial). Lớp 3, 4, 5 là **phản hồi**, luôn hiện.

### L1. Lớp điều khiển đầu lượt

- Vẽ theo thiết bị: phím trên desktop, vùng chạm trên điện thoại. Kèm **một dòng mục tiêu**.
- Tắt trong lượt ở lần input đầu tiên.
- **Tự thôi hiện** khi người chơi đã chứng tỏ biết chơi (một điều kiện đo được, ví dụ wheelie ≥ 3 s), không theo số lần mở game.
- Đổi cách điều khiển ở bản cập nhật: hiện lại một lần cho người chơi cũ.

### L2. Gợi ý một dòng, đúng lúc

- Mỗi gợi ý gắn một **điều kiện kích hoạt** (thấy vật phẩm lần đầu, nhặt lần đầu, đạt mốc kỹ năng) và chỉ hiện **một lần trong đời save**.
- Nhịp: không gì trong 3 s đầu lượt; hai gợi ý cách nhau ≥ 8 s; mỗi lúc một gợi ý; nhiều gợi ý cùng đủ điều kiện thì lấy theo thứ tự ưu tiên.
- Lúc bị chặn (pause, quảng cáo, đã thua, lớp L1 còn hiện) thì bỏ qua và **không tính là đã xem**: lần sau gặp lại thì hiện.
- Tính là đã xem ngay lúc bắt đầu hiện. Đồng hồ hiện của gợi ý chỉ chạy khi game chạy.
- Một dòng, có icon của thứ đang nói tới; số liệu (thời lượng, hệ số) lấy từ dữ liệu game, không viết cứng. Chữ khác nhau cho cảm ứng và bàn phím.
- Không che vùng chơi chính, không nhận chạm, không dừng game.

### L3. Lý do thua và mẹo sửa

- Mọi màn thua đều có một dòng: **thua vì gì + làm gì để tránh**. Game ghi lý do ngay lúc thua.
- Retry là nút to nhất màn thua, 1 cú bấm, có phím tắt.

### L4. "Có việc để làm": chấm đỏ theo trạng thái

- Chấm đỏ ở nút dẫn tới việc **làm được ngay**: đủ tiền nâng cấp, có quà chưa nhận, nhiệm vụ mới.
- Chấm hiện khi điều kiện đúng, tự mất khi không còn đúng. **Không có trạng thái "đã xem"**.
- Không chấm cho thứ gần như lúc nào cũng đúng (đồ rẻ): chấm mất nghĩa.
- Tính bằng hàm thuần từ save (ví dụ `garageNudges(save)`), gọi lại mỗi khi save đổi hay đóng một bảng.

### L5. Mới mở khoá, tính năng mới

- Mở khoá trong lúc chơi (map, xe, chế độ): báo **một lần** lúc mở (toast hoặc dòng trên màn kết quả), rồi nhãn **NEW** trên chỗ vào cho tới khi người chơi mở nó.
- Tính năng mới sau bản cập nhật: §6.
- Mỗi lần vào menu báo tối đa **một** thứ mới; không xếp chồng nhiều popup.

## 4. Lưu trạng thái hướng dẫn

- Trong `sdk.storage`, vùng `profile`: `guide: { seen: string[], features: string[] }`. `seen` là id gợi ý L1, L2 đã hiện; `features` là id tính năng đã mở hoặc đã báo (L5, §6).
- `sanitize` chỉ giữ id còn trong danh sách id của game, bỏ trùng; save cũ không có `guide` thì là mảng rỗng.
- Settings có **Show tutorial**. Tắt: không hiện L1, L2. Bật lại: xoá `seen`, xem lại từ đầu.
- Chữ nằm trong `i18n/` với tiền tố cố định: `hint_*`, `crash_*`, `new_*`. Đủ ở mọi ngôn ngữ, đo tràn chữ ở ngôn ngữ dài nhất ([QA.md](QA.md) 2.5).

## 5. Không bỏ sót tính năng: bản đồ tính năng

Mỗi game giữ một bảng trong `docs/gdd/` (tài liệu thiết kế, [INTEGRATION.md §1](INTEGRATION.md)), một dòng cho mỗi tính năng người chơi có thể bỏ lỡ:

| Tính năng | Mở khi | Chỗ vào | Người chơi biết bằng | Lớp | Sự kiện |
| --- | --- | --- | --- | --- | --- |
| Nâng cấp xe | Từ đầu | Nút UPGRADE ở garage | Chấm đỏ khi đủ xu | L4 | `purchase` |
| Power-up khiên | Từ đầu | Vật phẩm trên đường | Gợi ý lần đầu nhặt | L2 | |
| Map Pumpkin Patch | Đủ nhiệm vụ + xu | Nút MAP | Chấm đỏ + NEW khi mở | L4, L5 | `purchase` |
| Quà ngày | Mỗi ngày | Icon quà | Tự mở lần đầu trong ngày + chấm đỏ | L4 | `daily_claim` |

Luật:
- **Mỗi dòng phải có cột "Người chơi biết bằng".** Dòng nào trống là tính năng sẽ bị bỏ sót.
- Thêm tính năng mới thì thêm dòng trước khi làm UI.
- Nút dẫn tới tính năng phải nhìn thấy từ màn chính (không giấu trong 2 lớp menu), hoặc có L4 / L5 dẫn đường.
- Rà bảng này mỗi lần QA ([QA.md](QA.md) 9.6).

## 6. Bản cập nhật có tính năng mới

Cho người chơi cũ (đã có save):
- Mỗi tính năng mới có một id trong `guide.features`. Lần đầu vào menu sau cập nhật: nhãn **NEW** trên chỗ vào, và một dòng báo (toast) cho tính năng quan trọng nhất. Mở rồi thì thôi.
- Người chơi mới không cần báo "mới": với họ mọi thứ đều mới. Lúc tạo save lần đầu, ghi sẵn mọi id tính năng hiện có vào `guide.features`.
- Đổi điều khiển hay luật chơi: hiện lại L1 một lần cho người chơi cũ (Wheelie: `controlsV2Seen`).
- Không popup "Có gì mới" nhiều trang; không chặn người chơi vào game.

## 7. Quảng cáo và người chơi mới

Chi tiết ở [INTEGRATION.md §5](INTEGRATION.md) và [QA.md §3.4](QA.md). Riêng phần người mới:
- Không quảng cáo xen giữa sau ván đầu tiên. Preroll là việc của API.
- Nút quảng cáo thưởng ghi rõ là xem quảng cáo (icon video), ghi rõ phần thưởng; luôn có cách đi tiếp không cần xem.
- Không mời quảng cáo thưởng trong lúc đang dạy (lượt đầu, khi L1 còn hiện).

## 8. Đo xem người chơi có bỏ sót không (tuỳ chọn)

Qua bộ sự kiện phân tích bắt buộc ([ANALYTICS.md §4](ANALYTICS.md)), không gửi mỗi khung hình:
- `onboarding_step`: các bước của phiên đầu (§2). Bước có nhiều người rớt nhất là chỗ cần sửa trước.
- `tutorial_step { action: shown / done / skipped }`: từng bước hướng dẫn (L1, L2). Bị bỏ qua nhiều, hay lâu mới xong, là phần dạy chưa rõ.
- `feature_unlock` + `feature_open { first: true }`: mỗi tính năng trong bảng §5. Tỉ lệ mở trên số đã mở khoá thấp bất thường là tính năng bị bỏ sót.
- Bảng tính năng §5, các bước phiên đầu §2 và tên các hướng dẫn thành các danh sách `features`, `onboarding`, `tutorials` của `analytics.json`, file AI sinh sau khi gắn ([ANALYTICS.md §6](ANALYTICS.md)).

Wheelie Spooky chưa gửi hai sự kiện này.

## 9. Ví dụ đầy đủ: Wheelie Spooky

Repo wheelie-life-web, nhánh `halloween`:

| Lớp | Code | Test |
| --- | --- | --- |
| L1 | `showControlsGuide()` trong `src/guide/hints.ts`; vẽ ở `src/scenes/HudScene.ts` | `tests/hints.test.ts` |
| L2 | `HINT_IDS`, `dueHints()`, `HintPacer`, `BannerClock` trong `src/guide/hints.ts` | `tests/hints.test.ts` |
| L3 | `crashCause` của `RunState`, `crashTip()` trong `src/guide/crashTips.ts` | `tests/crashTips.test.ts` |
| L4 | `garageNudges()` trong `src/guide/nudges.ts`, `badgeDot` | `tests/nudges.test.ts` |
| L5 | Chưa có (nhãn NEW chưa làm) | |

Thiết kế: `docs/superpowers/specs/2026-10-17-onboarding-hints-design.md`.
