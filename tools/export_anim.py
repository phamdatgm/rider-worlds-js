"""Export AnimatorControllers + their AnimationClips (transform / active / float curves) for the runtime Animator.

Output: public/assets/anim/<controller rel id>.json
  {name, params: [{name, type}], layers: [{default, states: {name: {clip, speed, transitions}}, any: [transitions]}],
   clips: {clip name: {length, loop, curves: [{path, prop, keys}]}}}
  transition: {dst, conds: [{mode, param, threshold}], duration, exitTime, hasExitTime, offset}
  curve prop: "pos" | "rot" | "scale" (vector keys [t, v..., in..., out...]) or "float:<classID>:<attribute>" ([t, v, in, out])
Coordinates are converted like export.py (z mirrored: pos (x, y, -z), quaternion (-x, -y, z, w)).
"""
import glob
import json
import os

from unity_yaml import ASSETS, load_file, guid_index

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "assets", "anim"))


def rel_id(path):
    return os.path.splitext(os.path.relpath(path, ASSETS).replace("\\", "/"))[0]


def num(v):
    if isinstance(v, str):
        low = v.lower()
        if low in ("infinity", "inf"):
            return 1e30
        if low in ("-infinity", "-inf"):
            return -1e30
        try:
            return float(v)
        except ValueError:
            return 0.0
    return float(v or 0)


def r(v):
    return round(v, 6)


VEC_SIGNS = {"pos": (1, 1, -1), "rot": (-1, -1, 1, 1), "scale": (1, 1, 1), "euler": (-1, -1, 1)}


def vec_keys(curve, prop):
    comps = "xyzw" if prop == "rot" else "xyz"
    sign = VEC_SIGNS[prop]
    keys = []
    for k in (curve.get("m_Curve") or []):
        row = [r(num(k.get("time")))]
        for field in ("value", "inSlope", "outSlope"):
            v = k.get(field) or {}
            row += [r(num(v.get(c, 0)) * sign[i]) for i, c in enumerate(comps)]
        keys.append(row)
    return keys


def float_keys(curve):
    return [[r(num(k.get("time"))), r(num(k.get("value"))), r(num(k.get("inSlope"))), r(num(k.get("outSlope")))]
            for k in (curve.get("m_Curve") or [])]


def export_clip(path):
    d = next(iter(load_file(path).values()))["data"]
    settings = d.get("m_AnimationClipSettings") or {}
    curves = []
    for field, prop in (("m_PositionCurves", "pos"), ("m_RotationCurves", "rot"), ("m_ScaleCurves", "scale"), ("m_EulerCurves", "euler")):
        for c in d.get(field) or []:
            curves.append({"path": c.get("path") or "", "prop": prop, "keys": vec_keys(c.get("curve") or {}, prop)})
    for c in d.get("m_FloatCurves") or []:
        curves.append({"path": c.get("path") or "", "prop": f"float:{c.get('classID')}:{c.get('attribute')}", "keys": float_keys(c.get("curve") or {})})
    return {
        "length": r(num(settings.get("m_StopTime", 0)) - num(settings.get("m_StartTime", 0))),
        "loop": int(settings.get("m_LoopTime", 0) or 0),
        "curves": curves,
    }


def export_controller(path, gi):
    docs = load_file(path)
    ctrl = next(x["data"] for x in docs.values() if x["type"] == "AnimatorController")
    out = {"name": ctrl.get("m_Name"), "params": [], "layers": [], "clips": {}}
    for p in ctrl.get("m_AnimatorParameters") or []:
        out["params"].append({"name": p.get("m_Name"), "type": int(p.get("m_Type", 9)), "default": num(p.get("m_DefaultFloat", 0))})

    def transition(fid):
        t = docs.get(fid, {}).get("data") or {}
        dst = docs.get((t.get("m_DstState") or {}).get("fileID", 0), {}).get("data") or {}
        return {
            "dst": dst.get("m_Name"),
            "exit": int(t.get("m_IsExit", 0) or 0),
            "conds": [{"mode": int(c.get("m_ConditionMode", 0)), "param": c.get("m_ConditionEvent"), "threshold": num(c.get("m_EventTreshold", 0))} for c in t.get("m_Conditions") or []],
            "duration": num(t.get("m_TransitionDuration", 0)),
            "offset": num(t.get("m_TransitionOffset", 0)),
            "exitTime": num(t.get("m_ExitTime", 1)),
            "hasExitTime": int(t.get("m_HasExitTime", 0) or 0),
            "fixed": int(t.get("m_HasFixedDuration", 1) or 0),
        }

    for layer in ctrl.get("m_AnimatorLayers") or []:
        sm = docs.get((layer.get("m_StateMachine") or {}).get("fileID", 0), {}).get("data") or {}
        states = {}
        for cs in sm.get("m_ChildStates") or []:
            st = docs.get((cs.get("m_State") or {}).get("fileID", 0), {}).get("data") or {}
            motion = st.get("m_Motion") or {}
            clip_path = gi.get(motion.get("guid", ""))
            clip_name = None
            if clip_path and clip_path.endswith(".anim"):
                clip_name = os.path.splitext(os.path.basename(clip_path))[0]
                if clip_name not in out["clips"]:
                    out["clips"][clip_name] = export_clip(clip_path)
            states[st.get("m_Name")] = {
                "clip": clip_name,
                "speed": num(st.get("m_Speed", 1)),
                "transitions": [transition(t.get("fileID")) for t in st.get("m_Transitions") or []],
            }
        default = docs.get((sm.get("m_DefaultState") or {}).get("fileID", 0), {}).get("data") or {}
        out["layers"].append({
            "name": layer.get("m_Name"),
            "default": default.get("m_Name"),
            "states": states,
            "any": [transition(t.get("fileID")) for t in sm.get("m_AnyStateTransitions") or []],
        })
    return out


def main():
    gi = guid_index()
    n = 0
    for path in glob.glob(os.path.join(ASSETS, "AnimatorController", "*.controller")):
        data = export_controller(path, gi)
        dst = os.path.join(OUT, rel_id(path) + ".json")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        n += 1
        print("controller", rel_id(path), "clips", len(data["clips"]))
    print("animator controllers", n)


if __name__ == "__main__":
    main()
