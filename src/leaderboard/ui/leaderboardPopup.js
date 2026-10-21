// Rider Worlds leaderboard popup (DOM over the WebGL canvas). Replaces the kit's sample UIs (leaderboardUi.js +
// profileUi.js, fixed 1920x1080 layout with sprites the kit leaves to each game): one responsive panel with the
// player's name + flag, the period tabs, 10 rows and a pager. Styles: .lb-* in src/style.css.
//
// Kept from the kit's samples (README "Thay UI"), each one from a real bug:
//   1. a page is drawn in one go once its flags are decoded (no flags popping in row by row);
//   2. decoded flags are held (uiKit.decodeImage), so a tab left in the background does not come back blank;
//   3. getScores() === null is a failed request, not an empty board.
import { leaderboard, profile, RANGES } from '../src/leaderboard.js';
import { leaderboardConfig as cfg } from '../config.mjs';
import { DIR, flagUrl, decodeImage, decodeImages } from './uiKit.js';
import { t } from '../../sdk/i18n.js';

/** InputField characterLimit 15, Content Type Alphanumeric - as the Unity builds */
const NAME_MAX = 15;

const RANGE_LABEL = {
  today: () => t('lb_today'),
  week: () => t('lb_week'),
  month: () => t('lb_month'),
  alltime: () => t('lb_alltime'),
};

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

const fmtScore = (s) => (Number.isFinite(s) ? Math.round(s).toLocaleString('en-US') : '');

/** the menu's popup look: bevelled neon frame (glow) > border > dark body; returns the body */
function framed(parent, cls) {
  const frame = el('div', `lb-frame ${cls}`, parent);
  const body = el('div', 'lb-body', el('div', 'lb-border', frame));
  return { frame, body };
}

/** black hexagon with a white edge (the menu's close / arrow buttons) */
function hexButton(parent, cls, glyph) {
  const b = el('button', `lb-hex ${cls}`, parent);
  el('span', '', b, glyph);
  return b;
}

function closeButton(parent, onClick) {
  const b = hexButton(parent, 'lb-close', '✕');
  b.addEventListener('click', onClick);
  return b;
}

