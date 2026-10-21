// PlayerRankManager (stars -> rank) + RankTrack (rank-up rewards, world/difficulty unlocks).
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Meta } from './data.js';
import { Currencies } from './currency.js';
import { RewardTrack } from './rewards.js';
import { parseUnlock } from './worlds.js';

export const PlayerRank = {
  RankUp: new EventAction(), // (newRank)
  ProgressChanged: new EventAction(),
  track: null,
  /** rank (0-based) -> rewards granted at that rank (for popups / reward track screen) */
  rankRewards: new Map(),
  /** results of the last rank-ups, by rank: [{def, result}] (rank popup shows the actual random cards) */
  grantedByRank: new Map(),

  init() {
    this.track = new RewardTrack('PlayerStarCollection', Meta.data.rankTrack);
    this.rankRewards.clear();
    for (const st of this.track.steps) {
      if (!this.rankRewards.has(st.required)) this.rankRewards.set(st.required, []);
      this.rankRewards.get(st.required).push(st);
    }
    this.lastStar = Currencies.Star.value;
    Currencies.Star.onChange.AddListener((v, prev) => {
      const d = v - prev;
      if (d > 0) this.AddStars(d);
    });
  },

  get settings() {
    return Meta.data.rank;
  },

  get state() {
    return Save.data.rank;
  },

  get CurrentRank() {
    return this.state.currentRank;
  },

  get MaxRank() {
    return this.settings.maxRank - 1;
  },

  get IsMaxRank() {
    return this.CurrentRank >= this.MaxRank;
  },

  StarsRequired(rank) {
    const s = this.settings.stars;
    if (rank >= this.settings.maxRank) return Infinity;
    return rank < s.length ? s[rank] : s[s.length - 1];
  },

  get CurrentStarsRequired() {
    return this.StarsRequired(this.CurrentRank);
  },

  get CurrentRankStars() {
    return this.state.currentRankStars;
  },

  get CurrentRankProgress() {
    return this.IsMaxRank ? 1 : Math.min(1, this.state.currentRankStars / this.CurrentStarsRequired);
  },

  get IsBonusUnlocked() {
    return this.CurrentRank >= this.settings.bonusUnlockRank;
  },

  get IsWorldNavigationUnlocked() {
    return this.CurrentRank >= this.settings.worldNavigationUnlockRank;
  },

  get ShouldAutoOpenChallengePopUp() {
    return this.CurrentRank < this.settings.openChallengePopUpAutoUntilRank;
  },

  get HasRanksLeftToShow() {
    return this.CurrentRank > this.state.lastPresentedRank;
  },

  AddStars(n) {
    const st = this.state;
    st.totalRankStars += n;
    st.currentRankStars += n;
    while (!this.IsMaxRank && st.currentRankStars >= this.CurrentStarsRequired) {
      st.currentRankStars -= this.CurrentStarsRequired;
      st.currentRank++;
      Save.setDirty();
      this.OnRankChanged();
      this.RankUp.Raise(st.currentRank);
    }
    Save.setDirty();
    this.ProgressChanged.Raise();
  },

  /** RankTrack.OnRankChanged: progress = CurrentRank (HighScore), every unclaimed step is claimed now */
  OnRankChanged() {
    this.track.HandleProgress(this.CurrentRank);
    for (const step of this.track.UnclaimedSteps) {
      const r = this.track.ClaimReward(step, 'Rank');
      if (!r) continue;
      const rank = step.required;
      if (!this.grantedByRank.has(rank)) this.grantedByRank.set(rank, []);
      this.grantedByRank.get(rank).push(r);
      if (step.id === 'Unlock Random Card' && r.card) this.state.rankCardMap[rank] = r.card.ID;
    }
  },

  /** displayed rank (1-based) needed for an unlock, 0 = none */
  GetRankForUnlock(fn) {
    for (const st of this.track.steps) {
      if (st.id !== this.settings.rankUnlockId) continue;
      if (fn(parseUnlock(st.extra))) return st.required + 1;
    }
    return 0;
  },

  GetRankForWorldUnlock(w) {
    return this.GetRankForUnlock((d) => d.world === w && d.type === 1) || this.GetRankForUnlock((d) => d.world === w);
  },

  GetRankForLevelDifficultyUnlock(w, diff) {
    return this.GetRankForUnlock((d) => d.world === w && d.type === 1000 + diff);
  },
};
