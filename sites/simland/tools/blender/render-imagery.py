"""Original photoreal imagery for the SIMLAND site, rendered with Cycles.

The cables are the same procedural models the live WebGL scenes use
(exported by tools/export-cables.mjs), so the photographs and the 3D hero
show one consistent product family. Studio light: Poly Haven
"studio_small_09" (CC0) plus coloured area lights in the brand palette.

    blender -b --factory-startup -P tools/blender/render-imagery.py -- \
        <shot> <cables-dir> <out.png> [--preview]

shots: macro | section | tray | icon-expertise | icon-quality | icon-price | icon-delivery
"""

import json
import math
import os
import random
import sys

import bpy
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
SHOT, CABLES, OUT = argv[0], argv[1], argv[2]
PREVIEW = "--preview" in argv
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
HDRI = os.path.join(REPO, "library", "polyhaven", "studio_small_09", "studio_small_09_2k.hdr")
random.seed(11)


# ---------------------------------------------------------------- helpers


def srgb(hexstr, a=1.0):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (a,)


def set_in(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def principled(name, color, metallic=0.0, rough=0.4, coat=0.0, coat_rough=0.1, transmission=0.0, ior=1.45,
               aniso=0.0, bump=None, spec=0.5, sheen=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    set_in(bsdf, "Base Color", color)
    set_in(bsdf, "Metallic", metallic)
    set_in(bsdf, "Roughness", rough)
    set_in(bsdf, "IOR", ior)
    set_in(bsdf, "Specular IOR Level", spec)
    set_in(bsdf, "Coat Weight", coat)
    set_in(bsdf, "Coat Roughness", coat_rough)
    set_in(bsdf, "Transmission Weight", transmission)
    set_in(bsdf, "Sheen Weight", sheen)
    if emission:
        set_in(bsdf, "Emission Color", emission)
        set_in(bsdf, "Emission Strength", strength)
    if aniso:
        # brushed along the wire: UV v runs along each strand
        set_in(bsdf, "Anisotropic", aniso)
        set_in(bsdf, "Anisotropic Rotation", 0.25)
        tan = nt.nodes.new("ShaderNodeTangent")
        tan.direction_type = "UV_MAP"
        nt.links.new(tan.outputs["Tangent"], bsdf.inputs["Tangent"])
    if bump:
        kind, scale, strength = bump
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Detail"].default_value = 8
        bmp = nt.nodes.new("ShaderNodeBump")
        bmp.inputs["Strength"].default_value = strength
        if kind == "drawn":  # fine lines along the strand (UV v)
            nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
            mapping.inputs["Scale"].default_value = (scale, scale * 0.02, 1)
        else:  # isotropic grain
            nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
            mapping.inputs["Scale"].default_value = (scale, scale, scale)
        nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
        nt.links.new(noise.outputs["Fac"], bmp.inputs["Height"])
        nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
        if kind == "drawn":  # roughness varies a little along the wires too
            ramp = nt.nodes.new("ShaderNodeMapRange")
            ramp.inputs["To Min"].default_value = rough * 0.75
            ramp.inputs["To Max"].default_value = rough * 1.35
            nt.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
            nt.links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])
    return m


MATS = {}


def material_for(name):
    """Material from the OBJ part name (e.g. 'ins__1d55c8', 'copper')."""
    if name in MATS:
        return MATS[name]
    if name.startswith("copper"):
        m = principled("copper", srgb("#f0a274"), metallic=1, rough=0.2, aniso=0.55, bump=("drawn", 60, 0.12))
    elif name.startswith("tinned"):
        m = principled("tinned", srgb("#cfd3d8"), metallic=1, rough=0.28, aniso=0.4, bump=("drawn", 60, 0.1))
    elif name.startswith("armour"):
        m = principled("armour", srgb("#b9bec6"), metallic=1, rough=0.3, aniso=0.3, bump=("drawn", 40, 0.08))
    elif name.startswith("foil"):
        m = principled("foil", srgb("#e4e7ea"), metallic=1, rough=0.16, bump=("grain", 90, 0.18))
    elif name.startswith("bedding"):
        m = principled("bedding", srgb("#1b1d21"), rough=0.62, bump=("grain", 300, 0.05))
    elif name.startswith("sheath_black"):
        m = principled("sheath_black", srgb("#141518"), rough=0.5, coat=0.25, coat_rough=0.35, bump=("grain", 420, 0.06))
    elif name.startswith("sheath_blue"):
        m = principled("sheath_blue", srgb("#2a6fd0"), rough=0.42, coat=0.35, coat_rough=0.3, bump=("grain", 420, 0.05))
    elif name.startswith("ins_"):
        hexv = "#" + name.split("_")[-1][:6]
        m = principled(name, srgb(hexv), rough=0.34, coat=0.55, coat_rough=0.2, bump=("grain", 600, 0.02))
    else:
        m = principled(name, srgb("#888888"))
    MATS[name] = m
    return m


