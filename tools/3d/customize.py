"""Adapt an existing GLB to a scenario: materials, colour, finish, size, texture.

blender -b --factory-startup -P tools/3d/customize.py -- in.glb out.glb recipe.json

recipe.json (every key optional):
{
  "height_m": 0.42,                    # uniform scale to a real-world height (or "width_m" / "depth_m")
  "materials": {                       # match by material name (substring, case-insensitive) or "*"
    "body": {"color": "#1f35aa", "tint": 0.85, "roughness": 0.35, "metallic": 0.0},
    "screen": {"emission": "#9fd8ff", "emission_strength": 2.5},
    "*": {"roughness_scale": 0.8}
  },
  "texture": {"material": "fabric", "basecolor": "path/to/color.jpg", "normal": "path/to/normal.jpg", "scale": 2.0},
  "decimate": 0.5,                     # keep this ratio of faces (heavy scans)
  "center": true,                      # origin to bottom-centre, sits on y=0
  "rename": "brand_mug"
}
tint blends the chosen colour over the existing texture (0 = keep texture,
1 = flat colour) so photoscanned detail survives a recolour.
"""
import json
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
src, dst, recipe_path = argv[0], argv[1], argv[2]
recipe = json.load(open(recipe_path))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]


def hex_rgba(h):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def bsdf_of(mat):
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat.use_nodes else None


def apply_material(mat, spec):
    b = bsdf_of(mat)
    if b is None:
        return
    nt = mat.node_tree
    if "color" in spec:
        rgba = hex_rgba(spec["color"])
        tint = float(spec.get("tint", 1.0))
        base_in = b.inputs["Base Color"]
        if base_in.is_linked and tint < 1.0:
            src_socket = base_in.links[0].from_socket
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = tint
            mix.inputs["B"].default_value = rgba
            nt.links.new(src_socket, mix.inputs["A"])
            nt.links.new(mix.outputs["Result"], base_in)
        else:
            for l in list(base_in.links):
                nt.links.remove(l)
            base_in.default_value = rgba
    for key, sock in (("roughness", "Roughness"), ("metallic", "Metallic")):
        if key in spec:
            for l in list(b.inputs[sock].links):
                nt.links.remove(l)
            b.inputs[sock].default_value = float(spec[key])
    if "roughness_scale" in spec and not b.inputs["Roughness"].is_linked:
        b.inputs["Roughness"].default_value *= float(spec["roughness_scale"])
    if "emission" in spec:
        b.inputs["Emission Color"].default_value = hex_rgba(spec["emission"])
        b.inputs["Emission Strength"].default_value = float(spec.get("emission_strength", 1.0))


for pattern, spec in recipe.get("materials", {}).items():
    for mat in bpy.data.materials:
        if pattern == "*" or pattern.lower() in mat.name.lower():
            apply_material(mat, spec)

if "texture" in recipe:
    t = recipe["texture"]
    for mat in bpy.data.materials:
        if t.get("material", "*") != "*" and t["material"].lower() not in mat.name.lower():
            continue
        b = bsdf_of(mat)
        if not b:
            continue
        nt = mat.node_tree
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (t.get("scale", 1.0),) * 3
        coord = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
        if t.get("basecolor"):
            img = nt.nodes.new("ShaderNodeTexImage")
            img.image = bpy.data.images.load(t["basecolor"])
            nt.links.new(mapping.outputs["Vector"], img.inputs["Vector"])
            nt.links.new(img.outputs["Color"], b.inputs["Base Color"])
        if t.get("normal"):
            img = nt.nodes.new("ShaderNodeTexImage")
            img.image = bpy.data.images.load(t["normal"])
            img.image.colorspace_settings.name = "Non-Color"
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(mapping.outputs["Vector"], img.inputs["Vector"])
            nt.links.new(img.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])

if recipe.get("decimate"):
    for o in meshes:
        if o.data.shape_keys:
            continue  # decimation would destroy morph targets
        m = o.modifiers.new("dec", "DECIMATE")
        m.ratio = float(recipe["decimate"])
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)

roots = [o for o in bpy.data.objects if o.parent is None]
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
size = hi - lo  # Blender: Z up (glTF Y up)
factor = 1.0
for key, axis in (("height_m", 2), ("width_m", 0), ("depth_m", 1)):
    if key in recipe and size[axis] > 0:
        factor = float(recipe[key]) / size[axis]
for r in roots:
    r.scale = r.scale * factor
    r.location = r.location * factor
if recipe.get("center", True):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    z0 = min(p.z for p in pts)
    for r in roots:
        r.location -= Vector((cx, cy, z0))
if recipe.get("rename"):
    for r in roots:
        r.name = recipe["rename"]

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="AUTO")
print(f"CUSTOMIZED {src} → {dst} (scale ×{factor:.3f})")
