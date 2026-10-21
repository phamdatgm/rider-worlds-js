// World stats overlay (opened from the world button of the top bar).
import { MonoBehaviour } from '../engine/scene.js';
import { WaitForSeconds, Time } from '../engine/core.js';
import { registerComponent } from '../engine/instantiate.js';
import { Render } from '../engine/render.js';
import { Save } from '../meta/save.js';
import { CardService, CardType } from '../meta/cards.js';
import { Color } from '../ugui/graphic.js';
import { UI_OverlayBase } from './common.js';
import { AudioSampleID, WorldManager, SettingsContainer, ChallengeManager, TimedLevelModeController } from './services.js';

/** CardCollection.GetRanksAvailableInWorld / GetRanksUnlockedInWorld for one card type */
function ranks(type, world) {
  let available = 0;
  let unlocked = 0;
  for (const c of CardService.ofType(type)) {
    if (c.UnlocksInWorldID !== world) continue;
    available += 4;
    if (c.IsUsable) unlocked += c.HighestUnlockedRank + 1;
  }
  return [available, unlocked];
}

export class UI_WorldSelectStatBar extends MonoBehaviour {
  static typeName = 'UI_WorldSelectStatBar';

  constructor() {
    super();
    this.animationLength = 1;
  }

  SetStats(percent, collected, goal, baseColor, completeColor, delay) {
    if (this._co) this.StopCoroutine(this._co);
    this._co = this.StartCoroutine(this.AnimateStat(percent, delay));
    if (this.fillBarImg) this.fillBarImg.color = percent >= 1 ? completeColor : baseColor;
    this.percentageTxt?.SetText(`${collected}/${goal}`);
  }

  *AnimateStat(percent, delay) {
    if (this.fillBarImg) this.fillBarImg.fillAmount = 0;
    yield new WaitForSeconds(delay);
    let p = 0;
    while (p < 1) {
      p += Time.deltaTime * (1 / this.animationLength);
      this.SetStatValues(percent * Math.min(1, p));
      yield null;
    }
    this._co = null;
  }

  SetStatValues(fill) {
    if (this.fillBarImg) this.fillBarImg.fillAmount = fill;
  }
}

export class UI_WorldSelectStatBarHighscore extends UI_WorldSelectStatBar {
  static typeName = 'UI_WorldSelectStatBarHighscore';
}

export class UI_WorldSelectStat extends MonoBehaviour {
  static typeName = 'UI_WorldSelectStat';

  get IsBusy() {
    return !!this._co;
  }

  SetColors(base, complete) {
    this.baseColor = base;
    this.completeColor = complete;
  }

  SetPercentage(p) {
    const c = p >= 1 ? this.completeColor : this.baseColor;
    this.percentageTxt?.SetText(Math.trunc(p * 100));
    this.crownImg?.gameObject.SetActive(p >= 1);
    if (this.crownImg) this.crownImg.color = c;
    if (this.iconImg) this.iconImg.overrideSprite = p >= 1 ? this.completedIcon : null;
    this.gradientImg?.gameObject.SetActive(p >= 1);
    if (this.gradientImg) this.gradientImg.color = c;
  }

  SetStatBar(i, percent, collected, goal, base, complete) {
    const bars = this.statBar || [];
    if (i < bars.length) bars[i]?.SetStats(percent, collected, goal, base, complete, this.animationDelay || 0);
  }

  PrepareUnlockAnimation() {
    this.unlockAnimation?.PlayFeedbacks();
  }

  PlayUnlockAnimation() {
    this._co = this.StartCoroutine(this.AnimateUnlock());
  }

  *AnimateUnlock() {
    this.unlockAnimation?.ResumeFeedbacks();
    yield new WaitForSeconds(this.unlockAnimation?.TotalDuration ?? 0);
    this.unlockParticle?.Play();
    this._co = null;
  }
}

export class UI_WorldStatsMenu extends UI_OverlayBase {
  static typeName = 'UI_WorldStatsMenu';

  static Instance = null;

  constructor() {
    super();
    this.statAnimationLength = 1;
    this.baseColor = Color.white;
    this.statBarBaseColor = Color.white;
    this.completeColor = Color.white;
  }

  get CurrentWorldIndex() {
    return WorldManager.Instance.CurrentWorldIndex;
  }

  Awake() {
    UI_WorldStatsMenu.Instance = this;
    this.closeBtn?.onClick.AddListener(() => this.TryClose());
  }

  OpenFinished() {
    super.OpenFinished();
    Render.hideWorld = true;
  }

