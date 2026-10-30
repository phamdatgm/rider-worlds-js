// Garage (Meta screen): collection tabs, card grid, inspected card + rank (skin) selection, the 3D effect
// previews on the menu bike (VehicleMovingPreview & co) and the GameCardService selection -> Player wiring.
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { EventAction, WaitForSeconds, Time } from '../engine/core.js';
import { registerComponent, Instantiate, getRuntimeSO } from '../engine/instantiate.js';
import { AnimationCurve, unityEuler } from '../engine/math.js';
import { Assets } from '../engine/assets.js';
import { Color } from '../ugui/graphic.js';
import { UISprites } from '../ugui/sprites.js';
import { Meta } from '../meta/data.js';
import { CardService, CardType, Card, RANK_TYPES } from '../meta/cards.js';
import { WorldManager as Worlds } from '../meta/worlds.js';
import { Game } from '../game/state.js';
import { setupCards, loadCards } from '../game/game.js';
import { PlayerVehicle, TrailEffect } from '../game/player.js';
import { localize } from './common.js';
import { AudioSampleID, CurrencyService, CurrencyType } from './services.js';
import { MainMenuPage, MainMenuManager, UI_WorldNavButtons } from './home.js';
import { UIStatics } from './statics.js';

// ---------------------------------------------------------------- card system helpers (CW.CardSystem)

/** IRankCard.RARITY_TABLE */
export const RARITY_TABLE = [0, 1, 2, 3];

const RARITY_TERMS = ['Rarity/Common', 'Rarity/Rare', 'Rarity/Epic', 'Rarity/Legendary', 'Rarity/Special'];

/** CardRarity.Localize() */
export function localizeRarity(r) {
  return localize(RARITY_TERMS[r] || '');
}

/** GameCardSettings.Instance.uiCardSettings.GetRarityData(rarity) */
export function rarityData(r) {
  const d = Meta.data?.rarity?.[r];
  const c = d?.color || [1, 1, 1];
  return { main: new Color(c[0], c[1], c[2], c[3] ?? 1) };
}

/** LocalizedString.Replace(params): {[i]} placeholders */
export function replaceTerm(term, ...data) {
  let s = localize(term);
  data.forEach((v, i) => {
    s = s.split(`{[${i}]}`).join(String(v));
  });
  return s;
}

function cardAsset(card) {
  if (!card._asset) {
    const id = Object.keys(Assets.so).find((k) => k.endsWith(`/${card.def.name}`));
    card._asset = id ? getRuntimeSO(id) : null;
  }
  return card._asset;
}

// IRankCard / IGameCard members the garage uses
Object.defineProperties(Card.prototype, {
  GameAsset: {
    get() {
      const self = this;
      return {
        get Label() {
          const a = cardAsset(self);
          const t = a?.localizedLabel?.mTerm;
          const s = t ? localize(t) : '';
          return s && s !== t ? s : self.def.label;
        },
        get UnlocksInWorldUI() {
          return self.UnlocksInWorldID + 1;
        },
      };
    },
  },
  UIRarityData: {
    get() {
      return rarityData(this.Rarity);
    },
  },
});

/** sprite of a rank image (the card SO references the UI atlas sprites) */
Card.prototype.GetImageSprite = function (r) {
  const a = cardAsset(this);
  if (a) {
    const ref = r > 0 && a.rankImages?.[r - 1] ? a.rankImages[r - 1] : a.image;
    const s = UISprites.get(ref);
    if (s) return s;
  }
  return UISprites.byName(this.GetImage(r));
};

/** card collection order of the CardDatabase (Cards.asset) */
let databaseOrder = null;
function collection(type) {
  if (!databaseOrder) {
    databaseOrder = new Map();
    const db = Object.values(Assets.so).find((v) => v?.$name === 'Cards' && Array.isArray(v.cards || v.assets || v.items));
    const list = db ? db.cards || db.assets || db.items : [];
    list.forEach((r, i) => {
      const name = (r?.$so || '').split('/').pop();
      if (name) databaseOrder.set(name, i);
    });
  }
  const cards = CardService.ofType(type).slice();
  if (databaseOrder.size) cards.sort((a, b) => (databaseOrder.get(a.def.name) ?? 1e9) - (databaseOrder.get(b.def.name) ?? 1e9));
  return cards;
}

/** stable OrderByDescending(IsUsable).ThenByDescending(Total).ThenByDescending(Rarity) */
function orderCards(cards) {
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Number(b.c.IsUsable) - Number(a.c.IsUsable) || b.c.Total - a.c.Total || b.c.Rarity - a.c.Rarity || a.i - b.i)
    .map((x) => x.c);
}

