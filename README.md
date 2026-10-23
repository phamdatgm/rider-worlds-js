# Rider Worlds – bản port JavaScript

Bản chuyển đổi project Unity `D:\SourceGame\09\rider-worlds` sang web, gồm cả gameplay lẫn meta game:

- **Render**: Three.js (r186), pipeline kiểu Unity gamma space + bloom (prefilter như URP).
- **Vật lý**: Planck.js – bản port Box2D, cùng engine với Physics2D của Unity (Rigidbody2D, WheelJoint2D, PolygonCollider2D…).
- **UI**: chính các canvas uGUI gốc (Menu.unity, HUD của MainGame, Core) vẽ bằng WebGL qua lớp port uGUI/TextMeshPro
  (`src/ugui`) và chạy bằng các script UI gốc đã port (`src/uiscripts`); sprite gộp trong atlas WebP,
  text tiếng Anh lấy nguyên văn từ I2 Localization.
- **Build**: Vite, theo kit GMSDK_JS 1.0.1 (`docs/GMSDK_JS/`).

## Chạy

```bash
npm install
npm run export-assets   # (chỉ cần khi dữ liệu Unity thay đổi) Python 3 + numpy + PyYAML + Pillow
npm run dev             # trang dev http://localhost:5173 (quảng cáo test của Google; ?preroll=0 tắt preroll)
npm run build           # gói xuất export/build/<version>-<id>/ + <version>-<id>.zip (kit GMSDK_JS)
npm run smoke           # smoke test headless (cần `npm run dev` đang chạy), ảnh + log trong smoke-out/
```

`npm run build` chạy đúng chuỗi của kit ([docs/GMSDK_JS/docs/EXPORT.md](docs/GMSDK_JS/docs/EXPORT.md)): `bump-version` (version
`yymmddXX`) → `vite build` → `compress` (PNG → WebP không mất chất lượng, audio → MP3 khi nhỏ hơn) → `tools/music-mp3.mjs`
(nhạc nền luôn là MP3 cho Safari cũ) → `assemble` (trang gm) → `tools/check-package.mjs` (`check-export`) → `zip`.

`npm run smoke` mở game bằng Chrome headless, chơi thử (biến `BOT=1` bật bot tự lái, `SECS=<n>` số giây) và trả
mã lỗi 1 nếu trang có exception. Chrome được tìm ở vị trí mặc định của từng hệ điều hành, hoặc chỉ định bằng `CHROME=<đường dẫn>`.

Bộ kịch bản QA đầy đủ hơn (tutorial, hồi sinh, shop/garage/meta, bot chơi mọi level, quét reset chunk) nằm trong `tools/qa/`;
báo cáo QA theo bản build ở [docs/qa/](docs/qa/). Dung lượng build và hướng giảm ở [docs/plan/2026-10-21-dung-luong-build.md](docs/plan/2026-10-21-dung-luong-build.md).

Điều khiển: giữ chuột / chạm / Space / ↑ để tăng tốc trên mặt đất và lộn (flip) khi ở trên không. `Esc`/`P` tạm dừng, `R` chơi lại.
Cài đặt (nút bánh răng) có nút **Reset progress** để xoá save và chơi lại từ tutorial.

## SDK: GMSDK_JS 1.0.1

Kit nằm ở `docs/GMSDK_JS/` (chép nguyên từ bản gốc của kit, kèm `config.json`, `analytics.json`, `licenses.json` của game).
Cách gắn và các quyết định: [docs/plan/2026-10-23-gmsdk-1.0.1.md](docs/plan/2026-10-23-gmsdk-1.0.1.md).

| Mục | Giá trị | Chỉnh ở đâu |
|---|---|---|
| Slug portal | rider-worlds | `docs/GMSDK_JS/config.json` → `id` (build chép sang `public/game.json` và trang dev) |
| Mã game | g2610211044 → save `azgames.g2610211044` | `config.json` → `gameCode` (và `GAME_CODE` trong `src/main.js`, dùng khi trang không có mã) |
| Leaderboard | leaderboard-highscore | `config.json` → `leaderboardId` |
| Version / bản quyền | `V<version>` của `game.json` · dòng của `src/sdk/copyright.js` (popup Settings của Menu) | version do `bump-version` tăng mỗi lần build |

