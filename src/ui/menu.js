// Main menu (MainMenuManager): top bar, bottom navigation, Home screen with world navigation, challenges,
// levels, bonus letters, daily chest, world stats and settings overlays; pending-reward / popup director.
import { Assets } from '../engine/assets.js';
import { Render } from '../engine/render.js';
import { $, $$, el, fmtNum, fmtTimer, rgb, spr, Modals, tooltip, Fly, ICON, currencyIcon } from './dom.js';
import { T, richText, Meta } from '../meta/data.js';
import { Save } from '../meta/save.js';
import { Currencies } from '../meta/currency.js';
import { PlayerRank } from '../meta/rank.js';
import { WorldManager, LevelUnlocks } from '../meta/worlds.js';
import { ChallengeManager, ChallengeState } from '../meta/challenges.js';
import { CardService, RANK_TYPES } from '../meta/cards.js';
import { grantReward } from '../meta/rewards.js';
import { Bonus, MAX_BONUS_LETTERS, BONUS_WORD } from '../meta/bonus.js';
import { DailyLootbox, LootboxService } from '../meta/lootbox.js';
import { Shop } from '../meta/shop.js';
import { Tutorials, TutorialUI } from '../meta/tutorials.js';
import { RankUI } from './rank.js';
import { GarageUI } from './garage.js';
import { ShopUI } from './shop.js';
import { LootboxUI } from './lootbox.js';

const DIFF = ['Easy', 'Moderate', 'Difficult'];
const DIFF_TERM = ['UI/Levels/EasyTitle', 'UI/Levels/ModerateTitle', 'UI/Levels/DifficultTitle'];
const PAGES = [
  { id: 'shop', icon: 'S_Icon_Shop_A', label: 'Store', unlockRank: 3 },
  { id: 'garage', icon: 'S_Icon_Customization', label: 'Garage', unlockRank: 2 },
  { id: 'home', icon: 'S_Icon_Endless_A', label: 'Ride', unlockRank: 0 },
];

function pageUnlocked(p) {
  return p.unlockRank >= 0 && p.unlockRank - 1 <= PlayerRank.CurrentRank;
}

function worldVisual(w) {
  return Meta.data.worlds[w] || {};
}

function fmtLevelTime(s) {
  if (s === undefined || s < 0) return '--.---';
  return Math.min(s, 99.999).toFixed(3);
}

