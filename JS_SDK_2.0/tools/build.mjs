// Bản build cho azgames.io / GMSDK — chung cho mọi game, cấu hình ở JS_SDK_2.0/config.mjs. Quy tắc: docs/BUILD_RULES.md.
//
//   node JS_SDK_2.0/tools/build.mjs            (version tự tính: YYMMDD + số thứ tự trong ngày)
//   node JS_SDK_2.0/tools/build.mjs 26100501   (ép version)
//   NO_OPEN=1 node JS_SDK_2.0/tools/build.mjs  (không mở Explorer)
//
// config.bundler = 'vite' (dự án Vite, vd Flip Physics): bước 1–2 thay bằng `vite build` ra thẳng thư mục bản build
// (vite.config.js đọc GM_BUILD_OUT: entry -> framework.js, define __GM_BUILD__); các bước sau giữ nguyên.
//
// Mọi bước làm trong BẢN SAO — thư mục web giữ nguyên PNG/MP3 cho dev.
//   0. cổng danh tính: confirmedFor = gameId, khớp giữa config build / config lúc chạy / GM_GAME trong index.html
//   1. chép web (trừ config.exclude); bỏ ảnh/font mà code không nhắc tới (config.trace)
//   2. esbuild gộp -> framework.js (chỉ minify, bỏ hết ghi chú); css minify
//   3. loader.js: kiểm dòng bản quyền, đặt __gmnk, nạp framework.js (thử lại 3 lần, hỏng thì báo trên màn loading)
//      — file DUY NHẤT làm rối mạnh (javascript-obfuscator)
//   4. index.html trỏ sang loader.js, đóng dấu version / id / title
//   5. audio nén lại (mp3 giữ mp3 — Safari/iOS; hoặc opus); nhạc = tên mà code gọi qua config.audio.musicPattern
//   6. PNG -> WebP theo config.webp; mọi file text ship ra đổi .png -> .webp theo
//   7. vỏ portal (mẫu azgames_v1): <base>, gm-sdk.js + gm-iframe.js (v3), GMSOFT_SIGNED, gmsdkv2.js (portalGid), Firebase, global ở cuối body
//   0b. cổng chuẩn docs/JSGMSDK.md: AZ_SETTINGS (gameCode/language/gameId/portalGid), gameCode, Language/*.json, Icons/, localStorage chỉ ở sdk/storage.js, bản quyền
//   8. gỡ ghi chú trong trang ship (trừ khối AZ_SETTINGS); preview.html = chép nguyên index.html; 8b. tools/check_build.py quét LẠI mọi file: còn ghi chú / tiếng Việt -> DỪNG
//
// devDependencies: esbuild, javascript-obfuscator, ffmpeg-static (tuỳ chọn). Python + Pillow cho WebP và kiểm tra.
// Bản build cũ của kit (game khác, có build-dist/reanim/manifest): tools/legacy/build-tiny-garden-war.mjs

import { build, transform } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config.mjs';

const kitRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(kitRoot);
const web = join(root, config.webDir ?? 'web');
const buildsRoot = join(root, config.buildsDir ?? 'Build');
const RUNTIME_CFG = config.runtimeConfig ?? 'src/config.mjs';
const NOTICE_MODULE = config.noticeModule ?? 'src/notice.js';
const CSS_FILES = config.cssFiles ?? [];
const BUNDLE = 'framework.js';   // đổi tên ở ĐÂY: bước 6 rewrite .png trong các file này
const LOADER = 'loader.js';
const PY = ['python', 'python3', 'py'];

