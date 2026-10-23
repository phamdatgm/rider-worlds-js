// Saves of the builds made before GMSDK_JS 1.0.1. The owner chose to convert them (AI_INSTALL.md, option 2): once,
// before anything reads sdk.storage, the old data moves into the kit's save and the old keys go away. The only file
// besides the kit's sdk/storage.js that touches localStorage (check-export allows it here).
//
//   JS_SDK_2.0 builds   azgames.g2610211044 in plain JSON ({ v, save, saveV1?, sdk: { name, country } }); the kit's
//                       save keeps the same key but in its own format, which would drop the plain JSON as tampered
//   pre-SDK builds      rider-worlds-save-v2 (the save document), rider-worlds-save-v1 (the v1 document)

/** the save key of every JS_SDK_2.0 build (AZ_SETTINGS.gameCode); the build tool may give the page another code */
const SDK2_KEY = 'azgames.g2610211044';
const PRE_SDK = { 'rider-worlds-save-v2': 'save', 'rider-worlds-save-v1': 'saveV1' };

function ls() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** the plain-JSON save under `key`, removed from localStorage; null when there is none (or it is the kit's format) */
function takeSdk2Save(key) {
  try {
    const raw = ls()?.getItem(key);
    if (!raw || raw.startsWith('gm1')) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    ls().removeItem(key);
    return data;
  } catch {
    return null;
  }
}

/**
 * Converts an old save into `storage` (sdk.storage). Call it once at boot, before the first storage read.
 * @returns {'sdk2' | 'pre_sdk' | null} where the converted save came from
 */
export function convertLegacySave(storage) {
  let old = null;
  for (const key of new Set([storage.key, SDK2_KEY])) old ??= takeSdk2Save(key);
  if (old) {
    for (const [area, value] of Object.entries(old)) {
      if (area === 'v' || area === 'sdk' || value === null || value === undefined) continue;
      storage.set(area, value);
    }
    // the leaderboard's copy of the player's name and flag (sdk area of JS_SDK_2.0, leaderboard area of the kit)
    const { name, country } = old.sdk ?? {};
    if (name || country) storage.patch('leaderboard', { name: name ?? '', country: country ?? '' });
    storage.flush();
    try {
      for (const key of Object.keys(PRE_SDK)) ls()?.removeItem(key);
    } catch {
      // the old keys stay: harmless, the converted save wins
    }
    return 'sdk2';
  }
  return storage.migrate(PRE_SDK).length ? 'pre_sdk' : null;
}
