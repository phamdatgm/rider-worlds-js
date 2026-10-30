// Challenges UI: overlay on the home page, slot visuals, read-only progress popups, reset popup, reward items.
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { EventAction, WaitForSeconds, Time } from '../engine/core.js';
import { registerComponent, registerSO, ScriptableObject, Instantiate } from '../engine/instantiate.js';
import { Meta } from '../meta/data.js';
import { Currencies } from '../meta/currency.js';
import { Challenge, ChallengeState, ChallengeManager as Challenges, ResetReason } from '../meta/challenges.js';
import { Color } from '../ugui/graphic.js';
import { UISprites } from '../ugui/sprites.js';
import { InputUIBlocker } from '../ugui/events.js';
import { ev, localize, ParticleStarter, playFeedbacksAtOnce } from './common.js';
import { AudioSampleID, ChallengeManager, WorldManager, SettingsContainer, CurrencyType } from './services.js';
import { TransitionScreen } from './scenes.js';
import { MainMenuManager } from './home.js';
import { Ads } from '../ads.js';
import { Analytics } from '../analytics/index.js';
import { UIStatics } from './statics.js';

export const ChallengeType = { Timed: 0, World: 1 };

// ---------------------------------------------------------------- C# BaseChallenge surface on the meta challenges

Object.defineProperties(Challenge.prototype, {
  ChallengeState: {
    get() {
      return this.State;
    },
  },
  StartValue: {
    get() {
      return this.s?.start || 0;
    },
  },
  WorldIndex: {
    get() {
      return this.s?.world ?? -1;
    },
  },
  ChallengeType: {
    get() {
      return ChallengeType.World;
    },
  },
  IsTimedChallenge: {
    get() {
      return false;
    },
  },
  IsWorldChallenge: {
    get() {
      return true;
    },
  },
  IsHard: {
    get() {
      return !!this.def.hard;
    },
  },
  IsCompletedOrClaimed: {
    get() {
      return this.IsCompleted || this.IsClaimed;
    },
  },
  /** DirectedRewardDefinition[] (rewardType = UI_RewardType.Challenge) */
  RewardDefinitions: {
    get() {
      return this.Rewards.map((r) => ({ ...r, rewardID: r.id, extraData: r.extra, rewardType: 1 }));
    },
  },
  /** seconds */
  lockoutTimeRemaining: {
    get() {
      const s = this.s;
      if (!s) return 0;
      return s.lockout - (Date.now() - s.completeTime) / 1000;
    },
  },
  IsLockedOut: {
    get() {
      return this.State === ChallengeState.Claimed && this.lockoutTimeRemaining > 0;
    },
  },
  IsNewlySkippable: {
    get() {
      return this.IsActive && (this.s?.runs || 0) >= Meta.data.challenges.settings.allowSkipAfterRuns && !this.s?.hasSentSkipOfferedEvent;
    },
  },
});

Challenge.prototype.GetUiText = function (worldIndex = -1) {
  return String(this.def.text)
    .split('{[X]}')
    .join(this.def.x)
    .split('{[Y]}')
    .join(this.def.y)
    .split('{[Z]}')
    .join(this.def.z)
    .split('{[W]}')
    .join(worldIndex + 1);
};

Challenge.prototype.GetResetReason = function () {
  return this.ResetReason;
};

// ---------------------------------------------------------------- ChallengeSlot (ScriptableObject)

export class ChallengeSlot extends ScriptableObject {
  static typeName = 'ChallengeSlot';

  constructor() {
    super();
    this.id = 0;
    this.OnSlotAssigned = new EventAction();
  }

  get ID() {
    return this.id;
  }

  get IsUnlocked() {
    return Challenges.IsSlotUnlocked(this.id);
  }

  get AssignedChallenge() {
    return Challenges.slots[this.id] || null;
  }

  get HasAssignedChallenge() {
    return !!this.AssignedChallenge;
  }

  get SlotType() {
    return ChallengeType.World;
  }

  get IsWorldSlot() {
    return true;
  }
}
registerSO(ChallengeSlot, 'ChallengeSlot');

