# Theo từng engine

Phần chung (thứ tự khởi động, quảng cáo, lưu trữ…) giống nhau cho mọi game: [INTEGRATION.md](INTEGRATION.md). Trang này chỉ có phần **khác nhau giữa các engine**: đặt game vào `#game`, tạm dừng / chạy lại, tiến độ tải, xuất gói.

Ở mọi engine, `onPause` / `onResume` làm đúng ba việc: **dừng vòng lặp, tắt tiếng, chặn input**. Tiếng bật lại khi chạy lại **chỉ khi người chơi không tự tắt**:

```js
let playerMuted = sdk.storage.get('settings', {}).muted === true; // cập nhật khi người chơi bấm nút âm thanh
```

## 1. JS thuần (canvas / DOM, `requestAnimationFrame`)

```js
const canvas = document.createElement('canvas');
document.getElementById('game').append(canvas);           // vẽ trong #game, không vào <body>

let running = true;
const audio = new AudioContext();
function frame(t) { if (!running) return; update(t); draw(); requestAnimationFrame(frame); }

sdk.onPause(() => { running = false; audio.suspend(); inputBlocked = true; });
sdk.onResume(() => {
  inputBlocked = false;
  if (!playerMuted) audio.resume();
  if (!running) { running = true; requestAnimationFrame(frame); }
});
```

- Game DOM: thêm class (ví dụ `paused`) có `pointer-events: none` cho `#game` lúc tạm dừng.
- Tiến độ tải: tự đếm số file đã tải (`sdk/net.js`) chia cho tổng, gọi `sdk.loadingProgress(done / total)`.
- Xuất gói không có bundler: xem §6.

## 2. Phaser 3

```js
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',                                          // canvas nằm trong #game
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 720 },
  scene: [BootScene, MenuScene, PlayScene],
});

sdk.onPause(() => { game.sound.mute = true; game.input.enabled = false; game.loop.sleep(); });
sdk.onResume(() => { game.loop.wake(); game.input.enabled = true; game.sound.mute = playerMuted; });
```

Trong scene tải (`BootScene.preload`):

```js
this.load.setPath('assets/');                              // đường dẫn tương đối
this.load.on('progress', (p) => loader.progress(p));      // loader = createLoader() (LOADING.md): thanh 30 → 100 %
this.load.once('complete', async () => {
  await sdk.ready();
  this.scene.start('MenuScene');                           // MenuScene.create() gọi loader.hide() rồi sdk.preroll()
});
```

- Không dùng `game.pause()` của Phaser cho quảng cáo: nó không tắt tiếng. Dùng ba dòng trên.
- Phaser tự tạm dừng khi tab ẩn; không cần thêm gì.
- Dùng Vite: `template/vite.config.mjs` (Phaser đóng gói chung vào `game.js`).

## 3. PixiJS (v7 / v8)

```js
const app = new PIXI.Application();
await app.init({ resizeTo: document.getElementById('game') });   // v7: new PIXI.Application({ resizeTo: … })
document.getElementById('game').append(app.canvas);              // v7: app.view

sdk.onPause(() => { app.ticker.stop(); sound.pauseAll(); app.stage.eventMode = 'none'; });
sdk.onResume(() => { app.stage.eventMode = 'static'; if (!playerMuted) sound.resumeAll(); app.ticker.start(); });
```

- `sound` là `@pixi/sound`; dùng Howler thì `Howler.mute(true)` / `Howler.mute(playerMuted)`.
- Tiến độ tải: `PIXI.Assets.load(urls, (p) => sdk.loadingProgress(p))`.

## 4. Three.js

```js
const renderer = new THREE.WebGLRenderer({ antialias: true });
document.getElementById('game').append(renderer.domElement);

sdk.onPause(() => { renderer.setAnimationLoop(null); listener.context.suspend(); controlsEnabled = false; });
sdk.onResume(() => { controlsEnabled = true; if (!playerMuted) listener.context.resume(); renderer.setAnimationLoop(frame); });
```

- `listener` là `THREE.AudioListener` của game. Tiến độ tải: `THREE.LoadingManager` → `onProgress = (url, loaded, total) => sdk.loadingProgress(loaded / total)`.

## 5. Engine khác

Babylon.js (`engine.stopRenderLoop()` / `engine.runRenderLoop(render)`), PlayCanvas (`app.timeScale = 0` / `1`), Cocos Creator (`director.pause()` / `director.resume()`), Construct / GDevelop (bản xuất HTML5): cùng nguyên tắc.
- Tìm hàm dừng vòng lặp, tắt tiếng, chặn input của engine.
- Gắn vào `onPause` / `onResume`.
- Đặt canvas vào `#game`.
- Mọi lời gọi SDK đi qua một module của game (ví dụ `src/platform/sdk.js`), không rải khắp code.

Engine tự sinh `index.html` thì vẫn chỉ lấy JS + tài nguyên ra gói ([EXPORT.md](EXPORT.md)); trang HTML là việc của tool build.

## 6. Xuất gói

| Game dùng | Cách |
| --- | --- |
| Vite (kể cả Phaser, Pixi, Three qua npm) | `template/vite.config.mjs` → `npx vite build` |
| Không bundler, nhiều file module ES | `npx --yes esbuild@0.24.2 src/main.js --bundle --format=iife --minify --target=es2017 --outfile=export/build/<version>-<id>/game.js`, rồi chép `game.json`, `i18n/`, `assets/` vào cùng thư mục |
| Webpack / Rollup / Parcel | Cấu hình ra một file IIFE `game.js` và bố cục [EXPORT.md §1](EXPORT.md) |
| Engine có trình xuất riêng (Cocos, Construct…) | Lấy file JS và tài nguyên của bản xuất, sắp lại theo [EXPORT.md §1](EXPORT.md); nhiều file JS thì gộp bằng esbuild như trên |

Sau cùng luôn chạy `node docs/GMSDK_JS/tools/check-export.mjs export/build/<version>-<id> --src src`, rồi `node docs/GMSDK_JS/tools/zip.mjs`.
