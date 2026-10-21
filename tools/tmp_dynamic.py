"""Bake the characters a dynamic TMP font asset would add at runtime.

Unity's TMP font assets in "Dynamic" population mode only ship the glyphs that were baked in the editor;
the rest (e.g. 'H' of "High Score" in Downlink) are rasterized from the source font file with FreeType when
first used. The web port has no FontEngine, so this script renders every character the game's texts use
(I2 English terms, serialized TMP texts, ASCII) as SDF glyphs, appends them to the atlas (the texture grows
upwards so existing glyph rects stay valid) and patches the exported font asset in so_bundle.json.

Run after export.py and export_meta.py (needs freetype-py + numpy + Pillow).
"""
import glob
import json
import os
import re
import sys

import freetype
import numpy as np
from PIL import Image

from unity_yaml import ASSETS, guid_index

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "assets"))
SS = 8  # supersampling of the coverage mask used for the distance transform
SPREAD = None  # filled by calibrate(): SDF value = 0.5 + signed distance / (2 * SPREAD)


def glyph_mask(face, code, size):
    """Supersampled binary mask + placement of a glyph: (mask, left, top) in 1x pixel units."""
    face.set_pixel_sizes(0, size * SS)
    face.load_char(chr(code), freetype.FT_LOAD_NO_HINTING | freetype.FT_LOAD_NO_BITMAP | freetype.FT_LOAD_RENDER)
    bm = face.glyph.bitmap
    if bm.width == 0 or bm.rows == 0:
        return None, 0, 0
    a = np.array(bm.buffer, dtype=np.uint8).reshape(bm.rows, bm.pitch)[:, : bm.width]
    return a >= 128, face.glyph.bitmap_left / SS, face.glyph.bitmap_top / SS


def metrics(face, code, size):
    face.set_pixel_sizes(0, size)
    face.load_char(chr(code), freetype.FT_LOAD_NO_HINTING | freetype.FT_LOAD_NO_BITMAP)
    g = face.glyph
    m = g.metrics
    return {"w": m.width / 64, "h": m.height / 64, "bx": m.horiBearingX / 64, "by": m.horiBearingY / 64,
            "adv": g.advance.x / 64, "left": g.bitmap_left if False else None}


def signed_distance(mask, left, top, x0, y1, w, h):
    """Signed distance (1x px, positive inside) at the centers of a w x h texel grid whose top-left corner
    is (x0, y1) in glyph space (y up)."""
    rows, cols = mask.shape
    # boundary samples of the supersampled mask: centers of inside pixels with an outside 4-neighbour
    pad = np.pad(mask, 1, constant_values=False)
    inside = pad[1:-1, 1:-1]
    edge = inside & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    ey, ex = np.nonzero(edge)
    ex = left + (ex + 0.5) / SS
    ey = top - (ey + 0.5) / SS
    xs = x0 + np.arange(w) + 0.5
    ys = y1 - np.arange(h) - 0.5
    gx, gy = np.meshgrid(xs, ys)
    px = gx.ravel()
    py = gy.ravel()
    best = np.full(px.shape, np.inf)
    for i in range(0, len(ex), 2048):
        dx = px[:, None] - ex[None, i:i + 2048]
        dy = py[:, None] - ey[None, i:i + 2048]
        best = np.minimum(best, np.sqrt(dx * dx + dy * dy).min(axis=1))
    # sign from the mask at the texel center
    mi = np.floor((top - py) * SS).astype(int)
    mj = np.floor((px - left) * SS).astype(int)
    ok = (mi >= 0) & (mi < rows) & (mj >= 0) & (mj < cols)
    ins = np.zeros(px.shape, bool)
    ins[ok] = mask[mi[ok], mj[ok]]
    d = np.where(ins, best, -best)
    return d.reshape(h, w)


