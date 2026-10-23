# Sự kiện (tracking) và phân tích game

Mục tiêu: **mọi game gửi cùng một bộ sự kiện, cùng tên, cùng tham số**. Khi đó một người, hay một AI nối vào GMA qua MCP, trả lời được cùng một bộ câu hỏi cho mọi game:
- người mới bỏ đi ở bước nào;
- level nào khó, người chơi chết ở đâu, vì sao;
- người chơi thoát game ở màn nào, giữa level nào;
- item, tiền, tính năng nào được dùng, tính năng nào bị bỏ sót;
- quảng cáo thưởng được bấm ở đâu;
- **bản build mới có tốt hơn bản cũ không.**

```js
sdk.track('level_end', { level: 'forest', level_index: 1, attempt: 3, result: 'lose', progress_pct: 62, cause: 'flip' });
```

## 1. Đường đi của sự kiện

- Mọi sự kiện đi về **GMA** (`GMGameSDK`) qua `sdk.track`. Không còn Firebase, `firebaseLogEvent`, `gmEvent`, `gmStartGame` của template cũ.
- **Chỉ có GMA khi template có `gma` trong khối tuỳ chọn.** Không có thì `track` không làm gì, game vẫn chạy.
- **Gọi sớm vẫn không mất:** sự kiện gọi trước khi GMA sẵn sàng được xếp hàng (tối đa 100), rồi gửi theo thứ tự.
- **SDK tự gắn vào mọi sự kiện:**
  - **game và publisher:** `gameId` + `suffix`;
  - **phiên bản build:** `version`, dạng `yymmddXX`;
  - **một mã người chơi ẩn danh:** đặt một lần, lưu trong storage.

  Nhờ vậy GMA tách được số liệu theo người chơi, theo publisher, theo bản build. Game **không** gửi lại những thứ này.
- **Mức tracking** do API đặt theo game (`tracking_event`):

  | Mức | Gửi gì |
  | --- | --- |
  | `0` | Không gửi gì |
  | `1` | Chỉ sự kiện thời gian chơi (dấu ⏱ ở dưới) |
  | `2` (mặc định) | Gửi tất cả |

  Bộ phân tích (§4) cần mức `2`. Game cứ gọi `track` bình thường, SDK tự lọc.

## 2. SDK tự gửi: game không gửi lại

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `loaded_game` ⏱ | `loadingDone()` (một lần) | `load_time_ms` |
| `start_game` ⏱ | `gameplayStart()` đầu tiên của trang | |
| `SessionTime` ⏱ | mỗi 30 s kể từ lúc mở trang | `Time` (phút) |
| `LiveTime` ⏱ | mỗi 30 s thời gian chơi (giữa `gameplayStart` và `gameplayStop`) | `time` (phút, 0,1) |
| `ad_config` | lúc khởi động | `source`, `ad_type`, `enabled`, `preroll`, `inter_gap_s`, `reward_gap_s` |
| `ad_interstitial` | mỗi lần SDK xin quảng cáo xen giữa / preroll (lời gọi bị giãn cách chặn thì không gửi) | `placement`, `result` (`shown` / `not_shown`) |
| `ad_rewarded` | mỗi lần game gọi `rewarded()` | `placement`, `result` (`rewarded` / `not_rewarded` / `unavailable`) |
| `ad_blocked` | phát hiện bị chặn quảng cáo | `ad_type` |

## 3. Bộ chuẩn của nhà phát hành: giữ nguyên tên

Cùng tên với game Unity của nhà phát hành, để game web nằm chung báo cáo. Phân biệt hoa thường.

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `PlayGame` ⏱ | vào một ván | `GameCount`: ván thứ mấy trong phiên |
| `EndGame` ⏱ | thua / hết ván | `Score` |
| `DeathTime` ⏱ | thua | `level`, `time` (phút chơi của ván) |
| `CompleteGame` ⏱ / `CompleteTime` ⏱ | qua màn (game có màn) | `Score` / `level`, `time` |
| `RestartTime` ⏱ | chơi lại giữa ván | `level`, `time` |
| `QuitTime` ⏱ | thoát về menu giữa ván | `level`, `time` |

Thứ tự: `PlayGame` → (`LiveTime` do SDK gửi) → một trong `EndGame` / `CompleteGame` / `RestartTime` / `QuitTime`.

## 4. Bộ phân tích: bắt buộc cho mọi game

