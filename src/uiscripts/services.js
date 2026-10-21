// C#-named facades over the JS meta / game services, so the ported UI scripts read like the originals
// (PlayerRankManager.Instance.CurrentRank, CurrencyService.Instance.GetCurrency(...), AudioSampleID.X.Play()...).
import { EventAction } from '../engine/core.js';
import { Assets } from '../engine/assets.js';
import { getRuntimeSO } from '../engine/instantiate.js';
import { AudioService, AudioSampleID as SampleIDs } from '../engine/audio.js';
import { PlayerRank } from '../meta/rank.js';
import { Currencies, CurrencyType } from '../meta/currency.js';
import { WorldManager as Worlds, LevelUnlocks } from '../meta/worlds.js';
import { Save } from '../meta/save.js';
import { Game } from '../game/state.js';

// ---------------------------------------------------------------- audio

/** AudioSampleID.UI_ButtonClick_Generic.Play() */
export const AudioSampleID = {};
for (const [name, id] of Object.entries(SampleIDs)) {
  AudioSampleID[name] = {
    id,
    name,
    Play() {
      if (id) return AudioService.Play(id);
      return null;
    },
    PlayLooping() {
      return AudioService.PlayLooping?.(id);
    },
  };
}

// ---------------------------------------------------------------- PlayerRankManager

export const PlayerRankManager = {
  Initialized: new EventAction(),
  get Instance() {
    return PlayerRankManagerInstance;
  },
};

const PlayerRankManagerInstance = {
  get RankUp() {
    return PlayerRank.RankUp;
  },
  get ProgressChanged() {
    return PlayerRank.ProgressChanged;
  },
  get CurrentRank() {
    return PlayerRank.CurrentRank;
  },
  get NextRank() {
    return PlayerRank.IsMaxRank ? 0 : PlayerRank.CurrentRank + 1;
  },
  get IsMaxRank() {
    return PlayerRank.IsMaxRank;
  },
  get MaxRank() {
    return PlayerRank.MaxRank;
  },
  get HasRanksLeftToShow() {
    return PlayerRank.HasRanksLeftToShow;
  },
  get CurrentStarsRequired() {
    return PlayerRank.CurrentStarsRequired;
  },
  get CurrentStarsLeft() {
    return PlayerRank.CurrentStarsRequired - PlayerRank.state.currentRankStars;
  },
  get CurrentRankProgress() {
    return (this.CurrentStarsRequired - this.CurrentStarsLeft) / this.CurrentStarsRequired;
  },
  get LastPresentedRankInRewardTrack() {
    return PlayerRank.state.lastPresentedRankInRewardTrack ?? 0;
  },
  set LastPresentedRankInRewardTrack(v) {
    PlayerRank.state.lastPresentedRankInRewardTrack = v;
    Save.setDirty();
  },
  get State() {
    return PlayerRank.state;
  },
  get IsBonusUnlocked() {
    return PlayerRank.IsBonusUnlocked;
  },
  get ShouldAutoOpenChallengePopUp() {
    return PlayerRank.ShouldAutoOpenChallengePopUp;
  },
  get IsWorldNavigationUnlocked() {
    return PlayerRank.IsWorldNavigationUnlocked;
  },
  LastPresentedRank() {
    return PlayerRank.state.lastPresentedRank ?? 0;
  },
  UpPresentedRank() {
    PlayerRank.state.lastPresentedRank = (PlayerRank.state.lastPresentedRank ?? 0) + 1;
    Save.setDirty();
  },
  get rankRewardDictionary() {
    return PlayerRank.rankRewards;
  },
  GetAllRewards() {
    return PlayerRank.rankRewards;
  },
};

export const RankTrack = {
  get Instance() {
    return RankTrackInstance;
  },
};

const RankTrackInstance = {
  GetRankForWorldUnlock: (w) => PlayerRank.GetRankForWorldUnlock(w),
  GetRankForLevelDifficultyUnlock: (w, d) => PlayerRank.GetRankForLevelDifficultyUnlock(w, d),
  get track() {
    return PlayerRank.track;
  },
};

// ---------------------------------------------------------------- CurrencyService

