// Tutorial overlay (TutorialUtility in Core.prefab: focus with an inverted stencil hole, pointing hands, text,
// image, continue button, interaction blocker) and the menu tutorials (CW tutorial assets of the project).
import * as THREE from 'three';
import { MonoBehaviour } from '../engine/scene.js';
import { EventAction, Time, WaitForSeconds } from '../engine/core.js';
import { registerComponent, registerSO, getRuntimeSO } from '../engine/instantiate.js';
import { AnimationCurve } from '../engine/math.js';
import { Mask } from '../ugui/graphic.js';
import { InteractionBlocker, InputUIBlocker } from '../ugui/events.js';
import { Tutorials, RiderBaseTutorial, TutorialState } from '../meta/tutorials.js';
import { ev, localize } from './common.js';
import { PlayerRankManager, WorldManager, ChallengeManager, TimedLevelModeController, GameManager } from './services.js';
import { TransitionScreen } from './scenes.js';
import { MainMenuManager } from './home.js';
import { UIStatics } from './statics.js';
import { PlayerRankUpPopupUI } from './rank.js';
import { UI_WorldStatsMenu } from './worldstats.js';
import { UI_ShopPage } from './shop.js';
import { RunMode } from '../game/state.js';

const v2 = (a) => new THREE.Vector2(a?.[0] ?? a?.x ?? 0, a?.[1] ?? a?.y ?? 0);
const TimeManager = {
  SetTimescaleTo(v) {
    Time.timeScale = v;
  },
};

// ---------------------------------------------------------------- focus

export class TutorialFocusBase extends MonoBehaviour {
  static typeName = 'TutorialFocusBase';

  constructor() {
    super();
    this.size2D = [100, 100];
    this.maxOpacity = 0.2;
    this.fadeInDuration = 0.25;
    this.fadeOutDuration = 0.25;
    this.fadeCurrent = 0;
    this.CurrentState = 0; // Hidden, FadeIn, Visible, FadeOut
    this.target = null;
  }

  get rt() {
    return this.rectTransform || this.transform;
  }

  get Size() {
    return v2(this.size2D).x;
  }

  set Size(v) {
    this.size2D = [v, v];
  }

  get IsVisible() {
    return this.CurrentState !== 0;
  }

  IsActive() {
    return this.isActiveAndEnabled;
  }

  Update() {
    if (this.CurrentState === 1) {
      this.fadeCurrent += Time.unscaledDeltaTime / this.fadeInDuration;
      if (this.fadeCurrent >= 1) {
        this.CurrentState = 2;
        ev(this.onShown).Invoke();
        this.fadeCurrent = 1;
      }
      this.UpdateOpacity();
    } else if (this.CurrentState === 3) {
      this.fadeCurrent -= Time.unscaledDeltaTime / this.fadeOutDuration;
      if (this.fadeCurrent > 0) this.UpdateOpacity();
      else {
        this.SetBlocking(false);
        this.CurrentState = 0;
        ev(this.onHidden).Invoke();
        this.fadeCurrent = 0;
        this.gameObject.SetActive(false);
      }
    }
    if (this.target && !this.target.gameObject?._destroyed) this.transform.position = this.target.position;
  }

  UpdateOpacity() {}

  SetBlocking() {}

  SetSize(size) {
    if (typeof size === 'number') this.size2D = [size, size];
    else this.size2D = [size.x ?? size[0], size.y ?? size[1]];
    this.applySize();
  }

  applySize() {
    const s = v2(this.size2D);
    this.rt.SetSizeWithCurrentAnchors(0, s.x);
    this.rt.SetSizeWithCurrentAnchors(1, s.y);
  }

  // ILayoutSelfController
  SetLayoutHorizontal() {
    this.rt.SetSizeWithCurrentAnchors(0, v2(this.size2D).x);
  }

  SetLayoutVertical() {
    this.rt.SetSizeWithCurrentAnchors(1, v2(this.size2D).y);
  }

  Show(target, size = -1) {
    if (target !== undefined && target !== null) {
      if (size > 0) this.SetSize(size);
      this.SetPosition(target);
    }
    if (this.CurrentState === 1) return;
    this.gameObject.SetActive(true);
    this.UpdateOpacity();
    this.SetBlocking(true);
    this.CurrentState = 1;
    ev(this.onShow).Invoke();
  }

  Hide() {
    if (this.CurrentState === 3 || !this.gameObject.activeSelf) return;
    this.CurrentState = 3;
    ev(this.onHide).Invoke();
  }

  SetPosition(t) {
    if (t && t.isVector3) {
      this.target = null;
      this.transform.position = t;
      return;
    }
    this.target = t?.transform || t;
    if (this.target) this.transform.position = this.target.position;
  }

  OnPointerClick(e) {
    e.Use();
  }

  OnPointerDown(e) {
    e.Use();
  }

  OnPointerUp(e) {
    e.Use();
  }
}

export class TutorialFocusStencil extends TutorialFocusBase {
  static typeName = 'TutorialFocusStencil';

