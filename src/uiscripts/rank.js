// Player rank-up popup, reward track (PopUps/RewardTrack in Menu.unity), bonus letter claim overlay and
// small popups (quit bonus ride, no ad).
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { EventAction, WaitForSeconds, Time } from '../engine/core.js';
import { registerComponent, Instantiate, ComponentRegistry, PrefabRef } from '../engine/instantiate.js';
import { AnimationCurve } from '../engine/math.js';
import { Meta } from '../meta/data.js';
import { Bonus } from '../meta/bonus.js';
import { Currencies } from '../meta/currency.js';
import { CardService, CardType } from '../meta/cards.js';
import { PlayerRank } from '../meta/rank.js';
import { UISystem } from '../ugui/canvas.js';
import { InputUIBlocker } from '../ugui/events.js';
import { Color } from '../ugui/graphic.js';
import { localize, UI_OverlayBase } from './common.js';
import { PlayerRankManager, SettingsContainer, UnlockTypeEnum, AudioSampleID } from './services.js';
import { UIStatics } from './statics.js';
import { rewardDefinition, rewardAsset, CurrencyHelper, SkippableMMFeedback, unlockExtraData, localizeSingular, locReplace, UIInput } from './rewards.js';
import { Ads } from '../ads.js';
import { Analytics } from '../analytics/index.js';
import { MainMenuManager } from './home.js';

/** rewards granted at a rank (rankRewardDictionary[rank]) as DirectedRewardDefinitions */
function rankRewards(rank) {
  return (PlayerRank.rankRewards.get(rank) || []).map(rewardDefinition);
}

/** CanAssignReward of a reward component referenced on a prefab (evaluated on its serialized data) */
function prefabCanAssign(prefabRef, reward, asset) {
  const fb = prefabRef?.data;
  const ref = fb?.rankUpRewardComponent?.$c;
  if (!ref) return false;
  const cd = prefabRef.json.nodes[ref[0]]?.c?.[ref[1]];
  const Cls = cd && ComponentRegistry.get(cd.$type);
  if (!Cls) return false;
  const probe = new Cls();
  for (const k of ['rewardIDs', 'features']) if (k in cd) probe[k] = cd[k];
  return !!probe.CanAssignReward(reward, asset);
}

// ---------------------------------------------------------------- rank up popup

export class PlayerRankUpComponentFeedbacks extends MonoBehaviour {
  static typeName = 'PlayerRankUpComponentFeedbacks';

  OnDeserialize() {
    this.appearFeedbacks = SkippableMMFeedback.from(this.appearFeedbacks);
    this.appear2Feedbacks = SkippableMMFeedback.from(this.appear2Feedbacks);
  }

  SetMMFeedbacksTarget(target) {
    if (!this.needsMMFeedbackDestination) return;
    if (this.positionFeedback) this.positionFeedback.DestinationPositionTransform = target;
    if (this.positionSkipFeedback) this.positionSkipFeedback.DestinationPositionTransform = target;
  }
}

export class PlayerRankUpPopupUI extends MonoBehaviour {
  static typeName = 'PlayerRankUpPopupUI';

  static Instance = null;

  constructor() {
    super();
    this.rvCurrencyAnimationTime = 0.75;
    this.canSkipRankUpAnimation = false;
    this.rvWatched = false;
    this.extraRewardToGive = 0;
    this.spawnedFeedbacks = null;
    this.baseRewardAmount = 0;
    this.ShownRewards = 0;
  }

  OnDeserialize() {
    this.rankUpFeedback = SkippableMMFeedback.from(this.rankUpFeedback);
  }

  OnEnable() {
    this._claim = () => this.ContinuePressed();
    this._rv = () => this.RvPressed();
    this.claimButton?.onClick.AddListener(this._claim);
    this.rvButton?.onClick.AddListener(this._rv);
    this.rvWatched = false;
    this.rvContainer?.gameObject.SetActive(true);
  }

  OnDisable() {
    this.claimButton?.onClick.RemoveListener(this._claim);
    this.rvButton?.onClick.RemoveListener(this._rv);
  }

  OnDestroy() {
    if (PlayerRankUpPopupUI.Instance === this) PlayerRankUpPopupUI.Instance = null;
  }

  Initialize(currentRank, claimCallback) {
    PlayerRankUpPopupUI.Instance = this;
    this.ShownRewards = 0;
    this.claimEvent = claimCallback;
    this.StartCoroutine(this.RankUpTextCoroutine(currentRank));
  }

