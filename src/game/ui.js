// DOM user interface core: loading screen, HUD, jump score text, flash/fade, pause and level results.
// The main menu lives in ui/menu.js, in-run meta UI (revive, compliments, challenge popups) in ui/run.js.
import { Time } from '../engine/core.js';
import { AudioService } from '../engine/audio.js';
import { Render } from '../engine/render.js';
import { Game, RunMode } from './state.js';
import { spr } from './sprites.js';
import { T } from '../meta/data.js';
import { Modals } from '../ui/dom.js';
import { MenuUI } from '../ui/menu.js';
import { RunUI } from '../ui/run.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const DIFF = ['Easy', 'Moderate', 'Difficult'];

function fmtTime(s) {
  if (s === undefined || s < 0) return '--.---';
  return Math.min(s, 99.999).toFixed(3);
}

export const UI = {
  root: null,
  handlers: {},

  init(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    root.innerHTML = `
      <div id="loading" class="screen"><div class="logo">RIDER<span>WORLDS</span></div><div class="bar"><i></i></div><div class="hint"></div></div>
      <div id="menu" class="hidden"></div>
      <div id="hud" class="hidden">
        <div class="top">
          <button class="icon" id="btn-pause" title="Pause">${spr('S_Icon_Pause', 26)}</button>
          <div class="score"><div class="value">0</div><div class="sub"></div></div>
          <div class="gems">${spr('S_Icon_SoftCurrency', 22)}<span class="v">0</span></div>
        </div>
        <button class="icon hidden" id="btn-restart" title="Restart">${spr('S_Restart', 26)}</button>
        <div class="stars hidden"></div>
        <div id="jump"></div>
        <div id="tap" class="hidden">HOLD TO RIDE &nbsp;·&nbsp; HOLD IN AIR TO FLIP</div>
      </div>
      <div id="pause" class="screen dim hidden"><div class="panel"><h2>${T('UI/Pause/PauseTitle')}</h2>
        <button data-a="resume">${T('UI/Pause/Resume')}</button><button data-a="restart">RESTART</button><button data-a="menu">${T('UI/Quit')}</button></div></div>
      <div id="results" class="screen dim hidden"><div class="panel"></div></div>
      <div id="popups"></div>
      <div id="flash"></div><div id="fade"></div>`;
    Modals.layer = $('#popups');
    $('#btn-pause').addEventListener('click', () => this.handlers.pause?.());
    $('#btn-restart').addEventListener('click', () => this.handlers.levelRestart?.());
    $('#pause').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a) this.handlers[a]?.();
    });
    RunUI.init($('#hud'));
    MenuUI.init($('#menu'), handlers.menuApp);
    this._hudLoop();
  },

  loading(p, hint) {
    $('#loading').classList.remove('hidden');
    $('#loading .bar i').style.width = `${Math.round(p * 100)}%`;
    if (hint !== undefined) $('#loading .hint').textContent = hint;
  },

  hideLoading() {
    $('#loading').classList.add('hidden');
  },

  // ---------------------------------------------------------------- menu
  showMenu(world = 0) {
    this.hideAll(true);
    MenuUI.show(world);
  },

  hideAll(keepMenu) {
    for (const id of ['#hud', '#pause', '#results', '#loading']) $(id).classList.add('hidden');
    if (!keepMenu) MenuUI.hide();
  },

  // ---------------------------------------------------------------- HUD
  showHud(mode) {
    this.hideAll();
    this.mode = mode;
    $('#hud').classList.remove('hidden');
    const stars = $('#hud .stars');
    const timed = mode.RunMode === RunMode.TimedLevel;
    $('#btn-restart').classList.toggle('hidden', !timed);
    $('#hud .gems').classList.toggle('hidden', timed);
    if (timed) {
      stars.classList.remove('hidden');
      stars.innerHTML = `<span class="name">${T(`UI/Levels/${DIFF[mode.level.difficulty]}Level`, { 0: mode.level.number })}</span>
        <span class="t3">★★★ ${mode.level.threeStarTime.toFixed(3)}</span><span class="t2">★★ ${mode.level.twoStarTime.toFixed(3)}</span>`;
    } else stars.classList.add('hidden');
    $('#jump').innerHTML = '';
    this.showTap(true);
    RunUI.onRunShown(mode);
  },

  showTap(v) {
    $('#tap').classList.toggle('hidden', !v);
  },

  _hudLoop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const hud = $('#hud');
      if (!hud || hud.classList.contains('hidden') || !Game.manager) return;
      const rs = Game.manager.RunState;
      const st = rs.StatTracker;
      if (!st || !rs.Mode) return;
      const val = $('#hud .score .value');
      const sub = $('#hud .score .sub');
      if (rs.Mode.RunMode === RunMode.TimedLevel) {
        const t = Math.max(rs.RunTimer.GetElapsedTime(true), 0);
        val.textContent = fmtTime(t);
        val.classList.toggle('capped', t >= 99.999);
        const l = rs.Mode.level;
        sub.textContent = t <= l.threeStarTime ? '★★★' : t <= l.twoStarTime ? '★★' : '★';
      } else {
        val.textContent = st.Score;
        sub.textContent = `${Math.max(0, Math.floor(rs.PlayerState.DistanceX))} m`;
      }
      $('#hud .gems .v').textContent = st.SoftCurrency;
    };
    requestAnimationFrame(tick);
  },

  jumpText(flips, text, complete, locked = false, perfect = false) {
    const box = $('#jump');
    if (!this._jumpEl || this._jumpEl.dataset.done) {
      this._jumpEl = el('div', 'jt');
      box.appendChild(this._jumpEl);
    }
    const j = this._jumpEl;
    j.style.fontSize = `${[70, 80, 90, 120][Math.max(0, Math.min(flips - 1, 3))] / 100}em`;
    j.innerHTML = `<div class="flips">${flips > 1 ? `${flips}x ` : ''}FLIP</div><div class="pts ${locked ? 'locked' : ''}">${locked ? '+0' : text}</div>${perfect ? '<div class="perfect">PERFECT!</div>' : ''}`;
    j.classList.remove('pop');
    void j.offsetWidth;
    j.classList.add('pop');
    if (complete) {
      j.dataset.done = '1';
      j.classList.add('done');
      setTimeout(() => j.remove(), 1200);
    }
  },

  jumpFailed() {
    if (this._jumpEl && !this._jumpEl.dataset.done) {
      this._jumpEl.dataset.done = '1';
      this._jumpEl.classList.add('failed');
      const j = this._jumpEl;
      setTimeout(() => j.remove(), 800);
    }
  },

  timeReduced() {
    const v = $('#hud .score');
    v.classList.remove('pulse');
    void v.offsetWidth;
    v.classList.add('pulse');
  },

  flash(color, duration, alpha) {
    const f = $('#flash');
    const c = Array.isArray(color) ? color : [1, 1, 1, 1];
    f.style.transition = 'none';
    f.style.background = `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`;
    f.style.opacity = String(Math.min(alpha ?? 1, 1) * 0.8);
    void f.offsetWidth;
    f.style.transition = `opacity ${Math.max(duration, 0.05)}s ease-out`;
    f.style.opacity = '0';
  },

  *fadeToBlack(d = 0.3) {
    const f = $('#fade');
    f.style.transition = `opacity ${d}s`;
    f.style.opacity = '1';
    let t = 0;
    while (t < d) {
      t += Time.unscaledDeltaTime;
      yield null;
    }
  },

  *fadeFromBlack(d = 0.3) {
    const f = $('#fade');
    f.style.transition = `opacity ${d}s`;
    f.style.opacity = '0';
    yield null;
  },

  showPause(v) {
    $('#pause').classList.toggle('hidden', !v);
  },

  attachRunState(rs) {
    RunUI.attach(rs);
  },

  showRevive(offer, answer) {
    RunUI.showRevive(offer, answer);
  },

  // ---------------------------------------------------------------- level results (UI_TimedLevelMode)
  showResults(mode, st, end) {
    const r = $('#results');
    const p = $('.panel', r);
    $('#hud').classList.add('hidden');
    r.classList.remove('hidden');
    this.handlers.onResults?.();
    const win = end.IsVictorious;
    const stars = win ? [1, 2, 3].map((k) => `<i class="${mode.earned >= k ? 'on' : ''}"></i>`).join('') : '';
    const next = win ? mode.NextLevel : null;
    if (win) AudioService.Play(1004);
    p.innerHTML = `<h2>${win ? T('UI/Levels/Finish') : 'FAILED'}</h2>
      ${win ? `<div class="bigstars">${stars}</div><div class="line">TIME <b>${fmtTime(mode.lastTime)}</b>${mode.newBest ? ` <em>${T('UI/MainMenu/NewBest')}</em>` : ''}</div>` : ''}
      <div class="line">${T('UI/Terms/Flips')} <b>${st.TotalFlips}</b> · PERFECT <b>${st.PerfectLandings}</b></div>
      <div class="btns"><button data-a="retry">RETRY</button>${next && this.handlers.unlocked(next) ? `<button data-a="next">${T('UI/Continue')}</button>` : ''}<button data-a="menu">MENU</button></div>`;
    p.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a) this.handlers[a]?.(mode);
    };
  },
};

export function applySettings(s) {
  AudioService.setMusic(!!s.music);
  AudioService.setSfx(!!s.sfx);
  Render.bloomEnabled = !!s.bloom;
}
