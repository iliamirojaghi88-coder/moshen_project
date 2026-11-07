"""Metrica hero — photoreal city background (background only: no building, crane, platform or UI).

Procedural city in Blender/Cycles, lit by a real CC0 sky (Poly Haven kloofendal_38d_partly_cloudy_puresky):
8K panorama for what the camera and glass see, 1K unclipped HDR for ambient light, a sun lamp at the HDR's
sun position and intensity. Camera and landmark towers are placed from the reference frame (941x1672).

  blender -b -P city.py -- --out DIR [--res 540x960] [--samples 24] [--layers] [--seed 7]

Writes DIR/beauty.png (16-bit, AgX). With --layers also DIR/layer_<name>.png (RGBA) for the depth demo.
"""
import argparse, math, os, random, sys, time
import bpy, bmesh
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HDRI = os.path.join(REPO, "library", ".cache", "hdri")
SKY_8K = os.path.join(HDRI, "kloofendal_38d_partly_cloudy_puresky_8k.png")
SKY_HDR = os.path.join(HDRI, "kloofendal_38d_partly_cloudy_puresky_1k.exr")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--res", default="540x960")
ap.add_argument("--samples", type=int, default=24)
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--layers", action="store_true")
ap.add_argument("--overscan", type=float, default=1.0, help="frame scale for parallax margin (1.1 = 10%% larger)")
ap.add_argument("--blend", default="", help="also save the .blend here")
A = ap.parse_args(argv)
RES = tuple(int(v) for v in A.res.split("x"))

# ---------------------------------------------------------------- camera / frame mapping
REF_W, REF_H = 941, 1672           # reference image size (frame coords below are in its pixels)
CAM_H = 100.0                      # camera height (m)
VFOV = math.radians(50.0)
SHIFT_Y = -0.11                    # lens shift: horizon at 39% from top, verticals stay vertical
TAN_V = math.tan(VFOV / 2)
TAN_H = TAN_V * REF_W / REF_H
WEDGE = TAN_H * 1.25               # build a bit outside the frame (reflections, parallax margin)

def frame_x(px, depth):
    return (px / REF_W - 0.5) * 2 * TAN_H * depth

def frame_z(py, depth):
    return CAM_H + ((0.5 - py / REF_H) * 2 * TAN_V + SHIFT_Y * 2 * TAN_V) * depth

def frame_w(wpx, depth):
    return wpx / REF_W * 2 * TAN_H * depth

def in_view(x, y, margin=60.0):
    return y > 40 and abs(x) < WEDGE * y + margin

# ---------------------------------------------------------------- sky (measured from the HDR, see README)
SUN_U, SUN_ELEV = 0.6001, math.radians(37.8)   # brightest texel of the 1K EXR
SUN_IRR = 2.4                                    # integrated sun irradiance of the EXR (W/m^2, Blender units)
SUN_AZ_FROM_VIEW = math.radians(110.0)           # sun to the left: blue cloud band in frame, lit left faces
HDR_CLAMP = 20.0                                 # remove the sun from the HDR; the lamp replaces it
PNG_GAIN = 0.95                                  # 8K PNG is a plain sRGB encode of the HDR (ratio ~0.95-1.1)

# equirect u -> azimuth atan2(y, x) = (0.5 - u) * 2pi  (Cycles convention)
_sun_tex_az = (0.5 - SUN_U) * 2 * math.pi
_want_az = math.pi / 2 + SUN_AZ_FROM_VIEW          # +Y rotated toward -X
WORLD_ROT_Z = -(_want_az - _sun_tex_az)            # mapping rotates the lookup vector
SUN_DIR = Vector((math.cos(_want_az) * math.cos(SUN_ELEV), math.sin(_want_az) * math.cos(SUN_ELEV), math.sin(SUN_ELEV)))

# haze (aerial perspective), applied inside every material from the camera ray length
HAZE_DENS = 1.9e-4                 # 1/m at ground level
HAZE_HS = 650.0                    # scale height (m)
HAZE_TINT = (0.86, 0.95, 1.10)     # light-blue haze like the reference

rng = random.Random(A.seed)

# ================================================================= scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = A.samples
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.015
scene.cycles.use_denoising = True
try:
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception:
    pass
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 3
scene.cycles.transmission_bounces = 2
scene.cycles.transparent_max_bounces = 4
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.blur_glossy = 1.0
scene.cycles.sample_clamp_indirect = 8.0
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
# linear scene-referred EXR; tonemap + grade happen in post.py (fast look iteration without re-rendering)
scene.render.image_settings.file_format = "OPEN_EXR"
scene.render.image_settings.color_depth = "16"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.exr_codec = "DWAA"
scene.view_settings.view_transform = "Standard"

