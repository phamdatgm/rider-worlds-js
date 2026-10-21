// UI sprites packed by tools/export.py (write_ui_atlas): {$sprite, fid} / {$tex} refs -> Sprite objects.
import * as THREE from 'three';
import { assetUrl, getTexture, getWhiteTexture } from '../engine/assets.js';

const loader = new THREE.TextureLoader();

export class Sprite {
  constructor(key, info, page, pw, ph) {
    this.key = key;
    this.name = key.split('/').pop().split('#')[0];
    this.texture = page;
    const [x, y, w, h] = info.r;
    const [sw, sh] = info.sz;
    this.rect = { x: 0, y: 0, width: sw, height: sh };
    this.border = { x: info.b[0], y: info.b[1], z: info.b[2], w: info.b[3] }; // left, bottom, right, top (sprite px)
    this.pivot = { x: sw * info.pv[0], y: sh * info.pv[1] };
    this.pixelsPerUnit = info.ppu || 100;
    // atlas region in GL uv space (flipY textures: v = 1 at the top of the page)
    this.u0 = x / pw;
    this.u1 = (x + w) / pw;
    this.v0 = 1 - (y + h) / ph;
    this.v1 = 1 - y / ph;
    this.packed = true;
  }

  get bounds() {
    return { size: { x: this.rect.width / this.pixelsPerUnit, y: this.rect.height / this.pixelsPerUnit } };
  }

  /** outer uv [u0, v0, u1, v1] */
  get outerUV() {
    return [this.u0, this.v0, this.u1, this.v1];
  }

  /** inner uv: the corners inset by the 9-slice border */
  get innerUV() {
    const kx = (this.u1 - this.u0) / this.rect.width;
    const ky = (this.v1 - this.v0) / this.rect.height;
    return [this.u0 + this.border.x * kx, this.v0 + this.border.y * ky, this.u1 - this.border.z * kx, this.v1 - this.border.w * ky];
  }

  get hasBorder() {
    const b = this.border;
    return b.x > 0 || b.y > 0 || b.z > 0 || b.w > 0;
  }

  toString() {
    return this.name;
  }
}

/** A whole texture shown as a sprite (RawImage / fallback for textures outside the atlas). */
export class TextureSprite extends Sprite {
  constructor(key, texture, w = 1, h = 1) {
    super(key, { r: [0, 0, 1, 1], sz: [w, h], b: [0, 0, 0, 0], pv: [0.5, 0.5], ppu: 100 }, texture, 1, 1);
    this.u0 = 0;
    this.u1 = 1;
    this.v0 = 0;
    this.v1 = 1;
    this.packed = false;
  }
}

export const UISprites = {
  pages: [],
  info: {},
  cache: new Map(),
  ready: false,

  async load() {
    // ui/: sprites referenced by the exported UI data; ui_extra/ (optional): sprites only named by meta data
    const atlases = [];
    for (const dir of ['ui', 'ui_extra']) {
      try {
        const r = await fetch(assetUrl(`${dir}/atlas.json`));
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) continue;
        atlases.push({ dir, atlas: await r.json() });
      } catch {
        // missing optional atlas
      }
    }
    this.info = {};
    this.pageSize = [];
    const pageFiles = [];
    for (const { dir, atlas } of atlases) {
      const base = pageFiles.length;
      for (const [k, v] of Object.entries(atlas.sprites)) if (!(k in this.info)) this.info[k] = { ...v, p: v.p + base };
      for (const p of atlas.pages) {
        pageFiles.push(`${dir}/${p[0]}`);
        this.pageSize.push([p[1], p[2]]);
      }
    }
    this.pages = await Promise.all(
      pageFiles.map(
        (file) =>
          new Promise((res) => {
            loader.load(
              assetUrl(file),
              (tex) => {
                tex.colorSpace = THREE.NoColorSpace;
                tex.magFilter = THREE.LinearFilter;
                tex.minFilter = THREE.LinearFilter;
                tex.generateMipmaps = false;
                tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
                res(tex);
              },
              undefined,
              () => res(getWhiteTexture()),
            );
          }),
      ),
    );
    this.ready = true;
  },

  /** {$sprite: rid, fid} | {$tex: rid} | 'rid' | Sprite -> Sprite (or null) */
  get(ref) {
    if (!ref) return null;
    if (ref instanceof Sprite) return ref;
    let key;
    if (typeof ref === 'string') key = ref;
    else if (ref.$sprite) key = this.info[ref.$sprite] ? ref.$sprite : `${ref.$sprite}#${ref.fid}`;
    else if (ref.$tex) key = ref.$tex;
    else return null;
    if (this.cache.has(key)) return this.cache.get(key);
    let s = null;
    const info = this.info[key];
    if (info) {
      const [pw, ph] = this.pageSize[info.p];
      s = new Sprite(key, info, this.pages[info.p], pw, ph);
    } else if (ref.$tex || ref.$sprite) {
      const tex = getTexture(ref.$tex || ref.$sprite);
      if (tex) {
        const sz = tex.userData.info?.size || [1, 1];
        s = new TextureSprite(key, tex, sz[0], sz[1]);
      }
    }
    this.cache.set(key, s);
    return s;
  },

  /** sprite by file name (without extension), for scripts that look sprites up by name */
  byName(name) {
    for (const key in this.info) if (key.split('/').pop() === name) return this.get(key);
    return null;
  },
};
