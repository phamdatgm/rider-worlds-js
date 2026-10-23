// Loading of the exported Unity content (see tools/export.py for the formats).
import * as THREE from 'three';

const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/';

export const Assets = {
  manifest: null,
  so: {},
  materials: {},
  meshIndex: {},
  meshData: new Map(), // mesh id -> { buf: ArrayBuffer, base: byte offset of buf[0] in meshes.bin }
  meshWanted: new Set(),
  textureInfo: {},
  prefabs: new Map(),
  prefabPromises: new Map(),
  geometries: new Map(),
  textures: new Map(),
  audioBuffers: new Map(),
};

export function assetUrl(rel) {
  return BASE + rel.split('/').map(encodeURIComponent).join('/');
}

async function fetchJson(rel) {
  const r = await fetch(assetUrl(rel));
  if (!r.ok) throw new Error(`${rel}: ${r.status}`);
  return r.json();
}

/** Load the JSON indexes; mesh data is fetched per mode with loadWantedMeshes(). */
export async function loadCore(onProgress = () => {}) {
  const [manifest, so, materials, meshIndex, textureInfo] = await Promise.all([
    fetchJson('manifest.json'),
    fetchJson('so_bundle.json'),
    fetchJson('materials.json'),
    fetchJson('meshes.json'),
    fetchJson('textures.json'),
  ]);
  Object.assign(Assets, { manifest, so, materials, meshIndex, textureInfo });
  onProgress(1);
}

/**
 * Download the byte ranges of every wanted mesh that is not loaded yet (HTTP Range requests, adjacent
 * ranges merged). Falls back to the whole file when the server ignores Range.
 */
export async function loadWantedMeshes(onProgress) {
  const ids = [...Assets.meshWanted].filter((id) => !Assets.meshData.has(id) && Assets.meshIndex[id]?.range);
  Assets.meshWanted.clear();
  if (!ids.length) return;
  ids.sort((a, b) => Assets.meshIndex[a].range[0] - Assets.meshIndex[b].range[0]);
  const groups = [];
  for (const id of ids) {
    const [a, b] = Assets.meshIndex[id].range;
    const g = groups[groups.length - 1];
    if (g && a - g.end < 256 * 1024 && b - g.start < 8 * 1024 * 1024) {
      g.end = Math.max(g.end, b);
      g.ids.push(id);
    } else groups.push({ start: a, end: b, ids: [id] });
  }
  const total = groups.reduce((t, g) => t + (g.end - g.start), 0);
  let got = 0;
  let whole = null;
  const fetchRange = async (g) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // no-store: Chrome's HTTP cache rejects some concurrent range requests on the same URL
        const r = await fetch(assetUrl('meshes.bin'), { headers: { Range: `bytes=${g.start}-${g.end - 1}` }, cache: 'no-store' });
        if (r.status === 200) return { whole: await r.arrayBuffer() };
        if (r.status === 206) return { buf: await r.arrayBuffer() };
      } catch (e) {
        if (attempt === 2) throw e;
      }
    }
    throw new Error('mesh range request failed');
  };
  const queue = groups.slice();
  const worker = async () => {
    while (queue.length && !whole) {
      const g = queue.shift();
      const res = await fetchRange(g);
      if (res.whole) {
        whole = res.whole;
        return;
      }
      for (const id of g.ids) Assets.meshData.set(id, { buf: res.buf, base: g.start });
      got += g.end - g.start;
      onProgress?.(got / total);
    }
  };
  try {
    await Promise.all([worker(), worker(), worker(), worker()]);
  } catch (e) {
    console.warn('range requests failed, downloading all meshes', e);
    whole = await (await fetch(assetUrl('meshes.bin'))).arrayBuffer();
  }
  if (whole) for (const id of Object.keys(Assets.meshIndex)) Assets.meshData.set(id, { buf: whole, base: 0 });
}

export function getPrefabJson(id) {
  return Assets.prefabs.get(id) || null;
}

export function loadPrefab(id) {
  if (Assets.prefabs.has(id)) return Promise.resolve(Assets.prefabs.get(id));
  if (Assets.prefabPromises.has(id)) return Assets.prefabPromises.get(id);
  const p = fetchJson(`prefabs/${id}.json`).then((json) => {
    Assets.prefabs.set(id, json);
    collectMeshRefs(json.nodes);
    return json;
  });
  Assets.prefabPromises.set(id, p);
  return p;
}

/** Load a prefab plus every prefab it references (recursively). */
export async function loadPrefabDeep(id, seen = new Set()) {
  if (seen.has(id)) return;
  seen.add(id);
  const json = await loadPrefab(id);
  const refs = new Set();
  collectPrefabRefs(json.nodes, refs);
  await Promise.all([...refs].map((r) => loadPrefabDeep(r, seen)));
}

function collectMeshRefs(v) {
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    for (const x of v) collectMeshRefs(x);
    return;
  }
  if (typeof v.$mesh === 'string') Assets.meshWanted.add(v.$mesh);
  for (const k in v) collectMeshRefs(v[k]);
}

