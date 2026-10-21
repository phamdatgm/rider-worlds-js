# Nút More Games

Nút chéo kênh ở menu: bấm vào thì mở trang của nhà phát hành trong tab mới.

**Thứ duy nhất không suy ra được là `gid`.** Phần còn lại của tài liệu này chỉ để bạn khỏi mất
buổi chiều đi tìm hiểu vì sao sửa mãi mà URL không đổi.

---

## 1. Cái phải đi hỏi

URL của Slope Rush là:

```
https://azgames.io/?gid=G151
```

`G151` là **mã giới thiệu do nhà phát hành cấp cho từng game**. Nó là thứ ghi công lượt click
về đúng game của bạn. Không có công thức nào sinh ra nó, không suy được từ `gameId`, không có
trong API nào của SDK — trong cả repo này nó xuất hiện đúng **hai chỗ**, và cả hai đều do người
gõ tay vào:

```
Slope/Assets/Scenes/MainGame.unity:1725      url: https://azgames.io/?gid=G151
SlopeJS/src/ui/moreGamesButton.js:22         const DEFAULT_MORE_GAMES_URL = '...'
```

Nên với game mới: **hỏi bên vận hành portal `gid` của game này**, giống hệt cách phải hỏi
`gameId`, `leaderboardId` và `signDomain`. Đoán sai thì nút vẫn chạy, trang vẫn mở, chỉ là
lượt giới thiệu chạy sang game khác — hỏng mà không một dấu hiệu nào.

---

## 2. URL được quyết bởi ai

Hai nguồn, portal thắng:

```
window.GMSOFT_GAME_INFO.more_games_url     ← portal điền lúc chạy; THẮNG nếu không rỗng
DEFAULT_MORE_GAMES_URL                     ← chuỗi có gid trong src/ui/moreGamesButton.js
```

`GMSOFT_GAME_INFO` **không phải của game**, mà do **trang bọc của portal** đặt vào trước khi
game khởi động. Trang bọc mẫu của Unity khai báo nó rỗng:

```js
// Slope/Assets/WebGLTemplates/gmsoft-v9/index.html:160
window.GMSOFT_GAME_INFO = { allow_play: "yes", more_games_url: "" };
```

**Hệ quả quan trọng cho lúc test:** trên dev server và trên mọi trang không phải portal,
`more_games_url` LUÔN rỗng, nên thứ bạn thấy LUÔN là chuỗi fallback có `gid`. Không thể thử
nhánh portal ở máy — muốn thử thì tự đặt biến, xem mục 5.

---

## 3. Khi nào nút bị ẩn

Đúng một trường hợp: **portal CrazyGames cấm chéo kênh**.

```js
window.GMSOFT_SDKTYPE === 'crazy'   →   nút display:none
```

Kiểm lúc dựng nút và mỗi lần menu hiện ra lại (`MoreGamesButton.refresh`, gọi từ
`gameUi.js` khi state về `menu` — đúng chỗ Unity gọi `OnEnable`).

Ngoài crazy ra thì nút **luôn hiện**, vì URL không bao giờ rỗng: hết portal thì còn fallback.

---

## 4. Cài cho một game mới

**Bước 1 — xin `gid`**, rồi sửa đúng một dòng:

```js
// src/ui/moreGamesButton.js
const DEFAULT_MORE_GAMES_URL = 'https://azgames.io/?gid=Gxxx';
```

> Dòng này hiện nằm trong mã game chứ không nằm trong `JS_SDK_2.0/config.mjs`, vì nó đi kèm nút
> chứ không đi kèm SDK. Muốn gom về config cho gọn thì được — chỉ cần đổi một chỗ đọc.

**Bước 2 — nút phải có trong cây UI đã export, tên đúng là `MoreGames`.** Mã tìm nó bằng tên:

```js
// src/ui/gameUi.js
const moreGames = this._findNode(this._trees.menu, 'MoreGames')?._el;
if (moreGames) this.moreGames = new MoreGamesButton(moreGames);
```

Tên khác thì **không có lỗi nào được in ra**, nút chỉ đơn giản không bấm được. Sửa tên bên
Unity hoặc sửa chuỗi ở đây, đừng để lệch.

**Bước 3 — ảnh.** Cấu hình của Slope Rush, đo từ `MainGame.unity`:

| | |
|---|---|
| kích thước nút | 282 × 79 |
| ảnh thường | `Group_11.png` |
| ảnh hover | `Group_1.png` |
| phóng to khi hover | `ButtonFx.scaleFactor = 1.05` |

Hai ảnh đều được exporter đưa sang `public/assets/sprites/`. Nhớ quy ước của cả bộ UI: ảnh
hover được vẽ trên khung rộng hơn nút 12 px mỗi phía, phần thừa ấy là quầng sáng — nên **đừng
crop sát** khi thay ảnh cho game mới.

---

## 5. Kiểm tra

Mở console rồi ép từng nhánh:

```js
// đang trỏ đi đâu (đọc đúng cái mã đọc lúc bấm)
GMSOFT_GAME_INFO?.more_games_url || '(rỗng — sẽ dùng fallback có gid)';

// ép nhánh portal: đặt TRƯỚC khi bấm, không cần tải lại trang
window.GMSOFT_GAME_INFO = { more_games_url: 'https://example.com/test' };

// ép nhánh crazy: phải tải lại trang hoặc quay về menu để refresh() chạy
window.GMSOFT_SDKTYPE = 'crazy';
```

Trên portal thật thì mở DevTools → Network, lọc `azgames.io`, bấm nút và xem tab mới mở đúng
URL nào.

---

## 6. Những chỗ đã trả giá

**Bản JS và bản Unity KHÔNG giống nhau ở nút này, và bản JS đúng hơn.** Bên Unity,
`GMSDK.GetMoreGamesUrl()` **không bao giờ trả về rỗng** — hết portal thì nó trả về hằng số
riêng của SDK:

```csharp
// Slope/Assets/GmSoft/GameInfo/GMGameInfoModule.cs:16
private const string DEFAULT_MORE_GAMES_URL = "https://azgames.io/";   // KHÔNG có gid
```

Mà `MoreGames.cs` chỉ dùng ô `url` trong scene *khi SDK trả về rỗng*. Vì điều đó không bao giờ
xảy ra, **chuỗi `?gid=G151` gõ trong scene thực tế không bao giờ được mở** ở bản Unity: người
chơi luôn ra `https://azgames.io/` trơn, và lượt giới thiệu không được ghi công.

Bản JS lấy chuỗi có `gid` làm fallback, nên nó mở đúng thứ người ta đã gõ vào scene. Đây là
**một điểm cố ý khác Unity**. Nếu có lúc nào cần khớp 1:1 với bản Unity thì đổi hằng số trong
`src/ui/moreGamesButton.js` thành `'https://azgames.io/'` — nhưng nhớ rằng làm vậy là tự bỏ
phần ghi công.

**`GMSOFT_GAME_INFO` được đọc lúc BẤM, không phải lúc dựng nút.** Portal giao dữ liệu ấy qua
callback của `gmStartGame`, và callback đó có thể về sau khi menu đã hiện. Cache lại lúc khởi
động thì một callback về muộn sẽ không bao giờ có tác dụng.

**Đừng dùng `location.href`.** Nút mở tab mới bằng `window.open(url, '_blank', '')` — đúng thứ
`Application.OpenURL` biên dịch ra trên WebGL. Điều hướng ngay tab hiện tại sẽ giết phiên chơi,
và trên portal thì giết luôn cả khung iframe của họ.