  Update() {
    super.Update();
    this.screenDarkenImage?.SetNativeSize?.();
  }

  UpdateOpacity() {
    const img = this.screenDarkenImage;
    if (img) img.color = img.color.withAlpha(this.fadeCurrent * this.maxOpacity);
  }

  SetBlocking(blocking) {
    const hole = this.hole;
    if (hole?.clickHole) hole.clickHole.raycastTarget = blocking;
  }
}

/** Samples.UI_Focus.Scripts.InvertedMask: the hole lets clicks through to what is under it */
export class InvertedMask extends Mask {
  static typeName = 'InvertedMask';

  Awake() {
    // Vector4.positiveInfinity: the hole image itself never receives raycasts
    if (this.clickHole) this.clickHole.m_RaycastPadding = [Infinity, Infinity, Infinity, Infinity];
  }

  IsRaycastLocationValid(sp) {
    if (!super.IsRaycastLocationValid(sp)) return true;
    const rt = this.clickHole?.rectTransform;
    if (!rt) return true;
    const l = rt.worldToLocal2(sp.x, sp.y);
    return !(l && rt.rect.Contains(l));
  }
}

export class ScreenFill extends MonoBehaviour {
  static typeName = 'ScreenFill';

  Awake() {
    if (!this.screenRect) this.screenRect = this.thisRectTransform?.root;
  }

  LateUpdate() {
    const rt = this.thisRectTransform;
    const sr = this.screenRect;
    if (!rt || !sr) return;
    const size = sr.rect;
    if (Math.abs(size.width - (this._w || 0)) > 1e-3 || Math.abs(size.height - (this._h || 0)) > 1e-3) {
      this._w = size.width;
      this._h = size.height;
      rt.SetSizeWithCurrentAnchors(0, size.width);
      rt.SetSizeWithCurrentAnchors(1, size.height);
    }
    const c = sr.GetWorldCorners();
    const pv = rt.pivot;
    const target = new THREE.Vector3(c[0].x + (c[2].x - c[0].x) * pv.x, c[0].y + (c[2].y - c[0].y) * pv.y, 0);
    const p = rt.position;
    if (Math.abs(p.x - target.x) > 1e-3 || Math.abs(p.y - target.y) > 1e-3) rt.position = target;
  }
}

// ---------------------------------------------------------------- hands

export class TutorialHandBasic extends MonoBehaviour {
  static typeName = 'TutorialHandBasic';

  constructor() {
    super();
    this.showLength = 0.4;
    this.hideLength = 0.25;
    this.pressInterval = 0.5;
    this.currentState = 0;
    this.intervalTimer = 0;
    this.target = null;
  }

  param(p, d) {
    return p?.parameter || p?.name || d;
  }

  Awake() {
    this.onShow = ev(this.onShow);
    this.onHide = ev(this.onHide);
    this.onClear = ev(this.onClear);
    this.onInterval = ev(this.onInterval);
    this.SetState(4);
    this.onShow.AddListener(() => this.animator?.SetBool(this.param(this.paramShow, 'Show'), true));
    this.onHide.AddListener(() => this.animator?.SetBool(this.param(this.paramShow, 'Show'), false));
    this.onClear.AddListener(() => this.ClearTriggers());
    this.onInterval.AddListener(() => this.animator?.SetTrigger(this.param(this.paramInterval, 'Interval')));
  }

  OnEnable() {
    this.intervalTimer = this.pressInterval;
  }

  LateUpdate() {
    this.UpdatePosition(this.target);
  }

  SetState(s) {
    this.currentState = s;
  }

  Show() {
    if (this.currentState === 1 || this.currentState === 2) return;
    this.gameObject.SetActive(true);
    this.CancelCoroutine();
    this.SetState(1);
    this.onShow?.Invoke();
    const self = this;
    this._co = this.StartCoroutine((function* () {
      yield new WaitForSeconds(self.showLength);
      self.SetState(2);
    })());
  }

  SetPosition(t) {
    if (t && t.isVector3) {
      this.target = null;
      this.UpdatePosition(t);
      return;
    }
    this.target = t?.transform || t;
    this.UpdatePosition(this.target);
  }

  UpdatePosition(t) {
    if (!t) return;
    const p = t.isVector3 ? t : t.gameObject?._destroyed ? null : t.position;
    if (!p) return;
    if (this.hand) this.hand.position = p;
    if (this.circle) this.circle.position = p;
  }

  Hide() {
    if (this.currentState === 3 || this.currentState === 4) return;
    this.CancelCoroutine();
    this.SetState(3);
    this.onHide?.Invoke();
    this.animator?.SetBool(this.param(this.paramShow, 'Show'), false);
    this.target = null;
    if (this.gameObject.activeSelf) {
      const self = this;
      this._co = this.StartCoroutine((function* () {
        yield new WaitForSeconds(self.hideLength);
        self.SetState(4);
        self.Clear();
        // the animator's hide clip does not play here: a hidden hand stayed on screen where it last pointed (the
        // Large Chest popup's price, over the chest that opens next); Show turns it back on
        self.gameObject.SetActive(false);
      })());
    }
  }

