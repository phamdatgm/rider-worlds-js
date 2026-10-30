// UI2 neon art: vector sources drawn here, rendered at 2x design scale and packed into one atlas page.
// Run: node tools/ui2-art.mjs   (writes art/ui2/*.png and public/assets/ui_extra/ui2_chrome.webp + atlas.json entries)
// Style reference: docs/ui/ref/home.png. Colours: docs/ui/UI_SPEC.md §6.
import fs from 'node:fs';
import sharp from 'sharp';

const SRC = 'art/ui2';
const ATLAS = 'public/assets/ui_extra/atlas.json';
const PAGE = 'ui2_chrome.webp';
const PAD = 28; // glow margin around every frame (sprite px)

// ---- palette per kind: fill gradient (top, mid, bottom), rim, glow, inner line
const KIND = {
  panel: { fill: ['#26104c', '#160a32', '#0c0620'], rim: '#ec5cff', rim2: '#c040ff', glow: '#d43cff', glowA: 0.9, inner: '#7a3cc8' },
  active: { fill: ['#9a38e8', '#5c1cc0', '#300e80'], rim: '#ffe4ff', rim2: '#ffb8f8', glow: '#ff4cf0', glowA: 1, inner: '#ff9cf5', wide: true },
  row: { fill: ['#151032', '#0e0a24', '#0a0818'], rim: '#5a4a9a', rim2: '#4a3c80', glow: '#4a3c80', glowA: 0.25, inner: '#2c2458' },
  blue: { fill: ['#123072', '#0b1d4a', '#081434'], rim: '#5aa0ff', rim2: '#3c8bff', glow: '#3c8bff', glowA: 0.7, inner: '#2c5cb0' },
  green: { fill: ['#14583a', '#0f3a24', '#0a2818'], rim: '#6affaa', rim2: '#3cff8f', glow: '#3cff8f', glowA: 0.6, inner: '#24a060' },
  gold: { fill: ['#5a4000', '#3b2a00', '#281c00'], rim: '#ffe060', rim2: '#ffcc00', glow: '#ffcc00', glowA: 0.6, inner: '#a08000' },
  // Home world badge: dark face, hot pink rim (docs/ui/ref/home.png)
  neon: { fill: ['#1c0c44', '#120832', '#0a0522'], rim: '#ffe0ff', rim2: '#ff5cf0', glow: '#ff3cf0', glowA: 1, inner: '#b04cff', wide: true },
};
const FRAME_KINDS = Object.keys(KIND).filter((k) => k !== 'neon');
// World 2 theme (docs/ui/ref/home_world2.png): the same shapes with mint-green frames and gold for the selected item and
// the world badge. These sprites carry a `_w2` suffix; src/ui2/style.js swaps them in while World 2 is shown.
const W2 = {
  panel: { fill: ['#0a3a2c', '#05281e', '#031a14'], rim: '#7affcc', rim2: '#1ee69a', glow: '#14e08c', glowA: 0.85, inner: '#0f8a5c' },
  active: { fill: ['#2c4a14', '#163818', '#08261a'], rim: '#fff4b8', rim2: '#ffc61a', glow: '#ffb400', glowA: 1, inner: '#c8a020', wide: true },
  neon: { fill: ['#0a3a2c', '#05281e', '#031a14'], rim: '#fff0a0', rim2: '#ffc21a', glow: '#ffae00', glowA: 1, inner: '#b08a10', wide: true },
  // rows and sections inside panels (Progress sections, challenge and level rows): dim mint instead of dim violet
  row: { fill: ['#0c2620', '#081c17', '#06130f'], rim: '#2f8a6c', rim2: '#226e56', glow: '#226e56', glowA: 0.25, inner: '#164a3c' },
};

const P = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
/** polygon offset inwards by d (convex, clockwise in screen space) */
function inset(pts, d) {
  const n = pts.length, lines = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    const l = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / l, ny = (bx - ax) / l; // inward normal for clockwise
    lines.push([ax + nx * d, ay + ny * d, bx - ax, by - ay]);
  }
  return lines.map((L, i) => {
    const M = lines[(i + n - 1) % n];
    const den = M[2] * L[3] - M[3] * L[2];
    if (Math.abs(den) < 1e-9) return [L[0], L[1]];
    const t = ((L[0] - M[0]) * L[3] - (L[1] - M[1]) * L[2]) / den;
    return [M[0] + M[2] * t, M[1] + M[3] * t];
  });
}

