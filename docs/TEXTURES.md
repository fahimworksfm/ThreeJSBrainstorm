# Hand-drawn texture sheets

The game builds every building, sidewalk and storefront from generated textures. You can replace any of them
with hand-drawn (or AI-generated) sheets: put the images in `public/textures/` and list them in
`public/textures/pack.json`. Whatever isn't listed keeps the generated texture, so you can add sheets one at a time.

## The rules that make a sheet work in 3D

1. **Flat and straight-on.** An elevation drawing: no perspective, no vanishing point, no sky, no ground.
2. **Seamless.** The left edge must continue into the right edge and the top into the bottom, so a wall can repeat.
3. **Even light.** No sun direction, no cast shadows, no dark corners. The game lights the walls itself for every
   time of day.
4. **A window mask for night.** For facades and storefronts, make a second image the same size: pure black, with
   only the window glass (or shop glass and signs) painted white. That's what glows after dark.
5. **Plain parapet at the top.** Leave the top ~3% of each facade sheet as plain wall color; roofs borrow it.

## The sheets

| Key in pack.json | What it is | Size | Grid |
| --- | --- | --- | --- |
| `facade-brick` | red/brown brick walk-up, sash windows, lintels, AC units, no fire escapes | 1024 × 1536 | 4 window bays × 4 floors |
| `facade-stone` | tan limestone / brownstone front with cornice details | 1024 × 1536 | 4 × 4 |
| `facade-deco` | cream art-deco apartment building, geometric trim | 1024 × 1536 | 4 × 4 |
| `facade-siding` | Queens row house: pastel vinyl siding, white window frames | 1024 × 1536 | 4 × 4 |
| `facade-tudor` | Forest Hills Tudor: cream stucco, dark half-timber beams and braces, leaded diamond-pane windows | 1024 × 1536 | 4 × 4 |
| `facade-office` | grey stone office tower, window grid | 1024 × 1536 | 4 × 4 |
| `facade-glass` | blue glass curtain wall with mullions | 1024 × 1536 | 4 × 4 |
| `storefront` | a row of shop fronts at street level (glass, doors, roll-down gates, no signs above) | 2048 × 512 | 4 shops |
| `sidewalk` | concrete sidewalk slabs seen from straight above, cracks, gum spots | 1024 × 1024 | covers 3 m × 3 m |

One window bay is 2.4 m wide and one floor is 3.6 m tall, which is why a 4 × 4 facade sheet is 2:3 (e.g. 1024 × 1536).

## pack.json

```json
{
  "facade-brick": { "file": "facade-brick.png", "mask": "facade-brick-mask.png", "cols": 4, "rows": 4 },
  "facade-stone": { "file": "facade-stone.png", "mask": "facade-stone-mask.png", "cols": 4, "rows": 4 },
  "storefront": { "file": "storefront.png", "mask": "storefront-mask.png", "shops": 4 },
  "sidewalk": { "file": "sidewalk.png", "meters": 3 }
}
```

`cols`/`rows` say how many window bays and floors your sheet shows; `shops` how many shop fronts; `meters` how
much ground the sidewalk sheet covers.

## Prompts that work well

Keep the style words identical across every sheet so they match each other and the rest of the game:

> **Style block:** comic book illustration, bold black ink linework, flat cel shading, halftone dot texture,
> warm muted colors, Spider-Verse / graphic novel style

- **Facade:** `seamless tileable texture, orthographic front elevation of a New York brick walk-up apartment
  building, exactly 4 windows across and 4 floors tall, sash windows with stone lintels, a few AC units, flat and
  straight-on, no perspective, even lighting, no shadows, no sky, no ground, [style block]`, at 2:3.
- **Window mask:** give the tool the facade and ask: `same image, pure black background, only the window glass
  filled solid white, nothing else` (or paint it yourself in any editor: select the glass and fill white).
- **Storefront strip:** `seamless tileable texture, orthographic front view of 4 New York shop fronts side by side
  at street level, glass windows, doors, rolled-up metal gates, no signs, flat, even lighting, [style block]`, at 4:1.
- **Sidewalk:** `seamless tileable texture, top-down view of New York concrete sidewalk slabs with expansion
  joints, small cracks and gum spots, flat even lighting, [style block]`, square.

If your tool has a "tile" or "seamless" option, turn it on. Then drop the files in `public/textures/`, deploy,
and check the browser console for `texture pack: N hand-drawn sheets`.

## Color grade (a LUT)

Grade the whole game like a photo, in any editor that can adjust colors (Photopea is free, Photoshop, Affinity, GIMP):

1. Take a screenshot of the game at the time of day you want to grade (press **P** for photo mode to hide the HUD).
2. Open it, then paste `docs/lut-neutral.png` (a thin 1024 × 32 strip of every color) into an empty corner **as its own layer, at 100% size, not scaled**.
3. Make your adjustments as adjustment layers over **everything** (curves, color balance, hue/saturation, selective color, gradient maps...). Only global color changes work: no blur, grain, vignette, or painting.
4. When the screenshot looks the way you want, hide the screenshot layer, crop to the strip (exactly 1024 × 32) and export it as `grade.png`.
5. Put it in `public/textures/` and add to `pack.json`:
   ```json
   "lut": { "file": "grade.png", "intensity": 1 }
   ```
   `intensity` from 0 to 1 blends between no grade and the full grade. A `.cube` file from DaVinci Resolve or Photoshop (File → Export → Color Lookup Tables) works too: `{ "file": "grade.cube" }`.

Settings → Comic style → **Color grade** turns it on and off to compare.
