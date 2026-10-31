// EventSystem + pointer input module (StandaloneInputModule / PointerInputModule rules):
// press -> click on the same handler, drag threshold, drag cancels the click, enter / exit, scroll.
import * as THREE from 'three';
import { MonoBehaviour } from '../engine/scene.js';
import { registerComponent } from '../engine/instantiate.js';
import { UISystem } from './canvas.js';
import { LeanTouch } from '../engine/input.js';

export class PointerEventData {
  constructor(id) {
    this.pointerId = id;
    this.position = new THREE.Vector2();
    this.delta = new THREE.Vector2();
    this.pressPosition = new THREE.Vector2();
    this.scrollDelta = new THREE.Vector2();
    this.button = 0;
    this.pointerEnter = null;
    this.pointerPress = null;
    this.rawPointerPress = null;
    this.pointerDrag = null;
    this.pointerCurrentRaycast = { gameObject: null };
    this.pointerPressRaycast = { gameObject: null };
    this.dragging = false;
    this.eligibleForClick = false;
    this.clickCount = 0;
    this.clickTime = 0;
    this.useDragThreshold = true;
    this.used = false;
    this.hovered = [];
  }

  Use() {
    this.used = true;
  }

  IsPointerMoving() {
    return this.delta.lengthSq() > 0;
  }
}

function behaviourActive(c) {
  if ('isActiveAndEnabled' in c) return c.isActiveAndEnabled;
  return true;
}

/** ExecuteEvents: GetEventHandler / Execute / ExecuteHierarchy by method name */
export const ExecuteEvents = {
  handlerOn(go, method) {
    if (!go || !go.activeInHierarchy) return null;
    for (const c of go.components) if (typeof c[method] === 'function' && behaviourActive(c)) return c;
    return null;
  },
  GetEventHandler(go, method) {
    for (let t = go?.transform; t; t = t.parent) if (this.handlerOn(t.gameObject, method)) return t.gameObject;
    return null;
  },
  Execute(go, data, method) {
    if (!go || !go.activeInHierarchy) return false;
    let any = false;
    for (const c of go.components.slice()) {
      if (typeof c[method] !== 'function' || !behaviourActive(c)) continue;
      try {
        c[method](data);
      } catch (e) {
        console.error(`[${c.constructor.name}] ${method}`, e);
      }
      any = true;
    }
    return any;
  },
  ExecuteHierarchy(go, data, method) {
    const target = this.GetEventHandler(go, method);
    if (target) this.Execute(target, data, method);
    return target;
  },
};

/** InteractionBlocker (static): while blocking, only the allowed objects receive presses (BlockableInputModule) */
export const InteractionBlocker = {
  AllowedButtons: [],
  IsBlocking: false,
  get BlockingDragging() {
    return this.IsBlocking;
  },
  IsButtonAllowed(go) {
    if (!go || !this.IsBlocking || this.AllowedButtons.length < 1) return true;
    return this.AllowedButtons.includes(go);
  },
  BlockButtons(...allowed) {
    for (const go of allowed) if (go && !this.AllowedButtons.includes(go)) this.AllowedButtons.push(go);
    this.IsBlocking = this.AllowedButtons.length > 0;
  },
  UnblockButtons(...gos) {
    for (const go of gos) {
      const i = this.AllowedButtons.indexOf(go);
      if (i >= 0) this.AllowedButtons.splice(i, 1);
    }
    this.IsBlocking = this.AllowedButtons.length !== 0;
  },
  UnblockAll() {
    this.AllowedButtons.length = 0;
    this.IsBlocking = false;
  },
};

