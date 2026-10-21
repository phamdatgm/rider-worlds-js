// CW.Audio port: AudioSampleID -> sample categories, pooled one-shots, music crossfades (Web Audio).
import { Assets, loadAudioBuffer } from './assets.js';
import { getRuntimeSO } from './instantiate.js';

export const AudioSampleID = {
  Silent: 0,
  UI_ButtonClick_Generic: 1001,
  UI_ButtonClick_Close: 1002,
  UI_Revive: 1003,
  UI_LevelCompleted: 1004,
  UI_Compliment: 1005,
  UI_FlipScoreAdd: 1006,
  UI_ChallengeProgress: 1007,
  UI_LockedBike: 1008,
  UI_UnlockedBike: 1009,
  UI_LevelComplete: 1010,
  UI_SlotMachine: 1011,
  UI_StarAdded: 1012,
  UI_ButtonLocked: 1013,
  UI_RandomBikeOn: 1014,
  UI_RandomBikeOff: 1015,
  UI_MenuSwoosh: 1016,
  UI_ChallengePopupComplete: 1017,
  UI_ChallengePopupFailed: 1018,
  UI_BonusRide_EndPortal: 1019,
  UI_ChallengeClaimable: 1020,
  UI_ChallengeNew: 1021,
  UI_BonusLetterMenu: 1022,
  UI_BonusRideReady: 1023,
  Bike_Death: 2001,
  Bike_Boost: 2002,
  Bike_Stunt: 2003,
  Bike_Acceleration: 2004,
  Bike_PerfectLanding: 2005,
  Bike_JumpPad: 2006,
  Pickup_GemGain: 3001,
  Pickup_GemGain2: 3002,
  Pickup_GemGain3: 3003,
  Pickup_GemGain4: 3004,
  Pickup_GemGain5: 3005,
  Pickup_GemGain6: 3006,
  Pickup_GemGain7: 3007,
};

/** A playing sample; mirrors PooledAudioSource (Stop(), Source.volume, Source.loop). */
export class PooledAudioSource {
  constructor(service, node, gain, baseVolume) {
    this.service = service;
    this.node = node;
    this.gain = gain;
    this.baseVolume = baseVolume;
    this.stopped = false;
    const self = this;
    this.Source = {
      get volume() {
        return self.gain.gain.value / Math.max(self.service.sfxVolume, 1e-6);
      },
      set volume(v) {
        self.gain.gain.value = v * self.service.sfxVolume;
      },
      get loop() {
        return self.node ? self.node.loop : false;
      },
      set loop(v) {
        if (self.node) self.node.loop = v;
      },
      get isPlaying() {
        return !self.stopped;
      },
    };
  }

  Stop() {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.node?.stop();
    } catch {
      /* already stopped */
    }
  }
}

export const AudioService = {
  ctx: null,
  master: null,
  sfxGain: null,
  musicGain: null,
  entries: new Map(), // id -> [{clip, pitch:[min,max], volume:[min,max]}]
  sfxVolume: 1,
  musicEnabled: true,
  sfxEnabled: true,
  music: null,

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    for (const id of Assets.manifest.audioCategories || []) {
      const so = getRuntimeSO(id);
      for (const e of so.entries || []) {
        const samples = (e.samples || [])
          .filter((s) => s.clip && s.clip.$audio)
          .map((s) => ({
            clip: s.clip.$audio,
            pitch: [s.pitchRange?.min ?? 1, s.pitchRange?.max ?? 1],
            volume: [s.volumeRange?.min ?? 1, s.volumeRange?.max ?? 1],
          }));
        this.entries.set(e.id, samples);
        for (const s of samples) loadAudioBuffer(this.ctx, s.clip);
      }
    }
    const unlock = () => {
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  },

  /** AudioSampleID.X.Play() */
  Play(id, loop = false) {
    if (!this.ctx || !this.sfxEnabled) return null;
    const samples = this.entries.get(id);
    if (!samples || !samples.length) return null;
    const s = samples[Math.floor(Math.random() * samples.length)];
    const p = Assets.audioBuffers.get(s.clip);
    const gain = this.ctx.createGain();
    const vol = s.volume[0] + Math.random() * (s.volume[1] - s.volume[0]);
    gain.gain.value = vol * this.sfxVolume;
    gain.connect(this.sfxGain);
    const handle = new PooledAudioSource(this, null, gain, vol);
    Promise.resolve(p).then((buf) => {
      if (!buf || handle.stopped) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      src.playbackRate.value = s.pitch[0] + Math.random() * (s.pitch[1] - s.pitch[0]);
      src.connect(gain);
      src.onended = () => {
        handle.stopped = true;
        gain.disconnect();
      };
      handle.node = src;
      src.start();
    });
    return handle;
  },

  PlayLooping(id) {
    return this.Play(id, true);
  },

  setSfx(on) {
    this.sfxEnabled = on;
    if (this.sfxGain) this.sfxGain.gain.value = on ? 1 : 0;
  },

  setMusic(on) {
    this.musicEnabled = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 1 : 0;
    if (!on) this.stopMusic();
  },

  // ---- MusicManager
  async playMusic(list, state) {
    if (!this.ctx || !this.musicEnabled || !list || !list.length) return;
    if (this.music && this.music.state === state) return;
    const id = list[Math.floor(Math.random() * list.length)];
    const buf = await loadAudioBuffer(this.ctx, id);
    if (!buf) return;
    const cfg = Assets.manifest.music || {};
    const fade = cfg.fadeTime ?? 1;
    const maxVol = cfg.maxVolume ?? 0.8;
    const now = this.ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => {
        try {
          old.src.stop();
        } catch {
          /* ignore */
        }
      }, fade * 1000 + 100);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(maxVol, now + fade);
    src.connect(gain);
    gain.connect(this.musicGain);
    src.start();
    this.music = { src, gain, state };
  },

  stopMusic() {
    if (!this.music) return;
    try {
      this.music.src.stop();
    } catch {
      /* ignore */
    }
    this.music = null;
  },
};

/** Play an AudioSampleID (helper for ported `AudioSampleID.X.Play()` calls). */
export function playSample(id) {
  return AudioService.Play(id);
}