// ---------------------------------------------------------------- GameCardService selection -> Player

const PLAYER_UPDATE = {
  [CardType.Vehicle]: 'OnVehicleChanged',
  [CardType.VehicleColor]: 'OnColorChanged',
  [CardType.VehicleTrail]: 'OnTrailEffectChanged',
  [CardType.VehicleDeath]: 'OnDeathEffectChanged',
  [CardType.VehicleLanding]: 'OnLandingEffectChanged',
};

function menuPlayer() {
  const p = Game.manager?.RunState?.PlayerState?.Player || Game.manager?.player;
  return p && !p.gameObject._destroyed ? p : null;
}

let applyToken = 0;
/** prefabs of the card items are loaded on demand (the menu only preloads the equipped ones) */
async function applyCosmetics(type, overrides = {}, cards = []) {
  const types = [].concat(type);
  const token = ++applyToken;
  const need = cards.filter((c) => (c.def.items || []).some((it) => it?.$prefab && !Assets.prefabs.has(it.$prefab)));
  if (need.length) await loadCards(need);
  if (token !== applyToken) return;
  setupCards(overrides);
  const p = menuPlayer();
  if (!p) return;
  for (const t of types) {
    const m = PLAYER_UPDATE[t];
    if (m && p[m]) p[m]();
  }
  if (types.includes(CardType.Vehicle)) p.TrailEffect?.Show?.(false);
}

/** every collection at once: the cards are equipped per world, so a world change swaps them all */
export function applyWorldCosmetics() {
  return applyCosmetics(RANK_TYPES, {}, RANK_TYPES.map((t) => CardService.Equipped(t)).filter(Boolean));
}
Worlds.CurrentWorldChanged.AddListener(() => applyWorldCosmetics());

/** GameCardService.onVehicleChanged / onColorChanged ... (selection or rank of the selected card changed) */
CardService.onEquippedChanged.AddListener((type) => {
  applyCosmetics(type, {}, [CardService.Equipped(type)].filter(Boolean));
});

export const GameCardService = {
  get Instance() {
    return this;
  },
  Selected(type) {
    return CardService.Equipped(type);
  },
  get SelectedVehicleCard() {
    return CardService.Equipped(CardType.Vehicle);
  },
  get SelectedColorCard() {
    return CardService.Equipped(CardType.VehicleColor);
  },
  get SelectedTrailCard() {
    return CardService.Equipped(CardType.VehicleTrail);
  },
  get SelectedDeathCard() {
    return CardService.Equipped(CardType.VehicleDeath);
  },
  get SelectedLandingCard() {
    return CardService.Equipped(CardType.VehicleLanding);
  },
  Select(card) {
    CardService.Equip(card);
  },
  IsSelected(card) {
    return CardService.IsEquipped(card);
  },
};

/** Player.SetVehicle / SetColors / ... with a not owned rank (garage preview) */
function previewOnPlayer(card, rank) {
  return applyCosmetics(card.Type, { [card.Type]: { card, rank } }, [card]);
}

// PlayerVehicle.SetLocalPositionAndRotation / TrailEffect.SetPreviewParticles
PlayerVehicle.prototype.SetLocalPositionAndRotation = function (pos, angle) {
  const base = this._localPosition || new THREE.Vector3();
  this.transform.localPosition = new THREE.Vector3(pos.x + base.x, pos.y + base.y, base.z - (pos.z || 0));
  this.transform.localRotation = unityEuler(0, 0, angle);
};
TrailEffect.prototype.SetPreviewParticles = function (status) {
  for (const ps of this.particleSystems || []) {
    if (!ps) continue;
    if (status) ps.Play();
    else ps.Stop();
  }
};

// ---------------------------------------------------------------- VehicleMovingPreview ([Serializable])

const v3 = (a) => new THREE.Vector3(a?.[0] || 0, a?.[1] || 0, a?.[2] || 0);
const lerpAngle = (a, b, t) => {
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return a + d * Math.min(1, Math.max(0, t));
};

export class VehicleMovingPreview {
  constructor(data = {}) {
    this.loopCount = data.loopCount ?? 0;
    this.startPos = v3(data.startPos);
    this.targetPos = v3(data.targetPos);
    this.startAngle = data.startAngle ?? 179;
    this.targetAngle = data.targetAngle ?? 0;
    this.movementDuration = data.movementDuration ?? 0.5;
    this.movementCurve = AnimationCurve.from(data.movementCurve);
    this.repeatDelay = data.repeatDelay ?? 3;
    this.data = data;
    this.coroutine = null;
    this.player = null;
  }

