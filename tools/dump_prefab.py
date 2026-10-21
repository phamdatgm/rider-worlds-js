"""Print a prefab hierarchy with components. Usage: dump_prefab.py <file> [--full <ComponentType>...]"""
import sys
import json
from unity_yaml import Prefab, comp_label


def main():
    path = sys.argv[1]
    full = set(sys.argv[sys.argv.index("--full") + 1:]) if "--full" in sys.argv else set()
    p = Prefab(path)

    def walk(gid, depth):
        comps = p.components(gid)
        labels = [comp_label(c) for _, c in comps if c["type"] not in ("Transform",)]
        _, t = p.transform_of(gid)
        td = t["data"] if t else {}
        pos = td.get("m_LocalPosition", {})
        rot = td.get("m_LocalRotation", {})
        scl = td.get("m_LocalScale", {})
        active = p.docs[gid]["data"].get("m_IsActive", 1)
        print("  " * depth + f"- {p.name(gid)}{'' if active else ' (inactive)'}  L{p.docs[gid]['data'].get('m_Layer')} "
              f"pos=({pos.get('x', 0):.3g},{pos.get('y', 0):.3g},{pos.get('z', 0):.3g}) "
              f"rotz/w=({rot.get('z', 0):.3g},{rot.get('w', 1):.3g}) scl=({scl.get('x', 1):.3g},{scl.get('y', 1):.3g},{scl.get('z', 1):.3g}) "
              f"[{', '.join(labels)}]")
        for cid, c in comps:
            if comp_label(c) in full or "*" in full:
                if c["type"] == "Transform":
                    continue
                d = {k: v for k, v in c["data"].items() if not k.startswith("m_Object") and k not in ("m_CorrespondingSourceObject", "m_PrefabInstance", "m_PrefabAsset", "m_GameObject", "m_Script", "m_EditorHideFlags", "m_EditorClassIdentifier")}
                s = json.dumps(d, default=str)
                print("  " * (depth + 2) + f"{comp_label(c)} #{cid}: {s[:4000]}")
        for ch in p.children(gid):
            walk(ch, depth + 1)

    for r in p.roots():
        walk(r, 0)


if __name__ == "__main__":
    main()
