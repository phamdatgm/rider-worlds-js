/**
 * Cài JS_SDK_2.0 vào một dự án. **Chỉ hỏi 3 thứ**, chỉ bên vận hành portal mới biết nên không đoán được:
 *
 *   1. tên game        vd: Soccer Kick
 *   2. ID game         vd: soccer-kick-az      (chép nguyên văn, kể cả đuôi)
 *   3. mã game (gid)   vd: G131                (giữ chữ G; lưu thành localStorage key azgames.g131)
 *
 * Mọi thứ còn lại có MẶC ĐỊNH và được in ra ở cuối để người dùng xem, rồi chỉnh nếu muốn.
 *
 *   node JS_SDK_2.0/tools/setup.mjs                                   hỏi từng câu (terminal)
 *   node JS_SDK_2.0/tools/setup.mjs --name "Soccer Kick" --id soccer-kick-az --gid G131     (AI / script: không hỏi)
 *   node JS_SDK_2.0/tools/setup.mjs --info                            chỉ in thông tin game hiện tại
 *
 * Tuỳ chọn (đổi mặc định): --version 1.0  --notice "© 2026 Azgames.io"  --language en  --web web  --sign <base64>  --yes
 * `--yes` = cho phép ghi đè config.mjs đã có.
 *
 * Vì sao là script chứ không phải "tự sửa file theo hướng dẫn": config đi kèm kit mang danh tính của game TRƯỚC, nên
 * copy rồi quên sửa là số liệu game mới chảy sang game cũ mà không một dấu hiệu nào. Bắt nhập ra từng giá trị là cách
 * duy nhất chắc chắn đã đi hỏi.
 *
 * Chỉ ghi file CHƯA có (khung dự án); không bao giờ đè file của game.
 */
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, appendFileSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlaceholder } from '../sdk/placeholders.js';

const kit = dirname(dirname(fileURLToPath(import.meta.url)));   // .../JS_SDK_2.0
const root = dirname(kit);
const kitName = basename(kit);

// ---- tham số dòng lệnh -----------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined; };

// ---- câu hỏi: tương tác hoặc pipe -----------------------------------------------------------
const piped = !process.stdin.isTTY;
let queue = [];
if (piped && !argv.length) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  queue = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
}
const rl = !piped ? createInterface({ input: process.stdin, output: process.stdout }) : null;

async function ask(label) {
  if (piped) {
    if (!queue.length) return null;
    const a = queue.shift().trim();
    console.log(`${label}: ${a}`);
    return a;
  }
  return ((await rl.question(`${label}: `)) ?? '').trim();
}

/** Giá trị từ tham số, không có thì hỏi; hỏi lại tới khi hợp lệ. Hết đầu vào (không phải TTY) -> trả null. */
async function need(optName, label, check) {
  let v = opt(optName);
  for (;;) {
    if (v === undefined) v = await ask(label);
    if (v === null) return null;
    const bad = isPlaceholder(v) ? 'đây là giá trị mẫu hoặc id của game khác — hỏi bên vận hành portal' : check(v);
    if (!bad) return v;
    console.log(`  ^ ${bad}`);
    if (opt(optName) !== undefined) return null;
    v = undefined;
  }
}

// ---- đọc / ghi config ----------------------------------------------------------------------
function setValue(src, key, value) {
  const literal = value === null ? 'null' : typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "\\'")}'`;
  const re = new RegExp(`^(\\s*)${key}:[^\\n]*?,(\\s*//[^\\n]*)?$`, 'm');
  if (!re.test(src)) throw new Error(`không tìm thấy khoá "${key}" trong config.example.mjs`);
  return src.replace(re, `$1${key}: ${literal},`);
}

const cfgPath = join(kit, 'config.mjs');

