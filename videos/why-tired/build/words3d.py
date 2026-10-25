"""Extruded, bevelled Persian words (pre-shaped) for the 3D type moments.

blender -b --factory-startup -P build/words3d.py -- <font.ttf> <out.glb>
"""
import sys, os
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from fa_shape import shape

font_path, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
font = bpy.data.fonts.load(font_path)
WORDS = {"w_inertia": "اینرسی", "w_sleep": "خواب", "w_why": "چرا؟"}
for name, word in WORDS.items():
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = shape(word)
    cu.font = font
    cu.size = 1.0
    cu.extrude = 0.06
    cu.bevel_depth = 0.014
    cu.bevel_resolution = 4
    cu.resolution_u = 20
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    ob.location = (0, 0, 0)
    ob.rotation_euler = (1.5707963, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth_by_angle(angle=0.55)
    d = ob.dimensions
    print("WORD", name, round(d.x, 3), round(d.y, 3), round(d.z, 3), len(ob.data.vertices))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_normals=True, export_materials="NONE", export_apply=True)
