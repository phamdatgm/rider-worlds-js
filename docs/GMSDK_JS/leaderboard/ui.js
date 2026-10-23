// Default leaderboard screen (docs/LEADERBOARD.md §4): an HTML overlay above the game canvas, any engine. Simple on
// purpose: a game that wants its own look draws its own screen with leaderboard.js and drops this file.
//
// Text comes from the game's t() (keys leaderboard.*, i18n/<tag>.json); a key the game has not added yet falls back
// to English here, so the screen never shows a raw key. No copyright / brand text (docs/INTEGRATION.md §9).

import { PERIODS, cleanName } from './leaderboard.js';

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
.gmlb{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.6);font:clamp(13px,2.2vmin,16px)/1.35 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#eef}
.gmlb *{box-sizing:border-box}
.gmlb-panel{display:flex;flex-direction:column;width:min(440px,94vw);max-height:92vh;border-radius:14px;
  background:#1c1f2a;box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden}
.gmlb-head{display:flex;align-items:center;padding:12px 14px 6px;font-weight:700;font-size:1.2em}
.gmlb-head span{flex:1}
.gmlb button{font:inherit;color:inherit;cursor:pointer;border:0;border-radius:8px;background:#2c3142;padding:.45em .9em}
.gmlb button:hover{background:#373d52}
.gmlb button:disabled{opacity:.5;cursor:default}
.gmlb .gmlb-x{background:none;font-size:1.3em;line-height:1;padding:.2em .45em}
.gmlb-tabs{display:flex;gap:4px;padding:4px 10px 8px}
.gmlb-tabs button{flex:1;padding:.4em .2em;font-size:.88em;background:#252937}
.gmlb-tabs button[aria-selected=true]{background:#4a6cf7;color:#fff}
.gmlb-list{flex:1;overflow-y:auto;padding:0 10px;min-height:120px}
.gmlb-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px}
.gmlb-row:nth-child(odd){background:rgba(255,255,255,.03)}
.gmlb-row.me{background:rgba(74,108,247,.22)}
.gmlb-rank{width:2.6em;text-align:right;font-weight:700;opacity:.85}
.gmlb-flag{width:1.6em;height:1.1em;object-fit:cover;border-radius:2px;flex:none}
.gmlb-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gmlb-score{font-variant-numeric:tabular-nums;font-weight:600}
.gmlb-note{padding:24px 8px;text-align:center;opacity:.8}
.gmlb-note button{margin-top:10px}
.gmlb-foot{border-top:1px solid rgba(255,255,255,.08);padding:8px 10px 10px}
.gmlb-foot .gmlb-row{background:rgba(74,108,247,.22)}
.gmlb-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.gmlb-form{display:flex;flex-direction:column;gap:10px;padding:6px 14px 14px}
.gmlb-form label{display:flex;flex-direction:column;gap:4px;font-size:.9em;opacity:.9}
.gmlb-form input,.gmlb-form select{font:inherit;color:#eef;background:#252937;border:1px solid #3a4054;border-radius:8px;padding:.5em .6em}
.gmlb-pick{display:flex;align-items:center;gap:8px}
.gmlb-pick select{flex:1;min-width:0}
.gmlb-error{color:#ff8a80;font-size:.9em}
.gmlb-hint{font-size:.85em;opacity:.65}
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
    panel.append(tabs, list, foot);
    load(list, foot);
  }

  async function load(list, foot) {
    const id = ++loadId;
    list.replaceChildren(el('div', 'gmlb-note', text('loading')));
    foot.replaceChildren();
    const [page, mine] = await Promise.all([board.top(current, { offset: 0, limit: pageSize }), board.me(current)]);
    if (closed || id !== loadId) return;
    const myId = board.player()?.id;
    if (!page) {
      const note = el('div', 'gmlb-note', text('offline'));
      const retry = el('button', '', text('retry'));
      retry.addEventListener('click', () => load(list, foot));
      note.append(el('br'), retry);
      list.replaceChildren(note);
    } else if (!page.entries.length) {
      list.replaceChildren(el('div', 'gmlb-note', text('empty')));
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
          wrap.before(...next.entries.map((e) => row(e, e.playerId === myId)));
          if (shown >= next.total || !next.entries.length) wrap.remove();
          else more.disabled = false;
        });
        list.appendChild(wrap);
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
      const ok = await board.setPlayer({ name: name.value, country: select.value });
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
