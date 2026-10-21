// Revive Screen prefab (HUD.revivePrefab): UI_Revive + trigger infos, UI_PaymentText and the RevivePaymentHandler SO.
// No ads SDK: rewarded-video revives are granted immediately (like the shipped RevivePaymentHandler).
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { Time, WaitForSeconds, WaitWhile } from '../engine/core.js';
import { registerComponent, registerSO, ScriptableObject, ComponentRegistry, getRuntimeSO } from '../engine/instantiate.js';
import { Game, RevivalState, ReviveQualification } from '../game/state.js';
import { Color } from '../ugui/graphic.js';
import { csFormat, localize } from './common.js';
import { AudioSampleID, CurrencyService, CurrencyType, endlessHighScores, WorldManager } from './services.js';

export const PaymentOption = { NotAvailable: 0, Free: 1, RewardedVideo: 2, IAP: 3, Currency: 4 };
export const PaymentResponse = { Failure: 0, Cancelled: 1, Success: 2, NotAvailable: 3 };
export const BoosterID = { Invalid: -1 };

const currencyOf = (data) => CurrencyService.Instance.GetCurrency(typeof data === 'string' ? CurrencyType[data] : data);

/** EndlessModeSettings.Revive (EndlessReviveSettings) */
export function endlessReviveSettings() {
  return getRuntimeSO('MonoBehaviour/Endless Mode Settings')?.revive || {};
}

/** EndlessReviveSettings.GetHardDefinition: price doubles with every claimed revive of the run */
export function hardReviveDefinition(st) {
  const d = { ...(endlessReviveSettings().hardCurrencyReviveSettings || { pay: PaymentOption.Currency, amount: 5, data: 'Hard' }) };
  d.amount = 2 ** st.RevivesClaimed * d.amount;
  return d;
}

// ---------------------------------------------------------------- RevivePaymentHandler (ScriptableObject)

export class RevivePaymentHandler extends ScriptableObject {
  static typeName = 'RevivePaymentHandler';

  get rs() {
    return this.runState?.StartRun ? this.runState : Game.manager?.RunState;
  }

  IsBlockedByTimer() {
    return false;
  }

  TimeUntilPurchaseAvailable() {
    return 0;
  }

  CanBePurchased(payment) {
    switch (payment.pay) {
      case PaymentOption.Free:
      case PaymentOption.RewardedVideo:
        return this.CanUseRV(payment);
      case PaymentOption.Currency:
        return this.HasEnoughCurrency(payment);
      default:
        return false;
    }
  }

  HasEnoughCurrency(payment) {
    const c = currencyOf(payment.data);
    return !!c && c.CanSpend(payment.amount);
  }

  CanUseRV() {
    return (endlessReviveSettings().rvRevivesPerRun ?? 1) > this.rs.StatTracker.RvRevivesClaimed;
  }

  HandlePayment(payment, sink, cb) {
    switch (payment.pay) {
      case PaymentOption.Free:
        this.rs.StatTracker.AddRvRevive();
        cb?.(PaymentResponse.Success);
        break;
      case PaymentOption.RewardedVideo:
        cb?.(PaymentResponse.Success);
        this.rs.StatTracker.AddRvRevive();
        break;
      case PaymentOption.Currency: {
        const c = currencyOf(payment.data);
        if (c) cb(c.Spend(payment.amount, sink) ? PaymentResponse.Success : PaymentResponse.Failure);
        break;
      }
      default:
    }
  }

  IsConnected() {
    return true;
  }

  IsWaitingForAd() {
    return false;
  }
}
registerSO(RevivePaymentHandler, 'RevivePaymentHandler');

// ---------------------------------------------------------------- UI_PaymentText

export class UI_PaymentText extends MonoBehaviour {
  static typeName = 'UI_PaymentText';

