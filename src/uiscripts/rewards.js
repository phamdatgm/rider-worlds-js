// CW.Rewards UI: reward assets (Rewards.Instance.TryGetItem), the UI_*RewardComponent family used by the
// rank-up popup, the reward track banners and the RV reward track, plus SkippableMMFeedback.
import { MonoBehaviour } from '../engine/scene.js';
import { registerComponent } from '../engine/instantiate.js';
import { LoopHooks } from '../engine/loop.js';
import { Meta } from '../meta/data.js';
import { parseUnlock } from '../meta/worlds.js';
import { CardService, CardType, typeName } from '../meta/cards.js';
import { PlayerRank } from '../meta/rank.js';
import { LootboxService } from '../meta/lootbox.js';
import { Color } from '../ugui/graphic.js';
import { UISprites } from '../ugui/sprites.js';
import { localize } from './common.js';
import { SettingsContainer, UnlockTypeEnum } from './services.js';

// ---------------------------------------------------------------- input (Input.GetMouseButtonDown(0))

let pendingDown = false;
export const UIInput = { mouseDown: false };
window.addEventListener('pointerdown', (e) => {
  if (e.button === 0) pendingDown = true;
});
LoopHooks.beforeUpdate.push(() => {
  UIInput.mouseDown = pendingDown;
  pendingDown = false;
});

// ---------------------------------------------------------------- reward definitions / assets

/** DirectedRewardDefinition from a track step {id, amount, extra} (or an already built definition) */
export function rewardDefinition(step) {
  if (!step) return null;
  if (step.rewardID !== undefined && step.extraData !== undefined) return step;
  return { rewardID: step.id, ID: step.id, amount: step.amount ?? 1, extraData: step.extra ?? '', rewardType: step.rewardType, step };
}

const CURRENCY_ASSETS = {
  Currency_Soft: { type: 0, image: 'Sprite/SA_Icons/S_Icon_SoftCurrency' },
  Currency_SoftRange: { type: 0, image: null },
  Currency_Hard: { type: 1, image: 'Sprite/SA_Icons/S_Icon_HardCurrency' },
  Currency_HardRange: { type: 1, image: null },
  Currency_Bonus: { type: 2, image: 'Texture2D/TX_BonusRide_PickupParticle' },
  Currency_Star: { type: 3, image: 'Sprite/SA_Icons/S_Icon_Star_Reward_A' },
};

const ASSET_KINDS = {
  Card: 'CardRewardAsset',
  'Unlock Card': 'UnlockCardRewardAsset',
  'Unlock Random Card': 'UnlockRandomCardRewardAsset',
  'Random Card': 'RandomCardRewardAsset',
  Lootbox: 'LootboxRewardAsset',
  UnlockReward: 'UnlockRewardAsset',
};

/** Rewards.Instance.TryGetItem(rewardID): {kind, UniqueName, MainImage} or null */
export function rewardAsset(id) {
  const c = CURRENCY_ASSETS[id];
  if (c) return { kind: 'CurrencyRewardAsset', UniqueName: id, currencyType: c.type, MainImage: c.image ? UISprites.get(c.image) : null };
  const kind = ASSET_KINDS[id];
  return kind ? { kind, UniqueName: id, MainImage: null } : null;
}

export const CurrencyHelper = {
  currencyPrefix: 'Currency_',
  GetRewardID(type) {
    return ['Currency_Soft', 'Currency_Hard', 'Currency_Bonus', 'Currency_Star'][type];
  },
};

/** UnlockRewardAsset.GetExtraData */
export function unlockExtraData(extra) {
  const d = parseUnlock(extra);
  return { unlockType: d.type, worldID: d.world, slot: d.slot };
}

/** "01000000e8030000" -> [1, 1000] (Unity int arrays) */
export function hexInts(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  const out = [];
  for (let i = 0; i + 8 <= v.length; i += 8) {
    const b = v.slice(i, i + 8);
    out.push(parseInt(b.slice(6, 8) + b.slice(4, 6) + b.slice(2, 4) + b.slice(0, 2), 16) | 0);
  }
  return out;
}