/** neon frame of one polygon on a canvas of w x h (polygon already offset by PAD) */
function frameSVG(id, w, h, pts, kind) {
  const k = typeof kind === 'string' ? KIND[kind] : kind;
  const [t, m, b] = k.fill;
  const g = (d) => `<polygon points="${P(inset(pts, d))}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs>
  <filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${k.wide ? 8 : 6.5}"/></filter>
  <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t}"/><stop offset=".55" stop-color="${m}"/><stop offset="1" stop-color="${b}"/></linearGradient>
  <linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${k.rim}"/><stop offset=".5" stop-color="${k.rim2}"/><stop offset="1" stop-color="${k.rim}"/></linearGradient>
</defs>
<polygon points="${P(pts)}" fill="none" stroke="${k.glow}" stroke-width="${k.wide ? 12 : 9}" opacity="${k.glowA}" filter="url(#gl)"/>
${g(0)} fill="url(#f)"/>
${g(1.6)} fill="none" stroke="url(#r)" stroke-width="${k.wide ? 4.4 : 3.4}" stroke-linejoin="round"/>
${g(8)} fill="none" stroke="${k.inner}" stroke-width="1.8" opacity="${k.wide ? 0.85 : 0.6}" stroke-linejoin="round"/>
${g(1.2)} fill="none" stroke="#ffffff" stroke-width="1.2" opacity="${k.wide ? 0.75 : 0.22}" stroke-linejoin="round"/>
</svg>`;
}

const sprites = []; // {name, svg, w, h, b:[l,b,r,t], meta}
function add(name, w, h, svg, b = [0, 0, 0, 0], meta = {}) { sprites.push({ name, w, h, svg, b, meta }); }

