// UI_ShopPage: Free Rewards (RV track), Chests, Daily Deals, Rubies (daily gift + packs).
import { $, el, spr, Modals, tooltip, fmtNum, fmtTimer, ICON, rarityColor, RARITY_TEXT, currencyIcon, Fly, sfx } from './dom.js';
import { rewardCardHtml, metaCardHtml } from './cardview.js';
import { T, richText } from '../meta/data.js';
import { CardService } from '../meta/cards.js';
import { Shop, PaymentOption, canAfford } from '../meta/shop.js';
import { LootboxService } from '../meta/lootbox.js';
import { Tutorials } from '../meta/tutorials.js';

function priceHtml(p) {
  if (p.pay === PaymentOption.RewardedVideo) return `${spr('S_Icon_Ad', 20)} ${T('Monetization/Free')}`;
  if (p.pay === PaymentOption.Free) return T('Monetization/Free');
  if (p.pay === PaymentOption.Currency) return `${spr(p.data === 'Hard' ? ICON.hard : ICON.soft, 20)} ${fmtNum(p.amount)}`;
  return T('Monetization/NotAvailable');
}

export function showRewardReveal(result) {
  if (!result?.cards?.length) return;
  const { card, before, added } = result.cards[0];
  const m = Modals.push(`<div class="panel reveal">${rewardCardHtml(card, before + added, { added })}
    <button class="primary" data-x>${T('UI/Continue')}</button></div>`, 'reveal');
  m.el.onclick = (e) => e.target.closest('[data-x]') && m.close();
}

