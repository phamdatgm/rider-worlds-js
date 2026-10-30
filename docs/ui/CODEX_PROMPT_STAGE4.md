You are building the new UI of Rider Worlds (repo root: this project, a JavaScript/three.js port of a Unity game
whose UI is the original uGUI canvases ported to JS in `src/ugui` and driven by the ported scripts in `src/uiscripts`).
The owner has approved the final wireframe. Your job is stage 4 of the ReskinUI process: build it exactly as specified.

## Read first

1. `docs/ui/UI_SPEC.md` — the whole file. It is the contract: scope, hard constraints, architecture, design canvas,
   per-screen numbers (§7), binding table (§8), string table (§9), acceptance checklist (§10), out of scope (§11).
   If a picture and the text disagree, the text wins.
2. `docs/ui/final/NN-*.png` (one 1280×720 picture per screen) and `docs/ui/final/layout.json` (the same numbers,
   machine-readable). `docs/ui/final/wireframe-final.html` shows both in a browser.
3. `docs/ui/ref/home.png` if it exists (the owner's reference image for Home); otherwise `docs/ui/final/03-home.png`.
4. `docs/ui/ui-screens.md` (what each screen is) and `docs/ui/shots/` (the current UI), `README.md` (project layout).
5. The code the spec names: `src/ugui/*` (Canvas, CanvasScaler, RectTransform, layout groups, Image, TMP),
   `src/uiscripts/*` (home.js, challenges.js, levels.js, worldstats.js, rank.js, shop.js, lootbox.js, hud.js,
   settings.js, revive.js, tutorials.js, scenes.js), `src/portal.js`, `src/game/camera.js`, `src/engine/render.js`,
   `src/sdk/leaderboard/leaderboard.js` (API only).

## What to build

Everything in `UI_SPEC.md` §1 (all screens except 01 Loading), following §3 Architecture:
re-lay out and restyle the original uGUI objects in place (no DOM copy of the game UI), files under `src/ui2/`
(`rects.js`, `layout.js`, `style.js`, `home.js`, `showroom.js`, `leaderboard.js`), landscape layout from the §7
numbers, the original portrait layout kept as the fallback, the four "added on request" items of §2.1 and nothing
else new. Suggested order: layout engine + CanvasScaler switch → Home (§2.1 items 1–3) → menu overlays (04–07) →
pages (08, 09) → popup prefabs (04b, 09b, 10, 12, 13, 14, 18) → HUD / Pause / Tutorial → Leaderboard (DOM) →
showroom (§2.1 item 4) → restyle with the §6 tokens using tinted existing sprites (new art is stage 6, out of scope).

## Rules

- Follow §2 Hard constraints. In particular: never delete or replace an original GameObject; drive behaviour only
  through the original components; keep tutorial targets attached; strings verbatim; do not edit `src/sdk/**`,
  the game identity or the copyright line; hover changes colour only; UI sprites only in the WebP UI atlas.
- The working tree has the owner's uncommitted fixes in `src/game/mmfeedbacks.js`, `src/uiscripts/challenges.js`,
  `src/uiscripts/home.js`, `index.html`, `public/game.json`, `.gitignore`: keep them, build on top, never revert them.
- Code comments in English, matching the surrounding code. Do not commit; leave the changes in the working tree.
- Do not run `npm run build`. Use the dev server: `npm run dev` → http://localhost:5173 (it may already be running;
  headless pages add `?preroll=0`).
- Headless scripts (`tools/scenario.mjs`, `tools/browser.mjs`): on the dev server a module changed since the server
  started is served with `?t=<time>`, so `import('/src/x.js')` from a test loads a second copy of it. Import the URL
  the page loaded (see the `__mod` helper in `docs/ui/ui_shots.mjs`) or use the `window.__meta` / `__app` / `__save`
  handles. `tools/qa/common.mjs` `boot()` does not skip the tutorials any more (it reads `Tutorials.all` through
  such a copy and does not flush `sdk.storage`); `docs/ui/ui_shots.mjs` has a working version.
- If something in the spec cannot be built as written, choose the closest solution that keeps the constraints, and
  report it (do not silently change the design).

## Verify

- Write `tools/ui2-check.mjs` (headless Chrome via `tools/browser.mjs`): open every screen, press every button,
  check the layout at 1280×720, 1920×1080, 1024×768, 2560×1080, 844×390 and 390×844 against §7 (±4 design units),
  the minimum text size and hit areas of §4, the copyright line shown once and unchanged, the landscape ↔ portrait
  switch without reload; save pictures of every screen at every size in `docs/ui/verification/`.
- Run `npm run check` and the QA scenarios `tools/qa/functional.mjs`, `tools/qa/meta.mjs`, `tools/qa/portal.mjs`
  (`node tools/scenario.mjs tools/qa/<name>.mjs <outDir>`); all must pass.
- Go through every item of `UI_SPEC.md` §10 yourself and look at the pictures before reporting.

## When done

- Set the built screens to `[x]` in `docs/ui/ui-screens.index` and run `node docs/ui/ui_index.mjs` after
  `node tools/scenario.mjs docs/ui/ui_shots.mjs docs/ui/shots-raw` so `docs/ui/index.html` shows the new UI.
- If any built number differs from §7, add an "As built" section to `UI_SPEC.md` listing id, spec value, built value
  and why. Do not edit the generated block between the BEGIN/END SCREEN SPECS markers.
- Report: the files you created and changed (one line each on what they do), how each §10 item was checked and its
  result, the test commands and their output (pass / fail, with the failing output if any), the pictures in
  `docs/ui/verification/`, every deviation from the spec with its reason, and open questions.
