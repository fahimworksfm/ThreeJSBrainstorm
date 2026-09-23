// Open-world style overlays: the full-screen map (Tab) and the ride wheel (hold V).
import { D } from './config.js';

/** A big, north-up map of the whole neighborhood with everything marked. */
export class BigMap {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'bigmap';
    this.el.innerHTML = `
      <canvas></canvas>
      <div class="bm-head"><div class="bm-boro"></div><div class="bm-name"></div></div>
      <div class="bm-legend">
        <span><i class="you"></i>You</span><span><i class="mem"></i>Memory</span>
        <span><i class="st"></i>Station</span><span><i class="el"></i>Train line</span>
      </div>
      <div class="bm-hint">Tab to close</div>`;
    document.body.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.open = false;
  }

  toggle(world, player, yaw) {
    this.open = !this.open;
    this.el.classList.toggle('show', this.open);
    if (this.open) this.draw(world, player, yaw);
    return this.open;
  }

  close() {
    this.open = false;
    this.el.classList.remove('show');
  }

  draw(world, player, yaw) {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = innerWidth;
    const h = innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, w, h);
    this.el.querySelector('.bm-boro').textContent = world.def.borough;
    this.el.querySelector('.bm-name').textContent = world.def.name;

    // what to fit on screen
    let x0;
    let x1;
    let z0;
    let z1;
    const im = world.mapImage;
    if (im) {
      [x0, x1, z0, z1] = [im.x0, im.x0 + im.w, im.z0, im.z0 + im.h];
    } else {
      [x0, x1, z0, z1] = [D.xMin - 40, D.xMax + 40, D.zMin - 40, D.zMax + 40];
    }
    const pad = 70;
    const s = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (z1 - z0));
    const ox = (w - (x1 - x0) * s) / 2 - x0 * s;
    const oz = (h - (z1 - z0) * s) / 2 - z0 * s;
    ctx.save();
    ctx.translate(ox, oz);
    ctx.scale(s, s);
    ctx.fillStyle = '#2b3340';
    ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    if (im) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im.canvas, im.x0, im.z0, im.w, im.h);
    } else {
      if (D.riverX !== null) {
        ctx.fillStyle = '#3e6a96';
        ctx.fillRect(x0, z0, D.riverX - x0, z1 - z0);
      }
      if (D.parkZ1 !== null) {
        ctx.fillStyle = '#6f8f6a';
        ctx.fillRect(x0, z0, x1 - x0, D.parkZ1 - z0);
      }
      for (const b of world.layout.blocks) {
        ctx.fillStyle = '#5d6c82';
        ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
        ctx.fillStyle = b.park ? '#6f8f6a' : '#8fa3bd';
        const sw = D.sidewalk;
        ctx.fillRect(b.x0 + sw, b.z0 + sw, b.x1 - b.x0 - 2 * sw, b.z1 - b.z0 - 2 * sw);
      }
      if (D.el) {
        ctx.setLineDash(D.el.underground ? [12 / s, 9 / s] : []);
        ctx.strokeStyle = '#b48cff';
        ctx.lineWidth = 5 / s;
        ctx.beginPath();
        if (D.el.axis === 'ns') {
          ctx.moveTo(D.colX(D.el.index), z0);
          ctx.lineTo(D.colX(D.el.index), z1);
        } else {
          ctx.moveTo(x0, D.rowZ(D.el.index));
          ctx.lineTo(x1, D.rowZ(D.el.index));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const dot = (x, z, r, fill, stroke = '#111') => {
      ctx.beginPath();
      ctx.arc(x, z, r / s, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2 / s;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    };
    for (const e of world.elevated.entrances) dot(e.x, e.z, 6, '#2ecc71');
    for (const it of world.memories.items) {
      if (it.done) continue;
      const { x, z } = it.g.position;
      const r = 9 / s;
      ctx.beginPath();
      ctx.moveTo(x, z - r);
      ctx.lineTo(x + r, z);
      ctx.lineTo(x, z + r);
      ctx.lineTo(x - r, z);
      ctx.closePath();
      ctx.fillStyle = '#f5c518';
      ctx.fill();
      ctx.lineWidth = 2 / s;
      ctx.strokeStyle = '#111';
      ctx.stroke();
    }
    // you, pointing where the camera looks
    ctx.translate(player.pos.x, player.pos.z);
    ctx.rotate(-yaw);
    ctx.scale(1 / s, 1 / s);
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fillStyle = '#f5c518';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }
}

const RIDES = [
  { mode: 'walk', label: 'On foot', icon: '🚶' },
  { mode: 'bike', label: 'Bicycle', icon: '🚲' },
  { mode: 'moto', label: 'Motorcycle', icon: '🏍️' },
  { mode: 'suv', label: 'SUV', icon: '🚙' },
];

/** Hold V: a radial wheel; flick the mouse toward a ride and let go. */
export class RideWheel {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'ridewheel';
    this.el.innerHTML = `<div class="rw-ring">${RIDES.map(
      (r, k) => `<div class="rw-slot" data-k="${k}" style="--a:${k * 90}deg"><span class="rw-icon">${r.icon}</span><span class="rw-label">${r.label}</span></div>`,
    ).join('')}<div class="rw-center"></div></div>`;
    document.body.appendChild(this.el);
    this.slots = [...this.el.querySelectorAll('.rw-slot')];
    // without mouse capture (or on a trackpad) you can just point at a ride
    this.slots.forEach((el, k) => el.addEventListener('pointerenter', () => this.open && this.choose(k)));
    this.center = this.el.querySelector('.rw-center');
    this.open = false;
    this.vx = 0;
    this.vy = 0;
    this.pick = -1;
  }

  show(current) {
    this.open = true;
    this.vx = this.vy = 0;
    this.pick = RIDES.findIndex((r) => r.mode === current);
    this.el.classList.add('show');
    this.render();
  }

  /** Feed mouse movement (pixels); picks the slot the flick points at. */
  steer(dx, dy) {
    this.vx = Math.max(-80, Math.min(80, this.vx + dx));
    this.vy = Math.max(-80, Math.min(80, this.vy + dy));
    if (Math.hypot(this.vx, this.vy) > 25) {
      // slots sit at 0 (top), 90 (right), 180 (bottom), 270 (left) degrees
      const a = (Math.atan2(this.vx, -this.vy) * 180) / Math.PI;
      this.pick = ((Math.round(a / 90) % 4) + 4) % 4;
      this.render();
    }
  }

  choose(k) {
    this.pick = k;
    this.render();
  }

  hide() {
    this.open = false;
    this.el.classList.remove('show');
    return RIDES[this.pick]?.mode ?? null;
  }

  render() {
    this.slots.forEach((s, k) => s.classList.toggle('on', k === this.pick));
    this.center.textContent = RIDES[this.pick]?.label ?? '';
  }
}