  OnPointerDown() {
    if (this.canSkipRankUpAnimation) this.rankUpFeedback.TrySkip();
  }

  ContinuePressed() {
    if (this.rvWatched) Currencies.Hard.Gain(this.extraRewardToGive, 'Rank');
    const cb = this.claimEvent;
    this.claimEvent = null;
    cb?.();
  }

  get rvGemMultiplier() {
    return Meta.data.rankTrack?.rvGemMultiplier ?? 2;
  }

  /** the rewarded video of the rank-up rubies (src/ads.js) */
  RvPressed() {
    if (this.rvWatched) return;
    Ads.watch('rank_up_bonus', () => this.OnRvWatched(), this);
  }

  OnRvWatched() {
    this.rvWatched = true;
    this.rvContainer?.gameObject.SetActive(false);
    const base = this.baseRewardAmount;
    const target = Math.trunc(this.rvGemMultiplier * base);
    this.extraRewardToGive = target - base;
    if (this.spawnedFeedbacks) this.StartCoroutine(this.AnimateRewardAmount(this.spawnedFeedbacks, base, target));
  }

  *AnimateRewardAmount(feedback, start, target) {
    let t = 0;
    const c = feedback.rankUpRewardComponent;
    c.UpdateRewardAmount(start, true);
    while (t < this.rvCurrencyAnimationTime) {
      c.UpdateRewardAmount(Math.trunc(start + (target - start) * Math.min(1, t / this.rvCurrencyAnimationTime)));
      t += Time.deltaTime;
      yield null;
    }
    c.UpdateRewardAmount(target);
  }

  *RankUpTextCoroutine(currentRank) {
    const newRankUI = currentRank + 1;
    this.rankNumberText?.SetText(currentRank);
    yield null;
    this.openMMFeedbacks?.PlayFeedbacks();
    while (this.openMMFeedbacks?.IsPlaying) yield null;
    this.rankUpFeedback.PlayFeedbacks();
    const reg = this.rankUpFeedback.Regular;
    while (reg && !reg.InScriptDrivenPause && reg.IsPlaying) yield null;
    this.rankNumberText?.SetText(newRankUI);
    reg?.ResumeFeedbacks();
    this.canSkipRankUpAnimation = true;
    while (this.rankUpFeedback.IsPlaying) yield null;
    yield* this.SpawnRewards(currentRank);
    let rv = false;
    for (const r of rankRewards(currentRank)) {
      if (r.rewardID === CurrencyHelper.GetRewardID(1)) {
        this.rvFeedback?.PlayFeedbacks();
        if (!rv) Analytics.adOffer('rank_up_bonus');
        rv = true;
      }
    }
    if (!rv) this.claimButtonFeedback?.PlayFeedbacks();
  }

  *SpawnRewards(currentRank) {
    const list = rankRewards(currentRank);
    const count = list.length;
    // OrderBy(starts with "Currency_"): cosmetics / unlocks first, stable
    const ordered = [...list.filter((r) => !r.rewardID.startsWith(CurrencyHelper.currencyPrefix)), ...list.filter((r) => r.rewardID.startsWith(CurrencyHelper.currencyPrefix))];
    this.spawnedFeedbacks = null;
    let idx = 0;
    for (const reward of ordered) {
      const asset = rewardAsset(reward.rewardID);
      if (!asset) {
        console.error(`Failed to load UnlockRewardAsset for reward ${reward.rewardID}.`);
        return;
      }
      const prefab = (this.rewardComponents || []).find((p) => p instanceof PrefabRef && prefabCanAssign(p, reward, asset));
      if (!prefab) {
        console.error(`Failed to find UI_BaseRewardComponent for reward ${reward.rewardID}.`);
        return;
      }
      const inst = Instantiate(prefab, this.rewardContainer);
      inst.rankUpRewardComponent.SetRankIndex(currentRank);
      inst.rankUpRewardComponent.SetRewardUI(reward, asset);
      if (reward.rewardID === CurrencyHelper.GetRewardID(1)) {
        this.spawnedFeedbacks = inst;
        this.baseRewardAmount = reward.amount;
      }
      if (count >= 2 && this.targetPositions?.length) {
        inst.SetMMFeedbacksTarget(this.targetPositions[idx]);
        idx++;
        if (idx >= this.targetPositions.length) idx = 0;
      }
      yield null;
      yield* inst.appearFeedbacks.WaitForDonePlayingOrSkip();
      inst.appear2Feedbacks.PlayFeedbacks();
      yield* inst.appear2Feedbacks.WaitForDonePlayingOrSkip();
      this.ShownRewards++;
    }
  }
}

