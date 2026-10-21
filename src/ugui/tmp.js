// TextMesh Pro for the web port: SDF font assets exported from the Unity project, TMP's layout rules
// (TMP_Text.GenerateTextMesh: metrics, kerning, word wrapping, auto sizing, alignment) and the
// Distance Field shader parameters. Rendering itself is done by the UI renderer (ugui/render.js).
import * as THREE from 'three';
import { Assets, getTexture } from '../engine/assets.js';
import { getRuntimeSO, registerComponent } from '../engine/instantiate.js';
import { Graphic, Color, UIMesh, ColorUtility } from './graphic.js';
import { UISprites } from './sprites.js';
import { bumpLayout } from './rect.js';

// ---------------------------------------------------------------- font data

const fontCache = new Map();

/** Indexed view of an exported TMP_FontAsset ScriptableObject. */
export class FontData {
  constructor(so) {
    this.so = so;
    this.name = so.name || so.$name;
    const fi = so.m_FaceInfo || {};
    this.face = {
      pointSize: fi.m_PointSize || 90,
      scale: fi.m_Scale || 1,
      lineHeight: fi.m_LineHeight || 100,
      ascent: fi.m_AscentLine || 80,
      descent: fi.m_DescentLine || -20,
      capLine: fi.m_CapLine || 60,
      meanLine: fi.m_MeanLine || 50,
      baseline: fi.m_Baseline || 0,
      tabWidth: fi.m_TabWidth || 30,
    };
    this.glyphs = new Map();
    for (const g of so.m_GlyphTable || []) {
      const m = g.m_Metrics || {};
      const r = g.m_GlyphRect || {};
      this.glyphs.set(g.m_Index, {
        w: m.m_Width || 0,
        h: m.m_Height || 0,
        bx: m.m_HorizontalBearingX || 0,
        by: m.m_HorizontalBearingY || 0,
        adv: m.m_HorizontalAdvance || 0,
        rx: r.m_X || 0,
        ry: r.m_Y || 0,
        rw: r.m_Width || 0,
        rh: r.m_Height || 0,
        scale: g.m_Scale ?? 1,
      });
    }
    this.chars = new Map();
    for (const c of so.m_CharacterTable || []) this.chars.set(c.m_Unicode, { glyph: c.m_GlyphIndex, scale: c.m_Scale ?? 1 });
    this.kerning = new Map();
    for (const k of so.m_FontFeatureTable?.m_GlyphPairAdjustmentRecords || []) {
      const a = k.m_FirstAdjustmentRecord || {};
      const b = k.m_SecondAdjustmentRecord || {};
      this.kerning.set(a.m_GlyphIndex * 65536 + b.m_GlyphIndex, {
        ax: a.m_GlyphValueRecord?.m_XPlacement || 0,
        ay: a.m_GlyphValueRecord?.m_YPlacement || 0,
        aadv: a.m_GlyphValueRecord?.m_XAdvance || 0,
        bx: b.m_GlyphValueRecord?.m_XPlacement || 0,
        by: b.m_GlyphValueRecord?.m_YPlacement || 0,
        badv: b.m_GlyphValueRecord?.m_XAdvance || 0,
      });
    }
    this.atlasW = so.m_AtlasWidth || 1024;
    this.atlasH = so.m_AtlasHeight || 1024;
    this.padding = so.m_AtlasPadding || 5;
    this.normalStyle = so.normalStyle || 0;
    this.normalSpacingOffset = so.normalSpacingOffset || 0;
    this.boldStyle = so.boldStyle ?? 0.75;
    this.boldSpacing = so.boldSpacing ?? 7;
    this.italicStyle = so.italicStyle ?? 35;
    this.tabSize = so.tabSize ?? 10;
    const texRef = (so.m_AtlasTextures || [])[0];
    this.atlasId = texRef?.$tex || null;
    this.materialId = so.material?.$mat || null;
    this.fallbacks = (so.m_FallbackFontAssetTable || []).map((f) => f).filter(Boolean);
  }

  get texture() {
    if (!this._tex && this.atlasId) {
      this._tex = getTexture(this.atlasId);
      if (this._tex) {
        this._tex.generateMipmaps = false;
        this._tex.minFilter = THREE.LinearFilter;
        this._tex.magFilter = THREE.LinearFilter;
      }
    }
    return this._tex;
  }

  /** {font, glyph, scale} for a code point (this font, its fallbacks, TMP Settings fallbacks) */
  lookup(code, seen = new Set()) {
    seen.add(this);
    const c = this.chars.get(code);
    if (c) {
      const g = this.glyphs.get(c.glyph);
      if (g) return { font: this, glyph: g, index: c.glyph, scale: c.scale * g.scale };
    }
    for (const f of this.fallbacks) {
      const fd = fontData(f);
      if (fd && !seen.has(fd)) {
        const r = fd.lookup(code, seen);
        if (r) return r;
      }
    }
    return null;
  }
}

export function fontData(ref) {
  if (!ref) return null;
  let so = ref;
  if (ref.$so) so = getRuntimeSO(ref.$so);
  else if (typeof ref === 'string') so = getRuntimeSO(ref);
  if (!so || !so.m_GlyphTable) return null;
  let fd = fontCache.get(so);
  if (!fd) {
    fd = new FontData(so);
    fontCache.set(so, fd);
  }
  return fd;
}

export const TMP_Settings = {
  get so() {
    const id = Assets.manifest?.tmp?.settings;
    return id ? getRuntimeSO(id) : null;
  },
  get defaultFont() {
    return fontData(this.so?.m_defaultFontAsset) || fontData('Resources/fonts & materials/LiberationSans SDF');
  },
  get fallbacks() {
    return (this.so?.m_fallbackFontAssets || []).map(fontData).filter(Boolean);
  },
  spriteAsset(name) {
    const list = Assets.manifest?.tmp?.spriteAssets || [];
    const id = name ? list.find((x) => x.split('/').pop() === name) : list[0];
    return id ? spriteData(getRuntimeSO(id)) : null;
  },
  gradient(name) {
    const id = (Assets.manifest?.tmp?.gradients || []).find((x) => x.split('/').pop() === name);
    return id ? gradientColors(getRuntimeSO(id)) : null;
  },
};

function gradientColors(so) {
  if (!so) return null;
  return {
    tl: Color.from(so.topLeft),
    tr: Color.from(so.topRight),
    bl: Color.from(so.bottomLeft),
    br: Color.from(so.bottomRight),
  };
}

