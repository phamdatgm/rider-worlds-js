// Meta-game data exported by tools/export_meta.py (cards, challenges, rank, tracks, shop, texts).
import { assetUrl } from '../engine/assets.js';
import { fetchRetry } from '../sdk/net.js';

export const Meta = {
  data: null,
  async load() {
    this.data = await (await fetchRetry(assetUrl('meta.json'))).json();
    // a web game played with the mouse: "Tap to continue" / "Tap to Open" read "Click ..." (owner's request, 2026-10-30)
    const loc = this.data.loc || {};
    for (const [k, v] of Object.entries(loc)) if (typeof v === 'string') loc[k] = v.replace(/\bTap\b/g, 'Click').replace(/\btap\b/g, 'click').replace(/\bTAP\b/g, 'CLICK');
    return this.data;
  },
};

/** English text of an I2 localization term; `{[0]}` / `{[X]}` style params are substituted. */
export function T(term, params) {
  let s = Meta.data?.loc?.[term];
  if (s === undefined) s = term;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{[${k}]}`).join(String(v));
  return s;
}

/** strip TextMeshPro rich-text tags, turning <gradient> into a highlight span */
export function richText(s) {
  return String(s)
    .replace(/<gradient="[^"]*">/g, '<em class="hl">')
    .replace(/<\/gradient>/g, '</em>')
    .replace(/<color=([^>]+)>/g, '<span style="color:$1">')
    .replace(/<\/color>/g, '</span>')
    .replace(/\n/g, '<br>')
    .replace(/<size=[^>]*>|<\/size>/g, '')
    .replace(/<(?!\/?(em|span|br)\b)[^>]+>/g, '');
}