const slotSOs = [];
function slotFor(id) {
  if (!slotSOs[id]) {
    const s = new ChallengeSlot();
    s.id = id;
    slotSOs[id] = s;
  }
  return slotSOs[id];
}

const resetSettings = {
  get skipTimerHardCost() {
    return Meta.data.challenges.settings.skipTimerCost;
  },
  get skipChallengeHardCost() {
    return Meta.data.challenges.settings.skipChallengeCost;
  },
  get rerollHardCost() {
    return Meta.data.challenges.settings.skipChallengeCost;
  },
  get allowSkipAfterRuns() {
    return Meta.data.challenges.settings.allowSkipAfterRuns;
  },
};

Object.assign(ChallengeManager.Instance, {
  GetSlottedChallenges: () => Challenges.Slotted,
  GetChallengeSlot: (ch) => slotFor(Challenges.slots.indexOf(ch) >= 0 ? Challenges.slots.indexOf(ch) : ch?.s?.slot ?? 0),
  IsChallengeSlotUnlocked: (slot) => Challenges.IsSlotUnlocked(slot.id ?? slot),
  get Settings() {
    return resetSettings;
  },
  // refreshRVInterval is 0: the rewarded reset is always available
  CanUseAdForReroll: true,
  nextAdReRollTimer: 0,
  RVChallengeReset(ch) {
    if (ch && ch.ResetReason !== ResetReason.Invalid) Challenges.Reset(ch, true);
  },
  BuyChallengeReset(ch, cost) {
    if (!ch || ch.ResetReason === ResetReason.Invalid) return;
    if (!Currencies.Hard.CanSpend(cost)) return;
    Challenges.Reset(ch, false);
  },
  ClaimChallenge: (ch) => Challenges.Claim(ch),
});

/** ClaimChallengeTutorial (SO) state: the tutorial port lives elsewhere */
function tut(so) {
  return { IsStarted: !!so?.IsStarted, IsFinished: so?.IsFinished ?? true };
}

