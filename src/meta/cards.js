// CW.CardSystem + GameCardService: card collections, ranks (skins) by collected copies, equipped cosmetics.
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Meta, T } from './data.js';
import { Currencies, CurrencyType } from './currency.js';
import { WorldManager } from './worlds.js';

export const CardType = { Invalid: 0, Currency: 1, Vehicle: 10000, VehicleColor: 20000, VehicleTrail: 30000, VehicleDeath: 31000, VehicleLanding: 32000, Booster: 40000 };
export const CardRarity = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Special: 4 };
export const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary', 'Special'];
export const RANK_TYPES = [CardType.Vehicle, CardType.VehicleColor, CardType.VehicleTrail, CardType.VehicleDeath, CardType.VehicleLanding];
const MAX_RANK = 3;
const RARITY_TABLE = [0, 1, 2, 3];
const DEFAULT_CARDS = { 10000: 10012, 20000: 20000, 30000: 30000, 31000: 31000, 32000: 32000 };
const TYPE_TERMS = { 10000: 'CardType/Vehicle', 20000: 'CardType/Color', 30000: 'CardType/Trail', 31000: 'CardType/Death', 32000: 'CardType/Landing', 40000: 'CardType/Booster' };

export function typeName(type) {
  const t = TYPE_TERMS[type];
  const s = t ? T(t) : '';
  return s && s !== t ? s : { 10000: 'Vehicle', 20000: 'Color', 30000: 'Trail', 31000: 'Explosion', 32000: 'Landing', 40000: 'Booster', 1: 'Currency' }[type] || '';
}

export class Card {
  constructor(def) {
    this.def = def;
    this.onRankChanged = new EventAction();
  }

  get ID() {
    return this.def.id;
  }

  get Type() {
    return this.def.type;
  }

  get Label() {
    return this.def.label;
  }

  get IsRankCard() {
    return RANK_TYPES.includes(this.def.type);
  }

  get SaveData() {
    return Save.data.cards.owned[this.def.id] || null;
  }

  get HasSaveData() {
    return !!this.SaveData;
  }

  get Total() {
    return this.SaveData?.total || 0;
  }

  get UnlocksInWorldID() {
    return (this.def.world || 1) - 1;
  }

  get IsLockedInWorld() {
    return WorldManager.HighestUnlockedWorld() < this.UnlocksInWorldID;
  }

  get IsLocked() {
    return !this.HasSaveData || this.IsLockedInWorld;
  }

  get IsUsable() {
    return this.IsRankCard ? !this.IsLocked : this.Total !== 0;
  }

  get IsAllowedAsReward() {
    return !!this.def.canDrop;
  }

  get MaxCards() {
    return this.IsRankCard ? this.totalNeeded(MAX_RANK) : Number.MAX_SAFE_INTEGER;
  }

  get IsMaxedOut() {
    return this.Total >= this.MaxCards;
  }

  // ------------------------------------------------ rank math
  cn(r) {
    const a = Meta.data.cardsNeeded;
    return a[Math.max(0, Math.min(r, a.length - 1))];
  }

  totalNeeded(r) {
    let n = 0;
    for (let i = 0; i <= r; i++) n += this.cn(i);
    return n;
  }

  startCards(r) {
    return this.totalNeeded(r) - this.cn(r);
  }

  GetRankForCards(c) {
    for (let r = MAX_RANK; r > 0; r--) if (this.startCards(r + 1) <= c) return r;
    return 0;
  }

  get HighestUnlockedRank() {
    return this.GetRankForCards(this.Total);
  }

  IsRankUnlocked(r) {
    return this.Total >= this.totalNeeded(r);
  }

  get CurrentRank() {
    return this.SaveData?.rank || 0;
  }

  get Rarity() {
    return this.IsRankCard ? RARITY_TABLE[this.HighestUnlockedRank] : this.def.rarity;
  }

  get UILevel() {
    return this.IsRankCard ? this.HighestUnlockedRank + 1 : -1;
  }

  get UICurrentCards() {
    return this.IsRankCard ? this.Total - this.startCards(this.HighestUnlockedRank + 1) : this.Total;
  }

  get UIMaxCards() {
    return this.IsRankCard ? this.cn(this.HighestUnlockedRank + 1) : this.MaxCards;
  }

  /** (rank, current, needed) for `cards` copies (reward card animations) */
  GetCardsRangeForCards(c) {
    const r = this.GetRankForCards(c);
    const need = this.cn(r + 1);
    return [r, Math.min(c - this.startCards(r + 1), need), need];
  }

  GetImage(r) {
    if (!this.IsRankCard || r <= 0) return this.def.image;
    return this.def.rankImages?.[r - 1] || this.def.image;
  }

  GetItem(r) {
    return this.def.items?.[Math.max(0, Math.min(r, (this.def.items?.length || 1) - 1))] || null;
  }

  get IsUnseen() {
    return (this.SaveData?.unseen?.length || 0) > 0;
  }

  get UnseenCount() {
    return this.SaveData?.unseen?.length || 0;
  }

  IsRankUnseen(r) {
    return !!this.SaveData?.unseen?.includes(r);
  }

  // ------------------------------------------------ mutation
  EnsureSaveData() {
    if (!this.SaveData) Save.data.cards.owned[this.def.id] = { total: 0, rank: 0, unseen: [] };
    return this.SaveData;
  }

  Unlock() {
    this.EnsureSaveData();
    Save.setDirty();
  }

