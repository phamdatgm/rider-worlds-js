/**
 * Localisation (docs/JSGMSDK.md B.5). Strings live in Language/<code>.json: flat { "key": "value" }, one file per language.
 * `Language/en.json` is REQUIRED and holds every key of the game.
 *
 *   import { initI18n, setLang, t, onLangChange, LANGUAGES } from './sdk/i18n.js';
 *   await initI18n();                // at boot: loads en, then the player's saved language or AZ_SETTINGS.language
 *   t('play');  t('x_wins', name);   // "{0}", "{1}" are replaced by the arguments
 *   await setLang('es');             // the player picked a language (this is the only thing that saves it)
 *
 * Order of choice: the player's saved choice -> window.AZ_SETTINGS.language (index.html) -> 'en'.
 * A key missing in the chosen language falls back to English, then to the key itself.
 *
 * Loading goes through sdk/net.js (time limit + retries). English failing to load throws, so the boot code can show
 * the player a "Try again" popup; any other language failing silently keeps English.
 */
import { fetchRetry } from './net.js';
import { gameData } from './storage.js';

export const LANG_DIR = 'Language/';
export const DEFAULT_LANG = 'en';

/** Menu list: add { code, name } for every Language/<code>.json the game ships. `name` is written in that language. */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
];

const tables = {};
let current = DEFAULT_LANG;
const listeners = [];

async function ensure(code) {
  if (tables[code]) return true;
  try {
    tables[code] = await (await fetchRetry(`${LANG_DIR}${code}.json`)).json();
    return true;
  } catch {
    return false;
  }
}

export async function setLang(code, persist = true) {
  if (!(await ensure(code))) code = DEFAULT_LANG;
  current = code;
  if (persist) gameData.patch('settings', { lang: code });
  document.documentElement.lang = code;
  listeners.forEach((fn) => fn(code));
}

export async function initI18n() {
  if (!(await ensure(DEFAULT_LANG))) throw new Error(`${LANG_DIR}${DEFAULT_LANG}.json failed to load`);
  const wanted = gameData.get('settings').lang || globalThis.AZ_SETTINGS?.language || DEFAULT_LANG;
  await setLang(wanted, false);   // not saved: the default must stay changeable in index.html
}

export function t(key, ...args) {
  const s = tables[current]?.[key] ?? tables[DEFAULT_LANG]?.[key] ?? key;
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '') : s;
}

export const currentLang = () => current;
export const onLangChange = (fn) => { listeners.push(fn); };
