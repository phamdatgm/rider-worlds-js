"""Pack the UI sprites (card art, icons, shop/lootbox art, banners) into WebP atlases in public/ui/atlas.

Output: atlas_<n>.webp pages + atlas.json {"pages": [[file, w, h], ...], "sprites": {name: [page, x, y, w, h]}}.
The sprite name is the source file name without extension; the JS UI draws them with CSS background offsets.
"""
import json
import os
import re
import shutil
import sys

from PIL import Image

from unity_yaml import ASSETS

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "ui", "atlas"))

SOURCES = [
    ("Sprite/SA_Cards", None),
    ("Sprite/SA_ChallengeSystem", None),
    ("Sprite/SA_Icons", None),
    ("Sprite/SA_Shop_UI", None),
    ("Texture2D", lambda n: n.startswith("S_") or n.startswith("TX_W1_B") or n.startswith("TX_W2_B")
        or re.match(r"^[A-Za-z]+_(Common|Rare|Epic|Legendary)\.png$", n)
        or n.startswith("TX_W3_B") or n in ("TX_Background_Shop.png", "TX_Lootbox.png", "TutorialHand_Pointing.png",
                                           "UI_Lock.png")),
]
PAGE = 2048
PAD = 2
MAX_SIZE = 256        # icons / card art
MAX_SIZE_LARGE = 512  # banners and backgrounds
QUALITY = 88


def load_sprites():
    seen = {}
    for rel, flt in SOURCES:
        src = os.path.join(ASSETS, rel)
        for name in sorted(os.listdir(src)):
            if not name.lower().endswith(".png") or (flt and not flt(name)):
                continue
            key = os.path.splitext(name)[0]
            if key in seen:
                continue
            img = Image.open(os.path.join(src, name)).convert("RGBA")
            # trim fully transparent borders? no: UI layouts rely on the authored padding
            limit = MAX_SIZE_LARGE if key.startswith(("TX_", "S_Shop_Banner", "S_Lootbox_Background", "S_Popup")) else MAX_SIZE
            w, h = img.size
            k = min(1.0, limit / max(w, h))
            if k < 1:
                img = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            seen[key] = img
    return seen


def pack(sprites):
    """Shelf packer: tallest first, fills pages of PAGE x PAGE."""
    order = sorted(sprites.items(), key=lambda kv: (-kv[1].size[1], -kv[1].size[0]))
    pages = []  # each: {"shelves": [[y, h, x]], "items": []}
    placed = {}
    for name, img in order:
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
        pages[pi]["items"].append((name, x + PAD, y + PAD))
        placed[name] = (pi, x + PAD, y + PAD, img.size[0], img.size[1])
    return pages, placed


def main():
    sprites = load_sprites()
    pages, placed = pack(sprites)
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    meta = {"pages": [], "sprites": {}}
    total = 0
    for pi, pg in enumerate(pages):
        used_h = max(sh[0] + sh[1] for sh in pg["shelves"])
        used_w = max(sh[2] for sh in pg["shelves"])
        sheet = Image.new("RGBA", (used_w, used_h), (0, 0, 0, 0))
        for name, x, y in pg["items"]:
            sheet.paste(sprites[name], (x, y))
        fn = f"atlas_{pi}.webp"
        sheet.save(os.path.join(OUT, fn), "WEBP", quality=QUALITY, method=6)
        total += os.path.getsize(os.path.join(OUT, fn))
        meta["pages"].append([fn, used_w, used_h])
    meta["sprites"] = {k: list(v) for k, v in sorted(placed.items())}
    with open(os.path.join(OUT, "atlas.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    print("ui atlas", len(placed), "sprites,", len(pages), "pages,", f"{total / 1e6:.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
