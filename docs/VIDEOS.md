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

---

# More prompts (set 2)

## Videos

**Neon signs** — `neon-pizza.mp4`, `neon-open.mp4`, `neon-liquors.mp4`, `neon-hotel.mp4` (16:9, on black)
```
A glowing neon sign that says "[PIZZA / OPEN 24 HRS / LIQUORS / HOTEL]" in classic New York neon tube lettering,
front-on, filling the frame, on a pure black background. The tubes hum and flicker now and then, one letter
buzzing off and back on. Bright saturated pink, red and blue glow with soft bloom. No other objects, no text but
the sign. The last frame matches the first frame so it loops seamlessly.
```
(Black background = it gets added as light, so it glows over any wall.)

**Subway ride window** — `subway-window.mp4` (16:9)
```
Match the art style of the attached image. The view out of an elevated subway car window at golden hour: rooftops,
water towers, brick walls and fire escapes sliding past from right to left, the sun flashing between buildings,
the window frame and a grab pole in the foreground. Graphic novel illustration, ink linework, flat cel shading,
halftone texture. The last frame matches the first frame so it loops seamlessly.
```

**Halal cart smoke** — `cart-smoke.mp4` (9:16, on green)
```
Grill smoke rising and curling from a street food cart, drawn in a comic-book style with ink outlines and soft
gray tones, on a solid flat bright green (#00FF00) background, nothing else in the frame, seamless loop.
```

**Fireworks for the Fourth** — `fireworks.mp4` (16:9, on black)
```
Comic-book style fireworks bursting in red, white, gold and blue against a pure black sky, starbursts with ink
outlines and halftone sparkles, several bursts at different heights, no ground, no buildings, seamless loop.
```

**Lightning** — `lightning.mp4` (9:16, on black)
```
A jagged comic-book lightning bolt striking down from the top of the frame, bright white-violet with a thick ink
outline and a quick double flash, on a pure black background, nothing else, then dark again. Seamless loop.
```

## Neighborhood loading cards — `card-<id>.mp4` (16:9)
One prompt, swap in the scene. Start with:
`Match the art style of the attached image. [SCENE] at golden hour, gentle motion, graphic novel illustration, ink linework, flat cel shading, halftone texture, no text. The last frame matches the first frame so it loops seamlessly.`

| file | SCENE |
| --- | --- |
| `card-astoria.mp4` | the elevated N train rumbling over 31st Street, Greek bakeries below |
| `card-jackson-heights.mp4` | the 7 train on the el over Roosevelt Avenue, sari shops and food carts |
| `card-sunnyside.mp4` | the big Sunnyside sign arching over Queens Boulevard, the 7 train passing |
| `card-lic.mp4` | the old Pepsi-Cola sign on the waterfront with the Manhattan skyline across the river |
| `card-flushing.mp4` | busy Main Street with red lanterns and the 7 train terminal |
| `card-forest-hills.mp4` | Tudor houses and a quiet tree-lined street, leaves drifting |
| `card-jamaica.mp4` | Jamaica Avenue shops and the AirTrain gliding overhead |
| `card-rockaway.mp4` | surfers and the boardwalk at Rockaway Beach, waves rolling in |
| `card-midtown.mp4` | Times Square billboards glowing, yellow cabs streaming past |
| `card-harlem.mp4` | the Apollo marquee on 125th Street, people on the sidewalk |
| `card-chinatown.mp4` | Mott Street with lanterns strung overhead, steam from a dumpling shop |
| `card-les.mp4` | tenements with fire escapes and a pickle shop awning on Orchard Street |
| `card-williamsburg.mp4` | the Williamsburg Bridge at sunset, bikes on the path |
| `card-bed-stuy.mp4` | brownstone stoops with neighbors chatting, a kid on a bike |
| `card-coney.mp4` | the Wonder Wheel turning on the Coney Island boardwalk, gulls drifting |
| `card-mott-haven.mp4` | brick row houses and the elevated train crossing into the Bronx |
| `card-fordham.mp4` | Fordham Road shops and the university's stone towers |
| `card-city-island.mp4` | fishing boats bobbing at the dock by a seafood shack |
| `card-st-george.mp4` | the orange Staten Island Ferry pulling into the terminal, Manhattan behind |

## Images (Nano Banana)

**Badge icons** — one sheet, 1:1, a 5 x 4 grid
```
Match the art style of the attached image. A sheet of 20 round comic-book badge icons in a 5 by 4 grid on a plain
white background, evenly spaced, each a thick ink circle with one simple picture inside: a heart, a brain, the
Statue of Liberty, a bridge, a scroll, a spray can, a subway car, a fire extinguisher, a camera, a scooter, a dollar
bill, a bicycle, a pizza slice, a postcard, a flame, an owl, a sunset over a rooftop, a check mark, a stopwatch, a
cat. Bold flat colors, halftone shading, no text.
```

**Game logo** — 21:9, on green
```
The words "NIGHT WALKER" as a bold comic-book title logo, chunky hand-inked letters with a yellow-to-orange
gradient, a thick black outline, a slight 3D drop, small halftone dots, and a tiny New York skyline silhouette
tucked under the letters, on a solid flat bright green (#00FF00) background.
```

**Postcard frame** — 3:2
```
A vintage New York City postcard frame: cream paper with a deckled edge, a thin red-and-blue airmail border, a
little stamp in the top right corner with a pigeon on it, and a big empty blank area in the middle for a picture.
Flat, front-on, drawn in a comic-book style with ink lines. No text.
```
