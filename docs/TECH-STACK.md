# Tech stack: what we use, and what else is out there

## What the game uses today

| Piece | Why |
| --- | --- |
| **three.js** (`WebGLRenderer`, WebGL 2) | Runs in every modern desktop and phone browser |
| **Vite** | Dev server and production build (a static `dist/` folder) |
| Custom post-processing | Depth-based ink outlines, cel bands, halftone shadows, speed lines, bloom |
| Web Audio API | All sound is synthesized; no audio files |
| Canvas 2D | All textures (facades, signs, awnings, asphalt) are drawn in code |

Everything is free and open source.

## Free tools to push the look further

**Engines and renderers (in the browser)**
- **three.js `WebGPURenderer` + TSL**: three.js's newer backend. Faster on big scenes and supports compute
  shaders (GPU crowds, particles, grass). Our custom shaders would need porting to TSL (three.js's shader language).
- **Babylon.js**: a full web game engine with a node material editor, physics and a good inspector.
- **PlayCanvas**: web engine with a free online editor (open-source engine; the hosted editor has free tiers).
- **React Three Fiber + drei**: three.js through React; lots of ready-made helpers.
- **Godot 4** (web export): a full free game engine; the web export is heavier but works on desktop and many phones.

**Art pipeline (this is what closes the gap to the reference images)**
- **Blender**: model hero buildings, cars, props and the main character; bake painted textures; export glTF.
- **Mixamo**: free rigged characters and walk/run/idle animations (Adobe account needed).
- **Quaternius**, **Kenney**, **Poly Pizza**: free (CC0) low-poly characters, cars, city kits.
- **Poly Haven**: free CC0 textures and HDR skies.
- **Krita** / **GIMP**: hand-paint textures and sign art in the comic style.
- **glTF-Transform**, **gltfpack (meshoptimizer)**, **KTX2 / Basis Universal**: shrink models and textures so they
  load fast on phones.

**Rendering and animation helpers for three.js**
- **pmndrs/postprocessing**: faster effect composer with SSAO, depth of field, LUT color grading and more.
- **three-mesh-bvh**: fast raycasts and collisions against real building meshes.
- **Rapier** (WASM physics): proper vehicle physics, ragdolls, collisions.
- **Theatre.js** or **GSAP**: keyframed camera moves and cutscenes, like a comic movie intro.
- **three.js AnimationMixer**: plays the Mixamo animations on a skinned character.

**Real geography (for "all of NYC")**
- **OpenStreetMap** data via Overpass or Geofabrik extracts: every street, building footprint and height in the city.
  A build step can turn it into neighborhood tiles for the same generator.
- **NYC Open Data** (building footprints, street trees, subway entrances): free and very detailed.

## Hosting

The build is a plain static site (`npm run build` → `dist/`), so any static host works for free:

- **Vercel**: import the GitHub repo; it detects Vite. `vercel.json` is included.
- **Render**: New → Blueprint, pick the repo; `render.yaml` sets up a free static site.
- **Netlify**, **Cloudflare Pages**, **GitHub Pages** also work the same way.

No server is needed until we add multiplayer or accounts.

## Phones

- The game detects touch screens and switches to on-screen controls, lighter rendering (no MSAA, no street
  reflections, fewer raindrops, half-resolution bloom) and turns off sun shadows.
- Dynamic resolution lowers the render scale when the frame rate drops below ~45 fps and raises it again when there
  is headroom.
- It fills any screen: portrait phones get a wider vertical field of view; desktops fill the window.
- "Add to Home Screen" installs it as a full-screen app (web manifest and icons included). iPhones don't allow the
  Fullscreen API in Safari, so the home-screen install is the way to get full screen there.
