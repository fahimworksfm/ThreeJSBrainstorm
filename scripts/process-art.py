# Turn the raw sheets in photos/ into game textures in public/textures/ (run from the repo root).
# Each facade gets a night mask: window glass found by color, cleaned up, and lit per window at random.
import json, random
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

SRC = 'photos/'
OUT = 'public/textures/'
WARM = [(255, 213, 154), (255, 196, 122), (255, 230, 191), (255, 183, 102), (255, 240, 214)]
TV = [(127, 166, 255), (143, 208, 255)]


def seamless(a, band=12):
    a = a.astype(np.float32)
    for axis in (0, 1):
        n = a.shape[axis]
        for i in range(band):
            t = 0.5 * (1 - i / band)
            lo = np.take(a, i, axis=axis).copy()
            hi = np.take(a, n - 1 - i, axis=axis).copy()
            s_lo = [slice(None)] * 3
            s_hi = [slice(None)] * 3
            s_lo[axis], s_hi[axis] = i, n - 1 - i
            a[tuple(s_lo)] = lo * (1 - t) + hi * t
            a[tuple(s_hi)] = hi * (1 - t) + lo * t
    return a


def save(a, name):
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(OUT + name, quality=88)


def light_cells(glass, cols, rows, seed):
    """Color the glass mask cell by cell: most windows dark, some warm, a few TV blue, some with a shade."""
    rnd = random.Random(seed)
    H, W = glass.shape
    out = np.zeros((H, W, 3), np.float32)
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    lit = set(rnd.sample(cells, round(len(cells) * 0.4)))  # always about 40% of windows on
    for r, c in cells:
            if (r, c) not in lit:
                continue
            x0, x1 = c * W // cols, (c + 1) * W // cols
            y0, y1 = r * H // rows, (r + 1) * H // rows
            col = rnd.choice(TV) if rnd.random() < 0.15 else rnd.choice(WARM)
            cell = glass[y0:y1, x0:x1].copy()
            if rnd.random() < 0.35:
                ys = np.nonzero(cell.any(axis=1))[0]
                if len(ys):
                    cell[: ys[0] + int((ys[-1] - ys[0]) * rnd.uniform(0.25, 0.45))] = 0
            out[y0:y1, x0:x1] = cell[..., None] * np.array(col) * rnd.uniform(0.6, 1.0)
    return out


def glass_by_color(a, sample, tol, k, close=0):
    ref = a[sample[1], sample[0]]
    d = np.sqrt(((a - ref) ** 2).sum(-1))
    m = Image.fromarray(((d < tol) * 255).astype(np.uint8))
    if close:
        # closing: fill thin dark lines inside the glass (leaded panes, sash bars)
        m = m.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
    # opening: drop thin features (frames, siding lines), keep the panes
    m = m.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    g = (np.asarray(m) > 0).astype(np.float32)
    g[:8], g[-8:], g[:, :8], g[:, -8:] = 0, 0, 0, 0  # filters misbehave at the borders
    # drop anything shaped like a strip of wall rather than a pane
    lab, n = ndimage.label(g)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if w > 3 * h or h > 4 * w:
            g[lab == i] = 0
    return g


def facade(src, key, cols, rows, W, H, sample, tol, k, tint=None, seed=1, close=0, lights=None, mask_src=None):
    im = Image.open(SRC + src).convert('RGB').resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    if mask_src:
        # a hand-made window mask: white glass on black
        m = Image.open(SRC + mask_src).convert('L').resize((W, H), Image.LANCZOS)
        glass = (np.asarray(m) > 128).astype(np.float32)
    else:
        glass = glass_by_color(a, (int(sample[0] * W), int(sample[1] * H)), tol, k, close)
    if tint is not None:
        a = a * np.array(tint)
    save(seamless(a), f'{key}.jpg')
    save(light_cells(glass, *(lights or (cols, rows)), seed), f'{key}-mask.png')
    print(key, 'glass', round(glass.mean(), 3))
    return {'file': f'{key}.jpg', 'mask': f'{key}-mask.png', 'cols': cols, 'rows': rows}


def ground(src, key, W, meters, shift=0.0):
    a = np.asarray(Image.open(SRC + src).convert('RGB').resize((W, W), Image.LANCZOS)).astype(np.float32)
    if shift:
        s = int(W * shift)
        a = np.roll(a, (s, s), axis=(0, 1))
    save(seamless(a, 24), f'{key}.jpg')
    lin = ((a / 255) ** 2.2).mean()
    return {'file': f'{key}.jpg', 'meters': meters, 'mean': round(float(lin), 4)}


pack = {}
pack['facade-brick'] = facade('Drawing_red_brick_tenement_wall_2K_20260923162057.jpeg', 'facade-brick', 8, 4, 2048, 1536, (0.07, 0.09), 45, 11, seed=1)
# the brownstone sheet came out in red brick: pull it toward chocolate brownstone
pack['facade-stone'] = facade('Create_brownstone_wall_illustration_2K_20260923162223.jpeg', 'facade-stone', 8, 4, 2048, 1536, (0.07, 0.09), 18, 15, tint=(0.78, 0.66, 0.6), seed=2, mask_src='Create_brownstone_wall_illustration_2K_20260923171108.jpeg')
pack['facade-tudor'] = facade('Match_art_style_of_image_2K_20260923162337.jpeg', 'facade-tudor', 8, 4, 2048, 1536, (0.18, 0.1), 40, 15, seed=3, close=9)
pack['facade-siding'] = facade('Draw_Queens_row_house_wall_2K_20260923162437.jpeg', 'facade-siding', 8, 4, 2048, 1536, (0.126, 0.086), 14, 65, seed=4, lights=(4, 4))  # glass and siding share one blue: a wide opening keeps only the panes

# shop fronts: the top row holds two shops, one every 678 px of a 1376-wide preview
im = Image.open(SRC + 'Create_New_York_shop_fronts_2K_20260923162602.jpeg').convert('RGB')
crop = im.crop((20, 0, 20 + 2712, 768)).resize((2048, 580), Image.LANCZOS)
a = np.asarray(crop).astype(np.float32)
sx, sy = 2048 / 1356, 580 / 384  # preview coords -> texture
m = np.zeros((580, 2048, 3), np.float32)
for shop in range(2):
    ox = 20 + shop * 678  # shop left edge in preview coords, after the 10 px crop
    for (x0, y0, x1, y1), c in [((65, 160, 372, 322), (255, 225, 170)), ((408, 160, 500, 370), (255, 215, 160)),
                                ((540, 125, 630, 322), (255, 225, 170)), ((402, 85, 505, 142), (255, 205, 150))]:
        m[int(y0 * sy):int(y1 * sy), int((x0 + ox - 30) * sx):int((x1 + ox - 30) * sx)] = c
save(seamless(a), 'storefront.jpg')
save(m, 'storefront-mask.png')
pack['storefront'] = {'file': 'storefront.jpg', 'mask': 'storefront-mask.png', 'shops': 2}

pack['sidewalk'] = ground('Create_concrete_sidewalk_art_style_2K_20260923164046.jpeg', 'sidewalk', 1024, 6, shift=0.125)
pack['asphalt'] = ground('Match_dark_grey_city_asphalt_2K_20260923164253.jpeg', 'asphalt', 1024, 9)
pack['roof'] = ground('Flat_tar-paper_rooftop_texture_2K_20260923164625.jpeg', 'roof', 1024, 8)
json.dump(pack, open(OUT + 'pack.json', 'w'), indent=2)
print(json.dumps(pack, indent=1))
