# Tiêu chuẩn QA

Tài liệu này là chuẩn **đạt / không đạt** cho một bản game trước khi giao lên portal (1games, GameDistribution, CrazyGames, Poki). Nó dùng cho hai việc:
- **QA nghiệm thu** gói xuất trước khi giao cho tool build, hoặc trước khi gửi portal duyệt.
- **Dev làm đúng ngay từ đầu:** biết trước portal kiểm gì.

Cách chạy thử (trang dev, `adsTest`, `?debug`, preset từng portal) nằm trong [TESTING.md](TESTING.md).

## 1. Nguồn và mức lỗi

Mỗi tiêu chí ghi rõ nguồn. Tiêu chí ghi **[Nội bộ]** hoặc "cần xác nhận" thì không phải luật của portal.

| Ký hiệu | Nguồn |
| --- | --- |
| **[GD]** | Tài liệu SDK chính thức của GameDistribution (wiki GD-HTML5) |
| **[QA-GD]** | Báo cáo QA thật của GD cho Wheelie Spooky (16/10/2026): 91 hạng mục; 4 Major, 6 Minor |
| **[CG]** | Tài liệu yêu cầu của CrazyGames (docs.crazygames.com/requirements) |
| **[Poki]** | Yêu cầu chất lượng của Poki (developers.poki.com/guide/requirements-quality) |
| **[SDK]** | gmsdkjs đã làm. QA chỉ xác nhận qua log `?debug`, game không phải làm gì |
| **[Nội bộ]** | Bài học từ Wheelie Spooky và quy ước của team: portal không bắt buộc, nhưng làm thì ít bị trả về |

| Mức | Nghĩa |
| --- | --- |
| **Major** | Bắt buộc sửa. Còn một mục Major thì **không giao** |
| **Minor** | Nên sửa. Được giao nếu đã ghi vào báo cáo, kèm hẹn bản sửa |

Đây là cách GD chấm. Báo cáo của GD còn có Pass / Fail / N/A cho từng hạng mục.

## 2. Bản build và thiết bị

**Luôn test trên gói xuất thật** (`export/build/<version>-<id>`), không test trên dev server.
- Khi tool build đã ghép template: test trên URL thật của từng portal.
- Khi chưa có: dùng trang dev đặt đúng preset của portal ([TESTING.md §1](TESTING.md)), `adsTest: false`. Riêng phần quảng cáo vẫn phải xem lại trên portal.

Bộ máy tối thiểu, gồm bộ GD dùng cộng thêm máy yếu:

| Máy | Vì sao |
| --- | --- |
| Windows + Chrome, kéo đổi kích thước cửa sổ | GD test đổi kích thước cửa sổ [QA-GD]. CrazyGames nhắm Chrome và Edge [CG] |
| macOS + Chrome (và Safari nếu có) | GD test. Trên CrazyGames, game chạy kém trên Safari sẽ bị tắt riêng trên Safari [CG] |
| Android tầm trung, Chrome | Lỗi đứng, màn đen, nhạc không dừng khi chuyển app chỉ thấy trên Android [QA-GD] |
| iPhone, Safari | Sập khi xoay và mất tiếng sau khi chuyển tab chỉ thấy trên iOS [QA-GD] |
| Máy yếu: Chromebook 4 GB RAM, hoặc DevTools → Performance → CPU chậm 6 lần | CrazyGames tắt game không mượt trên Chromebook 4 GB [CG] |
| Game trong iframe nhỏ (khoảng 800×450) | Portal nào cũng nhúng game vào iframe |

### 2.1 Tám cỡ màn hình (một lần mỗi game)

Chụp màn game ở **8 cỡ** dưới đây, xem từng ảnh, ghi kết quả vào báo cáo (§6). **Chỉ chụp một lần**, khi chủ game đồng ý:
- Build xong mà `export/qa/` chưa có thư mục nào thì AI hỏi: "Đã build xong `<version>`. Chụp ảnh QA 8 cỡ màn hình không? Ảnh để hỗ trợ làm Banner cho chuẩn nên cần đồ họa bản cuối cùng."
- Không đồng ý thì bỏ qua, lần build sau hỏi lại. Đã có thư mục thì không hỏi nữa; chủ game muốn chụp lại thì tự yêu cầu.
- Các mục kiểm khác của QA (check-export, §3, §5) vẫn làm mỗi bản build; chỉ phần chụp ảnh là một lần.

