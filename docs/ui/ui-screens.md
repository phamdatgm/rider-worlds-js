# Rider Worlds — danh sách màn hình UI

Giai đoạn 1 của quy trình ReskinUI. Mỗi màn có: **Khi nào** hiện, **Thành phần** chính. Trạng thái từng màn nằm
trong `ui-screens.index`; ảnh chụp ở `shots/NN.jpg` (1280×720, chụp từ dev server bằng
`node tools/scenario.mjs docs/ui/ui_shots.mjs docs/ui/shots-raw`, rồi `node docs/ui/ui_index.mjs`).

## Luồng màn hình

```
Loading (01) ─┬─ người chơi mới ─► HUD (15) + Tutorial (17) ─► Home
              └─ người chơi cũ ──► Transition (02) ─► Home (03)

Home (03) ─┬─ Challenges (04)          popup trên Home
           ├─ Levels (05) ─► chọn level ─► Transition ─► HUD (15)
           ├─ World Stats (06)         nút WORLD ở giữa top bar
           ├─ Reward Track (07)        thanh sao ở top bar, tự mở sau Rank Up
           ├─ Leaderboard (11)         nút vương miện cạnh High Score
           ├─ Claim Bonus (13)         nút BONUS khi đủ 5 chữ B-O-N-U-S
           ├─ Settings (10)            nút bánh răng
           ├─ tab dưới ─► Shop (09) / Garage (08)
           ├─ tự hiện: Rank Up (12), Lootbox (14)
           └─ Play ─► Transition (02) ─► HUD (15) ─┬─ Pause (16) ─► Home / chơi tiếp
                                                    └─ chết (Endless) ─► Revive (18) ─► hết run ─► Home
```

## Lưu ý chung

- UI là **chính các canvas uGUI của bản Unity** (scene `Menu`, `HUD`, `CoreUI` và các prefab popup), port sang JS
  (`src/ugui`) và vẽ bằng WebGL, không phải DOM. Dữ liệu nằm ở `public/assets/prefabs/Scenes/*.json` và
  `public/assets/prefabs/GameObject/*.json`.
- Script UI gốc đã port (`src/uiscripts`) bật/tắt object theo tham chiếu đã serialize và theo đường dẫn tên
  (`transform.Find`). UI mới phải **giữ object gốc** và điều khiển qua component gốc (`Button`, toggle, overlay…).
- Chữ là **TextMeshPro SDF** (chữ thật, lấy nguyên văn từ I2 Localization), không phải ảnh. Icon và khung là sprite
  trong atlas WebP `public/assets/ui/ui_*.webp` (+ `public/assets/ui_extra/`).
- Bố cục gốc làm cho **điện thoại dọc**: CanvasScaler 1080×1920, chế độ Expand. Trên màn ngang 16:9 các phần tử neo
  theo mép nên bị kéo giãn (vd. danh sách Levels, thanh menu dưới, top bar dài hết màn).
- Hai màn thuộc **kit GMSDK_JS** (vẽ bằng DOM, file của kit "chép nguyên, không sửa"): Loading (01) và
  Leaderboard (11). Loading có chỗ chỉnh giao diện chính thức (`public/icons/loader.css`, ảnh `icons/loading.webp`).
- Dòng copyright + version nằm trong popup Settings (10), chữ do `src/sdk/copyright.js` sinh (không sửa nội dung).
- Nút vương miện Leaderboard trên Home do `src/portal.js` thêm vào (không có trong bản gốc).

## Các màn hình

### 01 Loading

- **Khi nào:** từ lúc mở trang tới khi menu đầu tiên hiện.
- **Thành phần:** ảnh key art (ảnh nhỏ + nền mờ cùng một file `icons/loading.webp`), tên game, thanh tiến độ + %,
  số version góc trái dưới, logo nhà phát hành góc phải dưới. Lỗi tải: thông báo + nút Reload.

### 02 Transition

