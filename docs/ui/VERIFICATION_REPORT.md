# Rider Worlds UI2 — verification report

> **Superseded in part (2026-10-28, rework):** the first build below reported PASS, but a visual review found broken
> screens (Shop, Garage, Levels, World Stats, Reward Track, Claim Bonus, Rank Up, Lootbox, HUD) and a canvas order that
> put popups above the tutorial. They were fixed and stage 6 art was added; see `UI_SPEC.md` §12.1. The pictures in
> `docs/ui/verification/` are from the rework run (132 captures, 0 failures) and the QA folders from its re-run.

Date: 2026-10-28

## Outcome

Stage 4 is implemented for screens 02–18. Loading screen 01 remains the kit default. The game uses the original
uGUI objects and component handlers; landscape receives the 1280×720 layout and portrait restores the original
layout with the neon styling. `tools/ui2-check.mjs` completed 22 states × 6 viewports: 132 captures, 0 layout
failures and 0 page exceptions.

Home follows the supplied demo's composition: violet/cyan mountain valley, centered selected vehicle on a glowing
podium, compact HUD at the top and five neon tabs at the bottom. The live selected Rider Worlds vehicle is simpler
than the sportbike painted in the demo. It remains live so vehicle selection, Garage preview and gameplay use the
same model.

## Files

- `src/ui2/rects.js` — generated §7 rectangle/binding data for all mapped uGUI elements.
- `src/ui2/layout.js` — landscape application, portrait restore, CanvasScaler switching and runtime prefab hooks.
- `src/ui2/style.js` — neon chrome, typography, colours, shading and interaction styling on original components.
- `src/ui2/home.js` — five-tab Home bar, World/Play composition, HUD placement and Vehicles label.
- `src/ui2/showroom.js` — live selected vehicle, WebGL podium/reflection, backdrop and scene restoration.
- `src/ui2/leaderboard.js` — responsive neon leaderboard and Name & flag overlay using the existing board API.
- `src/engine/instantiate.js` — optional post-instantiation hooks used for runtime UI prefabs.
- `src/ugui/canvas.js` — before/after layout hooks used for orientation-safe UI2 application.
- `src/main.js` — loads the UI2 integration once with the game.
- `src/portal.js` — opens the game-styled leaderboard while keeping the existing portal state contract.
- `src/uiscripts/hud.js` — routes documented KeyR restart through the original HUD RestartButton.
- `public/assets/ui_extra/ui2_home.webp` — generated Home environment plate without vehicle or UI.
- `public/assets/ui_extra/atlas.json` — registers the environment plate as `Sprite/UI2/HomeBackdrop`.
- `tools/ui2-bindings.mjs` — creates binding data from the approved layout and live object paths.
- `tools/ui2-check.mjs` — opens every state, exercises controls and captures six target viewports.
- `tools/scenario.mjs` — propagates scenario failures through the process exit code.
- `tools/qa/common.mjs` — imports the exact Vite-loaded modules and flushes tutorial setup storage.
- `tools/qa/functional.mjs` — deterministic module access and storage flush for gameplay/save assertions.
- `tools/qa/meta.mjs` — deterministic module access and component-driven lootbox assertions.
- `tools/qa/portal.mjs` — deterministic module access for portal assertions.
- `docs/ui/ui_shots.mjs` — stable live-screen tour independent of local leaderboard sign-in.
- `docs/ui/ui-screens.index` — marks screens 02–18 complete.
- `docs/ui/UI_SPEC.md` — records the final art/model implementation in §12 As built.
- `docs/ui/home-art.json` — records the built-in imagegen source and exact prompt.
- `docs/ui/shots/` and `docs/ui/index.html` — rebuilt 18-screen review gallery.
- `docs/ui/verification/` — 132 matrix screenshots, QA artifacts, logs and machine-readable report.

The pre-existing owner changes in `.gitignore`, `index.html`, `public/game.json`, `src/game/mmfeedbacks.js`,
`src/uiscripts/challenges.js` and `src/uiscripts/home.js` were preserved. No file under `src/sdk/` was edited.