Cỡ tính theo CSS px Cỡ tính theo CSS px; điện thoại và máy tính bảng giả lập có cảm ứng và đúng tỉ lệ điểm ảnh (DPR).

| # | Cỡ | DPR | Đại diện |
| --- | --- | --- | --- |
| 1 | 1920×1080 | 1 | Máy tính Full HD |
| 2 | 1366×768 | 1 | Laptop phổ thông |
| 3 | 1536×864 | 1,25 | Laptop Windows phóng 125 % |
| 4 | 1280×720 | 1 | Khung game 16:9 trên portal |
| 5 | 390×844 | 3 | iPhone dọc |
| 6 | 360×800 | 3 | Android dọc |
| 7 | 844×390 | 3 | Điện thoại ngang |
| 8 | 1024×768 | 2 | iPad ngang |

- **Chụp màn đầu (menu):** `node docs/GMSDK_JS/tools/screens.mjs` trên gói đã ghép trang gm (sau `assemble`). Tool mở gói ở từng cỡ, chờ `loader.js` ẩn màn loading, chụp, ghi `export/qa/<version>-<id>/<rộng>x<cao>.jpg` và bảng `export/qa/<version>-<id>/screens.md`. Cần Playwright trong repo game: `npm i -D playwright` rồi `npx playwright install chromium`, hoặc thêm `--channel msedge` / `chrome` để dùng trình duyệt có sẵn.
- **Chụp lúc chơi:** AI tự vào chơi ở **mỗi cỡ** (Playwright, hoặc công cụ chơi thử của app) và chụp ít nhất một khung gameplay + màn kết quả, lưu cạnh ảnh menu (`<rộng>x<cao>-play.jpg`, `<rộng>x<cao>-result.jpg`).
- **Xem từng ảnh**, mỗi cỡ một dòng Đạt / Lỗi: chữ bị cắt hoặc quá nhỏ để đọc, nút chồng nhau hoặc ra ngoài màn, viền đen / khoảng trống (game phải phủ kín, §3.2), nút quá nhỏ để bấm trên điện thoại (dưới khoảng 44 CSS px), HUD che vùng chơi.
- **Ảnh không commit** và không vào gói: `export/` không commit, `export/qa/` nằm ngoài thư mục gói nên không vào zip. Báo cáo chỉ ghi kết quả.
- Ảnh chụp lúc chơi là ảnh tham chiếu cho marketing kit ([HANDOFF.md §6](HANDOFF.md)): đó là lý do chụp trên đồ hoạ bản cuối cùng.

## 3. Checklist nghiệm thu

### 3.1 Khởi chạy và ổn định

| # | Tiêu chí | Cách test → đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 1.1 | Chạy trên Windows, macOS, Android, iOS, ở cả dọc lẫn ngang | Chơi hết một lượt trên từng máy → không thông báo lỗi, không tự tải lại trang | Major | [QA-GD] |
| 1.2 | Không đứng, không sập trong cả phiên chơi | Chơi 10–15 phút: nhiều lượt, xoay máy, mở popup, xem quảng cáo → menu luôn bấm được, không màn đen | Major | [QA-GD] |
| 1.3 | Không lỗi console, không request lỗi (≥ 400) | DevTools trên gói xuất → sạch, trừ lỗi của script quảng cáo bên ngoài | Minor | [Nội bộ] |
| 1.4 | Bị chặn `gmsdkjs.js` thì báo tải lại, không treo | Trên gói xuất (không phải trang dev): DevTools → Network → Block request URL `gmsdkjs.js`, tải lại → màn loading hiện ngay, "Connecting again (2/3)…", rồi "Connection problem… reload the page" + nút Reload; game không chạy, không màn đen. Bỏ chặn, bấm Reload → vào game, save còn nguyên | Major | [Nội bộ] |
| 1.5 | Chạy được khi localStorage bị chặn (ẩn danh, iframe Safari) | Chặn site data rồi mở game → chơi được, save giữ trong phiên | Major | [Poki] [SDK] |
| 1.6 | Màn loading hiện ngay, mất mạng lúc đang tải thì báo Reload | Network chậm (Slow 3G): màn loading + thanh % hiện ngay khi trang mở, không màn đen. DevTools → Offline giữa chừng → thông báo + nút Reload, bấm lại được, không đứng ở màn loading | Major | [Nội bộ] |
| 1.7 | Không có request ra ngoài, trừ SDK | Tab Network → font, ảnh, thư viện nằm trong gói | Major | [Poki] |
| 1.8 | Bộ nhớ GPU vừa sức điện thoại | Đo texture WebGL ở màn nặng nhất, giả lập DPR 3 → khoảng 250 MB trở xuống (Wheelie Spooky: 964 MB thì sập trên iOS) | Major nếu sập | [QA-GD] [Nội bộ] |