- **Khi nào:** chuyển giữa Menu và màn chơi (fade đen), và khi đổi world bằng mũi tên ở Home.
- **Thành phần:** nền đen; ô lục giác "WORLD n" (WorldTransitionIndicator); hai mũi tên đổi world (WorldNav).

### 03 Home

- **Khi nào:** màn chính sau loading và sau mỗi lượt chơi.
- **Thành phần:**
  - Top bar: sao rank + thanh sao (`0 / 6 ★`), ô lục giác WORLD n ở giữa, thanh gem + thanh ruby, nút bánh răng.
  - High Score + nút vương miện (Leaderboard).
  - Nút Play lục giác ở giữa; mũi tên đổi world hai bên.
  - Nút LEVELS (trái dưới, chấm đỏ "!"), nút CHALLENGES (phải dưới, số), nút BONUS (khi đủ chữ).
  - Thanh tab dưới 5 ô: Shop, Collection (Garage), World (Home), 2 ô đang khoá; có badge số đỏ.
  - Nền: xe 3D trên đường neon của world đang chọn.
- **Bố cục mới (đã chốt, theo ảnh mẫu của người dùng):** gem + ruby góc trái trên; « WORLD n » ở giữa trên,
  High Score + nút vương miện ngay dưới; sao rank + thanh sao + BONUS và bánh răng góc phải trên; xe trên bệ đỡ
  giữa màn, nền núi neon; thanh tab dưới 5 ô: Shop, Vehicles, World, Challenges, Levels. Thêm theo yêu cầu: ô
  World đang chọn = Play (bỏ nút Play riêng), tab Garage ghi "Vehicles", bệ đỡ + nền núi (đổi cảnh 3D menu).
  Hai ô khoá (trang Settings, PLACEHOLDER) bỏ. Xem `wireframes.html#home`.

### 04 Challenges

- **Khi nào:** bấm CHALLENGES ở Home; tự mở khi có challenge vừa hoàn thành để nhận thưởng.
- **Thành phần:** tiêu đề "WORLD n CHALLENGES", "Completed x/50", tối đa 3 ô challenge (mô tả, thanh tiến độ,
  phần thưởng sao; ô khoá mở ở 4/8 lần nhận), nút X. Popup con: bỏ qua challenge (ruby / quảng cáo), xem challenge.

### 05 Levels

- **Khi nào:** bấm LEVELS ở Home.
- **Thành phần:** tiêu đề trang ("EASY LEVELS" / Moderate / Difficult), danh sách 8 level (tên, thời gian tốt nhất,
  sao), mũi tên đổi trang, tổng sao đã có, nút X tròn ở dưới. Thế giới 3D ẩn khi màn này mở.

### 06 World Stats

- **Khi nào:** bấm ô WORLD n ở top bar.
- **Thành phần:** "PROGRESS" + thanh %; nhóm ENDLESS (World Challenges x/50, High Score x/200); nhóm LEVELS
  (Easy / Moderate / Difficult ★ x/8); nhóm COLLECTION; banner world; nút X.

### 07 Reward Track

- **Khi nào:** bấm thanh sao ở top bar; tự mở sau khi lên rank để chạy tới phần thưởng mới.
- **Thành phần:** tiêu đề "STAR RANK", sao rank hiện tại → rank kế, thanh sao; danh sách các bậc rank (sao số rank,
  tên phần thưởng như "RANDOM TRAIL", icon phần thưởng, khoá), banner lớn cho xe / world / level; nút đóng.

### 08 Garage

- **Khi nào:** tab Collection ở thanh dưới.
- **Thành phần:** tên card + độ hiếm; xe 3D xem trước; 4 ô rank của card (bấm để xem trước); 5 tab loại card
  (Vehicles, Color, Trail, Landing, Explosion) có chấm đỏ; lưới card theo World 1/2/3 (tên, số bản sao `0 / 2`,
  card khoá "Unlocks in World n").

### 09 Shop