// ---------------------------------------------------------------- sprite assets

const spriteCache = new Map();

class SpriteAssetData {
  constructor(so) {
    this.so = so;
    this.name = so.name;
    const fi = so.m_FaceInfo || {};
    this.face = { pointSize: fi.m_PointSize || 0, scale: fi.m_Scale || 1, ascent: fi.m_AscentLine || 0, descent: fi.m_DescentLine || 0, baseline: fi.m_Baseline || 0 };
    this.glyphs = new Map();
    for (const g of so.m_SpriteGlyphTable || []) {
      const m = g.m_Metrics || {};
      const r = g.m_GlyphRect || {};
      this.glyphs.set(g.m_Index, { w: m.m_Width || 0, h: m.m_Height || 0, bx: m.m_HorizontalBearingX || 0, by: m.m_HorizontalBearingY || 0, adv: m.m_HorizontalAdvance || 0, rx: r.m_X || 0, ry: r.m_Y || 0, rw: r.m_Width || 0, rh: r.m_Height || 0, scale: g.m_Scale ?? 1 });
    }
    this.chars = (so.m_SpriteCharacterTable || []).map((c) => ({ name: c.m_Name, unicode: c.m_Unicode, glyph: c.m_GlyphIndex, scale: c.m_Scale ?? 1 }));
    this.texId = so.spriteSheet?.$tex || null;
  }

  get texture() {
    if (!this._tex && this.texId) this._tex = getTexture(this.texId);
    return this._tex;
  }

  get texSize() {
    const t = this.texture;
    const info = t?.userData?.info?.size;
    return info || [t?.image?.width || 1, t?.image?.height || 1];
  }

  byIndex(i) {
    const c = this.chars[i];
    return c ? { char: c, glyph: this.glyphs.get(c.glyph) } : null;
  }

  byName(name) {
    const c = this.chars.find((x) => x.name === name);
    return c ? { char: c, glyph: this.glyphs.get(c.glyph) } : null;
  }
}

function spriteData(so) {
  if (!so || !so.m_SpriteCharacterTable) return null;
  let d = spriteCache.get(so);
  if (!d) {
    d = new SpriteAssetData(so);
    spriteCache.set(so, d);
  }
  return d;
}

// ---------------------------------------------------------------- materials (Distance Field shader parameters)

let instanceCount = 0;
const SHADER_KIND = (shader) => (/Mobile/.test(shader) ? 'mobile' : /Overlay/.test(shader) ? 'overlay' : 'df');

export class TMPMaterial {
  constructor(json, id) {
    this.id = id;
    this.name = json?.name || id;
    this.kind = SHADER_KIND(json?.shader || '');
    const f = json?.floats || {};
    const c = json?.colors || {};
    const kw = new Set(json?.keywords || []);
    const col = (k, d) => Color.from(c[k], d);
    this.faceColor = col('_FaceColor', Color.white);
    this.outlineColor = col('_OutlineColor', Color.black);
    this.underlayColor = col('_UnderlayColor', new Color(0, 0, 0, 0.5));
    this.glowColor = col('_GlowColor', new Color(0, 1, 0, 0.5));
    const num = (k, d) => (f[k] === undefined ? d : f[k]);
    this.outlineWidth = num('_OutlineWidth', 0);
    this.outlineSoftness = num('_OutlineSoftness', 0);
    this.faceDilate = num('_FaceDilate', 0);
    this.underlayOffsetX = num('_UnderlayOffsetX', 0);
    this.underlayOffsetY = num('_UnderlayOffsetY', 0);
    this.underlayDilate = num('_UnderlayDilate', 0);
    this.underlaySoftness = num('_UnderlaySoftness', 0);
    this.glowOffset = num('_GlowOffset', 0);
    this.glowInner = num('_GlowInner', 0.05);
    this.glowOuter = num('_GlowOuter', 0.05);
    this.glowPower = num('_GlowPower', 0.75);
    this.weightNormal = num('_WeightNormal', 0);
    this.weightBold = num('_WeightBold', 0.5);
    this.gradientScale = num('_GradientScale', 5);
    this.sharpness = num('_Sharpness', 0);
    this.scaleX = num('_ScaleX', 1);
    this.scaleY = num('_ScaleY', 1);
    this.texW = num('_TextureWidth', 512);
    this.texH = num('_TextureHeight', 512);
    this.vertexOffsetX = num('_VertexOffsetX', 0);
    this.vertexOffsetY = num('_VertexOffsetY', 0);
    this.underlay = kw.has('UNDERLAY_ON') ? 1 : kw.has('UNDERLAY_INNER') ? 2 : 0;
    this.glow = kw.has('GLOW_ON');
    this.ratiosOff = kw.has('RATIOS_OFF');
    this.version = 0;
    this.updateRatios();
  }

  clone() {
    const m = Object.create(TMPMaterial.prototype);
    Object.assign(m, this);
    for (const k of ['faceColor', 'outlineColor', 'underlayColor', 'glowColor']) m[k] = this[k].clone();
    m.version = 0;
    m.id = `${this.id}#${++instanceCount}`;
    return m;
  }

  /** ShaderUtilities.UpdateShaderRatios */
  updateRatios() {
    const gs = this.gradientScale;
    const clamp = 1;
    const weight = Math.max(this.weightNormal, this.weightBold) / 4;
    let t = Math.max(1, weight + this.faceDilate + this.outlineWidth + this.outlineSoftness);
    this.scaleRatioA = this.ratiosOff ? 1 : (gs - clamp) / (gs * t);
    const range = (weight + this.faceDilate) * (gs - clamp);
    t = Math.max(1, this.glowOffset + this.glowOuter);
    this.scaleRatioB = this.ratiosOff ? 1 : Math.max(0, gs - clamp - range) / (gs * t);
    t = Math.max(1, Math.max(Math.abs(this.underlayOffsetX), Math.abs(this.underlayOffsetY)) + this.underlayDilate + this.underlaySoftness);
    this.scaleRatioC = this.ratiosOff ? 1 : Math.max(0, gs - clamp - range) / (gs * t);
    this.version++;
  }

