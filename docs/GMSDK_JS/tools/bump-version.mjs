#!/usr/bin/env node
/**
 * The first step of every build (docs/EXPORT.md §4). config.json (next to the kit) is the one source of the
 * game's values: they are copied into game.json (id, gameCode, name, languages, defaultLanguage, leaderboardId,
 * portals.gd.gameKey) and the dev page (gameId, gameCode; language from defaultLanguage while it is a placeholder). Then the next version, GM standard yymmddXX
 * (EXPORT.md §2): today's date (this machine's local time) and the build of the day, 01, 02, … Plain Node 18+.
 *
 *   node docs/GMSDK_JS/tools/bump-version.mjs [public/game.json] [--page index.html]
 *
 * No game.json yet: it is made from config.json (entry game.js, orientation any), version <today>01. The dev page
 * is index.html by default, skipped when it does not exist. Prints the new version.
 *
 * config.json gameCode null (the owner has no code yet, AI_INSTALL.md step 0): a temporary code g + yyyymmddhhmmss
 * of this moment is written into config.json once, so the save key stays the same from then on. Replace it with
 * the owner's code before release (config.json, or gameCode in the package's index.html).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIT_CONFIG = join(dirname(dirname(fileURLToPath(import.meta.url))), 'config.json');
const readJson = (text) => JSON.parse(text.replace(/^\uFEFF/, ''));

/** game.json with config.json's values (config wins; keys config does not have are kept). */
export function withConfig(game, config) {
  const out = { ...game };
  for (const key of ['id', 'gameCode', 'name', 'languages', 'defaultLanguage']) if (config[key] !== undefined) out[key] = config[key];
  // leaderboardId: the board of docs/LEADERBOARD.md; null = the game has none (and none in game.json).
  if (typeof config.leaderboardId === 'string') out.leaderboardId = config.leaderboardId;
  else if (config.leaderboardId === null) delete out.leaderboardId;
  if (typeof config.gdKey === 'string') out.portals = { ...out.portals, gd: { ...out.portals?.gd, gameKey: config.gdKey } };
  else if (config.gdKey === null && out.portals?.gd) {
    const { gd, ...rest } = out.portals;
    if (Object.keys(rest).length) out.portals = rest;
    else delete out.portals;
  }
  return out;
}

/** 2-space JSON, short arrays of plain values on one line ("languages": ["en", "es"]). */
export function formatJson(value) {
  return JSON.stringify(value, null, 2).replace(/\[\s*\n\s*([^\[\]{}]*?)\s*\n\s*\]/g, (m, inner) => {
    const one = `[${inner.split(/,\s*\n\s*/).join(', ')}]`;
    return one.length <= 100 ? one : m;
  });
}

/** Temporary game code: g + yyyymmddhhmmss (local time), e.g. g20261020143205. A real code is g + a short number. */
export function tempGameCode(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `g${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** g + 14 digits: the temporary code of tempGameCode(). */
export const isTempGameCode = (code) => /^g\d{14}$/.test(String(code ?? ''));

/**
 * yymmddXX after `prev` on `now`'s day (GM standard, as the 2.x kit: 26102001): XX + 1 on the same day, else 01.
 * A yymmddXX version of an older build counts as its day. Throws after build 99 of a day.
 */
export function nextVersion(prev, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const m = /^(?:\d{2})?(\d{6})(\d{2})$/.exec(String(prev ?? ''));
  const build = m && m[1] === day ? Number(m[2]) + 1 : 1;
  if (build > 99) throw new Error(`version ${prev}: 99 builds today already`);
  return `${day}${String(build).padStart(2, '0')}`;
}

function main() {
  const args = process.argv.slice(2);
  const pageAt = args.indexOf('--page');
  const page = pageAt >= 0 ? args[pageAt + 1] : 'index.html';
  const file = args.find((a, i) => !a.startsWith('--') && (pageAt < 0 || i !== pageAt + 1)) ?? 'public/game.json';

  const config = existsSync(KIT_CONFIG) ? readJson(readFileSync(KIT_CONFIG, 'utf8')) : null;
  // No code from the owner yet: a temporary one, written into config.json once (the save key must not move).
  if (config && (config.gameCode === null || config.gameCode === undefined || config.gameCode === '')) {
    config.gameCode = tempGameCode();
    writeFileSync(KIT_CONFIG, `${formatJson(config)}\n`);
    console.log(`gameCode: temporary ${config.gameCode} written to config.json (no code from the owner yet): replace it before release`);
  } else if (config && isTempGameCode(config.gameCode)) {
    console.log(`note: gameCode ${config.gameCode} is temporary: replace it with the owner's code before release`);
  }
  if (!existsSync(file) && !config) throw new Error(`${file} and ${KIT_CONFIG} are both missing: fill config.json first`);
  let game = existsSync(file) ? readJson(readFileSync(file, 'utf8')) : { entry: 'game.js', orientation: 'any' };
  if (config) game = withConfig(game, config);
  const version = nextVersion(game.version);
  game = { ...game, version };
  // id, gameCode, name, version first, as in docs/EXPORT.md §2; the rest in its own order.
  const order = ['id', 'gameCode', 'name', 'version'];
  game = Object.fromEntries([...order.filter((k) => k in game).map((k) => [k, game[k]]), ...Object.entries(game).filter(([k]) => !order.includes(k))]);
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, `${formatJson(game)}\n`);

  if (page && existsSync(page)) {
    let html = readFileSync(page, 'utf8');
    const set = (key, value) => {
      const re = new RegExp(`(\\b${key}:\\s*)(['"])[^'"]*\\2`);
      if (value !== undefined && re.test(html)) html = html.replace(re, `$1$2${value}$2`);
    };
    set('version', version);
    if (config) {
      set('gameId', config.id);
      set('gameCode', config.gameCode);
      // The page's default language: filled once from defaultLanguage; a tag the developer set stays.
      if (/\blanguage:\s*(['"])<!--LANGUAGE-->\1/.test(html)) set('language', config.defaultLanguage);
    }
    writeFileSync(page, html);
  }
  console.log(config ? `${version} (values from ${KIT_CONFIG})` : version);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
