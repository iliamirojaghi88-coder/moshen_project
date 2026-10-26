#!/usr/bin/env python3
"""Anatomical brain GLB from open neuroimaging templates.

Cerebrum: FreeSurfer fsaverage pial surfaces (MRI-derived, 163 842 vertices per
hemisphere), coloured from the sulcal-depth map so gyri read lighter than sulci.
Cerebellum + brainstem: marching cubes on the MNI ICBM152 2009a grey+white
matter probability maps (bundled with nilearn), minus everything inside the
cerebral surfaces, with folia carved as concentric ridges.

Usage: brain_from_templates.py <fsaverage_dir> <out.glb> [--target-faces N]
Units: metres (the brain is ~0.17 m long), +Y up, +Z anterior (glTF).
"""
import argparse
import os

import fast_simplification
import nibabel as nb
import nilearn
import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure


def load_hemi(d, h):
    g = nb.load(os.path.join(d, f"pial_{h}.gii.gz"))
    v = g.darrays[0].data.astype(np.float64)
    f = g.darrays[1].data.astype(np.int64)
    sulc = nb.load(os.path.join(d, f"sulc_{h}.gii.gz")).darrays[0].data
    curv = nb.load(os.path.join(d, f"curv_{h}.gii.gz")).darrays[0].data
    return v, f, sulc, curv


def cortex_colors(sulc, curv, seed):
    # Fresh-tissue palette: pale pink-beige crowns, deeper rose-brown sulci.
    crown = np.array([0.80, 0.62, 0.58])
    deep = np.array([0.42, 0.24, 0.24])
    k = np.clip((sulc + 0.6) / 1.6, 0, 1) ** 1.2
    k = np.clip(k + 0.18 * np.clip(curv, -1, 1), 0, 1)
    rng = np.random.default_rng(seed)
    jitter = 1 + 0.03 * rng.standard_normal((len(k), 1))
    return np.clip((crown * (1 - k[:, None]) + deep * k[:, None]) * jitter, 0, 1)


def hindbrain(hemis):
    base = os.path.join(os.path.dirname(nilearn.__file__), "datasets", "data")
    gm = nb.load(os.path.join(base, "mni_icbm152_gm_tal_nlin_sym_09a_converted.nii.gz"))
    wm = nb.load(os.path.join(base, "mni_icbm152_wm_tal_nlin_sym_09a_converted.nii.gz"))
    tissue = (gm.get_fdata() + wm.get_fdata()) / 255.0
    aff = gm.affine

    # Voxelise the cerebral hemispheres so they can be subtracted.
    cereb = np.zeros(tissue.shape, bool)
    inv = np.linalg.inv(aff)
    for v, f in hemis:
        m = trimesh.Trimesh(v, f, process=False)
        vox = m.voxelized(1.0).fill()
        pts = vox.points
        ijk = np.round(trimesh.transform_points(pts, inv)).astype(int)
        ok = np.all((ijk >= 0) & (ijk < tissue.shape), axis=1)
        cereb[tuple(ijk[ok].T)] = True
    cereb = ndimage.binary_dilation(cereb, iterations=2)

    mask = (tissue > 0.5) & ~cereb
    # Below the tentorium only; cut the brainstem at the medulla.
    zz = np.arange(tissue.shape[2]) * aff[2, 2] + aff[2, 3]
    yy = np.arange(tissue.shape[1]) * aff[1, 1] + aff[1, 3]
    mask &= (zz[None, None, :] < -4) & (zz[None, None, :] > -62)
    mask &= (yy[None, :, None] < -8)
    mask = ndimage.binary_opening(mask, iterations=2)  # drop slivers left between the hemispheres
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = 1 + np.argsort(sizes)[::-1][:1]
    mask = np.isin(lab, keep)
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_fill_holes(mask)

    field = ndimage.gaussian_filter(mask.astype(np.float32), 0.9)
    field = ndimage.zoom(field, 2, order=1)
    verts, faces, _, _ = measure.marching_cubes(field, 0.5)
    verts = verts / 2.0
    verts = trimesh.transform_points(verts, aff)
    m = trimesh.Trimesh(verts, faces[:, ::-1], process=True)
    trimesh.smoothing.filter_taubin(m, iterations=12)

    v = m.vertices.copy()
    n_ = m.vertex_normals.copy()
    # Folia run left-right: ridges stacked by polar angle around a transverse
    # axis through the fourth ventricle, with a deeper fissure every few folia.
    # Only on the cerebellum (behind the brainstem), fading out on the stem.
    centre = np.array([0.0, -36.0, -33.0])  # transverse axis through the cerebellar peduncles
    theta = np.arctan2(v[:, 2] - centre[2], v[:, 1] - centre[1])
    rho = np.hypot(v[:, 2] - centre[2], v[:, 1] - centre[1])
    arc = theta * 40.0 + 0.6 * np.sin(v[:, 0] * 0.11)  # mm of arc at the mean radius, slightly wavy
    on_cb = np.clip((-(v[:, 1] + 30.0)) / 10.0, 0, 1) * np.clip((np.abs(v[:, 0]) - 4.0) / 6.0, 0, 1)
    on_cb = np.maximum(on_cb, np.clip((-(v[:, 1] + 54.0)) / 6.0, 0, 1))
    on_cb *= np.clip((rho - 12.0) / 14.0, 0, 1)  # no visible fan where the folia converge
    ridge = np.cos(2 * np.pi * arc / 2.1)
    fissure = np.clip(np.cos(2 * np.pi * arc / 14.7), 0.92, 1.0)
    fissure = (fissure - 0.92) / 0.08
    v += n_ * ((0.42 * ridge - 1.1 * fissure) * on_cb)[:, None]
    m = trimesh.Trimesh(v, m.faces, process=False)

    stem = 1 - on_cb
    cb_col = np.array([0.70, 0.48, 0.45]) * (0.78 + 0.22 * ridge[:, None]) * (1 - 0.35 * fissure[:, None])
    stem_col = np.array([0.82, 0.70, 0.64])
    col = cb_col * (1 - stem[:, None]) + stem_col * stem[:, None]
    return m, np.clip(col, 0, 1)