// ---------------------------------------------------------------- reward track

/** [Serializable] RewardTrackWorldBannerSet */
class RewardTrackWorldBannerSet {
  constructor(data) {
    Object.assign(this, data || {});
  }

  SpawnBanner(rank, rewardsForRank, parent, loc) {
    const spawn = (prefab, title, description) => {
      const e = Instantiate(prefab, parent);
      e.Initialize(rank, rewardsForRank, title, description);
      return e;
    };
    for (const reward of rewardsForRank) {
      const id = reward.rewardID;
      if (id.startsWith(CurrencyHelper.currencyPrefix)) continue;
      if (id === 'UnlockReward') {
        const d = unlockExtraData(reward.extraData);
        const world = locReplace(loc.worldString, d.worldID + 1);
        switch (d.unlockType) {
          case UnlockTypeEnum.World:
            return spawn(this.worldBanner, localize(loc.unlockString), world);
          case UnlockTypeEnum.LevelDifficultyEasy:
            return spawn(this.worldLevelsBanner, world, localize(loc.easyLevelsString));
          case UnlockTypeEnum.LevelDifficultyMedium:
            return spawn(this.worldLevelsBanner, world, localize(loc.moderateLevelsString));
          case UnlockTypeEnum.LevelDifficultyHard:
            return spawn(this.worldLevelsBanner, world, localize(loc.difficultLevelsString));
          default:
            return null;
        }
      }
      if (id === 'Unlock Random Card') {
        const t = parseInt(reward.extraData, 10);
        if (!Number.isNaN(t)) return spawn(this.randomCardBanner, localize(loc.randomString), localizeSingular(t));
        console.error('RewardTrackWorldBannerSet: incorrect extra data', id);
      } else if (id === 'Unlock Card' || id === 'Card') {
        const cid = parseInt(reward.extraData, 10);
        const card = CardService.get(cid);
        if (!card) return null;
        const label = card.Label;
        const desc = localizeSingular(card.Type);
        if (card.Type === CardType.Vehicle) return spawn(this.vehicleBanner, label, desc);
        if ([CardType.VehicleColor, CardType.VehicleTrail, CardType.VehicleDeath, CardType.VehicleLanding].includes(card.Type)) return spawn(this.cosmeticBanner, label, desc);
        return null;
      } else console.error('RewardTrackWorldBannerSet: no banner for', id);
    }
    return null;
  }
}

export class UI_RewardTrackEntry extends MonoBehaviour {
  static typeName = 'UI_RewardTrackEntry';

  constructor() {
    super();
    this.tooltipText = { mTerm: 'Rewards/HowToGetRewards' };
    this.rank = 0;
    this.isRandomRewardClaimed = false;
    this.isClaimed = false;
    this.randomDataSet = null;
    this.WorldIndex = 0;
  }

  get AreFeedbacksPlaying() {
    // C#: (claimed.enabled && claimed.IsPlaying) || (claimed.enabled && next.IsPlaying). A Unity MMFeedbacks
    // disables itself in Update whenever it is not playing (and once it completes), so `claimed.enabled`
    // is only true while the claimed feedbacks are playing.
    const c = this.claimedOverlayFeedbacks;
    const enabled = !!c?.IsPlaying;
    return (enabled && c.IsPlaying) || (enabled && !!this.nextRewardFeedbacks?.IsPlaying);
  }

  Initialize(number, rewardsForRank, title, description) {
    this.button?.onClick.AddListener(() => this.TryPushTooltip());
    this.isRandomRewardClaimed = false;
    this.rank = number;
    if (this.rankNumber) this.rankNumber.text = String(number + 1);
    this.bannerTitle?.SetText(title);
    this.bannerDescription?.SetText(description);
    this.InitializeRewards(number, rewardsForRank);
  }

  TryPushTooltip() {
    if (!this.isClaimed) MainMenuManager.PushTooltip(this.tooltipText, '');
  }

