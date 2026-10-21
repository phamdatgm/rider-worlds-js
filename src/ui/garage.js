// UI_MetaScreen (garage): tabs Vehicle/Trail/Landing/Explosion/Color, inspect panel with the 4 rank skins,
// world-grouped card grid. Tapping an owned card equips it; locked ranks are previewed on the menu player.
import { $, $$, spr, tooltip, rarityColor, RARITY_TEXT, sfx, Fly } from './dom.js';
import { metaCardHtml, rankSlotHtml } from './cardview.js';
import { T } from '../meta/data.js';
import { CardService, CardType } from '../meta/cards.js';
import { Currencies } from '../meta/currency.js';
import { WorldManager } from '../meta/worlds.js';

const TABS = [
  { type: CardType.Vehicle, icon: 'S_Icon_Bikes_A', term: 'CardType/Vehicles', cam: 'vehicle' },
  { type: CardType.VehicleTrail, icon: 'S_Icon_Trails_A', term: 'CardType/Trails', cam: 'trail', preview: 'trail' },
  { type: CardType.VehicleLanding, icon: 'S_Icon_Landing_A', term: 'CardType/Landings', cam: 'landing', preview: 'landing' },
  { type: CardType.VehicleDeath, icon: 'S_Icon_Death_A', term: 'CardType/Deaths', cam: 'death', preview: 'death' },
  { type: CardType.VehicleColor, icon: 'S_Icon_Colors_A', term: 'CardType/Colors', cam: 'vehicle' },
];

function tabBadge(tab) {
  const cards = CardService.ofType(tab.type);
  if (tab.type === CardType.Vehicle) return cards.some((c) => c.IsUsable && c.UnseenCount > 0);
  return cards.some((c) => !c.IsLocked && c.IsUnseen);
}

export const GarageUI = {
  root: null,
  tab: 0,
  inspect: null,
  previewRank: null,

  enter(root, app) {
    this.root = root;
    this.app = app;
    this.active = true;
    root.innerHTML = `<div class="garage">
      <div class="gtabs">${TABS.map((t, i) => `<button class="gtab" data-tab="${i}">${spr(t.icon, 32)}<b class="dot"></b></button>`).join('')}</div>
      <div class="inspect"><div class="iname"></div><div class="irarity"></div><div class="ranks"></div></div>
      <div class="gscroll"></div></div>`;
    root.onclick = (e) => this.onClick(e);
    this.setTab(this.tab, true);
  },

  leave() {
    if (!this.active) return;
    this.active = false;
    this.app?.stopPreview();
    if (this.previewRank !== null) this.app?.applyCards({});
    this.previewRank = null;
  },

  refresh() {
    if (this.active) this.setTab(this.tab, true);
  },

  setTab(i, force) {
    if (i === this.tab && !force) return;
    this.tab = i;
    const t = TABS[i];
    for (const b of $$('.gtab', this.root)) {
      b.classList.toggle('on', Number(b.dataset.tab) === i);
      b.querySelector('.dot').classList.toggle('on', tabBadge(TABS[b.dataset.tab]));
    }
    this.previewRank = null;
    this.app.applyCards({});
    this.app.setStaticView(t.cam);
    this.inspect = CardService.Equipped(t.type);
    this.renderInspect();
    this.renderGrid();
    this.startPreview();
  },

  startPreview() {
    const t = TABS[this.tab];
    this.app.stopPreview();
    if (t.preview) this.app.startPreview(t.preview);
  },

  renderGrid() {
    const t = TABS[this.tab];
    const cards = [...CardService.ofType(t.type)];
    // UI_MetaTab sort: usable first, then copies, then rarity (stable)
    cards.sort((a, b) => b.IsUsable - a.IsUsable || b.Total - a.Total || b.Rarity - a.Rarity);
    const eq = CardService.Equipped(t.type);
    let html = '';
    for (let w = 0; w < WorldManager.count; w++) {
      const list = cards.filter((c) => c.UnlocksInWorldID === w);
      if (!list.length) continue;
      html += `<div class="wdiv">${T('UI/WorldSelect/World', { 0: w + 1 })}</div><div class="cgrid">${list.map((c) => metaCardHtml(c, { selected: c === eq })).join('')}</div>`;
    }
    $('.gscroll', this.root).innerHTML = html;
  },

  renderInspect() {
    const c = this.inspect;
    if (!c) return;
    const shown = this.previewRank ?? c.CurrentRank;
    $('.iname', this.root).textContent = c.Label;
    const ir = $('.irarity', this.root);
    ir.textContent = RARITY_TEXT[shown];
    ir.style.color = rarityColor(shown);
    $('.ranks', this.root).innerHTML = [0, 1, 2, 3].map((r) => rankSlotHtml(c, r, r === shown)).join('');
  },

  async onClick(e) {
    const tb = e.target.closest('[data-tab]');
    if (tb) return this.setTab(Number(tb.dataset.tab));
    const rs = e.target.closest('[data-rank]');
    if (rs) return this.pressRank(Number(rs.dataset.rank), rs);
    const cd = e.target.closest('[data-card]');
    if (cd) return this.pressCard(CardService.get(cd.dataset.card), cd);
  },

  /** UI_MetaTab.CardPressed */
  async pressCard(card, node) {
    if (!card) return;
    if (card.IsLocked) {
      sfx('UI_LockedBike');
      node.classList.remove('shake');
      void node.offsetWidth;
      node.classList.add('shake');
      tooltip(T('UI/Meta/UnlocksInWorld', { 0: card.def.world }), node);
      return;
    }
    sfx('UI_UnlockedBike');
    if (card.IsRankUnseen(0)) card.SetUnseen(0, false);
    this.previewRank = null;
    this.inspect = card;
    if (!CardService.IsEquipped(card)) {
      await this.app.loadCards([card]);
      CardService.Equip(card);
      this.app.applyCards({});
    }
    this.renderInspect();
    this.renderGrid();
    for (const b of $$('.gtab', this.root)) b.querySelector('.dot').classList.toggle('on', tabBadge(TABS[b.dataset.tab]));
    this.startPreview();
  },

  /** UI_MetaCardRanks.CardPressed: unlocked rank -> equip skin (+1 star if unseen); locked -> temporary preview */
  async pressRank(r, node) {
    const card = this.inspect;
    const shown = this.previewRank ?? card.CurrentRank;
    if (r === shown) return;
    await this.app.loadCards([card]);
    if (card.IsRankUnlocked(r)) {
      if (card.IsRankUnseen(r)) {
        Currencies.Star.Gain(1, 'CosmeticLevel');
        Fly.icons('S_Icon_Star_Reward_A', node, document.querySelector('.rankbar'), 1);
        sfx('UI_StarAdded');
      }
      card.SetUnseen(r, false);
      this.previewRank = null;
      card.SetRank(r);
      this.app.applyCards({});
    } else {
      this.previewRank = r;
      this.app.applyCards({ [card.Type]: { card, rank: r } });
    }
    this.renderInspect();
    this.renderGrid();
    this.startPreview();
  },
};
