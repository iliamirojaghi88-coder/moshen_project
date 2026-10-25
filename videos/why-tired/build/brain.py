"""Anatomical brain, built procedurally for the film (no library assets).

Method
1. Hemisphere form: a dense icosphere shaped into a cerebral hemisphere
   (flat medial face, frontal/occipital/temporal profile, tentorial notch).
2. Primary sulci carved as named curves on the lateral surface: lateral
   (Sylvian) fissure, central, pre/post-central, superior/inferior frontal,
   superior temporal and intraparietal sulci — the organisation that makes a
   cortex read as real.
3. Secondary folds from a labyrinthine Gray–Scott pattern grown on a coarse
   copy of the hemisphere (gyral spacing ≈ 1.3 cm), transferred to the dense
   mesh; thin "sulcus" bands are its low channels.
4. Gyri are rounded tubes: the displacement is a circular profile of the
   geodesic distance to the nearest sulcus (multi-source Dijkstra over the
   mesh), so neighbouring gyri press together across narrow, deep sulci.
5. Tissue colour per vertex: pink-beige crowns, dark red sulcal floors, a
   fine meningeal vessel network; cerebellum with dense folia.

blender -b --factory-startup -P build/brain.py -- <out.glb> [preview.png]
"""
import sys, os, math, heapq
import numpy as np
import bpy, bmesh
from mathutils import kdtree

sys.path.insert(0, os.path.dirname(__file__))
from noise import Perlin3, smoothstep

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
PREVIEW = argv[1] if len(argv) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
N1, N2, N3, NW = Perlin3(11), Perlin3(23), Perlin3(37), Perlin3(53)

CROWN = np.array([0.80, 0.60, 0.56])
DEEP = np.array([0.36, 0.11, 0.12])
VESSEL = np.array([0.42, 0.07, 0.11])


def ico(subdiv):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    bm.verts.ensure_lookup_table()
    return bm


def coords(bm):
    return np.array([v.co[:] for v in bm.verts])


def set_coords(bm, P):
    for v, p in zip(bm.verts, P):
        v.co = p
    bm.normal_update()


def normals(bm):
    return np.array([v.normal[:] for v in bm.verts])


def edges(bm):
    return np.array([(e.verts[0].index, e.verts[1].index) for e in bm.edges])


def neighbours(E, n):
    nb = np.tile(np.arange(n)[:, None], (1, 7))
    cnt = np.zeros(n, int)
    for a, b in E:
        nb[a, cnt[a]] = b; cnt[a] += 1
        nb[b, cnt[b]] = a; cnt[b] += 1
    return nb


def shape(U, side):
    """Unit-sphere coords -> hemisphere surface (cm), lateral = +x frame."""
    x, y, z = U[:, 0] * side, U[:, 1], U[:, 2]
    xm = x * (0.62 + 0.38 * np.tanh(x * 3.0))
    X = xm * 5.6
    X *= 1 - 0.14 * smoothstep(-0.25, -1.0, y)
    Y = y * 8.4
    Z = z * (4.6 + 1.6 * np.tanh(z * 2.6))
    Z -= 0.45 * smoothstep(0.45, 1.0, y) * np.maximum(z, 0)
    Z -= 0.5 * smoothstep(-0.55, -1.0, y) * np.maximum(z, 0)
    Z += 1.35 * smoothstep(-0.35, -0.95, y) * smoothstep(0.05, -0.75, z)
    Z += 0.55 * smoothstep(0.35, 0.9, y) * smoothstep(-0.1, -0.8, z)
    tl = np.exp(-(((x - 0.8) / 0.33) ** 2 + ((y - 0.16) / 0.38) ** 2 + ((z + 0.55) / 0.3) ** 2))
    Z -= 0.8 * tl
    X += 0.38 * tl
    return np.stack([X, Y, Z], 1)


def gray_scott(P, nb, seed, iters=17000):
    d2 = ((P[nb] - P[:, None, :]) ** 2).sum(2)
    h0 = np.median(np.sqrt(d2[d2 > 0]))
    w = np.where(d2 > 0, h0 * h0 / np.maximum(d2, 1e-12), 0.0)
    w = np.minimum(w * (2.0 / 3.0), 1.2)
    rng = np.random.RandomState(seed)
    n = len(P)
    u = np.ones(n); v = np.zeros(n)
    m = Perlin3(seed + 101)(P * 0.7) > 0.3
    v[m] = 0.25 + 0.05 * rng.rand(m.sum()); u[m] = 0.5
    Du, Dv, F, K, dt = 0.40, 0.20, 0.0545, 0.062, 0.30
    ws = w.sum(1)
    for _ in range(iters):
        Lu = (w * u[nb]).sum(1) - ws * u
        Lv = (w * v[nb]).sum(1) - ws * v
        uvv = u * v * v
        u += dt * (Du * Lu - uvv + F * (1 - u))
        v += dt * (Dv * Lv + uvv - (F + K) * v)
    return v


