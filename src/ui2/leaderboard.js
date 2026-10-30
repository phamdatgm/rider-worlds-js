// Default leaderboard screen (docs/LEADERBOARD.md §4): an HTML overlay above the game canvas, any engine. Simple on
// purpose: a game that wants its own look draws its own screen with leaderboard.js and drops this file.
//
// Text comes from the game's t() (keys leaderboard.*, i18n/<tag>.json); a key the game has not added yet falls back
// to English here, so the screen never shows a raw key. No copyright / brand text (docs/INTEGRATION.md §9).

import { PERIODS, cleanName, cleanCountry } from '../sdk/leaderboard/leaderboard.js';
import { domArt } from './dom-art.js';

// border-image of a UI2 frame (tools/ui2-art.mjs): the shape edge sits on the element box, the glow outside it.
// Sprite px are 2 per design unit; `s` scales the corners for small elements.
const frame = (key, s = 1) => {
  const a = domArt[key];
  const d = (px) => `calc(${((px / 2) * s).toFixed(2)} * var(--u))`;
  return `border:0;background:none;border-image:url(${a.url}) ${a.slice.join(' ')} fill / ${a.slice.map(d).join(' ')} / ${d(a.pad)} stretch;`;
};

const EN = {
  title: 'Leaderboard',
  daily: 'Today',
  weekly: 'This week',
  monthly: 'This month',
  alltime: 'All time',
  loading: 'Loading…',
  offline: 'Could not load the leaderboard.',
  retry: 'Try again',
  empty: 'No scores yet. Be the first!',
  you: 'You',
  no_score: 'No score yet',
  more: 'More',
  edit_profile: 'Name & flag',
  name: 'Name',
  name_rule: 'Up to 20 letters, numbers, _ or -',
  country: 'Flag',
  save: 'Save',
  cancel: 'Cancel',
  save_failed: 'Could not save. Check the name and try again.',
  close: 'Close',
};