- **Khi nào:** tab Shop ở thanh dưới.
- **Thành phần:** FREE REWARDS (dải phần thưởng xem quảng cáo, giờ làm mới, "Watch n Rewarded Videos…"); CHESTS
  (Small: miễn phí / Large: 500 gem); DAILY DEALS (card bán theo ngày, làm mới bằng ruby); quà ruby hằng ngày và gói
  ruby nạp tiền (khoá "Not Available"). Popup con: xác nhận mua rương / deal, làm mới deal.

### 10 Settings

- **Khi nào:** nút bánh răng ở top bar (Menu).
- **Thành phần:** tiêu đề "SETTINGS", 3 nút lục giác bật/tắt: nhạc, âm thanh, bloom; dòng `V<version>` +
  dòng copyright; nút X.

### 11 Leaderboard

- **Khi nào:** nút vương miện cạnh High Score ở Home.
- **Thành phần (kit, DOM):** tiêu đề "Leaderboard", 4 tab (Today / This week / This month / All time), danh sách hạng
  (cờ, tên, điểm), dòng của người chơi, nút "Name & flag", nút X.

### 12 Rank Up

- **Khi nào:** đủ sao lên rank (thường ngay khi về Home sau một lượt).
- **Thành phần:** "RANK UP!", sao lớn có số rank, nền lục giác; tiếp theo là phần thưởng của rank (card, gem/ruby,
  mở level / world) và nút tiếp tục.

### 13 Claim Bonus

- **Khi nào:** bấm nút BONUS ở Home khi đã nhặt đủ 5 chữ B-O-N-U-S trong Endless.
- **Thành phần:** tiêu đề "CLAIM BONUS REWARD", ảnh gem, "+400 Gems", nút CLAIM, nút "X2 GEMS" (quảng cáo).

### 14 Lootbox

- **Khi nào:** có rương trong hàng chờ (mua ở Shop, thưởng rank, rương hằng ngày) khi đang ở Menu.
- **Thành phần:** nền lục giác, rương 3D có số card, "Tap to Open"; lật từng card (tên, độ hiếm, rank); màn tổng kết
  với nút nhận và nút xem quảng cáo lấy thêm card.

### 15 HUD

- **Khi nào:** trong lượt chơi (Endless hoặc Level).
- **Thành phần:** gem góc trái trên, điểm ở giữa trên (nhãn "NEW BEST!"), nút pause góc phải trên; thanh chữ
  B-O-N-U-S; điểm mỗi cú nhảy, lời khen ("Double Flip!", "Perfect"), popup challenge trong lượt, mốc
  HIGHSCORE/PREVIOUS trên đường. Chế độ Level: đồng hồ, tên level, sao, nút chơi lại.

### 16 Pause

- **Khi nào:** nút pause, phím Esc / P, hoặc khi tab mất focus lúc đang chơi.
- **Thành phần:** "PAUSED", 4 nút lục giác: về Home, nhạc, âm thanh, bloom; nút RESUME; challenge đang chạy (thanh
  tiến độ) ở dưới (Endless).

### 17 Tutorial

- **Khi nào:** lượt chơi đầu tiên (giữ để tăng tốc, lộn), và các hướng dẫn ở Menu (nhận challenge, level, shop,
  mở world, popup rank).
- **Thành phần:** chữ hướng dẫn ("Hold to Accelerate!"), bàn tay nhấn / di chuyển, vùng sáng quanh nút cần bấm, ảnh
  minh hoạ, chặn bấm ngoài vùng, nút tiếp tục.

### 18 Revive

- **Khi nào:** chết trong Endless khi đủ điều kiện hồi sinh (gần chữ bonus, gần kỷ lục, challenge sắp xong,
  quãng đường).
- **Thành phần:** "REVIVE?", trái tim đếm ngược 8 giây, nút CONTINUE (quảng cáo), nút trả ruby, nút X; dòng lý do
  hồi sinh; thanh ruby góc phải trên.
