// The hand-made animated clips in public/media/ (made by scripts/process-media.py): short muted loops for
// the title screen, the loading card, the memory panels, and the screens and signs around the city.
import * as THREE from 'three';

// H.264 where the browser has it (smaller files); VP9 WebM where it doesn't (open-source Chromium, some Linux builds)
const probe = document.createElement('video');
const EXT = probe.canPlayType('video/mp4; codecs="avc1.42E01E"') ? 'mp4' : 'webm';
const url = (name) => `media/${name}.${EXT}`;

const videos = new Map();
const textures = new Map();
const stalled = new Set();

/** Some browsers refuse autoplay until the first tap: start anything that stalled then. */
function retry() {
  for (const v of stalled) v.play().then(() => stalled.delete(v), () => {});
}
addEventListener('pointerdown', retry);
addEventListener('keydown', retry);

function play(v) {
  const p = v.play();
  p?.catch?.(() => stalled.add(v));
}

/** One shared looping video element per clip ('neon', 'tv', ...). */
export function clip(name) {
  let v = videos.get(name);
  if (!v) {
    v = document.createElement('video');
    v.src = url(name);
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    videos.set(name, v);
  }
  if (v.paused) play(v);
  return v;
}

/** The clip as a texture for the 3D city. A blank (black) frame until the video has data. */
export function clipTexture(name) {
  let t = textures.get(name);
  if (!t) {
    t = new THREE.VideoTexture(clip(name));
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    textures.set(name, t);
  }
  clip(name); // playing again if a neighborhood change paused it
  return t;
}

/** Pause the clips nobody can see (on leaving a neighborhood); they start again when next used. */
export function pauseAll(keep = []) {
  for (const [name, v] of videos) {
    if (keep.includes(name)) continue;
    v.pause();
  }
}

/** Play an element-hosted clip (title screen, loading card, memory panel) in a <video> already on the page. */
export function show(el, name) {
  if (!el) return;
  const src = url(name);
  if (!el.getAttribute('src')?.endsWith(src)) el.src = src;
  el.muted = true;
  el.loop = true;
  el.playsInline = true;
  el.hidden = false;
  play(el);
}

export function hide(el) {
  if (!el) return;
  el.pause();
  el.hidden = true;
}