## Acceptance checklist

- **§7 geometry and approved wireframes:** PASS. All active mapped elements were within ±4 design units at
  1280×720; the final screenshots were reviewed visually.
- **Closed element list:** PASS. Original scripted objects remain in place. The only product additions are the four
  §2.1 items; the backdrop is the owner-requested art pull-forward documented in §12.
- **Original behavior and buttons:** PASS for automated coverage. UI controls call their original Button/UI methods;
  functional, meta and portal scenarios completed with no automated failure.
- **Home tabs:** PASS. Shop, Vehicles, World, Challenges and Levels are present; World runs Endless on Home and
  returns to Home from Shop/Garage; overlays and notification badges use their original components.
- **Tutorial targets:** PASS by structure and first-run runtime test. Targets were not replaced or detached; the
  first-run sequence reached every step and completed. The QA bot cannot intentionally crash during the tutorial,
  so that one failure-recovery branch remains a manual check.
- **Responsive matrix:** PASS. 1280×720, 1920×1080, 1024×768, 2560×1080, 844×390 and 390×844 were captured for
  every state. Edge HUD items follow viewport edges; portrait restores the original layout.
- **Resize/orientation without reload:** PASS. Each matrix capture changes viewport on the same page and checks the
  active orientation mode; no exception was recorded.
- **Text and hit areas:** PASS. The checker rejects active design text below 15 and validates mapped geometry; small
  close controls receive expanded raycast padding on low landscape viewports.
- **Copyright/version:** PASS. Settings contains one `V26102306` / `© 2026 Azgames.io` footer from `footerText()`.
- **Hover:** PASS by code review. Hover changes colour only; it does not scale, shake or pulse.
- **Leaderboard:** PASS. Periods, paging, player row, profile save error/success and Esc/close were exercised with a
  deterministic local provider; production still uses `Portal.board`.
- **Home showroom:** PASS. The selected live vehicle is in front of the mountain plate on the reflective podium.
  Garage equip/preview tests pass and the showroom restores the scene/materials when Home closes.
- **Verification artifact:** PASS. `report.json` records 22 states, 132 checks, no failures and no exceptions.

## Commands

- `node tools/scenario.mjs tools/ui2-check.mjs docs/ui/verification` — PASS: 22 screens, 132 captures, 0 failures.
- `npm.cmd run check` — PASS: package meets `docs/EXPORT.md`; existing warnings remain for null GD key and unknown
  exported-asset licences.
- `node tools/scenario.mjs tools/qa/functional.mjs docs/ui/verification/qa-functional` — PASS for all automated
  assertions. `BOOT-04` is TODO because the bot always lands safely and cannot test the tutorial crash branch.
- `node tools/scenario.mjs tools/qa/meta.mjs docs/ui/verification/qa-meta` — PASS, including rank, currency, Shop,
  lootbox queue/card grant, challenges, Garage equip and world stats.
- `node tools/scenario.mjs tools/qa/portal.mjs docs/ui/verification/qa-portal` — PASS for footer, analytics,
  leaderboard, interstitial and rewarded-ad pause. `RV-RESUME` is TODO because Google's test ad does not close in
  headless Chrome; it requires a manual browser close/completion.
- `node tools/scenario.mjs docs/ui/ui_shots.mjs docs/ui/shots-raw` — PASS.
- `node docs/ui/ui_index.mjs` — PASS: 18 screens, 1330 KB.

`npm run build` was not run, as required by the stage prompt. No commit was created.

## Deviations and open checks

- The polished environment plate was pulled forward from stage 6 at the owner's request. It is atlas-packed and
  has no baked controls, labels, podium or vehicle.
- The selected live game vehicle differs visually from the demo sportbike; replacing it would break the requirement
  that Home show the selected model and would change Garage/gameplay content.
- Manual-only checks: force a crash during the first-run tutorial, listen to music/SFX, and close/complete Google's
  rewarded test ad to observe resume. These are limitations of the headless inputs/provider, not recorded UI errors.
