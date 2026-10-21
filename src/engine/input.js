// LeanTouch-style finger events from pointer + keyboard input.
import { EventAction } from './core.js';

export class LeanFinger {
  constructor(id, isOverGui) {
    this.id = id;
    this.IsActive = true;
    this.IsOverGui = isOverGui;
  }
}

export const LeanTouch = {
  OnFingerDown: new EventAction(),
  OnFingerUp: new EventAction(),
  fingers: new Map(),
  canvas: null,
  /** set by the UI runtime: (pointer event) -> is a raycast target under it */
  guiTest: null,

  init(canvas) {
    this.canvas = canvas;
    // DOM overlays, or a uGUI graphic under the pointer (LeanTouch.RaycastGui through the EventSystem)
    const isGui = (e) => (e.target !== canvas && !(e.target && e.target.dataset && e.target.dataset.passthrough)) || !!this.guiTest?.(e);
    window.addEventListener('pointerdown', (e) => {
      const f = new LeanFinger(`p${e.pointerId}`, isGui(e));
      this.fingers.set(f.id, f);
      this.OnFingerDown.Raise(f);
    });
    const up = (e) => {
      const f = this.fingers.get(`p${e.pointerId}`);
      if (!f) return;
      f.IsActive = false;
      this.fingers.delete(f.id);
      this.OnFingerUp.Raise(f);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const keys = new Set(['Space', 'ArrowUp', 'KeyW', 'ArrowRight', 'Enter']);
    window.addEventListener('keydown', (e) => {
      if (!keys.has(e.code) || e.repeat) return;
      if (e.code === 'Space') e.preventDefault();
      const f = new LeanFinger(`k${e.code}`, false);
      this.fingers.set(f.id, f);
      this.OnFingerDown.Raise(f);
    });
    window.addEventListener('keyup', (e) => {
      const f = this.fingers.get(`k${e.code}`);
      if (!f) return;
      f.IsActive = false;
      this.fingers.delete(f.id);
      this.OnFingerUp.Raise(f);
    });
    window.addEventListener('blur', () => {
      for (const f of this.fingers.values()) {
        f.IsActive = false;
        this.OnFingerUp.Raise(f);
      }
      this.fingers.clear();
    });
  },

  get anyFingerDown() {
    for (const f of this.fingers.values()) if (!f.IsOverGui) return true;
    return false;
  },
};