### 3.2 Màn hình: xoay, đổi kích thước, bố cục

| # | Tiêu chí | Cách test → đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 2.1 | Chơi được ở cả ngang lẫn dọc, phủ kín màn hình trên điện thoại | Xoay máy ở menu, trong lượt chơi, trong popup → bố cục đúng ở cả hai chiều | Major (iOS), Minor | [QA-GD] [Poki] |
| 2.2 | Xoay máy trong lúc preroll | Xoay khi preroll đang chạy, rồi vào game → đúng kích thước ngay lần đầu | Minor | [QA-GD] |
| 2.3 | Desktop: kéo mép, maximize, restore cửa sổ | Game co giãn theo, không méo, không lệch | Minor | [QA-GD] |
| 2.4 | Không nhấp nháy, không màn đen khi xoay | Xoay liên tục 5–10 lần trên Android | Major | [QA-GD] |
| 2.5 | Không icon mất, không icon đè chữ, không chữ tràn khung, ở **mọi ngôn ngữ** | Duyệt mọi màn và popup, cả hai chiều, trên điện thoại hẹp và màn rộng, với ngôn ngữ dài nhất → mọi chữ đọc trọn | Minor | [QA-GD] [Poki] |
| 2.6 | Không làm cuộn trang cha; không hiện kính lúp hay menu chọn chữ trên điện thoại | Phím mũi tên / Space không cuộn trang chứa iframe; `body` có `user-select: none` | Minor | [Poki] [CG] |

### 3.3 Âm thanh

| # | Tiêu chí | Cách test → đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 3.1 | Đúng nhạc ở mọi màn, không chồng hai bản nhạc | Vào và ra lượt chơi, mở Settings, xoay máy → đúng bài, đúng lúc. Lựa chọn của người chơi không bị reset khi xoay | Minor | [QA-GD] |
| 3.2 | Chuyển tab hoặc sang app khác thì tiếng dừng; quay lại thì có tiếng | Android: chuyển app. iOS: chuyển tab rồi quay về → không kêu khi ẩn; có tiếng lại, chậm nhất ở lần chạm đầu tiên sau đó | Major | [QA-GD] [CG] |
| 3.3 | Có tiếng sau lần chạm đầu tiên (chính sách autoplay) | Mở game mới, chạm một lần → nhạc bắt đầu | Minor | [Nội bộ] |
| 3.4 | Tắt tiếng trong game rồi xem quảng cáo | Sau quảng cáo vẫn tắt tiếng | Minor | [Nội bộ] |

### 3.4 Quảng cáo và sự kiện SDK