  TryOpen() {
    if (!super.TryOpen()) return false;
    this.UpdateWorldData(this.CurrentWorldIndex);
    return true;
  }

  TryClose() {
    if (!super.TryClose()) return false;
    Render.hideWorld = false;
    AudioSampleID.UI_ButtonClick_Close.Play();
    return true;
  }

  OnDestroy() {
    if (UI_WorldStatsMenu.Instance === this) UI_WorldStatsMenu.Instance = null;
  }

  UpdateWorldData(w) {
    const vs = SettingsContainer.Instance.WorldSettings[w].visualSettings;
    this.SetVisuals(vs);
    if (this.backgroundImg) this.backgroundImg.sprite = vs.worldSelectBackground;
    const p = this.UpdateWorldStatData();
    this.headerWorldTxt?.SetText(this.CurrentWorldIndex + 1);
    if (this._headerCo) this.StopCoroutine(this._headerCo);
    this._headerCo = this.StartCoroutine(this.AnimateWorldProgress(p));
    if (this.headerPercentageFill) this.headerPercentageFill.color = p < 1 ? this.baseColor : this.completeColor;
    this.headerPercentageTxt?.SetText(Math.trunc(p * 100));
  }

  SetVisuals(vs) {
    this.completeColor = Color.from(vs.uiHighlightColor);
    if (this.headerBackgroundGradient) this.headerBackgroundGradient.color = this.completeColor;
    for (const s of [this.endlessProgress, this.LevelsProgress, this.collectionProgress]) s?.SetColors(this.baseColor, this.completeColor);
  }

  UpdateWorldStatData() {
    return (this.UpdateEndlessProgress() + this.UpdateLevelProgress() + this.UpdateCollectionProgress()) / 3;
  }

  UpdateEndlessProgress() {
    const w = this.CurrentWorldIndex;
    const hs = Save.endless(w).highScore || 0;
    const mastery = SettingsContainer.Instance.CurrentWorldSettings.worldHighScoreMastery || 1;
    const clamped = Math.max(0, Math.min(hs, mastery));
    const e = this.endlessProgress;
    e?.SetStatBar(0, clamped / mastery, clamped, mastery, this.statBarBaseColor, this.completeColor);
    const cs = ChallengeManager.Instance.GetWorldChallengesStats(w);
    e?.SetStatBar(1, cs.WorldChallengesProgress / cs.WorldChallengesTotal, cs.WorldChallengesProgress, cs.WorldChallengesTotal, this.statBarBaseColor, this.completeColor);
    const p = WorldManager.Instance.GetWorldEndlessProgressPercentage(w);
    e?.SetPercentage(p);
    return p;
  }

  UpdateLevelProgress() {
    const w = this.CurrentWorldIndex;
    const c = TimedLevelModeController.Instance;
    for (const d of [0, 1, 2]) {
      const n = c.GetDifficultyGroupCount(w, d);
      const s = c.GetWorldDifficulty3StarsGained(w, d);
      this.LevelsProgress?.SetStatBar(d, n === 0 ? 1 : s / n, s, n, this.statBarBaseColor, this.completeColor);
    }
    const p = WorldManager.Instance.GetWorldTimedLevelProgressPercentage(w);
    this.LevelsProgress?.SetPercentage(p);
    return p;
  }

  UpdateCollectionProgress() {
    const w = this.CurrentWorldIndex;
    let all = 0;
    let have = 0;
    [CardType.Vehicle, CardType.VehicleColor, CardType.VehicleTrail, CardType.VehicleLanding, CardType.VehicleDeath].forEach((t, i) => {
      const [a, u] = ranks(t, w);
      this.collectionProgress?.SetStatBar(i, u / a, u, a, this.statBarBaseColor, this.completeColor);
      all += a;
      have += u;
    });
    const p = have / all;
    this.collectionProgress?.SetPercentage(p);
    return p;
  }

  *AnimateWorldProgress(p) {
    const f = this.headerPercentageFill;
    if (!f) return;
    if (p >= 1) {
      f.fillAmount = p;
      return;
    }
    f.fillAmount = 0;
    let t = 0;
    while (t < 1) {
      t += Time.deltaTime * (1 / this.statAnimationLength);
      f.fillAmount = p * Math.min(1, t);
      yield null;
    }
  }
}

for (const cls of [UI_WorldSelectStatBar, UI_WorldSelectStatBarHighscore, UI_WorldSelectStat, UI_WorldStatsMenu]) registerComponent(cls);