Gửi **cùng lúc** với bộ chuẩn §3, không thay thế nó. Tên `snake_case`, đúng như bảng. Mục nào game không có (ví dụ game không có tiền) thì bỏ; AI ghi `null` cho mục đó trong `analytics.json` (§6) để người phân tích biết là "không có", không phải "quên gửi".

### 4.1 Tham số chung

Gắn vào **mọi** sự kiện của bộ phân tích. Game viết một hàm `track` của mình để tự thêm:

| Tham số | Ý nghĩa | Lấy từ |
| --- | --- | --- |
| `session_index` | Lần mở game thứ mấy của người chơi này (1 = lần đầu) | Bộ đếm trong save, tăng một lần mỗi lần tải trang |
| `days_since_install` | Số ngày từ lần mở đầu tiên (0 = hôm nay) | Ngày mở đầu tiên lưu trong save |
| `progress` | Tiến độ cao nhất của người chơi: số level đã qua, hay chỉ số map xa nhất đã mở | Save |

Ba tham số này cho phép tách người mới / người cũ, người chơi sâu / người chơi nông, mà không cần ghép bảng.

### 4.2 Phiên và màn hình: thoát game ở đâu

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `session_start` | Một lần mỗi lần tải trang, sau `ready()` | `first_session` (true / false) |
| `screen_view` | Mỗi lần đổi màn: menu, shop, chọn level, chơi, pause, kết quả, settings… | `screen`, `from` (màn trước) |
| `app_hidden` | Tab bị ẩn hay đóng (`visibilitychange` → `hidden`) | `screen`, `level` (nếu đang chơi), `playing` (true / false) |

- **Màn thoát game** = `screen_view` cuối cùng của một phiên.
- `app_hidden` là tín hiệu phụ: trình duyệt có thể đóng trước khi kịp gửi, nên không bắt buộc phải tới nơi.
- Tên màn (`screen`) lấy từ danh sách `screens` của `analytics.json`, không đặt tuỳ tiện.

### 4.3 Người mới: phễu phiên đầu

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `onboarding_step` | Người chơi lần đầu tới mỗi bước của phễu. **Mỗi bước gửi một lần trong đời người chơi** (đánh dấu trong save) | `step` (1, 2, 3…), `step_name` |
| `tutorial_step` | Mỗi bước hướng dẫn hiện ra, được làm xong, hay bị bỏ qua | `tutorial`, `step`, `step_name`, `action` (`shown` / `done` / `skipped`) |

- Các bước của phễu khai trong `analytics.json` → `onboarding`, theo [UX.md §2](UX.md). Ví dụ: `menu_shown` → `first_play` → `first_input` → `first_end` → `second_play` → `first_feature` → `first_purchase`.
- **Người mới rời ở đâu** = bước có tỉ lệ người chơi rớt lớn nhất so với bước ngay trước.

### 4.4 Level: chơi tới đâu, chết ở đâu, vì sao

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `level_start` | Bắt đầu một level / ván | `level`, `level_index`, `attempt`, `mode` (nếu game có nhiều chế độ) |
| `level_end` | **Mọi** cách kết thúc level | `level`, `level_index`, `attempt`, `result`, `duration_s`, `progress_pct` hoặc `distance_bucket`, `score`, `score_bucket`, `cause` (khi thua), `revived`, `stars` (nếu có) |
| `death` | Chỉ khi một level có nhiều lần chết (game có mạng, có hồi sinh ở checkpoint) | `level`, `cause`, `progress_pct`, `lives_left` |
| `checkpoint` | Tuỳ chọn, cho level dài: qua mỗi mốc | `level`, `checkpoint` |

- **`result`:**

  | Giá trị | Khi nào |
  | --- | --- |
  | `win` | Qua level |
  | `lose` | Thua |
  | `quit` | Thoát giữa chừng về menu |
  | `restart` | Chơi lại giữa chừng |

  Mỗi `level_start` có đúng một `level_end`. Tab đóng giữa level thì không có `level_end`; khi đó `app_hidden` với `playing: true` cho biết người chơi bỏ đi giữa level.
- **`level`:** id ổn định, không đổi giữa các bản build (`forest`, `w1_l3`). **`level_index`:** số thứ tự để sắp xếp (1, 2, 3…).
  - Game vô tận không có level: `level` là map hay chế độ đang chơi; tiến độ đo bằng `distance_bucket`.