  InitializeRewards(number, rewardsForRank) {
    for (const comp of this.rewardComponents || []) {
      if (!comp) continue;
      let assigned = false;
      for (const reward of rewardsForRank) {
        const asset = rewardAsset(reward.rewardID);
        if (!asset) {
          console.error(`Failed to load UnlockRewardAsset for reward ${reward.rewardID}.`);
          continue;
        }
        if (!comp.CanAssignReward(reward, asset)) continue;
        comp.SetRankIndex(number);
        comp.SetRewardUI(reward, asset);
        if (reward.ID === 'Unlock Random Card') this.randomDataSet = { component: comp, asset, definition: reward };
        assigned = true;
        break;
      }
      if (!assigned) comp.gameObject.SetActive(false);
    }
  }

  SetState(currentLevel, progress) {
    this.isClaimed = this.rank <= currentLevel;
    if (this.fillbar) this.fillbar.fillAmount = this.GetFillbarProgress(currentLevel, progress);
    this.claimedOverlay?.SetActive(this.isClaimed);
    this.lockIcon?.SetActive(!this.isClaimed);
    const next = this.rank - 1 === currentLevel;
    this.nextRewardOverlay?.SetActive(next);
    this.nextRewardText?.SetActive(next);
    this.uiParticle?.gameObject.SetActive(this.rank > currentLevel);
    if (this.isRandomRewardClaimed || !this.isClaimed || !this.randomDataSet) return;
    const rd = this.randomDataSet;
    rd.component.SetRewardUI(rd.definition, rd.asset);
    const card = rd.component.TryGetUnlockedCard?.();
    if (card) this.bannerTitle?.SetText(card.Label);
    this.isRandomRewardClaimed = true;
  }

  GetFillbarProgress(level, progress) {
    if (this.rank > level) return 0;
    if (this.rank + 1 > level) return progress > 0.5 ? 1 : 0.5;
    return 1;
  }

  *AnimateFillbarToLevel(level, progress, duration) {
    yield* this.AnimateFillbarToProgress(this.GetFillbarProgress(level, progress), duration);
  }

  *AnimateFillbarToProgress(progress, duration) {
    let t = 0;
    const start = this.fillbar?.fillAmount ?? 0;
    for (;;) {
      yield null;
      t += Time.deltaTime / duration;
      if (this.fillbar) this.fillbar.fillAmount = start + (progress - start) * Math.min(1, t);
      if (t >= 1) break;
    }
  }

  PlayClaimed() {
    this.lockIcon?.SetActive(false);
    this.nextRewardOverlay?.SetActive(false);
    this.claimedOverlay?.SetActive(true);
    this.nextRewardText?.SetActive(false);
    this.claimedOverlayFeedbacks?.PlayFeedbacks();
    this.isClaimed = true;
  }

  PlayNextRewardHighlight() {
    this.nextRewardOverlay?.SetActive(true);
    this.nextRewardInstantFeedbacks?.PlayFeedbacks();
    this.nextRewardFeedbacks?.PlayFeedbacks();
    this.nextRewardText?.SetActive(true);
  }
}

export class UI_RewardTrackPointer extends MonoBehaviour {
  static typeName = 'UI_RewardTrackPointer';

  constructor() {
    super();
    this.animationDuration = 0.25;
    this.worldIndex = -1;
  }

  get LocalPosition() {
    return this.transform.localPosition;
  }

  set LocalPosition(v) {
    this.transform.localPosition = v;
  }

  Initialize(siblingIndex) {
    this.transform.SetSiblingIndex(siblingIndex);
  }

  TrySetWorldIndex(index) {
    if (this.worldIndex >= index) return;
    this.worldIndex = index;
    const hc = Color.from(SettingsContainer.Instance.WorldSettings[index].visualSettings.uiHighlightColor);
    for (const img of this.imagesToRecolor || []) {
      if (!img) continue;
      const a = img.color.a;
      img.color = new Color(hc.r, hc.g, hc.b, a);
    }
  }

  *AnimatePointer(end, worldIndexAtEnd) {
    const start = this.LocalPosition;
    const curve = AnimationCurve.from(this.animationCurve);
    let t = 0;
    for (;;) {
      yield null;
      t += Time.deltaTime / this.animationDuration;
      this.LocalPosition = start.clone().lerp(end, curve.Evaluate(t));
      if (t >= 1) break;
    }
    this.TrySetWorldIndex(worldIndexAtEnd);
  }
}

export class UI_RewardTrack extends MonoBehaviour {
  static typeName = 'UI_RewardTrack';

  static get IsOpen() {
    return UIStatics.RewardTrackOpen;
  }

