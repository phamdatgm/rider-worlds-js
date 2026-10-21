// RunsTracker (RunState.AnalyticsRunsTracker): lifetime and per-session run counters, saved under "RunsTracker".
import { Time } from '../engine/core.js';
import { Save } from './save.js';

function state() {
  let s = Save.data.runsTracker;
  if (!s) {
    // older saves only kept { total, endless, levels }
    const old = Save.data.runs || {};
    s = Save.data.runsTracker = {
      countEndless: old.endless || 0,
      countFirstTutorialFailed: 0,
      secondsPlayed: 0,
      nextLoggedMinute: 0,
      endlessSecondsPlayed: 0,
      countTimedLevels: old.levels || 0,
      session: { sessionID: 0, countEndless: 0, countTimedLevels: 0 },
    };
  }
  s.session ||= { sessionID: 0, countEndless: 0, countTimedLevels: 0 };
  return s;
}

export const RunsTracker = {
  get SessionID() {
    return state().session.sessionID;
  },
  get CountLifetimeEndless() {
    return state().countEndless;
  },
  get CountLifetimeLevels() {
    return state().countTimedLevels;
  },
  get CountLifetimeTimedLevels() {
    return state().countTimedLevels;
  },
  get TotalRunsPlayed() {
    const s = state();
    return s.countEndless - s.countFirstTutorialFailed;
  },
  get CountSessionEndless() {
    return state().session.countEndless;
  },
  get CountSessionTimedLevels() {
    return state().session.countTimedLevels;
  },
  get SecondsPlayedLifetimeEndless() {
    return state().endlessSecondsPlayed;
  },

  /** LoadSaveDataWrapper: every load starts a new session */
  NewSession() {
    const s = state();
    const prev = s.session.sessionID;
    s.session = { sessionID: prev + 1, countEndless: 0, countTimedLevels: 0 };
    Save.setDirty();
  },

  AddEndlessRun() {
    const s = state();
    s.countEndless++;
    s.session.countEndless++;
    Save.setDirty();
  },

  AddFailedFirstRun() {
    state().countFirstTutorialFailed++;
    Save.setDirty();
  },

  AddEndlessRunTime() {
    state().endlessSecondsPlayed += Time.unscaledDeltaTime;
    Save.setDirty();
  },

  AddTimedLevelRun() {
    const s = state();
    s.countTimedLevels++;
    s.session.countTimedLevels++;
    Save.setDirty();
  },
};
