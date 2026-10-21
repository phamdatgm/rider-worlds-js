# Log sự kiện lên Analytics

Từ lúc nạp SDK đến lúc sự kiện hiện trên Firebase. **Copy `template/analytics.js` vào
`src/services/` là chạy** — phần còn lại của file này giải thích nó đi đâu và nên log gì.

---

## 1. Sự kiện đi đâu

```
analytics.log('run_end', { score: 42 })
      │
      ▼
window.firebaseLogEventParameter(name, params)      ← vỏ portal định nghĩa
      ├── firebase.analytics().logEvent(name, params)
      └── GMGameSDK.trackEventParams(name, params)
```

Hai hàm `firebaseLogEvent` / `firebaseLogEventParameter` **do vỏ portal chèn vào**, không
phải do game viết. `tools/build.mjs` dán chúng vào cuối `<body>` khi đóng gói.

### Phần GỌI và phần NHẬN là hai chuyện khác nhau

Hai hàm trên là phần **GỌI**. Chúng vô dụng nếu không có phần **NHẬN**:

| Script | Cho cái gì | Ai nạp |
|---|---|---|
| `gm-sdk.js` (v3) | định nghĩa `GMGameSDK` | **vỏ build** |
| `gm-iframe.js` | bắt tay với trang portal | **vỏ build** |
| `firebase-*-compat.js` + `initializeApp` | nhánh Firebase | **vỏ build**, nếu `config.firebase` có |
| `GMGameSDK.init(...)` | bật `_initialized`, đặt `_baseUrl` | **vỏ build** |
| `gmsdkv2.js` | **quảng cáo + More Games. KHÔNG dính analytics.** | vỏ build |

**`gmsdkv2.js` không định nghĩa `GMGameSDK`.** Giải bảng chuỗi của nó ra: không có
`trackEvent`, không có `GMGameSDK`, không có `firebase`. Nó là SDK quảng cáo.

Từng có một bản kit chỉ nhúng `gmsdkv2.js` rồi vẫn khai báo hai hàm gọi ở trên. Hậu quả, một
đội khác gặp trong production: `firebaseLogEventParameter` chạy, `isFirebaseReady()` false,
`GMGameSDK` ném `ReferenceError` vào `catch {}`, hàm trả về bình thường, **console sạch, 0
request, mất 100% dữ liệu, không một dấu hiệu nào.** Bản Unity không dính vì template
`gmsoft-v9` nhúng đủ cả — đó đúng là lý do game Unity có số liệu còn game JS thì không.

Vỏ của kit **bây giờ nhúng đủ**. Nhưng nếu bạn tự viết vỏ, hoặc dùng bản kit cũ, thì phải tự
thêm — và **không có cách nào biết là thiếu ngoài việc mở Network ra nhìn**.

**`GMGameSDK.init()` là bắt buộc**, không chỉ nạp script là xong: `_enqueue()` thoát sớm khi
`_initialized` còn false, nên mọi sự kiện log trước `init()` **bị bỏ, im lặng**.

Bản Unity đi **đúng đường này**: `Firebase.Analytics.LogEvent` → `firebaseanalytics.jslib`
→ cùng hai hàm đó. Nên game JS và game Unity cùng một portal sẽ nằm chung báo cáo.

**Ngoài portal** (dev server, mở build bằng server tĩnh) hai hàm đó không tồn tại.
`analytics.js` khi ấy gọi thẳng `GMGameSDK.trackEvent*` nếu SDK đã nạp, còn không thì chỉ
in ra console. **Không bao giờ ném lỗi vào game** — analytics hỏng không được phép làm sập
game.

### Hai nhánh ĐỘC LẬP với nhau

Mỗi nhánh có `try/catch` riêng. GMSDK hỏng thì nhánh Firebase vẫn chạy, và ngược lại. Nhưng
chúng **không dự phòng cho nhau** — không có chuyện "SDK chết thì tự nhảy sang Firebase".
Đường nào có mặt trên trang thì đường đó chạy, thế thôi:

| Trên trang có | Kết quả |
|---|---|
| Firebase **và** GMSDK | lên cả hai nơi |
| chỉ **Firebase** | ✅ lên Firebase — **không cần SDK** |
| chỉ **GMSDK** | lên `gm.azgame.io` |
| **không có gì** | ❌ sự kiện biến mất, **im lặng tuyệt đối** |

Dòng cuối là cái bẫy. Không lỗi, không cảnh báo, console sạch — mà không có gì tới server.
**"Không thấy lỗi" KHÔNG phải bằng chứng dữ liệu đã lên.**

Kiểm bằng một dòng trong console:

```js
typeof firebase !== 'undefined' && firebase.apps?.length > 0   // nhánh Firebase sống?
typeof GMGameSDK !== 'undefined'                               // nhánh GMSDK sống?
```

