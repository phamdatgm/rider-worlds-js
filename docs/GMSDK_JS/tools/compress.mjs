#!/usr/bin/env node
/**
 * Compresses the export package after the bundler (docs/EXPORT.md §4): PNG → WebP, audio → MP3 at a moderate
 * bitrate, then every reference to a renamed file in game.js and the package's text files. The sources in public/
 * are not touched. Prints a report: sizes before / after, the largest files left, how to compress more.
 *
 *   node docs/GMSDK_JS/tools/compress.mjs [<packageDir>]        default export/build/<version>-<id> from public/game.json
 *
 * The level comes from config.json "compress" (chosen once with the owner, AI_INSTALL.md step 0); none = "normal":
 *
 *   "compress": { "images": "normal", "audio": "normal", "keep": ["assets/maps/collision*.png"] }
 *
 *   images  normal   WebP quality 90, alpha kept whole: usually 50-70 % smaller than PNG, hard to tell apart
 *           more     WebP quality 80
 *           lossless WebP without loss (pixel art, images the code reads pixel by pixel)
 *           off      PNG as it is
 *   audio   normal   MP3 128 kbps for music (longer than 20 s), 96 kbps for sound effects
 *           more     MP3 96 / 64 kbps
 *           off      as it is
 *   keep    globs of package paths left untouched (* within a folder, ** across folders)
 *
 * icons/ (the loading screen, docs/LOADING.md) is never touched: its files are called by fixed names.
 *
 * MP3, not Opus: Safari / older iPhones do not play Opus. A file is only replaced when the result is smaller; a
 * file that fails stays as it was (a warning, never a broken build). Needs, in the game's devDependencies:
 * sharp (images) and ffmpeg-static (audio): npm i -D sharp ffmpeg-static. Plain Node 18+ otherwise.
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT_CONFIG = join(dirname(dirname(fileURLToPath(import.meta.url))), 'config.json');
const readJson = (text) => JSON.parse(text.replace(/^\uFEFF/, ''));

export const IMAGE_LEVELS = {
  normal: { quality: 90, alphaQuality: 100, effort: 5 },
  more: { quality: 80, alphaQuality: 90, effort: 6 },
  lossless: { lossless: true, effort: 6 },
};
/** [music kbps, effect kbps]. */
export const AUDIO_LEVELS = { normal: [128, 96], more: [96, 64] };
/** Audio longer than this is music. */
const MUSIC_SECONDS = 20;
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
/** Text files of the package whose references are rewritten. */
const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.css', '.html', '.atlas', '.fnt', '.xml', '.txt', '.tmx', '.tsx', '.plist']);

/** The compress settings of config.json, with defaults and bad values reported. */
export function settingsOf(config) {
  const c = config?.compress ?? {};
  const problems = [];
  const images = c.images ?? 'normal';
  const audio = c.audio ?? 'normal';
  if (images !== 'off' && !(images in IMAGE_LEVELS)) problems.push(`compress.images "${images}": normal | more | lossless | off`);
  if (audio !== 'off' && !(audio in AUDIO_LEVELS)) problems.push(`compress.audio "${audio}": normal | more | off`);
  const keep = Array.isArray(c.keep) ? c.keep.filter((k) => typeof k === 'string') : [];
  if (c.keep !== undefined && !Array.isArray(c.keep)) problems.push('compress.keep: a list of package paths (globs)');
  return { images, audio, keep, problems };
}

/** A glob (* in a folder, ** across folders, ? one character) as a RegExp on a package path (a/b/c.png). */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const posix = (p) => p.split('\\').join('/');
const mb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const pct = (a, b) => (a ? `${Math.round((1 - b / a) * 100)}%` : '0%');

function run(exe, args) {
  return new Promise((done) => {
    execFile(exe, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => done({ err, out: String(stderr) }));
  });
}

/** Duration (s) and bitrate (kbps) from `ffmpeg -i` (ffmpeg-static has no ffprobe). */
async function probe(ffmpeg, file) {
  const { out } = await run(ffmpeg, ['-hide_banner', '-i', file]);
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  const b = /bitrate: (\d+) kb\/s/.exec(out);
  return {
    seconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    kbps: b ? Number(b[1]) : 0,
  };
}

