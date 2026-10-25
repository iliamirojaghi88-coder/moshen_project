"""Extruded, bevelled Persian numerals (Vazirmatn Black) for the 3D type.

blender -b --factory-startup -P build/numerals.py -- <font.ttf> <out.glb>
"""
import sys
import bpy

font_path, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
font = bpy.data.fonts.load(font_path)
GLYPHS = {"n8": "۸", "n1": "۱", "n2": "۲", "n3": "۳", "qmark": "؟"}
for name, ch in GLYPHS.items():
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = ch
    cu.font = font
    cu.size = 1.0
    cu.extrude = 0.11
    cu.bevel_depth = 0.022
    cu.bevel_resolution = 5
    cu.resolution_u = 24
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
    ob.rotation_euler = (1.5707963, 0, 0)  # stand the glyph up (faces -Y in Blender = +Z in glTF)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth_by_angle(angle=0.55)
    d = ob.dimensions
    print("GLYPH", name, round(d.x, 3), round(d.y, 3), round(d.z, 3), len(ob.data.vertices))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_normals=True, export_materials="NONE", export_apply=True)
print("WROTE", out)
