#!/usr/bin/env node
/**
 * Checks a game's marketing kit before handover (docs/HANDOFF.md §3–§5). Plain Node 18+, no packages.
 *
 *   node docs/GMSDK_JS/tools/check-marketing.mjs                  the newest export/marketing/<version>-<id>/, id from config.json
 *   node docs/GMSDK_JS/tools/check-marketing.mjs <kitDir>         another folder
 *
 * config.json is the one next to the kit (docs/GMSDK_JS/config.json); --config <file> points at another one.
 * Run it from the game repo root.
 *
 * Errors (exit code 1): a file of the standard missing, an image not at the exact pixel size of its name, not a
 * JPEG / PNG, with transparency or in CMYK, a brief without its 10 sections or with a short description over 160
 * characters, an HTML brief that loads anything from outside or misses an image of the set. Warnings: engine /
 * technical words or "clone" in the brief text, files that are not part of the kit.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node docs/GMSDK_JS/tools/check-marketing.mjs [<kitDir>] [--config <config.json>]';
const args = process.argv.slice(2);
const at = args.indexOf('--config');
const KIT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT_CONFIG = join(KIT, 'config.json');
const configPath = at >= 0 ? args[at + 1] : existsSync(KIT_CONFIG) ? KIT_CONFIG : null;
const dirArg = args.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));

let config = null;
if (configPath) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    console.error(`${configPath}: ${e.message}`);
  }
}
/** The kit folder is export/marketing/<version>-<id>: the id is <kitDir>'s name without the build version, else config.json's id. */
const id = dirArg
  ? basename(dirArg.replace(/[\\/]+$/, '')).replace(/^\d{8}-/, '')
  : config && typeof config.id === 'string' ? config.id : '';
if (!id) {
  console.error(`no ${relative(process.cwd(), KIT_CONFIG)} with an id, and no kit folder given`);
  console.error(USAGE);
  process.exit(2);
}
/** No folder given: the newest export/marketing/<yymmddXX>-<id>/ of this game. */
function latestKit() {
  const root = join('export', 'marketing');
  const names = existsSync(root) ? readdirSync(root).filter((n) => /^\d{8}-/.test(n) && n.slice(9) === id).sort() : [];
  return join(root, names.length ? names[names.length - 1] : `<version>-${id}`);
}
const dir = dirArg ?? latestKit();

/** The image set of the standard (docs/HANDOFF.md §4): every one as images/<id>-<w>x<h>.png and images/jpg/…jpg. */
const IMAGES = [
  [1024, 1024, 'Store icon'],
  [1920, 1080, 'Cover 16:9'],
  [1080, 1920, 'Cover 9:16'],
  [512, 384, 'Portal thumbnail 4:3'],
  [512, 512, 'Portal thumbnail square'],
  [200, 120, 'Portal tiny thumbnail'],
  [1280, 720, 'Portal banner 16:9'],
  [1280, 550, 'Portal banner wide'],
];
const BRIEFS = [`${id}-content-brief.md`, `${id}-content-brief.en.md`, `${id}-content-brief.en.html`];
/** Words that never go in a text for players (docs/HANDOFF.md §5): the engine, the tech, another game. */
const TECH_WORDS = /\b(Phaser|Unity|PixiJS|Pixi\.js|Three\.js|Babylon(?:\.js)?|Cocos|Godot|Construct 3|TypeScript|JavaScript|WebGL|Vite|Webpack|Planck|Box2D|Matter\.js|clone|reverse[- ]engineer(?:ed|ing)?|inspired by)\b/gi;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/** Size and colour of a JPEG from its SOF segment. */
function jpegInfo(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) {
      i += 1;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (m === 0xd9 || m === 0xda) return null;
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && i + 10 <= b.length) {
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), components: b[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

/** Size and transparency of a PNG: an alpha channel (colour type 4, 6) or a tRNS chunk. */
function pngInfo(b) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 26 || sig.some((v, k) => b[k] !== v) || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  let alpha = b[25] === 4 || b[25] === 6;
  for (let i = 8; i + 8 <= b.length; ) {
    const len = b.readUInt32BE(i);
    const type = b.toString('latin1', i + 4, i + 8);
    if (type === 'tRNS') alpha = true;
    if (type === 'IDAT' || type === 'IEND') break;
    i += 12 + len;
  }
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha };
}

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (p) => relative(dir, p).split('\\').join('/');

