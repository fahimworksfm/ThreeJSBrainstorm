// Optional hand-drawn texture pack: drop images in public/textures/ and list them in
// public/textures/pack.json. Anything listed replaces the built-in generated texture;
// anything missing keeps the generated one. See docs/TEXTURES.md.
import * as THREE from 'three';
import { TILE_COLS, TILE_ROWS } from './textures.js';

const black = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export async function loadTexturePack(shared, base = './textures/') {
  let manifest;
  try {
    const r = await fetch(`${base}pack.json`);
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return 0;
    manifest = await r.json();
  } catch {
    return 0;
  }
  const loader = new THREE.TextureLoader();
  const load = async (file, srgb = true) => {
    const t = await loader.loadAsync(base + file);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  let n = 0;
  for (const [key, e] of Object.entries(manifest)) {
    try {
      if (key.startsWith('facade-')) {
        const style = key.slice(7);
        if (!shared.facade[style]) continue;
        // the sheet shows cols window bays x rows floors; the game's facade tile is TILE_COLS x TILE_ROWS
        const map = await load(e.file);
        map.repeat.set(TILE_COLS / (e.cols ?? 4), TILE_ROWS / (e.rows ?? 4));
        let emissiveMap = black;
        if (e.mask) {
          emissiveMap = await load(e.mask, false);
          emissiveMap.repeat.copy(map.repeat);
        }
        shared.facade[style] = { map, emissiveMap, normalMap: null, custom: true };
        n++;
      } else if (key === 'storefront') {
        const map = await load(e.file);
        // the game's storefront strip holds 8 shop fronts
        map.repeat.set(8 / (e.shops ?? 4), 1);
        let emissiveMap = black;
        if (e.mask) {
          emissiveMap = await load(e.mask, false);
          emissiveMap.repeat.copy(map.repeat);
        }
        shared.storefront = { map, emissiveMap };
        n++;
      } else if (key === 'sidewalk' || key === 'asphalt' || key === 'roof') {
        const map = await load(e.file);
        // sidewalk UVs run 1 unit per 3 m; the sheet covers e.meters meters
        map.repeat.setScalar(3 / (e.meters ?? 3));
        shared[key] = map;
        n++;
      }
    } catch (err) {
      console.warn('texture pack: could not load', key, err);
    }
  }
  return n;
}