class CurrencyIO {
  constructor(c) {
    this.c = c;
    this.OnChangeCallback = new EventAction();
    c.onChange.AddListener(() => this.OnChangeCallback.Raise());
  }

  get CurrentValue() {
    return this.c.value;
  }

  get Type() {
    return this.c.type;
  }

  ToLargeNumberString() {
    return toLargeNumberString(this.c.value);
  }

  CanSpend(n) {
    return this.c.CanSpend(n);
  }

  Spend(n, source) {
    return this.c.Spend(n, source);
  }

  Gain(n, source) {
    return this.c.Gain(n, source);
  }
}

const currencyIOs = new Map();

export const CurrencyService = {
  get Instance() {
    return CurrencyServiceInstance;
  },
};

const CurrencyServiceInstance = {
  IsInitialized: true,
  OnReloadState: new EventAction(),
  GetCurrency(type) {
    if (!currencyIOs.has(type)) currencyIOs.set(type, new CurrencyIO(Currencies.get(type)));
    return currencyIOs.get(type);
  },
  CanSpend(type, n) {
    return Currencies.get(type).CanSpend(n);
  },
};

export { CurrencyType };

/** Utilities.ToLargeNumberString: "N0" up to 5 digits */
export function toLargeNumberString(n) {
  n = Math.trunc(n);
  if (n > -9999 && n < 99999) return n.toLocaleString('en-US');
  const digits = String(Math.abs(n)).length - 1;
  const names = ['', '', '', 'K', 'K', 'K', 'M', 'M', 'M', 'B', 'B', 'B'];
  const group = Math.floor(digits / 3) * 3;
  return `${(n / 10 ** group).toFixed(3)} ${names[digits] || 'aa'}`;
}

// ---------------------------------------------------------------- WorldManager

export const WorldManager = {
  get Instance() {
    return WorldManagerInstance;
  },
};

const WorldManagerInstance = {
  WorldUnlocked: new EventAction(),
  CurrentWorldChanged: new EventAction(),
  get CurrentWorldIndex() {
    return Worlds.CurrentWorldIndex;
  },
  set CurrentWorldIndex(w) {
    this.SetCurrentWorld(w);
  },
  get HighestWorldIndex() {
    return Worlds.HighestWorldIndex;
  },
  get HighestWorldSelected() {
    return Save.data.world.highestSelected ?? 0;
  },
  get HasUnlockedNextWorld() {
    return Worlds.HighestUnlockedWorld() > this.HighestWorldSelected;
  },
  get HasUnseenWorld() {
    return Worlds.HasUnseenWorld;
  },
  IsWorldUnlocked: (w) => Worlds.IsWorldUnlocked(w),
  IsWorldComingSoon: (w) => Worlds.IsWorldComingSoon(w),
  HighestUnlockedWorld: () => Worlds.HighestUnlockedWorld(),
  SetCurrentWorld(w) {
    const prev = Worlds.CurrentWorldIndex;
    Worlds.SetCurrentWorld(w);
    if (prev !== Worlds.CurrentWorldIndex) this.CurrentWorldChanged.Raise(Worlds.CurrentWorldIndex);
  },
  SetUnlockedWorldSelected: (i) => Worlds.SetUnlockedWorldSelected(i),
  GetLastSentProgression(w) {
    return Save.data.world.lastSentProgression?.[w] ?? 0;
  },
  SetLastSentProgression(w, v) {
    if (!Save.data.world.lastSentProgression) Save.data.world.lastSentProgression = {};
    Save.data.world.lastSentProgression[w] = v;
    Save.setDirty();
  },
};

// ---------------------------------------------------------------- SettingsContainer

export const SettingsContainer = {
  get Instance() {
    return SettingsContainerInstance;
  },
};