  Clear() {
    this.SetState(0);
    this.onClear?.Invoke();
    this.target = null;
    this.CancelCoroutine();
  }

  ClearTriggers() {
    this.animator?.ResetTrigger(this.param(this.paramReset, 'Reset'));
    this.animator?.ResetTrigger(this.param(this.paramInterval, 'Interval'));
    this.animator?.SetBool(this.param(this.paramShow, 'Show'), false);
  }

  CancelCoroutine() {
    if (this._co) {
      this.StopCoroutine(this._co);
      this._co = null;
    }
  }

  HandleInterval() {
    this.intervalTimer -= Time.deltaTime;
    if (this.intervalTimer <= 0) {
      this.intervalTimer = this.pressInterval;
      this.onInterval?.Invoke();
    }
  }
}

export class TutorialHandPress extends TutorialHandBasic {
  static typeName = 'TutorialHandPress';

  Update() {
    this.HandleInterval();
  }

  Show(target) {
    if (target) this.SetPosition(target);
    super.Show();
  }
}

export class TutorialHandRelease extends TutorialHandPress {
  static typeName = 'TutorialHandRelease';
}

export class TutorialHandMoving extends TutorialHandBasic {
  static typeName = 'TutorialHandMoving';

  constructor() {
    super();
    this.speedAnimation = 1;
    this.movement = 1;
    this.progressCurrent = 0;
    this.moveForward = true;
  }

  LateUpdate() {
    this.pressed = false;
    if (this.currentState !== 2) {
      this.progressCurrent = 0;
      return;
    }
    const a = this.startingPoint?.position;
    const b = this.destinationPoint?.position;
    if (!a || !b) return;
    const distance = a.distanceTo(b);
    if (!(distance > 0)) return;
    const d = Time.deltaTime * this.speedAnimation;
    this.progressCurrent += this.moveForward ? d : -d;
    const curve = AnimationCurve.from(this.progressCurve);
    let t = this.progressCurrent / distance;
    if (this.movement === 1) {
      if (this.moveForward && t > 1) {
        this.moveForward = false;
        this.onInterval?.Invoke();
        t = 1;
      } else if (this.progressCurrent < 0 && !this.moveForward) {
        this.moveForward = true;
        this.onInterval?.Invoke();
        t = 0;
        this.pressed = true;
      }
    } else {
      this.moveForward = true;
      if (t > 1) {
        this.progressCurrent = 0;
        this.onInterval?.Invoke();
        this.onInterval?.Invoke();
        t = 1;
      }
    }
    const k = curve.Evaluate(t);
    const p = a.clone().lerp(b, k);
    if (this.hand) this.hand.position = p;
    if (this.pressed && this.circle) this.circle.position = p;
  }

  Show(from, to) {
    from = from ?? this.startingPoint;
    to = to ?? this.destinationPoint;
    if (!from || !to || this.currentState === 1 || this.currentState === 2) return;
    this.onClear?.Invoke();
    super.Show();
    this.gameObject.SetActive(true);
    this.progressCurrent = 0;
    this.transform.position = from.position;
    this.startingPoint = from;
    this.destinationPoint = to;
    const p = from.position.clone().lerp(to.position, AnimationCurve.from(this.progressCurve).Evaluate(0));
    if (this.hand) this.hand.position = p;
    if (this.circle) this.circle.position = p;
    this.moveForward = true;
  }
}

// ---------------------------------------------------------------- text / image / continue / world space

export class TutorialText extends MonoBehaviour {
  static typeName = 'TutorialText';

  get TapToContinueText() {
    return this.tapToContinueText;
  }

  get TextRect() {
    return this.textRect;
  }

  get SetText() {
    return this.setText;
  }

  get TapToContinue() {
    return this.tapToContinue;
  }

  get Background() {
    return this.background;
  }

  LateUpdate() {
    if (this._target) this.textRect.anchoredPosition = this._target.anchoredPosition.add(this._pos);
  }

  HideAll() {
    this.setText?.gameObject.SetActive(false);
    this.tapToContinue?.SetActive(false);
    this.background?.SetActive(false);
    this._target = null;
    this._pos = new THREE.Vector2();
  }

  SetFontSize(size) {
    if (this.text) this.text.fontSize = size;
  }

  SetPosition(p) {
    this.textRect.anchoredPosition = p;
  }

  SetTarget(target, p) {
    this._target = target;
    this._pos = p.clone();
  }
}

export class TutorialImage extends MonoBehaviour {
  static typeName = 'TutorialImage';

  get ImageRect() {
    return this.imageRect;
  }

  get Image() {
    return this.image;
  }

  LateUpdate() {
    if (this._target) this.imageRect.anchoredPosition = this._target.anchoredPosition.add(this._pos);
  }

  Hide() {
    this.background?.gameObject.SetActive(false);
    this.gameObject.SetActive(false);
    this._target = null;
  }

