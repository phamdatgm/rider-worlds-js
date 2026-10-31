// Lootbox opening: GameLootboxService (art + queue facade of meta/lootbox.js), UI_LootboxOpener, UI_LootboxOpenAnimation
// (3D chest rendered to a RawImage by RenderTextureCreator), LootboxVisuals, UI_CardBase card reveals,
// UI_LootboxCollectionOverview and CenteredGridLayoutGroup.
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { WaitForSeconds, WaitForSecondsRealtime, WaitWhile, WaitUntil, Time } from '../engine/core.js';
import { registerComponent, registerSO, ScriptableObject, Instantiate, PrefabRef } from '../engine/instantiate.js';
import { loadPrefabDeep, loadWantedMeshes } from '../engine/assets.js';
import { Save } from '../meta/save.js';
import '../engine/animator.js';
import { MMFeedbacks } from '../game/mmfeedbacks.js';
import { ClaimSelection, LootboxService } from '../meta/lootbox.js';
import { CardService, CardType } from '../meta/cards.js';
import { bumpLayout } from '../ugui/rect.js';
import { Color } from '../ugui/graphic.js';
import { UISystem } from '../ugui/canvas.js';
import { UISprites } from '../ugui/sprites.js';
import { GridLayoutGroup } from '../ugui/layout.js';
import { localize, ev } from './common.js';
import { UIStatics } from './statics.js';
import { MainMenuManager } from './home.js';
import { UIInput, localizeSingular, hexInts } from './rewards.js';
import { rarityData, localizeRarity, RARITY_TABLE } from './garage.js';
import { tutorialUtility } from './shop.js';
import { Ads } from '../ads.js';
import { Analytics } from '../analytics/index.js';
import './rendertexture.js';

// MMFeedbacks.PlayFeedbacksInReverse (the sequence and the direction-aware feedbacks run bottom to top)
if (!MMFeedbacks.prototype.PlayFeedbacksInReverse) {
  MMFeedbacks.prototype.PlayFeedbacksInReverse = function (position, intensity) {
    this.Direction = this.Direction === 0 ? 1 : 0;
    this.PlayFeedbacks(position, intensity);
  };
}

/** IGameCard.UIRarityData.main */
const rarityColor = (r) => rarityData(r).main;

// ---------------------------------------------------------------- GameLootboxService

/** LootBoxResult view of a meta roll {box, type, regular, ads, origin} */
function lootBoxResult(r) {
  return r ? { context: { boxType: r.type, id: r.box }, resultRegular: r.regular || [], resultAds: r.ads || [], raw: r } : null;
}

export class GameLootboxService extends ScriptableObject {
  static typeName = 'GameLootboxService';

  static get Instance() {
    return GameLootboxService.instance;
  }

  OnLoad() {
    GameLootboxService.instance = this;
    const la = this.lootboxArt || {};
    const keys = hexInts(la.keyData);
    const map = new Map();
    keys.forEach((k, i) => {
      const v = la.valueData?.[i];
      if (v) map.set(k, { sprite: UISprites.get(v.sprite), smallSprite: UISprites.get(v.smallSprite), modelPrefab: v.modelPrefab });
    });
    this.lootboxArt = {
      map,
      TryGetValue: (type) => map.get(type) || null,
    };
  }

  /** model prefabs of every box type (not referenced by the menu prefab itself) */
  get ModelPrefabIds() {
    const ids = new Set();
    for (const v of this.lootboxArt.map.values()) if (v.modelPrefab instanceof PrefabRef) ids.add(v.modelPrefab.id);
    return [...ids];
  }

  get HasLootboxToOpen() {
    return LootboxService.HasQueued;
  }

  get OpeningResult() {
    return lootBoxResult(Save.data.lootboxes?.openingResult);
  }

  OpenNext() {
    return lootBoxResult(LootboxService.OpenNext());
  }

  Claim(selection) {
    return LootboxService.Claim(!!(selection & ClaimSelection.Ads));
  }
}

registerSO(GameLootboxService);

// ---------------------------------------------------------------- opener