  /** ShaderUtilities.GetPadding: atlas texels added around each glyph quad */
  getPadding(extra, bold) {
    const gs = this.gradientScale;
    const ra = this.scaleRatioA;
    const faceDilate = this.faceDilate * ra;
    const softness = this.outlineSoftness * ra;
    const outline = this.outlineWidth * ra;
    let uniform = outline + softness + faceDilate;
    if (this.glow) {
      const rb = this.scaleRatioB;
      uniform = Math.max(uniform, faceDilate + this.glowOffset * rb + this.glowOuter * rb);
    }
    const pad = [uniform, uniform, uniform, uniform];
    if (this.underlay) {
      const rc = this.scaleRatioC;
      const ox = this.underlayOffsetX * rc;
      const oy = this.underlayOffsetY * rc;
      const d = this.underlayDilate * rc;
      const s = this.underlaySoftness * rc;
      pad[0] = Math.max(pad[0], faceDilate + d + s - ox);
      pad[1] = Math.max(pad[1], faceDilate + d + s - oy);
      pad[2] = Math.max(pad[2], faceDilate + d + s + ox);
      pad[3] = Math.max(pad[3], faceDilate + d + s + oy);
    }
    const ex = extra ? 4 : 0;
    let m = 0;
    for (let i = 0; i < 4; i++) m = Math.max(m, Math.min(pad[i] + ex / gs, 1) * gs);
    return m + 1.25;
  }
}

const materialCache = new Map();

export function tmpMaterial(ref) {
  if (!ref) return null;
  if (ref instanceof TMPMaterial) return ref;
  const id = ref.$mat || ref;
  let m = materialCache.get(id);
  if (!m) {
    const json = Assets.materials[id];
    if (!json) return null;
    m = new TMPMaterial(json, id);
    materialCache.set(id, m);
  }
  return m;
}

// ---------------------------------------------------------------- rich text

const FontStyles = { Normal: 0, Bold: 1, Italic: 2, Underline: 4, LowerCase: 8, UpperCase: 16, SmallCaps: 32, Strikethrough: 64, Superscript: 128, Subscript: 256 };
export { FontStyles };
export const HorizontalAlignment = { Left: 1, Center: 2, Right: 4, Justified: 8, Flush: 16, Geometry: 32 };
export const VerticalAlignment = { Top: 256, Middle: 512, Bottom: 1024, Baseline: 2048, Geometry: 4096, Capline: 8192 };
export const TextOverflowModes = { Overflow: 0, Ellipsis: 1, Masking: 2, Truncate: 3, ScrollRect: 4, Page: 5, Linked: 6 };

function attrValue(s) {
  s = s.trim();
  if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")) return s.slice(1, -1);
  return s;
}

/** attributes of a tag body like `sprite name="Ad" tint=1` or `sprite=2` */
function parseAttrs(body) {
  const out = {};
  const re = /([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)|([a-zA-Z-]+)/g;
  let m;
  let first = true;
  while ((m = re.exec(body))) {
    if (m[1]) out[first ? '$' : m[1].toLowerCase()] = attrValue(m[2]);
    if (m[1] && first) out.$name = m[1].toLowerCase();
    if (m[3] && first) out.$name = m[3].toLowerCase();
    else if (m[3]) out[m[3].toLowerCase()] = '';
    first = false;
  }
  return out;
}

/**
 * text -> elements [{code, color, size: {mode, v}, bold, upper, lower, gradient, alpha, sprite, cspace, voffset, nobr}]
 * Unknown tags are kept as literal text (TMP behaviour).
 */
export function parseRichText(text, rich, baseStyle) {
  const out = [];
  const colorStack = [];
  const sizeStack = [];
  const gradStack = [];
  let bold = (baseStyle & FontStyles.Bold) !== 0 ? 1 : 0;
  let italic = (baseStyle & FontStyles.Italic) !== 0 ? 1 : 0;
  let upper = (baseStyle & FontStyles.UpperCase) !== 0 ? 1 : 0;
  let lower = (baseStyle & FontStyles.LowerCase) !== 0 ? 1 : 0;
  let alpha = null;
  let cspace = 0;
  let voffset = 0;
  let nobr = 0;
  let noparse = false;
  const push = (code, extra) => {
    out.push({
      code,
      color: colorStack.length ? colorStack[colorStack.length - 1] : null,
      size: sizeStack.length ? sizeStack[sizeStack.length - 1] : null,
      bold,
      italic,
      upper,
      lower,
      gradient: gradStack.length ? gradStack[gradStack.length - 1] : null,
      alpha,
      cspace,
      voffset,
      nobr,
      ...extra,
    });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (rich && ch === 60 /* < */) {
      const end = text.indexOf('>', i + 1);
      if (end > i) {
        const body = text.slice(i + 1, end);
        const lowerBody = body.toLowerCase();
        if (noparse) {
          if (lowerBody === '/noparse') {
            noparse = false;
            i = end;
            continue;
          }
        } else if (handleTag(body, lowerBody)) {
          i = end;
          continue;
        }
      }
    }
    let code = ch;
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      code = text.codePointAt(i);
      i++;
    }
    push(code);
  }
  return out;

  function handleTag(body, lb) {
    if (lb === 'noparse') {
      noparse = true;
      return true;
    }
    const closing = lb[0] === '/';
    const name = (closing ? lb.slice(1) : lb).split(/[\s=]/)[0];
    switch (name) {
      case 'b':
        bold = closing ? 0 : 1;
        return true;
      case 'i':
        italic = closing ? 0 : 1;
        return true;
      case 'u':
      case 's':
      case 'mark':
      case 'font':
      case 'material':
      case 'style':
      case 'link':
      case 'line-height':
      case 'margin':
      case 'indent':
      case 'align':
      case 'width':
      case 'rotate':
      case 'mspace':
      case 'pos':
        return true;
      case 'nobr':
        nobr = closing ? 0 : 1;
        return true;
      case 'uppercase':
      case 'allcaps':
        upper = closing ? 0 : 1;
        return true;
      case 'lowercase':
        lower = closing ? 0 : 1;
        return true;
      case 'br':
        push(10);
        return true;
      case 'color': {
        if (closing) {
          colorStack.pop();
          return true;
        }
        const v = attrValue(body.slice(body.indexOf('=') + 1));
        const c = ColorUtility.TryParseHtmlString(v);
        if (!c) return false;
        colorStack.push(c);
        return true;
      }
      case 'alpha': {
        if (closing) {
          alpha = null;
          return true;
        }
        const v = attrValue(body.slice(body.indexOf('=') + 1)).replace('#', '');
        alpha = parseInt(v, 16) / 255;
        return true;
      }
      case 'size': {
        if (closing) {
          sizeStack.pop();
          return true;
        }
        const v = attrValue(body.slice(body.indexOf('=') + 1)).trim();
        let s;
        if (v.endsWith('%')) s = { mode: 'pct', v: parseFloat(v) / 100 };
        else if (v.endsWith('em')) s = { mode: 'pct', v: parseFloat(v) };
        else if (v[0] === '+' || v[0] === '-') s = { mode: 'rel', v: parseFloat(v) };
        else s = { mode: 'abs', v: parseFloat(v.replace('px', '')) };
        if (Number.isNaN(s.v)) return false;
        sizeStack.push(s);
        return true;
      }
      case 'cspace':
        cspace = closing ? 0 : parseFloat(attrValue(body.slice(body.indexOf('=') + 1))) || 0;
        return true;
      case 'voffset':
        voffset = closing ? 0 : parseFloat(attrValue(body.slice(body.indexOf('=') + 1))) || 0;
        return true;
      case 'space': {
        const v = parseFloat(attrValue(body.slice(body.indexOf('=') + 1))) || 0;
        push(-2, { space: v });
        return true;
      }
      case 'gradient': {
        if (closing) {
          gradStack.pop();
          return true;
        }
        const g = TMP_Settings.gradient(attrValue(body.slice(body.indexOf('=') + 1)));
        if (!g) return false;
        gradStack.push(g);
        return true;
      }
      case 'sprite': {
        if (closing) return true;
        const a = parseAttrs(body);
        let asset = null;
        let entry = null;
        if (a.$ !== undefined && a.$name === 'sprite' && !a.name && !a.index && /^\d+$/.test(a.$)) {
          asset = TMP_Settings.spriteAsset();
          entry = asset?.byIndex(parseInt(a.$, 10));
        } else {
          asset = TMP_Settings.spriteAsset(a.$ && !/^\d+$/.test(a.$) ? a.$ : null);
          if (a.index !== undefined) entry = asset?.byIndex(parseInt(a.index, 10));
          else if (a.name !== undefined) entry = asset?.byName(a.name);
          else if (a.$ !== undefined && /^\d+$/.test(a.$)) entry = asset?.byIndex(parseInt(a.$, 10));
        }
        if (!asset || !entry?.glyph) return false;
        push(-1, { sprite: { asset, entry, tint: a.tint === '1', color: a.color ? ColorUtility.TryParseHtmlString(a.color) : null } });
        return true;
      }
      default:
        return false;
    }
  }
}

