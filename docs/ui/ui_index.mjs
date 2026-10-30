// Builds docs/ui/index.html: one self-contained page (images inlined as base64) with the status table of
// ui-screens.index, a screenshot per screen and the text of ui-screens.md.
//   node docs/ui/ui_index.mjs          docs/ui/shots-raw/NN.png -> docs/ui/shots/NN.jpg, then the page
//   node docs/ui/ui_index.mjs --html   the page only, from the JPGs already in docs/ui/shots/
// Screenshots come from: node tools/scenario.mjs docs/ui/ui_shots.mjs docs/ui/shots-raw
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(DIR, 'shots-raw');
const SHOTS = path.join(DIR, 'shots');
const htmlOnly = process.argv.includes('--html');

// ---------------------------------------------------------------- screenshots
if (!htmlOnly && fs.existsSync(RAW)) {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(RAW).filter((f) => /^\d\d[a-z]?\.png$/.test(f))) {
    await sharp(path.join(RAW, f)).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(path.join(SHOTS, f.replace('.png', '.jpg')));
    console.log('shot', f);
  }
}

// ---------------------------------------------------------------- tracker + document
const STATUS = { '[ ]': ['todo', 'Chưa làm'], '[~]': ['wip', 'Đang làm'], '[x]': ['done', 'Xong'], '[-]': ['skip', 'Bỏ / giữ nguyên'], '[?]': ['ask', 'Cần quyết định'] };
const rows = fs
  .readFileSync(path.join(DIR, 'ui-screens.index'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => /^\[.\]\s+\d\d/.test(l))
  .map((l) => {
    const [, mark, id, rest] = l.match(/^(\[.\])\s+(\d\d[a-z]?)\s+(.*)$/);
    const [name, kind, scene, object, layout] = rest.split(/\s{2,}/);
    return { mark, id, name, kind, scene, object, layout };
  });
const md = fs.readFileSync(path.join(DIR, 'ui-screens.md'), 'utf8');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

/** the small Markdown subset ui-screens.md uses: headings, lists, fenced code, tables, paragraphs */
function markdown(src) {
  const out = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push(`<pre>${esc(code.join('\n'))}</pre>`);
    } else if (/^#{1,4} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      const text = l.slice(n + 1);
      const id = text.match(/^(\d\d[a-z]?)\b/)?.[1];
      out.push(`<h${n + 1}${id ? ` id="s${id}"` : ''}>${inline(text)}</h${n + 1}>`);
      if (id && fs.existsSync(path.join(SHOTS, `${id}.jpg`))) out.push(`<img class="shot" alt="${id}" src="data:image/jpeg;base64,${fs.readFileSync(path.join(SHOTS, `${id}.jpg`)).toString('base64')}">`);
    } else if (/^\s*[-*] /.test(l)) {
      // two levels: "- item" and "  - sub item"; other indented lines continue the item above
      const items = [];
      for (; i < lines.length && /^\s*[-*] |^\s{2,}\S/.test(lines[i]); i++) {
        const m = lines[i].match(/^(\s*)[-*] (.*)$/);
        if (m && !m[1]) items.push({ text: m[2], sub: [] });
        else if (m) items[items.length - 1].sub.push(m[2]);
        else {
          const it = items[items.length - 1];
          if (it.sub.length) it.sub[it.sub.length - 1] += ' ' + lines[i].trim();
          else it.text += ' ' + lines[i].trim();
        }
      }
      i--;
      const li = (it) => `<li>${inline(it.text)}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>` : ''}</li>`;
      out.push(`<ul>${items.map(li).join('')}</ul>`);
    } else if (l.startsWith('|')) {
      const t = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) t.push(lines[i]);
      i--;
      const cells = (r) => r.slice(1, -1).split('|').map((c) => c.trim());
      out.push(`<table><tr>${cells(t[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${t.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`);
    } else if (l.startsWith('> ')) out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    else if (l.trim()) {
      const p = [l];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|```|\s*[-*] |\||> )/.test(lines[i + 1])) p.push(lines[++i]);
      out.push(`<p>${inline(p.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

const count = (k) => rows.filter((r) => STATUS[r.mark]?.[0] === k).length;
const links = [
  ['wireframes.html', 'Wireframes (3 concept)'],
  ['final/wireframe-final.html', 'Bản final'],
  ['UI_SPEC.md', 'UI_SPEC.md'],
]
  .filter(([f]) => fs.existsSync(path.join(DIR, f)))
  .map(([f, t]) => `<a href="${f}">${t}</a>`)
  .join(' · ');
const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rider Worlds UI</title>
<style>
:root { --bg: #0f1117; --panel: #181b24; --line: #2a2f3d; --text: #e6e8ef; --muted: #9aa0b2; --accent: #c86bff;
  --todo: #6b7280; --wip: #f59e0b; --done: #22c55e; --skip: #475569; --ask: #ef4444; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.55 "Segoe UI", system-ui, sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { margin: 0 0 4px; font-size: 26px; }
h2 { margin: 40px 0 8px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 21px; }
h3 { margin: 32px 0 8px; font-size: 18px; color: var(--accent); }
a { color: var(--accent); }
.sub { color: var(--muted); margin: 0 0 16px; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 16px; }
.pill { padding: 2px 10px; border-radius: 999px; font-size: 13px; background: var(--panel); border: 1px solid var(--line); }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
.todo { background: var(--todo); } .wip { background: var(--wip); } .done { background: var(--done); } .skip { background: var(--skip); } .ask { background: var(--ask); }
table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 14px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; }
.wrap { overflow-x: auto; }
code { font: 13px Consolas, monospace; background: var(--panel); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow-x: auto; font: 13px/1.4 Consolas, monospace; }
blockquote { margin: 8px 0; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--panel); color: var(--muted); }
img.shot { display: block; width: 100%; max-width: 960px; border: 1px solid var(--line); border-radius: 6px; margin: 8px 0 12px; }
.thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin: 16px 0; }
.thumbs a { text-decoration: none; color: var(--text); font-size: 13px; }
.thumbs img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border: 1px solid var(--line); border-radius: 6px; display: block; margin-bottom: 4px; }
</style>
</head>
<body>
<main>
<h1>Rider Worlds — UI</h1>
<p class="sub">Danh sách màn hình để theo dõi việc làm lại UI. Dựng lại bằng <code>node docs/ui/ui_index.mjs --html</code>. ${links}</p>
<div class="counts">${Object.values(STATUS).map(([k, label]) => `<span class="pill"><span class="dot ${k}"></span>${label}: ${count(k)}</span>`).join('')}</div>
<div class="wrap"><table>
<tr><th>Trạng thái</th><th>#</th><th>Màn</th><th>Loại</th><th>Scene</th><th>Object gốc</th><th>Bố cục</th></tr>
${rows.map((r) => `<tr><td><span class="dot ${STATUS[r.mark]?.[0]}"></span>${STATUS[r.mark]?.[1] ?? r.mark}</td><td>${r.id}</td><td><a href="#s${r.id}">${esc(r.name)}</a></td><td>${esc(r.kind)}</td><td>${esc(r.scene)}</td><td><code>${esc(r.object)}</code></td><td>${esc(r.layout)}</td></tr>`).join('\n')}
</table></div>
<div class="thumbs">${rows
  .filter((r) => fs.existsSync(path.join(SHOTS, `${r.id}.jpg`)))
  .map((r) => `<a href="#s${r.id}"><img alt="" data-shot="${r.id}">${r.id} ${esc(r.name)}</a>`)
  .join('')}</div>
${markdown(md)}
</main>
<script>
// the thumbnails reuse the screenshot of each section (each image is inlined once)
for (const t of document.querySelectorAll('img[data-shot]')) t.src = document.querySelector('img.shot[alt="' + t.dataset.shot + '"]')?.src || '';
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log(`docs/ui/index.html: ${rows.length} screens, ${(html.length / 1024).toFixed(0)} KB`);
