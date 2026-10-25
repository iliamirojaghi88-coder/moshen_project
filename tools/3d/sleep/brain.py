"""Sample 1 — anatomical brain (BodyParts3D, CC-BY) waking up from sleep inertia.

blender -b -P tools/3d/sleep/brain.py -- out=<path> mode=still|anim w=1080 h=1920 samples=96 frames=1-120
Narrative over 120 frames (4 s): dim, cold, out of focus and drifting slowly (groggy) →
an activation wave travels front-to-back through the gyri, the light warms, focus
racks in — alert.
"""
import glob
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import area, args, camera, render, reset, world_hdri  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
A = args()
sc = reset()
sc.frame_start, sc.frame_end = 1, 120

# --- geometry: 51 element meshes of both hemispheres, cerebellum, brainstem
parts = sorted(glob.glob(os.path.join(ROOT, "library/.cache/bodyparts3d/raw/*.obj")))
for p in parts:
    bpy.ops.wm.obj_import(filepath=p, forward_axis="Y", up_axis="Z")
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
brain = bpy.context.view_layer.objects.active
brain.name = "brain"
brain.scale = (0.001, 0.001, 0.001)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
brain.location = (0, 0, 0)
bpy.ops.object.shade_smooth()
dims = brain.dimensions.copy()
print("BRAIN dims (m)", tuple(dims), "verts", len(brain.data.vertices), flush=True)
# a little extra smoothing keeps the scan facets out of the highlights
sub = brain.modifiers.new("sub", "SUBSURF")
sub.levels = int(A.get("sub", 0))
sub.render_levels = int(A.get("sub", 0))

# --- material: wet neural tissue + activation emission
m = bpy.data.materials.new("brain_tissue")
m.use_nodes = True
nt = m.node_tree
b = nt.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.74, 0.55, 0.55, 1)
b.inputs["Roughness"].default_value = 0.38
b.inputs["Subsurface Weight"].default_value = 0.35
b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.25)
b.inputs["Subsurface Scale"].default_value = 0.004
b.inputs["Coat Weight"].default_value = 0.25
b.inputs["Coat Roughness"].default_value = 0.15
tc = nt.nodes.new("ShaderNodeTexCoord")
# subtle tissue colour variation + micro bump
noise = nt.nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 160
noise.inputs["Detail"].default_value = 8
nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.62, 0.42, 0.44, 1)
ramp.color_ramp.elements[1].color = (0.86, 0.68, 0.66, 1)
nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.15
bump.inputs["Distance"].default_value = 0.0004
nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
# activation: a front→back wave (object Y) gating fine "pathway" veins (voronoi edges)
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
wave = nt.nodes.new("ShaderNodeValue")  # animated 0..1
wave.name = "wake"
mapr = nt.nodes.new("ShaderNodeMapRange")  # y from +front to -back → 0..1
half = dims.y / 2
mapr.inputs["From Min"].default_value = half
mapr.inputs["From Max"].default_value = -half
nt.links.new(sep.outputs["Y"], mapr.inputs["Value"])
sub_ = nt.nodes.new("ShaderNodeMath")
sub_.operation = "SUBTRACT"
nt.links.new(wave.outputs["Value"], sub_.inputs[0])
nt.links.new(mapr.outputs["Result"], sub_.inputs[1])
gate = nt.nodes.new("ShaderNodeMapRange")
gate.inputs["From Min"].default_value = -0.05
gate.inputs["From Max"].default_value = 0.15
nt.links.new(sub_.outputs["Value"], gate.inputs["Value"])
vor = nt.nodes.new("ShaderNodeTexVoronoi")
vor.feature = "DISTANCE_TO_EDGE"
vor.inputs["Scale"].default_value = 55
nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
edge = nt.nodes.new("ShaderNodeMapRange")
edge.inputs["From Min"].default_value = 0.0
edge.inputs["From Max"].default_value = 0.06
edge.inputs["To Min"].default_value = 1.0
edge.inputs["To Max"].default_value = 0.0
nt.links.new(vor.outputs["Distance"], edge.inputs["Value"])
mul = nt.nodes.new("ShaderNodeMath")
mul.operation = "MULTIPLY"
nt.links.new(edge.outputs["Result"], mul.inputs[0])
nt.links.new(gate.outputs["Result"], mul.inputs[1])
mul2 = nt.nodes.new("ShaderNodeMath")
mul2.operation = "MULTIPLY"
mul2.inputs[1].default_value = 6.0
nt.links.new(mul.outputs["Value"], mul2.inputs[0])
b.inputs["Emission Color"].default_value = (0.35, 0.8, 1.0, 1)
nt.links.new(mul2.outputs["Value"], b.inputs["Emission Strength"])
brain.data.materials.clear()
brain.data.materials.append(m)

# --- world + lights: dark studio, cool rim, soft key
world_hdri(os.path.join(ROOT, "library/.cache/hdri/studio_small_09_2k.hdr"), strength=0.35, bg_color=(0.006, 0.009, 0.02, 1), bg_strength=1.0)
key = area("key", (0.25, -0.35, 0.22), (0, 0, 0), 22, 0.35, (1.0, 0.93, 0.86))
rim = area("rim", (-0.3, 0.3, 0.18), (0, 0, 0), 35, 0.25, (0.45, 0.7, 1.0))
fill = area("fill", (-0.35, -0.25, -0.05), (0, 0, 0), 5, 0.4, (0.6, 0.7, 1.0))
# subtle dark ground for contact
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, -dims.z / 2 - 0.02))
ground = bpy.context.active_object
gm = bpy.data.materials.new("ground")
gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.01, 0.012, 0.02, 1)
gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.25
ground.data.materials.append(gm)

# --- animation (frames 1..120)
brain.rotation_euler = (0, 0, math.radians(-38))
brain.keyframe_insert("rotation_euler", frame=1)
brain.rotation_euler = (0, 0, math.radians(-18))
brain.keyframe_insert("rotation_euler", frame=120)
wave.outputs[0].default_value = -0.2
wave.outputs[0].keyframe_insert("default_value", frame=1)
wave.outputs[0].default_value = -0.12
wave.outputs[0].keyframe_insert("default_value", frame=45)  # groggy: barely moving
wave.outputs[0].default_value = 1.25
wave.outputs[0].keyframe_insert("default_value", frame=112)
for l, a0, a1 in ((key, 8, 26), (rim, 12, 45)):
    l.data.energy = a0
    l.data.keyframe_insert("energy", frame=1)
    l.data.keyframe_insert("energy", frame=45)
    l.data.energy = a1
    l.data.keyframe_insert("energy", frame=110)
cam = camera((0.05, -0.55, 0.08), (0, 0, 0.005), lens=70, fstop=1.4)
cam.data.dof.focus_distance = 0.42  # starts soft (sleepy)
cam.data.keyframe_insert("dof.focus_distance", frame=1)
cam.data.keyframe_insert("dof.focus_distance", frame=40)
cam.data.dof.focus_distance = (Vector(cam.location) - Vector((0, -0.07, 0))).length
cam.data.keyframe_insert("dof.focus_distance", frame=95)
cam.keyframe_insert("location", frame=1)
cam.location = (0.02, -0.4, 0.06)
cam.keyframe_insert("location", frame=120)
print("BRAIN READY", flush=True)
if A["mode"] != "none":
    render(A)
