# Converts every PNG under a directory to WebP, IN PLACE — the .png is removed once its .webp
# stands. Run by tools/build.mjs against dist/assets/art only: the source tree stays PNG, which
# is what the Unity pipeline writes and what every extractor reads.
#
#   python3 JS_SDK_2.0/tools/webp-art.py <dir> '<the webp block of config.mjs, as JSON>'
#
# The second argument is optional and defaults to empty, which means plain lossless everywhere —
# the only setting that is never wrong for art nobody has classified yet.
#
# method=6 throughout (the slowest, smallest encode — build time is nobody's bottleneck).

import os
import json
import sys

from PIL import Image

# Directories whose art may be encoded LOSSY, and nothing else may.
#
# **The line is not about how a picture looks, it is about whether anything READS it.** A sprite
# sheet is cut into exact rects and the game draws those rects: lossy compression bleeds colour
# across a rect's edge, so a coin picks up a neighbouring frame's rim. `helper_hats` is worse
# again — its mask is sampled per pixel against a 0.9 threshold, so a shifted green channel gilds
# the wrong pixels, and it would do it silently.
#
# The seven felts are the opposite case and they are also the heavy ones: full-frame gradient
# backdrops, nothing cut from them, nothing sampled off them. Measured at q90 over the visible
# pixels of four of them — mean error 1 to 3 of 255, fewer than 0.15% of pixels off by more than
# 16, and alpha preserved exactly. They cost 3,585K lossless and 523K here.
# (values live in JS_SDK_2.0/config.mjs)

# Individual files that may be encoded LOSSY, for the same reason as the felts and named one by
# one because they sit at the art root rather than in a folder of their own.
#
# **These two are the loading screen's, and the game never draws either of them.** `loading.png` is
# painted twice by the PAGE -- once as a `blur(16px)` cover backdrop and once in the panel at 480 of
# its 800 -- and `azgames_logo.png` is 997 wide drawn at 300. Nothing cuts a rect from them,
# nothing samples them, and neither is on screen once the canvas exists.
#
# They were also 372K of a 400K jump in one build, which is what sent anyone looking: lossless is
# the default here and the default had never been questioned for a painted illustration. Measured
# at q90 over the visible pixels -- mean error 1.75 and 1.06 of 255, under 0.75% of channels off by
# more than 16, alpha exact on both -- against 296K and 76K lossless for 51K and 49K here.
# (values live in JS_SDK_2.0/config.mjs)

# Directories whose RGB is cut to fewer bits before a LOSSLESS encode, and how many bits.
#
# **This is the answer for art that is neither of the two cases above** — cut into rects, or
# sampled per pixel, so lossy is out, and yet expensive because it is painted rather than drawn.
# The repainted sacrifice portal is 1,737K lossless: fine high-contrast fire, which a lossy encoder
# cannot hold at any setting worth having (measured q90 mean error 8.8 of 255 with 13% of pixels
# off by more than 16, and q98 only reaches 7.8).
#
# Dropping the low bits of each channel is a different trade and a much better one here. It moves
# every pixel by a bounded, tiny amount instead of rewriting whole blocks, so nothing bleeds across
# a rect's edge and nothing crosses a threshold: at five bits the pair costs **769K, a 56% saving,
# for a mean error of 3.1 and NOT ONE pixel off by more than 16**. Four bits saves another 218K and
# was rejected by eye — the dark purple outer glow starts to band, which five bits does not.
#
# **Alpha is never touched**, by any of this. The portal composites over the table, so a shifted
# edge would show as a halo, and the whole point of preferring this to lossy is that the change is
# bounded and predictable.
#
# The same measurement says helper_hats_X2 (855K → 501K), skill_tree_sprites_X2 (283K → 135K),
# thief_walk (259K → 116K) and all_coins_X2 (172K → 77K) would behave identically. They are NOT
# listed, and adding them needs one more thing first: `helper_hats_mask` lives in the same folder as
# the sheet it masks and is read against a 0.9 threshold, so a folder-wide rule would quantise the
# one file where a bounded change is still a decision rather than a rounding.
# (values live in JS_SDK_2.0/config.mjs)

# The one thing a folder-wide rule cannot be trusted with, named file by file.
#
# **`helper_hats_mask` is READ, not drawn**, against `MASK_THRESHOLD = 0.9 * 255` in `hatBake.js`.
# Five bits maps a channel to `(v & 0xF8) + 4`, so a green of 230 -- above the threshold, meaning
# "recolour this pixel" -- becomes 228, which is below it. The pixel silently stops being gilded.
# Nothing errors; a few pixels of every golden and rainbow hat simply come out the wrong colour.
#
# This is why the folders above sat unused with their savings already measured: the sheet and the
# mask that reads it live in the same directory, and the rule had no way to treat them differently.

# (values live in JS_SDK_2.0/config.mjs)

# **The classification arrives from `config.mjs` as JSON**, so a game has one file to edit rather
# than a JS file and a Python file that can disagree about the same art. Defaults are empty: a
# project that passes nothing gets plain lossless, which is the only setting that is never wrong.
# the settings JSON, or @<file> holding it (a long perFile map does not fit a Windows command line: 32K chars)
_arg = sys.argv[2] if len(sys.argv) > 2 else ''
if _arg.startswith('@'):
    with open(_arg[1:], encoding='utf-8') as _f:
        _arg = _f.read()
_cfg = json.loads(_arg) if _arg else {}