const CSS = `
.gmlb{--u:min(calc(100vw / 1280),calc(100dvh / 720));position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(0,0,0,.65);color:#fff;font:calc(15 * var(--u))/1.35 Arial,sans-serif;overscroll-behavior:contain}
.gmlb *{box-sizing:border-box}
.gmlb-panel{position:relative;width:calc(600 * var(--u));height:calc(500 * var(--u));${frame('cham_panel')}}
.gmlb-panel:has(.gmlb-form){height:calc(360 * var(--u));transform:translateY(calc(-14 * var(--u)))}
.gmlb-panel:has(.gmlb-form) .gmlb-head{left:calc(30 * var(--u));width:calc(480 * var(--u))}
.gmlb-panel:has(.gmlb-form) .gmlb-x{right:calc(-112 * var(--u));top:calc(-34 * var(--u))}
.gmlb-head{position:absolute;top:calc(10 * var(--u));left:0;width:100%;height:calc(44 * var(--u));display:flex;align-items:center;justify-content:center;font-size:calc(26 * var(--u));font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.gmlb button{font:inherit;color:inherit;cursor:pointer;padding:calc(6 * var(--u));${frame('cham_panel', 0.6)}}
.gmlb button:hover,.gmlb button:focus-visible{${frame('cham_active', 0.6)}outline:none}
.gmlb button:disabled{opacity:.5;cursor:default}
.gmlb .gmlb-x{position:absolute;right:calc(-22 * var(--u));top:calc(-28 * var(--u));width:calc(56 * var(--u));height:calc(48 * var(--u));font-size:calc(26 * var(--u));padding:0;${frame('hex_panel', 48 / 52)}}
.gmlb .gmlb-x:hover,.gmlb .gmlb-x:focus-visible{${frame('hex_active', 48 / 52)}}
.gmlb-tabs{position:absolute;left:calc(20 * var(--u));top:calc(60 * var(--u));display:flex;gap:calc(6 * var(--u));height:calc(40 * var(--u))}
.gmlb-tabs button{width:calc(134 * var(--u));text-transform:uppercase;font-weight:700}
.gmlb-tabs button[aria-selected=true]{${frame('cham_active', 0.6)}}
.gmlb-list{position:absolute;left:calc(20 * var(--u));top:calc(112 * var(--u));width:calc(560 * var(--u));height:calc(264 * var(--u));overflow-y:auto;scrollbar-color:#b03cff #0c0a1e;scrollbar-width:thin}
.gmlb-row{height:calc(40 * var(--u));margin-bottom:calc(4 * var(--u));display:flex;align-items:center;gap:calc(12 * var(--u));padding:0 calc(12 * var(--u));${frame('cham_row', 0.5)}}
.gmlb-row.me{${frame('cham_active', 0.5)}}
.gmlb-rank{width:calc(42 * var(--u));text-align:right;font-weight:700;color:#c9c6e8}
.gmlb-flag{width:calc(26 * var(--u));height:calc(18 * var(--u));object-fit:contain;flex:none}
.gmlb-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gmlb-score{font-variant-numeric:tabular-nums;font-weight:700;color:#4fd8ff}
.gmlb-note{padding:calc(12 * var(--u));color:#c9c6e8;text-align:center}
.gmlb-note button{margin-top:calc(10 * var(--u));min-width:calc(200 * var(--u))}
.gmlb-foot{position:absolute;left:calc(20 * var(--u));top:calc(430 * var(--u));width:calc(560 * var(--u));height:calc(52 * var(--u));display:flex;gap:calc(10 * var(--u))}
.gmlb-foot .gmlb-row{width:calc(400 * var(--u));height:100%}
.gmlb-actions{display:flex;justify-content:flex-end;gap:calc(10 * var(--u))}
.gmlb-foot .gmlb-actions button{width:calc(150 * var(--u));height:100%}
.gmlb-form{position:absolute;inset:calc(66 * var(--u)) calc(30 * var(--u)) calc(20 * var(--u));display:flex;flex-direction:column;gap:calc(12 * var(--u))}
.gmlb-form label{display:flex;flex-direction:column;gap:calc(4 * var(--u));color:#c9c6e8}
.gmlb-form input,.gmlb-form select{font:inherit;color:#fff;padding:calc(7 * var(--u)) calc(12 * var(--u));min-width:0;${frame('cham_row', 0.5)}}
.gmlb-form select{appearance:none;-webkit-appearance:none}
.gmlb-form select option{background:#0c0a1e}
.gmlb-pick{display:flex;align-items:center;gap:calc(12 * var(--u))}
.gmlb-pick select{flex:1}
.gmlb-error{height:calc(34 * var(--u));color:#ff3b4f}
.gmlb-hint{font-size:calc(15 * var(--u));opacity:.8}
.gmlb-form .gmlb-actions button{width:calc(145 * var(--u));height:calc(48 * var(--u))}
.gmlb-form>label{position:absolute;width:100%;height:calc(76 * var(--u))}
.gmlb-form>label:nth-of-type(2){top:calc(88 * var(--u));height:calc(52 * var(--u))}
.gmlb-form>.gmlb-error{position:absolute;top:calc(152 * var(--u))}
.gmlb-form>.gmlb-actions{position:absolute;top:calc(200 * var(--u));right:0}
.gmlb-form>.gmlb-actions button:first-child{width:calc(140 * var(--u))}
.gmlb-form>.gmlb-actions button:last-child{width:calc(150 * var(--u))}
.gmlb-status{position:absolute;left:calc(20 * var(--u));top:calc(378 * var(--u));width:calc(560 * var(--u));height:calc(40 * var(--u));color:#c9c6e8;display:flex;justify-content:flex-end;align-items:center}
.gmlb-status .gmlb-note{padding:0}
.gmlb-status button{width:calc(270 * var(--u));height:calc(40 * var(--u));margin:0}
@media (max-height:480px){.gmlb .gmlb-x{min-width:40px;min-height:40px}}
@media (orientation:portrait){.gmlb{--u:min(calc(94vw / 600),calc(88dvh / 520));font-size:max(12px,calc(15 * var(--u)))}.gmlb-panel{max-width:94vw}.gmlb button{font-size:inherit}}
`;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * Open the leaderboard screen.
 *
 *   import { openLeaderboard } from './sdk/leaderboard/ui.js';
 *   openLeaderboard({ board, t, onClose: () => resumeMenu() });
 *
 * @param {object} o
 * @param {object} o.board        createLeaderboard(...) of leaderboard.js
 * @param {(key: string, ...a: unknown[]) => string} [o.t]  the game's t(); English when missing
 * @param {string} [o.assets]     folder of flags/ and countries.json in the package (default assets/leaderboard/)
 * @param {string} [o.period]     first tab (default alltime)
 * @param {number} [o.pageSize]   rows per page (default 20)
 * @param {() => void} [o.onClose]
 * @returns {{ close(): void }}
 */