- **`attempt`:** lần thử thứ mấy của **level đó**, đếm trong save. `attempt` cao trước lần `win` đầu tiên là dấu hiệu level khó.
- **`cause`:** lý do thua, lấy từ danh sách `causes` trong `analytics.json` (`flip`, `spike`, `timeout`, `fall`…). Đây là cột quan trọng nhất để biết sửa gì.
- **`progress_pct`:** 0–100, phần trăm level đã đi được lúc kết thúc. Chết dồn ở một khoảng phần trăm nghĩa là có một đoạn quá khó.

### 4.5 Tiền và item: dùng gì, mua gì

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `currency_earn` | Mỗi lần **nhận** tiền | `currency`, `amount`, `source` (`level`, `mission`, `daily`, `ad_reward`…) |
| `currency_spend` | Mỗi lần **tiêu** tiền | `currency`, `amount`, `sink` (`bike`, `upgrade`, `skin`…), `item` |
| `item_get` | Có item mới | `item_type`, `item`, `method` (`buy` / `reward` / `unlock` / `gift`), `price`, `currency` |
| `item_equip` | Chọn / mặc / trang bị item | `item_type`, `item` |
| `item_use` | Dùng item tiêu hao (booster, power-up) | `item_type`, `item`, `level`, `count` |

- **Tiền nhặt trong level không gửi từng đồng:** cộng lại, gửi **một** `currency_earn` với `source: 'level'` lúc `level_end`.
- **Item dùng nhiều lần trong một level:** gửi một `item_use` cho mỗi loại item lúc `level_end`, với `count`.
- **Cân bằng kinh tế** = tổng `currency_earn` so với tổng `currency_spend`, theo `source` / `sink` và theo `progress`.

### 4.6 Tính năng: có bị bỏ sót không

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `feature_unlock` | Tính năng mở cho người chơi (đủ level, đủ ngày…) | `feature` |
| `feature_open` | Người chơi mở tính năng | `feature`, `from` (màn / nút dẫn vào), `first` (true lần đầu) |
| `feature_action` | Hành động chính trong tính năng: nhận quà, nâng cấp, đổi skin… | `feature`, `action`, `item` (nếu có) |

- `feature` lấy từ danh sách `features` của `analytics.json`, cũng là bảng tính năng trong [UX.md §5](UX.md).
- **Tính năng bị bỏ sót** = tỉ lệ người chơi có `feature_open` (`first: true`) chia cho người chơi có `feature_unlock` thấp bất thường.
- Thay cho `feature_first_use` cũ: dùng `feature_open` với `first: true`.

### 4.7 Quảng cáo thưởng, cài đặt, lỗi

| Sự kiện | Khi nào | Tham số |
| --- | --- | --- |
| `ad_offer` | Nút quảng cáo thưởng **hiện** cho người chơi (một lần mỗi lần nút xuất hiện) | `placement`, `level` |
| `setting_change` | Người chơi đổi một cài đặt | `setting` (`music`, `sfx`, `language`…), `value` |
| `error` | Lỗi JS không bắt được (`window.onerror`, `unhandledrejection`) | `where`, `message` (≤ 100 ký tự) |
| `load_error` | Tải file thất bại sau khi đã thử lại | `file`, `tries` |

**Phễu quảng cáo thưởng:**

| Bước | Lấy từ |
| --- | --- |
| Thấy nút | `ad_offer` |
| Bấm | `ad_rewarded` (SDK gửi, mọi `result`) |
| Xem xong | `ad_rewarded` với `result: 'rewarded'` |

## 5. Sự kiện riêng của game

Thêm khi bộ §4 chưa đủ để trả lời một câu hỏi về game này, ví dụ `run_end` có `wheelie_m`, `mission_complete`, `daily_claim`.
- Mỗi sự kiện riêng có mặt trong `analytics.json` → `custom` (AI sinh, §6): tên, lúc gửi, ý nghĩa từng tham số. Không có thì người phân tích không đọc được.
- Không đặt tên trùng hay gần trùng bộ §4. Dữ liệu là `level_end` thì gửi `level_end` (thêm tham số nếu cần), không đặt `stage_finish`.

## 6. AI tự gắn, rồi sinh `analytics.json`

Không ai viết tay phần tracking. AI làm theo quy trình dưới đây khi gắn SDK, nâng cấp kit hay làm game mới. Xong việc, nó **sinh ra** `analytics.json` để mô tả đúng những gì đã gắn.

### 6.1 Quy trình