| # | Tiêu chí | Cách test → đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 4.1 | Trong lúc quảng cáo, game **dừng hẳn**: không tiếng, không chạy, không nhận phím hay chạm | Menu hiện, rồi preroll chạy. `onPause` dừng vòng lặp, tắt tiếng, chặn input. Bấm phím khi quảng cáo chạy: quay lại không có gì tự chạy | Major | [GD] [CG] [Poki] |
| 4.2 | Hết quảng cáo, game chạy lại **đúng trạng thái**: không thua, không mất mạng, không mất điểm, xu hay save | Xem quảng cáo giữa chừng rồi kiểm tra điểm, xu, save | Major | [QA-GD] |
| 4.3 | Quảng cáo xen giữa chỉ ở chỗ nghỉ (hết ván, qua màn), **không bao giờ lúc đang chơi**, không gắn vào nút điều hướng (menu, settings, shop) | Chơi nhiều lượt, đọc log `?debug` | Major | [GD] [CG] [Poki] |
| 4.4 | Không quảng cáo xen giữa ở lượt đầu, không ngay sau rewarded | Xem rewarded ở màn game over rồi bấm Retry ngay → không có quảng cáo | Minor | [CG] [Nội bộ] |
| 4.5 | Game không tự đếm giờ giãn cách quảng cáo | Không có timer quảng cáo trong code; nhịp do SDK và preset quyết | Major | [Poki] [SDK] |
| 4.6 | Rewarded chỉ chạy khi người chơi bấm nút. Nút chỉ hiện khi `rewardedAvailable()` | Có adblock hoặc không có quảng cáo → không còn nút bấm mà không có tác dụng | Major | [CG] |
| 4.7 | Chỉ thưởng khi `rewarded()` trả `true`. Đóng sớm, lỗi, no-fill, adblock → không thưởng, game vẫn chạy | Xem hết → nhận thưởng; bấm Close sớm → không | Major | [GD] [CG] [Poki] |
| 4.8 | Bấm nút thưởng hai lần liên tiếp không chạy hai quảng cáo, không thưởng hai lần. Một phần thưởng ứng với một quảng cáo | Bấm nhanh hai lần | Major | [Poki] |
| 4.9 | Nút rewarded rõ là "xem quảng cáo" (biểu tượng 🎬), không màu xanh lá. Luôn có nút bỏ qua / Continue **to bằng hoặc hơn**, đặt cạnh hoặc phía trên, hiện cùng lúc | Nhìn màn có nút thưởng | Major (Poki), Minor | [Poki] [CG] |
| 4.10 | Rewarded không bao giờ là cách duy nhất để qua màn; không mời rewarded ở mỗi lần chết | Chơi bỏ qua mọi lời mời | Major | [CG] [Poki] |
| 4.11 | Adblock bật thì game vẫn chơi được, không bị phạt, không có popup báo adblock tự làm | Bật adblock, chơi hết một lượt | Major | [CG] [Poki] |
| 4.12 | `gameplayStart` khi người chơi thật sự bắt đầu chơi (lần chạm hoặc phím đầu tiên), không phải lúc tải. `gameplayStop` ở mọi lúc gián đoạn (pause, menu, hết màn). Không gọi hai lần liền cùng một hàm | Log `?debug` | Major | [Poki] [CG] |
| 4.13 | Không gọi SDK của portal hay mạng quảng cáo nào khác | `grep -rnE "PokiSDK\|CrazyGames\|gdsdk\|adsbygoogle\|GMSOFT_\|gmsdkv2" src` không còn gì | Major | [CG] [Poki] |
| 4.14 | Nạp SDK một lần; đúng ID game GD; preroll GD; tắt debug khi giao; cờ dashboard | Log `?debug`: một lần nạp, preset đúng. **Riêng GD: bật cờ Rewarded Ads trên dashboard** nếu game có rewarded | Major | [GD] [SDK] |

Lưu ý khi đọc kết quả trên GD: SDK của GD tự giới hạn tần suất, và đã thấy nó **tự chạy thêm một quảng cáo khoảng 6 s sau preroll** [Nội bộ]. Thấy hai quảng cáo liền nhau ngay đầu game thì kiểm xem có phải do SDK của GD không, trước khi báo lỗi game.

### 3.5 Lưu trữ và ngôn ngữ