export class UI_LootboxOpener extends MonoBehaviour {
  static typeName = 'UI_LootboxOpener';

  constructor() {
    super();
    this.lootboxOpening = null;
    this.ready = false;
  }

  OnDeserialize() {
    this.onLootboxClaimed = ev(this.onLootboxClaimed);
  }

  Awake() {
    const ids = this.lootboxService?.ModelPrefabIds || [];
    Promise.all(ids.map((id) => loadPrefabDeep(id).catch((e) => console.warn('lootbox prefab', id, e.message))))
      .then(() => loadWantedMeshes())
      .then(() => {
        this.ready = true;
      });
  }

  Update() {
    if (!this.ready) return;
    const opening = this.lootboxOpening && !this.lootboxOpening.gameObject._destroyed;
    const mm = MainMenuManager.Instance;
    if (this.lootboxService.HasLootboxToOpen && !opening && mm && !mm.IsBusy && !UIStatics.TutorialActive() && !UIStatics.RankUpPopup.IsOpenOrActive) {
      this.lootboxOpening = Instantiate(this.lootboxOpeningPrefab, this.transform.parent);
      const result = this.lootboxService.OpeningResult ?? this.lootboxService.OpenNext();
      this.lootboxOpening.Initialize(result, (watched) => this.OnLootboxClaimed(watched));
    }
  }

  OnLootboxClaimed(watchedAdForExtras) {
    this.lootboxService.Claim(watchedAdForExtras ? ClaimSelection.Normal | ClaimSelection.Ads : ClaimSelection.Normal);
    this.onLootboxClaimed.Invoke();
  }
}

// ---------------------------------------------------------------- 3D chest

/** MaterialPropertyBlock.SetColor("_Color") on a particle renderer: tint of its (cloned) particle material */
function tintParticles(renderer, color) {
  const ps = renderer?.gameObject?.GetComponent('ParticleSystem');
  if (!ps) return;
  ps._tint = color;
  const apply = () => {
    const m = ps.mesh;
    if (!m || !ps._tint) return;
    if (!m.userData.tinted) {
      m.material = m.material.clone();
      m.userData.tinted = true;
    }
    m.material.color?.setRGB(ps._tint.r, ps._tint.g, ps._tint.b, THREE.SRGBColorSpace);
  };
  if (!ps._tintHooked) {
    ps._tintHooked = true;
    const ensure = ps._ensureMesh.bind(ps);
    ps._ensureMesh = () => {
      const had = !!ps.mesh;
      const m = ensure();
      if (!had && m) apply();
      return m;
    };
  }
  apply();
}

export class LootboxVisuals extends MonoBehaviour {
  static typeName = 'LootboxVisuals';

  constructor() {
    super();
    this.lootboxParticleRenderers = [];
    this.dropTrigger = { parameter: 'Drop' };
    this.openTrigger = { parameter: 'Open' };
    this.endTrigger = { parameter: 'End' };
  }

  SetParticleColor(color) {
    for (const r of this.lootboxParticleRenderers || []) tintParticles(r, color);
  }

  SetDropTrigger() {
    this.animator?.SetTrigger(this.dropTrigger);
  }

  SetOpenTrigger() {
    this.animator?.SetTrigger(this.openTrigger);
  }

  SetEndTrigger() {
    this.animator?.SetTrigger(this.endTrigger);
  }
}

// ---------------------------------------------------------------- opening animation

export class UI_LootboxOpenAnimation extends MonoBehaviour {
  static typeName = 'UI_LootboxOpenAnimation';

  constructor() {
    super();
    this.tapToContinueShowTimeLootbox = 1;
    this.lootboxAnimationDropWait = 0.5;
    this.lootboxAnimationOpenWait = 2;
    this.lootboxFadeWait = 0.5;
    this.watchedAd = false;
    this.clicked = false;
    this.cardsLeft = 0;
    this.shouldSkipFirstDropFeedback = false;
    this.adBusy = false;
  }

  Initialize(results, lootboxClaimed) {
    this.results = results;
    this.claimedCallback = lootboxClaimed;
    this.collectionOverview.gameObject.SetActive(false);
    this.SetLootboxVisuals();
    this.StartCoroutine(this.OpeningAnimation());
  }