1. **Đọc code, tìm những thứ có trong game** (bảng §6.2): level / map, các màn, điều kiện thua, tiền, shop, item, tính năng, chỗ đặt quảng cáo, cài đặt, hướng dẫn.
2. **Đặt id cho từng thứ:** chữ thường `snake_case`, theo id sẵn có trong code nếu có (`forest`, `bike_3`); id đã gửi lên GMA thì giữ nguyên.
3. **Viết một module tracking của game** (ví dụ `src/analytics/`):
   - mọi id nằm trong một chỗ (hằng số hay enum);
   - một hàm `track` tự gắn tham số chung §4.1;
   - các hàm theo sự kiện (`levelStart`, `levelEnd`, `screenView`…). Code của game chỉ gọi các hàm này, không gọi `sdk.track` rải rác.
4. **Gọi các hàm đó ở đúng chỗ** theo bảng §6.2. Giữ bộ chuẩn §3. Sự kiện cũ trùng nghĩa với §4 thì đổi sang tên §4; sự kiện riêng còn lại thành `custom` (§5).
5. **Sinh `analytics.json`** từ chính các id và sự kiện vừa gắn, theo khoá ở §6.3. Mẫu định dạng: [analytics.example.json](../analytics.example.json). Chọn `kpis` hợp với game (§7.2).
6. **Kiểm:**
   - test của module tracking: mỗi hàm gửi đúng tên, đủ tham số chung, không quá 25 tham số;
   - chơi theo kịch bản §9;
   - `npm run build`: `check-export` không còn cảnh báo về tracking.
7. **Báo cáo:** liệt kê sự kiện đã gắn, ở đâu; mục nào của §4 game không có (ghi `null` trong `analytics.json`) và vì sao.

Mỗi lần sau thêm level, item, tính năng hay màn mới: gắn sự kiện và sinh lại `analytics.json` **trong cùng commit**.

### 6.2 Trong code có → gắn sự kiện

| Trong code có | Gắn | Vào `analytics.json` |
| --- | --- | --- |
| Lúc tải xong, mỗi lần mở game | `session_start` | |
| Scene / màn hình / panel toàn màn | `screen_view` mỗi lần đổi | `screens` |
| `visibilitychange` | `app_hidden` | |
| Luồng phiên đầu ([UX.md §2](UX.md)): menu, ván đầu, input đầu, hết ván đầu… | `onboarding_step` một lần mỗi bước | `onboarding` |
| Lớp hướng dẫn, gợi ý một lần ([UX.md §3](UX.md)) | `tutorial_step` | `tutorials` |
| Dữ liệu level / map / chế độ | `level_start`, `level_end` | `levels` |
| Điều kiện thua (va chạm, rơi, hết giờ, hết mạng) | `cause` của `level_end`; `death` nếu một level chết nhiều lần | `causes` |
| Chỗ cộng / trừ tiền | `currency_earn`, `currency_spend` | `currencies`, `sources`, `sinks` |
| Shop, phần thưởng, mở khoá item | `item_get`; chọn / trang bị: `item_equip` | `item_types` |
| Booster, power-up dùng trong level | `item_use` (cộng dồn, gửi lúc `level_end`) | `item_types` |
| Nút / panel của tính năng, điều kiện mở khoá | `feature_unlock`, `feature_open`, `feature_action` | `features` |
| Chỗ gọi `rewarded()` / `interstitial()` | `ad_offer` khi nút thưởng hiện | `ad_placements` |
| Chỗ đổi âm lượng, ngôn ngữ… | `setting_change` | `settings` |
| `window.onerror`, tải file thất bại | `error`, `load_error` | |
| Sự kiện cũ không thuộc bộ §4 | Giữ, là sự kiện riêng | `custom` |

### 6.3 Khoá của `analytics.json`

File `docs/GMSDK_JS/analytics.json`, cạnh `config.json`. Người phân tích, hay AI nối GMA qua MCP, đọc nó **trước** khi xem số liệu: game có level, màn, item, tính năng, lý do thua nào; từng sự kiện riêng nghĩa là gì.

