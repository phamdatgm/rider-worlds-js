# Asset và giấy phép

Mọi font, âm thanh, nhạc, ảnh, video trong game đều phải trả lời được: **lấy ở đâu, ai làm, được dùng theo giấy phép nào, bằng chứng để đâu.** Khi nộp game, portal yêu cầu nhà phát triển cam kết có quyền với mọi thứ trong game. Game lại có quảng cáo, nên mọi asset đều được dùng **thương mại**.

Câu trả lời ghi trong **`licenses.json`**, cạnh `config.json` và `analytics.json` (`docs/GMSDK_JS/licenses.json`, mẫu: [licenses.example.json](../licenses.example.json)). `check-export` kiểm file này mỗi lần build.

## 1. Khi nào ghi

- Thêm, thay hay sửa một asset: ghi luôn trong cùng commit.
- Gắn kit vào game có sẵn: rà hết asset một lượt. File nào không rõ nguồn thì ghi `"origin": "unknown"`, **không đoán**, rồi hỏi chủ game.
- Trước khi bàn giao ([HANDOFF.md §1](HANDOFF.md)): `check-export` không còn lỗi, và không còn cảnh báo nào về giấy phép.

## 2. `licenses.json`

```json
{
  "roots": ["public/assets"],
  "assets": [
    {
      "files": ["public/assets/sounds/menu.mp3"],
      "type": "music",
      "origin": "third-party",
      "license": "CC0-1.0",
      "source": "https://opengameart.org/node/159764",
      "author": "iamoneabe",
      "modified": true,
      "proof": "public/assets/sounds/CREDITS.md"
    }
  ]
}
```

| Khoá | Là gì |
| --- | --- |
| `roots` | Các thư mục asset, tính từ gốc repo. **Mọi file trong đó phải nằm trong một dòng của `assets`**: file không ai ghi là lỗi. Ngoại lệ: các file hồ sơ (`CREDITS*`, `LICENSE*`, `README*`, `*.md`, `*.txt`) |
| `files` | Glob các file của dòng này: `*` trong một thư mục, `**` mọi thư mục con, `?` một ký tự |
| `type` | `art`, `font`, `music`, `sound`, `video`, `data`, `code` |
| `origin` | `in-house` (team tự làm), `ai` (gen bằng AI, §6), `third-party` (lấy từ nguồn ngoài theo giấy phép mở), `purchased` (mua), `unknown` (chưa rõ: cảnh báo) |
| `license` | Mã giấy phép (§3). Tự làm và AI là `in-house`; đồ mua là `commercial`; đã biết là **không có quyền** thì `none` (§5) |
| `source` | Trang lấy về (link cụ thể tới asset, không phải trang chủ). Bắt buộc với `third-party`, `purchased` |
| `author` | Tác giả hoặc người làm |
| `attribution` | Dòng ghi công đúng như tác giả yêu cầu (CC-BY bắt buộc, §4) |
| `modified` | `true` nếu đã chỉnh sửa (cắt, đổi màu, mix, vẽ lại) |
| `proof` | Bằng chứng và nơi lưu: file licence trong repo, hoá đơn, số đơn hàng, đường dẫn Drive |
| `derivedFrom` | Asset này làm lại từ asset nào (ví dụ vẽ lại từ art của bản gốc) |
| `ai` | Với `origin: ai`: `tool`, `prompts`, `references`, `reviewedBy` (§6) |
| `notes` | Ghi chú thêm |

Thư viện code đóng gói vào `game.js` (engine, vật lý) cũng nên có một dòng `type: code` (MIT, BSD, Apache được dùng; GPL / AGPL thì không). Dòng này không cần nằm trong `roots`.

## 3. Giấy phép

| Giấy phép | Dùng được? | Điều kiện |
| --- | --- | --- |
| `CC0-1.0`, `Unlicense`, `Pixabay` | Được | Không bắt ghi công. Vẫn ghi `source` |
| `CC-BY-3.0`, `CC-BY-4.0` | Được | **Phải ghi công** (§4) |
| `CC-BY-SA-*` | Cân nhắc | Thứ làm ra từ file đó phải mang cùng giấy phép. Chỉ dùng nguyên file, không trộn vào art của game |
| `OFL-1.1` (font) | Được | Không bán riêng file font; đổi tên nếu sửa font |
| `MIT`, `Apache-2.0`, `BSD-*` | Được | Giữ thông báo bản quyền (thường đã nằm trong code) |
| `commercial` (mua) | Được | Giấy phép phải cho dùng trong game web hoặc app có quảng cáo. Lưu `proof` |
| `in-house` | Được | Team tự làm, hoặc AI (§6) |
| Có **NC** (non-commercial) | **Cấm** | Game có quảng cáo là thương mại |
| Có **ND** (no derivatives) | **Cấm nếu đã sửa** | Chỉ dùng nguyên vẹn |
| "Free for personal use", "editorial use" | **Cấm** | Hay gặp ở font và ảnh stock miễn phí |
| Lấy từ game, phim, nhạc thương mại khác, hoặc "tìm thấy trên mạng" | **Cấm** | Kể cả khi đã sửa. Đã biết là không có quyền thì ghi `license: none` (§5) |

