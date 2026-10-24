"""Convert Rocketbox Biped animation FBX files (MIT) to skeleton-only GLB clips.

blender -b --factory-startup -P tools/3d/rocketbox_anim_to_glb.py -- <out_dir> <anim.fbx> [<anim.fbx> ...]

Every Rocketbox avatar shares the same Bip01 skeleton, so one clip drives any
avatar: in three.js load the clip GLB, take gltf.animations[0] and play it
through an AnimationMixer on the character (bone names match).
The clip is named after the file (m_walk_neutral_01.max.fbx → m_walk_neutral_01).
"""
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
out_dir, files = argv[0], argv[1:]
os.makedirs(out_dir, exist_ok=True)

for path in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True, ignore_leaf_bones=False)
    clip = os.path.basename(path).split(".")[0].replace(" ", "_")
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            bpy.data.objects.remove(o)
    action = arm.animation_data.action if arm.animation_data else None
    if action is None:
        print(f"SKIP {clip}: no action")
        continue
    action.name = clip
    # Keep bone channels only: object-level tracks (the armature node's own
    # scale/location) would override the character's unit scale in three.js.
    bags = [action] if hasattr(action, "fcurves") else [
        cb for layer in action.layers for strip in layer.strips for cb in strip.channelbags
    ]
    for bag in bags:
        for fc in list(bag.fcurves):
            if not fc.data_path.startswith("pose.bones"):
                bag.fcurves.remove(fc)
    arm.name = "RB_Armature"
    start, end = action.frame_range
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = int(start), int(end)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    out = os.path.join(out_dir, f"{clip}.glb")
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="ACTIONS", export_skins=True, export_morph=False,
        export_force_sampling=True, export_optimize_animation_size=True,
    )
    fps = bpy.context.scene.render.fps
    print(f"CLIP {clip}: {int(end - start)} frames @ {fps} fps → {out}")