const SettingsContainerInstance = {
  get WorldSettings() {
    return Assets.manifest.worlds.map((w) => getRuntimeSO(w.settings));
  },
  get CurrentWorldSettings() {
    return this.WorldSettings[Worlds.CurrentWorldIndex];
  },
  get WorldVisualSettings() {
    return this.CurrentWorldSettings?.visualSettings;
  },
  get endlessSettings() {
    return {
      EndlessSaveDataHandler: {
        get CurrentWorldHighScores() {
          return endlessHighScores(Worlds.CurrentWorldIndex);
        },
        HighScores: (w) => endlessHighScores(w),
      },
    };
  },
  get complimentSettings() {
    return getRuntimeSO('MonoBehaviour/ComplimentSettings');
  },
  get roadPieceSettings() {
    return getRuntimeSO('MonoBehaviour/RoadPieceSettings');
  },
};

/** EndlessSaveDataHandler HighScores of a world (+ the "new high score" flag of the last run) */
export function endlessHighScores(w) {
  const e = Save.endless(w);
  return {
    get highScore() {
      return e.highScore || 0;
    },
    get IsNewHighScore() {
      return !!UIState.lastRunNewBest && UIState.lastRunWorld === w;
    },
    get previousDistance() {
      return e.previousDistance || 0;
    },
    get distanceTraveled() {
      return e.distanceTraveled || 0;
    },
  };
}

/** app-level flags the UI scripts read (set by the scene flow) */
export const UIState = {
  lastRunNewBest: false,
  lastRunWorld: -1,
};

// ---------------------------------------------------------------- GameManager / MusicManager

export const GameManager = {
  get Instance() {
    return Game.manager || null;
  },
};

export const MusicManager = {
  get Instance() {
    return Game.music;
  },
};

export { LevelUnlocks, Save };

// ---------------------------------------------------------------- ChallengeManager

import { ChallengeManager as Challenges } from '../meta/challenges.js';

export const ChallengeManager = {
  get Instance() {
    return ChallengeManagerInstance;
  },
};

const ChallengeManagerInstance = {
  get OnChallengeStart() {
    return Challenges.OnChallengeStart;
  },
  get OnChallengeComplete() {
    return Challenges.OnChallengeComplete;
  },
  get OnChallengeClaimed() {
    return Challenges.OnChallengeClaimed;
  },
  get OnChallengeUpdate() {
    return Challenges.OnChallengeUpdate;
  },
  get OnActiveChallengeChanged() {
    return Challenges.OnActiveChallengeChanged;
  },
  get OnSlotUnlocked() {
    return Challenges.OnSlotUnlocked;
  },
  GetActiveRunningChallengesCount() {
    return Challenges.ActiveRunningCount;
  },
  GetActiveClaimableChallenges() {
    return Challenges.ClaimableCount;
  },
  /** WorldChallengesStatsResult */
  GetWorldChallengesStats(w) {
    const s = Challenges.WorldStats(w);
    return { WorldChallengesProgress: s.progress, WorldChallengesTotal: s.total };
  },
  get service() {
    return Challenges;
  },
};

// ---------------------------------------------------------------- TimedLevelModeController

export const TimedLevelModeDifficulty = { Easy: 0, Moderate: 1, Difficult: 2 };

export const TimedLevelModeController = {
  get Instance() {
    return TimedLevelControllerInstance;
  },
};

const TimedLevelControllerInstance = {
  get UnseenStateChanged() {
    return LevelUnlocks.UnseenChanged;
  },
  IsUnlocked(difficulty, world = Worlds.CurrentWorldIndex) {
    return LevelUnlocks.IsDifficultyUnlocked(world, difficulty);
  },
  GetUnseenDifficultiesCurrentWorld() {
    return LevelUnlocks.UnseenCount(Worlds.CurrentWorldIndex);
  },
  levels(world) {
    return Assets.manifest.levels.filter((l) => l.world === world);
  },
  GetWorldTotalStars(world) {
    return this.levels(world).length * 3;
  },
  GetWorldTotalStarsGained(world) {
    return this.levels(world).reduce((a, l) => a + (Save.level(l.id).stars || 0), 0);
  },
};

// ---------------------------------------------------------------- rewards / unlocks / cards

export const UnlockTypeEnum = { Invalid: 0, World: 1, LevelDifficultyEasy: 1000, LevelDifficultyMedium: 1001, LevelDifficultyHard: 1002 };