  SetLootboxVisuals() {
    const art = GameLootboxService.Instance?.lootboxArt.TryGetValue(this.results.context.boxType);
    if (art) {
      if (this.lootboxVisuals && !this.lootboxVisuals.gameObject._destroyed) Destroy(this.lootboxVisuals.gameObject);
      this.lootboxVisuals = Instantiate(art.modelPrefab, this.lootboxVisualsParent);
    } else console.error('LootboxOpenAnimation', 'Could not find art data for type ' + this.results.context.boxType);
  }

  *WaitForSecondsOrClick(duration) {
    let t = 0;
    while (t < duration && !this.clicked) {
      yield null;
      t += Time.unscaledDeltaTime;
    }
  }

  *OpeningAnimation() {
    this.screenShow.PlayFeedbacks();
    yield new WaitWhile(() => this.screenShow.IsPlaying);
    const firstDrop = this.results.resultRegular[0];
    if (firstDrop) this.SetLootboxParticlesColor(CardService.get(firstDrop.id)?.Rarity ?? 0);
    this.lootboxVisuals.SetDropTrigger();
    yield new WaitForSeconds(this.lootboxAnimationDropWait);
    this.backgroundBtn.onClick.AddListener(() => {
      this.clicked = true;
    });
    yield* this.WaitForSecondsOrClick(this.tapToContinueShowTimeLootbox);
    if (!this.clicked) {
      tutorialUtility()?.OverrideTapToContinueText(this.tapToContinueText?.mTerm ?? 'UI/Shop/Lootbox/TapToOpen');
      tutorialUtility()?.ShowTapToContinue(false, true);
      // owner's request: the hand points at the middle of the chest (it renders centred 71.8 % down the screen); the
      // screen button stays the one thing to tap
      tutorialUtility()?.PressOn(new THREE.Vector3(UISystem.width / 2, UISystem.height * (1 - 0.718), 0), this.backgroundBtn.gameObject);
    }
    yield new WaitUntil(() => this.clicked);
    this.clicked = false;
    tutorialUtility()?.Hide();
    this.lootboxVisuals.SetOpenTrigger();
    yield* this.WaitForSecondsOrClick(this.lootboxAnimationOpenWait);
    this.lootboxFade.PlayFeedbacks();
    yield* this.WaitForSecondsOrClick(this.lootboxFadeWait);
    if (this.clicked) {
      this.lootboxVisuals.SetEndTrigger();
      this.clicked = false;
    }
    this.cardsLeft = this.CalculateCardsLeft(null);
    this.UpdateCardsLeftText();
    yield* this.OpenRegularDrops();
    yield* this.OpenRvDrop();
    this.OpenEndScreen();
  }

  *OpenRegularDrops() {
    for (const drop of this.results.resultRegular) {
      const card = this.SpawnCard(drop);
      yield* this.OpenDropSkippable(card, drop, false);
      yield* this.HandleSkippableSequence(card.PlayRemove(), (function* () {
        if (!card.gameObject._destroyed) Destroy(card.gameObject);
      })());
    }
  }

  *OpenRvDrop() {
    const drop = this.results.resultAds[0];
    if (!drop) return;
    const card = this.SpawnCard(drop);
    yield* this.OpenDropSkippable(card, drop, true);
    this.showRvDropButtonsFeedbacks.PlayFeedbacks();
    yield new WaitWhile(() => this.showRvDropButtonsFeedbacks.IsPlaying);
    let pressedLoseRv = false;
    this.loseRvButton.onClick.AddListener(() => {
      pressedLoseRv = true;
    });
    this.watchRvButton.onClick.AddListener(() => this.OnRvButtonPressed());
    Analytics.adOffer('chest_extra');
    yield new WaitUntil(() => pressedLoseRv || this.watchedAd);
    yield* card.PlayRemove();
    this.showRvDropButtonsFeedbacks.PlayFeedbacksInReverse();
    yield new WaitWhile(() => this.showRvDropButtonsFeedbacks.IsPlaying);
  }