  SetPosition(p) {
    this.imageRect.anchoredPosition = p;
  }

  SetTarget(target, p) {
    this._target = target;
    this._pos = p.clone();
  }

  SetFillBackground() {
    this.background?.gameObject.SetActive(true);
  }
}

export class TutorialContinueButton extends MonoBehaviour {
  static typeName = 'TutorialContinueButton';

  Awake() {
    this.button?.onClick.AddListener(() => this.cb?.());
  }

  Show(callback) {
    this.gameObject.SetActive(true);
    this.cb = callback;
  }

  Hide() {
    this.gameObject.SetActive(false);
    this.cb = null;
  }
}

export class TutorialWorldSpace extends MonoBehaviour {
  static typeName = 'TutorialWorldSpace';

  SetUITarget(worldSpace) {
    const cam = GameManager.Instance?.cameraRig;
    const vp = cam?.WorldToViewportPoint?.(worldSpace.position) || { x: 0.5, y: 0.5 };
    const sd = this.canvasRect.rect;
    this.worldSpaceTarget.anchoredPosition = new THREE.Vector2(vp.x * sd.width - sd.width * 0.5, vp.y * sd.height - sd.height * 0.5);
    return this.worldSpaceTarget;
  }
}

/** HUD helper that follows a world object on screen */
export class TutorialTarget extends MonoBehaviour {
  static typeName = 'TutorialTarget';

  FollowTarget(t) {
    this.gameObject.SetActive(true);
    this.followTarget = t;
  }

  StopFollowing() {
    this.followTarget = null;
    this.gameObject.SetActive(false);
  }

  LateUpdate() {
    const cam = GameManager.Instance?.cameraRig;
    if (!this.followTarget || !cam?.WorldToScreenPoint) return;
    const p = cam.WorldToScreenPoint(this.followTarget.position);
    this.transform.position = new THREE.Vector3(p.x, p.y, 0);
  }
}

// ---------------------------------------------------------------- TutorialUtility

export class TutorialUtility extends MonoBehaviour {
  static typeName = 'TutorialUtility';

  static Instance = null;

  Initialize() {
    if (TutorialUtility.Instance) return;
    TutorialUtility.Instance = this;
    this.defaultTapToContinueTerm = this.text?.TapToContinueText?.mTerm;
    this.lastCircleContent = null;
    this.lastRectContent = null;
  }

  Hide() {
    this.HideAll();
  }

  PressOn(target, toClick) {
    InteractionBlocker.BlockButtons((toClick || target).gameObject || toClick || target);
    this.press.SetPosition(target);
    this.press.Show();
    return this.press;
  }

  MoveBetween(a, b) {
    this.move.Show(a, b);
    return this.move;
  }

  FocusOn(content, allowToClickThrough = false) {
    for (const img of this.focusDarkens || []) if (img) img.raycastTarget = !allowToClickThrough;
    if (content.type === 0) this.FocusCircleOn(content);
    else this.FocusRectOn(content);
  }

  SetUITarget(target) {
    return this.worldSpace.SetUITarget(target);
  }

  FocusCircleOn(c) {
    if (c.animateFromLast && this.lastRectContent?.target) this.StartCoroutine(this.AnimateFromLast(this.circleFocus, this.lastCircleContent, c));
    else {
      this.circleFocus.SetPosition(c.target);
      this.circleFocus.SetSize(c.radius);
      this.circleFocus.Show(c.target);
    }
    this.lastCircleContent = c;
  }

  FocusRectOn(c) {
    if (c.animateFromLast && this.lastRectContent?.target) this.StartCoroutine(this.AnimateFromLast(this.rectFocus, this.lastRectContent, c));
    else {
      this.rectFocus.SetPosition(c.target);
      this.rectFocus.SetSize(v2(c.size));
      this.rectFocus.Show(c.target);
    }
    this.lastRectContent = c;
  }

  *AnimateFromLast(focus, last, next) {
    const circle = next.type === 0;
    focus.Show();
    const curve = AnimationCurve.from(next.animateFromLastCurve);
    let t = 0;
    do {
      yield null;
      const k = curve.Evaluate(t);
      focus.SetPosition(last.target.position.clone().lerp(next.target.position, k));
      if (circle) focus.SetSize(last.radius + (next.radius - last.radius) * k);
      else focus.SetSize(v2(last.size).lerp(v2(next.size), k));
      t += Time.unscaledDeltaTime / (next.animateFromLastTime || 1);
    } while (t < 1);
    focus.SetPosition(next.target);
  }

  ShowText(content) {
    if (!content) return;
    const t = this.text;
    t.gameObject.SetActive(true);
    t.TextRect.gameObject.SetActive(true);
    t.TextRect.sizeDelta = v2(content.rectSize);
    const pos = v2(content.position);
    if (content.anchorToHighlight) {
      const f = this.GetActiveFocus();
      if (f) t.SetTarget(f.transform, pos);
    } else t.TextRect.anchoredPosition = pos;
    t.SetFontSize(content.fontSize);
    t.SetText.gameObject.SetActive(true);
    t.SetText.SetText(localizeContent(content.localizedMessage));
    if (content.useBackgroundFrame) t.Background.SetActive(true);
  }

