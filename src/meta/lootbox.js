// CW.LootBoxing: lootbox queue, drop rolls (UnboxingHelper/DropCache/CosmeticsDropper), claim; DailyLootboxManager.
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Meta } from './data.js';
import { CardService } from './cards.js';
import { Rewards } from './rewards.js';
import { Analytics } from '../analytics/index.js';

export const ClaimSelection = { Normal: 2, Premium: 0x80, Ads: 0x2000 };

function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a)); // max exclusive (Unity int Random.Range)
}

function weightedPick(items, w) {
  let pick = null;
  let total = 0;
  for (const it of items) {
    const wi = w(it);
    if (wi < 1) continue;
    total += wi;
    if (randInt(0, total) < wi) pick = it;
  }
  return pick;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function combineDuplicates(list) {
  const out = [];
  const by = new Map();
  for (const d of list) {
    if (by.has(d.id)) by.get(d.id).count += d.count;
    else {
      const e = { id: d.id, count: d.count };
      by.set(d.id, e);
      out.push(e);
    }
  }
  return out;
}

class UnboxingHelper {
  constructor(box) {
    this.box = box;
    this.cardsSoFar = [];
    this.settings = Meta.data.lootboxes.settings;
  }

  dropper(name) {
    return Meta.data.lootboxes.droppers[name] || { cls: 'CosmeticsDropper', allowed: [] };
  }

  selector(d, card) {
    if (!card.IsAllowedAsReward || card.IsLocked) return false;
    if (d.cls === 'EquippedCosmeticsDropper') {
      const eq = CardService.IsEquipped(card);
      return d.mustBeEquipped ? eq : !eq;
    }
    return true;
  }

  fallback() {
    return { id: this.settings.refundCard, count: 1 };
  }

  /** BaseDropper.getSingleDropResult */
  single(dname, slot) {
    let d = this.dropper(dname);
    slot = { ...slot };
    if (d.cls === 'RVDropper' && d.sub?.length) {
      const s = weightedPick(d.sub, (x) => x.weight) || d.sub[d.sub.length - 1];
      slot.min = s.cards;
      d = this.dropper(s.dropper);
    }
    const items = shuffle(
      [...CardService.cards.values()].filter((c) => d.allowed.includes(c.Type) && this.selector(d, c) && !this.cardsSoFar.includes(c.ID)),
    );
    // CosmeticsDropper.pick: roll a card type from the service table (types not allowed get weight 0)
    const table = this.settings.typeTable.map(([type, w]) => ({ type, w: d.allowed.includes(type) ? w : 0 }));
    let item = null;
    do {
      const row = weightedPick(table, (r) => r.w) || table[table.length - 1];
      item = items.find((c) => c.Type === row.type);
      if (item) break;
      row.w = 0;
    } while (table.some((r) => r.w > 0));
    const r = item ? { id: item.ID, count: slot.min } : this.fallback();
    this.cardsSoFar.push(r.id);
    return r;
  }

  overflow(dr, extra) {
    const card = CardService.get(dr.id);
    if (!card) return 0;
    const total = dr.count + (extra || []).filter((x) => x.id === dr.id).reduce((a, x) => a + x.count, 0);
    const o = card.CalculateOverflow(total);
    dr.count -= o;
    return o;
  }

  regular(slots) {
    const results = new Map();
    let left = this.box.cosmetics; // signed (the C# uint underflows for DailyLootboxLevel1)
    const reimburse = { id: CardService.get(Meta.data.excessDuplicatesCard) ? Meta.data.excessDuplicatesCard : this.settings.refundCard, count: 0 };
    for (const slot of slots) {
      const dr = this.single(slot.dropper, slot);
      left -= dr.count;
      reimburse.count += this.overflow(dr);
      if (dr.count) results.set(slot, dr);
    }
    for (; left > 0; left--) {
      const s = weightedPick([...results.keys()].filter((k) => results.get(k).count < k.max), (k) => k.weight);
      if (s) results.get(s).count++;
      else reimburse.count++;
    }
    let list = [...results.values()];
    if (reimburse.count) list.push(reimburse);
    if (this.settings.groupDuplicates) list = combineDuplicates(list);
    return list;
  }

  ads(slots, regular) {
    let list = [];
    const reimburse = { id: this.settings.refundCard, count: 0 };
    for (const slot of slots) {
      const dr = this.single(slot.dropper, slot);
      reimburse.count += this.overflow(dr, regular);
      if (dr.count) list.push(dr);
    }
    if (reimburse.count) list.push(reimburse);
    return combineDuplicates(list);
  }

  roll() {
    const regular = this.regular(this.box.basic);
    return { box: this.box.id, type: this.box.type, regular, ads: this.ads(this.box.ads, regular) };
  }
}

function lstate() {
  return (Save.data.lootboxes ||= { opened: {}, inbox: [], openingResult: null });
}

export const LootboxService = {
  onQueued: new EventAction(),
  onClaimed: new EventAction(),

  init() {
    Rewards.onLootbox.AddListener((id, source) => this.AddToQueue(id, source));
  },

  box(id) {
    return Meta.data.lootboxes.boxes[id] || null;
  },

  art(type) {
    return Meta.data.lootboxes.art[type] || Meta.data.lootboxes.art[0];
  },

  get inbox() {
    return lstate().inbox;
  },

  get HasQueued() {
    return lstate().inbox.length > 0;
  },

  AddToQueue(id, origin = '') {
    const b = this.box(id);
    if (!b) return console.warn('unknown lootbox', id);
    lstate().inbox.push({ box: id, type: b.type, origin });
    Save.setDirty();
    this.onQueued.Raise(id);
  },

  /** roll (or return the persisted roll of) the first queued box */
  OpenNext() {
    const st = lstate();
    if (st.openingResult) return st.openingResult;
    const meta = st.inbox[0];
    if (!meta) return null;
    const b = this.box(meta.box);
    st.openingResult = { ...new UnboxingHelper(b).roll(), origin: meta.origin };
    Save.setDirty();
    return st.openingResult;
  },

  Claim(withAds) {
    const st = lstate();
    const r = st.openingResult;
    if (!r) return false;
    const i = st.inbox.findIndex((m) => m.box === r.box);
    if (i >= 0) st.inbox.splice(i, 1);
    st.opened[r.type] = (st.opened[r.type] || 0) + 1;
    st.openingResult = null;
    Analytics.featureAction('chests', withAds ? 'open_ad' : 'open', r.box);
    for (const d of [...r.regular, ...(withAds ? r.ads : [])]) CardService.get(d.id)?.Add(d.count, r.origin);
    Save.setDirty();
    this.onClaimed.Raise(r);
    return true;
  },

  /** "Contains: N" + guaranteed rarities (display only) */
  Guaranteed(box) {
    const by = {};
    for (const s of box.basic) if (s.data !== 5) by[s.data] = (by[s.data] || 0) + s.min;
    return Object.entries(by).map(([r, n]) => ({ rarity: Number(r), count: n })).sort((a, b) => b.rarity - a.rarity);
  },
};

// ---------------------------------------------------------------- daily lootbox

function dayStart(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dstate() {
  return (Save.data.dailyLootbox ||= { hasLast: false, lastXp: 0, xp: 0, day: dayStart(), lastSeenLevel: 0 });
}

export const DailyLootbox = {
  onChanged: new EventAction(),

  init(runState) {
    this.CheckState();
    runState.jumpCompleted.AddListener((j) => this.OnJump(j));
    setInterval(() => {
      if (this.TimeLeftToClaim <= 0) this.CheckState();
    }, 1000);
  },

  get defs() {
    return Meta.data.dailyLootbox;
  },

  get MaxLevel() {
    return this.defs.length - 1;
  },

  totalXp(l) {
    let n = 0;
    for (let i = 0; i <= l; i++) n += this.defs[i].xp;
    return n;
  },

  get XP() {
    const s = dstate();
    return s.hasLast ? s.lastXp : s.xp;
  },

  get Level() {
    let l = 0;
    for (let i = 0; i <= this.MaxLevel; i++) if (this.XP >= this.totalXp(i)) l = i;
    return l;
  },

  get Progress() {
    const l = this.Level;
    if (l === this.MaxLevel) return [this.defs[l].xp, this.defs[l].xp];
    return [this.XP - this.totalXp(l), this.defs[l + 1].xp];
  },

  get CanClaim() {
    return dstate().hasLast;
  },

  get ChangedDay() {
    return dayStart() > dstate().day;
  },

  get TimeLeftToClaim() {
    return (dstate().day + 86400000 - Date.now()) / 1000;
  },

  CheckState() {
    const s = dstate();
    if (!this.ChangedDay) return;
    s.day = dayStart();
    s.lastXp = s.xp;
    s.xp = 0;
    s.hasLast = true;
    Save.setDirty();
    this.onChanged.Raise();
  },

  OnJump(j) {
    if (this.ChangedDay) return;
    const lv = this.Level;
    dstate().xp += j.TotalFlips * (j.perfect ? 2 : 1);
    Save.setDirty();
    if (lv !== this.Level) this.onChanged.Raise();
  },

  LootboxFor(level) {
    return this.defs[level]?.lootbox;
  },

  TryClaim() {
    const s = dstate();
    if (!s.hasLast) return false;
    LootboxService.AddToQueue(this.LootboxFor(this.Level), 'Chests');
    s.lastXp = 0;
    s.lastSeenLevel = 0;
    s.hasLast = false;
    Save.setDirty();
    this.onChanged.Raise();
    return true;
  },
};