// ---- chamfered frame: corner 32 px = 16 design units; scaled down for low elements (UI_SPEC §6)
{
  const k = 32, mid = 24, W = 2 * PAD + 2 * k + mid, H = W;
  const pts = shift([[k, 0], [k + mid, 0], [2 * k + mid, k], [2 * k + mid, k + mid], [k + mid, 2 * k + mid], [k, 2 * k + mid], [0, k + mid], [0, k]], PAD, PAD);
  const B = PAD + k + 2;
  for (const kind of FRAME_KINDS) add(`cham_${kind}`, W, H, frameSVG('c', W, H, pts, kind), [B, B, B, B], { mode: 'corner', corner: k });
  for (const kind of ['panel', 'active', 'row']) add(`cham_${kind}_w2`, W, H, frameSVG('c', W, H, pts, W2[kind]), [B, B, B, B], { mode: 'corner', corner: k });
}
// ---- flat-top hexagon, 3-slice: the slanted ends scale with the element height
{
  const sh = 104, dx = 26, mid = 24, W = 2 * PAD + 2 * dx + mid, H = 2 * PAD + sh;
  const pts = shift([[dx, 0], [dx + mid, 0], [2 * dx + mid, sh / 2], [dx + mid, sh], [dx, sh], [0, sh / 2]], PAD, PAD);
  for (const kind of Object.keys(KIND)) add(`hex_${kind}`, W, H, frameSVG('h', W, H, pts, kind), [PAD + dx + 2, H / 2, PAD + dx + 2, H / 2], { mode: 'height', sh });
  for (const kind of ['panel', 'active', 'neon', 'row']) add(`hex_${kind}_w2`, W, H, frameSVG('h', W, H, pts, W2[kind]), [PAD + dx + 2, H / 2, PAD + dx + 2, H / 2], { mode: 'height', sh });
}
// ---- pill bar (currency, star bar): pointed ends
{
  const sh = 68, dx = 22, mid = 24, W = 2 * PAD + 2 * dx + mid, H = 2 * PAD + sh;
  const pts = shift([[dx, 0], [dx + mid, 0], [2 * dx + mid, sh / 2], [dx + mid, sh], [dx, sh], [0, sh / 2]], PAD, PAD);
  for (const kind of ['panel', 'row']) add(`pill_${kind}`, W, H, frameSVG('p', W, H, pts, kind), [PAD + dx + 2, H / 2, PAD + dx + 2, H / 2], { mode: 'height', sh });
  for (const kind of ['panel', 'row']) add(`pill_${kind}_w2`, W, H, frameSVG('p', W, H, pts, W2[kind]), [PAD + dx + 2, H / 2, PAD + dx + 2, H / 2], { mode: 'height', sh });
}
// ---- Home tab plates (docs/ui/ref/home.png): end (arrow tip, mirrored for the right end), side (leaning), centre
{
  const sh = 188, c = 10;
  const shapes = {
    // left end: arrow tip on the left; the right edge leans as the centre tab's sides (22 / 188), so the joint is parallel
    end: { dl: 70, dr: 22, pts: (w) => [[70, 0], [w - c, 0], [w, c], [w - 22 + c * 0.2, sh - c], [w - 22 - c, sh], [70, sh], [0, sh / 2]] },
    // side: parallelogram leaning right (the right side tabs mirror it)
    side: { dl: 40, dr: 40, pts: (w) => [[40 + c, 0], [w - c, 0], [w, c], [w - 40 + c * 0.2, sh - c], [w - 40 - c, sh], [c, sh], [0, sh - c], [40 - c * 0.2, c]] },
    // centre: slight trapezoid, wider at the bottom
    centre: { dl: 22, dr: 22, pts: (w) => [[22 + c, 0], [w - 22 - c, 0], [w - 22 + c * 0.3, c], [w, sh - c], [w - c, sh], [c, sh], [0, sh - c], [22 - c * 0.3, c]] },
  };
  for (const [name, s] of Object.entries(shapes)) {
    const mid = 24, w = s.dl + s.dr + 2 * c + mid, W = 2 * PAD + w, H = 2 * PAD + sh;
    const pts = shift(s.pts(w), PAD, PAD);
    for (const kind of ['panel', 'active']) {
      add(`tab_${name}_${kind}`, W, H, frameSVG('t', W, H, pts, kind), [PAD + s.dl + c + 2, H / 2, PAD + s.dr + c + 2, H / 2], { mode: 'height', sh });
      add(`tab_${name}_${kind}_w2`, W, H, frameSVG('t', W, H, pts, W2[kind]), [PAD + s.dl + c + 2, H / 2, PAD + s.dr + c + 2, H / 2], { mode: 'height', sh });
    }
  }
}
// ---- fill bar: white pill (tinted at runtime), simple 3-slice
{
  const sh = 32, W = 2 * sh, H = sh;
  add('bar_fill', W, H, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${sh / 2 - 1}" fill="#fff"/></svg>`, [sh / 2, 0, sh / 2, 0], { mode: 'height', sh, pad: 0 });
}
// ---- Home star bar fill: the inside of the 335 x 34 star bar (pointed ends, 6 / 5 px in from its edges), gold.
// Drawn at the fill's own size (2 px per design unit): a filled Image stretches the whole sprite and cuts it.
{
  const W = 646, H = 48, tip = 15.6;
  const pts = [[tip, 0], [W - tip, 0], [W, H / 2], [W - tip, H], [tip, H], [0, H / 2]];
  add('star_fill', W, H, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".45" stop-color="#f5a800"/><stop offset="1" stop-color="#b85c00"/></linearGradient></defs>
<polygon points="${P(pts)}" fill="url(#f)" stroke="#8a4600" stroke-width="2" stroke-linejoin="round"/>
<polyline points="${P([[tip + 4, 5], [W - tip - 4, 5]])}" stroke="#fff6c8" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>`);
}
// ---- notification badge
{
  const s = 64, W = s + 2 * 12;
  add('badge', W, W, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<radialGradient id="r" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ff6a70"/><stop offset=".6" stop-color="#e8202a"/><stop offset="1" stop-color="#a80c14"/></radialGradient></defs>
<circle cx="${W / 2}" cy="${W / 2}" r="${s / 2}" fill="#ff2030" opacity=".55" filter="url(#g)"/><circle cx="${W / 2}" cy="${W / 2}" r="${s / 2 - 2}" fill="url(#r)" stroke="#fff" stroke-width="4"/></svg>`, [0, 0, 0, 0], { pad: 12, padOf: s });
}
// ---- Star Rank cards (owner's request): claimed ✓ and lock as one family of neon discs on the card's corner, and the
// card grid's scrollbar (track + thumb, sliced vertically; 2 px per design unit like the frames)
{
  const W = 72, c = W / 2, r = 22;
  const disc = (fill, rim, glow, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<radialGradient id="f" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="${fill[0]}"/><stop offset=".6" stop-color="${fill[1]}"/><stop offset="1" stop-color="${fill[2]}"/></radialGradient></defs>
<circle cx="${c}" cy="${c}" r="${r}" fill="${glow}" opacity=".6" filter="url(#g)"/><circle cx="${c}" cy="${c}" r="${r - 1}" fill="url(#f)" stroke="${rim}" stroke-width="2.5"/>${glyph}</svg>`;
  const tick = `M${c - 9} ${c + 1}l6 6 12-13`;
  const check = `<path d="${tick}" fill="none" stroke="#063a1e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".35" transform="translate(0 1.5)"/><path d="${tick}" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const lock = (cut) => `<path d="M${c - 6} ${c - 2}v-4a6 6 0 0 1 12 0v4" fill="none" stroke="#fff" stroke-width="3.5"/><rect x="${c - 9.5}" y="${c - 3}" width="19" height="14" rx="3" fill="#fff"/><circle cx="${c}" cy="${c + 3}" r="2.4" fill="${cut}"/><rect x="${c - 1.1}" y="${c + 3}" width="2.2" height="5" fill="${cut}"/>`;
  add('badge_claimed', W, W, disc(['#9dffcc', '#2ad67e', '#0b8a4a'], '#eafff2', '#3cff8f', check));
  add('badge_locked', W, W, disc(['#4a2290', '#25105a', '#140832'], '#d89cff', '#b03cff', lock('#25105a')));
  add('badge_locked_w2', W, W, disc(['#1e6a4c', '#0e3a28', '#052016'], '#a8ffe0', '#3cffb4', lock('#0e3a28')));
  const bar = (fill, rim) => `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="40"><defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${fill[0]}"/><stop offset="1" stop-color="${fill[1]}"/></linearGradient></defs>
<rect x="1" y="1" width="10" height="38" rx="5" fill="url(#t)" stroke="${rim}" stroke-width="1.5"/></svg>`;
  add('scroll_track', 12, 40, bar(['#0a061e', '#140c34'], '#4a3c80'), [0, 7, 0, 7]);
  add('scroll_track_w2', 12, 40, bar(['#03140e', '#082a1e'], '#2c6e58'), [0, 7, 0, 7]);
  add('scroll_thumb', 12, 40, bar(['#ff86f2', '#b03cff'], '#ffd0fb'), [0, 7, 0, 7]);
  add('scroll_thumb_w2', 12, 40, bar(['#c4ffe6', '#34e8a6'], '#e0fff2'), [0, 7, 0, 7]);
}
// ---- rank star: silver-violet for World 1, plain silver for World 2 (as the references)
{
  const W = 256, R = 112, r = 52, cx = W / 2, cy = W / 2 + 10;
  const star = (R, r) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R; return [cx + Math.cos(a) * k, cy + Math.sin(a) * k]; });
  const svg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><defs><filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.s[0]}"/><stop offset=".45" stop-color="${c.s[1]}"/><stop offset="1" stop-color="${c.s[2]}"/></linearGradient>
<linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.i[0]}"/><stop offset="1" stop-color="${c.i[1]}"/></linearGradient></defs>
<polygon points="${P(star(R, r))}" fill="none" stroke="${c.glow}" stroke-width="10" opacity=".8" filter="url(#g)"/>
<polygon points="${P(star(R, r))}" fill="url(#s)" stroke="${c.edge}" stroke-width="5" stroke-linejoin="round"/>
<polygon points="${P(star(R * 0.74, r * 0.74))}" fill="url(#i)" stroke="${c.inner}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  add('star_rank', W, W, svg({ s: ['#e6dcff', '#8a6ad6', '#3a2470'], i: ['#6a4cc0', '#2a1a5a'], glow: '#c86bff', edge: '#f4eeff', inner: '#d8c8ff' }));
  add('star_rank_w2', W, W, svg({ s: ['#ffffff', '#a9b6b4', '#4a5654'], i: ['#7a8886', '#2c3634'], glow: '#7affcc', edge: '#f4fffb', inner: '#dce8e6' }));
}
// ---- white icons with a coloured halo; 96 px glyph on a 128 px canvas. Cut-outs use the theme's dark colour.
const ICON = {
  shop: `<path d="M6 10h9l7 30h28l6-22H19" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><path d="M20 18h36l-6 22H25z" fill="none" stroke="#fff" stroke-width="3"/><path d="M22 26h32M24 33h28M33 18v22M43 18v22" stroke="#fff" stroke-width="2.5"/><circle cx="26" cy="52" r="5" fill="#fff"/><circle cx="46" cy="52" r="5" fill="#fff"/>`,
  vehicle: `<path d="M4 46v-9l7-3 9-12h22l11 12 7 2v10z" fill="#fff"/><path d="M22 25h8v9H15zM34 25h7l8 9H34z" fill="CUT"/><circle cx="18" cy="47" r="7.5" fill="#fff" stroke="CUT" stroke-width="3"/><circle cx="48" cy="47" r="7.5" fill="#fff" stroke="CUT" stroke-width="3"/>`,
  world: `<g fill="none" stroke="#fff" stroke-width="4"><circle cx="32" cy="32" r="25"/><ellipse cx="32" cy="32" rx="11" ry="25"/><path d="M7 32h50M11 19h42M11 45h42M32 7v50"/></g>`,
  challenges: `<path d="M18 8h28v14c0 10-6 17-14 17s-14-7-14-17z" fill="#fff"/><path d="M18 13H8c0 10 5 15 12 15M46 13h10c0 10-5 15-12 15" fill="none" stroke="#fff" stroke-width="4"/><path d="M28 38h8v8h-8zM20 48h24v8H20z" fill="#fff"/><path d="M32 13l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="CUT"/>`,
  // the World tab turns into Play once Home is shown
  // a solid rounded arrow, solid like the cart and the car
  play: `<path d="M19 12 L51 32 L19 52 Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>`,
  // Levels button (owner's sample): a 2 x 2 grid of rounded outlined squares
  grid: `<g fill="none" stroke="#fff" stroke-width="5"><rect x="9" y="9" width="19" height="19" rx="6"/><rect x="36" y="9" width="19" height="19" rx="6"/><rect x="9" y="36" width="19" height="19" rx="6"/><rect x="36" y="36" width="19" height="19" rx="6"/></g>`,
  levels: `<rect x="8" y="30" width="14" height="26" rx="2" fill="#fff"/><rect x="25" y="8" width="14" height="48" rx="2" fill="#fff"/><rect x="42" y="20" width="14" height="36" rx="2" fill="#fff"/>`,
};
for (const [suffix, halo, cut] of [['', '#c86bff', '#2a0f5a'], ['_w2', '#3cffb4', '#06281e']]) {
  for (const [name, body] of Object.entries(ICON)) {
    add(`icon_${name}${suffix}`, 128, 128, `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5" result="b"/>
<feFlood flood-color="${halo}" flood-opacity=".95"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g transform="translate(8 8) scale(1.75)" filter="url(#g)">${body.replaceAll('CUT', cut)}</g></svg>`);
  }
}
// ---- motorbike for the Home Vehicles tab (owner's request): the garage's own vehicle tab glyph (S_Icon_Bikes_B,
// public/assets/ui) with the same halo as the drawn icons
{
  const ui = JSON.parse(fs.readFileSync('public/assets/ui/atlas.json', 'utf8'));
  const sp = ui.sprites['Sprite/SA_Icons/S_Icon_Bikes_B'], [page] = ui.pages[sp.p], [x, y, w, h] = sp.r;
  const png = await sharp(`public/assets/ui/${page}`).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
  const href = `data:image/png;base64,${png.toString('base64')}`;
  for (const [suffix, halo] of [['', '#c86bff'], ['_w2', '#3cffb4']]) {
    add(`icon_bike${suffix}`, 128, 128, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="128" height="128"><defs><filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5" result="b"/>
<feFlood flood-color="${halo}" flood-opacity=".95"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="w"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 0"/></filter></defs>
<g filter="url(#g)"><image x="-10" y="-10" width="148" height="148" xlink:href="${href}" href="${href}" filter="url(#w)"/></g></svg>`);
  }
}
// ---- currency icons of the top bar (owner's request): the original gem and ruby with a bloom of their own colour,
// the glyph 76 px in the middle of a 128 px canvas. The gem's white art is tinted to its token colour here.
{
  const ui = JSON.parse(fs.readFileSync('public/assets/ui/atlas.json', 'utf8'));
  for (const [name, src, glow, tint] of [['cur_gem', 'S_Icon_SoftCurrency', '#3cc8ff', [0.31, 0.85, 1]], ['cur_ruby', 'S_Icon_HardCurrency', '#ff2c48', null]]) {
    const sp = ui.sprites[`Sprite/SA_Icons/${src}`], [page] = ui.pages[sp.p], [x, y, w, h] = sp.r;
    const png = await sharp(`public/assets/ui/${page}`).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
    const href = `data:image/png;base64,${png.toString('base64')}`;
    const m = tint ? `${tint[0]} 0 0 0 0  0 ${tint[1]} 0 0 0  0 0 ${tint[2]} 0 0  0 0 0 1 0` : '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0';
    add(name, 128, 128, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="128" height="128"><defs>
<filter id="t"><feColorMatrix type="matrix" values="${m}"/></filter>
<filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="13" result="w"/><feGaussianBlur in="SourceAlpha" stdDeviation="5" result="n"/>
<feFlood flood-color="${glow}" flood-opacity="1"/><feComposite in2="w" operator="in" result="wg"/><feFlood flood-color="${glow}" flood-opacity="1"/><feComposite in2="n" operator="in" result="ng"/>
<feMerge><feMergeNode in="wg"/><feMergeNode in="wg"/><feMergeNode in="ng"/><feMergeNode in="ng"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g filter="url(#g)"><image x="26" y="26" width="76" height="76" xlink:href="${href}" href="${href}" filter="url(#t)"/></g></svg>`);
  }
}
// ---- double chevron (world navigation), drawn pointing left; the right arrow is mirrored by its transform
{
  const W = 140, H = 112;
  const chev = (x) => P([[x + 60, 12], [x + 34, 12], [x, 56], [x + 34, 100], [x + 60, 100], [x + 26, 56]]);
  const svg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.g[0]}"/><stop offset=".5" stop-color="${c.g[1]}"/><stop offset="1" stop-color="${c.g[2]}"/></linearGradient></defs>