  CalculateOverflow(add) {
    const room = this.MaxCards - this.Total;
    return add < room ? 0 : add - room;
  }

  /** returns the number of copies actually added */
  Add(amount, source = '') {
    if (this.def.type === CardType.Currency) {
      const cur = this.def.id < 2000000300 ? Currencies.Soft : Currencies.Hard;
      cur.Gain(Math.round((this.def.currencyPerCard || 1) * amount), source);
      return 0;
    }
    if (this.IsRankCard) {
      if (!this.HasSaveData) this.SetUnseen(0, true);
      const before = this.HighestUnlockedRank;
      const n = amount - this.CalculateOverflow(amount);
      this.EnsureSaveData().total += n;
      const after = this.HighestUnlockedRank;
      for (let i = before + 1; i <= after; i++) this.SetUnseen(i, true);
      Save.setDirty();
      return n;
    }
    this.EnsureSaveData().total += amount;
    Save.setDirty();
    CardService.onBoostersChanged.Raise();
    return amount;
  }

  /** boosters */
  ConsumeCard() {
    const s = this.SaveData;
    if (!s || s.total <= 0) return false;
    s.total--;
    Save.setDirty();
    CardService.onBoostersChanged.Raise();
    return true;
  }

  SetRank(r) {
    if (this.CurrentRank === r || !this.IsRankUnlocked(r)) return;
    this.EnsureSaveData().rank = r;
    Save.setDirty();
    this.onRankChanged.Raise();
    if (CardService.IsEquipped(this)) CardService.onEquippedChanged.Raise(this.Type);
  }

  SetUnseen(r, flag) {
    const s = this.EnsureSaveData();
    if (flag) s.unseen.push(r);
    else {
      const i = s.unseen.indexOf(r);
      if (i >= 0) s.unseen.splice(i, 1);
    }
    Save.setDirty();
    CardService.onCardUnseenStateChanged.Raise();
  }
}

export const CardService = {
  cards: new Map(),
  byType: new Map(),
  onEquippedChanged: new EventAction(), // (type)
  onCardUnseenStateChanged: new EventAction(),
  onBoostersChanged: new EventAction(),
  reserved: new Set(), // RankTrack.cardsToBeUnlocked

  init() {
    this.cards.clear();
    this.byType.clear();
    for (const def of Meta.data.cards) {
      const c = new Card(def);
      this.cards.set(def.id, c);
      if (!this.byType.has(def.type)) this.byType.set(def.type, []);
      this.byType.get(def.type).push(c);
    }
    for (const st of Meta.data.rankTrack.steps) {
      if ((st.id === 'Unlock Card' || st.id === 'Card') && Number(st.extra)) this.reserved.add(Number(st.extra));
    }
    if (!Save.data.cards) this.CreateNewSaveData();
  },

  CreateNewSaveData() {
    Save.data.cards = { owned: {}, equipped: { ...DEFAULT_CARDS } };
    for (const id of Object.values(DEFAULT_CARDS)) this.get(id)?.Unlock();
  },

  get(id) {
    return this.cards.get(Number(id)) || null;
  },

  ofType(type) {
    return this.byType.get(type) || [];
  },

  Equipped(type) {
    return this.get(Save.data.cards.equipped[type] ?? DEFAULT_CARDS[type]);
  },

  IsEquipped(card) {
    return Save.data.cards.equipped[card.Type] === card.ID;
  },

  Equip(card) {
    if (!card || card.IsLocked || this.IsEquipped(card)) return;
    Save.data.cards.equipped[card.Type] = card.ID;
    Save.setDirty();
    this.onEquippedChanged.Raise(card.Type);
  },

  get EquippedCards() {
    return RANK_TYPES.map((t) => this.Equipped(t)?.ID);
  },

  get IsAnyCardNotMaxedOut() {
    return RANK_TYPES.some((t) => this.ofType(t).some((c) => !c.IsLocked && !c.IsMaxedOut));
  },

  /** RandomCardDropper.GetDrop */
  GetDrop(selectLocked, types, filter) {
    const cand = [];
    for (const t of types) {
      for (const c of this.ofType(t)) {
        if (!c.IsAllowedAsReward || c.IsMaxedOut || c.IsLocked !== selectLocked || c.IsLockedInWorld) continue;
        if (this.reserved.has(c.ID) || c.MaxCards - c.Total === 0) continue;
        if (filter && !filter(c)) continue;
        cand.push(c);
      }
    }
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
  },

  /** MetaGameNotificationHandler: badge count of the garage button */
  get MetaPings() {
    let n = 0;
    for (const c of this.ofType(CardType.Vehicle)) if (c.IsUsable && c.IsUnseen) n += c.UnseenCount;
    for (const t of [CardType.VehicleColor, CardType.VehicleTrail, CardType.VehicleLanding, CardType.VehicleDeath]) {
      for (const c of this.ofType(t)) if (!c.IsLocked && c.IsUnseen) n++;
    }
    return n;
  },

  /** world collection progress: unlocked ranks / available ranks of the 5 cosmetic collections */
  CollectionProgress(world, type) {
    let have = 0;
    let all = 0;
    for (const t of type ? [type] : RANK_TYPES) {
      for (const c of this.ofType(t)) {
        if (c.UnlocksInWorldID !== world) continue;
        all += 4;
        if (c.IsUsable) have += c.HighestUnlockedRank + 1;
      }
    }
    return all ? have / all : 0;
  },
};

export { CurrencyType };