export function openLeaderboard({ board, t, assets = 'assets/leaderboard/', period = 'alltime', pageSize = 20, onClose } = {}) {
  if (!document.getElementById('gmlb-style')) {
    const style = el('style');
    style.id = 'gmlb-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const text = (key) => {
    const full = `leaderboard.${key}`;
    let s;
    try {
      s = t ? t(full) : undefined;
    } catch {
      s = undefined;
    }
    return typeof s === 'string' && s && s !== full ? s : EN[key];
  };
  const flagUrl = (code) => `${assets}flags/${code || 'GLOBE'}.png`;
  const flag = (code) => {
    const img = el('img', 'gmlb-flag');
    img.alt = code || '';
    img.src = flagUrl(code);
    img.onerror = () => {
      img.onerror = null;
      img.src = flagUrl('');
    };
    return img;
  };
  const row = (e, me) => {
    const r = el('div', me ? 'gmlb-row me' : 'gmlb-row');
    r.append(el('span', 'gmlb-rank', e.rank ? `#${e.rank}` : '–'), flag(e.country), el('span', 'gmlb-name', e.name || '—'), el('span', 'gmlb-score', String(e.score)));
    return r;
  };

  const root = el('div', 'gmlb');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const panel = el('div', 'gmlb-panel');
  root.appendChild(panel);
  document.body.appendChild(root);

  let closed = false;
  let current = PERIODS.includes(period) ? period : 'alltime';
  let loadId = 0;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close();
  });

  function head(title) {
    const h = el('div', 'gmlb-head');
    const x = el('button', 'gmlb-x', '×');
    x.setAttribute('aria-label', text('close'));
    x.addEventListener('click', close);
    h.append(el('span', '', title), x);
    return h;
  }

  function showBoard() {
    panel.replaceChildren(head(text('title')));
    const tabs = el('div', 'gmlb-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const p of PERIODS) {
      const b = el('button', '', text(p));
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(p === current));
      b.addEventListener('click', () => {
        current = p;
        showBoard();
      });
      tabs.appendChild(b);
    }
    const list = el('div', 'gmlb-list');
    const foot = el('div', 'gmlb-foot');
    const status = el('div', 'gmlb-status');
    status.setAttribute('aria-live', 'polite');
    panel.append(tabs, list, status, foot);
    load(list, foot, status);
  }

  async function load(list, foot, status) {
    const id = ++loadId;
    list.replaceChildren();
    status.replaceChildren(el('div', 'gmlb-note', text('loading')));
    foot.replaceChildren();
    const [page, mine] = await Promise.all([board.top(current, { offset: 0, limit: pageSize }), board.me(current)]);
    if (closed || id !== loadId) return;
    status.replaceChildren();
    const myId = board.player()?.id;
    if (!page) {
      const note = el('div', 'gmlb-note', text('offline'));
      const retry = el('button', '', text('retry'));
      retry.addEventListener('click', () => load(list, foot, status));
      note.append(el('br'), retry);
      status.replaceChildren(note);
    } else if (!page.entries.length) {
      status.replaceChildren(el('div', 'gmlb-note', text('empty')));
    } else {
      list.replaceChildren(...page.entries.map((e) => row(e, e.playerId === myId)));
      let shown = page.entries.length;
      if (shown < page.total) {
        const more = el('button', '', text('more'));
        const wrap = el('div', 'gmlb-note');
        wrap.appendChild(more);
        more.addEventListener('click', async () => {
          more.disabled = true;
          const next = await board.top(current, { offset: shown, limit: pageSize });
          if (closed || id !== loadId) return;
          if (!next) {
            more.disabled = false;
            return;
          }
          shown += next.entries.length;
          list.append(...next.entries.map((e) => row(e, e.playerId === myId)));
          if (shown >= next.total || !next.entries.length) wrap.remove();
          else more.disabled = false;
        });
        status.appendChild(wrap);
      }
    }
    // The player's own line: rank and score, or "no score yet"; the name / flag button.
    const p = board.player();
    if (p) {
      const me = mine ? row({ ...mine, name: p.name, country: p.country }, true) : row({ rank: 0, name: p.name, country: p.country, score: text('no_score') }, true);
      const actions = el('div', 'gmlb-actions');
      const edit = el('button', '', text('edit_profile'));
      edit.addEventListener('click', showProfile);
      actions.appendChild(edit);
      foot.append(me, actions);
    }
  }

  async function showProfile() {
    const p = board.player() ?? { name: '', country: '' };
    panel.replaceChildren(head(text('edit_profile')));
    const form = el('form', 'gmlb-form');
    const nameBox = el('label', '', text('name'));
    const name = el('input');
    name.maxLength = 20;
    name.value = p.name;
    name.autocomplete = 'off';
    name.spellcheck = false;
    // The server's rule (1-20 of A-Z a-z 0-9 _ -): cleaned while typing, so Save never sends a name it refuses.
    name.addEventListener('input', () => {
      const clean = cleanName(name.value);
      if (clean !== name.value) name.value = clean;
    });
    nameBox.append(name, el('span', 'gmlb-hint', text('name_rule')));

    const countryBox = el('label', '', text('country'));
    const pick = el('div', 'gmlb-pick');
    const preview = flag(p.country);
    const select = el('select');
    select.appendChild(new Option('—', ''));
    pick.append(preview, select);
    countryBox.appendChild(pick);
    select.addEventListener('change', () => {
      preview.src = flagUrl(select.value);
    });
    fetch(`${assets}countries.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        for (const c of Array.isArray(list) ? list : []) select.appendChild(new Option(c.name, c.code));
        select.value = p.country;
      })
      .catch(() => {
        if (p.country) select.appendChild(new Option(p.country, p.country));
        select.value = p.country;
      });

    const error = el('div', 'gmlb-error');
    const actions = el('div', 'gmlb-actions');
    const cancel = el('button', '', text('cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', showBoard);
    const save = el('button', '', text('save'));
    save.type = 'submit';
    actions.append(cancel, save);
    form.append(nameBox, countryBox, error, actions);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save.disabled = true;
      error.textContent = '';
      const ok = await board.setPlayer({ name: cleanName(name.value), country: cleanCountry(select.value) });
      if (closed) return;
      save.disabled = false;
      if (ok) showBoard();
      else error.textContent = text('save_failed');
    });
    panel.appendChild(form);
    name.focus();
  }

  showBoard();
  return { close };
}