  constructor() {
    super();
    this.animateToSectionDuration = 2;
    this.animateFillbarDuration = 0.5;
    this.delayBetweenLevelUp = 0.2;
    this.firstTimePreviewDuration = 5;
    this.firstTimePreviewDelay = 0.5;
    this.firstTimePreviewScrollToRankDelay = 0.5;
    this.banners = [];
    this.scrollingCo = null;
  }

  get ScrollViewport() {
    return this.scrollRect.viewport;
  }

  get Content() {
    return this.scrollRect.content;
  }

  get RankManager() {
    return PlayerRankManager.Instance;
  }

  get HasSeenRewardTrack() {
    return !!PlayerRank.state.hasSeenRewardTrack;
  }

  set HasSeenRewardTrack(v) {
    PlayerRank.state.hasSeenRewardTrack = v;
  }

  get ShouldShowRankUpAnimation() {
    return this.RankManager.LastPresentedRankInRewardTrack < this.RankManager.CurrentRank;
  }

  get sectionCurve() {
    return AnimationCurve.from(this.animateToSectionCurve);
  }

  OnStartAnimation() {
    this.closeButton?.gameObject.SetActive(false);
    InputUIBlocker.DisableInput();
  }

  OnEndAnimation() {
    this.closeButton?.gameObject.SetActive(true);
    InputUIBlocker.EnableInput();
  }

  Initialize() {
    UIStatics.RewardTrackOpen = false;
    this.closeButton?.onClick.AddListener(() => this.Close());
    this.onOpen?.Initialization();
    this.onClose?.Initialization();
    const rewards = PlayerRank.rankRewards;
    this.bannerTargets = new Array(rewards.size + 1);
    this.bannerTargets[0] = Instantiate(this.emptyBanner, this.Content).transform;
    const sets = (this.worldSets || []).map((s) => new RewardTrackWorldBannerSet(s));
    let worldIndex = 0;
    let target = 1;
    for (const [rank, steps] of rewards) {
      const defs = steps.map(rewardDefinition);
      for (const r of defs) if (r.ID === 'UnlockReward' && unlockExtraData(r.extraData).unlockType === UnlockTypeEnum.World) worldIndex++;
      const banner = sets[worldIndex]?.SpawnBanner(rank, defs, this.Content, this.localizationSettings || {});
      if (banner) {
        banner.WorldIndex = worldIndex;
        this.banners.push(banner);
        this.bannerTargets[target] = banner.transform;
      }
      target++;
    }
    this.pointer?.Initialize(this.Content.childCount);
  }

  Open(skipOpenAnimation) {
    if (UIStatics.RewardTrackOpen) return;
    UIStatics.RewardTrackOpen = true;
    this.gameObject.SetActive(true);
    this.playerRank?.SetCurrentStars();
    if (!skipOpenAnimation) {
      this.OnStartAnimation();
      this.onOpen?.PlayFeedbacks();
    }
    this.StartCoroutine(this.OpenScrolling());
  }

  /** Canvas.willRenderCanvases: the layout of the freshly shown track is up to date */
  *OpenScrolling() {
    yield null;
    UISystem.layout();
    this.SetBannerStates(this.HasSeenRewardTrack ? this.RankManager.LastPresentedRankInRewardTrack : 0);
    if (!this.HasSeenRewardTrack) this.SnapToEnd();
    if (this.onOpen?.IsPlaying) {
      while (this.onOpen.IsPlaying) yield null;
      this.OnEndAnimation();
    }
    if (!this.HasSeenRewardTrack) this.HandleFirstTimePreview();
    else if (this.ShouldShowRankUpAnimation) this.StartLevelUpAnimation();
  }

  Close() {
    if (!UIStatics.RewardTrackOpen) return;
    UIStatics.RewardTrackOpen = false;
    this.onClose?.PlayFeedbacks();
    this.OnStartAnimation();
    const self = this;
    this.StartCoroutine((function* () {
      yield null;
      while (self.onClose?.IsPlaying) yield null;
      self.OnEndAnimation();
      self.gameObject.SetActive(false);
    })());
  }

  SetBannerStates(level) {
    const b = this.banners[level];
    if (b) this.pointer?.TrySetWorldIndex(b.WorldIndex);
    this.SnapToRank(level + 1);
    if (this.pointer) this.pointer.LocalPosition = this.GetPointerLocalPosition(level + 1);
    for (const e of this.banners) e.SetState(level, this.RankManager.CurrentRankProgress);
  }