  static from(data) {
    return data instanceof VehicleMovingPreview ? data : new this(data || {});
  }

  IsActive() {
    return !!this.coroutine && !!this.player && !this.player.gameObject._destroyed;
  }

  StartPreview(player) {
    if (!player) return;
    this.player = player;
    this.StopPreview();
    this.coroutine = player.StartCoroutine(this.Effect());
  }

  StopPreview() {
    if (this.coroutine) {
      if (this.player && !this.player.gameObject._destroyed) this.player.StopCoroutine(this.coroutine);
      this.coroutine = null;
    }
    this.player?.CarVisuals?.SetLocalPositionAndRotation(new THREE.Vector3(), 0);
  }

  *Effect() {
    let shouldLoop = true;
    let loops = this.loopCount;
    while (shouldLoop) {
      const cv = () => this.player?.CarVisuals;
      cv()?.SetLocalPositionAndRotation(this.startPos, this.startAngle);
      this.OnStartFall();
      let t = 0;
      while (t < 1) {
        yield null;
        t += Time.deltaTime / this.movementDuration;
        const v = this.movementCurve.Evaluate(t);
        cv()?.SetLocalPositionAndRotation(this.startPos.clone().lerp(this.targetPos, v), lerpAngle(this.startAngle, this.targetAngle, t));
      }
      cv()?.SetLocalPositionAndRotation(this.targetPos, this.targetAngle);
      this.OnEndFall();
      if (this.loopCount > 0) {
        loops--;
        if (loops <= 0) shouldLoop = false;
      }
      if (shouldLoop) yield new WaitForSeconds(this.repeatDelay);
    }
    this.coroutine = null;
    this.StopPreview();
  }

  OnStartFall() {}

  OnEndFall() {}
}

export class TrailEffectPreview extends VehicleMovingPreview {
  StartPreview(player) {
    super.StartPreview(player);
    player?.TrailEffect?.gameObject.SetActive(true);
  }

  StopPreview() {
    super.StopPreview();
    this.player?.TrailEffect?.gameObject.SetActive(false);
  }

  OnStartFall() {
    this.player?.TrailEffect?.SetPreviewParticles(true);
  }

  OnEndFall() {
    this.player?.TrailEffect?.SetPreviewParticles(false);
  }
}

export class LandingEffectPreview extends VehicleMovingPreview {
  OnEndFall() {
    // restarted on every landing: Play() on a system still playing keeps it as it is, so only the first landing showed
    this.player?.PerfectLandingEffect?.particlePlay?.BoundParticleSystem?.Stop?.(true, true);
    this.player?.PerfectLandingEffect?.PlayLandingParticle?.();
  }
}

export class DeathEffectPreview extends VehicleMovingPreview {
  StartPreview(player) {
    super.StartPreview(player);
    const prefab = player?.playerDeathParticle?.ParticlesPrefab;
    if (prefab) {
      try {
        this.deathParticle = Instantiate(prefab, player.transform);
        this.deathParticle?.Stop?.();
      } catch (e) {
        console.warn('death preview particle', e.message);
      }
    }
  }

  StopPreview() {
    super.StopPreview();
    if (this.deathParticle && !this.deathParticle.gameObject._destroyed) Destroy(this.deathParticle.gameObject);
    this.deathParticle = null;
    if (this.explosionInstance && !this.explosionInstance.gameObject._destroyed) Destroy(this.explosionInstance.gameObject);
    this.explosionInstance = null;
    this.player?.CarVisuals?.gameObject.SetActive(true);
  }

  OnStartFall() {
    if (this.explosionInstance && !this.explosionInstance.gameObject._destroyed) Destroy(this.explosionInstance.gameObject);
    this.explosionInstance = null;
    this.player?.CarVisuals?.gameObject.SetActive(true);
  }

  OnEndFall() {
    const p = this.player;
    if (!p) return;
    const prefab = this.data.playerExplosionPrefab;
    if (prefab) {
      try {
        this.explosionInstance = Instantiate(prefab, p.transform);
      } catch (e) {
        console.warn('death preview explosion', e.message);
      }
    }
    // restarted on every drop: Play() on a system still playing (a looping part) keeps it as it is, so only the
    // first drop of the preview burst
    this.deathParticle?.Stop?.(true, true);
    this.deathParticle?.Play?.();
    p.CarVisuals?.gameObject.SetActive(false);
  }
}

