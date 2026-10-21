// Shop Screen (UI_ShopPage): CW.Shop (BaseScrollShop, BaseShopSection, ShopItemUI, PaymentHandler, Ticker) and the
// game sections (RV reward track, chests, daily deals, rubies) with their items, confirmations and popups.
// Ads / IAP removed as in the shipped build: rewarded-video payments succeed at once, IAP products are unavailable.
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { EventAction, WaitWhile, WaitForSeconds, Time } from '../engine/core.js';
import { registerComponent, registerSO, ScriptableObject, Instantiate, ComponentRegistry, getRuntimeSO } from '../engine/instantiate.js';
import { LoopHooks } from '../engine/loop.js';
import { Meta } from '../meta/data.js';
import { Save } from '../meta/save.js';
import { Currencies, CurrencyType } from '../meta/currency.js';
import { CardService, CardType } from '../meta/cards.js';
import { grantReward } from '../meta/rewards.js';
import { LootboxService } from '../meta/lootbox.js';
import { Shop } from '../meta/shop.js';
import { Tutorials } from '../meta/tutorials.js';
import { bumpLayout } from '../ugui/rect.js';
import { Color } from '../ugui/graphic.js';
import { UISprites } from '../ugui/sprites.js';
import { InputUIBlocker } from '../ugui/events.js';
import { localize, ev, csFormat } from './common.js';
import { PlayerRankManager } from './services.js';
import { MainMenuManager, MainMenuPage } from './home.js';
import { rewardAsset, hexInts } from './rewards.js';
import { rarityData, localizeRarity, replaceTerm } from './garage.js';

// ---------------------------------------------------------------- C# helpers

const DAY = 86400000;

