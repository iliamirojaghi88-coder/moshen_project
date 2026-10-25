"""Modern bedroom set, built from scratch for the film (no library assets).

Room shell with a window and a door, upholstered channel headboard, platform
base, mattress, two pillows (analytic, with a head dent), a duvet draped by a
cloth simulation, walnut nightstands, ceramic lamps with linen shades, a phone,
a charging dock with a standby LED, curtains and a rug. Ambient occlusion is
baked into each mesh's colour attribute; world-scale cube UVs (1 unit = 1 m)
let the real-time materials tile weave / grain maps at true size.

blender -b --factory-startup -P build/bedroom.py -- <out.glb> [preview.png]
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
NZ = Perlin3(5)
MATS = {}


def mat(name, color, rough=0.6, metal=0.0, emit=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 4.0
    MATS[name] = m
    return m


def link(ob, material):
    bpy.context.collection.objects.link(ob) if ob.name not in bpy.context.collection.objects else None
    ob.data.materials.clear()
    ob.data.materials.append(material)
    return ob


def activate(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def box(name, x0, x1, y0, y1, z0, z1, material, bevel=0.0, seg=3, subdiv=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (x1 - x0, y1 - y0, z1 - z0)
    bpy.ops.object.transform_apply(scale=True)
    if subdiv:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.subdivide(number_cuts=subdiv)
        bpy.ops.object.mode_set(mode="OBJECT")
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = seg
        mod.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier="bevel")
    bpy.ops.object.shade_smooth_by_angle(angle=0.6)
    return link(ob, material)


def grid_plane(name, nx, ny, sx, sy, loc, rot, material):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=nx, y_subdivisions=ny, size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (sx, sy, 1)
    bpy.ops.object.transform_apply(scale=True, rotation=True, location=True)
    return link(ob, material)


def mesh_from_grid(name, P, material, closed_u=False):
    """P: (nu, nv, 3) array -> quad mesh."""
    nu, nv, _ = P.shape
    bm = bmesh.new()
    V = [[bm.verts.new(P[i, j]) for j in range(nv)] for i in range(nu)]
    for i in range(nu - 1 + (1 if closed_u else 0)):
        for j in range(nv - 1):
            a, b = V[i][j], V[(i + 1) % nu][j]
            bm.faces.new((a, b, V[(i + 1) % nu][j + 1], V[i][j + 1]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return link(ob, material)


def lathe(name, profile, material, seg=96, loc=(0, 0, 0)):
    """profile: list of (r, z); revolved around Z."""
    P = np.zeros((seg, len(profile), 3))
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j, (r, z) in enumerate(profile):
            P[i, j] = (loc[0] + r * math.cos(a), loc[1] + r * math.sin(a), loc[2] + z)
    return mesh_from_grid(name, P, material, closed_u=True)


# ---------------------------------------------------------------- materials
M = dict(
    wall=mat("wall", (0.62, 0.6, 0.57), 0.92),
    trim=mat("trim", (0.75, 0.74, 0.71), 0.6),
    floor=mat("floor_oak", (0.42, 0.3, 0.2), 0.55),
    rug=mat("rug", (0.55, 0.53, 0.5), 0.98),
    headboard=mat("fabric_headboard", (0.2, 0.24, 0.3), 0.9),
    base=mat("fabric_base", (0.2, 0.24, 0.3), 0.9),
    sheet=mat("sheet", (0.86, 0.86, 0.84), 0.85),
    pillow=mat("pillow", (0.88, 0.88, 0.86), 0.85),
    duvet=mat("duvet", (0.7, 0.74, 0.8), 0.88),
    throw=mat("throw", (0.33, 0.36, 0.42), 0.95),
    walnut=mat("wood_walnut", (0.24, 0.15, 0.09), 0.45),
    ceramic=mat("ceramic", (0.82, 0.8, 0.76), 0.35),
    shade=mat("lampshade", (0.86, 0.82, 0.74), 0.9),
    bulb=mat("bulb", (1, 0.9, 0.7), 0.4, emit=(1, 0.8, 0.55)),
    metal=mat("metal_black", (0.05, 0.05, 0.055), 0.35, 1.0),
    brass=mat("metal_brass", (0.75, 0.58, 0.33), 0.3, 1.0),
    glass=mat("glass", (0.9, 0.95, 1.0), 0.05),
    phone=mat("phone_body", (0.03, 0.03, 0.035), 0.25, 0.2),
    screen=mat("phone_screen", (0.02, 0.02, 0.03), 0.15, emit=(0.55, 0.7, 1.0)),
    led=mat("led", (0.1, 0.1, 0.1), 0.3, emit=(0.2, 0.6, 1.0)),
    dock=mat("dock", (0.12, 0.12, 0.13), 0.5),
    door=mat("door", (0.7, 0.69, 0.66), 0.55),
    gap=mat("door_gap_light", (1, 0.85, 0.6), 0.5, emit=(1, 0.8, 0.5)),
    sheer=mat("curtain_sheer", (0.9, 0.88, 0.84), 0.95),
    blackout=mat("curtain_blackout", (0.16, 0.19, 0.25), 0.95),
    sky=mat("sky", (0.5, 0.6, 0.8), 1.0, emit=(0.5, 0.6, 0.8)),
)

ROOM_X, ROOM_Y0, ROOM_Y1, ROOM_H = 2.3, -2.6, 2.0, 2.75

# ---------------------------------------------------------------- shell
grid_plane("floor", 140, 140, 2 * ROOM_X, ROOM_Y1 - ROOM_Y0, (0, (ROOM_Y0 + ROOM_Y1) / 2, 0), (0, 0, 0), M["floor"])
grid_plane("wall_back", 90, 60, 2 * ROOM_X, ROOM_H, (0, ROOM_Y1, ROOM_H / 2), (math.pi / 2, 0, 0), M["wall"])
grid_plane("wall_right", 90, 60, ROOM_Y1 - ROOM_Y0, ROOM_H, (ROOM_X, (ROOM_Y0 + ROOM_Y1) / 2, ROOM_H / 2), (math.pi / 2, 0, math.pi / 2), M["wall"])
# left wall with a window opening y[-0.9, 0.7] z[0.75, 2.35]
WY0, WY1, WZ0, WZ1 = -1.05, 0.75, 0.7, 2.4
for nm, y0, y1, z0, z1 in [("wl_a", ROOM_Y0, WY0, 0, ROOM_H), ("wl_b", WY1, ROOM_Y1, 0, ROOM_H),
                           ("wl_c", WY0, WY1, 0, WZ0), ("wl_d", WY0, WY1, WZ1, ROOM_H)]:
    box(nm, -ROOM_X - 0.16, -ROOM_X, y0, y1, z0, z1, M["wall"], subdiv=6)
# window reveal + frame
box("win_sill", -ROOM_X - 0.16, -ROOM_X + 0.05, WY0 - 0.04, WY1 + 0.04, WZ0 - 0.03, WZ0, M["trim"], bevel=0.006)
fw = 0.045
for nm, y0, y1, z0, z1 in [("wf_l", WY0, WY0 + fw, WZ0, WZ1), ("wf_r", WY1 - fw, WY1, WZ0, WZ1),
                           ("wf_b", WY0, WY1, WZ0, WZ0 + fw), ("wf_t", WY0, WY1, WZ1 - fw, WZ1),
                           ("wf_m", (WY0 + WY1) / 2 - fw / 2, (WY0 + WY1) / 2 + fw / 2, WZ0, WZ1),
                           ("wf_h", WY0, WY1, 1.62 - fw / 2, 1.62 + fw / 2)]:
    box(nm, -ROOM_X - 0.1, -ROOM_X - 0.05, y0, y1, z0, z1, M["metal"], bevel=0.004)
grid_plane("win_glass", 2, 2, 0.001, 1, (0, 0, 0), (0, 0, 0), M["glass"])
g = bpy.context.object
bpy.data.objects.remove(g)
bpy.ops.mesh.primitive_plane_add(size=1, location=(-ROOM_X - 0.075, (WY0 + WY1) / 2, (WZ0 + WZ1) / 2), rotation=(0, math.pi / 2, 0))
g = bpy.context.object; g.name = "win_glass"; g.scale = (WZ1 - WZ0, WY1 - WY0, 1)
bpy.ops.object.transform_apply(scale=True, rotation=True)
link(g, M["glass"])
bpy.ops.mesh.primitive_plane_add(size=1, location=(-ROOM_X - 1.6, (WY0 + WY1) / 2, 1.5), rotation=(0, math.pi / 2, 0))
s = bpy.context.object; s.name = "sky"; s.scale = (5, 7, 1)
bpy.ops.object.transform_apply(scale=True, rotation=True)
link(s, M["sky"])
# baseboards
box("base_back", -ROOM_X, ROOM_X, ROOM_Y1 - 0.015, ROOM_Y1, 0, 0.09, M["trim"], bevel=0.004)
box("base_right", ROOM_X - 0.015, ROOM_X, ROOM_Y0, ROOM_Y1, 0, 0.09, M["trim"], bevel=0.004)
# door on the right wall with a lit gap under it
DY0, DY1 = -2.1, -1.2
box("door_leaf", ROOM_X - 0.035, ROOM_X - 0.005, DY0, DY1, 0.012, 2.1, M["door"], bevel=0.004)
for nm, y0, y1, z0, z1 in [("df_l", DY0 - 0.07, DY0, 0, 2.17), ("df_r", DY1, DY1 + 0.07, 0, 2.17), ("df_t", DY0 - 0.07, DY1 + 0.07, 2.1, 2.17)]:
    box(nm, ROOM_X - 0.03, ROOM_X, y0, y1, z0, z1, M["trim"], bevel=0.004)
box("door_gap", ROOM_X - 0.012, ROOM_X - 0.002, DY0 + 0.01, DY1 - 0.01, 0.0, 0.012, M["gap"])
lathe("door_handle", [(0.0, 0), (0.012, 0), (0.012, 0.11), (0.0, 0.11)], M["brass"], seg=24).rotation_euler = (0, -math.pi / 2, 0)
h = bpy.data.objects["door_handle"]; h.location = (ROOM_X - 0.04, DY1 - 0.08, 1.02)

# ---------------------------------------------------------------- bed
BED_Y1 = ROOM_Y1 - 0.02
box("bed_plinth", -0.85, 0.85, -0.05, BED_Y1 - 0.12, 0, 0.09, M["metal"], bevel=0.01)
box("bed_base", -0.95, 0.95, -0.2, BED_Y1 - 0.1, 0.08, 0.34, M["base"], bevel=0.035, seg=5)
n_ch = 9
cw = 1.98 / n_ch
for i in range(n_ch):
    x0 = -0.99 + i * cw
    box(f"headboard_{i}", x0 + 0.004, x0 + cw - 0.004, BED_Y1 - 0.12, BED_Y1, 0.3, 1.18, M["headboard"], bevel=0.045, seg=6)
box("headboard_back", -0.99, 0.99, BED_Y1 - 0.05, BED_Y1, 0.08, 1.16, M["headboard"], bevel=0.01)
MAT_Z0, MAT_Z1 = 0.34, 0.58
box("mattress", -0.82, 0.82, -0.12, BED_Y1 - 0.14, MAT_Z0, MAT_Z1, M["sheet"], bevel=0.05, seg=6, subdiv=8)


def pillow(name, cx, cy, W, D, T, tilt, dent, seed):
    nu, nv = 72, 52
    u = np.linspace(-1, 1, nu)[:, None]
    v = np.linspace(-1, 1, nv)[None, :]
    f = np.sqrt(np.clip(1 - np.abs(u) ** 4, 0, 1)) * np.sqrt(np.clip(1 - np.abs(v) ** 4, 0, 1))
    x = u * W / 2 * (1 - 0.05 * (1 - v ** 2))
    y = v * D / 2 * (1 - 0.06 * (1 - u ** 2))
    pts = np.stack(np.broadcast_arrays(x, y, np.zeros_like(x * y)), -1).reshape(-1, 3)
    wr = NZ(pts * np.array([9, 9, 0]) + seed).reshape(nu, nv)
    edge = 1 - f
    top = T / 2 * f ** 0.7 + 0.008 * wr * edge - dent * np.exp(-(((u - 0.08) / 0.42) ** 2 + ((v + 0.05) / 0.5) ** 2))
    bot = -T / 2 * f ** 0.7 * 0.8
    Pt = np.stack(np.broadcast_arrays(x, y, top), -1)
    Pb = np.stack(np.broadcast_arrays(x, y, bot), -1)[:, ::-1]
    bm = bmesh.new()
    def add(P):
        V = [[bm.verts.new(P[i, j]) for j in range(nv)] for i in range(nu)]
        for i in range(nu - 1):
            for j in range(nv - 1):
                bm.faces.new((V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]))
    add(Pt); add(Pb)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = (cx, cy, MAT_Z1 + T * 0.42)
    ob.rotation_euler = (tilt, 0, 0.03 * (seed % 3 - 1))
    activate(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    return link(ob, M["pillow"])


PILLOWS = [pillow("pillow_l", -0.4, 1.62, 0.7, 0.48, 0.17, -0.32, 0.03, 3),
           pillow("pillow_r", 0.4, 1.6, 0.7, 0.48, 0.17, -0.3, 0.045, 8)]

# ---------------------------------------------------------------- duvet (cloth)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=110, y_subdivisions=90, size=1, location=(0.03, 0.6, 0.8))
duvet = bpy.context.object
duvet.name = "duvet"
duvet.scale = (2.05, 1.62, 1)
bpy.ops.object.transform_apply(scale=True)
Vd = np.array([v.co[:] for v in duvet.data.vertices])
Vd[:, 2] += 0.05 * NZ(Vd * np.array([1.6, 1.6, 0]) + 3) + 0.03 * NZ(Vd * 4 + 9)
Vd[:, 0] += 0.04 * NZ(Vd * 1.2 + 21)
for v, p in zip(duvet.data.vertices, Vd):
    v.co = p
link(duvet, M["duvet"])
for ob in [bpy.data.objects["mattress"], bpy.data.objects["bed_base"], bpy.data.objects["floor"]] + PILLOWS:
    c = ob.modifiers.new("collision", "COLLISION")
    ob.collision.thickness_outer = 0.006
    ob.collision.cloth_friction = 40.0
cl = duvet.modifiers.new("cloth", "CLOTH")
st = cl.settings
st.quality = 7
st.mass = 0.35
st.tension_stiffness = st.compression_stiffness = 12
st.shear_stiffness = 6
st.bending_stiffness = 0.25
st.air_damping = 1.5
cl.collision_settings.distance_min = 0.006
cl.collision_settings.use_self_collision = False
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, 48
cl.point_cache.frame_end = 48
for f in range(1, 49):
    sc.frame_set(f)
activate(duvet)
bpy.ops.object.modifier_apply(modifier="cloth")
so = duvet.modifiers.new("solid", "SOLIDIFY"); so.thickness = 0.03; so.offset = 1.0
ss = duvet.modifiers.new("sub", "SUBSURF"); ss.levels = 1
bpy.ops.object.modifier_apply(modifier="solid")
bpy.ops.object.modifier_apply(modifier="sub")
bpy.ops.object.shade_smooth()
for ob in [bpy.data.objects["mattress"], bpy.data.objects["bed_base"], bpy.data.objects["floor"]] + PILLOWS:
    activate(ob)
    bpy.ops.object.modifier_remove(modifier="collision")
print("DUVET", len(duvet.data.vertices))

# ---------------------------------------------------------------- nightstands, lamps, props
for side, nx in (("l", -1.33), ("r", 1.33)):
    x0, x1, y0, y1 = nx - 0.26, nx + 0.26, BED_Y1 - 0.46, BED_Y1 - 0.04
    box(f"ns_{side}_body", x0, x1, y0, y1, 0.16, 0.54, M["walnut"], bevel=0.008)
    box(f"ns_{side}_drawer", x0 + 0.02, x1 - 0.02, y0 - 0.008, y0 + 0.01, 0.2, 0.46, M["walnut"], bevel=0.004)
    box(f"ns_{side}_pull", nx - 0.06, nx + 0.06, y0 - 0.02, y0 - 0.006, 0.405, 0.418, M["brass"], bevel=0.003)
    for lx in (x0 + 0.03, x1 - 0.03):
        for ly in (y0 + 0.03, y1 - 0.03):
            lathe(f"ns_{side}_leg_{lx:.2f}_{ly:.2f}", [(0, 0), (0.011, 0), (0.011, 0.17), (0, 0.17)], M["metal"], seg=16, loc=(lx, ly, 0))
    lx, ly = nx + 0.07 * (1 if side == "l" else -1), BED_Y1 - 0.2
    lathe(f"lamp_{side}_base", [(0, 0.54), (0.075, 0.54), (0.085, 0.56), (0.095, 0.62), (0.098, 0.68), (0.088, 0.75), (0.06, 0.8),
                                (0.022, 0.83), (0.016, 0.86), (0.016, 0.95), (0, 0.95)], M["ceramic"], seg=72, loc=(lx, ly, 0))
    lathe(f"lamp_{side}_shade", [(0.165, 0.86), (0.17, 0.865), (0.17, 1.08), (0.165, 1.085), (0.16, 1.08), (0.16, 0.865), (0.165, 0.86)],
          M["shade"], seg=96, loc=(lx, ly, 0))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(lx, ly, 0.98), segments=24, ring_count=12)
    b = bpy.context.object; b.name = f"lamp_{side}_bulb"; link(b, M["bulb"])
# phone on the right nightstand, dock + standby LED on the left
box("phone", 1.2, 1.275, 1.56, 1.715, 0.54, 0.549, M["phone"], bevel=0.004)
box("phone_screen", 1.204, 1.271, 1.564, 1.711, 0.5492, 0.5494, M["screen"])
lathe("dock", [(0, 0.54), (0.05, 0.54), (0.052, 0.545), (0.05, 0.556), (0, 0.556)], M["dock"], seg=48, loc=(-1.42, 1.62, 0))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.004, location=(-1.42, 1.572, 0.551), segments=12, ring_count=6)
b = bpy.context.object; b.name = "standby_led"; link(b, M["led"])
# rug
box("rug", -1.45, 1.45, -1.25, 1.35, 0, 0.014, M["rug"], bevel=0.006, subdiv=10)
# folded throw across the foot of the bed
bpy.ops.mesh.primitive_grid_add(x_subdivisions=80, y_subdivisions=20, size=1, location=(0, 0.02, 0.0))
th = bpy.context.object; th.name = "throw"; th.scale = (1.9, 0.38, 1)
bpy.ops.object.transform_apply(scale=True)
for v in th.data.vertices:
    x, y = v.co.x, v.co.y
    top = MAT_Z1 + 0.075
    over = max(0.0, abs(x) - 0.84)
    z = top - (over * 1.0 if over > 0 else 0) + 0.006 * NZ.fbm(np.array([[x * 8, y * 8, 0.5]]))[0]
    v.co = (min(max(x, -0.9), 0.9) if over < 0.06 else math.copysign(0.86 + 0.02 * over, x), y, z - over * 0.2)
link(th, M["throw"])
so = th.modifiers.new("solid", "SOLIDIFY"); so.thickness = 0.022
activate(th); bpy.ops.object.modifier_apply(modifier="solid"); bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- curtains
def curtain(name, y0, width, folds, material, seed):
    nu, nv = 140, 60
    s = np.linspace(0, 1, nu)[:, None]
    zz = np.linspace(0.02, ROOM_H - 0.08, nv)[None, :]
    flare = 1 + 0.35 * (1 - zz / ROOM_H) ** 2
    amp = 0.035 * flare * (1 + 0.25 * NZ(np.stack(np.broadcast_arrays(s * 3, zz * 0.5, s * 0 + seed), -1).reshape(-1, 3)).reshape(nu, nv))
    x = -ROOM_X + 0.11 + amp * np.sin(s * 2 * math.pi * folds)
    y = y0 + s * width * (0.95 + 0.1 * (1 - zz / ROOM_H))
    P = np.stack(np.broadcast_arrays(x, y, zz), -1)
    return mesh_from_grid(name, P, material)


curtain("curtain_sheer_a", WY0 - 0.32, 0.42, 6.5, M["sheer"], 1)
curtain("curtain_sheer_b", WY1 - 0.1, 0.42, 6.5, M["sheer"], 2)
curtain("curtain_blackout_a", WY0 - 0.5, 0.26, 4.5, M["blackout"], 3)
curtain("curtain_blackout_b", WY1 + 0.24, 0.26, 4.5, M["blackout"], 4)
for nm in ("curtain_blackout_a", "curtain_blackout_b"):
    ob = bpy.data.objects[nm]
    for v in ob.data.vertices:
        v.co.x -= 0.025
lathe("curtain_rod", [(0, 0), (0.012, 0), (0.012, WY1 - WY0 + 1.3), (0, WY1 - WY0 + 1.3)], M["metal"], seg=20)
r = bpy.data.objects["curtain_rod"]; r.rotation_euler = (-math.pi / 2, 0, 0); r.location = (-ROOM_X + 0.1, WY0 - 0.6, ROOM_H - 0.06)

# ---------------------------------------------------------------- AO bake + world UVs
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    activate(o)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    if not o.data.color_attributes:
        o.data.color_attributes.new("AO", "BYTE_COLOR", "POINT")
    o.data.color_attributes.active_color = o.data.color_attributes[0]

sc.render.engine = "CYCLES"
sc.cycles.samples = 64
w = bpy.data.worlds.new("w"); sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
skip = {"sky", "win_glass", "phone_screen", "standby_led", "door_gap", "lamp_l_bulb", "lamp_r_bulb"}
sky_ob = bpy.data.objects["sky"]
sky_ob.hide_render = True
bpy.data.objects["win_glass"].hide_render = True
for o in meshes:
    if o.name in skip:
        continue
    activate(o)
    sc.render.bake.target = "VERTEX_COLORS"
    sc.render.bake.margin = 0
    bpy.ops.object.bake(type="AO")
print("AO baked")
sky_ob.hide_render = False
bpy.data.objects["win_glass"].hide_render = False

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                          export_normals=True, export_materials="EXPORT", export_apply=True, export_texcoords=True)
print("WROTE", OUT, sum(len(o.data.vertices) for o in meshes), "verts", len(meshes), "meshes")

if PREVIEW:
    sc.cycles.samples = 16
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 540, 960
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.04, 0.06, 1)
    bpy.ops.object.light_add(type="AREA", location=(-1.8, 0.0, 2.3))
    L = bpy.context.object; L.data.energy = 300; L.data.size = 1.2; L.data.color = (0.7, 0.8, 1.0)
    bpy.ops.object.light_add(type="POINT", location=(1.26, 1.78, 0.98))
    L = bpy.context.object; L.data.energy = 30; L.data.color = (1, 0.8, 0.55)
    bpy.ops.object.camera_add(location=(0.0, 0.62, 3.5), rotation=(0, 0, 0))
    cam = bpy.context.object; cam.data.lens = 22
    sc.camera = cam
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.camera_add(location=(0.9, -2.3, 1.45), rotation=(1.35, 0, 0.33))
    cam2 = bpy.context.object; cam2.data.lens = 18
    sc.camera = cam2
    sc.render.filepath = PREVIEW.replace(".png", "_b.png")
    bpy.ops.render.render(write_still=True)
