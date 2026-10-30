// WorldManager (world unlocks/selection) + TimedLevelModeController difficulty unlocks.
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';
import { Meta } from './data.js';

export const UnlockType = { Invalid: 0, World: 1, LevelDifficultyEasy: 1000, LevelDifficultyMedium: 1001, LevelDifficultyHard: 1002 };

/** UnlockRewardData "type;world;slot" */
export function parseUnlock(extra) {
  const p = String(extra || '').split(';');
  if (p.length !== 3) return { type: 0, world: 0, slot: 0 };
  return { type: Number(p[0]) | 0, world: Number(p[1]) | 0, slot: Number(p[2]) | 0 };
}

export const WorldManager = {
  CurrentWorldChanged: new EventAction(),
  WorldUnlocked: new EventAction(),
  UnlockRewardGiven: new EventAction(),

  get count() {
    return Meta.data.worlds.length;
  },

  /** last playable world: trailing "coming soon" worlds are not offered (the game ships with two worlds) */
  get HighestWorldIndex() {
    let n = this.count - 1;
    while (n > 0 && this.IsWorldComingSoon(n)) n--;
    return n;
  },

  get CurrentWorldIndex() {
    return Save.data.world.selected || 0;
  },

  /** a locked world being browsed (the UI sets it; -1: none). Runs never start there, but its vehicles are shown. */
  BrowsedWorldIndex: -1,

  /** the world whose equipped cards are shown: a browsed locked world, else the current world */
  get ShownWorldIndex() {
    return this.BrowsedWorldIndex >= 0 ? this.BrowsedWorldIndex : this.CurrentWorldIndex;
  },

  HighestUnlockedWorld() {
    return Math.min(Save.data.world.highestUnlocked || 0, this.HighestWorldIndex);
  },

  IsWorldUnlocked(w) {
    return w >= 0 && w < this.count && this.HighestUnlockedWorld() >= w;
  },

  IsWorldComingSoon(w) {
    return !!Meta.data.worlds[w]?.comingSoon;
  },

  SetCurrentWorld(w) {
    if (!this.IsWorldUnlocked(w) || w === this.CurrentWorldIndex) return;
    Save.data.world.selected = w;
    Save.setDirty();
    this.CurrentWorldChanged.Raise(w);
  },

  SetUnlockedWorldSelected(i) {
    if (Save.data.world.highestSelected < i && this.HighestUnlockedWorld() >= i) {
      Save.data.world.highestSelected = i;
      Save.setDirty();
    }
  },

  get HasUnseenWorld() {
    return (Save.data.world.highestSelected || 0) < this.HighestUnlockedWorld();
  },

  /** UnlockRewardAsset.OnGain */
  GiveUnlock(data) {
    if (data.type === UnlockType.World) {
      const n = Math.max(0, Math.min(data.world, this.HighestWorldIndex));
      for (let i = Save.data.world.highestUnlocked; i <= n; i++) {
        if (i > Save.data.world.highestUnlocked) {
          Save.data.world.highestUnlocked = i;
          this.WorldUnlocked.Raise(i);
        }
      }
    } else if (data.type >= 1000 && data.type <= 1002) {
      LevelUnlocks.UnlockDifficulty(data.world, data.type - 1000);
    }
    Save.setDirty();
    this.UnlockRewardGiven.Raise(data);
  },
};

export const LevelUnlocks = {
  UnseenChanged: new EventAction(),

  state(world) {
    return (Save.data.levelUnlocks[world] ||= { unlocked: [false, false, false], seen: [false, false, false] });
  },

  IsDifficultyUnlocked(world, d) {
    return !!this.state(world).unlocked[d];
  },

  UnlockDifficulty(world, d) {
    this.state(world).unlocked[d] = true;
    Save.setDirty();
    this.UnseenChanged.Raise();
  },

  SetSeen(world, d) {
    const s = this.state(world);
    if (s.unlocked[d] && !s.seen[d]) {
      s.seen[d] = true;
      Save.setDirty();
      this.UnseenChanged.Raise();
    }
  },

  UnseenCount(world) {
    const s = this.state(world);
    return [0, 1, 2].filter((d) => s.unlocked[d] && !s.seen[d]).length;
  },

  IsLevelUnlocked(level) {
    return this.IsDifficultyUnlocked(level.world, level.difficulty);
  },
};