def dijkstra(P, E, sources):
    """Geodesic (edge-path) distance from a vertex set, cm."""
    n = len(P)
    L = np.sqrt(((P[E[:, 0]] - P[E[:, 1]]) ** 2).sum(1))
    adj = [[] for _ in range(n)]
    for (a, b), l in zip(E.tolist(), L.tolist()):
        adj[a].append((b, l)); adj[b].append((a, l))
    d = np.full(n, np.inf)
    h = []
    for s in np.nonzero(sources)[0].tolist():
        d[s] = 0.0
        h.append((0.0, s))
    heapq.heapify(h)
    while h:
        dd, i = heapq.heappop(h)
        if dd > d[i]:
            continue
        for j, l in adj[i]:
            nd = dd + l
            if nd < d[j]:
                d[j] = nd
                heapq.heappush(h, (nd, j))
    return d


def smooth_field(f, nb, it=2):
    for _ in range(it):
        f = 0.5 * f + 0.5 * f[nb].mean(1)
    return f


# primary sulci on the lateral face, as (y, z) on the unit sphere (x > 0 implied) + extra depth (cm)
PRIMARY = {
    "sylvian": ([(0.66, -0.3), (0.42, -0.2), (0.15, -0.1), (-0.15, 0.02), (-0.4, 0.16), (-0.52, 0.3)], 1.35),
    "central": ([(-0.1, 0.96), (-0.03, 0.82), (0.04, 0.62), (0.1, 0.42), (0.15, 0.22), (0.2, 0.02)], 0.55),
    "precentral": ([(0.12, 0.95), (0.2, 0.78), (0.26, 0.56), (0.32, 0.34), (0.37, 0.12)], 0.35),
    "postcentral": ([(-0.28, 0.93), (-0.2, 0.75), (-0.13, 0.55), (-0.07, 0.36), (-0.02, 0.16)], 0.35),
    "sup_frontal": ([(0.3, 0.86), (0.48, 0.76), (0.66, 0.6), (0.82, 0.38)], 0.3),
    "inf_frontal": ([(0.34, 0.46), (0.52, 0.38), (0.7, 0.24), (0.86, 0.06)], 0.3),
    "sup_temporal": ([(0.6, -0.5), (0.36, -0.42), (0.1, -0.32), (-0.2, -0.2), (-0.48, -0.04)], 0.4),
    "intraparietal": ([(-0.18, 0.6), (-0.36, 0.56), (-0.55, 0.46), (-0.74, 0.32)], 0.35),
}


def primary_field(side, Pdense):
    """Distance (cm) from each dense vertex to the nearest primary sulcus curve, and that sulcus' extra depth."""
    pts, depth = [], []
    for name, (poly, dp) in PRIMARY.items():
        for k in range(len(poly) - 1):
            (y0, z0), (y1, z1) = poly[k], poly[k + 1]
            for t in np.linspace(0, 1, 40, endpoint=False):
                y, z = y0 + (y1 - y0) * t, z0 + (z1 - z0) * t
                y += 0.012 * math.sin(t * 9 + k * 2.1)  # a little meander, never ruler-straight
                x = math.sqrt(max(1e-4, 1 - y * y - z * z))
                pts.append((x * side, y, z)); depth.append(dp)
    pts = shape(np.array(pts), side)
    kd = kdtree.KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert(p, i)
    kd.balance()
    dist = np.empty(len(Pdense)); dep = np.empty(len(Pdense))
    for i, p in enumerate(Pdense):
        co, idx, dd = kd.find(p)
        dist[i] = dd; dep[i] = depth[idx]
    return dist, dep


