import { D } from './config.js';

const SIZE = 180;
const RANGE = 140; // meters from center to edge

/** A rotating street map: blocks, parks, stations, memories and you. */
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
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
    const s = SIZE / 2 / RANGE;
    ctx.save();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#5b5f6b'; // streets
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(yaw); // heading always points up
    ctx.scale(s, s);
    ctx.translate(-pos.x, -pos.z);

    if (D.riverX !== null) {
      ctx.fillStyle = '#3d5f8a';
      ctx.fillRect(D.riverX - 4000, pos.z - 4000, 4000, 8000);
    }
    if (D.parkZ1 !== null) {
      ctx.fillStyle = '#5f8a5a';
      ctx.fillRect(pos.x - 4000, D.parkZ1 - 4000, 8000, 4000);
    }
    const near = (b) => Math.abs((b.x0 + b.x1) / 2 - pos.x) < RANGE * 2 && Math.abs((b.z0 + b.z1) / 2 - pos.z) < RANGE * 2;
    for (const b of layout.blocks) {
      if (!near(b)) continue;
      ctx.fillStyle = '#c9ccd4'; // sidewalk
      ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      ctx.fillStyle = b.park ? '#6f9a66' : '#e9eaee';
      const sw = D.sidewalk;
      ctx.fillRect(b.x0 + sw, b.z0 + sw, b.x1 - b.x0 - 2 * sw, b.z1 - b.z0 - 2 * sw);
    }
    // the elevated line
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
    const dot = (x, z, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, z, r / s, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const e of elevated.entrances) dot(e.x, e.z, 3.5, '#2ecc71');
    for (const it of memories.items) if (!it.done) dot(it.g.position.x, it.g.position.z, 4, '#18b8e8');
    ctx.restore();

    // you
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
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
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(yaw);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.arc(0, -SIZE / 2 + 11, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText('N', 0, -SIZE / 2 + 11.5);
    ctx.restore();
  }
}
