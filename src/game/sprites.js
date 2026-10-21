// UI sprites packed by tools/export_ui.py: drawn as CSS backgrounds cut out of the atlas pages.
const BASE = (import.meta.env?.BASE_URL || '/') + 'ui/atlas/';

export const Sprites = {
  pages: [],
  map: {},
  async load() {
    try {
      const r = await fetch(BASE + 'atlas.json');
      const j = await r.json();
      this.pages = j.pages;
      this.map = j.sprites;
      // warm the pages so popups don't pop in
      for (const [f] of this.pages) new Image().src = BASE + f;
    } catch (e) {
      console.warn('ui atlas', e);
    }
  },
  has(name) {
    return !!this.map[name];
  },
  /** native size [w, h] of a sprite */
  size(name) {
    const s = this.map[name];
    return s ? [s[3], s[4]] : [0, 0];
  },
  /** inline style that shows `name` scaled to `width` px (height follows the aspect ratio unless given) */
  style(name, width, height) {
    const s = this.map[name];
    if (!s) return '';
    const [pi, x, y, w, h] = s;
    const [file, pw, ph] = this.pages[pi];
    const kx = width / w;
    const ky = height ? height / h : kx;
    return `background-image:url('${BASE}${file}');background-size:${pw * kx}px ${ph * ky}px;background-position:${-x * kx}px ${-y * ky}px;width:${w * kx}px;height:${h * ky}px;`;
  },
};

/** `<span class="spr">` showing a sprite; extra classes/attributes optional */
export function spr(name, width, { cls = '', height, attrs = '' } = {}) {
  if (!Sprites.has(name)) return `<span class="spr missing ${cls}" style="width:${width}px;height:${height || width}px" ${attrs}></span>`;
  return `<span class="spr ${cls}" style="${Sprites.style(name, width, height)}" ${attrs}></span>`;
}