| # | Tiêu chí | Cách test → đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 5.1 | Chỉ **một** key của game, không đọc được bằng mắt | DevTools → Application → Local Storage: `azgames.<gameCode>` bắt đầu bằng `gm1`, phần sau là ký tự lạ (đã nén + mã hoá); thêm `gma_<gameCode>.name` của GMA. Không key nào khác của game. `gmSave.dump()` (console trang dev) ra đúng dữ liệu | Major | [Nội bộ] |
| 5.6 | Sửa tay save thì save bị bỏ | Sửa một ký tự của `azgames.<gameCode>`, tải lại → game như người chơi mới (không chạy với số đã sửa), không lỗi; có sự kiện `save_tampered` | Minor | [Nội bộ] |
| 5.2 | Save cũ đúng phương án chủ game chọn (AI_INSTALL.md, Cách làm) | Mở bản cũ, chơi, rồi mở bản mới. Chọn "Kệ" thì N/A | Major | [Nội bộ] |
| 5.3 | Tiến trình được lưu, hoặc game nói rõ là không lưu | Chơi, tải lại trang | Minor | [Poki] |
| 5.4 | Đổi ngôn ngữ, tải lại trang: giữ ngôn ngữ đã chọn. Mọi chữ đổi theo, không còn chữ viết cứng | Duyệt mọi màn ở từng ngôn ngữ | Minor | [Nội bộ] |
| 5.5 | Bảng xếp hạng (game có `leaderboardId`): mở được, đủ 4 kỳ; hết ván thì điểm + hạng lên bảng; đổi tên + cờ, tải lại trang vẫn giữ; mất mạng thì báo "không tải được", không treo, không trống im lặng; game tạm dừng khi bảng mở | Trang có `gma`, console `[leaderboard] submitted …` ([LEADERBOARD.md §5](LEADERBOARD.md)) | Major | [Nội bộ] |

### 3.6 Hiệu năng và dung lượng

| # | Tiêu chí | Đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 6.1 | Mượt trên máy yếu (CPU chậm 6 lần) | JS mỗi khung p99 ≤ 10 ms; không có long task trong lúc chơi | Minor | [Nội bộ] |
| 6.2 | Khựng khi chuyển cảnh (thua, game over, retry) | Khung tệ nhất ≤ 40 ms khi CPU chậm 6 lần; không khựng giữa lúc chơi | Minor | [Nội bộ] |
| 6.3 | Canvas không lớn hơn số điểm ảnh thật của màn hình | Màn 1366×768 thì canvas khoảng 1366×768 (× DPR, giới hạn 0,5–2) | Minor | [Nội bộ] |
| 6.4 | Dung lượng tải trước màn đầu tiên | ≤ 3 MB [Nội bộ]. CrazyGames: tải ban đầu (tới `gameplayStart`) ≤ 50 MB, ≤ 20 MB để lên trang chủ di động | Major nếu vượt mức của portal | [Nội bộ] [CG] |
| 6.5 | Thời gian tới lúc chơi được | ≤ 10 s trên mạng thường (Poki: người chơi bỏ đi sau 10 s; CrazyGames QA: ≤ 20 s) | Minor | [Poki] [CG] |
| 6.6 | Tổng gói | ≤ 250 MB và ≤ 1.500 file | Major | [CG] |
| 6.7 | Gói chỉ chứa thứ game dùng | Không có asset cũ / trùng / không ai gọi, file thiết kế, file tạm; `check-export` không cảnh báo loại file thừa ([EXPORT.md §3](EXPORT.md)) | Minor | [Nội bộ] |

Đo bằng DevTools → Performance (CPU 6× slowdown) và tab Network với cache tắt. Game có công cụ đo riêng thì dùng công cụ đó.

### 3.7 Nội dung, link và thương hiệu

