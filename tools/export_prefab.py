"""Export extra prefabs into an existing public/assets export (merges textures.json / materials.json / so).

usage: python tools/export_prefab.py GameObject/Foo.prefab [...]
(the full exporter, tools/export.py, includes the same prefabs; this is for quick iterations)
"""
import json
import os
import sys

import export as ex_mod
from export import Exporter, OUT, asset, write_json


def main(paths):
    ex = Exporter()
    for p in paths:
        ex.enqueue_prefab(asset(p))
    ex.run_queues()
    with open(os.path.join(OUT, "materials.json"), encoding="utf-8") as f:
        mats = json.load(f)
    for k, v in ex.materials.items():
        mats.setdefault(k, v)
    write_json(os.path.join(OUT, "materials.json"), mats)
    with open(os.path.join(OUT, "textures.json"), encoding="utf-8") as f:
        tex = json.load(f)
    import shutil
    d = os.path.join(OUT, "textures")
    for rid, (path, meta) in ex.textures.items():
        if rid in tex:
            continue
        shutil.copyfile(path, os.path.join(d, os.path.basename(path)))
        tex[rid] = meta
    write_json(os.path.join(OUT, "textures.json"), tex)
    with open(os.path.join(OUT, "so_bundle.json"), encoding="utf-8") as f:
        bundle = json.load(f)
    for path, rid in ex.so_done.items():
        if rid not in bundle:
            with open(os.path.join(OUT, "so", rid + ".json"), encoding="utf-8") as f:
                bundle[rid] = json.load(f)
    write_json(os.path.join(OUT, "so_bundle.json"), bundle)
    if ex.meshes:
        print("warning: new meshes need a full export:", list(ex.meshes)[:5])
    print("exported", len(ex.prefab_done), "prefabs")


if __name__ == "__main__":
    main(sys.argv[1:])
