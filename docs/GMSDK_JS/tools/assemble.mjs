#!/usr/bin/env node
/**
 * Puts the gm page into the export package (docs/EXPORT.md §7): index.html (the platform template, filled from
 * the package's game.json) + preview.html (the same file, byte for byte), in export/build/<version>-<id>/ itself.
 * Ready to upload or open; check-export accepts exactly these two pages. Every other publisher x portal page is
 * the build tool's (api.1games.io), from this one package. --portal gd|crazy|poki makes a copy
 * export/build/<version>-<id>-<portal>/ with that portal's page, only for submitting by hand while the build tool is
 * not there. Plain Node 18+, no packages.
 *
 *   node docs/GMSDK_JS/tools/assemble.mjs [<packageDir>] [--portal gm,gd,crazy,poki] [--templates <dir|url>]
 *
 * <packageDir>: default export/build/<version>-<id> from public/game.json. --templates: default the CDN copy of
 * api.1games.io lib/1games/gmsdkjs/templates/1.0.1/ (gamesforfree-<portal>.html; templates/ itself is not for this kit). GD is skipped when game.json has no
 * portals.gd.gameKey.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The templates of this kit (they load loader.js only). templates/ itself holds pages of another generation.
export const TEMPLATES = 'https://games.1games.io/lib/1games/gmsdkjs/templates/1.0.1/';
export const PORTALS = ['gm', 'gd', 'crazy', 'poki'];
/** The pages this tool writes (the gm ones in the package are not copied to the other portals). */
const PAGES = new Set(['index.html', 'preview.html']);
/** Not copied to a portal folder either: the gm zip of tools/zip.mjs. */
const skip = (rel) => PAGES.has(rel) || (!/[\\/]/.test(rel) && rel.toLowerCase().endsWith('.zip'));

const args = process.argv.slice(2);
const optionValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const valueAt = new Set(['--portal', '--templates'].map((n) => args.indexOf(n)).filter((i) => i >= 0).map((i) => i + 1));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

/** Text safe inside the template's <title> and its "…" strings. */
const safe = (v) => String(v).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

/** The template with the game's values; throws when a value is missing or a placeholder is left. */
export function fill(template, game, portal) {
  const values = {
    PRODUCT_NAME: game.name,
    GAME_ID: game.id,
    GAME_CODE: game.gameCode,
    GAME_VERSION: game.version,
    GD_GAME_KEY: game.portals?.gd?.gameKey,
    // The page's default language (GMSDKJS_OPTIONS.language): game.json defaultLanguage.
    LANGUAGE: game.defaultLanguage,
  };
  const html = template.replace(/<!--([A-Z_]+)-->/g, (m, key) => {
    if (!(key in values)) throw new Error(`${portal}: unknown placeholder ${m}`);
    if (values[key] === undefined || values[key] === null || values[key] === '') throw new Error(`${portal}: game.json has no value for ${m}`);
    return safe(values[key]);
  });
  // Kit 1.0.1: the page loads loader.js only; loader.js loads gmsdkjs.js and game.js (docs/LOADING.md).
  if (/id="gmsoft-jssdk"|<script[^>]*\bsrc="game\.js"/.test(html))
    throw new Error(`${portal}: the template loads gmsdkjs.js / game.js itself, not loader.js: use the templates/1.0.1/ pages (default), or pass --templates <folder>`);
  if (!/<script[^>]*\bsrc="loader\.js"/.test(html)) throw new Error(`${portal}: the template does not load loader.js`);
  return html;
}

async function readTemplate(from, portal) {
  const name = `gamesforfree-${portal}.html`;
  if (/^https?:/.test(from)) {
    const r = await fetch(new URL(name, from.endsWith('/') ? from : `${from}/`));
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.text();
  }
  return readFileSync(join(from, name), 'utf8');
}

async function main() {
  let dir = args.find((a, i) => !a.startsWith('--') && !valueAt.has(i));
  if (!dir) {
    const g = readJson('public/game.json');
    dir = `export/build/${g.version}-${g.id}`;
  }
  dir = resolve(dir);
  if (!existsSync(join(dir, 'game.json'))) {
    console.error(`no export package at ${dir} (build it first)`);
    process.exitCode = 2;
    return;
  }
  const game = readJson(join(dir, 'game.json'));
  const portals = (optionValue('--portal') ?? 'gm').split(',').map((p) => p.trim()).filter(Boolean);
  const from = optionValue('--templates') ?? TEMPLATES;

  let failed = 0;
  for (const portal of portals) {
    if (!PORTALS.includes(portal)) {
      console.error(`unknown portal "${portal}" (${PORTALS.join(', ')})`);
      failed++;
      continue;
    }
    if (portal === 'gd' && !game.portals?.gd?.gameKey) {
      console.log('gd: skipped (game.json has no portals.gd.gameKey)');
      continue;
    }
    try {
      const html = fill(await readTemplate(from, portal), game, portal);
      // gm, the default, goes into the package itself; every other portal gets its own copy.
      const out = portal === 'gm' ? dir : join(dirname(dir), `${basename(dir)}-${portal}`);
      if (out !== dir) {
        rmSync(out, { recursive: true, force: true });
        cpSync(dir, out, { recursive: true, filter: (src) => !skip(relative(dir, src)) });
      }
      writeFileSync(join(out, 'index.html'), html);
      writeFileSync(join(out, 'preview.html'), html); // the same page, byte for byte
      console.log(`${portal}: ${out} (index.html + preview.html)`);
    } catch (e) {
      console.error(`${portal}: ${e.message}`);
      failed++;
    }
  }
  // No forced exit: on Windows, Node 24 aborts (libuv assertion UV_HANDLE_CLOSING) when it exits by force
  // while fetch's keep-alive socket to the CDN is still open. Node ends by itself once the socket is idle.
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