- `public/loader.js` (kit): màn loading, tải `gmsdkjs.js` + game. `public/icons/`: key art `loading.webp` của game, logo + CSS của kit.
- `src/sdk/` (kit, chép nguyên, không sửa): `gmsdkjs-shim.js`, `storage.js`, `i18n.js`, `net.js`, `copyright.js`, `loading/`, `leaderboard/`.
- `src/main.js`: `boot()` theo thứ tự của kit (SDK → chuyển save cũ → `game.json` + `i18n/` → tài nguyên → `ready()` → menu → preroll).
- `src/ads.js`: tạm dừng game quanh mọi quảng cáo (`onPause` / `onResume`), quảng cáo xen giữa khi hết run, quảng cáo thưởng cho
  mọi nút xem video của bản gốc.
- `src/analytics/`: toàn bộ tracking (bộ chuẩn + bộ phân tích của kit); `node tools/gen-analytics.mjs` sinh lại `analytics.json`.
- `src/portal.js`: `gameplayStart` / `gameplayStop`, gửi điểm Endless lên bảng, nút vương miện ở Home mở màn hình bảng xếp hạng của kit.
- `src/legacy-save.js`: chuyển save của bản JS_SDK_2.0 (JSON thường ở `azgames.g2610211044`) và bản trước SDK
  (`rider-worlds-save-v2` / `-v1`) sang save của kit, một lần. File duy nhất ngoài kit được chạm `localStorage`.
- Mọi tải file đi qua `src/sdk/net.js` (giới hạn thời gian, thử lại 3 lần).
- Kiểm thử SDK: `node tools/qa/sdk-check.mjs` (in mọi sự kiện tracking), `node tools/qa/legacy-save.mjs` (chuyển save cũ).

> **Khóa ký điểm leaderboard** nằm trong `src/sdk/leaderboard/leaderboard.js` của kit. Theo kit đây không phải bí mật (bản Unity
> WebGL cũng mang nó); tool build trên API làm rối `game.js`.

## Cấu trúc

```
tools/                 exporter Python
  unity_yaml.py        đọc prefab/scene/asset dạng text YAML của Unity
  unity_mesh.py        giải nén Mesh (CompressedMesh / VertexData)
  export.py            prefab, scene UI, ScriptableObject, material, mesh, texture, audio -> public/assets
                       (+ atlas sprite UI public/assets/ui)
  export_meta.py       dữ liệu meta (card, challenge, rank track, lootbox, shop, text I2) -> public/assets/meta.json
  export_ui_extra.py   sprite chỉ được dữ liệu meta nhắc tới -> atlas public/assets/ui_extra
  export_anim.py       AnimatorController + AnimationClip -> public/assets/anim
  tmp_dynamic.py       bake thêm glyph SDF mà font TMP "Dynamic" sẽ sinh lúc chạy
  export_prefab.py     xuất nhanh vài prefab vào bản export có sẵn (khi thử nghiệm)
  dump_prefab.py, census.py  in cấu trúc prefab / thống kê component (debug exporter)
  browser.mjs          khởi động Chrome headless dùng chung cho các tool dưới
  smoke.mjs            smoke test (npm run smoke): node tools/smoke.mjs [outDir] [endless|<level id>]
  scenario.mjs         chạy kịch bản headless: node tools/scenario.mjs <kịch bản.mjs> [outDir]
  debug.mjs            vào một run rồi in kết quả một biểu thức JS
src/engine/            "mini Unity": GameObject/Transform/MonoBehaviour, coroutine, Physics2D, render, particle, audio, input
src/render/            port các shader Shader Graph (URP) sang GLSL
src/game/              script gameplay (Player*, RoadPiece, chunk manager + chữ BONUS, camera Cinemachine,
                       MMFeedbacks, chế độ Endless/Level, revive, preview hiệu ứng trong garage)
src/meta/              meta game: save, currency, card, reward, rank, world, challenge, lootbox, shop, bonus, tutorial
src/ugui/              port uGUI: Canvas/RectTransform, layout, Image/RawImage, TextMeshPro (SDF), event system,
                       Selectable/Button, tween, UI particle, vẽ bằng WebGL
src/uiscripts/         script UI gốc: chuyển scene (SceneSwitcher/TransitionScreen), menu chính, HUD, garage, shop,
                       lootbox, rank/reward track, challenge, level, revive, tutorial, cài đặt
```

