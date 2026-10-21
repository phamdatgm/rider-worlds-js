"""Export the gameplay content of the Unity project into web-friendly files.

Output (under public/assets):
  prefabs/<rel path>.json   node tree + serialized components, refs resolved
  so/<rel path>.json        ScriptableObjects (settings, collections, levels)
  materials.json            every referenced material (shader name + properties)
  meshes.bin / meshes.json  every referenced mesh, converted to three.js space
  textures/<name>.png       referenced textures (+ textures.json with import settings / sprites)
  audio/<name>.ogg          audio clips referenced by exported data
  manifest.json             worlds, chunk collections, timed levels

Coordinate convention: Unity is left-handed. Transforms and meshes are mirrored on Z
(pos.z -> -z, quat -> (-x, -y, z, w), triangle winding flipped) so the data drops straight into
three.js. X/Y (and therefore all 2D physics data) are unchanged.
"""
import json
import math
import os
import re
import shutil
import struct
import sys
from collections import defaultdict, Counter

import numpy as np

from unity_yaml import ASSETS, Prefab, load_file, guid_index, script_name, CLASS_NAMES
from unity_mesh import decode_mesh

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "assets"))

HEADER_KEYS = {
    "m_ObjectHideFlags", "m_CorrespondingSourceObject", "m_PrefabInstance", "m_PrefabAsset",
    "m_GameObject", "m_EditorHideFlags", "m_Script", "m_Name", "m_EditorClassIdentifier",
    "serializedVersion",
}

# Components whose data is never needed by the web runtime (only presence is recorded).
DATA_SKIP = {
    "AudioSource", "CanvasRenderer", "GraphicRaycaster", "Animation", "BoxCollider", "SphereCollider",
    "MeshCollider", "Rigidbody",
}

# Prefab references held by these component types are recorded but not exported.
FOLLOW_SKIP = {"UI_SpaceManager", "TutorialTarget"}

PARTICLE_KEEP = {
    "lengthInSec", "simulationSpeed", "stopAction", "cullingMode", "ringBufferMode", "looping",
    "prewarm", "playOnAwake", "useUnscaledTime", "autoRandomSeed", "startDelay", "moveWithTransform",
    "moveWithCustomTransform", "scalingMode", "randomSeed", "InitialModule", "ShapeModule",
    "EmissionModule", "SizeModule", "RotationModule", "ColorModule", "VelocityModule",
    "ClampVelocityModule", "ForceModule", "SizeBySpeedModule", "ColorBySpeedModule", "NoiseModule",
    "UVModule", "TrailModule", "InheritVelocityModule",
}
PARTICLE_RENDERER_KEEP = {"m_Enabled", "m_Materials", "m_RenderMode", "m_SortMode", "m_MinParticleSize",
                          "m_MaxParticleSize", "m_LengthScale", "m_VelocityScale", "m_CameraVelocityScale",
                          "m_RenderAlignment", "m_Pivot", "m_Flip", "m_Mesh", "m_SortingOrder",
                          "m_UseCustomVertexStreams"}

BUILTIN_EXTRA = "0000000000000000e000000000000000"
BUILTIN_RES = "0000000000000000f000000000000000"
BUILTIN_MESHES = {10202: "Cube", 10206: "Cylinder", 10207: "Sphere", 10208: "Capsule", 10209: "Plane", 10210: "Quad"}


def rel_id(path):
    rel = os.path.relpath(path, ASSETS).replace("\\", "/")
    return os.path.splitext(rel)[0]


def round_f(v):
    if isinstance(v, float):
        if math.isnan(v):
            return 0
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        r = round(v, 5)
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    return v


# ---------------------------------------------------------------- value compaction

def is_ref(v):
    return isinstance(v, dict) and "fileID" in v and set(v.keys()) <= {"fileID", "guid", "type"}


def compact_curve(c):
    keys = []
    raw = c.get("m_Curve") or []
    if not isinstance(raw, list):
        raw = []
    for k in raw:
        if not isinstance(k, dict):
            continue
        row = [round_f(float(k.get("time", 0))), round_f(float(k.get("value", 0))),
               round_f(_num(k.get("inSlope", 0))), round_f(_num(k.get("outSlope", 0)))]
        wm = int(k.get("weightedMode", 0) or 0)
        if wm:
            row += [round_f(float(k.get("inWeight", 1 / 3))), round_f(float(k.get("outWeight", 1 / 3))), wm]
        keys.append(row)
    return {"$curve": keys, "pre": int(c.get("m_PreInfinity", 2)), "post": int(c.get("m_PostInfinity", 2))}


def _num(v):
    if isinstance(v, str):
        if v.lower() in ("infinity", "inf"):
            return float("inf")
        if v.lower() in ("-infinity", "-inf"):
            return float("-inf")
        try:
            return float(v)
        except ValueError:
            return 0.0
    return float(v or 0)


def compact_gradient(g):
    nc = int(g.get("m_NumColorKeys", 2))
    na = int(g.get("m_NumAlphaKeys", 2))
    colors = []
    alphas = []
    for i in range(nc):
        k = g.get(f"key{i}", {})
        colors.append([round(int(g.get(f"ctime{i}", 0)) / 65535, 4), round_f(k.get("r", 0)), round_f(k.get("g", 0)), round_f(k.get("b", 0))])
    for i in range(na):
        k = g.get(f"key{i}", {})
        alphas.append([round(int(g.get(f"atime{i}", 0)) / 65535, 4), round_f(k.get("a", 1))])
    return {"$grad": colors, "a": alphas, "mode": int(g.get("m_Mode", 0))}