def import_cable(kind):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=os.path.join(CABLES, f"{kind}.obj"), forward_axis="NEGATIVE_Z", up_axis="Y")
    objs = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(f"{kind}_root", None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(material_for(o.name.split(".")[0]))
        for p in o.data.polygons:
            p.use_smooth = True
        o.parent = root
    focus = json.load(open(os.path.join(CABLES, f"{kind}.json")))["focus"]
    # model +Y becomes Blender +Z after import
    tips = Vector((focus["tips"][0], -focus["tips"][2], focus["tips"][1]))
    return root, objs, tips


def area(name, loc, target, size, color, power, shape="RECTANGLE", size_y=None):
    d = bpy.data.lights.new(name, "AREA")
    d.shape = shape
    d.size = size
    if size_y:
        d.size_y = size_y
    d.color = color[:3]
    d.energy = power
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    look_at(o, target)
    return o


def look_at(obj, target, roll=0.0):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    if roll:
        obj.rotation_euler.rotate_axis("Z", roll)


def camera(loc, target, lens=85, fstop=None, focus=None, ortho=None):
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = 2000
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    if fstop:
        cam.dof.use_dof = True
        cam.dof.aperture_fstop = fstop
        cam.dof.focus_distance = focus if focus else (Vector(target) - Vector(loc)).length
    o = bpy.data.objects.new("cam", cam)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    look_at(o, target)
    bpy.context.scene.camera = o
    return o


def world(strength=0.6, rotation=0.0, color=None, visible=True):
    w = bpy.data.worlds.new("world")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    if color is not None:
        bg.inputs["Color"].default_value = color
        bg.inputs["Strength"].default_value = strength
        return
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    mapping = nt.nodes.new("ShaderNodeMapping")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping.inputs["Rotation"].default_value = (0, 0, rotation)
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    if not visible:
        # light the scene with the HDRI, but show a flat colour to the camera
        lp = nt.nodes.new("ShaderNodeLightPath")
        flat = nt.nodes.new("ShaderNodeBackground")
        flat.inputs["Color"].default_value = (1, 1, 1, 1)
        mix = nt.nodes.new("ShaderNodeMixShader")
        out = nt.nodes["World Output"]
        nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
        nt.links.new(bg.outputs["Background"], mix.inputs[1])
        nt.links.new(flat.outputs["Background"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def render_setup(w, h, samples, transparent):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 16 if PREVIEW else samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    sc.cycles.max_bounces = 10
    sc.cycles.glossy_bounces = 6
    sc.cycles.transmission_bounces = 10
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 35 if PREVIEW else 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    sc.render.image_settings.color_depth = "16" if not PREVIEW else "8"
    sc.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "AgX - Base Contrast"):
        try:
            sc.view_settings.look = look
            break
        except TypeError:
            continue
    sc.unit_settings.scale_length = 0.01  # 1 unit = 1 cm in the cable models


def gradient_backdrop(name, loc, rot, size, top, bottom, strength=1.0, curve=True):
    """Large curved backdrop with a vertical gradient (emission + diffuse)."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    if curve:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.subdivide(number_cuts=40)
        bpy.ops.object.mode_set(mode="OBJECT")
        for v in o.data.vertices:  # bend the lower edge forward into a cyclorama
            t = (v.co.y + 0.5)
            if t < 0.35:
                k = (0.35 - t) / 0.35
                v.co.z += (k ** 2) * 0.35
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = bottom
    ramp.color_ramp.elements[1].color = top
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    set_in(bsdf, "Roughness", 0.9)
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
    set_in(bsdf, "Emission Strength", strength)
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def shadow_catcher(size=60, z=0.0):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    o = bpy.context.active_object
    o.is_shadow_catcher = True
    return o


def studio_lights(target, scale=1.0, rim_blue=True):
    t = Vector(target)
    area("key", t + Vector((9, -7, 11)) * scale, t, 8 * scale, (1.0, 0.96, 0.9), 2600 * scale * scale)
    area("strip", t + Vector((-3, -9, 6)) * scale, t, 0.5 * scale, (1, 1, 1), 900 * scale * scale, size_y=10 * scale)
    if rim_blue:
        area("rim_blue", t + Vector((-9, 7, 5)) * scale, t, 5 * scale, (0.22, 0.45, 1.0), 2400 * scale * scale)
        area("rim_sky", t + Vector((8, 8, 3)) * scale, t, 4 * scale, (0.35, 0.8, 1.0), 1300 * scale * scale)


def save():
    bpy.context.scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- shots


def shot_macro():
    """Macro of a 61-strand copper conductor, cinematic light. Transparent:
    the page puts it on its own deep-navy panel."""
    render_setup(1600, 1000, 192, transparent=True)
    world(0.45, rotation=1.2, visible=False)
    root, objs, tips = import_cable("single")
    root.rotation_euler = Euler((math.radians(-24), math.radians(10), math.radians(-38)), "XYZ")
    bpy.context.view_layer.update()
    tip = root.matrix_world @ Vector((0, 0, 2.55))
    studio_lights(tip, 0.55)
    camera(tip + Vector((-3.0, -9.5, 8.6)), tip + Vector((0.2, 0.3, -0.35)), lens=100, fstop=2.2)
    save()


def shot_section():
    """The armoured cable lying on a surface: every layer of the cut-back visible."""
    render_setup(1500, 1050, 192, transparent=True)
    world(0.55, rotation=2.1, visible=False)
    root, objs, tips = import_cable("armoured")
    # lay it down along +X, end facing the camera-left, slight roll
    root.rotation_euler = Euler((0, math.radians(90), math.radians(-52)), "XYZ")
    root.location = (0, 0, 2.0)
    bpy.context.view_layer.update()
    shadow_catcher(200, z=0.0)
    focus = root.matrix_world @ Vector((0, 0, 2.2))
    studio_lights(focus, 0.9)
    camera(focus + Vector((-13, -17, 11)), focus + Vector((-1.2, 0, -0.6)), lens=60, fstop=5.6)
    save()


def cable_run(name, pts, radius, mat):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def box(name, loc, dims, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = dims
    bpy.ops.object.transform_apply(scale=True)
    bev = o.modifiers.new("bevel", "BEVEL")
    bev.width = min(dims) * 0.18
    bev.segments = 3
    o.data.materials.append(mat)
    return o


def shot_tray():
    """Illustrative installation: a ladder cable tray under a modern ceiling."""
    render_setup(1600, 1000, 160, transparent=False)
    world(0.35, rotation=0.4)
    sc = bpy.context.scene
    steel = principled("galv", srgb("#c3c8cf"), metallic=1, rough=0.32, bump=("grain", 60, 0.05))
    concrete = principled("concrete", srgb("#e9edf2"), rough=0.85, bump=("grain", 8, 0.25))
    wall = principled("wall", srgb("#f3f6fa"), rough=0.7)
    led = principled("led", srgb("#ffffff"), emission=srgb("#e8f2ff"), strength=22)
    led_blue = principled("led_blue", srgb("#7fb5ff"), emission=srgb("#3d7dff"), strength=30)
    L = 260  # tray length (cm), running along +Y
    W = 30
    z = 0.0
    # ladder tray: two side rails + rungs
    for sx in (-1, 1):
        box(f"rail{sx}", (sx * W / 2, L / 2, z + 5), (0.4, L, 10), steel)
        box(f"lip{sx}", (sx * (W / 2 - 1.2), L / 2, z + 9.8), (2.4, L, 0.4), steel)
    for i in range(0, 34):
        y = 4 + i * 7.6
        box(f"rung{i}", (0, y, z + 0.8), (W, 2.6, 1.6), steel)
    # hanger rods and ceiling
    for y in (30, 110, 190):
        for sx in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=40, location=(sx * (W / 2 + 2), y, z + 20))
            bpy.context.active_object.data.materials.append(steel)
        box(f"strut{y}", (0, y, z - 1.5), (W + 8, 3, 3), steel)
    box("ceiling", (0, L / 2, z + 40), (400, L * 2, 2), concrete)
    box("wall", (-70, L / 2, z - 20), (2, L * 2, 140), wall)
    # linear lights in the ceiling
    for x in (-38, 38):
        box(f"led{x}", (x, L / 2, z + 38.6), (3, L * 1.6, 0.6), led)
    box("led_wall", (-68.6, L / 2, z + 10), (0.6, L * 1.6, 1.2), led_blue)
    # cables in the tray: mixed diameters and sheath colours
    sheath_black = material_for("sheath_black")
    sheath_blue = material_for("sheath_blue")
    grey = principled("sheath_grey", srgb("#9aa1aa"), rough=0.45, coat=0.25, coat_rough=0.3, bump=("grain", 420, 0.05))
    red = principled("sheath_red", srgb("#c8262a"), rough=0.4, coat=0.35, coat_rough=0.25, bump=("grain", 420, 0.05))
    specs = [(-10.5, 3.6, sheath_black), (-4.0, 2.9, sheath_black), (2.0, 2.4, grey), (7.2, 2.2, sheath_blue),
             (11.6, 1.7, red), (-7.4, 1.5, grey), (4.8, 1.3, sheath_black), (-1.2, 1.1, sheath_blue)]
    for k, (x, r, mat) in enumerate(specs):
        pts = []
        for i in range(9):
            y = -10 + i * (L + 20) / 8
            wob = math.sin(i * 1.3 + k) * 0.35
            pts.append((x + wob, y, z + 1.6 + r + (0.2 if k > 5 else 0) + (r * 1.6 if k >= 5 else 0)))
        cable_run(f"cable{k}", pts, r, mat)
    camera((24, -26, 27), (0, 62, 4), lens=30, fstop=3.2, focus=46)
    save()


# ---------------------------------------------------------------- icons


def glass(name="glass"):
    return principled(name, srgb("#dfefff"), rough=0.04, transmission=1.0, ior=1.47, spec=0.6)


def copper_solid():
    return principled("copper_solid", srgb("#f0a274"), metallic=1, rough=0.22, bump=("grain", 120, 0.03))


def extrude_curve(name, pts2d, depth, bevel, mat, loc=(0, 0, 0), cyclic=True):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = depth
    cu.bevel_depth = bevel
    cu.bevel_resolution = 6
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts2d) - 1)
    for i, (x, y) in enumerate(pts2d):
        bp = sp.bezier_points[i]
        bp.co = (x, y, 0)
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.data.materials.append(mat)
    return o


def torus(name, major, minor, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=96, minor_segments=24,
                                     location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def strands_disc(name, radius, rings, length, mat, loc, rot):
    """Short bundle of round copper wires (a conductor cross-section)."""
    rs = radius / (2 * rings + 1)
    parent = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(parent)
    count = [1] + [6 * i for i in range(1, rings + 1)]
    for li, n in enumerate(count):
        for s in range(n):
            a = s / n * math.tau + li * 0.3
            rr = rs * 2 * li
            bpy.ops.mesh.primitive_cylinder_add(radius=rs * 0.97, depth=length * (1 + random.uniform(-0.06, 0.06)),
                                                vertices=24, location=(math.cos(a) * rr, math.sin(a) * rr, 0))
            o = bpy.context.active_object
            o.data.materials.append(mat)
            bev = o.modifiers.new("bevel", "BEVEL")
            bev.width = rs * 0.12
            bev.segments = 2
            bpy.ops.object.shade_smooth()
            o.parent = parent
    parent.location = loc
    parent.rotation_euler = rot
    return parent


def icon_setup():
    render_setup(640, 640, 256, transparent=True)
    world(0.9, rotation=0.6, visible=False)
    studio_lights((0, 0, 0), 0.5)
    camera((0, -16, 10), (0, 0, 0.4), lens=58)
    shadow_catcher(80, z=-1.75)


def shot_icon_expertise():
    icon_setup()
    g, cu = glass(), copper_solid()
    # a glass lens ring over a copper conductor: knowing what is inside the cable
    strands_disc("conductor", 1.55, 2, 1.6, cu, (0.15, 0.4, -0.95), (0, 0, 0))
    torus("lens_ring", 2.15, 0.34, g, (0, 0, 0.2), (math.radians(62), 0, 0))
    bpy.ops.mesh.primitive_cylinder_add(radius=1.9, depth=0.18, vertices=96, location=(0, 0, 0.2),
                                        rotation=(math.radians(62), 0, 0))
    lens = bpy.context.active_object
    lens.data.materials.append(g)
    bev = lens.modifiers.new("bevel", "BEVEL")
    bev.width = 0.08
    bev.segments = 4
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=2.4, vertices=48, location=(1.9, -0.9, -0.9),
                                        rotation=(math.radians(62), 0, math.radians(-40)))
    handle = bpy.context.active_object
    handle.data.materials.append(cu)
    bpy.ops.object.shade_smooth()
    save()


def shot_icon_quality():
    icon_setup()
    g, cu = glass(), copper_solid()
    shield = [(0, 2.4), (1.9, 1.75), (1.75, -0.3), (0, -2.35), (-1.75, -0.3), (-1.9, 1.75)]
    s = extrude_curve("shield", shield, 0.32, 0.12, g)
    s.rotation_euler = (math.radians(68), 0, 0)
    check = [(-0.95, 0.1), (-0.25, -0.65), (1.05, 0.85)]
    c = bpy.data.curves.new("check", "CURVE")
    c.dimensions = "3D"
    c.bevel_depth = 0.24
    c.bevel_resolution = 8
    c.use_fill_caps = True
    sp = c.splines.new("POLY")
    sp.points.add(len(check) - 1)
    for i, (x, y) in enumerate(check):
        sp.points[i].co = (x, y, 0.62, 1)
    co = bpy.data.objects.new("check", c)
    bpy.context.scene.collection.objects.link(co)
    co.data.materials.append(cu)
    co.rotation_euler = (math.radians(68), 0, 0)
    save()


def shot_icon_price():
    icon_setup()
    g, cu = glass(), copper_solid()
    tag = [(-1.2, 1.9), (1.2, 1.9), (1.45, 1.6), (1.45, -1.25), (0, -2.45), (-1.45, -1.25), (-1.45, 1.6)]
    t = extrude_curve("tag", tag, 0.22, 0.1, g)
    t.rotation_euler = (math.radians(66), 0, math.radians(18))
    torus("ring", 0.55, 0.14, cu, (0.3, 0.0, 1.9), (math.radians(90), 0, math.radians(18)))
    # copper wire tie looping through the tag hole
    w = bpy.data.curves.new("tie", "CURVE")
    w.dimensions = "3D"
    w.bevel_depth = 0.07
    w.bevel_resolution = 6
    sp = w.splines.new("BEZIER")
    pts = [(0.35, 0.2, 2.35), (1.4, -0.2, 2.9), (2.3, -0.6, 2.1), (2.6, -0.3, 0.9)]
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    wo = bpy.data.objects.new("tie", w)
    bpy.context.scene.collection.objects.link(wo)
    wo.data.materials.append(cu)
    save()


def shot_icon_delivery():
    icon_setup()
    g, cu = glass(), copper_solid()
    # cable drum: two glass flanges, copper cable wound on the barrel
    for x in (-1.25, 1.25):
        bpy.ops.mesh.primitive_cylinder_add(radius=2.05, depth=0.24, vertices=128, location=(x, 0, 0.35),
                                            rotation=(0, math.radians(90), 0))
        f = bpy.context.active_object
        f.data.materials.append(g)
        bev = f.modifiers.new("bevel", "BEVEL")
        bev.width = 0.07
        bev.segments = 4
        bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.62, depth=2.3, vertices=64, location=(0, 0, 0.35),
                                        rotation=(0, math.radians(90), 0))
    bpy.context.active_object.data.materials.append(g)
    sheath = principled("drum_cable", srgb("#1b1d22"), rough=0.4, coat=0.3, coat_rough=0.25)
    c = bpy.data.curves.new("wound", "CURVE")
    c.dimensions = "3D"
    c.bevel_depth = 0.15
    c.bevel_resolution = 6
    sp = c.splines.new("POLY")
    pts = []
    turns, layers = 7, 5
    for layer in range(layers):
        r = 0.78 + layer * 0.3
        for i in range(turns * 24 + 1):
            t = i / 24
            x = -1.0 + (t / turns) * 2.0 if layer % 2 == 0 else 1.0 - (t / turns) * 2.0
            a = t * math.tau
            pts.append((x, math.cos(a) * r, math.sin(a) * r + 0.35))
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    o = bpy.data.objects.new("wound", c)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(sheath)
    # copper end of the cable sticking out
    tail = bpy.data.curves.new("tail", "CURVE")
    tail.dimensions = "3D"
    tail.bevel_depth = 0.1
    tail.use_fill_caps = True
    sp2 = tail.splines.new("BEZIER")
    tp = [(1.0, 1.95, 0.4), (1.8, 2.4, -0.4), (2.4, 2.2, -1.3)]
    sp2.bezier_points.add(len(tp) - 1)
    for i, p in enumerate(tp):
        bp = sp2.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    to = bpy.data.objects.new("tail", tail)
    bpy.context.scene.collection.objects.link(to)
    to.data.materials.append(cu)
    root = bpy.data.objects.new("drum", None)
    bpy.context.scene.collection.objects.link(root)
    for ob in bpy.context.scene.objects:
        if ob.type in {"MESH", "CURVE"} and not ob.is_shadow_catcher:
            ob.parent = root
    root.rotation_euler = (0, 0, math.radians(-28))
    save()


def shot_icon_variety():
    icon_setup()
    g, cu = glass(), copper_solid()
    # three cable stubs of different build standing in a glass collar
    stubs = [((-1.25, 0.3), 0.72, "#1b1d22", 2.2), ((0.05, -0.35), 0.86, "#2a6fd0", 2.8), ((1.3, 0.35), 0.62, "#c8262a", 1.9)]
    for k, ((x, y), r, colour, h) in enumerate(stubs):
        jacket = principled(f"jacket{k}", srgb(colour), rough=0.38, coat=0.4, coat_rough=0.25)
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=96, location=(x, y, -1.75 + h / 2))
        o = bpy.context.active_object
        o.data.materials.append(jacket)
        bev = o.modifiers.new("bevel", "BEVEL")
        bev.width = 0.05
        bev.segments = 3
        bpy.ops.object.shade_smooth()
        strands_disc(f"cu{k}", r * 0.78, 2, 0.5, cu, (x, y, -1.75 + h + 0.2), (0, 0, k * 0.4))
    torus("collar", 2.35, 0.22, g, (0.05, 0.05, -1.45), (0, 0, 0))
    save()


def shot_icon_support():
    icon_setup()
    g, cu = glass(), copper_solid()
    bubble = [(-1.9, 1.3), (1.9, 1.3), (2.15, 1.05), (2.15, -0.75), (1.9, -1.0), (-0.5, -1.0), (-1.4, -1.85),
              (-1.25, -1.0), (-1.9, -1.0), (-2.15, -0.75), (-2.15, 1.05)]
    b = extrude_curve("bubble", bubble, 0.3, 0.12, g)
    b.rotation_euler = (math.radians(70), 0, math.radians(-10))
    for k, x in enumerate((-0.9, 0.0, 0.9)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.3, segments=48, ring_count=24, location=(x, -0.62, 0.32 + 0.0))
        o = bpy.context.active_object
        o.data.materials.append(cu)
        bpy.ops.object.shade_smooth()
        o.parent = b
        o.location = (x, 0.15, 0.62)
    save()


bpy.ops.wm.read_factory_settings(use_empty=True)
{
    "macro": shot_macro,
    "section": shot_section,
    "tray": shot_tray,
    "icon-expertise": shot_icon_expertise,
    "icon-quality": shot_icon_quality,
    "icon-price": shot_icon_price,
    "icon-delivery": shot_icon_delivery,
    "icon-variety": shot_icon_variety,
    "icon-support": shot_icon_support,
}[SHOT]()
print("rendered", SHOT, "->", OUT)
