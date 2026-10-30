// Home background plates (one per world, podium painted in): art/ui2/home_plate_w<N>_v2.png -> one atlas page each.
// Revision 2 (wider view, 12° camera) replaced the first plates, which stay in art/ui2 for reference.
// Run: node tools/ui2-plates.mjs   Sources and prompts: docs/ui/home-art.json, brief: docs/ui/codex-home-plate.md
import fs from 'node:fs';
import sharp from 'sharp';

const ATLAS = 'public/assets/ui_extra/atlas.json';
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
for (const n of [1, 2]) {
  const src = `art/ui2/home_plate_w${n}_v2.png`, page = `ui2_home_w${n}.webp`;
  const { width, height } = await sharp(src).metadata();
  await sharp(src).webp({ quality: 86, effort: 6 }).toFile(`public/assets/ui_extra/${page}`);
  let p = atlas.pages.findIndex((x) => x[0] === page);
  if (p < 0) p = atlas.pages.push([page, width, height]) - 1;
  else atlas.pages[p] = [page, width, height];
  atlas.sprites[`Sprite/UI2/HomePlate${n}`] = { p, r: [0, 0, width, height], sz: [width, height], b: [0, 0, 0, 0], pv: [0.5, 0.5], ppu: 100 };
  console.log(`${src} -> ${page} (${(fs.statSync(`public/assets/ui_extra/${page}`).size / 1024).toFixed(0)} KB)`);
}
fs.writeFileSync(ATLAS, JSON.stringify(atlas));
