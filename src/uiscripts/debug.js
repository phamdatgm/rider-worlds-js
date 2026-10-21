// window.__ui: test helpers for headless scenarios (find UI objects, their screen position, press buttons).
import { World } from '../engine/scene.js';
import { UISystem } from '../ugui/canvas.js';
import { EventSystem } from '../ugui/events.js';

function all() {
  return [...World.objects].filter((go) => !go._destroyed);
}

export const UIDebug = {
  /** first active GameObject whose name (or path suffix "Parent/Child") matches */
  find(name, includeInactive = false) {
    const parts = name.split('/');
    for (const go of all()) {
      if (!includeInactive && !go.activeInHierarchy) continue;
      let t = go.transform;
      let ok = true;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!t || t.gameObject.name !== parts[i]) {
          ok = false;
          break;
        }
        t = t.parent;
      }
      if (ok) return go;
    }
    return null;
  },
  findAll(name) {
    return all().filter((go) => go.name === name && go.activeInHierarchy);
  },
  /** CSS pixel center of a RectTransform (for page.mouse.click) */
  center(nameOrGo) {
    const go = typeof nameOrGo === 'string' ? this.find(nameOrGo) : nameOrGo;
    if (!go || !go.transform.isRectTransform) return null;
    const c = go.transform.GetWorldCorners();
    const x = (c[0].x + c[2].x) / 2;
    const y = (c[0].y + c[2].y) / 2;
    const r = EventSystem.canvas.getBoundingClientRect();
    return { x: r.left + (x * r.width) / UISystem.width, y: r.top + ((UISystem.height - y) * r.height) / UISystem.height };
  },
  /** simulate a full pointer press/release on the object's center through the EventSystem */
  tap(nameOrGo) {
    const go = typeof nameOrGo === 'string' ? this.find(nameOrGo) : nameOrGo;
    if (!go) return false;
    const c = go.transform.GetWorldCorners();
    const x = (c[0].x + c[2].x) / 2;
    const y = (c[0].y + c[2].y) / 2;
    EventSystem.press(9999, x, y, 0);
    EventSystem.release(9999, x, y);
    return true;
  },
  /** names of the raycast hits at a screen point (UI space, origin bottom-left) */
  hits(x, y) {
    return UISystem.raycast(x, y).map((g) => g.gameObject.name);
  },
  tree(nameOrGo, depth = 3) {
    const go = typeof nameOrGo === 'string' ? this.find(nameOrGo, true) : nameOrGo;
    const out = [];
    const walk = (t, d) => {
      out.push(`${'  '.repeat(d)}${t.gameObject.name}${t.gameObject.activeSelf ? '' : ' (off)'}`);
      if (d < depth) for (const ch of t.children) walk(ch, d + 1);
    };
    if (go) walk(go.transform, 0);
    return out.join('\n');
  },
};

window.__ui = UIDebug;