/** "mm:ss" / "hh:mm:ss" of a TimeSpan in seconds (TimeSpan.ToString custom formats) */
function timeSpan(seconds, withHours) {
  const s = Math.max(0, Math.floor(seconds));
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return withHours ? `${p(h)}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

// ---------------------------------------------------------------- reward item

const REWARD_SPRITES = { Currency_Soft: 'S_Icon_SoftCurrency', Currency_SoftRange: 'S_Icon_SoftCurrency', Currency_Hard: 'S_Icon_HardCurrency', Currency_HardRange: 'S_Icon_HardCurrency' };

export class UI_ChallengeRewardItem extends MonoBehaviour {
  static typeName = 'UI_ChallengeRewardItem';

  SetRewardUI(reward, isHard) {
    const id = reward.rewardID ?? reward.id;
    let sprite = null;
    if (id === 'Lootbox') {
      const box = Meta.data.lootboxes.boxes?.[reward.extraData ?? reward.extra];
      const art = box && Meta.data.lootboxes.art?.[box.type];
      if (art) sprite = UISprites.byName(art.small);
    } else if (id === 'Currency_Star') {
      sprite = isHard ? this.starRewardHardIcon : this.starRewardAsset?.visuals?.mainImage;
    } else if (REWARD_SPRITES[id]) sprite = UISprites.byName(REWARD_SPRITES[id]);
    if (sprite && this.rewardIcon) this.rewardIcon.sprite = sprite;
    this.rewardAmountText?.SetText(String(reward.amount));
  }
}

// ---------------------------------------------------------------- claim particle

export class UI_ChallengeClaimParticle extends MonoBehaviour {
  static typeName = 'UI_ChallengeClaimParticle';

  get SetParticleColor() {
    return this.setParticleColor;
  }

  Update() {
    const ps = this.uiParticleSystem;
    const alive = !!ps && (ps.playing || ps.particles?.length > 0);
    if (!alive && this.destroyOnParticleComplete) Destroy(this.gameObject);
  }
}

// ParticleStarter.StartColor (SetColor event target of the claim particle)
Object.defineProperty(ParticleStarter.prototype, 'StartColor', {
  get() {
    return Color.white;
  },
  set(c) {
    const col = Color.from(c);
    this.system?.SetColors?.({ minMaxState: 0, maxColor: [col.r, col.g, col.b, col.a] });
  },
  configurable: true,
});

// ---------------------------------------------------------------- slot visuals

export class UI_ChallengeSlotVisualsBase extends MonoBehaviour {
  static typeName = 'UI_ChallengeSlotVisualsBase';

  constructor() {
    super();
    this.challengeSlot = null;
    this.spawnedRewards = [];
  }

  get Fillbar() {
    return this.fillbar;
  }

  get AssignedChallenge() {
    return this.challengeSlot?.AssignedChallenge || null;
  }

  Initialize(slot) {
    this.challengeSlot = slot;
    this.UpdateChallenge();
  }

  OnEnable() {
    this.UpdateChallenge();
  }

  UpdateChallenge() {
    const s = this.challengeSlot;
    if (s && s.IsUnlocked && s.AssignedChallenge) this.UpdateBaseVisuals();
  }

  UpdateBaseVisuals() {
    const ch = this.AssignedChallenge;
    if (!ch) return;
    const w = ch.IsTimedChallenge ? ch.WorldIndex : WorldManager.Instance.CurrentWorldIndex;
    this.UpdateTexts(w);
    this.UpdateWorldColor(w);
    this.UpdateFillbar();
    this.UpdateRewards();
  }

  UpdateTexts(w) {
    const ch = this.AssignedChallenge;
    this.challengeDescription?.gameObject.SetActive(!ch.IsClaimed);
    if (this.challengeDescription) this.challengeDescription.text = ch.GetUiText(w);
  }

  UpdateWorldColor(w) {
    if (w === -1) {
      if (this.worldIcon) this.worldIcon.sprite = this.worldAnyIconAsset;
      return;
    }
    const vs = SettingsContainer.Instance.WorldSettings[w].visualSettings;
    const c = Color.from(vs.uiHighlightColor);
    if (this.worldIcon) this.worldIcon.sprite = vs.worldSelectIcon;
    if (this.fillbarBackground) this.fillbarBackground.color = c;
    if (this.fillbar?.fill) this.fillbar.fill.color = c;
  }

  UpdateFillbar() {
    const ch = this.AssignedChallenge;
    const st = ch.ChallengeState;
    this.fillbar?.gameObject.SetActive(st < ChallengeState.Claimed);
    if (st > ChallengeState.Completed || !this.fillbar) return;
    const active = this.fillbar.gameObject.activeInHierarchy;
    if (ch.IsCompleted) this.fillbar.SetFill(1, 0, 1, active);
    else if (ch.UseSteps && ch.GoalValue === 1) this.fillbar.SetFill(ch.CurrentStepValue, ch.StartValue, ch.StepGoal, ch.CurrentValue !== 0 && active);
    else this.fillbar.SetFill(ch.CurrentValue, ch.StartValue, ch.GoalValue, ch.CurrentValue !== 0 && active);
  }

  UpdateRewards() {
    for (const r of this.spawnedRewards) Destroy(r.gameObject);
    this.spawnedRewards.length = 0;
    const ch = this.AssignedChallenge;
    if (ch.ChallengeState > ChallengeState.Completed || !this.rewardPrefab || !this.spawnRewardsContainer) return;
    for (const r of ch.RewardDefinitions) {
      const item = Instantiate(this.rewardPrefab, this.spawnRewardsContainer.transform);
      item.SetRewardUI(r, ch.IsHard);
      this.spawnedRewards.push(item);
    }
  }
}

export class UI_ChallengeSlotVisualsReadOnly extends UI_ChallengeSlotVisualsBase {
  static typeName = 'UI_ChallengeSlotVisualsReadOnly';
}

export class UI_ChallengeSlotVisualsMainMenu extends UI_ChallengeSlotVisualsBase {
  static typeName = 'UI_ChallengeSlotVisualsMainMenu';

  get TutorialSocket() {
    return this.tutorialSocket;
  }

  Awake() {
    this.refreshButton?.onClick.AddListener(() => this.OpenChallengeResetPopup());
    this.skipButton?.onClick.AddListener(() => this.OpenChallengeResetPopup());
    this.rewardHandler = MainMenuManager.Instance?.RewardHandler;
    this._start = (ch) => this.OnChallengeStart(ch);
    ChallengeManager.Instance.OnChallengeStart.AddListener(this._start);
  }

  OnDestroy() {
    ChallengeManager.Instance.OnChallengeStart.RemoveListener(this._start);
  }

  Update() {
    const ch = this.challengeSlot?.AssignedChallenge;
    if (!ch || ch.ChallengeState !== ChallengeState.Claimed || Time.frameCount % 10 !== 0 || !this.timeLockedTxt) return;
    const rem = ch.lockoutTimeRemaining;
    const text = timeSpan(rem, rem + 1 >= 3600);
    if (this.timeLockedTxt.text !== text) this.timeLockedTxt.text = text;
  }

  OnChallengeStart(ch) {
    if (this.challengeSlot?.HasAssignedChallenge && this.challengeSlot.AssignedChallenge === ch && this.isActiveAndEnabled) this.StartCoroutine(this.AnimateNewChallenge());
  }

  *AnimateNewChallenge() {
    const a = this.slotAnimations;
    while (a?.IsAnimating) yield null;
    a?.PlayTransitionOut();
    while (a?.IsAnimating) yield null;
    this.UpdateChallenge();
    AudioSampleID.UI_ChallengeNew.Play();
    a?.PlayTransitionInNewChallenge();
  }

  UpdateChallenge() {
    super.UpdateChallenge();
    const s = this.challengeSlot;
    if (!s || !s.IsUnlocked) return;
    if (!s.AssignedChallenge) this.SetWorldComplete();
    else this.UpdateVisuals();
  }

  SetWorldComplete() {
    this.worldCompleteContainer?.SetActive(true);
    this.refreshButton?.gameObject.SetActive(false);
    this.skipButton?.gameObject.SetActive(false);
  }

  UpdateVisuals() {
    const ch = this.challengeSlot.AssignedChallenge;
    this.refreshButton?.gameObject.SetActive(false);
    this.skipButton?.gameObject.SetActive(false);
    if (ch.IsClaimed) this.SetTimedCooldown();
    else this.timeLockedContainer?.SetActive(false);
    this.skipButton?.gameObject.SetActive(!ch.IsCompleted && ch.CanBeSkipped);
    if (ch.IsNewlySkippable) ch.ensure().hasSentSkipOfferedEvent = true;
  }

  SetTimedCooldown() {
    this.timeLockedContainer?.SetActive(true);
    this.challengeDescription?.gameObject.SetActive(false);
    this.fillbar?.gameObject.SetActive(false);
    this.refreshButton?.gameObject.SetActive(true);
  }

  UpdateWorldColor(w) {
    super.UpdateWorldColor(w);
    if (w === -1) return;
    const vs = SettingsContainer.Instance.WorldSettings[w].visualSettings;
    const c = Color.from(vs.uiHighlightColor);
    const hard = this.challengeSlot.AssignedChallenge.IsHard;
    this.hardChallengeIcon?.gameObject.SetActive(hard);
    if (hard && this.barFiller) this.barFiller.color = c;
    if (this.hardChallengeIcon) this.hardChallengeIcon.color = c;
    if (this.worldCompleteGlow) this.worldCompleteGlow.color = c;
  }

  ClaimReward() {
    const a = this.slotAnimations;
    if (a?.IsAnimating) return;
    const ch = this.challengeSlot.AssignedChallenge;
    if (!ch) return;
    if (this.sparkParticlePrefab) {
      const canvas = this.GetComponentInParent('Canvas');
      const particle = Instantiate(this.sparkParticlePrefab, canvas.transform);
      particle.transform.position = this.transform.position;
      particle.SetParticleColor?.SetColorOverride(Color.from(SettingsContainer.Instance.WorldVisualSettings.uiHighlightColor));
    }
    a?.PlayTransitionOut();
    const defs = ch.RewardDefinitions;
    Challenges.Claim(ch);
    this.rewardHandler?.OverrideParticleStart(1, this.spawnRewardsContainer.transform);
    this.rewardHandler?.SpawnReward(defs);
    if (this.gameObject.activeSelf) this.StartCoroutine(this.AnimateToTimer(ch));
  }

  *AnimateToTimer() {
    while (this.slotAnimations?.IsAnimating) yield null;
    const s = this.challengeSlot;
    if (s.HasAssignedChallenge && s.AssignedChallenge.IsLockedOut) {
      this.UpdateChallenge();
      this.slotAnimations?.PlayTransitionIn();
    }
  }

  UpdateFillbar() {
    const self = this;
    this.StartCoroutine((function* () {
      const ch = self.challengeSlot?.AssignedChallenge;
      const fb = self.fillbar;
      if (!fb) return;
      if (ch && ch.IsCompleted) {
        fb.gameObject.SetActive(true);
        fb.SetFill(1, 0, 1, true);
        AudioSampleID.UI_ChallengeProgress.Play();
        self.StartCoroutine(self.PlayClaimableSound());
        self.challengeCompletedCheckmark?.SetActive(true);
      } else if (ch) {
        const claimed = ch.IsClaimed;
        fb.gameObject.SetActive(!claimed);
        if (!claimed) {
          const step = ch.UseSteps ? Math.min(1, Math.max(0, ch.StepProgress)) : 0;
          const v = step + ch.CurrentValue;
          fb.SetFill(Math.trunc(v), ch.StartValue, ch.GoalValue, true);
          if (v > 0) AudioSampleID.UI_ChallengeProgress.Play();
        }
      }
    })());
  }

  *PlayClaimableSound() {
    while (this.fillbar?.IsAnimating) yield null;
    AudioSampleID.UI_ChallengeClaimable.Play();
  }

  OpenChallengeResetPopup() {
    if (!this.challengeResetPopup) return;
    const popup = Instantiate(this.challengeResetPopup, MainMenuManager.Instance.popupTransform);
    popup.transform.SetSiblingIndex(1);
    popup.Initialize(this.challengeSlot.AssignedChallenge);
  }
}

export class UI_ChallengeSlotAnimations extends MonoBehaviour {
  static typeName = 'UI_ChallengeSlotAnimations';

  constructor() {
    super();
    this.CurrentAnimationState = 0;
  }

  get IsAnimating() {
    return !!(this.transitionInFeedbacks?.IsPlaying || this.transitionOutFeedbacks?.IsPlaying || this.transitionInNewChallengeFeedbacks?.IsPlaying);
  }

  Awake() {
    this.startPosition = this.transform.localPosition;
    const reset = () => (this.CurrentAnimationState = 0);
    for (const f of [this.transitionInFeedbacks, this.transitionOutFeedbacks, this.transitionInNewChallengeFeedbacks]) f?.Events?.OnComplete?.AddListener(reset);
  }

  OnEnable() {
    if (this.startPosition) this.transform.localPosition = this.startPosition;
    if (this.canvasGroup) this.canvasGroup.alpha = 1;
    this.challengePopup?.SetActive(false);
  }

  PlayTransitionIn() {
    this.CurrentAnimationState = 1;
    this.transitionInFeedbacks?.PlayFeedbacks();
  }

  PlayTransitionOut() {
    this.CurrentAnimationState = 2;
    this.transitionOutFeedbacks?.PlayFeedbacks();
  }

  PlayTransitionInNewChallenge() {
    this.CurrentAnimationState = 3;
    this.transitionInNewChallengeFeedbacks?.PlayFeedbacks();
  }
}

// ---------------------------------------------------------------- slot container

export class UI_ChallengeSlotContainer extends MonoBehaviour {
  static typeName = 'UI_ChallengeSlotContainer';

  constructor() {
    super();
    this.hideOnCompleted = 0;
    this.slotSetups = [];
  }

  get SlotSetups() {
    return this.setups || [];
  }

  Awake() {
    // [Serializable] SlotSetup {slot (ChallengeSlot SO), visuals}; the slot SOs are shared per id
    this.setups = (this.slotSetups || []).map((s) => ({ slot: slotFor(s.slot?.id ?? 0), visuals: s.visuals, get mainMenuVisuals() { return s.visuals; } }));
    this._vis = () => this.UpdateSlotVisibility();
    const m = ChallengeManager.Instance;
    m.OnSlotUnlocked.AddListener(this._vis);
    m.OnChallengeStart.AddListener(this._vis);
    m.OnChallengeComplete.AddListener(this._vis);
    // OnChallengeDone: slots are re-assigned through UpdateChallengeSlots (OnChallengeUpdate)
    m.OnChallengeUpdate.AddListener(this._vis);
    for (const s of this.setups) s.visuals?.Initialize(s.slot);
    this.UpdateSlotVisibility();
  }

  OnEnable() {
    if (this.setups) this.UpdateSlotVisibility();
  }

  OnDestroy() {
    const m = ChallengeManager.Instance;
    m.OnSlotUnlocked.RemoveListener(this._vis);
    m.OnChallengeStart.RemoveListener(this._vis);
    m.OnChallengeComplete.RemoveListener(this._vis);
    m.OnChallengeUpdate.RemoveListener(this._vis);
  }

  UpdateAvailableChallenges() {
    this.UpdateSlotVisibility();
  }

  UpdateSlotVisibility() {
    for (const s of this.setups || []) {
      const slot = s.slot;
      if (!s.visuals) continue;
      if (this.hideOnCompleted && slot.HasAssignedChallenge && slot.AssignedChallenge.ChallengeState >= ChallengeState.Completed) s.visuals.gameObject.SetActive(false);
      else s.visuals.gameObject.SetActive(slot.IsUnlocked && !!slot.AssignedChallenge);
    }
  }
}

// ---------------------------------------------------------------- overlay

export class UI_ChallengeOverlay extends MonoBehaviour {
  static typeName = 'UI_ChallengeOverlay';

  constructor() {
    super();
    this.OnOpen = new EventAction();
    this.OnClose = new EventAction();
    this.delayStartClaims = 0.5;
    this.delayBetweenClaims = 0.5;
    this.isTransitioningIn = false;
    this.isTransitioningOut = false;
    this.IsAutoClaiming = false;
    this._co = null;
  }

  OnDeserialize() {
    this.OnOpen = ev(this.OnOpen);
    this.OnClose = ev(this.OnClose);
  }

  get IsOpen() {
    return this.gameObject.activeSelf;
  }

  get IsTransitioning() {
    return this.isTransitioningIn || this.isTransitioningOut;
  }

  /** a routine that ends inside StartCoroutine (nothing to wait for or claim) has already cleared _co: keep it clear */
  StartRoutine(gen) {
    const co = this.StartCoroutine(gen);
    return co?.done ? null : co;
  }

  Awake() {
    this.closeBtn?.onClick.AddListener(() => this.TryClose());
    this._complete = () => this.OnChallengeComplete();
    ChallengeManager.Instance.OnChallengeComplete.AddListener(this._complete);
    this.UpdateWorldChallengesProgress();
  }

  OnDestroy() {
    ChallengeManager.Instance.OnChallengeComplete.RemoveListener(this._complete);
  }

  OnChallengeComplete() {
    if (this.IsOpen && !this._co) {
      this._co = this.StartRoutine(this.AutoClaim());
      this.UpdateWorldChallengesProgress();
    }
  }

  TryOpen(instant = false) {
    if (this._co) return false;
    this.gameObject.SetActive(true);
    this.headerText?.SetText(localize(this.headerString).split('{[0]}').join(String(WorldManager.Instance.CurrentWorldIndex + 1)));
    this.SetVisuals(SettingsContainer.Instance.WorldVisualSettings);
    // opens at once (owner's request): the transition lands on its end state, no 0.2 s wait before the auto claim
    playFeedbacksAtOnce(this.transitionFeedbackIn);
    for (const a of this.GetComponentsInChildren('DOTweenAnimation')) a.DOPlayForward();
    this.IsAutoClaiming = this.container.SlotSetups.some((s) => s.slot.HasAssignedChallenge && s.slot.AssignedChallenge.IsCompleted);
    if (this.IsAutoClaiming) InputUIBlocker.DisableInput();
    this._co = this.StartRoutine(this.WaitForOpen(true));
    this.OnOpen.Invoke();
    return true;
  }

  get container() {
    return this.challengeSlotContainer;
  }

  ParentMenuOpened() {
    if (this.isTransitioningIn) this.TryOpen(false);
    else if (this.isTransitioningOut) this.isTransitioningOut = false;
  }

  OnDisable() {
    if (this.transitionFeedbackIn?.IsPlaying) this.transitionFeedbackIn.StopFeedbacks();
    if (this.transitionFeedbackOut?.IsPlaying) this.transitionFeedbackOut.StopFeedbacks();
    this._co = null;
  }

  SetVisuals(vs) {
    const c = Color.from(vs.uiHighlightColor);
    for (const img of [this.popupBackground, this.backroundImage, this.topBannerImage]) if (img) img.color = new Color(c.r, c.g, c.b, img.color.a);
  }

  UpdateWorldChallengesProgress() {
    const s = ChallengeManager.Instance.GetWorldChallengesStats(WorldManager.Instance.CurrentWorldIndex);
    this.worldProgressionText?.SetText(`${Math.min(s.WorldChallengesProgress, s.WorldChallengesTotal)}/${s.WorldChallengesTotal}`);
  }

  // closes at once (owner's request) instead of playing transitionFeedbackOut and the tweens backwards; the tweens
  // are rewound to where playing them backwards ends, so the next open plays them forward again. transitionFeedbackOut
  // still lands on its end state: it brings back the High Score display that transitionFeedbackIn faded out (and with
  // it the leaderboard button, src/portal.js)
  TryClose() {
    if (this._co || !this.isActiveAndEnabled) return false;
    playFeedbacksAtOnce(this.transitionFeedbackOut);
    for (const a of this.GetComponentsInChildren('DOTweenAnimation')) a.DORewind();
    this.OnClose.Invoke();
    this.gameObject.SetActive(false);
    return true;
  }

  *WaitForOpen(instant) {
    this.isTransitioningIn = true;
    if (!instant) yield new WaitForSeconds(this.transitionFeedbackIn?.TotalDuration ?? 0);
    this.isTransitioningIn = false;
    yield* this.AutoClaim();
  }

  *AutoClaim() {
    this.IsAutoClaiming = true;
    while (TransitionScreen.Instance?.IsTransitioning) yield null;
    const t = tut(this.tutorial);
    if (t.IsStarted) while (!tut(this.tutorial).IsFinished) yield null;
    let first = false;
    for (const s of this.container.SlotSetups) {
      if (s.slot.HasAssignedChallenge && s.slot.AssignedChallenge.IsCompleted) {
        if (!first) {
          yield new WaitForSeconds(this.delayStartClaims);
          first = true;
        }
        s.visuals.ClaimReward?.();
        yield new WaitForSeconds(this.delayBetweenClaims);
      }
    }
    this.IsAutoClaiming = false;
    InputUIBlocker.EnableInput();
    this._co = null;
  }
}

// ---------------------------------------------------------------- read-only progress popups on the home page

export class UI_ChallengeMainMenuPopupHandler extends MonoBehaviour {
  static typeName = 'UI_ChallengeMainMenuPopupHandler';

  constructor() {
    super();
    this.spawnDelay = 0.5;
    this.currentSpawnDelay = 0;
    this.popupsToSpawn = [];
  }

  Start() {
    this._co = this.StartCoroutine(this.TryShowPopups());
  }

  Update() {
    if (this.currentSpawnDelay > 0) this.currentSpawnDelay -= Time.deltaTime;
    if (this.currentSpawnDelay <= 0 && this.popupsToSpawn.length) {
      const p = this.popupsToSpawn.shift();
      this.currentSpawnDelay = this.spawnDelay;
      p.gameObject.SetActive(true);
    }
  }

  OnDisable() {
    if (this._co) this.StopCoroutine(this._co);
    this._co = null;
    this.Clear();
  }

  OnDestroy() {
    this.Clear();
  }

  Clear() {
    this.container?.transform.DestroyChildren();
    for (const p of this.popupsToSpawn) Destroy(p.gameObject);
    this.popupsToSpawn.length = 0;
  }

  SpawnPopup() {
    const p = Instantiate(this.popupPrefab, this.container.transform);
    p.gameObject.SetActive(false);
    this.popupsToSpawn.push(p);
    return p;
  }

  *TryShowPopups() {
    yield null;
    if (UIStatics.TutorialActive() || MainMenuManager.Instance?.HomeScreenManager?.challengeDisplay?.IsOpen) return;
    const slotted = ChallengeManager.Instance.GetSlottedChallenges();
    if (slotted.some((c) => c.IsCompleted)) return;
    for (const ch of slotted) if (!ch.IsClaimed && ch.Progress !== 0) this.SpawnPopup().Initialize(ChallengeManager.Instance.GetChallengeSlot(ch));
    this._co = null;
  }
}

// ---------------------------------------------------------------- reset / skip popup

export class UI_ChallengeResetPopup extends MonoBehaviour {
  static typeName = 'UI_ChallengeResetPopup';

  constructor() {
    super();
    this.updateTimer = 0;
    this.cost = 0;
  }

  Initialize(challenge) {
    if (!challenge) {
      this.OnPressedQuit();
      return;
    }
    this.challenge = challenge;
    const m = ChallengeManager.Instance;
    this.quitButton?.onClick.AddListener(() => this.OnPressedQuit());
    this.backgroundButton?.onClick.AddListener(() => this.OnPressedQuit());
    this.buyAdButton?.onClick.AddListener(() => this.OnBuyAd());
    this.buyCurrencyButton?.onClick.AddListener(() => this.OnBuyCurrency());
    switch (challenge.GetResetReason()) {
      case ResetReason.TimerSkip:
        this.cost = m.Settings.skipTimerHardCost;
        if (this.headerTxt) this.headerTxt.text = localize(this.refreshHeaderText);
        break;
      case ResetReason.ChallengeSkip:
        this.cost = m.Settings.skipChallengeHardCost;
        if (this.headerTxt) this.headerTxt.text = localize(this.skipHeaderText);
        break;
      default:
        this.cost = m.Settings.rerollHardCost;
        if (this.headerTxt) this.headerTxt.text = localize(this.rerollHeaderText);
    }
    if (this.currencyBtnTxt) this.currencyBtnTxt.text = String(this.cost);
    Analytics.adOffer('challenge_skip');
  }

  Update() {
    this.updateTimer -= Time.deltaTime;
    if (this.updateTimer > 0) return;
    const m = ChallengeManager.Instance;
    const can = m.CanUseAdForReroll;
    if (this.buyAdButton) this.buyAdButton.interactable = can;
    if (this.adBtnIcon && this.buyAdButton) this.adBtnIcon.color = can ? this.buyAdButton.colors.normalColor : this.buyAdButton.colors.disabledColor;
    this.adTimerTxt?.gameObject.SetActive(!can);
    if (!can && this.adTimerTxt) this.adTimerTxt.text = timeSpan(m.nextAdReRollTimer, false);
    this.updateTimer = 1;
  }

  OnPressedQuit() {
    Destroy(this.gameObject);
  }

  OnBuyAd() {
    Ads.watch(
      'challenge_skip',
      () => {
        ChallengeManager.Instance.RVChallengeReset(this.challenge);
        this.OnPressedQuit();
      },
      this,
    );
  }

  OnBuyCurrency() {
    if (Currencies.Hard.CanSpend(this.cost)) {
      ChallengeManager.Instance.BuyChallengeReset(this.challenge, this.cost);
      this.OnPressedQuit();
    } else MainMenuManager.ShowNotEnoughCurrencyPopUp(CurrencyType.Hard);
  }
}

for (const cls of [
  UI_ChallengeRewardItem,
  UI_ChallengeClaimParticle,
  UI_ChallengeSlotVisualsBase,
  UI_ChallengeSlotVisualsReadOnly,
  UI_ChallengeSlotVisualsMainMenu,
  UI_ChallengeSlotAnimations,
  UI_ChallengeSlotContainer,
  UI_ChallengeOverlay,
  UI_ChallengeMainMenuPopupHandler,
  UI_ChallengeResetPopup,
])
  registerComponent(cls);

void THREE;