/**
 * Rewrites references: each renamed file's name in the text files. A name that also belongs to a file left as it
 * was (same name, other folder) is rewritten only as its full package path, so the kept one keeps working.
 */
export function rewriteReferences(texts, renames, keptNames) {
  const changed = [];
  for (const [file, text] of texts) {
    let next = text;
    for (const [from, to] of renames) {
      const name = from.split('/').pop();
      const newName = to.split('/').pop();
      if (keptNames.has(name.toLowerCase())) next = next.split(from).join(to);
      else next = next.replace(new RegExp(`(^|[\\/"'\`\\s(=,:])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[?#"'\`\\s),;&])`, 'g'), `$1${newName}`);
    }
    if (next !== text) changed.push([file, next]);
  }
  return changed;
}

async function main() {
  let dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!dir) {
    const g = readJson(readFileSync('public/game.json', 'utf8'));
    dir = `export/build/${g.version}-${g.id}`;
  }
  dir = resolve(dir);
  if (!existsSync(join(dir, 'game.json'))) {
    console.error(`no export package at ${dir} (build it first)`);
    process.exit(2);
  }
  const config = existsSync(KIT_CONFIG) ? readJson(readFileSync(KIT_CONFIG, 'utf8')) : null;
  const s = settingsOf(config);
  for (const p of s.problems) console.warn(`warning: config.json ${p}: using the default`);
  const images = s.images in IMAGE_LEVELS || s.images === 'off' ? s.images : 'normal';
  const audio = s.audio in AUDIO_LEVELS || s.audio === 'off' ? s.audio : 'normal';
  const keep = s.keep.map(globToRegExp);
  const kept = (rel) => keep.some((re) => re.test(rel));

  const files = walk(dir)
    .map((abs) => ({ abs, rel: posix(relative(dir, abs)) }))
    .filter((f) => !/\.zip$/i.test(f.rel))
    // icons/: fixed names that loader.js, icons/loader.css and the build tool call by name: never renamed.
    .filter((f) => !f.rel.startsWith('icons/'));
  const pngs = files.filter((f) => extname(f.rel).toLowerCase() === '.png');
  const sounds = files.filter((f) => AUDIO_EXT.has(extname(f.rel).toLowerCase()));
  const renames = new Map();
  const keptNames = new Set();
  const report = { img: { n: 0, before: 0, after: 0, kept: 0 }, snd: { n: 0, before: 0, after: 0, kept: 0 } };

  // --- images: PNG → WebP ---------------------------------------------------------------------------------------
  if (images !== 'off' && pngs.length) {
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch {
      console.warn('warning: images not compressed: sharp is not installed (npm i -D sharp)');
    }
    if (sharp) {
      for (const f of pngs) {
        const size = statSync(f.abs).size;
        report.img.before += size;
        if (kept(f.rel)) {
          report.img.after += size;
          report.img.kept++;
          keptNames.add(f.rel.split('/').pop().toLowerCase());
          continue;
        }
        const out = f.abs.replace(/\.png$/i, '.webp');
        try {
          if (existsSync(out)) throw new Error(`${posix(relative(dir, out))} already exists`);
          await sharp(f.abs).webp(IMAGE_LEVELS[images]).toFile(out);
          const next = statSync(out).size;
          if (next >= size) {
            rmSync(out);
            report.img.after += size;
            report.img.kept++;
            keptNames.add(f.rel.split('/').pop().toLowerCase());
            continue;
          }
          rmSync(f.abs);
          renames.set(f.rel, f.rel.replace(/\.png$/i, '.webp'));
          report.img.after += next;
          report.img.n++;
        } catch (e) {
          if (existsSync(out) && !existsSync(f.abs)) renameSync(out, f.abs);
          console.warn(`warning: ${f.rel} kept as PNG: ${e.message ?? e}`);
          report.img.after += size;
          report.img.kept++;
          keptNames.add(f.rel.split('/').pop().toLowerCase());
        }
      }
    }
  }

  // --- audio: → MP3 at a moderate bitrate ---------------------------------------------------------------------------
  if (audio !== 'off' && sounds.length) {
    let ffmpeg;
    try {
      ffmpeg = (await import('ffmpeg-static')).default;
    } catch {
      console.warn('warning: audio not compressed: ffmpeg-static is not installed (npm i -D ffmpeg-static)');
    }
    if (ffmpeg) {
      const [musicKbps, sfxKbps] = AUDIO_LEVELS[audio];
      for (const f of sounds) {
        const size = statSync(f.abs).size;
        report.snd.before += size;
        const isMp3 = /\.mp3$/i.test(f.rel);
        const keepIt = () => {
          report.snd.after += size;
          report.snd.kept++;
          keptNames.add(f.rel.split('/').pop().toLowerCase());
        };
        if (kept(f.rel)) {
          keepIt();
          continue;
        }
        const info = await probe(ffmpeg, f.abs);
        const kbps = info.seconds > MUSIC_SECONDS ? musicKbps : sfxKbps;
        // Already an MP3 at (or near) the target: re-encoding only loses quality.
        if (isMp3 && info.kbps && info.kbps <= kbps + 16) {
          keepIt();
          continue;
        }
        const target = f.abs.replace(/\.[^.]+$/, '.mp3');
        const tmp = `${target}.tmp.mp3`;
        const r = await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', f.abs, '-vn', '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, tmp]);
        if (r.err || !existsSync(tmp)) {
          if (existsSync(tmp)) rmSync(tmp);
          console.warn(`warning: ${f.rel} kept: ffmpeg failed (${(r.out.trim().split('\n').pop() ?? '').slice(0, 120)})`);
          keepIt();
          continue;
        }
        const next = statSync(tmp).size;
        if (next >= size || (!isMp3 && existsSync(target))) {
          rmSync(tmp);
          keepIt();
          continue;
        }
        if (!isMp3) rmSync(f.abs);
        renameSync(tmp, target);
        if (!isMp3) renames.set(f.rel, f.rel.replace(/\.[^.]+$/, '.mp3'));
        report.snd.after += next;
        report.snd.n++;
      }
    }
  }

  // --- references -------------------------------------------------------------------------------------------------
  if (renames.size) {
    const texts = walk(dir)
      .filter((p) => TEXT_EXT.has(extname(p).toLowerCase()))
      .map((p) => [p, readFileSync(p, 'utf8')]);
    const changed = rewriteReferences(texts, renames, keptNames);
    for (const [file, text] of changed) writeFileSync(file, text);
    console.log(`references: ${renames.size} renamed file(s) rewritten in ${changed.length} text file(s)`);
  }

  // --- report -------------------------------------------------------------------------------------------------------
  const { img, snd } = report;
  console.log(`\nCompressed (config.json compress: images ${images}, audio ${audio})`);
  if (images !== 'off') console.log(`  Images: ${img.n} PNG → WebP   ${mb(img.before)} → ${mb(img.after)} (−${pct(img.before, img.after)})${img.kept ? `   kept PNG: ${img.kept}` : ''}`);
  if (audio !== 'off') console.log(`  Audio:  ${snd.n} file(s) → MP3   ${mb(snd.before)} → ${mb(snd.after)} (−${pct(snd.before, snd.after)})${snd.kept ? `   kept: ${snd.kept}` : ''}`);
  const all = walk(dir).filter((p) => !/\.zip$/i.test(p));
  const total = all.reduce((n, p) => n + statSync(p).size, 0);
  const largest = all
    .map((p) => [posix(relative(dir, p)), statSync(p).size])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, n]) => `${p} ${mb(n)}`);
  console.log(`  Package: ${all.length} files, ${mb(total)}. Largest: ${largest.join(', ')}`);
  const tighter = [images === 'normal' && '"images": "more"', audio === 'normal' && '"audio": "more"'].filter(Boolean);
  if (tighter.length) console.log(`  Smaller still: config.json "compress": { ${tighter.join(', ')} }`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
