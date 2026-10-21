"""Minimal loader for Unity's text-serialized YAML (prefabs, scenes, assets)."""
import os
import re
import glob
import yaml

UNITY_ROOT = os.environ.get("UNITY_ROOT", r"D:/SourceGame/09/rider-worlds")
ASSETS = os.path.join(UNITY_ROOT, "Assets")

CLASS_NAMES = {
    1: "GameObject", 4: "Transform", 20: "Camera", 23: "MeshRenderer", 33: "MeshFilter",
    50: "Rigidbody2D", 58: "CircleCollider2D", 60: "PolygonCollider2D", 61: "BoxCollider2D",
    66: "CompositeCollider2D", 68: "EdgeCollider2D", 70: "CapsuleCollider2D", 82: "AudioSource",
    95: "Animator", 96: "TrailRenderer", 108: "Light", 114: "MonoBehaviour", 120: "LineRenderer",
    137: "SkinnedMeshRenderer", 198: "ParticleSystem", 199: "ParticleSystemRenderer",
    212: "SpriteRenderer", 224: "RectTransform", 229: "HingeJoint2D", 231: "SpringJoint2D",
    232: "DistanceJoint2D", 233: "SliderJoint2D", 235: "WheelJoint2D", 1001: "PrefabInstance",
}

_HEADER = re.compile(r"^--- !u!(\d+) &(-?\d+)( stripped)?", re.M)

# Unity serializes byte blobs / int arrays as bare hex strings. YAML 1.1 would read digit-only ones
# such as "0400000001000000" as (octal) ints, so quote them before parsing.
_HEX_KEYS = {"m_Data", "_typelessdata", "m_IndexBuffer", "deltaDifficultyDifferencesInOrder"}
_HEX_LINE = re.compile(r"^(\s*(?:- )?([\w\[\]]+): )([0-9a-fA-F]+)[ \t]*$", re.M)


def _quote_hex(m):
    key, val = m.group(2), m.group(3)
    if key in _HEX_KEYS or (len(val) >= 2 and val[0] == "0" and len(val) % 2 == 0):
        return f'{m.group(1)}"{val}"'
    return m.group(0)


class _Loader(yaml.SafeLoader):
    pass


