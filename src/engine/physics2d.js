// Unity Physics2D on top of planck.js (a Box2D port — the same engine Unity's 2D physics uses).
//
// Mapping notes:
//  * Rigidbody2D.angularVelocity / rotation are in degrees (Unity), planck uses radians.
//  * Torque / impulse values are passed through unchanged (Unity forwards them to Box2D as-is).
//  * Mass is set explicitly (useAutoMass = false in this project); inertia comes from fixture densities
//    scaled to that mass, like Unity.
//  * Collider shapes are baked with the collider's full transform relative to the body pose, so scale and
//    mirrored (180 deg Y) transforms work like in Unity.
//  * Collision / trigger callbacks are queued during the step and dispatched afterwards to the collider's
//    GameObject and, if different, to its attached Rigidbody2D's GameObject.
import * as planck from 'planck';
import * as THREE from 'three';
import { Behaviour, Component, World } from './scene.js';
import { Time } from './core.js';
import { Deg2Rad, Rad2Deg, quatZ, eulerZ } from './math.js';
import { convexDecompose } from './polygon.js';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const ForceMode2D = { Force: 0, Impulse: 1 };
export const RigidbodyType2D = { Dynamic: 0, Kinematic: 1, Static: 2 };
export const RigidbodyConstraints2D = { None: 0, FreezePositionX: 1, FreezePositionY: 2, FreezePosition: 3, FreezeRotation: 4, FreezeAll: 7 };

// ---------------------------------------------------------------- Physics2D service