  OnDestroy() {
    UIStatics.RewardTrackOpen = false;
  }

  HandleFirstTimePreview() {
    const self = this;
    this.StartCoroutine((function* () {
      self.OnStartAnimation();
      yield new WaitForSeconds(self.firstTimePreviewDelay);
      yield* self.AnimateToPosition(self.GetVerticalPositionInScreen(1), self.firstTimePreviewDuration);
      self.HasSeenRewardTrack = true;
      if (self.ShouldShowRankUpAnimation) {
        yield new WaitForSeconds(self.firstTimePreviewScrollToRankDelay);
        self.StartLevelUpAnimation();
      } else self.OnEndAnimation();
    })());
  }

  StartLevelUpAnimation() {
    const self = this;
    const rm = this.RankManager;
    const rankUp = function* (rank) {
      self.ScrollToRank(rank + 2);
      const b = self.banners[rank];
      if (b) {
        yield* b.AnimateFillbarToLevel(rm.CurrentRank, rm.CurrentRankProgress, self.animateFillbarDuration);
        b.PlayClaimed();
      }
      const next = self.banners[rank + 1];
      next?.PlayNextRewardHighlight();
      const wi = next ? next.WorldIndex : 0;
      if (self.pointer) yield* self.pointer.AnimatePointer(self.GetPointerLocalPosition(rank + 2), wi);
    };
    this.StartCoroutine((function* () {
      self.OnStartAnimation();
      const start = rm.LastPresentedRankInRewardTrack;
      const max = rm.CurrentRank;
      const prev = self.banners[start - 1];
      if (prev) yield* prev.AnimateFillbarToProgress(1, self.animateFillbarDuration);
      for (let i = start; i < max; i++) {
        yield* rankUp(i);
        rm.LastPresentedRankInRewardTrack = i + 1;
        if (i !== max - 1) yield new WaitForSeconds(self.delayBetweenLevelUp);
      }
      const animating = () => {
        for (let j = start; j < max + 1; j++) if (self.banners[j]?.AreFeedbacksPlaying) return true;
        return false;
      };
      while (animating()) yield null;
      self.OnEndAnimation();
    })());
  }

  ScrollToCurrentRank(onComplete) {
    this.ScrollToRank(this.RankManager.CurrentRank + 1, onComplete);
  }

  ScrollToRank(rank, onComplete) {
    if (this.scrollingCo) this.StopCoroutine(this.scrollingCo);
    this.scrollingCo = this.StartCoroutine(this.ScrollToSection(rank, onComplete));
  }

  *ScrollToSection(rank, onComplete) {
    this.scrollRect.enabled = false;
    yield* this.AnimateToPosition(this.GetVerticalPositionInScreen(rank), this.animateToSectionDuration);
    onComplete?.();
    this.scrollRect.enabled = true;
    this.scrollingCo = null;
  }

  *AnimateToPosition(end, speed) {
    let t = 0;
    const content = this.Content;
    const start = Math.max(content.anchoredPosition.y, 0);
    const pos = content.anchoredPosition;
    const curve = this.sectionCurve;
    while (t < 1) {
      t += Time.unscaledDeltaTime / speed;
      pos.y = start + (end - start) * curve.Evaluate(t);
      content.anchoredPosition = pos;
      yield null;
    }
    content.anchoredPosition = pos;
  }

  SnapToStart() {
    const c = this.Content;
    c.anchoredPosition = new THREE.Vector2(c.anchoredPosition.x, c.rect.height - this.ScrollViewport.rect.height);
  }

  SnapToEnd() {
    const c = this.Content;
    c.anchoredPosition = new THREE.Vector2(c.anchoredPosition.x, 0);
  }

  SnapToRank(rank) {
    const c = this.Content;
    c.anchoredPosition = new THREE.Vector2(c.anchoredPosition.x, this.GetVerticalPositionInScreen(rank));
  }

  GetBannerTarget(rank) {
    const n = this.bannerTargets.length;
    return this.bannerTargets[Math.max(0, Math.min(rank, n - 1))];
  }

  GetVerticalPositionInScreen(rank) {
    const target = this.GetBannerTarget(rank);
    const contentH = this.Content.rect.height;
    const viewH = this.ScrollViewport.rect.height;
    const max = contentH - viewH;
    const p = Math.abs(target.localPosition.y) + viewH * -0.5;
    return Math.max(0, Math.min(p, max));
  }

