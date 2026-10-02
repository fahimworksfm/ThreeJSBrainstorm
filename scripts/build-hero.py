#!/usr/bin/env python3
"""Turns the image-to-3D model of the character sheet (3d/base.glb) into the hero's body (public/models/hero-body.glb).

The converter modelled every view on the sheet, so the file holds three figures side by side: this keeps the
front one. It came without a texture, so the sheet's front and back drawings are projected onto it as vertex
colors (the ink outlines filled in from the colors around them first, so the sides don't come out black). The
game fits the walking skeleton inside it and works out the skin weights when it loads (src/hero.js).

    pip install trimesh pillow numpy scipy && python3 scripts/build-hero.py
"""
import glob

import numpy as np
import trimesh
from PIL import Image
from scipy import ndimage

SRC = '3d/base.glb'
SHEET = glob.glob('aiImages/character/Character_turnaround*.jpg')[0]
OUT = 'public/models/hero-body.glb'

scene = trimesh.load(SRC, force='mesh', process=False)
# the front figure: everything left of the gap between it and the side view
keep = (scene.vertices[scene.faces][:, :, 0] < -0.12).all(axis=1)
body = scene.submesh([np.where(keep)[0]], append=True)
body = trimesh.Trimesh(body.vertices, body.faces, process=True)  # weld seams so normals and weights are smooth
body.remove_unreferenced_vertices()
v = body.vertices.copy()
# stand it on the origin, height 1 (the game scales it to the skeleton)
lo, hi = v.min(0), v.max(0)
v[:, 0] -= (lo[0] + hi[0]) / 2
v[:, 2] -= np.median(v[:, 2])
v[:, 1] -= lo[1]
v /= hi[1] - lo[1]
body.vertices = v
n = body.vertex_normals

# ---- the sheet: the figures are what the paper flood (from the edges) doesn't reach
from PIL import ImageDraw

sheet = Image.open(SHEET).convert('RGB')
W, H = sheet.size
flood = sheet.copy()
for pt in [(x, 0) for x in range(0, W, 40)] + [(x, H - 1) for x in range(0, W, 40)] + [(0, y) for y in range(0, H, 40)] + [(W - 1, y) for y in range(0, H, 40)]:
    if min(flood.getpixel(pt)) > 180 and flood.getpixel(pt) != (255, 0, 255):
        ImageDraw.floodfill(flood, pt, (255, 0, 255), thresh=24)
fl = np.asarray(flood)
figure = ~((fl[..., 0] == 255) & (fl[..., 1] == 0) & (fl[..., 2] == 255))
img = np.asarray(sheet).astype(np.float32)
ink = img.max(2) < 52  # outlines and hatching
# paper is also trapped between the arms and the body, and between the legs: anything light and colorless
paperlike = (img.min(2) > 110) & (img.max(2) - img.min(2) < 18)  # paper and its soft drop shadow (the hoodie is darker)
paint = figure & ~ink & ~paperlike
_, (iy, ix) = ndimage.distance_transform_edt(~paint, return_indices=True)
filled = img[iy, ix]


def silhouette(x, y, s, ox, oy):
    """The model's front outline drawn at scale s (pixels per unit), feet at (ox, oy)."""
    m = Image.new('1', (W, H), 0)
    d = ImageDraw.Draw(m)
    px = ox + x * s
    py = oy - y * s
    for f in body.faces:
        d.polygon([(px[f[0]], py[f[0]]), (px[f[1]], py[f[1]]), (px[f[2]], py[f[2]])], fill=1)
    return np.asarray(m)


def fit(x0, x1, mirror):
    """Scale and place the model's outline to best cover the drawn figure in the panel x0..x1."""
    target = figure.copy()
    target[:, :x0] = False
    target[:, x1:] = False
    ys, xs = np.where(target)
    s0 = (ys.max() - ys.min()) / 1.0
    cx, foot = (xs.min() + xs.max()) / 2, ys.max()
    x = -v[:, 0] if mirror else v[:, 0]
    best = None
    # coarse search on a downsampled grid, then refine
    for ds in (0.94, 0.97, 1.0, 1.03):
        for dx in range(-30, 31, 10):
            for dy in range(-20, 21, 10):
                sil = silhouette(x, v[:, 1], s0 * ds, cx + dx, foot + dy)
                iou = (sil & target).sum() / max(1, (sil | target).sum())
                if not best or iou > best[0]:
                    best = (iou, s0 * ds, cx + dx, foot + dy)
    print(f'  fit {"back" if mirror else "front"}: overlap {best[0]:.3f}')
    return best[1:]


def sample(params, mirror=False):
    s, ox, oy = params
    x = -v[:, 0] if mirror else v[:, 0]
    nx = -n[:, 0] if mirror else n[:, 0]
    # faces turned sideways sample a little inside the outline, not on it
    px = np.clip((ox + x * s - nx * 14).astype(int), 0, W - 1)
    py = np.clip((oy - v[:, 1] * s + n[:, 1] * 6).astype(int), 0, H - 1)
    return filled[py, px]


front = sample(fit(0, int(W * 0.42), False))
back = sample(fit(int(W * 0.58), W, True), mirror=True)
# facing the camera: the front drawing; facing away: the back one; blended across the sides
t = np.clip(n[:, 2] * 2.5 + 0.5, 0, 1)[:, None]
col = front * t + back * (1 - t)
# a little smoothing across the surface takes out the speckle of leftover hatching
import scipy.sparse as sp

e = body.edges_unique
A = sp.coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(len(v), len(v))).tocsr()
A = sp.diags(1 / np.maximum(1, np.asarray(A.sum(1)).ravel())) @ A
for _ in range(3):
    col = 0.5 * col + 0.5 * (A @ col)
# the drawing's flat colors read a little muddy once lit: lift the saturation back
lum = (col @ np.array([0.299, 0.587, 0.114]))[:, None]
col = lum + (col - lum) * 1.35
body.visual = trimesh.visual.ColorVisuals(body, vertex_colors=np.c_[col.clip(0, 255).astype(np.uint8), np.full(len(col), 255, np.uint8)])
body.export(OUT)
print(f'hero body: {len(body.vertices)} vertices, {len(body.faces)} faces -> {OUT}')
