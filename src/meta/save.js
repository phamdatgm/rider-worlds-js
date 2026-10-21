// Persistent save (localStorage). One JSON document holding what the Unity build kept in its save slots
// (currencies, cards, rank, reward tracks, challenges, worlds, levels, high scores, tutorials, settings).

const SAVE_KEY = 'rider-worlds-save-v2';
const OLD_KEY = 'rider-worlds-save-v1';

function defaults() {
  return {
    version: 2,
    currency: { soft: 0, hard: 0, star: 0, bonus: 0 },
    settings: { music: true, sfx: true, bloom: true },
    world: { selected: 0, highestUnlocked: 0, highestSelected: 0 },
    endless: {}, // world -> HighScores
    levels: {}, // level id -> { stars, best, attempts }
    levelUnlocks: {}, // world -> { unlocked: [e, m, d], seen: [e, m, d] }
    cards: null, // filled by CardService.createNewSaveData()
    rank: { currentRank: 0, lastPresentedRank: 0, currentRankStars: 0, totalRankStars: 0, lastPresentedRankInRewardTrack: 0, hasSeenRewardTrack: false, rankCardMap: {} },
    tracks: {}, // track uid -> { progress, claimed: [] }
    rvTrackDay: '',
    challenges: null,
    runEarnings: null, // pending run rewards, claimed when the menu opens
    tutorials: {},
    boosters: {},
    bonus: null,
    shop: null,
    dailyLootbox: null,
    runs: { total: 0, endless: 0 },
  };
}

export const Save = {
  data: defaults(),
  dirty: false,

  load() {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s) {
        const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
        if (old) s = migrateV1(old);
      }
    } catch {
      /* private mode / corrupted */
    }
    const d = defaults();
    if (s) {
      for (const k of Object.keys(s)) d[k] = s[k];
      d.currency = { ...defaults().currency, ...(s.currency || {}) };
      d.settings = { ...defaults().settings, ...(s.settings || {}) };
      d.world = { ...defaults().world, ...(s.world || {}) };
      d.rank = { ...defaults().rank, ...(s.rank || {}) };
    }
    this.data = d;
  },

  save() {
    this.dirty = false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  },

  /** batch writes: flushed at the end of the frame */
  setDirty() {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => this.dirty && this.save());
  },

  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(OLD_KEY);
    } catch {
      /* ignore */
    }
    this.data = defaults();
  },

  /** progress of a level; `write` creates the entry */
  level(id, write = false) {
    const l = this.data.levels[id];
    if (l || !write) return l || { stars: 0, best: -1, attempts: 0 };
    return (this.data.levels[id] = { stars: 0, best: -1, attempts: 0 });
  },

  /** EndlessModeSaveData HighScores of a world */
  endless(world) {
    return (this.data.endless[world] ||= {
      highScore: 0, lastScore: 0, softCurrency: 0, hardCurrency: 0, bonusLetterCurrency: 0, jumps: 0, flips: 0,
      airtime: 0, distanceTraveled: 0, distanceTraveledOnRoad: 0, chunksPassed: 0, runs: 0, daily: null,
    });
  },
};

function migrateV1(old) {
  const d = defaults();
  d.currency.soft = old.gems || 0;
  d.settings = { ...d.settings, ...(old.settings || {}) };
  d.world.selected = old.world || 0;
  d.levels = old.levels || {};
  for (const [w, e] of Object.entries(old.endless || {})) {
    d.endless[w] = { ...Save.endless.call({ data: d }, w), highScore: e.score || 0, distanceTraveled: e.distance || 0, runs: e.runs || 0 };
  }
  return d;
}