## Meta game đã port

| Hệ thống | Nội dung |
|---|---|
| Tiền tệ | Gem (soft, khởi đầu 200), Ruby (hard, 25), Star (lên rank), chữ BONUS |
| Card | 5 loại cosmetic (xe, màu, trail, landing, explosion) × 3 world; rank 0–3 theo số bản sao (0/2/8/24); chọn skin; +1 Star khi xem rank mới |
| Garage | 5 tab, lưới card theo world, panel 4 rank, xem trước rank chưa mở trên xe 3D, camera preview gốc (VehiclePreviewCam…) |
| Rank | 38 rank theo Star; Rank Track 37 bậc: card, gem/ruby, mở level Easy/Moderate/Difficult và World 2; popup lên rank + màn Reward Track |
| Challenge | 50 challenge/world theo thứ tự gốc, 3 slot (mở ở 4/8 lần claim), tính tiến độ trong Endless, tự claim ở menu, cooldown, skip bằng ruby |
| Shop | Free Rewards (RV track), Chest nhỏ/lớn, Daily Deals (làm mới bằng ruby), quà ruby hằng ngày |
| Lootbox | thuật toán rơi đồ gốc (CosmeticsDropper, trọng số loại card, hoàn ruby khi dư), hoạt cảnh mở rương, card thưởng thêm |
| Daily chest | XP theo flip trong ngày, 5 cấp rương, nhận lúc qua ngày |
| Bonus | chữ B-O-N-U-S rơi trong Endless (từ rank 3), đủ 5 chữ nhận 400 gem (x2), cooldown 1 giờ |
| Revive Endless | điều kiện gốc (gần chữ bonus / gần kỷ lục / challenge sắp xong / quãng đường), 8 giây, miễn phí 3 lần hoặc 5×2ⁿ ruby |
| Tutorial | First run (giữ để tăng tốc, đóng băng khi flip), claim challenge, level đầu/tiếp theo, shop, mở world, popup rank |
| Khác | compliment ("Double Flip!"…), callout "Perfect", marker HIGHSCORE/PREVIOUS/DAILY AVERAGE, thống kê world, nút world trên top bar |

### Khác biệt có chủ đích so với bản gốc

- Mọi chỗ cần **xem quảng cáo** chạy quảng cáo thưởng của SDK (`src/ads.js`); chỉ thưởng khi xem hết.
- Gói ruby **nạp tiền thật** hiển thị nhưng bị khoá ("Not Available").
- **World 3** là "Coming Soon" như dữ liệu gốc (không có bậc rank nào mở nó).
- **Booster** và chế độ **Bonus Ride** có code trong bản gốc nhưng không có đường vào (không scene nào dùng) nên không được bật;
  ô booster trong lootbox trả ruby như bản gốc.
- Camera menu/garage nhìn gần (FOV 20) giảm bloom để xe không bị cháy sáng.

## Quy ước dữ liệu

- Unity là hệ toạ độ tay trái; exporter lật trục Z (vị trí, quaternion, mesh, thứ tự tam giác). Trục X/Y (vật lý 2D) giữ nguyên.
- Mỗi prefab là danh sách node `{n, p, t, r, s, l, a, c:[component…]}`; tham chiếu được resolve thành
  `{$c:[node, comp]}`, `{$n}`, `{$t}`, `{$prefab}`, `{$so}`, `{$mat}`, `{$mesh}`, `{$tex}`, `{$audio}`.
- Mảng int/enum của Unity được lưu dạng chuỗi hex little-endian.
- Mesh được tải theo nhu cầu bằng HTTP Range từ `meshes.bin`; sprite UI tham chiếu theo tên file trong atlas.
- Save: vùng `save` của `sdk.storage` (key `azgames.<gameCode>`, nén + mã hoá; `gmSave.dump()` ở console trang dev xem dạng rõ).

## Debug

`window.__meta` (Currencies, CardService, PlayerRank, ChallengeManager, LootboxService, Shop, Tutorials…), `window.__save`,
`window.__app`, `window.__game`. Ví dụ: `__meta.Currencies.Star.Gain(10)` để lên rank.
`__app.state` (`menu` / `game` / `running`), `__app.playEndless(world?)`, `__app.playLevel(id)` để vào run từ console hoặc tool headless.