  CalculateCardsLeft(after) {
    let found = after === null;
    let count = 0;
    for (const list of [this.results.resultRegular, this.results.resultAds]) {
      for (const drop of list) {
        if (found) count += drop.count;
        else if (drop === after) found = true;
      }
    }
    return count;
  }

  *OpenDropSkippable(cardBase, drop, rv) {
    const self = this;
    yield* this.HandleSkippableSequence(
      (function* () {
        yield* cardBase.PlayReveal(rv);
        yield* cardBase.DelayedAnimation(
          () => self.OnAdditionalCardAdded(),
          (r) => self.SetLootboxParticlesColor(r),
        );
      })(),
      (function* () {
        self.cardsLeft = self.CalculateCardsLeft(drop);
        self.UpdateCardsLeftText();
        yield* cardBase.HandleSkip(rv);
      })(),
    );
    if (!rv) {
      this.clicked = false;
      yield new WaitUntil(() => this.clicked);
    }
  }

  *HandleSkippableSequence(skippable, onSkipped) {
    let coroutine = null;
    let finished = false;
    let skipped = false;
    coroutine = this.StartCoroutine((function* () {
      yield* skippable;
      finished = true;
      coroutine = null;
    })());
    if (finished) coroutine = null;
    const skip = () => {
      if (coroutine) {
        this.StopCoroutine(coroutine);
        coroutine = null;
        skipped = true;
      }
    };
    this.backgroundBtn.onClick.AddListener(skip);
    yield new WaitUntil(() => coroutine === null);
    this.backgroundBtn.onClick.RemoveListener(skip);
    if (skipped) yield* onSkipped;
  }

  SpawnCard(drop, cardsSoFar = 0) {
    const card = Instantiate(this.prefab, this.cardRewardContainer);
    card.SetStartingCardsAmount(cardsSoFar);
    const gameCard = CardService.get(drop.id);
    card.Initialize(gameCard, drop.count, false);
    card.SetUpAnimationTargets(this.revealStartPosition, this.revealTargetPosition);
    this.SetLootboxParticlesColor(gameCard.Rarity);
    this.cardsLeft--;
    this.UpdateCardsLeftText();
    return card;
  }

  SetLootboxParticlesColor(rarity) {
    this.lootboxVisuals?.SetParticleColor(rarityColor(rarity));
  }

  OnAdditionalCardAdded() {
    this.cardsLeft--;
    this.UpdateCardsLeftText();
  }

  PlayDropFeedbacks() {
    this.lootboxVisuals?.cardDropParticle?.Play();
    if (this.lootboxClicked.IsPlaying) this.lootboxClicked.StopFeedbacks();
    this.lootboxClicked.PlayFeedbacks();
  }

  UpdateCardsLeftText() {
    if (this.cardsLeft >= 1) {
      if (!this.cardsLeftObject.activeSelf) this.cardsLeftObject.Show();
      this.cardsLeftText.SetText(this.cardsLeft);
    } else this.cardsLeftObject.Hide();
    if (this.shouldSkipFirstDropFeedback) this.shouldSkipFirstDropFeedback = false;
    else this.PlayDropFeedbacks();
  }

  OpenEndScreen() {
    this.collectionOverview.Initialize(this.results, this.watchedAd, () => this.OnClaimCallback());
  }

  OnClaimCallback() {
    this.StartCoroutine(this.CloseScreen());
  }

  // the result screen goes at once on Claim (owner's request) instead of fading out first (screenFade, 0.4 s)
  *CloseScreen() {
    this.claimedCallback?.(this.watchedAd);
    Destroy(this.gameObject);
  }

  OnRvButtonPressed() {
    if (!this.watchedAd && !this.adBusy) {
      this.adBusy = true;
      Ads.watch('chest_extra', () => (this.watchedAd = true), this).finally(() => (this.adBusy = false));
    }
  }
}