| Khoá | Nội dung |
| --- | --- |
| `levels` | `kind`: `levels` (có màn), `endless` (vô tận), `none`; `list`: `{ id, index, name }` theo thứ tự; `progress`: `progress_pct` hay `distance_bucket` |
| `screens` | Tên mọi màn dùng trong `screen_view` |
| `onboarding` | Các bước của phễu phiên đầu, đúng thứ tự (`step_name`) |
| `tutorials` | Mỗi hướng dẫn và các bước của nó |
| `causes` | Mọi lý do thua, kèm mô tả ngắn |
| `currencies`, `sources`, `sinks` | Loại tiền, nguồn nhận, chỗ tiêu; `null` nếu game không có tiền |
| `item_types` | Loại item và id của chúng (hoặc quy tắc đặt id, ví dụ `bike_<n>`) |
| `features` | `{ id, unlock }`: tính năng và điều kiện mở. Trùng với bảng tính năng [UX.md §5](UX.md) |
| `ad_placements` | Mọi `placement` của quảng cáo, kèm ý nghĩa |
| `settings` | Các `setting` của `setting_change` |
| `custom` | Sự kiện riêng: `{ name, when, params: { tên: ý nghĩa } }` |
| `kpis` | Các chỉ số nên theo dõi cho game này, chọn trong §7.2 |

- Id đã gửi lên GMA thì **không đổi tên**. Đổi tên làm đứt số liệu giữa các bản build; muốn bỏ thì thôi gửi, không dùng lại id cũ cho thứ khác.
- `check-export` kiểm file này: đúng JSON, đủ khoá, tên đúng luật §8, sự kiện riêng không quá 25 tham số. Nó cũng cảnh báo khi `game.js` không có tên của một sự kiện bắt buộc hay sự kiện `custom`, tức là có thứ khai mà chưa gắn.

## 7. Phân tích và đánh giá cải thiện qua GMA

Phần này viết cho người phân tích, hay AI nối GMA qua MCP. Dùng nó **cùng với** `analytics.json` của game.

### 7.1 Câu hỏi → cách tính

| Câu hỏi | Sự kiện | Cách tính |
| --- | --- | --- |
| Người mới rời ở bước nào? | `onboarding_step` | Số người chơi khác nhau ở mỗi `step`, chia cho số ở `step` 1. Bước có mức rớt lớn nhất là chỗ cần sửa |
| Level nào khó? | `level_end` | Theo `level`: tỉ lệ `lose`; `attempt` trung bình lúc `win` lần đầu; `duration_s` trung bình |
| Chết ở đâu, vì sao? | `level_end` `result: 'lose'`, `death` | Theo `level` × `cause` × khoảng `progress_pct` (0–9, 10–19…) |
| Bỏ dở giữa level ở đâu? | `level_end` `result: 'quit'`, `app_hidden` `playing: true` | Theo `level` và `progress_pct` |
| Thoát game ở màn nào? | `screen_view` | `screen` của `screen_view` cuối cùng mỗi phiên |
| Người chơi đi sâu tới đâu? | `level_start`, `progress` | Phân bố `level_index` cao nhất của mỗi người chơi; tỉ lệ người chơi tới level 5, 10, 20 |
| Item / tiền dùng thế nào? | `currency_*`, `item_*` | Kiếm và tiêu theo `source` / `sink`; item mua nhiều nhất; item không ai mua |
| Tính năng nào bị bỏ sót? | `feature_unlock`, `feature_open` | Tỉ lệ mở trên số đã mở khoá, theo `feature` |
| Quảng cáo thưởng ở đâu hiệu quả? | `ad_offer`, `ad_rewarded` | Theo `placement`: bấm / thấy, xem xong / bấm |
| Game có lỗi không? | `error`, `load_error` | Số lỗi trên 100 phiên, theo `message` / `file` |
| Người chơi ở lại bao lâu? | `SessionTime`, `session_start` | Phút mỗi phiên; số phiên mỗi người chơi; tỉ lệ có phiên ở `days_since_install` 1, 7 |

### 7.2 Chỉ số chính (KPI)

| KPI | id (`analytics.json` → `kpis`) | Định nghĩa |
| --- | --- | --- |
| Hoàn thành phiên đầu | `onboarding_complete` | % người mới tới bước cuối của `onboarding` |
| Qua level 1 | `level_1_win` | % người chơi có `level_end` `win` ở `level_index` 1 |
| Độ sâu | `depth` | % người chơi tới `level_index` 5 / 10 (game vô tận: tới mốc `distance_bucket`) |
| Bỏ dở giữa level | `level_quit` | % `level_end` có `result: 'quit'` |
| Phút mỗi phiên | `session_minutes` | Trung bình `SessionTime` cuối của mỗi phiên |
| Quay lại | `return_rate` | % người chơi có `session_start` với `days_since_install` ≥ 1 |
| Dùng tính năng | `feature_use` | Với mỗi tính năng: % mở trên số đã mở khoá |
| Nhận quảng cáo thưởng | `rewarded_take` | % `ad_rewarded` `rewarded` trên số `ad_offer` |
| Lỗi | `error_rate` | Số `error` trên 100 phiên |

