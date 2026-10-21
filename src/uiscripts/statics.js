// Static state shared between ported UI scripts (C# static properties of different classes).
import { Tutorials } from '../meta/tutorials.js';

export const UIStatics = {
  /** MainMenuRankUpPopupOpener.IsOpenOrActive / WasPopBlocked */
  RankUpPopup: { IsOpenOrActive: false, WasPopBlocked: false },
  /** UI_RewardTrack.IsOpen */
  RewardTrackOpen: false,
  /** TutorialService.Instance.IsActive */
  TutorialActive: () => Tutorials.IsActive,
  /** the right world arrow (UnlockWorldTutorial target) */
  worldNextButton: null,
  /** TrailEffectPreview move in / out of the menu bike (set by the preview port) */
  vehicleMoveIn: null,
  vehicleMoveOut: null,
};