/** Thông tin game hiện tại từ config.mjs + index.html (để in ra cho người dùng). */
async function currentInfo() {
  const { config } = await import(`${join(kit, 'config.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:')}?t=${Date.now()}`);
  const web = join(root, config.webDir ?? 'web');
  const rt = existsSync(join(web, 'src', 'config.mjs')) ? readFileSync(join(web, 'src', 'config.mjs'), 'utf8') : '';
  const page = existsSync(join(web, 'index.html')) ? readFileSync(join(web, 'index.html'), 'utf8') : '';
  const pick = (t, k) => new RegExp(`${k}:\\s*'([^']*)'`).exec(t)?.[1];
  return {
    gameName: config.gameName, gameId: config.gameId, gameCode: config.gameCode,
    portalGid: config.portalGid ?? config.gameId.replace(/-az$/, ''),
    language: pick(page, 'language') ?? 'en', version: pick(rt, 'appVersion') ?? '1.0', notice: pick(rt, 'notice') ?? '© 2026 Azgames.io',
    webDir: config.webDir ?? 'web', signDomain: !!config.signDomain, firebase: config.firebase?.projectId ?? null,
    sdkHost: config.sdkHost, publisherHost: config.publisherHost, audio: config.audio?.format ?? 'mp3', maxJs: config.maxJsFiles ?? 2,
  };
}

function printInfo(i, title) {
  const w = (a, b, c) => console.log(`  ${a.padEnd(18)} ${String(b).padEnd(30)} ${c}`);
  console.log(`\n${title}`);
  console.log(`  ${'MỤC'.padEnd(18)} ${'GIÁ TRỊ'.padEnd(30)} CHỈNH Ở ĐÂU`);
  w('Tên game', i.gameName, `${kitName}/config.mjs: gameName (+ <title>, tiêu đề màn loading trong index.html)`);
  w('Game ID (SDK)', i.gameId, `${kitName}/config.mjs: gameId + AZ_SETTINGS.gameId + GM_GAME.id`);
  w('Mã game (gid)', i.gameCode, `${kitName}/config.mjs: gameCode + AZ_SETTINGS.gameCode  -> localStorage key azgames.${i.gameCode}`);
  w('Portal slug', i.portalGid, `AZ_SETTINGS.portalGid (bỏ đuôi -az của Game ID)`);
  w('Ngôn ngữ mặc định', i.language, `AZ_SETTINGS.language trong index.html (cần file Language/${i.language}.json)`);
  w('Version hiển thị', i.version, `${i.webDir}/src/config.mjs: appVersion`);
  w('Bản quyền', i.notice, `${i.webDir}/src/config.mjs: notice, rồi chạy node ${kitName}/tools/notice-hash.mjs`);
  w('Thư mục web', i.webDir, `${kitName}/config.mjs: webDir`);
  w('signDomain', i.signDomain ? 'có (của publisher)' : 'CHƯA CÓ', `${kitName}/config.mjs: signDomain (chung cho publisher)`);
  w('Firebase', i.firebase ? `${i.firebase} (dùng chung)` : 'không', `${kitName}/config.mjs: firebase`);
  w('SDK host', i.sdkHost, `${kitName}/config.mjs: sdkHost`);
  w('Audio', i.audio, `${kitName}/config.mjs: audio.format (mp3 | opus)`);
  w('Số file JS tối đa', i.maxJs, `${kitName}/config.mjs: maxJsFiles`);
}

// ---- chạy ---------------------------------------------------------------------------------
if (flag('info')) {
  if (!existsSync(cfgPath)) { console.log('Chưa cài: chưa có config.mjs. Chạy setup.mjs để cài.'); process.exit(0); }
  printInfo(await currentInfo(), 'Thông tin game hiện tại:');
  process.exit(0);
}

const haveArgs = ['name', 'id', 'gid'].some((n) => opt(n) !== undefined);
if (existsSync(cfgPath) && !flag('yes')) {
  console.log(`${kitName}/config.mjs đã có (game này đã được cài).`);
  printInfo(await currentInfo(), 'Thông tin game hiện tại:');
  console.log(`\nMuốn cài lại cho game khác: thêm --yes. Muốn đổi một giá trị: sửa ở cột "CHỈNH Ở ĐÂU".`);
  await rl?.close();
  process.exit(haveArgs ? 1 : 0);
}

