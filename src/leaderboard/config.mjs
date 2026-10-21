/**
 * Rider Worlds: leaderboard-highscore, given by the portal operator (2026-10-21).
 *
 * **File duy nhất cần sửa khi mang bộ này sang game mới.**
 *
 * Không có giá trị nào ở đây đoán được từ code — tất cả do bên portal cấp. Sai một cái thì
 * điểm vẫn gửi đi, server vẫn trả 200, nhưng **không lên bảng nào cả**. Nên đối chiếu từng
 * dòng với bên vận hành trước khi phát hành.
 */
export const leaderboardConfig = {
  // ---- danh tính ------------------------------------------------------------------------

  /**
   * Board nào **bên trong** game. `gameKey` (game nào) và `sdkHost` / `publisherHost` KHÔNG
   * ở đây — chúng thuộc `JS_GMSDK/config.mjs`, vì tầng SDK mới là chỗ gọi `init()`.
   */
  leaderboardId: 'leaderboard-highscore',

  /**
   * **XÁC NHẬN, không phải mặc định.** Phải bằng đúng `leaderboardId` ở trên.
   *
   * Cùng cơ chế với `confirmedFor` bên JS_GMSDK: đổi board mà quên xác nhận thì mọi thao tác
   * bị từ chối kèm hướng dẫn, thay vì lặng lẽ nộp điểm vào bảng của game khác.
   */
  confirmedBoard: 'leaderboard-highscore',

  /**
   * Khoá ký điểm, HMAC-SHA256, hex thường. = `GMBridge.ScoreSigningKeyHex`
   * (Assets/Plugins/GMService/Runtime/Bridge.cs).
   *
   * Bản Unity WebGL cũng nhúng đúng khoá này vào wasm và gửi tới mọi client — **không phải
   * bí mật của server**, để trong code client là đúng thiết kế. Nhưng **thiếu token thì
   * server từ chối submit**: `gm-sdk.js` KHÔNG tự ký.
   */
  scoreSigningKeyHex: '177733f1c6aab38d236300699d99516efc89758aff6f9498eea96b8af44cb582',

  // ---- kỳ hạn ---------------------------------------------------------------------------

  /**
   * Tab của UI → kỳ hạn backend. Một bảng, bốn kỳ hạn — không phải bốn bảng riêng.
   * Bỏ bớt tab thì xoá dòng ở đây, UI tự theo.
   */
  periods: {
    today: 'daily',
    week: 'weekly',
    month: 'monthly',
    alltime: 'alltime',
  },

  // ---- hiển thị -------------------------------------------------------------------------

  /** Số dòng mỗi trang. Bản Unity dùng 10. */
  pageSize: 10,

  // Tên mặc định, cờ mặc định và tiền tố localStorage KHÔNG ở đây: chúng là danh tính người
  // chơi, thuộc JS_GMSDK/config.mjs. Bộ này chỉ lo bảng xếp hạng.
};