def compact_value(v, ctx):
    """Generic structural compaction; refs are delegated to ctx.ref()."""
    if is_ref(v):
        return ctx.ref(v)
    if isinstance(v, dict):
        keys = set(v.keys())
        if "m_Curve" in keys:
            return compact_curve(v)
        if "key0" in keys and "ctime0" in keys:
            return compact_gradient(v)
        if keys == {"r", "g", "b", "a"}:
            return [round_f(_num(v[c])) for c in "rgba"]
        if keys in ({"x", "y"}, {"x", "y", "z"}, {"x", "y", "z", "w"}):
            return [round_f(_num(v[c])) for c in "xyzw" if c in v]
        if keys == {"m_PersistentCalls"}:
            calls = (v["m_PersistentCalls"] or {}).get("m_Calls") or []
            return {"$event": [compact_value(c, ctx) for c in calls]} if calls else None
        if "serializedVersion" in keys and "m_Bits" in keys:
            return int(v["m_Bits"])
        out = {}
        for k, x in v.items():
            if k == "serializedVersion":
                continue
            cv = compact_value(x, ctx)
            if cv is not None:
                out[k] = cv
        return out
    if isinstance(v, list):
        return [compact_value(x, ctx) for x in v]
    if isinstance(v, float):
        return round_f(v)
    return v


# ---------------------------------------------------------------- exporter