Cả hai `false` → code log có đúng đến mấy cũng vô nghĩa.

**Vỏ portal KHÔNG nạp Firebase.** Nó chỉ *gọi* nếu Firebase đã có sẵn do trang ngoài nạp.
Muốn chắc chắn có nhánh Firebase thì tự thêm thẻ script + `firebase.initializeApp(...)` —
**không phải sửa một dòng nào trong game**, vì `analytics.js` gọi qua hàm toàn cục.

---

## 2. Gắn vào dự án mới

**1. Copy cả thư mục `sdk/`**

```
JS_SDK_2.0/sdk/  →  src/sdk/       (gmsdk.js + portal.js + analytics.js, đi cùng nhau)
```

**2. Khai báo danh tính** — trong `index.html`, script inline **đầu tiên**:

```html
<script>
  window.GM_GAME = { id: 'ten-game', version: 'dev' };
  window.GM_LOAD_START = performance.now();   // mốc đo thời gian tải
</script>
```

`version` được bước build thay bằng số version thật. `GM_LOAD_START` phải đặt ở script đầu
tiên thì mới tính được cả trang.

**3. Khởi động tầng SDK, rồi log**

```js
import { analytics, startAnalytics } from './sdk/analytics.js';

await startAnalytics();   // bù global còn thiếu + nạp gm-sdk.js + GMGameSDK.init()

analytics.setUser({ version: GM_GAME.version, device: isMobile ? 'mobile' : 'desktop' });
analytics.log('loaded_game', {
  load_time_ms: Math.round(performance.now() - (window.GM_LOAD_START ?? 0)),
});
```

**`startAnalytics()` phải chạy TRƯỚC sự kiện đầu tiên.** `_enqueue()` của SDK thoát sớm khi
`_initialized` còn false — mọi thứ log trước init bị bỏ, không một tiếng động.

**4. Khi nghi ngờ:**

```js
import { diagnose } from './sdk/gmsdk.js';
diagnose();      // in ra ✓/✗ từng mắt xích, và cảnh báo nếu không còn đường nào sống
```

Mở với `?debug` thì `startAnalytics()` tự gọi `diagnose()`.

---

## 3. Luật đặt tên — đọc trước khi nghĩ ra sự kiện

Firebase đếm theo **TÊN** sự kiện và giới hạn **500 tên mỗi project**. Hết là hết, không
xin thêm được.

> **Chi tiết đi vào THAM SỐ, không đi vào tên.**

```js
analytics.log(`player_die_${blockName}`, ...);        // ✗ 28 tên cho 28 miếng địa hình
analytics.log('run_end', { block: blockName, ... });  // ✓ một tên, lọc theo tham số
```

Giới hạn còn lại (`analytics.js` tự cắt, nhưng biết vẫn hơn):

| | Giới hạn |
|---|---|
| tên sự kiện | 40 ký tự, `snake_case` |
| tên tham số | 40 ký tự |
| giá trị chuỗi | 100 ký tự |
| số tham số / sự kiện | 25 |

**Số nguyên tự do thì Firebase bản miễn phí không vẽ được phân bố.** Gửi kèm cả số thật lẫn
khoảng — `scoreBucket()` trong `analytics.js` làm việc đó:

```js
analytics.log('run_end', { score, score_bucket: scoreBucket(score) });
```

---

## 4. Bộ sự kiện chuẩn của nhà phát hành

Bản Unity có sẵn `GMAnalyticsTracker` gửi bộ tên này. **Game JS nên gửi cùng bộ** thì mới
đứng chung báo cáo với các game Unity của họ:

| Sự kiện | Khi nào | Tham số |
|---|---|---|
| `loaded_game` | tải xong, menu hiện ra | `load_time_ms` |
| `PlayGame` | vào một ván | `GameCount` — ván thứ mấy trong phiên |
| `LiveTime` | mỗi 30 giây gameplay | `level`, `time` (phút tích luỹ) |
| `SessionTime` | mỗi 30 giây kể từ khi mở | `Time` (phút) |
| `EndGame` | thua | `Score` |
| `DeathTime` | thua | `level`, `time` |
| `CompleteGame` / `CompleteTime` | qua màn (game có màn) | `Score` / `level`, `time` |
| `RestartTime` | bấm chơi lại giữa ván | `level`, `time` |
| `QuitTime` | thoát về home giữa ván | `level`, `time` |

Thứ tự gọi: `PlayGame` → (`LiveTime` lặp) → một trong `EndGame` / `CompleteGame` /
`QuitTime` / `RestartTime`.

**Thêm sự kiện của riêng game** bên cạnh bộ trên, đừng thay thế. Ví dụ một game endless:

