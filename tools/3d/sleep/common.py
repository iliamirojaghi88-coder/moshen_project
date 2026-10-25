"""Shared helpers for the sleep-explainer Blender samples (Cycles, CPU)."""
import math
import sys

import bpy
from mathutils import Vector


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"out": "/tmp/sample", "mode": "still", "w": 1080, "h": 1920, "samples": 96, "frames": "1-1", "frame": 1}
    for kv in a:
        k, v = kv.split("=", 1)
        out[k] = v
    for k in ("w", "h", "samples", "frame"):
        out[k] = int(out[k])
    return out


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.render.fps = 30
    sc.render.film_transparent = False
    return sc


def world_hdri(path, strength=1.0, rot=0.0, bg_strength=None, bg_color=None):
    w = bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(path)
    mp = nt.nodes.new("ShaderNodeMapping")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp.inputs["Rotation"].default_value[2] = rot
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    if bg_color is None:
        nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    else:
        # lighting from the HDRI, camera sees a flat colour
        lp = nt.nodes.new("ShaderNodeLightPath")
        bg2 = nt.nodes.new("ShaderNodeBackground")
        bg2.inputs["Color"].default_value = bg_color
        bg2.inputs["Strength"].default_value = bg_strength if bg_strength is not None else 1.0
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
        nt.links.new(bg.outputs["Background"], mix.inputs[1])
        nt.links.new(bg2.outputs["Background"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return w


def area(name, loc, target, energy, size, color=(1, 1, 1), shape="RECTANGLE", size_y=None):
    l = bpy.data.lights.new(name, "AREA")
    l.energy = energy
    l.shape = shape
    l.size = size
    if size_y:
        l.size_y = size_y
    l.color = color
    o = bpy.data.objects.new(name, l)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    look(o, target)
    return o


def look(o, target):
    d = Vector(target) - Vector(o.location)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def camera(loc, target, lens=50, fstop=None, focus=None):
    c = bpy.data.cameras.new("cam")
    c.lens = lens
    c.sensor_width = 36
    c.sensor_fit = "VERTICAL"
    c.sensor_height = 36
    o = bpy.data.objects.new("cam", c)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.scene.camera = o
    o.location = loc
    look(o, target)
    if fstop:
        c.dof.use_dof = True
        c.dof.aperture_fstop = fstop
        c.dof.focus_distance = focus if focus else (Vector(target) - Vector(loc)).length
    return o


def key(obj, path, frame, value, index=-1):
    p = obj.path_resolve(path) if "." in path else None
    if index >= 0:
        getattr(obj, path)[index] = value
        obj.keyframe_insert(path, index=index, frame=frame)
    else:
        setattr(obj, path, value)
        obj.keyframe_insert(path, frame=frame)


def ease_all(ease="BEZIER"):
    for a in bpy.data.actions:
        for fc in getattr(a, "fcurves", []):
            for k in fc.keyframe_points:
                k.interpolation = ease


def render(a):
    sc = bpy.context.scene
    sc.render.resolution_x = a["w"]
    sc.render.resolution_y = a["h"]
    sc.render.resolution_percentage = 100
    sc.cycles.samples = a["samples"]
    if hasattr(sc.render.image_settings, "media_type"):
        sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    if a["mode"] == "still":
        sc.frame_set(a["frame"])
        sc.render.filepath = a["out"] + ".png"
        bpy.ops.render.render(write_still=True)
    else:
        s, e = (int(x) for x in a["frames"].split("-"))
        sc.frame_start, sc.frame_end = s, e
        sc.render.filepath = a["out"] + "_####"
        bpy.ops.render.render(animation=True)


def pbr_from_glb(glb, name):
    """Import a Poly Haven texture-sample GLB and return its material."""
    before = set(bpy.data.materials)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [m for m in bpy.data.materials if m not in before]
    for o in list(bpy.context.selected_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    m = new[0]
    m.name = name
    return m


def box_mapping(mat, scale):
    """Swap UV for object-space box projection on every image node (tiling in metres)."""
    nt = mat.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    for n in nt.nodes:
        if n.type == "TEX_IMAGE":
            n.projection = "BOX"
            n.projection_blend = 0.2
            nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
    return mat