  constructor() {
    super();
    this.costAdNotAvailable = "<sprite name='NoWifi' tint=1>";
    this.costWaitForAd = "<sprite name='Ad' tint=1> loading";
    this.costCurrency = "<sprite name='{0}' tint=1> {1}";
    this.internetCheckInterval = 1;
    this.internetCheckTime = 0;
    this.handler = null;
    this.costDefinition = null;
  }

  Setup(handler, cost) {
    this.handler = handler;
    this.costDefinition = cost;
    this.internetCheckTime = 0;
    if (handler.IsBlockedByTimer(cost)) this.StartCoroutine(this._UpdateTimer(handler, cost));
  }

  *_UpdateTimer(handler, cost) {
    while (handler.IsBlockedByTimer(cost)) {
      this.SetAvailableTimer(handler.TimeUntilPurchaseAvailable(cost));
      yield new WaitForSeconds(1);
    }
    this.Setup(handler, cost);
  }

  Update() {
    if (!(Time.unscaledTime > this.internetCheckTime + this.internetCheckInterval) || !this.handler || !this.costDefinition) return;
    if (this.handler.IsWaitingForAd(this.costDefinition)) this.costText.text = this.costAdNotAvailable;
    else if (this.handler.IsConnected(this.costDefinition)) {
      this.SetPurchaseText(this.costDefinition);
      this.internetCheckTime = Time.unscaledTime;
    } else this.costText.text = this.costWaitForAd;
  }

  SetAvailableTimer(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const p = (n) => String(n).padStart(2, '0');
    this.costText.text = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }

  SetPurchaseText(cost) {
    switch (cost.pay) {
      case PaymentOption.Free:
        this.costText.text = localize(this.costFree);
        break;
      case PaymentOption.RewardedVideo:
        this.costText.text = localize(this.costAd);
        break;
      case PaymentOption.Currency:
        this.costText.text = csFormat(this.costCurrency, typeof cost.data === 'string' ? cost.data : 'Hard', cost.amount);
        break;
      default:
        this.costText.text = cost.BuyString ?? '';
    }
  }
}

// ---------------------------------------------------------------- trigger infos

export class UI_ReviveTriggerInfo extends MonoBehaviour {
  static typeName = 'UI_ReviveTriggerInfo';

  Open() {
    this.gameObject.SetActive(true);
  }
}

export class UI_ReviveHighscoreTriggerInfo extends UI_ReviveTriggerInfo {
  static typeName = 'UI_ReviveHighscoreTriggerInfo';

  constructor() {
    super();
    this.formatScoreHighScore = '{0} / {1}';
  }

  Open(stats) {
    const high = endlessHighScores(WorldManager.Instance.CurrentWorldIndex).highScore;
    this.progress?.SetTextNoFormat(csFormat(this.formatScoreHighScore, stats.Score, high));
    this.gameObject.SetActive(true);
  }
}

export class UI_ReviveChallengeTriggerInfo extends UI_ReviveTriggerInfo {
  static typeName = 'UI_ReviveChallengeTriggerInfo';

  Open(stats) {
    const slot = stats.LastReviveQualification?.challengeSlot;
    if (!slot) return;
    this.challengeSlotVisualReadOnly?.Initialize(slot);
    this.gameObject.SetActive(true);
    this.StartCoroutine(this.WaitForOneFrame(slot.AssignedChallenge));
  }

  *WaitForOneFrame(c) {
    yield null;
    if (!c) return;
    const current = c.UseSteps ? c.CurrentStepValue + c.CurrentValue * c.StepGoal : c.CurrentValue;
    const goal = c.UseSteps ? c.GoalValue * c.StepGoal : c.GoalValue;
    this.challengeSlotVisualReadOnly?.Fillbar?.SetFill(current, goal, false);
  }
}

export class UI_ReviveBonusLetter extends MonoBehaviour {
  static typeName = 'UI_ReviveBonusLetter';

