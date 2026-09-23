import * as THREE from 'three';
import { rand, range, pick, chance } from './random.js';

// Facade texture tile: 16 windows x 32 floors
export const TILE_COLS = 16;
export const TILE_ROWS = 32;
const CELL = 32;
export const WIN_W = 2.4;
export const FLOOR_H = 3.6;
export const TILE_W = TILE_COLS * WIN_W;
export const TILE_H = TILE_ROWS * FLOOR_H;
export const SHOP_TILE_W = 73.6; // storefront strip: 8 shops of 9.2m

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(canvas, { repeat = true, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const WARM = ['#ffd59a', '#ffc47a', '#ffe6bf', '#ffb766', '#fff0d6'];
const COOL = ['#e4ecff', '#cfdcff', '#f5f8ff', '#bcd0ff'];
const TV = ['#7fa6ff', '#8fd0ff', '#b28cff'];

export const FACADE_STYLES = {
  brick: { wall: '#3c2723', mx: 10, my: 8, lit: 0.3, palette: WARM, floorBias: 0.15 },
  stone: { wall: '#4a463f', mx: 8, my: 7, lit: 0.27, palette: WARM, floorBias: 0.2 },
  deco: { wall: '#5a5241', mx: 11, my: 5, lit: 0.25, palette: WARM, floorBias: 0.2 },
  office: { wall: '#24272d', mx: 3, my: 7, lit: 0.2, palette: COOL, floorBias: 0.6 },
  glass: { wall: '#0d1420', mx: 1, my: 9, lit: 0.15, palette: COOL, floorBias: 0.7 },
  siding: { wall: '#80858b', mx: 9, my: 8, lit: 0.33, palette: WARM, floorBias: 0.1, siding: true },
};

/** Facade color map + emissive (lit windows) map for one building style. */
export function makeFacade(style) {
  const s = FACADE_STYLES[style];
  const W = TILE_COLS * CELL;
  const H = TILE_ROWS * CELL;
  const cm = makeCanvas(W, H);
  const ce = makeCanvas(W, H);
  const m = cm.getContext('2d');
  const e = ce.getContext('2d');
  m.fillStyle = s.wall;
  m.fillRect(0, 0, W, H);
  for (let k = 0; k < 5000; k++) {
    m.fillStyle = chance(0.5) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    m.fillRect(2 + rand() * (W - 4), 2 + rand() * (H - 4), 2, 2);
  }
  if (s.siding) {
    for (let y = 0; y < H; y += 4) {
      m.fillStyle = 'rgba(0,0,0,0.12)';
      m.fillRect(0, y, W, 1);
    }
  }
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  for (let row = 0; row < TILE_ROWS; row++) {
    const r = rand();
    const floorMode = r < s.floorBias ? (chance(0.45) ? 'lit' : 'dark') : 'mixed';
    const floorColor = pick(s.palette);
    for (let col = 0; col < TILE_COLS; col++) {
      const x = col * CELL + s.mx;
      const y = row * CELL + s.my;
      const w = CELL - 2 * s.mx;
      const h = CELL - 2 * s.my;
      const g = m.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#161c27');
      g.addColorStop(1, '#07090d');
      m.fillStyle = g;
      m.fillRect(x, y, w, h);
      m.fillStyle = 'rgba(0,0,0,0.35)';
      m.fillRect(x, y + h, w, 2);

      const lit =
        floorMode === 'lit' ? chance(0.85) : floorMode === 'dark' ? chance(0.03) : chance(s.lit);
      if (!lit) continue;
      const c = chance(0.06) ? pick(TV) : floorMode === 'lit' ? floorColor : pick(s.palette);
      e.globalAlpha = range(0.45, 1);
      e.fillStyle = c;
      e.fillRect(x, y, w, h);
      if (chance(0.4)) {
        // half-drawn blinds
        e.globalAlpha = 0.75;
        e.fillStyle = '#000';
        e.fillRect(x, y, w, h * range(0.2, 0.7));
      }
      if (chance(0.1)) {
        // someone standing at the window
        e.globalAlpha = 0.85;
        e.fillStyle = '#000';
        e.fillRect(x + w * range(0.2, 0.6), y + h * 0.4, Math.max(2, w * 0.2), h * 0.6);
      }
      e.globalAlpha = 1;
      m.globalAlpha = 0.55;
      m.fillStyle = c;
      m.fillRect(x, y, w, h);
      m.globalAlpha = 1;
    }
  }
  return { map: canvasTexture(cm), emissiveMap: canvasTexture(ce) };
}

/** Ground-floor shops: 8 storefronts in one strip. */
export function makeStorefront() {
  const W = 2048;
  const H = 128;
  const cm = makeCanvas(W, H);
  const ce = makeCanvas(W, H);
  const m = cm.getContext('2d');
  const e = ce.getContext('2d');
  m.fillStyle = '#1b1714';
  m.fillRect(0, 0, W, H);
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  const awnings = ['#7a1420', '#0f3d2a', '#1d2c5c', '#5a3a12', '#3b1250', '#202020'];
  for (let s = 0; s < 8; s++) {
    const x0 = s * 256;
    m.fillStyle = '#0d0b0a';
    m.fillRect(x0, 0, 4, H);
    if (chance(0.3)) {
      // closed: roll-down gate with graffiti
      m.fillStyle = '#383b40';
      m.fillRect(x0 + 12, 30, 232, 98);
      for (let y = 32; y < H; y += 5) {
        m.fillStyle = 'rgba(0,0,0,0.35)';
        m.fillRect(x0 + 12, y, 232, 1);
      }
      for (let k = 0; k < 4; k++) {
        m.strokeStyle = pick(['#c8316b', '#2fb3d6', '#e8d23a', '#e8e8e8', '#58d25c']);
        m.lineWidth = range(2, 5);
        m.beginPath();
        let gx = x0 + range(30, 200);
        let gy = range(55, 115);
        m.moveTo(gx, gy);
        for (let q = 0; q < 6; q++) {
          gx += range(-25, 30);
          gy += range(-18, 18);
          m.lineTo(gx, Math.min(125, Math.max(35, gy)));
        }
        m.stroke();
      }
      e.fillStyle = '#ffcf8a';
      e.globalAlpha = 0.5;
      e.fillRect(x0 + 118, 22, 20, 5);
      e.globalAlpha = 1;
      continue;
    }
    const warm = chance(0.7);
    const glow = warm ? pick(['#ffe2b0', '#ffd08a', '#fff1d6']) : pick(['#e8f4ff', '#d6ffe8', '#fff']);
    // shop window
    const wx = x0 + 14;
    const wy = 36;
    const ww = 168;
    const wh = 84;
    for (const [ctx, a] of [[m, 0.5], [e, 0.6]]) {
      ctx.globalAlpha = a;
      ctx.fillStyle = glow;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillRect(x0 + 196, 40, 44, 88); // door
      ctx.globalAlpha = 1;
    }
    // shelves and products
    for (let y = wy + 14; y < wy + wh; y += 18) {
      e.fillStyle = 'rgba(0,0,0,0.55)';
      e.fillRect(wx, y, ww, 3);
      for (let x = wx + 4; x < wx + ww - 8; x += range(6, 14)) {
        e.fillStyle = `hsla(${range(0, 360)},70%,55%,0.9)`;
        e.fillRect(x, y - range(5, 12), range(3, 7), 12);
      }
    }
    e.fillStyle = 'rgba(0,0,0,0.6)';
    e.fillRect(wx, wy, 3, wh);
    e.fillRect(wx + ww - 3, wy, 3, wh);
    e.fillRect(x0 + 216, 40, 3, 88);
    // awning with stripes
    const aw = pick(awnings);
    m.fillStyle = aw;
    m.fillRect(x0 + 8, 6, 240, 26);
    if (chance(0.5)) {
      m.fillStyle = 'rgba(255,255,255,0.18)';
      for (let x = x0 + 8; x < x0 + 248; x += 20) m.fillRect(x, 6, 10, 26);
    }
    e.fillStyle = glow;
    e.globalAlpha = 0.25;
    e.fillRect(x0 + 8, 22, 240, 10);
    e.globalAlpha = 1;
  }
  return { map: canvasTexture(cm), emissiveMap: canvasTexture(ce) };
}

/** Neon tube text with glow on a transparent background. */
export function makeNeon(word, color, vertical = false) {
  const font = 'bold 76px "Trebuchet MS", "Arial Black", sans-serif';
  const pad = 40;
  let c;
  if (vertical) {
    c = makeCanvas(128, pad * 2 + word.length * 92);
  } else {
    const probe = makeCanvas(8, 8).getContext('2d');
    probe.font = font;
    c = makeCanvas(Math.ceil(probe.measureText(word).width + pad * 2), 140);
  }
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const draw = (fn) => {
    if (vertical) {
      [...word].forEach((ch, k) => fn(ch, c.width / 2, pad + 46 + k * 92));
    } else fn(word, c.width / 2, c.height / 2 + 4);
  };
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  draw((t, x, y) => ctx.strokeText(t, x, y));
  ctx.shadowBlur = 10;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#fff';
  ctx.globalAlpha = 0.85;
  draw((t, x, y) => ctx.strokeText(t, x, y));
  ctx.globalAlpha = 1;
  // tube border
  ctx.shadowBlur = 18;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  const tex = canvasTexture(c, { repeat: false });
  return { tex, aspect: c.width / c.height };
}

/** Radial white spot with alpha falloff (light pools, glows). */
export function makeRadial(size = 128, falloff = 1.6) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - d, falloff);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { repeat: false });
}

