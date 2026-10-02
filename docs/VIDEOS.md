# Video prompts (Gemini / Veo)

Short looping clips that play on surfaces in the game (billboards, TVs, the title screen, memory panels).
Put the finished files in `videos/` at the top of the repo (like `photos/`) with the file names below and push;
they get trimmed, looped, compressed and wired in.

**For every clip**
- Attach the same reference image you used for the texture sheets, so the style matches.
- Make it loop: the last frame should match the first (the prompts ask for it; small mismatches get cross-faded).
- No real brands, logos, celebrities or readable trademarks. Made-up names are fine.
- MP4 is fine. Length: whatever the tool makes (usually 8 s); it gets trimmed.

---

## 1. Title screen loop — `title.mp4` (16:9)
```
Match the art style of the attached image. A slow, seamless looping shot of a New York City street at golden
hour: brick walk-ups with fire escapes, an elevated subway track overhead, warm sun low between the buildings,
long shadows, a few pedestrians walking, pigeons lifting off the sidewalk, steam rising from a manhole. The
camera drifts very slowly forward down the middle of the street. Graphic novel illustration, clean black ink
linework, flat cel shading, subtle halftone texture, warm muted colors. No text, no logos. The last frame
matches the first frame so it loops seamlessly.
```

## 2-4. Times Square billboards — `billboard-1.mp4`, `billboard-2.mp4`, `billboard-3.mp4` (16:9)
```
Match the art style of the attached image. A looping animated billboard advertisement for a made-up NYC
product: [1: a neon-colored energy soda called "ZAP!" with fizzing bubbles and lightning bolts]
[2: a fictional Broadway musical called "MIDNIGHT ON MOTT STREET" with dancers silhouetted under a spotlight]
[3: a made-up sneaker brand "KICKSTAND" with a sneaker spinning and comic speed lines]. Flat front-on view that
fills the whole frame like a screen, bold comic-book colors, big simple shapes, heavy black outlines, halftone
dots. No real brands or logos. The last frame matches the first frame so it loops seamlessly.
```
(Generate each bracket separately.)

## 5. TV in a window — `tv.mp4` (4:3)
```
Match the art style of the attached image. A looping clip of what's on an old TV in a corner deli: a local
weather forecast with a cartoon weather map of New York City, a sun and cloud icons sliding across, a
temperature in big numbers. Flat front-on view filling the frame like a screen, slight scanlines, warm colors,
comic-book linework. No real channel logos. The last frame matches the first frame so it loops seamlessly.
```

## 6-8. Memory panels — `memory-hydrant.mp4`, `memory-stoop.mp4`, `memory-train.mp4` (1:1)
```
Match the art style of the attached image. A short looping comic-panel animation, like a page that has come
alive: [6: kids laughing and running through the spray of an open fire hydrant on a hot summer evening]
[7: an old man and a young woman sitting on a brownstone stoop at dusk, sharing a slice of pizza, the
streetlight flickering on] [8: an elevated subway train rushing past a lit apartment window at night, a cat
watching from the sill]. Thick black panel border around the edges, graphic novel illustration, clean ink
linework, flat cel shading, halftone texture, warm nostalgic colors. Gentle motion only. The last frame matches
the first frame so it loops seamlessly.
```

---

## Optional extras
- **Steam / smoke overlay** — `steam.mp4` (9:16): `White steam rising and curling from a street manhole, drawn in a comic-book style with ink outlines, on a solid flat bright green (#00FF00) background, nothing else in the frame, seamless loop.` (the green gets keyed out)
- **Neighborhood loading cards** — `card-<neighborhood>.mp4` (16:9), e.g. `card-coney.mp4`: `Match the art style of the attached image. The Coney Island boardwalk at sunset, the Wonder Wheel slowly turning, gulls drifting, seamless loop.` One per neighborhood you like.
