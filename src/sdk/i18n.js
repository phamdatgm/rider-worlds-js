/**
 * Localisation (docs/INTEGRATION.md §7). Strings live in i18n/<tag>.json, one file per language listed in
 * game.json; <tag> is a BCP 47 tag: `en`, `es`, `en-US`, `pt-BR`, `zh-CN`, `zh-TW`, `ko-KR` (language in lower
 * case, region in upper case). A table is nested by group or flat: { "game": { "score": "Score" } } is
 * t('game.score'); { "play": "Play" } is t('play'). The defaultLanguage file is REQUIRED and holds every key.
 *
 *   import { initI18n, setLang, t, onLangChange, languageList } from './sdk/i18n.js';
 *   await initI18n({ languages: ['en-US', 'zh-TW'], defaultLanguage: 'en-US', storage: sdk.storage });
 *   t('game.score');  t('x_wins', name);  t('hi', { name });   // "{0}", "{1}" by position, "{name}" by name
 *   await setLang('zh-TW');           // the player picked a language: the only call that saves it
 *
 * Start language: the player's saved choice (storage area 'settings', field 'language') -> the page's language
 * (GMSDKJS_OPTIONS.language of index.html, set per portal: the operator changes it there without a new build) ->
 * defaultLanguage of game.json. Not the browser's language: the page decides, the player switches in the game.
 * A tag the game does not list matches its language (zh -> zh-TW) or is skipped. A key missing in the language in use falls back to its language (zh-TW -> zh),
 * then to defaultLanguage, then to the key itself. The default language failing to load throws, so the boot
 * code can show a "Try again" popup; any other language failing silently keeps the default.
 */
import { fetchRetry } from './net.js';

export const I18N_DIR = 'i18n/';

/** Menu names, each written in its own language. Add the ones your game ships. */
export const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  'pt-BR': 'Português (Brasil)',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ru: 'Русский',
  tr: 'Türkçe',
  pl: 'Polski',
  nl: 'Nederlands',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ar: 'العربية',
  he: 'עברית',
  fa: 'فارسی',
  hi: 'हिन्दी',
};

/** Languages written right to left: the page gets dir="rtl". */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

const tables = {};
const listeners = [];
let available = [];
let fallback = 'en';
let current = 'en';
let store = null;

const baseOf = (tag) => String(tag).split('-')[0].toLowerCase();

/** A tag in its canonical case: zh-tw -> zh-TW, ZH-hant -> zh-Hant. */
export function normalizeTag(tag) {
  return String(tag ?? '')
    .trim()
    .replace(/_/g, '-')
    .split('-')
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 2 ? p.toUpperCase() : p.length === 4 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join('-');
}

/** The listed tag that serves `wanted`: the same tag, then its language (zh-TW -> zh), then any tag of that language; or null. */
export function matchLanguage(wanted, list) {
  const tag = normalizeTag(wanted);
  if (!tag) return null;
  const tags = list.map(normalizeTag);
  if (tags.includes(tag)) return tag;
  const base = baseOf(tag);
  if (tags.includes(base)) return base;
  return tags.find((t) => baseOf(t) === base) ?? null;
}

async function ensure(code) {
  if (tables[code]) return true;
  try {
    tables[code] = await (await fetchRetry(`${I18N_DIR}${code}.json`)).json();
    return true;
  } catch {
    return false;
  }
}

async function apply(code) {
  if (!(await ensure(code))) code = fallback;
  // Its language too (zh-TW falls back to zh), when the game ships it.
  const base = baseOf(code);
  if (base !== code && available.includes(base)) await ensure(base);
  current = code;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = code;
    document.documentElement.dir = RTL.has(baseOf(code)) ? 'rtl' : 'ltr';
  }
  for (const fn of listeners) {
    try {
      fn(code);
    } catch (e) {
      console.error('[i18n] listener failed', e);
    }
  }
}

/** The page's default language: GMSDKJS_OPTIONS.language of index.html ('' when not set or still a placeholder). */
function pageLanguage() {
  try {
    const v = globalThis.GMSDKJS_OPTIONS?.language;
    return typeof v === 'string' && !v.includes('<!--') ? v.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Loads the default language, then the language to start in. `languages` and `defaultLanguage` come from
 * game.json; `storage` is the SDK's storage (sdk.storage), where the player's choice is kept. `pageLanguage`
 * is read from GMSDKJS_OPTIONS.language when not given. Returns the language in use.
 */
export async function initI18n({ languages, defaultLanguage, storage = null, pageLanguage: page } = {}) {
  available = (languages?.length ? languages : [defaultLanguage ?? 'en']).map(normalizeTag);
  fallback = matchLanguage(defaultLanguage ?? available[0], available) ?? available[0];
  store = storage;
  if (!(await ensure(fallback))) throw new Error(`${I18N_DIR}${fallback}.json failed to load`);
  const saved = store?.get('settings', {})?.language;
  const savedTag = saved && available.includes(normalizeTag(saved)) ? normalizeTag(saved) : null;
  const fromPage = page ?? pageLanguage();
  const wanted = savedTag ?? (fromPage && matchLanguage(fromPage, available)) ?? fallback;
  await apply(wanted);
  return current;
}

/** The player picked a language: switch and save it. Tags the game does not list are ignored. */
export async function setLang(code) {
  const tag = normalizeTag(code);
  if (!available.includes(tag)) return current;
  await apply(tag);
  store?.patch('settings', { language: current });
  return current;
}

/** The text at `key` in a table: a flat key first, then the dotted path through the groups. */
function lookup(table, key) {
  if (!table) return undefined;
  if (typeof table[key] === 'string') return table[key];
  let node = table;
  for (const part of String(key).split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(key, ...args) {
  const chain = [current, baseOf(current), fallback];
  let s = key;
  for (const code of chain) {
    const found = lookup(tables[code], key);
    if (found !== undefined) {
      s = found;
      break;
    }
  }
  if (!args.length) return s;
  // One object: "{name}" (and "{0}") from its fields, unknown ones stay. Else "{0}", "{1}" by position.
  if (args.length === 1 && args[0] && typeof args[0] === 'object') {
    const named = args[0];
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (named[k] === undefined || named[k] === null ? m : String(named[k])));
  }
  return String(s).replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '');
}

export const currentLang = () => current;

/** [{ code, name }] for a language menu, in game.json's order. */
export const languageList = () => available.map((code) => ({ code, name: LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES[baseOf(code)] ?? code }));

/** Calls fn(code) after every language change; returns the function that stops it. */
export function onLangChange(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}