class Exporter:
    def __init__(self):
        self.gi = guid_index()
        self.prefab_cache = {}
        self.prefab_queue = []
        self.prefab_done = {}
        self.so_done = {}
        self.so_queue = []
        self.materials = {}
        self.meshes = {}
        self.textures = {}
        self.audio = set()
        self.unknown_types = Counter()
        self.follow_log = Counter()
        self.ui_sprites = set()  # sprite textures packed into the UI atlas
        self.raw_textures = set()  # textures shown by RawImage
        self._cur_type = None

    # ---- path helpers
    def path(self, guid):
        return self.gi.get(guid)

    def prefab_index(self, path, roots=None):
        """Deterministic node ordering + fileID -> (kind, node, comp) map for a prefab/scene.

        roots: only these root GameObjects (by name) of a scene."""
        key = path if roots is None else (path, tuple(roots))
        if key in self.prefab_cache:
            return self.prefab_cache[key]
        p = self.prefab_cache[path]["prefab"] if path in self.prefab_cache else Prefab(path)
        order = []

        def walk(g):
            order.append(g)
            for ch in p.children(g):
                walk(ch)

        if roots is None:
            for r in p.roots():
                walk(r)
        else:
            # named GameObjects anywhere in the hierarchy become the roots of the export
            def find(g):
                if p.name(g) in roots:
                    walk(g)
                    return
                for ch in p.children(g):
                    find(ch)
            for r in p.roots():
                find(r)
        node_of = {g: i for i, g in enumerate(order)}
        fid_map = {}
        comps_of = {}
        for g in order:
            fid_map[g] = ("go", node_of[g], None)
            lst = []
            for cid, c in p.components(g):
                if c["type"] in ("Transform", "RectTransform"):
                    fid_map[cid] = ("tr", node_of[g], None)
                    continue
                fid_map[cid] = ("c", node_of[g], len(lst))
                lst.append((cid, c))
            comps_of[g] = lst
        entry = {"prefab": p, "order": order, "node_of": node_of, "fid_map": fid_map, "comps_of": comps_of}
        self.prefab_cache[key] = entry
        return entry

    # ---- reference resolution
    def ext_ref(self, v, follow=True):
        guid = v.get("guid")
        fid = int(v.get("fileID", 0))
        if guid == BUILTIN_EXTRA:
            if fid in BUILTIN_MESHES:
                return {"$builtinMesh": BUILTIN_MESHES[fid]}
            return {"$builtin": fid}
        if guid == BUILTIN_RES:
            return {"$builtin": fid}
        path = self.path(guid)
        if not path:
            return None
        ext = os.path.splitext(path)[1].lower()
        rid = rel_id(path)
        if ext == ".prefab":
            entry = self.prefab_index(path)
            if follow:
                self.enqueue_prefab(path)
            kind = entry["fid_map"].get(fid)
            out = {"$prefab": rid}
            if kind:
                if kind[0] == "c":
                    out["c"] = [kind[1], kind[2]]
                else:
                    out["n"] = kind[1]
            return out
        if ext == ".mat":
            self.export_material(path)
            return {"$mat": rid}
        if ext in (".png", ".jpg", ".tga", ".psd", ".exr"):
            if fid == 2800000:
                if self._cur_type == "RawImage":
                    self.raw_textures.add(path)
                else:
                    self.export_texture(path)
                return {"$tex": rid}
            # sprites: UI graphics / scripts read them from the UI atlas, SpriteRenderers from textures
            self.ui_sprites.add(path)
            if self._cur_type == "SpriteRenderer":
                self.export_texture(path)
            return {"$sprite": rid, "fid": fid}
        if ext == ".physicsmaterial2d":
            docs = load_file(path)
            pm = next((d["data"] for d in docs.values()), {})
            return {"$pmat": rid, "friction": round_f(_num(pm.get("friction", 0.4))),
                    "bounciness": round_f(_num(pm.get("bounciness", 0)))}
        if ext in (".ogg", ".wav", ".mp3"):
            self.export_audio(path)
            return {"$audio": rid}
        if ext == ".asset":
            # could be a Mesh or a ScriptableObject
            if path.replace("\\", "/").find("/Mesh/") >= 0 or fid == 4300000:
                self.meshes.setdefault(rid, path)
                return {"$mesh": rid}
            self.enqueue_so(path)
            return {"$so": rid}
        if ext in (".shader", ".shadergraph"):
            return {"$shader": rid}
        if ext in (".anim", ".controller", ".overrideController"):
            return {"$anim": rid}
        if ext in (".cs",):
            return {"$script": rid}
        return {"$asset": rid}

    def enqueue_prefab(self, path):
        if path not in self.prefab_done and path not in self.prefab_queue:
            self.prefab_queue.append(path)

    def enqueue_so(self, path):
        if path not in self.so_done and path not in self.so_queue:
            self.so_queue.append(path)

    # ---- materials / textures / audio
    def export_material(self, path):
        rid = rel_id(path)
        if rid in self.materials:
            return
        saved_type, self._cur_type = self._cur_type, None
        try:
            self._export_material(path, rid)
        finally:
            self._cur_type = saved_type

    def _export_material(self, path, rid):
        docs = load_file(path)
        m = next(d["data"] for d in docs.values() if d["type"] == "Material")
        shader_ref = m.get("m_Shader", {})
        sp = self.path(shader_ref.get("guid", ""))
        shader = os.path.splitext(os.path.basename(sp))[0] if sp else f"builtin:{shader_ref.get('fileID')}:{shader_ref.get('guid', '')}"
        props = m.get("m_SavedProperties", {})
        tex = {}
        texenvs = props.get("m_TexEnvs") or {}
        if isinstance(texenvs, list):  # older serialization: list of single-key dicts
            merged = {}
            for it in texenvs:
                merged.update(it)
            texenvs = merged
        for k, t in texenvs.items():
            r = t.get("m_Texture", {})
            if r.get("fileID", 0) == 0:
                continue
            ref = self.ext_ref(r)
            if ref:
                tex[k] = {"tex": ref.get("$tex") or ref.get("$sprite"), "scale": compact_value(t.get("m_Scale"), self),
                          "offset": compact_value(t.get("m_Offset"), self)}
        floats = props.get("m_Floats") or {}
        if isinstance(floats, list):
            merged = {}
            for it in floats:
                merged.update(it)
            floats = merged
        colors = props.get("m_Colors") or {}
        if isinstance(colors, list):
            merged = {}
            for it in colors:
                merged.update(it)
            colors = merged
        self.materials[rid] = {
            "name": m.get("m_Name"),
            "shader": shader,
            "queue": int(m.get("m_CustomRenderQueue", -1)),
            "keywords": (m.get("m_ValidKeywords") or []) + ([] if not isinstance(m.get("m_ShaderKeywords"), str) else m.get("m_ShaderKeywords").split()),
            "tags": m.get("stringTagMap") or {},
            "floats": {k: round_f(_num(v)) for k, v in floats.items()},
            "colors": {k: compact_value(v, self) for k, v in colors.items()},
            "textures": tex,
        }

    def export_texture(self, path):
        rid = rel_id(path)
        if rid in self.textures:
            return
        info = {"file": os.path.basename(path)}
        meta = path + ".meta"
        try:
            import yaml
            with open(meta, "r", encoding="utf-8", errors="replace") as f:
                md = yaml.safe_load(f) or {}
            ti = md.get("TextureImporter", {}) or {}
            ts = ti.get("textureSettings", {}) or {}
            info.update({
                "srgb": int((ti.get("mipmaps") or {}).get("sRGBTexture", 1)),
                "mips": int((ti.get("mipmaps") or {}).get("enableMipMap", 0)),
                "filter": int(ts.get("filterMode", 1)),
                "wrapU": int(ts.get("wrapU", 0)), "wrapV": int(ts.get("wrapV", 0)),
                "type": int(ti.get("textureType", 0)),
                "spriteMode": int(ti.get("spriteMode", 0)),
                "ppu": float(ti.get("spritePixelsToUnits", 100)),
                "pivot": [float((ti.get("spritePivot") or {}).get("x", 0.5)), float((ti.get("spritePivot") or {}).get("y", 0.5))],
            })
            sheet = (ti.get("spriteSheet") or {}).get("sprites") or []
            if sheet:
                id_table = {}
                for e in ti.get("internalIDToNameTable") or []:
                    try:
                        id_table[(e.get("first") or {}).get(213)] = e.get("second")
                    except AttributeError:
                        pass
                sprites = []
                for s in sheet:
                    r = s.get("rect", {})
                    sprites.append({"name": s.get("name"), "id": s.get("internalID"),
                                    "rect": [r.get("x", 0), r.get("y", 0), r.get("width", 0), r.get("height", 0)],
                                    "pivot": [(s.get("pivot") or {}).get("x", 0.5), (s.get("pivot") or {}).get("y", 0.5)]})
                info["sprites"] = sprites
        except Exception as e:  # noqa: BLE001
            info["metaError"] = str(e)
        try:
            from PIL import Image
            with Image.open(path) as im:
                info["size"] = list(im.size)
        except Exception:  # noqa: BLE001
            pass
        self.textures[rid] = (path, info)

    def export_audio(self, path):
        self.audio.add(path)

    # ---- component serialization (ctx for compact_value)
    def ref(self, v):
        fid = int(v.get("fileID", 0))
        if fid == 0:
            return None
        if "guid" in v and v.get("guid"):
            if self._cur_path and self.gi.get(v["guid"]) == self._cur_path:
                return self.local_ref(fid)
            return self.ext_ref(v, follow=self._follow)
        return self.local_ref(fid)

    def local_ref(self, fid):
        kind = self._cur_entry["fid_map"].get(fid) if self._cur_entry else None
        if not kind:
            return None
        if kind[0] == "c":
            return {"$c": [kind[1], kind[2]]}
        if kind[0] == "tr":
            return {"$t": kind[1]}
        return {"$n": kind[1]}

    def serialize_component(self, c):
        t = c["type"]
        d = c["data"]
        self._cur_type = script_name(d) if t == "MonoBehaviour" else t
        if t == "MonoBehaviour":
            name = script_name(d) or guess_unknown_script(d)
            self.unknown_types[name] += 0
            out = {"$type": name}
            self._follow = name not in FOLLOW_SKIP
            for k, v in d.items():
                if k in HEADER_KEYS:
                    continue
                cv = compact_value(v, self)
                if cv is not None:
                    out[k] = cv
            self._follow = True
            return out
        out = {"$type": t}
        if t in DATA_SKIP:
            if "m_Enabled" in d:
                out["m_Enabled"] = d["m_Enabled"]
            return out
        if t == "ParticleSystem":
            for k in PARTICLE_KEEP:
                if k in d:
                    out[k] = compact_value(d[k], self)
            return out
        if t == "ParticleSystemRenderer":
            for k in PARTICLE_RENDERER_KEEP:
                if k in d:
                    out[k] = compact_value(d[k], self)
            return out
        for k, v in d.items():
            if k in HEADER_KEYS or k in ("m_SpriteTilingProperty", "m_StaticBatchInfo", "m_LightProbeUsage",
                                          "m_ReflectionProbeUsage", "m_RayTracingMode", "m_RayTraceProcedural",
                                          "m_RenderingLayerMask", "m_RendererPriority", "m_LightmapIndex",
                                          "m_LightmapIndexDynamic", "m_LightmapTilingOffset", "m_LightmapTilingOffsetDynamic",
                                          "m_StaticShadowCaster", "m_ProbeAnchor", "m_LightProbeVolumeOverride",
                                          "m_ScaleInLightmap", "m_ReceiveGI", "m_PreserveUVs", "m_IgnoreNormalsForChartDetection",
                                          "m_ImportantGI", "m_StitchLightmapSeams", "m_SelectedEditorRenderState",
                                          "m_MinimumChartSize", "m_AutoUVMaxDistance", "m_AutoUVMaxAngle",
                                          "m_LightmapParameters", "m_StaticBatchRoot", "m_AdditionalVertexStreams",
                                          "m_EnlightenVertexStream", "m_DynamicOccludee", "m_MotionVectors", "m_ShaderKeywords"):
                continue
            cv = compact_value(v, self)
            if cv is not None:
                out[k] = cv
        return out

    # ---- prefab export
    def export_prefab(self, path, roots=None, out_id=None):
        entry = self.prefab_index(path, roots)
        p = entry["prefab"]
        self._cur_entry = entry
        self._cur_path = path
        self._follow = True
        nodes = []
        for g in entry["order"]:
            go = p.docs[g]["data"]
            _, t = p.transform_of(g)
            td = t["data"] if t else {}
            father = td.get("m_Father", {}).get("fileID", 0)
            parent = entry["fid_map"].get(father, (None, -1))[1] if father else -1
            node = {"n": go.get("m_Name", "")}
            if parent >= 0:
                node["p"] = parent
            if not int(go.get("m_IsActive", 1)):
                node["a"] = 0
            if int(go.get("m_Layer", 0)):
                node["l"] = int(go["m_Layer"])
            tag = go.get("m_TagString", "Untagged")
            if tag and tag != "Untagged":
                node["tag"] = tag
            pos = td.get("m_LocalPosition", {})
            rot = td.get("m_LocalRotation", {})
            scl = td.get("m_LocalScale", {})
            tp = [round_f(float(pos.get("x", 0))), round_f(float(pos.get("y", 0))), round_f(-float(pos.get("z", 0)))]
            tr = [round_f(-float(rot.get("x", 0))), round_f(-float(rot.get("y", 0))), round_f(float(rot.get("z", 0))), round_f(float(rot.get("w", 1)))]
            ts = [round_f(float(scl.get("x", 1))), round_f(float(scl.get("y", 1))), round_f(float(scl.get("z", 1)))]
            if tp != [0, 0, 0]:
                node["t"] = tp
            if tr != [0, 0, 0, 1]:
                node["r"] = tr
            if ts != [1, 1, 1]:
                node["s"] = ts
            if t and t["type"] == "RectTransform":
                node["rect"] = {k: compact_value(td.get(k), self) for k in ("m_AnchorMin", "m_AnchorMax", "m_AnchoredPosition", "m_SizeDelta", "m_Pivot")}
            comps = []
            for cid, c in entry["comps_of"][g]:
                comps.append(self.serialize_component(c))
            if comps:
                node["c"] = comps
            nodes.append(node)
        rid = out_id or rel_id(path)
        if roots is None:
            self.prefab_done[path] = rid
        self._cur_entry = None
        self._cur_path = None
        write_json(os.path.join(OUT, "prefabs", rid + ".json"), {"id": rid, "nodes": nodes})

    # ---- ScriptableObject export
    def export_so(self, path):
        rid = rel_id(path)
        docs = load_file(path)
        self._cur_entry = None
        self._cur_path = path
        self._follow = False
        objs = []
        for fid, d in docs.items():
            if d["type"] != "MonoBehaviour":
                continue
            ser = self.serialize_component(d)
            ser["$name"] = d["data"].get("m_Name")
            ser["$fid"] = fid
            objs.append(ser)
        self._cur_path = None
        self._follow = True
        self.so_done[path] = rid
        main = next((o for o in objs if o["$fid"] == 11400000), objs[0] if objs else {})
        write_json(os.path.join(OUT, "so", rid + ".json"), main if len(objs) <= 1 else {**main, "$sub": objs})

    def run_queues(self):
        while self.prefab_queue or self.so_queue:
            while self.prefab_queue:
                path = self.prefab_queue.pop(0)
                if path in self.prefab_done:
                    continue
                print("prefab", rel_id(path), flush=True)
                self.export_prefab(path)
            while self.so_queue:
                path = self.so_queue.pop(0)
                if path in self.so_done:
                    continue
                self.export_so(path)

    # ---- meshes
    def write_meshes(self):
        index = {}
        chunks = []
        offset = 0

        def add(arr):
            nonlocal offset
            b = arr.tobytes()
            pad = (-len(b)) % 4
            chunks.append(b + b"\0" * pad)
            o = offset
            offset += len(b) + pad
            return o

        for rid, path in sorted(self.meshes.items()):
            try:
                m = decode_mesh(path)
            except Exception as e:  # noqa: BLE001
                print("mesh fail", rid, e)
                continue
            a = m["attributes"]
            if "position" not in a or m["vertexCount"] == 0:
                continue
            entry = {"name": m["name"], "vc": int(m["vertexCount"]), "attr": {}, "sub": m["submeshes"]}
            range_start = offset
            pos = a["position"][:, :3].astype(np.float32).copy()
            pos[:, 2] *= -1
            entry["attr"]["position"] = [add(pos), 3]
            if "normal" in a:
                n = a["normal"][:, :3].astype(np.float32).copy()
                n[:, 2] *= -1
                # quantized: int8 normalized
                entry["attr"]["normal"] = [add(np.ascontiguousarray(np.clip(np.round(n * 127), -127, 127).astype(np.int8))), 3, "i8n"]
            for uv in ("uv0", "uv1", "uv2", "uv3"):
                if uv in a:
                    u = a[uv].astype(np.float32)
                    if np.abs(u).max() < 60000:
                        entry["attr"][uv] = [add(np.ascontiguousarray(u.astype(np.float16))), int(u.shape[1]), "f16"]
                    else:
                        entry["attr"][uv] = [add(np.ascontiguousarray(u)), int(u.shape[1])]
            if "color" in a:
                c = np.clip(a["color"][:, :4], 0, 1)
                entry["attr"]["color"] = [add(np.ascontiguousarray((c * 255 + 0.5).astype(np.uint8))), 4, "u8n"]
            idx = m["indices"].astype(np.uint32).copy()
            tri_count = len(idx) - len(idx) % 3
            t = idx[:tri_count].reshape(-1, 3)
            t[:, [1, 2]] = t[:, [2, 1]]
            idx[:tri_count] = t.reshape(-1)
            if m["vertexCount"] <= 65535:
                entry["idx"] = [add(idx.astype(np.uint16)), int(len(idx)), 16]
            else:
                entry["idx"] = [add(idx), int(len(idx)), 32]
            entry["range"] = [range_start, offset]
            c = m["center"]
            entry["aabb"] = [round_f(c[0]), round_f(c[1]), round_f(-c[2])] + [round_f(x) for x in m["extent"]]
            index[rid] = entry
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, "meshes.bin"), "wb") as f:
            for ch in chunks:
                f.write(ch)
        write_json(os.path.join(OUT, "meshes.json"), index)
        print("meshes", len(index), "bytes", offset)

    def write_textures(self):
        info = {}
        d = os.path.join(OUT, "textures")
        os.makedirs(d, exist_ok=True)
        for rid, (path, meta) in self.textures.items():
            name = os.path.basename(path)
            dst = os.path.join(d, name)
            if os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(path):
                pass
            else:
                shutil.copyfile(path, dst)
            info[rid] = meta
        write_json(os.path.join(OUT, "textures.json"), info)

    def write_ui_atlas(self):
        """Pack every sprite referenced by UI data (+ RawImage textures) into WebP pages.

        ui/atlas.json: {"pages": [[file, w, h]], "sprites": {key: {"p": page, "r": [x, y, w, h] (top-left origin, page px),
        "sz": [w, h] (sprite px), "b": [left, bottom, right, top] border (sprite px), "pv": [x, y], "ppu": n}}}
        key = texture rel id for single sprites (and $tex refs), "<rel id>#<internal id>" for sprite sheets."""
        import yaml
        from PIL import Image
        items = {}
        for path in sorted(self.ui_sprites | self.raw_textures):
            rid = rel_id(path)
            try:
                with open(path + ".meta", "r", encoding="utf-8", errors="replace") as f:
                    md = yaml.safe_load(f) or {}
            except OSError:
                md = {}
            ti = md.get("TextureImporter", {}) or {}
            try:
                img = Image.open(path).convert("RGBA")
            except Exception as e:  # noqa: BLE001
                print("ui sprite fail", rid, e)
                continue
            W, H = img.size
            ppu = float(ti.get("spritePixelsToUnits", 100) or 100)
            sheet = (ti.get("spriteSheet") or {}).get("sprites") or []
            if int(ti.get("spriteMode", 1) or 1) == 2 and sheet:
                for sp in sheet:
                    r = sp.get("rect", {})
                    x, y, w, h = (int(round(float(r.get(k, 0)))) for k in ("x", "y", "width", "height"))
                    b = sp.get("border") or {}
                    pv = sp.get("pivot") or {}
                    crop = img.crop((x, H - y - h, x + w, H - y))
                    items[f"{rid}#{sp.get('internalID')}"] = (crop, {
                        "sz": [w, h], "b": [b.get("x", 0), b.get("y", 0), b.get("z", 0), b.get("w", 0)],
                        "pv": [pv.get("x", 0.5), pv.get("y", 0.5)], "ppu": ppu})
            else:
                b = ti.get("spriteBorder") or {}
                pv = ti.get("spritePivot") or {}
                items[rid] = (img, {"sz": [W, H], "b": [b.get("x", 0), b.get("y", 0), b.get("z", 0), b.get("w", 0)],
                                    "pv": [pv.get("x", 0.5), pv.get("y", 0.5)], "ppu": ppu})
        PAGE, PAD, LIMIT = 2048, 2, 1024
        scaled = {}
        for key, (img, info) in items.items():
            w, h = img.size
            k = min(1.0, LIMIT / max(w, h))
            if k < 1:
                img = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            scaled[key] = img
        order = sorted(scaled.items(), key=lambda kv: (-kv[1].size[1], -kv[1].size[0]))
        pages = []
        placed = {}
        for key, img in order:
            w, h = img.size[0] + PAD * 2, img.size[1] + PAD * 2
            spot = None
            for pi, pg in enumerate(pages):
                for sh in pg["shelves"]:
                    if h <= sh[1] and sh[2] + w <= PAGE:
                        spot = (pi, sh[2], sh[0])
                        sh[2] += w
                        break
                if spot:
                    break
                top = pg["shelves"][-1][0] + pg["shelves"][-1][1] if pg["shelves"] else 0
                if top + h <= PAGE:
                    pg["shelves"].append([top, h, w])
                    spot = (pi, 0, top)
                    break
            if not spot:
                pages.append({"shelves": [[0, h, w]], "items": []})
                spot = (len(pages) - 1, 0, 0)
            pi, x, y = spot
            pages[pi]["items"].append((key, x + PAD, y + PAD))
            placed[key] = (pi, x + PAD, y + PAD)
        d = os.path.join(OUT, "ui")
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d)
        meta = {"pages": [], "sprites": {}}
        total = 0
        for pi, pg in enumerate(pages):
            used_h = max(sh[0] + sh[1] for sh in pg["shelves"])
            used_w = max(sh[2] for sh in pg["shelves"])
            sheet = Image.new("RGBA", (used_w, used_h), (0, 0, 0, 0))
            for key, x, y in pg["items"]:
                img = scaled[key]
                w, h = img.size
                # extrude the edge pixels into the padding (bilinear filtering of sliced/tiled sprites)
                ext = img.resize((w + PAD * 2, h + PAD * 2), Image.NEAREST)
                ext.paste(img, (PAD, PAD))
                for i in range(PAD):
                    ext.paste(img.crop((0, 0, w, 1)), (PAD, i))
                    ext.paste(img.crop((0, h - 1, w, h)), (PAD, PAD + h + i))
                    ext.paste(img.crop((0, 0, 1, h)), (i, PAD))
                    ext.paste(img.crop((w - 1, 0, w, h)), (PAD + w + i, PAD))
                sheet.paste(ext, (x - PAD, y - PAD))
            fn = f"ui_{pi}.webp"
            sheet.save(os.path.join(d, fn), "WEBP", quality=90, method=6)
            total += os.path.getsize(os.path.join(d, fn))
            meta["pages"].append([fn, used_w, used_h])
        for key, (pi, x, y) in sorted(placed.items()):
            img = scaled[key]
            meta["sprites"][key] = {"p": pi, "r": [x, y, img.size[0], img.size[1]], **items[key][1]}
        write_json(os.path.join(d, "atlas.json"), meta)
        print("ui atlas", len(placed), "sprites,", len(pages), "pages,", f"{total / 1e6:.2f} MB")

    def write_audio(self):
        d = os.path.join(OUT, "audio")
        os.makedirs(d, exist_ok=True)
        for path in self.audio:
            shutil.copyfile(path, os.path.join(d, os.path.basename(path)))