def to_object(bm, name, col):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    c = np.concatenate([np.clip(col, 0, 1), np.ones((len(col), 1))], 1)
    attr.data.foreach_set("color", c.ravel())
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def hemisphere(side):
    seed = 7 if side > 0 else 19
    # coarse labyrinth (gyral spacing ~1.3 cm)
    bmc = ico(7)
    Uc = coords(bmc)
    Ec = edges(bmc)
    v = gray_scott(shape(Uc, side), neighbours(Ec, len(Uc)), seed)
    bmc.free()
    kd = kdtree.KDTree(len(Uc))
    for i, p in enumerate(Uc):
        kd.insert(p, i)
    kd.balance()
    # dense hemisphere
    bm = ico(8)
    U = coords(bm)
    E = edges(bm)
    n = len(U)
    nb = neighbours(E, n)
    vd = np.empty(n)
    for i, p in enumerate(U):
        acc = wt = 0.0
        for co, idx, dist in kd.find_n(p, 4):
            w_ = 1.0 / (dist + 1e-5)
            acc += v[idx] * w_; wt += w_
        vd[i] = acc / wt
    P = shape(U, side)
    set_coords(bm, P)
    # shaped in a mirrored (lateral = +x) frame for the left side: outward normal = side * computed
    Nn = normals(bm) * side
    x = U[:, 0] * side
    medial = smoothstep(-0.05, -0.35, x)
    # sulcus set = thin low channels of the labyrinth ∪ primary sulci
    pd, pdep = primary_field(side, P)
    thr = np.percentile(vd, 13)
    sulc = (vd < thr) | (pd < 0.07)
    d = dijkstra(P, E, sulc)
    d = smooth_field(d, nb, 2)
    W = 0.48  # half gyrus width, cm
    s = np.clip(d / W, 0, 1)
    crown = np.sqrt(1 - (1 - s) ** 2)
    depth = 0.72 * (1 - 0.45 * medial)
    prim = np.exp(-(pd / 0.16) ** 2) * (x > 0.15)
    disp = depth * (crown - 1) - pdep * prim * 0.85
    disp += 0.035 * N2(P * 2.2 + seed) * crown  # fine undulation on the crowns
    disp -= 0.22 * smoothstep(-0.05, -0.25, x) * smoothstep(0.2, 0.9, U[:, 2])
    disp = smooth_field(disp, nb, 1)
    P = P + Nn * disp[:, None]
    P[:, 0] = side * (P[:, 0] + 1.47)
    set_coords(bm, P)
    # colour: crowns pink-beige, sulcal floors dark red, a fine vessel network
    cav = crown ** 0.8 * (1 - 0.7 * prim)
    col = DEEP[None] + (CROWN - DEEP)[None] * cav[:, None]
    col *= (0.93 + 0.07 * N3(P * 0.9 + seed))[:, None]
    q = P * 0.55 + 0.6 * np.stack([NW(P * 0.4), NW(P * 0.4 + 9.1), NW(P * 0.4 + 3.3)], 1)
    ves = (1 - smoothstep(0.0, 0.022, np.abs(N1(q + seed)))) * (0.35 + 0.65 * smoothstep(-0.2, 0.4, N2(P * 0.3 + 5)))
    ves = np.maximum(ves, 0.75 * (1 - smoothstep(0.0, 0.012, np.abs(N3(P * 1.3 + 17 + seed)))) * smoothstep(0.1, 0.5, N1(P * 0.25 + 2)))
    col = col * (1 - 0.75 * ves[:, None]) + VESSEL[None] * 0.75 * ves[:, None]
    print("hemisphere", side, "sulcus fraction", round(float(sulc.mean()), 3), "verts", n)
    return to_object(bm, "hemisphere_" + ("R" if side > 0 else "L"), col)


def cerebellum():
    bm = ico(8)
    U = coords(bm)
    R = np.array([4.75, 3.0, 2.35])
    P = U * R
    P[:, 2] = np.where(P[:, 2] > 0, P[:, 2] * 0.72, P[:, 2])
    set_coords(bm, P)
    Nn = normals(bm)
    phi = np.arctan2(U[:, 2], -U[:, 1])
    g = np.abs(np.sin(phi * 19 + 0.6 * N3(U * 2.2) + 0.3 * np.abs(U[:, 0]) * 3))
    fol = smoothstep(0.0, 0.3, g)
    vermis = np.exp(-(U[:, 0] / 0.12) ** 2) * smoothstep(0.1, -0.6, U[:, 1])
    disp = 0.24 * (np.sqrt(np.clip(1 - (1 - fol) ** 2, 0, 1)) - 1) - 0.5 * vermis
    P = P + Nn * disp[:, None]
    P += np.array([0.0, -5.45, -3.05])
    set_coords(bm, P)
    cav = fol ** 0.8 * (1 - 0.5 * vermis)
    col = DEEP[None] + (CROWN * 0.95 - DEEP)[None] * cav[:, None]
    return to_object(bm, "cerebellum", col)


objs = [hemisphere(1), hemisphere(-1), cerebellum()]
for o in objs:
    o.scale = (0.01, 0.01, 0.01)  # cm -> m
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.transform_apply(scale=True)

mat = bpy.data.materials.new("brain")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
col = nt.nodes.new("ShaderNodeVertexColor")
col.layer_name = "Col"
nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.4
bsdf.inputs["Coat Weight"].default_value = 0.5
bsdf.inputs["Coat Roughness"].default_value = 0.2
bsdf.inputs["Subsurface Weight"].default_value = 0.6
bsdf.inputs["Subsurface Radius"].default_value = (0.004, 0.0012, 0.0008)
bsdf.inputs["Subsurface Scale"].default_value = 1.0
for o in objs:
    o.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=False,
                          export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                          export_normals=True, export_materials="EXPORT", export_apply=True)
print("WROTE", OUT, sum(len(o.data.vertices) for o in objs), "verts")

if PREVIEW:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 32
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 900
    w = bpy.data.worlds.new("w"); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.01, 0.015, 0.03, 1)
    for loc, e, c, s in [((-0.35, -0.3, 0.45), 90, (1, 0.94, 0.88), 0.35), ((0.45, 0.35, 0.15), 50, (0.4, 0.85, 1.0), 0.25), ((-0.3, 0.4, -0.1), 30, (0.4, 0.5, 1.0), 0.3)]:
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.object; L.data.energy = e; L.data.size = s; L.data.color = c
        con = L.constraints.new("TRACK_TO"); con.target = objs[0]
    bpy.ops.object.camera_add(location=(-0.36, -0.2, 0.14))
    cam = bpy.context.object
    cam.data.lens = 60
    con = cam.constraints.new("TRACK_TO"); con.target = objs[0]
    sc.camera = cam
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