const isWhite = (c) => c === 32 || c === 9 || c === 0x200b || c === 0xa0 || c === 0x2007 || c === 0x202f;

// ---------------------------------------------------------------- TMP_Text

export class TMP_Text extends Graphic {
  static typeName = 'TMP_Text';

  constructor() {
    super();
    this.m_text = '';
    this.m_fontAsset = null;
    this.m_sharedMaterial = null;
    this._fontColor = new Color();
    this.m_enableVertexGradient = 0;
    this.m_fontColorGradient = null;
    this.m_fontSize = 36;
    this.m_fontSizeBase = 36;
    this.m_enableAutoSizing = 0;
    this.m_fontSizeMin = 18;
    this.m_fontSizeMax = 72;
    this.m_fontStyle = 0;
    this.m_HorizontalAlignment = 1;
    this.m_VerticalAlignment = 256;
    this.m_characterSpacing = 0;
    this.m_wordSpacing = 0;
    this.m_lineSpacing = 0;
    this.m_paragraphSpacing = 0;
    this.m_charWidthMaxAdj = 0;
    this.m_enableWordWrapping = 1;
    this.m_overflowMode = 0;
    this.m_enableKerning = 1;
    this.m_enableExtraPadding = 0;
    this.m_isRichText = 1;
    this.m_parseCtrlCharacters = 1;
    this.m_margin = [0, 0, 0, 0];
    this.m_tintAllSprites = 0;
    this.m_maxVisibleCharacters = 99999;
    this.m_firstVisibleCharacter = 0;
    this._fontMaterialInstance = null;
    this._layout = null;
    this._layoutKey = '';
    this._spriteMesh = new UIMesh();
    this.textInfo = { characterCount: 0, lineCount: 0, characterInfo: [] };
  }

  OnDeserialize() {
    super.OnDeserialize();
    const d = this._data || {};
    this._fontColor = d.m_fontColor ? Color.from(d.m_fontColor) : Color.from(d.m_fontColor32);
    this.m_text = d.m_text === null || d.m_text === undefined ? '' : String(d.m_text);
    if (Array.isArray(d.m_margin)) this.m_margin = d.m_margin;
    this._grad = d.m_fontColorGradient ? { tl: Color.from(d.m_fontColorGradient.topLeft), tr: Color.from(d.m_fontColorGradient.topRight), bl: Color.from(d.m_fontColorGradient.bottomLeft), br: Color.from(d.m_fontColorGradient.bottomRight) } : null;
    if (d.m_fontColorGradientPreset?.$so) this._gradPreset = gradientColors(getRuntimeSO(d.m_fontColorGradientPreset.$so));
    this._parsed = null;
  }

  // ---- font / material
  get fontData() {
    return fontData(this.m_fontAsset) || TMP_Settings.defaultFont;
  }

  get font() {
    return this.m_fontAsset;
  }

  set font(f) {
    this.m_fontAsset = f;
    this._invalidate();
  }

  get fontSharedMaterial() {
    return tmpMaterial(this.m_sharedMaterial) || tmpMaterial(this.fontData?.materialId);
  }

  set fontSharedMaterial(m) {
    this.m_sharedMaterial = m;
    this._fontMaterialInstance = null;
    this._invalidate();
  }

  /** instanced material (like TMP's fontMaterial getter) */
  get fontMaterial() {
    if (!this._fontMaterialInstance) this._fontMaterialInstance = this.fontSharedMaterial.clone();
    return this._fontMaterialInstance;
  }

  set fontMaterial(m) {
    this._fontMaterialInstance = m instanceof TMPMaterial ? m : tmpMaterial(m)?.clone();
    this._invalidate();
  }

  get renderMaterial() {
    return this._fontMaterialInstance || this.fontSharedMaterial;
  }

  get faceColor() {
    return this.renderMaterial.faceColor.clone();
  }

  set faceColor(c) {
    this.fontMaterial.faceColor = Color.from(c);
    this.fontMaterial.version++;
  }

  get outlineColor() {
    return this.renderMaterial.outlineColor.clone();
  }

  set outlineColor(c) {
    this.fontMaterial.outlineColor = Color.from(c);
    this.fontMaterial.version++;
  }

