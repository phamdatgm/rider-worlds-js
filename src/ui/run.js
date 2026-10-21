// In-run UI: bonus letter pips, compliments + "Perfect" callout, challenge popups and start cards,
// distance markers, revive screen and the tutorial overlay (also used by the menu tutorials).
import * as THREE from 'three';
import { $, el, spr, rgb, ICON, sfx, fmtTimer } from './dom.js';
import { T, richText } from '../meta/data.js';
import { getRuntimeSO } from '../engine/instantiate.js';
import { Render } from '../engine/render.js';
import { Time } from '../engine/core.js';
import { Game, RunMode } from '../game/state.js';
import { Save } from '../meta/save.js';
import { PlayerRank } from '../meta/rank.js';
import { BONUS_WORD } from '../meta/bonus.js';
import { ChallengeManager, SetupType } from '../meta/challenges.js';
import { TutorialUI, Tutorials } from '../meta/tutorials.js';
import { WorldManager } from '../meta/worlds.js';

const _v = new THREE.Vector3();

function worldToScreen(p) {
  _v.copy(p).project(Render.camera);
  return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: _v.z > 1 };
}

export const RunUI = {
  hud: null,
  runState: null,

  init(hud) {
    this.hud = hud;
    hud.insertAdjacentHTML(
      'beforeend',
      `<div id="bonuspips" class="hidden">${[...BONUS_WORD].map((c) => `<i>${c}</i>`).join('')}</div>
       <div id="compliments"></div><div id="callouts"></div><div id="markers"></div>
       <div id="runchal"></div><div id="startchal"></div>`,
    );
    ChallengeManager.OnActiveChallengeChanged.AddListener((c) => this.onChallengeChanged(c));
    this.initTutorialOverlay();
    const tick = () => {
      requestAnimationFrame(tick);
      this.frame();
    };
    requestAnimationFrame(tick);
  },

  /** the gameplay RunState exists once the ScriptableObjects are loaded */
  attach(runState) {
    this.runState = runState;
    runState.jumpCompleted.AddListener((j) => this.onJump(j));
  },

  /** called by UI.showHud */
  onRunShown(mode) {
    this.mode = mode;
    const endless = mode.RunMode === RunMode.Endless;
    $('#bonuspips').classList.toggle('hidden', !(endless && PlayerRank.IsBonusUnlocked));
    $('#compliments').innerHTML = '';
    $('#callouts').innerHTML = '';
    $('#runchal').innerHTML = '';
    this.popQueue = [];
    this.trackedStats = null;
    this.setupMarkers(mode);
    this.showStartChallenges(mode);
  },

  frame() {
    const rs = this.runState;
    if (!rs) return;
    const st = rs?.StatTracker;
    if (!st || !this.mode) return;
    if (st !== this.trackedStats) {
      this.trackedStats = st;
      st.OnBonusCurrencyChanged.AddListener(() => this.refreshPips());
      this.refreshPips();
    }
    this.updateMarkers();
    this.updateCallouts();
    if (this.startCard && rs.PlayerState.DistanceX > 25) this.hideStartChallenges();
  },

  // ---------------------------------------------------------------- bonus letters
  refreshPips() {
    const n = this.runState.StatTracker?.BonusLetterCurrencyTotal ?? 0;
    const pips = $('#bonuspips');
    [...pips.children].forEach((p, i) => {
      const on = i < n;
      if (on && !p.classList.contains('on')) {
        p.classList.add('on', 'pop');
        setTimeout(() => p.classList.remove('pop'), 500);
      } else if (!on) p.classList.remove('on');
    });
    pips.classList.toggle('full', n >= 5);
  },

  // ---------------------------------------------------------------- compliments (ComplimentSpawner)
  onJump(j) {
    const mode = this.runState.Mode;
    if (!mode?.Settings?.ComplimentLanding) return;
    const cs = getRuntimeSO('MonoBehaviour/ComplimentSettings');
    if (!cs) return;
    const f = j.flips;
    if (j.perfect && f.TotalFlips > 0) this.spawnPerfectCallout();
    let sets;
    let threshold;
    if (f.forwardFlips > 0 && f.backwardFlips > 0) {
      threshold = f.forwardFlips + f.backwardFlips;
      sets = j.perfect ? cs.perfectFlipFBCompliments : cs.flipFBCompliments;
    } else if (f.backwardFlips > 0) {
      threshold = f.backwardFlips;
      sets = j.perfect ? cs.perfectFlipBCompliments : cs.flipBCompliments;
    } else if (f.forwardFlips > 0) {
      threshold = f.forwardFlips;
      sets = j.perfect ? cs.perfectFlipFCompliments : cs.flipFCompliments;
    } else {
      threshold = j.airtime;
      sets = j.perfect ? cs.perfectAirTimeCompliments : cs.airTimeCompliments;
    }
    const chosen = (sets || []).filter((s) => !s.ignore && threshold >= s.flipThreshold).sort((a, b) => b.flipThreshold - a.flipThreshold)[0];
    if (!chosen) return;
    const terms = (chosen.localizedCompliments || []).map((x) => x.mTerm).filter((t) => t !== this.prevTerm);
    const term = terms.length ? terms[Math.floor(Math.random() * terms.length)] : this.prevTerm;
    const text = T(term);
    if (!term || text === term) return; // missing I2 term -> no text (faithful)
    this.prevTerm = term;
    const box = $('#compliments');
    box.innerHTML = '';
    const vs = Game.visualSettings;
    const q = chosen.complimentQuality || 1;
    const d = el('div', `compliment q${q}`, text);
    const g = vs?.floaterGradient;
    if (g) d.style.setProperty('--fc', gradientCss(g));
    box.appendChild(d);
    sfx('UI_Compliment');
    setTimeout(() => d.classList.add('out'), 1500);
    setTimeout(() => d.remove(), 2000);
  },

  spawnPerfectCallout() {
    const p = this.runState.PlayerState.Position.clone().add(new THREE.Vector3(0, -1.5, 0));
    const d = el('div', 'callout', T('Callouts/Landing/Perfect'));
    d._world = p;
    $('#callouts').appendChild(d);
    setTimeout(() => d.remove(), 2000);
    this.updateCallouts();
  },

  updateCallouts() {
    for (const d of $('#callouts')?.children || []) {
      const s = worldToScreen(d._world);
      d.style.transform = `translate(${Math.min(window.innerWidth - 60, Math.max(60, s.x))}px, ${Math.min(window.innerHeight - 40, Math.max(40, s.y))}px) translate(-50%,-50%)`;
    }
  },

  // ---------------------------------------------------------------- distance markers (GameManager.SetDistanceMarkers)
  setupMarkers(mode) {
    const box = $('#markers');
    box.innerHTML = '';
    this.markers = [];
    if (mode.RunMode !== RunMode.Endless) return;
    const hs = Save.endless(mode.world);
    const add = (dist, label) => {
      if (!(dist > 5)) return;
      const d = el('div', 'marker', `<span>${label}</span>`);
      box.appendChild(d);
      this.markers.push({ dist, el: d });
    };
    add(hs.distanceTraveled, T('Markers/Highscore'));
    if (hs.daily && hs.daily.runs >= 3) add(hs.daily.totalDistance / hs.daily.runs, T('Markers/DailyAverage'));
    if (hs.previousDistance && Math.abs(hs.previousDistance - hs.distanceTraveled) > 2) add(hs.previousDistance, T('Markers/Previous'));
  },

  updateMarkers() {
    if (!this.markers?.length) return;
    const ps = this.runState.PlayerState;
    if (!ps.HasPlayer()) return;
    for (const m of this.markers) {
      const x = ps.StartingX + m.dist;
      const s = worldToScreen(new THREE.Vector3(x, ps.Position.y, 0));
      const vis = !s.behind && s.x > -40 && s.x < window.innerWidth + 40 && this.runState.IsInRun;
      m.el.style.display = vis ? '' : 'none';
      if (vis) m.el.style.transform = `translateX(${s.x}px)`;
    }
  },

  // ---------------------------------------------------------------- challenges in the run
  showStartChallenges(mode) {
    const box = $('#startchal');
    box.innerHTML = '';
    this.startCard = null;
    if (mode.RunMode !== RunMode.Endless || !Tutorials.FirstRun.IsFinished) return;
    const list = ChallengeManager.Slotted.filter((c) => c.IsActive);
    if (!list.length) return;
    box.innerHTML = list.map((c) => this.slotCard(c)).join('');
    box.classList.remove('out');
    this.startCard = true;
  },

  hideStartChallenges() {
    this.startCard = null;
    $('#startchal').classList.add('out');
  },

  slotCard(c, status) {
    const v = WorldManager.CurrentWorldIndex;
    const cur = c.IsCompleted ? c.GoalValue : c.UseSteps && c.GoalValue === 1 ? c.CurrentStepValue : c.CurrentValue;
    const goal = c.UseSteps && c.GoalValue === 1 ? c.StepGoal : c.GoalValue;
    return `<div class="rcslot ${status || ''} ${c.def.hard ? 'hard' : ''}">
      ${spr(`S_Icon_World_${v + 1}`, 30)}<div><div class="desc">${c.Text}</div>
      <div class="fill"><i style="width:${Math.min(1, cur / goal) * 100}%"></i><span>${Math.min(cur, goal)} / ${goal}</span></div></div>
      ${status === 'success' ? `<b class="st ok">${spr(ICON.check, 18)}</b>` : status === 'failure' ? '<b class="st bad">✕</b>' : ''}</div>`;
  },

  /** UI_ChallengeRunPopupHandler */
  onChallengeChanged(c) {
    if (!this.runState.IsRunning) return;
    let type = null;
    const sp = c.StepProgress;
    const pp = c.PreviousStepProgress;
    if (c.UseSteps) {
      if (c.CurrentValue === c.GoalValue - 1) {
        if (sp !== pp && sp >= 1 && pp < 1) type = 'success';
      } else if (sp !== pp) {
        if (c.def.setup === SetupType.XZ && sp >= 1 && pp < 1) type = 'progress';
        else if (pp >= 1 && sp < 1) type = 'failure';
      }
    } else if (!c.IsCompleted && sp !== pp) {
      if (sp >= 1 && pp < 1) type = 'success';
      else if (pp >= 1 && sp < 1) type = 'failure';
    }
    if (!type) return;
    this.queuePopup(c, type);
  },

  queuePopup(c, type) {
    const box = $('#runchal');
    const now = performance.now();
    const at = Math.max(now, (this.nextPopupAt || 0));
    this.nextPopupAt = at + 500;
    setTimeout(() => {
      const d = el('div', 'rcpop', this.slotCard(c, type === 'progress' ? '' : type));
      if (type === 'progress') {
        const f = d.querySelector('.fill');
        f.innerHTML = `<i style="width:${((c.CurrentValue + 1) / c.GoalValue) * 100}%"></i><span>${c.CurrentValue + 1} / ${c.GoalValue}</span>`;
      }
      box.appendChild(d);
      sfx(type === 'failure' ? 'UI_ChallengePopupFailed' : 'UI_ChallengePopupComplete');
      setTimeout(() => d.classList.add('out'), 2200);
      setTimeout(() => d.remove(), 2700);
    }, at - now);
  },

  // ---------------------------------------------------------------- revive (UI_Revive)
  showRevive(offer, answer) {
    const hud = this.hud;
    let remaining = offer.seconds;
    const reason =
      offer.reason === 'score'
        ? `<div class="rinfo">${T('UI/Revive/Criteria/Highscore')}<b>${offer.score} / ${offer.highScore}</b></div>`
        : offer.reason === 'bonus'
          ? `<div class="rinfo">${T('UI/Revive/Criteria/Bonus')}<b class="letter">${offer.next}</b></div>`
          : offer.reason === 'challenge'
            ? `<div class="rinfo">${T('UI/Revive/Criteria/Challenge')}${this.slotCard(offer.challenge)}</div>`
            : '';
    const d = el('div', 'screen dim', `<div class="panel revive">
        <h2>${T('UI/Revive/Revive')}</h2>${reason}
        <div class="rtimer"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44"/></svg><b>${remaining}</b></div>
        <div class="btns">
          ${offer.freeAvailable ? `<button class="primary" data-r="free">${spr('S_Icon_Ad', 22)} ${T('Monetization/Free')}</button>` : ''}
          <button data-r="paid">${spr(ICON.hard, 22)} ${offer.price}</button>
        </div>
        <button class="skipbtn" data-r="no">${T('UI/Skip')}</button></div>`);
    d.id = 'revive';
    hud.parentElement.appendChild(d);
    sfx('UI_Revive');
    let done = false;
    const finish = (a) => {
      if (done) return;
      if (answer(a) === false) {
        const b = d.querySelector('[data-r="paid"]');
        b?.classList.add('shake');
        setTimeout(() => b?.classList.remove('shake'), 400);
        const t = d.querySelector('.rinfo') || d.querySelector('h2');
        if (t) t.insertAdjacentHTML('afterend', `<div class="warn">${T('UI/Shop/NotEnoughHardCurrency')}</div>`);
        return;
      }
      done = true;
      d.remove();
    };
    d.onclick = (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r) finish(r);
    };
    const arc = d.querySelector('.arc');
    const C = 2 * Math.PI * 44;
    arc.style.strokeDasharray = `${C}`;
    let last = performance.now();
    const step = (now) => {
      if (done) return;
      const dt = Time.timeScale > 0 ? (now - last) / 1000 : 0;
      last = now;
      remaining -= dt;
      d.querySelector('.rtimer b').textContent = Math.max(0, Math.ceil(remaining - 0.0001));
      arc.style.strokeDashoffset = `${C * (1 - Math.max(0, remaining) / offer.seconds)}`;
      if (remaining <= 0) return finish('timeout');
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  // ---------------------------------------------------------------- tutorial overlay (TutorialUtility)
  initTutorialOverlay() {
    const ov = el('div', 'hidden', '<div class="tfocus"></div><div class="ttext"></div><div class="timg"></div><div class="thand"></div><div class="ttap hidden"></div>');
    ov.id = 'tutorial';
    document.getElementById('ui').appendChild(ov);
    this.tut = ov;
    TutorialUI.show = (o) => this.showTutorial(o);
    TutorialUI.hide = () => this.hideTutorial();
    Tutorials.pauseWorldFx = () => {};
  },

  showTutorial(o) {
    const ov = this.tut;
    ov.classList.remove('hidden');
    ov.classList.toggle('blocking', !!o.tap);
    const tx = ov.querySelector('.ttext');
    tx.innerHTML = richText(o.text || '');
    tx.style.top = `${(o.y ?? 0.3) * 100}%`;
    const im = ov.querySelector('.timg');
    im.innerHTML = o.image ? spr(o.image, Math.min(520, window.innerWidth * 0.8)) : '';
    im.classList.toggle('hidden', !o.image);
    const focus = ov.querySelector('.tfocus');
    const hand = ov.querySelector('.thand');
    hand.innerHTML = spr('TutorialHand_Pointing', 90);
    this.tutTarget = o.target || null;
    this.tutFocusPlayer = !!o.focusPlayer;
    focus.classList.toggle('on', !!(o.target || o.focusPlayer));
    hand.classList.toggle('on', !!(o.hand || o.target));
    const tap = ov.querySelector('.ttap');
    tap.classList.toggle('hidden', !o.tap);
    tap.textContent = T('Tutorials/TapToContinue');
    ov.onpointerdown = o.tap ? () => o.onTap?.() : null;
    const follow = () => {
      if (ov.classList.contains('hidden')) return;
      this.placeTutorial();
      this._tutRaf = requestAnimationFrame(follow);
    };
    cancelAnimationFrame(this._tutRaf);
    follow();
  },

  placeTutorial() {
    const ov = this.tut;
    const focus = ov.querySelector('.tfocus');
    const hand = ov.querySelector('.thand');
    let r = null;
    if (this.tutTarget?.getBoundingClientRect) {
      const b = this.tutTarget.getBoundingClientRect();
      r = { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width + 24, h: b.height + 24 };
    } else if (this.tutFocusPlayer && this.runState.PlayerState.HasPlayer()) {
      const s = worldToScreen(this.runState.PlayerState.Position);
      r = { x: s.x, y: s.y, w: 260, h: 260, circle: true };
    }
    if (r) {
      focus.style.cssText = `left:${r.x - r.w / 2}px;top:${r.y - r.h / 2}px;width:${r.w}px;height:${r.h}px;border-radius:${r.circle ? '50%' : '18px'}`;
      hand.style.left = `${r.x}px`;
      hand.style.top = `${r.y + r.h * 0.25}px`;
    } else {
      hand.style.left = '50%';
      hand.style.top = '62%';
    }
  },

  hideTutorial() {
    this.tut?.classList.add('hidden');
    cancelAnimationFrame(this._tutRaf);
    this.tutTarget = null;
  },
};

/** Gradient ([t, r, g, b] keys) -> CSS linear-gradient for the compliment text fill */
function gradientCss(g) {
  const keys = g.colorKeys || g.$grad || [];
  const stops = keys.map((k) => `${rgb([k[1], k[2], k[3]])} ${Math.round(k[0] * 100)}%`);
  return stops.length > 1 ? `linear-gradient(180deg, ${stops.join(',')})` : '#fff';
}

export { fmtTimer };
