// CW.Rewards: reward registry (reward id string -> grant), and RewardTrack (rank track, RV track).
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Currencies } from './currency.js';
import { CardService, RANK_TYPES, CardType } from './cards.js';
import { WorldManager, parseUnlock } from './worlds.js';

/**
 * Grant `def` = {id, amount, extra}. Returns a description used by the reward UI:
 * {id, amount, card?, cards?: [{card, before, added}], unlock?, lootbox?}
 */
export function grantReward(def, source = '') {
  const id = def.id;
  const amount = def.amount | 0;
  const out = { id, amount, extra: def.extra };
  switch (id) {
    case 'Currency_Soft':
      Currencies.Soft.Gain(amount, source);
      break;
    case 'Currency_Hard':
      Currencies.Hard.Gain(amount, source);
      break;
    case 'Currency_Star':
      Currencies.Star.Gain(amount, source);
      break;
    case 'Currency_Bonus':
      Currencies.Bonus.Gain(amount, source);
      break;
    case 'Currency_SoftRange':
    case 'Currency_HardRange': {
      const [a, b] = String(def.extra || '').split(/[;,-]/).map(Number);
      const n = Number.isFinite(b) ? Math.round(a + Math.random() * (b - a)) : amount;
      out.amount = n;
      (id === 'Currency_SoftRange' ? Currencies.Soft : Currencies.Hard).Gain(n, source);
      break;
    }
    case 'XP':
      break; // vestigial in the shipped data
    case 'UnlockReward':
      out.unlock = parseUnlock(def.extra);
      WorldManager.GiveUnlock(out.unlock);
      break;
    case 'Unlock Card': {
      const c = CardService.get(Number(def.extra));
      if (c) {
        out.card = c;
        out.cards = [{ card: c, before: c.Total, added: 0, wasLocked: !c.HasSaveData }];
        c.Add(0, source);
      }
      break;
    }
    case 'Card': {
      const c = CardService.get(Number(def.extra));
      if (c) {
        const before = c.Total;
        out.card = c;
        out.cards = [{ card: c, before, added: c.Add(amount, source), wasLocked: !c.HasSaveData }];
      }
      break;
    }
    case 'Unlock Random Card': {
      const type = Number(def.extra) || CardType.Vehicle;
      const c = CardService.GetDrop(true, [type]);
      if (c) {
        out.card = c;
        out.cards = [{ card: c, before: 0, added: 0, wasLocked: true }];
        c.Add(0, source);
      }
      break;
    }
    case 'Random Card': {
      const c = CardService.GetDrop(false, def.extra ? [Number(def.extra)] : RANK_TYPES);
      if (c) {
        const before = c.Total;
        const n = Math.max(1, amount) - c.CalculateOverflow(Math.max(1, amount));
        out.card = c;
        out.cards = [{ card: c, before, added: c.Add(n, source) }];
      } else {
        const hard = CardService.get(2000000300);
        out.id = 'Currency_Hard';
        out.amount = Math.round((hard?.def.currencyPerCard || 5) * Math.max(1, amount));
        Currencies.Hard.Gain(out.amount, source);
      }
      break;
    }
    case 'Lootbox':
      out.lootbox = def.extra;
      Rewards.onLootbox.Raise(def.extra, source);
      break;
    default:
      console.warn('unknown reward', id);
  }
  Rewards.onGranted.Raise(out);
  return out;
}

export const Rewards = {
  onGranted: new EventAction(),
  onLootbox: new EventAction(), // (lootbox id) -> opened by the lootbox service
};

// ---------------------------------------------------------------- reward tracks

export const ProgressionType = { Incremental: 0, HighScore: 1 };

export class RewardTrack {
  constructor(uid, data) {
    this.uid = uid;
    this.steps = data.steps;
    this.type = data.type;
    this.data = data;
    this.onStateChange = new EventAction();
  }

  get state() {
    return (Save.data.tracks[this.uid] ||= { progress: 0, claimed: [] });
  }

  get progression() {
    return this.state.progress;
  }

  get MaxProgression() {
    return this.steps.length ? this.steps[this.steps.length - 1].required : 0;
  }

  get IsFullyUnlocked() {
    return this.progression >= this.MaxProgression;
  }

  get NextStepUnlocksAt() {
    const s = this.steps.find((x) => x.required > this.progression);
    return s ? s.required : Infinity;
  }

  IsClaimed(step) {
    return this.state.claimed.includes(step.sid);
  }

  IsUnclaimed(step) {
    return step.required <= this.progression && !this.IsClaimed(step);
  }

  get UnclaimedSteps() {
    return this.steps.filter((s) => this.IsUnclaimed(s));
  }

  HandleProgress(value) {
    const st = this.state;
    if (st.progress >= this.MaxProgression) return false;
    if (this.type === ProgressionType.Incremental) st.progress += value;
    else {
      if (st.progress >= value) return false;
      st.progress = value;
    }
    Save.setDirty();
    this.onStateChange.Raise();
    return true;
  }

  ClaimReward(step, source) {
    if (step.required > this.progression || this.IsClaimed(step)) return null;
    this.state.claimed.push(step.sid);
    const r = grantReward(step, source || this.uid);
    Save.setDirty();
    this.onStateChange.Raise();
    return r;
  }

  ClaimNext(source) {
    const s = this.UnclaimedSteps[0];
    return s ? this.ClaimReward(s, source) : null;
  }

  ResetTrack() {
    delete Save.data.tracks[this.uid];
    Save.setDirty();
    this.onStateChange.Raise();
  }
}
