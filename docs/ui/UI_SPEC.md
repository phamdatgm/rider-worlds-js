| `ru.tap` | Click to continue | `TapToContinue` | canvas | 440 | 578 | 400 | 30 | 18 | y 513 (the offer's place) when the rank gives no gems || `ru.rv` | Double reward (ad) button | `DoubleReward RV/Button` | canvas | 530 | 500 | 220 | 56 | 20 | state: only once the rewards are shown and one of them is gems || `ru.reward` | Rank rewards | `RewardBox (RankUpReward_*)` | canvas | 545 | 292 | 190 | 190 | 16 | square cards side by side, gap 24, centred on x 640; the picture keeps its shape (owner: "make it square so it is not distorted") || `ru.star` | Rank star (large) | `LevelBaseStar` | canvas | 560 | 126 | 160 | 150 | 44 |  || `ru.title` | Title | `RankBox/RankUp` | canvas | 440 | 64 | 400 | 56 | 40 | stays on (portrait fades it out) |# Rider Worlds — UI spec (landscape re-layout, neon style)

Hand-off spec for the developer agent that builds the new UI (ReskinUI stage 4). Everything needed is in this file;
the pictures are in `docs/ui/final/`.

**If a picture and this text disagree, this text wins.**

| Source | What it is |
|---|---|
| `docs/ui/final/NN-<screen>.png` | one 1280×720 picture per screen, drawn from the numbers below |
| `docs/ui/final/layout.json` | the same numbers, machine-readable (design rect, font size, anchor of every element) |
| `docs/ui/final/wireframe-final.html` | the pictures + tables in a browser; `node docs/ui/final/build.mjs` regenerates PNG, JSON and §7 |
| `docs/ui/ref/home.png` | the user's reference image for Home (the look every screen follows) |
| `docs/ui/ui-screens.md`, `docs/ui/shots/` | what each screen is for, screenshots of the current UI |
| `docs/ui/wireframes.html` | the three concepts the choice was made from (context only) |

## 1. Goal and scope

Re-lay out the game's UI for landscape web play (mouse + keyboard, 16:9 up to 21:9, phones in landscape) in the
neon look of the user's Home reference: dark violet background, chamfered panels and hexagon buttons with a violet
neon outline, bold upper-case titles. Every screen keeps the elements it has today (closed list, §7); only the layout
and the look change, plus the four items of §2.1.

| # | Screen | New layout | Notes |
|---|---|---|---|
| 01 | Loading | — keep the kit's default | out of scope |
| 02 | Transition | concept B | |
| 03 | Home | the user's reference image | §2.1 items 1–4 |
| 04 | Challenges | A | |
| 04b | Challenges — skip popup | A | |
| 05 | Levels | A | close on the panel's corner; page arrows on the panel's sides, page dots under the rows, total stars top-right beside the title |
| 06 | World Stats | A | close on the panel's corner |
| 07 | Reward Track | A | popup like Progress, rewards in a 3-column grid of cards (owner's mockup) |
| 08 | Garage | B | |
| 09 | Shop | A | |
| 09b | Shop — confirmation / refresh popups | C | |
| 10 | Settings | A | |
| 11 | Leaderboard | A | own screen instead of the kit's default (§3.4) |
| 11b | Leaderboard — Name & flag | A | |
| 12 | Rank Up | A | |
| 13 | Claim Bonus | A, buttons stacked as in B | |
| 14 | Lootbox — chest | C | |
| 14b | Lootbox — cards / summary | C | |
| 15 | HUD | A | |
| 16 | Pause | A | |
| 17 | Tutorial | C | |
| 18 | Revive | A | |

## 2. Hard constraints

1. **Do not break game logic.** Keep every original GameObject with its components. Move, re-parent, re-anchor,
   resize and restyle them; never delete one, never replace a scripted object by a new one. Behaviour goes through
   the original components only: `Button.onClick` / `Button.Press()`, `MenuButtonState`, `UI_*` overlay
   `TryOpen` / `TryClose`, toggles' `OnClicked`. No new game logic except §2.1.
2. **Paths that scripts look up must keep working.** Known lookups: `src/uiscripts/settings.js`
   `transform.Find('PausePopup/cpr')`; `src/portal.js` `TOP_CONTAINER = 'UI Container/BodyContainer/PageContainer/Home Screen/TopContainer'`
   and `top.Find('ScoreDisplay')`. Re-parenting an object on such a path means updating the caller in the same change.
   Serialized references (`{$c}`, `{$n}`, `{$t}`) survive re-parenting; check `transform.Find` / `.Find('` again before
   finishing.
3. **Tutorial targets stay attached.** `TutorialSocket`, `TutorialTarget`, `MenuButtonState.TutorialPressSocket`,
   `HomeScreenManager.PlayButton` (UnlockWorld tutorial) and every button a tutorial focuses keep their place in the
   hierarchy so the hand and the focus follow the new positions.
4. **Strings are verbatim** (§9): the I2 English terms and scene texts the game shows today. Upper case comes from
   the TMP font style, not from new strings. No new labels except §2.1 item 3.
5. **SDK.** Do not edit `src/sdk/**` (kit files), the game identity (`docs/GMSDK_JS/config.json`, `public/game.json`
   id / gameCode) or the copyright line (`footerText()` of `src/portal.js` from `src/sdk/copyright.js`; it stays in the
   Settings popup). There is no More Games button in this game and none is added. `public/icons/` (loading art and
   kit logo) stays.
6. **Hover changes colour only** (outline / fill to the active colour of §6): no scale, no shake, no glow pulse.
7. **UI sprites go into the WebP UI atlas** (`public/assets/ui/` via `tools/export.py` `write_ui_atlas`, or
   `public/assets/ui_extra/`), never loose PNGs.
8. Work and test with `npm run dev` (http://localhost:5173). Do not run `npm run build`. `npm run check` and the QA
   scenarios in `tools/qa/` must still pass.

### 2.1 Added on request (only these four)

1. **Home tab bar holds Challenges and Levels.** `BottomContainer/ChallengeButton` and `BottomContainer/LevelsButton`
   move into the bottom bar as tabs 4 and 5. The two page buttons that never unlock (`Bottom Menu Button - Settings`,
   `Bottom Menu Button - PLACEHOLDER`) are deactivated; their `MainMenuPage` switchers stay in
   `MainMenuManager.switchers` (indices unchanged).
2. **The World tab is Play on Home.** `Home Screen/BottomContainer/PlayButton` is laid out on top of the World tab
   (same rect as `t.world`), its hexagon graphic transparent and its `Icon` (`S_Icon_Play`) shown small next to the
   globe. It belongs to Home Screen, so it is only there while Home is the current page: one press on the lit World
   tab on Home = the original `PlayButton.onClick` (`HomeScreenManager.OnPlay`); on Shop / Garage the World tab is the
   normal page button back to Home. No new handler.
3. **The Garage tab reads "Vehicles"** instead of "Collection" (the text of `Meta Screen/.../UI_VehicleMetaTabButton/TabTitle`).
4. **Home showroom.** On Home the menu camera shows the selected vehicle standing on a neon podium in front of a neon
   mountain backdrop (reference image), not on the track. Garage previews (`vehicle` / `trail` / `landing` / `death`
   static views) and runs are unchanged. Suggested build: a small three.js group (stacked cylinders with emissive
   magenta / cyan rings for the podium, a far textured plane for the mountains) shown while the `menu` static view
   of `src/game/camera.js` is active, with the track chunks hidden for that view. Art for the podium and backdrop is
   stage 6; until then use flat colours of §6.

## 3. Architecture

The ReskinUI template assumes a DOM layer over an untouchable Unity canvas. Here the UI *is* JavaScript: the
original uGUI canvases are ported (`src/ugui`) and driven by the original scripts (`src/uiscripts`). A DOM copy would
have to re-create card grids, render-texture lootboxes, flying currency particles, MMFeedbacks tweens and tutorial
focus. So the new UI is the **same uGUI objects, re-laid out and restyled in place**:

### 3.1 Files

| File | Job |
|---|---|
| `src/ui2/rects.js` | the landscape rect of every mapped object: object path (per scene / prefab) → design rect + anchor, taken from `docs/ui/final/layout.json` via the binding table (§8) |
| `src/ui2/layout.js` | applies / restores the rects (§3.2), swaps the CanvasScaler, hooks scene and prefab instantiation |
| `src/ui2/style.js` | sprite / colour / font swaps of §6 on the same objects |
| `src/ui2/home.js` | §2.1 items 1–3 (tab bar, PlayButton on the World tab, "Vehicles") |
| `src/ui2/showroom.js` | §2.1 item 4 |
| `src/ui2/leaderboard.js` (+ CSS in it) | the Leaderboard screen (§3.4) |
| `tools/ui2-check.mjs` | the automatic checks of §10 (headless Chrome, `tools/browser.mjs`), pictures into `docs/ui/verification/` |

### 3.2 Applying the layout

- **Landscape (viewport W ≥ H):** for every canvas of Menu, HUD, CoreUI (Transition Screen + TutorialCanvas) and every
  UI prefab instantiated at run time (popups of §7), set `CanvasScaler.m_ReferenceResolution = [1280, 720]`,
  `m_ScreenMatchMode = 1` (Expand), then for every mapped RectTransform set anchors, pivot, `anchoredPosition` and
  `sizeDelta` from its design rect. Keep the original values to restore them.
- **Portrait (W < H):** restore the original values (reference 1080×1920, original anchors). §6 restyling still
  applies; §2.1 items 1–2 are off (PlayButton back in place, original tab buttons back).
- Switch on resize when the aspect crosses 1 (`window.innerWidth >= innerHeight`), after the uGUI layout of that frame.
- **Design rect → RectTransform.** Design rects are absolute (top-left origin, 1280×720). For anchor `canvas`:
  `anchorMin = anchorMax = pivot = (0.5, 0.5)` on the stretched root (`UI Container`), position
  `(x + w/2 − 640, 360 − (y + h/2))`, size `(w, h)`. For edge anchors use the matching corner / edge of the viewport
  (`top-left` → anchor (0, 1), position `(x, −y)` with pivot (0, 1); `top-right` → anchor (1, 1), position
  `(x + w − 1280, −y)` with pivot (1, 1); `bottom` → anchor (0.5, 0), position `(x + w/2 − 640, 720 − (y + h))` with pivot
  (0.5, 0)). A mapped object inside another mapped object gets its position relative to its parent's rect.
- **Objects that move by themselves** must get their landscape targets too: `Timed Level Overlay/OffscreenPosition`,
  `ViewPosition`; `WorldStatsScreen/OffScreenPosition`, `ViewPosition`, `WorldBannerOffScreenPosition`;
  `ClaimBonusOverlay/SpawnPosition`, `EndPosition`; every `DOTweenAnimation` / `MMFeedbackPosition` with absolute
  positions on a mapped object (`src/game/mmfeedbacks.js` already re-reads UI positions after a resize).
- Layout groups (`HorizontalLayoutGroup`, `VerticalLayoutGroup`, `GridLayoutGroup`, `ContentSizeFitter`) that place the
  children of a mapped object (level list, card grid, shop sections, reward track content) are set to the spacing /
  cell size of §7 rather than mapping each child.

### 3.3 Look

New 9-sliced sprites (chamfered panel, hexagon button, pill bar, tab plate, active variants) packed into the UI atlas;
`Image.type = Sliced`, colours of §6. Until stage 6 delivers the art, reuse the closest existing sprites
(`S_Button_Main_5` hexagon, `S_Container_Base` / `S_Container_Solid` panels, `S_Bar_Generic_Small` bars,
`S_NavigationBar_*` tabs) tinted to §6.

### 3.4 Leaderboard

The kit allows a game to draw its own screen with `src/sdk/leaderboard/leaderboard.js` and drop the default
`ui.js` (comment at the top of `src/sdk/leaderboard/ui.js`). `src/ui2/leaderboard.js` is a DOM screen above the canvas
(it needs a text `<input>` and a `<select>`), styled with §6 and sized with `--u = min(innerWidth/1280, innerHeight/720)px`
(design units, centred; in portrait use the same panel at `min(94vw, 600 * --u)`). It uses the board object of
`src/portal.js` (`Portal.board`): `board.top(period, { offset, limit })`, `board.me(period)`, `board.player()`,
`board.setPlayer({ name, country })`, `PERIODS`, `cleanName`, `cleanCountry`, flags from `assets/leaderboard/`, text from
`t('leaderboard.<key>')` with the same English fallbacks as the kit (§9). `src/portal.js` `openBoard()` imports it
instead of `openLeaderboard` of the kit; `leaderboardOpen()` keeps working (same `popup` variable / `close()`).
Behaviour as the kit screen: 4 periods, 20 rows per page + More, the player's row in the footer, Name & flag form with
Cancel / Save and the save error, Esc and ✕ close.

## 4. Design canvas

- **Landscape:** 1280×720 design units, `u = min(W/1280, H/720)` CSS px (= CanvasScaler Expand at 1280×720), the
  canvas centred. Elements with an edge anchor in §7 follow the viewport edge on 21:9 / 4:3; everything else stays in
  the centred canvas.
- **Portrait:** the original portrait layout (§3.2).
- **Low landscape (H ≤ 480, e.g. 844×390, u ≈ 0.54):** same layout. Every readable text has a design size ≥ 15
  (≥ 8 px there). Buttons smaller than 72 design units (close ✕, small hexagons) get `raycastPadding` so the hit area
  is at least 40 CSS px when `u < 0.7`.

## 5. Screen notes (behaviour and details the tables cannot show)

- **Every popup has a black translucent shade behind it** (§6 `shade`: black at 65 %) covering everything behind
  the popup, the top bar and tab bar included: 04, 04b, 05, 06, 07, 09b, 10, 11, 11b, 13, 16, 18. The shade is the
  overlay's own full-screen `Background` object (add a full-screen black `Image` under the panel where an overlay has
  none, e.g. Levels, World Stats, Reward Track); the Leaderboard DOM screen uses `rgba(0,0,0,.65)`. Full-screen
  screens with their own picture (12 Rank Up, 14 / 14b Lootbox) keep it. The ✕ button sits where §7 says (on the panel's top-right corner on 04, 04b, 05, 06, 10, 11,
  11b, 09b confirmation, 18, and 07 since its grid rework). Screens without a
  close button in the game (12, 13, 16) get none.
- **02 Transition:** the world indicator and the arrows sit exactly where they are on Home, so the switch reads as the
  Home header staying put while the scene fades to black. Star requirement / Coming Soon below it when the world is
  locked.
- **03 Home:** see §2.1. `h.hsNew` (NewSticker) appears right of the score on a new best. `h.bonus` is the
  ClaimBonusButton (BONUS pips under the high score); it shows only when the game shows it, and then for 3 s unless
  its reward waits (§ Home notes). Tooltip (`h.tooltip`) above
  the tab bar, centred. The challenge progress popups of the menu (`h.chpop`, `ChallengeSlotReadOnlyPopup`) sit
  under the currency pills, right-aligned with them (owner's markup, 2026-10-29; were a band across the lower right
  of the podium): a row plate with the challenge (15, one line) over a plain 5-high bar sharing its left edge (the
  original mask is a slanted 9-slice, a wedge at this height), both stopping before a 52-wide reward column on the
  right where the reward (one star or a cluster) is fitted by its opaque part. A hard challenge's icon stands left of
  the reward and the text gives it room. They fade in and out in place; the original's 50-unit rise (its
  MMFeedbackPosition) is off, it ran into the pills.
  Badges sit on the top-right corner of each tab.
- **04 Challenges:** one slot per row (3 rows). Each slot: hard-challenge icon left, text, progress bar under the
  text, then check, reward and skip on the right. A slot in cooldown shows "Next Challenge in" + timer (+ reset-timer
  button); a locked slot shows the lock text; all done shows the completed text.
- **05 Levels:** one panel (190, 130, 900×500) with the page title centred at the top and ✕ on its top-right corner
  (as Settings). 8 levels in 2 columns × 4 rows (name left, best time centre, stars right); the pages still slide
  sideways inside the panel (ScrollSnapRect). The locked-page indicator is centred under the rows; the panel's bottom
  row holds the previous page arrow (bottom-left), the total stars (centre) and the next page arrow with its badge
  (bottom-right). The 3D world stays hidden while it is open (as today).
- **06 World Stats:** the progress bar under the title; Endless full width, Levels and Collection side by side; ✕ on
  the panel's top-right corner (as Settings).
- **07 Reward Track:** a panel like Progress with STAR RANK centred in its header (the rank stars and star bar are
  off: Home shows them); the track is a 3-column grid of cards (rank star, picture, name / type, currency, a lock or
  ✓ disc on the bottom-right corner) with a scrollbar on the right, the next reward's card lit (owner's mockup,
  §12.2). It still scrolls to the next reward when opened. ✕ on the panel's top-right corner.
