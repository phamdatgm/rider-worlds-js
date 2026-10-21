# Rider Worlds – bản port JavaScript

Bản chuyển đổi project Unity `D:\SourceGame\09\rider-worlds` sang web, gồm cả gameplay lẫn meta game:

- **Render**: Three.js (r186), pipeline kiểu Unity gamma space + bloom (prefilter như URP).
- **Vật lý**: Planck.js – bản port Box2D, cùng engine với Physics2D của Unity (Rigidbody2D, WheelJoint2D, PolygonCollider2D…).
- **UI**: chính các canvas uGUI gốc (Menu.unity, HUD của MainGame, Core) vẽ bằng WebGL qua lớp port uGUI/TextMeshPro
  (`src/ugui`) và chạy bằng các script UI gốc đã port (`src/uiscripts`); sprite gộp trong atlas WebP,
  text tiếng Anh lấy nguyên văn từ I2 Localization.
- **Build**: Vite.

## Chạy

```bash
npm install
npm run export-assets   # (chỉ cần khi dữ liệu Unity thay đổi) Python 3 + numpy + PyYAML + Pillow
npm run dev             # http://localhost:5173
npm run build           # bản production trong dist/
npm run smoke           # smoke test headless (cần `npm run dev` đang chạy), ảnh + log trong smoke-out/
```

`npm run smoke` mở game bằng Chrome headless, chơi thử (biến `BOT=1` bật bot tự lái, `SECS=<n>` số giây) và trả
mã lỗi 1 nếu trang có exception. Chrome được tìm ở vị trí mặc định của từng hệ điều hành, hoặc chỉ định bằng `CHROME=<đường dẫn>`.

Điều khiển: giữ chuột / chạm / Space / ↑ để tăng tốc trên mặt đất và lộn (flip) khi ở trên không. `Esc`/`P` tạm dừng, `R` chơi lại.
Cài đặt (nút bánh răng) có nút **Reset progress** để xoá save và chơi lại từ tutorial.

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

- Mọi chỗ cần **xem quảng cáo** được cấp ngay (nút "Free"), giống bản Unity đã gỡ SDK quảng cáo.
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
- Save: `localStorage['rider-worlds-save-v2']` (tự chuyển đổi save v1 cũ).

## Debug

`window.__meta` (Currencies, CardService, PlayerRank, ChallengeManager, LootboxService, Shop, Tutorials…), `window.__save`,
`window.__app`, `window.__game`. Ví dụ: `__meta.Currencies.Star.Gain(10)` để lên rank.
`__app.state` (`menu` / `game` / `running`), `__app.playEndless(world?)`, `__app.playLevel(id)` để vào run từ console hoặc tool headless.
