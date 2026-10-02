#!/usr/bin/env python3
"""Turns the AI-generated clips and images in aiImages/ into game media in public/media/.

Videos (MP4 and WebM): trimmed to 8 s and made to loop seamlessly (the last second is cross-faded into the start), scaled
down, muted, H.264 with fast start. Images: the lightning trimmed to the bolt, the logo keyed off its green background, the badge sheet cut into
a 5 x 4 sprite of round icons.

    pip install imageio-ffmpeg pillow numpy && python3 scripts/process-media.py
"""
import glob
import os
import subprocess

import numpy as np
from PIL import Image

try:
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FF = 'ffmpeg'

SRC = 'aiImages'
OUT = 'public/media'
os.makedirs(OUT, exist_ok=True)

# output name: (source file prefix, width, crf)
VIDEOS = {
    'title': ('New_York_City_street_scene_20261002013707', 1280, 30),
    'billboard-zap': ('Animated_energy_soda_billboard', 640, 30),
    'billboard-kickstand': ('Animated_sneaker_billboard', 640, 30),
    'billboard-musical': ('Dancers_perform_under_spotlight', 640, 30),
    'fireworks': ('Animated_fireworks_loop', 640, 30),
    'tv': ('Animated_weather_forecast_on_TV', 480, 31),
    'neon': ('Neon_signs_flickering', 640, 30),
    'steam': ('White_comic_steam_rising', 480, 31),
    'memory-hydrant': ('Kids_playing_in_water_spray', 640, 30),
    'memory-stoop': ('Man_and_woman_on_stoop', 640, 30),
    'memory-train': ('Cat_watching_passing_subway_train', 640, 30),
    'subway-window': ('Train_passing_city_buildings', 960, 30),
    'card-coney': ('Wonder_Wheel_turning_at_Coney', 960, 30),
    # the clip is a green square inside a gray frame: cut the square out
    'smoke': ('Gray_grill_smoke_rising', 384, 31, 'crop=568:568:356:76,'),
}


def source(prefix):
    hits = sorted(glob.glob(f'{SRC}/{prefix}*.mp4'))
    return hits[0] if hits else None


