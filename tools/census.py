import glob, os, collections, sys
from unity_yaml import Prefab, comp_label
root = r"D:/SourceGame/09/rider-worlds/Assets/GameObject"
files = [f for f in glob.glob(root + "/*.prefab") if os.path.basename(f).startswith(("Level", "Chunk"))]
cnt = collections.Counter(); files_with = collections.Counter(); feedback = collections.Counter()
road_types = collections.Counter()
for f in files:
    p = Prefab(f)
    seen = set()
    for fid, d in p.docs.items():
        if d["type"] == "PrefabInstance": cnt["<PrefabInstance>"] += 1; seen.add("<PrefabInstance>"); continue
        if d["type"] in ("GameObject", "Transform"): continue
        lab = comp_label(d)
        cnt[lab] += 1; seen.add(lab)
        if lab == "RoadPiece": road_types[(d["data"].get("type"), d["data"].get("activation"))] += 1
    for s in seen: files_with[s] += 1
print(len(files), "files")
for k, v in cnt.most_common(): print(f"{v:6d} {files_with[k]:4d}  {k}")
print(road_types)