/** LocalizedCardType.LocalizeSingular */
export function localizeSingular(type) {
  const terms = { [CardType.Vehicle]: 'CardType/Vehicle', [CardType.VehicleColor]: 'CardType/Color', [CardType.VehicleTrail]: 'CardType/Trail', [CardType.VehicleDeath]: 'CardType/Death', [CardType.VehicleLanding]: 'CardType/Landing' };
  return terms[type] ? localize(terms[type]) : '';
}

/** LocalizedStringExtensions.Replace: {[0]}, {[1]}... */
export function locReplace(term, ...data) {
  let s = localize(term);
  data.forEach((d, i) => {
    s = s.split(`{[${i}]}`).join(String(d));
  });
  return s;
}

/** card sprite by the exported image name (UI atlas) */
export function cardSprite(card, rank) {
  const name = card?.GetImage(rank);
  return name ? UISprites.byName(name) : null;
}

/** PlayerRankManager.State.TryGetCardIDForRank */
export function cardIdForRank(rank) {
  const id = PlayerRank.state.rankCardMap?.[rank];
  return id === undefined || id === null ? null : Number(id);
}

// ---------------------------------------------------------------- SkippableMMFeedback

export class SkippableMMFeedback {
  constructor(data) {
    this.regular = data?.regular || null;
    this.skip = data?.skip || null;
  }

  static from(v) {
    return v instanceof SkippableMMFeedback ? v : new SkippableMMFeedback(v);
  }

  get Regular() {
    return this.regular;
  }

  get Skip() {
    return this.skip;
  }

  get IsPlaying() {
    return !!this.regular?.IsPlaying;
  }

  PlayFeedbacks() {
    this.regular?.PlayFeedbacks();
  }

  TrySkip() {
    if (!this.regular?.IsPlaying) return false;
    this.regular.StopFeedbacks();
    this.skip?.PlayFeedbacks();
    return true;
  }

  *WaitForDonePlayingOrSkip() {
    if (!this.regular) return;
    while (this.regular.IsPlaying) {
      yield null;
      if (UIInput.mouseDown) this.TrySkip();
    }
  }
}

// ---------------------------------------------------------------- reward components

export class UI_BaseRewardComponent extends MonoBehaviour {
  static typeName = 'UI_BaseRewardComponent';

  constructor() {
    super();
    this.rewardIDs = [];
    this.rank = 0;
  }

  CanAssignReward(reward) {
    return (this.rewardIDs || []).some((r) => (r?.id ?? r) === reward.rewardID);
  }

  SetRankIndex(i) {
    this.rank = i;
  }

  UpdateRewardAmount() {}

  SetRewardUI() {}
}

export class UI_CurrencyRewardComponent extends UI_BaseRewardComponent {
  static typeName = 'UI_CurrencyRewardComponent';

  SetRewardUI(reward, data) {
    if (data?.kind === 'CurrencyRewardAsset' && this.icon) this.icon.sprite = data.MainImage;
    this.currencyAmount?.SetText(reward.amount);
  }

  UpdateRewardAmount(amount, playFeedbacks = false) {
    this.currencyAmount?.SetText(amount);
    if (playFeedbacks) this.updateRewardFeedbacks?.PlayFeedbacks();
  }
}

export class UI_CardRewardComponent extends UI_BaseRewardComponent {
  static typeName = 'UI_CardRewardComponent';

  SetRewardUI(reward, data) {
    let id = 0;
    if (data?.kind === 'UnlockCardRewardAsset' || data?.kind === 'CardRewardAsset') {
      id = parseInt(reward.extraData, 10);
      if (Number.isNaN(id)) return;
    } else if (data?.kind === 'UnlockRandomCardRewardAsset') id = cardIdForRank(this.rank) ?? 0;
    const card = CardService.get(id);
    if (!card || !card.IsRankCard) return;
    if (this.image) this.image.sprite = cardSprite(card, card.Type === CardType.Vehicle ? 0 : 3);
    this.nameText?.SetText(card.Label);
    this.typeText?.SetText(localizeSingular(card.Type));
  }
}

export class UI_UnlockRandomCardRewardComponent extends UI_BaseRewardComponent {
  static typeName = 'UI_UnlockRandomCardRewardComponent';