export class LeaderboardPopup {
  constructor(root = document.body) {
    this.root = el('div', 'lb-overlay', root);
    this.root.hidden = true;
    // the game reads the keyboard on window: typing a name must not accelerate / restart the run
    for (const type of ['keydown', 'keyup']) this.root.addEventListener(type, (e) => e.stopPropagation());
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });

    const { frame, body: panel } = framed(this.root, 'lb-panel');
    closeButton(frame, () => this.hide());
    el('h2', 'lb-title', panel, t('leaderboard'));

    // ---- me: flag + name
    const me = el('div', 'lb-me', panel);
    this.flagBtn = el('button', 'lb-flagbtn', me);
    this.flagBtn.title = t('lb_pick_flag');
    this.flagBtn.addEventListener('click', () => this.openFlags());
    this.flagImg = el('img', '', this.flagBtn);
    this.flagImg.alt = '';
    this.input = el('input', 'lb-name', me);
    Object.assign(this.input, { type: 'text', maxLength: NAME_MAX, placeholder: t('lb_your_name'), spellcheck: false, autocomplete: 'off' });
    this.input.addEventListener('input', () => {
      const clean = this.input.value.replace(/[^A-Za-z0-9]/g, '');
      if (clean !== this.input.value) this.input.value = clean;
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.input.blur();
    });
    this.input.addEventListener('blur', () => this.commitName());

    // ---- period tabs
    const tabs = el('div', 'lb-tabs', panel);
    this.tabs = RANGES.map((range) => {
      const b = el('button', 'lb-tab', tabs, RANGE_LABEL[range]?.() ?? range);
      // pressing the selected tab again reloads page 1, like the original
      b.addEventListener('click', () => this.load(range, 0));
      return { range, b };
    });

    // ---- table
    const table = el('div', 'lb-table', panel);
    const head = el('div', 'lb-row lb-head', table);
    el('span', 'lb-rank', head, t('lb_rank'));
    el('span', 'lb-flag', head);
    el('span', 'lb-player', head, t('lb_name'));
    el('span', 'lb-score', head, t('lb_score'));
    this.rows = Array.from({ length: cfg.pageSize }, () => {
      const r = el('div', 'lb-row', table);
      const rank = el('span', 'lb-rank', r);
      const flag = el('img', 'lb-flag', el('span', 'lb-flag', r));
      flag.alt = '';
      const name = el('span', 'lb-player', r);
      const score = el('span', 'lb-score', r);
      return { r, rank, flag, name, score };
    });
    this.status = el('div', 'lb-status', table);

    // ---- pager
    const pager = el('div', 'lb-pager', panel);
    this.prev = hexButton(pager, 'lb-arrow', '‹');
    this.pageText = el('span', 'lb-page', pager, '1');
    this.next = hexButton(pager, 'lb-arrow', '›');
    this.prev.addEventListener('click', () => this.prevOk && this.load(this.range, (this.page - 1) * cfg.pageSize));
    this.next.addEventListener('click', () => this.nextOk && this.load(this.range, (this.page + 1) * cfg.pageSize));

    // ---- flag picker
    this.flags = el('div', 'lb-flags', this.root);
    this.flags.hidden = true;
    const { frame: fframe, body: fp } = framed(this.flags, 'lb-flagpanel');
    closeButton(fframe, () => (this.flags.hidden = true));
    el('h2', 'lb-title', fp, t('lb_pick_flag'));
    this.flagGrid = el('div', 'lb-flaggrid', fp);
    this.countries = null;

    this.range = RANGES[0];
    this.page = 0;
    this.req = 0;
    this.playerId = null;
  }

  get isOpen() {
    return !this.root.hidden;
  }

  show() {
    this.root.hidden = false;
    this.paintMe();
    leaderboard.init().then((sdk) => {
      this.playerId = sdk?.getPlayerId?.() ?? null;
    });
    this.load(RANGES[0], 0);
  }

  hide() {
    this.input.blur();
    this.flags.hidden = true;
    this.root.hidden = true;
    this.req++; // a late answer must not draw into a closed popup
  }

  // ---------------------------------------------------------------- name + flag

  paintMe() {
    const p = profile.get();
    if (document.activeElement !== this.input) this.input.value = p.name ?? '';
    this.flagImg.src = p.country ? flagUrl(p.country) : `${DIR}flag_normal.png`;
  }

  /** an empty name is not saved (PlayerNameInputControl.onEndEdit); the backend may refuse a name */
  async commitName() {
    const name = this.input.value;
    const p = profile.get();
    if (!name || name === p.name) {
      this.paintMe();
      return;
    }
    await profile.set({ name, country: p.country });
    this.paintMe();
    if (this.isOpen) this.load(this.range, this.page * cfg.pageSize);
  }

  async openFlags() {
    this.flags.hidden = false;
    if (!this.countries) {
      try {
        this.countries = (await (await fetch(`${DIR}country_list.json`)).json()).data ?? [];
      } catch (e) {
        console.error('[leaderboard] country_list.json failed to load:', e);
        this.countries = null;
        return;
      }
      await decodeImages(this.countries.map((c) => flagUrl(c.country_iso_code)));
      for (const c of this.countries) {
        const iso = c.country_iso_code;
        const b = el('button', 'lb-flagitem', this.flagGrid);
        b.title = c.country_name ?? iso;
        const img = el('img', '', b);
        img.src = flagUrl(iso);
        img.alt = iso;
        b.addEventListener('click', () => this.pickFlag(iso));
      }
    }
  }

  async pickFlag(iso) {
    this.flags.hidden = true;
    const p = profile.get();
    if (iso === p.country) return;
    await profile.set({ name: p.name, country: iso });
    this.paintMe();
    if (this.isOpen) this.load(this.range, this.page * cfg.pageSize);
  }

  // ---------------------------------------------------------------- board

  clear() {
    for (const row of this.rows) {
      row.r.classList.remove('lb-mine');
      row.r.style.visibility = 'hidden';
    }
  }

  async load(range, offset) {
    const req = ++this.req;
    this.range = range;
    for (const tab of this.tabs) tab.b.classList.toggle('lb-on', tab.range === range);
    this.page = Math.floor(offset / cfg.pageSize);
    this.pageText.textContent = String(this.page + 1);
    this.prevOk = this.nextOk = false;
    this.prev.disabled = this.next.disabled = true;
    this.clear();
    this.status.textContent = t('lb_loading');
    this.status.hidden = false;

    const data = await leaderboard.getScores(range, offset, cfg.pageSize);
    if (req !== this.req) return;
    if (!data) {
      this.status.textContent = t('lb_failed');
      this.prevOk = this.page > 0;
      this.prev.disabled = !this.prevOk;
      return;
    }
    const entries = data.entries.slice(0, cfg.pageSize);
    await Promise.all([...new Set(entries.map((e) => e.country).filter(Boolean))].map((iso) => decodeImage(flagUrl(iso))));
    if (req !== this.req) return;

    this.status.hidden = entries.length > 0;
    this.status.textContent = entries.length ? '' : t('lb_empty');
    entries.forEach((e, i) => {
      const row = this.rows[i];
      row.r.style.visibility = '';
      row.r.classList.toggle('lb-mine', !!this.playerId && e.playerId === this.playerId);
      row.rank.textContent = String(e.rank);
      row.flag.style.visibility = e.country ? '' : 'hidden';
      if (e.country) row.flag.src = flagUrl(e.country);
      row.name.textContent = e.name;
      row.score.textContent = fmtScore(e.score);
    });
    this.prevOk = this.page > 0;
    this.nextOk = data.total > offset + cfg.pageSize;
    this.prev.disabled = !this.prevOk;
    this.next.disabled = !this.nextOk;
  }
}
