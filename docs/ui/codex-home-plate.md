# Codex task: Home background plates, revision 2 (wider view, higher camera)

Produce two images only. Do not edit any code, atlas or `public/` file; Claude integrates the images.

## Why a revision

The owner wants the Home environment smaller on screen and seen from a slightly higher camera. The first plates
(`art/ui2/home_plate_w1.png`, `home_plate_w2.png`) are shrunk to 74 % in the game for now, and their edges are
mirrored to fill the screen, which shows a visible fold. These plates replace them at full size.

## Inputs

- First plates, for content, style and colours: `art/ui2/home_plate_w1.png` (violet), `art/ui2/home_plate_w2.png`
  (green). Keep everything they contain; only the framing and camera change.
- References: `docs/ui/ref/home.png` (World 1), `docs/ui/ref/home_world2.png` (World 2).

## Output

| File | Size | Content |
|---|---|---|
| `art/ui2/home_plate_w1_v2.png` | 1920 × 1080, opaque PNG | World 1 environment with its podium |
| `art/ui2/home_plate_w2_v2.png` | 1920 × 1080, opaque PNG | World 2 environment with its podium |

In `docs/ui/home-art.json`, add one entry per image with the tool, the prompt and the source path.

## Framing

- The camera is pulled back: the podium and the environment read about 26 % smaller than in the first plates. More
  sky shows above the mountains or ruins, and more floor shows on both sides of the podium.
- The camera is a little higher: it looks down about 12° (first plates: about 9.6°). The podium's top therefore reads
  as a slightly rounder ellipse. The floor, the floor ring and the podium share this one perspective.
- The scenery fills the full width with real content (mountains or ruins and tracks run off both edges). There are no
  mirrored or repeated edges.
- The top 20 % of the image stays quiet sky. The bottom 17 % (y ≥ 896) stays quiet floor, because the tab bar covers
  it.

## Podium geometry (pixels in the 1920 × 1080 image, both worlds)

A vehicle is drawn live on the podium, so these positions matter. Stay within about ±8 px.

| Part | Centre (x, y) | Half-width | Half-height |
|---|---|---|---|
| Top surface ellipse (outer edge of the rim) | 960, 675 | 315 | 66 |
| Outer bottom step, at floor level | 960, 727 | 364 | 76 |
| Glowing floor ring around the podium | 960, 729 | 424 | 89 |

- The podium is the same low, flat disc as in the first plates (rim, light blocks, one floor step), only smaller. The
  side wall is about 50 px tall at the front.
- The middle of the top surface is empty: the vehicle stands there.
- The podium is mirror-symmetric about x = 960, level, not tilted.
- Same rules as before: no vehicle, no vehicle reflection, no UI, text, icons, logos or watermark.