| # | Tiêu chí | Đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 7.1 | Game hoàn chỉnh, không phải bản dở dang, không còn code debug hay công cụ dev | Không có nút test, cheat, log thừa | Major | [Poki] [GD] |
| 7.2 | Nội dung hợp độ tuổi | PEGI 12 | Major | [CG] |
| 7.3 | Không mua bằng tiền thật, không đăng nhập ngoài | Không có UI mua hay login ngoài | Major | [Poki] [CG] |
| 7.4 | **Poki: không splash, không link ra ngoài.** Logo studio trên màn loading thì được | Trên GD, CrazyGames, Poki: không nút More Games, không trademark (template đặt `moreGames: false`, `trademark: false`; trên admin cũng tắt). Logo brand không hiện như một splash | Major | [Poki] |
| 7.5 | GD, CrazyGames: logo brand của portal khác | Cần xác nhận với từng portal. GD không ghi luật này, nhưng QA của họ có thể chấm | Cần xác nhận | [Nội bộ] |
| 7.6 | Game thu dữ liệu cá nhân ngoài sự kiện SDK | Có thông báo Privacy Policy / Terms cho người chơi mới | Major | [CG] [Poki] |
| 7.7 | Trademark và `V<version>` ở góc (dòng bản quyền từ `copyrightText(sdk)`: mặc định `© 2026 Azgames.io`, server đổi thì theo server, rỗng thì không hiện gì; không chữ viết cứng ở chỗ khác); nút More Games ẩn khi `moreGamesUrl()` là `null`, có URL thì mở tab mới | Nhìn menu | Minor | [Nội bộ] |
| 7.8 | Mọi font, âm thanh, ảnh có nguồn và giấy phép trong `licenses.json`: không NC, không "personal use", không asset lấy từ game khác; CC-BY có dòng ghi công người chơi thấy được | `check-export` không lỗi, không cảnh báo giấy phép ([ASSETS.md](ASSETS.md)) | Major | [Nội bộ] |
| 7.9 | Game trong iframe trên tên miền khác chạy đủ: không lỗi CORS / SecurityError / Mixed Content / Worker trong console, có tiếng sau cú chạm đầu, phím game không cuộn trang ngoài | `preview.html?debug` trên portal thật, hoặc trang và file ngoài ở hai cổng khác nhau ([EMBED.md](EMBED.md) §12) | Major | [Nội bộ] |
| 7.10 | Có nút More Games, đúng chỗ, bấm mở tab mới (không `location.href`) | Trang dev: nút luôn hiện, mở `https://azgames.io` ([INTEGRATION.md](INTEGRATION.md) §9). Trên gm theo link của server | Minor | [Nội bộ] |

### 3.8 Tracking và gói xuất

| # | Tiêu chí | Đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 8.1 | Sự kiện SDK tự gửi | Log `?debug` có `loaded_game`, `start_game`… | Minor | [SDK] |
| 8.2 | Sự kiện của game | Bộ chuẩn (`PlayGame`, `EndGame`…) và bộ phân tích bắt buộc đúng lúc, đủ tham số chung; chơi theo kịch bản [ANALYTICS.md §9](ANALYTICS.md); `analytics.json` khớp game (level, màn, item, tính năng) | Major | [Nội bộ] |
| 8.3 | Gói đúng chuẩn | `node docs/GMSDK_JS/tools/check-export.mjs export/build/<version>-<id> --src src` báo `OK`; `tools/zip.mjs` ra `export/build/<version>-<id>/<version>-<id>.zip` và báo `read back OK`. `index.html` / `preview.html` chỉ là trang gm do `assemble` ghép; không source map; mọi đường dẫn tương đối | Major | [Nội bộ] [CG] |

### 3.9 Trải nghiệm người chơi mới và tính năng

Chuẩn và cách làm: [UX.md](UX.md). Test với một save mới (xoá `azgames.<gameCode>`), và nhờ một người chưa từng chơi.

