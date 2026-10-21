/**
 * **BẢN MẪU.** Copy đè lên `config.mjs` khi bắt đầu một game mới:
 *
 *     cp JS_SDK_2.0/config.example.mjs JS_SDK_2.0/config.mjs
 *
 * Mọi giá trị nhận dạng ở đây là placeholder cố ý. `confirmedFor: null` nghĩa là SDK sẽ TỪ
 * CHỐI khởi động cho tới khi có người thật sự đi hỏi và điền vào — đó là cái chốt cuối,
 * chặn đúng trường hợp nguy hiểm nhất: copy nguyên config của game trước rồi quên sửa, các
 * giá trị đều là thật nên trông hoàn toàn bình thường, và số liệu chạy sang game khác.
 *
 * **File duy nhất cần sửa khi mang kit sang game mới.**
 *
 * ┌─ SANG DỰ ÁN MỚI? SỬA ĐÚNG NHỮNG DÒNG NÀY TRƯỚC ─────────────────────────────┐
 * │  gameId         ← ID bên vận hành CẤP; dùng nguyên văn, kit không ghép thêm  │
 * │  gameName       ← tên hiển thị                                               │
 * │  gameCode       ← đổi, nếu không hai game trên cùng domain giẫm lên nhau      │
 * │  signDomain     ← xin bên portal                                             │
 * │  webp.lossyFiles← đo lại cho art của game mới                                │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * File này hiện đang mang danh tính của **Slope Rush**. Quên sửa `gameId` thì game mới báo
 * cáo dưới tên slope-rush và nộp điểm vào bảng của slope-rush — **sai hoàn toàn, không một
 * dấu hiệu nào**. Đó đúng là kiểu lỗi kit này sinh ra để chặn, nên đừng để nó xảy ra ở đây.
 *
 * `firebase` thì thường GIỮ NGUYÊN: đó là project dùng chung của nhà phát hành.
 *
 */

