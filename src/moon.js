// The real moon over New York: where it is and how much of it is lit, from the low-precision lunar formulas
// (the ones SunCalc uses, after Meeus; good to about a degree, plenty for a sky), drawn as a comic moon with
// the right side lit and the right shape of terminator for tonight's phase.
import * as THREE from 'three';

const RAD = Math.PI / 180;
const E = RAD * 23.4397; // the tilt of the earth's axis

const days = (date) => date.getTime() / 864e5 - 0.5 + 2440588 - 2451545; // since J2000
const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d); // ecliptic longitude
  const M = RAD * (134.963 + 13.064993 * d); // mean anomaly
  const F = RAD * (93.272 + 13.22935 * d); // mean distance
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { ra: ra(L, 0), dec: dec(L, 0) };
}

/**
 * The moon at date from (lat, lon): az (degrees clockwise from north), el (degrees above the horizon), lit
 * (the fraction of the disc lit, 0 new to 1 full) and waxing (lit on the right, as New York sees it).
 */
export function moonPosition(date, lat, lon) {
  const d = days(date);
  const m = moonCoords(d);
  const phi = RAD * lat;
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - m.ra; // hour angle
  const el = Math.asin(Math.sin(phi) * Math.sin(m.dec) + Math.cos(phi) * Math.cos(m.dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(m.dec) * Math.cos(phi));
  // how lit: the angle between the sun and the moon as seen from here
  const s = sunCoords(d);
  const sdist = 149598000;
  const p = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(p), m.dist - sdist * Math.cos(p));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  // the refraction near the horizon lifts it by about half a degree
  const elDeg = el / RAD + (el > -0.02 ? 0.017 / Math.tan(el + 0.00312536 / (el + 0.08901179)) : 0);
  return { az: (az / RAD + 180 + 360) % 360, el: elDeg, lit: (1 + Math.cos(inc)) / 2, waxing: angle < 0 };
}

/** What people call tonight's moon. */
export function phaseName({ lit, waxing }) {
  if (lit < 0.03) return 'new moon';
  if (lit > 0.97) return 'full moon';
  if (Math.abs(lit - 0.5) < 0.06) return waxing ? 'first quarter moon' : 'last quarter moon';
  return `${waxing ? 'waxing' : 'waning'} ${lit < 0.5 ? 'crescent' : 'gibbous'}`;
}

/** The comic moon: a pale disc with craters and an ink outline, dark where the night side is. */
function drawMoon(canvas, lit, waxing) {
  const S = canvas.width;
  const g = canvas.getContext('2d');
  const r = S * 0.44;
  g.clearRect(0, 0, S, S);
  g.save();
  g.translate(S / 2, S / 2);
  // the night side, faintly there (earthshine)
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(40, 48, 70, 0.55)';
  g.fill();
  // the lit part: from the top round the lit limb to the bottom, then back up along the terminator
  const side = waxing ? 1 : -1;
  const e = r * (1 - 2 * lit) * side; // the terminator's half-width (+ toward the lit side while a crescent)
  g.beginPath();
  for (let k = 0; k <= 32; k++) {
    const t = -Math.PI / 2 + (k / 32) * Math.PI;
    g.lineTo(side * r * Math.cos(t), r * Math.sin(t));
  }
  for (let k = 0; k <= 32; k++) {
    const t = Math.PI / 2 - (k / 32) * Math.PI;
    g.lineTo(e * Math.cos(t), r * Math.sin(t));
  }
  g.closePath();
  g.save();
  g.clip();
  g.fillStyle = '#f6efcf';
  g.fillRect(-r, -r, 2 * r, 2 * r);
  // the seas and a few craters, in the places people know them
  g.fillStyle = 'rgba(160, 150, 120, 0.45)';
  for (const [x, y, s] of [[-0.25, -0.3, 0.28], [0.15, -0.15, 0.22], [0.3, 0.2, 0.18], [-0.1, 0.15, 0.2], [-0.35, 0.3, 0.12], [0.05, 0.45, 0.08]]) {
    g.beginPath();
    g.ellipse(x * r, y * r, s * r, s * r * 0.8, 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(120, 110, 90, 0.6)';
  g.lineWidth = S * 0.012;
  for (const [x, y, s] of [[0.42, -0.42, 0.07], [-0.5, 0.05, 0.06], [0.2, 0.6, 0.05], [0.55, 0.15, 0.04]]) {
    g.beginPath();
    g.arc(x * r, y * r, s * r, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  // ink outline round the whole disc
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.lineWidth = S * 0.035;
  g.strokeStyle = '#141018';
  g.stroke();
  g.restore();
}

/** A soft round glow around the moon on clear nights. */
function drawGlow(canvas) {
  const S = canvas.width;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255, 245, 210, 0.55)');
  grad.addColorStop(0.35, 'rgba(255, 240, 200, 0.16)');
  grad.addColorStop(1, 'rgba(255, 240, 200, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
}

const DIST = 3000;
// about nine times its real size in the sky, comic-book style: a real-size moon is a dot on a phone
const SIZE = 2 * DIST * Math.tan(2.3 * RAD);

export class Moon {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    drawGlow(glowCanvas);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const basic = { transparent: true, depthWrite: false, fog: false, toneMapped: false };
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: this.tex, ...basic }));
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 4, SIZE * 4), new THREE.MeshBasicMaterial({ map: glowTex, blending: THREE.AdditiveBlending, ...basic }));
    this.group = new THREE.Group();
    this.group.add(this.glow, this.disc);
    this.group.traverse((o) => {
      o.frustumCulled = false;
      o.userData.noTerrain = true;
      o.renderOrder = -2; // before the city's transparent things
    });
    this.drawn = null;
    this.now = null;
  }

  /**
   * Put the moon in the sky. pos: moonPosition(); dir: the unit vector toward it in world space; night: 0 by
   * day to 1 at night; clear: 0 overcast to 1 clear.
   */
  update(camera, pos, dir, night, clear) {
    this.now = pos;
    const key = `${pos.lit.toFixed(2)}|${pos.waxing}`;
    if (key !== this.drawn) {
      drawMoon(this.canvas, pos.lit, pos.waxing);
      this.tex.needsUpdate = true;
      this.drawn = key;
    }
    const up = pos.el > -1.5;
    this.group.visible = up;
    if (!up) return;
    this.group.position.copy(camera.position).addScaledVector(dir, DIST);
    this.disc.lookAt(camera.position);
    this.glow.quaternion.copy(this.disc.quaternion);
    // pale by day (the real moon is often up in the afternoon), bright at night; clouds cover it
    this.disc.material.opacity = (0.3 + 0.7 * night) * (0.25 + 0.75 * clear);
    this.glow.material.opacity = night * clear * (0.25 + 0.75 * pos.lit);
  }
}
