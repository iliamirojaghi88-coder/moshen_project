"""Turn any SVG icon into a real 3D icon: bevelled extrusion + studio material.

blender -b --factory-startup -P tools/3d/icon3d.py -- in.svg out.png \
    [--glb out.glb] [--material ceramic|glass|metal|clay] [--color #b3121f] \
    [--hdri studio.hdr] [--size 768] [--samples 64] [--depth 0.18] [--tilt 18] [--turn -24]

One script, so every icon in a film shares geometry rules, material, light
and camera — a consistent set instead of mixed clip-art. The PNG has an alpha
background for compositing; the GLB drops straight into a Three.js scene.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
ap = argparse.ArgumentParser()
ap.add_argument("svg")
ap.add_argument("out")
ap.add_argument("--glb")
ap.add_argument("--material", default="ceramic")
ap.add_argument("--color", default="#b3121f")
ap.add_argument("--hdri")
ap.add_argument("--size", type=int, default=768)
ap.add_argument("--samples", type=int, default=64)
ap.add_argument("--depth", type=float, default=0.18)
ap.add_argument("--tilt", type=float, default=18)
ap.add_argument("--turn", type=float, default=-24)
a = ap.parse_args(argv)


def lin(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_curve.svg(filepath=os.path.abspath(a.svg))
curves = [o for o in bpy.context.scene.objects if o.type == "CURVE"]
if not curves:
    raise SystemExit("no paths in SVG")

# Normalise: icon fits a 1×1 square in XY, centred.
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in curves for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), 0))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), 0))
span = max(hi.x - lo.x, hi.y - lo.y)
centre = (lo + hi) / 2
for o in curves:
    o.data.dimensions = "2D"
    o.data.fill_mode = "BOTH"
    o.data.extrude = a.depth * span / 2
    o.data.bevel_depth = 0.035 * span
    o.data.bevel_resolution = 6
    o.data.resolution_u = 24
    o.location -= centre
bpy.ops.object.select_all(action="DESELECT")
for o in curves:
    o.select_set(True)
bpy.context.view_layer.objects.active = curves[0]
bpy.ops.object.convert(target="MESH")
if len(curves) > 1:
    bpy.ops.object.join()
icon = bpy.context.view_layer.objects.active
icon.name = os.path.splitext(os.path.basename(a.svg))[0]
icon.scale = (1 / span,) * 3
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
icon.location = (0, 0, 0)
bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
icon.rotation_euler = (math.radians(90), 0, math.radians(a.turn))  # stand up (SVG lies in XY), quarter turn

mat = bpy.data.materials.new(f"icon_{a.material}")
mat.use_nodes = True
b = mat.node_tree.nodes["Principled BSDF"]
col = lin(a.color)
if a.material == "glass":
    b.inputs["Base Color"].default_value = col
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.12
    b.inputs["IOR"].default_value = 1.45
elif a.material == "metal":
    b.inputs["Base Color"].default_value = col
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.28
elif a.material == "clay":
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = 0.65
else:  # ceramic: glazed, glossy coat over a saturated body
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = 0.32
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.05
icon.data.materials.clear()  # drop the importer's flat SVG fills
icon.data.materials.append(mat)

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = a.samples
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = a.size
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
world = bpy.data.worlds.new("w")
sc.world = world
world.use_nodes = True
wn = world.node_tree
if a.hdri and os.path.exists(a.hdri):
    env = wn.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.abspath(a.hdri))
    wn.links.new(env.outputs["Color"], wn.nodes["Background"].inputs["Color"])
    wn.nodes["Background"].inputs["Strength"].default_value = 1.4 if a.material == "metal" else 0.55
else:
    wn.nodes["Background"].inputs["Color"].default_value = (0.8, 0.8, 0.82, 1)
    wn.nodes["Background"].inputs["Strength"].default_value = 0.6
for loc, energy, size in (((-2.2, -2.5, 2.6), 70, 2.2), ((2.6, -1.0, 1.2), 22, 3.0), ((0.5, 2.5, 2.0), 60, 1.5)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    L = bpy.context.object
    L.data.energy, L.data.size = energy, size
    L.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add(location=(0, -4.2, 4.2 * math.tan(math.radians(a.tilt))))
cam = bpy.context.object
cam.data.lens = 85
cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.camera = cam
# Frame: fit the icon's bounds at ~78% of the frame.
bpy.context.view_layer.update()
pts = [icon.matrix_world @ Vector(c) for c in icon.bound_box]
radius = max((p - Vector((0, 0, 0))).length for p in pts)
dist = radius / math.tan(cam.data.angle / 2) / 0.78
cam.location = cam.location.normalized() * dist
sc.render.filepath = os.path.abspath(a.out)
bpy.ops.render.render(write_still=True)
if a.glb:
    bpy.ops.object.select_all(action="DESELECT")
    icon.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.glb), export_format="GLB", use_selection=True)
print(f"ICON3D {a.svg} → {a.out} ({len(icon.data.polygons)} faces, {a.material})")