  GetPointerLocalPosition(rank) {
    const t = this.GetBannerTarget(rank);
    const lp = t.localPosition;
    return new THREE.Vector3(lp.x, lp.y + t.rect.height * -0.5, lp.z);
  }
}

export class UI_OpenRewardTrack extends MonoBehaviour {
  static typeName = 'UI_OpenRewardTrack';

  Awake() {
    this.button?.onClick.AddListener(() => this.OpenTrack());
  }

  TryInitialize() {
    if (this.hasInitialized) return;
    this.rewardTrack.Initialize();
    this.hasInitialized = true;
  }

  OpenTrack() {
    this.TryInitialize();
    this.rewardTrack.Open(false);
  }
}

// ---------------------------------------------------------------- bonus letters claim overlay

export class UI_ClaimBonusOverlay extends UI_OverlayBase {
  static typeName = 'UI_ClaimBonusOverlay';

  get settings() {
    return Bonus.settings;
  }

  Awake() {
    this._claim = () => this.OnClaim();
    this._rv = () => this.OnRv();
    this.claimBtn?.onClick.AddListener(this._claim);
    this.rvBtn?.onClick.AddListener(this._rv);
    this.claimAmount = this.settings.onClaim;
    this.descriptionTxt?.SetText(this.claimAmount);
    this.rvTxt?.SetText(this.settings.rvMultiplier);
    Analytics.adOffer('bonus_claim');
  }

  Start() {
    this.TryOpen();
  }

  /** the rewarded video of the xN bonus claim (src/ads.js) */
  OnRv() {
    if (this.doubled) return;
    Ads.watch('bonus_claim', () => this.OnRvWatched(), this);
  }

  OnRvWatched() {
    this.doubled = true;
    this.claimAmount = this.settings.rvMultiplier * this.settings.onClaim;
    if (this.currencyImg) this.currencyImg.sprite = this.moreGemsIcon;
    this.descriptionTxt?.SetText(this.claimAmount);
    this.rvBtn?.gameObject.SetActive(false);
  }

  OnClaim() {
    this.GainCurrency();
  }

  GainCurrency() {
    // BonusModeState.SetBonusClaimed + currency exchange
    Bonus.save.lastClaimed = Date.now();
    Currencies.Bonus.Spend(Currencies.Bonus.value, 'Bonus');
    Currencies.Soft.Gain(this.claimAmount, 'Bonus');
    Analytics.featureAction('bonus', this.doubled ? 'claim_ad' : 'claim');
    Bonus.onChanged.Raise();
    const handler = MainMenuManager.Instance?.RewardHandler;
    if (handler) {
      handler.OverrideParticleStart(2, this.currencyImg.transform);
      handler.SpawnReward([{ amount: this.claimAmount, rewardID: 'Currency_Soft', rewardType: 2 }]);
    }
    this.claimBtn?.onClick.RemoveListener(this._claim);
    this.rvBtn?.onClick.RemoveListener(this._rv);
    this.TryClose();
  }

  CloseFinished() {
    super.CloseFinished();
    Destroy(this.gameObject);
  }
}

// ---------------------------------------------------------------- small popups

export class UI_QuitBonusRideModePopUp extends MonoBehaviour {
  static typeName = 'UI_QuitBonusRideModePopUp';

  Open(onQuit) {
    this.callback = onQuit;
    this.quitButton?.onClick.AddListener(() => {
      this.callback?.();
      Destroy(this.gameObject);
    });
    this.backButton?.onClick.AddListener(() => Destroy(this.gameObject));
  }
}

export class UI_NoAdPopup extends MonoBehaviour {
  static typeName = 'UI_NoAdPopup';

  OnEnable() {
    this._close = () => Destroy(this.gameObject);
    this.closeButton?.onClick.AddListener(this._close);
  }

  OnDisable() {
    this.closeButton?.onClick.RemoveListener(this._close);
  }
}

for (const cls of [PlayerRankUpComponentFeedbacks, PlayerRankUpPopupUI, UI_RewardTrackEntry, UI_RewardTrackPointer, UI_RewardTrack, UI_OpenRewardTrack, UI_ClaimBonusOverlay, UI_QuitBonusRideModePopUp, UI_NoAdPopup]) registerComponent(cls);

void EventAction;
void AudioSampleID;
void UIInput;