| # | Tiêu chí | Đạt khi | Mức | Nguồn |
| --- | --- | --- | --- | --- |
| 9.1 | Vào gameplay ngay, hoặc tối đa 1 cú bấm | Save mới: từ lúc hết loading tới lúc điều khiển được ≤ 1 cú bấm | Major | [CG] |
| 9.2 | Người mới biết mục tiêu và cách điều khiển, đúng loại thiết bị | Lượt đầu có lớp điều khiển (phím trên desktop, vùng chạm trên điện thoại) và một dòng mục tiêu; hướng dẫn bằng hình nhiều hơn chữ | Minor | [Poki] [CG] |
| 9.3 | Hướng dẫn, intro, cutscene bỏ qua được; người đã biết chơi không bị dạy lại | Lớp điều khiển tắt ở input đầu tiên và tự thôi hiện khi đã biết chơi; Settings có Show tutorial | Minor | [CG] [Poki] |
| 9.4 | Gợi ý không ngắt lúc đang chơi | Mỗi gợi ý một dòng, một lần; không trong 3 s đầu lượt; cách nhau ≥ 8 s; không dừng game, không che vùng chơi chính | Minor | [Nội bộ] |
| 9.5 | Thua thì biết vì sao | Màn thua có lý do + mẹo; Retry 1 cú bấm, có phím tắt | Minor | [CG] [Nội bộ] |
| 9.6 | Không tính năng nào bị bỏ sót | Bản đồ tính năng ([UX.md §5](UX.md)) không còn dòng trống ở cột "Người chơi biết bằng"; mỗi tính năng tới được từ màn chính hoặc có chấm đỏ / NEW dẫn đường | Minor | [Nội bộ] |
| 9.7 | Chấm đỏ đúng nghĩa | Chỉ hiện khi làm được ngay; tự mất khi không còn đúng; không sáng thường trực | Minor | [Nội bộ] |
| 9.8 | Mở khoá và tính năng mới được báo | Báo một lần, nhãn NEW tới khi mở; mỗi lần vào menu tối đa một thông báo; người chơi mới không bị báo "mới" | Minor | [Nội bộ] |
| 9.9 | Chữ hướng dẫn đủ mọi ngôn ngữ, không tràn | Mọi `hint_*`, `crash_*`, `new_*` có trong mọi file `i18n/`; đo ở ngôn ngữ dài nhất trên màn hẹp nhất | Minor | [CG] [Nội bộ] |

## 4. Trước khi gửi portal duyệt

| Việc | Ai làm |
| --- | --- |
| Domain của portal đã bật cho game trên admin. Tắt `force_redirect` để người QA của portal không bị chuyển trang | Người vận hành (admin api.1games.io) |
| Tắt More Games, trademark cho domain GD, CrazyGames, Poki (mục 7.4; template đã tắt, admin tắt cho chắc) | Người vận hành |
| GD: bật cờ Rewarded Ads trên dashboard. Kích hoạt SDK: mở game trên portal, tắt adblock, xem **trọn** một preroll. Wiki ghi bước này có thể mất tới hai tuần | Người vận hành |
| Zip gd có key GD: ô GD key ở form game trên API, hoặc `config.json` → `gdKey` (mặc định) | Dev |
| Báo cáo QA (mục 6) có 0 Major | QA |
| Marketing kit (`export/marketing/<version>-<id>/`: brief, icon, cover, thumbnail của portal) qua `check-marketing` ([HANDOFF.md](HANDOFF.md)) | Dev / marketing |

## 5. Lỗi đã gặp và cách phòng

Năm dòng đầu lấy từ báo cáo QA của GD cho Wheelie Spooky, đều không thấy khi test trên desktop. Dòng cuối gặp khi gắn gmsdkjs.

| Lỗi | Mức | Nguyên nhân | Cách phòng từ đầu |
| --- | --- | --- | --- |
| iOS sập khi xoay ("A problem repeatedly occurred"); Android màn đen khi xoay | Major | Hết bộ nhớ GPU: FX của engine cấp sẵn render target, cộng mọi ảnh nạp ngay lúc khởi động | Tắt FX không dùng (Phaser: `disablePreFX` / `disablePostFX`). Chỉ nạp ảnh đang cần, giải phóng khi rời màn. Đo texture ở DPR 3 |
| Xoay trong lúc preroll thì màn bị thu nhỏ; icon mất khi xoay; desktop không co giãn theo cửa sổ | Minor | Chỉ đọc kích thước một lần; engine giữ kích thước cũ khi vòng lặp đang ngủ vì quảng cáo | Đo lại tới khi kích thước ổn định. Nghe cả `orientationchange` và `visualViewport`. Đo lại trong `onResume` |
| Android: nhạc vẫn kêu khi chuyển app. iOS: mất tiếng tới khi tải lại | Major | Engine chỉ dừng âm thanh theo blur / focus; iOS để AudioContext ở trạng thái "interrupted" | Dừng theo `visibilitychange`. Tiếp tục khi hiện lại **và** ở lần chạm / phím kế tiếp (CrazyGames ghi đúng điều này) |
| Nhạc nghe thử bị reset khi xoay | Minor | Dựng lại màn hình khi xoay làm mất trạng thái | Dựng lại màn không được xoá lựa chọn đang dở của người chơi |
| Icon đè chữ trong popup | Minor | Chữ không giới hạn bề rộng | Mọi chữ có bề rộng tối đa (thu nhỏ cho vừa). Test với ngôn ngữ dài nhất trên màn hẹp nhất |
| Nút quảng cáo thưởng xám mãi khi bảng mở ngay sau preroll (gặp khi gắn gmsdkjs, 17/10/2026) | Minor | Bảng đọc `rewardedAvailable()` một lần lúc dựng, lúc quảng cáo chưa sẵn sàng | Cập nhật trạng thái nút theo `rewardedAvailable()` suốt lúc nút còn trên màn (ví dụ mỗi 500 ms) |