function runPython(args, label) {
  for (const py of PY) {
    try { return execFileSync(py, args, { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf8' } }); } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw new Error(`${label}:\n${e.stdout ?? ''}${e.stderr ?? e.message}`);
    }
  }
  return null;   // không có python
}

// ---- version: YYMMDD + số thứ tự trong ngày --------------------------------------------------
function todaysVersion() {
  const now = new Date();
  const stamp = String(now.getFullYear() % 100).padStart(2, '0')
    + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  let counter = 1;
  if (existsSync(buildsRoot)) {
    for (const entry of readdirSync(buildsRoot)) {
      const seen = /^(\d{8})$/.exec(entry) ?? /-v(\d{8})_/.exec(entry);
      if (seen && seen[1].startsWith(stamp)) counter = Math.max(counter, Number(seen[1].slice(6)) + 1);
    }
  }
  return stamp + String(counter).padStart(2, '0');
}

// ---- 0. cổng danh tính --------------------------------------------------------------------------
if (config.confirmedFor !== config.gameId) {
  throw new Error(`config.mjs: confirmedFor '${config.confirmedFor}' != gameId '${config.gameId}'`
    + ' — ask the portal operator, fill in the identity block, then set confirmedFor = gameId');
}
const runtimeText = readFileSync(join(web, RUNTIME_CFG), 'utf8');
for (const key of ['gameId', 'confirmedFor']) {
  const v = new RegExp(`${key}:\\s*'([^']+)'`).exec(runtimeText)?.[1];
  if (v !== config[key]) throw new Error(`${key} mismatch: JS_SDK_2.0/config.mjs '${config[key]}' vs ${RUNTIME_CFG} '${v}'`);
}
{
  const pageId = /GM_GAME\s*=\s*\{\s*id:\s*'([^']+)'/.exec(readFileSync(join(web, 'index.html'), 'utf8'))?.[1];
  if (pageId !== config.gameId) throw new Error(`index.html GM_GAME.id '${pageId}' != gameId '${config.gameId}'`);
}

// ---- 0b. cổng chuẩn docs/JSGMSDK.md --------------------------------------------------------------------
const AZ_BLOCK = /\/\* ===== AZGAMES SETTINGS ===== \*\/[\s\S]*?\/\* =+ \*\//;
const sourcePage = readFileSync(join(web, 'index.html'), 'utf8');
const azBlock = AZ_BLOCK.exec(sourcePage)?.[0];
const az = {};
if (!azBlock) throw new Error('index.html: AZGAMES SETTINGS block (window.AZ_SETTINGS) not found (docs/JSGMSDK.md B.7)');
for (const k of ['gameCode', 'language', 'gameId', 'portalGid']) {
  az[k] = new RegExp(`${k}:\\s*'([^']*)'`).exec(azBlock)?.[1];
  if (!az[k]) throw new Error(`index.html AZ_SETTINGS.${k} is missing`);
}
const portalGid = config.portalGid ?? config.gameId.replace(/-az$/, '');
if (!/^g\d+$/.test(az.gameCode) || /^g0+$/.test(az.gameCode)) throw new Error(`AZ_SETTINGS.gameCode '${az.gameCode}' must look like g598 (ask the portal operator)`);
if (az.gameCode !== config.gameCode) throw new Error(`AZ_SETTINGS.gameCode '${az.gameCode}' != config.gameCode '${config.gameCode}'`);
if (az.gameId !== config.gameId) throw new Error(`AZ_SETTINGS.gameId '${az.gameId}' != config.gameId '${config.gameId}'`);
if (az.portalGid !== portalGid) throw new Error(`AZ_SETTINGS.portalGid '${az.portalGid}' != '${portalGid}'`);

const langDir = join(web, 'Language');
const langs = existsSync(langDir) ? readdirSync(langDir).filter((f) => /^[a-z]{2,3}\.json$/.test(f)).map((f) => f.slice(0, -5)) : [];
if (!langs.includes('en')) throw new Error('Language/en.json is missing (docs/JSGMSDK.md B.5)');
if (!langs.includes(az.language)) throw new Error(`AZ_SETTINGS.language '${az.language}' has no Language/${az.language}.json`);
const langTables = {};
for (const code of langs) {
  const t = JSON.parse(readFileSync(join(langDir, `${code}.json`), 'utf8'));
  for (const [k, v] of Object.entries(t)) if (typeof v !== 'string') throw new Error(`Language/${code}.json: '${k}' is not a string`);
  langTables[code] = t;
}
for (const code of langs.filter((c) => c !== 'en')) {
  const missing = Object.keys(langTables.en).filter((k) => !(k in langTables[code])).length;
  const orphan = Object.keys(langTables[code]).filter((k) => !(k in langTables.en));
  if (missing) console.warn(`language: ${code}.json lacks ${missing} key(s) of en.json (falls back to English)`);
  if (orphan.length) console.warn(`language: ${code}.json has ${orphan.length} key(s) not in en.json: ${orphan.slice(0, 3).join(', ')}`);
}

for (const f of ['web.png', 'loading.webp', 'domain.webp']) {
  if (!existsSync(join(web, 'Icons', f))) throw new Error(`Icons/${f} is missing (docs/JSGMSDK.md B.6)`);
}
// the game's own web icon + loading key art: a copy of the kit's sample is a forgotten swap
for (const f of ['web.png', 'loading.webp']) {
  const sample = join(kitRoot, 'template', 'Icons', f), mine = join(web, 'Icons', f);
  const h = (x) => createHash('sha256').update(readFileSync(x)).digest('hex');
  if (existsSync(sample) && h(sample) === h(mine)) throw new Error(`Icons/${f} is still the kit's SAMPLE image - replace it with the game's own (docs/JSGMSDK.md B.6)`);
}

// source scan: t('key') keys exist in en.json; localStorage only in sdk/storage.js; the game shows the copyright line
const srcRoot = join(web, 'src');
const srcFiles = readdirSync(srcRoot, { recursive: true }).filter((f) => /\.m?js$/.test(f)).map((f) => join(srcRoot, f));
const noComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const missingKeys = new Set(), storageUsers = [];
for (const f of srcFiles) {
  const text = noComments(readFileSync(f, 'utf8'));
  // only a complete literal argument counts: t("play") yes, t("rank_" + n) no (built at runtime)
  for (const m of text.matchAll(/\bt\(\s*(["'`])([A-Za-z0-9_.-]+)\1\s*[,)]/g)) if (!(m[2] in langTables.en)) missingKeys.add(m[2]);
  if (/\blocalStorage\b/.test(text) && relative(web, f).replace(/\\/g, '/') !== 'src/sdk/storage.js') storageUsers.push(relative(web, f));
}
if (missingKeys.size) throw new Error(`t('key') used in source but missing from Language/en.json: ${[...missingKeys].slice(0, 8).join(', ')}`);
if (storageUsers.length) throw new Error(`localStorage may only be used in src/sdk/storage.js; also found in: ${storageUsers.join(', ')}`);

async function askLine(q) {
  if (!process.stdin.isTTY) return null;
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(q)).trim(); } finally { rl.close(); }
}
let copyrightAt = null;
{
  const rt = readFileSync(join(web, RUNTIME_CFG), 'utf8');
  const line = /notice:\s*'([^']+)'/.exec(rt)?.[1];
  const shownIn = line ? srcFiles.filter((f) => !/[\\/](config\.mjs|notice\.js)$/.test(f))
    .filter((f) => /\bNOTICE\b/.test(readFileSync(f, 'utf8')) || readFileSync(f, 'utf8').includes(line)).map((f) => relative(web, f).replace(/\\/g, '/')) : [];
  if (shownIn.length) copyrightAt = shownIn[0];
  else if (config.copyright?.confirmedAt) copyrightAt = `${config.copyright.confirmedAt} (confirmed in config)`;
  else {
    const a = await askLine(`Cannot find where the game shows "${line ?? '© 2026 Azgames.io'}". Is it there already? Where? (empty = no): `);
    if (!a) throw new Error('copyright line "© 2026 Azgames.io" not found in the game (docs/JSGMSDK.md B.8) - add it (docs/BUILD_RULES.md §1), or set config.copyright.confirmedAt');
    const ok = await askLine(`"${a}" - does it match the SDK rule (shows the line, locked by FNV-1a)? (y/N): `);
    if (!/^y/i.test(ok ?? '')) throw new Error('copyright location not confirmed');
    copyrightAt = `${a} (confirmed by user)`;
  }
}

const version = process.argv[2] ?? todaysVersion();
if (!/^\d{8}$/.test(version)) throw new Error(`version must be 8 digits (YYMMDDNN), got ${version}`);
const portal = join(buildsRoot, version);
const dist = join(portal, version);

rmSync(portal, { recursive: true, force: true });
mkdirSync(buildsRoot, { recursive: true });

// identity summary + "did it change since the last build?" (docs/JSGMSDK.md B.9)
{
  const ident = { gameName: config.gameName, gameId: config.gameId, portalGid, gameCode: az.gameCode, firebase: config.firebase?.projectId ?? null };
  const idFile = join(buildsRoot, 'identity.json');
  const prev = existsSync(idFile) ? JSON.parse(readFileSync(idFile, 'utf8')) : null;
  const pickRt = (k) => new RegExp(`${k}:\\s*'([^']*)'`).exec(readFileSync(join(web, RUNTIME_CFG), 'utf8'))?.[1] ?? '?';
  const row = (a, b, c) => console.log(`  ${a.padEnd(18)} ${String(b).padEnd(30)} ${c}`);
  console.log('\nGame info (this build):');
  row('Game', ident.gameName, 'config.mjs: gameName');
  row('Game ID (SDK)', ident.gameId, 'config.mjs: gameId + AZ_SETTINGS.gameId');
  row('Game code (gid)', `${ident.gameCode}  -> azgames.${ident.gameCode}`, 'config.mjs: gameCode + AZ_SETTINGS.gameCode');
  row('Portal slug', ident.portalGid, 'AZ_SETTINGS.portalGid');
  row('Default language', `${az.language}  (Language/: ${langs.join(' ')})`, 'AZ_SETTINGS.language in index.html');
  row('Version shown', pickRt('appVersion'), `${RUNTIME_CFG}: appVersion`);
  row('Copyright', `${pickRt('notice')} (in ${copyrightAt})`, `${RUNTIME_CFG}: notice (+ EXPECT, notice-hash.mjs)`);
  row('Firebase', `${ident.firebase ?? 'none'} (shared)`, 'config.mjs: firebase');
  row('SDK host', config.sdkHost, 'config.mjs: sdkHost');
  row('Audio', `${config.audio?.format ?? 'mp3'}`, 'config.mjs: audio.format');
  row('Max JS files', config.maxJsFiles ?? 2, 'config.mjs: maxJsFiles');
  console.log('');
  const changed = prev && ['gameId', 'portalGid', 'gameCode'].filter((k) => prev[k] !== undefined && prev[k] !== ident[k]);
  if (changed?.length) {
    const a = await askLine(`Identity changed since the last build (${changed.map((k) => `${k}: ${prev[k]} -> ${ident[k]}`).join(', ')}). Did you ask the portal operator? (y/N): `);
    if (!/^y/i.test(a ?? '')) throw new Error('identity changed and not confirmed - ask the portal operator, then rebuild and answer y');
  }
  writeFileSync(idFile, JSON.stringify(ident, null, 2));
}

const VITE = config.bundler === 'vite';

// ---- 1. chép web, bỏ thứ không ship ----------------------------------------------------------
if (VITE) {
  // Vite gộp + minify JS/CSS (bỏ ghi chú), chép public/ -> bản build; entry tên cố định framework.js
  execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn'],
    { cwd: root, stdio: 'inherit', env: { ...process.env, GM_BUILD_OUT: dist } });
  if (!existsSync(join(dist, BUNDLE))) throw new Error(`vite build did not produce ${BUNDLE} (vite.config.js must honour GM_BUILD_OUT)`);
}
const excluded = new Set((config.exclude ?? []).map((p) => join(web, p)));
if (!VITE) cpSync(web, dist, { recursive: true, filter: (src) => !excluded.has(src) && !/[\\/]node_modules([\\/]|$)/.test(src) });

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const srcDir = join(web, dirname(config.entry ?? 'src/main.js'));
const sourceText = [
  ...readdirSync(srcDir, { recursive: true }).filter((f) => /\.m?js$/.test(f)).map((f) => join(srcDir, f)),
  ...CSS_FILES.map((f) => join(web, f)), join(web, 'index.html'),
].filter(existsSync).map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');

// Ảnh/font code không nhắc tới thì không ship: tên phải xuất hiện nguyên văn ('name' hoặc name.ext) trong mã.
// Tên ghép động (`ant_${clip}`) thì phải có danh sách đầy đủ trong mã, không thì thêm vào config.keep.
const dropped = [];
// `data`: thư mục (trong bản build) mà tên còn có thể nằm trong dữ liệu (json / glb) thay vì trong mã — vd tên texture
// trong file level. Đọc glb như latin1 để tìm chuỗi ASCII.
const dataText = (dirs) => (dirs ?? []).flatMap((d) => {
  const abs = join(dist, d);
  return existsSync(abs) ? readdirSync(abs).map((f) => readFileSync(join(abs, f), /\.(json|txt)$/.test(f) ? 'utf8' : 'latin1')) : [];
}).join('\n');
for (const { dir, ext, data, exact } of config.trace ?? []) {
  const abs = join(dist, dir);
  if (!existsSync(abs)) continue;
  const extra = dataText(data);
  for (const f of readdirSync(abs)) {
    if (extname(f) !== ext) continue;
    const name = basename(f, ext);
    if ((config.keep ?? []).includes(f)) continue;
    // exact: chỉ tính `name.ext` (vd font: 'Bangers' trong font-family không có nghĩa là Bangers.ttf được dùng)
    const used = sourceText.includes(`${name}${ext}`) || (!exact && new RegExp(`['"\`]${name}['"\`]`).test(sourceText))
      || (extra && extra.includes(name));
    if (!used) { rmSync(join(abs, f)); dropped.push(`${dir}/${f}`); }
  }
}
if (dropped.length) console.log(`assets: dropped ${dropped.length} file(s) the code never names: ${dropped.join(', ')}`);

// ---- 2. bundle + css (ghi chú bị bỏ hết) -------------------------------------------------------
const fnv1a = (s) => { let x = 0x811c9dc5; for (const ch of s) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x; };
const notice = /notice:\s*'([^']+)'/.exec(runtimeText)?.[1];
let noticeHash = null;
if (notice) {
  noticeHash = fnv1a(notice);
  const nm = join(web, NOTICE_MODULE);
  const expect = existsSync(nm) ? /export const EXPECT = (0x[0-9a-f]+)/i.exec(readFileSync(nm, 'utf8'))?.[1] : null;
  if (!expect) throw new Error(`${NOTICE_MODULE}: EXPECT constant not found (copy JS_SDK_2.0/template/notice.js)`);
  if (Number(expect) !== noticeHash) {
    throw new Error(`notice '${notice}' hashes to 0x${noticeHash.toString(16)} but ${NOTICE_MODULE} has ${expect}.`
      + ' Run `node JS_SDK_2.0/tools/notice-hash.mjs` and paste the new EXPECT.');
  }
} else {
  console.warn(`WARNING: ${RUNTIME_CFG} has no \`notice\` — no copyright line / version (docs/BUILD_RULES.md §1)`);
}
if (!VITE) await build({
  entryPoints: [join(dist, config.entry ?? 'src/main.js')],
  bundle: true, minify: true, format: 'esm', target: 'es2020',
  define: { __GM_BUILD__: 'true' },
  outfile: join(dist, BUNDLE), logLevel: 'warning', legalComments: 'none', charset: 'utf8',
});
if (!VITE) rmSync(join(dist, dirname(config.entry ?? 'src/main.js')), { recursive: true, force: true });
if (notice && !readFileSync(join(dist, BUNDLE), 'utf8').includes(notice)) throw new Error(`${BUNDLE}: copyright line '${notice}' missing`);
for (const f of CSS_FILES) {
  const p = join(dist, f);
  if (!existsSync(p)) continue;
  const { code } = await transform(readFileSync(p, 'utf8'), { loader: 'css', minify: true, charset: 'utf8', legalComments: 'none' });
  writeFileSync(p, code);
}