| Sự kiện | Trả lời câu hỏi gì |
|---|---|
| `run_start` | bao nhiêu người tải xong rồi bỏ, không chơi ván nào |
| `run_end` | chết ở đâu, chết vì gì, ở mức điểm nào, chơi bao lâu |
| `leaderboard_submit` | điểm có lên bảng không, không thì vì sao |
| `error` | có lỗi nào đang âm thầm hỏng không |

---

## 5. Mẫu đầy đủ

```js
import { analytics, scoreBucket } from './services/analytics.js';

// ---- vào game -------------------------------------------------------------
analytics.setUser({ version: GM_GAME.version, device });
analytics.log('loaded_game', {
  load_time_ms: Math.round(performance.now() - window.GM_LOAD_START),
});

// ---- vào ván --------------------------------------------------------------
let runIndex = 0, runStartedAt = 0;

function startRun() {
  runIndex++;
  runStartedAt = performance.now();
  analytics.log('PlayGame', { GameCount: runIndex });
  analytics.log('run_start', { run_index: runIndex });
}

// ---- kết ván --------------------------------------------------------------
function endRun(score, cause, where) {
  analytics.log('EndGame', { Score: score });
  analytics.log('run_end', {
    score,
    score_bucket: scoreBucket(score),
    cause,                       // 'death' | 'fallout' | …
    where,                       // màn / miếng địa hình / vật cản
    duration_s: Math.round((performance.now() - runStartedAt) / 100) / 10,
    run_index: runIndex,
  });
}

// ---- lỗi ------------------------------------------------------------------
window.addEventListener('error', (e) => {
  analytics.log('error', { where: 'window', message: e?.message ?? '' });
});
window.addEventListener('unhandledrejection', (e) => {
  analytics.log('error', { where: 'promise', message: e?.reason?.message ?? String(e?.reason) });
});
```

---

## 6. Kiểm tra là nó thật sự lên

**Dev server** — mở console, sẽ thấy:

```
[analytics] loaded_game { load_time_ms: 2431 }
```

Chỉ chứng minh game **gọi đúng**, chưa chứng minh dữ liệu lên tới Firebase.

**Trên portal** — mở DevTools → Network, và biết mình đang tìm cái gì:

| Nhánh | Request |
|---|---|
| GMSDK | `POST https://<sdk-host>/api/v1/events`, `Content-Type: application/x-msgpack` |
| Firebase | `google-analytics.com/g/collect` |

Nhánh GMSDK **gom lô**: hàng đợi flush mỗi **5 giây** (`FLUSH_INTERVAL` trong `gm-sdk.js`),
cộng `navigator.sendBeacon` lúc `pagehide`. Nên **một request chứa nhiều sự kiện**, payload
nhị phân, đừng chờ mỗi `analytics.log()` một dòng trong Network.

**Bộ đếm 5 giây chỉ chạy sau `_startTelemetry()`**, mà cái đó chỉ được gọi khi consent =
granted. Chưa có consent thì **chỉ `pagehide` mới đẩy** — ngồi nhìn 75 giây không thấy nhịp
nào là đúng như thế, không phải doc sai.

Không thấy request nào thì xem lại bảng bốn trường hợp ở mục 1 trước khi nghi code.

**Trong code** — `analytics.sent` là mảng mọi sự kiện đã gửi trong phiên, để test tự động
đọc lại:

```js
expect(analytics.sent.map((e) => e.name)).toContain('run_end');
```

**Firebase Console** — realtime hiện sau vài phút; báo cáo đầy đủ trễ **tới 24 giờ**. Đừng
kết luận "không có dữ liệu" trong ngày đầu.

---

## 7. Những chỗ dễ sai

**`firebaseSetUserProperties` chưa có trong vỏ portal.** Vỏ chỉ định nghĩa
`firebaseLogEvent` và `firebaseLogEventParameter`. `analytics.setUser()` gọi vẫn an toàn
(try/catch nuốt) nhưng **không đi đâu cả**. Hai lựa chọn:

- gửi kèm vào tham số của từng sự kiện (chắc ăn), hoặc
- thêm shim vào vỏ portal:

```js
function firebaseSetUserProperties(props) {
  try { if (isFirebaseReady()) firebase.analytics().setUserProperties(props); } catch (e) {}
}
```

**Đừng log trong vòng lặp game.** Mỗi sự kiện là một request. Cần đo liên tục thì gộp lại
rồi gửi theo mốc — như `LiveTime` gửi mỗi 30 giây, không phải mỗi frame.

**`loaded_game` nên bắn lúc người chơi THẬT SỰ thấy menu**, không phải lúc code chạy xong.
Nếu màn loading còn chờ giải mã ảnh và font thì bắn sau khi chờ xong — không thì con số đo
được đẹp hơn trải nghiệm thật.

**Tên sự kiện có phân biệt hoa thường.** `PlayGame` và `playgame` là hai tên khác nhau, và
mỗi cái ăn một suất trong 500.
