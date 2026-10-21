// Polygon helpers: ear-clipping triangulation + Hertel-Mehlhorn merge into convex pieces
// (Box2D/planck only accepts convex polygons, Unity's PolygonCollider2D decomposes concave paths).

function area2(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTri(p, a, b, c) {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function cleanPath(pts, eps = 1e-6) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) out.push([p[0], p[1]]);
  }
  while (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps) out.pop();
    else break;
  }
  // drop collinear points
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      if (Math.abs(cross(a, b, c)) < 1e-9) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** Ear clipping. Returns triangles as index triples into the (CCW) cleaned point list. */
export function triangulate(path) {
  let pts = cleanPath(path);
  if (pts.length < 3) return { pts, tris: [] };
  if (area2(pts) < 0) pts = pts.reverse();
  const idx = pts.map((_, i) => i);
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = pts[i0];
      const b = pts[i1];
      const c = pts[i2];
      if (cross(a, b, c) <= 1e-12) continue; // reflex or degenerate
      let inside = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTri(pts[j], a, b, c)) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      tris.push([i0, i1, i2]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // self-intersecting / numerically bad polygon: fall back to a fan of what's left
      for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
      idx.length = 0;
      break;
    }
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return { pts, tris };
}

function isConvex(poly, pts) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    if (cross(pts[poly[i]], pts[poly[(i + 1) % n]], pts[poly[(i + 2) % n]]) < -1e-12) return false;
  }
  return true;
}

/** Decompose a simple polygon path into convex polygons (arrays of [x,y]) with <= maxVerts vertices. */
export function convexDecompose(path, maxVerts = 8) {
  const { pts, tris } = triangulate(path);
  let polys = tris.map((t) => t.slice());
  // Hertel-Mehlhorn: greedily merge neighbours across shared diagonals while convex
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < polys.length; a++) {
      for (let b = a + 1; b < polys.length; b++) {
        const pa = polys[a];
        const pb = polys[b];
        if (pa.length + pb.length - 2 > maxVerts) continue;
        // find shared edge (pa[i]->pa[i+1]) == (pb[j+1]->pb[j])
        for (let i = 0; i < pa.length; i++) {
          const u = pa[i];
          const v = pa[(i + 1) % pa.length];
          const j = pb.findIndex((x, k) => x === v && pb[(k + 1) % pb.length] === u);
          if (j < 0) continue;
          const merged2 = [];
          for (let k = 0; k < pa.length; k++) {
            merged2.push(pa[(i + 1 + k) % pa.length]);
            if (k === pa.length - 1) break;
          }
          // merged2 starts at v ... ends at u; then add pb's vertices between u and v (exclusive)
          for (let k = 2; k < pb.length; k++) merged2.push(pb[(j + k) % pb.length]);
          if (isConvex(merged2, pts)) {
            polys[a] = merged2;
            polys.splice(b, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
  }
  return polys.map((p) => p.map((i) => pts[i])).filter((p) => Math.abs(area2(p)) > 1e-7);
}

export function polygonArea(pts) {
  return area2(pts) / 2;
}