  ShowImage(content) {
    if (!content) return;
    const im = this.image;
    im.gameObject.SetActive(true);
    im.ImageRect.gameObject.SetActive(true);
    im.ImageRect.sizeDelta = v2(content.rectSize);
    const pos = v2(content.position);
    if (content.anchorToHighlight) {
      const f = this.GetActiveFocus();
      if (f) im.SetTarget(f.transform, pos);
    } else im.ImageRect.anchoredPosition = pos;
    if (content.blackBackgroundFill) im.SetFillBackground();
    im.Image.sprite = content.spriteToShow;
  }

  OverrideTapToContinueText(term) {
    this.text?.TapToContinueText?.SetTerm(term);
  }

  ShowTapToContinue(stopTime = false, hideRegularText = false) {
    this.text.gameObject.SetActive(true);
    if (hideRegularText) this.text.TextRect.gameObject.SetActive(false);
    this.text.TapToContinue.SetActive(true);
    if (stopTime) {
      TimeManager.SetTimescaleTo(0);
      this.shouldContinueTimeOnHide = true;
    }
  }

  ShowContinueButton(cb, stopTime = false) {
    this.continueButton.Show(cb);
    if (stopTime) {
      TimeManager.SetTimescaleTo(0);
      this.shouldContinueTimeOnHide = true;
    }
  }

  DisableTouch() {
    this.interactionBlocker?.SetActive(true);
  }

  EnableTouch() {
    this.interactionBlocker?.SetActive(false);
  }

  HideAll() {
    InteractionBlocker.UnblockAll();
    for (const img of this.focusDarkens || []) if (img) img.raycastTarget = true;
    this.circleFocus?.Hide();
    this.rectFocus?.Hide();
    this.move?.Hide();
    this.press?.Hide();
    this.text?.HideAll();
    if (this.defaultTapToContinueTerm) this.OverrideTapToContinueText(this.defaultTapToContinueTerm);
    this.image?.Hide();
    this.continueButton?.Hide();
    if (this.shouldContinueTimeOnHide) {
      TimeManager.SetTimescaleTo(1);
      this.shouldContinueTimeOnHide = false;
    }
  }

  GetActiveFocus() {
    if (this.circleFocus?.IsActive()) return this.circleFocus;
    if (this.rectFocus?.IsActive()) return this.rectFocus;
    return null;
  }
}

/** LocalizedString -> text (SetTextCore.SetText(LocalizedString) prints the translation) */
function localizeContent(ls) {
  return localize(ls);
}

// ---------------------------------------------------------------- menu tutorials

const mm = () => MainMenuManager.Instance;
const home = () => mm()?.HomeScreenManager;
const U = () => TutorialUtility.Instance;

export class ClaimChallengeTutorial extends RiderBaseTutorial {
  static typeName = 'ClaimChallengeTutorial';

  get SaveName() {
    return 'FTUE_ClaimChallenge';
  }

  // Not shown (owner's request, 2026-10-30): skipped on load, also when a save stopped inside it, so the challenge
  // overlay's auto-claim, which waits for a started tutorial, never waits on it.
  CheckStateOnLoad() {
    if (this.IsFinished) return;
    this.state = TutorialState.Skipped;
    this.service.SetTutorialState(this);
  }

  CanStart() {
    if (this.IsFinished) return false;
    if (!super.CanStart() || !mm()) return false;
    if (!home()?.challengeDisplay?.IsOpen) return false;
    return ChallengeManager.Instance.GetActiveClaimableChallenges() !== 0;
  }

  OnActivated() {
    U().Hide();
    U().ShowText(this.textContent);
    this.focusContent.target = this.GetFirstCompletedChallenge();
    if (this.focusContent.target) U().FocusOn(this.focusContent);
    InputUIBlocker.EnableInput();
    U().ShowTapToContinue();
    this.TryStartDismissDelay(this.dismissDelay, true, () => this.CompleteTutorial());
  }

  CompleteTutorial() {
    if (this.IsDismissTimerActive) return;
    InputUIBlocker.DisableInput();
    U().Hide();
    this.Complete();
  }

  GetFirstCompletedChallenge() {
    const cont = mm()?.tutorialChallengesSlotContainer;
    for (const s of cont?.SlotSetups || []) {
      if (s.slot?.AssignedChallenge?.IsCompleted && s.mainMenuVisuals) return s.mainMenuVisuals.TutorialSocket;
    }
    return null;
  }
}

export class FirstLevelPlayTutorial extends RiderBaseTutorial {
  static typeName = 'FirstLevelPlayTutorial';

  constructor() {
    super();
    this.currentStep = 0;
  }

  get SaveName() {
    return 'FTUE_FirstLevelPlay';
  }

  get CurrentStep() {
    return this.currentStep;
  }

  get LevelsButton() {
    return mm()?.tutorialLevelsButton;
  }