def guess_unknown_script(d):
    keys = set(d.keys())
    if "m_Lens" in keys:
        return "CinemachineVirtualCamera"
    if "m_Targets" in keys:
        return "CinemachineTargetGroup"
    if "m_CameraDistance" in keys:
        return "CinemachineFramingTransposer"
    if "m_NoiseProfile" in keys:
        return "CinemachineBasicMultiChannelPerlin"
    if "m_ScreenX" in keys:
        return "CinemachineComposer"
    if keys - HEADER_KEYS <= {"m_Enabled"}:
        return "CinemachinePipeline"
    return "Unknown"


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)


# ---------------------------------------------------------------- roots

def asset(rel):
    return os.path.join(ASSETS, rel)


def so_data(path):
    docs = load_file(path)
    return next(d["data"] for d in docs.values() if d["type"] == "MonoBehaviour")


def layer_matrix():
    """Per-layer collision masks from Physics2DSettings (8 hex chars per layer, little-endian bytes).

    The ripped file writes some 0xff bytes as "/f"; only the first 3 bytes (layers 0-23) are read.
    """
    text = open(os.path.join(ASSETS, "..", "ProjectSettings", "Physics2DSettings.asset"), encoding="utf-8").read()
    raw = re.search(r"m_LayerCollisionMatrix: (\S+)", text).group(1)
    masks = []
    for i in range(32):
        chunk = raw[i * 8:i * 8 + 6]
        if len(chunk) < 6 or "/" in chunk:
            masks.append(0xFFFFFFFF)
            continue
        b = bytes.fromhex(chunk)
        masks.append(b[0] | (b[1] << 8) | (b[2] << 16) | 0xFF000000)
    return masks


