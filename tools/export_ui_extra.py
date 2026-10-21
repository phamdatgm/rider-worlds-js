"""Pack the UI sprites that the main UI atlas misses (sprites only named by meta data, e.g. currency bundle
icons, rarity banners, booster icons) into public/assets/ui_extra (same format as ui/atlas.json).

Run after export.py and export_meta.py.
"""
import glob
import json
import os
import shutil

import yaml
from PIL import Image

from unity_yaml import ASSETS

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "assets"))
PAGE, PAD, LIMIT = 2048, 2, 1024


def rel_id(path):
    p = os.path.relpath(path, ASSETS).replace("\\", "/")
    return os.path.splitext(p)[0]


def wanted_names():
    with open(os.path.join(OUT, "meta.json"), encoding="utf-8") as f:
        m = json.load(f)
    need = set()
    for c in m["cards"]:
        for k in ("image", "imageDisabled", "icon"):
            if c.get(k):
                need.add(c[k])
        for r in c.get("rankImages") or []:
            need.add(r)
        for s in c.get("shopSizes") or []:
            need.add(s["icon"])
    for r in m.get("rarity", []):
        if r.get("banner"):
            need.add(r["banner"])
    for v in (m.get("typeIcons") or {}).values():
        if v:
            need.add(v)
    return need


def main():
    with open(os.path.join(OUT, "ui", "atlas.json"), encoding="utf-8") as f:
        have = {k.split("/")[-1].split("#")[0] for k in json.load(f)["sprites"]}
    files = {}
    for p in glob.glob(os.path.join(ASSETS, "Sprite", "**", "*.png"), recursive=True) + glob.glob(os.path.join(ASSETS, "Texture2D", "*.png")):
        files.setdefault(os.path.splitext(os.path.basename(p))[0], p)
    items = {}
    for name in sorted(wanted_names() - have):
        path = files.get(name)
        if not path:
            print("missing sprite file", name)
            continue
        with open(path + ".meta", encoding="utf-8", errors="replace") as f:
            ti = (yaml.safe_load(f) or {}).get("TextureImporter", {}) or {}
        img = Image.open(path).convert("RGBA")
        b = ti.get("spriteBorder") or {}
        pv = ti.get("spritePivot") or {}
        items[rel_id(path)] = (img, {"sz": list(img.size), "b": [b.get("x", 0), b.get("y", 0), b.get("z", 0), b.get("w", 0)],
                                     "pv": [pv.get("x", 0.5), pv.get("y", 0.5)], "ppu": float(ti.get("spritePixelsToUnits", 100) or 100)})
    scaled = {}
    for key, (img, _) in items.items():
        w, h = img.size
        k = min(1.0, LIMIT / max(w, h))
        scaled[key] = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS) if k < 1 else img
    order = sorted(scaled.items(), key=lambda kv: (-kv[1].size[1], -kv[1].size[0]))
    pages, placed = [], {}
    for key, img in order:
        w, h = img.size[0] + PAD * 2, img.size[1] + PAD * 2
        spot = None
        for pi, pg in enumerate(pages):
            for sh in pg["shelves"]:
                if h <= sh[1] and sh[2] + w <= PAGE:
                    spot = (pi, sh[2], sh[0])
                    sh[2] += w
                    break
            if spot:
                break
            top = pg["shelves"][-1][0] + pg["shelves"][-1][1] if pg["shelves"] else 0
            if top + h <= PAGE:
                pg["shelves"].append([top, h, w])
                spot = (pi, 0, top)
                break
        if not spot:
            pages.append({"shelves": [[0, h, w]], "items": []})
            spot = (len(pages) - 1, 0, 0)
        pi, x, y = spot
        pages[pi]["items"].append((key, x + PAD, y + PAD))
        placed[key] = (pi, x + PAD, y + PAD)
    d = os.path.join(OUT, "ui_extra")
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    meta = {"pages": [], "sprites": {}}
    for pi, pg in enumerate(pages):
        used_h = max(sh[0] + sh[1] for sh in pg["shelves"])
        used_w = max(sh[2] for sh in pg["shelves"])
        sheet = Image.new("RGBA", (used_w, used_h), (0, 0, 0, 0))
        for key, x, y in pg["items"]:
            img = scaled[key]
            w, h = img.size
            ext = img.resize((w + PAD * 2, h + PAD * 2), Image.NEAREST)
            ext.paste(img, (PAD, PAD))
            sheet.paste(ext, (x - PAD, y - PAD))
        fn = f"ui_extra_{pi}.webp"
        sheet.save(os.path.join(d, fn), "WEBP", quality=90, method=6)
        meta["pages"].append([fn, used_w, used_h])
    for key, (pi, x, y) in sorted(placed.items()):
        img = scaled[key]
        meta["sprites"][key] = {"p": pi, "r": [x, y, img.size[0], img.size[1]], **items[key][1]}
    with open(os.path.join(d, "atlas.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    print("ui extra atlas", len(placed), "sprites,", len(pages), "pages")


if __name__ == "__main__":
    main()