  get outlineWidth() {
    return this.renderMaterial.outlineWidth;
  }

  set outlineWidth(v) {
    const m = this.fontMaterial;
    m.outlineWidth = v;
    m.updateRatios();
    this._invalidate();
  }

  // ---- text / style properties
  get text() {
    return this.m_text;
  }

  set text(v) {
    v = v === null || v === undefined ? '' : String(v);
    if (v === this.m_text) return;
    this.m_text = v;
    this._parsed = null;
    this._invalidate();
  }

  SetText(fmt, ...args) {
    if (args.length === 0) {
      this.text = fmt;
      return;
    }
    // TMP SetText(string, float...): {0}, {0:2} (decimals)
    this.text = String(fmt).replace(/\{(\d+)(?::(\d+))?\}/g, (m, i, dec) => {
      const a = args[+i];
      if (a === undefined) return m;
      return dec !== undefined && typeof a === 'number' ? a.toFixed(+dec) : String(a);
    });
  }

  get color() {
    return this._fontColor.clone();
  }

  set color(c) {
    const n = Color.from(c);
    if (n.equals(this._fontColor)) return;
    this._fontColor = n;
    this.SetVerticesDirty();
  }

  get alpha() {
    return this._fontColor.a;
  }

  set alpha(a) {
    if (a === this._fontColor.a) return;
    this._fontColor.a = a;
    this.SetVerticesDirty();
  }

  get fontSize() {
    return this.m_fontSize;
  }

  set fontSize(v) {
    if (v === this.m_fontSize && v === this.m_fontSizeBase) return;
    this.m_fontSize = v;
    this.m_fontSizeBase = v;
    this._invalidate();
  }

  get fontSizeMin() {
    return this.m_fontSizeMin;
  }

  set fontSizeMin(v) {
    this.m_fontSizeMin = v;
    this._invalidate();
  }

  get fontSizeMax() {
    return this.m_fontSizeMax;
  }

  set fontSizeMax(v) {
    this.m_fontSizeMax = v;
    this._invalidate();
  }

  get enableAutoSizing() {
    return !!this.m_enableAutoSizing;
  }

  set enableAutoSizing(v) {
    this.m_enableAutoSizing = v ? 1 : 0;
    this._invalidate();
  }

  get fontStyle() {
    return this.m_fontStyle;
  }

  set fontStyle(v) {
    this.m_fontStyle = v;
    this._parsed = null;
    this._invalidate();
  }

  get enableWordWrapping() {
    return !!this.m_enableWordWrapping;
  }

  set enableWordWrapping(v) {
    this.m_enableWordWrapping = v ? 1 : 0;
    this._invalidate();
  }

  get characterSpacing() {
    return this.m_characterSpacing;
  }

  set characterSpacing(v) {
    this.m_characterSpacing = v;
    this._invalidate();
  }

  get maxVisibleCharacters() {
    return this.m_maxVisibleCharacters;
  }

  set maxVisibleCharacters(v) {
    this.m_maxVisibleCharacters = v;
    this.SetVerticesDirty();
  }

  get horizontalAlignment() {
    return this.m_HorizontalAlignment;
  }

  set horizontalAlignment(v) {
    this.m_HorizontalAlignment = v;
    this._invalidate();
  }

  get verticalAlignment() {
    return this.m_VerticalAlignment;
  }

  set verticalAlignment(v) {
    this.m_VerticalAlignment = v;
    this._invalidate();
  }

  get alignment() {
    return this.m_HorizontalAlignment | this.m_VerticalAlignment;
  }

  set alignment(v) {
    this.m_HorizontalAlignment = v & 0xff;
    this.m_VerticalAlignment = v & 0xff00;
    this._invalidate();
  }

  get margin() {
    return this.m_margin.slice();
  }

  set margin(v) {
    this.m_margin = Array.isArray(v) ? v.slice() : [v.x, v.y, v.z, v.w];
    this._invalidate();
  }

  get enableVertexGradient() {
    return !!this.m_enableVertexGradient;
  }

  set enableVertexGradient(v) {
    this.m_enableVertexGradient = v ? 1 : 0;
    this.SetVerticesDirty();
  }

  get colorGradient() {
    return this._grad;
  }

  set colorGradient(g) {
    this._grad = g;
    this.SetVerticesDirty();
  }

  get mainTexture() {
    return this.fontData?.texture;
  }

  get orthoScale() {
    return this.m_isOrthographic === 0 ? 0.1 : 1;
  }

  _invalidate() {
    this._layoutKey = '';
    this._vdirty = true;
    bumpLayout();
  }

  ForceMeshUpdate() {
    this._layoutKey = '';
    this._vdirty = true;
    this.getMesh();
  }

  // ---- layout
  get parsed() {
    if (!this._parsed) {
      let t = this.m_text === null || this.m_text === undefined ? '' : String(this.m_text);
      if (this.m_parseCtrlCharacters) t = t.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      this._parsed = parseRichText(t, !!this.m_isRichText, this.m_fontStyle);
    }
    return this._parsed;
  }