export const Physics2D = {
  world: null,
  gravity: new THREE.Vector2(0, -9.81),
  velocityIterations: 8,
  positionIterations: 3,
  layerMasks: new Array(32).fill(0xffffffff),
  defaultFriction: 0.4,
  defaultBounciness: 0,
  queriesHitTriggers: true,
  queriesStartInColliders: true,
  bodies: new Set(),
  colliders: new Set(),
  events: [],
  pairs: new Map(),
  _nextColliderId: 1,

  init(cfg = {}) {
    if (cfg.gravity) this.gravity.set(cfg.gravity[0], cfg.gravity[1]);
    this.velocityIterations = cfg.velocityIterations ?? 8;
    this.positionIterations = cfg.positionIterations ?? 3;
    if (cfg.layerCollisionMatrix) this.layerMasks = cfg.layerCollisionMatrix.map((m) => m >>> 0);
    this.defaultFriction = cfg.defaultFriction ?? 0.4;
    this.defaultBounciness = cfg.defaultBounciness ?? 0;
    // Unity Physics2DSettings of this project
    planck.Settings.velocityThreshold = cfg.velocityThreshold ?? 1;
    planck.Settings.maxTranslation = 100; // Unity "max translation speed" is per update
    planck.Settings.maxRotation = 2 * Math.PI; // 360 deg per update
    planck.Settings.maxLinearCorrection = 0.2;
    planck.Settings.maxAngularCorrection = 8 * Deg2Rad;
    planck.Settings.baumgarte = 0.2;
    planck.Settings.toiBaugarte = 0.75;
    planck.Settings.timeToSleep = 0.5;
    planck.Settings.linearSleepTolerance = 0.01;
    planck.Settings.angularSleepTolerance = 2 * Deg2Rad;
    this.world = new planck.World({ gravity: planck.Vec2(this.gravity.x, this.gravity.y) });
    this.world.on('begin-contact', (c) => this._queueContact('begin', c));
    this.world.on('end-contact', (c) => this._queueContact('end', c));
  },

  setGravity(x, y) {
    this.gravity.set(x, y);
    this.world.setGravity(planck.Vec2(x, y));
  },

  _queueContact(kind, contact) {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ca = fa.getUserData();
    const cb = fb.getUserData();
    if (!ca || !cb) return;
    if (kind === 'end' && (ca._suppressEnd || cb._suppressEnd)) return;
    let point = null;
    let normal = null;
    if (kind === 'begin') {
      const wm = contact.getWorldManifold(null);
      if (wm) {
        normal = new THREE.Vector2(wm.normal.x, wm.normal.y);
        const pts = wm.points || [];
        if (pts.length) point = new THREE.Vector2(pts[0].x, pts[0].y);
        if (pts.length > 1) point = new THREE.Vector2((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      }
      if (!point) {
        const p = fa.getBody().getPosition();
        point = new THREE.Vector2(p.x, p.y);
      }
      if (!normal) normal = new THREE.Vector2(0, 1);
    }
    const va = fa.getBody().getLinearVelocity();
    const vb = fb.getBody().getLinearVelocity();
    this.events.push({ kind, ca, cb, point, normal, rel: new THREE.Vector2(vb.x - va.x, vb.y - va.y) });
  },

  // ---- simulation
  /** Bodies ordered parents-first so a parent's transform write never displaces a child body. */
  sortedBodies() {
    const version = `${this._bodiesVersion}:${World.hierarchyVersion}`;
    if (!this._sorted || this._sortedVersion !== version) {
      const depth = (rb) => {
        let d = 0;
        for (let t = rb.transform.parent; t; t = t.parent) d++;
        return d;
      };
      this._sorted = [...this.bodies].sort((a, b) => depth(a) - depth(b));
      this._sortedVersion = version;
    }
    return this._sorted;
  },

  addBody(rb) {
    if (this.bodies.has(rb)) return;
    this.bodies.add(rb);
    this._bodiesVersion = (this._bodiesVersion || 0) + 1;
  },

  removeBody(rb) {
    if (this.bodies.delete(rb)) this._bodiesVersion = (this._bodiesVersion || 0) + 1;
  },

  step(dt) {
    const bodies = this.sortedBodies();
    // transforms -> bodies
    for (const rb of bodies) rb._preStep(dt);
    for (const col of this.colliders) col._checkDirty();
    this.world.step(dt, this.velocityIterations, this.positionIterations);
    for (const rb of bodies) rb._postStep(dt);
    this._dispatch();
  },

  _dispatch() {
    const evs = this.events;
    this.events = [];
    for (const e of evs) {
      const key = e.ca._id < e.cb._id ? `${e.ca._id}|${e.cb._id}` : `${e.cb._id}|${e.ca._id}`;
      let n = this.pairs.get(key) || 0;
      if (e.kind === 'begin') {
        this.pairs.set(key, n + 1);
        if (n === 0) {
          if (e.ca._rebuiltPartners?.delete(e.cb) || e.cb._rebuiltPartners?.delete(e.ca)) continue;
          this._send(e, true);
        }
      } else {
        if (n <= 0) continue;
        n -= 1;
        if (n === 0) this.pairs.delete(key);
        else this.pairs.set(key, n);
        if (n === 0) this._send(e, false);
      }
    }
    // partners that were touching before a collider rebuild and did not re-touch -> exit
    for (const col of this.colliders) {
      if (col._rebuiltPartners && col._rebuiltPartners.size && col._rebuildStep !== this._stepCount) {
        for (const other of col._rebuiltPartners) this._send({ ca: col, cb: other, point: null, normal: null, rel: new THREE.Vector2() }, false);
        col._rebuiltPartners.clear();
      }
    }
    this._stepCount = (this._stepCount || 0) + 1;
  },

  _send(e, enter) {
    const trigger = e.ca.isTrigger || e.cb.isTrigger;
    if (trigger) {
      const name = enter ? 'OnTriggerEnter2D' : 'OnTriggerExit2D';
      deliver(e.ca, name, e.cb);
      deliver(e.cb, name, e.ca);
    } else {
      const name = enter ? 'OnCollisionEnter2D' : 'OnCollisionExit2D';
      // box2d normal points A -> B; Unity's contact normal for the receiver points from the other collider to it
      deliver(e.ca, name, makeCollision(e.ca, e.cb, e, e.normal ? e.normal.clone().negate() : null));
      deliver(e.cb, name, makeCollision(e.cb, e.ca, e, e.normal ? e.normal.clone() : null));
    }
  },

  /** Unity Physics2D.Raycast with a layer mask. Returns hits sorted by distance (at most `max`). */
  RaycastAll(origin, direction, distance = Infinity, layerMask = 0xffffffff, useTriggers = this.queriesHitTriggers, max = 16) {
    const dir = new THREE.Vector2(direction.x, direction.y);
    const len = dir.length();
    if (len < 1e-9) return [];
    dir.divideScalar(len);
    if (!Number.isFinite(distance)) distance = 1e4;
    const p1 = planck.Vec2(origin.x, origin.y);
    const p2 = planck.Vec2(origin.x + dir.x * distance, origin.y + dir.y * distance);
    const byCollider = new Map();
    const accept = (fixture) => {
      const col = fixture.getUserData();
      if (!col || !col.enabled) return null;
      if (fixture.isSensor() && !useTriggers) return null;
      if (((1 << col.gameObject.layer) & layerMask) === 0) return null;
      return col;
    };
    this.world.rayCast(p1, p2, (fixture, point, normal, fraction) => {
      const col = accept(fixture);
      if (!col) return -1;
      const prev = byCollider.get(col);
      if (!prev || fraction < prev.fraction) {
        byCollider.set(col, {
          collider: col,
          point: new THREE.Vector2(point.x, point.y),
          normal: new THREE.Vector2(normal.x, normal.y),
          fraction,
          distance: fraction * distance,
        });
      }
      return 1;
    });
    if (this.queriesStartInColliders) {
      const aabb = { lowerBound: planck.Vec2(origin.x - 1e-4, origin.y - 1e-4), upperBound: planck.Vec2(origin.x + 1e-4, origin.y + 1e-4) };
      this.world.queryAABB(aabb, (fixture) => {
        const col = accept(fixture);
        if (col && fixture.testPoint(p1)) {
          byCollider.set(col, {
            collider: col,
            point: new THREE.Vector2(origin.x, origin.y),
            normal: dir.clone().negate(),
            fraction: 0,
            distance: 0,
          });
        }
        return true;
      });
    }
    const hits = [...byCollider.values()].sort((a, b) => a.fraction - b.fraction);
    for (const h of hits) {
      h.rigidbody = h.collider.attachedRigidbody;
      h.transform = h.collider.transform;
    }
    return hits.slice(0, max);
  },

  Raycast(origin, direction, distance, layerMask, useTriggers) {
    const hits = this.RaycastAll(origin, direction, distance, layerMask, useTriggers, 1);
    return hits[0] || null;
  },

  /** Physics2DExtension.RaycastNoTriggers */
  RaycastNoTriggers(origin, direction, distance, layerMask, max = 1) {
    if (max === 1) return this.Raycast(origin, direction, distance, layerMask, false);
    return this.RaycastAll(origin, direction, distance, layerMask, false, max);
  },

  OverlapPoint(point, layerMask = 0xffffffff) {
    let found = null;
    const p = planck.Vec2(point.x, point.y);
    this.world.queryAABB({ lowerBound: planck.Vec2(p.x - 1e-4, p.y - 1e-4), upperBound: planck.Vec2(p.x + 1e-4, p.y + 1e-4) }, (f) => {
      const col = f.getUserData();
      if (col && ((1 << col.gameObject.layer) & layerMask) && f.testPoint(p)) {
        found = col;
        return false;
      }
      return true;
    });
    return found;
  },
};

function deliver(col, method, arg) {
  const go = col.gameObject;
  const targets = [go];
  const rbGo = col.attachedRigidbody?.gameObject;
  if (rbGo && rbGo !== go) targets.push(rbGo);
  for (const t of targets) {
    if (t._destroyed || !t.activeInHierarchy) continue;
    for (const c of t.components.slice()) {
      if (typeof c[method] === 'function' && c.enabled !== false && !c._destroyed) {
        try {
          c[method](arg);
        } catch (e) {
          console.error(`${method} on ${t.name}`, e);
        }
      }
    }
  }
}

function makeCollision(self, other, e, normal) {
  return {
    collider: other,
    otherCollider: self,
    gameObject: other.gameObject,
    transform: other.transform,
    rigidbody: other.attachedRigidbody,
    otherRigidbody: self.attachedRigidbody,
    relativeVelocity: e.rel,
    contacts: [{ point: e.point ? e.point.clone() : new THREE.Vector2(), normal: normal || new THREE.Vector2(0, 1), collider: other, otherCollider: self }],
  };
}

// ---------------------------------------------------------------- Rigidbody2D

export class Rigidbody2D extends Component {
  static typeName = 'Rigidbody2D';

  constructor() {
    super();
    this.body = null;
    this._bodyType = 0;
    this._mass = 1;
    this._drag = 0;
    this._angularDrag = 0.05;
    this._gravityScale = 1;
    this.interpolate = 0;
    this.collisionDetection = 0;
    this._constraints = 0;
    this._simulated = true;
    this.sleepingMode = 1;
    this._centerOfMass = null;
    this._syncStamp = -1;
    this._kinTarget = null;
    this._kinRot = null;
    this._prev = { x: 0, y: 0, a: 0 };
    this._cur = { x: 0, y: 0, a: 0 };
    this._angle0 = 0;
    this._q0 = new THREE.Quaternion();
    this.colliders = new Set();
  }

  static fromData(rb, d) {
    rb._bodyType = d.m_BodyType ?? 0;
    rb._simulated = d.m_Simulated !== 0;
    rb._mass = d.m_Mass ?? 1;
    rb._useAutoMass = !!d.m_UseAutoMass;
    rb._drag = d.m_LinearDrag ?? 0;
    rb._angularDrag = d.m_AngularDrag ?? 0.05;
    rb._gravityScale = d.m_GravityScale ?? 1;
    rb.interpolate = d.m_Interpolate ?? 0;
    rb.collisionDetection = d.m_CollisionDetection ?? 0;
    rb._constraints = d.m_Constraints ?? 0;
    rb.sleepingMode = d.m_SleepingMode ?? 1;
    rb.material = d.m_Material && d.m_Material.$pmat ? d.m_Material : null;
  }

  _awake() {}

  _activate() {
    this.ensureBody();
    if (this.body) this.body.setActive(this._simulated);
    Physics2D.addBody(this);
  }

  _deactivate() {
    if (this.body) this.body.setActive(false);
    Physics2D.removeBody(this);
  }

  _destroy() {
    Physics2D.removeBody(this);
    for (const c of [...this.colliders]) c._destroyFixtures();
    if (this.body) {
      Physics2D.world.destroyBody(this.body);
      this.body = null;
    }
  }

  ensureBody() {
    if (this.body) return this.body;
    const tr = this.transform;
    const p = tr.position;
    const q = tr.rotation;
    const a = eulerZ(q);
    this._angle0 = a;
    this._q0.copy(q);
    const type = this._bodyType === 0 ? 'dynamic' : this._bodyType === 1 ? 'kinematic' : 'static';
    this.body = Physics2D.world.createBody({
      type,
      position: planck.Vec2(p.x, p.y),
      angle: a * Deg2Rad,
      linearDamping: this._drag,
      angularDamping: this._angularDrag,
      gravityScale: this._gravityScale,
      bullet: this.collisionDetection === 1,
      fixedRotation: (this._constraints & 4) !== 0,
      allowSleep: this.sleepingMode !== 0,
      awake: this.sleepingMode !== 2,
    });
    this.body.setUserData(this);
    this._cur = { x: p.x, y: p.y, a };
    this._prev = { ...this._cur };
    this._syncStamp = tr._changed;
    return this.body;
  }

  updateMass() {
    const b = this.body;
    if (!b || this._bodyType !== 0) return;
    const md = { mass: 0, center: planck.Vec2(0, 0), I: 0 };
    b.resetMassData();
    b.getMassData(md);
    const mass = this._useAutoMass ? md.mass : this._mass;
    let iCenter = md.I - md.mass * (md.center.x * md.center.x + md.center.y * md.center.y);
    if (md.mass > 0) iCenter *= mass / md.mass;
    else iCenter = mass * 0.1;
    const c = this._centerOfMass ? planck.Vec2(this._centerOfMass.x, this._centerOfMass.y) : md.center;
    b.setMassData({ mass, center: c, I: Math.max(iCenter, 1e-6) + mass * (c.x * c.x + c.y * c.y) });
  }

  // ---- sync
  /** If a script moved the transform since the last physics write, teleport the body there. */
  syncFromTransform() {
    const b = this.body;
    const tr = this.transform;
    if (!b || tr._changed === this._syncStamp) return;
    const p = tr.position;
    const q = tr.rotation;
    const a = eulerZ(q);
    this._angle0 = a;
    this._q0.copy(q);
    b.setTransform(planck.Vec2(p.x, p.y), a * Deg2Rad);
    this._cur = { x: p.x, y: p.y, a };
    this._prev = { ...this._cur };
    this._syncStamp = tr._changed;
    b.setAwake(true);
  }

  _preStep(dt) {
    const b = this.body;
    if (!b) return;
    this.syncFromTransform();
    this._prev = { ...this._cur };
    if (this._bodyType === 1) {
      if (this._kinTarget || this._kinRot !== null) {
        const pos = b.getPosition();
        const tx = this._kinTarget ? this._kinTarget.x : pos.x;
        const ty = this._kinTarget ? this._kinTarget.y : pos.y;
        b.setLinearVelocity(planck.Vec2((tx - pos.x) / dt, (ty - pos.y) / dt));
        if (this._kinRot !== null) {
          const cur = b.getAngle();
          b.setAngularVelocity((this._kinRot * Deg2Rad - cur) / dt);
        } else b.setAngularVelocity(0);
        this._kinMoving = true;
      }
    }
    const cons = this._constraints;
    if (cons & 3) {
      const v = b.getLinearVelocity();
      b.setLinearVelocity(planck.Vec2(cons & 1 ? 0 : v.x, cons & 2 ? 0 : v.y));
      this._frozenPos = b.getPosition().clone();
    }
  }

  _postStep() {
    const b = this.body;
    if (!b) return;
    if (this._kinMoving) {
      if (this._kinTarget) b.setTransform(planck.Vec2(this._kinTarget.x, this._kinTarget.y), this._kinRot !== null ? this._kinRot * Deg2Rad : b.getAngle());
      else if (this._kinRot !== null) b.setTransform(b.getPosition(), this._kinRot * Deg2Rad);
      b.setLinearVelocity(planck.Vec2(0, 0));
      b.setAngularVelocity(0);
      this._kinTarget = null;
      this._kinRot = null;
      this._kinMoving = false;
    }
    const cons = this._constraints;
    if ((cons & 3) && this._frozenPos) {
      const p = b.getPosition();
      b.setTransform(planck.Vec2(cons & 1 ? this._frozenPos.x : p.x, cons & 2 ? this._frozenPos.y : p.y), b.getAngle());
    }
    const p = b.getPosition();
    this._cur = { x: p.x, y: p.y, a: b.getAngle() * Rad2Deg };
    if (this._bodyType !== 2) this._writeTransform(this._cur.x, this._cur.y, this._cur.a);
  }

  _writeTransform(x, y, aDeg) {
    const tr = this.transform;
    const z = tr.position.z;
    quatZ(aDeg - this._angle0, _q).multiply(this._q0);
    tr.rotation = _q;
    tr.position = _v3.set(x, y, z);
    this._syncStamp = tr._changed;
  }

  /** Called every rendered frame with alpha in [0,1] between previous and current physics state. */
  _interpolate(alpha) {
    if (!this.body || this._bodyType === 2) return;
    if (this.interpolate !== 1 || !this.body.isActive()) return;
    if (this.transform._changed !== this._syncStamp) return;
    const a = this._prev;
    const b = this._cur;
    let da = b.a - a.a;
    this._writeTransform(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.a + da * alpha);
  }

  _restorePose() {
    if (!this.body || this.interpolate !== 1 || this._bodyType === 2) return;
    if (this.transform._changed !== this._syncStamp) return; // moved by a script: keep it, the step will teleport
    this._writeTransform(this._cur.x, this._cur.y, this._cur.a);
  }

  // ---- Unity API
  get attachedColliderCount() {
    return this.colliders.size;
  }

  get bodyType() {
    return this._bodyType;
  }

  set bodyType(t) {
    this._bodyType = t;
    if (this.body) {
      this.body.setType(t === 0 ? 'dynamic' : t === 1 ? 'kinematic' : 'static');
      this.updateMass();
      this.body.setAwake(true);
    }
  }

  get isKinematic() {
    return this._bodyType === 1;
  }

  get simulated() {
    return this._simulated;
  }

  set simulated(v) {
    this._simulated = !!v;
    if (this.body) this.body.setActive(this._simulated && this.gameObject.activeInHierarchy);
  }

  get mass() {
    return this._mass;
  }

  set mass(m) {
    this._mass = m;
    this.updateMass();
  }

  get drag() {
    return this._drag;
  }

  set drag(v) {
    this._drag = v;
    if (this.body) this.body.setLinearDamping(v);
  }

  get angularDrag() {
    return this._angularDrag;
  }

  set angularDrag(v) {
    this._angularDrag = v;
    if (this.body) this.body.setAngularDamping(v);
  }

  get gravityScale() {
    return this._gravityScale;
  }

  set gravityScale(v) {
    if (v === this._gravityScale) return;
    this._gravityScale = v;
    if (this.body) {
      this.body.setGravityScale(v);
      this.body.setAwake(true);
    }
  }

  get constraints() {
    return this._constraints;
  }

  set constraints(c) {
    if (c === this._constraints) return;
    this._constraints = c;
    if (this.body) {
      this.body.setFixedRotation((c & 4) !== 0);
      if (!(c & 3)) this._frozenPos = null;
      else this._frozenPos = this.body.getPosition().clone();
      this.updateMass();
    }
  }

  get centerOfMass() {
    if (!this.body) return new THREE.Vector2();
    const c = this.body.getLocalCenter();
    return new THREE.Vector2(c.x, c.y);
  }

  set centerOfMass(v) {
    this._centerOfMass = new THREE.Vector2(v.x, v.y);
    this.updateMass();
  }

  get inertia() {
    return this.body ? this.body.getInertia() : 0;
  }

  get velocity() {
    if (!this.body) return new THREE.Vector2();
    const v = this.body.getLinearVelocity();
    return new THREE.Vector2(v.x, v.y);
  }

  set velocity(v) {
    if (!this.body) return;
    this.body.setLinearVelocity(planck.Vec2(v.x, v.y));
    if (v.x || v.y) this.body.setAwake(true);
  }

  get angularVelocity() {
    return this.body ? this.body.getAngularVelocity() * Rad2Deg : 0;
  }

  set angularVelocity(w) {
    if (!this.body) return;
    this.body.setAngularVelocity(w * Deg2Rad);
    if (w) this.body.setAwake(true);
  }

  get position() {
    if (!this.body) {
      const p = this.transform.position;
      return new THREE.Vector2(p.x, p.y);
    }
    // Physics2D.autoSyncTransforms is on in the project: a transform moved by a script (e.g. a chunk translated
    // to its spawn point) is seen right away, not only after the next step
    this.syncFromTransform();
    const p = this.body.getPosition();
    return new THREE.Vector2(p.x, p.y);
  }

  set position(p) {
    if (!this.body) return;
    this.body.setTransform(planck.Vec2(p.x, p.y), this.body.getAngle());
    this._cur.x = p.x;
    this._cur.y = p.y;
    this._writeTransform(p.x, p.y, this._cur.a);
  }

  get rotation() {
    if (!this.body) return eulerZ(this.transform.rotation);
    this.syncFromTransform();
    return this.body.getAngle() * Rad2Deg;
  }

  set rotation(deg) {
    this.SetRotation(deg);
  }

  SetRotation(deg) {
    if (!this.body) return;
    this.body.setTransform(this.body.getPosition(), deg * Deg2Rad);
    this._cur.a = deg;
    this._prev.a = deg;
    this._writeTransform(this._cur.x, this._cur.y, deg);
  }

  MovePosition(p) {
    if (!this.body) return;
    if (this._bodyType === 1) this._kinTarget = new THREE.Vector2(p.x, p.y);
    else {
      // dynamic: Unity moves it via velocity too; approximate with teleport
      this.position = p;
    }
  }

  MoveRotation(deg) {
    if (!this.body) return;
    if (this._bodyType === 1) this._kinRot = deg;
    else this.SetRotation(deg);
  }

  AddForce(f, mode = ForceMode2D.Force) {
    const b = this.body;
    if (!b || this._bodyType !== 0) return;
    if (mode === ForceMode2D.Impulse) b.applyLinearImpulse(planck.Vec2(f.x, f.y), b.getWorldCenter(), true);
    else b.applyForceToCenter(planck.Vec2(f.x, f.y), true);
  }

  AddForceAtPosition(f, p, mode = ForceMode2D.Force) {
    const b = this.body;
    if (!b || this._bodyType !== 0) return;
    if (mode === ForceMode2D.Impulse) b.applyLinearImpulse(planck.Vec2(f.x, f.y), planck.Vec2(p.x, p.y), true);
    else b.applyForce(planck.Vec2(f.x, f.y), planck.Vec2(p.x, p.y), true);
  }

  AddTorque(t, mode = ForceMode2D.Force) {
    const b = this.body;
    if (!b || this._bodyType !== 0) return;
    if (mode === ForceMode2D.Impulse) b.applyAngularImpulse(t, true);
    else b.applyTorque(t, true);
  }

  GetPoint(worldPoint) {
    const p = this.body.getLocalPoint(planck.Vec2(worldPoint.x, worldPoint.y));
    return new THREE.Vector2(p.x, p.y);
  }

  WakeUp() {
    this.body?.setAwake(true);
  }

  IsSleeping() {
    return this.body ? !this.body.isAwake() : false;
  }
}

// ---------------------------------------------------------------- Colliders

const decompCache = new Map();

export class Collider2D extends Behaviour {
  static typeName = 'Collider2D';

  constructor() {
    super();
    this._id = Physics2D._nextColliderId++;
    this.isTrigger = false;
    this.offset = new THREE.Vector2();
    this.density = 1;
    this.material = null;
    this.fixtures = [];
    this.attachedRigidbody = null;
    this._ownBody = null;
    this._dirty = false;
    this._relCache = null;
    this._rebuiltPartners = null;
  }

  static fromData(c, d) {
    c._enabled = d.m_Enabled !== 0;
    c.isTrigger = !!d.m_IsTrigger;
    c.offset = new THREE.Vector2(...(d.m_Offset || [0, 0]));
    c.density = d.m_Density ?? 1;
    c.material = d.m_Material && d.m_Material.$pmat ? d.m_Material : null;
  }

  get friction() {
    const m = this.material || this.attachedRigidbody?.material;
    return m ? m.friction : Physics2D.defaultFriction;
  }

  get bounciness() {
    const m = this.material || this.attachedRigidbody?.material;
    return m ? m.bounciness : Physics2D.defaultBounciness;
  }

  _activate() {
    if (!this._enabled || this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = true;
    Physics2D.colliders.add(this);
    this._build();
  }

  _deactivate() {
    if (!this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = false;
    Physics2D.colliders.delete(this);
    this._destroyFixtures();
  }

  _destroy() {
    this._deactivate();
  }

  markDirty() {
    this._dirty = true;
  }

  /** Local shape definitions in collider space: [{type:'poly', pts}, {type:'circle', c:[x,y], r}, {type:'chain', pts}] */
  shapes() {
    return [];
  }

  _destroyFixtures() {
    if (this.fixtures.length) {
      for (const f of this.fixtures) {
        const b = f.getBody();
        b.destroyFixture(f);
      }
      this.fixtures = [];
      if (this.attachedRigidbody) {
        this.attachedRigidbody.colliders.delete(this);
        this.attachedRigidbody.updateMass();
      }
    }
    if (this._ownBody) {
      Physics2D.world.destroyBody(this._ownBody);
      this._ownBody = null;
    }
    // pair bookkeeping for this collider is dropped; partners get Exit through end-contact events
  }

  _rebuild() {
    // keep touching partners so the re-created fixtures don't fire Exit+Enter
    const partners = new Set();
    for (const [key, n] of Physics2D.pairs) {
      if (n <= 0) continue;
      const [a, b] = key.split('|').map(Number);
      if (a === this._id || b === this._id) {
        const otherId = a === this._id ? b : a;
        for (const c of Physics2D.colliders) if (c._id === otherId) partners.add(c);
        Physics2D.pairs.delete(key);
      }
    }
    this._suppressEnd = true;
    this._destroyFixtures();
    this._suppressEnd = false;
    this._build();
    this._rebuiltPartners = partners;
    this._rebuildStep = Physics2D._stepCount || 0;
  }

  _build() {
    if (!this.gameObject.activeInHierarchy || !this._enabled) return;
    const rb = this.gameObject.GetComponentInParent(Rigidbody2D);
    let body;
    const colWorld = this.transform.updateWorld();
    let toBody;
    if (rb && rb.gameObject.activeInHierarchy) {
      body = rb.ensureBody();
      rb.syncFromTransform(); // shapes are baked relative to the body pose, so it must match the transform
      this.attachedRigidbody = rb;
      rb.colliders.add(this);
      // collider space -> body space
      const bp = body.getPosition();
      const ba = body.getAngle();
      _m2.makeRotationZ(ba).setPosition(bp.x, bp.y, 0).invert();
      toBody = new THREE.Matrix4().multiplyMatrices(_m2, colWorld);
      rb.transform.updateWorld();
      this._relCache = new THREE.Matrix4().copy(rb.transform.obj.matrixWorld).invert().multiply(colWorld);
    } else {
      this.attachedRigidbody = null;
      const p = this.transform.position;
      const a = eulerZ(this.transform.rotation);
      body = Physics2D.world.createBody({ type: 'static', position: planck.Vec2(p.x, p.y), angle: a * Deg2Rad });
      this._ownBody = body;
      _m2.makeRotationZ(a * Deg2Rad).setPosition(p.x, p.y, 0).invert();
      toBody = new THREE.Matrix4().multiplyMatrices(_m2, colWorld);
      this._relCache = colWorld.clone();
    }
    const mirrored = toBody.determinant() < 0;
    const e = toBody.elements;
    const tx = (x, y) => [e[0] * x + e[4] * y + e[12], e[1] * x + e[5] * y + e[13]];
    const sx = Math.hypot(e[0], e[1]);
    const sy = Math.hypot(e[4], e[5]);
    const layer = this.gameObject.layer;
    const fdef = {
      density: this.density,
      friction: this.friction,
      restitution: this.bounciness,
      isSensor: this.isTrigger,
      filterCategoryBits: 1 << layer,
      filterMaskBits: Physics2D.layerMasks[layer] >>> 0,
      userData: this,
    };
    for (const s of this.shapes()) {
      try {
        if (s.type === 'circle') {
          const c = tx(s.c[0], s.c[1]);
          const r = Math.max(s.r * Math.max(sx, sy), 0.0005);
          this.fixtures.push(body.createFixture(planck.Circle(planck.Vec2(c[0], c[1]), r), fdef));
        } else if (s.type === 'poly') {
          let pts = s.pts.map((p) => tx(p[0], p[1]));
          if (mirrored) pts = pts.reverse();
          if (!validPoly(pts)) continue;
          this.fixtures.push(body.createFixture(planck.Polygon(pts.map((p) => planck.Vec2(p[0], p[1]))), fdef));
        } else if (s.type === 'chain') {
          const pts = s.pts.map((p) => tx(p[0], p[1]));
          for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-5) continue;
            this.fixtures.push(body.createFixture(planck.Edge(planck.Vec2(a[0], a[1]), planck.Vec2(b[0], b[1])), fdef));
          }
        }
      } catch (err) {
        console.warn('collider shape failed', this.gameObject.name, err);
      }
    }
    if (rb) rb.updateMass();
    this._dirty = false;
  }

  /** Detect transform changes relative to the body (or world, for static colliders). */
  _checkDirty() {
    if (!this._isActiveAndEnabled) return;
    if (this._dirty) {
      this._rebuild();
      return;
    }
    const colWorld = this.transform.updateWorld();
    if (this.attachedRigidbody) {
      if (this.attachedRigidbody.gameObject === this.gameObject) return;
      this.attachedRigidbody.transform.updateWorld();
      _m.copy(this.attachedRigidbody.transform.obj.matrixWorld).invert().multiply(colWorld);
      if (!matEq(_m, this._relCache)) this._rebuild();
    } else if (!matEq(colWorld, this._relCache)) {
      // static collider moved: teleport if only position/rotation changed, otherwise rebuild
      const old = this._relCache;
      const sOld = new THREE.Vector3().setFromMatrixScale(old);
      const sNew = new THREE.Vector3().setFromMatrixScale(colWorld);
      if (sOld.distanceTo(sNew) > 1e-5 || Math.sign(old.determinant()) !== Math.sign(colWorld.determinant())) {
        this._rebuild();
        return;
      }
      const p = this.transform.position;
      this._ownBody.setTransform(planck.Vec2(p.x, p.y), eulerZ(this.transform.rotation) * Deg2Rad);
      this._relCache.copy(colWorld);
    }
  }

  get bounds() {
    // world AABB of the shapes
    const w = this.transform.updateWorld();
    const min = new THREE.Vector3(Infinity, Infinity, 0);
    const max = new THREE.Vector3(-Infinity, -Infinity, 0);
    const add = (x, y) => {
      _v3.set(x, y, 0).applyMatrix4(w);
      min.x = Math.min(min.x, _v3.x);
      min.y = Math.min(min.y, _v3.y);
      max.x = Math.max(max.x, _v3.x);
      max.y = Math.max(max.y, _v3.y);
    };
    for (const s of this.shapes()) {
      if (s.type === 'circle') {
        add(s.c[0] - s.r, s.c[1] - s.r);
        add(s.c[0] + s.r, s.c[1] + s.r);
      } else for (const p of s.pts) add(p[0], p[1]);
    }
    const center = min.clone().add(max).multiplyScalar(0.5);
    return { min, max, center, size: max.clone().sub(min) };
  }

  OverlapPoint(p) {
    const v = planck.Vec2(p.x, p.y);
    return this.fixtures.some((f) => f.testPoint(v));
  }

  IsTouching(other) {
    const key = this._id < other._id ? `${this._id}|${other._id}` : `${other._id}|${this._id}`;
    return (Physics2D.pairs.get(key) || 0) > 0;
  }
}

function validPoly(pts) {
  if (pts.length < 3) return false;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) > 1e-6;
}

function matEq(a, b) {
  if (!b) return false;
  const x = a.elements;
  const y = b.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > 1e-6) return false;
  return true;
}