  get rs() {
    return this.runState?.StartRun ? this.runState : getRuntimeSO('MonoBehaviour/Run State');
  }

  SetLevelButtonReference(b) {
    this.targetLevelButton = b;
  }

  SetLevelHUDReference(t) {
    this.targetLevelHudTransform = t;
  }

  CanStart() {
    if (!this.targetLevelButton || this.targetLevelButton.gameObject?._destroyed || !super.CanStart()) return false;
    if (mm() && TimedLevelModeController.Instance.IsUnlocked(0)) return !!home()?.timedLevelsDisplay?.IsOpen;
    return false;
  }

  HandleUpdate() {
    if (this.currentStep === 3 && this.rs.Mode?.RunMode === RunMode.TimedLevel && this.rs.IsRunning) this.BeginDelay(0.5, null, () => this.HandleHighlightLevelHUD());
  }

  OnActivated() {
    if (home()?.timedLevelsDisplay?.IsOpen) {
      this.HandleHighlightLevel();
      return;
    }
    this.currentStep = 1;
    const lb = this.LevelsButton;
    this.unlockFocusContent.target = lb.transform;
    this._hl = () => this.HandleHighlightLevel();
    lb.onClick.AddListener(this._hl);
    U().FocusOn(this.unlockFocusContent);
    U().ShowText(this.unlockTextContent);
    U().PressOn(lb.transform);
    this.TryStartDismissDelay(this.unlockDismissDelayContent, false);
  }

  HandleHighlightLevel() {
    if (this._hl) this.LevelsButton?.onClick.RemoveListener(this._hl);
    this.currentStep = 2;
    U().Hide();
    this.BeginDelay(0.2, null, () => {
      const b = this.targetLevelButton;
      this.highlightLevelFocus.target = b.transform;
      const wait = () => {
        U().DisableTouch();
        b.onClick.RemoveListener(wait);
        this.currentStep = 3;
        U().Hide();
      };
      b.onClick.AddListener(wait);
      U().FocusOn(this.highlightLevelFocus);
      U().PressOn(this.highlightLevelFocus.target);
      U().ShowText(this.highlightLevelText);
      this.TryStartDismissDelay(this.highlightLevelDismissDelay, false);
    });
  }

  HandleHighlightLevelHUD() {
    this.currentStep = 4;
    U().Hide();
    this.highlightLevelHudFocus.target = this.targetLevelHudTransform;
    if (this.targetLevelHudTransform) U().FocusOn(this.highlightLevelHudFocus);
    U().ShowText(this.highlightLevelHudText);
    this.TryStartDismissDelay(this.highlightLevelHudDismissDelay, true, () => this.OnCloseTutorial());
  }

  OnCloseTutorial() {
    if (this.IsDismissTimerActive) return;
    this.currentStep = 5;
    U().Hide();
    this.Complete();
  }
}

export class SecondLevelPlayTutorial extends RiderBaseTutorial {
  static typeName = 'SecondLevelPlayTutorial';

  constructor() {
    super();
    this.currentStep = 0;
  }

  get SaveName() {
    return 'FTUE_SecondLevelPlay';
  }

  get rs() {
    return this.runState?.StartRun ? this.runState : getRuntimeSO('MonoBehaviour/Run State');
  }

  CanStart() {
    if (!super.CanStart()) return false;
    const first = this.firstLevelTutorial?.IsFinished !== undefined ? this.firstLevelTutorial : Tutorials.byName('FTUE_FirstLevelPlay');
    if (!first?.IsFinished) return false;
    if (this.rs.AnalyticsRunsTracker.CountLifetimeLevels < 2) return false;
    return this.rs.Mode?.RunMode === RunMode.TimedLevel;
  }

  HandleUpdate() {
    if (this.currentStep === 1 && this.rs.Mode?.RunMode === RunMode.TimedLevel && this.rs.IsRunning) this.ShowFlipsStep();
  }

  OnActivated() {
    this.currentStep = 1;
  }

  ShowFlipsStep() {
    this.currentStep = 2;
    U().Hide();
    U().ShowText(this.flipsTextContent);
    U().ShowImage(this.flipsImageContent);
    U().DisableTouch();
    this.TryStartDismissDelay(this.flipsDismissDelayContent, true, () => this.ShowPerfectStep());
  }

  ShowPerfectStep() {
    this.currentStep = 3;
    U().Hide();
    U().ShowText(this.perfectTextContent);
    U().ShowImage(this.perfectImageContent);
    this.TryStartDismissDelay(this.perfectDismissDelayContent, true, () => this.EndTutorial());
  }

  EndTutorial() {
    this.currentStep = 4;
    U().EnableTouch();
    U().Hide();
    this.Complete();
  }
}

export class PlayerRankUpPopupTutorial extends RiderBaseTutorial {
  static typeName = 'PlayerRankUpPopupTutorial';

  constructor() {
    super();
    this.rankToTriggerAt = 0;
    this.neededRevealedItems = 1;
    this.currentStep = 0;
  }