LOSSY_DIRS = set(_cfg.get('lossyDirs', []))
LOSSY_FILES = set(_cfg.get('lossyFiles', []))
LOSSY_QUALITY = _cfg.get('quality', 90)
NEAR_LOSSLESS_BITS = dict(_cfg.get('nearLosslessBits', {}))
NEAR_LOSSLESS_SKIP = set(_cfg.get('nearLosslessSkip', []))
# exact: keep the RGB under fully transparent pixels in lossless encodes (WebP drops it by default). Art that is
# filtered unpremultiplied reads those colours at every sprite edge.
EXACT = bool(_cfg.get('exact', False))
# Per-file settings, by file name: {"scale": 0.5, "quality": 80, "bits": 7}. `bits` (lossless files only) drops the
# low bits of R, G and B before the lossless encode, as nearLosslessBits does for a folder. `scale` resizes first (in premultiplied space, so
# transparent pixels do not darken the edges they are averaged into); `quality` makes the encode lossy with the alpha
# kept lossless. The caller decides which files may be resized: only art whose UVs are normalised to the texture's
# LOGICAL size (every texture of the Unity export) survives a resize unchanged.
PER_FILE = dict(_cfg.get('perFile', {}))


if LOSSY_DIRS & set(NEAR_LOSSLESS_BITS):
    raise SystemExit('a folder cannot be both lossy and near-lossless')


def cut_to_bits(image, bits):
    """Drops the low bits of R, G and B. Alpha is carried through untouched."""
    keep = 0xFF << (8 - bits) & 0xFF
    half = 1 << (7 - bits)
    table = [min(255, (value & keep) + half) for value in range(256)]
    red, green, blue, alpha = image.convert('RGBA').split()

    return Image.merge(
        'RGBA', (red.point(table), green.point(table), blue.point(table), alpha)
    )

def visible_error(src, webp_path):
    """Mean absolute RGB error (0-255) over the pixels a player can see (alpha > 0), as docs/BUILD_PIPELINE.md measures."""
    try:
        a = src.convert('RGBA')
        b = Image.open(webp_path).convert('RGBA')
        pa, pb = a.tobytes(), b.tobytes()
        total = count = 0
        step = max(1, (len(pa) // 4) // 200000) * 4  # sample up to ~200k pixels
        for i in range(0, len(pa), step):
            if pa[i + 3] == 0:
                continue
            total += abs(pa[i] - pb[i]) + abs(pa[i + 1] - pb[i + 1]) + abs(pa[i + 2] - pb[i + 2])
            count += 3
        return total / count if count else 0.0
    except Exception:
        return None


root = sys.argv[1]
scaled = 0
errors = []
seen_lossy_files = set()
converted = 0
lossy = 0
cut = 0
before = 0
after = 0

for base, _dirs, files in os.walk(root):
    # The folder the file sits in, relative to the art root — `tables`, `coins`, and so on.
    folder = os.path.relpath(base, root).split(os.sep)[0]

    for name in files:
        if not name.lower().endswith('.png'):
            continue

        png = os.path.join(base, name)
        webp = png[:-4] + '.webp'
        image = Image.open(png)

        bits = None if name in NEAR_LOSSLESS_SKIP else NEAR_LOSSLESS_BITS.get(folder)
        wants_lossy = folder in LOSSY_DIRS or name in LOSSY_FILES

        # A named file inside a folder whose art is READ. The two rules would silently disagree and
        # the lossy one would win, which is the one that cannot be taken back.
        if name in LOSSY_FILES and NEAR_LOSSLESS_BITS.get(folder):
            raise SystemExit(f'{name} is named lossy but sits in {folder}, whose art is sampled')

        if name in LOSSY_FILES:
            seen_lossy_files.add(name)

        pf = PER_FILE.get(name)
        if pf:
            scale = pf.get('scale', 1)
            if scale != 1:
                w, h = image.size
                size = (max(1, round(w * scale)), max(1, round(h * scale)))
                if image.mode in ('RGBA', 'LA', 'P'):
                    image = image.convert('RGBA').convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
                else:
                    image = image.resize(size, Image.LANCZOS)
                scaled += 1
            if 'quality' in pf:
                image.save(webp, 'WEBP', quality=pf['quality'], alpha_quality=100, method=6)
                err = visible_error(image, webp)
                if err is not None:
                    errors.append((err, name))
                lossy += 1
            elif pf.get('bits'):
                cut_to_bits(image, pf['bits']).save(webp, 'WEBP', lossless=True, quality=100, method=6, exact=EXACT)
                cut += 1
            else:
                image.save(webp, 'WEBP', lossless=True, quality=100, method=6, exact=EXACT)
        elif wants_lossy:
            image.save(webp, 'WEBP', quality=LOSSY_QUALITY, method=6)
            lossy += 1
        elif bits:
            cut_to_bits(image, bits).save(webp, 'WEBP', lossless=True, quality=100, method=6, exact=EXACT)
            cut += 1
        else:
            image.save(webp, 'WEBP', lossless=True, quality=100, method=6, exact=EXACT)

        before += os.path.getsize(png)
        after += os.path.getsize(webp)
        os.remove(png)
        converted += 1

# A name that matches nothing is the failure this whole tool is most prone to: the file is still
# shipped, just at the wrong setting, and the only evidence is a build a few hundred K heavier than
# it should be -- which is exactly how the two above were found in the first place.
missing = sorted(LOSSY_FILES - seen_lossy_files)

if missing:
    raise SystemExit(f"named lossy but not found under {root}: {', '.join(missing)}")

print(
    f"webp: {converted} file(s), {before // 1024}K -> {after // 1024}K"
    f" ({lossy} lossy, {scaled} resized, {cut} bit-cut, {converted - lossy - cut} lossless)"
)
if errors:
    errors.sort(reverse=True)
    mean = sum(e for e, _ in errors) / len(errors)
    print(f"lossy error over visible pixels: mean {mean:.2f}/255, worst " + ', '.join(f'{n} {e:.2f}' for e, n in errors[:3]))