// ---- 3. loader.js: kiểm bản quyền + nạp framework (thử lại), làm rối MẠNH riêng file này --------
{
  const check = notice ? `var n = ${JSON.stringify(notice)}, x = 0x811c9dc5;
  for (var i = 0; i < n.length; i++) { x ^= n.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  if (x !== ${noticeHash}) return;
  window.__gmnk = x;` : '';
  const loaderSrc = `(function () {
  ${check}
  var tries = 0;
  function fail() {
    var t = document.getElementById('load-text');
    var l = document.getElementById('gmLoader'); if (l) l.classList.add('gmIsLoading');
    if (t) { t.textContent = 'Connection problem. Tap to retry.'; t.style.cursor = 'pointer'; t.onclick = function () { location.reload(); }; }
  }
  function load() {
    var s = document.createElement('script');
    s.type = 'module';
    s.src = '${BUNDLE}' + (tries ? '?r=' + tries : '');
    s.onerror = function () { s.remove(); if (++tries < 3) setTimeout(load, 800 * tries); else fail(); };
    document.head.appendChild(s);
  }
  // the framework is an async module script: started from <head> it can run before <body> is parsed (the shell's
  // blocking SDK scripts sit in between) and find no canvas -> wait for the DOM first
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
`;
  const { default: obfuscator } = await import('javascript-obfuscator');
  writeFileSync(join(dist, LOADER), obfuscator.obfuscate(loaderSrc, {
    compact: true,
    controlFlowFlattening: true, controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true, deadCodeInjectionThreshold: 1,
    numbersToExpressions: true,
    splitStrings: true, splitStringsChunkLength: 3,
    stringArray: true, stringArrayEncoding: ['rc4'], stringArrayThreshold: 1,
    stringArrayRotate: true, stringArrayShuffle: true, stringArrayWrappersCount: 3, stringArrayWrappersType: 'function',
    transformObjectKeys: true, unicodeEscapeSequence: true,
    identifierNamesGenerator: 'hexadecimal', renameGlobals: false,
    selfDefending: true,
  }).getObfuscatedCode());
  if (notice && readFileSync(join(dist, LOADER), 'utf8').includes(notice)) throw new Error(`${LOADER}: copyright line still readable after obfuscation`);
}