  /** TMP text layout at a given font size and wrapping width; returns null on overflow when asked to detect it */
  layoutAt(fontSize, width, height, detectOverflow) {
    // TextMeshPro (3D, non orthographic) scales the font by 0.1 world units per point
    const ortho = this.orthoScale;
    fontSize *= ortho;
    const font = this.fontData;
    if (!font) return { glyphs: [], lines: [], maxAsc: 0, maxDesc: 0, overflow: false };
    const items = this.parsed;
    const face = font.face;
    const mat = this.renderMaterial;
    const extraPad = !!this.m_enableExtraPadding;
    const wrap = !!this.m_enableWordWrapping;
    const glyphs = [];
    const lines = [];
    const lineGap = face.lineHeight - (face.ascent - face.descent);
    const baseScale = (fontSize / face.pointSize) * face.scale;
    let xAdvance = 0;
    let lineOffset = 0;
    let line = newLine(0);
    let maxTextAsc = -Infinity;
    let maxDesc = Infinity;
    let wordBreak = null; // saved state after the last whitespace of the current line
    let overflowW = false;
    let prevGlyphIndex = -1;
    let prevFont = null;

    function newLine(start) {
      return { start, end: start, maxAsc: -Infinity, maxDesc: Infinity, startAsc: null, maxAdvance: 0, lastVisible: -1, minX: Infinity, maxX: -Infinity };
    }
    const sizeOf = (it) => {
      const s = it.size;
      if (!s) return fontSize;
      if (s.mode === 'pct') return fontSize * s.v;
      if (s.mode === 'rel') return fontSize + s.v * ortho;
      return s.v * ortho;
    };
    const finishLine = () => {
      if (line.maxAsc === -Infinity) {
        line.maxAsc = face.ascent * baseScale;
        line.maxDesc = face.descent * baseScale;
      }
      // a taller element than the line's first one pushes the line down
      if (lines.length > 0 && line.startAsc !== null && line.maxAsc > line.startAsc) {
        const d = line.maxAsc - line.startAsc;
        for (let k = line.start; k < glyphs.length; k++) glyphs[k].y -= d;
        lineOffset += d;
      }
      line.end = glyphs.length;
      const lv = line.lastVisible >= 0 ? glyphs[line.lastVisible] : null;
      line.maxAdvance = lv ? lv.xAdvanceAfter - lv.spacingAfter : 0;
      line.lineOffset = lineOffset;
      if (lines.length === 0) maxTextAsc = line.maxAsc;
      maxDesc = Math.min(maxDesc, line.maxDesc - lineOffset);
      lines.push(line);
    };
    const breakLine = (curScale, emScale) => {
      finishLine();
      lineOffset += -line.maxDesc + face.ascent * curScale + lineGap * baseScale + this.m_lineSpacing * emScale;
      line = newLine(glyphs.length);
      xAdvance = 0;
      wordBreak = null;
      prevGlyphIndex = -1;
    };

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const curSize = sizeOf(it);
      const emScale = curSize * 0.01;
      const curScale = (curSize / face.pointSize) * face.scale;
      if (it.code === 10 || it.code === 13) {
        if (it.code === 13 && items[i + 1]?.code === 10) continue;
        if (line.maxAsc === -Infinity) {
          line.maxAsc = face.ascent * curScale;
          line.maxDesc = face.descent * curScale;
        }
        breakLine(curScale, emScale);
        lineOffset += it.code === 10 ? this.m_paragraphSpacing * emScale : 0;
        continue;
      }
      if (it.code === -2) {
        xAdvance += it.space * emScale;
        continue;
      }
      let g;
      let elemScale;
      let asc;
      let desc;
      let pad = 0;
      let stylePad = 0;
      let isSprite = false;
      let gfont = font;
      let baselineOffset = 0;
      if (it.sprite) {
        isSprite = true;
        g = it.sprite.entry.glyph;
        const sc = it.sprite.entry.char.scale * g.scale;
        const sa = it.sprite.asset;
        if (sa.face.pointSize > 0) {
          const ss = (curSize / sa.face.pointSize) * sa.face.scale;
          elemScale = sc * ss;
          asc = sa.face.ascent * ss;
          desc = sa.face.descent * ss;
          baselineOffset = sa.face.baseline * ss * sa.face.scale;
        } else {
          const ss = (curSize / face.pointSize) * face.scale;
          elemScale = (face.ascent / g.h) * sc * ss;
          const k = ss / elemScale;
          asc = face.ascent * k * elemScale;
          desc = face.descent * k * elemScale;
          baselineOffset = face.baseline * ss * face.scale;
        }
      } else {
        let code = it.code;
        if (it.upper) code = String.fromCodePoint(code).toUpperCase().codePointAt(0);
        else if (it.lower) code = String.fromCodePoint(code).toLowerCase().codePointAt(0);
        let r = font.lookup(code);
        if (!r) for (const fb of TMP_Settings.fallbacks) if ((r = fb.lookup(code))) break;
        if (!r && code !== 32) r = font.lookup(9633) || TMP_Settings.defaultFont?.lookup(9633) || font.lookup(32);
        if (!r) continue;
        g = r.glyph;
        gfont = r.font;
        const gface = gfont.face;
        elemScale = (curSize / gface.pointSize) * gface.scale * r.scale;
        asc = gface.ascent * elemScale;
        desc = gface.descent * elemScale;
        const m = gfont === font ? mat : tmpMaterial(gfont.materialId) || mat;
        pad = m.getPadding(extraPad, it.bold);
        const gs = m.gradientScale;
        stylePad = ((it.bold ? gfont.boldStyle : gfont.normalStyle) / 4) * gs * m.scaleRatioA;
        if (stylePad + pad > gs) pad = gs - stylePad;
        it._code = code;
      }
      const code = isSprite ? -1 : it._code;
      const white = !isSprite && isWhite(code);
      // kerning against the previous glyph
      let kx = 0;
      let kAdv = 0;
      if (!isSprite && this.m_enableKerning && prevFont === gfont && prevGlyphIndex >= 0) {
        const curIdx = gfont.chars.get(code)?.glyph;
        const k = gfont.kerning.get(prevGlyphIndex * 65536 + curIdx);
        if (k) {
          kx = k.bx;
          if (glyphs.length && glyphs[glyphs.length - 1].kernable) {
            const pg = glyphs[glyphs.length - 1];
            pg.xAdvanceAfter += k.aadv * pg.scale;
            xAdvance += k.aadv * pg.scale;
          }
        }
      }
      const boldSpacing = !isSprite && it.bold ? gfont.boldSpacing : 0;
      const spacing = ((isSprite ? 0 : gfont.normalSpacingOffset) + this.m_characterSpacing + boldSpacing) * emScale + it.cspace * emScale;
      let adv = (g.adv + kAdv) * elemScale + spacing;
      if (white) adv += this.m_wordSpacing * emScale;
      if (code === 9) adv = Math.max(adv, gfont.face.tabWidth * gfont.tabSize * elemScale);
      // width check (TMP: |xAdvance| + glyph advance > text area width)
      if (!white && width > 0) {
        const textWidth = Math.abs(xAdvance) + g.adv * elemScale;
        if (textWidth > width * 1.0 + 0.001) {
          if (wrap && !it.nobr && wordBreak && wordBreak.glyphCount > line.start) {
            // restore to the last word break and start a new line there
            glyphs.length = wordBreak.glyphCount;
            line.lastVisible = wordBreak.lastVisible;
            line.maxAsc = wordBreak.maxAsc;
            line.maxDesc = wordBreak.maxDesc;
            i = wordBreak.i;
            breakLine(curScale, emScale);
            continue;
          }
          if (detectOverflow && (this.m_enableAutoSizing || !wrap)) overflowW = true;
          if (wrap && glyphs.length > line.start && !detectOverflow) {
            // no word break on this line: wrap at the character
            breakLine(curScale, emScale);
            i--;
            continue;
          }
          if (detectOverflow && this.m_enableAutoSizing) return { overflow: true };
        }
      }
      if (line.startAsc === null) line.startAsc = asc;
      line.maxAsc = Math.max(line.maxAsc, asc);
      line.maxDesc = Math.min(line.maxDesc, desc);
      const gi = {
        it,
        sprite: isSprite ? it.sprite : null,
        g,
        font: gfont,
        scale: elemScale,
        pad,
        stylePad,
        x: xAdvance,
        y: -lineOffset + baselineOffset + it.voffset * emScale,
        kx,
        bold: it.bold,
        pointSize: curSize,
        index: i,
        visible: !white && code !== 9,
        xAdvanceAfter: xAdvance + adv,
        spacingAfter: spacing,
        kernable: !isSprite,
        line: lines.length,
      };
      glyphs.push(gi);
      if (gi.visible) line.lastVisible = glyphs.length - 1;
      xAdvance += adv;
      prevGlyphIndex = isSprite ? -1 : gfont.chars.get(code)?.glyph ?? -1;
      prevFont = isSprite ? null : gfont;
      if (white) wordBreak = { i, glyphCount: glyphs.length, lastVisible: line.lastVisible, maxAsc: line.maxAsc, maxDesc: line.maxDesc };
    }
    finishLine();
    const textHeight = maxTextAsc - maxDesc;
    const overflowH = height > 0 && textHeight > height + 0.001;
    if (detectOverflow && this.m_enableAutoSizing && (overflowH || overflowW)) return { overflow: true };
    return { glyphs, lines, maxAsc: maxTextAsc, maxDesc, overflow: overflowW || overflowH, fontSize };
  }

  /** layout for the current rect (auto size search like TMP), cached */
  getLayout() {
    const rt = this.rectTransform;
    const w = rt.isRectTransform ? rt.width : 0;
    const h = rt.isRectTransform ? rt.height : 0;
    const key = `${w}|${h}|${this.m_fontSize}|${this.m_enableAutoSizing}|${this.renderMaterial?.version}`;
    if (this._layout && key === this._layoutKey) return this._layout;
    const mg = this.m_margin;
    const aw = w - mg[0] - mg[2];
    const ah = h - mg[1] - mg[3];
    let L;
    if (this.m_enableAutoSizing) {
      const min = this.m_fontSizeMin;
      const max = this.m_fontSizeMax;
      const fits = (s) => !this.layoutAt(s, aw, ah, true).overflow;
      let size;
      if (fits(max)) size = max;
      else {
        let lo = min;
        let hi = max;
        for (let k = 0; k < 20 && hi - lo > 0.05; k++) {
          const mid = Math.round(((lo + hi) / 2) * 20) / 20;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        size = Math.max(min, Math.floor(lo * 20 + 1e-6) / 20);
      }
      L = this.layoutAt(size, aw, ah, false);
      this._autoSize = size;
    } else {
      L = this.layoutAt(this.m_fontSize, aw, ah, false);
    }
    this._layout = L;
    this._layoutKey = key;
    this._vdirty = true;
    return L;
  }

  get currentFontSize() {
    return this.m_enableAutoSizing ? this._autoSize ?? this.m_fontSizeMax : this.m_fontSize;
  }

  // ---- ILayoutElement
  get minWidth() {
    return 0;
  }

  get minHeight() {
    return 0;
  }

  get flexibleWidth() {
    return -1;
  }

  get flexibleHeight() {
    return -1;
  }

  get preferredWidth() {
    const size = this.m_enableAutoSizing ? this.m_fontSizeMax : this.m_fontSize;
    const L = this.layoutAt(size, 0, 0, false);
    if (!L.glyphs.length) return 0;
    let w = 0;
    for (const l of L.lines) w = Math.max(w, l.maxAdvance);
    return w + this.m_margin[0] + this.m_margin[2];
  }

  get preferredHeight() {
    const rt = this.rectTransform;
    const size = this.m_enableAutoSizing ? this.m_fontSizeMax : this.m_fontSize;
    const w = this.m_enableWordWrapping && rt.isRectTransform ? rt.width - this.m_margin[0] - this.m_margin[2] : 0;
    const L = this.layoutAt(size, w, 0, false);
    if (!L.glyphs.length) return 0;
    return L.maxAsc - L.maxDesc + this.m_margin[1] + this.m_margin[3];
  }

  GetPreferredValues(text, w = 0, h = 0) {
    const save = this.m_text;
    const saveParsed = this._parsed;
    if (text !== undefined && text !== null && typeof text === 'string') {
      this.m_text = text;
      this._parsed = null;
    }
    const size = this.m_enableAutoSizing ? this.m_fontSizeMax : this.m_fontSize;
    const L = this.layoutAt(size, w, h, false);
    let pw = 0;
    for (const l of L.lines) pw = Math.max(pw, l.maxAdvance);
    const out = new THREE.Vector2(L.glyphs.length ? pw + this.m_margin[0] + this.m_margin[2] : 0, L.glyphs.length ? L.maxAsc - L.maxDesc + this.m_margin[1] + this.m_margin[3] : 0);
    this.m_text = save;
    this._parsed = saveParsed;
    return out;
  }

  get renderedWidth() {
    const L = this.getLayout();
    let w = 0;
    for (const l of L.lines) w = Math.max(w, l.maxAdvance);
    return w;
  }

  get renderedHeight() {
    const L = this.getLayout();
    return L.lines.length ? L.maxAsc - L.maxDesc : 0;
  }

  get isTextOverflowing() {
    return !!this.getLayout().overflow;
  }

  // ---- mesh
  /** local-space anchor offset of the first baseline (TMP alignment rules) */
  anchorOffset(L) {
    const rt = this.rectTransform;
    const r = rt.isRectTransform ? rt.rect : { x: 0, y: 0, width: 0, height: 0, xMax: 0, yMax: 0 };
    const [ml, mt, , mb] = this.m_margin;
    const top = r.y + r.height;
    const bottom = r.y;
    const mid = (top + bottom) / 2;
    let y;
    switch (this.m_VerticalAlignment) {
      case VerticalAlignment.Middle:
        y = mid - (L.maxAsc + mt + L.maxDesc - mb) / 2;
        break;
      case VerticalAlignment.Bottom:
        y = bottom - L.maxDesc + mb;
        break;
      case VerticalAlignment.Baseline:
        y = mid;
        break;
      case VerticalAlignment.Geometry: {
        let gmin = Infinity;
        let gmax = -Infinity;
        for (const g of L.glyphs) {
          if (!g.visible) continue;
          const t = g.y + (g.g.by + g.pad) * g.scale;
          const b = t - (g.g.h + g.pad * 2) * g.scale;
          gmin = Math.min(gmin, b);
          gmax = Math.max(gmax, t);
        }
        y = gmin === Infinity ? mid : mid - (gmax + mt + gmin - mb) / 2;
        break;
      }
      case VerticalAlignment.Capline: {
        const font = this.fontData;
        const cap = font ? (font.face.capLine * this.currentFontSize) / font.face.pointSize : 0;
        y = mid - (cap - mt - mb) / 2;
        break;
      }
      default:
        y = top - L.maxAsc - mt;
    }
    return { x: r.x + ml, y };
  }

  OnPopulateMesh(m) {
    const sm = this._spriteMesh;
    sm.clear();
    const L = this.getLayout();
    if (!m.extra) m.extra = [];
    if (!L.glyphs.length) return;
    const font = this.fontData;
    const rt = this.rectTransform;
    const width = rt.isRectTransform ? rt.width - this.m_margin[0] - this.m_margin[2] : 0;
    const anchor = this.anchorOffset(L);
    const base = this._fontColor;
    const grad = this.m_enableVertexGradient ? this._gradPreset || this._grad : null;
    const aw = font.atlasW;
    const ah = font.atlasH;
    const halign = this.m_HorizontalAlignment;
    const maxVisible = this.m_maxVisibleCharacters;
    let shown = 0;
    for (let li = 0; li < L.lines.length; li++) {
      const line = L.lines[li];
      let jx = 0;
      if (halign === HorizontalAlignment.Center) jx = width / 2 - line.maxAdvance / 2;
      else if (halign === HorizontalAlignment.Right) jx = width - line.maxAdvance;
      else if (halign === HorizontalAlignment.Geometry) {
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let k = line.start; k < line.end; k++) {
          const g = L.glyphs[k];
          if (!g.visible) continue;
          x0 = Math.min(x0, g.x + g.g.bx * g.scale);
          x1 = Math.max(x1, g.x + (g.g.bx + g.g.w) * g.scale);
        }
        if (x0 !== Infinity) jx = width / 2 - (x0 + x1) / 2;
      }
      for (let k = line.start; k < line.end; k++) {
        const g = L.glyphs[k];
        if (!g.visible) continue;
        if (shown++ >= maxVisible) continue;
        const it = g.it;
        let c = it.color ? it.color.mul(new Color(1, 1, 1, base.a)) : base.clone();
        if (it.alpha !== null && it.alpha !== undefined) c.a = it.alpha * base.a;
        const ox = anchor.x + jx;
        const oy = anchor.y;
        if (g.sprite) {
          const sg = g.g;
          const x0 = ox + g.x + sg.bx * g.scale;
          const y1 = oy + g.y + sg.by * g.scale;
          const x1 = x0 + sg.w * g.scale;
          const y0 = y1 - sg.h * g.scale;
          const [tw, th] = g.sprite.asset.texSize;
          const sc = g.sprite.tint || this.m_tintAllSprites ? c : new Color(1, 1, 1, c.a);
          sm.addQuad(x0, y0, x1, y1, sc, sg.rx / tw, sg.ry / th, (sg.rx + sg.rw) / tw, (sg.ry + sg.rh) / th);
          sm.texture = g.sprite.asset.texture;
          continue;
        }
        const gg = g.g;
        const s = g.scale;
        const pad = g.pad;
        const sp = g.stylePad;
        const x0 = ox + g.x + (gg.bx - pad - sp + g.kx) * s;
        const y1 = oy + g.y + (gg.by + pad) * s;
        const y0 = y1 - (gg.h + pad * 2) * s;
        const x1 = x0 + (gg.w + pad * 2 + sp * 2) * s;
        const fa = g.font === font ? aw : g.font.atlasW;
        const fh = g.font === font ? ah : g.font.atlasH;
        const u0 = (gg.rx - pad - sp) / fa;
        const v0 = (gg.ry - pad) / fh;
        const u1 = (gg.rx + gg.rw + pad + sp) / fa;
        const v1 = (gg.ry + gg.rh + pad) / fh;
        const gr = it.gradient || grad;
        const i0 = m.vertCount;
        g.vertexIndex = i0;
        g.isVisible = true;
        if (gr) {
          m.addVert(x0, y0, gr.bl.mul(c), u0, v0);
          m.addVert(x0, y1, gr.tl.mul(c), u0, v1);
          m.addVert(x1, y1, gr.tr.mul(c), u1, v1);
          m.addVert(x1, y0, gr.br.mul(c), u1, v0);
        } else {
          m.addVert(x0, y0, c, u0, v0);
          m.addVert(x0, y1, c, u0, v1);
          m.addVert(x1, y1, c, u1, v1);
          m.addVert(x1, y0, c, u1, v0);
        }
        m.idx.push(i0, i0 + 1, i0 + 2, i0 + 2, i0 + 3, i0);
        const xs = g.bold ? -s : s;
        m.extra.push(xs, xs, xs, xs);
      }
    }
    this.textInfo = { characterCount: L.glyphs.length, lineCount: L.lines.length, characterInfo: L.glyphs };
  }

  /** draw calls for the renderer: the SDF text + an optional sprite sub mesh */
  getDrawCalls() {
    let m = this.getMesh();
    // per-frame vertex effects (TextMeshProEffect) work on a copy of the cached mesh
    const mods = this.vertexModifiers;
    if (mods?.length && m.idx.length) {
      const out = (this._modMesh ||= new UIMesh());
      out.pos = m.pos.slice();
      out.uv = m.uv;
      out.col = m.col.slice();
      out.idx = m.idx;
      out.extra = m.extra;
      for (const fn of mods) fn(out, this.textInfo);
      m = out;
    }
    const calls = [];
    if (m.idx.length) calls.push({ mesh: m, texture: this.fontData.texture, sdf: this.renderMaterial });
    const sm = this._spriteMesh;
    if (sm.idx.length && sm.texture) calls.push({ mesh: sm, texture: sm.texture });
    return calls;
  }
}

export class TextMeshProUGUI extends TMP_Text {
  static typeName = 'TextMeshProUGUI';
}

for (const cls of [TMP_Text, TextMeshProUGUI]) registerComponent(cls);