- **08 Garage:** left half = name, rarity, copies bar (when shown), 3D preview, the 4 rank / skin buttons; right half =
  the 5 type tabs on top, the card grid by world under them (5 per row, scrolls vertically).
- **09 Shop:** four rows, one per section, the section header as a block on the left (title + timer), the items to
  the right: Free Rewards (ad button, 5 rewards, progress bar, explanation), Chests (Small, Large with the "Most
  Popular" sticker), Daily Deals (3 cards + refresh), Rubies (gift, packs "Not Available"). No vertical scroll at 16:9.
- **09b Shop popups:** the purchase confirmation is a bottom sheet over the shop (item picture left, title, rarity,
  contents, buy button right, ✕ on the sheet's top-right corner); the daily-deals refresh popup is a panel centred in
  the upper half.
- **11 Leaderboard:** §3.4. Period tabs under the title, rows (rank, flag, name, score right-aligned), More / status
  line, the player's row + Name & flag at the bottom.
- **12 Rank Up:** title, big rank star, rewards in a row, the x2 (ad) button (gems only), "Click to continue".
- **13 Claim Bonus:** concept A panel; the x2 Gems (ad) button above Claim, both full panel width.
- **14 / 14b Lootbox:** chest in the centre with the cards-left badge on its top-right, "Click to Open" as a button-like
  plate below. Cards phase: the summary grid on the left (4 per row), the card being revealed on the right, the
  Lose it / ad / Claim buttons centred at the bottom.
- **15 HUD:** gems top-left; "New Best!" above the score at top centre; in Level mode the timer and level name under
  the score (the score display shows the timer as today); BONUS letters under that; restart (Level) and pause
  top-right; compliments centred in the upper third; the in-run challenge popup bottom centre.
- **16 Pause:** panel with the title, 4 hexagon buttons in a row (Home, music, sound, bloom) and Resume; the running
  challenges (Endless only, as today) under the panel.
- **17 Tutorial:** the instruction text and "Click to Continue" in a plate at the bottom centre; focus, hand and
  picture follow their targets as today.
- **18 Revive:** panel in the centre (timer heart, "Revive?", Continue (ad), ruby price, ✕ on the corner); the ruby bar
  top-right. No reason box in landscape.

### 5.1 Repeated items

§7 gives the rect of the first item of each repeated group; the others follow this table (set through the layout
group of the container where there is one).

| Screen | Group | First item (x, y, w×h) | Repeat |
|---|---|---|---|
| 04 | challenge slots | 360, 222, 560×70 | 3 rows, pitch 82 (y 222 / 304 / 386); panel 330, 130, 620×352 (ends under the last row). Laid out like the read-only rows: text x+20, y+10, 410×28 (17, shrinks to 15, one line); plain bar x+20, y+48, 410×8; hard icon 32×32 at x+436; check 34×34 at x+472 (`badge_claimed` disc); reward 44×48 at x+510, no frame. No skip button in landscape (owner's request). Cooldown: "Next Challenge in" + timer centred on x+30, 460 wide |
| 05 | level entries | 240, 205, 380×56 | 2 columns (x 240 / 660) × 4 rows, pitch 66 (y 205 / 271 / 337 / 403). Inside: name left (40 %), best time centre (30 %), stars right |
| 07 | track rows | 190, 128, 900×82 | vertical list, pitch 90 (scrolls). Inside: rank star 56×56 at x+14; reward box 62×62 at x+86; Next Reward / name / description in three lines from x+168 |
| 08 | type tabs | 640, 130, 116×60 | 5 in a row, pitch 122 |
| 08 | cards | 650, 234, 110×123 | 5 per row, gap 10; world header (26 high) above each world's rows; vertical scroll inside 630×462 at (630, 120) |
| 08 | rank / skin buttons | 110, 482, 90×81 | 4 in a row, pitch 100 |
| 09 | section rows | header block 30, 124, 210×104 | 4 rows, pitch 114 (y 124 / 238 / 352 / 466) |
| 09 | free rewards | 344, 128, 110×70 | 5 in a row, pitch 120; ad button 80×72 at (252, 132); progress bar (344, 202, 590×10) |
| 09 | daily deals | 252, 352, 290×104 | 3 in a row, pitch 300; refresh 72×64 at (1160, 372) |
| 09 | ruby packs | 566, 466, 300×104 | 2 in a row, pitch 314; gift 300×104 at (252, 466) |
| 10 | toggles | 484, 286, 86×77 | 3 in a row, pitch 108 |
| 11 | period tabs | 360, 170, 134×40 | 4 in a row, pitch 140 |
| 11 | rank rows | 360, 222, 560×40 | pitch 44, 6 visible, the list scrolls; score right-aligned 12 from the right edge |
| 12 | rewards | 390, 370, 240×110 | 2 in a row, pitch 260 (more rewards: same pitch, row centred) |
| 14b | summary cards | 56, 76, 187×234 | 4 per row, pitch 197 × 244, inside the grid panel (40, 60, 820×520) |
| 16 | buttons | 470, 214, 76×68 | 4 in a row, pitch 86 (Home, music, sound, bloom) |
| 16 | running challenges | — | not shown in landscape (owner's request, 2026-10-29); portrait keeps them |

## 6. Visual tokens

| Token | Value | Use |
|---|---|---|
| `bg` | `#090418`; sky gradient `#0a0630` → `#2a0f6e` → `#12063a` | screen background, page backdrops |
| `panel` | fill `#1a0b45` at 93 %, outline `#b03cff` 2 px | panels, buttons, bars |
| `active` | fill `#3a1170`, outline `#ff5ce1` 3 px + soft outer glow | selected tab, selected item, hover colour |
| `row` | fill `#0c0a1e`, outline `#4a3c80` | list rows, slots, locked cards |
| `blue` | fill `#0b1d4a`, outline `#3c8bff` | secondary actions (refresh, ad timer) |
| `green` | fill `#0f3a24`, outline `#3cff8f` | buy buttons, owned cards, check |
| `gold` | fill `#3b2a00`, outline / text `#ffcc00` | ad (rewarded) buttons, BONUS, New Best, Most Popular |
| `badge` | `#e8202a`, 2 px white ring, white number | notification badges |
| `magenta` | `#ff4fd8` | "High Score" label |
| `gem` / `ruby` | `#4fd8ff` / `#ff3b4f` | currency icons |
| `shade` | `#000000` at 65 %, full screen | behind every popup |
| `text` | `#ffffff`; secondary `#c9c6e8` | all text |
| Fonts | titles, buttons, tabs: `nulshock bd SDF` (upper case); numbers, body: `Downlink SDF` | existing TMP fonts |
| Sizes (design) | caption 15, body 16–18, button 18–22, title 24–30, display 40–46 | per element in §7 |
| Shapes | chamfered rectangle (corner = min(16, h/3)); flat-top hexagon (top edge 56 % of width); pill bar (pointed ends); 5-point star for ranks | |
| Close | hexagon 52–60 wide with `S_Icon_Cross` | every ✕ |

## 7. Screen specs

Coordinates are design units of the 1280×720 canvas, top-left origin: x, y = top-left corner, w × h = size. Anchor
`canvas` = follows the centred canvas; `top-left` / `top-right` / `bottom` = follows that viewport edge (§3.2). Font =
design size of the element's main text. Rows marked *state* are shown only when that state applies (they share space
with other rows). Elements of the top bar and tab bar on menu pages (Shop, Garage, Levels, World Stats) keep the
Home numbers of 03. The element list of each screen is closed: build exactly these, no more.

<!-- BEGIN SCREEN SPECS (generated by docs/ui/final/build.mjs) -->

### 03 Home

Image: `docs/ui/final/03-home.png` (the user's reference image).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `h.scene` | Neon mountain backdrop | `menu showroom (new, §2.1-4)` | canvas | 0 | 0 | 1280 | 720 |  | added on request |
| `h.podium` | Vehicle podium | `menu showroom (new, §2.1-4)` | canvas | 314 | 400 | 658 | 136 |  | added on request |
| `h.vehicle` | 3D vehicle | `menu camera view `menu`` | canvas | 505 | 286 | 290 | 160 |  |  |
| `h.gem` | Gem bar | `TopBar/Right/SoftCurencyBar` | top-right | 1088 | 66 | 160 | 40 | 17 |  |
| `h.ruby` | Ruby bar | `TopBar/Right/HardCurrencyBar` | top-right | 1088 | 20 | 160 | 40 | 17 |  |
| `h.navL` | World arrow left | `Home Screen/WorldNav/Left` | left | 14 | 528 | 70 | 54 | 30 |  |
| `h.world` | Next-rank star (opens Reward Track) | `TopContainer/WorldStatsButton` | canvas | 815 | 11 | 64 | 60 | 20 |  |
| `h.navR` | World arrow right | `Home Screen/WorldNav/Right` | right | 1196 | 528 | 70 | 54 | 30 |  |
| `h.rank` | Rank star | `StarRankBar-OpenRewardTrack/Icon` | canvas | 402 | 11 | 64 | 60 | 20 |  |
| `h.starbar` | Star bar (opens World Stats) | `StarRankBar-OpenRewardTrack/FillbarBackground` | canvas | 473 | 25 | 335 | 34 | 16 |  |
| `h.bonus` | BONUS button (letter pips) | `BottomContainer/ClaimBonusButton` | canvas | 578 | 156 | 124 | 26 | 22 |  |
| `h.settings` | Settings button | `TopContainer/SettingsButton` | top-left | 26 | 21 | 62 | 56 | 30 |  |
| `h.hsLabel` | High Score label | `ScoreDisplay/High Score Text` | canvas | 530 | 66 | 220 | 24 | 18 |  |
| `h.hsNum` | High score value | `ScoreDisplay/High Score Number` | canvas | 540 | 86 | 200 | 54 | 44 |  |
| `h.hsNew` | New best sticker | `ScoreDisplay/NewSticker` | canvas | 730 | 100 | 50 | 26 |  |  |
| `h.lb` | Leaderboard button (crown) | `LeaderboardButton (src/portal.js)` | top-left | 26 | 163 | 62 | 56 | 24 |  |
| `h.tooltip` | Unlock tooltip | `Tooltip Popup` | canvas | 470 | 540 | 340 | 34 |  | state (shown only when it applies) |
| `h.chpop` | Challenge progress popup | `BottomContainer/ChallengePopUps` | top-right | 868 | 112 | 380 | 50 |  | state (shown only when it applies) |
| `t.shop` | Tab Shop | `Bottom Menu Button - Store` | bottom | 249 | 607 | 268 | 94 | 20 |  |
| `t.veh` | Tab Vehicles (Garage) | `Bottom Menu Button - Meta` | bottom | 766 | 607 | 268 | 94 | 20 | added on request |
| `t.world` | Tab World (= Play on Home) | `Bottom Menu Button - Endless + PlayButton` | bottom | 514 | 602 | 255 | 100 | 20 | added on request |
| `t.chal` | Tab Challenges | `BottomContainer/ChallengeButton` | top-left | 26 | 92 | 62 | 56 | 20 |  |
| `t.lvl` | Tab Levels | `BottomContainer/LevelsButton` | top-left | 26 | 234 | 62 | 56 | 20 |  |
| `b.shop` | Badge Shop | `Store/GameNotificationWithText` | bottom | 492 | 598 | 22 | 22 |  |  |
| `b.veh` | Badge Vehicles | `Meta/GameNotificationWithText` | bottom | 982 | 598 | 22 | 22 |  |  |
| `b.chal` | Badge Challenges | `ChallengeButton/GameNotificationWithText` | top-left | 66 | 86 | 22 | 22 |  |  |
| `b.lvl` | Badge Levels | `LevelsButton/GameNotificationWithText` | top-left | 66 | 228 | 22 | 22 |  |  |

### 02 Transition

Image: `docs/ui/final/02-transition.png` (concept B).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `tr.bg` | Black cover | `Transition Screen/Background` | canvas | 0 | 0 | 1280 | 720 |  |  |
| `tr.navL` | World arrow left | `WorldNav/Left` | left | 14 | 528 | 70 | 54 | 30 |  |
| `tr.world` | World indicator (hexagon) | `WorldTransitionIndicator` | canvas | 816 | 22 | 44 | 40 | 26 |  |
| `tr.navR` | World arrow right | `WorldNav/Right` | right | 1196 | 528 | 70 | 54 | 30 |  |
| `tr.lock` | Star requirement (locked world) | `LockedFade/Star Requirement Indicator - Large` | canvas | 545 | 300 | 190 | 70 |  | state (shown only when it applies) |
| `tr.soon` | Coming Soon | `LockedFade/ComingSoon` | canvas | 520 | 385 | 240 | 34 |  | state (shown only when it applies) |

### 04 Challenges

Image: `docs/ui/final/04-challenges.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `c.title` | Title | `ChallengeOverlay/ChallengesText` | canvas | 330 | 142 | 620 | 40 | 26 |  |
| `c.done` | Completed count | `CompletedText` | canvas | 330 | 182 | 620 | 26 | 17 |  |
| `c.close` | Close | `ChallengeOverlay/CloseButton` | canvas | 914 | 114 | 58 | 50 | 22 |  |
| `c.hard` | Hard challenge icon | `HardChallenge Icon` | canvas | 796 | 241 | 32 | 32 | 16 | marks a hard challenge (its reward is the 3-star cluster); display only |
| `c.text` | Challenge text | `ChallengeDisplay/ChallengeText` | canvas | 380 | 232 | 410 | 28 | 17 | one line, shrinks to 15 |
| `c.fill` | Progress bar | `ChallengeDisplay/FillBarMask` | canvas | 380 | 270 | 410 | 8 |  | plain bar (`barTrack` / `barFill`) |
| `c.check` | Completed check | `ChallengeCompleted/Checkmark` | canvas | 832 | 240 | 34 | 34 | 16 | `badge_claimed` disc |
| `c.reward` | Reward | `ChallengeDisplay/RewardContainer` | canvas | 870 | 233 | 44 | 48 | 18 | no frame; each reward's opaque picture fitted |
| `c.skip` | Skip challenge button | `SkipChallengeButton` | canvas | 868 | 238 | 44 | 38 | 16 | hidden in landscape (owner's request) |
| `c.timed` | Cooldown slot (Next Challenge in + timer) | `Completed Timed State` | canvas | 360 | 304 | 560 | 70 |  | state (shown only when it applies) |
| `c.reset` | Reset timer button | `ResetTimerButton` | canvas | 866 | 320 | 44 | 38 | 16 |  |
| `c.locked` | Locked slot | `Locked State` | canvas | 360 | 386 | 560 | 70 |  | state (shown only when it applies) |
| `c.allDone` | All challenges completed | `Completed World State` | canvas | 360 | 472 | 560 | 60 |  | state (shown only when it applies) |

### 04b Challenges — skip popup

Image: `docs/ui/final/04b-challenge-skip.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `cr.title` | Title | `ChallengeResetPopup/Header` | canvas | 440 | 244 | 400 | 36 | 22 |  |
| `cr.info` | Question | `info` | canvas | 440 | 282 | 400 | 28 | 17 |  |
| `cr.close` | Close | `X Button` | canvas | 806 | 212 | 52 | 46 | 20 |  |
| `cr.ad` | Ad button (+ timer) | `AdButton` | canvas | 470 | 384 | 160 | 56 | 17 |  |
| `cr.ruby` | Ruby button (+ price) | `HardCurrencyButton` | canvas | 650 | 384 | 160 | 56 | 18 |  |

### 05 Levels

Image: `docs/ui/final/05-levels.png` (concept A2).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `l.bg` | World background | `Background/World Background Image` | canvas | 150 | 124 | 980 | 380 |  |  |
| `l.title` | Difficulty page title | `Levels - Easy/Top Banner` | canvas | 280 | 140 | 720 | 50 | 28 |  |
| `l.close` | Close | `Timed Level Close/CloseButton` | canvas | 1102 | 100 | 56 | 48 | 20 | on the panel's top-right corner |
| `l.item` | Level entry (8 per page) | `Level - List Element` | canvas | 240 | 205 | 380 | 56 |  |  |
| `l.locked` | Locked page indicator | `LockedFade/Star Requirement Indicator - Large` | canvas | 490 | 309 | 300 | 46 | 24 | state (shown only when it applies); "Needs ★ n" as plain text, the rows hidden |
| `l.arrowL` | Previous page | `ArrowLeft` | canvas | 166 | 306 | 60 | 52 | 28 | left side, centred on the rows |
| `l.total` | Total stars | `TotalStarsBar` | canvas | 860 | 142 | 180 | 46 | 17 | text only |
| `l.arrowR` | Next page | `ArrowRight` | canvas | 1054 | 306 | 60 | 52 | 28 | right side, centred on the rows |
| `l.dots` | Page dots | new (`UI2 Page Dots`) | canvas | 590 | 476 | 100 | 12 |  | one 12 px dot per page, 24 apart, the page shown lit (owner's request) |
| `l.badge` | New page badge | `ArrowRight/GameNotification` | canvas | 1096 | 296 | 26 | 26 |  |  |

### 06 World Stats

Image: `docs/ui/final/06-world-stats.png` (concept A2).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `s.bg` | World background | `Background/World Background Image` | canvas | 240 | 124 | 800 | 466 |  |  |
| `s.title` | Title | `World Banner/ProgressText` | canvas | 240 | 132 | 800 | 40 | 28 |  |
| `s.fill` | World progress bar | `Fill Bar - Background` | canvas | 280 | 176 | 720 | 26 | 15 |  |
| `s.endless` | Endless group | `Statistics - Endless` | canvas | 280 | 214 | 720 | 124 |  |  |
| `s.levels` | Levels group | `Statistics - Levels` | canvas | 280 | 346 | 350 | 222 |  | rows spread evenly |
| `s.coll` | Collection group | `Statistics - Collection` | canvas | 650 | 346 | 350 | 222 |  | rows spread evenly |
| `s.close` | Close | `Statistics Page Close/CloseButton` | canvas | 1006 | 104 | 56 | 48 | 20 |  |

### 07 Reward Track

Image: `docs/ui/final/07-reward-track.png` (concept A2).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `r.bg` | Panel | `Container/Background` | canvas | 80 | 60 | 1120 | 600 |  |  |
| `r.title` | Title | `RewardTrack/TopBar/Text` | canvas | 440 | 78 | 400 | 44 | 30 | centred |
| `r.rank` | Current rank star | `StarCurrencyBar/Icon` | canvas | 699 | 74 | 52 | 50 | 22 | hidden in landscape (owner's request) |
| `r.fill` | Star bar | `StarCurrencyBar/FillbarBackground` | canvas | 757 | 82 | 335 | 34 | 15 | hidden in landscape (owner's request) |
| `r.next` | Next rank star | `StarCurrencyBar/Icon - Next Level` | canvas | 1098 | 74 | 52 | 50 | 22 | hidden in landscape (owner's request) |
| `r.entry` | Track entry (card) | `UI_RewardTrackEntry` | canvas | 108 | 140 | 344 | 84 |  | 3-column grid, 16 apart |
| `r.claimed` | Claimed badge | `Entry/ClaimedOverlay` | canvas | 422 | 204 | 36 | 36 |  | state; `badge_claimed` disc on the card's bottom-right corner |
| `r.lock` | Entry lock | `Entry/Lock` | canvas | 422 | 204 | 36 | 36 |  | `badge_locked` disc, same place |
| `r.close` | Close | `Overlay/CloseButton` | canvas | 1172 | 36 | 56 | 48 | 20 | on the panel corner |
| `r.scroll` | Scrollbar | new (`UI2 Scrollbar`) | canvas | 1182 | 140 | 8 | 496 |  | thumb follows the list; press / drag scrolls (hit area 32 wide) |

### 08 Garage

Image: `docs/ui/final/08-garage.png` (concept B).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `g.name` | Card name | `CardNameBar/CardName` | canvas | 40 | 120 | 560 | 40 | 30 |  |
| `g.rarity` | Rarity | `CardName/CardRarity` | canvas | 40 | 158 | 560 | 24 | 17 |  |
| `g.amount` | Copies bar | `LevelFillbar` | canvas | 220 | 186 | 200 | 28 |  | state (shown only when it applies) |
| `g.preview` | 3D preview | `VehiclePreviewCam` | canvas | 40 | 220 | 560 | 250 |  |  |
| `g.skins` | Rank / skin buttons (4) | `Ranks/Tiers` | canvas | 110 | 482 | 90 | 81 | 15 |  |
| `g.plock` | Preview lock | `Ranks/PreviewContainer` | canvas | 410 | 567 | 90 | 22 |  | state (shown only when it applies) |
| `g.tabs` | Type tabs (5) | `TabButtons` | canvas | 640 | 130 | 116 | 60 | 24 |  |
| `g.tbadge` | Tab badge | `TabButton/GameNotification` | canvas | 732 | 122 | 24 | 24 |  |  |
| `g.world` | World group header | `UI_MetaDividerBanner` | canvas | 650 | 204 | 590 | 26 | 15 |  |
| `g.card` | Card | `UI_MetaCard` | canvas | 650 | 234 | 110 | 123 | 15 |  |
| `g.clock` | Locked card | `UI_MetaCard (locked)` | canvas | 890 | 234 | 110 | 123 | 15 |  |

### 09 Shop

Image: `docs/ui/final/09-shop.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `sp.bg` | Shop background | `Shop Screen/Background` | canvas | 0 | 116 | 1280 | 470 |  |  |
| `sp.freeH` | Free Rewards header (+ timer) | `RVTrackShopSection/Header` | canvas | 30 | 124 | 210 | 104 | 16 |  |
| `sp.ad` | Watch ad button | `RV_Track_AdButton` | canvas | 252 | 132 | 80 | 72 | 26 |  |
| `sp.freeItem` | Free reward (5) | `RV_Track_Reward_*` | canvas | 344 | 128 | 110 | 70 | 15 |  |
| `sp.freeBar` | Progress segments (4) | `RV_Track_Fillbar_1..4` | canvas | 344 | 202 | 590 | 10 |  |  |
| `sp.freeTxt` | Rewarded videos explanation | `RV_Track/Explanation` | canvas | 944 | 128 | 306 | 84 | 15 |  |
| `sp.chestH` | Chests header | `LootboxShopSection/Header` | canvas | 30 | 238 | 210 | 104 | 18 |  |
| `sp.chest` | Small chest | `LootboxShopItem` | canvas | 252 | 238 | 300 | 104 | 16 |  |
| `sp.chestL` | Large chest | `LootboxShopItemLarge` | canvas | 566 | 238 | 300 | 104 | 16 |  |
| `sp.dealH` | Daily Deals header (+ timer) | `DailyDealsShopSection/Header` | canvas | 30 | 352 | 210 | 104 | 16 |  |
| `sp.deal` | Daily deal card (3) | `DailyDealsShopItem` | canvas | 252 | 352 | 290 | 104 | 15 |  |
| `sp.refresh` | Refresh deals button | `DailyDealsShopSection/RefreshButton` | canvas | 1160 | 372 | 72 | 64 | 24 |  |
| `sp.rubyH` | Rubies header | `HardCurrencyShopSection/Header` | canvas | 30 | 466 | 210 | 104 | 18 |  |
| `sp.gift` | Ruby gift (ad) | `HardCurrencyShopGiftItem` | canvas | 252 | 466 | 300 | 104 | 16 |  |
| `sp.rubyItem` | Ruby pack (real money, Not Available) | `HardCurrencyShopItem` | canvas | 566 | 466 | 300 | 104 | 15 |  |

### 09b Shop — confirmation / refresh popups

Image: `docs/ui/final/09b-shop-confirm.png` (concept C).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `sc.icon` | Item picture | `Item icon / UI_MetaCard` | canvas | 60 | 470 | 200 | 200 | 60 |  |
| `sc.title` | Item title | `ShopConfirmation/Title` | canvas | 290 | 470 | 400 | 44 | 30 |  |
| `sc.rarity` | Rarity | `Rarity` | canvas | 290 | 514 | 400 | 24 | 16 |  |
| `sc.info` | Contents (Contains:) | `Info Container` | canvas | 290 | 556 | 360 | 48 | 17 |  |
| `sc.buy` | Buy button | `BuyButton` | canvas | 900 | 540 | 260 | 70 | 24 |  |
| `sc.close` | Close | `CloseButton` | canvas | 1190 | 450 | 64 | 56 | 22 |  |
| `sr.title` | Refresh popup title | `DailyDealShopRefreshPopUp/Header` | canvas | 430 | 140 | 420 | 34 | 18 |  |
| `sr.count` | Refresh count | `RefreshCount` | canvas | 430 | 174 | 420 | 24 | 16 |  |
| `sr.info` | Question | `info` | canvas | 430 | 200 | 420 | 24 | 15 |  |
| `sr.ad` | Ad button | `Answers/AdButton` | canvas | 550 | 276 | 180 | 50 | 22 |  |

### 10 Settings

Image: `docs/ui/final/10-settings.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `st.title` | Title | `PausePopup/Header` | canvas | 440 | 222 | 400 | 44 | 28 |  |
| `st.music` | Music toggle | `MusicToggle` | canvas | 484 | 286 | 86 | 77 | 30 |  |
| `st.sfx` | Sound toggle | `SfxToggle` | canvas | 592 | 286 | 86 | 77 | 30 |  |
| `st.bloom` | Bloom toggle | `BloomToggle` | canvas | 700 | 286 | 86 | 77 | 30 |  |
| `st.cpr` | Version + copyright | `PausePopup/cpr` | canvas | 440 | 390 | 400 | 60 | 15 |  |
| `st.close` | Close | `CloseButton` | canvas | 806 | 190 | 56 | 48 | 20 |  |

### 11 Leaderboard

Image: `docs/ui/final/11-leaderboard.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `lb.title` | Title | `src/ui2/leaderboard.js` | canvas | 340 | 120 | 600 | 44 | 26 |  |
| `lb.close` | Close | `src/ui2/leaderboard.js` | canvas | 906 | 92 | 56 | 48 | 20 |  |
| `lb.tabs` | Period tabs (4) | `src/ui2/leaderboard.js` | canvas | 360 | 170 | 134 | 40 | 15 |  |
| `lb.row` | Rank row | `src/ui2/leaderboard.js` | canvas | 360 | 222 | 560 | 40 | 15 |  |
| `lb.note` | Status line (loading / error + retry / empty) | `src/ui2/leaderboard.js` | canvas | 360 | 488 | 270 | 40 |  | state (shown only when it applies) |
| `lb.more` | More | `src/ui2/leaderboard.js` | canvas | 650 | 488 | 270 | 40 | 15 |  |
| `lb.me` | Player's row | `src/ui2/leaderboard.js` | canvas | 360 | 540 | 400 | 52 | 15 |  |
| `lb.edit` | Name & flag button | `src/ui2/leaderboard.js` | canvas | 770 | 540 | 150 | 52 | 15 |  |

### 11b Leaderboard — Name & flag

Image: `docs/ui/final/11b-leaderboard-profile.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `lf.title` | Title | `src/ui2/leaderboard.js` | canvas | 370 | 176 | 480 | 44 | 24 |  |
| `lf.name` | Name input + rule | `src/ui2/leaderboard.js` | canvas | 370 | 232 | 540 | 76 | 15 |  |
| `lf.flag` | Flag select | `src/ui2/leaderboard.js` | canvas | 370 | 320 | 540 | 52 | 15 |  |
| `lf.err` | Save error | `src/ui2/leaderboard.js` | canvas | 370 | 384 | 540 | 34 |  | state (shown only when it applies) |
| `lf.cancel` | Cancel | `src/ui2/leaderboard.js` | canvas | 610 | 432 | 140 | 48 | 15 |  |
| `lf.save` | Save | `src/ui2/leaderboard.js` | canvas | 760 | 432 | 150 | 48 | 15 |  |
| `lf.close` | Close | `src/ui2/leaderboard.js` | canvas | 906 | 142 | 56 | 48 | 20 |  |

### 12 Rank Up

Image: `docs/ui/final/12-rank-up.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `ru.bg` | Background | `Container/Background` | canvas | 0 | 0 | 1280 | 720 |  |  |
| `ru.title` | Title | `RankBox/RankUp` | canvas | 440 | 100 | 400 | 56 | 40 | stays on (portrait fades it out) |
| `ru.star` | Rank star (large) | `LevelBaseStar` | canvas | 555 | 164 | 170 | 160 | 44 |  |
| `ru.reward` | Rank rewards | `RewardBox (RankUpReward_*)` | canvas | 368 | 344 | 260 | 130 | 16 | side by side, gap 24, centred on x 640; panel-framed card |
| `ru.rv` | Double reward (ad) button | `DoubleReward RV/Button` | canvas | 530 | 498 | 220 | 56 | 20 | state: only once the rewards are shown and one of them is gems |
| `ru.tap` | Click to continue | `TapToContinue` | canvas | 440 | 576 | 400 | 30 | 18 | y 511 (the offer's place) when the rank gives no gems |

### 13 Claim Bonus

Image: `docs/ui/final/13-claim-bonus.png` (concept A+B).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `cb.title` | Title | `ClaimTitleText` | canvas | 460 | 142 | 360 | 40 | 20 |  |
| `cb.icon` | Gems picture | `GemsIcons` | canvas | 560 | 190 | 160 | 140 | 40 |  |
| `cb.amount` | Gems amount | `GemsText` | canvas | 460 | 336 | 360 | 34 | 20 |  |
| `cb.rv` | x2 Gems (ad) button | `RVButton` | canvas | 490 | 384 | 300 | 54 | 18 |  |
| `cb.claim` | Claim button | `ClaimButton` | canvas | 490 | 452 | 300 | 54 | 18 |  |

### 14 Lootbox — chest

Image: `docs/ui/final/14-lootbox.png` (concept C).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `lx.bg` | Background | `LootboxOpenAnimation/Background` | canvas | 0 | 0 | 1280 | 720 |  |  |
| `lx.chest` | 3D chest | `RenderTextureLootbox` | canvas | 470 | 140 | 340 | 320 |  |  |
| `lx.left` | Cards left badge | `CardsLeft` | canvas | 790 | 130 | 56 | 56 |  |  |
| `lx.tap` | Click to Open | `LootboxVisuals` | canvas | 490 | 652 | 300 | 50 | 22 | under the chest |

### 14b Lootbox — cards / summary

Image: `docs/ui/final/14b-lootbox-cards.png` (concept C).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `lx.overview` | Summary grid | `LootboxCollectionOverview/CollectionGrid` | canvas | 230 | 60 | 820 | 520 |  | centred |
| `lx.card` | Revealed card | `CardBase` | canvas | 900 | 60 | 340 | 520 | 17 |  |
| `lx.lose` | Lose it button | `BottomButtons_LootboxRV/LoseButton` | canvas | 300 | 620 | 220 | 60 | 18 |  |
| `lx.rv` | Extra cards (ad) button | `BottomButtons_LootboxRV/RVButton` | canvas | 540 | 620 | 220 | 60 | 22 |  |
| `lx.claim` | Claim button | `BottomButtons/ClaimButton` | canvas | 530 | 620 | 220 | 60 | 20 | centred |

### 15 HUD

Image: `docs/ui/final/15-hud.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `hd.gem` | Run gems | `HUD TopContainer/SoftCurencyBar` | top-left | 20 | 18 | 150 | 34 | 20 |  |
| `hd.best` | New Best! label | `Score Display (new best)` | canvas | 585 | 14 | 110 | 22 | 15 |  |
| `hd.chstatus` | In-run challenge status | `ChallengePopupContainer/ChallengeStatus Popup` | bottom | 240 | 644 | 800 | 36 | 22 | text only, centred (no frame, icon or bar); keeps its status colour |
| `hd.score` | Score | `Score Display - Gameplay` | canvas | 540 | 36 | 200 | 56 | 46 |  |
| `hd.timer` | Level timer (Level) | `Level Timer` | canvas | 400 | 92 | 480 | 75 |  | state (shown only when it applies) |
| `hd.name` | Level name (Level) | `TimedLevelNameDisplay` | canvas | 520 | 130 | 240 | 26 |  | state (shown only when it applies) |
| `hd.bonus` | BONUS letters | `BonusLetterBar` | canvas | 530 | 166 | 220 | 36 | 18 |  |
| `hd.restart` | Restart (Level) | `RestartButton` | top-right | 1144 | 14 | 58 | 52 | 24 |  |
| `hd.pause` | Pause | `PauseButton` | top-right | 1208 | 14 | 58 | 52 | 24 |  |
| `hd.compliment` | Compliments | `Compliment Spawn` | canvas | 440 | 230 | 400 | 50 | 32 |  |
| `hd.chpop` | In-run challenge popup | `ChallengePopupContainer` | canvas | 400 | 640 | 480 | 60 | 16 |  |
| `hd.jump` | Jump score text | `Jump Score Text Origin` | canvas | 380 | 320 | 80 | 30 |  | state (shown only when it applies) |
| `hd.marker` | Track markers (world space) | `PositionalMarker` | canvas | 820 | 300 | 150 | 120 |  | state (shown only when it applies) |

### 16 Pause

Image: `docs/ui/final/16-pause.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `p.title` | Title | `PausePopup/Header` | canvas | 440 | 152 | 400 | 44 | 30 |  |
| `p.home` | Home button | `MenuButton` | canvas | 470 | 214 | 76 | 68 | 25 |  |
| `p.music` | Music toggle | `MusicToggle` | canvas | 556 | 214 | 76 | 68 | 25 |  |
| `p.sfx` | Sound toggle | `SfxToggle` | canvas | 642 | 214 | 76 | 68 | 25 |  |
| `p.bloom` | Bloom toggle | `BloomToggle` | canvas | 728 | 214 | 76 | 68 | 25 |  |
| `p.resume` | Resume | `ResumeButton` | canvas | 530 | 330 | 220 | 60 | 20 |  |
| `p.ch` | Running challenges (3, read-only) | `ChallengesContainer (ReadOnly)` | canvas | 440 | 428 | 400 | 56 | 16 | hidden in landscape (owner's request) |

### 17 Tutorial

Image: `docs/ui/final/17-tutorial.png` (concept C).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `tu.block` | Input blocker | `InteractionBlocker` | canvas | 0 | 0 | 1280 | 720 |  | state (shown only when it applies) |
| `tu.focus` | Focus highlight | `TutorialFocus` | canvas | 240 | 330 | 200 | 140 |  | state (shown only when it applies); its darkening fills the whole window |
| `tu.hand` | Hand (press / move) | `TutorialHand Press / Moving` | canvas | 330 | 420 | 80 | 90 |  |  |
| `tu.text` | Instruction text | `TutorialText/Text` | canvas | 290 | 570 | 700 | 60 | 32 |  |
| `tu.tap` | Click to Continue | `TutorialText/TapToContinue` | canvas | 290 | 632 | 700 | 30 | 15 |  |
| `tu.image` | Picture | `TutorialImage` | canvas | 490 | 380 | 300 | 160 |  | state (shown only when it applies) |

### 18 Revive

Image: `docs/ui/final/18-revive.png` (concept A).

| id | Element | Original object | Anchor | x | y | w | h | Font | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `rv.rubybar` | Ruby bar | `HardCurrencyBar` | top-right | 1060 | 16 | 200 | 34 | 16 |  |
| `rv.skip` | Close / skip | `Skip Button` | canvas | 760 | 112 | 52 | 46 | 20 |  |
| `rv.timer` | Countdown heart | `Revive Timer` | canvas | 580 | 146 | 120 | 100 | 30 |  |
| `rv.title` | Title | `Revive Test (TMP)` | canvas | 490 | 252 | 300 | 44 | 30 |  |
| `rv.ad` | Continue (ad) button | `Ad Button` | canvas | 520 | 310 | 240 | 60 | 18 |  |
| `rv.ruby` | Ruby button (+ price) | `HardCurrency Button` | canvas | 560 | 384 | 160 | 50 | 18 |  |
| `rv.trigger` | Revive reason box | `TriggerBox` | canvas | 390 | 490 | 500 | 60 |  | not shown in landscape |

<!-- END SCREEN SPECS -->

## 8. Binding table

The new layout re-uses the original objects, so most elements bind to themselves: same component, same reads and
writes as today. Listed: every interactive element and every element whose source changes.

| id | Object / component | Reads | On press / writes |
|---|---|---|---|
| `h.gem`, `h.ruby` | `TopBar/Right/SoftCurencyBar`, `HardCurrencyBar` (`UI_Currency`) | `Currencies.Soft` / `Hard` | their buttons as today |
| `h.navL`, `h.navR` | `Home Screen/WorldNav/Left`, `Right` (`UI_WorldNavButtons`) | `WorldManager` | `ButtonWorldChange(±1)` |
| `h.world` | `TopContainer/WorldStatsButton` (`UI_WorldStatsButton`) | next rank | the Reward Track → 07 (as the rank star); the star bar: `ToggleWorldStatsOpen()` → 06 |
| `h.hsLabel`, `h.hsNum`, `h.hsNew` | `ScoreDisplay` (`EndlessHighScoresDisplay`) | high score | — |
| `h.lb` | `LeaderboardButton` of `src/portal.js` | Home page shown (landscape; portrait: ScoreDisplay `CanvasGroup` alpha) | `openBoard()` → 11 |
| `h.rank`, `h.starbar` | `StarRankBar-OpenRewardTrack` (`UI_PlayerRank`, `UI_OpenRewardTrack`) | `PlayerRank` | `OpenTrack()` → 07 |
| `h.bonus` | `BottomContainer/ClaimBonusButton` (`UI_MainMenuBonusButton`) | `Bonus` letters, cooldown | `OnBonusButtonClicked()` → 13 |
| `h.settings` | `TopContainer/SettingsButton` | — | opens `UI Container/Settings` → 10 |
| `t.shop`, `t.veh` | `Bottom Menu Button - Store`, `- Meta` (`MenuButtonState`) | lock rank, current page | `MainMenuManager.DoMenuSwitch` → 09 / 08 |
| `t.world` | `Bottom Menu Button - Endless` (`MenuButtonState`) + `PlayButton` laid on top while Home is current | current page | other page → Home; on Home → `PlayButton.onClick` (`HomeScreenManager.OnPlay`) |
| `t.chal` | `BottomContainer/ChallengeButton` (`UI_ChallengesButton`) | claimable count | `ToggleChallengeView()` → 04 |
| `t.lvl` | `BottomContainer/LevelsButton` (`UI_LevelsButton`) | unseen levels | `ToggleOverlay()` → 05 |
| `b.*` | `GameNotificationWithText` of each button (`UI_GameNotification`) | ping counts | — |
| `h.vehicle`, `h.podium`, `h.scene` | menu camera `menu` view + `src/ui2/showroom.js` | selected vehicle | — |
| `c.*` | `ChallengeOverlay` (`UI_ChallengeOverlay`, `UI_ChallengeSlotVisualsMainMenu`) | `ChallengeManager` | claim / skip / reset as today; ✕ `TryClose()` |
| `cr.*` | `ChallengeResetPopup` (`UI_ChallengeResetPopup`) | cost, timer | `OnBuyAd()`, `OnBuyCurrency()`, `OnPressedQuit()` |
| `l.*` | `Timed Level Overlay` (`UI_TimedLevelMenu`, `ScrollSnapRect`, `UI_TimedLevelMode`) | `TimedLevelModeController` | level `OnClick()`, arrows `PreviousScreen()` / `NextScreen()`, ✕ `TryClose()` |
| `s.*` | `WorldStatsScreen` (`UI_WorldStatsMenu`, `UI_WorldSelectStat`) | world stats | ✕ `TryClose()` |
| `r.*` | `PopUps/RewardTrack` (`UI_RewardTrack`, `UI_RewardTrackEntry`) | `PlayerRank`, track | ✕ `Close()` |
| `g.*` | `Meta Screen` (`UI_MetaScreen`, `UI_InspectCard`, `UI_MetaTabButton`, `UI_MetaCard`) | `CardService` | tabs / cards / skins as today |
| `sp.*` | `Shop Screen` sections (`UI_RVRewardTrack`, `LootboxShopItem`, `DailyDealShopItem`, `HardCurrencyShopGiftItem`, `HardCurrencyShopItem`) | `Shop` | as today (ads through `src/ads.js`) |
| `sc.*`, `sr.*` | `ShopConfirmation - Chest *`, `DailyDealsShopConfirmation`, `DailyDealShopRefreshPopUp` | item | buy / ad / ✕ as today |
| `st.*` | `UI Container/Settings` (`UI_PauseMenu`, `UI_MusicToggle`, `UI_SfxToggle`, `UI_BloomToggle`) | `Save.data.settings` | toggles `OnClicked()`; ✕ `OnPressedResume()`; `cpr` = `footerText()` |
| `lb.*`, `lf.*` | `src/ui2/leaderboard.js` (DOM) | `board.top`, `board.me`, `board.player` | tabs reload, More pages, `board.setPlayer`, ✕ / Esc close |
| `ru.*` | `RankupPopup` (`PlayerRankUpPopupUI`) | new rank, rewards | tap = `ContinuePressed()`; x2 button as today |
| `cb.*` | `ClaimBonusOverlay` prefab (`UI_ClaimBonusOverlay`) | `Bonus.settings` | `claimBtn` → `OnClaim()`, `rvBtn` → `OnRv()` |
| `lx.*` | `LootboxOpenAnimation` (`UI_LootboxOpenAnimation`, `UI_LootboxCollectionOverview`) | opening result | `ScreenButton`, Claim, Lose it, RV as today |
| `hd.*` | HUD scene (`GameplayScoreDisplay`, `UILevelTimer`, `TimedLevelNameDisplay`, `UI_BonusLetterCurrency`, `ComplimentSpawner`, `UI_ChallengeRunPopupHandler`) | run state | pause `PauseButton`, restart `RestartButton` as today |
| `p.*` | `HUD/UI Container/Pause` (`UI_PauseMenu`) | settings, challenges | Home `OnPressedHome()`, Resume `OnPressedResume()`, toggles |
| `tu.*` | `TutorialUtility/TutorialCanvas` | tutorial steps | as today |
| `rv.*` | `Revive Screen` (`UI_Revive`) | qualification, timer, cost | `OnAcceptAd()`, `OnAcceptHardCurrency()`, `OnReject()` |
| `tr.*` | `Transition Screen` (`TransitionScreen`, `UI_WorldTransitionIndicator`, `UI_WorldNavButtons`) | world | arrows as today |

## 9. String table

Copy verbatim. Source "I2" = term of `public/assets/meta.json` `loc` (what the game shows); "scene" = `m_text` of the
object; "kit" = English fallback of `src/sdk/leaderboard/ui.js`. `{[0]}` / `{n}` are filled at run time as today.

| Where | Text | Source |
|---|---|---|
| Home | High Score · New Best! · Bonus · Needs Star Rank {[0]} to unlock | I2 `UI/MainMenu/BestScore`, `NewBest`, `Bonus`, `UI/Unlock/FeatureUnlock` |
| Home tabs | Shop · Vehicles · World · Challenges · Levels | I2 `UI/Navigation/Shop`; scene `TabTitle` "Vehicles" (added on request); I2 `UI/WorldSelect/WorldTerm`; scene `ChallengesText`, `LevelsText` |
| World badge | World · {n} | I2 `UI/WorldSelect/WorldTerm` |
| Transition | World · Coming Soon | I2 `UI/WorldSelect/WorldTerm`, `UI/Unlock/ComingSoon` |
| Challenges | World {[0]} Challenges · Completed {[0]} · Next Challenge in · Needs {n} stars to unlock · You've completed all World Challenges! | I2 `UI/MainMenu/ChallengeText`, `ChallengesCompleted`, `NextChallengeIn`; scene `Locked State/Text`, `Completed World State/Text` |
| Challenge skip | Timed Challenge ???? · Are you sure? | scene `ChallengeResetPopup/Header`, `info` |
| Levels | Easy Levels · Moderate Levels · Difficult Levels · Easy {[0]} … · Total · Requires {[0]} | I2 `UI/Levels/*` |
| World Stats | Progress · Endless · World Challenges · High Score · Levels · Easy · Moderate · Difficult · Collection | I2 `UI/WorldSelect/*`, `UI/MainMenu/BestScore`, `UI/Levels/*`, `UI/Navigation/Collection` |
| Reward Track | Star rank · Next Reward · Claimed · reward names / descriptions | scene `TopBar/Text`, entry texts; reward names from `meta.json` as today |
| Garage | card names, rarities · Unlocks in World {[0]} · Preview | `meta.json` cards; I2 `UI/Meta/UnlocksInWorld`, `UI/Meta/UnlocksAtLevel` |
| Shop | Free Rewards · Refresh in {[0]} · Watch {[0]} Rewarded Videos for the Next Reward · Chests · next free in: · Most Popular · Daily Deals · New deals in {[0]} · No Daily Deals Available · Rubies · Get {[0]} Rubies! · Come back later for more gifts · Purchased | I2 `UI/Shop/*` |
| Shop popups | Contains: · Daily deals refresh · x/3 · Are you sure? | scene `Info Container/Text`; I2 `UI/Shop/DailyDeals/Refresh/Header`; scene `RefreshCount`, `info` |
| Settings | Settings · V&lt;version&gt; + copyright line | I2 `UI/Pause/Settings`; `footerText()` |
| Leaderboard | Leaderboard · Today · This week · This month · All time · Loading… · Could not load the leaderboard. · Try again · No scores yet. Be the first! · You · No score yet · More · Name & flag · Name · Up to 20 letters, numbers, _ or - · Flag · Save · Cancel · Could not save. Check the name and try again. · Close | kit (`t('leaderboard.*')` first) |
| Rank Up | Rank Up! · Click to continue | I2 `UI/PlayerRank/RankUpTitle`; scene `TapToContinue` |
| Claim Bonus | Claim Bonus Reward · +{[0]} Gems · Claim · x{[0]} Gems | I2 `UI/MainMenu/ClaimBonusReward`, `+Gems`, `UI/Claim`, `xGems` |
| Lootbox | Click to Open · Lose it · Upgraded! · Quality Increased · Bonus Reward | I2 `UI/Shop/Lootbox/TapToOpen`; scene `LoseText`, CardBase texts |
| HUD | New Best! · compliments ("Double Flip!", "Perfect" …) · HIGHSCORE / PREVIOUS / DAILY AVERAGE | I2 / scene as today |
| Pause | Paused · Resume | I2 `UI/Pause/PauseTitle`, `Resume` |
| Tutorial | tutorial texts as today · Click to Continue | scene / I2 as today |
| Revive | Revive? · Continue · Almost new high score! · Challenge almost complete! · Bonus letter nearby! · Score milestone almost reached! | I2 `UI/Revive/*`, `UI/Continue` |

## 10. Acceptance checklist

- [ ] Every screen of §1 matches its §7 table at 1280×720 (±4 design units) and its picture in `docs/ui/final/`.
- [ ] Each screen has exactly the elements of its §7 table: nothing missing, nothing new (except §2.1).
- [ ] All buttons work as before; `tools/qa/functional.mjs`, `meta.mjs`, `portal.mjs` and `npm run check` pass.
- [ ] Home: tabs Shop / Vehicles / World / Challenges / Levels; the World tab on Home starts Endless of the current
      world; on Shop / Garage it returns to Home; Challenges / Levels open their overlays; badges update.
- [ ] Tutorials (first run, claim challenge, levels, shop, unlock world, rank popup) still point at the right buttons.
- [ ] Layout at 1280×720, 1920×1080, 1024×768 (4:3), 2560×1080 (21:9), 844×390 (phone landscape) and 390×844
      (portrait = original layout restyled): nothing cut, nothing overlapping, edge-anchored elements on the edges.
- [ ] Rotating / resizing between landscape and portrait switches the layout without reload and without errors.
- [ ] No text below design size 15 (≥ 8 px at 844×390); close buttons hit area ≥ 40 CSS px.
- [ ] Copyright line shows once (Settings), unchanged; version `V<version>` from `game.json`.
- [ ] Hover changes colour only.
- [ ] Leaderboard: periods, paging, my row, Name & flag save + error, Esc / ✕; `leaderboardOpen()` true while open.
- [ ] Home showroom: vehicle on the podium in front of the mountains on Home; Garage previews and runs unchanged.
- [ ] `tools/ui2-check.mjs` passes and leaves pictures of every screen at the sizes above in `docs/ui/verification/`.

## 11. Out of scope

- Loading screen (kit default) and `public/icons/`.
- New art: final sprites, podium / mountain textures, icons (stage 6); stage 4 uses tinted existing sprites.
- Booster, Bonus Ride mode, Bonus-mode HUD timer (no way into them in this game).
- Localisation beyond English, gameplay, SDK, ads, analytics and save changes.
- `npm run build` / packaging.

## 12. As built

No mapped rectangle differs from §7. `tools/ui2-check.mjs` verified all 22 screen states at the six target viewports
with a tolerance of ±4 design units (132 captures, 0 failures).

The owner asked for the Home screen to be compared directly with the supplied polished neon demo, so one stage-6
environment asset was pulled into this stage: `public/assets/ui_extra/ui2_home.webp`, packed as
`Sprite/UI2/HomeBackdrop`. Its prompt and source record are in `docs/ui/home-art.json`. The plate contains only the
mountains, light shafts and floor; the vehicle, podium, labels and controls remain live WebGL/uGUI elements.

The Home podium is runtime three.js geometry with emissive rings and a reflection surface. The vehicle is always the
player's selected original game model. This preserves selection and Garage/run parity, but its silhouette and detail
can differ from the green sportbike in the visual reference. Portrait keeps the original layout, restyled, as §3.2
requires.

### 12.1 Rework and stage 6 art (2026-10-28)

The stage 4 build was reviewed screen by screen against the final pictures and reworked; stage 6 art was made in the
same pass.

**Art.** `tools/ui2-art.mjs` draws the neon chrome as vector sources (`art/ui2/*.png`, 2 px per design unit) and packs
them into `public/assets/ui_extra/ui2_chrome.webp` (`Sprite/UI2/*` in `ui_extra/atlas.json`): chamfered frames and
flat-top hexagons in the six §6 kinds (panel, active, row, blue, green, gold), pill bars, the three Home tab plates
(end, side, centre; the right half mirrors the left), badge, silver-violet rank star, double chevron and the five
Home tab icons. `src/ui2/style.js` draws them as 9-sliced meshes around the original Image rect (the glow sits outside
the rect; chamfer corners follow min(16, h/3), the other shapes scale with the height). Every `S_Icon_StarRank*`
sprite shows `star_rank`. The DOM leaderboard uses the same frames as CSS border-images (`src/ui2/dom-art.js`,
generated by the same tool). Re-run `node tools/ui2-art.mjs` after changing a shape or colour.

**Deviations from §7 / §3, with the reason**

| id / screen | Spec | Built | Why |
|---|---|---|---|
| `sp.bg` (Shop) | page band 1280 × 470 | dimmed Home mountain plate, full screen | the original grey page art clashed with the neon style |
| `tr.bg`, `ru.bg`, `lx.bg` | 1280 × 720 | bleed to any aspect ratio | the sides of wide screens showed the menu behind |
| `lx.chest` (Lootbox) | 340 × 320 frame | render image stays full screen | its render target is screen sized; shrinking the image shrank the 3D chest to a dot |
| 07 Reward Track rows | ascending list | original sibling order, 82 high, 8 apart | `ScrollToRank` reads the row positions; the next reward row lights up instead of the portrait glow band |
| 07 header | 1280 × 116 band | band bleeds past the canvas sides | same look on wide screens |
| 10 / 16 / 18 buttons | — | Revive Ad / ruby buttons are chamfered (were hexagons) | §7 shapes |
| Canvas order | — | Play tab 100 < popups 104 < their close 105 < lootbox 106 < rank up 107 < tutorial 110 | the build had popups at 300, above the tutorial canvas (110), so tutorial hands and focus would be hidden under a popup; the challenge overlay also covered a queued lootbox |
| `l.total` | — | `TotalStarsBar` (authored inactive) is shown in landscape only | it is in the approved layout; portrait keeps the original state |

**Defects of the first build that were fixed:** child scaling blew up children of layout-driven parents (the Free
Rewards indicator became 5720 px wide and greyed the Shop); Shop shine sweeps, item overlays and bottom fades covered
the items; Garage tab titles overlapped the icons and card texts overlapped each other; the Levels / World Stats close
buttons were drawn under their panels; World Stats section bars were black; Reward Track rows were scattered;
Claim Bonus (a runtime prefab) was not laid out at all; Rank Up rewards were stacked on one spot; the Home showroom hid
every foreign mesh, including the lootbox chest on its render-texture layer; HUD pause / score / gem bar had no plate
and a 15-size score.

`tools/ui2-check.mjs`: 22 states × 6 viewports, 132 captures, 0 failures (full-screen backdrops are excluded from the
±4 check). QA functional / meta / portal pass (BOOT-04, RV-RESUME stay manual), `npm run check` OK.

### 12.2 Home matched to the reference (2026-10-28)

Home was compared side by side with `docs/ui/ref/home.png` and brought closer:

- Figures (currency, world number, high score, rank level, star count) use the heavy face (Nulshock Bold). The world
  number is 56 and the high score 40. Currency figures are 22 and centred, and the gem / ruby icons keep their aspect.
- The world badge uses a new `hex_neon` frame: a dark face with a hot pink rim. `panel` rims are pinker and `active`
  fills lean to magenta, as in the reference.
- Home tab icons are drawn larger (the glyph fills 112 of the 128 px canvas, frame 72 × 58), with 22-size captions.
  The settings gear is 50 × 52.
- `h.rank` is 921, 12, 76 × 72, so the star overlaps the start of the star bar. The star count sits right of the fill.
- Fixed: tab icons, captions and star requirements were framed against the centred canvas while their tab plates
  are bottom-anchored, so on 4:3 screens they floated above the bar. They now take the tab's anchor.
- Showroom: the podium is painted. Codex generated one plate per world from the brief in `docs/ui/codex-home-plate.md`:
  `art/ui2/home_plate_w1.png` (violet) and `home_plate_w2.png` (green). `node tools/ui2-plates.mjs` packs them as
  `Sprite/UI2/HomePlate1` / `HomePlate2` (one atlas page each). Home shows the plate of the world selected in the
  world navigation. The 3D podium, its mirror and the vehicle reflection were removed; the owner accepted losing the
  reflection. `Sprite/UI2/HomeBackdrop` (the plate without a podium) stays as the dimmed Shop background.
- In both plates the podium top rim is centred at (961, 685.5) of 1920 × 1080, with half-axes of 426 × 71.5 px. The
  camera (`CAM` in `src/ui2/showroom.js`, fitted numerically, 9.6° down) puts a 1.74-radius circle on the vehicle's
  footprint plane onto that rim within 0.5 px. The camera distance scales with each vehicle's
  length, so every vehicle is 44 % of the podium's diameter (the reference is 49 %; the owner found the view too close).
  The camera aims at the footprint centre, measured once per vehicle model, because the models are not centred on
  the player transform. It is square to the podium (a sideways offset tilts it).
- Wider than 16:9 the plate fits the width and the fov narrows to match. The plate and the 3D view are shifted up
  together (sky `shift` uniform and `Render.viewShift.y`), so the podium stays at 457 / 720 of the screen height, as far
  as the plate still covers the screen. Narrower than 16:9 and in portrait the plate fits the height and the same
  camera keeps the vehicle on the podium. In portrait the podium is cut off at the sides and the vehicle reads large.

- The vehicle stands on the podium from the start: the world navigation's drive-in after a transition
  (`UIStatics.vehicleMoveIn`, which slid the visual in from x −6) is skipped. The drive-out when the world changes
  (`UIStatics.vehicleMoveOut`) is skipped too (owner's request, 2026-10-29): the vehicle stays put while the screen
  fades. A locked world's default vehicle is swapped in (and the equipped one back) only while the transition screen
  covers Home (`homeCovered` in `src/ui2/showroom.js`), from the world navigated to, so the new world shows with its
  own vehicle on the first frame; going by `theme.locked`, set once the locked world showed, left the previous world's
  vehicle on the new podium for a frame. The same goes for everything Home draws for a world (owner's request: old
  world, then black, then the new one): the plate, the World 2 colours, the vehicle and the world badge follow
  `theme.world` (`displayedWorld` in `src/ui2/showroom.js`), which takes the selection only while the transition
  screen covers Home. The selection changes on the press, which swapped the plate and colours while the old world
  was still fading out. The black itself is empty (owner's screenshot): the transition screen's arrows and the unlock
  line / Coming Soon (a `CanvasGroup` on each) show only over a shown locked world (`lockedShown` in
  `src/ui2/layout.js`), not on the black before or after it.
- World 2 theme (`docs/ui/ref/home_world2.png`): the same layout with other colours. Mint-green frames, gold for the
  selected tab, the world badge and the High Score caption, mint chevrons, a silver rank star and mint icon halos. The
  `_w2` sprites come from `tools/ui2-art.mjs`. `setTheme()` in `src/ui2/style.js` follows the world shown (the world
  navigation's selection) on every UI2 screen, including the HUD of a World 2 run. The DOM leaderboard keeps the
  violet frames.
  - Everything inside the popups follows too (owner's request, 2026-10-29): the row frames (`cham_row_w2`,
    `hex_row_w2`, `pill_row_w2`, dim mint) for the Progress sections and the challenge / level rows, the progress bars
    (`barFill` / `barTrack`: mint on a dark green track), the page dots (`muted`) and the small stars (the accent,
    gold on World 2, recoloured by `setTheme`). The Shop background is World 2's Home plate, dimmed (`sp.bg`).
  - Shared by every world (owner's decision: the distinctive things stay the same): the Reward Track's banners (the
    original per-world art of the world each reward belongs to), the Vehicles page's loaded 3D world (World 1's road
    while World 2 is locked), and the colours that carry a meaning: gold for the large chest and the ad buttons, ruby
    red, gem blue, the card rarity colours, the red "Get Rubies" plate.

- Locked world: navigating to a world that is still locked keeps the transition screen up, as in the original. In
  landscape its backdrop turns clear, so the screen reads as Home with that world's plate and colours. A padlock
  (`lock` / `lock_w2` atlas sprites, on the original `LockedFade` Image) stands on the empty podium. The unlock rank
  ("REACTOR WORLD UNLOCKS AT ★ 17") and the world's description take the place of the high score, which is hidden
  while `theme.locked`. The transition's world badge and arrows match the Home ones exactly underneath. Both sets of
  arrows are updated every frame and are dimmed and inert where there is no world to go to.
- Only two worlds: `WorldManager.HighestWorldIndex` (`src/meta/worlds.js`) skips the trailing "coming soon" world, as
  the owner asked. Navigation, the Garage world sections, world stats and world-unlock rewards stop at World 2.

- Smaller environment, higher camera: Codex redrew both plates from revision 2 of the brief
  (`docs/ui/codex-home-plate.md`): `art/ui2/home_plate_w1_v2.png` and `home_plate_w2_v2.png`. `tools/ui2-plates.mjs`
  packs them. The podium rim is centred at (958.7, 670.5) with half-axes 314.7 × 67.5. The camera, fitted again,
  looks down 12.3° and matches the rim within 0.6 px. `ZOOM` is back to 1 and `DROP` to 0. The padlock is at 591, 344,
  96 × 114.
- The world arrows use new anchors, `left` / `right`: the screen edge horizontally and the centred design canvas
  vertically, so they stay beside the vehicle on 4:3 and on wide screens (`src/ui2/layout.js` and
  `tools/ui2-check.mjs`).

- Tab bar, from the owner's markup:
  - Three tabs, Shop | World | Vehicles, centred over the former middle three slots: Shop has the left arrow tip,
    World the centre plate, Vehicles the mirrored right tip.
  - The World tab reads WORLD with a globe while another page is shown. On Home it reads PLAY with a play icon
    (`icon_play`), because there it starts the run.
  - Challenges and Levels are icon-only hexagon buttons stacked under the settings button (`t.chal` 1192, 94 and
    `t.lvl` 1192, 158, both 62 × 56, anchored top-right), with their badges on the top-right corner.
  - The source is `docs/ui/final/layout.json`, and `src/ui2/rects.js` is regenerated by `tools/ui2-bindings.mjs`.

- Top bar, from the owner's wireframe (second markup):
  - Gems and rubies are two pills on one row, top-left (`h.gem` 32, 20, 150 × 40; `h.ruby` 192, 20, 124 × 40).
  - The rank star and the star bar sit centred at the top (`h.rank` 434, 11; `h.starbar` 505, 25, 335 × 34). The
    star bar's fill (`FillbarBackground/Fillbar`, a filled image) sits inside the bar (6, 5 px in) with the bar's pointed
    ends: sprite `star_fill`, a gold gradient drawn in `tools/ui2-art.mjs` at the fill's own size, because a filled
    image stretches its whole sprite. It used to stretch over the whole plate as a white square. The star count is
    right-aligned in the bar.
  - The star count is centred in the star bar.
  - Right of the star bar, mirroring the rank star (owner's markup, 2026-10-29): the star of the next rank, the one the
    bar fills towards (`h.world` 815, 11, 64 × 60, `star_rank` with `CurrentRank + 2` in `WorldNumber(TMP)`, the
    current rank at the top rank; it was a hexagon with the world number). Both stars open Star Rank (the Reward
    Track; owner's request, 2026-10-29): the rank star through `OpenRankTrackButton` (cut down to `h.rank`, it spanned
    the star and the bar), the next-rank star through a Button added on `World FillColor` that stops the click before
    `WorldStatsButton` (the badge's hidden world picture and labels no longer catch clicks). The star bar alone opens
    World Stats (Progress), through a Button added on `FillbarBackground`. There is no world number in the top bar; a
    locked world's name is in its unlock line.
  - The rank star, star bar and world badge are shifted so the star bar is centred on the screen (`h.rank` 402,
    `h.starbar` 473).
  - The world arrows sit at the screen edges, low on the floor beside the podium (`h.navL` 14, 528 anchored
    `left`; `h.navR` 1196, 528 anchored `right`); the transition screen's arrows (`tr.*`) use the same rects.
  - HIGH SCORE (18, accent colour) and its figure (44) sit right under the star bar, centred (`h.hsLabel` y 66,
    `h.hsNum` y 86). On a locked world the unlock line (y 192) and its explanation (y 246) stand above the
    podium, between the top bar and the vehicle (owner's markup, 2026-10-29; were y 70 / 124 in the high score's place), text
    only: no pill behind the unlock line (owner's request, 2026-10-29). `LockedFade/TransitionOverlay` (the
    original's black fade, stretched over `LockedFade`, which UI2 shrinks to the podium) never draws: it showed as a
    black box over the vehicle while switching to a locked world.
  - A column of hexagons, 62 × 56, 71 apart: settings, challenges, leaderboard,
    levels (`h.settings` y 21, `t.chal` y 92, `h.lb` y 163, `t.lvl` y 234). On the owner's request the leaderboard
    shows the bar-chart glyph (`icon_levels`) and the Levels button a 2 × 2 grid of rounded squares (`icon_grid`).
    The leaderboard button sits in the same container as the Challenges / Levels launchers (`BottomButtonContainer`,
    landscape only; `src/portal.js` instantiates it under the High Score display) and shows like them on Home only:
    it no longer copies the High Score display's fade, which hid it while Challenges was open (owner's request,
    2026-10-29). Its `CanvasGroup` is the layout's in landscape (`_ui2Owned`); portrait keeps the copy.
  - The Play tab's icon is a solid rounded triangle (`icon_play`), solid like the cart and the car.
  - Notification badges are 22 × 22 (were 26 to 30), their number heavy 15 and centred (`badgeNumber` in
    `src/ui2/home.js`); the same size on the other screens' badges and the BONUS claim dot.
  - The tab bar sits 16 px lower than first built (`t.shop` / `t.veh` y 607, `t.world` y 602; bottom margin 19).
  - BONUS sits centred under the high score (`h.bonus` 578, 156, canvas; owner's markup, 2026-10-29), with its claim
    dot after the word. It stays only while its reward waits: short of five letters it shows for 3 s each time the
    Home page appears (counted once Home is out from under the loader and the transition screen, and after new
    letters have animated in), and claiming hides it at once (`bonusAutoHide`, `src/ui2/home.js`). With five letters
    it stays until claimed.
  - Left out of the wireframe: the thin divider under the settings button, and the "BONUS" label inside the star bar
    (BONUS moved top-right on the owner's request). The rank keeps its star (reference art) instead of the
    wireframe's circle.

- Worlds apart (owner's request):
  - The Vehicles page lists the cards of one world only: the world shown on Home (the world navigation's selection,
    a locked world too). Vehicles, colours, trails, landings and explosions all follow it
    (`UI_MetaTabBase.SpawnCards`, `src/uiscripts/garage.js`).
  - All five collections (vehicle, colour, trail, explosion, landing) are equipped per world
    (`CardService.equippedSlot`, `src/meta/cards.js`): World 1 keeps the original save slot, a later world its own
    (`Save.data.cards.equippedByWorld`). As World 1 starts with its defaults, a world past the first starts with the
    first card of each collection (World 2: Griphon, Holo-Pixel colour, trail, explosion and landing), unlocked from
    the start (even while its world is locked: `Card.IsWorldStarter`, `CardService.GrantWorldStarters`) and equipped
    by default. A card is equipped into its own world's slot. While a locked world is browsed
    (`WorldManager.BrowsedWorldIndex`, set by `src/ui2/showroom.js`) its equipped vehicle, in its equipped colour,
    stands on the Home podium in place of a padlock and heads the garage. Switching worlds re-applies all five
    (`applyWorldCosmetics`, `src/uiscripts/garage.js`).
  - A locked world can be browsed. Its overlay (padlock, unlock pill, arrows) draws under Home's popups (canvas order
    102 < 104) and lets clicks through to Home except on its arrows. Off Home (Shop, Vehicles) the overlay and its
    arrows' canvases are switched off. Only Play is off: the Play button is not interactable and the Play tab is
    dimmed. Fades and unlocked transitions keep the screen's own order and raycasts (`src/ui2/layout.js`).
  - A world counts as locked only while the transition screen's target world is locked, its canvas is up and opaque
    (or faded out off Home by UI2): the way back to an unlocked world leaves `LockedFade` active through its fade.
  - Home's own world arrows give way to the transition screen's while a locked world is shown (the two canvases scale
    differently on wide screens, so both pairs would show apart); those are hidden off Home (`worldArrow`).
  - The world switch hides the vehicle and only an unlocked transition shows it again, so while a locked world is
    shown the vehicle is hidden on Home only and shown on the other pages; a vehicle hidden by UI2 is shown again once
    the world is left (`lockedVehicle`, `src/ui2/showroom.js`).
  - Off Home the World tab names the world it returns to ("World 1" / "World 2").
- Tab bar: icons 60 × 48 and captions sit on each tab's bottom edge, so the taller centre tab lines up with the side
  tabs.
- Vehicles page (owner's markups), from the top:
  - The vehicle's name and rarity, centred (`g.name` 340, 22; `g.rarity` 340, 60).
  - The road the vehicle stands on, crossing the screen and falling gently to the right (about 5°), the vehicle centred
    on it at design y 222. After the
    camera rig, UI2 backs the camera away (1.8 × its distance, so the road reads smaller), rolls it so the road's
    screen slope is that 5° and shifts the view onto that point (`garageView`, `src/ui2/showroom.js`).
  - The selected card's tiers / previews (`UI_MetaCardSkin_*`), centred (`g.skins` 436, 290, 96 × 62, pitch 104).
  - The collection frame, centred above the tab bar (325, 360, 630 × 226): the five tabs along its top (`g.tabs` 335,
    368), one row of cards under them (scroll view 325, 434, 630 × 150). Its "World n" divider is off: one world at a
    time.
  - The settings button and the rank star bar are hidden on the Vehicles page (owner's request), through canvas groups
    of their own.
  - Cards (110 × 123): the name band on the top edge, the count bar (or "Unlocks in World n") on the bottom edge, the
    picture centred between them. The original UI masks are rectangles, so the bands use cut-corner sprites drawn to
    the cards' 16 px chamfer (`band_*`, `tools/ui2-art.mjs`); texts shrink down to 10 to stay inside. Locked cards show only their dark overlay and "Unlocks in World n" (no padlock).
  - Pictures (cards and tier slots) are fitted by their sprite's opaque bounds (`fitPicture`, `src/ui2/layout.js`):
    vehicle sprites sit small in their canvas, effect sprites fill it. Locked cards show their picture dimmed grey
    under a lighter overlay instead of a black silhouette.
  - The collection scroll view is clamped to its content, which is as tall as the card rows (the content's
    ContentSizeFitter is off: it added the grid's 200 px bottom padding).
  - The Home Vehicles tab shows the garage's motorbike glyph (`icon_bike`, from `S_Icon_Bikes_B` with the UI2 halo).
  - Tier slots (96 × 62): one chamfered shape for the plate and its mask, the picture above the count bar, which runs along the
    slot's bottom edge (trimmed by the chamfered mask), the "Preview" label in the same place on the other slots; the selected slot shows as the lit plate (its hexagon glow border is off).

- Sides swapped (owner's markup): rubies and gems sit top-right, rubies first, anchored top-right. Since
  2026-10-29 (owner's request) they stack in two rows of the same width, gems over rubies since 2026-10-31
  (`h.gem` 1088, 20; `h.ruby` 1088, 66; both 160 × 40), and the challenge popups (`h.chpop`) moved down to y 112 under them. In each pill the figure comes first, right-aligned and shrinking from 22 to 14 to fit, and the
  icon sits at the right end inside the pill: the original gem and ruby baked with a bloom of their own colour
  (`cur_gem`, `cur_ruby`, `tools/ui2-art.mjs`);
  the settings button, BONUS and the hexagon column (challenges, leaderboard, levels) sit top-left (x 26, anchored
  top-left; BONUS under the high score). The Challenges / Levels launchers show on Home only, through a canvas
  group of their own (off Home the garage's collection frame takes the left side).

- Popup review (owner's request, `src/ui2/layout.js`, `src/ui2/style.js`):
  - `textStyle` keeps a text's own alpha; forcing it to 1 showed texts that feedbacks keep faded out (the lootbox
    "Bonus Reward" on every card). `fitChildren` sets a child's scale once only; it pinned a lootbox card at the 1.5
    of its reveal, so the summary cards overlapped.
  - Lootbox: the summary grid and Claim are centred (`lx.overview` 230, `lx.claim` 530); the original bottom fade
    spans the screen under the grid (it dims the chest, the cards stay lit); "Click to open" sits under the chest
    (`lx.tap` y 652).
  - Level timer (`hd.timer` 400, 92, 480 x 75, the original's proportions): star times and level name on one line.
  - Star Rank: a level row's world banner covers the row (cut by its mask; inset since, see below); its stopwatch sits in the picture slot;
    the empty spacer row draws nothing; the reward box sits 24 px right so the currency amount reads between the rank
    star and the picture.
  - Progress (World Stats): the sections' rows spread evenly (taller Levels and Collection groups), the title icon
    stands clear of the title.
  - Rank Up: a cosmetic reward's name and type each get a line.
  - Challenge skip opens over the Challenges popup: canvas order 108 (its close 109).

- Vehicles page, the road stays put (owner's request, `src/ui2/showroom.js`): the trail, landing and explosion tabs
  take the Vehicles tab's camera (their views keep their names) and Home <-> Vehicles and the tabs cut instead of
  blending, so the road and the camera never move. The previews still drive (trail) or drop (landing, explosion) the
  vehicle onto that road with their effects; at rest it stands centred under its name. The trail drive runs from out
  of view on the left to out of view on the right at the original's speed (`trailAcross`: the path is fitted to the
  screen width each frame, 3 units past each edge). The landing drop starts at least 3 units above the top edge
  (`landingIn`: its start pushed out along its own direction, the fall time growing by the square root). Every
  landing and explosion restarts its particle system (`src/uiscripts/garage.js`): Play() on a system still playing
  kept it as it was, so only the first drop of a preview showed its effect. The landing and explosion tabs back the
  camera away further (`VIEW_PULL_BACK` 2.6 against 1.8, owner's request) so their effects fit around the smaller
  vehicle.
- Effects that differed from the original (engine, not UI): particle Custom Data was never exported nor fed to the
  shaders, so every dissolve effect (hexagon trail, fire, laser, lootbox lightning...) showed as solid shapes that
  never dissolved. `tools/export.py` now keeps `CustomDataModule` and `m_VertexStreams` (merged into the 129 prefabs
  that use custom vertex streams, nothing else changed), and `src/engine/particles.js` packs the streams as Unity does
  and writes TEXCOORD1 into the `uv1` attribute the shaders read. Particle trails now honour `textureMode` Tile (once
  per world unit from the head, times the material tiling) and RepeatPerSegment: the Hexagon trails' honeycomb and
  the Laser/Holopixel trails were stretched once over the whole trail. A `UI_Additive` material on a 3D particle (legendary
  landing halo) now falls back to additive blending (`src/engine/render.js`) instead of an opaque white square.
  `UIParticle` no longer plays its systems on enable (Coffee's does not; a system starts on its own `playOnAwake`,
  the rest wait for a feedback or script): the three `FX_UnlockExplosion` bursts of the Progress popup flashed over
  it on every open (owner's screenshot, 2026-10-29).
- Popups close at once (owner's request, 2026-10-29: fading the panel, the close button and the backdrop out first felt
  slow and indecisive). Progress and Claim Bonus (`UI_OverlayBase`, was 0.2–0.4 s plus `additionalClose`), Challenges
  (0.2 s), Levels (0.5 s), the Reward Track (0.5 s) and the lootbox result screen on Claim (0.4 s) now deactivate on
  the press; the overlays rewind their DOTweens so the next open plays them forward again. Their close feedbacks
  still land on their end state (`playFeedbacksAtOnce`) before the deactivation: Challenges' Transition In fades the
  High Score display out and only its Transition Out brings it back, so skipping it left the High Score group, and
  the leaderboard button that copies it (`src/portal.js`), hidden after Challenges (owner's report, 2026-10-29). The
  shop confirmations, the Daily Deal refresh, No Ads and Pause already closed at once.
- They open at once too (owner's screenshot of Progress caught mid fade, 2026-10-29): `playFeedbacksAtOnce`
  (`src/uiscripts/common.js`) plays the open feedbacks of Progress, Claim Bonus, Challenges, Levels and the Reward
  Track with a zero duration multiplier and no delays, so the backdrop, the panel and the close button land on their
  end state on the first frame, and nothing waits on the transition (input is never blocked for it). Content
  animations stay: the Progress bars filling, the Reward Track scrolling to the rank, rank-up and lootbox sequences,
  the 0.3 s pop of the shop confirmations and No Ads.
- Opening hitches (2026-10-29, measured with WebGL/canvas call timing in the headless session):
  - The UI atlas pages (19, about 2048²) were uploaded to the GPU on the frame a page or popup first drew them
    (Shop: six at once). `UISprites.warm` uploads them one per idle callback once the menu is up (`src/main.js`).
  - `opaqueBounds` (card picture fitting, `src/ui2/layout.js`) read every sprite back through a fresh GPU canvas; it
    now draws into one shared `willReadFrequently` canvas.
  - The vehicle shader was recompiled on every switch between Home and Vehicles: the home-lit clones
    (`src/ui2/showroom.js`) and a destroyed renderer's owned material copies (`src/engine/render.js`) were disposed,
    which deletes the last user's compiled program. Neither is disposed now (no GPU memory of their own; the
    programs stay bounded by the shader variants, 14 to 15 in a session).

- HUD fixed against wireframe 15 (2026-10-29, owner's screenshot at 1912 × 919):
  - The pause / restart icons and the gem icon and figure were framed against the centred canvas while their plates
    are anchored top-right / top-left, so on screens wider than 16:9 the icons slid off their hexagons and the gem
    figure out of its pill. They now take their plate's anchor, as the tab bar and Revive do.
  - "New Best!" (`Value text container/NewSticker`) is mapped to `hd.best` (585, 14, 110 × 22): a gold chamfered plate
    with a heavy 15 gold label, instead of the original 432-wide banner.
- Levels (2026-10-29, owner's markup):
  - Total stars moved to the panel's top-right, beside the title (`l.total` 860, 142, 180 × 46; was 550, 550 in the
    bottom row), edited in `docs/ui/final/layout.json` and `src/ui2/rects.js` regenerated. It is text only ("Total" right-
    aligned, then ★ and the count), without a plate.
  - A 3-star row showed two nested outlines: `CompletionHighlight` (turned on by `SetVisualState` at 3 stars) has an
    `S_Button_Main` sprite, which the generic rule of `styleObject` draws as a hexagon, around the row's chamfered
    frame. It and `PressedHighlight` now draw the row's own chamfer in the lit (`active`) kind on the row's rect; the
    pressed flash keeps its alpha (0 until its feedback).
  - Panel reshaped (owner's markup): 980 × 380 at 150, 124, only as tall as the title, the four rows and the page dots.
    The scroll view, its viewport and each page take the panel's rect (`tools/ui2-bindings.mjs` frames, page width in
    `src/ui2/layout.js`); rows keep their screen positions. The page arrows sit on the panel's sides, centred on the
    rows; the close sits on the panel's corner.
  - Page dots (`l.dots`) are new display-only objects under the menu (`UI2 Page Dots`, `Texture2D/Circle`): one per
    `ScrollSnapRect.pageCount`, the `targetPage` dot in the accent colour, the others `muted`.
  - Locked page (owner's request): only the title, the total and the requirement show. The requirement, a column of
    label, star and figure over a glow in the original, is one line of plain text in the middle of the page ("NEEDS ★
    12", heavy 24, no plate). While `LockedFade` is active the page's `LevelsGroup` is hidden (shown again in portrait)
    and the fade's own dark Image is off, so the title is not dimmed. Arrows and page dots stay.
- Star Rank (Reward Track, 2026-10-29) is a popup like Progress with the rewards in a grid (owner's mockup):
  - Panel `r.bg` 80, 60, 1120 × 600 (`Container/Background`, the panel frame at 93 %) over the usual 65 % shade. Its
    header: STAR RANK centred (`r.title`), ✕ on the panel's corner (`r.close`). The rank stars and the star bar
    (`r.rank`, `r.fill`, `r.next`) are hidden in landscape: Home shows the same bar (owner's request). Laid out, the
    bar matches Home's (335 × 34, `star_fill` inside it with its pointed ends; a tinted square stuck out of its left
    tip). The old header band (`TopBar` Image) is off; the container keeps its canvas-wide mask, which no longer
    draws its black rectangle (`showMaskGraphic` off).
  - The list (scroll view 108, 140, 1072 × 496) is a grid: 3 columns of 344 × 84 cards, 16 apart, 4 from the top and
    14 under the last row for its badges, in the original order (`TRACK_CARD`, `src/ui2/layout.js`); the spacer entry
    (target of rank 0) is an empty line on top. Each card is centred on its position, so `ScrollToRank` /
    `GetVerticalPositionInScreen` scroll to its row.
  - A card: rank star (10, 16, 52 × 52, the number on one line), picture (72, 14, 56 × 56; a level card's stopwatch),
    name 17 over type 15 (138, 18), the currency on the right as icon then amount (268, 26), and one neon disc on the
    bottom-right corner (314, 60, 36 × 36; owner's request): `badge_locked` (the `Lock` Image) while locked,
    `badge_claimed` (the `ClaimedOverlay` plate; its ✓ glyph and "Claimed" label off) once claimed. The discs are
    drawn by `tools/ui2-art.mjs` (the lock has a `_w2` variant). The next reward lights its card's frame (`active`);
    its "Next Reward" label is off (no room).
  - Scrollbar (`r.scroll`, owner's request): `UI2 Scrollbar` with a `scroll_track` / `scroll_thumb` pair (sliced,
    `_w2` variants), shown while the list is longer than the view. The thumb is as tall as the share in view (36 at
    least) and follows the list. Pressing the track centres the thumb there, grabbing the thumb keeps the grab point
    under the pointer; the hit area is 32 wide and the thumb brightens while hovered or dragged.
  - A card's rectangles (the `Background Container` glow, a level card's world banner, the `NextRewardHighlight`
    shine and flash) are cut to the card's chamfer 3 px inside the rim (corner 14): each holder's Image is an octagon
    (`chamferMask`, `src/ui2/style.js`) under a Mask that does not draw itself; Image / Mask added where missing,
    landscape only. The original magenta `BrighterBackground` is off (it covered the rim).
  - A level row's earned stars showed as fragments. The original stacks `Star - 1/2/3` on one spot as one star that
    fills by thirds: stars 1 and 2 light up as pieces (`S_Icon_Star_LevelBar_2`, `_3`), star 3 as the whole star
    (`_4`). Side by side, stars 1 and 2 now draw the whole star through `overrideSprite` while their sprite is a piece;
    the `BooleanEventHandler` sprite swaps are untouched and portrait (stacked again) clears the override.
- Challenges (04, 2026-10-29, owner: "many parts are wrong"):
  - Opened slots lost their progress bar and reward. The landscape layout turns a locked slot's children off to show
    its lock text, and every slot reads as locked before the challenge data arrives, but nothing turned them on again
    (the game toggles the bar itself, never `RewardContainer`). The layout now remembers what it turned off and puts
    it back, then calls `UpdateChallenge()`, when the slot opens (checked every frame while the popup is up).
  - The bar is a plain 352 × 10 bar on the text's left edge: the original mask (`S_Challenge_Fillbar`) is a slanted
    9-slice, a wedge at this height. The text is one line that shrinks to 15 before it wraps, centred on the upper
    part of the row.
  - The reward has no frame: a hex around it next to the skip hex read as two buttons (owner: "too ugly"); its
    opaque picture is fitted to 40 × 36. The check is the `badge_claimed` disc of the Star Rank cards; the skip and
    reset-timer glyphs are white like ✕.
  - The panel ends under the last row (620 × 352; it was 430 high with an empty band at the bottom).
  - Then laid out like the read-only rows (owner's request): one line of text over a thin bar on the left, the hard
    icon, the check and the reward on the right. The skip button is off in landscape (owner's request; the game turns
    it on with each update, so it is turned off every frame).
- Read-only challenge rows (`readonlyRow`, `src/ui2/layout.js`; the Revive reason, and Pause before it dropped them):
  the text (16, down to 15, then a second line) over a plain 5-high bar, then right to left the reward (fitted, no
  frame), the check and the hard icon. The bar was the slanted `S_Challenge_Fillbar` wedge, the reward a dot, and a
  long text spilled over the bar. Pause no longer shows its running challenges in landscape (owner's request).
- Revive (18): the reason box under the panel ("Challenge almost complete!" and its challenge row, "Almost new high
  score!") is not shown in landscape (owner's request, 2026-10-30; portrait shows it again); the countdown heart is a dark track under the accent fill with a white figure (it was black under a
  white fill, the figure grey on white).
- Vehicles, a card's star to claim (`StarOverlay`, shown while a rank is unlocked and unseen; tapping the card claims
  it): the original stretched a gold hexagon (`S_Gradient_Star_Overlay`) over the chamfered card, and the generic star
  rule painted the white 3D star the world's accent, pink on gold. The overlay is now the card's own outline in the
  gold chrome (`claimStarOverlay`, `src/ui2/layout.js`), the star gold and centred (40 on a tier slot, 64 on a
  collection card).
- Levels lost its panel, shade and ✕ once (owner's capture, the rows alone on the bare screen): the open / close
  feedbacks fade those Images (`World Background Image`, the close button and its icon) and the close leaves them at
  alpha 0, so a reopening that skips the open feedback shows only the rows. Opening and closing are instant, so while
  the popup is up the layout keeps them at their open alpha (shade 65 %). Checked by playing the close feedback with
  the popup open.
- Rank Up (12, 2026-10-30, owner: "rearrange this screen"): the portrait sequence fades the title out when the star
  moves up, which left a star with no heading; the title now stays. The x2 offer showed from the start, under the
  reward reveal and on ranks that give no gems; it now waits for the rewards and shows only when one is gems
  (otherwise "Click to continue" takes its place). The reward cards were black with a thin white border and a glow
  behind the first card only (off-centre in the row); they are panel-framed square 190 × 190 cards (owner: square, so the picture is not distorted) without the glow, a
  cosmetic's name over its type in the secondary colour, a currency's icon over its amount.
- Gameplay texts (15, 2026-10-30, owner: "the texts in gameplay are too small"): the generic restyle scales every text
  to .45 of its portrait size, so a compliment ("Daredevil!") came out at 15-22 and the flip score ("+3") at 21.6.
  In landscape the compliments are title-font texts at 34 (normal, perfect), 40 (perfect, bigger) and 48 (extreme),
  the world "Perfect" callout 30; the flip score steps 30 / 34 / 38 / 46 by flips (portrait keeps 70-120), its
  "Perfect" 22; the run gem count 20.
- Tutorial focus (17, 2026-10-30, owner: "it leaks"): the darkening around the focus (`Screen Darken`, a
  `ScreenFill`) fills its screen rect `TutorialFocus`, which landscape holds to the 1280 × 720 design canvas, so a
  window wider than 16:9 showed the game unlit at both sides. In landscape it fills the root `TutorialCanvas`.
- Rank Up sequence (12, 2026-10-30, owner: "unlocking takes a lot of time; simpler and faster"): the popup lands open
  with the new rank, each reward pops in with its skip feedbacks (no card flip, no 3 s build-up) and the offer or
  "Click to continue" shows at once: about 1.2 s for two rewards instead of some 8 s. After the first rank-up (rank 1
  to 2) the Star Rank track no longer opens by itself. A tutorial instruction over the popup ("Collect Stars to earn
  new Cosmetics!") takes the place under the cards and "Click to continue" moves to the bottom (y 650).
- Challenge claim to Rank Up (owner: "only this effect and the rank-up popup"): the popup opens right after the
  claim burst; it no longer waits for the reward stars to fly to the rank bar (they land under it).
  The Challenges popup the claim opened closes with the last rank-up popup.
- Challenges (04) no longer opens by itself on the early ranks' returns home (owner: "confusing"); it opens by itself
  only with a challenge to claim.
- Claim Challenge tutorial ("Complete Challenges to collect Stars") is not shown (owner: "pointless"); it is marked
  skipped on load.
- Run gems glow: their material gets a gem-cyan emission over the bloom threshold.
- "Tap" reads "Click" (owner's request, 2026-10-30): src/meta/data.js rewrites the loaded texts ("Click to
  continue", "Click to Open"); every "Tap to ..." text of the scenes and prefabs comes from those terms. Portrait
  shows "Click" too.
- In-run challenge status (, 2026-10-30, owner: "only the text, centred at the bottom"): the
   (completed / failed / progress) was left unplaced, a band some 4000 units wide across the
  screen with its text off-centre. In landscape only its text shows, centred at the bottom (y 644, 22), in its status
  colour; its frame, world icon and bar are off and its slide-in is not played. The HUD's layout and the popup's both
  moved the shared container, so the popup is placed again whenever it is off.
- Tutorial focus and instruction (17, 2026-10-30): a focus on a UI target takes the target's own size plus 12 units
  (a circle stays round); a tutorial socket inside a challenge row frames the row. The steps' portrait sizes framed
  a row in a band wider than the Challenges panel. The instruction is one line (it wrapped over the bottom buttons);
  on the menu it sits between the popup panels and the bottom buttons (y 486, "Click to continue" y 528).

Remaining differences, and why they stay:

| Reference | Built | Why |
|---|---|---|
| "High Score" in mixed case | HIGH SCORE | every bundled heavy face (Nulshock, Helmet) has capitals only |
| round blue gem, hexagonal ruby | the game's own currency sprites | the same sprites appear on every screen; changing Home alone would make the currencies look different elsewhere |
| sport bike | the player's selected vehicle | the showroom shows live game data |
| both chevrons lit | left chevron dimmed on world 1 | dimming tells the player there is no world to the left |
| no leaderboard button | bar-chart button in the right-hand column | the leaderboard is a required SDK feature |
| BONUS under the star bar | under the high score; shown 3 s on Home unless the reward waits, hidden once claimed | owner's request; game state |

`tools/ui2-check.mjs` after these changes: 22 states × 6 viewports, 132 captures, 0 failures; `npm run check` OK.

### 12.3 Shop, tutorials and Home fixes (2026-10-30 / 31)

Owner's captures, checked headless (`tools/qa`) with no console errors.

- Shop, Daily Deal purchase: the card reveal filled the screen. Deal and RV-track reveals now show the card at
  y 227 without its particle effects, under a darker shade. A Claim button appears about 0.6 s into the reveal, and
  the card closes when it is pressed (`revealAndClaim`, `src/uiscripts/shop.js`). The RV-track reveal gets its own
  green `UI2 Claim` button (535, 540, 210 × 56).
- Shop, RV reward track: each segment fills to the middle of its reward cell (the last one to the bar's end). A
  claimable cell has the gold overlay and its ping at the top-right corner. A claimed cell is fully covered by a dark
  plate (`#05030c`, 90 %) and its value banner is hidden. The ad button no longer draws a second plate inside itself.
- Shop confirmations: the buy button is disabled and its text greyed while the player cannot afford the item.
- Tooltips draw above popups (sort 109), as one centred line of 18 on a pill.
- Gems and rubies glow everywhere, as on Home: `S_Icon_SoftCurrency` / `S_Icon_HardCurrency` Images draw the baked
  `cur_gem` / `cur_ruby` sprites, and inline TMP sprites use them through `TMP_Text.spriteOverride`.
- Rank Up rewards: the picture is a 124 square that keeps its aspect (it was stretched).
- Star Rank track: the ✕ shows and works during the opening animation (`EventSystem.blockedExcept`).
- Locked Home tab: dimmed, with a padlock in place of "Needs 3 ★". Tapping it shows the tooltip "Needs Star Rank N
  to unlock".
- Shop tutorial (FTUE_Shop):
  - The hands are 72 px. The press hand repeats its press every second (driven by time; the Animator clips do not
    play). Its finger points at the middle of the Shop button (`UI2 Tutorial Center`).
  - The instruction text sits above the focus, at most 24 px.
  - The Large Chest step lights the whole Chests row, and the darkening covers the screen to its right edge.
  - A hand hides for good once the tutorial hides it. It used to linger, which put the buy step's hand on the chest.
  - The chest opening's "Tap to open" shows a press hand at the middle of the chest.
  - The tutorial waits while a Home popup is open (Challenges, Timed Levels, World Stats, Bonus claim). In landscape
    these popups cover the tab bar, so a tutorial started under them could not be clicked.
- Home currencies: gems on top, rubies below (owner's request, 2026-10-31).
- Home "New Best!" (`h.hsNew` 540, 140, 200 × 24): gold text 18 under the high score, with no plate (it was a small
  gold hexagon to the right of the figure). It shares that line with BONUS and is hidden while BONUS shows.