`check-export` báo **lỗi** với NC, personal use, editorial, ND đã sửa; **cảnh báo** với giấy phép ngoài bảng này.

## 4. Ghi công

- CC-BY (và giấy phép nào đòi ghi công): ghi `attribution` đúng như tác giả yêu cầu, ví dụ `"Pulsar Menu" by iamoneabe (opengameart.org), CC BY 4.0`.
- Người chơi phải **thấy** dòng ghi công: một màn Credits trong game (Settings → Credits), hoặc store description của mọi portal. `check-export` nhắc mỗi dòng CC-BY.
- Không bắt buộc mà vẫn ghi (CC0) thì càng tốt: giữ trong `CREDITS.md` cạnh asset.

## 5. Chưa rõ nguồn

- Ghi `"origin": "unknown"` kèm `notes`: biết gì thì ghi nấy (lấy từ đâu, ai đưa).
- Hỏi chủ game. Không xác nhận được thì **thay file** bằng asset có giấy phép rõ (CC0, tự làm, AI).
- Còn dòng `unknown` thì chưa được bàn giao.

**Đã biết là không có quyền** (ví dụ asset của game gốc mà công ty không sở hữu, kể cả art vẽ lại bám theo nó): ghi đúng sự thật, `"origin": "third-party"` (hoặc `ai` nếu vẽ lại), `"license": "none"`, và `notes` (nguồn gốc, kế hoạch nếu có). Dòng `none` **chỉ là ghi chú**: `check-export` không cảnh báo, không báo lỗi, không chặn build hay phát hành. Việc dùng tiếp hay thay (asset tự làm, AI vẽ mới không bám theo bản gốc, asset có giấy phép rõ) do chủ game quyết.

## 6. Art gen bằng AI

AI là công cụ, không phải giấy phép. Ghi để chứng minh **ai tạo, bằng gì, từ đâu**:

```json
{
  "files": ["public/assets/art/**"],
  "type": "art",
  "origin": "ai",
  "license": "in-house",
  "derivedFrom": "the game's own sprites (in-house)",
  "ai": {
    "tool": "Codex (ChatGPT Business)",
    "prompts": "art/prompts/",
    "references": "own sprites only (art/prompts/*/ lists them)",
    "reviewedBy": "Lan, 2026-10-17"
  }
}
```

- **`tool`:** công cụ và gói tài khoản. Gói phải cho dùng output thương mại; đọc điều khoản của công cụ khi đổi công cụ hay đổi gói.
- **`prompts`:** nơi lưu prompt. Prompt lưu trong repo (`art/prompts/`, [HANDOFF.md §6](HANDOFF.md)).
- **`references`:** ảnh tham chiếu đã đính kèm. **Chỉ asset của chính mình** (art của game, logo của game).
- **`reviewedBy`:** người đã xem từng ảnh, xác nhận không giống nhân vật, logo, art đã có của người khác.

**Luật khi viết prompt:**
- Không đính kèm art của game, studio hay hoạ sĩ khác.
- Không viết "in the style of <hoạ sĩ / game / studio>".
- Không dùng tên IP, nhân vật, thương hiệu hay logo thật (xe thật, hãng thật…).
- Không có chữ nào ngoài logo của game (AI hay vẽ chữ hoặc watermark sai).

**Biết trước hai giới hạn:**
- Ảnh thuần AI có thể không được bảo hộ bản quyền ở một số nước, nên người khác chép lại thì khó đòi. Phần chỉnh tay thêm (ghép, sửa nét, màu) giúp được phần đó.
- Điều khoản của từng công cụ khác nhau và có thể đổi. Game lớn hoặc có tranh chấp thì hỏi bên pháp lý; tài liệu này không phải tư vấn pháp lý.

**Vẽ lại từ art của bản gốc** (port, reskin): ghi `derivedFrom`, và chủ game xác nhận ai giữ quyền với bản gốc. Không xác nhận được thì xử như `unknown`.

## 7. Kiểm

```bash
node docs/GMSDK_JS/tools/check-export.mjs     # cũng chạy trong npm run build
```

| Mức | Khi |
| --- | --- |
| **Lỗi** | File trong `roots` không có dòng nào; giấy phép NC / personal / editorial, ND đã sửa; CC-BY thiếu `attribution`; dòng hỏng (không `files`, `type` / `origin` sai, AI thiếu `ai.tool`) |
| **Cảnh báo** | Chưa có `licenses.json`; `unknown`; nhắc hiện dòng ghi công CC-BY; giấy phép ngoài §3, share-alike; thiếu `source` / `proof`; AI thiếu `prompts` / `reviewedBy` |

Bàn giao khi không còn lỗi, và không còn cảnh báo nào về giấy phép, trừ lời nhắc hiện dòng ghi công. Dòng `none` chỉ là ghi chú, không tính.
