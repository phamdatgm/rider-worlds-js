// Hooks the gameplay code calls into the UI layer (filled in by the uGUI HUD scripts).
export const UI = {
  /** revive offer: answer(kind) with 'free' | 'paid' | 'no' */
  showRevive(offer, answer) {
    answer('no');
  },
  *fadeToBlack() {},
  *fadeFromBlack() {},
  flash() {},
  /** timed level finished (results are shown by the level menu after returning to it) */
  showResults() {},
  jumpText() {},
  jumpFailed() {},
  timeReduced() {},
  show() {},
  hide() {},
};