/** UnlockRewardAsset.UnlockRewardGiven(UnlockRewardDataType {unlockType, worldID}) */
export const UnlockRewardAsset = {
  UnlockRewardGiven: new EventAction(),
};
Worlds.UnlockRewardGiven.AddListener((d) => UnlockRewardAsset.UnlockRewardGiven.Raise({ unlockType: d?.type ?? 0, worldID: d?.world ?? 0, raw: d }));

import { CardService, Card, CardType, RANK_TYPES } from '../meta/cards.js';

/** VehicleCardCollection.OnUnlockedNewVehicle */
export const CardEvents = {
  OnUnlockedNewVehicle: new EventAction(),
};
const baseUnlock = Card.prototype.Unlock;
Card.prototype.Unlock = function (...a) {
  const had = this.HasSaveData;
  const r = baseUnlock.apply(this, a);
  if (!had && this.Type === CardType.Vehicle) CardEvents.OnUnlockedNewVehicle.Raise();
  return r;
};

/** CollectionProgress for WorldManager.GetWorldCollectionProgressPercentage (ranks unlocked / available) */
export function worldCollectionProgress(world) {
  let have = 0;
  let all = 0;
  for (const t of RANK_TYPES) {
    for (const c of CardService.ofType(t)) {
      if (c.UnlocksInWorldID !== world) continue;
      all += 4;
      if (c.IsUsable) have += c.HighestUnlockedRank + 1;
    }
  }
  return all ? have / all : 0;
}

Object.assign(WorldManagerInstance, {
  GetWorldEndlessProgressPercentage(w) {
    const hs = Save.endless(w).highScore || 0;
    // C#: the mastery of the *current* world is used for every world
    const mastery = SettingsContainerInstance.CurrentWorldSettings?.worldHighScoreMastery || 1;
    const a = Math.min(1, Math.max(0, hs / mastery));
    const s = ChallengeManagerInstance.GetWorldChallengesStats(w);
    const b = s.WorldChallengesTotal ? s.WorldChallengesProgress / s.WorldChallengesTotal : 0;
    return (a + b) * 0.5;
  },
  GetWorldTimedLevelProgressPercentage(w) {
    const total = TimedLevelControllerInstance.GetWorldTotalStars(w);
    return total ? TimedLevelControllerInstance.GetWorldTotalStarsGained(w) / total : 0;
  },
  GetWorldCollectionProgressPercentage: (w) => worldCollectionProgress(w),
});
Worlds.CurrentWorldChanged.AddListener((w) => WorldManagerInstance.CurrentWorldChanged.Raise(w));
Worlds.WorldUnlocked.AddListener((w) => WorldManagerInstance.WorldUnlocked.Raise(w));
// SetCurrentWorld raises through the meta event above
WorldManagerInstance.SetCurrentWorld = (w) => Worlds.SetCurrentWorld(w);

// ---------------------------------------------------------------- bonus letters

import { Bonus } from '../meta/bonus.js';

/** BonusModeSettings / EndlessModeChunkProcess bonus-letter state */
export const BonusState = {
  get ShouldShowBonusLetterButton() {
    return Bonus.ShouldShowButton;
  },
  get bonusCurrencyTimerExpired() {
    return Bonus.TimerExpired;
  },
  get IsUnlocked() {
    return PlayerRank.IsBonusUnlocked;
  },
  get CollectedAllBonusRideLetters() {
    return Bonus.CollectedAll;
  },
};
Object.defineProperty(CurrencyServiceInstance, 'BonusLetter', { get: () => CurrencyServiceInstance.GetCurrency(CurrencyType.Bonus) });
Object.defineProperty(SettingsContainerInstance, 'bonusSettings', {
  get: () => ({ ...BonusState, get ShouldShowBonusLetterButton() { return Bonus.ShouldShowButton; }, get bonusCurrencyTimerExpired() { return Bonus.TimerExpired; }, bonusModeState: { get IsUnlocked() { return PlayerRank.IsBonusUnlocked; } } }),
});
Object.defineProperty(SettingsContainerInstance, 'endlessChunkProcess', {
  get: () => ({ get CollectedAllBonusRideLetters() { return Bonus.CollectedAll; } }),
});

export { CardService, CardType, Bonus, Challenges };
