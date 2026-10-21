// Shop sections: RV reward track (free), chests (LootboxShop), daily deals, rubies (gift + IAP packs).
// Rewarded-video payments succeed immediately (as in the shipped build); real-money packs are unavailable.
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Meta } from './data.js';
import { Currencies, CurrencyType } from './currency.js';
import { CardService } from './cards.js';
import { grantReward, RewardTrack } from './rewards.js';
import { PlayerRank } from './rank.js';
import { LootboxService } from './lootbox.js';

export const PaymentOption = { NotAvailable: 0, Free: 1, RewardedVideo: 2, IAP: 3, Currency: 4 };

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const endOfDay = () => today() + 86399999;

function sstate() {
  return (Save.data.shop ||= { lootbox: { videoUsed: 0, videoAt: 0 }, deals: null, gift: { day: 0, claimed: 0 } });
}

function currencyOf(data) {
  return data === 'Hard' ? Currencies.Hard : Currencies.Soft;
}

export function canAfford(p) {
  if (p.pay === PaymentOption.RewardedVideo || p.pay === PaymentOption.Free) return true;
  if (p.pay === PaymentOption.Currency) return currencyOf(p.data).CanSpend(p.amount);
  return false;
}

export const Shop = {
  onChanged: new EventAction(),
  rvTrack: null,

  init() {
    this.rvTrack = new RewardTrack('RVRewardTrack', Meta.data.rvTrack);
    setInterval(() => this.Tick(), 1000);
  },

  get data() {
    return Meta.data.shop;
  },

  Tick() {
    let changed = false;
    if (Save.data.rvTrackDay !== new Date().toDateString()) {
      Save.data.rvTrackDay = new Date().toDateString();
      this.rvTrack.ResetTrack();
      changed = true;
    }
    if (this.TryRefreshDeals()) changed = true;
    const g = sstate().gift;
    if (today() > g.day) {
      g.day = today();
      g.claimed = 0;
      changed = true;
    }
    if (changed) {
      Save.setDirty();
      this.onChanged.Raise();
    }
  },

  // ------------------------------------------------ RV reward track
  WatchRV() {
    if (this.rvTrack.IsFullyUnlocked) return false;
    this.rvTrack.HandleProgress(1);
    this.onChanged.Raise();
    return true;
  },

  // ------------------------------------------------ chests (ShopPaymentHandler "LootboxShop")
  videoBlocked() {
    return sstate().lootbox.videoAt - Date.now() > 0;
  },

  get videoTimeLeft() {
    return Math.max(0, (sstate().lootbox.videoAt - Date.now()) / 1000);
  },

  /** effective option of a chest slot (the RV slot sells the gem chest while on cooldown) */
  LootboxOption(i) {
    const o = this.data.lootboxOptions[i];
    if (o.pay === PaymentOption.RewardedVideo && this.videoBlocked()) return { ...this.data.rvCooldownOption, cooldown: true };
    return o;
  },

  CanBuyLootbox(i) {
    const p = this.LootboxOption(i);
    if (p.pay === PaymentOption.RewardedVideo) {
      const s = sstate().lootbox;
      if (s.videoAt < today()) return p.amount > 0;
      return p.amount > s.videoUsed ? s.videoAt < Date.now() : false;
    }
    return canAfford(p);
  },

  BuyLootbox(i, overrideBox) {
    const p = this.LootboxOption(i);
    if (p.pay === PaymentOption.RewardedVideo) {
      if (!this.CanBuyLootbox(i)) return 'unavailable';
      const s = sstate().lootbox;
      s.videoUsed = s.videoAt > today() ? s.videoUsed + 1 : 1;
      if (s.videoUsed % p.amount === 0) {
        s.videoUsed = 0;
        s.videoAt = endOfDay();
      } else s.videoAt = Math.min(Date.now() + Number(p.data || 0) * 60000, endOfDay());
    } else if (!currencyOf(p.data).Spend(p.amount, 'Chests')) return 'currency';
    LootboxService.AddToQueue(overrideBox || p.lootbox, 'Chests');
    Save.setDirty();
    this.onChanged.Raise();
    return 'ok';
  },

  // ------------------------------------------------ daily deals
  get deals() {
    return sstate().deals;
  },

  DealsCount() {
    const pr = this.data.dailyDeals.perRank;
    for (let i = pr.length - 1; i >= 0; i--) if (PlayerRank.CurrentRank >= pr[i][0]) return pr[i][1];
    return 0;
  },

  TryRefreshDeals() {
    const d = sstate().deals;
    if (!d || !d.slots.length || !d.last || today() > d.last) {
      this.RefreshDeals(true);
      return true;
    }
    if (d.slots.length < this.DealsCount()) {
      for (let i = d.slots.length; i < this.DealsCount(); i++) d.slots.push(this.CreateSlot(i));
      return true;
    }
    return false;
  },

  RefreshDeals(newDay) {
    const s = sstate();
    const prev = s.deals;
    s.deals = { last: today(), refreshCount: newDay ? 0 : (prev?.refreshCount || 0) + 1, slots: [] };
    for (let i = 0; i < this.DealsCount(); i++) s.deals.slots.push(this.CreateSlot(i));
    Save.setDirty();
  },

  get CanRefreshDeals() {
    return (this.deals?.refreshCount || 0) < this.data.dailyDeals.refreshesPerDay;
  },

  PayRefreshDeals(free) {
    if (!this.CanRefreshDeals) return 'unavailable';
    if (!free && !Currencies.Hard.Spend(this.data.dailyDeals.refreshCost, 'DailyDeals')) return 'currency';
    this.RefreshDeals(false);
    this.onChanged.Raise();
    return 'ok';
  },

  CreateSlot(i) {
    return { bought: 0, payment: this.CreatePayment(i, true) };
  },

  CreatePayment(index, selectNew) {
    const dd = this.data.dailyDeals;
    const def = dd.items[index] || dd.items[0];
    const slots = sstate().deals?.slots || [];
    let card;
    if (selectNew) {
      const used = slots.filter((s, j) => j !== index && s?.payment).map((s) => s.payment.id);
      const cand = [];
      for (const t of dd.allowedTypes) {
        for (const c of CardService.ofType(t)) if (c.IsAllowedAsReward && !c.IsMaxedOut && !c.IsLocked && !used.includes(c.ID)) cand.push(c);
      }
      if (!cand.length) return null;
      card = cand[Math.floor(Math.random() * cand.length)];
    } else {
      card = CardService.get(slots[index]?.payment?.id);
      if (!card || card.IsMaxedOut) return this.CreatePayment(index, true);
    }
    const count = card.UIMaxCards - card.UICurrentCards;
    const pIdx = slots[index] ? Math.min(slots[index].bought, def.length - 1) : 0;
    const [opt, type] = def[pIdx];
    const cost = dd.costs[card.Rarity] || dd.costs[0];
    const amount = opt === PaymentOption.Currency ? (type === CurrencyType.Soft ? cost[0] : cost[1]) * count : 0;
    return { id: card.ID, count, rarity: card.Rarity, pay: opt, data: type === CurrencyType.Soft ? 'Soft' : 'Hard', amount };
  },

  CanBuyDeal(i) {
    const s = this.deals?.slots[i];
    return !!(s?.payment && s.bought < (this.data.dailyDeals.items[i] || [[]]).length);
  },

  /** on shop open and after lootbox claims: card progress changed -> recompute price / pick new card */
  HandleExternalCardsChange() {
    const d = this.deals;
    if (!d) return;
    d.slots.forEach((s, i) => {
      if (s.payment && this.CanBuyDeal(i)) {
        const old = s.payment.id;
        s.payment = this.CreatePayment(i, false);
        if (s.payment && s.payment.id !== old) s.bought = 0;
      }
    });
    Save.setDirty();
  },

  BuyDeal(i) {
    if (!this.CanBuyDeal(i)) return { status: 'unavailable' };
    const s = this.deals.slots[i];
    const p = s.payment;
    if (p.pay === PaymentOption.Currency && !currencyOf(p.data).Spend(p.amount, 'DailyDeals')) return { status: 'currency' };
    const result = grantReward({ id: 'Card', amount: p.count, extra: String(p.id) }, 'DailyDeals');
    s.bought++;
    if (this.CanBuyDeal(i)) s.payment = this.CreatePayment(i, true);
    Save.setDirty();
    this.onChanged.Raise();
    return { status: 'ok', result };
  },

  get TimeLeftToRefreshDeals() {
    return Math.max(0, ((this.deals?.last || today()) + 86400000 - Date.now()) / 1000);
  },

  // ------------------------------------------------ rubies: daily gift (+ IAP packs that are not purchasable)
  get IsGiftUnlocked() {
    return PlayerRank.CurrentRank >= this.data.gift.unlockRank;
  },

  get CanClaimGift() {
    return this.IsGiftUnlocked && sstate().gift.claimed < this.data.gift.perDay;
  },

  ClaimGift() {
    if (!this.CanClaimGift) return false;
    sstate().gift.claimed++;
    Currencies.Hard.Gain(this.data.gift.amount, 'Ads');
    Save.setDirty();
    this.onChanged.Raise();
    return true;
  },

  /** ShopGameNotificationHandler */
  get Pings() {
    const opts = this.data.lootboxOptions;
    let n = 0;
    if (!this.videoBlocked()) n++;
    if (canAfford(opts[opts.length - 1])) n++;
    if (this.CanClaimGift) n++;
    return n;
  },
};