export class BoxCollider2D extends Collider2D {
  static typeName = 'BoxCollider2D';

  static fromData(c, d) {
    Collider2D.fromData(c, d);
    c._size = new THREE.Vector2(...(d.m_Size || [1, 1]));
    c.edgeRadius = d.m_EdgeRadius || 0;
  }

  get size() {
    return this._size.clone();
  }

  set size(v) {
    this._size = new THREE.Vector2(v.x, v.y);
    this.markDirty();
  }

  shapes() {
    const hx = this._size.x / 2;
    const hy = this._size.y / 2;
    const o = this.offset;
    return [{ type: 'poly', pts: [[o.x - hx, o.y - hy], [o.x + hx, o.y - hy], [o.x + hx, o.y + hy], [o.x - hx, o.y + hy]] }];
  }
}

export class CircleCollider2D extends Collider2D {
  static typeName = 'CircleCollider2D';

  static fromData(c, d) {
    Collider2D.fromData(c, d);
    c._radius = d.m_Radius ?? 0.5;
  }

  get radius() {
    return this._radius;
  }

  set radius(r) {
    if (r === this._radius) return;
    this._radius = r;
    this.markDirty();
  }

  shapes() {
    return [{ type: 'circle', c: [this.offset.x, this.offset.y], r: this._radius }];
  }
}

