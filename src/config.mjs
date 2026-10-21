// MẪU config LÚC CHẠY — copy thành <webDir>/src/config.mjs. Tầng src/sdk/ và src/notice.js import file này.
// PHẢI khớp JS_SDK_2.0/config.mjs (gameId, confirmedFor): tools/build.mjs dừng nếu lệch.
export const config = {
  confirmedFor: 'rider-worlds-az',          // <- = gameId sau khi đã HỎI bên vận hành
  gameId: 'rider-worlds-az',            // id SDK do bên vận hành cấp, nguyên văn (thường có đuôi -az)
  portalGid: null,             // slug portal (không -az); null = bỏ đuôi -az của gameId
  gameName: 'Rider Worlds',
  publisherHost: 'azgames.io',
  sdkHost: 'https://gm.azgame.io',
  gameCode: 'g2610211044',               // mã game (gid) bên vận hành cấp, vd g131 -> localStorage key azgames.g131
  defaultNamePrefix: 'player',
  defaultCountry: 'US',

  // Save keys of the builds made before the SDK; sdk/storage.js folds them into azgames.<gameCode> once, then
  // removes them (src/meta/save.js reads the "save" area, and migrates the v1 document from "saveV1")
  legacyKeys: { 'rider-worlds-save-v2': 'save', 'rider-worlds-save-v1': 'saveV1' },

  // Link dự phòng nút More Games khi portal không điền GMSOFT_GAME_INFO.more_games_url — xin `gid` (G123). docs/MOREGAMES.md
  moreGamesUrl: 'https://azgames.io/',

  // Chân panel Settings (docs/BUILD_RULES.md §1): version góc dưới trái, bản quyền góc dưới phải.
  // `notice` bị KHOÁ bằng EXPECT trong src/notice.js — đổi thì chạy `node JS_SDK_2.0/tools/notice-hash.mjs`.
  appVersion: '1.0',
  notice: '© 2026 Azgames.io',
};
