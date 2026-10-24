"""Convert a Microsoft Rocketbox avatar (MIT) to an animation-ready GLB.

blender -b --factory-startup -P tools/3d/rocketbox_to_glb.py -- <avatar_dir> <out.glb> [--keep-facs]

<avatar_dir> is a Rocketbox avatar folder (Export/*_facial.fbx + Textures/*.tga).
Keeps: the full Biped skeleton (80 bones, five-finger hands), the 52 ARKit
blendshapes renamed to standard ARKit names (eyeBlinkLeft, jawOpen, …) and
the 15 visemes (viseme_PP …); drops the FACS/Vive duplicates unless
--keep-facs. Materials become glTF-safe Principled BSDF: colour + normal,
roughness derived from the specular map, alpha-clipped hair/lashes.
"""
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1 :]
AVATAR, OUT = argv[0], argv[1]
KEEP_FACS = "--keep-facs" in argv
FLIP_GREEN = "--flip-normal-green" in argv
name = os.path.basename(os.path.normpath(AVATAR))
tex_dir = os.path.join(AVATAR, "Textures")

bpy.ops.wm.read_factory_settings(use_empty=True)
fbx = os.path.join(AVATAR, "Export", f"{name}_facial.fbx")
if not os.path.exists(fbx):
    fbx = os.path.join(AVATAR, "Export", f"{name}.fbx")
bpy.ops.import_scene.fbx(filepath=fbx, use_anim=False)

mesh = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.polygons))
for o in list(bpy.data.objects):  # lower LODs, if the export carried any
    if o.type == "MESH" and o is not mesh:
        bpy.data.objects.remove(o)


def arkit_name(k):
    # AK_09_EyeBlinkLeft → eyeBlinkLeft ; AA_VI_01_PP → viseme_PP
    parts = k.split("_")
    if k.startswith("AK_"):
        n = "_".join(parts[2:])
        return n[0].lower() + n[1:]
    if k.startswith("AA_VI_"):
        return "viseme_" + "_".join(parts[3:])
    return None


keys = mesh.data.shape_keys.key_blocks if mesh.data.shape_keys else []
dropped = 0
for kb in list(keys)[1:]:
    new = arkit_name(kb.name)
    if new:
        kb.name = new
    elif not KEEP_FACS:
        mesh.shape_key_remove(kb)
        dropped += 1


def load(fname, non_color=False):
    path = os.path.join(tex_dir, fname)
    if not os.path.exists(path):
        return None
    img = bpy.data.images.load(path)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def roughness_from_specular(spec_img, label):
    w, h = spec_img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    spec_img.pixels.foreach_get(px)
    s = px.reshape(-1, 4)[:, :3].mean(axis=1)
    r = np.clip(0.92 - 0.75 * s, 0.25, 0.95)
    out = bpy.data.images.new(f"{label}_roughness", w, h, alpha=False, float_buffer=False)
    out.colorspace_settings.name = "Non-Color"
    arr = np.ones((w * h, 4), dtype=np.float32)
    arr[:, 0] = arr[:, 1] = arr[:, 2] = r
    out.pixels.foreach_set(arr.ravel())
    out.pack()
    return out


def build(mat, part):
    prefix = next((f.split("_")[0] for f in os.listdir(tex_dir) if f.endswith(".tga")), "")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    col = load(f"{prefix}_{part}_color.tga")
    if col:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = col
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        if part == "opacity":
            nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"  # → glTF alphaMode MASK
            mat.use_backface_culling = False
    nrm = load(f"{prefix}_{part}_normal.tga", True)
    if nrm and FLIP_GREEN:
        w, h = nrm.size
        px = np.empty(w * h * 4, dtype=np.float32)
        nrm.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        px[:, 1] = 1.0 - px[:, 1]
        flipped = bpy.data.images.new(f"{prefix}_{part}_normal_gl", w, h, alpha=False)
        flipped.colorspace_settings.name = "Non-Color"
        flipped.pixels.foreach_set(px.ravel())
        flipped.pack()
        nrm = flipped
    if nrm:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = nrm
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    spec = load(f"{prefix}_{part}_specular.tga", True)
    if spec:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = roughness_from_specular(spec, f"{prefix}_{part}")
        nt.links.new(t.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Specular IOR Level"].default_value = 0.35


for mat in mesh.data.materials:
    part = "opacity" if mat.name.endswith("opacity") else "head" if mat.name.endswith("head") else "body"
    build(mat, part)

arm = mesh.parent
if arm:
    arm.name = "RB_Armature"  # distinct from the root bone "Bip01" so clip tracks bind to bones
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
if arm:
    arm.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(OUT), export_format="GLB", use_selection=True,
    export_skins=True, export_morph=True, export_morph_normal=False, export_animations=False,
    export_image_format="JPEG", export_jpeg_quality=90,
)
kept = [k.name for k in mesh.data.shape_keys.key_blocks[1:]] if mesh.data.shape_keys else []
print(f"ROCKETBOX {name}: polys={len(mesh.data.polygons)} bones={len(arm.data.bones) if arm else 0} "
      f"shapekeys={len(kept)} (arkit={sum(1 for k in kept if not k.startswith('viseme_') and k[0].islower())}, "
      f"visemes={sum(1 for k in kept if k.startswith('viseme_'))}, dropped={dropped})")