export class CapsuleCollider2D extends Collider2D {
  static typeName = 'CapsuleCollider2D';

  static fromData(c, d) {
    Collider2D.fromData(c, d);
    c.size = new THREE.Vector2(...(d.m_Size || [0.5, 1]));
    c.direction = d.m_Direction ?? 0; // 0 vertical, 1 horizontal
  }

  shapes() {
    const o = this.offset;
    const w = this.size.x;
    const h = this.size.y;
    if (this.direction === 1) {
      const r = h / 2;
      const hx = Math.max(w / 2 - r, 0);
      const out = [{ type: 'circle', c: [o.x - hx, o.y], r }, { type: 'circle', c: [o.x + hx, o.y], r }];
      if (hx > 1e-4) out.push({ type: 'poly', pts: [[o.x - hx, o.y - r], [o.x + hx, o.y - r], [o.x + hx, o.y + r], [o.x - hx, o.y + r]] });
      return out;
    }
    const r = w / 2;
    const hy = Math.max(h / 2 - r, 0);
    const out = [{ type: 'circle', c: [o.x, o.y - hy], r }, { type: 'circle', c: [o.x, o.y + hy], r }];
    if (hy > 1e-4) out.push({ type: 'poly', pts: [[o.x - r, o.y - hy], [o.x + r, o.y - hy], [o.x + r, o.y + hy], [o.x - r, o.y + hy]] });
    return out;
  }
}