def render_sdf(face, code, size, padding, spread):
    """Returns (rgba image of (w + 2p) x (h + 2p), metrics, rect w, rect h)."""
    m = metrics(face, code, size)
    mask, left, top = glyph_mask(face, code, size)
    face.set_pixel_sizes(0, size)
    face.load_char(chr(code), freetype.FT_LOAD_NO_HINTING | freetype.FT_LOAD_RENDER)
    bw, bh = face.glyph.bitmap.width, face.glyph.bitmap.rows
    bl, bt = face.glyph.bitmap_left, face.glyph.bitmap_top
    if mask is None or bw == 0:
        return None, m, 0, 0
    w = bw + 2 * padding
    h = bh + 2 * padding
    d = signed_distance(mask, left, top, bl - padding, bt + padding, w, h)
    v = np.clip(0.5 + d / (2 * spread), 0, 1)
    a = (v * 255 + 0.5).astype(np.uint8)
    img = np.zeros((h, w, 4), np.uint8)
    img[..., 0:3] = 255
    img[..., 3] = a
    return Image.fromarray(img, "RGBA"), m, bw, bh


def calibrate(face, size, padding, atlas, glyph):
    """Fit the SDF spread against a glyph that is already baked in the atlas."""
    r = glyph["m_GlyphRect"]
    H = atlas.size[1]
    x, y, w, h = r["m_X"], r["m_Y"], r["m_Width"], r["m_Height"]
    ref = np.asarray(atlas)[H - (y + h) - padding:H - y + padding, x - padding:x + w + padding, 3].astype(float) / 255
    best = None
    for spread in np.arange(4, 14.01, 0.25):
        img, _, bw, bh = render_sdf(face, glyph["code"], size, padding, spread)
        a = np.asarray(img)[..., 3].astype(float) / 255
        hh = min(a.shape[0], ref.shape[0])
        ww = min(a.shape[1], ref.shape[1])
        err = np.abs(a[:hh, :ww] - ref[:hh, :ww]).mean()
        if best is None or err < best[0]:
            best = (err, spread)
    return best