export const MenuUI = {
  app: null,
  root: null,
  page: 'home',
  browseWorld: 0,
  visible: false,

  init(root, app) {
    this.root = root;
    this.app = app;
    const refresh = () => this.visible && this.refreshBars();
    for (const c of [Currencies.Soft, Currencies.Hard, Currencies.Star]) c.onChange.AddListener(refresh);
    PlayerRank.ProgressChanged.AddListener(refresh);
    PlayerRank.RankUp.AddListener(() => this.visible && this.refreshNav());
    ChallengeManager.OnChallengeUpdate.AddListener(() => this.visible && this.refreshHome());
    CardService.onCardUnseenStateChanged.AddListener(() => this.visible && this.refreshNav());
    LevelUnlocks.UnseenChanged.AddListener(() => this.visible && this.refreshHome());
    Bonus.onChanged.AddListener(() => this.visible && this.refreshHome());
    Currencies.Bonus.onChange.AddListener(() => this.visible && this.refreshHome());
    DailyLootbox.onChanged.AddListener(() => this.visible && this.refreshHome());
    Shop.onChanged.AddListener(() => this.visible && this.refreshNav());
    setInterval(() => this.visible && this.tick(), 500);
    this.registerTutorials();
  },

  // ---------------------------------------------------------------- build
  show(world) {
    this.visible = true;
    this.browseWorld = world;
    const m = this.root;
    m.classList.remove('hidden');
    const vs = this.app.visuals(world);
    const hl = vs?.uiHighlightColor || [1, 0, 0.9, 1];
    m.style.setProperty('--hl', rgb(hl));
    document.documentElement.style.setProperty('--hl', rgb(hl));
    m.innerHTML = `
      <div class="topbar">
        <div class="rankbar" data-a="track"><div class="rk">${spr(ICON.star, 46)}<b></b></div><div class="bar"><i></i><span></span></div></div>
        <div class="worldbtn" data-a="stats"><span class="wi"></span><div><small></small><b></b></div></div>
        <div class="spacer"></div>
        <div class="cur soft">${spr(ICON.soft, 24)}<span class="v"></span></div>
        <div class="cur hard">${spr(ICON.hard, 24)}<span class="v"></span></div>
        <button class="iconbtn" data-a="settings">${spr(ICON.settings, 26)}</button>
      </div>
      <div class="pages">
        <div class="page" id="page-home"></div>
        <div class="page" id="page-garage"></div>
        <div class="page" id="page-shop"></div>
      </div>
      <div class="navbar">${PAGES.map((p) => `<button class="nav" data-page="${p.id}">${spr(p.icon, 34)}<span>${p.label}</span><b class="ping"></b><i class="lockrk"></i></button>`).join('')}</div>`;
    m.onclick = (e) => this.onClick(e);
    this.buildHome();
    this.refreshBars();
    this.refreshNav();
    this.setPage(this.page, true);
    this.startDirector();
  },

  hide() {
    this.visible = false;
    Render.viewShift.x = Render.viewShift.y = 0;
    GarageUI.leave?.();
    this.root.classList.add('hidden');
    Modals.closeAll();
    TutorialUI.hide();
  },

  onClick(e) {
    const nav = e.target.closest('[data-page]');
    if (nav) return this.navTo(nav.dataset.page, nav);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'track') RankUI.openRewardTrack();
    else if (a === 'stats') this.openWorldStats();
    else if (a === 'settings') this.openSettings();
  },

  navTo(id, btn) {
    if (RankUI.busy) return;
    const p = PAGES.find((x) => x.id === id);
    if (!pageUnlocked(p)) {
      tooltip(T('UI/Unlock/FeatureUnlock', { 0: p.unlockRank }), btn);
      return;
    }
    this.setPage(id);
  },

  setPage(id, force) {
    if (this.page === id && !force) return;
    const prev = this.page;
    this.page = id;
    for (const p of $$('.page', this.root)) p.classList.toggle('on', p.id === `page-${id}`);
    for (const b of $$('.nav', this.root)) b.classList.toggle('on', b.dataset.page === id);
    this.root.classList.toggle('hide-world', id !== 'home');
    if (prev === 'garage' && id !== 'garage') GarageUI.leave();
    if (id === 'garage') GarageUI.enter($('#page-garage', this.root), this.app);
    if (id === 'shop') ShopUI.enter($('#page-shop', this.root), this.app);
    else if (prev === 'shop') ShopUI.leave();
    if (id === 'home') this.app.setStaticView('menu');
    // keep the 3D preview visible next to the garage panel (right side in landscape, bottom in portrait)
    const portrait = window.innerWidth < window.innerHeight;
    Render.viewShift.x = id === 'garage' && !portrait ? Math.min(0.52, 560 / window.innerWidth) / 2 : 0;
    Render.viewShift.y = id === 'garage' && portrait ? 0.1 : 0;
    this.root.classList.toggle('game-cam', id !== 'shop');
  },

  refreshBars() {
    const m = this.root;
    if (!m || !this.visible) return;
    const rb = $('.rankbar', m);
    if (rb) {
      $('.rk b', rb).textContent = PlayerRank.CurrentRank + 1;
      const req = PlayerRank.CurrentStarsRequired;
      $('.bar i', rb).style.width = `${PlayerRank.CurrentRankProgress * 100}%`;
      $('.bar span', rb).textContent = PlayerRank.IsMaxRank ? 'MAX' : `${PlayerRank.CurrentRankStars} / ${req}`;
    }
    const s = $('.cur.soft .v', m);
    if (s) s.textContent = fmtNum(Currencies.Soft.value);
    const h = $('.cur.hard .v', m);
    if (h) h.textContent = fmtNum(Currencies.Hard.value);
    const w = WorldManager.CurrentWorldIndex;
    const wb = $('.worldbtn', m);
    if (wb) {
      $('.wi', wb).innerHTML = spr(worldVisual(w).icon || 'S_Icon_World_1', 34);
      $('small', wb).textContent = T('UI/WorldSelect/World', { 0: w + 1 });
      $('b', wb).textContent = `${Math.floor(this.worldProgress(w) * 100)}%`;
    }
  },

  refreshNav() {
    const m = this.root;
    if (!m || !this.visible) return;
    for (const b of $$('.nav', m)) {
      const p = PAGES.find((x) => x.id === b.dataset.page);
      const un = pageUnlocked(p);
      b.classList.toggle('locked', !un);
      $('.lockrk', b).innerHTML = un ? '' : `${spr(ICON.star, 18)}<span>${p.unlockRank}</span>`;
      let pings = 0;
      if (un && p.id === 'garage') pings = CardService.MetaPings;
      if (un && p.id === 'shop') pings = Shop.Pings;
      if (p.id === 'home') pings = (Bonus.CollectedAll ? 1 : 0) + (WorldManager.HasUnseenWorld ? 1 : 0);
      const pg = $('.ping', b);
      pg.textContent = pings > 0 ? pings : '';
      pg.classList.toggle('on', pings > 0);
    }
    this.refreshBars();
  },

  tick() {
    if (this.page === 'home') this.refreshTimers();
    if (this.page === 'shop') ShopUI.tick?.();
  },

  // ---------------------------------------------------------------- world progress (World Stats)
  endlessProgress(w) {
    const hs = Save.endless(w).highScore;
    const mastery = worldVisual(WorldManager.CurrentWorldIndex).mastery || 200;
    const cs = ChallengeManager.WorldStats(w);
    return (Math.min(1, hs / mastery) + (cs.total ? cs.progress / cs.total : 0)) * 0.5;
  },

  levelsProgress(w, d) {
    const lv = Assets.manifest.levels.filter((l) => l.world === w && (d === undefined || l.difficulty === d));
    if (!lv.length) return d === undefined ? 0 : 1;
    return lv.filter((l) => Save.level(l.id).stars === 3).length / lv.length;
  },

  worldProgress(w) {
    return (this.endlessProgress(w) + this.levelsProgress(w) + CardService.CollectionProgress(w)) / 3;
  },

  // ---------------------------------------------------------------- Home screen
  buildHome() {
    const h = $('#page-home', this.root);
    h.innerHTML = `
      <div class="scoredisp"><small>${T('UI/MainMenu/BestScore')}</small><b></b><em class="newsticker hidden">${T('UI/MainMenu/NewBest')}</em></div>
      <button class="wnav left" data-w="-1">${spr('S_Arrow', 40)}</button>
      <button class="wnav right" data-w="1">${spr('S_Arrow', 40)}</button>
      <div class="lockedworld hidden"><div class="bg"></div><div class="msg"></div></div>
      <div class="home-bottom">
        <div class="side">
          <button class="hb chal" data-h="chal">${spr('S_Icon_Challenges', 34)}<span>Challenges</span><b class="ping"></b></button>
          <button class="hb lvls" data-h="levels">${spr('S_Icon_Levels_A', 34)}<span>Levels</span><b class="ping"></b></button>
        </div>
        <button class="play" data-h="play">PLAY</button>
        <div class="side">
          <button class="hb bonus" data-h="bonus">${spr('S_BonusDrive', 34)}<span class="pips"></span><b class="ping"></b></button>
          <button class="hb daily" data-h="daily"><span class="dicon"></span><span class="dlabel"></span><b class="ping"></b><i class="dfill"><i></i></i></button>
        </div>
      </div>
      <div class="chal-popups"></div>`;
    h.onclick = (e) => {
      const w = e.target.closest('[data-w]');
      if (w) return this.navWorld(Number(w.dataset.w));
      const a = e.target.closest('[data-h]')?.dataset.h;
      if (!a || RankUI.busy) return;
      if (a === 'play') this.pressPlay();
      else if (a === 'chal') this.openChallenges(false);
      else if (a === 'levels') this.openLevels();
      else if (a === 'bonus') this.openBonusClaim();
      else if (a === 'daily') this.openDailyLootbox();
    };
    this.refreshHome();
  },

  refreshHome() {
    const h = $('#page-home', this.root);
    if (!h || !this.visible) return;
    const w = WorldManager.CurrentWorldIndex;
    const bw = this.browseWorld;
    const hs = Save.endless(w);
    $('.scoredisp b', h).textContent = fmtNum(hs.highScore);
    $('.newsticker', h).classList.toggle('hidden', !this.app.lastRunNewBest);
    // world navigation
    const nav = PlayerRank.IsWorldNavigationUnlocked;
    $('.wnav.left', h).classList.toggle('hidden', !nav || bw <= 0);
    $('.wnav.right', h).classList.toggle('hidden', !nav || bw >= WorldManager.HighestWorldIndex);
    $('.wnav.right', h).classList.toggle('ping', nav && WorldManager.HasUnseenWorld && bw < WorldManager.HighestUnlockedWorld());
    const locked = !WorldManager.IsWorldUnlocked(bw);
    const lw = $('.lockedworld', h);
    lw.classList.toggle('hidden', !locked);
    this.root.classList.toggle('world-locked', locked);
    if (locked) {
      const v = worldVisual(bw);
      $('.bg', lw).innerHTML = v.transition || v.background ? `<div class="wbg" style="background-image:none">${spr(v.transition || v.background, 512, { cls: 'cover' })}</div>` : '';
      const need = PlayerRank.GetRankForWorldUnlock(bw);
      $('.msg', lw).innerHTML = WorldManager.IsWorldComingSoon(bw)
        ? `<h2>${T('UI/WorldSelect/World', { 0: bw + 1 })}</h2><p>${T('UI/Unlock/ComingSoon')}</p>`
        : `<h2>${T('UI/WorldSelect/World', { 0: bw + 1 })}</h2><p>${spr(ICON.star, 28)} ${T('UI/Unlock/FeatureUnlock', { 0: need })}</p>`;
    }
    $('.play', h).disabled = locked;
    // challenges button
    const cb = $('.hb.chal', h);
    const running = ChallengeManager.ActiveRunningCount;
    $('.ping', cb).textContent = running || '';
    $('.ping', cb).classList.toggle('on', running > 0);
    cb.classList.toggle('hidden', locked);
    // levels button (hidden until Easy unlocked)
    const lb = $('.hb.lvls', h);
    lb.classList.toggle('hidden', locked || !LevelUnlocks.IsDifficultyUnlocked(w, 0));
    const un = LevelUnlocks.UnseenCount(w);
    $('.ping', lb).textContent = un || '';
    $('.ping', lb).classList.toggle('on', un > 0);
    // bonus letters
    const bb = $('.hb.bonus', h);
    bb.classList.toggle('hidden', locked || !Bonus.ShouldShowButton);
    const letters = Bonus.Letters;
    $('.pips', bb).innerHTML = [...BONUS_WORD].map((c, i) => `<i class="${i < letters ? 'on' : ''}">${c}</i>`).join('');
    bb.classList.toggle('full', Bonus.CollectedAll);
    $('.ping', bb).classList.toggle('on', Bonus.CollectedAll);
    $('.ping', bb).textContent = Bonus.CollectedAll ? '!' : '';
    // daily chest
    const db = $('.hb.daily', h);
    db.classList.toggle('hidden', locked);
    const lv = DailyLootbox.Level;
    const art = LootboxService.art(300 + lv);
    $('.dicon', db).innerHTML = spr(art.small || art.sprite, 38);
    const [cur, need] = DailyLootbox.Progress;
    $('.dfill i', db).style.width = `${DailyLootbox.CanClaim ? 100 : Math.min(1, cur / need) * 100}%`;
    $('.ping', db).classList.toggle('on', DailyLootbox.CanClaim);
    $('.ping', db).textContent = DailyLootbox.CanClaim ? '!' : '';
    this.refreshTimers();
    this.refreshNav();
  },

  refreshTimers() {
    const h = $('#page-home', this.root);
    if (!h) return;
    const dl = $('.hb.daily .dlabel', h);
    if (dl) dl.textContent = DailyLootbox.CanClaim ? T('Lootbox/Unlocked') : fmtTimer(DailyLootbox.TimeLeftToClaim);
    const bb = $('.hb.bonus', h);
    if (bb) bb.classList.toggle('cooldown', !Bonus.TimerExpired);
    for (const t of $$('[data-lockout]', document)) {
      const ch = ChallengeManager.Slotted.find((c) => c.id === t.dataset.lockout);
      if (ch) t.textContent = fmtTimer(ch.lockoutRemaining);
    }
  },

  navWorld(dir) {
    const nw = Math.max(0, Math.min(WorldManager.HighestWorldIndex, this.browseWorld + dir));
    if (nw === this.browseWorld) return;
    this.browseWorld = nw;
    if (WorldManager.IsWorldUnlocked(nw)) {
      WorldManager.SetCurrentWorld(nw);
      WorldManager.SetUnlockedWorldSelected(nw);
      this.app.switchWorld(nw);
    } else this.refreshHome();
  },

  pressPlay() {
    if (!WorldManager.IsWorldUnlocked(this.browseWorld)) return;
    this.app.play(WorldManager.CurrentWorldIndex);
  },

  // ---------------------------------------------------------------- challenges overlay
  challengeSlotHtml(ch, readOnly) {
    if (!ch) return '';
    const w = ch.world;
    const v = worldVisual(w);
    const claimed = ch.IsClaimed;
    const completed = ch.IsCompleted;
    const cur = completed ? 1 : ch.CurrentValue;
    const goal = completed ? 1 : ch.GoalValue;
    const pct = completed ? 1 : Math.min(1, cur / goal);
    const rewards = ch.Rewards.map((r) => {
      const icon = r.id === 'Currency_Star' ? (ch.def.hard ? 'S_Icon_Star_Reward_B' : 'S_Icon_Star_Reward_A') : currencyIcon(r.id) || 'S_Icon_Lootbox_1_Small';
      return `<span class="rw">${spr(icon, 26)}x${r.amount}</span>`;
    }).join('');
    return `<div class="cslot ${ch.def.hard ? 'hard' : ''} ${completed ? 'done' : ''} ${claimed ? 'claimed' : ''}" data-ch="${ch.id}">
      <div class="wicon">${spr(v.icon || 'S_Icon_World_1', 40)}</div>
      ${claimed
        ? `<div class="locktime"><small>${T('UI/MainMenu/NextChallengeIn')}</small><b data-lockout="${ch.id}">${fmtTimer(ch.lockoutRemaining)}</b></div>
           ${readOnly ? '' : `<button class="cbtn" data-reset="${ch.id}">${spr('S_Icon_SkipTimer', 22)}</button>`}`
        : `<div class="ctext"><div class="desc">${ch.Text}</div>
             <div class="fill"><i style="width:${pct * 100}%"></i><span>${completed ? spr(ICON.check, 16) : `${cur} / ${goal}`}</span></div></div>
           <div class="rewards">${rewards}</div>
           ${!readOnly && !completed && ch.CanBeSkipped ? `<button class="cbtn skip" data-reset="${ch.id}">${T('UI/Skip')}</button>` : ''}`}
    </div>`;
  },

  challengeListHtml(readOnly) {
    const slots = [0, 1, 2].filter((i) => ChallengeManager.IsSlotUnlocked(i));
    const html = slots.map((i) => this.challengeSlotHtml(ChallengeManager.slots[i], readOnly)).join('');
    return html || `<div class="wcomplete">${T('Challenges/WorldCompleted')}</div>`;
  },

  openChallenges(auto) {
    if (this.chalModal) return;
    const w = WorldManager.CurrentWorldIndex;
    const st = ChallengeManager.WorldStats(w);
    const m = Modals.push(`<div class="panel chal">
        <h2>${T('UI/MainMenu/ChallengeText', { 0: w + 1 })}</h2>
        <div class="wprog">${Math.min(st.progress, st.total)}/${st.total}</div>
        <div class="slots"></div>
        <button class="close" data-x>${spr(ICON.close, 22)}</button>
      </div>`, 'challenges', { onClose: () => (this.chalModal = null) });
    this.chalModal = m;
    const render = () => {
      $('.slots', m.el).innerHTML = this.challengeListHtml(false);
      const s2 = ChallengeManager.WorldStats(w);
      $('.wprog', m.el).textContent = `${Math.min(s2.progress, s2.total)}/${s2.total}`;
    };
    render();
    m.render = render;
    m.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === m.el) {
        if (!m.claiming) m.close();
        return;
      }
      const r = e.target.closest('[data-reset]');
      if (r) this.openChallengeReset(ChallengeManager.Slotted.find((c) => c.id === r.dataset.reset), render);
    };
    const upd = () => !m.closed && !m.claiming && render();
    ChallengeManager.OnChallengeUpdate.AddListener(upd);
    const done = m.close;
    m.close = () => {
      ChallengeManager.OnChallengeUpdate.RemoveListener(upd);
      done();
    };
    this.autoClaim(m);
  },

  /** UI_ChallengeOverlay.AutoClaim: claim completed slots one by one (0.7 s apart) */
  async autoClaim(m) {
    if (!ChallengeManager.ClaimableCount || m.claiming) return;
    m.claiming = true;
    await wait(700);
    while (Tutorials.active && Tutorials.active.saveName === 'FTUE_ClaimChallenge') await wait(200);
    for (const ch of ChallengeManager.Slotted.filter((c) => c.IsCompleted)) {
      if (m.closed) break;
      const node = $(`[data-ch="${ch.id}"]`, m.el);
      node?.classList.add('claiming');
      const res = ChallengeManager.Claim(ch);
      await this.flyRewards(res, node);
      await wait(700);
    }
    m.claiming = false;
    if (!m.closed) m.render();
  },

  openChallengeReset(ch, after) {
    if (!ch) return;
    const timer = ch.IsClaimed;
    const s = ChallengeManager.settings;
    const cost = timer ? s.skipTimerCost : s.skipChallengeCost;
    const pm = Modals.push(`<div class="panel small">
        <h2>${T(timer ? 'Challenges/ChallengeRefreshHeader' : 'Challenges/ChallengeSkipHeader')}</h2>
        <div class="btns"><button data-r="ad">${spr('S_Icon_Ad', 22)} Free</button>
        <button data-r="pay">${spr(ICON.hard, 22)} ${cost}</button></div>
        <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'reset');
    pm.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === pm.el) return pm.close();
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (!r) return;
      if (ChallengeManager.Reset(ch, r === 'ad')) {
        pm.close();
        after?.();
        if (this.chalModal) this.autoClaim(this.chalModal);
      } else tooltip(T('UI/Shop/NotEnoughHardCurrency'), e.target);
    };
  },

  /** reward particles to the top bar for granted rewards */
  async flyRewards(results, from) {
    const jobs = [];
    for (const r of results || []) {
      if (!r || !r.amount) continue;
      if (r.id === 'Currency_Soft') jobs.push(Fly.icons(ICON.soft, from, $('.cur.soft', this.root), r.amount));
      else if (r.id === 'Currency_Hard') jobs.push(Fly.icons(ICON.hard, from, $('.cur.hard', this.root), Math.ceil(r.amount / 4)));
      else if (r.id === 'Currency_Star') jobs.push(Fly.icons('S_Icon_Star_Reward_A', from, $('.rankbar', this.root), r.amount));
    }
    await Promise.all(jobs);
    this.refreshBars();
  },

  // ---------------------------------------------------------------- levels overlay (UI_TimedLevelMenu)
  openLevels(page) {
    const w = WorldManager.CurrentWorldIndex;
    const levels = Assets.manifest.levels.filter((l) => l.world === w);
    const total = levels.length * 3;
    let d = page ?? Math.max(0, [2, 1, 0].find((x) => LevelUnlocks.IsDifficultyUnlocked(w, x)) ?? 0);
    const m = Modals.push(`<div class="panel levels-ov">
        <h2>${T('UI/WorldSelect/World', { 0: w + 1 })}</h2>
        <div class="totalstars">${spr('S_Icon_Star_HUD', 22)}<b></b></div>
        <div class="dpage"></div>
        <button class="arrow l" data-d="-1">${spr('S_Arrow', 30)}</button><button class="arrow r" data-d="1">${spr('S_Arrow', 30)}</button>
        <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'levels');
    this.levelsModal = m;
    const render = () => {
      const row = levels.filter((l) => l.difficulty === d).sort((a, b) => a.number - b.number);
      const unlocked = LevelUnlocks.IsDifficultyUnlocked(w, d);
      if (unlocked) LevelUnlocks.SetSeen(w, d);
      const stars = levels.reduce((a, l) => a + Save.level(l.id).stars, 0);
      $('.totalstars b', m.el).textContent = `${stars} / ${total}`;
      $('.dpage', m.el).innerHTML = `<h3>${T(DIFF_TERM[d])}</h3>
        <div class="lgrid ${unlocked ? '' : 'locked'}">${row
          .map((l) => {
            const s = Save.level(l.id);
            return `<button class="lvl" data-l="${l.id}" ${unlocked ? '' : 'disabled'}><b>${l.number}</b>
              <span class="st">${[1, 2, 3].map((k) => `<i class="${s.stars >= k ? 'on' : ''}"></i>`).join('')}</span>
              <small>${s.best >= 0 ? fmtLevelTime(s.best) : ''}</small></button>`;
          })
          .join('')}</div>
        ${unlocked ? '' : `<div class="dlock">${spr(ICON.star, 30)}<span>${T('UI/Unlock/FeatureUnlock', { 0: PlayerRank.GetRankForLevelDifficultyUnlock(w, d) })}</span></div>`}`;
      $('.arrow.l', m.el).classList.toggle('hidden', d <= 0);
      $('.arrow.r', m.el).classList.toggle('hidden', d >= 2);
    };
    render();
    m.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === m.el) return m.close();
      const a = e.target.closest('[data-d]');
      if (a) {
        d = Math.max(0, Math.min(2, d + Number(a.dataset.d)));
        render();
        return;
      }
      const l = e.target.closest('[data-l]');
      if (l && !l.disabled) {
        m.close();
        this.app.playLevel(l.dataset.l);
      }
    };
  },

  // ---------------------------------------------------------------- world stats (UI_WorldStatsMenu)
  openWorldStats() {
    const w = WorldManager.CurrentWorldIndex;
    const pct = (x) => `${Math.floor(x * 100)}%`;
    const bar = (label, v, txt) => `<div class="sbar"><span>${label}</span><div class="fill"><i style="width:${Math.min(1, v) * 100}%"></i><span>${txt}</span></div></div>`;
    const hs = Save.endless(w).highScore;
    const mastery = worldVisual(w).mastery || 200;
    const cs = ChallengeManager.WorldStats(w);
    const lv = (d) => Assets.manifest.levels.filter((l) => l.world === w && l.difficulty === d);
    const three = (d) => lv(d).filter((l) => Save.level(l.id).stars === 3).length;
    const coll = (t) => {
      const cards = CardService.ofType(t).filter((c) => c.UnlocksInWorldID === w);
      const have = cards.filter((c) => c.IsUsable).reduce((a, c) => a + c.HighestUnlockedRank + 1, 0);
      return [have, cards.length * 4];
    };
    const names = { 10000: 'Vehicles', 20000: 'Colors', 30000: 'Trails', 32000: 'Landings', 31000: 'Explosions' };
    const m = Modals.push(`<div class="panel stats">
      <h2>${T('UI/WorldSelect/World', { 0: w + 1 })} <b>${pct(this.worldProgress(w))}</b></h2>
      <section><h3>Endless <b>${pct(this.endlessProgress(w))}</b></h3>
        ${bar('Score', Math.min(hs, mastery) / mastery, `${Math.min(hs, mastery)}/${mastery}`)}
        ${bar(T('UI/WorldSelect/WorldChallenges'), cs.total ? cs.progress / cs.total : 0, `${cs.progress}/${cs.total}`)}</section>
      <section><h3>Levels <b>${pct(this.levelsProgress(w))}</b></h3>
        ${[0, 1, 2].map((d) => bar(DIFF[d], lv(d).length ? three(d) / lv(d).length : 1, `${three(d)}/${lv(d).length}`)).join('')}</section>
      <section><h3>Collection <b>${pct(CardService.CollectionProgress(w))}</b></h3>
        ${[10000, 20000, 30000, 32000, 31000].map((t) => { const [a, b] = coll(t); return bar(names[t], b ? a / b : 0, `${a}/${b}`); }).join('')}</section>
      <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'stats');
    m.el.onclick = (e) => (e.target.closest('[data-x]') || e.target === m.el) && m.close();
  },

  // ---------------------------------------------------------------- settings (UI_PauseMenu in the menu)
  openSettings() {
    const s = Save.data.settings;
    const m = Modals.push(`<div class="panel settings-ov">
      <h2>${T('UI/Pause/Settings')}</h2>
      <div class="toggles">
        <button class="tg ${s.music ? 'on' : ''}" data-s="music">${spr(s.music ? 'S_Icon_MusicOn' : 'S_Icon_MusicOff', 34)}<span>Music</span></button>
        <button class="tg ${s.sfx ? 'on' : ''}" data-s="sfx">${spr(s.sfx ? 'S_Icon_SoundOn' : 'S_Icon_SoundOff', 34)}<span>Sound</span></button>
        <button class="tg ${s.bloom ? 'on' : ''}" data-s="bloom">${spr(s.bloom ? 'S_Icon_BloomOn' : 'S_Icon_BloomOff', 34)}<span>Bloom</span></button>
      </div>
      <h3>${T('UI/MainMenu/ChallengeText', { 0: WorldManager.CurrentWorldIndex + 1 })}</h3>
      <div class="slots">${this.challengeListHtml(true)}</div>
      <button class="danger" data-reset>Reset progress</button>
      <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'settings');
    m.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === m.el) return m.close();
      const t = e.target.closest('[data-s]');
      if (t) {
        this.app.setting(t.dataset.s, !Save.data.settings[t.dataset.s]);
        m.close();
        this.openSettings();
        return;
      }
      if (e.target.closest('[data-reset]')) {
        if (confirm('Delete all progress (cards, rank, currencies, levels)?')) this.app.resetProgress();
      }
    };
  },

  // ---------------------------------------------------------------- bonus claim overlay
  openBonusClaim() {
    if (!Bonus.CollectedAll) {
      tooltip(`${Bonus.Letters}/${MAX_BONUS_LETTERS} ${BONUS_WORD}`, $('.hb.bonus', this.root));
      return;
    }
    let doubled = false;
    const base = Bonus.settings.onClaim;
    const m = Modals.push(`<div class="panel bonus-ov">
      <h2>${T('UI/MainMenu/ClaimBonusReward')}</h2>
      <div class="bicon">${spr('S_Icon_Gems400', 140)}</div>
      <div class="amt">${T('UI/MainMenu/+Gems', { 0: base })}</div>
      <div class="btns"><button data-b="rv">${spr('S_Icon_Ad', 22)} ${T('UI/MainMenu/xGems', { 0: Bonus.settings.rvMultiplier })}</button>
      <button class="primary" data-b="claim">${T('UI/Claim')}</button></div></div>`, 'bonus');
    m.el.onclick = async (e) => {
      const b = e.target.closest('[data-b]')?.dataset.b;
      if (b === 'rv' && !doubled) {
        doubled = true;
        $('.amt', m.el).textContent = T('UI/MainMenu/+Gems', { 0: base * Bonus.settings.rvMultiplier });
        $('.bicon', m.el).innerHTML = spr('S_Icon_Gems800', 140);
        e.target.closest('button').remove();
      } else if (b === 'claim') {
        const from = $('.bicon', m.el);
        const n = Bonus.Claim(doubled);
        await this.flyRewards([{ id: 'Currency_Soft', amount: Math.min(14, Math.ceil(n / 50)) }], from);
        m.close();
        this.refreshHome();
      }
    };
  },

  // ---------------------------------------------------------------- daily chest (UI_DailyLootboxScreen)
  openDailyLootbox() {
    const lv = DailyLootbox.Level;
    const box = LootboxService.box(DailyLootbox.LootboxFor(lv));
    const art = LootboxService.art(box.type);
    const [cur, need] = DailyLootbox.Progress;
    const contents = (b) => {
      const g = LootboxService.Guaranteed(b);
      return `<div class="contents">${T('Lootbox/ContainsAtLeast')} ${b.cosmetics}
        ${g.map((x) => `<span style="color:${rgb(Meta.data.rarity[x.rarity].color)}">x${x.count} ${['Common', 'Rare', 'Epic', 'Legendary'][x.rarity]}</span>`).join('')}</div>`;
    };
    const next = lv < DailyLootbox.MaxLevel && !DailyLootbox.CanClaim ? LootboxService.box(DailyLootbox.LootboxFor(lv + 1)) : null;
    const m = Modals.push(`<div class="panel daily-ov">
      <h2>Daily Chest</h2>
      <div class="dbox" style="--s:${[1, 1.25, 1.5][Math.min(lv, 2)]}">${spr(art.sprite, 200)}</div>
      <div class="dlevel">Level ${lv + 1}</div>
      ${contents(box)}
      ${DailyLootbox.CanClaim ? '' : `<div class="fill"><i style="width:${(lv === DailyLootbox.MaxLevel ? 1 : cur / need) * 100}%"></i><span>${lv === DailyLootbox.MaxLevel ? 'MAX' : `${cur} / ${need}`}</span></div>
        <p class="hint">Flips earn chest XP today (perfect landings x2)</p>`}
      ${next ? `<div class="nextbox">${spr(LootboxService.art(next.type).small, 50)}<span>Level ${lv + 2}</span>${contents(next)}</div>` : ''}
      ${DailyLootbox.CanClaim ? `<button class="primary" data-c>${T('UI/Claim')}</button>` : `<div class="timer" data-dtimer>${T('UI/UnlocksIn', { 0: fmtTimer(DailyLootbox.TimeLeftToClaim) })}</div>`}
      <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'daily');
    m.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === m.el) return m.close();
      if (e.target.closest('[data-c]')) {
        DailyLootbox.TryClaim();
        m.close();
      }
    };
    const iv = setInterval(() => {
      if (m.closed) return clearInterval(iv);
      const t = $('[data-dtimer]', m.el);
      if (t) t.textContent = T('UI/UnlocksIn', { 0: fmtTimer(DailyLootbox.TimeLeftToClaim) });
    }, 1000);
  },

  // ---------------------------------------------------------------- director: pending rewards, rank popups, lootboxes, auto challenges
  startDirector() {
    if (this.directorRunning) return;
    this.directorRunning = true;
    this.menuStartHandled = false;
    const step = async () => {
      if (!this.visible) {
        this.directorRunning = false;
        return;
      }
      try {
        await this.directorStep();
      } catch (e) {
        console.error(e);
      }
      setTimeout(step, 250);
    };
    setTimeout(step, 500);
  },

  get busy() {
    return Modals.open || Fly.active > 0 || RankUI.busy || LootboxUI.busy || Tutorials.IsShowing;
  },

  async directorStep() {
    if (this.busy || this.app.loading) return;
    // 1. run earnings (MainMenuRunRewardHandler)
    const pending = Save.data.runEarnings;
    if (pending?.length) {
      Save.data.runEarnings = null;
      const results = pending.map((r) => grantReward(r, r.type || 'Endless'));
      Save.save();
      const start = $('.scoredisp', this.root) || $('.play', this.root);
      await this.flyRewards(results, start);
      return;
    }
    // 2. rank-up popups, then the reward track
    if (PlayerRank.HasRanksLeftToShow) {
      if (this.page !== 'home') this.setPage('home');
      await RankUI.showRankUps();
      this.refreshNav();
      this.refreshHome();
      return;
    }
    // 3. queued lootboxes
    if (LootboxService.HasQueued || Save.data.lootboxes?.openingResult) {
      await LootboxUI.openNext();
      Shop.HandleExternalCardsChange();
      if (this.page === 'shop') ShopUI.render?.();
      if (this.page === 'garage') GarageUI.refresh?.();
      this.refreshNav();
      return;
    }
    // 4. challenge overlay auto-open on menu start (rank 1, or something to claim)
    if (this.page === 'home' && !this.menuStartHandled) {
      this.menuStartHandled = true;
      if (WorldManager.IsWorldUnlocked(this.browseWorld) && (PlayerRank.ShouldAutoOpenChallengePopUp || ChallengeManager.ClaimableCount > 0)) {
        this.openChallenges(true);
        return;
      }
      this.showChallengePopups();
    }
  },

  /** UI_ChallengeMainMenuPopupHandler: brief progress cards of running challenges */
  showChallengePopups() {
    const box = $('.chal-popups', this.root);
    if (!box) return;
    const list = ChallengeManager.Slotted.filter((c) => !c.IsClaimed && !c.IsCompleted && c.Progress > 0);
    list.forEach((c, i) => {
      setTimeout(() => {
        if (!this.visible) return;
        const d = el('div', 'cpop', this.challengeSlotHtml(c, true));
        box.appendChild(d);
        setTimeout(() => d.classList.add('out'), 2600);
        setTimeout(() => d.remove(), 3100);
      }, i * 1500);
    });
  },

  // ---------------------------------------------------------------- menu tutorials (texts from I2)
  registerTutorials() {
    // RiderBaseTutorial waits for the menu to be idle: no pending run rewards, rank-up popups or chests
    const idle = () => !Save.data.runEarnings && !PlayerRank.HasRanksLeftToShow && !LootboxService.HasQueued && !RankUI.busy && !LootboxUI.busy && Fly.active === 0;
    const inMenu = () => this.visible && !this.app.loading && !Modals.open && idle();
    Tutorials.Step('FTUE_ClaimChallenge', {
      delay: 1.5,
      canStart: () => this.visible && this.chalModal && ChallengeManager.ClaimableCount > 0 && Fly.active === 0,
      steps: [{ text: () => T('Tutorials/CoreProgression/ClaimChallenge'), target: () => $('.cslot.done', this.chalModal?.el), tap: true, y: 0.2 }],
    });
    Tutorials.Step('FTUE_FirstLevelPlay', {
      canStart: () => inMenu() && this.page === 'home' && LevelUnlocks.IsDifficultyUnlocked(WorldManager.CurrentWorldIndex, 0) && !$('.hb.lvls', this.root)?.classList.contains('hidden'),
      steps: [
        { text: () => T('Tutorials/UnlockLevelDifficulty/Unlocked'), target: () => $('.hb.lvls', this.root), until: () => !!this.levelsModal && !this.levelsModal.closed, activeIf: () => this.page === 'home' && this.visible && !RankUI.busy },
        { text: () => T('Tutorials/UnlockLevelDifficulty/HighlightLevel'), target: () => $('.lvl', this.levelsModal?.el), until: () => this.app.state !== 'menu', activeIf: () => !!this.levelsModal && !this.levelsModal.closed },
        { text: () => T('Tutorials/UnlockLevelDifficulty/HighlightLevelHUD'), target: () => $('#hud .score'), tap: true, pause: true, y: 0.32, activeIf: () => this.app.state === 'running' },
      ],
    });
    Tutorials.Step('FTUE_SecondLevelPlay', {
      canStart: () => Tutorials.list.find((t) => t.saveName === 'FTUE_FirstLevelPlay')?.IsFinished && (Save.data.runs.levels || 0) >= 2 && this.app.state === 'running' && this.app.mode?.level,
      delay: 0.5,
      steps: [
        { text: () => T('Tutorials/UnlockLevelDifficulty/Flip'), image: 'S_Tutorial_Flip', tap: true, pause: true, y: 0.12 },
        { text: () => T('Tutorials/UnlockLevelDifficulty/Land'), image: 'S_Tutorial_Landing', tap: true, pause: true, y: 0.12 },
      ],
    });
    Tutorials.Step('FTUE_PlayerRankUpPopup_Rank1', {
      delay: 0.7,
      canStart: () => RankUI.popupOpen && PlayerRank.CurrentRank >= 1 && RankUI.popupShownRewards >= 1,
      steps: [{ text: () => T('Tutorials/CoreProgression/Rank2Reward'), until: () => !RankUI.popupOpen, y: 0.15 }],
    });
    Tutorials.Step('FTUE_PlayerRankUpPopup_Rank3', {
      canStart: () => RankUI.popupOpen && RankUI.popupRank >= 3 && RankUI.popupShownRewards >= 1,
      steps: [{ text: () => T('Tutorials/CoreProgression/Rank4Reward'), until: () => !RankUI.popupOpen, y: 0.15 }],
    });
    Tutorials.Step('FTUE_Shop', {
      delay: 0.4,
      canStart: () => inMenu() && PlayerRank.CurrentRank >= 2 && this.app.state === 'menu',
      steps: [
        { text: () => T('Tutorials/UnlockShop/HighlightShop'), target: () => $('.nav[data-page="shop"]', this.root), until: () => this.page === 'shop', skipIf: () => this.page === 'shop', activeIf: () => this.visible && !Modals.open },
        { text: () => T('Tutorials/UnlockShop/HighlightChest'), target: () => $('.chest.large', this.root), until: () => !!ShopUI.confirmOpen, after: 0.3, activeIf: () => this.page === 'shop' },
        { text: () => T('Tutorials/UnlockShop/HighlightChestConfirmation'), target: () => $('.modal.m-confirm .primary'), until: () => !ShopUI.confirmOpen },
      ],
    });
    Tutorials.Step('FTUE_UnlockWorld', {
      delay: 1,
      canStart: () => inMenu() && this.page === 'home' && WorldManager.IsWorldUnlocked(1),
      steps: [
        { text: () => T('Tutorials/UnlockWorld/HighlightWorldSelectButton'), target: () => $('.wnav.right', this.root), until: () => WorldManager.CurrentWorldIndex >= 1, skipIf: () => WorldManager.CurrentWorldIndex >= 1, activeIf: () => this.page === 'home' && this.visible && !Modals.open },
      ],
    });
  },
};

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export { richText };
