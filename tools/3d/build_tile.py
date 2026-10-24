"""Build a physically scaled ceramic tile in Blender from real reference maps.

Run headless:
  blender -b --factory-startup -P tools/3d/build_tile.py -- \
      --maps library/products/met-447244-tile/textures \
      --body library/ambientcg/Plaster001 \
      --size-mm 222x218x22 --bevel-mm 1.8 \
      --glb library/products/met-447244-tile/tile.glb \
      [--hdri library/polyhaven/studio_small_09/studio_small_09_2k.hdr --still out.png --samples 96]

Geometry: rounded-edge slab (real W×H×D), top face UV-mapped 1:1 to the
rectified photo; sides + back use the bisque/stonepaste body material.
"""
import argparse
import glob
import math
import os
import sys

import bpy
import bmesh


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--maps", required=True)
    ap.add_argument("--body", required=True)
    ap.add_argument("--size-mm", required=True)
    ap.add_argument("--bevel-mm", type=float, default=1.5)
    ap.add_argument("--glb", required=True)
    ap.add_argument("--blend")
    ap.add_argument("--hdri")
    ap.add_argument("--still")
    ap.add_argument("--samples", type=int, default=96)
    ap.add_argument("--res", default="1080x1350")
    return ap.parse_args(argv)


def img(path, non_color=False):
    im = bpy.data.images.load(os.path.abspath(path))
    if non_color:
        im.colorspace_settings.name = "Non-Color"
    return im


def tex_node(nt, image, loc):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = image
    n.location = loc
    return n


def glaze_material(maps):
    m = bpy.data.materials.new("Glaze")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    base = tex_node(nt, img(f"{maps}/basecolor.png"), (-600, 300))
    rough = tex_node(nt, img(f"{maps}/roughness.png", True), (-600, 0))
    nrm = tex_node(nt, img(f"{maps}/normal.png", True), (-600, -300))
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.location = (-300, -300)
    nmap.inputs["Strength"].default_value = 0.6
    nt.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    # Fired glaze: glassy clear coat over the coloured layer.
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.06
    bsdf.inputs["IOR"].default_value = 1.52
    return m


def body_material(body):
    m = bpy.data.materials.new("Stonepaste")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    pick = lambda pat: (glob.glob(f"{body}/*{pat}*") or [None])[0]
    col = tex_node(nt, img(pick("_Color")), (-600, 300))
    rough = tex_node(nt, img(pick("_Roughness"), True), (-600, 0))
    nrm = tex_node(nt, img(pick("_NormalGL"), True), (-600, -300))
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.location = (-300, -300)
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    # Warm the grey plaster scan toward fired stonepaste bisque (sampled from
    # the tile's exposed edge in the museum photo, ≈ #d6cbb4).
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.location = (-300, 300)
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (0.84, 0.77, 0.64, 1.0)
    nt.links.new(col.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    return m


def build_mesh(w, h, d, bevel):
    me = bpy.data.meshes.new("Tile")
    obj = bpy.data.objects.new("Tile", me)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, d / 2), verts=bm.verts)  # sits on z=0
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=4, profile=0.5, affect="EDGES")
    uv = bm.loops.layers.uv.new("UVMap")
    top_z = d - 1e-6
    for f in bm.faces:
        is_top = f.normal.z > 0.5 and all(v.co.z >= top_z - bevel for v in f.verts)
        f.material_index = 0 if is_top else 1
        f.smooth = not (abs(f.normal.z) > 0.999 or abs(f.normal.x) > 0.999 or abs(f.normal.y) > 0.999)
        for loop in f.loops:
            x, y, z = loop.vert.co
            if is_top:
                loop[uv].uv = (x / w + 0.5, y / h + 0.5)
            else:  # box-ish projection in metres → body texture tiles every 20 cm
                n = f.normal
                if abs(n.z) > 0.5:
                    loop[uv].uv = (x / 0.2, y / 0.2)
                elif abs(n.x) > abs(n.y):
                    loop[uv].uv = (y / 0.2, z / 0.2)
                else:
                    loop[uv].uv = (x / 0.2, z / 0.2)
    bm.to_mesh(me)
    bm.free()
    return obj


def studio(hdri, still, samples, res):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    rw, rh = (int(v) for v in res.split("x"))
    sc.render.resolution_x, sc.render.resolution_y = rw, rh
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Punchy"
    world = bpy.data.worlds.new("Studio")
    sc.world = world
    world.use_nodes = True
    wn = world.node_tree
    env = wn.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.abspath(hdri))
    wn.links.new(env.outputs["Color"], wn.nodes["Background"].inputs["Color"])
    wn.nodes["Background"].inputs["Strength"].default_value = 0.45
    # Seamless warm-grey sweep so the shot reads as product photography.
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    floor = bpy.context.object
    fm = bpy.data.materials.new("Sweep")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.15, 0.14, 1)
    fm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    floor.data.materials.append(fm)
    # Key light: large soft area from top-left, like the reference product shots.
    bpy.ops.object.light_add(type="AREA", location=(-0.45, -0.35, 0.55))
    key = bpy.context.object
    key.data.energy = 28
    key.data.size = 0.5
    key.rotation_euler = (math.radians(50), 0, math.radians(-50))
    bpy.ops.object.camera_add(location=(0.30, -0.42, 0.30))
    cam = bpy.context.object
    cam.data.lens = 70
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 0.56
    cam.data.dof.aperture_fstop = 5.6
    target = bpy.data.objects.new("Target", None)
    target.location = (0, 0, 0.011)
    bpy.context.collection.objects.link(target)
    con = cam.constraints.new("TRACK_TO")
    con.target = target
    sc.camera = cam
    sc.render.filepath = os.path.abspath(still)
    bpy.ops.render.render(write_still=True)


def main():
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    w, h, d = (float(v) / 1000 for v in a.size_mm.lower().split("x"))
    obj = build_mesh(w, h, d, a.bevel_mm / 1000)
    obj.data.materials.append(glaze_material(a.maps))
    obj.data.materials.append(body_material(a.body))
    os.makedirs(os.path.dirname(os.path.abspath(a.glb)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.glb), export_format="GLB", use_selection=True, export_image_format="AUTO")
    print(f"GLB → {a.glb}  ({len(obj.data.polygons)} faces, {w*1000:.0f}×{h*1000:.0f}×{d*1000:.0f} mm)")
    if a.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.blend))
    if a.hdri and a.still:
        studio(a.hdri, a.still, a.samples, a.res)
        print(f"still → {a.still}")


main()
