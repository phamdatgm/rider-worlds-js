"""Decode Unity Mesh assets (text YAML) into numpy arrays.

Handles both m_CompressedMesh (PackedBitVector, m_MeshCompression > 0) and raw
m_VertexData/_typelessdata layouts. Ported from AssetStudio's Mesh reader.
"""
import numpy as np

from unity_yaml import load_file

# Unity 2019+ VertexFormat -> (numpy dtype, normalize divisor or None)
_VERTEX_FORMATS = {
    0: (np.float32, None), 1: (np.float16, None), 2: (np.uint8, 255.0), 3: (np.int8, 127.0),
    4: (np.uint16, 65535.0), 5: (np.int16, 32767.0), 6: (np.uint8, None), 7: (np.int8, None),
    8: (np.uint16, None), 9: (np.int16, None), 10: (np.uint32, None), 11: (np.int32, None),
}
_CHANNEL_NAMES = ["position", "normal", "tangent", "color"] + [f"uv{i}" for i in range(8)] + ["weights", "indices"]


def _hex(s):
    if not s:
        return b""
    if isinstance(s, int):
        s = str(s)
    return bytes.fromhex(str(s).strip())


def _unpack_bits(data, bit_size, count, bit_start=0):
    """Read `count` little-endian bit-packed unsigned ints of `bit_size` bits."""
    if count <= 0 or bit_size <= 0:
        return np.zeros(max(count, 0), dtype=np.uint64)
    bits = np.unpackbits(np.frombuffer(data, dtype=np.uint8), bitorder="little")
    need = bit_start + bit_size * count
    if bits.size < need:
        bits = np.concatenate([bits, np.zeros(need - bits.size, dtype=np.uint8)])
    chunk = bits[bit_start:need].reshape(count, bit_size).astype(np.uint64)
    weights = (np.uint64(1) << np.arange(bit_size, dtype=np.uint64))
    return (chunk * weights).sum(axis=1)


def _pbv_floats(pbv, item_count_in_chunk, start=0, num_chunks=-1):
    n = int(pbv.get("m_NumItems", 0))
    bit_size = int(pbv.get("m_BitSize", 0))
    rng = float(pbv.get("m_Range", 0))
    st = float(pbv.get("m_Start", 0))
    if num_chunks == -1:
        num_chunks = n // item_count_in_chunk
    count = num_chunks * item_count_in_chunk
    raw = _unpack_bits(_hex(pbv.get("m_Data")), bit_size, count, bit_size * start)
    max_val = float((1 << bit_size) - 1) if bit_size > 0 else 1.0
    return (raw.astype(np.float64) * (rng / max_val) + st).astype(np.float32)


def _pbv_ints(pbv, num_items=None, bit_size=None):
    n = int(pbv.get("m_NumItems", 0)) if num_items is None else num_items
    bs = int(pbv.get("m_BitSize", 0)) if bit_size is None else bit_size
    return _unpack_bits(_hex(pbv.get("m_Data")), bs, n).astype(np.int64)


def _decode_compressed(cm):
    out = {}
    v = cm["m_Vertices"]
    nverts = int(v.get("m_NumItems", 0)) // 3
    if nverts == 0:
        return out, 0
    out["position"] = _pbv_floats(v, 3).reshape(-1, 3)

    uv = cm.get("m_UV", {})
    if int(uv.get("m_NumItems", 0)) > 0:
        info = int(cm.get("m_UVInfo", 0) or 0)
        if info != 0:
            src = 0
            for ch in range(8):
                bits = (info >> (ch * 4)) & 0xF
                if bits & 4:
                    dim = 1 + (bits & 3)
                    out[f"uv{ch}"] = _pbv_floats(uv, dim, src, nverts).reshape(-1, dim)
                    src += dim * nverts
        else:
            out["uv0"] = _pbv_floats(uv, 2, 0, nverts).reshape(-1, 2)
            if int(uv["m_NumItems"]) >= nverts * 4:
                out["uv1"] = _pbv_floats(uv, 2, nverts * 2, nverts).reshape(-1, 2)

    nrm = cm.get("m_Normals", {})
    if int(nrm.get("m_NumItems", 0)) > 0:
        xy = _pbv_floats(nrm, 2).reshape(-1, 2)
        signs = _pbv_ints(cm["m_NormalSigns"])
        zsq = 1.0 - xy[:, 0] ** 2 - xy[:, 1] ** 2
        z = np.sqrt(np.clip(zsq, 0, None))
        n = np.stack([xy[:, 0], xy[:, 1], z], axis=1)
        bad = zsq < 0
        if bad.any():
            l = np.linalg.norm(n[bad], axis=1, keepdims=True)
            n[bad] = n[bad] / np.maximum(l, 1e-8)
        n[:, 2] = np.where(signs[: n.shape[0]] == 0, -n[:, 2], n[:, 2])
        out["normal"] = n.astype(np.float32)

    col = cm.get("m_FloatColors") or {}
    if int(col.get("m_NumItems", 0)) > 0:
        out["color"] = _pbv_floats(col, 1).reshape(-1, 4)
    col = cm.get("m_Colors") or {}
    if int(col.get("m_NumItems", 0)) > 0:
        n = int(col["m_NumItems"]) * 4
        bs = int(col["m_BitSize"]) // 4
        out["color"] = (_pbv_ints(col, n, bs).astype(np.float32) / 255.0).reshape(-1, 4)

    tri = cm.get("m_Triangles", {})
    out["_indices"] = _pbv_ints(tri).astype(np.uint32)
    return out, nverts


