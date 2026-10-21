// Settings toggles (music / sfx / bloom) applied to the services.
import { AudioService } from '../engine/audio.js';
import { Render } from '../engine/render.js';

export function applySettings(s) {
  AudioService.setMusic(!!s.music);
  AudioService.setSfx(!!s.sfx);
  Render.bloomEnabled = !!s.bloom;
}
