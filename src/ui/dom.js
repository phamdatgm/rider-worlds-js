// Small DOM helpers shared by the menu screens: elements, formatting, modal stack, tooltips, fly-to-bar particles.
import { Sprites, spr } from '../game/sprites.js';
import { Meta } from '../meta/data.js';
import { AudioService, AudioSampleID } from '../engine/audio.js';

/** play a UI sound by AudioSampleID name */
export function sfx(name) {
  const id = AudioSampleID[name];
  if (id) AudioService.Play(id);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** ToLargeNumberString: thousands separators, K/M/B above 99,999 */
export function fmtNum(v) {
  v = Math.round(v || 0);
  if (v > -9999 && v < 99999) return v.toLocaleString('en-US');
  const units = ['', 'K', 'M', 'B', 'T'];
  let g = Math.floor((String(Math.abs(v)).length - 1) / 3);
  g = Math.min(g, units.length - 1);
  return `${String(Number((v / 10 ** (3 * g)).toFixed(3))).slice(0, 5)} ${units[g]}`;
}

/** "mm:ss" below one hour, else "hh:mm:ss" */
export function fmtTimer(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function rgb(c, a = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

export function rarityColor(r) {
  return rgb(Meta.data.rarity[r]?.color || [1, 1, 1]);
}

export const RARITY_TEXT = ['Common', 'Rare', 'Epic', 'Legendary', 'Special'];

export const ICON = {
  soft: 'S_Icon_SoftCurrency',
  hard: 'S_Icon_HardCurrency',
  star: 'S_Icon_StarRank_3D',
  starReward: 'S_Icon_Star_Reward_A',
  lock: 'S_Lock',
  check: 'S_Icon_Check',
  close: 'S_Icon_Close',
  settings: 'S_Icon_Settings',
};

export function currencyIcon(id) {
  if (id === 'Currency_Soft' || id === 'Currency_SoftRange') return ICON.soft;
  if (id === 'Currency_Hard' || id === 'Currency_HardRange') return ICON.hard;
  if (id === 'Currency_Star') return ICON.starReward;
  return null;
}

// ---------------------------------------------------------------- modal stack

export const Modals = {
  stack: [],
  layer: null,
  get open() {
    return this.stack.length > 0;
  },
  /** push a modal; returns {el, close} */
  push(html, cls = '', { onClose, dim = true } = {}) {
    const wrap = el('div', `modal ${dim ? 'dim' : ''} ${cls ? `m-${cls}` : ''}`, html);
    this.layer.appendChild(wrap);
    const m = {
      el: wrap,
      closed: false,
      close: () => {
        if (m.closed) return;
        m.closed = true;
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 180);
        const i = this.stack.indexOf(m);
        if (i >= 0) this.stack.splice(i, 1);
        onClose?.();
      },
    };
    this.stack.push(m);
    requestAnimationFrame(() => wrap.classList.add('in'));
    return m;
  },
  closeAll() {
    for (const m of [...this.stack]) m.close();
  },
};

// ---------------------------------------------------------------- tooltip

let tipTimer = 0;
export function tooltip(text, anchor) {
  let t = $('#tooltip');
  if (!t) {
    t = el('div', '', '');
    t.id = 'tooltip';
    document.getElementById('ui').appendChild(t);
  }
  t.innerHTML = text;
  t.classList.remove('show');
  void t.offsetWidth;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    t.style.left = `${Math.min(window.innerWidth - 20, Math.max(20, r.left + r.width / 2))}px`;
    t.style.top = `${Math.max(40, r.top - 8)}px`;
  } else {
    t.style.left = '50%';
    t.style.top = '45%';
  }
  t.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------------------------------------------------------------- reward particles flying to the top bar

export const Fly = {
  active: 0,
  /** fly `count` icons from `from` (element or {x,y}) to `to` (element); resolves when all arrived */
  icons(sprite, from, to, count = 8) {
    const layer = document.getElementById('ui');
    const p0 = pointOf(from);
    const p1 = pointOf(to);
    if (!p0 || !p1) return Promise.resolve();
    count = Math.max(1, Math.min(count, 14));
    this.active++;
    return new Promise((resolve) => {
      let left = count;
      for (let i = 0; i < count; i++) {
        const d = el('div', 'fly', spr(sprite, 26));
        layer.appendChild(d);
        const sx = p0.x + (Math.random() - 0.5) * 90;
        const sy = p0.y + (Math.random() - 0.5) * 60;
        d.style.transform = `translate(${p0.x}px,${p0.y}px) scale(0.4)`;
        const delay = i * 45;
        d.animate(
          [
            { transform: `translate(${p0.x}px,${p0.y}px) scale(0.3)`, opacity: 0 },
            { transform: `translate(${sx}px,${sy}px) scale(1)`, opacity: 1, offset: 0.35 },
            { transform: `translate(${p1.x}px,${p1.y}px) scale(0.7)`, opacity: 1 },
          ],
          { duration: 750, delay, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' },
        ).onfinish = () => {
          d.remove();
          if (--left === 0) {
            this.active--;
            to?.classList?.remove('bump');
            void to?.offsetWidth;
            to?.classList?.add('bump');
            resolve();
          }
        };
      }
    });
  },
};

function pointOf(x) {
  if (!x) return null;
  if (x.getBoundingClientRect) {
    const r = x.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2 - 13, y: r.top + r.height / 2 - 13 };
  }
  return { x: x.x - 13, y: x.y - 13 };
}

export { spr, Sprites };