export const config = {
  /**
   * **XÁC NHẬN, không phải mặc định.** Phải bằng đúng `gameId` bên dưới.
   *
   * Mục đích: không thể đổi `gameId` mà quên xem lại những giá trị còn lại. Copy kit sang
   * game mới, sửa `gameId` → hai dòng lệch nhau → SDK **từ chối khởi động** và in ra danh
   * sách cần hỏi bên vận hành. Sửa nốt dòng này là lời khẳng định "tôi đã hỏi và điền đúng".
   *
   * Vì sao từ chối chứ không chạy tiếp: nộp nhầm vào bảng của game khác, hay báo cáo dưới
   * tên game khác, **tệ hơn nhiều** so với không có số liệu. Hỏng thì phải thấy được.
   */
  confirmedFor: 'rider-worlds-az',

  // ---- identity -----------------------------------------------------------------------------

  /**
   * The portal's game id. The Unity template derives it as
   * `productName.replace(/\s+/g, '-').toLowerCase()`, and the leaderboard key is this plus
   * ID do bên vận hành portal cấp — chép nguyên văn, KỂ CẢ ĐUÔI. Kit không tự ghép gì thêm:
   * id này đi thẳng vào GMGameSDK.init(), canonical và config SDK quảng cáo.
   */
  gameId: 'rider-worlds-az',

  /**
   * Slug ở portal azgames.io — gid mà `gmsdkv2.js` gửi lên để lấy More Games, và trang portal redirect tới.
   * KHÁC `gameId`: portal slug KHÔNG có đuôi '-az'. Sai chỗ này thì More Games luôn rơi về trang chủ, im lặng.
   * Để null → build tự bỏ đuôi '-az' của gameId. Hỏi bên vận hành cho chắc.
   */
  portalGid: null,

  /** Shown on the loading screen. */
  gameName: 'Rider Worlds',

  /** Where the canonical link points. Publisher-level; rarely changes. */
  canonicalBase: 'https://azgames.io/',

  /**
   * A signature over the PUBLISHER's domain rather than over any one game, which is why it
   * transfers between their titles unchanged. Opaque from here: **if the portal ever rejects a
   * build, this is the first line to replace.**
   */
  signDomain:
    'eyJzaWduZWQiOiJJaHQ2XC9qdTRUWk15dTljNUhNbWNmekM2QWFmdXFIbGlqOFNcL1ZNNGJxOFVERXZ2czBwc3gwZUZQNEdWSkVWNmVFU2FMaGV1UERNMnEwOVVhUFRLODFJbVpVYnBpTndMXC9wNENcL2R2RWRkanlQK1RyUFFqazNLOUxOM0ZNRDluN0hSXC9ZblAxRmJYTkxoOG0zY3ZLT1JjaWdyXC9Na1JJQnV4SndQaWlvTlFMTVVPbkIzUmZUUkV1czBXbThJK3l4WEdzWUttSVhrT1lGT2hMXC8xb29NNG1hYWswMHZCaFwvZ2J1T09DRDBmZE82K2k3WVFuQUpvQUlBVTNtVXZUc0g4bWN3XC9qUmtTc3E5a2hWdktWVStnem4rZndveVpKWDFWTE00alwvUzZWdVF5SGJoSWEzM0d6U2hjUDZYQXpUUTBIOWpsc2pzNU83aEx4alVkUlcrSDFsZW9RPT0iLCJhcCI6InllcyIsImhuIjoiZ2FtZWEuYXpnYW1lLmlvIiwiZG9tYWluIjoiYXpnYW1lcy5pbyIsInMiOiJ5ZXMiLCJzdHlwZSI6Mn0=',

  /**
   * Firebase. **Bỏ trống thì build KHÔNG gửi gì lên Firebase** — chỉ còn nhánh GMSDK.
   *
   * Template Unity (`WebGLTemplates/gmsoft-v9/index.html`) dùng **một project DÙNG CHUNG cho
   * mọi game của nhà phát hành**: `gmsoft-sdk` / `G-XDMS45JLNT`. Đây là web config, vốn công
   * khai trong mọi trang dùng Firebase — không phải khoá bí mật.
   *
   * Dùng chung project thì mọi game nằm cùng một chỗ, phân biệt nhau bằng tham số. Muốn tách
   * riêng thì xin bên phát hành một project khác rồi thay cả khối này.
   */
  firebase: {
    apiKey: 'AIzaSyBiY5zIcLnzRHTXV2lBjhlPOaylnwF41IE',
    authDomain: 'gmsoft-sdk.firebaseapp.com',
    projectId: 'gmsoft-sdk',
    storageBucket: 'gmsoft-sdk.firebasestorage.app',
    messagingSenderId: '569176921901',
    appId: '1:569176921901:web:ec70fd1e07e97e02cfa5a4',
    measurementId: 'G-XDMS45JLNT',
  },

  /** `publisherHost` truyền vào `GMGameSDK.init`. Bên Unity là ProjectSettings companyName. */
  publisherHost: 'azgames.io',

  /** Host của GM SDK v2. Cũng là nơi nhận analytics (`/api/v1/events`) và leaderboard. */
  sdkHost: 'https://gm.azgame.io',

  /** Mã game (gid) bên vận hành cấp, dạng g131 (người dùng nhập G131). localStorage key = `azgames.<gameCode>`. docs/JSGMSDK.md B.3. */
  gameCode: 'g2610211044',

  /** Tên mặc định khi server trả profile rỗng (`UserModuleBase.Initialize` bên Unity). */
  defaultNamePrefix: 'player',
  defaultCountry: 'US',

  // ---- bố cục dự án (tools/build.mjs đọc) ---------------------------------------------------

  /** Nơi đặt bản build, tính từ gốc dự án (thư mục chứa JS_SDK_2.0/). Cho vào .gitignore. */
  buildsDir: 'Build',

  /** Thư mục web của game (chứa index.html) và module vào, tính từ gốc dự án / từ webDir. */
  webDir: '.',
  entry: 'src/main.js',

  /** Rider Worlds is a Vite project: vite.config.js honours GM_BUILD_OUT (entry -> framework.js, css -> css/style.css). */
  bundler: 'vite',

  /**
   * Config LÚC CHẠY của game (tầng src/sdk/ import): phải có gameId, confirmedFor khớp file này, và
   * `notice` (dòng bản quyền) + `appVersion` (version hiển thị). Mẫu: template/config.runtime.mjs.
   */
  runtimeConfig: 'src/config.mjs',
  /** module khoá dòng bản quyền (EXPECT). Mẫu: template/notice.js. docs/BUILD_RULES.md §1. */
  noticeModule: 'src/notice.js',

  /** Số file JS tối đa trong bản build. docs/JSGMSDK.md B.2. */
  maxJsFiles: 2,

  /** CSS của game: minify khi build + đổi .png -> .webp trong url(...). */
  cssFiles: ['css/style.css'],

  /** Đường dẫn (tính từ webDir) KHÔNG ship: ảnh gốc sao lưu, trang thử, file nháp. */
  exclude: [],

  /**
   * Bỏ file mà code không nhắc tới tên (nguyên văn 'name' hoặc name.ext trong src/, css, index.html).
   * Tên ghép động (`ant_${clip}`) phải có đủ danh sách trong mã, không thì liệt kê ở `keep`.
   * Để [] nếu không muốn tự bỏ file.
   */
  // Rider Worlds: assets are named by the exported JSON (manifest, prefabs, materials), not by the code -> no tracing
  trace: [],
  keep: [],

  /** File text khác có nhắc tên ảnh .png (manifest, atlas, level data…) — bước WebP đổi tên theo. */
  // webp.rewrite: ['assets/manifest.json'],

  /**
   * Kiểm bản build (tools/check_build.py): KHÔNG còn ghi chú dev, KHÔNG có tiếng Việt ngoài các file liệt kê
   * ở đây (bảng dịch tiếng Việt, menu chọn ngôn ngữ). docs/BUILD_RULES.md §2.
   */
  check: { allowVietnamese: [] },

  // ---- audio ---------------------------------------------------------------------------------

  audio: {
    /** Thư mục audio trong bản build. null = bỏ bước audio. */
    // Rider Worlds ships the .ogg exported from Unity; the mp3 re-encode would write MP3 data under .ogg names
    dir: null,
    /**
     * Nhạc = tên mà CODE gọi (regex, nhóm 1 = tên file không đuôi), không đoán theo kích thước / định dạng.
     * Mặc định bắt `playMusic('music_home')`.
     */
    musicPattern: String.raw`playMusic\(\s*['"]([\w-]+)['"]`,
    /** 'mp3' giữ MP3 (Safari/iOS đọc được, chỉ thay khi nén nhỏ hơn) | 'opus' (.ogg, nhỏ hơn, KHÔNG chạy Safari) */
    format: 'mp3',
    musicKbps: 96,
    musicStereo: true,
    effectKbps: 64,
  },

  // ---- images --------------------------------------------------------------------------------

  /**
   * **Câu hỏi không phải ảnh trông thế nào, mà là có cái gì ĐỌC nó không.** Xem README "Phân loại ảnh".
   * Ví dụ Ant Flow: lossy q90 cho cả img/ và art/ (UI vẽ nguyên tấm); lossless (perFile scale 1) cho sprite bị
   * nhuộm theo từng pixel (r_*), sprite sheet bị cắt khung (ant_*), ảnh bị gradient-map (nest).
   */
  webp: {
    /** Thư mục trong bản build chứa ảnh. */
    // Rider Worlds: PNG names live in hundreds of exported JSON files (prefabs / materials / manifest) and feed
    // three.js textures; the UI is already packed in WebP atlases -> the PNG -> WebP step is skipped
    dir: null,
    lossyDirs: [],
    lossyFiles: [],
    quality: 90,
    nearLosslessBits: {},
    nearLosslessSkip: [],
    exact: true,
    perFile: {},
    rewrite: [],
  },
};
