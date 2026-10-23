// The copyright line (docs/INTEGRATION.md §9). Default "© 2026 Azgames.io"; the SDK changes it only when the server says
// so (gameinfo.trademark of the licence API, through sdk.brand.trademark()):
//
//   no SDK / no answer / the default owner   → "© 2026 Azgames.io"
//   another domain or name from the server   → "© 2026 <that>"
//   trademark off (0, and GD / CrazyGames / Poki templates)  → ''  (show nothing)
//
//   import { copyrightText } from './sdk/copyright.js';
//   label.textContent = copyrightText(sdk);   // after sdk.ready(): the server's answer is in
//
// The only place the game may name the owner: check-export accepts this default and warns on any other.

export const COPYRIGHT_YEAR = 2026;
export const COPYRIGHT_OWNER = 'Azgames.io';
export const COPYRIGHT_DEFAULT = `© ${COPYRIGHT_YEAR} ${COPYRIGHT_OWNER}`;

/** @param {object} [sdk] getSDK() of the shim @returns {string} '' = show nothing */
export function copyrightText(sdk) {
  let owner;
  try {
    // The shim's fallback (no gmsdkjs on the page) has no server to ask: the default.
    if (!sdk || sdk.version === 'fallback') return COPYRIGHT_DEFAULT;
    owner = sdk.brand.trademark();
  } catch {
    return COPYRIGHT_DEFAULT;
  }
  if (owner === '') return '';
  if (typeof owner !== 'string' || !owner.trim() || owner.trim().toLowerCase() === COPYRIGHT_OWNER.toLowerCase()) return COPYRIGHT_DEFAULT;
  return `© ${COPYRIGHT_YEAR} ${owner.trim()}`;
}
