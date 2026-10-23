# Game trong iframe, nhiều tên miền

Game chạy trong iframe của nhiều portal. Thứ gì **cùng tên miền với trang** (file trong gói, gọi bằng đường dẫn tương đối) thì không vướng gì. Thứ gì **khác tên miền** vẫn dùng được, nhưng phải đủ điều kiện. File này là bảng tra: câu báo lỗi → vì sao → cách làm cho chạy → đường lui. Luật ngắn để AI làm theo nằm ở `PROMPT.md`; `check-export` nhắc các chỗ dò được trong `game.js`.

| # | Triệu chứng (console) | Mục |
| --- | --- | --- |
| 1 | `blocked by CORS policy`, `No 'Access-Control-Allow-Origin' header`, font không hiện | Tài nguyên khác tên miền |
| 2 | `SecurityError … tainted canvases`, `texImage2D … cross-origin data`, `getImageData` / `toDataURL` lỗi | Đọc điểm ảnh, texture, cắt ảnh |
| 3 | Lần đầu chạy được, lần sau CORS lỗi (hoặc ngược lại) | Cache |
| 4 | `Failed to construct 'Worker' … cannot be accessed from origin` | Worker, decoder |
| 5 | `SharedArrayBuffer is not defined`, WASM nhiều luồng không chạy | Nhiều luồng |
| 6 | `The AudioContext was not allowed to start` | Âm thanh |
| 7 | `requestFullscreen` / `requestPointerLock` / rung bị từ chối | Quyền của iframe |
| 8 | Bấm phím mà trang ngoài cuộn; phải bấm vào game mới nhận phím | Bàn phím |
| 9 | `Blocked a frame with origin … from accessing a cross-origin frame`, popup bị chặn | Trang cha, cửa sổ, cookie |
| 10 | Save không thấy giữa portal, mất trong Safari / ẩn danh | Lưu trong iframe |
| 11 | `Mixed Content: … requested an insecure resource` | http trong trang https |

## 1. Tài nguyên khác tên miền (ảnh, font, JSON, âm thanh, model, WASM)

**Vì sao:** trình duyệt chỉ cho game đọc file của tên miền khác khi máy chủ đó cho phép (`Access-Control-Allow-Origin`) **và** game tải ở chế độ CORS. `<img>` hay ảnh nền CSS thì vẫn **hiện** được, nhưng không dùng làm texture hay đọc điểm ảnh được (§2). Font, `fetch` thì không tải được luôn.

**Cách làm cho chạy:** đủ cả hai phía.
- Máy chủ trả `Access-Control-Allow-Origin: *` (hoặc đúng tên miền trang). CDN của mình: SERVER_NOTES.md. Máy chủ người khác: thử bằng `curl -I <url>` có dòng đó chưa.
- Game tải ở chế độ CORS:

```js
const img = new Image();
img.crossOrigin = 'anonymous';                 // TRƯỚC khi gán src
img.src = url;

new THREE.TextureLoader().setCrossOrigin('anonymous').load(url);   // Three.js (GLTFLoader… cũng có setCrossOrigin)
const data = await fetch(url, { mode: 'cors' }).then((r) => r.json());
```

**Đường lui:** máy chủ không có CORS, hoặc không chắc → chép file vào gói (`public/assets/…`), gọi `assets/…`. Đây cũng là cách nhanh và chắc nhất.

## 2. Đọc điểm ảnh, texture WebGL, cắt ảnh bằng canvas

**Vì sao:** vẽ ảnh khác tên miền (không CORS) lên canvas thì canvas thành "bẩn": đọc lại (`getImageData`, `toDataURL`, `toBlob`), đưa lên GPU (`texImage2D`), `createImageBitmap` rồi dùng cho WebGL đều bị chặn.

**Cách làm cho chạy:** ảnh trong gói, hoặc ảnh tải có CORS như §1, thì đọc / cắt / làm texture thoải mái.

**Cắt sprite không cần đọc điểm ảnh** (chạy với mọi ảnh, nhẹ hơn tạo ảnh mới):

```js
ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, dw, dh);   // canvas 2D: vẽ một phần của ảnh lớn

const t = sheetTexture.clone();                          // Three.js: một ô của atlas bằng UV
t.repeat.set(sw / W, sh / H);
t.offset.set(sx / W, 1 - (sy + sh) / H);
t.needsUpdate = true;
```

Giao diện HTML: một thẻ với `background-image` + `background-position`. Cần nhiều ảnh nhỏ riêng thì cắt sẵn lúc làm asset (atlas), không cắt lúc chạy.

## 3. Cache: lần đầu được, lần sau lỗi

**Vì sao:** cùng một URL từng được tải **không** CORS (một chỗ quên `crossOrigin`, hoặc thẻ `<img>`), trình duyệt / CDN giữ bản đó không kèm header CORS, lần tải có CORS sau dùng lại và hỏng.