Hai lỗi cũ không còn với gmsdkjs, vì SDK đã lo:
- Promise của `showAd` của GD trả về trước khi quảng cáo chạy xong.
- Quảng cáo không bao giờ báo xong làm game đứng mãi. Thời gian đóng băng có giới hạn.

Nhưng canvas quá lớn so với màn hình (mục 6.3) vẫn là việc của game.

## 6. Mẫu báo cáo QA

Chép vào báo cáo của bản build, lưu ở **`docs/qa/<version>.md`** (ví dụ `docs/qa/2026102001.md`; AI dùng mẫu này ở [AI_INSTALL.md](../AI_INSTALL.md) Bước 5):

```markdown
# QA <name> <version>: <portal>

- Gói: export/build/<version>-<id> (check-export: OK), export/build/<version>-<id>/<version>-<id>.zip
- URL test: <URL>
- Máy: Windows + Chrome …, Android …, iPhone …, CPU 6×
- Kết luận: GIAO / KHÔNG GIAO (Major: <n>, Minor: <n>)

## Màn hình (§2.1): ảnh ở export/qa/<version>-<id>/ (bản này không chụp thì ghi "đã chụp ở <thư mục>" hoặc "chưa chụp")

| Cỡ | Menu | Lúc chơi | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- |
| 1920×1080 | Đạt | Đạt | Pass | |
| 390×844 | Đạt | Lỗi | Minor | Nút pause chồng lên điểm |
| … (đủ 8 cỡ) | | | | |

## Checklist (§3)

| # | Kết quả | Ghi chú / video |
| --- | --- | --- |
| 1.1 | Pass | |
| 2.2 | Minor | Xoay trong preroll: màn nhỏ lại, video: <link> |
| 4.9 | N/A | Game không có rewarded |
| … | | |

Chưa kiểm được: <mục, lý do>
```

Kết quả mỗi mục: **Pass / Major / Minor / N/A**. Mục không kiểm được thì ghi lý do, không ghi Pass.

## Nguồn

- GameDistribution: [SDK Implementation](https://github.com/GameDistribution/GD-HTML5/wiki/SDK-Implementation), [Rewarded Ads](https://github.com/GameDistribution/GD-HTML5/wiki/Rewarded-Ads), [F.A.Q.](https://github.com/GameDistribution/GD-HTML5/wiki/F.A.Q.)
- CrazyGames: [Requirements](https://docs.crazygames.com/requirements/intro/), [Technical](https://docs.crazygames.com/requirements/technical/), [Ads](https://docs.crazygames.com/requirements/ads/), [Gameplay](https://docs.crazygames.com/requirements/gameplay/), [Quality guidelines](https://docs.crazygames.com/requirements/quality/) (onboarding, UI, điều khiển)
- Poki: [Requirements & quality](https://developers.poki.com/guide/requirements-quality)
- Báo cáo QA của GD cho Wheelie Spooky, 16/10/2026 (bản tóm tắt: repo wheelie-life-web `docs/14-tieu-chuan-qa-gamedistribution.md`)
