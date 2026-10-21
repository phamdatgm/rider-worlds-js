// uGUI runtime for the web port (registers the built-in UI components).
export * from './rect.js';
export * from './sprites.js';
export * from './graphic.js';
export * from './tmp.js';
export * from './layout.js';
export * from './canvas.js';
export { UIRenderer } from './render.js';
export * from './events.js';
export * from './selectable.js';
export * from './tween.js';
export * from './feedbacks.js';
export * from './uiparticle.js';
export * from './tmp3d.js';

import { LoopHooks } from '../engine/loop.js';
import { EventSystem } from './events.js';
import { DOTween, installCanvasGroupTweens } from './tween.js';
import { CanvasGroup } from './canvas.js';

/** wire the UI runtime to the page: pointer events on the game canvas, DOTween ticking */
export function initUGUI(canvas) {
  EventSystem.init(canvas);
  installCanvasGroupTweens(CanvasGroup);
  LoopHooks.beforeUpdate.push(() => DOTween.tick());
}