<g filter="url(#g)" opacity=".8"><polygon points="${chev(14)}" fill="${c.glow}"/><polygon points="${chev(62)}" fill="${c.glow}"/></g>
<polygon points="${chev(14)}" fill="url(#c)" stroke="${c.edge}" stroke-width="2" stroke-linejoin="round"/><polygon points="${chev(62)}" fill="url(#c)" stroke="${c.edge}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  add('chevron', W, H, svg({ g: ['#ff86f2', '#e03cff', '#8a2cff'], glow: '#e03cff', edge: '#ffd0fb' }));
  add('chevron_w2', W, H, svg({ g: ['#c4ffe6', '#34e8a6', '#0a8a5e'], glow: '#20e090', edge: '#e0fff2' }));
}

// ---- padlock for a locked world, standing on the Home podium (World 1 violet, World 2 mint and gold)
{
  const W = 220, H = 260;
  const svg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.body[0]}"/><stop offset=".5" stop-color="${c.body[1]}"/><stop offset="1" stop-color="${c.body[2]}"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a96a8"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#7a8698"/></linearGradient></defs>
<path d="M62 120V82a48 48 0 0 1 96 0v38" fill="none" stroke="${c.glow}" stroke-width="30" opacity=".55" filter="url(#g)"/>
<rect x="34" y="112" width="152" height="124" rx="22" fill="none" stroke="${c.glow}" stroke-width="14" opacity=".8" filter="url(#g)"/>
<path d="M62 120V82a48 48 0 0 1 96 0v38" fill="none" stroke="url(#s)" stroke-width="20" stroke-linecap="round"/>
<rect x="34" y="112" width="152" height="124" rx="22" fill="url(#b)" stroke="${c.rim}" stroke-width="5"/>
<rect x="44" y="122" width="132" height="104" rx="15" fill="none" stroke="${c.inner}" stroke-width="2" opacity=".8"/>
<circle cx="110" cy="164" r="15" fill="${c.hole}"/><path d="M102 168h16l5 36h-26z" fill="${c.hole}"/></svg>`;
  add('lock', W, H, svg({ body: ['#7a2cf0', '#4a17c4', '#260b6a'], rim: '#ffd8ff', inner: '#ff9cf5', glow: '#ff3cf0', hole: '#12052e' }));
  add('lock_w2', W, H, svg({ body: ['#1e5a3c', '#0e3a28', '#052016'], rim: '#ffe680', inner: '#7affcc', glow: '#ffb400', hole: '#02140c' }));
}

// ---- bands inside chamfered cards / tier slots (16 design px corners): white (tinted at runtime), cut at 45° so
// they follow the card's outline; drawn at their own size (2 px per design unit) since a filled Image stretches them.
// edge 'bottom': the band sits on the card's bottom edge (its lower corners cut), 'top': on the top edge.
{
  const band = (name, w, h, edge, c = 16) => {
    const W = w * 2, H = h * 2, k = c * 2, t = Math.max(0, k - H);
    const pts = edge === 'bottom' ? [[t, 0], [W - t, 0], [W - k, H], [k, H]] : [[k, 0], [W - k, 0], [W - t, H], [t, H]];
    add(name, W, H, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${P(pts)}" fill="#fff"/></svg>`);
  };
  band('band_slot_bottom', 90, 16, 'bottom');
  band('band_card_bottom', 104, 16, 'bottom');
  band('band_card_unlock', 104, 36, 'bottom');
  band('band_card_top', 104, 22, 'top');
}