// ---- 4. trang: trỏ sang loader + đóng dấu -----------------------------------------------------
{
  const pagePath = join(dist, 'index.html');
  const page = readFileSync(pagePath, 'utf8');
  // Vite viết lại thẻ module thành <script type="module" crossorigin src="./framework.js"></script>
  const marker = VITE
    ? (/<script type="module"[^>]*src="(?:\.\/)?framework\.js"[^>]*><\/script>/.exec(page)?.[0] ?? '<script type="module" src="framework.js"></script>')
    : `<script type="module" src="${config.entry ?? 'src/main.js'}"></script>`;
  if (!page.includes(marker)) throw new Error(`index.html: module script tag not found (${marker})`);
  const versionMarker = /(?<=GM_GAME[^}]*)version: '[^']*'/;
  if (!versionMarker.test(page)) throw new Error('index.html: GM_GAME version field not found');
  writeFileSync(pagePath, page
    .replace(marker, `<script src="${LOADER}"></script>`)
    .replace(versionMarker, `version: '${version}'`)
    .replace(/(GM_GAME\s*=\s*\{\s*id:\s*)'[^']*'/, `$1'${config.gameId}'`)
    .replace(/<title>[^<]*<\/title>/, `<title>${config.gameName}</title>`));
}

// ---- 5. audio ------------------------------------------------------------------------------------
if (config.audio?.dir) {
  const dir = join(dist, config.audio.dir);
  const pattern = new RegExp(config.audio.musicPattern ?? 'playMusic\\(\\s*[\'"`]([\\w-]+)[\'"`]', 'g');
  const music = new Set([...sourceText.matchAll(pattern)].map((m) => m[1]));
  if (!music.size && existsSync(dir)) console.warn('audio: no music name found by config.audio.musicPattern — every file treated as an effect');
  let ffmpeg = null;
  try { ffmpeg = (await import('ffmpeg-static')).default; } catch { /* tuỳ chọn */ }
  if (!ffmpeg) console.warn('audio: ffmpeg-static missing (npm i -D ffmpeg-static) — shipping audio as-is');
  else if (existsSync(dir)) {
    const fmt = config.audio.format ?? 'mp3';
    let before = 0, after = 0, n = 0, kept = 0;
    for (const f of readdirSync(dir)) {
      if (!/\.(mp3|ogg|wav)$/i.test(f)) continue;
      const path = join(dir, f), name = f.replace(/\.\w+$/, ''), isMusic = music.has(name);
      const kbps = isMusic ? config.audio.musicKbps ?? 96 : config.audio.effectKbps ?? 64;
      const ch = isMusic && config.audio.musicStereo !== false ? '2' : '1';
      const out = fmt === 'opus' ? path.replace(/\.\w+$/, '.ogg') : path, tmp = `${out}.tmp${fmt === 'opus' ? '.ogg' : '.mp3'}`;
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path,
        '-c:a', fmt === 'opus' ? 'libopus' : 'libmp3lame', '-b:a', `${kbps}k`, '-ac', ch, '-map_metadata', '-1', tmp]);
      const a = statSync(path).size, b = statSync(tmp).size;
      before += a; n++;
      if (fmt === 'opus' || b < a) { if (out !== path) rmSync(path); rmSync(out, { force: true }); cpSync(tmp, out); after += b; } else { after += a; kept++; }
      rmSync(tmp);
    }
    console.log(`audio: ${n} file(s) ${fmt}, ${kept} kept (already smaller) — ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`);
    if (fmt === 'opus') console.warn('audio: opus renames files to .ogg — the game must request .ogg (and Safari cannot play opus)');
  }
}