function collectPrefabRefs(v, out) {
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    for (const x of v) collectPrefabRefs(x, out);
    return;
  }
  if (typeof v.$prefab === 'string') out.add(v.$prefab);
  for (const k in v) if (k !== '$prefab') collectPrefabRefs(v[k], out);
}

export function getSO(id) {
  return Assets.so[id] || null;
}

// ---------------------------------------------------------------- meshes

const builtinGeometries = {
  Cube: () => new THREE.BoxGeometry(1, 1, 1),
  Quad: () => new THREE.PlaneGeometry(1, 1),
  Plane: () => new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2),
  Sphere: () => new THREE.SphereGeometry(0.5, 24, 16),
  Cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 2, 24),
  Capsule: () => new THREE.CapsuleGeometry(0.5, 1, 8, 16),
};

export function getGeometry(ref) {
  if (!ref) return null;
  const key = ref.$mesh || (ref.$builtinMesh ? `builtin:${ref.$builtinMesh}` : null);
  if (!key) return null;
  if (Assets.geometries.has(key)) return Assets.geometries.get(key);
  let geo = null;
  if (ref.$builtinMesh) {
    const f = builtinGeometries[ref.$builtinMesh];
    geo = f ? f() : null;
    if (geo) geo.addGroup(0, geo.index ? geo.index.count : geo.attributes.position.count, 0);
  } else {
    const e = Assets.meshIndex[key];
    const data = Assets.meshData.get(key);
    if (e && data) geo = buildGeometry(e, data);
    else if (e) return null; // not downloaded (yet): don't cache the miss
  }
  Assets.geometries.set(key, geo);
  return geo;
}

function buildGeometry(e, { buf, base }) {
  const geo = new THREE.BufferGeometry();
  const vc = e.vc;
  for (const [name, spec] of Object.entries(e.attr)) {
    const [o, dim, kind] = spec;
    const off = o - base;
    let attr;
    if (kind === 'u8n') attr = new THREE.BufferAttribute(new Uint8Array(buf, off, vc * dim), dim, true);
    else if (kind === 'i8n') attr = new THREE.BufferAttribute(new Int8Array(buf, off, vc * dim), dim, true);
    else if (kind === 'f16') attr = new THREE.Float16BufferAttribute(new Uint16Array(buf, off, vc * dim), dim);
    else attr = new THREE.BufferAttribute(new Float32Array(buf, off, vc * dim), dim);
    const threeName = name === 'uv0' ? 'uv' : name;
    geo.setAttribute(threeName, attr);
  }
  const [io, icount, bits] = e.idx;
  const ioff = io - base;
  geo.setIndex(new THREE.BufferAttribute(bits === 16 ? new Uint16Array(buf, ioff, icount) : new Uint32Array(buf, ioff, icount), 1));
  e.sub.forEach((s, i) => geo.addGroup(s.start, s.count, i));
  const [cx, cy, cz, ex, ey, ez] = e.aabb;
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(cx - ex, cy - ey, cz - ez), new THREE.Vector3(cx + ex, cy + ey, cz + ez));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.hypot(ex, ey, ez));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- textures

const loader = new THREE.TextureLoader();
let whiteTex = null;

export function getWhiteTexture() {
  if (!whiteTex) {
    whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteTex.needsUpdate = true;
  }
  return whiteTex;
}

export function getTexture(id) {
  if (!id) return null;
  if (Assets.textures.has(id)) return Assets.textures.get(id);
  const info = Assets.textureInfo[id];
  if (!info) return null;
  const tex = loader.load(assetUrl(`textures/${info.file}`));
  tex.colorSpace = THREE.NoColorSpace; // gamma pipeline: raw values
  const wrap = (w) => (w === 1 ? THREE.ClampToEdgeWrapping : w === 2 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping);
  tex.wrapS = wrap(info.wrapU ?? 0);
  tex.wrapT = wrap(info.wrapV ?? 0);
  if (info.filter === 0) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
  } else {
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = info.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.generateMipmaps = !!info.mips;
  }
  tex.anisotropy = 4;
  tex.userData.info = info;
  Assets.textures.set(id, tex);
  return tex;
}

// ---------------------------------------------------------------- audio

/* global __GM_BUILD__ */
const BUILD = typeof __GM_BUILD__ !== 'undefined' && __GM_BUILD__;

/**
 * The dev server serves the .ogg the exporter wrote. The build re-encodes the music to .mp3 (config.audio in
 * JS_SDK_2.0/config.mjs, which reads the same manifest.music lists) and ships the effects' .ogg as they are.
 */
function audioFile(id) {
  const name = id.split('/').pop();
  const isMusic = BUILD && Object.values(Assets.manifest?.music ?? {}).some((v) => Array.isArray(v) && v.includes(id));
  return `${name}.${isMusic ? 'mp3' : 'ogg'}`;
}

export async function loadAudioBuffer(ctx, id) {
  if (Assets.audioBuffers.has(id)) return Assets.audioBuffers.get(id);
  const p = fetch(assetUrl(`audio/${audioFile(id)}`))
    .then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b))
    .catch((e) => {
      console.warn('audio', id, e);
      return null;
    });
  Assets.audioBuffers.set(id, p);
  return p;
}