def main():
    ex = Exporter()
    gi = ex.gi
    manifest = {"worlds": [], "levels": [], "player": None}

    # Worlds: endless chunk collections, background collections, flow director, visuals.
    for w in (1, 2, 3):
        ws_path = asset(f"MonoBehaviour/World {w} Settings.asset")
        ws = so_data(ws_path)
        ex.enqueue_so(ws_path)
        world = {"index": w - 1, "settings": rel_id(ws_path)}
        for key in ("roadChunks", "backgroundChunks", "flowDirectorConfig", "visualSettings"):
            ref = ws.get(key) or {}
            p = gi.get(ref.get("guid", ""))
            if not p:
                continue
            world[key] = rel_id(p)
            ex.enqueue_so(p)
            if key in ("roadChunks", "backgroundChunks"):
                coll = so_data(p)
                prefabs = []
                for c in coll.get("chunks") or []:
                    cp = gi.get(c.get("guid", ""))
                    if cp:
                        ex.enqueue_prefab(cp)
                        prefabs.append(rel_id(cp))
                world[key + "Prefabs"] = prefabs
        for ftue in ws.get("ftueChunks") or []:
            cp = gi.get(ftue.get("guid", ""))
            if cp:
                ex.enqueue_prefab(cp)
                world.setdefault("ftueChunks", []).append(rel_id(cp))
        manifest["worlds"].append(world)

    # Timed levels
    coll = so_data(asset("MonoBehaviour/Timed Level Mode Collection.asset"))
    for a in coll.get("assets") or []:
        lp = gi.get(a.get("guid", ""))
        if not lp:
            continue
        ld = so_data(lp)
        s = ld.get("settings", {})
        chunks = []
        for c in s.get("chunks") or []:
            cp = gi.get(c.get("guid", ""))
            if cp:
                ex.enqueue_prefab(cp)
                chunks.append(rel_id(cp))
        manifest["levels"].append({
            "id": rel_id(lp), "name": ld.get("m_Name"), "world": int(s.get("timedLevelSet", 1)) - 1,
            "difficulty": int(s.get("difficulty", 0)), "number": int(s.get("id", 1)),
            "twoStarTime": float(s.get("twoStarTime", 60)), "threeStarTime": float(s.get("threeStarTime", 30)),
            "chunks": chunks,
        })

    # Player, pickups, shared settings
    for rel in ("GameObject/Player.prefab", "GameObject/SoftCurrency Pickup.prefab", "GameObject/PositionalMarkerBase.prefab"):
        ex.enqueue_prefab(asset(rel))
    manifest["player"] = "GameObject/Player"
    manifest["softCurrencyPickup"] = "GameObject/SoftCurrency Pickup"
    manifest["positionalMarker"] = "GameObject/PositionalMarkerBase"
    # Audio: sample categories (AudioSampleID -> clips) and music playlists
    for rel in ("MonoBehaviour/BikeAudio.asset", "MonoBehaviour/PickupAudio.asset", "MonoBehaviour/UIAudioSampleCategory.asset"):
        ex.enqueue_so(asset(rel))
    manifest["audioCategories"] = ["MonoBehaviour/BikeAudio", "MonoBehaviour/PickupAudio", "MonoBehaviour/UIAudioSampleCategory"]
    core = Prefab(asset("GameObject/Core.prefab"))
    for d in core.docs.values():
        if d["type"] == "MonoBehaviour" and script_name(d["data"]) == "MusicManager":
            music = {}
            for key in ("menuMusic", "gameplayMusic"):
                clips = []
                for r in d["data"].get(key) or []:
                    ap = gi.get(r.get("guid", ""))
                    if ap:
                        ex.export_audio(ap)
                        clips.append(rel_id(ap))
                music[key] = clips
            music["maxVolume"] = d["data"].get("maxVolume", 0.8)
            music["fadeTime"] = d["data"].get("fadeTime", 1.5)
            manifest["music"] = music
    pm_default = load_file(asset("PhysicsMaterial2D/Default Global PhysicsMat.physicsMaterial2D"))
    pmd = next(iter(pm_default.values()))["data"]
    manifest["physics2d"] = {"gravity": [0, -13], "fixedTimestep": 0.011, "velocityIterations": 8, "positionIterations": 3,
                             "velocityThreshold": 20, "defaultFriction": _num(pmd.get("friction")),
                             "defaultBounciness": _num(pmd.get("bounciness")),
                             "layerCollisionMatrix": layer_matrix()}
    for rel in ("MonoBehaviour/RoadPieceSettings.asset", "MonoBehaviour/Endless Mode Settings.asset",
                "MonoBehaviour/TimedLevelSettings.asset", "MonoBehaviour/Booster Settings.asset",
                "MonoBehaviour/ComplimentSettings.asset", "MonoBehaviour/Endless Chunk Process.asset",
                "MonoBehaviour/TimedLevelModeController.asset"):
        if os.path.exists(asset(rel)):
            ex.enqueue_so(asset(rel))

    # Vehicles (card assets -> per-rank prefabs)
    vehicles = []
    for f in sorted(os.listdir(asset("MonoBehaviour"))):
        if f.startswith("VCL_") and f.endswith(".asset"):
            vp = asset("MonoBehaviour/" + f)
            vd = so_data(vp)
            items = []
            for it in vd.get("items") or vd.get("ranks") or []:
                ref = it if is_ref(it) else (it.get("item") if isinstance(it, dict) else None)
                if ref and gi.get(ref.get("guid", "")):
                    pp = gi[ref["guid"]]
                    if pp.endswith(".prefab"):
                        ex.enqueue_prefab(pp)
                        items.append(rel_id(pp))
            ex.enqueue_so(vp)
            vehicles.append({"card": rel_id(vp), "name": vd.get("m_Name"), "items": items})
    manifest["vehicles"] = vehicles

    # Cosmetic cards (colors / trails / perfect landing / death effects): export the SO + their items
    cards = {}
    for prefix, key in (("COL_", "colors"), ("VFX_Trail_", "trails"), ("VFX_Landing_", "landings"), ("VFX_Death_", "deaths")):
        lst = []
        for f in sorted(os.listdir(asset("MonoBehaviour"))):
            if not (f.startswith(prefix) and f.endswith(".asset")):
                continue
            cp = asset("MonoBehaviour/" + f)
            cd = so_data(cp)
            items = []
            for it in cd.get("items") or []:
                ip = gi.get((it or {}).get("guid", ""))
                if not ip:
                    continue
                if ip.endswith(".prefab"):
                    ex.enqueue_prefab(ip)
                    items.append({"$prefab": rel_id(ip)})
                elif ip.endswith(".mat"):
                    ex.export_material(ip)
                    items.append({"$mat": rel_id(ip)})
            ex.enqueue_so(cp)
            lst.append({"card": rel_id(cp), "name": cd.get("m_Name"), "id": cd.get("id"), "world": cd.get("world"), "items": items})
        cards[key] = lst
    manifest["cards"] = cards

    # UI: the Main Menu canvas of Menu.unity and the HUD canvas of MainGame.unity (+ every prefab they reference)
    ex.export_prefab(asset("Scenes/Menu.unity"), roots=["Main Menu", "Initialization"], out_id="Scenes/Menu")
    ex.export_prefab(asset("Scenes/MainGame.unity"), roots=["HUD"], out_id="Scenes/HUD")
    ex.export_prefab(asset("GameObject/Core.prefab"), roots=["Transition Screen", "TutorialUtility"], out_id="Scenes/CoreUI")
    manifest["ui"] = {"menu": "Scenes/Menu", "hud": "Scenes/HUD", "core": "Scenes/CoreUI"}
    # TextMesh Pro resources looked up by name at runtime (<sprite>, <gradient>, <style>, defaults)
    tmp = {"settings": "Resources/TMP Settings", "spriteAssets": [], "gradients": [], "styleSheets": []}
    ex.enqueue_so(asset("Resources/TMP Settings.asset"))
    for sub, key in (("sprite assets", "spriteAssets"), ("color gradient presets", "gradients"), ("style sheets", "styleSheets")):
        for f in sorted(os.listdir(asset("Resources/" + sub))):
            if f.endswith(".asset"):
                ex.enqueue_so(asset(f"Resources/{sub}/{f}"))
                tmp[key].append(rel_id(asset(f"Resources/{sub}/{f}")))
    manifest["tmp"] = tmp

    ex.run_queues()
    ex.write_ui_atlas()
    ex.write_meshes()
    ex.write_textures()
    ex.write_audio()
    write_json(os.path.join(OUT, "materials.json"), ex.materials)
    write_json(os.path.join(OUT, "manifest.json"), manifest)
    # one bundle with every ScriptableObject so the runtime can load them in a single request
    bundle = {}
    for path, rid in ex.so_done.items():
        with open(os.path.join(OUT, "so", rid + ".json"), encoding="utf-8") as f:
            bundle[rid] = json.load(f)
    write_json(os.path.join(OUT, "so_bundle.json"), bundle)
    print("prefabs", len(ex.prefab_done), "so", len(ex.so_done), "materials", len(ex.materials),
          "textures", len(ex.textures), "audio", len(ex.audio))


if __name__ == "__main__":
    main()
