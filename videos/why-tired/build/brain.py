"""Anatomical brain, built procedurally (no library assets).

Two cerebral hemispheres shaped from dense icospheres (medial flattening,
frontal/occipital/temporal profile, Sylvian fissure), gyri and sulci carved by
domain-warped ridged noise, a foliated cerebellum and a brainstem. Cavity is
stored in COLOR_0 so the real-time material can darken the sulci.

blender -b --factory-startup -P build/brain.py -- <out.glb> [preview.png]
"""
import sys, os, math
import numpy as np
import bpy, bmesh

sys.path.insert(0, os.path.dirname(__file__))
from noise import Perlin3, smoothstep

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
N1, N2, N3, NW = Perlin3(11), Perlin3(23), Perlin3(37), Perlin3(53)


def ico(subdiv):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    return bm


def bm_coords(bm):
    return np.array([v.co[:] for v in bm.verts])


def set_coords(bm, P):
    for v, p in zip(bm.verts, P):
        v.co = p
    bm.normal_update()


def normals(bm):
    return np.array([v.normal[:] for v in bm.verts])


def warp(P, s, a):
    return P + a * np.stack([NW(P * s), NW(P * s + 7.7), NW(P * s + 15.3)], 1)


def to_object(bm, name, cav):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    c = np.repeat(np.clip(cav, 0, 1)[:, None], 4, 1)
    c[:, 3] = 1
    attr.data.foreach_set("color", c.ravel())
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def shape(U, side):
    """Unit-sphere coords -> hemisphere surface (cm), lateral = +x frame."""
    x, y, z = U[:, 0] * side, U[:, 1], U[:, 2]
    xm = x * (0.62 + 0.38 * np.tanh(x * 3.0))  # medial face flat
    X = xm * 5.6
    X *= 1 - 0.16 * smoothstep(-0.25, -1.0, y)  # occipital narrows
    Y = y * 8.4
    Z = z * (4.6 + 1.6 * np.tanh(z * 2.6))
    Z -= 0.45 * smoothstep(0.45, 1.0, y) * np.maximum(z, 0)
    Z -= 0.5 * smoothstep(-0.55, -1.0, y) * np.maximum(z, 0)
    Z += 1.35 * smoothstep(-0.35, -0.95, y) * smoothstep(0.05, -0.75, z)  # tentorial notch
    Z += 0.55 * smoothstep(0.35, 0.9, y) * smoothstep(-0.1, -0.8, z)  # orbital surface
    tl = np.exp(-(((x - 0.82) / 0.32) ** 2 + ((y - 0.12) / 0.36) ** 2 + ((z + 0.55) / 0.32) ** 2))
    Z -= 0.75 * tl  # temporal lobe
    X += 0.35 * tl
    return np.stack([X, Y, Z], 1)


def neighbours(bm):
    E = np.array([(e.verts[0].index, e.verts[1].index) for e in bm.edges])
    n = len(bm.verts)
    nb = np.tile(np.arange(n)[:, None], (1, 7))
    cnt = np.zeros(n, int)
    for a, b in E:
        nb[a, cnt[a]] = b; cnt[a] += 1
        nb[b, cnt[b]] = a; cnt[b] += 1
    return nb


def gray_scott(P, nb, seed, iters=26000):
    """Labyrinthine Gray-Scott pattern on the mesh graph (edge-length weighted)."""
    d2 = ((P[nb] - P[:, None, :]) ** 2).sum(2)
    h0 = np.median(np.sqrt(d2[d2 > 0]))
    w = np.where(d2 > 0, h0 * h0 / np.maximum(d2, 1e-12), 0.0)
    w = np.minimum(w * (2.0 / 3.0), 1.2)  # clamp squashed (medial) edges for stability
    rng = np.random.RandomState(seed)
    n = len(P)
    u = np.ones(n); v = np.zeros(n)
    # dense random seeding so the labyrinth forms everywhere at once
    m = Perlin3(seed + 101)(P * 0.95) > 0.32
    v[m] = 0.25 + 0.05 * rng.rand(m.sum())
    u[m] = 0.5
    Du, Dv, F, K, dt = 0.72, 0.36, 0.0545, 0.062, 0.17
    wsum = w.sum(1)
    for i in range(iters):
        Lu = (w * u[nb]).sum(1) - wsum * u
        Lv = (w * v[nb]).sum(1) - wsum * v
        uvv = u * v * v
        u += dt * (Du * Lu - uvv + F * (1 - u))
        v += dt * (Dv * Lv + uvv - (F + K) * v)
    return v, h0