# YAML 1.1 booleans (yes/no/on/off) would turn names like "On" into bools; only accept true/false.
_Loader.yaml_implicit_resolvers = {
    k: [(tag, rx) for tag, rx in v if tag != "tag:yaml.org,2002:bool"]
    for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


def load_text(text):
    """Return dict fileID -> {'cls': int, 'type': str, 'data': dict, 'stripped': bool}."""
    docs = {}
    text = _HEX_LINE.sub(_quote_hex, text)
    parts = _HEADER.split(text)
    # parts: [preamble, cls, id, stripped, body, cls, id, stripped, body, ...]
    for i in range(1, len(parts), 4):
        cls = int(parts[i])
        fid = int(parts[i + 1])
        stripped = bool(parts[i + 2])
        body = parts[i + 3]
        try:
            node = yaml.load(body, Loader=_Loader) or {}
        except yaml.YAMLError:
            node = {}
        type_name, data = (next(iter(node.items())) if node else (CLASS_NAMES.get(cls, str(cls)), {}))
        docs[fid] = {"cls": cls, "type": type_name, "data": data or {}, "stripped": stripped}
    return docs


def load_file(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return load_text(f.read())


_guid_index = None


def guid_index():
    """Map asset GUID -> absolute path for everything under Assets."""
    global _guid_index
    if _guid_index is None:
        _guid_index = {}
        for meta in glob.glob(os.path.join(ASSETS, "**", "*.meta"), recursive=True):
            try:
                with open(meta, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        if line.startswith("guid:"):
                            _guid_index[line.split(":", 1)[1].strip()] = meta[:-5]
                            break
            except OSError:
                pass
    return _guid_index


# Scripts compiled into Unity/package DLLs (no .cs in the ripped project): uGUI + TextMesh Pro.
BUILTIN_SCRIPTS = {
    "fe87c0e1cc204ed48ad3b37840f39efc": "Image",
    "1344c3c82d62a2a41a3576d8abb8e3ea": "RawImage",
    "f4688fdb7df04437aeb418b961361dc5": "TextMeshProUGUI",
    "9541d86e2fd84c1d9990edf0852d74ab": "TextMeshPro",
    "5f7201a12d95ffc409449d95f23cf332": "Text",
    "4e29b1a8efbd4b44bb3f3716e73f07ff": "Button",
    "9085046f02f69544eb97fd06b6048fe2": "Toggle",
    "2a4db7a114972834c8e4117be1d82ba3": "ToggleGroup",
    "31a19414c41e5ae4aae2af33fee712f6": "Mask",
    "3312d7739989d2b4e91e6319e9a96d76": "RectMask2D",
    "30649d3a9faa99c48a7b1166b86bf2a0": "HorizontalLayoutGroup",
    "59f8146938fff824cb5fd77236b75775": "VerticalLayoutGroup",
    "8a8695521f0d02e499659fee002a26c2": "GridLayoutGroup",
    "306cc8c2b49d7114eaa3623786fc2126": "LayoutElement",
    "3245ec927659c4140ac4f8d17403cc18": "ContentSizeFitter",
    "86710e43de46f6f4bac7c8e50813a599": "AspectRatioFitter",
    "1aa08ab6e0800fa44ae55d278d1423e3": "ScrollRect",
    "dc42784cf147c0c48a680349fa168899": "GraphicRaycaster",
    "0cd44c1031e13a943bb63640046fad76": "CanvasScaler",
    "e19747de3f5aca642ab2be37e372fb86": "Outline",
    "cfabb0440166ab443bba8876756fdfa9": "Shadow",
    "76c392e42b5098c458856cdf6ecaaaa1": "EventSystem",
    "4f231c4fb786f3946a6b90b886c48677": "StandaloneInputModule",
    "d0b148fe25e99eb48b9724523833bab1": "EventTrigger",
    "e4786b5477cac0a42855b21fdaa2242f": "Toggle",
    "a79441f348de89743a2939f4d699eac1": "UniversalAdditionalCameraData",
    "71c1514a6bd24e1e882cebbe1904ce04": "TMP_FontAsset",
    "2705215ac5b84b70bacc50632be6e391": "TMP_Settings",
    "84a92b25f83d49b9bc132d206b370281": "TMP_SpriteAsset",
    "ab2114bdc8544297b417dfefe9f1e410": "TMP_StyleSheet",
    "54d21f6ece3b46479f0c328f8c6007e0": "TMP_ColorGradient",
}


def script_name(mono_data):
    ref = mono_data.get("m_Script") or {}
    g = ref.get("guid", "")
    if g in BUILTIN_SCRIPTS:
        return BUILTIN_SCRIPTS[g]
    path = guid_index().get(g)
    return os.path.splitext(os.path.basename(path))[0] if path else None


class Prefab:
    """Indexed view of a prefab/scene: GameObjects, components and hierarchy."""

    def __init__(self, path):
        self.path = path
        self.docs = load_file(path)
        self.go_components = {}
        for fid, d in self.docs.items():
            if d["type"] == "GameObject":
                self.go_components[fid] = [c["component"]["fileID"] for c in d["data"].get("m_Component", [])]

    def comp(self, fid):
        return self.docs.get(fid)

    def name(self, go_id):
        return self.docs[go_id]["data"].get("m_Name", "?")

    def components(self, go_id):
        return [(cid, self.docs[cid]) for cid in self.go_components.get(go_id, []) if cid in self.docs]

    def transform_of(self, go_id):
        for cid, c in self.components(go_id):
            if c["type"] in ("Transform", "RectTransform"):
                return cid, c
        return None, None

    def children(self, go_id):
        tid, t = self.transform_of(go_id)
        if not t:
            return []
        out = []
        for ch in t["data"].get("m_Children", []):
            ct = self.docs.get(ch["fileID"])
            if ct:
                out.append(ct["data"]["m_GameObject"]["fileID"])
        return out

    def roots(self):
        out = []
        for gid in self.go_components:
            _, t = self.transform_of(gid)
            if t and t["data"].get("m_Father", {}).get("fileID", 0) == 0:
                out.append(gid)
        return out

    def find(self, pred):
        return [g for g in self.go_components if pred(self, g)]

    def path_of(self, go_id):
        names = []
        cur = go_id
        while cur:
            names.append(self.name(cur))
            _, t = self.transform_of(cur)
            father = t["data"].get("m_Father", {}).get("fileID", 0) if t else 0
            cur = self.docs[father]["data"]["m_GameObject"]["fileID"] if father in self.docs else 0
        return "/".join(reversed(names))


def comp_label(c):
    if c["type"] == "MonoBehaviour":
        return script_name(c["data"]) or "MonoBehaviour?"
    return c["type"]