### 7.3 Đánh giá một bản cải thiện

1. **Chọn một KPI** (§7.2) và nêu giả thuyết. Ví dụ: "level 3 có 70 % người chơi chết ở 40–50 % vì `spike`; dời spike ra xa thì tỉ lệ qua level 3 tăng".
2. **Chỉ đổi đúng một thứ** cho giả thuyết đó, rồi build bản mới; `version` tăng theo `yymmddXX`.
3. **So sánh hai `version`** trên cùng KPI, cùng publisher, cùng loại người chơi. Ví dụ chỉ người mới (`session_index` = 1) hay cùng khoảng `progress`.
4. **Mỗi bản cần đủ mẫu:** tối thiểu khoảng 500 người chơi khác nhau. Ít hơn thì chờ thêm.
5. **Ghi kết quả vào báo cáo:** KPI trước và sau, số người chơi, có giữ thay đổi không.

## 8. Luật đặt tên và tần suất

| | Giới hạn |
| --- | --- |
| Tên sự kiện | ≤ 40 ký tự. Bộ §4 và sự kiện riêng dùng `snake_case`. Bộ chuẩn §3 giữ đúng tên (phân biệt hoa thường) |
| Tên tham số | ≤ 40 ký tự, `snake_case` |
| Giá trị chuỗi | ≤ 100 ký tự |
| Số tham số | ≤ 25 mỗi sự kiện, kể cả tham số chung §4.1. SDK cắt phần thừa |

- Chi tiết đặt vào **tham số**, không đặt vào tên: `level_end { level: 'w1_l3' }`, không phải `level_w1_l3_end`.
- Id (level, item, tính năng, màn, lý do) là chữ thường `snake_case`, ổn định giữa các bản build.
- Số liên tục (điểm, khoảng cách) gửi kèm một bản chia khoảng (`score_bucket`, `distance_bucket`) để dễ đếm:

```js
const scoreBucket = (s) => (s < 100 ? '0-99' : s < 500 ? '100-499' : s < 1000 ? '500-999' : s < 5000 ? '1000-4999' : '5000+');
```

- **Không gửi mỗi frame:**
  - gửi theo mốc: đổi màn, bắt đầu / hết level, mua, mở tính năng;
  - việc lặp nhiều lần trong level (nhặt xu, dùng power-up): cộng dồn, gửi một lần lúc `level_end`;
  - trung bình không quá **1 sự kiện mỗi 5 giây chơi**.
- Không gửi dữ liệu cá nhân (tên người chơi tự đặt, email…).

## 9. Kiểm tra

- **Xem sự kiện:** thêm `?debug` vào URL (hoặc `debug: true` trong khối tuỳ chọn), console in mọi lần `[gmsdkjs] track <tên> <tham số>`.
- **Gửi thật lên GMA:** trang dev có `gma: null` thì không gửi. Muốn thử: đặt `gma: { host: 'https://gma.readyplayer1.xyz', suffix: '-1games' }` với `gameId` thật.
- **Chơi một vòng có kịch bản**, đối chiếu console với bảng dưới:

| Bước chơi | Sự kiện phải thấy |
| --- | --- |
| Mở game lần đầu (xoá save trước) | `session_start` `first_session: true`, các `onboarding_step` đầu |
| Đổi qua mọi màn | `screen_view` từng màn, `screen` có trong `analytics.json` |
| Thua một level | `level_start` → `level_end` `lose` có `cause`, `progress_pct` |
| Qua một level | `level_end` `win` |
| Thoát giữa level | `level_end` `quit` |
| Chơi lại giữa level | `level_end` `restart` |
| Mua một món | `currency_spend` + `item_get` |
| Mở từng tính năng | `feature_open`, lần đầu có `first: true` |
| Gặp nút quảng cáo thưởng | `ad_offer`, rồi `ad_rewarded` khi bấm |
| Đổi âm lượng / ngôn ngữ | `setting_change` |

- Mỗi sự kiện có đủ `session_index`, `days_since_install`, `progress`; không quá 25 tham số. Mỗi `level_start` có đúng một `level_end`.