/** UnboxingHelper.CombineDuplicates */
function combineDuplicates(list) {
  const out = [];
  const by = new Map();
  for (const d of list) {
    if (by.has(d.id)) by.get(d.id).count += d.count;
    else {
      const e = { id: d.id, count: d.count };
      by.set(d.id, e);
      out.push(e);
    }
  }
  return out;
}

export class UI_LootboxCollectionOverview extends MonoBehaviour {
  static typeName = 'UI_LootboxCollectionOverview';

  constructor() {
    super();
    this.appearDelay = 0.1;
    this.watchedAd = false;
    this.rewards = [];
  }

  Initialize(result, watchedRv, onClaimCallback) {
    this.watchedAd = watchedRv;
    this.gameObject.SetActive(true);
    this.claimCallback = onClaimCallback;
    this._claim = () => this.OnClaimButtonPressed();
    this.claimButton.onClick.AddListener(this._claim);
    const all = combineDuplicates([...result.resultRegular, ...result.resultAds]);
    const rvIndex = result.resultRegular.length;
    const self = this;
    let lastIndex = 0;
    function* doRestOfResults() {
      for (let i = lastIndex + 1; i < all.length; i++) {
        self.HandleDropResult(i, rvIndex, all);
        self.scroll.verticalNormalizedPosition = 0;
        yield null;
      }
      self.buttonShowFeedback.PlayFeedbacks();
    }
    function* waitForTimeOrClick() {
      let t = 0;
      while (t < self.appearDelay) {
        yield null;
        t += Time.unscaledDeltaTime;
        if (UIInput.mouseDown) {
          yield* doRestOfResults();
          self.StopAllCoroutines();
          yield null;
          return;
        }
      }
    }
    this.StartCoroutine((function* () {
      for (let i = 0; i < all.length; i++) {
        self.HandleDropResult(i, rvIndex, all);
        self.scroll.verticalNormalizedPosition = 0;
        lastIndex = i;
        yield* waitForTimeOrClick();
      }
      self.buttonShowFeedback.PlayFeedbacks();
    })());
  }

  HandleDropResult(index, rvIndex, all) {
    const drop = all[index];
    const card = CardService.get(drop.id);
    const cardBase = Instantiate(this.prefab, this.parent);
    const total = all.filter((x) => x.id === drop.id).reduce((a, x) => a + x.count, 0);
    cardBase.SetStartingCardsAmount(total - drop.count);
    cardBase.Initialize(card, drop.count, true);
    cardBase.PlayOverviewReveal(index >= rvIndex);
    this.rewards.push(cardBase.gameObject);
    if (index >= rvIndex && !this.watchedAd) cardBase.EnableLostRVOverlay();
  }

  OnClaimButtonPressed() {
    this.claimButton.onClick.RemoveListener(this._claim);
    this.claimCallback?.();
  }
}

// ---------------------------------------------------------------- CenteredGridLayoutGroup

function setChildAlongAxis(rect, axis, pos, size) {
  rect._anchorMin.set(0, 1);
  rect._anchorMax.set(0, 1);
  const k = axis === 0 ? 'x' : 'y';
  rect._sizeDelta[k] = size;
  rect._anchoredPosition[k] = axis === 0 ? pos + size * rect._pivot[k] : -pos - size * (1 - rect._pivot[k]);
  bumpLayout();
}