// ---- 6. ảnh -> WebP ------------------------------------------------------------------------------
if (config.webp?.dir === null) console.log('webp: skipped (config.webp.dir = null)');
else {
  const assets = join(dist, config.webp?.dir ?? 'assets');
  const settings = join(dist, '.webp-settings.json');
  writeFileSync(settings, JSON.stringify(config.webp ?? {}));
  if (!existsSync(assets)) console.log(`webp: skipped (no ${relative(dist, assets)}/ folder)`);
  const out = existsSync(assets) ? runPython([join(kitRoot, 'tools', 'webp-art.py'), assets, `@${settings}`], 'webp-art.py') : null;
  rmSync(settings, { force: true });
  if (!existsSync(assets)) { /* nothing to convert */ } else if (out === null) console.warn('webp: python/Pillow unavailable — shipping PNG as-is');
  else {
    console.log(out.trim());
    // .png -> .webp là MỘT giao dịch: mọi file text ship ra có thể nhắc tên ảnh đều đổi theo; sót thì DỪNG
    const texts = [join(dist, BUNDLE), join(dist, LOADER), join(dist, 'index.html'), ...CSS_FILES.map((f) => join(dist, f)),
      ...(config.webp?.rewrite ?? []).map((f) => join(dist, f))].filter(existsSync);
    for (const file of texts) writeFileSync(file, readFileSync(file, 'utf8').replace(/(?<!Icons\/web)\.png(?=["'`?#)\s,;])/gi, '.webp'));   // Icons/web.png (favicon) stays PNG
    for (const file of texts) {
      const left = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').match(/[\w/.-]+\.png\b/g)?.filter((n) => !n.endsWith('Icons/web.png'));
      if (left?.length) throw new Error(`webp: ${relative(dist, file)} still names .png: ${[...new Set(left)].slice(0, 5).join(', ')}`);
    }
  }
}

// ---- 7. vỏ portal -----------------------------------------------------------------------------
{
  const portalPage = readFileSync(join(dist, 'index.html'), 'utf8');
  const charset = '<meta charset="utf-8" />';
  if (!portalPage.includes(charset)) throw new Error('index.html: needs exactly `<meta charset="utf-8" />`');
  const head = [charset, `<base href="${version}/" />`, `<link rel="canonical" href="${config.canonicalBase}${portalGid}" />`].join('\n');
  const sdk = `<script src="${config.sdkHost}/sdk/v3/gm-sdk.js"></script>
  <script src="${config.sdkHost}/sdk/v3/gm-iframe.js"></script>
<script>
  window['GMSOFT_SDKTYPE'] = 'gm';
  window['GMSOFT_SIGNED'] = '${config.signDomain}';
  var config = { gameId: (window.AZ_SETTINGS && window.AZ_SETTINGS.portalGid) || '${portalGid}' };
  function _0x3d5f(){var _0x344170=['referrer','location','href','https://azgames.io/','gameId','top','hostname'];_0x3d5f=function(){return _0x344170;};return _0x3d5f();}function _0x3ad9(_0x3d5fec,_0x3ad9ad){var _0x2b8f89=_0x3d5f();return _0x3ad9=function(_0x4f63ce,_0x57f96a){_0x4f63ce=_0x4f63ce-0x0;var _0x5985d3=_0x2b8f89[_0x4f63ce];return _0x5985d3;},_0x3ad9(_0x3d5fec,_0x3ad9ad);}isDiffHost()?!document[_0x3ad9(0x0)]&&(config={}):!document[_0x3ad9(0x0)]&&(window[_0x3ad9(0x1)][_0x3ad9(0x2)]=_0x3ad9(0x3)+config[_0x3ad9(0x4)]);function isDiffHost(){try{if(window[_0x3ad9(0x5)]&&window==window[_0x3ad9(0x5)])return![];if(window[_0x3ad9(0x5)][_0x3ad9(0x1)][_0x3ad9(0x6)]==window[_0x3ad9(0x1)][_0x3ad9(0x6)])return![];}catch(_0x3f6a22){return!![];}return!![];}
</script>
<script id="gmsoft-jssdk" src="https://api.azgame.io/static/lib/azgames/gmsdkv2.js"></script>
  ${config.firebase ? `<script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics-compat.js"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    window.gtag('config', ${JSON.stringify(config.firebase.measurementId)}, { cookie_domain: location.hostname, cookie_flags: 'SameSite=None;Secure' });
    try { firebase.initializeApp(${JSON.stringify(config.firebase)}); } catch (e) { console.error('firebase init', e); }
  </script>` : ''}
  <script>if (!window.GMGameSDK) console.error('[analytics] GMGameSDK missing - gm-sdk.js failed to load from the shell; src/sdk will retry');</script>
</head>`;
  const tail = `<script>
  function gmEvent(eventName) { console.log(eventName); }
  function gmStartGame(callbackFunction) { callbackFunction(); firebaseLogEvent('start_game'); }
  function gmStartAds(callbackFunction) { callbackFunction(); }
  function firebaseSetUserProperties(props) { try { if (isFirebaseReady()) firebase.analytics().setUserProperties(props); } catch (e) {} }
  function isFirebaseReady() { try { return typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0; } catch (e) { return false; } }
  function firebaseLogEvent(event_name) {
    try { if (isFirebaseReady()) firebase.analytics().logEvent(event_name); } catch (e) {}
    try { GMGameSDK.trackEvent(event_name); } catch (e) {}
  }
  function firebaseLogEventParameter(event_name, event_param) {
    try { if (isFirebaseReady()) firebase.analytics().logEvent(event_name, event_param); } catch (e) {}
    try { GMGameSDK.trackEventParams(event_name, event_param); } catch (e) {}
  }
</script>
</body>`;
  const wrapped = portalPage.replace(charset, head).replace('</head>', sdk).replace('</body>', tail);
  if (!wrapped.includes('<base href=') || !wrapped.includes('gmsoft-jssdk') || !wrapped.includes('gmStartGame') || !wrapped.includes('gm-sdk.js')) {
    throw new Error('index.html: portal wrapper did not fully apply');
  }
  writeFileSync(join(portal, 'index.html'), wrapped);
  writeFileSync(join(portal, 'version.txt'), version);
}

// ---- 8. gỡ ghi chú trong các trang ship; 8b. quét lại toàn bộ (ghi chú / tiếng Việt) -----------
{
  const pages = [join(portal, 'index.html'), join(dist, 'index.html')];
  for (const file of pages) {
    let html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, (c) => (c.includes('PRODUCT_VERSION') ? c : ''));
    // the AZ_SETTINGS block keeps its (English) comments: the operator edits it by hand (docs/JSGMSDK.md B.7)
    html = html.replace(AZ_BLOCK, 'window.AZ_SETTINGS_TOKEN=0;');
    const blocks = [...html.matchAll(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi)];
    for (const [whole, open, tag, body, close] of blocks.reverse()) {
      if (!body.trim()) continue;
      const loader = tag.toLowerCase() === 'style' ? 'css' : 'js';
      const { code } = await transform(body, loader === 'css'
        ? { loader, minify: true, charset: 'utf8', legalComments: 'none' }
        : { loader, minifyWhitespace: true, minifySyntax: true, charset: 'utf8', legalComments: 'none' });
      const at = html.lastIndexOf(whole);
      html = html.slice(0, at) + open + code.trim() + close + html.slice(at + whole.length);
    }
    const restored = html.replace(/window\.AZ_SETTINGS_TOKEN=0[;,]?/, () => `${azBlock}\n`);
    if (restored === html) throw new Error(`${relative(root, file)}: AZ_SETTINGS block lost during minify`);
    writeFileSync(file, restored.replace(/\n\s*\n+/g, '\n'));
  }
  // preview.html = byte-identical copy of index.html (docs/JSGMSDK.md B.10)
  copyFileSync(join(portal, 'index.html'), join(portal, 'preview.html'));
  if (!readFileSync(join(portal, 'index.html')).equals(readFileSync(join(portal, 'preview.html')))) throw new Error('preview.html differs from index.html');
  // JS file count (docs/JSGMSDK.md B.2)
  const jsFiles = readdirSync(dist, { recursive: true }).filter((f) => /\.m?js$/.test(f));
  if (jsFiles.length > (config.maxJsFiles ?? 2)) throw new Error(`build has ${jsFiles.length} JS files (max ${config.maxJsFiles ?? 2}): ${jsFiles.join(', ')}`);
  const allow = (config.check?.allowVietnamese ?? []).flatMap((f) => ['--allow', join(web, f)]);
  const out = runPython([join(kitRoot, 'tools', 'check_build.py'), portal, ...allow], 'check_build.py: comments / Vietnamese left in the build — NOT shipped');
  if (out === null) console.warn('check_build: python unavailable — the build was NOT scanned (docs/BUILD_RULES.md §2)');
  else console.log(out.trim());
}

// ---- biên nhận ----------------------------------------------------------------------------------
function sizeOf(path) {
  const s = statSync(path);
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const e of readdirSync(path)) total += sizeOf(join(path, e));
  return total;
}
const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;
console.log(`\n${relative(root, portal)} built:`);
for (const e of readdirSync(dist)) console.log(`  ${version}/${e.padEnd(21)} ${mb(sizeOf(join(dist, e)))}`);
for (const e of readdirSync(portal).filter((n) => n !== version)) console.log(`  ${e.padEnd(29)} ${mb(sizeOf(join(portal, e)))}`);
console.log(`  preview.html == index.html (sha256 ${createHash('sha256').update(readFileSync(join(portal, 'index.html'))).digest('hex').slice(0, 8)})`);
console.log(`  total                         ${mb(sizeOf(portal))}`);
console.log(`  upload: ${relative(root, portal)} (index.html, preview.html, version.txt, ${version}/)`);
console.log(`  test analytics: serve ${relative(root, portal)} with a static server, open preview.html`);

if (process.platform === 'win32' && !process.env.NO_OPEN) {
  const { spawn } = await import('node:child_process');
  spawn('explorer', [portal], { detached: true, stdio: 'ignore' }).unref();
}
