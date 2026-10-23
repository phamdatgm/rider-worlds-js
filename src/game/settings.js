// Settings toggles (music / sfx / bloom) applied to the services.
import { AudioService } from '../engine/audio.js';
import { Render } from '../engine/render.js';
import { getSDK } from '../sdk/gmsdkjs-shim.js';

export function applySettings(s) {
  AudioService.setMusic(!!s.music);
  AudioService.setSfx(!!s.sfx);
  Render.bloomEnabled = !!s.bloom;
  // ads with or without sound, as the player hears the game (docs/GMSDK_JS/docs/API.md §3)
  getSDK().setMuted(!s.music && !s.sfx);
}