  Start() {
    this.bonusLetterPip?.ActivateFeedback();
    const total = this.runState.StatTracker.BonusLetterCurrencyTotal;
    for (const t of this.bonusLetterTexts || []) t?.SetText('BONUS'[total] ?? '');
  }
}

// ---------------------------------------------------------------- UI_Revive

export class UI_Revive extends MonoBehaviour {
  static typeName = 'UI_Revive';

  constructor() {
    super();
    this.secondsToDecide = 7;
    this.secondsBeforeCountDown = 1.5;
    this.timeRemaining = 0;
    this._timer = null;
    this.callback = null;
    this.timerSound = null;
  }

  get StatTracker() {
    return this.runState.StatTracker;
  }

  get ReviveSettings() {
    return endlessReviveSettings();
  }

  get handler() {
    return this.paymentHandler || getRuntimeSO('MonoBehaviour/RevivePaymentHandler');
  }

  OnEnable() {
    this._ad = () => this.OnAcceptAd();
    this._hard = () => this.OnAcceptHardCurrency();
    this._reject = () => this.OnReject();
    this.payAdButton.onClick.AddListener(this._ad);
    this.payHardButton.onClick.AddListener(this._hard);
    this.rejectButton.onClick.AddListener(this._reject);
  }

  OnDisable() {
    this.payAdButton.onClick.RemoveListener(this._ad);
    this.payHardButton.onClick.RemoveListener(this._hard);
    this.rejectButton.onClick.RemoveListener(this._reject);
  }

  *_Timer(seconds) {
    this.timerText.text = seconds.toFixed(0);
    this.timeLeftFraction?.Invoke(1);
    yield new WaitForSeconds(this.secondsBeforeCountDown);
    this.timeRemaining = seconds;
    while (this.timeRemaining > 0) {
      this.timeRemaining -= Time.deltaTime;
      this.timerText.text = Math.max(0, this.timeRemaining).toFixed(0);
      this.timeLeftFraction?.Invoke(Math.min(1, Math.max(0, this.timeRemaining / this.secondsToDecide)));
      yield null;
    }
    this.OnTimeout();
  }

  Open(awardedBooster, listener) {
    this.timerSound = null;
    this.callback = listener;
    const booster = awardedBooster !== undefined && awardedBooster !== null && awardedBooster !== BoosterID.Invalid;
    this.noBoosterParent?.SetActive(!booster);
    this.boosterParent?.SetActive(booster);
    this.gameObject.SetActive(true);
    this.HandleReviveQualification(this.StatTracker.LastReviveQualification);
    this.adPayDefinition = this.ReviveSettings.adReviveSettings || { pay: PaymentOption.RewardedVideo, amount: 0, data: -1 };
    this.hardPayDefinition = hardReviveDefinition(this.StatTracker);
    if (this.secondsToDecide > 0) {
      this.timerSound = AudioSampleID.UI_Revive.Play();
      if (this.timerSound?.Source) this.timerSound.Source.loop = true;
      this._timer = this.StartCoroutine(this._Timer(this.secondsToDecide));
    }
    this.UpdatePurchaseButtons();
  }

  UpdatePurchaseButtons() {
    const h = this.handler;
    this.payAdButton.gameObject.SetActive(h.CanBePurchased(this.adPayDefinition));
    this.paymentTextVisualAd?.Setup(h, this.adPayDefinition);
    this.paymentHardTxt.text = String(this.hardPayDefinition.amount);
    const b = this.payHardButton;
    const col = Color.from(b.interactable ? b.colors?.m_NormalColor : b.colors?.m_DisabledColor);
    if (this.paymentHardIcon) this.paymentHardIcon.color = col;
    this.paymentHardTxt.color = col;
  }