export class PolygonCollider2D extends Collider2D {
  static typeName = 'PolygonCollider2D';

  static fromData(c, d) {
    Collider2D.fromData(c, d);
    const paths = d.m_Points?.m_Paths || [];
    c.paths = paths;
  }

  shapes() {
    const key = JSON.stringify(this.paths);
    let polys = decompCache.get(key);
    if (!polys) {
      polys = [];
      for (const path of this.paths) {
        if (!path || path.length < 3) continue;
        for (const p of convexDecompose(path, 8)) polys.push(p);
      }
      decompCache.set(key, polys);
    }
    const o = this.offset;
    if (o.x === 0 && o.y === 0) return polys.map((pts) => ({ type: 'poly', pts }));
    return polys.map((pts) => ({ type: 'poly', pts: pts.map((p) => [p[0] + o.x, p[1] + o.y]) }));
  }
}

export class EdgeCollider2D extends Collider2D {
  static typeName = 'EdgeCollider2D';

  static fromData(c, d) {
    Collider2D.fromData(c, d);
    c._points = (d.m_Points || []).map((p) => new THREE.Vector2(p[0], p[1]));
    c.edgeRadius = d.m_EdgeRadius || 0;
  }

  get points() {
    return this._points.map((p) => p.clone());
  }

  set points(pts) {
    this._points = pts.map((p) => new THREE.Vector2(p.x, p.y));
    this.markDirty();
  }