def collect_texts():
    """Every string the UI can show: I2 terms (English), serialized TMP texts, plus printable ASCII."""
    chars = set(range(32, 127))
    meta = os.path.join(OUT, "meta.json")
    if os.path.exists(meta):
        with open(meta, encoding="utf-8") as f:
            loc = json.load(f).get("loc", {})
        for v in loc.values():
            chars.update(ord(c) for c in re.sub(r"<[^>]*>", "", str(v)))
    i2 = os.path.join(ASSETS, "Resources", "I2Languages.asset")
    with open(i2, encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.strip().startswith("- ") or "Languages:" in line:
                chars.update(ord(c) for c in line if ord(c) < 0x3000)
    for p in glob.glob(os.path.join(ASSETS, "Scenes", "*.unity")) + glob.glob(os.path.join(ASSETS, "GameObject", "*.prefab")):
        with open(p, encoding="utf-8", errors="replace") as f:
            for line in f:
                if "m_text:" in line:
                    chars.update(ord(c) for c in line.split("m_text:", 1)[1].strip().strip('"'))
    chars.update([0x2026, 0x2022, 0xD7, 0xB0])
    return {c for c in chars if c >= 32 and c not in (0x7F,)}


def main():
    gi = guid_index()
    with open(os.path.join(OUT, "so_bundle.json"), encoding="utf-8") as f:
        bundle = json.load(f)
    with open(os.path.join(OUT, "textures.json"), encoding="utf-8") as f:
        texinfo = json.load(f)
    wanted = collect_texts()
    for rid, so in bundle.items():
        if so.get("$type") != "TMP_FontAsset" or int(so.get("m_AtlasPopulationMode", 0)) != 1:
            continue
        src_guid = None
        # the source font file is serialized as {"$asset": "Font/<name>"}
        src = so.get("m_SourceFontFile") or {}
        font_path = os.path.join(ASSETS, src["$asset"] + ".ttf") if src.get("$asset") else None
        if font_path and not os.path.exists(font_path):
            cands = glob.glob(os.path.join(ASSETS, src["$asset"] + ".*"))
            font_path = next((c for c in cands if not c.endswith(".meta")), None)
        if not font_path or not os.path.exists(font_path):
            print("no source font for", rid)
            continue
        face = freetype.Face(font_path)
        size = int(so["m_FaceInfo"]["m_PointSize"])
        padding = int(so["m_AtlasPadding"])
        tex_rid = so["m_AtlasTextures"][0]["$tex"]
        tex_file = os.path.join(OUT, "textures", texinfo[tex_rid]["file"])
        atlas = Image.open(tex_file).convert("RGBA")
        have = {c["m_Unicode"] for c in so["m_CharacterTable"]}
        glyph_by_index = {g["m_Index"]: g for g in so["m_GlyphTable"]}
        cmap = {c: face.get_char_index(c) for c in wanted}
        missing = sorted(c for c in wanted if c not in have and cmap[c])
        if not missing:
            continue
        # calibrate the distance spread on a baked glyph with a decent size
        sample = None
        for c in so["m_CharacterTable"]:
            g = glyph_by_index.get(c["m_GlyphIndex"])
            if g and g["m_GlyphRect"]["m_Width"] > 40 and chr(c["m_Unicode"]).isalpha():
                sample = dict(g, code=c["m_Unicode"])
                break
        err, spread = calibrate(face, size, padding, atlas, sample)
        print(f"{rid}: {len(missing)} glyphs to bake, spread {spread} (err {err:.4f})")
        # shelf-pack the new glyphs above the existing atlas
        W = atlas.size[0]
        items = []
        for c in missing:
            img, m, bw, bh = render_sdf(face, c, size, padding, spread)
            items.append((c, img, m, bw, bh))
        x = 0
        y = 0
        shelf = 0
        placed = []
        for c, img, m, bw, bh in sorted(items, key=lambda t: -(t[4] if t[1] else 0)):
            if img is None:
                placed.append((c, None, m, 0, 0, 0, 0))
                continue
            w, h = img.size
            if x + w > W:
                x = 0
                y += shelf
                shelf = 0
            placed.append((c, img, m, bw, bh, x, y))
            x += w
            shelf = max(shelf, h)
        extra_h = y + shelf
        new_h = atlas.size[1] + extra_h
        new_h = 1 << (new_h - 1).bit_length()
        grown = Image.new("RGBA", (W, new_h), (255, 255, 255, 0))
        grown.paste(atlas, (0, new_h - atlas.size[1]))
        next_index = max(glyph_by_index) + 1 if glyph_by_index else 1
        base_y = atlas.size[1]  # rects are bottom-origin: new rows start above the old atlas
        for c, img, m, bw, bh, px, py in placed:
            gidx = face.get_char_index(c) or next_index
            if gidx in glyph_by_index:
                gidx = next_index
            next_index = max(next_index, gidx + 1)
            if img is not None:
                top_row = new_h - base_y - extra_h + py  # image row of the padded box's top
                grown.paste(img, (px, top_row))
                rect = {"m_X": px + padding, "m_Y": new_h - (top_row + padding + bh), "m_Width": bw, "m_Height": bh}
            else:
                rect = {"m_X": 0, "m_Y": 0, "m_Width": 0, "m_Height": 0}
            so["m_GlyphTable"].append({"m_Index": gidx, "m_Metrics": {"m_Width": m["w"], "m_Height": m["h"], "m_HorizontalBearingX": m["bx"],
                                       "m_HorizontalBearingY": m["by"], "m_HorizontalAdvance": m["adv"]},
                                       "m_GlyphRect": rect, "m_Scale": 1, "m_AtlasIndex": 0})
            so["m_CharacterTable"].append({"m_ElementType": 1, "m_Unicode": c, "m_GlyphIndex": gidx, "m_Scale": 1})
            glyph_by_index[gidx] = True
        so["m_AtlasHeight"] = new_h
        grown.save(tex_file)
        texinfo[tex_rid]["size"] = [W, new_h]
        print(f"  atlas {W}x{atlas.size[1]} -> {W}x{new_h}")
    with open(os.path.join(OUT, "so_bundle.json"), "w", encoding="utf-8") as f:
        json.dump(bundle, f, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(OUT, "textures.json"), "w", encoding="utf-8") as f:
        json.dump(texinfo, f, separators=(",", ":"), ensure_ascii=False)


if __name__ == "__main__":
    sys.exit(main())