const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CenteredGridLayoutGroup extends GridLayoutGroup {
  static typeName = 'CenteredGridLayoutGroup';

  SetLayoutVertical() {
    const n = this.rectChildren.length;
    const p = this.padding;
    const w = this.transform.width;
    const h = this.transform.height;
    const [cx, cy] = this.m_CellSize;
    const [sx, sy] = this.m_Spacing;
    let cellCountX = 1;
    let cellCountY = 1;
    if (this.m_Constraint === 1) {
      cellCountX = this.m_ConstraintCount;
      if (n > cellCountX) cellCountY = Math.floor(n / cellCountX) + (n % cellCountX > 0 ? 1 : 0);
    } else if (this.m_Constraint === 2) {
      cellCountY = this.m_ConstraintCount;
      if (n > cellCountY) cellCountX = Math.floor(n / cellCountY) + (n % cellCountY > 0 ? 1 : 0);
    } else {
      cellCountX = cx + sx <= 0 ? Infinity : Math.max(1, Math.floor((w - p.left - p.right + sx + 0.001) / (cx + sx)));
      cellCountY = cy + sy <= 0 ? Infinity : Math.max(1, Math.floor((h - p.top - p.bottom + sy + 0.001) / (cy + sy)));
    }
    const cornerX = this.m_StartCorner % 2;
    const cornerY = Math.floor(this.m_StartCorner / 2);
    let perMain;
    let actualX;
    let actualY;
    if (this.m_StartAxis === 0) {
      perMain = cellCountX;
      actualX = clampi(cellCountX, 1, n);
      actualY = clampi(cellCountY, 1, Math.ceil(n / perMain));
    } else {
      perMain = cellCountY;
      actualY = clampi(cellCountY, 1, n);
      actualX = clampi(cellCountX, 1, Math.ceil(n / perMain));
    }
    const ox = this.startOffset(0, actualX * cx + (actualX - 1) * sx);
    const oy = this.startOffset(1, actualY * cy + (actualY - 1) * sy);
    // the last (incomplete) row / column gets its own offset so that it is centered
    const rem = n % perMain;
    const inLast = rem === 0 ? perMain : rem;
    const lastX = this.m_StartAxis === 0 ? inLast : actualX;
    const lastY = this.m_StartAxis === 1 ? inLast : actualY;
    const lox = this.startOffset(0, lastX * cx + (lastX - 1) * sx);
    const loy = this.startOffset(1, lastY * cy + (lastY - 1) * sy);
    const lastStart = n - inLast;
    for (let j = 0; j < n; j++) {
      const [offX, offY] = j >= lastStart ? [lox, loy] : [ox, oy];
      let px;
      let py;
      if (this.m_StartAxis === 0) {
        px = j % perMain;
        py = Math.floor(j / perMain);
      } else {
        px = Math.floor(j / perMain);
        py = j % perMain;
      }
      if (cornerX === 1) px = actualX - 1 - px;
      if (cornerY === 1) py = actualY - 1 - py;
      setChildAlongAxis(this.rectChildren[j], 0, offX + (cx + sx) * px, cx);
      setChildAlongAxis(this.rectChildren[j], 1, offY + (cy + sy) * py, cy);
    }
  }
}

// ---------------------------------------------------------------- UI_CardBase

class LevelUpEffectAndTiming {
  constructor(d) {
    this.levelUpFeedbacks = d?.levelUpFeedbacks || null;
    this.levelUpDelay = d?.levelUpDelay ?? 1.65;
  }

  get IsPlaying() {
    return !!this.levelUpFeedbacks?.IsPlaying;
  }

  PlayFeedbacks() {
    this.levelUpFeedbacks?.PlayFeedbacks();
  }

  StopFeedbacks() {
    this.levelUpFeedbacks?.StopFeedbacks();
  }

  GetDelay() {
    return new WaitForSeconds(this.levelUpDelay);
  }
}

const isCurrencyCard = (c) => c?.Type === CardType.Currency;
const currencyCount = (c, n) => Math.round((c.def.currencyPerCard ?? 1) * n);

export class UI_CardBase extends MonoBehaviour {
  static typeName = 'UI_CardBase';

  constructor() {
    super();
    this.revealDelay = 0.75;
    this.levelUpAfterDelay = 0.5;
    this.noLevelUpAfterDelaySkip = 0.5;
    this.levelUpAfterDelaySkip = 0.5;
    this.maxText = 'UI/Max';
    this.currentCards = 0;
    this.addedCards = 0;
    this.gameCard = null;
  }

  OnDeserialize() {
    this.levelUpEffectAndTimings = (this.levelUpEffectAndTimings || []).map((d) => new LevelUpEffectAndTiming(d));
  }

  SetStartingCardsAmount(n) {
    this.currentCards = n;
  }

