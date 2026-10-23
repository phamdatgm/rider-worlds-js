// Main loop with Unity's ordering: FixedUpdate/physics (fixed timestep) -> Update -> coroutines -> LateUpdate -> render.
import { Time, Coroutines } from './core.js';
import { World, runPendingStarts, flushDestroy } from './scene.js';
import { Physics2D, physicsInterpolate, physicsRestorePoses } from './physics2d.js';
import { Render } from './render.js';

let last = 0;
let accumulator = 0;
let running = false;
let paused = false;
export const LoopHooks = { beforeUpdate: [], afterLateUpdate: [] };

function callAll(method) {
  for (const b of [...World.behaviours]) {
    if (!b._isActiveAndEnabled || b._destroyed) continue;
    const fn = b[method];
    if (!fn) continue;
    try {
      fn.call(b);
    } catch (e) {
      console.error(`[${b.constructor.name} on ${b.gameObject?.name}] ${method}`, e);
    }
  }
}

function frame(nowMs) {
  if (!running) return;
  requestAnimationFrame(frame);
  if (paused) {
    // nothing advances while an ad is on screen; the frame after it starts with dt 0
    last = 0;
    return;
  }
  const now = nowMs / 1000;
  let dt = last ? now - last : 0;
  last = now;
  const unscaledDt = Math.min(dt, 0.1);
  Time.unscaledDeltaTime = unscaledDt;
  Time.unscaledTime += unscaledDt;
  Time.realtimeSinceStartup = now;
  dt = Math.min(dt, Time.maximumDeltaTime) * Time.timeScale;
  Time.deltaTime = dt;
  Time.frameCount++;

  runPendingStarts();
  accumulator += dt;
  const fdt = Time.fixedDeltaTime;
  let steps = 0;
  while (accumulator >= fdt && steps < 30) {
    accumulator -= fdt;
    steps++;
    Time.inFixedStep = true;
    const saveDt = Time.deltaTime;
    const saveTime = Time.time;
    Time.deltaTime = fdt; // Unity: Time.deltaTime inside FixedUpdate == fixedDeltaTime
    Time.fixedTime += fdt;
    Time.time = Time.fixedTime; // and Time.time == Time.fixedTime
    physicsRestorePoses();
    callAll('FixedUpdate');
    Physics2D.step(fdt);
    Coroutines.tick('fixed');
    Time.deltaTime = saveDt;
    Time.time = saveTime;
    Time.inFixedStep = false;
    runPendingStarts();
  }
  if (steps === 30) accumulator = 0;
  Time.time = Time.fixedTime + accumulator;
  physicsInterpolate(Math.min(accumulator / fdt, 1));
  for (const h of LoopHooks.beforeUpdate) h();
  callAll('Update');
  Coroutines.tick('frame');
  callAll('LateUpdate');
  for (const h of LoopHooks.afterLateUpdate) h();
  flushDestroy();
  Render.render();
}

/** the SDK's onPause / onResume (an ad is on screen): the whole game stands still */
export function pauseLoop(p) {
  paused = p;
  last = 0;
}

export function startLoop() {
  if (running) return;
  running = true;
  last = 0;
  requestAnimationFrame(frame);
}