def loop_video(src, dst, width, crf, pre=''):
    # 8 s of the clip (1 s to 9 s), with the clip's first second cross-faded over its last second, so the
    # final frame flows straight back into the first
    graph = (
        f'[0:v]{pre}scale={width}:-2,fps=24,split[a][b];'
        '[a]trim=start=1:end=9,setpts=PTS-STARTPTS,fps=24,settb=1/24[main];'
        '[b]trim=start=0:end=1,setpts=PTS-STARTPTS,fps=24,settb=1/24[head];'
        '[main][head]xfade=transition=fade:duration=1:offset=7,format=yuv420p[v]'
    )
    subprocess.run([FF, '-loglevel', 'error', '-y', '-i', src, '-filter_complex', graph, '-map', '[v]', '-an',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-movflags', '+faststart', dst], check=True)
    # and VP9 WebM, for the browsers that can't play H.264 (open-source Chromium, some Linux Firefox builds)
    subprocess.run([FF, '-loglevel', 'error', '-y', '-i', src, '-filter_complex', graph, '-map', '[v]', '-an',
                    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', str(crf + 8), '-row-mt', '1', '-deadline', 'good',
                    '-cpu-used', '2', dst.replace('.mp4', '.webm')], check=True)


for name, (prefix, width, crf, *pre) in VIDEOS.items():
    src = source(prefix)
    if not src:
        print(f'media: no source for {name}')
        continue
    dst = f'{OUT}/{name}.mp4'
    webm = dst.replace('.mp4', '.webm')
    if os.path.exists(webm) and os.path.getmtime(webm) > os.path.getmtime(src):
        continue
    loop_video(src, dst, width, crf, *pre)
    print(f'media: {name} mp4 {os.path.getsize(dst) // 1024} KB, webm {os.path.getsize(webm) // 1024} KB')


def key_green(im):
    """Green-screen to transparent, with the green spill pulled off the edges."""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    greenness = g - np.maximum(r, b)
    alpha = np.clip(1 - (greenness - 40) / 60, 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b) + 10)  # despill
    out = np.dstack([a, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


logo = glob.glob(f'{SRC}/Night_Walker_comic_logo*.jpg')
if logo:
    im = key_green(Image.open(logo[0]))
    im = im.crop(im.getbbox())
    im.thumbnail((900, 900))
    im.save(f'{OUT}/logo.png', optimize=True)
    print('media: logo.png', im.size)

sheet = glob.glob(f'{SRC}/Comic_book_badge_icons_grid*.jpg')
if sheet:
    im = Image.open(sheet[0]).convert('RGB')
    a = np.asarray(im).astype(int)
    # the icons are drawn with heavy black rings: each column and row of icons is a run of dark ink with
    # clear paper between, so cut each icon from its own run
    dark = (a.sum(axis=2) < 200)

    def runs(v):
        on, out, s = v > 3, [], None
        for i, x in enumerate(on):
            if x and s is None:
                s = i
            if not x and s is not None:
                out.append((s, i))
                s = None
        if s is not None:
            out.append((s, len(v)))
        return [r for r in out if r[1] - r[0] > 40]

    xs, ys = runs(dark.sum(axis=0)), runs(dark.sum(axis=1))
    nx, ny = len(xs), len(ys)
    S = 128
    sprite = Image.new('RGBA', (S * nx, S * ny), (0, 0, 0, 0))
    mask = Image.new('L', (S, S), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((1, 1, S - 2, S - 2), fill=255)
    for j in range(ny):
        for i in range(nx):
            box = (xs[i][0] - 2, ys[j][0] - 2, xs[i][1] + 2, ys[j][1] + 2)
            cell = im.crop(box).resize((S, S), Image.LANCZOS).convert('RGBA')
            cell.putalpha(mask)
            sprite.paste(cell, (i * S, j * S))
    sprite.save(f'{OUT}/badges.png', optimize=True)
    print('media: badges.png', sprite.size)

# lightning: drawn on black, so they're added onto the sky as they are; trimmed to the bolt and scaled
for name, pattern, size in (('lightning-strike', 'Lightning_strike_graphic*', 1024), ('lightning-bolt', 'Lightning_bolt_striking*', 512)):
    hit = glob.glob(f'{SRC}/{pattern}.jpg')
    if not hit:
        continue
    im = Image.open(hit[0]).convert('RGB')
    a = np.asarray(im.convert('L')) > 40
    ys, xs = np.where(a)
    im = im.crop((max(0, xs.min() - 8), max(0, ys.min() - 8), min(im.width, xs.max() + 8), min(im.height, ys.max() + 8)))
    im.thumbnail((size, size))
    im.save(f'{OUT}/{name}.jpg', quality=82)
    print(f'media: {name}.jpg', im.size)

# the hero's face for the HUD badge: the front view of the portrait sheet, the paper background cleared
face = glob.glob(f'{SRC}/character/Character_portrait*.jpg')
if face:
    from PIL import ImageDraw
    im = Image.open(face[0]).convert('RGB')
    w, h = im.size
    # the front view fills the left half: a square on the face
    s = int(h * 0.64)
    cx, cy = int(w * 0.265), int(h * 0.4)
    im = im.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2))
    # flood the light paper from the corners, through anything close to its color
    mask = Image.new('L', im.size, 0)
    work = im.copy()
    edge = [(x, 0) for x in range(0, im.width, 6)] + [(0, y) for y in range(0, im.height, 6)] + [(im.width - 1, y) for y in range(0, im.height, 6)]
    for pt in edge:
        if min(work.getpixel(pt)) > 200:  # still paper (not hair, not already flooded)
            ImageDraw.floodfill(work, pt, (255, 0, 255), thresh=28)
    a = np.asarray(work)
    keep = ~((a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255))
    out = im.convert('RGBA')
    out.putalpha(Image.fromarray((keep * 255).astype(np.uint8)))
    out = out.resize((256, 256), Image.LANCZOS)
    out.save(f'{OUT}/portrait.png', optimize=True)
    print('media: portrait.png', out.size)