  HandleReviveQualification(q) {
    this.reviveReason?.gameObject.SetActive(false);
    this.bonusLetterInfo?.gameObject.SetActive(false);
    this.highscoreInfo?.gameObject.SetActive(false);
    this.challengeInfo?.gameObject.SetActive(false);
    switch (q?.reason) {
      case ReviveQualification.Score:
        this.highscoreInfo?.Open(this.StatTracker);
        break;
      case ReviveQualification.BonusMeter:
        this.bonusLetterInfo?.Open(this.StatTracker);
        break;
      case ReviveQualification.Challenge:
        this.challengeInfo?.Open(this.StatTracker);
        break;
      default:
    }
  }

  OnTimeout() {
    this.StopTimer();
    this.callback?.(RevivalState.Timeout);
    this.StopReviveSound();
  }

  OnAcceptBase() {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.PauseReviveSound(true);
    this.StopTimer();
  }

  OnAcceptAd() {
    this.OnAcceptBase();
    if (this.adPayDefinition.pay === PaymentOption.RewardedVideo) this.loadingOverlay?.gameObject.SetActive(true);
    this.chosenPayment = this.adPayDefinition;
    this.handler.HandlePayment(this.adPayDefinition, 'Endless', (r) => this.HandlePaymentResponse(r));
  }

  OnAcceptHardCurrency() {
    if (this.handler.CanBePurchased(this.hardPayDefinition)) {
      this.OnAcceptBase();
      this.chosenPayment = this.hardPayDefinition;
      this.handler.HandlePayment(this.hardPayDefinition, 'Endless', (r) => this.HandlePaymentResponse(r));
    } else this.toolTipHandler?.SpawnTooltip(this.notEnoughHardCurrencyText);
  }

  HandlePaymentResponse(response) {
    this.loadingOverlay?.gameObject.SetActive(false);
    if (response === PaymentResponse.Success) {
      this.StopReviveSound();
      this.OnDisable();
      this.callback?.(RevivalState.Success);
      this.DestroySelf();
    } else if (this.chosenPayment.pay === PaymentOption.RewardedVideo) {
      if (response === PaymentResponse.Cancelled) this.PauseReviveSound(false);
      else this.StartCoroutine(this._HandleNoAdAvailable());
    }
  }

  *_HandleNoAdAvailable() {
    const noAd = Game.manager?.hud?.OpenNoAdPopUp();
    yield new WaitWhile(() => noAd && !noAd.gameObject._destroyed);
    this.PauseReviveSound(false);
  }

  OnReject() {
    this.StopReviveSound();
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.StopTimer();
    this.callback?.(RevivalState.Cancelled);
    this.DestroySelf();
  }

  StopTimer() {
    if (this._timer) {
      this.StopCoroutine(this._timer);
      this._timer = null;
      const q = this.StatTracker.LastReviveQualification;
      if (q) q.timeShown = this.secondsToDecide - this.timeRemaining;
    }
  }

  /** PooledAudioSource.PauseLooping: silence the loop while a payment is pending */
  PauseReviveSound(pause) {
    const s = this.timerSound;
    if (s?.gain) s.gain.gain.value = pause ? 0 : s.baseVolume * s.service.sfxVolume;
    if (pause) {
      if (this._timer) this.StopCoroutine(this._timer);
      this._timer = null;
    } else if (this.secondsToDecide > 0) this._timer = this.StartCoroutine(this._Timer(this.timeRemaining));
  }

  StopReviveSound() {
    this.timerSound?.Stop();
    this.timerSound = null;
  }

  DestroySelf() {
    Destroy(this.gameObject);
  }

  OnDestroy() {
    this.StopReviveSound();
  }
}

const comps = [UI_Revive, UI_ReviveTriggerInfo, UI_ReviveHighscoreTriggerInfo, UI_ReviveChallengeTriggerInfo, UI_ReviveBonusLetter];
for (const cls of comps) registerComponent(cls);
// the shop port may provide its own UI_PaymentText; keep the first registration
if (!ComponentRegistry.has('UI_PaymentText')) registerComponent(UI_PaymentText);