def _decode_raw(mesh):
    vd = mesh["m_VertexData"]
    nverts = int(vd.get("m_VertexCount", 0))
    data = _hex(vd.get("_typelessdata"))
    channels = vd.get("m_Channels", [])
    out = {}
    if nverts == 0 or not data:
        return out, nverts
    # per-stream stride
    streams = {}
    for ch in channels:
        dim = int(ch["dimension"]) & 0xF
        if dim == 0:
            continue
        dt, _ = _VERTEX_FORMATS[int(ch["format"])]
        size = np.dtype(dt).itemsize * dim
        s = int(ch["stream"])
        streams[s] = max(streams.get(s, 0), int(ch["offset"]) + size)
    stream_offsets = {}
    off = 0
    for s in sorted(streams):
        stream_offsets[s] = off
        off += streams[s] * nverts
        off = (off + 15) & ~15
    buf = np.frombuffer(data, dtype=np.uint8)
    for idx, ch in enumerate(channels):
        dim = int(ch["dimension"]) & 0xF
        if dim == 0 or idx >= len(_CHANNEL_NAMES):
            continue
        dt, norm = _VERTEX_FORMATS[int(ch["format"])]
        s = int(ch["stream"])
        stride = streams[s]
        isz = np.dtype(dt).itemsize
        base = stream_offsets[s] + int(ch["offset"])
        rows = np.lib.stride_tricks.as_strided(buf[base:], shape=(nverts, dim * isz), strides=(stride, 1))
        arr = np.ascontiguousarray(rows).view(dt).reshape(nverts, dim).astype(np.float32)
        if norm:
            arr = arr / norm
        out[_CHANNEL_NAMES[idx]] = arr
    ib = _hex(mesh.get("m_IndexBuffer"))
    if int(mesh.get("m_IndexFormat", 0)) == 0:
        out["_indices"] = np.frombuffer(ib, dtype="<u2").astype(np.uint32)
    else:
        out["_indices"] = np.frombuffer(ib, dtype="<u4").astype(np.uint32)
    return out, nverts


def decode_mesh(path):
    docs = load_file(path)
    mesh = next(d["data"] for d in docs.values() if d["type"] == "Mesh")
    if int(mesh.get("m_MeshCompression", 0)) > 0 and int(mesh["m_CompressedMesh"]["m_Vertices"].get("m_NumItems", 0)) > 0:
        attrs, nverts = _decode_compressed(mesh["m_CompressedMesh"])
        index_bytes_per = 2  # compressed triangle list is in index units
    else:
        attrs, nverts = _decode_raw(mesh)
        index_bytes_per = 2 if int(mesh.get("m_IndexFormat", 0)) == 0 else 4
    indices = attrs.pop("_indices", np.zeros(0, dtype=np.uint32))
    submeshes = []
    for sm in mesh.get("m_SubMeshes", []):
        start = int(sm["firstByte"]) // index_bytes_per
        count = int(sm["indexCount"])
        base = int(sm.get("baseVertex", 0))
        if base:
            indices[start:start + count] += base
        submeshes.append({"start": start, "count": count, "topology": int(sm.get("topology", 0))})
    aabb = mesh.get("m_LocalAABB", {})
    return {
        "name": mesh.get("m_Name"),
        "vertexCount": nverts,
        "attributes": attrs,
        "indices": indices,
        "submeshes": submeshes,
        "center": [aabb.get("m_Center", {}).get(k, 0) for k in "xyz"],
        "extent": [aabb.get("m_Extent", {}).get(k, 0) for k in "xyz"],
    }


if __name__ == "__main__":
    import sys
    m = decode_mesh(sys.argv[1])
    print(m["name"], m["vertexCount"], {k: v.shape for k, v in m["attributes"].items()}, m["indices"].shape, m["submeshes"])
    p = m["attributes"].get("position")
    if p is not None:
        print("min", p.min(axis=0), "max", p.max(axis=0), "aabb", m["center"], m["extent"])
    print("max index", m["indices"].max() if m["indices"].size else None)