function dateOf(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** TimeSpan.ToString(@"hh\:mm\:ss") of a span in ms (components, sign dropped) */
export function formatHMS(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const p = (v) => String(v).padStart(2, '0');
  return `${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

/** SettingsContainer.Instance.timeFormatSettings (d\ hh\:mm\:ss / d\ hh\:mm, TrimStart('0', ' ', ':')) */
export const TimeFormatSettings = {
  FormatWithSeconds(ms) {
    const s = Math.floor(Math.abs(ms) / 1000);
    const p = (v) => String(v).padStart(2, '0');
    return `${Math.floor(s / 86400)} ${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`.replace(/^[0 :]+/, '');
  },
  FormatWith(ms) {
    const s = Math.floor(Math.abs(ms) / 1000);
    const p = (v) => String(v).padStart(2, '0');
    return `${Math.floor(s / 86400)} ${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}`.replace(/^[0 :]+/, '');
  },
};

/** (string)LocalizedString: I2 GetTranslation (null when the term is empty / unknown) */
function translation(ls) {
  const t = typeof ls === 'string' ? ls : ls?.mTerm;
  if (!t) return null;
  const s = Meta.data?.loc?.[t];
  return s === undefined ? null : s;
}

const CURRENCY_NAMES = ['Soft', 'Hard', 'Bonus', 'Star'];

/** Enum.TryParse<CurrencyType>(data) (names or numbers), -1 when invalid */
function parseCurrency(data) {
  if (data === null || data === undefined) return -1;
  const s = String(data).trim();
  const i = CURRENCY_NAMES.indexOf(s);
  if (i >= 0) return i;
  return /^\d+$/.test(s) && +s < 4 ? +s : -1;
}

/** ICurrencyIO by name (CurrencyService.GetCurrency(string)) */
function currencyByName(data) {
  const t = parseCurrency(data);
  return t < 0 ? null : Currencies.get(t);
}

function cardLabel(card) {
  if (!card) return '';
  if (card.Type === CardType.Booster && card.def.nameTerm) return localize(card.def.nameTerm);
  return card.GameAsset?.Label ?? card.Label;
}

/** IGameCard.GameAsset.Image */
function cardImage(card) {
  return UISprites.byName(card?.def?.image);
}

/** Button.onClick.AddLazyListener */
function addLazy(button, fn) {
  if (!button) return;
  button.onClick.RemoveListener(fn);
  button.onClick.AddListener(fn);
}

/** TutorialUtility.Instance (ported elsewhere; optional) */
export function tutorialUtility() {
  return ComponentRegistry.get('TutorialUtility')?.Instance || null;
}

// ---------------------------------------------------------------- CW.Shop.Utilities.Ticker

export class Ticker {
  static tickers = new Map();

  constructor(seconds) {
    this.interval = seconds;
    this.Tick = new EventAction();
    this.t = 0;
  }

  /** Ticker.Get(TimeSpan.FromSeconds(s)) */
  static Get(seconds = 1) {
    let t = Ticker.tickers.get(seconds);
    if (!t) {
      t = new Ticker(seconds);
      Ticker.tickers.set(seconds, t);
    }
    return t;
  }
}

LoopHooks.beforeUpdate.push(() => {
  for (const t of Ticker.tickers.values()) {
    t.t += Time.deltaTime;
    if (t.t >= t.interval) {
      t.t -= t.interval;
      if (t.t > t.interval) t.t = 0;
      t.Tick.Raise();
    }
  }
});

// ---------------------------------------------------------------- payments

export const PaymentOption = { NotAvailable: 0, Free: 1, RewardedVideo: 2, IAP: 3, Currency: 4 };
export const PaymentResponse = { Failure: 0, Cancelled: 1, Success: 2, NotAvailable: 3 };
const PAYMENT_NAMES = ['NotAvailable', 'Free', 'RewardedVideo', 'IAP', 'Currency'];

export class PaymentDefinition {
  constructor(d = {}) {
    this.pay = d.pay ?? PaymentOption.NotAvailable;
    this.amount = d.amount ?? 1;
    this.data = d.data === undefined || d.data === null ? null : String(d.data);
  }

  get DataAsMinutes() {
    const s = (this.data ?? '').trim();
    return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : -1;
  }

  get DataAsCurrency() {
    return Math.max(0, parseCurrency(this.data));
  }

  get BuyString() {
    if (this.pay === PaymentOption.Currency) return `${this.data}:${this.amount}`;
    if (this.pay === PaymentOption.IAP) return 'Not Available';
    return PAYMENT_NAMES[this.pay] ?? String(this.pay);
  }
}

export class GamePaymentDefinition extends PaymentDefinition {
  constructor(d = {}) {
    super(d);
    this.sticker = d.sticker || null;
  }

  get Sticker() {
    return translation(this.sticker);
  }

  get BuyString() {
    switch (this.pay) {
      case PaymentOption.Free:
        return localize('Monetization/Free');
      case PaymentOption.RewardedVideo:
        return `<sprite index=0>${localize('Monetization/Free')}`;
      case PaymentOption.IAP:
        return localize('Monetization/NotAvailable');
      case PaymentOption.Currency:
        return `${this.amount}<sprite index=${this.DataAsCurrency === CurrencyType.Hard ? 3 : 2}>`;
      default:
        return super.BuyString;
    }
  }
}

export class CardPaymentDefinition extends GamePaymentDefinition {
  constructor(d = {}) {
    super(d);
    this.id = d.id ?? 0;
    this.cardCount = d.cardCount ?? 1;
    this.rarity = d.rarity ?? 0;
    this.useRarityText = d.useRarityText ?? false;
    this.customRarityText = d.customRarityText || null;
  }

  get GetExtraData() {
    return String(this.id);
  }

  get RarityTextColor() {
    return rarityData(this.rarity).main;
  }

  get RarityText() {
    return this.useRarityText ? localizeRarity(this.rarity) : translation(this.customRarityText);
  }
}

export class LootboxBuyOption extends GamePaymentDefinition {
  constructor(d = {}) {
    super(d);
    this.get = d.get ?? 0;
    this.lootboxID = d.lootboxID?.id ?? d.lootboxID ?? '';
  }
}

export class CurrencyBuyOption extends GamePaymentDefinition {
  constructor(d = {}) {
    super(d);
    this.get = d.get ?? 0;
  }
}

/** CW.Rewards RewardDefinition / DirectedRewardDefinition */
export class RewardDefinition {
  constructor(d = {}) {
    this.rewardID = d.rewardID ?? '';
    this.amount = d.amount ?? 0;
    this.extraData = d.extraData ?? '';
    if (d.rewardType !== undefined) this.rewardType = d.rewardType;
  }

  get ID() {
    return this.rewardID;
  }

  get id() {
    return this.rewardID;
  }

  GetRewards(source) {
    return grantReward({ id: this.rewardID, amount: this.amount, extra: this.extraData }, source);
  }
}

/** UI_RewardType.Shop */
const UI_REWARD_SHOP = 6;

/** CW.Shop.PaymentHandler (ShopService.DefaultPaymentHandler) */
export class PaymentHandler {
  IsBlockedByTimer() {
    return false;
  }

  TimeUntilPurchaseAvailable() {
    return 0;
  }

  CanBePurchased(payment) {
    switch (payment?.pay) {
      case PaymentOption.RewardedVideo:
        return true;
      case PaymentOption.IAP:
        return false;
      case PaymentOption.Currency: {
        const c = currencyByName(payment.data);
        return c ? c.CanSpend(payment.amount) : false;
      }
      default:
        return false;
    }
  }

  HandlePayment(payment, sink, cb) {
    switch (payment.pay) {
      case PaymentOption.Free:
      case PaymentOption.RewardedVideo:
        cb?.(PaymentResponse.Success);
        break;
      case PaymentOption.IAP:
        cb?.(PaymentResponse.Failure);
        break;
      case PaymentOption.Currency: {
        const c = currencyByName(payment.data);
        if (!c) return;
        cb?.(c.Spend(payment.amount, sink) ? PaymentResponse.Success : PaymentResponse.Failure);
        break;
      }
      default:
    }
  }

  IsConnected() {
    return true;
  }

  IsWaitingForAd() {
    return false;
  }
}

export const ShopService = {
  DefaultPaymentHandler: new PaymentHandler(),
};

function sstate() {
  return (Save.data.shop ||= { lootbox: { videoUsed: 0, videoAt: 0 }, deals: null, gift: { day: 0, claimed: 0 } });
}

/** CW.Currency.Shop.ShopPaymentHandler: free / rewarded video counters with timers ("Shop." + id save data) */
export class ShopPaymentHandler {
  constructor(id) {
    this.id = id;
  }

  /** SaveData {freeAmountUsed, freeNextAvailable, videoAmountUsed, videoNextAvailable}; the chest handler shares meta/shop.js state */
  get data() {
    const s = sstate();
    if (this.id === 'LootboxShop') return s.lootbox;
    return ((s.handlers ||= {})[this.id] ||= { videoUsed: 0, videoAt: 0 });
  }

  IsBlockedByTimer(payment) {
    switch (payment?.pay) {
      case PaymentOption.Free:
        return (this.data.freeAt || 0) - Date.now() > 0;
      case PaymentOption.RewardedVideo:
        return (this.data.videoAt || 0) - Date.now() > 0;
      default:
        return ShopService.DefaultPaymentHandler.IsBlockedByTimer(payment);
    }
  }

  TimeUntilPurchaseAvailable(payment) {
    switch (payment?.pay) {
      case PaymentOption.Free:
        return (this.data.freeAt || 0) - Date.now();
      case PaymentOption.RewardedVideo:
        return (this.data.videoAt || 0) - Date.now();
      default:
        return ShopService.DefaultPaymentHandler.TimeUntilPurchaseAvailable(payment);
    }
  }

  CanBePurchased(payment) {
    switch (payment?.pay) {
      case PaymentOption.Free:
        return this.canBePurchased(this.data.freeAt || 0, this.data.freeUsed || 0, payment);
      case PaymentOption.RewardedVideo:
        return this.canBePurchased(this.data.videoAt || 0, this.data.videoUsed || 0, payment);
      default:
        return ShopService.DefaultPaymentHandler.CanBePurchased(payment);
    }
  }

  canBePurchased(canUseAfter, counter, payment) {
    const now = Date.now();
    if (canUseAfter < dateOf(now)) return payment.amount > 0;
    if (payment.amount > counter) return canUseAfter < now;
    return false;
  }

  /** HandleTimerLogic(ref canUseAfter, ref counter, payment) -> [canUseAfter, counter] */
  static handleTimerLogic(canUseAfter, counter, payment) {
    const now = Date.now();
    const today = dateOf(now);
    const endOfDay = today + 86399999;
    counter = canUseAfter > today ? counter + 1 : 1;
    if (counter % payment.amount === 0) return [endOfDay, 0];
    canUseAfter = now + payment.DataAsMinutes * 60000;
    return [Math.min(canUseAfter, endOfDay), counter];
  }

  HandlePayment(payment, sink, cb) {
    const d = this.data;
    switch (payment.pay) {
      case PaymentOption.Free:
        if (this.CanBePurchased(payment)) {
          [d.freeAt, d.freeUsed] = ShopPaymentHandler.handleTimerLogic(d.freeAt || 0, d.freeUsed || 0, payment);
          Save.setDirty();
          cb?.(PaymentResponse.Success);
        } else cb?.(PaymentResponse.NotAvailable);
        break;
      case PaymentOption.RewardedVideo:
        if (this.CanBePurchased(payment)) {
          // rewarded ad removed: the successful ad result path is taken at once
          [d.videoAt, d.videoUsed] = ShopPaymentHandler.handleTimerLogic(d.videoAt || 0, d.videoUsed || 0, payment);
          Save.setDirty();
          cb(PaymentResponse.Success);
        } else cb?.(PaymentResponse.NotAvailable);
        break;
      default:
        ShopService.DefaultPaymentHandler.HandlePayment(payment, sink, cb);
    }
  }

  IsConnected() {
    return true;
  }

  IsWaitingForAd() {
    return false;
  }
}

export class DailyDealPaymentHandler {
  IsBlockedByTimer() {
    return false;
  }

  TimeUntilPurchaseAvailable() {
    return 0;
  }

  CanBePurchased(payment) {
    if (!payment) return false;
    if (payment.pay === PaymentOption.Free) return true;
    return ShopService.DefaultPaymentHandler.CanBePurchased(payment);
  }

  HandlePayment(payment, sink, cb) {
    // rewarded video granted at once (was Ads.RewardedAd.Show(DailyDeals))
    if (payment.pay === PaymentOption.RewardedVideo) cb?.(PaymentResponse.Success);
    else ShopService.DefaultPaymentHandler.HandlePayment(payment, sink, cb);
  }

  IsConnected(p) {
    return ShopService.DefaultPaymentHandler.IsConnected(p);
  }

  IsWaitingForAd(p) {
    return ShopService.DefaultPaymentHandler.IsWaitingForAd(p);
  }
}

// ---------------------------------------------------------------- ScriptableObjects (remote settings, save handlers)

export class LootboxShopRemoteSettings extends ScriptableObject {
  static typeName = 'LootboxShopRemoteSettings';

  constructor() {
    super();
    this.OnRemoteDataUpdate = new EventAction();
  }

  get Data() {
    if (!this._wrapped) {
      const d = this.data || {};
      this._wrapped = { options: (d.options || []).map((o) => new LootboxBuyOption(o)), rvCooldownOption: d.rvCooldownOption ? new LootboxBuyOption(d.rvCooldownOption) : null };
    }
    return this._wrapped;
  }
}

export class ShopCurrenciesRemoteSettings extends ScriptableObject {
  static typeName = 'ShopCurrenciesRemoteSettings';

  constructor() {
    super();
    this.OnRemoteDataUpdate = new EventAction();
  }

  get Data() {
    if (!this._wrapped) {
      const d = this.data || {};
      const sec = (s) => ({ type: s?.type ?? 0, options: (s?.options || []).map((o) => new CurrencyBuyOption(o)) });
      this._wrapped = { hardPrefixIAP: d.hardPrefixIAP, hard: sec(d.hard), soft: sec(d.soft) };
    }
    return this._wrapped;
  }
}

export class CurrencyLookups extends ScriptableObject {
  static typeName = 'CurrencyLookups';

  GetName(key) {
    const l = (this.atlasLookups?.lookups || []).find((x) => x.key === key);
    return l ? l.value : null;
  }
}

export class HardCurrencyShopGiftSettings extends ScriptableObject {
  static typeName = 'HardCurrencyShopGiftSettings';

  constructor() {
    super();
    this.giftRubyAmount = 1;
    this.giftsPerDay = 3;
    this.giftUnlockRank = 16;
    this.onGiftReset = new EventAction();
  }

  /** GiftShopSectionSaveData (shared with meta/shop.js: {day, claimed}) */
  get State() {
    return sstate().gift;
  }

  get CanClaimGift() {
    return !!this.State && this.State.claimed < this.giftsPerDay && this.IsGiftUnlocked;
  }

  get IsGiftUnlocked() {
    return PlayerRankManager.Instance.CurrentRank >= this.giftUnlockRank;
  }

  ClaimGift() {
    if (!this.CanClaimGift) return false;
    this.State.claimed++;
    Save.setDirty();
    return true;
  }

  CheckGiftReset() {
    const s = this.State;
    if (dateOf() > dateOf(s.day || 0)) {
      s.claimed = 0;
      s.day = dateOf();
      Save.setDirty();
      this.onGiftReset.Invoke();
    }
  }
}

/** DailyDealShopData: state shared with meta/shop.js ({last, refreshCount, slots: [{bought, payment}]}) */
export class DailyDealShopData extends ScriptableObject {
  static typeName = 'DailyDealShopData';

  constructor() {
    super();
    this.refreshesPerDay = 3;
    this.refreshHardCurrencyCost = 10;
    this.onRefresh = new EventAction();
  }

  get State() {
    const s = sstate();
    return (s.deals ||= { last: 0, refreshCount: 0, slots: [] });
  }

  get allowed() {
    return hexInts(this.allowedTypes);
  }

  get TimeLeftToRefresh() {
    return (this.State.last || 0) + DAY - Date.now();
  }

  get SlotCount() {
    return this.State.slots.length;
  }

  get TargetSlotCount() {
    return this.GetDailyDealsCount();
  }

  get RefreshCount() {
    return this.State.refreshCount || 0;
  }

  get CanRefresh() {
    return this.RefreshCount < this.refreshesPerDay;
  }

  get ShouldRefreshSlots() {
    const s = this.State;
    if (s.slots.length === 0 || !s.last) return true;
    return dateOf() > s.last;
  }

  get ShouldShowRefreshButton() {
    return CardService.IsAnyCardNotMaxedOut;
  }

  TryRefreshSlots() {
    if (this.ShouldRefreshSlots) {
      this.RefreshSlots(true);
      return true;
    }
    return false;
  }

  HandleIncreasedDailyDealsCount() {
    const n = this.SlotCount;
    const target = this.GetDailyDealsCount();
    if (n < target) {
      const slots = this.State.slots;
      for (let i = n; i < target; i++) slots.push(this.CreateDailySlotData(i));
      Save.setDirty();
    }
  }

  HandleExternalCardsChange() {
    const slots = this.State.slots;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.payment && this.CanBuySlot(i)) {
        const r = this.CreatePaymentDefinition(i, false);
        slot.payment = r.payment;
        if (r.selectedNewCard) slot.bought = 0;
        Save.setDirty();
      }
    }
  }

  RefreshSlots(newDay) {
    const s = this.State;
    const n = this.GetDailyDealsCount();
    s.slots = new Array(n).fill(null);
    for (let i = 0; i < n; i++) s.slots[i] = this.CreateDailySlotData(i);
    s.last = dateOf();
    s.refreshCount = newDay ? 0 : (s.refreshCount || 0) + 1;
    this.onRefresh.Invoke();
    Save.setDirty();
  }

  /** {boughAmount, payment: CardPaymentDefinition | null} */
  GetSlotData(i) {
    const s = this.State.slots[i];
    const p = s?.payment;
    return {
      boughAmount: s?.bought || 0,
      payment: p ? new CardPaymentDefinition({ id: p.id, cardCount: p.count, rarity: p.rarity, useRarityText: true, pay: p.pay, data: p.data, amount: p.amount }) : null,
    };
  }

  OnBuySlot(i) {
    const s = this.State.slots[i];
    s.bought = (s.bought || 0) + 1;
    if (this.CanBuySlot(i)) s.payment = this.CreatePaymentDefinition(i, true).payment;
    Save.setDirty();
  }

  CanBuySlot(i) {
    const s = this.State.slots[i];
    if (!s?.payment) return false;
    return (s.bought || 0) < (this.itemDefinitions?.[i]?.paymentData?.length || 0);
  }

  HasFree() {
    const slots = this.State.slots;
    if (slots.length === 0) return true;
    const i = slots.findIndex((x) => x?.payment && (x.payment.pay === PaymentOption.Free || x.payment.pay === PaymentOption.RewardedVideo));
    return i >= 0 && this.CanBuySlot(i);
  }

  GetDailyDealsCount() {
    const per = this.dailyDealsPerRank || [];
    for (let i = per.length - 1; i >= 0; i--) if (PlayerRankManager.Instance.CurrentRank >= per[i].rank) return per[i].count;
    return 0;
  }

  /** -> {payment (save shape) | null, selectedNewCard} */
  CreatePaymentDefinition(index, selectNewCard) {
    const def = this.itemDefinitions[index];
    const slots = this.State.slots;
    let card;
    if (selectNewCard) {
      const cand = [];
      for (const t of this.allowed) {
        for (const c of CardService.ofType(t)) {
          if (!c.IsAllowedAsReward || c.IsMaxedOut || c.IsLocked) continue;
          if (slots.some((s, j) => j !== index && s?.payment?.id === c.ID)) continue;
          cand.push(c);
        }
      }
      if (!cand.length) return { payment: null, selectedNewCard: true };
      card = cand[Math.floor(Math.random() * cand.length)];
    } else {
      card = CardService.get(slots[index].payment.id);
      if (!card || card.IsMaxedOut) return this.CreatePaymentDefinition(index, true);
    }
    const cardCount = card.UIMaxCards - card.UICurrentCards;
    let paymentIndex = 0;
    if (slots.length !== 0 && index < slots.length && slots[index]) paymentIndex = Math.min(slots[index].bought || 0, def.paymentData.length - 1);
    const rarity = card.Rarity;
    const pd = def.paymentData[paymentIndex];
    const cost = this.costs?.data?.[rarity] || { soft: 0, hard: 0 };
    let data = '';
    let amount = 0;
    if (pd.paymentOption === PaymentOption.Currency) {
      const price = pd.type === CurrencyType.Soft ? cost.soft : pd.type === CurrencyType.Hard ? cost.hard : 0;
      amount = price * cardCount;
      data = CURRENCY_NAMES[pd.type] ?? String(pd.type);
    }
    return { payment: { id: card.ID, count: cardCount, rarity, pay: pd.paymentOption, data, amount }, selectedNewCard: selectNewCard };
  }

  CreateDailySlotData(i) {
    return { bought: 0, payment: this.CreatePaymentDefinition(i, true).payment };
  }
}

/** RVRewardTrack (GameRewardTrack): the meta RV track + RVRewardTrackSaveHandler.LastDayShown */
export class RVRewardTrack extends ScriptableObject {
  static typeName = 'RVRewardTrack';

  get track() {
    return Shop.rvTrack;
  }

  get OnProgressChanged() {
    return this.track.onStateChange;
  }

  get Count() {
    return this.track.steps.length;
  }

  /** RewardTrack.Step {rewardID, amount, extraData, required, id} */
  GetStep(i) {
    const s = this.track.steps[i];
    return { rewardID: s.id, amount: s.amount, extraData: s.extra || '', required: s.required, id: s.sid, step: s };
  }

  get CurrentProgress() {
    return this.track.progression;
  }

  get IsFullyUnlocked() {
    return this.track.IsFullyUnlocked;
  }

  get NextStepUnlocksAt() {
    return this.track.NextStepUnlocksAt;
  }

  get LastDayShown() {
    const d = Save.data.rvTrackDay;
    return d ? dateOf(new Date(d).getTime()) : 0;
  }

  set LastDayShown(t) {
    Save.data.rvTrackDay = new Date(t).toDateString();
    Save.setDirty();
  }

  get IsDayDifferent() {
    return dateOf() !== this.LastDayShown;
  }

  get TimeLeft() {
    return this.LastDayShown + DAY - Date.now();
  }

  IsClaimed(step) {
    return this.track.IsClaimed(step.step);
  }

  ClaimReward(step) {
    return this.track.ClaimReward(step.step, 'RVRewardTrack');
  }

  HandleProgress(v) {
    return this.track.HandleProgress(v);
  }

  ResetTrack() {
    this.track.ResetTrack();
  }

  ResetTrackAndDay() {
    this.ResetTrack();
    this.LastDayShown = dateOf();
  }
}

for (const cls of [LootboxShopRemoteSettings, ShopCurrenciesRemoteSettings, CurrencyLookups, HardCurrencyShopGiftSettings, DailyDealShopData, RVRewardTrack]) registerSO(cls);

// ---------------------------------------------------------------- item settings

export class BaseShopItemSettings {
  constructor() {
    this.Title = null;
    this.StickerText = null;
    this.PaymentHandler = null;
    this._reward = null;
    this._payment = null;
  }

  get RewardDefinition() {
    return this._reward;
  }

  set RewardDefinition(v) {
    this._reward = v;
  }

  get PaymentDefinition() {
    return this._payment;
  }

  set PaymentDefinition(v) {
    this._payment = v;
  }

  get AnalyticsTag() {
    return this.PaymentDefinition.pay === PaymentOption.IAP ? this.PaymentDefinition.data : this.Title;
  }

  HandleRewards(source) {
    if (this.PaymentDefinition.pay !== PaymentOption.IAP) return this.RewardDefinition.GetRewards(source);
    return null;
  }
}

export class BaseGameShopItemSettings extends BaseShopItemSettings {}

export class LootboxShopItemSettings extends BaseGameShopItemSettings {
  constructor(paymentHandler, rewardAsset, extraSettings, buyOption, additionalBuyOption) {
    super();
    this.ExtraSettings = extraSettings;
    this.PaymentHandler = paymentHandler;
    this.Title = buyOption.lootboxID;
    this.PaymentDefinition = buyOption;
    this.AdditionalBuyOption = additionalBuyOption;
    this.StickerText = buyOption.Sticker;
    // LootboxRewardAsset.RewardID (UniqueName)
    const rid = 'Lootbox';
    this.RewardDefinition = new RewardDefinition({ amount: buyOption.get, rewardID: rid, extraData: buyOption.lootboxID });
    this.AdditionalRewardDefinition = additionalBuyOption ? new RewardDefinition({ amount: additionalBuyOption.get, rewardID: rid, extraData: additionalBuyOption.lootboxID }) : null;
  }

  get swapped() {
    const o = super.PaymentDefinition;
    return o.pay === PaymentOption.RewardedVideo && this.PaymentHandler.IsBlockedByTimer(o) && !!this.AdditionalBuyOption;
  }

  get OriginalRewardDefinition() {
    return super.RewardDefinition;
  }

  get RewardDefinition() {
    return this.swapped ? this.AdditionalRewardDefinition : super.RewardDefinition;
  }

  set RewardDefinition(v) {
    super.RewardDefinition = v;
  }

  get OriginalBuyOption() {
    return super.PaymentDefinition;
  }

  get PaymentDefinition() {
    return this.swapped ? this.AdditionalBuyOption : super.PaymentDefinition;
  }

  set PaymentDefinition(v) {
    super.PaymentDefinition = v;
  }
}

export class DailyDealShopItemSettings extends BaseGameShopItemSettings {
  constructor(paymentHandler, rewardAsset, index, callbackOnBuy, shopData, confirmationPrefab) {
    super();
    this.index = index;
    this.callbackOnBuy = callbackOnBuy;
    this.shopData = shopData;
    this.confirmation = confirmationPrefab;
    this.PaymentHandler = paymentHandler;
    this.RarityText = null;
    const payment = shopData.GetSlotData(index).payment;
    if (payment) {
      const card = CardService.get(payment.id);
      this.Title = cardLabel(card);
      this.PaymentDefinition = payment;
      this.StickerText = payment.Sticker;
      this.RarityText = payment.RarityText;
      this.RewardDefinition = new RewardDefinition({ amount: payment.cardCount, rewardID: 'Card', extraData: payment.GetExtraData });
    }
  }

  RaiseCallback() {
    this.callbackOnBuy(this.index);
  }

  CanBuySlot() {
    return this.shopData.CanBuySlot(this.index);
  }
}

export class BaseCurrencyShopItemSettings extends BaseGameShopItemSettings {
  constructor(paymentHandler, type, buyOption, showParticle) {
    super();
    this.ShowParticle = showParticle;
    this.PaymentHandler = paymentHandler;
    this.CurrencyType = type;
    this.Title = String(buyOption.get);
    this.RewardDefinition = new RewardDefinition({ amount: buyOption.get, rewardID: ['Currency_Soft', 'Currency_Hard', 'Currency_Bonus', 'Currency_Star'][type] });
    this.PaymentDefinition = buyOption;
    this.StickerText = buyOption.Sticker;
  }
}

export class HardCurrencyShopItemSettings extends BaseCurrencyShopItemSettings {}

// ---------------------------------------------------------------- shop controller / sections

export class BaseShopController extends MonoBehaviour {
  static typeName = 'BaseShopController';

  constructor() {
    super();
    this.sections = [];
    this.isInitialized = false;
    this.lastInternetState = false;
  }

  get CurrentInternetState() {
    return true;
  }

  UpdateSections() {
    // UI_ShopPage.Initialize runs while the Shop Screen is still inactive; the shipped build finds its sections
    this.sections = this.GetComponentsInChildren(BaseShopSection, true);
  }

  /** IShop.SortSectionsUsing(ShopRemoteSettings) */
  SortSectionsUsing(order, offset = 0) {
    if (!order?.length) return;
    const keyed = this.sections.map((s) => ({ s, k: order.indexOf(s.Name) }));
    keyed.sort((a, b) => a.k - b.k);
    this.sections = keyed.map((x) => x.s);
    this.sections.forEach((s, i) => s.transform.SetSiblingIndex(offset + i));
  }

  Initialize() {
    if (this.isInitialized) return;
    this.UpdateSections();
    this.ForEachSection((x) => x.Initialize(this));
    this.SortSectionsUsing(Meta.data.shop?.order);
    this.isInitialized = true;
  }

  Open() {
    this.ForEachSection((x) => x.OnShopOpening());
    if (this.lastInternetState !== this.CurrentInternetState) {
      this.lastInternetState = this.CurrentInternetState;
      ev(this.onInternetAvailable).Invoke(this.lastInternetState);
    }
    this.gameObject.SetActive(true);
    ev(this.onOpen).Invoke();
  }

  OpenSection(sectionName) {
    for (const s of this.sections) if (s.Name === sectionName) this.OpenAt(s);
  }

  OpenAt() {
    this.Open();
  }

  Close() {
    this.lastInternetState = this.CurrentInternetState;
    this.gameObject.SetActive(false);
    this.ForEachSection((x) => x.OnShopClosed());
  }

  ForEachSection(fn) {
    for (const s of this.sections) if (s) fn(s);
  }
}

export class BaseScrollShop extends BaseShopController {
  static typeName = 'BaseScrollShop';

  constructor() {
    super();
    this.animateToSectionDuration = 0.5;
    this.blockScrolling = false;
    this.scrollingCoroutine = null;
  }

  get ScrollViewport() {
    return this.scrollRect.viewport;
  }

  get Content() {
    return this.scrollRect.content;
  }

  get BlockScrolling() {
    return this.blockScrolling;
  }

  set BlockScrolling(v) {
    this.blockScrolling = v;
    this.scrollRect.enabled = !v;
  }

  get IsScrolling() {
    return this.scrollingCoroutine !== null;
  }

  MarkForRebuild() {
    bumpLayout();
  }

  Open() {
    this.scrollRect.verticalNormalizedPosition = 1;
    super.Open();
  }

  OpenAt(section) {
    super.Open();
    if (this.scrollingCoroutine) this.StopCoroutine(this.scrollingCoroutine);
    this.scrollingCoroutine = this.StartCoroutine(this.ScrollToSection(section));
  }

  GetVerticalPositionInScreen(target) {
    const vh = this.ScrollViewport.rect.height;
    const ch = this.Content.rect.height;
    return Math.min(ch, Math.max(0, Math.abs(target.localPosition.y) - vh * 0.5));
  }

  *ScrollToSection(section) {
    this.scrollRect.enabled = false;
    yield* this.AnimateToPosition(this.GetVerticalPositionInScreen(section.FocusTarget));
    this.scrollRect.enabled = !this.blockScrolling;
    this.scrollingCoroutine = null;
  }

  *AnimateToPosition(end) {
    let t = 0;
    const start = Math.max(this.Content.anchoredPosition.y, 0);
    const pos = this.Content.anchoredPosition.clone();
    while (t < 1) {
      t += Time.deltaTime / this.animateToSectionDuration;
      const k = this.animateToSectionCurve?.Evaluate ? this.animateToSectionCurve.Evaluate(t) : t;
      pos.y = start + (end - start) * k;
      this.Content.anchoredPosition = pos.clone();
      yield null;
    }
    this.Content.anchoredPosition = pos.clone();
  }
}

export class BaseShopSection extends MonoBehaviour {
  static typeName = 'BaseShopSection';

  constructor() {
    super();
    this.shopItems = [];
    this.Shop = null;
  }

  get Name() {
    return '';
  }

  get Placement() {
    return 'Unknown';
  }

  get FocusTarget() {
    return this.transform;
  }

  get ContentTarget() {
    return this.content;
  }

  get ShopItems() {
    return this.shopItems;
  }

  get ShopItemPrefab() {
    return this.shopItemPrefab;
  }

  set ShopItemPrefab(v) {
    this.shopItemPrefab = v;
  }

  Initialize(shop) {
    this.Shop = shop;
    this.OnInitialize();
  }

  OnInitialize() {}

  AddShopItem(settings) {
    const item = Instantiate(this.shopItemPrefab, this.content);
    item.Initialize(this, settings);
    this.shopItems.push(item);
  }

  CreateShopItems() {}

  ClearShopItems() {
    for (const it of this.shopItems) if (it && !it.gameObject._destroyed) Destroy(it.gameObject);
    this.shopItems = [];
  }

  RecreateSection() {
    this.ClearShopItems();
    this.CreateShopItems();
  }

  OnShopOpening() {
    this.CreateShopItems();
  }

  OnShopClosed() {
    this.ClearShopItems();
  }
}

export class LootboxShopSection extends BaseShopSection {
  static typeName = 'LootboxShopSection';

  get Name() {
    return 'LootboxShop';
  }

  get Placement() {
    return 'Chests';
  }

  TutorialGetBigChest() {
    const list = this.ShopItems.filter((x) => x.Settings.PaymentDefinition.pay === PaymentOption.Currency && x.Settings.PaymentDefinition.DataAsCurrency === CurrencyType.Soft);
    return list[list.length - 1] || null;
  }

  OnInitialize() {
    this._remote = () => this.OnRemoteDataUpdate();
    this.settings.OnRemoteDataUpdate?.AddListener(this._remote);
    this.paymentHandler = new ShopPaymentHandler('LootboxShop');
  }

  OnRemoteDataUpdate() {
    if (this.gameObject.activeInHierarchy) this.Shop.Close();
    this.RecreateSection();
  }

  CreateShopItems() {
    const data = this.settings.Data;
    for (let i = 0; i < data.options.length; i++) {
      const extra = this.itemSettings[i];
      this.ShopItemPrefab = extra.prefab;
      this.AddShopItem(new LootboxShopItemSettings(this.paymentHandler, this.rewardAsset, extra, data.options[i], i === 0 ? data.rvCooldownOption : null));
    }
    bumpLayout();
  }

  OnShopClosed() {
    super.OnShopClosed();
  }

  CanGetFreeLootbox() {
    const o = this.settings.Data.options.find((x) => x.pay === PaymentOption.RewardedVideo);
    if (!o || !this.paymentHandler) return false;
    return !this.paymentHandler.IsBlockedByTimer(o);
  }

  CanGetLargeLootbox() {
    const list = this.settings.Data.options.filter((x) => x.pay === PaymentOption.Currency);
    const o = list[list.length - 1];
    if (!o || !this.paymentHandler) return false;
    return this.paymentHandler.CanBePurchased(o);
  }
}

export class DailyDealShopSection extends BaseShopSection {
  static typeName = 'DailyDealShopSection';

  constructor() {
    super();
    this.refreshPopUp = null;
  }

  get Name() {
    return 'DailyDeals';
  }

  get Placement() {
    return 'DailyDeals';
  }

  OnInitialize() {
    this.refreshButton.onClick.AddListener(() => {
      if (this.settings.CanRefresh) {
        this.refreshPopUp = Instantiate(this.refreshPopUpPrefab, UI_ShopPage.Instance.transform);
        this.refreshPopUp.Initialize(this.settings.refreshHardCurrencyCost, () => this.OnResetDealsSuccess());
      } else MainMenuManager.ShowComeBackTomorrowPopUp();
    });
    this.paymentHandler = new DailyDealPaymentHandler();
    this.ticker = Ticker.Get(1);
    this._updateTimer = () => this.UpdateTimer();
    this._onPurchaseLootbox = () => this.OnPurchaseLootbox();
    this._onPurchaseSuccessful = (i) => this.OnPurchaseSuccessful(i);
  }

  RefreshItems() {
    if (this.refreshPopUp && !this.refreshPopUp.gameObject._destroyed) Destroy(this.refreshPopUp.gameObject);
    this.UpdateRefreshButton();
    this.settings.TryRefreshSlots();
    this.RecreateSection();
  }

  UpdateRefreshButton() {
    const can = this.settings.CanRefresh;
    if (this.refreshButton.image) this.refreshButton.image.color = can ? Color.white : Color.from(this.refreshButtonDisabledColor);
    const contents = can ? Color.white : Color.from(this.refreshButtonContentsDisabledColor);
    if (this.refreshButtonIcon) this.refreshButtonIcon.color = contents;
    if (this.refreshText) this.refreshText.color = contents;
  }

  OnResetDealsSuccess() {
    this.settings.RefreshSlots(false);
    this.RefreshItems();
  }

  newSettings(i) {
    return new DailyDealShopItemSettings(this.paymentHandler, this.cardRewardAsset, i, this._onPurchaseSuccessful, this.settings, this.GetConfirmation(i));
  }

  CreateShopItems() {
    this.HandleSettingButtonActive();
    for (let i = 0; i < this.settings.SlotCount; i++) this.AddShopItem(this.newSettings(i));
    bumpLayout();
  }

  OnPurchaseLootbox() {
    this.settings.HandleExternalCardsChange();
    this.UpdateSection();
  }

  UpdateSection() {
    this.HandleSettingButtonActive();
    this.ShopItems.forEach((item, i) => item.Initialize(this, this.newSettings(i)));
  }

  HandleSettingButtonActive() {
    const show = this.settings.ShouldShowRefreshButton;
    this.refreshButton.SetActive(show);
    if (this.layoutGroup) this.layoutGroup.m_Padding.m_Bottom = show ? this.defaultBottomOffset : this.noButtonBottomOffset;
    bumpLayout();
    UI_ShopPage.Instance?.MarkForRebuild();
  }

  GetConfirmation(i) {
    const payment = this.settings.GetSlotData(i).payment;
    if (!payment) return null;
    return CardService.get(payment.id)?.Type !== CardType.Booster ? this.cardConfirmation : this.boosterConfirmation;
  }

  OnShopOpening() {
    MainMenuManager.Instance?.LootboxOpener?.onLootboxClaimed?.AddListener(this._onPurchaseLootbox);
    this.settings.TryRefreshSlots();
    this.settings.HandleExternalCardsChange();
    this.settings.HandleIncreasedDailyDealsCount();
    this.UpdateRefreshButton();
    super.OnShopOpening();
    this.ticker.Tick.AddListener(this._updateTimer);
  }

  OnShopClosed() {
    super.OnShopClosed();
    MainMenuManager.Instance?.LootboxOpener?.onLootboxClaimed?.RemoveListener(this._onPurchaseLootbox);
    if (this.refreshPopUp && !this.refreshPopUp.gameObject._destroyed) Destroy(this.refreshPopUp.gameObject);
    this.ticker.Tick.RemoveListener(this._updateTimer);
  }

  OnPurchaseSuccessful(index) {
    this.settings.OnBuySlot(index);
    this.UpdateSection();
  }

  UpdateTimer() {
    const text = TimeFormatSettings.FormatWithSeconds(this.settings.TimeLeftToRefresh);
    this.timer.SetText(replaceTerm(this.timerText, text));
    if (this.settings.TryRefreshSlots()) this.UpdateSection();
  }
}

export class RVRewardTrackShopSection extends BaseShopSection {
  static typeName = 'RVRewardTrackShopSection';

  get Name() {
    return 'RVRewardTrack';
  }

  get Placement() {
    return 'RVRewardTrack';
  }

  OnInitialize() {
    this.rewardTrackUI.Initialize();
    this.ticker = Ticker.Get(1);
    this._update = () => this.UpdateTimeLeft();
  }

  OnShopOpening() {
    super.OnShopOpening();
    this.ticker.Tick.AddListener(this._update);
  }

  OnShopClosed() {
    super.OnShopClosed();
    this.ticker.Tick.RemoveListener(this._update);
  }

  UpdateTimeLeft() {
    const setText = () => this.timeLeftText.SetText(TimeFormatSettings.FormatWithSeconds(this.rewardTrack.TimeLeft));
    setText();
    if (this.rewardTrack.IsDayDifferent) {
      this.rewardTrack.ResetTrackAndDay();
      this.rewardTrackUI.SetEntriesState();
      setText();
    }
  }
}

export class HardCurrencyShopSection extends BaseShopSection {
  static typeName = 'HardCurrencyShopSection';

  constructor() {
    super();
    this.defaultTopOffset = 300;
    this.noButtonTopOffset = 0;
    this.showParticleAfterIndex = 2;
    this.HasFreeItem = false;
  }

  get Settings() {
    return this.settings;
  }

  get CurrencyType() {
    return CurrencyType.Hard;
  }

  get BuyOptions() {
    return this.settings.Data.hard.options;
  }

  get Name() {
    return 'HardCurrency';
  }

  get Placement() {
    return 'IAP';
  }

  get PaymentHandler() {
    return this.paymentHandler;
  }

  CheckForFreeItem() {
    this.HasFreeItem = this.settings.Data.hard.options.some((x) => x.pay === PaymentOption.Free);
  }

  OnInitialize() {
    this.paymentHandler = new ShopPaymentHandler(this.Name);
    this._remote = () => this.OnRemoteDataUpdate();
    this.settings.OnRemoteDataUpdate?.AddListener(this._remote);
    this.CheckForFreeItem();
  }

  OnRemoteDataUpdate() {
    if (this.gameObject.activeInHierarchy) this.Shop.Close();
    this.RecreateSection();
    this.CheckForFreeItem();
  }

  CreateShopItems() {
    const padding = this.layoutGroup.m_Padding;
    if (this.hardCurrencyShopGiftSettings.IsGiftUnlocked) {
      this.ShopItemPrefab = this.giftItemPrefab;
      this.AddShopItem(new HardCurrencyShopItemSettings(null, this.CurrencyType, new CurrencyBuyOption(), false));
      padding.m_Top = this.defaultTopOffset;
    } else padding.m_Top = this.noButtonTopOffset;
    this.ShopItemPrefab = this.currencyItemPrefab;
    // BaseCurrencyShopSection.CreateShopItems
    this.BuyOptions.forEach((o, i) => this.AddShopItem(new HardCurrencyShopItemSettings(this.PaymentHandler, this.CurrencyType, o, this.showParticleAfterIndex < i)));
    bumpLayout();
    ev(this.onNewShopItems).Invoke();
  }
}

// ---------------------------------------------------------------- shop items (CW.Shop.UI.ShopItemUI ...)

export class ShopItemUI extends MonoBehaviour {
  static typeName = 'ShopItemUI';

  constructor() {
    super();
    this.isTicking = false;
    this.ticker = null;
    this.purchaseTextContent = null;
    this.PaymentHandler = null;
    this.PaymentDefinition = null;
    this.RewardDefinition = null;
    this.Settings = null;
    this.PurchaseButtonClicked = new EventAction();
    this._onTick = () => this.OnTick();
  }

  get BackgroundImage() {
    return this.backgroundImage.sprite;
  }

  set BackgroundImage(v) {
    this.backgroundImage.sprite = v;
  }

  get HeaderImage() {
    return this.headerImage.sprite;
  }

  set HeaderImage(v) {
    this.headerImage.sprite = v;
  }

  get HeaderText() {
    return this.headerText.text;
  }

  set HeaderText(v) {
    this.headerText.text = v ?? '';
  }

  get ContentImage() {
    return this.contentImage.sprite;
  }

  set ContentImage(v) {
    this.contentImage.sprite = v;
  }

  get StickerText() {
    return this.stickerText.text;
  }

  set StickerText(v) {
    this.stickerText.text = v ?? '';
    this.stickerImage.Show(!!v && v.trim() !== '');
  }

  get PurchaseButton() {
    return this.purchaseButton;
  }

  get PurchaseText() {
    return this.purchaseTextContent;
  }

  set PurchaseText(v) {
    this.purchaseTextContent = v;
    this.purchaseText.text = v ?? '';
  }

  get NoConnectionText() {
    return '<sprite name="NoWifi">';
  }

  get WaitForAdText() {
    return '<sprite name="Ad" tint=1> loading';
  }

  get CanBePurchased() {
    return this.PaymentHandler.CanBePurchased(this.PaymentDefinition);
  }

  get ShouldAddTick() {
    if (!this.PaymentHandler.IsConnected(this.PaymentDefinition)) return true;
    return this.PaymentHandler.IsBlockedByTimer(this.PaymentDefinition);
  }

  get ShouldRemoveTick() {
    return this.CanBePurchased;
  }

  Awake() {
    this._click = () => this.OnPurchaseButtonClick();
    this.purchaseButton.onClick.AddListener(this._click);
  }

  OnEnable() {
    this.stickerImage.Show(!!this.stickerText.text);
    if (this.PaymentHandler) this.SetupPurchaseButton();
  }

  OnDisable() {
    this.RemoveTickListener();
  }

  AddTickListener() {
    if (this.isTicking) return;
    if (!this.ticker) this.ticker = Ticker.Get(1);
    this.ticker.Tick.AddListener(this._onTick);
    this.isTicking = true;
  }

  RemoveTickListener() {
    if (!this.isTicking) return;
    this.ticker.Tick.RemoveListener(this._onTick);
    this.isTicking = false;
  }

  /** Setup(settings) of ShopItemUI<T> */
  Setup(settings) {
    this.Settings = settings;
    this.PaymentHandler = settings.PaymentHandler;
    this.PaymentDefinition = settings.PaymentDefinition;
    this.RewardDefinition = settings.RewardDefinition;
    this.OnSetup();
  }

  OnSetup() {
    this.SetupPurchaseButton();
    // ShopItemUI<T>.OnSetup
    this.HeaderText = this.Settings.Title;
    this.StickerText = this.Settings.StickerText;
  }

  SetupPurchaseButton() {
    this.StartAvailabilityCheck();
    this.UpdatePurchaseButton();
  }

  UpdatePurchaseButton() {
    this.purchaseButton.interactable = this.CanBePurchased;
    this.purchaseText.text = this.GetPurchaseButtonText();
  }

  GetPurchaseButtonText(payment = this.PaymentDefinition) {
    if (this.PaymentHandler.IsWaitingForAd(payment)) return this.WaitForAdText;
    if (!this.PaymentHandler.IsConnected(payment)) return this.NoConnectionText;
    if (this.PaymentHandler.IsBlockedByTimer(payment)) return formatHMS(this.PaymentHandler.TimeUntilPurchaseAvailable(payment));
    return this.purchaseTextContent ? this.purchaseTextContent : payment.BuyString;
  }

  StartAvailabilityCheck() {
    if (this.ShouldAddTick && !this.isTicking) this.AddTickListener();
  }

  OnTick() {
    if (this.ShouldRemoveTick) this.RemoveTickListener();
    this.UpdatePurchaseButton();
  }

  OnPurchaseButtonClick() {
    if (this.CanBePurchased) this.PurchaseButtonClicked.Raise();
    else this.StartAvailabilityCheck();
  }
}

export class BaseGameShopItemUI extends ShopItemUI {
  static typeName = 'BaseGameShopItemUI';

  set RarityString(v) {
    this.rarityText.SetText(v ?? '');
    if (!v) this.rarityText.Show(false);
  }

  Awake() {
    super.Awake();
    this._hard = () => this.OnHardCurrencyChanged();
    this._soft = () => this.OnSoftCurrencyChanged();
    Currencies.Hard.onChange.AddListener(this._hard);
    Currencies.Soft.onChange.AddListener(this._soft);
  }

  OnDestroy() {
    Currencies.Hard.onChange.RemoveListener(this._hard);
    Currencies.Soft.onChange.RemoveListener(this._soft);
  }

  OnSoftCurrencyChanged() {
    const p = this.PaymentDefinition;
    if (p && p.pay === PaymentOption.Currency && p.DataAsCurrency === CurrencyType.Soft) this.UpdatePurchaseButton();
  }

  OnHardCurrencyChanged() {
    const p = this.PaymentDefinition;
    if (p && p.pay === PaymentOption.Currency && p.DataAsCurrency === CurrencyType.Hard) this.UpdatePurchaseButton();
  }

  OnPaymentHandled(response) {
    if (response === PaymentResponse.Success) {
      this.StartAvailabilityCheck();
      this.UpdatePurchaseButton();
    }
  }

  UpdatePurchaseButton() {
    this.purchasedIndicator.Show(this.PaymentHandler.IsBlockedByTimer(this.PaymentDefinition));
    this.purchaseText.text = this.GetPurchaseButtonText();
  }

  OnBuy() {
    this.PaymentDefinition = this.Settings.PaymentDefinition;
    const pay = this.PaymentDefinition.pay;
    if (pay === PaymentOption.Free || pay === PaymentOption.RewardedVideo) this.onBuyFeedbacks?.PlayFeedbacks();
  }
}

export class LootboxShopItemUI extends BaseGameShopItemUI {
  static typeName = 'LootboxShopItemUI';

  get ShouldAddTick() {
    return super.ShouldAddTick || this.OriginalPaymentBlockedByTimer;
  }

  get ShouldRemoveTick() {
    return super.ShouldRemoveTick ? !this.OriginalPaymentBlockedByTimer : false;
  }

  get OriginalPaymentBlockedByTimer() {
    return this.PaymentHandler.IsBlockedByTimer(this.Settings.OriginalBuyOption);
  }

  OnSetup() {
    super.OnSetup();
    for (const p of this.particles || []) p?.SetActive(!!this.Settings.ExtraSettings.showParticles);
    this.rarityImage.color = Color.from(this.Settings.ExtraSettings.color);
    const box = LootboxService.box(this.RewardDefinition.extraData);
    this.HeaderText = lootboxVisualName(box);
    const art = GameLootboxServiceArt(box?.type);
    if (art) this.ContentImage = art.sprite;
  }

  UpdatePurchaseButton() {
    super.UpdatePurchaseButton();
    if (!this.Settings) return;
    const blocked = this.OriginalPaymentBlockedByTimer;
    const active = this.cooldownText.gameObject.activeSelf;
    if (blocked) {
      if (!active) this.cooldownText.Show();
      this.cooldownText.SetText(this.GetPurchaseButtonText(this.Settings.OriginalBuyOption));
    } else if (active) this.cooldownText.Hide();
    switch (this.Settings.OriginalBuyOption.pay) {
      case PaymentOption.Free:
      case PaymentOption.RewardedVideo:
        this.gameNotification.UpdatePingObject(!!this.Settings.ExtraSettings.showNotificationPing && !blocked);
        break;
      case PaymentOption.Currency:
        this.gameNotification.UpdatePingObject(!!this.Settings.ExtraSettings.showNotificationPing && this.PaymentHandler.CanBePurchased(this.Settings.PaymentDefinition));
        break;
      default:
    }
  }
}

export class DailyDealShopItemUI extends BaseGameShopItemUI {
  static typeName = 'DailyDealShopItemUI';

  get CanBePurchased() {
    return super.CanBePurchased ? this.Settings.CanBuySlot() : false;
  }

  OnSetup() {
    this.RarityString = this.Settings.RarityText;
    if (this.PaymentDefinition) this.rarityText.SetColor(this.PaymentDefinition.RarityTextColor);
    const reward = this.Settings.RewardDefinition;
    const has = !!reward;
    for (const o of this.disableWhenEmpty || []) o?.Show(has);
    for (const o of this.enableWhenEmpty || []) o?.Show(!reward);
    this.backgroundImage.color = has ? Color.white : Color.from(this.emptyBackgroundColor);
    super.OnSetup();
    const card = reward ? CardService.get(parseInt(this.Settings.RewardDefinition.extraData, 10)) : null;
    // `is IRankCard`: boosters are not rank cards (their branch never runs in the shipped build)
    if (card && card.IsRankCard) this.metaCard?.SetupCardPreview(card, this.RewardDefinition.amount);
  }

  UpdatePurchaseButton() {
    const can = this.Settings.CanBuySlot();
    if (!can) this.stickerImage.Hide();
    const has = !!this.Settings.RewardDefinition;
    this.purchasedIndicator.Show(has && !can);
    this.gameNotification.UpdatePingObject(can && (this.PaymentDefinition.pay === PaymentOption.Free || this.PaymentDefinition.pay === PaymentOption.RewardedVideo));
    this.purchaseText.text = this.GetPurchaseButtonText();
  }

  GetPurchaseButtonText(payment) {
    if (this.Settings.CanBuySlot()) return super.GetPurchaseButtonText(payment);
    return localize(this.purchased || 'UI/Shop/Purchased');
  }
}

export class CurrencyShopItemUI extends BaseGameShopItemUI {
  static typeName = 'CurrencyShopItemUI';

  OnSetup() {
    super.OnSetup();
    this.particle?.Show(!!this.Settings.ShowParticle);
    const rid = this.Settings.RewardDefinition.rewardID;
    const card = CardService.get(rid === 'Currency_Hard' ? 2000000300 : 2000000100);
    if (!card) console.error('CurrencyShop', 'CardID was not a valid currency card.');
    this.ContentImage = bundleSprite(card, this.Settings.RewardDefinition.amount);
    const p = this.Settings.PaymentDefinition;
    switch (p.pay) {
      case PaymentOption.Currency:
        this.PurchaseText = `<sprite name="${this.currencyLookups?.GetName(p.data)}"> ${p.amount}`;
        break;
      case PaymentOption.RewardedVideo:
        this.PurchaseText = '<sprite name="Ad" tint=1>';
        break;
      case PaymentOption.Free:
        this.PurchaseText = 'Free';
        break;
      default:
    }
  }
}

/** CurrencyCardAsset.GetBundleSprite(amount) */
function bundleSprite(card, amount) {
  const sizes = card?.def.shopSizes || [];
  let best = null;
  for (const s of sizes) if (s.min <= amount && (!best || s.min > best.min)) best = s;
  return UISprites.byName(best?.icon || card?.def.icon);
}

/** Lootbox.definition.VisualName */
function lootboxVisualName(box) {
  return box ? box.name : '';
}

/** GameLootboxService.Instance.lootboxArt.TryGetValue(type) -> {sprite, smallSprite, modelPrefab} */
export function GameLootboxServiceArt(type) {
  return getRuntimeSO('MonoBehaviour/LootboxService')?.lootboxArt?.TryGetValue?.(type) || null;
}

export class BaseShopItem extends MonoBehaviour {
  static typeName = 'BaseShopItem';

  constructor() {
    super();
    this.Section = null;
    this.PaymentHandler = null;
    this.Settings = null;
  }

  /** Initialize(section, settings) (BaseShopItem<T>) */
  Initialize(section, settings) {
    this.Settings = settings;
    this.Section = section;
    this.PaymentHandler = settings?.PaymentHandler ?? null;
    this.OnInitialize();
  }

  OnInitialize() {}
}

export class BaseGameShopItem extends BaseShopItem {
  static typeName = 'BaseGameShopItem';

  constructor() {
    super();
    this.onPaymentHandled = new EventAction();
    this.ConfirmationInstance = null;
    this._openConfirmation = () => this.OpenConfirmationButton();
  }

  OnInitialize() {
    this.shopItemUI.Setup(this.Settings);
    addLazy(this.shopItemUI.PurchaseButton, this._openConfirmation);
  }

  OnPurchaseButtonClicked() {
    this.PaymentHandler.HandlePayment(this.Settings.PaymentDefinition, this.Section.Placement, (r) => this.OnPaymentHandled(r));
  }

  OpenConfirmationButton() {
    this.ConfirmationInstance = Instantiate(this.confirmationPrefab, UI_ShopPage.Instance.transform);
    this.ConfirmationInstance.Initialize(this.Settings, this.onPaymentHandled, () => this.OnPurchaseButtonClicked());
  }

  OnPaymentHandled(response) {
    if (response === PaymentResponse.Success) this.OnPaymentSuccessful();
    else {
      const p = this.Settings.PaymentDefinition;
      if (p.pay === PaymentOption.Currency) MainMenuManager.ShowNotEnoughCurrencyPopUp(p.DataAsCurrency);
      else if (p.pay === PaymentOption.RewardedVideo && response === PaymentResponse.NotAvailable) MainMenuManager.ShowComeBackTomorrowPopUp();
    }
    this.onPaymentHandled.Invoke(response);
    this.shopItemUI.OnPaymentHandled(response);
  }

  OnPaymentSuccessful() {
    this.Settings.HandleRewards(this.Section.Placement);
    this.shopItemUI.OnBuy();
  }

  OnDisable() {
    const c = this.ConfirmationInstance;
    if (c && !c.gameObject._destroyed) c.Close();
  }
}

export class LootboxShopItem extends BaseGameShopItem {
  static typeName = 'LootboxShopItem';

  OnInitialize() {
    this.confirmationPrefab = this.Settings.ExtraSettings.confirmationPrefab;
    super.OnInitialize();
  }

  OnPurchaseButtonClicked() {
    if (this.shopTutorial?.IsStarted) {
      this.PaymentHandler.HandlePayment(this.Settings.PaymentDefinition, this.Section.Placement, (response) => {
        const v = this.shopTutorial.LootboxToGive;
        const id = v?.id ?? v;
        if (!LootboxService.box(id)) return;
        LootboxService.AddToQueue(id, 'Chests');
        this.shopItemUI.OnBuy();
        this.onPaymentHandled.Invoke(response);
        this.shopItemUI.OnPaymentHandled(response);
      });
    } else super.OnPurchaseButtonClicked();
  }
}

export class DailyDealShopItem extends BaseGameShopItem {
  static typeName = 'DailyDealShopItem';

  OnInitialize() {
    this.confirmationPrefab = this.Settings.confirmation;
    super.OnInitialize();
  }

  OpenConfirmationButton() {
    if (this.Settings.CanBuySlot()) super.OpenConfirmationButton();
  }

  OnPurchaseButtonClicked() {
    if (this.Settings.CanBuySlot()) super.OnPurchaseButtonClicked();
  }

  OnPaymentSuccessful() {
    this.Settings.HandleRewards(this.Section.Placement);
    const self = this;
    this.StartCoroutine((function* () {
      yield new WaitWhile(() => BaseShopItemConfirmation.IsOpen);
      self.shopItemUI.OnBuy();
      self.Settings.RaiseCallback();
    })());
  }
}

export class BaseCurrencyShopItem extends BaseShopItem {
  static typeName = 'BaseCurrencyShopItem';

  constructor() {
    super();
    this.isInitialized = false;
    this.currency = null;
    this._onCurrency = () => this.currencyShopItemUI.UpdatePurchaseButton();
    this._clicked = () => this.OnPurchaseButtonClicked();
  }

  get Payment() {
    return this.Settings.PaymentDefinition;
  }

  get Reward() {
    return this.Settings.RewardDefinition;
  }

  OnInitialize() {
    this.isInitialized = true;
    this.currencyShopItemUI.Setup(this.Settings);
    this.currencyShopItemUI.PurchaseButtonClicked.AddListener(this._clicked);
    this.AddListeners();
  }

  OnEnable() {
    this.AddListeners();
  }

  OnDisable() {
    this.RemoveListeners();
  }

  AddListeners() {
    if (!this.isInitialized) return;
    this.RemoveListeners();
    if (this.Settings.PaymentDefinition.pay === PaymentOption.Currency) {
      this.currency = currencyByName(this.Settings.PaymentDefinition.data);
      this.currency?.onChange.AddListener(this._onCurrency);
    }
  }

  RemoveListeners() {
    if (this.isInitialized && this.Settings.PaymentDefinition.pay === PaymentOption.Currency) this.currency?.onChange.RemoveListener(this._onCurrency);
  }

  OnPurchaseButtonClicked() {
    this.PaymentHandler.HandlePayment(this.Settings.PaymentDefinition, this.Section.Placement, (r) => this.OnPaymentHandled(r));
    this.SpawnGainParticles();
  }

  OnPaymentHandled(r) {
    if (r === PaymentResponse.Success) this.Settings.HandleRewards(this.Section.Placement);
    this.currencyShopItemUI.UpdatePurchaseButton();
    this.currencyShopItemUI.StartAvailabilityCheck();
  }

  SpawnGainParticles() {
    const rh = MainMenuManager.Instance?.RewardHandler;
    rh?.OverrideParticleStart(UI_REWARD_SHOP, this.currencyShopItemUI.PurchaseButton.transform);
    const r = this.Settings.RewardDefinition;
    rh?.SpawnReward([new RewardDefinition({ amount: r.amount, rewardID: r.rewardID, rewardType: UI_REWARD_SHOP })]);
  }
}

export class HardCurrencyShopItem extends BaseCurrencyShopItem {
  static typeName = 'HardCurrencyShopItem';
}

export class HardCurrencyShopGiftItem extends HardCurrencyShopItem {
  static typeName = 'HardCurrencyShopGiftItem';

  OnInitialize() {
    this.settings.CheckGiftReset();
    this.claimGiftBtn.onClick.AddListener(() => this.OnClaim());
    this.getRubiesText.SetText(replaceTerm(this.getRubiesString || 'UI/Shop/Gift/ViewAd', this.settings.giftRubyAmount));
    this.UpdateUI();
  }

  OnClaim() {
    if (!this.settings.CanClaimGift) return;
    // rewarded video treated as watched
    this.settings.ClaimGift();
    Currencies.Hard.Gain(this.settings.giftRubyAmount, 'Ads');
    const rh = MainMenuManager.Instance?.RewardHandler;
    rh?.OverrideParticleStart(UI_REWARD_SHOP, this.enabledGift.transform);
    rh?.SpawnReward([new RewardDefinition({ amount: this.settings.giftRubyAmount, rewardID: 'Currency_Hard', rewardType: UI_REWARD_SHOP })]);
    this.UpdateUI();
  }

  Update() {
    if (Time.frameCount % 60 === 0) {
      this.settings.CheckGiftReset();
      this.UpdateUI();
    }
  }

  UpdateUI() {
    const can = this.settings.CanClaimGift;
    this.notification?.UpdatePingObject(can);
    this.enabledGift.SetActive(can);
    this.disabledGift.SetActive(!can);
  }
}

// ---------------------------------------------------------------- confirmations / popups

export class BaseShopItemConfirmation extends MonoBehaviour {
  static typeName = 'BaseShopItemConfirmation';

  static isOpen = false;

  static get IsOpen() {
    return BaseShopItemConfirmation.isOpen;
  }

  constructor() {
    super();
    this.closeButtons = [];
    this.purchased = false;
    this.ticker = null;
    this._close = () => this.OnCloseButtonPressed();
    this._press = () => this.OnButtonPressed();
    this._update = () => this.UpdatePurchaseButton();
    this._onBuy = (r) => {
      if (!this._destroyed) this.OnBuy(r);
    };
  }

  get TutorialSocket() {
    return this.tutorialSocket;
  }

  Initialize(itemSettings, onPaid, purchaseConfirmation) {
    BaseShopItemConfirmation.isOpen = true;
    this.settings = itemSettings;
    this.confirmation = purchaseConfirmation;
    onPaid.AddListener(this._onBuy);
    if (this.settings.PaymentHandler.IsBlockedByTimer(this.settings.PaymentDefinition)) {
      this.ticker = Ticker.Get(1);
      this.ticker.Tick.AddListener(this._update);
    }
    this.buyButtonText.SetText(this.GetButtonText());
    for (const b of this.closeButtons) b?.onClick.AddListener(this._close);
    this.buyButton.onClick.AddListener(this._press);
    this.OnInitialized();
  }

  GetButtonText() {
    const p = this.settings.PaymentDefinition;
    if (this.settings.PaymentHandler.IsBlockedByTimer(p)) return TimeFormatSettings.FormatWithSeconds(this.settings.PaymentHandler.TimeUntilPurchaseAvailable(p));
    return p.BuyString;
  }

  UpdatePurchaseButton() {
    const p = this.settings.PaymentDefinition;
    if (this.settings.PaymentHandler.IsBlockedByTimer(p)) {
      this.buyButtonText.SetText(TimeFormatSettings.FormatWithSeconds(this.settings.PaymentHandler.TimeUntilPurchaseAvailable(p)));
      if (!this.ticker) {
        this.ticker = Ticker.Get(1);
        this.ticker.Tick.AddListener(this._update);
      }
    } else this.buyButtonText.SetText(p.BuyString);
  }

  OnInitialized() {}

  OnCloseButtonPressed() {
    this.UnlinkButtons();
    this.Close();
  }

  UnlinkButtons() {
    for (const b of this.closeButtons) b?.onClick.RemoveListener(this._close);
    this.buyButton.onClick.RemoveListener(this._press);
    this.buyButton.Hide();
  }

  OnButtonPressed() {
    this.confirmation?.();
  }

  OnBuy(response) {
    if (response === PaymentResponse.Success) {
      this.purchased = true;
      this.buyFeedbacks?.PlayFeedbacks();
      if (this.autoCloseOnBuy && this.purchased) {
        this.UnlinkButtons();
        this.Close();
      }
    }
  }

  Close() {
    this.ticker?.Tick.RemoveListener(this._update);
    tutorialUtility()?.Hide();
    BaseShopItemConfirmation.isOpen = false;
    Destroy(this.gameObject);
  }

  OnDestroy() {
    this.ticker?.Tick.RemoveListener(this._update);
    BaseShopItemConfirmation.isOpen = false;
  }
}

export class LootboxShopItemConfirmation extends BaseShopItemConfirmation {
  static typeName = 'LootboxShopItemConfirmation';

  OnInitialized() {
    const box = LootboxService.box(this.settings.RewardDefinition.extraData);
    this.labelText.SetText(lootboxVisualName(box));
    this.lootboxRarityText.SetText(localizeRarity(this.lootboxRarity | 0));
    this.lootboxRarityText.SetColor(rarityData(this.lootboxRarity | 0).main);
    this.containsText.SetText(box?.cosmetics ?? 0);
  }
}

export class DailyDealShopItemConfirmation extends BaseShopItemConfirmation {
  static typeName = 'DailyDealShopItemConfirmation';

  constructor() {
    super();
    this.purchasedWaitTime = 0.5;
    this.isDoingSequence = false;
  }

  OnInitialized() {
    const id = parseInt(this.settings.RewardDefinition.extraData, 10);
    if (Number.isNaN(id)) return;
    const card = CardService.get(id);
    this.card = card && card.IsRankCard ? card : null;
    if (!this.card) return;
    this.metaCard?.SetupCardPreview(this.card, this.settings.RewardDefinition.amount);
    this.cardBase.Initialize(this.card, this.settings.RewardDefinition.amount, false);
    this.cardBase.Hide();
    this.rarity.SetColor(rarityData(this.card.Rarity).main);
    this.rarity.SetText(localizeRarity(this.card.Rarity));
    this.title.SetText(cardLabel(this.card));
  }

  OnBuy(response) {
    if (response === PaymentResponse.Success && !this.isDoingSequence) {
      this.isDoingSequence = true;
      this.StartCoroutine(this.PurchaseSequence());
    }
  }

  *PurchaseSequence() {
    this.UnlinkButtons();
    for (const o of this.disableWhenPurchased || []) o?.Hide();
    this.cardBase.Show();
    yield ComponentRegistry.get('UI_CardBase').PlayRevealSequence(this.cardBase, this.purchasedWaitTime);
    this.isDoingSequence = false;
    super.OnBuy(PaymentResponse.Success);
  }
}

export class BoosterShopItemConfirmation extends BaseShopItemConfirmation {
  static typeName = 'BoosterShopItemConfirmation';

  OnInitialized() {
    const id = parseInt(this.settings.RewardDefinition.extraData, 10);
    if (Number.isNaN(id)) return;
    this.card = CardService.get(id);
    if (!this.card) return;
    this.icon.sprite = cardImage(this.card);
    this.rarity.SetColor(rarityData(this.card.Rarity).main);
    this.rarity.SetText(this.settings.PaymentDefinition.RarityText);
    this.description.SetText(localize(this.card.def.descTerm));
    this.title.SetText(cardLabel(this.card));
    this.UpdateOwnedCount();
  }

  UpdateOwnedCount() {
    this.ownedCount.SetText(replaceTerm(this.ownedText || 'UI/Shop/Booster/Owned', this.card.Total));
  }

  OnBuy(response) {
    if (response === PaymentResponse.Success) {
      this.UpdateOwnedCount();
      super.OnBuy(response);
    }
  }
}

export class UI_DailyDealShopRefreshPopUp extends MonoBehaviour {
  static typeName = 'UI_DailyDealShopRefreshPopUp';

  constructor() {
    super();
    this.refreshFormat = '{0}/{1}';
  }

  Initialize(cost, payAction) {
    this.payAction = payAction;
    this.cost = cost;
    this.quitButton.onClick.AddListener(() => this.Close());
    this.backgroundButton.onClick.AddListener(() => this.Close());
    this.buyAdButton.onClick.AddListener(() => this.OnBuyAd());
    this.buyCurrencyButton.onClick.AddListener(() => this.OnBuyCurrency());
    this.refreshCount.SetText(csFormat(this.refreshFormat, this.settings.refreshesPerDay - this.settings.RefreshCount, this.settings.refreshesPerDay));
    this.currencyBtnTxt.text = String(cost);
  }

  Close() {
    if (!this.gameObject._destroyed) Destroy(this.gameObject);
  }

  OnBuyAd() {
    // rewarded video removed: reward granted at once
    this.payAction();
    this.Close();
  }

  OnBuyCurrency() {
    if (Currencies.Hard.CanSpend(this.cost)) {
      Currencies.Hard.Spend(this.cost, 'DailyDeals');
      this.payAction();
      this.Close();
    } else MainMenuManager.ShowNotEnoughCurrencyPopUp(CurrencyType.Hard);
  }
}

// ---------------------------------------------------------------- RV reward track

/** CanAssignReward of the reward component referenced by a UI_RVRewardTrackReward prefab (serialized data probe) */
function prefabRewardComponent(prefabRef) {
  const ref = prefabRef?.data?.rewardComponent?.$c;
  if (!ref) return null;
  const cd = prefabRef.json?.nodes[ref[0]]?.c?.[ref[1]];
  const Cls = cd && ComponentRegistry.get(cd.$type);
  if (!Cls) return null;
  const probe = new Cls();
  for (const k of ['rewardIDs', 'features']) if (k in cd) probe[k] = cd[k];
  return probe;
}

export class UI_RVRewardTrack extends MonoBehaviour {
  static typeName = 'UI_RVRewardTrack';

  constructor() {
    super();
    this.isActive = false;
    this._progress = () => this.OnProgressChanged();
  }

  Initialize() {
    this.adButton.onClick.AddListener(() => this.OnAdButtonPressed());
    this.rewardTrack.OnProgressChanged.AddListener(this._progress);
    let previousRequired = 0;
    for (let i = 0; i < this.rewardTrack.Count; i++) {
      const step = this.rewardTrack.GetStep(i);
      const def = new RewardDefinition({ rewardID: step.rewardID, amount: step.amount, extraData: step.extraData });
      const asset = rewardAsset(def.rewardID);
      if (!asset) console.error('UI_RVRewardTrack', `Could not find reward for ID ${def.rewardID}`);
      const prefab = (this.rewardPrefabs || []).find((p) => prefabRewardComponent(p)?.CanAssignReward(def, asset));
      if (!prefab) {
        console.error('UI_RVRewardTrack', 'Could not find UI_BaseRewardComponent that could be assigned');
        continue;
      }
      const entry = this.rewardEntries[i];
      const reward = Instantiate(prefab, entry.RewardSocket);
      reward.Initialize(i, (r) => this.TryClaimAction(r));
      reward.SetReward(def, asset);
      entry.Initialize(previousRequired, step.required, reward);
      previousRequired = step.required;
    }
  }

  OnDestroy() {
    this.rewardTrack?.OnProgressChanged.RemoveListener(this._progress);
  }

  OnProgressChanged() {
    if (this.isActive) this.SetEntriesState();
  }

  TryClaimAction(reward) {
    const step = this.rewardTrack.GetStep(reward.Index);
    if (!this.rewardTrack.IsClaimed(step)) {
      reward.PlayClaim();
      const result = this.rewardTrack.ClaimReward(step);
      reward.TryPlayAdditionalClaimAnimations(result);
    }
  }

  OnEnable() {
    if (this.rewardTrack.IsDayDifferent) this.rewardTrack.ResetTrackAndDay();
    this.SetEntriesState();
    this.isActive = true;
  }

  OnDisable() {
    this.isActive = false;
  }

  SetEntriesState() {
    const t = this.rewardTrack;
    for (let i = 0; i < t.Count; i++) {
      const step = t.GetStep(i);
      this.rewardEntries[i]?.SetState(t.IsClaimed(step), t.CurrentProgress);
    }
    this.adButton.interactable = !t.IsFullyUnlocked;
    this.adButtonIcon.color = Color.from(t.IsFullyUnlocked ? this.adButtonIconInactiveColor : this.adButtonIconActiveColor);
    if (t.IsFullyUnlocked) {
      this.rvsLeftText.SetTerm(this.comeBackTomorrowLocalizedString);
      return;
    }
    this.rvsLeftText.SetTerm(this.watchRVLocalizedString);
    this.rvsLeftText.SetText(t.NextStepUnlocksAt - t.CurrentProgress);
  }

  OnAdButtonPressed() {
    // rewarded video removed: RVRewardTrack advances by one at once
    this.rewardTrack.HandleProgress(1);
  }

  ResetTrack() {
    this.rewardTrack.ResetTrack(false);
  }
}

export class UI_RVRewardTrackEntry extends MonoBehaviour {
  static typeName = 'UI_RVRewardTrackEntry';

  get RewardSocket() {
    return this.rewardSocket;
  }

  Initialize(start, rvCount, reward) {
    this.start = start;
    this.rvCount = rvCount;
    this.rewardTrackReward = reward;
    this.countText.SetText(rvCount);
  }

  SetState(isClaimed, progress) {
    if (!this.rewardTrackReward) return;
    // Mathf.InverseLerp
    const fill = this.start !== this.rvCount ? Math.min(1, Math.max(0, (progress - this.start) / (this.rvCount - this.start))) : 0;
    this.fillbar.fillAmount = fill;
    this.rewardTrackReward.SetClaimed(isClaimed);
    this.rewardTrackReward.SetClaimable(!isClaimed && fill >= 1);
  }
}

export class UI_RVRewardTrackReward extends MonoBehaviour {
  static typeName = 'UI_RVRewardTrackReward';

  get RewardComponent() {
    return this.rewardComponent;
  }

  Initialize(index, claimAction) {
    this.Index = index;
    this.claimAction = claimAction;
    this.claimButton.onClick.AddListener(() => this.claimAction?.(this));
    this.claimFeedbacks?.Initialization();
    this.claimableFeedbacks?.Initialization();
  }

  SetReward(def, asset) {
    this.rewardAsset = asset;
    this.rewardDefinition = def;
    this.rewardComponent.SetRewardUI(def, asset);
  }

  SetClaimed(v) {
    this.claimedOverlay.Show(v);
  }

  SetClaimable(v) {
    this.claimableOverlay.Show(v);
    this.claimButton.interactable = v;
    if (v) this.claimableFeedbacks?.PlayFeedbacks();
    else this.claimableFeedbacks?.StopFeedbacks();
  }

  /** claimFeedbacks.Events.OnComplete (polled: the JS MMFeedbacks has no completion event) */
  onClaimComplete(fn) {
    const fb = this.claimFeedbacks;
    this.StartCoroutine((function* () {
      yield null;
      while (fb?.IsPlaying) yield null;
      fn();
    })());
  }

  PlayClaim() {
    this.claimFeedbacks?.PlayFeedbacks();
    InputUIBlocker.DisableInput();
    this.onClaimComplete(() => {
      InputUIBlocker.EnableInput();
      const rh = MainMenuManager.Instance?.RewardHandler;
      rh?.OverrideParticleStart(UI_REWARD_SHOP, this.transform);
      rh?.SpawnReward([new RewardDefinition({ amount: this.rewardDefinition.amount, rewardID: this.rewardDefinition.ID, rewardType: UI_REWARD_SHOP })]);
    });
  }

  /** result: the grant of the claimed step (RandomCardRewardAsset.LastGivenCard / LastGivenCardAmount) */
  TryPlayAdditionalClaimAnimations(result) {
    if (this.rewardAsset?.kind !== 'RandomCardRewardAsset') return;
    const given = result?.cards?.[0];
    const randomCard = { LastGivenCard: given?.card || result?.card || null, LastGivenCardAmount: given?.added ?? this.rewardDefinition.amount };
    this.onClaimComplete(() => {
      if (!randomCard.LastGivenCard) return;
      Instantiate(this.cardRevealPrefab, UI_ShopPage.Instance.transform).Initialize(randomCard);
    });
  }
}

export class UI_RVRewardTrackCardReveal extends MonoBehaviour {
  static typeName = 'UI_RVRewardTrackCardReveal';

  constructor() {
    super();
    this.cardRevealDismissDelay = 0.25;
  }

  Initialize(randomCardRewardAsset) {
    const amount = randomCardRewardAsset.LastGivenCardAmount;
    const card = randomCardRewardAsset.LastGivenCard;
    this.cardBase.SetStartingCardsAmount(Math.max(0, card.Total - amount));
    this.cardBase.Initialize(card, amount, false);
    this.StartCoroutine(this.RevealSequence());
  }

  *RevealSequence() {
    yield ComponentRegistry.get('UI_CardBase').PlayRevealSequence(this.cardBase, this.cardRevealDismissDelay);
    Destroy(this.gameObject);
  }
}

// ---------------------------------------------------------------- page

export class UI_ShopPage extends MainMenuPage {
  static typeName = 'UI_ShopPage';

  static Instance = null;

  Initialize() {
    UI_ShopPage.Instance = this;
    this.shop.Initialize();
  }

  OnEnable() {
    this.shop.Open();
  }

  OnDisable() {
    this.shop.Close();
  }

  OnDestroy() {
    if (UI_ShopPage.Instance === this) UI_ShopPage.Instance = null;
  }

  MarkForRebuild() {
    this.shop.MarkForRebuild();
  }
}

// ShopTutorial looks the page up through the tutorial hooks
Tutorials.hooks.shopPage ||= () => UI_ShopPage.Instance;

/** ShopGameNotificationHandler.GetPingsCount (the C# count; meta Shop.Pings misses the daily deal term) */
export function ShopPingsCount() {
  let n = 0;
  const page = UI_ShopPage.Instance;
  if (page) {
    if (page.lootboxSection.CanGetFreeLootbox()) n++;
    if (page.lootboxSection.CanGetLargeLootbox()) n++;
  }
  const dd = page?.shop?.sections?.find((s) => s instanceof DailyDealShopSection)?.settings;
  n += dd?.HasFree() ? 1 : 0;
  const gift = page?.shop?.sections?.find((s) => s instanceof HardCurrencyShopSection)?.hardCurrencyShopGiftSettings;
  return n + (gift?.CanClaimGift ? 1 : 0);
}

for (const cls of [
  BaseShopController,
  BaseScrollShop,
  BaseShopSection,
  LootboxShopSection,
  DailyDealShopSection,
  RVRewardTrackShopSection,
  HardCurrencyShopSection,
  ShopItemUI,
  BaseGameShopItemUI,
  LootboxShopItemUI,
  DailyDealShopItemUI,
  CurrencyShopItemUI,
  BaseShopItem,
  BaseGameShopItem,
  LootboxShopItem,
  DailyDealShopItem,
  BaseCurrencyShopItem,
  HardCurrencyShopItem,
  HardCurrencyShopGiftItem,
  BaseShopItemConfirmation,
  LootboxShopItemConfirmation,
  DailyDealShopItemConfirmation,
  BoosterShopItemConfirmation,
  UI_DailyDealShopRefreshPopUp,
  UI_RVRewardTrack,
  UI_RVRewardTrackEntry,
  UI_RVRewardTrackReward,
  UI_RVRewardTrackCardReveal,
  UI_ShopPage,
]) registerComponent(cls);