// menu bike drives out / in when switching worlds (UI_WorldNavButtons.vehicleMoveOut / vehicleMoveIn)
function worldNavPreview(key) {
  const nav = Game.manager && [...(MainMenuManager.Instance?.gameObject.GetComponentsInChildren('UI_WorldNavButtons', true) || [])][0];
  const data = nav?._data?.[key];
  if (!nav._previews) nav._previews = {};
  if (!nav._previews[key]) nav._previews[key] = TrailEffectPreview.from(data);
  return nav._previews[key];
}

UIStatics.vehicleMoveOut = function* (player) {
  let pv = null;
  try {
    pv = worldNavPreview('vehicleMoveOut');
  } catch {
    return;
  }
  pv.StartPreview(player);
  while (pv.IsActive()) yield null;
};

UIStatics.vehicleMoveIn = (player) => {
  try {
    worldNavPreview('vehicleMoveIn').StartPreview(player);
  } catch {
    // no menu (the bike returns with the scene)
  }
};

// ---------------------------------------------------------------- UI_MetaScreen

export class UI_MetaScreen extends MainMenuPage {
  static typeName = 'UI_MetaScreen';

  constructor() {
    super();
    this.currentTabIndex = 0;
    this.forceTab = false;
  }

  get IsBusy() {
    return false;
  }

  get CameraRig() {
    return Game.manager?.CameraRig || Game.cameraRig;
  }

  Initialize() {
    (this.buttons || []).forEach((b, i) => b?.Initialize(i, this));
    this._claimed = () => this.LootboxClaimed();
    MainMenuManager.Instance?.LootboxOpener?.onLootboxClaimed?.AddListener(this._claimed);
  }

  OnDestroy() {
    MainMenuManager.Instance?.LootboxOpener?.onLootboxClaimed?.RemoveListener(this._claimed);
  }

  LootboxClaimed() {
    if (this.gameObject.activeInHierarchy) {
      this.OnDisable();
      this.OnEnable();
    }
  }

  OnEnable() {
    this.CameraRig?.SwitchToMetaScreen();
    for (const b of this.buttons || []) b?.UpdateGameNotification();
    this.forceTab = true;
    const b = this.buttons[this.currentTabIndex];
    b.ForceActive();
    this.ranks?.SetMetaCardButtonReference(b);
  }

  OnDisable() {
    this.CameraRig?.MetaScreenSwitchToMenu();
    this.metaTab?.CleanUp();
  }

  MetaTabButtonPressed(index) {
    if (this.forceTab) this.forceTab = false;
    else if (this.currentTabIndex === index) return;
    this.buttons[this.currentTabIndex].SetHighlighted(false);
    this.currentTabIndex = index;
    this.buttons[index].SetHighlighted(true);
    this.ranks?.SetMetaCardButtonReference(this.buttons[this.currentTabIndex]);
    this.metaTab.CleanUp();
    this.metaTab.Initialize(this.buttons[this.currentTabIndex]);
  }
}

// ---------------------------------------------------------------- tab buttons

function unseenOf(type) {
  if (type === CardType.Vehicle) return collection(type).filter((c) => c.IsUsable && c.IsUnseen).reduce((a, c) => a + c.UnseenCount, 0) > 0;
  return collection(type).some((c) => !c.IsLocked && c.IsUnseen);
}

export class UI_MetaTabButton extends MonoBehaviour {
  static typeName = 'UI_MetaTabButton';

  constructor() {
    super();
    this.isActive = false;
    this.index = 0;
  }

  get CardType() {
    return this.cardType;
  }

  Initialize(i, parent) {
    this.index = i;
    this.controller = parent;
    this._press = () => this.ButtonPressed();
    this.button.onClick.AddListener(this._press);
  }

  ForceActive() {
    this.isActive = true;
    this.UpdateActiveState();
    this.ButtonPressed();
  }

  SetHighlighted(v) {
    this.isActive = v;
    this.UpdateActiveState();
  }

  OnItemPressed() {
    this.UpdateGameNotification();
  }

  UpdateGameNotification() {
    this.gameNotification?.UpdatePingObject(unseenOf(this.cardType));
  }

  ButtonPressed() {
    this.controller.MetaTabButtonPressed(this.index);
  }

