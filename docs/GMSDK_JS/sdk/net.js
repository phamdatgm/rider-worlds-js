/**
 * Loads that never hang (docs/INTEGRATION.md §8). Copy into the game next to the other sdk/ files.
 *
 * A bare fetch() / new Image() breaks a game three ways:
 *   1. the request hangs: the Promise never settles and the loading screen stays forever;
 *   2. a failed result cached in a Map keeps that asset broken until the page reloads;
 *   3. the browser keeps the failed response in its HTTP cache, so a retry fails again.
 * Here every try has a time limit, there are NET.TRIES tries with growing pauses, and a retry adds ?r=n.
 *
 *   import { loadImage, loadJSON, fetchRetry, fontsReady } from './sdk/net.js';
 *   const img = await loadImage('assets/img/box.png');
 *   const level = await loadJSON('assets/levels/12.json');
 *   await fontsReady();            // waits for fonts 4 s at most, never hangs
 *
 * A game cache that keeps Promises must drop the failed ones:
 *   cache.set(k, loadJSON(url).catch((e) => { cache.delete(k); throw e; }));
 */

export const NET = {
  TRIES: 3, // tries in all
  TIMEOUT: 15000, // ms for EACH try (a hanging request counts as a failure)
  BACKOFF: [600, 1500], // ms to wait before the 2nd and 3rd try
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bust = (url, i) => (i ? `${url}${url.includes('?') ? '&' : '?'}r=${i}` : url);

/** Runs fn(try) until it succeeds or NET.TRIES tries have failed; throws the last error. */
export async function withRetry(fn, label = '') {
  let err;
  for (let i = 0; i < NET.TRIES; i++) {
    try {
      return await fn(i);
    } catch (e) {
      err = e;
    }
    if (i < NET.TRIES - 1) {
      console.warn(`[net] retry ${i + 1} ${label}`);
      await wait(NET.BACKOFF[i] ?? 2000);
    }
  }
  throw err;
}

function loadImageOnce(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      img.src = '';
      reject(new Error(`timeout ${url}`));
    }, NET.TIMEOUT);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`image ${url}`));
    };
    img.src = url;
  });
}

/** A loaded HTMLImageElement (retries, time limit). */
export const loadImage = (url) => withRetry((i) => loadImageOnce(bust(url, i)), url);

/** fetch() with a time limit and retries; the Response has been checked for r.ok. */
export function fetchRetry(url, init) {
  return withRetry(async (i) => {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ac && ac.abort(), NET.TIMEOUT);
    try {
      const r = await fetch(bust(url, i), ac ? { ...init, signal: ac.signal } : init);
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      return r;
    } finally {
      clearTimeout(timer);
    }
  }, url);
}

export const loadJSON = async (url) => (await fetchRetry(url)).json();
export const loadArrayBuffer = async (url) => (await fetchRetry(url)).arrayBuffer();

/** Waits for the page's fonts, `ms` at most: a broken or hanging font falls back, it never hangs the loading screen. */
export const fontsReady = (ms = 4000) => Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(ms)]);
