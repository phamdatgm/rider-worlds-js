#!/usr/bin/env node
/**
 * Checks a game's config.json and / or its export package before it goes to the build tool (AI_INSTALL.md,
 * docs/EXPORT.md). Plain Node 18+, no packages.
 *
 *   node docs/GMSDK_JS/tools/check-export.mjs                              the game's values only
 *   node docs/GMSDK_JS/tools/check-export.mjs <packageDir> [--src src]     the package; game.json must match config.json
 *
 * config.json is the one next to the kit (docs/GMSDK_JS/config.json), found by itself; --config <file> points at
 * another one. Run it from the game repo root. licenses.json next to it (where every asset comes from, docs/ASSETS.md)
 * is checked against the files under its roots. analytics.json next to it (the
 * event dictionary, docs/ANALYTICS.md §6) is checked too, and the package's game.js must name its events.
 *
 * Errors (exit code 1) break the contract; warnings are worth a look. --src also scans the game's sources for
 * direct localStorage / sessionStorage use (the built game.js is minified, so it is checked there).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node docs/GMSDK_JS/tools/check-export.mjs [<packageDir>] [--config <config.json>] [--src <sourceDir>]';
const OPTIONS = ['--src', '--config'];
const args = process.argv.slice(2);
const optionValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const valueAt = new Set(OPTIONS.map((n) => args.indexOf(n)).filter((i) => i >= 0).map((i) => i + 1));
const srcDir = optionValue('--src');
/** The kit folder (docs/GMSDK_JS): its config.json holds the game's values. */
const KIT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT_CONFIG = join(KIT, 'config.json');
const configPath = optionValue('--config') ?? (existsSync(KIT_CONFIG) ? KIT_CONFIG : null);
const dir = args.find((a, i) => !a.startsWith('--') && !valueAt.has(i));
if (!dir && !configPath) {
  console.error(`no ${relative(process.cwd(), KIT_CONFIG)}: copy config.example.json next to it and fill it in (AI_INSTALL.md, step 0)`);
  console.error(USAGE);
  process.exit(2);
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// The copyright owner / publisher written by the game itself, in a string (not in a comment: Phaser's licence
// header says "copyright" a thousand times). The trademark text comes from sdk.brand.trademark().
// "AZ Games" / "AZGames" in its own case only: the storage key azgames.<gameCode> is not the owner's name.
// © also when a minifier escapes it (esbuild's ascii output: \xA9 or ©), so writing it that way is caught too.
const OWNER_TEXT = { test: (s) => /(azgames\.io|1games\.io|gamesforfree\.io|ofree\.io|©|\\xa9|\\u00a9)/i.test(s) || /\bAZ ?Games\b/.test(s) };
// sdk/copyright.js ("© 2026 Azgames.io", "© 2026 ${owner}") is the one place allowed to name the owner. After a build
// it can read `© ${a} ${b}` (Vite keeps COPYRIGHT_YEAR / the owner as variables) or `\xA9 2026 ${o}` (esbuild):
// © (or its escape), then the year or one ${…}, then nothing, Azgames.io or one ${…}.
const KIT_COPYRIGHT = /^(["'`])(?:(?:©|\\xa9|\\u00a9) (?:\d{4}|\$\{[^`{}]*\})(?: (?:Azgames\.io|\$\{[^`]*\}))? ?|Azgames\.io)\1$/i;
const ownerInStrings = (text) => (text.match(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || []).find((lit) => OWNER_TEXT.test(lit) && !KIT_COPYRIGHT.test(lit));
const OWNER_HINT = 'the copyright line must come from copyrightText(sdk) of sdk/copyright.js (default "© 2026 Azgames.io", the server can change or hide it; docs/INTEGRATION.md §9)';

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * The file is there under exactly this name, upper / lower case included. Windows finds "Player.png" for
 * "player.png"; the CDN (Linux) does not, so a path that only differs in case works here and breaks online.
 */
function existsExact(root, rel) {
  let d = root;
  for (const part of rel.split('/').filter(Boolean)) {
    let names;
    try {
      names = readdirSync(d);
    } catch {
      return false;
    }
    if (!names.includes(part)) return false;
    d = join(d, part);
  }
  return true;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    err(`${label}: not valid JSON (${e.message})`);
    return null;
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const GAME_CODE = /^g\d+$/;
/** Temporary game code (tools/bump-version.mjs): g + yyyymmddhhmmss. */
const TEMP_CODE = /^g\d{14}$/;
const GD_KEY = /^[0-9a-f]{32}$/i;

/** A BCP 47 tag in its canonical case: language (2-3 lower), optional Script (Title), optional REGION / 3 digits. */
const LANG_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2}|-\d{3})?$/;
/** The canonical case of a tag the way people write it: zh-tw, pt_BR, EN-us. */
const canonicalTag = (tag) =>
  String(tag)
    .replace(/_/g, '-')
    .split('-')
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 2 ? p.toUpperCase() : p.length === 4 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join('-');

/** game.json / config.json languages (docs/INTEGRATION.md §7): BCP 47 tags, an English one, the default among them. */
function checkLanguages(label, languages, defaultLanguage) {
  for (const tag of languages) {
    if (typeof tag !== 'string' || !LANG_TAG.test(tag)) err(`${label} languages: "${tag}" is not a BCP 47 tag in its canonical case: ${canonicalTag(tag)} (e.g. en, en-US, zh-TW)`);
  }
  if (!languages.some((tag) => /^en(-|$)/.test(String(tag)))) err(`${label} languages must include an English tag (en or en-XX)`);
  if (!languages.includes(defaultLanguage)) err(`${label} defaultLanguage "${defaultLanguage}" is not in languages`);
}

// --- the game in an iframe, on many domains (docs/EMBED.md) ------------------------------------------------------
/** A file the game loads (image, font, data, sound, model, wasm…), by its extension. */
const LOADED_FILE = '(?:png|jpe?g|webp|gif|avif|svg|ktx2|basis|mp3|ogg|wav|m4a|aac|opus|webm|mp4|json|glb|gltf|bin|fbx|obj|wasm|woff2?|ttf|otf|atlas|fnt|xml|txt|csv)';
const HTTP_FILE = new RegExp(`["'\`](http://[^"'\`\\s]+\\.${LOADED_FILE})(?:[?#][^"'\`\\s]*)?["'\`]`, 'gi');
const HTTPS_FILE = new RegExp(`["'\`](https://[^"'\`\\s]+\\.${LOADED_FILE})(?:[?#][^"'\`\\s]*)?["'\`]`, 'gi');
const HTTPS_IMAGE = /\.(?:png|jpe?g|webp|gif|avif|svg|ktx2|basis)$/i;

/** What breaks only once the page and a file are on different domains: allowed, with the condition that makes it work. */
function checkEmbed(js, entry) {
  const list = (re) => [...new Set([...js.matchAll(re)].map((m) => m[1]))];
  const plain = list(HTTP_FILE);
  // http:// inside an https page is blocked outright (mixed content): the one thing with no way around.
  if (plain.length) err(`${entry} loads files over http:// (blocked on https pages): use https: ${plain.slice(0, 4).join(', ')} (docs/EMBED.md)`);
  const outside = list(HTTPS_FILE);
  if (outside.length) {
    warn(`${entry} loads files from other domains: that server must send CORS (Access-Control-Allow-Origin) and the game must load them in CORS mode, or copy them into the package: ${outside.slice(0, 4).join(', ')} (docs/EMBED.md §1)`);
    if (outside.some((u) => HTTPS_IMAGE.test(u)) && !/crossOrigin|setCrossOrigin/.test(js))
      warn(`${entry} loads images from other domains but never sets crossOrigin: set img.crossOrigin = 'anonymous' (Three.js: loader.setCrossOrigin('anonymous')) before src, or WebGL / canvas reads fail (docs/EMBED.md §1)`);
  }
  if (/new\s+Worker\s*\(\s*["'`]https?:/.test(js)) warn(`${entry} starts a Worker from a URL: a worker must come from the page's own domain: fetch it (CORS) and start it from a blob URL (docs/EMBED.md §4)`);
  if (/new\s+SharedArrayBuffer\b/.test(js) && !/crossOriginIsolated/.test(js))
    warn(`${entry} creates a SharedArrayBuffer without checking crossOriginIsolated: in a portal iframe it is usually missing; check it and fall back to one thread (docs/EMBED.md §5)`);
}

/** A table of i18n/ as { "group.key": text } and the paths that are not texts (numbers, lists…). */
function flattenTable(node, prefix = '', out = { texts: {}, bad: [] }) {
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.texts[path] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) flattenTable(v, path, out);
    else out.bad.push(path);
  }
  return out;
}

/** GM standard yymmddXX (as the 2.x kit): a real date and the build of that day (01..99). */
function validVersion(v) {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(typeof v === 'string' ? v : '');
  if (!m || m[4] === '00') return false;
  const y = 2000 + +m[1];
  const d = new Date(Date.UTC(y, +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === y && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// --- icons/loader.css: the loading screen's look (docs/LOADING.md §1.1) ------------------------------------------
/** Parts of loader.js's screen a skin may move and restyle but never hide: the flow and the publisher logo. */
const SKIN_KEEP = /^#gmLoader(?![A-Za-z-])|gmLoaderStage|gmLoaderProgress|gmLoaderBar|gmLoaderFill|gmLoaderInfo|gmLoaderRetry|gmLoaderBrand/;
const SKIN_HIDE = /display[ ]*:[ ]*none|visibility[ ]*:[ ]*hidden|opacity[ ]*:[ ]*0*[.]?0*[ ]*(;|!|$)|(?<![a-z-])(max-)?(width|height)[ ]*:[ ]*0(px)?[ ]*(;|!|$)|font-size[ ]*:[ ]*0/i;
/** The element a selector styles: its last compound ("#gmLoader .gmLoaderThumb" → ".gmLoaderThumb"); a bare tag goes with the one before (".gmLoaderBrand img"). */
function skinSubject(selector) {
  const parts = selector.trim().split(/[ >+~]+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return /^[a-z*]+$/i.test(last) && parts.length > 1 ? `${parts[parts.length - 2]} ${last}` : last;
}

function skinProblems(css, has) {
  const errors = [];
  const text = css.replace(/[/][*][^]*?[*][/]/g, '');
  if (/@import/i.test(text)) errors.push('uses @import: everything goes in this one file');
  for (const m of text.matchAll(/url[(][ ]*["']?([^"')]+)["']?[ ]*[)]/gi)) {
    const ref = m[1].trim();
    if (/^(https?:)?[/][/]/i.test(ref)) errors.push(`loads ${ref} from outside the package: put the file in icons/`);
    else if (!/^data:/i.test(ref) && !has(ref.split(/[?#]/)[0])) errors.push(`url(${ref}): icons/${ref} is not in the package`);
  }
  for (const m of text.matchAll(/([^{}]+)[{]([^{}]*)[}]/g)) {
    const selector = m[1].trim();
    if (selector.startsWith('@')) continue;
    // Hiding is fine in a state the kit hides too (Reload before a failure, the bar before the first %).
    const parts = selector.split(',').filter((s) => SKIN_KEEP.test(skinSubject(s)) && !/\[hidden\]|:not[(][.]gm(IsLoading|Failed)[)]/.test(s));
    if (parts.length && SKIN_HIDE.test(m[2])) errors.push(`${parts.join(',').trim()} is hidden: the bar, its text, Reload and the publisher logo stay on screen (move or restyle them)`);
  }
  return { errors, rules: /[{]/.test(text) };
}

function checkSkin(dir) {
  const path = join(dir, 'icons/loader.css');
  if (!existsExact(dir, 'icons/loader.css')) {
    err('icons/loader.css is missing: copy docs/GMSDK_JS/loading/icons/loader.css to public/icons/ (the kit\'s file is empty: the kit look), docs/LOADING.md §1.1');
    return;
  }
  const css = readFileSync(path, 'utf8');
  const { errors, rules } = skinProblems(css, (rel) => existsExact(join(dir, 'icons'), rel));
  for (const e of errors) err(`icons/loader.css ${e} (docs/LOADING.md §1.1)`);
  if (statSync(path).size > 30 * 1024) warn('icons/loader.css is over 30 KB: it holds the screen back until it is in; keep it small');
  const mode = config?.loadingScreen;
  if (mode === 'game' && !rules) err('config.json loadingScreen is "game" but icons/loader.css has no rules: write the game\'s look there (docs/LOADING.md §1.1)');
  if (mode === 'kit' && rules) warn('config.json loadingScreen is "kit" but icons/loader.css has rules: copy the kit\'s empty file again, or set "game"');
}

// --- config.json: the game's values (AI_INSTALL.md step 0) -----------------------------------------------------
const CONFIG_KEYS = new Set(['id', 'gameCode', 'name', 'languages', 'defaultLanguage', 'leaderboardId', 'compress', 'loadingScreen', 'gdKey', 'notes', 'brief']);
/** A GMA board id (docs/LEADERBOARD.md), e.g. leaderboard-topscore. */
const BOARD_ID = /^[a-z0-9][a-z0-9_-]*$/i;
const PLACEHOLDER_BOARDS = new Set(['idleaderboard', 'id-leaderboard', 'leaderboard-id', 'leaderboardid']);

/** The GD key of config.json: a 32 hex string, or null (not on GameDistribution yet). No .env file is read. */
function resolveGdKey(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  err('config.json gdKey: the 32 hex GameDistribution game id written here, or null (no .env file any more)');
  return undefined;
}

let config = null;
let configGdKey;
if (configPath) {
  config = existsSync(configPath) ? readJson(configPath, 'config.json') : (err(`${configPath} is missing: copy docs/GMSDK_JS/config.example.json`), null);
  if (config) {
    for (const key of Object.keys(config)) {
      if (!key.startsWith('$') && !CONFIG_KEYS.has(key)) warn(`config.json: unknown key "${key}"`);
    }
    if (!SLUG.test(config.id ?? '')) err(`config.json id "${config.id}": the portal slug (a-z, 0-9, -) the owner gives`);
    if (config.gameCode === null) warn('config.json gameCode is null: run tools/bump-version.mjs once (it writes a temporary code), or ask the owner');
    else if (!GAME_CODE.test(config.gameCode ?? '')) err(`config.json gameCode "${config.gameCode}": g<number> the owner gives, or null`);
    else if (TEMP_CODE.test(config.gameCode)) warn(`config.json gameCode ${config.gameCode} is temporary: replace it with the owner's code before release (or gameCode in the package's index.html)`);
    if (!config.name || typeof config.name !== 'string' || config.name.includes('<')) err(`config.json name "${config.name}": the display name is required`);
    checkLanguages('config.json', Array.isArray(config.languages) ? config.languages : [], config.defaultLanguage);
    if (config.leaderboardId === undefined) warn('config.json leaderboardId is missing: the board id the owner gives (docs/LEADERBOARD.md), or null when the game has no leaderboard');
    else if (config.leaderboardId !== null && (typeof config.leaderboardId !== 'string' || !BOARD_ID.test(config.leaderboardId) || PLACEHOLDER_BOARDS.has(config.leaderboardId.toLowerCase()))) err(`config.json leaderboardId "${config.leaderboardId}": the board id the owner gives (e.g. leaderboard-topscore), or null`);
    // compress (tools/compress.mjs): the level chosen once with the owner; none = normal.
    if (config.compress !== undefined) {
      const c = config.compress;
      if (!c || typeof c !== 'object' || Array.isArray(c)) err('config.json compress: { images, audio, keep } (tools/compress.mjs)');
      else {
        if (c.images !== undefined && !['normal', 'more', 'lossless', 'off'].includes(c.images)) err(`config.json compress.images "${c.images}": normal | more | lossless | off`);
        if (c.audio !== undefined && !['normal', 'more', 'off'].includes(c.audio)) err(`config.json compress.audio "${c.audio}": normal | more | off`);
        if (c.keep !== undefined && (!Array.isArray(c.keep) || c.keep.some((k) => typeof k !== 'string'))) err('config.json compress.keep: a list of package paths (globs)');
      }
    }
    // loadingScreen (docs/LOADING.md §1.1): the kit look or the game's look (icons/loader.css), asked once.
    if (config.loadingScreen == null) warn('config.json loadingScreen is not set: ask the owner "kit" (the kit loading screen) or "game" (the game\'s look in icons/loader.css), AI_INSTALL.md step 0');
    else if (!['kit', 'game'].includes(config.loadingScreen)) err(`config.json loadingScreen "${config.loadingScreen}": kit | game`);
    configGdKey = resolveGdKey(config.gdKey);
    if (typeof configGdKey === 'string' && !GD_KEY.test(configGdKey)) err(`config.json gdKey "${configGdKey}": the GameDistribution game id is 32 hex characters`);
    if (configGdKey === null) console.log('note: config.json gdKey is null: the game does not go to GameDistribution yet');
    if (config.notes !== undefined && (!Array.isArray(config.notes) || config.notes.some((n) => typeof n !== 'string'))) err('config.json notes: a list of strings');
    if (config.brief != null && (typeof config.brief !== 'string' || config.brief.includes('<'))) err('config.json brief: a short description of a new game, or null');
  }
}

// --- the repo's docs (docs/INTEGRATION.md §1): gdd, plan, qa next to the kit --------------------------------------
// Run from the repo root (as every build step is): docs/GMSDK_JS sits there, so docs/ is the kit's parent.
if (config) {
  const docs = dirname(KIT);
  for (const [need, what] of [['gdd/README.md', 'the game design'], ['plan/README.md', 'the plan']]) {
    if (!existsSync(join(docs, need))) warn(`no docs/${need}: ${what} lives in docs/${need.split('/')[0]}/ (docs/INTEGRATION.md §1)`);
  }
  if (existsSync(join(docs, 'superpowers'))) warn('docs/superpowers/ holds documents: plans and specs go to docs/plan/, game design to docs/gdd/ (docs/INTEGRATION.md §1)');
}

// --- analytics.json: the game's event dictionary (docs/ANALYTICS.md §6) ----------------------------------------
const ID = /^[a-z][a-z0-9_]*$/;
const KPIS = new Set(['onboarding_complete', 'level_1_win', 'depth', 'level_quit', 'session_minutes', 'return_rate', 'feature_use', 'rewarded_take', 'error_rate']);
/** The analysis set (ANALYTICS.md §4), and the analytics.json key that makes each group required. */
const ANALYSIS_EVENTS = [
  [null, ['session_start', 'screen_view', 'onboarding_step', 'error']],
  ['levels', ['level_start', 'level_end']],
  ['tutorials', ['tutorial_step']],
  ['currencies', ['currency_earn', 'currency_spend']],
  ['item_types', ['item_get']],
  ['features', ['feature_open']],
  ['ad_placements', ['ad_offer']],
  ['settings', ['setting_change']],
];
const RESERVED = new Set(ANALYSIS_EVENTS.flatMap(([, names]) => names).concat(['app_hidden', 'death', 'checkpoint', 'item_equip', 'item_use', 'feature_unlock', 'feature_action', 'load_error']));
const ANALYTICS_PATH = join(KIT, 'analytics.json');

/** analytics.json, checked; null when there is none (a warning) or it is not JSON (an error). */
function checkAnalytics() {
  if (!existsSync(ANALYTICS_PATH)) {
    if (config) warn(`no ${relative(process.cwd(), ANALYTICS_PATH)}: the event dictionary the AI writes after wiring the events (docs/ANALYTICS.md §6)`);
    return null;
  }
  const a = readJson(ANALYTICS_PATH, 'analytics.json');
  if (!a || typeof a !== 'object') return null;
  const ids = (label, list) => {
    for (const id of list) if (typeof id !== 'string' || !ID.test(id)) err(`analytics.json ${label}: "${id}" is not a lowercase snake_case id`);
  };
  const listOrNull = (key) => {
    if (!(key in a)) err(`analytics.json: "${key}" is missing (a value, or null when the game has none)`);
    return a[key];
  };
  const levels = listOrNull('levels');
  if (levels !== null && levels !== undefined) {
    if (!['levels', 'endless', 'none'].includes(levels.kind)) err('analytics.json levels.kind: levels | endless | none');
    if (!['progress_pct', 'distance_bucket'].includes(levels.progress) && levels.kind !== 'none') err('analytics.json levels.progress: progress_pct | distance_bucket');
    const list = Array.isArray(levels.list) ? levels.list : [];
    if (levels.kind !== 'none' && !list.length) err('analytics.json levels.list: every level (or map) as { id, index, name }');
    ids('levels.list', list.map((l) => l?.id));
    if (list.some((l, i) => l?.index !== i + 1)) err('analytics.json levels.list: index runs 1, 2, 3… in order');
  }
  for (const key of ['screens', 'onboarding']) {
    const v = listOrNull(key);
    if (!Array.isArray(v) || !v.length) err(`analytics.json ${key}: a non-empty list`);
    else ids(key, v);
  }
  if (Array.isArray(a.screens) && !a.screens.includes('game')) warn('analytics.json screens: no "game" screen (the screen where the game is played)');
  const tutorials = listOrNull('tutorials');
  if (tutorials) for (const [t, steps] of Object.entries(tutorials)) (ids('tutorials', [t]), ids(`tutorials.${t}`, Array.isArray(steps) ? steps : [steps]));
  const causes = listOrNull('causes');
  if (causes) ids('causes', Array.isArray(causes) ? causes : Object.keys(causes));
  for (const key of ['currencies', 'sources', 'sinks', 'settings']) {
    const v = listOrNull(key);
    if (v !== null && v !== undefined) Array.isArray(v) ? ids(key, v) : err(`analytics.json ${key}: a list, or null`);
  }
  const itemTypes = listOrNull('item_types');
  if (itemTypes) ids('item_types', Object.keys(itemTypes));
  const features = listOrNull('features');
  if (features) ids('features', (Array.isArray(features) ? features : []).map((f) => f?.id));
  const placements = listOrNull('ad_placements');
  if (placements) ids('ad_placements', Array.isArray(placements) ? placements : Object.keys(placements));
  const custom = Array.isArray(a.custom) ? a.custom : (err('analytics.json custom: a list (empty when the analysis set is enough)'), []);
  for (const c of custom) {
    const name = c?.name;
    if (typeof name !== 'string' || !ID.test(name) || name.length > 40) err(`analytics.json custom: "${name}" is not a snake_case event name of 40 characters at most`);
    else if (RESERVED.has(name)) err(`analytics.json custom: "${name}" is an event of the analysis set (ANALYTICS.md §4), not a custom one`);
    const params = c?.params && typeof c.params === 'object' ? Object.keys(c.params) : [];
    if (!c?.when) err(`analytics.json custom ${name}: "when" it is sent`);
    if (params.length + 3 > 25) err(`analytics.json custom ${name}: ${params.length} params + the 3 common ones pass 25`);
  }
  const kpis = Array.isArray(a.kpis) ? a.kpis : [];
  if (!kpis.length) warn('analytics.json kpis: no KPI chosen (ANALYTICS.md §7.2)');
  for (const k of kpis) if (!KPIS.has(k)) err(`analytics.json kpis: "${k}" is not a KPI of ANALYTICS.md §7.2`);
  return a;
}
const analytics = checkAnalytics();

// --- licenses.json: where every asset comes from, under which licence (docs/ASSETS.md) --------------------------
const ORIGINS = new Set(['in-house', 'ai', 'third-party', 'purchased', 'unknown']);
const ASSET_TYPES = new Set(['art', 'font', 'music', 'sound', 'video', 'data', 'code']);
/** Licences that never ship in a game with ads (ASSETS.md §3); ND only once the file is modified. */
const FORBIDDEN_LICENSES = [
  [/\bNC\b|non-?commercial/i, 'is non-commercial: the game earns from ads'],
  [/personal/i, 'is for personal use only'],
  [/editorial/i, 'is editorial use only'],
];
const KNOWN_LICENSES = /^(CC0-1\.0|CC-BY-(3\.0|4\.0)|CC-BY-SA-(3\.0|4\.0)|OFL-1\.1|MIT|Apache-2\.0|BSD-[23]-Clause|Unlicense|Pixabay|commercial|in-house)$/;
/** Files under a root that are the records, not assets. */
const RECORD_FILE = /(^|\/)(CREDITS|LICEN[CS]E|README)[^/]*$|\.(md|txt)$/i;

/** A glob of licenses.json (/, *, **, ?) as a RegExp over repo-relative paths with '/'. */
function globRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function checkLicenses() {
  if (!configPath) return;
  const path = join(dirname(configPath), 'licenses.json');
  if (!existsSync(path)) {
    warn(`no ${relative(process.cwd(), path)}: where every font, sound and image comes from and its licence (docs/ASSETS.md)`);
    return;
  }
  const l = readJson(path, 'licenses.json');
  if (!l || typeof l !== 'object') return;
  const roots = Array.isArray(l.roots) ? l.roots : (err('licenses.json roots: the asset folders, from the repo root (e.g. ["public/assets"])'), []);
  const entries = Array.isArray(l.assets) ? l.assets : (err('licenses.json assets: a list of entries'), []);
  const matchers = [];
  entries.forEach((a, i) => {
    const at = `licenses.json entry ${i + 1}`;
    const files = Array.isArray(a?.files) ? a.files.filter((f) => typeof f === 'string' && f) : [];
    if (!files.length) return err(`${at}: "files", the globs of its files (e.g. "public/assets/sounds/*.mp3")`);
    const name = files.join(', ');
    matchers.push(...files.map(globRegExp));
    if (!ASSET_TYPES.has(a.type)) err(`${at} (${name}): "type" is one of ${[...ASSET_TYPES].join(', ')}`);
    if (!ORIGINS.has(a.origin)) return err(`${at} (${name}): "origin" is one of ${[...ORIGINS].join(', ')}`);
    const license = typeof a.license === 'string' ? a.license.trim() : '';
    if (a.origin === 'unknown' || /^unknown$/i.test(license) || !license) {
      return warn(`${name}: licence unknown: find the source and the licence, or replace the file, before handover (docs/ASSETS.md §5)`);
    }
    // Known to have no licence (e.g. the original game's assets): recorded in its notes, not checked.
    if (/^none$/i.test(license)) return;
    for (const [re, why] of FORBIDDEN_LICENSES) if (re.test(license)) err(`${name}: licence "${license}" ${why} (docs/ASSETS.md §3)`);
    if (/\bND\b|no-?deriv/i.test(license) && a.modified) err(`${name}: licence "${license}" allows no derivatives, and the file is modified (docs/ASSETS.md §3)`);
    if (/^CC-BY/i.test(license)) {
      if (typeof a.attribution !== 'string' || !a.attribution.trim()) err(`${name}: ${license} needs credit: "attribution", the exact credit line (docs/ASSETS.md §4)`);
      else warn(`${name}: ${license}: the credit "${a.attribution}" must be shown (Credits screen or store description, docs/ASSETS.md §4)`);
    }
    if (/SA-/.test(license)) warn(`${name}: ${license} is share-alike: what is made from it carries the same licence (docs/ASSETS.md §3)`);
    if (!KNOWN_LICENSES.test(license) && !FORBIDDEN_LICENSES.some(([re]) => re.test(license))) warn(`${name}: licence "${license}" is not in docs/ASSETS.md §3: read its terms`);
    if ((a.origin === 'third-party' || a.origin === 'purchased') && !a.source) warn(`${name}: ${a.origin} without "source" (the page it comes from)`);
    if (a.origin === 'purchased' && !a.proof) warn(`${name}: purchased without "proof" (the licence or invoice, and where it is kept)`);
    if (a.origin === 'ai') {
      const ai = a.ai && typeof a.ai === 'object' ? a.ai : {};
      if (!ai.tool) err(`${at} (${name}): AI art names its "ai.tool" (docs/ASSETS.md §6)`);
      if (!ai.prompts) warn(`${name}: AI art without "ai.prompts" (where its prompts are kept)`);
      if (!ai.reviewedBy) warn(`${name}: AI art without "ai.reviewedBy" (who checked it looks like no one else's work, docs/ASSETS.md §6)`);
    }
  });
  for (const root of roots) {
    if (typeof root !== 'string' || !existsSync(root)) {
      err(`licenses.json roots: "${root}" not found (run from the repo root)`);
      continue;
    }
    for (const f of walk(root)) {
      const p = relative(process.cwd(), f).split('\\').join('/');
      if (!RECORD_FILE.test(p) && !matchers.some((re) => re.test(p))) err(`${p} is in no licenses.json entry: add where it comes from (docs/ASSETS.md §2)`);
    }
  }
}
checkLicenses();

/**
 * The root pages: none ({}), the assembled gm page ({ ok: true }: index.html and preview.html identical, the
 * gmsdkjs template filled with this game.json and loading the entry), or anything else ({ error }).
 */
function assembledPages(dir, entry, m) {
  const has = (n) => existsSync(join(dir, n));
  if (!has('index.html') && !has('preview.html')) return {};
  if (!has('index.html') || !has('preview.html')) return { error: 'index.html and preview.html come together (tools/assemble.mjs), or not at all' };
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  if (html !== readFileSync(join(dir, 'preview.html'), 'utf8')) return { error: 'preview.html must be index.html byte for byte (tools/assemble.mjs)' };
  // The page loads loader.js only; loader.js loads gmsdkjs.js and the entry (docs/LOADING.md).
  if (/id="gmsoft-jssdk"/.test(html) || new RegExp(`<script[^>]*\\bsrc="${entry.replace(/\./g, '\\.')}"`).test(html))
    return { error: 'index.html loads gmsdkjs.js / the game itself: the platform template must load loader.js only (templates/1.0.1/, docs/EXPORT.md §7)' };
  const template = /GMSDKJS_OPTIONS\s*=/.test(html) && /<script[^>]*\bsrc="loader\.js"/.test(html);
  if (!template) return { error: 'index.html is not the platform template: the package has no page of its own (tools/assemble.mjs makes the gm page)' };
  if (/<!--[A-Z_]+-->/.test(html)) return { error: 'index.html still has <!--…--> placeholders: run tools/assemble.mjs again' };
  // The page's default language (docs/INTEGRATION.md §7): one the game ships.
  const lang = /\blanguage:\s*["']([^"']*)["']/.exec(html)?.[1];
  const ships = (tag) => (m?.languages ?? []).some((l) => l.toLowerCase() === tag.toLowerCase() || l.toLowerCase().startsWith(`${tag.toLowerCase()}-`));
  if (lang && Array.isArray(m?.languages) && !ships(lang)) return { error: `index.html language "${lang}" is not one of game.json languages [${m.languages}]` };
  for (const key of ['gameId', 'gameCode', 'version']) {
    const want = key === 'gameId' ? m?.id : m?.[key];
    const got = new RegExp(`\\b${key}:\\s*["']([^"']*)["']`).exec(html)?.[1];
    if (want !== undefined && got !== want) return { error: `index.html ${key} "${got ?? ''}" differs from game.json "${want}": run tools/assemble.mjs again` };
  }
  return { ok: true };
}

// --- the package ------------------------------------------------------------------------------------------------
function checkPackage() {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`not a folder: ${dir}`);
    process.exit(2);
  }

  // game.json
  const manifestPath = join(dir, 'game.json');
  const m = existsSync(manifestPath) ? readJson(manifestPath, 'game.json') : (err('game.json is missing'), null);
  let languages = [];
  let entry = 'game.js';
  if (m) {
    if (!SLUG.test(m.id ?? '')) err(`game.json id "${m.id}": a lowercase slug (a-z, 0-9, -) is required`);
    if (!GAME_CODE.test(m.gameCode ?? '')) err(`game.json gameCode "${m.gameCode}": g<number> is required (the save key azgames.<gameCode>)`);
    else if (TEMP_CODE.test(m.gameCode)) warn(`game.json gameCode ${m.gameCode} is temporary: replace it before release (config.json, or gameCode in index.html after the build)`);
    if (!m.name || typeof m.name !== 'string') err('game.json name is missing');
    if (!validVersion(m.version)) err(`game.json version "${m.version}": yymmddXX is required (date + build of the day, tools/bump-version.mjs)`);
    entry = m.entry ?? 'game.js';
    if (!['any', 'landscape', 'portrait'].includes(m.orientation ?? 'any')) warn(`game.json orientation "${m.orientation}": any | landscape | portrait`);
    languages = Array.isArray(m.languages) ? m.languages : [];
    checkLanguages('game.json', languages, m.defaultLanguage);
    const gdKey = m.portals?.gd?.gameKey;
    if (gdKey !== undefined && !GD_KEY.test(String(gdKey))) err(`game.json portals.gd.gameKey "${gdKey}": the GameDistribution game id is 32 hex characters`);
    if (gdKey === undefined) console.log('note: no portals.gd.gameKey: the package cannot go to GameDistribution yet');
    if (m.leaderboardId !== undefined && (typeof m.leaderboardId !== 'string' || !BOARD_ID.test(m.leaderboardId))) err(`game.json leaderboardId "${m.leaderboardId}": a board id (docs/LEADERBOARD.md)`);

    // game.json must carry config.json's values
    if (config) {
      for (const key of ['id', 'gameCode', 'name', 'defaultLanguage']) {
        if (config[key] !== undefined && m[key] !== config[key]) err(`game.json ${key} "${m[key]}" differs from config.json "${config[key]}"`);
      }
      const want = [...(config.languages ?? [])].sort().join(',');
      if (languages.slice().sort().join(',') !== want) err(`game.json languages [${languages}] differ from config.json [${config.languages}]`);
      if (config.leaderboardId !== undefined && (m.leaderboardId ?? null) !== config.leaderboardId) err(`game.json leaderboardId "${m.leaderboardId ?? ''}" differs from config.json "${config.leaderboardId ?? ''}": run tools/bump-version.mjs`);
      if (configGdKey !== undefined && (gdKey ?? null) !== configGdKey) err(`game.json portals.gd.gameKey "${gdKey ?? ''}" differs from config.json gdKey "${configGdKey ?? ''}"`);
    }
  }

  // files at the root
  const ALLOWED_ROOT = new Set(['game.json', 'loader.js', entry, 'i18n', 'icons', 'assets']);
  if (existsSync(join(dir, 'Language'))) {
    ALLOWED_ROOT.add('Language'); // reported here, not again below
    err('Language/ is not read: move each file to i18n/<tag>.json (BCP 47 tags, docs/INTEGRATION.md §7)');
  }
  // index.html + preview.html are allowed only as the gm page tools/assemble.mjs puts there (EXPORT.md §7): the
  // platform template, filled, the same file twice. A page of the game's own is still an error.
  const pages = assembledPages(dir, entry, m);
  if (pages.ok) {
    ALLOWED_ROOT.add('index.html').add('preview.html');
    console.log('note: index.html + preview.html are the assembled gm page (the build tool replaces them)');
  } else if (pages.error) err(pages.error);
  // tools/zip.mjs writes <version>-<id>.zip next to index.html (EXPORT.md §8).
  if (m?.id && m?.version) ALLOWED_ROOT.add(`${m.version}-${m.id}.zip`);
  for (const name of readdirSync(dir)) {
    if (ALLOWED_ROOT.has(name)) continue;
    if (name === 'index.html' || name === 'preview.html') continue; // reported above
    // Same name in other letters (Icons/, Assets/, Game.js): fine on Windows, missing on the CDN.
    const fixed = [...ALLOWED_ROOT].find((n) => n.toLowerCase() === name.toLowerCase());
    if (fixed) {
      err(`${name} must be named ${fixed} (upper / lower case counts on the CDN)`);
      continue;
    }
    warn(`unexpected at the root: ${name} (only game.json, loader.js, ${entry}, i18n/, icons/, assets/)`);
  }

  // loader.js (docs/LOADING.md): the first script of every page; the kit's file, unchanged.
  const loaderPath = join(dir, 'loader.js');
  if (!existsSync(loaderPath)) err('loader.js is missing: copy docs/GMSDK_JS/loading/loader.js to public/loader.js (docs/LOADING.md)');
  else {
    const kitLoader = join(KIT, 'loading/loader.js');
    const mine = readFileSync(loaderPath, 'utf8');
    if (!/GMLoader/.test(mine)) err('loader.js is not the kit\'s loader: copy docs/GMSDK_JS/loading/loader.js to public/loader.js');
    else if (existsSync(kitLoader) && mine.replace(/\r\n/g, '\n') !== readFileSync(kitLoader, 'utf8').replace(/\r\n/g, '\n'))
      warn('loader.js differs from the kit\'s loading/loader.js: copy it again (the kit was updated, or it was edited)');
  }
  // The loading screen's images (loader.js): icons/ at the root, fixed names, easy to find and to swap.
  for (const need of ['icons/loading.webp', 'icons/logo.webp']) {
    if (!existsExact(dir, need)) err(`${need} is missing: copy docs/GMSDK_JS/loading/icons/ to public/icons/ and put the game's key art in loading.webp (docs/LOADING.md)`);
  }
  const sampleArt = join(KIT, 'loading/icons/loading.webp');
  if (existsSync(join(dir, 'icons/loading.webp')) && existsSync(sampleArt) && readFileSync(join(dir, 'icons/loading.webp')).equals(readFileSync(sampleArt)))
    warn('icons/loading.webp is still the kit sample: replace it with the game\'s key art (docs/LOADING.md)');
  checkSkin(dir);

  // the entry script
  const entryPath = join(dir, entry);
  if (!existsSync(entryPath)) err(`${entry} (game.json entry) is missing`);
  else {
    const js = readFileSync(entryPath, 'utf8');
    if (/createElement\(\s*["'`]script["'`]\s*\)/.test(js)) warn(`${entry} creates <script> tags: no outside script may be loaded (the SDK loads what it needs)`);
    if (/import\(\s*["'`]https?:/.test(js)) err(`${entry} imports a module from a URL: no outside script may be loaded`);
    if (/["'`]\/(assets|i18n|icons|Language)\//.test(js)) err(`${entry} uses an absolute path ("/assets/…" or "/i18n/…"): every path must be relative`);
    checkEmbed(js, entry);
    if (!/getSDK|GMSDKJS/.test(js)) warn(`${entry} never mentions getSDK / GMSDKJS: is the SDK wired in?`);
    // Literal asset paths whose file is not in the package (a renamed file of tools/compress.mjs missed, a typo).
    const missingAssets = [...new Set((js.match(/["'`](assets\/[^"'`?#\s]+\.(?:png|webp|jpe?g|mp3|ogg|wav|m4a|json))["'`?#]/gi) ?? []).map((m) => m.slice(1, -1)))].filter((p) => !existsExact(dir, p));
    // On the CDN these do not load: a typo, a renamed file, or only the upper / lower case differs.
    if (missingAssets.length) err(`${entry} names files that are not in the package under that exact name (upper / lower case counts on the CDN): ${missingAssets.slice(0, 6).join(', ')}`);
    // The leaderboard (docs/LEADERBOARD.md): its events name it in the minified code; the default screen its class.
    if (/leaderboard_submit/.test(js) && !m?.leaderboardId) err(`${entry} uses the leaderboard but game.json has no leaderboardId: set it in config.json`);
    // The game waits for loader.js (loadSDK) and hides its screen (createLoader().hide()): both go through GMLoader.
    if (!/GMLoader/.test(js)) warn(`${entry} never mentions GMLoader: the game must start with await loadSDK() and end its loading with createLoader().hide() (docs/LOADING.md)`);
    if (/gmlb-panel/.test(js)) {
      for (const need of ['assets/leaderboard/countries.json', 'assets/leaderboard/flags/GLOBE.png']) {
        if (!existsExact(dir, need)) err(`${need} is missing: copy docs/GMSDK_JS/leaderboard/flags/ and countries.json to public/assets/leaderboard/ (docs/LEADERBOARD.md §2)`);
      }
    }
    const owner = ownerInStrings(js);
    if (owner) warn(`${entry} writes ${owner.slice(0, 60)} itself: ${OWNER_HINT}`);
    // Event names stay as string literals in the minified code: a required one that never appears is not sent.
    if (analytics) {
      const required = ANALYSIS_EVENTS.flatMap(([key, names]) => {
        if (key === null) return names;
        const v = analytics[key];
        const none = v === null || v === undefined || (key === 'levels' && v.kind === 'none') || (typeof v === 'object' && !Object.keys(v).length);
        return none ? [] : names;
      }).concat((analytics.custom ?? []).map((c) => c?.name).filter(Boolean));
      const missing = required.filter((n) => !js.includes(`"${n}"`) && !js.includes(`'${n}'`) && !js.includes(`\`${n}\``));
      if (missing.length) warn(`${entry} never names these events of analytics.json / ANALYTICS.md §4: ${missing.join(', ')}`);
    }
    console.log(`${entry}: ${(js.length / 1024).toFixed(1)} KB`);
  }

  // i18n/<tag>.json: nested by group or flat, texts only; the default language holds every key
  const tables = {};
  for (const code of languages) {
    const name = `i18n/${code}.json`;
    const p = join(dir, 'i18n', `${code}.json`);
    if (!existsSync(p)) {
      err(`${name} is missing (listed in game.json)`);
      continue;
    }
    if (readFileSync(p)[0] === 0xef) warn(`${name} starts with a BOM: save it as UTF-8 without BOM`);
    const table = readJson(p, name);
    if (!table) continue;
    if (typeof table !== 'object' || Array.isArray(table)) {
      err(`${name} must be an object: { "key": "text" } or groups { "game": { "key": "text" } }`);
      continue;
    }
    const { texts, bad } = flattenTable(table);
    for (const path of bad.slice(0, 8)) err(`${name}: "${path}" is not a text (only strings, in groups if wanted)`);
    tables[code] = texts;
    const ownerKey = Object.keys(texts).find((k) => OWNER_TEXT.test(texts[k]));
    if (ownerKey) warn(`${name} "${ownerKey}" writes the owner itself ("${texts[ownerKey].slice(0, 40)}"): ${OWNER_HINT}`);
  }
  const def = m?.defaultLanguage;
  if (def && tables[def]) {
    const defKeys = new Set(Object.keys(tables[def]));
    for (const [code, table] of Object.entries(tables)) {
      if (code === def) continue;
      const extra = Object.keys(table).filter((k) => !defKeys.has(k));
      const missing = [...defKeys].filter((k) => !(k in table));
      if (extra.length) err(`i18n/${code}.json has keys i18n/${def}.json lacks (the default language holds every key): ${extra.slice(0, 8).join(', ')}`);
      if (missing.length) warn(`i18n/${code}.json misses ${missing.length} key(s), shown in ${def}: ${missing.slice(0, 8).join(', ')}`);
    }
  }
  if (existsSync(join(dir, 'i18n'))) {
    for (const f of readdirSync(join(dir, 'i18n'))) {
      const tag = f.replace(/\.json$/, '');
      if (!f.endsWith('.json') || !languages.includes(tag)) warn(`i18n/${f} is not in game.json languages: list it, or take it out`);
    }
  }

  // everything else
  const files = walk(dir);
  const maps = files.filter((f) => extname(f) === '.map');
  if (maps.length) warn(`${maps.length} source map file(s) in the package: leave them out`);
  // The package holds only what the game uses (EXPORT.md §3): files that are never game resources. The game
  // decides the rest (an unused image or sound), the kit does not guess it.
  const JUNK = /(\.(psd|psb|ai|xcf|kra|blend|blend1|fla|aseprite|ase|sketch|fig|bak|tmp|orig|log|md)|~|^thumbs\.db|^\.ds_store|^desktop\.ini)$/i;
  const junk = files.filter((f) => JUNK.test(f.split(/[\\/]/).pop()) && !f.includes(`${sep}i18n${sep}`));
  if (junk.length) {
    const size = junk.reduce((n, f) => n + statSync(f).size, 0);
    warn(`${junk.length} file(s) that are not game resources, ${(size / 1024 / 1024).toFixed(2)} MB: ${junk.slice(0, 6).map((f) => relative(dir, f)).join(', ')}: remove them from public/ (EXPORT.md §3)`);
  }
  const total = files.reduce((n, f) => n + statSync(f).size, 0);
  console.log(`${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB`);
}
if (dir) checkPackage();


// --- sources: no direct storage --------------------------------------------------------------------------------
if (srcDir) {
  if (!existsSync(srcDir)) err(`--src ${srcDir}: not found`);
  else {
    for (const f of walk(srcDir)) {
      // legacy-save.*: the game's own old save (AI_INSTALL.md, Cách làm: converter or old players on the old save).
      if (!/\.(m?js|ts|tsx|jsx)$/.test(f) || /gmsdkjs-shim|[\\/]sdk[\\/]storage\.|[\\/]legacy-save\./.test(f)) continue;
      if (/createLeaderboard\(/.test(readFileSync(f, 'utf8')) && config && !config.leaderboardId && !/[\\/]leaderboard[\\/]/.test(f)) err(`${relative(process.cwd(), f)} creates a leaderboard but config.json leaderboardId is null`);
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Comment lines (//, /* or /**, and * inside a block) only talk about storage.
        if (/\b(localStorage|sessionStorage)\b/.test(line) && !/^\s*(\/\/|\/?\*)/.test(line)) {
          err(`${relative(process.cwd(), f)}:${i + 1} uses ${line.match(/localStorage|sessionStorage/)[0]} directly: save through sdk.storage`);
        }
        // Top-level await (an unindented line with await): the export package is an iife, which cannot have it
        // (Vite: "iife does not support top-level await"). Await inside boot() (docs/EXPORT.md §3).
        if (/^[^\s/*][^]*\bawait\b/.test(line) && !/^\s*(\/\/|\/?\*)/.test(line) && !/^(export\s+)?(async\s+)?function\b|=>/.test(line)) {
          warn(`${relative(process.cwd(), f)}:${i + 1} looks like a top-level await: put it inside an async function (boot()), the export package is an iife (docs/EXPORT.md §3)`);
        }
      });
    }
  }
}

const what = dir ? 'the package meets docs/EXPORT.md' : 'config.json (and analytics.json) are complete';
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(errors.length ? `${errors.length} error(s): ${dir ? 'the package does not meet docs/EXPORT.md' : 'config.json / analytics.json are not ready'}` : `OK: ${what}`);
process.exit(errors.length ? 1 : 0);