  get pointCount() {
    return this._points.length;
  }

  shapes() {
    const o = this.offset;
    return [{ type: 'chain', pts: this._points.map((p) => [p.x + o.x, p.y + o.y]) }];
  }
}

// ---------------------------------------------------------------- Joints

export class WheelJoint2D extends Behaviour {
  static typeName = 'WheelJoint2D';

  static fromData(j, d) {
    j._enabled = d.m_Enabled !== 0;
    j.enableCollision = !!d.m_EnableCollision;
    j._connected = d.m_ConnectedRigidBody;
    j.anchor = new THREE.Vector2(...(d.m_Anchor || [0, 0]));
    j.connectedAnchor = new THREE.Vector2(...(d.m_ConnectedAnchor || [0, 0]));
    const s = d.m_Suspension || {};
    j.suspension = { dampingRatio: s.m_DampingRatio ?? 0.7, frequency: s.m_Frequency ?? 2, angle: s.m_Angle ?? 90 };
    const m = d.m_Motor || {};
    j.useMotor = !!d.m_UseMotor;
    j.motor = { motorSpeed: m.m_MotorSpeed || 0, maxMotorTorque: m.m_MaximumMotorForce || 10000 };
    j.joint = null;
  }

  get connectedBody() {
    return this._connected;
  }

