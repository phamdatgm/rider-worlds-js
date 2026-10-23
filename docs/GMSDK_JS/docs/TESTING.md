# Chạy thử và kiểm trước khi giao

## 1. Trang dev

Chép `template/index.html` về gốc repo game, điền ba giá trị chủ game cấp:

| Chỗ | Ví dụ | Ghi chú |
| --- | --- | --- |
| `gameId: '<!--GAME_ID-->'` | `wheelie-spooky` | = `id` trong `game.json` |
| `gameCode: '<!--GAME_CODE-->'` | `g131` | = `gameCode` trong `game.json` |
| `version: '<!--GAME_VERSION-->'` | `26101701` | = `version` trong `game.json` (`yymmddXX`); `tools/bump-version.mjs` cập nhật mỗi lần build |
| `language: '<!--LANGUAGE-->'` | `en` | Ngôn ngữ người chơi mới thấy (một thẻ trong `languages`). `bump-version` điền `defaultLanguage` khi còn trống; đổi tay để thử ngôn ngữ khác (xoá lựa chọn đã lưu: Local Storage, vùng `settings.language`) |

Chưa điền thì trang vẫn chạy (console báo lỗi tuỳ chọn, lưu tạm vào `azgames.dev`).

Trang dev nạp `loader.js` (chép từ kit vào `public/loader.js`; Vite phục vụ `public/` ở gốc) với `data-entry="src/main.js" data-module`, như trang thật nạp `game.js`. Khác trang thật một điểm: `platform: 'dev'` cho chạy tiếp khi không tải được `gmsdkjs.js` (làm game khi mất mạng), nên **mục QA 1.4 phải thử trên gói xuất**. Gõ `gmSave.dump()` ở console để xem save dạng rõ (chỉ trang dev có `gmSave`).

Các tuỳ chọn hay đổi khi thử:

| Tuỳ chọn | Dùng để |
| --- | --- |
| `adsTest: true` | Quảng cáo test của Google (h5): preroll, xen giữa, thưởng hiện thật, không cần cấu hình gì. **Chỉ ở trang dev** |
| `ads: { enable_preroll: 'yes', time_show_inter: 30, time_show_reward: 0 }` | Ở chế độ thử: có preroll không, giãn cách xen giữa / thưởng (giây) |
| `debug: true` (hoặc `?debug` trên URL) | Console in mọi bước của SDK: `[gmsdkjs] …` |

`adsTest` và `debug` là **tuỳ chọn ẩn**: chỉ trang dev ghi chúng. Template của platform và trang build không có hai khoá này, SDK coi là tắt; trên trang thật, thêm `?debug` vào URL để xem log.
| `api: 'https://api.1games.io/sdk/gmadsv2'` | Hỏi API licence thật cho `gameId` (licence, màn khoá, chuyển hướng, cấu hình quảng cáo của admin) |
| `gma: { host: 'https://gma.readyplayer1.xyz', suffix: '-1games' }` | Gửi sự kiện lên GMA thật. **Bảng xếp hạng cần dòng này** (key = `gameId` + `suffix`, có thật trên GMA), ví dụ `{ host: 'https://gm.azgame.io', suffix: '-az' }` ([LEADERBOARD.md §5](LEADERBOARD.md)) |
| `sdkType: 'gd' \| 'crazy' \| 'poki'` (+ `gdKey` cho GD), `adsTest: false` | Thử như trên portal đó (cùng preset với template của tool build, bên dưới). Ngoài domain của portal, SDK của họ có thể chạy ở chế độ thử hoặc không có quảng cáo: kết quả cuối cùng phải xem trên portal |

Preset của từng portal (tool build dùng; trang dev chỉ cần đổi khi muốn thử như portal đó):

| | 1games | GameDistribution | CrazyGames | Poki |
| --- | --- | --- | --- | --- |
| `sdkType` | `gm` | `gd` | `crazy` | `poki` |
| `gdKey` | – | `portals.gd.gameKey` | – | – |
| `ads` | API quyết | `{ enable: 'yes', sdk_type: 'gd', time_show_inter: 180, time_show_reward: 0 }` | `{ enable: 'yes', time_show_inter: 0, time_show_reward: 0 }` | như CrazyGames |
| `moreGames`, `trademark` | API quyết | `false` | `false` | `false` |

Mọi portal đều gọi API licence, gửi GMA và nạp `gmsdkjs.js` từ CDN. More Games và trademark chỉ có ở trang nhà (gm), theo API. Template GD, CrazyGames, Poki tắt hẳn hai thứ này (luật portal, [QA.md](QA.md) 7.4); API không bật lại được.

## 2. Chạy

```bash
npx vite                          # game dùng Vite: mở URL nó in ra
npx --yes http-server . -p 8080   # game JS thuần (module ES không cần build): mở http://localhost:8080/
```

Ví dụ trong kit: chạy `npx --yes http-server <kit> -p 8080` rồi mở `http://localhost:8080/example/`.

## 3. Trên server

- Gói đã ghép theo portal ([EXPORT.md §7](EXPORT.md)): upload `export/build/<version>-<id>/` rồi mở `preview.html?debug`. Trang dùng API licence, GMA và quảng cáo thật; muốn quảng cáo test thì dùng trang dev.
- Demo của SDK: `https://games.1games.io/lib/1games/gmsdkjs/demo/index.html?debug&adstest`. Thêm `&game=<slug>` để hỏi API licence thật (mở từ một link trên 1games.io để có referrer). Phải gõ đủ `index.html`.
- Game thật sau khi tool build ghép template: thêm `?debug` vào URL để xem log.

## 4. Kiểm trước khi giao gói

Checklist, mức lỗi và mẫu báo cáo: [QA.md](QA.md). 8 cỡ màn hình chụp bằng `node docs/GMSDK_JS/tools/screens.mjs` trên gói đã ghép ([QA.md §2.1](QA.md)). Trên trang dev kiểm được phần quảng cáo, tạm dừng, chịu lỗi, lưu trữ, ngôn ngữ, tracking và gói xuất. Phần xoay máy, âm thanh trên iOS / Android và hiệu năng cần máy thật (QA.md §2).