if (!existsSync(dir)) {
  err(`${dir} is missing: the marketing kit of ${id} (docs/HANDOFF.md §3; PROMPT_MARKETING.md makes it)`);
} else {
  const files = new Set(walk(dir).map(rel));
  const known = new Set();

  // --- images ------------------------------------------------------------------------------------------------------
  // PNG first (images/), the JPG copy in images/jpg/.
  const NAMED = new RegExp(`^images/(jpg/)?${id.replace(/[-]/g, '\\-')}-(\\d+)x(\\d+)\\.(jpg|png)$`);
  if ([...files].some((f) => f.startsWith('images/png/') || /^images\/[^/]+\.jpe?g$/i.test(f))) {
    err('PNGs in images/png/ and JPGs in images/ are the earlier layout: the PNGs go in images/, the JPGs in images/jpg/ (docs/HANDOFF.md §3)');
  }
  for (const [w, h] of IMAGES) {
    for (const name of [`images/${id}-${w}x${h}.png`, `images/jpg/${id}-${w}x${h}.jpg`]) {
      if (!files.has(name)) err(`${name} is missing (${w}x${h}, docs/HANDOFF.md §4)`);
    }
  }
  for (const name of files) {
    const m = NAMED.exec(name);
    if (!m || (m[1] ? m[4] !== 'jpg' : m[4] !== 'png')) continue;
    known.add(name);
    const [w, h, isPng] = [+m[2], +m[3], m[4] === 'png'];
    const buf = readFileSync(join(dir, name));
    if (isPng) {
      const info = pngInfo(buf);
      if (!info) err(`${name} is not a PNG`);
      else {
        if (info.w !== w || info.h !== h) err(`${name} is ${info.w}x${info.h}: it must be exactly ${w}x${h}`);
        if (info.alpha) err(`${name} has transparency: store images are opaque (flatten it on a solid background)`);
      }
    } else {
      const info = jpegInfo(buf);
      if (!info) err(`${name} is not a JPEG`);
      else {
        if (info.w !== w || info.h !== h) err(`${name} is ${info.w}x${info.h}: it must be exactly ${w}x${h}`);
        if (info.components === 4) err(`${name} is CMYK: save it as sRGB`);
      }
    }
  }

  // --- the brief ---------------------------------------------------------------------------------------------------
  for (const name of BRIEFS) {
    known.add(name);
    if (!files.has(name)) {
      err(`${name} is missing (docs/HANDOFF.md §5)`);
      continue;
    }
    const raw = readFileSync(join(dir, name), 'utf8');
    const isHtml = name.endsWith('.html');
    let text = raw;
    if (isHtml) {
      text = raw
        .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/data:[^"')\s]+/g, ' ')
        .replace(/<[^>]+>/g, ' ');
      // Self-contained: images and styles embedded, nothing fetched (links to read are fine).
      const loads = [
        ...[...raw.matchAll(/<(?:img|script|link|iframe|video|audio|source|embed|object)\b[^>]*?\b(?:src|href|data)\s*=\s*["']?([^"'\s>]+)/gi)].map((x) => x[1]),
        ...[...raw.matchAll(/url\(\s*["']?([^"')]+)/gi)].map((x) => x[1]),
      ].filter((u) => !/^(data:|#)/i.test(u));
      for (const u of new Set(loads)) err(`${name} loads ${u}: the HTML brief embeds everything (base64) so it opens on its own`);
      for (const [w, h] of IMAGES) {
        if (!raw.includes(`images/${id}-${w}x${h}.png`)) err(`${name}: its Image kit has no images/${id}-${w}x${h}.png (a card, or Pending)`);
      }
    } else {
      for (let n = 1; n <= 10; n++) {
        if (!new RegExp(`^##\\s+${n}\\.\\s`, 'm').test(raw)) err(`${name}: no section ${n} ("## ${n}. …", docs/HANDOFF.md §5)`);
      }
      if (name.endsWith('.en.md')) {
        const short = /^\*\*Short[^\n]*\n+\s*>\s?(.+)$/im.exec(raw);
        if (!short) warn(`${name}: no "**Short (≤160 characters):**" line followed by the "> …" description (section 10)`);
        else if ([...short[1].trim()].length > 160) err(`${name}: the short description is ${[...short[1].trim()].length} characters (at most 160)`);
      }
    }
    const words = [...new Set([...text.matchAll(TECH_WORDS)].map((x) => x[1]))];
    if (words.length) warn(`${name} says ${words.join(', ')}: a text for players names no engine, no tech, no other game (docs/HANDOFF.md §5)`);
  }

  for (const name of files) if (!known.has(name)) warn(`${name} is not part of the kit: take drafts and temporary files out`);
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(errors.length ? `${errors.length} error(s): ${dir} does not meet docs/HANDOFF.md` : `OK: ${dir} meets docs/HANDOFF.md`);
process.exit(errors.length ? 1 : 0);