**Cách làm cho chạy:** mọi chỗ tải cùng một file đặt `crossOrigin` giống nhau. CDN đã lỡ lưu bản thiếu header thì xoá cache CDN; thêm `?v=<version>` vào URL để lấy bản mới.

## 4. Worker, decoder (Draco, KTX2, Basis, physx)

**Vì sao:** `new Worker(url)` chỉ nhận file **cùng tên miền** với trang, kể cả khi máy chủ kia có CORS.

**Cách làm cho chạy:** file worker / decoder để trong gói (`DRACOLoader.setDecoderPath('assets/draco/')`, `KTX2Loader.setTranscoderPath('assets/basis/')`). Phải lấy từ tên miền khác thì tải về (CORS) rồi chạy từ blob:

```js
const code = await fetch(workerUrl, { mode: 'cors' }).then((r) => r.text());
const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
```

## 5. SharedArrayBuffer, WASM nhiều luồng

**Vì sao:** chỉ có khi trang "cross-origin isolated" (header COOP / COEP); trong iframe của portal gần như không bao giờ có.

**Cách làm cho chạy:** kiểm rồi chọn, luôn có bản một luồng:

```js
const threads = globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function';
const physics = threads ? await loadPhysicsThreaded() : await loadPhysicsSingle();
```

## 6. Âm thanh

**Vì sao:** trình duyệt không cho phát tiếng trước cú chạm / bấm đầu tiên của người chơi.

**Cách làm cho chạy:** tạo `AudioContext` sớm cũng được, nhưng gọi `resume()` trong cú chạm đầu:

```js
const unlock = () => { audio.resume(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
```

## 7. Toàn màn hình, khoá chuột, rung

**Vì sao:** iframe chỉ được dùng khi portal cho quyền (`allow="fullscreen; pointer-lock"`), và chỉ trong cú bấm của người chơi.

**Cách làm cho chạy:** gọi trong handler của cú bấm, bọc `try` / `.catch`; bị từ chối thì game vẫn chơi được bình thường, nút toàn màn hình ẩn đi:

```js
button.onclick = () => document.documentElement.requestFullscreen?.().catch(() => button.remove());
```

## 8. Bàn phím trong iframe

**Vì sao:** iframe chỉ nhận phím khi đang được chọn; phím mũi tên / Space / PageDown mặc định cuộn trang ngoài.

**Cách làm cho chạy:** `preventDefault()` cho đúng các phím game dùng; game cần phím thì bấm / chạm vào game là nhận (màn đầu có nút bấm, hoặc `canvas.focus()` khi chạm).

```js
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
addEventListener('keydown', (e) => { if (GAME_KEYS.has(e.key)) e.preventDefault(); }, { passive: false });
```

## 9. Trang cha, cửa sổ mới, cookie

**Vì sao:** iframe khác tên miền không đọc được `window.top` (URL, DOM); popup ngoài cú bấm bị chặn; cookie bên thứ ba bị nhiều trình duyệt chặn.

**Cách làm cho chạy:** đọc trang cha thì bọc `try` và có giá trị mặc định; mở link qua SDK (More Games…) hoặc `window.open` ngay trong cú bấm; không lưu gì vào cookie.

## 10. Lưu trong iframe

**Vì sao:** `localStorage` trong iframe bị chia theo site cha (cùng game trên portal A và portal B là hai bộ lưu), có thể bị chặn hoặc xoá (Safari, ẩn danh, chặn cookie bên thứ ba).

**Cách làm cho chạy:** lưu qua `sdk.storage` (đã bọc lỗi: không lưu được thì game vẫn chạy, chỉ không giữ tiến trình). Save không đi theo người chơi giữa các portal là bình thường.

## 11. http trong trang https

**Vì sao:** trang https chặn hẳn mọi file tải bằng `http://` (mixed content). Đây là trường hợp **không có cách lách**.

**Cách làm cho chạy:** dùng `https://`, hoặc đường dẫn tương đối. `check-export` báo lỗi.

## 12. Cách thử

- Trên máy: chạy gói ở một cổng, file ngoài ở cổng khác (ví dụ trang `localhost:8080`, ảnh `127.0.0.1:5500`): khác cổng là khác tên miền, lỗi CORS hiện y như thật.
- Trên portal: mở `preview.html?debug` của gói đã upload, xem console không có dòng nào của bảng đầu file ([QA.md](QA.md) 7.9).
- `check-export` (EXPORT.md §5) nhắc: file tải từ tên miền khác, ảnh ngoài chưa đặt `crossOrigin`, Worker từ URL, `SharedArrayBuffer` chưa kiểm `crossOriginIsolated`; báo lỗi file `http://`.