// ---- render, pack (shelf packer), write
fs.mkdirSync(SRC, { recursive: true });
const rendered = [];
for (const s of sprites) {
  const buf = await sharp(Buffer.from(s.svg)).png().toBuffer();
  fs.writeFileSync(`${SRC}/${s.name}.png`, buf);
  rendered.push({ ...s, buf });
}
const PAGE_W = 1024, GAP = 2;
let x = GAP, y = GAP, rowH = 0;
for (const s of [...rendered].sort((a, b) => b.h - a.h)) {
  if (x + s.w + GAP > PAGE_W) { x = GAP; y += rowH + GAP; rowH = 0; }
  s.x = x; s.y = y; x += s.w + GAP; rowH = Math.max(rowH, s.h);
}
const PAGE_H = y + rowH + GAP;
await sharp({ create: { width: PAGE_W, height: PAGE_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(rendered.map((s) => ({ input: s.buf, left: s.x, top: s.y })))
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(`public/assets/ui_extra/${PAGE}`);

const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
let page = atlas.pages.findIndex((p) => p[0] === PAGE);
if (page < 0) page = atlas.pages.push([PAGE, PAGE_W, PAGE_H]) - 1;
else atlas.pages[page] = [PAGE, PAGE_W, PAGE_H];
// the Home plates (HomeBackdrop, HomePlate<N>) come from tools/ui2-plates.mjs and stay
for (const k of Object.keys(atlas.sprites)) if (k.startsWith('Sprite/UI2/') && !k.startsWith('Sprite/UI2/Home')) delete atlas.sprites[k];
for (const s of rendered) {
  atlas.sprites[`Sprite/UI2/${s.name}`] = { p: page, r: [s.x, s.y, s.w, s.h], sz: [s.w, s.h], b: s.b, pv: [0.5, 0.5], ppu: 100, ui2: { pad: s.meta.pad ?? (s.meta.mode ? PAD : 0), ...s.meta } };
}
fs.writeFileSync(ATLAS, JSON.stringify(atlas));
// the DOM leaderboard (src/ui2/leaderboard.js) draws the same frames as CSS border-images
const DOM = ['cham_panel', 'cham_active', 'cham_row', 'hex_panel', 'hex_active'];
const lines = ['// Generated by tools/ui2-art.mjs: UI2 frames for CSS border-image (slice / pad in sprite px, 2 px per design unit).', 'export const domArt = {'];
for (const name of DOM) {
  const s = rendered.find((r) => r.name === name);
  const webp = await sharp(s.buf).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  lines.push(`  ${name}: { url: 'data:image/webp;base64,${webp.toString('base64')}', slice: [${s.b[3]}, ${s.b[2]}, ${s.b[1]}, ${s.b[0]}], pad: ${s.meta.pad ?? PAD} },`);
}
fs.writeFileSync('src/ui2/dom-art.js', [...lines, '};', ''].join('\n'));
const kb = (fs.statSync(`public/assets/ui_extra/${PAGE}`).size / 1024).toFixed(0);
console.log(`${rendered.length} sprites -> ${PAGE} ${PAGE_W}x${PAGE_H} (${kb} KB), sources in ${SRC}/`);