export const ShopUI = {
  root: null,
  confirmOpen: null,

  enter(root, app) {
    this.root = root;
    this.app = app;
    Shop.Tick();
    Shop.TryRefreshDeals();
    Shop.HandleExternalCardsChange();
    this.render();
    root.onclick = (e) => this.onClick(e);
    this._changed = () => this.render();
    Shop.onChanged.AddListener(this._changed);
    LootboxService.onClaimed.AddListener(this._changed);
  },

  leave() {
    Shop.onChanged.RemoveListener(this._changed);
    LootboxService.onClaimed.RemoveListener(this._changed);
  },

  tick() {
    if (!this.root) return;
    for (const t of this.root.querySelectorAll('[data-t]')) {
      const k = t.dataset.t;
      if (k === 'rv') t.textContent = T('UI/Shop/RVrewards/Refresh', { 0: fmtTimer(secsToMidnight()) });
      if (k === 'chest') t.textContent = `${T('UI/Shop/Lootbox/NextFreeIn')} ${fmtTimer(Shop.videoTimeLeft)}`;
      if (k === 'deals') t.textContent = T('UI/Shop/DailyDeals/NewCardsTimer', { 0: fmtTimer(Shop.TimeLeftToRefreshDeals) });
    }
  },

  render() {
    const r = this.root;
    if (!r) return;
    const top = r.scrollTop;
    r.innerHTML = `<div class="shop">${Shop.data.order.map((s) => this.section(s)).join('')}</div>`;
    r.scrollTop = top;
    this.tick();
  },

  section(id) {
    if (id === 'RVRewardTrack') return this.rvSection();
    if (id === 'LootboxShop') return this.chestSection();
    if (id === 'DailyDeals') return this.dealsSection();
    if (id === 'HardCurrency') return this.rubiesSection();
    return '';
  },

  rvSection() {
    const tr = Shop.rvTrack;
    let prev = 0;
    const steps = tr.steps
      .map((s) => {
        const f = Math.max(0, Math.min(1, (tr.progression - prev) / (s.required - prev)));
        prev = s.required;
        const claimable = tr.IsUnclaimed(s);
        const claimed = tr.IsClaimed(s);
        const icon = s.id === 'Lootbox' ? LootboxService.art(LootboxService.box(s.extra)?.type ?? 101).small : s.id === 'Random Card' ? 'S_Icon_Cards' : currencyIcon(s.id);
        return `<div class="rvstep ${claimable ? 'ready' : ''} ${claimed ? 'claimed' : ''}">
          ${spr(icon, 56)}<b>${s.id === 'Lootbox' || s.id === 'Random Card' ? '' : `x${s.amount}`}</b>
          <div class="fill"><i style="width:${f * 100}%"></i></div>
          ${claimed ? spr(ICON.check, 24) : claimable ? `<button class="primary" data-rvclaim="${s.sid}">${T('UI/Claim')}</button>` : `<small>${s.required}</small>`}
        </div>`;
      })
      .join('');
    const left = tr.NextStepUnlocksAt - tr.progression;
    return `<section class="sec rv"><h2>${T('UI/Shop/RVrewards/Header')}</h2>
      <div class="rvsteps">${steps}</div>
      ${tr.IsFullyUnlocked ? `<div class="note">${T('UI/Shop/ComeBackTomorrow')}</div>` : `<button class="watch" data-rv>${spr('S_Icon_Ad', 22)} ${richText(T('UI/Shop/RVrewards/WatchRV', { 0: left }))}</button>`}
      <div class="timer" data-t="rv"></div></section>`;
  },

  chestSection() {
    const items = Shop.data.lootboxOptions
      .map((o, i) => {
        const p = Shop.LootboxOption(i);
        const box = LootboxService.box(p.lootbox);
        const art = LootboxService.art(box?.type ?? 102);
        const can = Shop.CanBuyLootbox(i);
        return `<div class="chest ${i === Shop.data.lootboxOptions.length - 1 ? 'large' : 'small'} ${can ? 'avail' : ''}" data-chest="${i}">
          <h3>${(box?.name || '').trim()}</h3>${spr(art.sprite, 150)}
          <div class="contains">${T('Lootbox/ContainsAtLeast')} ${box?.cosmetics ?? ''}</div>
          <button class="${can ? 'primary' : ''}" data-buy="${i}">${priceHtml(p)}</button>
          ${p.cooldown ? '<small data-t="chest"></small>' : ''}</div>`;
      })
      .join('');
    return `<section class="sec chests"><h2>${T('UI/Shop/Lootbox/Header')} <button class="info" data-info>${spr('S_Icon_Info', 20)}</button></h2><div class="chestrow">${items}</div></section>`;
  },

  dealsSection() {
    const d = Shop.deals;
    const slots = (d?.slots || [])
      .map((s, i) => {
        const p = s.payment;
        if (!p) return `<div class="deal empty">${richText(T('UI/Shop/DailyDeals/NoDailyDealsText'))}</div>`;
        const card = CardService.get(p.id);
        const bought = !Shop.CanBuyDeal(i);
        return `<div class="deal ${bought ? 'bought' : ''}" data-deal="${i}">
          ${metaCardHtml(card, { size: 104 })}<div class="dcount">+${p.count}</div>
          <div class="drarity" style="color:${rarityColor(p.rarity)}">${RARITY_TEXT[p.rarity]}</div>
          ${bought ? `<div class="purchased">${T('UI/Shop/Purchased')}</div>` : `<button data-dbuy="${i}">${priceHtml(p)}</button>`}</div>`;
      })
      .join('');
    const canRefresh = CardService.IsAnyCardNotMaxedOut;
    return `<section class="sec deals"><h2>${T('UI/Shop/DailyDeals/Header')}
      ${canRefresh ? `<button class="refresh ${Shop.CanRefreshDeals ? '' : 'off'}" data-refresh>${spr('S_Restart', 20)} ${T('UI/Shop/DailyDeals/Refresh')}</button>` : ''}</h2>
      <div class="dealrow">${slots}</div><div class="timer" data-t="deals"></div></section>`;
  },

  rubiesSection() {
    const gift = Shop.IsGiftUnlocked
      ? `<div class="gift ${Shop.CanClaimGift ? 'ready' : ''}"><h3>${T('UI/Shop/Gift/Header')}</h3>${spr('S_Icon_Ruby_2', 70)}
        ${Shop.CanClaimGift ? `<button class="primary" data-gift>${spr('S_Icon_Ad', 20)} ${T('UI/Shop/Gift/ViewAd', { 0: Shop.data.gift.amount })}</button>` : `<small>${T('UI/Shop/Gift/Cooldown')}</small>`}</div>`
      : '';
    const sizes = CardService.get(2000000300)?.def.shopSizes || [];
    const icon = (n) => sizes.filter((s) => s.min <= n).sort((a, b) => b.min - a.min)[0]?.icon || ICON.hard;
    const packs = (Shop.data.packs.hard || [])
      .map((o) => `<div class="pack">${o.sticker ? `<i class="sticker">${T(o.sticker)}</i>` : ''}<b>${fmtNum(o.get)}</b>${spr(icon(o.get), 80)}
        <button disabled title="Real-money purchases are not available">${T('Monetization/NotAvailable').replace(/([a-z])([A-Z])/g, '$1 $2')}</button></div>`)
      .join('');
    return `<section class="sec rubies"><h2>${T('UI/Shop/Currency/Header')}</h2>${gift}<div class="packrow">${packs}</div></section>`;
  },

  onClick(e) {
    const t = e.target;
    const rvc = t.closest('[data-rvclaim]');
    if (rvc) {
      const step = Shop.rvTrack.steps.find((s) => String(s.sid) === rvc.dataset.rvclaim);
      const res = Shop.rvTrack.ClaimReward(step, 'RVRewardTrack');
      if (res) {
        this.app.flyRewards?.([res], rvc);
        if (res.cards) showRewardReveal(res);
      }
      this.render();
      return;
    }
    if (t.closest('[data-rv]')) {
      Shop.WatchRV();
      return;
    }
    if (t.closest('[data-info]')) return tooltip(T('UI/Shop/Lootbox/Info/Body'), t.closest('[data-info]'));
    const buy = t.closest('[data-buy]') || t.closest('[data-chest]');
    if (buy) return this.openChestConfirm(Number((buy.dataset.buy ?? buy.dataset.chest)));
    const db = t.closest('[data-dbuy]') || t.closest('[data-deal]');
    if (db) return this.openDealConfirm(Number(db.dataset.dbuy ?? db.dataset.deal));
    if (t.closest('[data-refresh]')) return this.openRefresh();
    if (t.closest('[data-gift]')) {
      if (Shop.ClaimGift()) this.app.flyRewards?.([{ id: 'Currency_Hard', amount: Shop.data.gift.amount }], t.closest('.gift'));
    }
  },

  openChestConfirm(i) {
    const p = Shop.LootboxOption(i);
    const box = LootboxService.box(p.lootbox);
    const art = LootboxService.art(box.type);
    const rarity = i === Shop.data.lootboxOptions.length - 1 ? 2 : 0;
    if (!Shop.CanBuyLootbox(i) && p.pay === PaymentOption.RewardedVideo) return tooltip(T('UI/Shop/ComeBackTomorrow'));
    const m = Modals.push(`<div class="panel small confirm-chest">
      <h2>${(box.name || '').trim()}</h2>${spr(art.sprite, 200)}
      <div class="rarity" style="color:${rarityColor(rarity)}">${RARITY_TEXT[rarity]}</div>
      <div class="contains">${T('Lootbox/ContainsAtLeast')} ${box.cosmetics}</div>
      <p>${T('UI/Shop/Lootbox/Info/Body')}</p>
      <button class="primary" data-ok>${priceHtml(p)}</button>
      <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'confirm', { onClose: () => (this.confirmOpen = null) });
    this.confirmOpen = m;
    m.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === m.el) return m.close();
      if (!e.target.closest('[data-ok]')) return;
      // ShopTutorial: while started, the purchase queues the FTUE chest instead
      const ftue = Tutorials.active?.saveName === 'FTUE_Shop' ? 'FTUELootbox' : null;
      const res = Shop.BuyLootbox(i, ftue);
      if (res === 'ok') {
        sfx('UI_ButtonClick_Generic');
        m.close();
      } else if (res === 'currency') tooltip(T(p.data === 'Hard' ? 'UI/Shop/NotEnoughHardCurrency' : 'UI/Shop/NotEnoughSoftCurrency'), e.target);
      else tooltip(T('UI/Shop/ComeBackTomorrow'), e.target);
    };
  },

  openDealConfirm(i) {
    if (!Shop.CanBuyDeal(i)) return;
    const p = Shop.deals.slots[i].payment;
    const card = CardService.get(p.id);
    const m = Modals.push(`<div class="panel small confirm-deal">
      <h2>${T('UI/Shop/DailyDeals/Header')}</h2>${rewardCardHtml(card, card.Total)}
      <div class="dcount">+${p.count}</div>
      <button class="primary" data-ok>${priceHtml(p)}</button>
      <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'confirm');
    m.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === m.el) return m.close();
      if (!e.target.closest('[data-ok]')) return;
      const r = Shop.BuyDeal(i);
      if (r.status === 'ok') {
        m.close();
        showRewardReveal(r.result);
      } else if (r.status === 'currency') tooltip(T('UI/Shop/NotEnoughHardCurrency'), e.target);
    };
  },

  openRefresh() {
    if (!Shop.CanRefreshDeals) return tooltip(T('UI/Shop/ComeBackTomorrow'));
    const dd = Shop.data.dailyDeals;
    const m = Modals.push(`<div class="panel small">
      <h2>${T('UI/Shop/DailyDeals/Refresh/Header')}</h2>
      <div class="big">${dd.refreshesPerDay - (Shop.deals?.refreshCount || 0)}/${dd.refreshesPerDay}</div>
      <div class="btns"><button data-r="ad">${spr('S_Icon_Ad', 22)} ${T('Monetization/Free')}</button><button data-r="pay">${spr(ICON.hard, 22)} ${dd.refreshCost}</button></div>
      <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'refresh');
    m.el.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === m.el) return m.close();
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (!r) return;
      const res = Shop.PayRefreshDeals(r === 'ad');
      if (res === 'ok') m.close();
      else tooltip(T(res === 'currency' ? 'UI/Shop/NotEnoughHardCurrency' : 'UI/Shop/ComeBackTomorrow'), e.target);
    };
  },
};

function secsToMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return (d.getTime() - Date.now()) / 1000;
}

export { Fly, el, $ };