  UpdateActiveState() {
    if (this.background) this.background.overrideSprite = this.isActive ? this.selectedBackgroundSprite : null;
    if (this.icon) this.icon.overrideSprite = this.isActive ? this.selectedSprite : null;
    this.tabTitle?.SetActive(this.isActive);
  }
}

// ---------------------------------------------------------------- tab content (card grid)

export class UI_MetaTabBase extends MonoBehaviour {
  static typeName = 'UI_MetaTabBase';

  constructor() {
    super();
    this.lastGridBottomPadding = 200;
    this.worldText = { mTerm: 'UI/WorldSelect/World' };
    this.toDestroy = [];
    this.usableCards = new Map();
    this.lastSelectedCard = null;
    this._spawn = null;
  }

  GetCardButton(id) {
    return this.usableCards.get(id) || null;
  }

  CardPressed() {}

  HandleSpawnCard() {
    return null;
  }

  SpawnCards(cards) {
    this.lastSelectedCard = null;
    const self = this;
    this._spawn = this.StartCoroutine((function* () {
      self.usableCards.clear();
      let lastGrid = null;
      // one world at a time: the world shown on Home (its navigation's selection, a locked world too)
      const selected = UI_WorldNavButtons.localWorldSelected;
      const shown = selected >= 0 ? selected : Worlds.CurrentWorldIndex;
      for (let i = 0; i < Worlds.HighestWorldIndex + 1; i++) {
        if (i !== shown) continue;
        const worldCards = cards.filter((c) => c.UnlocksInWorldID === i);
        const divider = Instantiate(self.dividerPrefab, self.cardParent);
        divider.GetComponentInChildren('SetTextCore')?.SetText(replaceTerm(self.worldText, i + 1));
        const grid = Instantiate(self.gridContainerPrefab, self.cardParent);
        lastGrid = grid;
        self.toDestroy.push(divider, grid);
        for (const card of worldCards) {
          const ui = self.HandleSpawnCard(card, grid.transform);
          if (card.IsUsable) self.usableCards.set(card.ID, ui);
          yield null;
        }
      }
      const gl = lastGrid?.GetComponent('GridLayoutGroup');
      if (gl) gl.m_Padding = { ...gl.m_Padding, m_Bottom: self.lastGridBottomPadding };
      self._spawn = null;
    })());
  }

  CleanUp() {
    if (this._spawn) this.StopCoroutine(this._spawn);
    this._spawn = null;
    for (let i = this.toDestroy.length - 1; i >= 0; i--) Destroy(this.toDestroy[i]);
    this.toDestroy.length = 0;
  }
}

export class UI_MetaTab extends UI_MetaTabBase {
  static typeName = 'UI_MetaTab';

  constructor() {
    super();
    this.unlocksAtWorldText = { mTerm: 'UI/Meta/UnlocksInWorld' };
    this.collectCardsText = { mTerm: 'UI/Meta/CollectCards' };
    this.buttonParent = null;
  }

  get Player() {
    return menuPlayer();
  }

  get CameraRig() {
    return Game.manager?.CameraRig || Game.cameraRig;
  }

  previews() {
    if (!this._previews) {
      this._previews = {
        landing: LandingEffectPreview.from(this._data?.landingEffectPreview),
        death: DeathEffectPreview.from(this._data?.deathEffectPreview),
        trail: TrailEffectPreview.from(this._data?.trailEffectPreview),
      };
    }
    return this._previews;
  }

  Initialize(button) {
    this.buttonParent = button;
    this.HandleStartPreview();
    const cr = this.CameraRig;
    let cards;
    switch (button.CardType) {
      case CardType.Vehicle:
        this.cardPrefab = this.vehicleCardPrefab;
        cr?.MetaScreenSwitchToVehiclePreview();
        break;
      case CardType.VehicleColor:
        this.cardPrefab = this.colorCardPrefab;
        cr?.MetaScreenSwitchToVehiclePreview();
        break;
      case CardType.VehicleTrail:
        this.cardPrefab = this.fxCardPrefab;
        cr?.MetaScreenSwitchToTrailEffectsPreview();
        break;
      case CardType.VehicleDeath:
        this.cardPrefab = this.fxCardPrefab;
        cr?.MetaScreenSwitchToDeathEffectsPreview();
        break;
      case CardType.VehicleLanding:
        this.cardPrefab = this.fxCardPrefab;
        cr?.MetaScreenSwitchToLandEffectsPreview();
        break;
      default:
        return;
    }
    cards = collection(button.CardType);
    this.inspectCard?.UpdateCard(GameCardService.Selected(button.CardType));
    // the previews of every card of the tab instantiate their prefabs on demand
    loadCards(cards.filter((c) => c.IsUsable)).catch(() => {});
    this.SpawnCards(orderCards(cards));
  }