  Initialize(card, added, overview) {
    this.gameCard = card;
    this.currentCards += card.Total;
    this.addedCards = added;
    if (card.IsRankCard) {
      const cards = overview ? this.addedCards + this.currentCards : this.currentCards;
      this.nameText.SetText(card.GameAsset?.Label ?? card.Label);
      this.typeText.SetText(localizeSingular(card.Type));
      const [rank, cur, need] = card.GetCardsRangeForCards(cards);
      this.UpdateRankVisuals(card, rank);
      if (rank === 3) {
        this.fillbarProgress.SetFill(1, false);
        this.fillbarProgress.txtElement?.SetText(localize(this.maxText));
      } else this.fillbarProgress.SetFill(cur, need, false);
      this.overviewCardAmount.SetText(overview ? this.addedCards : 1);
      if (overview && card.HighestUnlockedRank < rank) {
        this.upgradeTxt.gameObject.SetActive(true);
        const c = this.upgradeTxt.color;
        this.upgradeTxt.color = new Color(c.r, c.g, c.b, 1);
      }
    } else if (isCurrencyCard(card)) {
      for (const img of this.imagesToDisableIfCurrency || []) if (img) img.enabled = false;
      for (const o of this.objectsToDisableIfCurrency || []) o?.Hide();
      this.shineEffectMask.sprite = UISprites.byName(card.def.image);
      this.overviewCardAmount.SetText(currencyCount(card, overview ? this.addedCards : 1));
      this.UpdateVisuals(card);
    }
  }

  PlayOverviewReveal(rv) {
    (rv ? this.overviewRevealRVFeedbacks : this.overviewRevealFeedbacks)?.PlayFeedbacks();
  }

  EnableLostRVOverlay() {
    this.lostRVOverlay.Show();
  }

  UpdateVisuals(card) {
    const main = rarityColor(card.Rarity);
    this.backgroundImg.color = main;
    if (this.fillbarProgress.fill) this.fillbarProgress.fill.color = main;
    this.iconImg.sprite = UISprites.byName(card.def.image);
  }

  UpdateRankVisuals(card, rank) {
    const main = rarityColor(RARITY_TABLE[rank]);
    this.backgroundImg.color = main;
    if (this.fillbarProgress.fill) this.fillbarProgress.fill.color = main;
    this.iconImg.sprite = card.GetImageSprite ? card.GetImageSprite(rank) : UISprites.byName(card.GetImage(rank));
  }

  UpdateUpgradePanel(rank) {
    const rarity = RARITY_TABLE[rank];
    this.upgradeBannerImage.color = rarityColor(rarity);
    this.upgradeBannerTxt.text = localizeRarity(rarity);
  }

  SetUpAnimationTargets(start, end) {
    for (const f of [this.revealPositionFeedbacks, this.revealRVPositionFeedbacks, this.additionalCardPositionFeedbacks, this.skipPositionFeedbacks, this.skipRVPositionFeedbacks]) {
      if (!f) continue;
      f.InitialPositionTransform = start;
      f.DestinationPositionTransform = end;
    }
  }

  *PlayReveal(rv = false) {
    const f = rv ? this.revealRVFeedbacks : this.revealFeedbacks;
    f.Initialization();
    f.PlayFeedbacks();
    yield new WaitForSeconds(this.revealDelay);
  }

  *DelayedAnimation(onShownAdditional, onCardLeveledUp) {
    const card = this.gameCard;
    if (card?.IsRankCard) yield* this.HandleRankCard(card, onShownAdditional, onCardLeveledUp);
    else if (isCurrencyCard(card)) {
      for (let i = 1; i <= this.addedCards; i++) {
        if (i >= 2 && this.addedCards >= 2) {
          this.additionalCardFeedbacks.PlayFeedbacks();
          onShownAdditional?.();
        }
        this.overviewCardAmount.SetText(currencyCount(card, i));
      }
    }
  }

