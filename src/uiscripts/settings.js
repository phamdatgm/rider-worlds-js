// Pause / settings menu (UI_PauseMenu) and the option toggles (music, sfx, bloom).
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { Time } from '../engine/core.js';
import { registerComponent, Instantiate } from '../engine/instantiate.js';
import { Save } from '../meta/save.js';
import { applySettings } from '../game/settings.js';
import { DeathReason, EndState, RunMode } from '../game/state.js';
import { AudioSampleID, MusicManager } from './services.js';
import { getSceneSwitcher } from './scenes.js';

/** GlobalSavedSettings */
export const GlobalSavedSettings = {
  get GetAudio() {
    return !!Save.data.settings.music;
  },
  get GetSfx() {
    return !!Save.data.settings.sfx;
  },
  get GetBloom() {
    return !!Save.data.settings.bloom;
  },
  toggle(k) {
    Save.data.settings[k] = !Save.data.settings[k];
    Save.save();
    applySettings(Save.data.settings);
  },
  ToggleAudio() {
    this.toggle('music');
  },
  ToggleSfx() {
    this.toggle('sfx');
  },
  ToggleBloom() {
    this.toggle('bloom');
  },
};

/** TimeManager.Instance */
const TimeManager = {
  NormalTimescale: 1,
  SetTimescaleTo(v) {
    Time.timeScale = v;
  },
};

export class UI_OptionMenuToggle extends MonoBehaviour {
  static typeName = 'UI_OptionMenuToggle';

  get IsActive() {
    return true;
  }

  Awake() {
    this._click = () => this.OnClicked();
    this.button?.onClick.AddListener(this._click);
    this.UpdateVisualState();
  }

  OnDestroy() {
    this.button?.onClick.RemoveListener(this._click);
  }

  UpdateVisualState() {
    if (this.icon) this.icon.overrideSprite = this.IsActive ? null : this.offSprite;
  }

  OnClicked() {
    this.UpdateVisualState();
  }
}

export class UI_MusicToggle extends UI_OptionMenuToggle {
  static typeName = 'UI_MusicToggle';

  get IsActive() {
    return GlobalSavedSettings.GetAudio;
  }

  OnClicked() {
    GlobalSavedSettings.ToggleAudio();
    if (GlobalSavedSettings.GetAudio) {
      if (this.runState?.IsRunning) MusicManager.Instance.PlayGameMusic();
      else MusicManager.Instance.PlayMenuMusic();
    }
    AudioSampleID.UI_ButtonClick_Generic.Play();
    super.OnClicked();
  }
}

export class UI_SfxToggle extends UI_OptionMenuToggle {
  static typeName = 'UI_SfxToggle';

  get IsActive() {
    return GlobalSavedSettings.GetSfx;
  }

  OnClicked() {
    GlobalSavedSettings.ToggleSfx();
    AudioSampleID.UI_ButtonClick_Generic.Play();
    super.OnClicked();
  }
}

export class UI_BloomToggle extends UI_OptionMenuToggle {
  static typeName = 'UI_BloomToggle';

  get IsActive() {
    return GlobalSavedSettings.GetBloom;
  }

  OnClicked() {
    GlobalSavedSettings.ToggleBloom();
    AudioSampleID.UI_ButtonClick_Generic.Play();
    super.OnClicked();
  }
}

export class UI_PauseMenu extends MonoBehaviour {
  static typeName = 'UI_PauseMenu';

  static Instances = new Set();

  Awake() {
    UI_PauseMenu.Instances.add(this);
    this.homeBtn?.onClick.AddListener(() => this.OnPressedHome());
    this.resumeBtn?.onClick.AddListener(() => this.OnPressedResume());
    for (const b of this.closeButtons || []) b?.onClick.AddListener(() => this.OnPressedResume());
    this.UpdateVisualState();
  }

  OnDestroy() {
    UI_PauseMenu.Instances.delete(this);
  }

  OnEnable() {
    if (this.runState?.IsRunning) TimeManager.SetTimescaleTo(0);
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.UpdateVisualState();
    const mode = this.runState?.Mode?.RunMode;
    this.challengesUI?.gameObject.SetActive((mode === RunMode.Endless || mode === RunMode.SeededEndless) && !!this.runState?.IsRunning);
  }

  OnDisable() {
    TimeManager.SetTimescaleTo(TimeManager.NormalTimescale);
  }

  OnPressedHome() {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    if (this.runState?.RunStartState?.RunMode === RunMode.Bonus && this.runState.RunTimer.DidTimerStart() && this.quitBonusRideModePopUp) {
      Instantiate(this.quitBonusRideModePopUp, this.transform, false).Open(() => this.ReturnToMainMenu());
    } else this.ReturnToMainMenu();
  }

  ReturnToMainMenu() {
    TimeManager.SetTimescaleTo(TimeManager.NormalTimescale);
    this.runState?.Finish(DeathReason.RunCancel, EndState.Defeat);
    getSceneSwitcher().ReturnToMainMenu();
  }

  OnPressedResume() {
    AudioSampleID.UI_ButtonClick_Generic.Play();
    this.gameObject.SetActive(false);
  }

  UpdateVisualState() {
    this.sfxToggle?.UpdateVisualState();
    this.musicToggle?.UpdateVisualState();
  }
}

for (const cls of [UI_OptionMenuToggle, UI_MusicToggle, UI_SfxToggle, UI_BloomToggle, UI_PauseMenu]) registerComponent(cls);
void Destroy;
