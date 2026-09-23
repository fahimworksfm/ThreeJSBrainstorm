# Prepare a generated texture sheet: python3 scripts/texture-sheet.py <image> <name> <width> <height> [mask]
# Resizes to the game grid, cross-fades the wrap seams, and (with "mask") pulls a night-window mask from the glass.
import sys
from PIL import Image, ImageFilter
import numpy as np
src, name, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
out = 'public/textures/'  # run from the repo root
im = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
# soften the wrap seams: cross-fade a thin band with the opposite edge
B = 12
for axis in (0, 1):
    n = a.shape[axis]
    for i in range(B):
        t = 0.5 * (1 - i / B)
        lo = np.take(a, i, axis=axis).copy()
        hi = np.take(a, n - 1 - i, axis=axis).copy()
        idx_lo = [slice(None)] * 3; idx_lo[axis] = i
        idx_hi = [slice(None)] * 3; idx_hi[axis] = n - 1 - i
        a[tuple(idx_lo)] = lo * (1 - t) + hi * t
        a[tuple(idx_hi)] = hi * (1 - t) + lo * t
Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(out + name + '.jpg', quality=90)
if len(sys.argv) > 5:
    # night mask: the low-saturation glass inside the window frames
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    glass = ((r - b) < 60) & (r > 95) & (r < 200) & ((g - b) > -5)
    m = Image.fromarray((glass * 255).astype(np.uint8))
    m = m.filter(ImageFilter.BoxBlur(6)).point(lambda v: 255 if v > 190 else 0)
    m = m.filter(ImageFilter.MaxFilter(5))
    m.save(out + name + '-mask.png', optimize=True)
    print('mask coverage', (np.asarray(m) > 0).mean())