  *HandleRankCard(card, onShownAdditional, onCardLeveledUp) {
    let last = card.GetCardsRangeForCards(this.currentCards);
    const fb = this.fillbarProgress;
    for (let i = 1; i <= this.addedCards; i++) {
      if (i >= 2 && this.addedCards >= 2) {
        this.additionalCardFeedbacks.PlayFeedbacks();
        onShownAdditional?.();
      }
      const data = card.GetCardsRangeForCards(this.currentCards + i);
      if (last[0] < data[0]) fb.SetFill(last[2], last[2]);
      else fb.SetFill(data[1], data[2]);
      yield new WaitWhile(() => fb.IsAnimating);
      this.overviewCardAmount.SetText(i);
      yield new WaitWhile(() => this.additionalCardFeedbacks.IsPlaying);
      if (data[0] > last[0]) {
        const fx = this.levelUpEffectAndTimings[last[0]];
        this.UpdateUpgradePanel(data[0]);
        fx?.PlayFeedbacks();
        onCardLeveledUp?.(RARITY_TABLE[data[0]]);
        if (fx) yield fx.GetDelay();
        if (data[0] === 3) {
          fb.SetFill(1, false);
          fb.txtElement?.SetText(localize(this.maxText));
        } else fb.SetFill(data[1], data[2], false);
        this.UpdateRankVisuals(card, data[0]);
        yield new WaitWhile(() => !!fx?.IsPlaying);
        yield new WaitForSeconds(this.levelUpAfterDelay);
      }
      last = data;
    }
  }

  *PlayRemove() {
    this.removeFeedbacks.Initialization();
    this.removeFeedbacks.PlayFeedbacks();
    yield new WaitWhile(() => this.removeFeedbacks.IsPlaying);
    if (!this.gameObject._destroyed) Destroy(this.gameObject);
  }

  *HandleSkip(rv) {
    const card = this.gameCard;
    const playSkip = () => {
      if (rv) {
        this.revealRVFeedbacks.StopFeedbacks();
        this.skipRvFeedbacks.Initialization();
        this.skipRvFeedbacks.PlayFeedbacks();
      } else {
        this.revealFeedbacks.StopFeedbacks();
        this.skipFeedbacks.Initialization();
        this.skipFeedbacks.PlayFeedbacks();
      }
    };
    if (card?.IsRankCard) {
      this.additionalCardFeedbacks.StopFeedbacks();
      for (const fx of this.levelUpEffectAndTimings) fx.StopFeedbacks();
      playSkip();
      const lastRank = card.GetCardsRangeForCards(this.currentCards)[0];
      const data = card.GetCardsRangeForCards(this.currentCards + this.addedCards);
      let leveledUp = false;
      if (data[0] > lastRank) {
        this.UpdateUpgradePanel(data[0]);
        this.skipLevelUpFeedbacks?.[lastRank]?.PlayFeedbacks();
        leveledUp = true;
      }
      this.overviewCardAmount.SetText(this.addedCards);
      this.fillbarProgress.SetFill(data[1], data[2], false);
      this.UpdateRankVisuals(card, data[0]);
      yield new WaitForSeconds(leveledUp ? this.levelUpAfterDelaySkip : this.noLevelUpAfterDelaySkip);
    } else if (isCurrencyCard(card)) {
      playSkip();
      this.overviewCardAmount.SetText(currencyCount(card, this.addedCards));
    }
  }

  static *PlayRevealSequence(cardBase, waitTime) {
    yield* cardBase.PlayReveal();
    yield* cardBase.DelayedAnimation(null, null);
    yield new WaitUntil(() => UIInput.mouseDown);
    if (waitTime > 0) yield new WaitForSecondsRealtime(waitTime);
    let waitingForClick = true;
    const tu = tutorialUtility();
    if (tu) {
      tu.ShowContinueButton(() => {
        waitingForClick = false;
      });
      yield new WaitWhile(() => waitingForClick);
    } else {
      // TutorialUtility not ported: its continue button is a tap anywhere
      yield new WaitUntil(() => UIInput.mouseDown);
    }
    tu?.Hide();
    yield* cardBase.PlayRemove();
  }
}

for (const cls of [UI_LootboxOpener, LootboxVisuals, UI_LootboxOpenAnimation, UI_LootboxCollectionOverview, CenteredGridLayoutGroup, UI_CardBase]) registerComponent(cls);