  _activate() {
    if (!this._enabled || this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = true;
    this._create();
  }

  _deactivate() {
    if (!this._isActiveAndEnabled) return;
    this._isActiveAndEnabled = false;
    if (this.joint) {
      Physics2D.world.destroyJoint(this.joint);
      this.joint = null;
    }
  }

  _destroy() {
    this._deactivate();
  }

  _create() {
    const rbA = this.GetComponent(Rigidbody2D);
    const rbB = this._connected;
    if (!rbA || !rbB) return;
    const bA = rbA.ensureBody();
    const bB = rbB.ensureBody();
    const scale = this.transform.lossyScale;
    const angleA = bA.getAngle();
    const axisAngle = this.suspension.angle * Deg2Rad - angleA;
    this.joint = Physics2D.world.createJoint(
      new planck.WheelJoint({
        bodyA: bA,
        bodyB: bB,
        localAnchorA: planck.Vec2(this.anchor.x * scale.x, this.anchor.y * scale.y),
        localAnchorB: planck.Vec2(this.connectedAnchor.x, this.connectedAnchor.y),
        localAxisA: planck.Vec2(Math.cos(axisAngle), Math.sin(axisAngle)),
        enableMotor: this.useMotor,
        motorSpeed: this.motor.motorSpeed * Deg2Rad,
        maxMotorTorque: this.motor.maxMotorTorque,
        frequencyHz: this.suspension.frequency,
        dampingRatio: this.suspension.dampingRatio,
        collideConnected: this.enableCollision,
      }),
    );
  }
}

// ---------------------------------------------------------------- per-frame helpers used by the main loop

export function physicsRestorePoses() {
  for (const rb of Physics2D.sortedBodies()) rb._restorePose();
}

export function physicsInterpolate(alpha) {
  for (const rb of Physics2D.sortedBodies()) rb._interpolate(alpha);
}

export { World };