  CleanUp() {
    super.CleanUp();
    this.inspectCard?.Cleanup();
    this.HandleEndPreview();
  }

  previewFor(type) {
    const p = this.previews();
    if (type === CardType.VehicleLanding) return p.landing;
    if (type === CardType.VehicleDeath) return p.death;
    if (type === CardType.VehicleTrail) return p.trail;
    return null;
  }

  HandleStartPreview() {
    if (!this.buttonParent) return;
    const pv = this.previewFor(this.buttonParent.CardType);
    if (pv && this.Player) pv.StartPreview(this.Player);
  }

  HandleEndPreview() {
    if (!this.buttonParent) return;
    const pv = this.previewFor(this.buttonParent.CardType);
    if (pv?.player) pv.StopPreview();
  }

  HandleSpawnCard(card, parent) {
    const ui = Instantiate(this.cardPrefab, parent);
    ui.SetupCollection(card, this);
    if (GameCardService.IsSelected(card)) {
      this.lastSelectedCard = ui;
      ui.UpdateSelectedState(true);
    }
    return ui;
  }

  CardPressed(ui) {
    const card = ui.Card;
    if (card.IsLocked) {
      ui.PlayUnlocksFeedbacks();
      MainMenuManager.PushTooltip(this.unlocksAtWorldText, String(card.GameAsset.UnlocksInWorldUI));
      return;
    }
    if (!card.IsUsable) {
      MainMenuManager.PushTooltip(this.collectCardsText, String(card.UIMaxCards - card.UICurrentCards));
      return;
    }
    if (card.IsRankUnseen(0)) card.SetUnseen(0, false);
    ui.UpdateGameNotification();
    this.buttonParent.UpdateGameNotification();
    if (ui === this.lastSelectedCard) return;
    ui.UpdateSelectedState(true);
    this.lastSelectedCard?.UpdateSelectedState(false);
    this.lastSelectedCard = ui;
    GameCardService.Select(card);
    const pv = this.previewFor(card.Type);
    if (pv && this.Player) pv.StartPreview(this.Player);
    this.inspectCard?.UpdateCard(card);
  }
}

export class UI_MetaGridLayout extends MonoBehaviour {
  static typeName = 'UI_MetaGridLayout';
}

// ---------------------------------------------------------------- card tile

const LOCKED_IN_UNLOCKED_WORLD_OVERLAY_ALPHA = 0.8862745;

export class UI_MetaCard extends MonoBehaviour {
  static typeName = 'UI_MetaCard';

  constructor() {
    super();
    this.usedInShop = 0;
    this.rankLockedColor = [0.6, 0.6, 0.6, 0.6];
    this.Card = null;
    this.Rank = -1;
  }

  SetupCollection(card, parent, animateFillbar = false) {
    this.controller = parent;
    this.Card = card;
    this.HandleFillbar(!card.IsLocked, card.IsMaxedOut, card.UICurrentCards, card.UIMaxCards, animateFillbar);
    this.SetRarity(card.Rarity, true);
    this.UpdateIconColor(!card.IsLockedInWorld, Color.black);
    this.UpdateLockedOverlayState(card.IsLocked);
    this.UpdateUnlocksAtText(card.IsLocked, this.unlocksAtWorldText, card.UnlocksInWorldID);
    this.UpdateSelectedState(false);
    this.UpdateIcon();
    if (parent) {
      this.UpdateGameNotification();
      this.addClick();
    }
  }

  SetupCardPreview(card, count, animateFillbar = false) {
    this.cardCountText?.SetText(count);
    this.SetupCollection(card, null, animateFillbar);
  }

  SetupRank(card, rarity, index, parent) {
    this.controller = parent;
    this.Card = card;
    this.Rank = index;
    const unlocked = card.IsRankUnlocked(index);
    this.UpdateUnlocksAtText(!unlocked, this.unlocksAtLevelText, index);
    this.SetRarity(rarity, false);
    this.UpdateIconColor(unlocked, Color.from(this.rankLockedColor));
    this.UpdateSelectedState(false);
    this.UpdateGameNotification();
    this.claimStarsObject?.SetActive(card.IsRankUnseen(this.Rank));
    if (this.icon) this.icon.sprite = card.GetImageSprite(index);
    this.addClick();
  }

