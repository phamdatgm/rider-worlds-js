// Time, events and coroutines — the Unity runtime services the game scripts rely on.

export const Time = {
  time: 0,
  unscaledTime: 0,
  deltaTime: 0,
  unscaledDeltaTime: 0,
  fixedTime: 0,
  fixedUnscaledTime: 0,
  fixedDeltaTime: 0.011,
  maximumDeltaTime: 0.3,
  timeScale: 1,
  frameCount: 0,
  realtimeSinceStartup: 0,
  inFixedStep: false,
};

/** UnityEvent / EventAction equivalent. */
export class EventAction {
  constructor() {
    this.listeners = [];
  }

  AddListener(fn) {
    if (!this.listeners.includes(fn)) this.listeners.push(fn);
  }

  RemoveListener(fn) {
    const i = this.listeners.indexOf(fn);
    if (i >= 0) this.listeners.splice(i, 1);
  }

  RemoveAllListeners() {
    this.listeners.length = 0;
  }

  Raise(...args) {
    for (const fn of this.listeners.slice()) {
      try {
        fn(...args);
      } catch (e) {
        console.error(e);
      }
    }
  }

  Invoke(...args) {
    if (this.persistent) for (const call of this.persistent) invokePersistentCall(call, args);
    this.Raise(...args);
  }

  GetPersistentEventCount() {
    return this.persistent?.length || 0;
  }
}

const warnedCalls = new Set();

/** Serialized UnityEvent call: {m_Target, m_MethodName, m_Mode, m_Arguments, m_CallState}. */
export function invokePersistentCall(call, dynArgs = []) {
  if (!call || call.m_CallState === 0) return;
  const target = call.m_Target;
  const name = call.m_MethodName;
  if (!target || !name) return;
  const a = call.m_Arguments || {};
  let args;
  switch (call.m_Mode ?? 1) {
    case 0: args = dynArgs; break; // EventDefined: the event's own arguments
    case 1: args = []; break;
    case 2: args = [a.m_ObjectArgument ?? null]; break;
    case 3: args = [a.m_IntArgument | 0]; break;
    case 4: args = [+a.m_FloatArgument || 0]; break;
    case 5: args = [a.m_StringArgument ?? '']; break;
    case 6: args = [!!a.m_BoolArgument]; break;
    default: args = [];
  }
  try {
    if (name.startsWith('set_')) {
      target[name.slice(4)] = args[0];
      return;
    }
    const fn = target[name];
    if (typeof fn === 'function') {
      fn.apply(target, args);
      return;
    }
  } catch (e) {
    console.error('UnityEvent', name, e);
    return;
  }
  const key = `${call.m_TargetAssemblyTypeName}.${name}`;
  if (!warnedCalls.has(key)) {
    warnedCalls.add(key);
    console.warn('UnityEvent: no method', key);
  }
}

// ---------------------------------------------------------------- coroutines

export class WaitForSeconds {
  constructor(s) {
    this.seconds = s;
  }
}
export class WaitForSecondsRealtime {
  constructor(s) {
    this.seconds = s;
  }
}
export const WaitForFixedUpdate = Object.freeze({ fixed: true });
export const WaitForEndOfFrame = Object.freeze({ endOfFrame: true });
export class WaitWhile {
  constructor(fn) {
    this.fn = fn;
  }
}
export class WaitUntil {
  constructor(fn) {
    this.fn = fn;
  }
}

/**
 * A coroutine wraps a generator. `yield` values:
 *   null/undefined           -> resume next frame (after Update)
 *   WaitForSeconds(s)        -> scaled time
 *   WaitForSecondsRealtime   -> unscaled time
 *   WaitForFixedUpdate       -> after the next physics step
 *   WaitWhile / WaitUntil    -> polled each frame
 *   a generator / Coroutine  -> run nested until done
 */
export class Coroutine {
  constructor(gen, owner) {
    this.stack = [gen];
    this.owner = owner;
    this.done = false;
    this.wait = null;
    this.waitUntil = 0;
    this.waitFixed = false;
    this.lastStepFrame = -1;
  }
}

class CoroutineScheduler {
  constructor() {
    this.list = [];
  }

  start(gen, owner) {
    const co = new Coroutine(gen, owner);
    this.list.push(co);
    // Unity runs the coroutine body synchronously up to the first yield.
    this.step(co, 'start');
    return co;
  }

  stop(co) {
    if (co) co.done = true;
  }

  stopOwner(owner) {
    for (const co of this.list) if (co.owner === owner) co.done = true;
  }

  /** phase: 'frame' (after Update) or 'fixed' (after physics step) */
  tick(phase) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const co = list[i];
      if (co.done) continue;
      if (!this.ready(co, phase)) continue;
      this.step(co, phase);
    }
    if (phase === 'frame') this.list = list.filter((c) => !c.done);
  }

  ready(co, phase) {
    if (co.owner && co.owner._destroyed) {
      co.done = true;
      return false;
    }
    if (co.owner && co.owner.gameObject && !co.owner.gameObject.activeInHierarchy) {
      // Unity stops coroutines of deactivated objects
      co.done = true;
      return false;
    }
    const w = co.wait;
    if (co.waitFixed) return phase === 'fixed';
    if (phase === 'fixed') return false;
    if (co.lastStepFrame === Time.frameCount) return false; // never resume twice in one frame
    if (w === null) return true;
    if (w instanceof WaitForSeconds) return Time.time >= co.waitUntil;
    if (w instanceof WaitForSecondsRealtime) return Time.unscaledTime >= co.waitUntil;
    if (w instanceof WaitWhile) return !w.fn();
    if (w instanceof WaitUntil) return !!w.fn();
    if (w instanceof Coroutine) return w.done;
    return true;
  }

  step(co, phase) {
    co.lastStepFrame = Time.frameCount;
    co.wait = null;
    co.waitFixed = false;
    for (let guard = 0; guard < 1000; guard++) {
      const gen = co.stack[co.stack.length - 1];
      if (!gen) {
        co.done = true;
        return;
      }
      let r;
      try {
        r = gen.next();
      } catch (e) {
        console.error('Coroutine error', e);
        co.done = true;
        return;
      }
      if (r.done) {
        co.stack.pop();
        if (co.stack.length === 0) {
          co.done = true;
          return;
        }
        continue;
      }
      const v = r.value;
      if (v && typeof v.next === 'function' && typeof v[Symbol.iterator] === 'function') {
        co.stack.push(v);
        continue;
      }
      if (v === WaitForFixedUpdate) {
        co.waitFixed = true;
        return;
      }
      if (v instanceof WaitForSeconds) {
        co.wait = v;
        co.waitUntil = Time.time + v.seconds;
        return;
      }
      if (v instanceof WaitForSecondsRealtime) {
        co.wait = v;
        co.waitUntil = Time.unscaledTime + v.seconds;
        return;
      }
      if (v instanceof WaitWhile) {
        if (!v.fn()) continue;
        co.wait = v;
        return;
      }
      if (v instanceof WaitUntil) {
        if (v.fn()) continue;
        co.wait = v;
        return;
      }
      if (v instanceof Coroutine) {
        if (v.done) continue;
        co.wait = v;
        return;
      }
      co.wait = null; // yield null -> next frame
      return;
    }
  }
}

export const Coroutines = new CoroutineScheduler();