# ---------------------------------------------------------------- node helpers
class NB:
    def __init__(self, nt):
        self.nt = nt

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        else:
            if sock.type == "RGBA" and isinstance(v, (tuple, list)) and len(v) == 3:
                v = (*v, 1.0)
            sock.default_value = v

    def node(self, t, inputs=None, **kw):
        n = self.nt.nodes.new(t)
        for k, v in kw.items():
            setattr(n, k, v)
        for k, v in (inputs or {}).items():
            self.set(n.inputs[k], v)
        return n

    def m(self, op, a, b=None, c=None, clamp=False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(n.inputs[i], v)
        return n.outputs[0]

    def vm(self, op, a, b=None, scale=None):
        n = self.node("ShaderNodeVectorMath", operation=op)
        if a is not None:
            self.set(n.inputs[0], a)
        if b is not None:
            self.set(n.inputs[1], b)
        if scale is not None:
            self.set(n.inputs[3], scale)
        return n.outputs[1] if op in ("DOT_PRODUCT", "DISTANCE", "LENGTH") else n.outputs[0]

    def mixc(self, fac, a, b):
        n = self.node("ShaderNodeMix", data_type="RGBA")
        self.set(n.inputs[0], fac)
        self.set(n.inputs[6], a)
        self.set(n.inputs[7], b)
        return n.outputs[2]

    def mixs(self, fac, a, b):
        n = self.node("ShaderNodeMixShader")
        self.set(n.inputs[0], fac)
        self.set(n.inputs[1], a)
        self.set(n.inputs[2], b)
        return n.outputs[0]

    def attr(self, name):
        return self.node("ShaderNodeAttribute", attribute_type="OBJECT", attribute_name=name)

    def comb(self, x, y, z):
        return self.node("ShaderNodeCombineXYZ", inputs={"X": x, "Y": y, "Z": z}).outputs[0]

    def sep(self, v):
        return self.node("ShaderNodeSeparateXYZ", inputs={"Vector": v}).outputs

    def white(self, vec):
        n = self.node("ShaderNodeTexWhiteNoise", noise_dimensions="3D", inputs={"Vector": vec})
        return n.outputs["Value"], n.outputs["Color"]

    def noise(self, vec, scale, detail=3.0, rough=0.5):
        n = self.node("ShaderNodeTexNoise", inputs={"Vector": vec, "Scale": scale, "Detail": detail, "Roughness": rough})
        return n.outputs["Fac"], n.outputs["Color"]

    def bsdf(self, **inputs):
        names = {"base": "Base Color", "metal": "Metallic", "rough": "Roughness", "ior": "IOR", "normal": "Normal",
                 "spec": "Specular IOR Level", "coat": "Coat Weight", "sss": "Subsurface Weight",
                 "trans": "Transmission Weight", "coat_rough": "Coat Roughness"}
        return self.node("ShaderNodeBsdfPrincipled", inputs={names[k]: v for k, v in inputs.items()}).outputs[0]

    def step(self, a, edge):        # 1 if a < edge
        return self.m("LESS_THAN", a, edge)


def env_node(nb, path, colorspace, vec):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return nb.node("ShaderNodeTexEnvironment", image=img, interpolation="Linear", inputs={"Vector": vec}).outputs[0]


def rotated_dir(nb, vec):
    return nb.node("ShaderNodeMapping", vector_type="VECTOR", inputs={"Vector": vec, "Rotation": (0, 0, WORLD_ROT_Z)}).outputs[0]


# ---------------------------------------------------------------- world
def build_world():
    w = bpy.data.worlds.new("Sky")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    d = rotated_dir(nb, nb.node("ShaderNodeTexCoord").outputs["Generated"])
    png = env_node(nb, SKY_8K, "sRGB", d)
    hdr = env_node(nb, SKY_HDR, "Linear Rec.709", d)
    hdr_c = nb.vm("MINIMUM", hdr, (HDR_CLAMP,) * 3)
    png_g = nb.vm("SCALE", png, scale=PNG_GAIN)
    # where the 8K PNG is clipped (bright cloud near the sun) fall back to the HDR's real value
    lum = nb.node("ShaderNodeRGBToBW", inputs={"Color": png}).outputs[0]
    clip = nb.node("ShaderNodeMapRange", inputs={"Value": lum, "From Min": 0.93, "From Max": 1.0}).outputs[0]
    sharp = nb.mixc(clip, png_g, hdr_c)
    lp = nb.node("ShaderNodeLightPath")
    cam_or_gloss = nb.m("MAXIMUM", lp.outputs["Is Camera Ray"], lp.outputs["Is Glossy Ray"])
    col = nb.mixc(cam_or_gloss, hdr_c, sharp)
    bg = nb.node("ShaderNodeBackground", inputs={"Color": col, "Strength": 1.0})
    out = nb.node("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs["Surface"])

    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = SUN_IRR
    sun.angle = math.radians(0.9)
    sun.color = (1.0, 0.97, 0.92)
    so = bpy.data.objects.new("Sun", sun)
    so.rotation_euler = SUN_DIR.to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(so)


# ---------------------------------------------------------------- haze group
def build_haze_group():
    g = bpy.data.node_groups.new("Haze", "ShaderNodeTree")
    g.interface.new_socket("Shader", in_out="INPUT", socket_type="NodeSocketShader")
    g.interface.new_socket("Shader", in_out="OUTPUT", socket_type="NodeSocketShader")
    nb = NB(g)
    gi = nb.node("NodeGroupInput")
    go = nb.node("NodeGroupOutput")
    lp = nb.node("ShaderNodeLightPath")
    geo = nb.node("ShaderNodeNewGeometry")
    z = nb.sep(geo.outputs["Position"])[2]
    h = nb.m("EXPONENT", nb.m("DIVIDE", nb.m("MAXIMUM", z, 0.0), -HAZE_HS))
    ht = nb.m("MULTIPLY_ADD", h, 0.5, 0.5 * math.exp(-CAM_H / HAZE_HS))
    tau = nb.m("MULTIPLY", nb.m("MULTIPLY", lp.outputs["Ray Length"], HAZE_DENS), ht)
    fac = nb.m("SUBTRACT", 1.0, nb.m("EXPONENT", nb.m("MULTIPLY", tau, -1.0)))
    # haze colour = horizon sky in this view azimuth (so distant buildings dissolve into the real sky)
    vx, vy, vz = nb.sep(nb.vm("SCALE", geo.outputs["Incoming"], scale=-1.0))
    vz2 = nb.m("MAXIMUM", nb.m("MINIMUM", vz, 0.06), 0.012)
    dirv = rotated_dir(nb, nb.comb(vx, vy, vz2))
    hc = env_node(nb, SKY_HDR, "Linear Rec.709", dirv)
    hc = nb.vm("MULTIPLY", nb.vm("MINIMUM", hc, (HDR_CLAMP,) * 3), HAZE_TINT)
    em = nb.node("ShaderNodeEmission", inputs={"Color": hc, "Strength": 1.0}).outputs[0]
    out = nb.mixs(nb.m("MINIMUM", fac, 0.985), gi.outputs[0], em)
    g.links.new(out, go.inputs[0])
    return g


HAZE = None


def material(name, build):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    sh = build(nb)
    hz = nb.node("ShaderNodeGroup")
    hz.node_tree = HAZE
    nt.links.new(sh, hz.inputs[0])
    out = nb.node("ShaderNodeOutputMaterial")
    nt.links.new(hz.outputs[0], out.inputs["Surface"])
    return mat


# ---------------------------------------------------------------- materials
def cell_fields(nb):
    """UVs are metres: u along the facade perimeter, v = height."""
    uv = nb.node("ShaderNodeTexCoord").outputs["UV"]
    u, v, _ = nb.sep(uv)
    mw = nb.attr("mw").outputs["Fac"]
    fh = nb.attr("fh").outputs["Fac"]
    su = nb.m("DIVIDE", u, mw)
    sv = nb.m("DIVIDE", v, fh)
    cx, cy = nb.m("FLOOR", su), nb.m("FLOOR", sv)
    fx, fy = nb.m("FRACT", su), nb.m("FRACT", sv)
    seed = nb.m("MULTIPLY", nb.node("ShaderNodeObjectInfo").outputs["Random"], 997.0)
    rv, rc = nb.white(nb.comb(cx, cy, seed))
    ex = nb.m("MULTIPLY", nb.m("MINIMUM", fx, nb.m("SUBTRACT", 1.0, fx)), mw)
    ey = nb.m("MULTIPLY", nb.m("MINIMUM", fy, nb.m("SUBTRACT", 1.0, fy)), fh)
    return dict(u=u, v=v, mw=mw, fh=fh, cx=cx, cy=cy, fx=fx, fy=fy, rv=rv, rc=rc, ex=ex, ey=ey, seed=seed)


def wobble_normal(nb, rc, amount):
    n = nb.node("ShaderNodeNewGeometry").outputs["Normal"]
    off = nb.vm("SCALE", nb.vm("SUBTRACT", rc, (0.5, 0.5, 0.5)), scale=amount)
    return nb.vm("NORMALIZE", nb.vm("ADD", n, off))


def interior(nb, f, bright):
    r, g, b = nb.sep(f["rc"])
    base = nb.mixc(f["rv"], (0.010, 0.013, 0.017), (0.055, 0.058, 0.060))
    blind = nb.m("MULTIPLY", nb.m("GREATER_THAN", r, 0.62), nb.m("GREATER_THAN", f["fy"], nb.m("SUBTRACT", 0.95, nb.m("MULTIPLY", g, 0.55))))
    col = nb.mixc(blind, base, (0.30, 0.30, 0.28))
    return nb.vm("SCALE", col, scale=bright)


def mat_curtain(nb):
    f = cell_fields(nb)
    tint = nb.attr("tint").outputs["Color"]
    refl = nb.attr("refl").outputs["Fac"]
    wob = nb.attr("wob").outputs["Fac"]
    sp = nb.attr("sp").outputs["Fac"]
    fin = nb.attr("fin").outputs["Fac"]
    mech = nb.attr("mech").outputs["Fac"]
    frame_c = nb.attr("frame").outputs["Color"]
    inter = nb.attr("inter").outputs["Fac"]
    nrm = wobble_normal(nb, f["rc"], wob)
    inside = interior(nb, f, inter)
    clear = nb.bsdf(base=inside, rough=0.025, ior=1.52, spec=0.6, normal=nrm)
    coat = nb.bsdf(base=tint, metal=1.0, rough=0.03, normal=nrm)
    glass = nb.mixs(refl, clear, coat)
    span = nb.bsdf(base=nb.vm("SCALE", tint, scale=0.32), metal=0.75, rough=0.22, normal=nrm)
    frame = nb.bsdf(base=frame_c, metal=1.0, rough=0.38)
    louver = nb.bsdf(base=(0.10, 0.11, 0.12), metal=0.6, rough=0.45)
    span_m = nb.step(f["fy"], sp)
    mull = nb.step(f["ex"], 0.035)
    tran = nb.step(f["ey"], 0.05)
    # vertical fins every `fin` modules (0 = none)
    fu = nb.m("FRACT", nb.m("DIVIDE", f["u"], nb.m("MULTIPLY", f["mw"], nb.m("MAXIMUM", fin, 1.0))))
    fdist = nb.m("MULTIPLY", nb.m("MINIMUM", fu, nb.m("SUBTRACT", 1.0, fu)), nb.m("MULTIPLY", f["mw"], nb.m("MAXIMUM", fin, 1.0)))
    fin_m = nb.m("MULTIPLY", nb.step(fdist, 0.16), nb.m("GREATER_THAN", fin, 0.5))
    # mechanical floor bands every `mech` floors
    mech_m = nb.m("MULTIPLY", nb.step(nb.m("FLOORED_MODULO", f["cy"], nb.m("MAXIMUM", mech, 1.0)), 0.5), nb.m("GREATER_THAN", mech, 0.5))
    sh = nb.mixs(span_m, glass, span)
    sh = nb.mixs(mech_m, sh, louver)
    sh = nb.mixs(nb.m("MAXIMUM", nb.m("MAXIMUM", mull, tran), fin_m), sh, frame)
    return sh


def mat_punched(nb):
    f = cell_fields(nb)
    wall = nb.attr("wall").outputs["Color"]
    ww = nb.attr("ww").outputs["Fac"]
    wh = nb.attr("wh").outputs["Fac"]
    gf = nb.attr("gf").outputs["Fac"]
    slab = nb.attr("slab").outputs["Fac"]
    inter = nb.attr("inter").outputs["Fac"]
    sill = nb.m("MULTIPLY", nb.m("SUBTRACT", 1.0, wh), 0.45)
    inx = nb.step(nb.m("ABSOLUTE", nb.m("SUBTRACT", f["fx"], 0.5)), nb.m("MULTIPLY", ww, 0.5))
    iny = nb.m("MULTIPLY", nb.m("GREATER_THAN", f["fy"], sill), nb.step(f["fy"], nb.m("ADD", sill, wh)))
    win = nb.m("MULTIPLY", inx, iny)
    # shopfront glazing on the ground floor
    shop = nb.m("MULTIPLY", nb.m("MULTIPLY", nb.step(f["v"], nb.m("SUBTRACT", gf, 0.7)), nb.m("GREATER_THAN", f["v"], 0.4)),
                nb.step(nb.m("ABSOLUTE", nb.m("SUBTRACT", f["fx"], 0.5)), 0.44))
    above_gf = nb.m("GREATER_THAN", f["v"], gf)
    win = nb.m("MAXIMUM", nb.m("MULTIPLY", win, above_gf), shop)
    # weathering: soft vertical rain streaks + large patches
    seedv = f["seed"]
    streak, _ = nb.noise(nb.comb(nb.m("MULTIPLY", f["u"], 0.9), nb.m("MULTIPLY", f["v"], 0.04), seedv), 3.0, 4.0, 0.6)
    patch, _ = nb.noise(nb.comb(nb.m("MULTIPLY", f["u"], 0.05), nb.m("MULTIPLY", f["v"], 0.05), seedv), 2.0, 3.0, 0.5)
    grime = nb.m("MULTIPLY_ADD", nb.m("ADD", streak, patch), 0.22, 0.78)
    wallc = nb.vm("SCALE", wall, scale=grime)
    slab_m = nb.m("MULTIPLY", nb.step(f["fy"], 0.07), slab)
    wallc = nb.mixc(slab_m, wallc, nb.vm("SCALE", wall, scale=1.12))
    wall_s = nb.bsdf(base=wallc, rough=0.82, spec=0.4)
    nrm = wobble_normal(nb, f["rc"], 0.02)
    inside = interior(nb, f, inter)
    glass = nb.bsdf(base=inside, rough=0.04, ior=1.52, spec=0.7, normal=nrm)
    # window frames
    fr_x = nb.step(nb.m("ABSOLUTE", nb.m("SUBTRACT", nb.m("ABSOLUTE", nb.m("SUBTRACT", f["fx"], 0.5)), nb.m("MULTIPLY", ww, 0.5))),
                   nb.m("DIVIDE", 0.05, f["mw"]))
    frame = nb.m("MULTIPLY", fr_x, iny)
    sh = nb.mixs(win, wall_s, glass)
    sh = nb.mixs(nb.m("MULTIPLY", frame, above_gf), sh, nb.bsdf(base=(0.55, 0.56, 0.57), metal=0.8, rough=0.4))
    return sh


def mat_roof(nb):
    coord = nb.node("ShaderNodeTexCoord").outputs["Object"]
    c = nb.attr("roofc").outputs["Color"]
    n1, _ = nb.noise(coord, 0.35, 4.0, 0.55)
    n2, _ = nb.noise(coord, 4.0, 2.0, 0.5)
    col = nb.vm("SCALE", c, scale=nb.m("MULTIPLY_ADD", nb.m("ADD", n1, n2), 0.35, 0.65))
    bump = nb.node("ShaderNodeBump", inputs={"Height": n2, "Strength": 0.25}).outputs[0]
    return nb.bsdf(base=col, rough=0.9, normal=bump)


def mat_metal(nb):
    r = nb.node("ShaderNodeObjectInfo").outputs["Random"]
    col = nb.mixc(r, (0.42, 0.43, 0.44), (0.80, 0.80, 0.78))
    return nb.bsdf(base=col, metal=0.55, rough=0.45)


def mat_ground(color, scale, rough=0.85, var=0.3):
    def b(nb):
        coord = nb.node("ShaderNodeTexCoord").outputs["Object"]
        n1, _ = nb.noise(coord, scale, 5.0, 0.6)
        n2, _ = nb.noise(coord, scale * 0.04, 3.0, 0.5)
        col = nb.vm("SCALE", color, scale=nb.m("MULTIPLY_ADD", nb.m("ADD", n1, n2), var, 1.0 - var))
        return nb.bsdf(base=col, rough=rough)
    return b


def mat_water(nb):
    coord = nb.node("ShaderNodeTexCoord").outputs["Object"]
    stretched = nb.vm("MULTIPLY", coord, (0.07, 0.9, 1.0))     # crests along x -> reflections streak toward the camera
    h1, _ = nb.noise(stretched, 1.2, 6.0, 0.62)
    h2, _ = nb.noise(nb.vm("MULTIPLY", coord, (0.02, 0.08, 1.0)), 1.0, 2.0, 0.5)
    h = nb.m("ADD", h1, nb.m("MULTIPLY", h2, 0.6))
    bump = nb.node("ShaderNodeBump", inputs={"Height": h, "Strength": 0.012, "Distance": 0.2}).outputs[0]
    return nb.bsdf(base=(0.002, 0.008, 0.016), rough=0.035, ior=1.333, spec=0.5, normal=bump)


def mat_leaf(nb):
    r = nb.node("ShaderNodeObjectInfo").outputs["Random"]
    coord = nb.node("ShaderNodeTexCoord").outputs["Object"]
    n1, _ = nb.noise(coord, 3.5, 5.0, 0.7)
    vor = nb.node("ShaderNodeTexVoronoi", inputs={"Vector": coord, "Scale": 6.0}).outputs["Distance"]
    hue = nb.mixc(r, (0.035, 0.075, 0.018), (0.075, 0.105, 0.030))
    col = nb.vm("SCALE", hue, scale=nb.m("MULTIPLY_ADD", nb.m("ADD", n1, vor), 0.55, 0.45))
    bump = nb.node("ShaderNodeBump", inputs={"Height": nb.m("ADD", n1, vor), "Strength": 0.9}).outputs[0]
    leaf = nb.bsdf(base=col, rough=0.55, spec=0.35, normal=bump)
    trans = nb.node("ShaderNodeBsdfTranslucent", inputs={"Color": nb.vm("SCALE", col, scale=1.6), "Normal": bump}).outputs[0]
    return nb.mixs(0.25, leaf, trans)


def mat_simple(color, rough=0.6, metal=0.0):
    return lambda nb: nb.bsdf(base=color, rough=rough, metal=metal)


def mat_car(nb):
    r = nb.node("ShaderNodeObjectInfo").outputs["Random"]
    ramp = nb.node("ShaderNodeValToRGB", inputs={"Fac": r})
    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"
    palette = [(0.0, (0.85, 0.85, 0.85)), (0.3, (0.02, 0.02, 0.02)), (0.5, (0.35, 0.36, 0.37)), (0.66, (0.6, 0.61, 0.62)),
               (0.8, (0.05, 0.1, 0.25)), (0.9, (0.45, 0.04, 0.03)), (0.96, (0.9, 0.9, 0.88))]
    cr.elements[0].position, cr.elements[0].color = palette[0][0], (*palette[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = palette[1][0], (*palette[1][1], 1)
    for p, c in palette[2:]:
        e = cr.elements.new(p)
        e.color = (*c, 1)
    return nb.bsdf(base=ramp.outputs[0], metal=0.4, rough=0.25, coat=0.6)


# ================================================================= geometry helpers
def poly_rect(w, d):
    return [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]


def poly_chamfer(w, d, c):
    hw, hd = w / 2, d / 2
    return [(-hw + c, -hd), (hw - c, -hd), (hw, -hd + c), (hw, hd - c), (hw - c, hd), (-hw + c, hd), (-hw, hd - c), (-hw, -hd + c)]


def poly_round(w, d, r, seg=5):
    hw, hd = w / 2, d / 2
    pts = []
    for cx, cy, a0 in ((hw - r, -hd + r, -90), (hw - r, hd - r, 0), (-hw + r, hd - r, 90), (-hw + r, -hd + r, 180)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def poly_ellipse(a, b, n=40):
    return [(a * math.cos(2 * math.pi * i / n), b * math.sin(2 * math.pi * i / n)) for i in range(n)]


def poly_notched(w, d, k):
    hw, hd = w / 2, d / 2
    return [(-hw + k, -hd), (hw - k, -hd), (hw - k, -hd + k), (hw, -hd + k), (hw, hd - k), (hw - k, hd - k), (hw - k, hd),
            (-hw + k, hd), (-hw + k, hd - k), (-hw, hd - k), (-hw, -hd + k), (-hw + k, -hd + k)]


def scale_poly(pts, s):
    return [(x * s, y * s) for x, y in pts]


class MB:
    """bmesh builder: extruded footprints with metre UVs (u = perimeter, v = height)."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def prism(self, pts, z0, z1, side, top=None, off=(0, 0), rot=0.0, cap=True):
        ca, sa = math.cos(rot), math.sin(rot)
        P = [(off[0] + x * ca - y * sa, off[1] + x * sa + y * ca) for x, y in pts]
        bm = self.bm
        bot = [bm.verts.new((x, y, z0)) for x, y in P]
        tp = [bm.verts.new((x, y, z1)) for x, y in P]
        s = 0.0
        n = len(P)
        for i in range(n):
            j = (i + 1) % n
            seg = math.dist(P[i], P[j])
            f = bm.faces.new((bot[i], bot[j], tp[j], tp[i]))
            f.material_index = side
            for lp, uv in zip(f.loops, ((s, z0), (s + seg, z0), (s + seg, z1), (s, z1))):
                lp[self.uv].uv = uv
            s += seg
        if cap:
            f = bm.faces.new(tp)
            f.material_index = side if top is None else top
            for lp in f.loops:
                lp[self.uv].uv = (lp.vert.co.x, lp.vert.co.y)
        return P

    def box(self, cx, cy, w, d, z0, z1, mat, rot=0.0):
        self.prism(poly_rect(w, d), z0, z1, mat, off=(cx, cy), rot=rot)

    def cyl(self, cx, cy, r, z0, z1, mat, n=12):
        self.prism(poly_ellipse(r, r, n), z0, z1, mat, off=(cx, cy))

    def finish(self, name, mats, smooth_angle=32.0):
        bm = self.bm
        for f in bm.faces:
            f.smooth = True
        lim = math.radians(smooth_angle)
        for e in bm.edges:
            if len(e.link_faces) != 2 or e.calc_face_angle(math.pi) > lim:
                e.smooth = False
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in mats:
            me.materials.append(m)
        return me


COLL = {}


def coll_for(depth):
    name = "near" if depth < 1750 else "mid" if depth < 3000 else "far"
    return COLL[name]


def add_obj(name, me, loc=(0, 0, 0), rot=0.0, coll=None, props=None):
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot)
    for k, v in (props or {}).items():
        ob[k] = v
    (coll or COLL["near"]).objects.link(ob)
    return ob


# ================================================================= building archetypes
GLASS_TINTS = [  # coated-glass reflection colours: blue, steel, silver, green-blue, deep blue
    (0.42, 0.55, 0.70), (0.50, 0.58, 0.66), (0.62, 0.66, 0.70), (0.40, 0.56, 0.62), (0.30, 0.42, 0.60), (0.55, 0.62, 0.72)]
WALLS = [(0.62, 0.60, 0.56), (0.70, 0.69, 0.66), (0.55, 0.52, 0.48), (0.72, 0.70, 0.64), (0.46, 0.45, 0.44), (0.66, 0.62, 0.55),
         (0.78, 0.77, 0.74)]
ROOFS = [(0.42, 0.42, 0.41), (0.50, 0.49, 0.47), (0.33, 0.33, 0.33), (0.58, 0.57, 0.55), (0.25, 0.27, 0.22)]


def curtain_props(r, tint=None, refl=None, sp=None, dark=False):
    t = tint or r.choice(GLASS_TINTS)
    if dark:
        t = tuple(c * 0.7 for c in t)
    return {"mw": r.choice([1.5, 1.5, 1.8, 3.0]), "fh": r.choice([3.8, 4.0, 4.2]),
            "sp": sp if sp is not None else r.choice([0.0, 0.0, 0.18, 0.25, 0.3]),
            "tint": t, "refl": refl if refl is not None else r.uniform(0.18, 0.42), "wob": r.uniform(0.012, 0.035),
            "fin": r.choice([0, 0, 0, 2, 3, 4]), "mech": r.choice([0, 0, 15, 20]),
            "frame": r.choice([(0.55, 0.57, 0.6), (0.12, 0.13, 0.14), (0.7, 0.72, 0.74)]), "inter": r.uniform(0.7, 1.3),
            "roofc": r.choice(ROOFS), "ww": 0.7, "wh": 0.6, "gf": 5.0, "slab": 0.0, "wall": (0.6, 0.6, 0.6)}


def punched_props(r, ribbon=False):
    return {"mw": r.uniform(2.8, 3.8), "fh": r.uniform(3.0, 3.5), "ww": 1.02 if ribbon else r.uniform(0.38, 0.7),
            "wh": r.uniform(0.42, 0.62), "gf": r.choice([4.5, 5.0, 6.0]), "slab": r.choice([0.0, 1.0]),
            "wall": r.choice(WALLS), "inter": r.uniform(0.7, 1.4), "roofc": r.choice(ROOFS),
            "tint": (0.5, 0.55, 0.6), "refl": 0.2, "wob": 0.02, "sp": 0.0, "fin": 0, "mech": 0, "frame": (0.5, 0.5, 0.5)}


def roof_clutter(mb, r, pts, z, area_scale, metal=2, roof=1):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, d = x1 - x0, y1 - y0
    # parapet
    mb.prism(scale_poly([(x - (x0 + x1) / 2, y - (y0 + y1) / 2) for x, y in pts], 1.0), z, z + 1.1, roof,
             off=((x0 + x1) / 2, (y0 + y1) / 2), cap=False)
    n = int(r.uniform(2, 6) * area_scale) + 1
    for _ in range(n):
        uw, ud = r.uniform(1.5, 5.0), r.uniform(1.5, 4.0)
        if uw > w * 0.6 or ud > d * 0.6:
            continue
        cx, cy = r.uniform(x0 + uw, x1 - uw), r.uniform(y0 + ud, y1 - ud)
        mb.box(cx, cy, uw, ud, z, z + r.uniform(1.0, 2.6), metal)
    if w > 14 and d > 14 and r.random() < 0.8:      # stair / lift overrun
        pw, pd = r.uniform(5, min(10, w * 0.4)), r.uniform(4, min(9, d * 0.4))
        mb.box(r.uniform(x0 + pw, x1 - pw), r.uniform(y0 + pd, y1 - pd), pw, pd, z, z + r.uniform(3.0, 4.5), roof)
    if r.random() < 0.3 and w > 12:
        mb.cyl(r.uniform(x0 + 4, x1 - 4), r.uniform(y0 + 4, y1 - 4), r.uniform(1.2, 2.2), z, z + r.uniform(3, 5), metal)


def tower_mesh(r, name, footprint, height, podium=None, crown="flat", setbacks=(), spire=0.0):
    mb = MB()
    z = 0.0
    if podium:
        pw, pd, ph = podium
        mb.prism(poly_rect(pw, pd), 0.0, ph, 3, 1)
        roof_clutter(mb, r, poly_rect(pw, pd), ph, 0.6)
        z = ph
    tiers = [(1.0, z)] + [(s, height * f) for s, f in setbacks]
    for i, (s, z0) in enumerate(tiers):
        z1 = tiers[i + 1][1] if i + 1 < len(tiers) else height
        P = mb.prism(scale_poly(footprint, s), z0, z1, 0, 1)
    top_pts = scale_poly(footprint, tiers[-1][0])
    if crown == "flat":
        mb.prism(scale_poly(top_pts, 0.86), height, height + r.uniform(5, 9), 2, 1)
        roof_clutter(mb, r, scale_poly(top_pts, 0.86), height, 0.4)
    elif crown == "screen":      # facade continues above the roof as a glass screen
        mb.prism(top_pts, height, height + r.uniform(6, 12), 0, 1, cap=False)
        roof_clutter(mb, r, scale_poly(top_pts, 0.9), height, 0.8)
    elif crown == "stepped":
        h = height
        for s in (0.88, 0.74):
            dh = r.uniform(6, 12)
            mb.prism(scale_poly(top_pts, s), h, h + dh, 0, 1)
            h += dh
        roof_clutter(mb, r, scale_poly(top_pts, 0.74), h, 0.3)
    if spire > 0:
        mb.cyl(0, 0, 0.9, height, height + spire, 2, 8)
    return mb.finish(name, [M["curtain"], M["roof"], M["metal"], M["punched"]])


def midrise_mesh(r, name, w, d, h, glass=False):
    mb = MB()
    fp = poly_rect(w, d)
    if r.random() < 0.3 and w > 24 and d > 24:       # L / U shaped plan
        k = r.uniform(0.35, 0.55)
        mb.prism(poly_rect(w, d * k), 0, h, 0, 1, off=(0, -d * (1 - k) / 2))
        mb.prism(poly_rect(w * k, d * (1 - k) + 0.01), 0, h, 0, 1, off=(-w * (1 - k) / 2, d * k / 2))
        rp = [(x, y - d * (1 - k) / 2) for x, y in poly_rect(w, d * k)]
        roof_clutter(mb, r, rp, h, 0.7)
    else:
        mb.prism(fp, 0, h, 0, 1)
        if r.random() < 0.35 and h > 20:              # top setback
            mb.prism(poly_rect(w * 0.8, d * 0.8), h, h + r.uniform(3.2, 7), 0, 1)
        roof_clutter(mb, r, fp, h, max(0.6, w * d / 600))
    return mb.finish(name, [M["curtain"] if glass else M["punched"], M["roof"], M["metal"]])


# ================================================================= terrain
def shore_y(x):
    y = 1480 + 38 * math.sin(x / 260.0) + 22 * math.sin(x / 97.0 + 1.3)
    if x < -100:
        y -= (-100 - x) * 3.0          # left bank comes toward the camera (trees, low buildings, water edge)
    if x > 240:
        y -= (x - 240) * 1.45          # right bank comes forward under the dark towers
    return max(y, 220.0)


def on_land(x, y, margin=0.0):
    return y > shore_y(x) + margin


def build_terrain():
    water = MB()
    water.prism(poly_rect(16000, 26000), -6, -1.6, 0, off=(0, 12000))
    add_obj("water", water.finish("water", [M["water"]]), coll=COLL["front"])

    bands = [("front", 0, 1300), ("near", 1300, 1750), ("mid", 1750, 3000), ("far", 3000, 26000)]
    for name, y0, y1 in bands:
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        step = 8.0 if y1 <= 3000 else 60.0
        X = 9000.0
        xs = [-X + i * step for i in range(int(2 * X / step) + 1)]
        prev = None
        for x in xs:
            lo = max(y0, shore_y(x))
            if lo < y1:
                cur = (x, lo)
                if prev:
                    (xa, la) = prev
                    a, b = bm.verts.new((xa, la, 0)), bm.verts.new((x, lo, 0))
                    c, d = bm.verts.new((x, y1, 0)), bm.verts.new((xa, y1, 0))
                    bm.faces.new((a, b, c, d))
                    if shore_y(x) >= y0 and shore_y(xa) >= y0:     # embankment wall on the shore
                        e, f = bm.verts.new((xa, la, -3)), bm.verts.new((x, lo, -3))
                        wf = bm.faces.new((e, f, b, a))
                        wf.material_index = 1
                prev = cur
            else:
                prev = None
        me = bpy.data.meshes.new("land_" + name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(M["asphalt"])
        me.materials.append(M["stone"])
        add_obj("land_" + name, me, coll=COLL[name])

    # waterfront promenade: paving strip + grass strip along the shore
    for name, y0, y1 in bands[:3]:
        bm = bmesh.new()
        xs = [-3000 + i * 6.0 for i in range(1001)]
        for xa, xb in zip(xs, xs[1:]):
            ya, yb = shore_y(xa), shore_y(xb)
            if not (y0 <= ya < y1 and in_view(xa, ya, 400)):
                continue
            for (o0, o1, mi) in ((0.0, 9.0, 0), (9.0, 24.0, 1)):
                v = [bm.verts.new((xa, ya + o0, 0.12)), bm.verts.new((xb, yb + o0, 0.12)),
                     bm.verts.new((xb, yb + o1, 0.12)), bm.verts.new((xa, ya + o1, 0.12))]
                bm.faces.new(v).material_index = mi
        me = bpy.data.meshes.new("promenade_" + name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(M["pave"])
        me.materials.append(M["grass"])
        add_obj("promenade_" + name, me, coll=COLL[name])


# ================================================================= trees and cars
TREES = []
CARS = []


def build_tree_meshes():
    for i in range(6):
        r = random.Random(100 + i)
        bm = bmesh.new()
        blobs = [(0, 0, 0, 1.0)] + [(r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6), r.uniform(-0.3, 0.4), r.uniform(0.55, 0.8))
                                    for _ in range(r.randint(2, 4))]
        for bx, by, bz, br in blobs:
            ret = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=br)
            for v in ret["verts"]:
                p = v.co.copy()
                n = noise.fractal(p * 1.7 + Vector((i * 3.1, i * 1.7, 0)), 0.6, 2.0, 4)
                v.co = p * (1.0 + 0.32 * n) * Vector((1.0, 1.0, r.uniform(0.75, 0.95))) + Vector((bx, by, bz))
        for f in bm.faces:
            f.smooth = True
            f.material_index = 0
        bmesh.ops.translate(bm, verts=bm.verts[:], vec=Vector((0, 0, 1.25)))
        ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.09, radius2=0.06, depth=1.0)
        bmesh.ops.translate(bm, verts=ret["verts"], vec=Vector((0, 0, 0.5)))
        for f in bm.faces:
            if all(v in ret["verts"] for v in f.verts):
                f.material_index = 1
        me = bpy.data.meshes.new(f"tree_{i}")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(M["leaf"])
        me.materials.append(M["bark"])
        TREES.append(me)


def add_tree(x, y, scale, coll, z=0.0):
    me = rng.choice(TREES)
    ob = bpy.data.objects.new("tree", me)
    s = scale * rng.uniform(0.8, 1.2)
    ob.scale = (s, s, s * rng.uniform(0.9, 1.25))
    ob.location = (x, y, z)
    ob.rotation_euler = (0, 0, rng.uniform(0, 6.28))
    coll.objects.link(ob)


def build_car_meshes():
    for (L, W, H, cab) in ((4.5, 1.8, 0.75, 0.55), (4.8, 1.9, 0.9, 0.7), (5.2, 2.0, 1.1, 0.0), (12.0, 2.5, 3.0, 0.0)):
        mb = MB()
        mb.box(0, 0, L, W, 0.25, 0.25 + H, 0)
        if cab:
            mb.box(-L * 0.06, 0, L * 0.5, W * 0.9, 0.25 + H, 0.25 + H + cab, 1)
        CARS.append(mb.finish("car", [M["car"], M["carglass"]]))


def add_car(x, y, rot, coll):
    me = CARS[3] if rng.random() < 0.03 else rng.choice(CARS[:3])
    ob = bpy.data.objects.new("car", me)
    ob.location = (x, y, 0.0)
    ob.rotation_euler = (0, 0, rot)
    coll.objects.link(ob)


# ================================================================= city layout
GRID_ROT = math.radians(18.0)
GRID_O = (0.0, 1500.0)
CG, SG = math.cos(GRID_ROT), math.sin(GRID_ROT)


def g2w(u, v):
    return (GRID_O[0] + u * CG - v * SG, GRID_O[1] + u * SG + v * CG)


def w2g(x, y):
    dx, dy = x - GRID_O[0], y - GRID_O[1]
    return (dx * CG + dy * SG, -dx * SG + dy * CG)


# landmark towers read off the reference frame: (px centre, py top, width px, depth m, style)
HEROES = [
    # left cluster
    dict(px=20, py=560, wpx=62, depth=2350, fp="rect", style="silver", crown="screen"),
    dict(px=82, py=545, wpx=58, depth=1950, fp="chamfer", style="blue", crown="flat"),
    dict(px=165, py=478, wpx=56, depth=1760, fp="notched", style="light", crown="stepped"),
    dict(px=248, py=600, wpx=66, depth=2150, fp="rect", style="steel", crown="flat"),
    dict(px=212, py=648, wpx=46, depth=2700, fp="round", style="silver", crown="flat"),
    # centre (behind the main building in the hero)
    dict(px=322, py=592, wpx=42, depth=2750, fp="rect", style="steel", crown="flat"),
    dict(px=372, py=640, wpx=48, depth=3000, fp="chamfer", style="light", crown="screen"),
    dict(px=470, py=560, wpx=52, depth=3400, fp="ellipse", style="silver", crown="flat", spire=35),
    dict(px=540, py=615, wpx=50, depth=2900, fp="rect", style="blue", crown="flat"),
    dict(px=615, py=490, wpx=64, depth=2200, fp="rect", style="light", crown="stepped"),
    dict(px=728, py=600, wpx=56, depth=2500, fp="round", style="steel", crown="flat"),
    # right cluster: big dark-blue glass towers near the water
    dict(px=800, py=588, wpx=56, depth=1900, fp="chamfer", style="blue", crown="flat"),
    dict(px=870, py=430, wpx=76, depth=1640, fp="rect", style="dark", crown="screen"),
    dict(px=930, py=560, wpx=64, depth=1460, fp="notched", style="dark", crown="flat"),
]

STYLE = {
    "silver": dict(tint=(0.62, 0.67, 0.72), refl=0.42, sp=0.0),
    "light": dict(tint=(0.52, 0.63, 0.75), refl=0.38, sp=0.0),
    "blue": dict(tint=(0.36, 0.50, 0.68), refl=0.34, sp=0.22),
    "steel": dict(tint=(0.48, 0.55, 0.62), refl=0.30, sp=0.28),
    "dark": dict(tint=(0.26, 0.38, 0.56), refl=0.40, sp=0.0, dark=True),
}


def make_footprint(kind, w, d, r):
    if kind == "rect":
        return poly_rect(w, d)
    if kind == "chamfer":
        return poly_chamfer(w, d, min(w, d) * r.uniform(0.12, 0.2))
    if kind == "round":
        return poly_round(w, d, min(w, d) * r.uniform(0.18, 0.3))
    if kind == "notched":
        return poly_notched(w, d, min(w, d) * 0.12)
    if kind == "ellipse":
        return poly_ellipse(w / 2, d / 2)
    return poly_rect(w, d)


RESERVED = []    # (x, y, radius) kept free around landmark towers


def place_tower(i, x, y, w, d, height, fp, style, crown, r, spire=0.0, setb=True):
    foot = make_footprint(fp, w, d, r)
    st = STYLE.get(style)
    props = curtain_props(r, **st) if st else curtain_props(r)
    setbacks = []
    if setb and r.random() < 0.35 and height > 140:
        setbacks = [(r.uniform(0.82, 0.9), r.uniform(0.6, 0.8))]
    podium = None
    if r.random() < 0.55:
        podium = (w + r.uniform(14, 26), d + r.uniform(14, 26), r.uniform(10, 22))
        props.update({k: v for k, v in punched_props(r, ribbon=True).items() if k in ("ww", "wh", "gf", "wall", "slab")})
    me = tower_mesh(r, f"tower_{i}", foot, height, podium=podium, crown=crown, setbacks=setbacks, spire=spire)
    add_obj(f"tower_{i}", me, (x, y, 0.0), GRID_ROT, coll_for(y), props)
    RESERVED.append((x, y, max(w, d) * 0.5 + (16 if podium else 6)))


def build_city():
    t0 = time.time()
    r = random.Random(A.seed + 1)
    # landmark towers
    for i, h in enumerate(HEROES):
        depth = h["depth"]
        x = frame_x(h["px"], depth)
        w = frame_w(h["wpx"], depth) / (CG + SG * 0.75)          # projected width of a rotated footprint
        height = frame_z(h["py"], depth - w * 0.4)
        if not on_land(x, depth, 30):
            print("WARN hero not on land", i, x, depth, shore_y(x))
        place_tower(f"hero{i}", x, depth, w, w * r.uniform(0.75, 1.0), height, h["fp"], h["style"], h["crown"], r,
                    spire=h.get("spire", 0.0))

    downtowns = [(-330, 1950, 520, 1.0), (330, 1700, 420, 1.0), (60, 2900, 650, 0.9), (-900, 3900, 900, 0.75),
                 (950, 3700, 900, 0.75), (0, 5200, 1500, 0.6)]
    # street grid (in grid space), irregular block sizes, avenues every few blocks
    def lines(start, stop):
        out, p, k = [], start, 0
        while p < stop:
            street = 30.0 if k % 4 == 0 else r.uniform(14, 20)
            out.append((p, p + street))
            p += street + r.uniform(70, 150)
            k += 1
        return out

    us = lines(-7000, 7000)
    vs = lines(-1400, 9000)
    n_b = n_t = n_m = 0
    for (ua0, ua1), (ub0, ub1) in zip(us, us[1:]):
        for (va0, va1), (vb0, vb1) in zip(vs, vs[1:]):
            bu0, bu1, bv0, bv1 = ua1, ub0, va1, vb0
            bw, bd = bu1 - bu0, bv1 - bv0
            cx, cy = g2w((bu0 + bu1) / 2, (bv0 + bv1) / 2)
            if cy > 9000 or not in_view(cx, cy, 200):
                continue
            corners = [g2w(bu0, bv0), g2w(bu1, bv0), g2w(bu1, bv1), g2w(bu0, bv1)]
            if not all(on_land(px, py, 26) for px, py in corners):
                continue
            n_b += 1
            coll = coll_for(cy)
            depth = cy
            far = depth > 4800
            # block slab (sidewalk)
            mb = MB()
            mb.prism(poly_rect(bw, bd), 0.0, 0.18, 0)
            add_obj("block", mb.finish("block", [M["pave"]]), (cx, cy, 0), GRID_ROT, coll)
            reserved = any(math.hypot(cx - rx, cy - ry) < rr + max(bw, bd) * 0.5 for rx, ry, rr in RESERVED)
            t = max(wt * math.exp(-((cx - ax) ** 2 + (cy - ay) ** 2) / (2 * ar * ar)) for ax, ay, ar, wt in downtowns)
            roll = r.random()
            if reserved:
                kind = "plaza"
            elif roll < 0.07 and depth < 4000:
                kind = "park"
            elif r.random() < 0.04 + 0.55 * t:
                kind = "tower"
            elif depth < 2300 and r.random() < 0.3:
                kind = "low"
            else:
                kind = "mid"
            if kind == "park":
                grass = MB()
                grass.prism(poly_rect(bw - 6, bd - 6), 0.18, 0.25, 0)
                add_obj("park", grass.finish("park", [M["grass"]]), (cx, cy, 0), GRID_ROT, coll)
                for _ in range(int(bw * bd / 140)):
                    gu, gv = r.uniform(bu0 + 6, bu1 - 6), r.uniform(bv0 + 6, bv1 - 6)
                    add_tree(*g2w(gu, gv), r.uniform(3.2, 5.2), coll, 0.2)
                continue
            if kind == "plaza":
                for _ in range(int((bw + bd) / 14)):
                    gu, gv = r.choice([(r.uniform(bu0 + 3, bu1 - 3), r.choice([bv0 + 3, bv1 - 3])),
                                       (r.choice([bu0 + 3, bu1 - 3]), r.uniform(bv0 + 3, bv1 - 3))])
                    add_tree(*g2w(gu, gv), r.uniform(2.6, 3.8), coll, 0.18)
                continue
            if kind == "tower":
                tw = r.uniform(26, 48)
                td = tw * r.uniform(0.7, 1.0)
                if tw + 10 > bw or td + 10 > bd:
                    kind = "mid"
                else:
                    hmax = 90 + 200 * t
                    height = r.uniform(70, hmax) if not far else r.uniform(60, hmax * 0.9)
                    fp = r.choice(["rect", "rect", "chamfer", "round", "notched", "ellipse"])
                    place_tower(f"t{n_t}", cx, cy, tw, td, height, fp, None, r.choice(["flat", "flat", "screen", "stepped"]), r,
                                spire=r.choice([0, 0, 0, 0, 25]))
                    RESERVED.pop()
                    n_t += 1
                    if not far and r.random() < 0.6:           # lower neighbours on the same block
                        for (su, sv) in ((bu0 + 14, bv0 + 14), (bu1 - 14, bv1 - 14)):
                            if r.random() < 0.6:
                                w2, d2, h2 = r.uniform(16, 24), r.uniform(16, 24), r.uniform(12, 35)
                                px2, py2 = g2w(su, sv)
                                me = midrise_mesh(r, "mid", w2, d2, h2)
                                add_obj("mid", me, (px2, py2, 0.18), GRID_ROT, coll, punched_props(r))
                    continue
            # mid / low blocks: split the block into lots
            if far:
                cols, rows = 1, 1
            else:
                cols = max(1, int(bw / r.uniform(30, 55)))
                rows = max(1, int(bd / r.uniform(30, 55)))
            lw, ld = bw / cols, bd / rows
            for ci in range(cols):
                for ri in range(rows):
                    if r.random() < 0.08 and not far:
                        continue
                    lu = bu0 + (ci + 0.5) * lw
                    lv = bv0 + (ri + 0.5) * ld
                    sb = r.uniform(2.5, 6.0)
                    w2, d2 = lw - 2 * sb, ld - 2 * sb
                    if w2 < 8 or d2 < 8:
                        continue
                    if kind == "low":
                        h2 = r.choice([7, 10, 13, 16, 20]) * r.uniform(0.9, 1.1)
                    else:
                        h2 = r.uniform(18, 48 + 30 * t)
                    glass = r.random() < (0.25 if kind == "mid" else 0.08)
                    px2, py2 = g2w(lu, lv)
                    me = midrise_mesh(r, "mid", w2, d2, h2, glass=glass)
                    props = curtain_props(r) if glass else punched_props(r, ribbon=r.random() < 0.25)
                    add_obj("mid", me, (px2, py2, 0.18), GRID_ROT, coll, props)
                    n_m += 1
            # street trees on the nearer blocks
            if depth < 3200 and r.random() < 0.55:
                step = r.uniform(9, 13)
                k = 0
                while k * step < bw:
                    gu = bu0 + 2 + k * step
                    for gv in (bv0 - 2.5, bv1 + 2.5):
                        add_tree(*g2w(gu, gv), r.uniform(2.4, 3.4), coll, 0.0)
                    k += 1
    # cars on the streets in the near/mid distance
    n_c = 0
    for (a0, a1) in us:
        uc = (a0 + a1) / 2
        for lane in (-4.5, -1.5, 1.5, 4.5) if a1 - a0 > 25 else (-1.7, 1.7):
            v = -1400 + r.uniform(0, 20)
            while v < 4000:
                x, y = g2w(uc + lane, v)
                if in_view(x, y, 80) and on_land(x, y, 8) and y < 3600:
                    add_car(x, y, GRID_ROT + math.pi / 2 * (1 if lane > 0 else -1), coll_for(y))
                    n_c += 1
                v += r.uniform(9, 45)
    for (a0, a1) in vs:
        vc = (a0 + a1) / 2
        for lane in (-1.7, 1.7):
            u = -7000 + r.uniform(0, 20)
            while u < 7000:
                x, y = g2w(u, vc + lane)
                if in_view(x, y, 80) and on_land(x, y, 8) and y < 3600:
                    add_car(x, y, GRID_ROT + (0 if lane > 0 else math.pi), coll_for(y))
                    n_c += 1
                u += r.uniform(9, 45)
    # promenade trees and the left bank (closer to camera)
    for xa in [i * 9.0 - 3000 for i in range(667)]:
        ya = shore_y(xa)
        if in_view(xa, ya, 120):
            c = COLL["front"] if ya < 1300 else coll_for(ya)
            add_tree(xa + r.uniform(-2, 2), ya + 15 + r.uniform(-3, 3), r.uniform(3.0, 4.6), c, 0.12)
    print(f"city: {n_b} blocks, {n_t} towers, {n_m} lots, {n_c} cars, {len(bpy.data.objects)} objects, {time.time()-t0:.1f}s")


def build_left_bank():
    """Low waterfront buildings and trees between the promenade and the frame edge (reference: lower left)."""
    r = random.Random(A.seed + 5)
    # a long white pavilion on the water edge, a few low blocks and dense trees behind
    for k, (depth, wl, h) in enumerate(((1060, 70, 9), (1150, 46, 14), (1240, 60, 18), (1320, 40, 24))):
        x = -WEDGE * depth * 0.62 - 10 + r.uniform(-15, 15)
        while not on_land(x, depth, 28):
            x -= 10
        x -= r.uniform(0, 30)
        mb = MB()
        mb.prism(poly_rect(wl, 22), 0, h, 0, 1)
        roof_clutter(mb, r, poly_rect(wl, 22), h, 0.8)
        me = mb.finish("bank", [M["punched"], M["roof"], M["metal"]])
        props = punched_props(r, ribbon=True)
        props["wall"] = (0.82, 0.82, 0.80)
        add_obj("bank", me, (x, depth + 20, 0.12), math.radians(8), COLL["front"] if depth < 1300 else COLL["near"], props)
    for _ in range(420):
        y = r.uniform(900, 1700)
        x = r.uniform(-WEDGE * y - 80, -60)
        if on_land(x, y, 30) and not on_land(x, y, 190):
            add_tree(x, y, r.uniform(3.4, 5.6), COLL["front"] if y < 1300 else coll_for(y), 0.0)


# ================================================================= camera and render
def build_camera():
    cam = bpy.data.cameras.new("Cam")
    cam.sensor_fit = "VERTICAL"
    cam.sensor_height = 24.0
    vfov = 2 * math.atan(TAN_V * A.overscan)
    cam.lens = cam.sensor_height / (2 * math.tan(vfov / 2))
    cam.shift_y = SHIFT_Y / A.overscan
    cam.clip_start, cam.clip_end = 1.0, 40000.0
    ob = bpy.data.objects.new("Cam", cam)
    ob.location = (0, 0, CAM_H)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(ob)
    scene.camera = ob


def render(path, visible=None):
    vl = scene.view_layers[0]
    for name, lc in vl.layer_collection.children.items():
        lc.indirect_only = visible is not None and name not in visible
    scene.render.film_transparent = visible is not None and "sky" not in visible
    scene.render.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"rendered {path} in {time.time()-t0:.1f}s")
    import numpy as np                     # the venv's OpenCV has no EXR support: hand post.py a .npy
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    np.save(path[:-4] + ".npy", px.reshape(h, w, 4)[::-1].astype(np.float16))
    bpy.data.images.remove(img)


def main():
    global HAZE, M
    os.makedirs(A.out, exist_ok=True)
    for name in ("front", "near", "mid", "far"):
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
        COLL[name] = c
    build_world()
    HAZE = build_haze_group()
    M = {
        "curtain": material("Curtain", mat_curtain),
        "punched": material("Punched", mat_punched),
        "roof": material("Roof", mat_roof),
        "metal": material("Metal", mat_metal),
        "asphalt": material("Asphalt", mat_ground((0.075, 0.077, 0.08), 0.8, 0.8, 0.25)),
        "pave": material("Pave", mat_ground((0.42, 0.41, 0.39), 1.5, 0.75, 0.25)),
        "grass": material("Grass", mat_ground((0.065, 0.11, 0.035), 0.7, 0.9, 0.45)),
        "stone": material("Stone", mat_ground((0.55, 0.54, 0.51), 0.6, 0.7, 0.25)),
        "water": material("Water", mat_water),
        "leaf": material("Leaf", mat_leaf),
        "bark": material("Bark", mat_simple((0.06, 0.05, 0.04), 0.9)),
        "car": material("Car", mat_car),
        "carglass": material("CarGlass", mat_simple((0.01, 0.012, 0.015), 0.08)),
    }
    build_camera()
    build_tree_meshes()
    build_car_meshes()
    build_terrain()
    build_city()
    build_left_bank()
    if A.blend:
        bpy.ops.wm.save_as_mainfile(filepath=A.blend)
    render(os.path.join(A.out, "beauty.exr"))
    if A.layers:
        render(os.path.join(A.out, "layer_sky.exr"), visible={"sky"})
        for name in ("far", "mid", "near", "front"):
            render(os.path.join(A.out, f"layer_{name}.exr"), visible={name})


main()