  SetRewardUI(reward, data) {
    if (data?.kind !== 'UnlockRandomCardRewardAsset') return;
    const card = this.TryGetUnlockedCard();
    if (card) {
      if (this.image) this.image.sprite = cardSprite(card, card.Type === CardType.Vehicle ? 0 : 3);
    } else {
      const t = parseInt(reward.extraData, 10);
      const icon = Meta.data.typeIcons?.[t];
      if (!Number.isNaN(t) && this.image && icon) this.image.sprite = UISprites.byName(icon);
    }
  }

  /** TryGetUnlockedCard(out card): the card the random rank reward resolved to, or null */
  TryGetUnlockedCard() {
    const id = cardIdForRank(this.rank);
    return id === null ? null : CardService.get(id);
  }
}

export class UI_RandomCardRewardComponent extends UI_BaseRewardComponent {
  static typeName = 'UI_RandomCardRewardComponent';

  SetRewardUI(reward, data) {
    if (data?.kind === 'RandomCardRewardAsset') this.amount?.SetText(reward.amount);
  }
}

export class UI_WorldUnlockRewardComponent extends UI_BaseRewardComponent {
  static typeName = 'UI_WorldUnlockRewardComponent';

  CanAssignReward(reward, data) {
    if (data?.kind !== 'UnlockRewardAsset') return false;
    if (!super.CanAssignReward(reward, data)) return false;
    return hexInts(this.features).includes(unlockExtraData(reward.extraData).unlockType);
  }

  SetRewardUI(reward, data) {
    if (data?.kind !== 'UnlockRewardAsset') return;
    const d = unlockExtraData(reward.extraData);
    if (d.unlockType === UnlockTypeEnum.World) {
      this.worldContainer?.SetActive(true);
      this.levelContainer?.SetActive(false);
      this.worldNumberText?.SetText(d.worldID + 1);
    } else {
      this.worldContainer?.SetActive(false);
      this.levelContainer?.SetActive(true);
      const term = d.unlockType === UnlockTypeEnum.LevelDifficultyEasy ? this.easyDifficultyText : d.unlockType === UnlockTypeEnum.LevelDifficultyMedium ? this.mediumDifficultyText : d.unlockType === UnlockTypeEnum.LevelDifficultyHard ? this.hardDifficultyText : null;
      if (term) this.difficultyText?.SetText(localize(term));
    }
    const vs = SettingsContainer.Instance.WorldSettings[d.worldID]?.visualSettings;
    if (!vs) return;
    if (this.worldIcon) this.worldIcon.sprite = vs.worldSelectIcon;
    if (this.worldIconBorder) this.worldIconBorder.color = Color.from(vs.uiHighlightColor);
  }
}

export class UI_FeatureRewardComponent extends UI_BaseRewardComponent {
  static typeName = 'UI_FeatureRewardComponent';

  CanAssignReward(reward, data) {
    const can = super.CanAssignReward(reward, data);
    if (data?.UniqueName === 'UnlockReward' && can) {
      const t = unlockExtraData(reward.extraData).unlockType;
      return (this.features || []).some((f) => f.unlockType === t);
    }
    return false;
  }

  SetRewardUI(reward, data) {
    if (data?.kind !== 'UnlockRewardAsset') return;
    const t = unlockExtraData(reward.extraData).unlockType;
    const f = (this.features || []).find((x) => x.unlockType === t);
    if (f && this.featureImage) this.featureImage.sprite = f.icon;
  }
}

export class UI_LootboxRewardComponent extends UI_BaseRewardComponent {
  static typeName = 'UI_LootboxRewardComponent';

  SetRewardUI(reward, data) {
    if (data?.kind !== 'LootboxRewardAsset') return;
    const box = LootboxService.box(reward.extraData);
    if (!box) {
      console.warn('Lootbox Reward Component: no lootbox', reward.extraData);
      return;
    }
    const art = LootboxService.art(box.type);
    if (art?.sprite && this.icon) this.icon.sprite = UISprites.byName(art.sprite);
  }
}

for (const cls of [UI_BaseRewardComponent, UI_CurrencyRewardComponent, UI_CardRewardComponent, UI_UnlockRandomCardRewardComponent, UI_RandomCardRewardComponent, UI_WorldUnlockRewardComponent, UI_FeatureRewardComponent, UI_LootboxRewardComponent]) registerComponent(cls);

void typeName;
