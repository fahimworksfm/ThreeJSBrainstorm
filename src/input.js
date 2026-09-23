/**
 * One input layer for every device.
 * Desktop: WASD + pointer-locked mouse. Phones and tablets: a floating joystick on the
 * left half, drag to look on the right half, and a few big buttons.
 */
export const IS_TOUCH =
  typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);

const JOY_RADIUS = 56;

export class Input extends EventTarget {
  constructor(dom) {
    super();
    this.dom = dom;
    this.touch = IS_TOUCH;
    this.keys = {};
    this.lookX = 0;
    this.lookY = 0;
    this.joy = { x: 0, y: 0 };
    this.run = false; // touch "hurry" toggle
    this.active = false;

    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.active && !e.repeat) this.emit('key', e.code);
    });
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    addEventListener('blur', () => (this.keys = {}));
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.touch) return;
      const locked = document.pointerLockElement === this.dom;
      if (locked !== this.active) {
        this.active = locked;
        this.emit(locked ? 'start' : 'pause');
      }
    });
    if (this.touch) this.buildTouchUI();
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  start() {
    if (this.touch) {
      if (!this.active) {
        this.active = true;
        document.body.classList.add('playing');
        this.emit('start');
      }
      return;
    }
    const p = this.dom.requestPointerLock?.();
    p?.catch?.(() => {});
  }

  pause() {
    if (this.touch) {
      if (this.active) {
        this.active = false;
        document.body.classList.remove('playing');
        this.joy.x = this.joy.y = 0;
        this.emit('pause');
      }
      return;
    }
    document.exitPointerLock?.();
  }

  /** Movement axes, -1..1: x = right, y = forward. */
  axes() {
    const k = this.keys;
    let x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    if (Math.abs(this.joy.x) > Math.abs(x)) x = this.joy.x;
    if (Math.abs(this.joy.y) > Math.abs(y)) y = this.joy.y;
    return { x, y };
  }

  get sprint() {
    return !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.run);
  }

  get brake() {
    return !!this.keys.Space;
  }

  /** Accumulated look movement in mouse pixels since the last call. */
  consumeLook() {
    const d = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return d;
  }

  buildTouchUI() {
    document.body.classList.add('touch');
    const ui = document.createElement('div');
    ui.id = 'touch';
    ui.innerHTML = `
      <div class="zone left"></div>
      <div class="zone right"></div>
      <div class="joy"><div class="knob"></div></div>
      <div class="buttons">
        <button data-act="action" class="act hidden">Train</button>
        <button data-act="run">Run</button>
        <button data-act="camera">View</button>
        <button data-act="vehicle" class="big">Ride</button>
      </div>
      <button data-act="pause" class="pause" aria-label="Pause">❚❚</button>`;
    document.body.append(ui);
    const joy = ui.querySelector('.joy');
    const knob = ui.querySelector('.knob');
    let joyId = null;
    let origin = null;
    const left = ui.querySelector('.zone.left');
    left.addEventListener('pointerdown', (e) => {
      if (joyId !== null) return;
      joyId = e.pointerId;
      left.setPointerCapture(e.pointerId);
      origin = { x: e.clientX, y: e.clientY };
      joy.style.left = `${e.clientX}px`;
      joy.style.top = `${e.clientY}px`;
      joy.classList.add('on');
    });
    left.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > JOY_RADIUS) {
        dx *= JOY_RADIUS / d;
        dy *= JOY_RADIUS / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // small dead zone, then full range
      const f = (v) => (Math.abs(v) < 6 ? 0 : v / JOY_RADIUS);
      this.joy.x = f(dx);
      this.joy.y = -f(dy);
    });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      this.joy.x = this.joy.y = 0;
      knob.style.transform = '';
      joy.classList.remove('on');
    };
    left.addEventListener('pointerup', endJoy);
    left.addEventListener('pointercancel', endJoy);

    const right = ui.querySelector('.zone.right');
    const looks = new Map();
    right.addEventListener('pointerdown', (e) => {
      right.setPointerCapture(e.pointerId);
      looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    right.addEventListener('pointermove', (e) => {
      const last = looks.get(e.pointerId);
      if (!last) return;
      // touch drags are shorter than mouse moves: scale them up
      this.lookX += (e.clientX - last.x) * 2.2;
      this.lookY += (e.clientY - last.y) * 2.2;
      looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const endLook = (e) => looks.delete(e.pointerId);
    right.addEventListener('pointerup', endLook);
    right.addEventListener('pointercancel', endLook);

    for (const b of ui.querySelectorAll('button')) {
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'run') {
          this.run = !this.run;
          b.classList.toggle('on', this.run);
        } else if (act === 'pause') this.pause();
        else this.emit('button', act);
      });
    }
    this.actionButton = ui.querySelector('[data-act="action"]');
  }

  /** Show or hide the context button (e.g. "Take the train"). */
  setAction(label) {
    if (!this.actionButton) return;
    this.actionButton.classList.toggle('hidden', !label);
    if (label) this.actionButton.textContent = label;
  }
}