/** Vertical fade: opaque at the bottom, clear at the top. */
export function makeBeam() {
  const c = makeCanvas(4, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return canvasTexture(c, { repeat: false });
}

/** Headlight throw on the road: bright near the car, fading forward. */
export function makeHeadlightBeam() {
  const c = makeCanvas(64, 128);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 64; x++) {
      const along = 1 - y / 127; // 1 near car (bottom of canvas)
      const spread = 0.25 + 0.75 * (1 - along);
      const dx = Math.abs((x + 0.5) / 64 - 0.5) * 2;
      const a = Math.max(0, 1 - dx / spread) * Math.pow(along, 0.8) * Math.min(1, (1 - along) * 6);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { repeat: false });
}

/** Tileable value-noise fBm. R/G: large-scale, B: fine grain. */
export function makeNoise(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const layer = (freq) => {
    const g = new Float32Array(freq * freq).map(() => rand());
    const at = (x, y) => g[((y + freq) % freq) * freq + ((x + freq) % freq)];
    return (u, v) => {
      const x = u * freq;
      const y = v * freq;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      let fx = x - x0;
      let fy = y - y0;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
      return a + (b - a) * fy;
    };
  };
  const fbm = (freqs) => {
    const ls = freqs.map(layer);
    return (u, v) => {
      let s = 0;
      let amp = 0.5;
      let tot = 0;
      for (const l of ls) {
        s += l(u, v) * amp;
        tot += amp;
        amp *= 0.5;
      }
      return s / tot;
    };
  };
  const r = fbm([4, 8, 16, 32]);
  const gch = fbm([8, 16, 32, 64]);
  const b = fbm([64, 128]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      data[i] = r(u, v) * 255;
      data[i + 1] = gch(u, v) * 255;
      data[i + 2] = b(u, v) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Sidewalk flags, 2x2 per tile (tile = 3m). */
export function makeSidewalk() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6a6a6e';
  ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 6000; k++) {
    const v = Math.floor(range(70, 125));
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  // gum spots and stains
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(30,30,32,${range(0.2, 0.5)})`;
    ctx.beginPath();
    ctx.arc(rand() * 256, rand() * 256, range(1, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,20,22,0.8)';
  ctx.fillRect(0, 0, 256, 3);
  ctx.fillRect(0, 128, 256, 3);
  ctx.fillRect(0, 0, 3, 256);
  ctx.fillRect(128, 0, 3, 256);
  return canvasTexture(c);
}

export function makeStripes() {
  const c = makeCanvas(64, 128);
  const ctx = c.getContext('2d');
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? '#f2f2ee' : '#ff6a13';
    ctx.fillRect(0, k * 16, 64, 16);
  }
  return canvasTexture(c);
}

export function makeStreetSign(text) {
  const c = makeCanvas(512, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f6b3a';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = '#e8f2ec';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 84);
  ctx.fillStyle = '#f2f7f4';
  ctx.font = 'bold 54px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52, 480);
  return canvasTexture(c, { repeat: false });
}

export function makePostcard() {
  const c = makeCanvas(256, 170);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3e7cf';
  ctx.fillRect(0, 0, 256, 170);
  ctx.strokeStyle = '#b8864a';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 244, 158);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(196, 16, 42, 50);
  ctx.fillStyle = '#f3e7cf';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillText('NYC', 202, 46);
  ctx.strokeStyle = '#3a2c1c';
  ctx.lineWidth = 2;
  for (let y = 40; y < 150; y += 18) {
    ctx.beginPath();
    ctx.moveTo(18, y);
    let x = 18;
    while (x < 180) {
      x += range(6, 14);
      ctx.lineTo(x, y + range(-3, 3));
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(128, 80, 2, 76);
  return canvasTexture(c, { repeat: false });
}

/** Broken, rippled light streak for reflections on the river (bright at u=0). */
export function makeStreak() {
  const c = makeCanvas(256, 32);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 32);
  const bands = Array.from({ length: 256 }, () => (rand() < 0.35 ? 0.15 : range(0.5, 1)));
  for (let y = 0; y < 32; y++) {
    const edge = Math.sin((Math.PI * (y + 0.5)) / 32);
    for (let x = 0; x < 256; x++) {
      const u = x / 255;
      const a = Math.pow(1 - u, 1.4) * bands[x] * edge;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { repeat: false });
}