def to_gltf_space(v):
    # RAS millimetres → glTF metres, a proper rotation (no mirroring): +Y up
    # (superior), +Z anterior (faces a default camera), so the patient's right
    # lands on -X, as when facing someone.
    out = np.empty_like(v)
    out[:, 0] = -v[:, 0]
    out[:, 1] = v[:, 2]
    out[:, 2] = v[:, 1]
    return out / 1000.0


def decimate(v, f, c, target):
    if len(f) <= target:
        return v, f, c
    v2, f2 = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), 1 - target / len(f))
    # Carry colours over by nearest original vertex.
    tree = trimesh.proximity.ProximityQuery(trimesh.Trimesh(v, f, process=False))
    _, idx = tree.vertex(v2)
    return v2.astype(np.float64), f2.astype(np.int64), c[idx]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fsaverage")
    ap.add_argument("out")
    ap.add_argument("--target-faces", type=int, default=420000, help="cortex faces, both hemispheres")
    a = ap.parse_args()

    parts = []
    hemis = []
    for i, (h, dx) in enumerate((("left", -1.6), ("right", 1.6))):
        v, f, sulc, curv = load_hemi(a.fsaverage, h)
        v = v + np.array([dx, 0, 0])  # open the longitudinal fissure a little
        hemis.append((v, f))
        c = cortex_colors(sulc, curv, i)
        v, f, c = decimate(v, f, c, a.target_faces // 2)
        parts.append((f"cortex_{h}", v, f, c))

    hb, hb_col = hindbrain(hemis)
    v, f, c = decimate(hb.vertices, hb.faces, hb_col, 90000)
    parts.append(("hindbrain", v, f, c))

    scene = trimesh.Scene()
    for name, v, f, c in parts:
        m = trimesh.Trimesh(to_gltf_space(v), f, process=False)
        lin = np.power(np.clip(c, 0, 1), 2.2)  # glTF vertex colours are linear
        rgba = np.concatenate([lin, np.ones((len(c), 1))], axis=1)
        m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=(rgba * 255).astype(np.uint8))
        scene.add_geometry(m, node_name=name, geom_name=name)
        print(f"{name}: {len(m.vertices)} verts, {len(m.faces)} faces, bounds {m.bounds.round(3).tolist()}")
    scene.export(a.out)
    print(a.out, os.path.getsize(a.out) // 1024, "KB")


if __name__ == "__main__":
    main()