  addClick() {
    // AddLazyListener: never twice
    if (!this._click) this._click = () => this.OnClick();
    this.button.onClick.RemoveListener(this._click);
    this.button.onClick.AddListener(this._click);
  }

  UpdateGameNotification() {
    let unseen = false;
    const c = this.Card;
    if (!c.IsLocked && c.IsUsable) {
      if (this.Rank === -1) unseen = c.IsUnseen;
      else if (this.Rank !== 0) unseen = c.IsRankUnseen(this.Rank);
    }
    this.gameNotification?.UpdatePingObject(unseen);
  }

  PlayUnlocksFeedbacks() {
    this.unlocksFeedbacks?.PlayFeedbacks();
  }

  PlayClaimStarFeedbacks() {
    this.claimStarsFeedbacks?.PlayFeedbacks();
  }

  HandleFillbar(show, maxed, current, target, animate = false) {
    if (!show) this.fillbar?.gameObject.SetActive(false);
    if (maxed) {
      if (this.fillBarFill) this.fillBarFill.fillAmount = 1;
      this.fillBarText?.SetTextNoFormat(localize(this.maxText));
    } else this.fillbar?.SetFill(current, target, animate);
  }

  UpdateUnlocksAtText(show, term, index) {
    if (show) {
      this.fillbar?.gameObject.SetActive(false);
      this.unlocksAtObject?.SetActive(true);
      this.unlocksAtText?.SetText(replaceTerm(term, index + 1));
    } else {
      this.fillbar?.gameObject.SetActive(true);
      this.unlocksAtObject?.SetActive(false);
    }
  }

  UpdateIconColor(showIcon, lockedColor) {
    if (!this.usedInShop && this.icon) this.icon.color = showIcon ? Color.white : lockedColor;
  }

  UpdateLockedOverlayState(locked) {
    const o = this.lockedOverlay;
    if (!o) return;
    o.gameObject.SetActive(locked);
    o.color = o.color.withAlpha(this.Card.IsLockedInWorld ? 1 : LOCKED_IN_UNLOCKED_WORLD_OVERLAY_ALPHA);
  }

  UpdateSelectedState(sel) {
    this.selectedBorder?.gameObject.SetActive(sel);
    this.selectedOverlay?.gameObject.SetActive(sel);
  }

  UpdateIcon() {
    if (this.icon) this.icon.sprite = this.Card.GetImageSprite(this.Card.HighestUnlockedRank);
    if (this.Card.IsLocked) this.ResizeIcon();
  }

  ResizeIcon() {
    const rt = this.icon.rectTransform;
    rt.SetBottom(-rt.GetTop());
  }

  OnClick() {
    this.controller?.CardPressed(this);
    (this.Card.IsUsable ? AudioSampleID.UI_UnlockedBike : AudioSampleID.UI_LockedBike).Play();
  }

  SetRarity(rarity, showRarityObject) {
    const rc = rarityData(rarity).main;
    this.rarityColor = rc;
    const c = this.Card;
    if (showRarityObject) {
      this.setNameText?.SetColor(rc);
      this.setNameText?.SetText(c.GameAsset.Label);
      this.nameObject?.SetActive(!c.IsLocked);
    }
    if (this.border) {
      if (c.IsLockedInWorld) this.border.color = Color.from(this.lockedInLockedWorldColor);
      else if (c.IsLocked) this.border.color = Color.from(this.lockedInUnlockedWorldColor);
      else this.border.color = rc;
    }
    if (c.IsLocked) {
      if (this.background) this.background.color = Color.white;
      if (this.fxUnderlay) this.fxUnderlay.color = Color.white;
    } else {
      if (this.background) this.background.color = rc;
      if (this.fxUnderlay) this.fxUnderlay.color = rc;
    }
    if (this.fillBarFill) this.fillBarFill.color = rc;
  }
}

// ---------------------------------------------------------------- inspected card (ranks)

export class UI_MetaCardRanks extends MonoBehaviour {
  static typeName = 'UI_MetaCardRanks';

  constructor() {
    super();
    this.isShowingPreview = false;
    this.selectedIndex = 0;
    this.OnClickMetaCardRank = new EventAction();
  }

  get Player() {
    return menuPlayer();
  }

  Initialize(card) {
    this.rankCard = card;
    this.selectedIndex = card.CurrentRank;
    (this.skinCards || []).forEach((sc, i) => {
      sc.SetupRank(card, RARITY_TABLE[i], i, this);
      sc.UpdateSelectedState(card.CurrentRank === i);
    });
    this.ResetPreviewIfActive();
  }