console.log(`\nCài ${kitName} cho một game mới. Ba giá trị dưới đây CHỈ bên vận hành portal biết — đừng đoán, đừng lấy của game cũ.\n`);
const gameName = await need('name', 'Tên game hiển thị (vd: Soccer Kick)', (v) => (v.length > 60 ? 'tên dài quá 60 ký tự' : ''));
const gameId = await need('id', 'ID game bên vận hành cấp, nguyên văn kể cả đuôi (vd: soccer-kick-az)', (v) => (/^[a-z0-9][a-z0-9-]*$/.test(v) ? '' : 'id chỉ gồm chữ thường, số và dấu gạch ngang'));
const gidRaw = await need('gid', 'Mã game (gid), giữ chữ G (vd: G131)', (v) => (/^g\d+$/i.test(v) ? '' : 'mã game có dạng G131 (chữ G + số)'));
const missing = [['--name', gameName, 'tên game'], ['--id', gameId, 'ID game (có đuôi -az)'], ['--gid', gidRaw, 'mã game dạng G131']].filter((m) => !m[1]).map((m) => `${m[0]} (${m[2]})`);
if (missing.length) {
  console.error(`\nCòn thiếu: ${missing.join(', ')}.\nHỏi người dùng rồi chạy lại, vd:\n  node ${kitName}/tools/setup.mjs --name "Soccer Kick" --id soccer-kick-az --gid G131`);
  await rl?.close();
  process.exit(1);
}
const gameCode = gidRaw.toLowerCase();            // G131 -> g131: dạng dùng trong key azgames.g131
const portalGid = gameId.replace(/-az$/, '');

// mặc định (đổi bằng tham số)
const appVersion = opt('version') ?? '1.0';
const notice = opt('notice') ?? `© ${new Date().getFullYear()} Azgames.io`;
const language = (opt('language') ?? 'en').toLowerCase();
if (!/^[a-z]{2,3}$/.test(language)) throw new Error('--language: mã 2-3 chữ thường, vd en');
const webDir = opt('web') ?? ['web', 'webs', 'public', 'www', 'game'].find((d) => existsSync(join(root, d, 'index.html'))) ?? 'web';
const signDomain = opt('sign');

// ---- config.mjs của kit ---------------------------------------------------------------------
{
  let out = readFileSync(join(kit, 'config.example.mjs'), 'utf8');
  for (const [k, v] of Object.entries({ confirmedFor: gameId, gameId, gameName, gameCode, webDir, ...(signDomain ? { signDomain } : {}) })) out = setValue(out, k, v);
  writeFileSync(cfgPath, out);
  console.log(`  đã ghi ${kitName}/config.mjs`);
}

// ---- config lúc chạy + khoá bản quyền (không đè nếu đã có) ------------------------------------
{
  const src = join(root, webDir, 'src');
  mkdirSync(src, { recursive: true });
  let x = 0x811c9dc5;
  for (const ch of notice) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
  const expect = `0x${x.toString(16).padStart(8, '0')}`;
  const rc = join(src, 'config.mjs'), nm = join(src, 'notice.js');
  if (!existsSync(rc)) {
    const t = readFileSync(join(kit, 'template', 'config.runtime.mjs'), 'utf8')
      .replace(/confirmedFor: null,/, `confirmedFor: '${gameId}',`).replace(/gameId: 'idgame',/, `gameId: '${gameId}',`)
      .replace(/gameName: 'tengame',/, `gameName: '${gameName.replace(/'/g, "\\'")}',`).replace(/gameCode: 'g0',/, `gameCode: '${gameCode}',`)
      .replace(/appVersion: '[^']*',/, `appVersion: '${appVersion}',`).replace(/notice: '[^']*',/, `notice: '${notice.replace(/'/g, "\\'")}',`);
    writeFileSync(rc, t);
    console.log(`  đã ghi ${webDir}/src/config.mjs`);
  } else console.log(`  ${webDir}/src/config.mjs đã có — kiểm gameId/gameCode/appVersion/notice cho khớp`);
  if (!existsSync(nm)) {
    writeFileSync(nm, readFileSync(join(kit, 'template', 'notice.js'), 'utf8').replace(/export const EXPECT = 0x[0-9a-f]+;.*/i, `export const EXPECT = ${expect};`));
    console.log(`  đã ghi ${webDir}/src/notice.js (EXPECT ${expect})`);
  } else console.log(`  ${webDir}/src/notice.js đã có — EXPECT cho "${notice}" là ${expect}`);
}