def hemisphere(side):
    seed = 0.0 if side > 0 else 61.7
    # gyral pattern grown directly on the dense hemisphere surface
    bm = ico(8)
    U = bm_coords(bm)
    vd, h0 = gray_scott(shape(U, side), neighbours(bm), 7 if side > 0 else 19)
    print("RD", side, "h0", h0, "v range", vd.min(), vd.max())
    P = shape(U, side)
    set_coords(bm, P)
    # shaped in a mirrored (lateral = +x) frame for the left side, so its
    # winding is flipped there: outward normal = side * computed normal
    Nn = normals(bm) * side
    x, y, z = U[:, 0] * side, U[:, 1], U[:, 2]
    t = np.clip((0.55 - y) / 0.85, 0, 1)
    zline = -0.22 + 0.62 * t
    dist = np.abs(z - zline - 0.04 * N1(U * 3 + seed))
    syl = (1 - smoothstep(0.0, 0.07, dist)) * smoothstep(0.35, 0.65, x) * smoothstep(0.62, 0.48, y) * smoothstep(-0.38, -0.2, y)
    # v high = sulcus core; gyri are the rounded crowns between
    vv = vd + 0.03 * N2(P * 0.6 + seed)
    g = smoothstep(0.04, 0.2, vv)  # v-rich = gyral crown, v-poor = narrow sulcus
    medial = smoothstep(-0.05, -0.35, x)
    depth = 0.6 * (1 - 0.4 * medial)
    disp = depth * (g ** 0.45 - 1) - 0.95 * syl
    disp -= 0.25 * smoothstep(-0.05, -0.25, x) * smoothstep(0.2, 0.9, z)
    P = P + Nn * disp[:, None]
    P[:, 0] = side * (P[:, 0] + 1.47)
    set_coords(bm, P)
    cav = 0.16 + 0.84 * (g ** 0.7) * (1 - 0.8 * syl)
    return to_object(bm, "hemisphere_" + ("R" if side > 0 else "L"), cav)


def cerebellum():
    bm = ico(7)
    U = bm_coords(bm)
    R = np.array([4.75, 3.0, 2.35])
    P = U * R
    # flatter on top (under the tentorium), rounder below
    P[:, 2] = np.where(P[:, 2] > 0, P[:, 2] * 0.72, P[:, 2])
    set_coords(bm, P)
    Nn = normals(bm)
    phi = np.arctan2(U[:, 2], -U[:, 1])
    g = np.abs(np.sin(phi * 15 + 0.7 * N3(U * 2.2) + 0.25 * np.abs(U[:, 0]) * 3))
    fol = smoothstep(0.0, 0.28, g)
    vermis = np.exp(-(U[:, 0] / 0.12) ** 2) * smoothstep(0.1, -0.6, U[:, 1])
    disp = 0.3 * (fol ** 0.5 - 1) - 0.55 * vermis
    P = P + Nn * disp[:, None]
    P += np.array([0.0, -5.45, -3.05])
    set_coords(bm, P)
    cav = 0.3 + 0.7 * fol * (1 - 0.6 * vermis)
    return to_object(bm, "cerebellum", cav)


def brainstem():
    bm = bmesh.new()
    seg, rings = 64, 48
    verts = []
    for i in range(rings + 1):
        t = i / rings
        for j in range(seg):
            a = 2 * math.pi * j / seg
            r = 1.05 - 0.25 * t + 0.42 * math.exp(-((t - 0.22) / 0.13) ** 2) * (0.6 + 0.4 * math.cos(a - math.pi / 2))
            cx = 0.0
            cy = -1.6 - 1.4 * t + 0.6 * t * t
            cz = -2.2 - 5.4 * t
            verts.append(bm.verts.new((cx + r * math.cos(a) * 1.05, cy + r * math.sin(a) * 0.9, cz)))
    for i in range(rings):
        for j in range(seg):
            a = verts[i * seg + j]
            b = verts[i * seg + (j + 1) % seg]
            c = verts[(i + 1) * seg + (j + 1) % seg]
            d = verts[(i + 1) * seg + j]
            bm.faces.new((a, b, c, d))
    bottom = bm.faces.new([verts[rings * seg + j] for j in reversed(range(seg))])
    bmesh.ops.triangulate(bm, faces=[bottom])
    bm.normal_update()
    n = len(bm.verts)
    return to_object(bm, "brainstem", np.full(n, 0.85))


objs = [hemisphere(1), hemisphere(-1), cerebellum(), brainstem()]
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
mix = nt.nodes.new("ShaderNodeMix")
mix.data_type = "RGBA"
mix.blend_type = "MULTIPLY"
mix.inputs["Factor"].default_value = 1.0
mix.inputs["A"].default_value = (0.86, 0.62, 0.58, 1)
nt.links.new(col.outputs["Color"], mix.inputs["B"])
nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.42
bsdf.inputs["Subsurface Weight"].default_value = 0.0
for o in objs:
    o.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=False,
                          export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                          export_normals=True, export_materials="EXPORT", export_apply=True)
print("WROTE", OUT, sum(len(o.data.vertices) for o in objs), "verts")

if PREVIEW:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 720
    w = bpy.data.worlds.new("w"); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.03, 0.05, 1)
    for loc, e, c in [((0.4, 0.3, 0.5), 60, (1, 0.95, 0.9)), ((-0.4, -0.3, 0.2), 40, (0.5, 0.8, 1))]:
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.object; L.data.energy = e; L.data.size = 0.3; L.data.color = c
        L.rotation_euler = (0, 0, 0)
        con = L.constraints.new("TRACK_TO"); con.target = objs[0]
    bpy.ops.object.camera_add(location=(0.38, 0.22, 0.12))
    cam = bpy.context.object
    con = cam.constraints.new("TRACK_TO"); con.target = objs[0]
    sc.camera = cam
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
