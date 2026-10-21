// Bonus letters (B-O-N-U-S collected in Endless runs) and the main-menu bonus gem claim with its cooldown.
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Meta } from './data.js';
import { Currencies } from './currency.js';
import { PlayerRank } from './rank.js';

export const MAX_BONUS_LETTERS = 5;
export const BONUS_WORD = 'BONUS';

export const Bonus = {
  onChanged: new EventAction(),

  get save() {
    return (Save.data.bonus ||= { lastClaimed: 0, cur: 0, target: 0 });
  },

  get settings() {
    return Meta.data.bonus;
  },

  get Letters() {
    return Currencies.Bonus.value;
  },

  get CollectedAll() {
    return this.Letters >= MAX_BONUS_LETTERS;
  },

  get TimerExpired() {
    return this.save.lastClaimed + this.settings.refreshTime * 1000 <= Date.now();
  },

  get CooldownLeft() {
    return Math.max(0, (this.save.lastClaimed + this.settings.refreshTime * 1000 - Date.now()) / 1000);
  },

  get ShouldShowButton() {
    return PlayerRank.IsBonusUnlocked && (this.save.lastClaimed > 0 || this.Letters > 0);
  },

  /** UI_ClaimBonusOverlay: `doubled` = the rewarded-video x2 option */
  Claim(doubled) {
    if (!this.CollectedAll) return 0;
    const amount = Math.round(this.settings.onClaim * (doubled ? this.settings.rvMultiplier : 1));
    this.save.lastClaimed = Date.now();
    Currencies.Bonus.Spend(this.Letters, 'Bonus');
    Currencies.Soft.Gain(amount, 'Bonus');
    Save.setDirty();
    this.onChanged.Raise();
    return amount;
  },
};