// ---- dựng khung dự án: CHỈ ghi file chưa có ------------------------------------------------------
{
  const web = join(root, webDir);
  const created = [];
  const put = (from, to) => {
    if (existsSync(to)) return;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    created.push(to.slice(root.length + 1).replace(/\\/g, '/'));
  };
  const putDir = (fromDir, toDir) => {
    for (const f of readdirSync(fromDir, { withFileTypes: true })) {
      if (f.isDirectory()) putDir(join(fromDir, f.name), join(toDir, f.name));
      else put(join(fromDir, f.name), join(toDir, f.name));
    }
  };
  putDir(join(kit, 'sdk'), join(web, 'src', 'sdk'));
  put(join(kit, 'template', 'loading.js'), join(web, 'src', 'loading.js'));
  put(join(kit, 'template', 'main.example.js'), join(web, 'src', 'main.js'));
  put(join(kit, 'template', 'css', 'style.css'), join(web, 'css', 'style.css'));
  putDir(join(kit, 'template', 'Language'), join(web, 'Language'));
  putDir(join(kit, 'template', 'Icons'), join(web, 'Icons'));

  const page = join(web, 'index.html');
  if (!existsSync(page)) {
    writeFileSync(page, readFileSync(join(kit, 'template', 'index.html'), 'utf8')
      .replaceAll('__GAME_NAME__', gameName).replaceAll('__GAME_ID__', gameId).replaceAll('__GAME_CODE__', gameCode)
      .replaceAll('__PORTAL_GID__', portalGid).replaceAll('__LANG__', language));
    created.push(`${webDir}/index.html`);
  } else {
    console.log(`\n  ${webDir}/index.html đã có: cần thêm khối AZ_SETTINGS (xem ${kitName}/template/index.html) và màn loading (${kitName}/template/loading.html):`);
    console.log(`    window.AZ_SETTINGS = { gameCode: '${gameCode}', language: '${language}', gameId: '${gameId}', portalGid: '${portalGid}' };`);
  }

  const pkgPath = join(root, 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: portalGid, version: '1.0.0', private: true, type: 'module' };
  pkg.scripts = { ...(pkg.scripts ?? {}), build: `node ${kitName}/tools/build.mjs` };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const gi = join(root, '.gitignore');
  const have = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  const add = ['Build/', 'node_modules/'].filter((l) => !have.split(/\r?\n/).includes(l));
  if (add.length) appendFileSync(gi, (have && !have.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n');

  if (created.length) console.log(`\n  đã tạo ${created.length} file khung:\n    ${created.join('\n    ')}`);
}

await rl?.close();

printInfo(await currentInfo(), 'ĐÃ CÀI. Thông tin game (gồm cả các mục mặc định — muốn đổi mục nào thì nói, hoặc sửa ở cột bên phải):');
console.log(`
Còn lại:
  1. npm i -D esbuild javascript-obfuscator ffmpeg-static     (cần thêm Python 3 + Pillow cho bước WebP)
  2. Thay ${webDir}/Icons/web.png và ${webDir}/Icons/loading.webp bằng ảnh của game (build dừng nếu còn là ảnh mẫu).
  3. Game có panel Settings chưa? Version + "${notice}" phải hiện ở đó (docs/BUILD_RULES.md §1); chưa có thì HỎI người dùng muốn đặt ở đâu.
  4. npm run build   (build in lại bảng thông tin này; sai thì DỪNG và nói rõ)`);