export const EventSystem = {
  current: null,
  enabled: true,
  pixelDragThreshold: 10,
  pointers: new Map(),
  canvas: null,
  /** set by InputUIBlocker */
  blocked: 0,
  blockedExcept: null,
  currentSelectedGameObject: null,

  init(canvas) {
    this.canvas = canvas;
    this.current = this;
    const toScreen = (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = UISystem.width / r.width;
      const sy = UISystem.height / r.height;
      return [(e.clientX - r.left) * sx, UISystem.height - (e.clientY - r.top) * sy];
    };
    LeanTouch.guiTest = (e) => {
      if (e.clientX === undefined) return false;
      const [x, y] = toScreen(e);
      return UISystem.raycast(x, y).length > 0;
    };
    canvas.addEventListener('pointerdown', (e) => {
      const [x, y] = toScreen(e);
      this.press(e.pointerId, x, y, e.button);
    });
    window.addEventListener('pointermove', (e) => {
      const [x, y] = toScreen(e);
      this.move(e.pointerId, x, y);
    });
    const up = (e) => {
      const [x, y] = toScreen(e);
      this.release(e.pointerId, x, y);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        const [x, y] = toScreen(e);
        this.scroll(x, y, -e.deltaY);
      },
      { passive: true },
    );
  },

  /** EventSystem.IsPointerOverGameObject equivalent for a screen point */
  IsPointerOverUI(x, y) {
    return UISystem.raycast(x, y).length > 0;
  },

  IsPointerOverGameObject() {
    for (const p of this.pointers.values()) if (p.pointerCurrentRaycast.gameObject) return true;
    return false;
  },

  SetSelectedGameObject(go) {
    this.currentSelectedGameObject = go;
  },

  raycastTop(x, y) {
    if (!this.enabled) return null;
    const hits = UISystem.raycast(x, y);
    const top = hits.length ? hits[0].gameObject : null;
    if (this.blocked > 0) {
      // blockedExcept: the one control that still answers while input is blocked (a popup's close button)
      const ex = this.blockedExcept;
      return ex && top && (top === ex || top.transform.IsChildOf?.(ex.transform)) ? top : null;
    }
    return top;
  },

  data(id) {
    let d = this.pointers.get(id);
    if (!d) {
      d = new PointerEventData(id);
      this.pointers.set(id, d);
    }
    return d;
  },

  handleEnterExit(d, newEnter) {
    if (d.pointerEnter === newEnter) return;
    // exit everything that is no longer under the pointer, enter the new chain (Unity: common root kept)
    const chain = [];
    for (let t = newEnter?.transform; t; t = t.parent) chain.push(t.gameObject);
    for (const go of d.hovered.slice()) {
      if (chain.includes(go)) continue;
      ExecuteEvents.Execute(go, d, 'OnPointerExit');
      d.hovered.splice(d.hovered.indexOf(go), 1);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const go = chain[i];
      if (d.hovered.includes(go)) continue;
      ExecuteEvents.Execute(go, d, 'OnPointerEnter');
      d.hovered.push(go);
    }
    d.pointerEnter = newEnter;
  },

  press(id, x, y, button = 0) {
    if (InteractionBlocker.IsBlocking) {
      const go = this.raycastTop(x, y);
      if (!InteractionBlocker.IsButtonAllowed(ExecuteEvents.GetEventHandler(go, 'OnPointerClick'))) return;
    }
    const d = this.data(id);
    d.used = false;
    d.button = button;
    d.position.set(x, y);
    d.delta.set(0, 0);
    d.pressPosition.set(x, y);
    const go = this.raycastTop(x, y);
    d.pointerCurrentRaycast = { gameObject: go };
    d.pointerPressRaycast = { gameObject: go };
    d.eligibleForClick = true;
    d.dragging = false;
    this.handleEnterExit(d, go);
    // DeselectIfSelectionChanged
    const selectHandler = ExecuteEvents.GetEventHandler(go, 'OnSelect');
    if (selectHandler !== this.currentSelectedGameObject) this.SetSelectedGameObject(null, d);
    let pressed = ExecuteEvents.ExecuteHierarchy(go, d, 'OnPointerDown');
    if (!pressed) pressed = ExecuteEvents.GetEventHandler(go, 'OnPointerClick');
    const now = performance.now() / 1000;
    if (pressed === d.lastPress && now - d.clickTime < 0.3) d.clickCount++;
    else d.clickCount = 1;
    d.clickTime = now;
    d.lastPress = pressed;
    d.pointerPress = pressed;
    d.rawPointerPress = go;
    d.pointerDrag = ExecuteEvents.GetEventHandler(go, 'OnDrag');
    if (d.pointerDrag) ExecuteEvents.Execute(d.pointerDrag, d, 'OnInitializePotentialDrag');
    d.down = true;
  },

  move(id, x, y) {
    const d = this.pointers.get(id) || (id === 1 || id >= 0 ? this.data(id) : null);
    if (!d) return;
    d.delta.set(x - d.position.x, y - d.position.y);
    d.position.set(x, y);
    const go = this.raycastTop(x, y);
    d.pointerCurrentRaycast = { gameObject: go };
    this.handleEnterExit(d, go);
    if (!d.down || !d.pointerDrag) return;
    if (InteractionBlocker.BlockingDragging) d.dragging = false;
    if (!d.dragging && !InteractionBlocker.BlockingDragging) {
      const moved = d.position.distanceTo(d.pressPosition);
      if (!d.useDragThreshold || moved >= this.pixelDragThreshold) {
        ExecuteEvents.Execute(d.pointerDrag, d, 'OnBeginDrag');
        d.dragging = true;
        if (d.pointerPress !== d.pointerDrag) {
          ExecuteEvents.Execute(d.pointerPress, d, 'OnPointerUp');
          d.eligibleForClick = false;
          d.pointerPress = null;
          d.rawPointerPress = null;
        }
      }
    }
    if (d.dragging) ExecuteEvents.Execute(d.pointerDrag, d, 'OnDrag');
  },

  release(id, x, y) {
    const d = this.pointers.get(id);
    if (!d || !d.down) return;
    if (InteractionBlocker.IsBlocking && !InteractionBlocker.IsButtonAllowed(ExecuteEvents.GetEventHandler(this.raycastTop(x, y), 'OnPointerClick'))) return;
    d.position.set(x, y);
    const go = this.raycastTop(x, y);
    d.pointerCurrentRaycast = { gameObject: go };
    ExecuteEvents.Execute(d.pointerPress, d, 'OnPointerUp');
    const clickHandler = ExecuteEvents.GetEventHandler(go, 'OnPointerClick');
    if (d.pointerPress && d.pointerPress === clickHandler && d.eligibleForClick) ExecuteEvents.Execute(d.pointerPress, d, 'OnPointerClick');
    else if (d.pointerDrag && d.dragging) ExecuteEvents.ExecuteHierarchy(go, d, 'OnDrop');
    d.eligibleForClick = false;
    d.pointerPress = null;
    d.rawPointerPress = null;
    if (d.pointerDrag && d.dragging) ExecuteEvents.Execute(d.pointerDrag, d, 'OnEndDrag');
    d.dragging = false;
    d.pointerDrag = null;
    d.down = false;
    // touch: the pointer leaves everything when lifted
    if (id !== 1) this.handleEnterExit(d, null);
  },

  scroll(x, y, dy) {
    const d = this.data('wheel');
    d.position.set(x, y);
    d.scrollDelta.set(0, dy / 100);
    const go = this.raycastTop(x, y);
    ExecuteEvents.ExecuteHierarchy(go, d, 'OnScroll');
  },
};

/** InputUIBlocker: static Disable/EnableInput used around transitions */
export const InputUIBlocker = {
  DisableInput() {
    EventSystem.blocked = 1;
  },
  EnableInput() {
    EventSystem.blocked = 0;
  },
};

export class EventSystemComponent extends MonoBehaviour {
  static typeName = 'EventSystem';
}

registerComponent(EventSystemComponent, 'EventSystem');