  Cleanup() {
    if (!this.rankCard) return;
    this.OnClickMetaCardRank.RemoveAllListeners();
    this.ResetVisuals();
    this.ResetPreviewIfActive();
  }

  ResetVisuals() {
    applyCosmetics(this.rankCard.Type, {}, [CardService.Equipped(this.rankCard.Type)].filter(Boolean));
  }

  ResetPreviewIfActive() {
    if (this.isShowingPreview) this.previewHide?.PlayFeedbacks();
    this.isShowingPreview = false;
  }

  SetMetaCardButtonReference(b) {
    this.button = b;
  }

  CardPressed(ui) {
    if (ui.Rank === this.selectedIndex) return;
    this.OnClickMetaCardRank.Invoke(RARITY_TABLE[ui.Rank]);
    const card = this.rankCard;
    if (card.IsRankUnlocked(ui.Rank)) {
      if (this.isShowingPreview) {
        this.isShowingPreview = false;
        this.previewHide?.PlayFeedbacks();
        this.ResetVisuals();
      }
      if (card.IsRankUnseen(ui.Rank)) {
        this.SpawnReward(ui.transform);
        ui.PlayClaimStarFeedbacks();
      }
      if (card.IsRankUnseen(ui.Rank)) card.SetUnseen(ui.Rank, false);
      ui.UpdateGameNotification();
      this.button?.UpdateGameNotification();
      this.metaTab?.GetCardButton(card.ID)?.UpdateGameNotification();
      this.UpdateSelectedState(ui.Rank);
      card.SetRank(ui.Rank);
    } else {
      if (!this.isShowingPreview) {
        this.isShowingPreview = true;
        this.previewShow?.PlayFeedbacks();
      }
      this.UpdateSelectedState(ui.Rank);
      previewOnPlayer(ui.Card, ui.Rank);
    }
    this.metaTab?.HandleEndPreview();
    this.metaTab?.HandleStartPreview();
  }

  UpdateSelectedState(rank) {
    this.skinCards[this.selectedIndex]?.UpdateSelectedState(false);
    this.selectedIndex = rank;
    this.skinCards[rank]?.UpdateSelectedState(true);
  }

  SpawnReward(t) {
    const rh = MainMenuManager.Instance?.RewardHandler;
    rh?.OverrideParticleStart(5, t);
    rh?.SpawnReward([{ amount: 1, id: 'Currency_Star', rewardID: 'Currency_Star', rewardType: 5 }]);
    CurrencyService.Instance.GetCurrency(CurrencyType.Star).Gain(1, 'Unknown');
  }
}

export class UI_MetaCardLevel extends MonoBehaviour {
  static typeName = 'UI_MetaCardLevel';

  Initialize(card) {
    const fb = this.levelFillbar;
    if (fb?.fill) fb.fill.color = card.UIRarityData.main;
    if (card.IsMaxedOut) {
      if (fb?.fill) fb.fill.fillAmount = 1;
      fb?.txtElement?.SetTextNoFormat(localize(this.maxText || { mTerm: 'UI/Max' }));
    } else fb?.SetFill(card.UICurrentCards, card.UIMaxCards, false);
    this.gameObject.SetActive(true);
  }
}

export class UI_InspectCard extends MonoBehaviour {
  static typeName = 'UI_InspectCard';

  UpdateCard(card) {
    if (!card) return;
    const rarity = RARITY_TABLE[card.CurrentRank];
    this.setRarityLabel?.SetColor(rarityData(rarity).main);
    this.setRarityLabel?.SetText(localizeRarity(rarity));
    this.setName?.SetTextNoFormat(card.GameAsset.Label);
    this.cardRanks?.Initialize(card);
    if (!this._rank) this._rank = (r) => this.OnMetaCardRankChanged(r);
    this.cardRanks?.OnClickMetaCardRank.AddListener(this._rank);
  }

  OnMetaCardRankChanged(rarity) {
    this.setRarityLabel?.SetColor(rarityData(rarity).main);
    this.setRarityLabel?.SetText(localizeRarity(rarity));
  }

  Cleanup() {
    this.cardRanks?.Cleanup();
  }
}

for (const cls of [UI_MetaScreen, UI_MetaTabButton, UI_MetaTabBase, UI_MetaTab, UI_MetaGridLayout, UI_MetaCard, UI_MetaCardRanks, UI_MetaCardLevel, UI_InspectCard]) registerComponent(cls);
