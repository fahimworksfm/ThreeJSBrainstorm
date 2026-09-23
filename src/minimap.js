import { D } from './config.js';

const W = 250;
const H = 160;
const CX = W / 2;
const CY = H * 0.6; // you sit a little low, so more of what's ahead shows
const RANGE = 150; // meters from center to the side edge

/** A rotating street map: blocks, parks, stations, memories and you. */
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.timer = 0;
  }

  setWorld(world) {
    this.world = world;
  }

  update(dt, pos, yaw) {
    this.timer -= dt;
    if (this.timer > 0 || !this.world) return;
    this.timer = 0.08;
    const { ctx } = this;
    const { layout, elevated, memories } = this.world;
    const s = W / 2 / RANGE;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#9aa0a8'; // streets
    ctx.fillRect(0, 0, W, H);
    ctx.translate(CX, CY);
    ctx.rotate(yaw); // heading always points up
    ctx.scale(s, s);
    ctx.translate(-pos.x, -pos.z);

    if (this.world.mapImage) {
      // real map: one pre-drawn picture of the whole neighborhood
      const im = this.world.mapImage;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im.canvas, im.x0, im.z0, im.w, im.h);
      const dot = (x, z, r, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, z, r / s, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const e of elevated.entrances) dot(e.x, e.z, 3.5, '#2ecc71');
      for (const it of memories.items) if (!it.done) dot(it.g.position.x, it.g.position.z, 4, '#18b8e8');
      ctx.restore();
      this.drawYou(yaw);
      return;
    }
    if (D.riverX !== null) {
      ctx.fillStyle = '#2f5d8a';
      ctx.fillRect(D.riverX - 4000, pos.z - 4000, 4000, 8000);
    }
    if (D.parkZ1 !== null) {
      ctx.fillStyle = '#3f6a3a';
      ctx.fillRect(pos.x - 4000, D.parkZ1 - 4000, 8000, 4000);
    }
    const near = (b) => Math.abs((b.x0 + b.x1) / 2 - pos.x) < RANGE * 2 && Math.abs((b.z0 + b.z1) / 2 - pos.z) < RANGE * 2;
    for (const b of layout.blocks) {
      if (!near(b)) continue;
      ctx.fillStyle = '#4a4f58'; // sidewalk
      ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      ctx.fillStyle = b.park ? '#3f6a3a' : '#2b2f37';
      const sw = D.sidewalk;
      ctx.fillRect(b.x0 + sw, b.z0 + sw, b.x1 - b.x0 - 2 * sw, b.z1 - b.z0 - 2 * sw);
    }
    // the elevated line (dashed where it runs underground)
    ctx.setLineDash(D.el.underground ? [10 / s, 8 / s] : []);
    ctx.strokeStyle = '#9b7fd1';
    ctx.lineWidth = 3 / s;
    ctx.beginPath();
    if (D.el.axis === 'ns') {
      const x = D.colX(D.el.index);
      ctx.moveTo(x, pos.z - 1000);
      ctx.lineTo(x, pos.z + 1000);
    } else {
      const z = D.rowZ(D.el.index);
      ctx.moveTo(pos.x - 1000, z);
      ctx.lineTo(pos.x + 1000, z);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const dot = (x, z, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, z, r / s, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const e of elevated.entrances) dot(e.x, e.z, 3.5, '#2ecc71');
    for (const it of memories.items) if (!it.done) dot(it.g.position.x, it.g.position.z, 4, '#18b8e8');
    ctx.restore();
    this.drawYou(yaw);
  }

  drawYou(yaw) {
    const { ctx } = this;
    // you
    ctx.save();
    ctx.translate(CX, CY);
    ctx.fillStyle = '#1aa3ff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    // north marker on the rim
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(yaw);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.arc(0, -CY + 12, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText('N', 0, -CY + 12.5);
    ctx.restore();
  }
}

/** A compass strip across the top of the screen, with markers for memories and stations. */
export class Compass {
  constructor(canvas) {
    this.canvas = canvas;
    const dpr = Math.min(devicePixelRatio, 2);
    this.w = 360;
    this.h = 34;
    canvas.width = this.w * dpr;
    canvas.height = this.h * dpr;
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
  }

  update(yaw, pos, world) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12,10,14,0.82)';
    ctx.fillRect(0, 4, w, h - 8);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 5, w - 2, h - 10);
    // heading: yaw 0 looks north (-z); compass angle grows clockwise
    const heading = (-yaw * 180) / Math.PI;
    const span = 140; // degrees visible
    const xOf = (deg) => {
      let d = ((deg - heading + 540) % 360) - 180;
      return Math.abs(d) > span / 2 ? null : w / 2 + (d / span) * w;
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 15) {
      const x = xOf(deg);
      if (x === null) continue;
      const major = deg % 90 === 0;
      if (major) {
        ctx.fillStyle = deg === 0 ? '#f5c518' : '#fff';
        ctx.font = "18px Bangers, Impact, sans-serif";
        ctx.fillText('NESW'[deg / 90], x, h / 2 + 1);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(x - 1, h / 2 - (deg % 45 === 0 ? 5 : 3), 2, deg % 45 === 0 ? 10 : 6);
      }
    }
    const mark = (x, z, color, shape) => {
      const deg = (Math.atan2(x - pos.x, -(z - pos.z)) * 180) / Math.PI;
      const sx = xOf(deg);
      if (sx === null) return;
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (shape === 'diamond') {
        ctx.moveTo(sx, 6);
        ctx.lineTo(sx + 6, 12);
        ctx.lineTo(sx, 18);
        ctx.lineTo(sx - 6, 12);
      } else ctx.arc(sx, 12, 4.5, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    if (world) {
      for (const it of world.memories.items) if (!it.done) mark(it.g.position.x, it.g.position.z, '#f5c518', 'diamond');
      for (const e of world.elevated.entrances) mark(e.x, e.z, '#2ecc71', 'dot');
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 5, h);
    ctx.lineTo(w / 2 + 5, h);
    ctx.lineTo(w / 2, h - 7);
    ctx.fill();
  }
}