  get SaveName() {
    return `FTUE_PlayerRankUpPopup_Rank${this.rankToTriggerAt}`;
  }

  get popup() {
    return Tutorials.hooks.rankPopup?.() || null;
  }

  HandleUpdate() {
    if (this.currentStep === 1 && !this.popup) this.CompleteTutorial();
  }

  CanStart() {
    if (!super.CanStart() || PlayerRankManager.Instance.CurrentRank < this.rankToTriggerAt || !this.popup) return false;
    return (this.popup.ShownRewards ?? 0) >= this.neededRevealedItems;
  }

  OnActivated() {
    this.currentStep = 1;
    U().Hide();
    U().ShowText(this.textContent);
  }

  CompleteTutorial() {
    U().Hide();
    this.currentStep = 2;
    this.Complete();
  }
}

export class ShopTutorial extends RiderBaseTutorial {
  static typeName = 'ShopTutorial';

  constructor() {
    super();
    this.startRank = 2;
    this.highlightShopDelay = 0.1;
    this.highlightChestDelay = 1.25;
    this.highlightChestConfirmationDelay = 1.25;
    this.currentStep = 0;
  }

  get SaveName() {
    return 'FTUE_Shop';
  }

  get LootboxToGive() {
    return this.lootboxToGive;
  }

  get rs() {
    return this.runState?.StartRun ? this.runState : getRuntimeSO('MonoBehaviour/Run State');
  }

  CanStart() {
    if (!super.CanStart() || this.rs.IsRunning || !mm()) return false;
    if (PlayerRankManager.Instance.CurrentRank < this.startRank) return false;
    if (UIStatics.RankUpPopup.IsOpenOrActive) return false;
    // a Home popup (challenges, timed levels, world stats, bonus) covers the tab bar in landscape: wait for it to close
    if (homePopupOpen()) return false;
    return !UIStatics.RewardTrackOpen;
  }

  Activate() {
    this.currentStep = 1;
    super.Activate();
  }

  OnActivated() {
    const m = mm();
    if (m.tutorialEndlessPage?.isActiveAndEnabled) {
      this.HighlightShop();
      return;
    }
    const eb = m.tutorialEndlessButton;
    this.endlessFocusContent.target = eb.transform;
    this._hs = () => this.HighlightShop();
    eb.OnClicked.AddListener(this._hs);
    U().FocusOn(this.endlessFocusContent);
    U().PressOn(this.endlessFocusContent.target);
  }

  HighlightShop() {
    const m = mm();
    if (this._hs) m.tutorialEndlessButton.OnClicked.RemoveListener(this._hs);
    this.currentStep = 2;
    this.BeginDelay(this.highlightShopDelay, () => U().Hide(), () => {
      const sb = m.tutorialShopButton;
      this.highlightShopFocus.target = sb.TutorialCenterSocket;
      U().FocusOn(this.highlightShopFocus);
      U().ShowText(this.highlightShopText);
      U().PressOn(sb.TutorialPressSocket, sb.gameObject);
      this._hc = () => this.HighlightChest();
      sb.OnClicked.AddListener(this._hc);
    });
  }

  HighlightChest() {
    const m = mm();
    this.currentStep = 3;
    m.tutorialShopButton.OnClicked.RemoveListener(this._hc);
    this.BeginDelay(this.highlightChestDelay, () => U().Hide(), () => {
      const page = Tutorials.hooks.shopPage?.();
      this.smallChest = page?.lootboxSection?.TutorialGetBigChest?.();
      if (!this.smallChest) return;
      this.highlightChestFocus.target = this.smallChest.transform;
      U().FocusOn(this.highlightChestFocus);
      U().ShowText(this.highlightChestText);
      U().PressOn(this.highlightChestFocus.target);
      this._conf = () => this.HighlightChestConfirmation();
      const ui = this.smallChest.shopItemUI;
      if (ui?.PurchaseButtonClicked instanceof EventAction) ui.PurchaseButtonClicked.AddListener(this._conf);
      else if (ui) (ui._purchaseListeners ||= []).push(this._conf);
    });
  }

  HighlightChestConfirmation() {
    this.currentStep = 4;
    const ui = this.smallChest.shopItemUI;
    if (ui?.PurchaseButtonClicked instanceof EventAction) ui.PurchaseButtonClicked.RemoveListener(this._conf);
    this.BeginDelay(this.highlightChestConfirmationDelay, () => U().Hide(), () => {
      const conf = this.smallChest.ConfirmationInstance;
      if (!conf) return;
      this.highlightChestConfirmationFocus.target = conf.TutorialSocket;
      const buy = conf.buyButton;
      U().FocusOn(this.highlightChestConfirmationFocus);
      U().ShowText(this.highlightChestConfirmationText);
      U().PressOn(buy.transform);
      buy.onClick.AddListener(() => this.CompleteTutorial());
    });
  }

  CompleteTutorial() {
    if (this.IsDismissTimerActive || this.IsFinished) return;
    U().Hide();
    this.currentStep = 5;
    this.Complete();
  }
}

