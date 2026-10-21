// Render-to-texture for UI previews (the 3D lootbox of LootboxOpenAnimation): a Camera component with a
// targetTexture renders only its culling-mask layer into a WebGLRenderTarget shown by a RawImage.
// Objects under such a camera's socket are moved to that layer so the game camera never draws them.
import * as THREE from 'three';
import { MonoBehaviour, Destroy } from '../engine/scene.js';
import { registerComponent } from '../engine/instantiate.js';
import { LoopHooks } from '../engine/loop.js';
import { Render } from '../engine/render.js';
import { UISystem } from '../ugui/canvas.js';
import { Color } from '../ugui/graphic.js';

const active = new Set();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function layerOf(mask) {
  for (let i = 0; i < 32; i++) if (mask & (1 << i)) return i;
  return 0;
}

export class Camera extends MonoBehaviour {
  static typeName = 'Camera';

  constructor() {
    super();
    this.targetTexture = null;
    this.cam = null;
  }

  OnDeserialize() {
    const d = this._data || {};
    this.fov = d['field of view'] ?? 60;
    this.near = d['near clip plane'] ?? 0.3;
    this.far = d['far clip plane'] ?? 1000;
    this.clearColor = Color.from(d.m_BackGroundColor || [0, 0, 0, 0]);
    this.layer = layerOf(d.m_CullingMask ?? 1);
    this.orthographic = !!d.orthographic;
    this.orthoSize = d['orthographic size'] ?? 5;
  }

  OnEnable() {
    active.add(this);
  }

  OnDisable() {
    active.delete(this);
  }

  OnDestroy() {
    active.delete(this);
  }

  /** render the camera's layer into its target (game camera is untouched) */
  RenderToTarget() {
    const rt = this.targetTexture;
    if (!rt || !this.gameObject.activeInHierarchy) return;
    const aspect = rt.width / rt.height;
    if (!this.cam) this.cam = this.orthographic ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
    const cam = this.cam;
    if (cam.isPerspectiveCamera) {
      cam.fov = this.fov;
      cam.aspect = aspect;
    } else {
      cam.left = -this.orthoSize * aspect;
      cam.right = this.orthoSize * aspect;
      cam.top = this.orthoSize;
      cam.bottom = -this.orthoSize;
    }
    cam.near = this.near;
    cam.far = this.far;
    cam.updateProjectionMatrix();
    // Camera.worldToCameraMatrix ignores the transform scale
    this.transform.updateWorld().decompose(_p, _q, _s);
    cam.matrixWorld.compose(_p, _q, _s.set(1, 1, 1));
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.matrixAutoUpdate = false;
    cam.layers.set(this.layer);
    for (const root of this.layerRoots || []) markLayer(root, this.layer);
    const r = Render.renderer;
    const scene = Render.scene;
    const bg = scene.background;
    const fog = scene.fog;
    const prevTarget = r.getRenderTarget();
    const prevColor = new THREE.Color();
    r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    scene.background = null;
    scene.fog = null;
    r.setRenderTarget(rt);
    r.setClearColor(new THREE.Color(this.clearColor.r, this.clearColor.g, this.clearColor.b), this.clearColor.a);
    r.clear(true, true, true);
    // the camera matrices are set by hand: keep three from overwriting them
    const autoUpdate = cam.matrixWorldAutoUpdate;
    cam.matrixWorldAutoUpdate = false;
    r.render(scene, cam);
    cam.matrixWorldAutoUpdate = autoUpdate;
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    scene.background = bg;
    scene.fog = fog;
  }
}

/** objects (and the particle meshes of their systems) drawn only by the render-texture camera */
function markLayer(go, layer) {
  go.transform.obj.traverse((o) => o.layers.set(layer));
  for (const ps of go.GetComponentsInChildren('ParticleSystem', true)) {
    ps._ui = false;
    if (ps.mesh) ps.mesh.layers.set(layer);
  }
}

LoopHooks.afterLateUpdate.push(() => {
  for (const c of active) c.RenderToTarget();
});

export class RenderTextureCreator extends MonoBehaviour {
  static typeName = 'RenderTextureCreator';

  Awake() {
    // the 3D content is rendered by the RT camera, never through the UI particle path
    for (const ps of this.socket?.gameObject.GetComponentsInChildren('ParticleSystem', true) || []) ps._ui = false;
  }

  Start() {
    const socket = this.socket;
    if (!socket) return;
    socket.SetParent(null, false);
    socket.localScale = new THREE.Vector3(1000, 1000, 1000);
    const w = Math.max(1, UISystem.width);
    const h = Math.max(1, UISystem.height);
    this.texture = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.NoColorSpace, samples: 4 });
    if (this.rawImage) {
      this.rawImage.texture = this.texture.texture;
      this.rawImage.color = Color.white;
    }
    if (this.camera) {
      this.camera.targetTexture = this.texture;
      this.camera.layerRoots = [socket.gameObject];
      markLayer(socket.gameObject, this.camera.layer);
    }
  }

  OnDestroy() {
    if (this.socket && !this.socket.gameObject._destroyed) Destroy(this.socket.gameObject);
    this.texture?.dispose();
  }
}

for (const cls of [Camera, RenderTextureCreator]) registerComponent(cls);