export class UnlockWorldTutorial extends RiderBaseTutorial {
  static typeName = 'UnlockWorldTutorial';

  constructor() {
    super();
    this.worldIndex = 1;
    this.currentStep = 0;
  }

  get SaveName() {
    return 'FTUE_UnlockWorld';
  }

  SetNextWorldButtonReference(button) {
    this.nextWorldButton = button;
    if (this.highlightNextWorldButtonFocus) this.highlightNextWorldButtonFocus.target = button.transform;
  }

  CanStart() {
    if (!super.CanStart()) return false;
    if (!WorldManager.Instance.IsWorldUnlocked(this.worldIndex)) return false;
    const m = mm();
    if (!m || !m.tutorialEndlessPage?.isActiveAndEnabled || home()?.timedLevelsDisplay?.IsOpen) return false;
    if (Tutorials.hooks.worldStatsOpen?.()) return false;
    if (UIStatics.RankUpPopup.IsOpenOrActive) return false;
    return !UIStatics.RewardTrackOpen;
  }

  OnActivated() {
    if (WorldManager.Instance.CurrentWorldIndex >= 1) this.HighlightPlayButton();
    else this.HighlightNextWorldButton();
  }

  HandleUpdate() {
    if (this.currentStep === 1 && mm()?.tutorialEndlessPage?.isActiveAndEnabled && !home()?.challengeDisplay?.IsOpen) this.HighlightNextWorldButton();
  }

  HighlightNextWorldButton() {
    this.currentStep = 2;
    if (!this.nextWorldButton && UIStatics.worldNextButton) this.SetNextWorldButtonReference(UIStatics.worldNextButton);
    U().FocusOn(this.highlightNextWorldButtonFocus);
    U().PressOn(this.highlightNextWorldButtonFocus.target);
    U().ShowText(this.highlightNextWorldButtonText);
    const btn = this.nextWorldButton;
    const click = () => {
      btn.onClick.RemoveListener(click);
      this.BeginDelay(1, () => U().Hide(), () => {
        this.currentStep = 3;
        this._hp = () => this.HighlightPlayButton();
        TransitionScreen.Instance.onEndTransition.AddListener(this._hp);
      });
    };
    btn.onClick.AddListener(click);
  }

  HighlightPlayButton() {
    if (this._hp) TransitionScreen.Instance.onEndTransition.RemoveListener(this._hp);
    this.BeginDelay(1, null, () => {
      const play = home().PlayButton;
      this.highlightPlayButtonFocus.target = play.transform;
      this.currentStep = 4;
      U().FocusOn(this.highlightPlayButtonFocus);
      U().PressOn(this.highlightPlayButtonFocus.target);
      U().ShowText(this.highlightPlayButtonText);
      const click = () => {
        play.onClick.RemoveListener(click);
        this.FinishTutorial();
      };
      play.onClick.AddListener(click);
    });
  }

  FinishTutorial() {
    if (this.IsDismissTimerActive) return;
    this.currentStep = 5;
    U().Hide();
    this.Complete();
  }
}

/** a Home popup is up (the challenge overlay, timed levels, world stats or the bonus claim) */
const homePopups = new WeakMap();
function homePopupOpen() {
  const m = mm();
  if (!m) return false;
  let list = homePopups.get(m);
  if (!list) homePopups.set(m, (list = ['UI_ChallengeOverlay', 'UI_TimedLevelMenu', 'UI_WorldStatsMenu', 'UI_ClaimBonusOverlay'].flatMap((n) => m.GetComponentsInChildren(n, true))));
  return list.some((c) => c.gameObject.activeInHierarchy);
}

// ---------------------------------------------------------------- hooks used by the tutorial service

Object.assign(Tutorials.hooks, {
  utility: () => TutorialUtility.Instance,
  mainMenu: () => MainMenuManager.Instance,
  transition: () => TransitionScreen.Instance,
  rankPopupBlocked: () => UIStatics.RankUpPopup.WasPopBlocked,
  pauseWorldFx: (v) => GameManager.Instance?.cameraRig?.PauseWorldFx?.(v),
  rankPopup: () => PlayerRankUpPopupUI.Instance,
  shopPage: () => UI_ShopPage.Instance,
  worldStatsOpen: () => !!UI_WorldStatsMenu.Instance?.isActiveAndEnabled,
});

for (const cls of [
  TutorialFocusBase,
  TutorialFocusStencil,
  InvertedMask,
  ScreenFill,
  TutorialHandBasic,
  TutorialHandPress,
  TutorialHandRelease,
  TutorialHandMoving,
  TutorialText,
  TutorialImage,
  TutorialContinueButton,
  TutorialWorldSpace,
  TutorialTarget,
  TutorialUtility,
])
  registerComponent(cls);
for (const cls of [ClaimChallengeTutorial, FirstLevelPlayTutorial, SecondLevelPlayTutorial, PlayerRankUpPopupTutorial, ShopTutorial, UnlockWorldTutorial]) registerSO(cls, cls.typeName);

