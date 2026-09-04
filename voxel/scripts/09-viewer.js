/* ---------------------------------------------------------------------------
   The turntable.

   Attach one to a <canvas> and you get a model you can spin: drag to orbit,
   wheel or pinch to zoom, arrow keys when it has focus, and an idle spin that
   starts again a moment after you let go. This is the piece a game page would
   actually reuse — the gallery is just eighty of them in a grid.

   Three things keep eighty of them cheap:
     · one shared requestAnimationFrame loop drives every viewer, so the page
       has one frame budget rather than eighty competing ones;
     · an IntersectionObserver parks anything scrolled off screen — parked
       viewers cost nothing at all;
     · a viewer only redraws when something changed, so a still model with the
       spin turned off costs one frame and then nothing.

   Reduced-motion is honoured: the idle spin never starts, and dragging still
   works, because turning a model by hand is the point of the page.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
if (typeof window === 'undefined') return;

const meshes = new Map();
/** Build (and remember) the mesh for a model. Keyed by name, so rebuilds reuse. */
function meshFor(model, key) {
  const id = key || model.name;
  let mesh = meshes.get(id);
  if (!mesh || mesh.voxels !== model.cells.size) {
    mesh = VOX.mesh(model);
    meshes.set(id, mesh);
  }
  return mesh;
}

const reduceMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

const active = new Set();
let frame = 0;
let last = 0;

function tick(now) {
  frame = 0;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
  last = now;
  let wants = false;
  for (const viewer of active) {
    if (viewer.update(dt)) wants = true;
  }
  if (wants) schedule();
  else last = 0;
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(tick);
}

const DEFAULTS = {
  yaw: 32, pitch: 22, zoom: 0.94, spin: true, spinSpeed: 22,
  minPitch: -80, maxPitch: 85, minZoom: 0.4, maxZoom: 4,
  resumeAfter: 2.5, maxPixels: 620, interactive: true,
};

class Viewer {
  constructor(canvas, model, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.options = Object.assign({}, DEFAULTS, options);
    this.yaw = this.options.yaw;
    this.pitch = this.options.pitch;
    this.zoom = this.options.zoom;
    this.spin = this.options.spin && !reduceMotion.matches;
    this.dirty = true;
    this.visible = true;
    this.idle = this.options.resumeAfter;
    this.dragging = false;
    this.pointers = new Map();
    this.pinch = 0;
    this.setModel(model, options.meshKey);

    if (this.options.interactive) this.bind();
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) this.visible = entry.isIntersecting;
        if (this.visible) { this.dirty = true; schedule(); }
      }, { rootMargin: '160px' });
      this.observer.observe(canvas);
    }
    active.add(this);
    schedule();
  }

  setModel(model, key) {
    this.model = model;
    this.mesh = meshFor(model, key);
    this.dirty = true;
    schedule();
    return this;
  }

  /** Point the camera at a named face of the model. */
  face(name) {
    const angles = {
      front: [0, 12], back: [180, 12], left: [-90, 12], right: [90, 12],
      top: [32, 78], bottom: [32, -60], corner: [32, 22],
    };
    const [yaw, pitch] = angles[name] || angles.corner;
    this.yaw = yaw; this.pitch = pitch;
    this.dirty = true; this.idle = 0;
    schedule();
    return this;
  }

  reset() {
    this.yaw = this.options.yaw; this.pitch = this.options.pitch;
    this.zoom = this.options.zoom;
    this.dirty = true; schedule();
    return this;
  }

  /* --------------------------------------------------------------- input */

  bind() {
    const canvas = this.canvas;
    canvas.style.touchAction = 'none';
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;

    this.onDown = event => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.dragging = true;
      this.idle = 0;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    };
    this.onMove = event => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size >= 2) {
        const [a, b] = Array.from(this.pointers.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.setZoom(this.zoom * (distance / this.pinch));
        this.pinch = distance;
        return;
      }
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      this.yaw -= dx * 0.55;
      this.pitch = Math.max(this.options.minPitch, Math.min(this.options.maxPitch, this.pitch + dy * 0.45));
      this.dirty = true; this.idle = 0;
      schedule();
    };
    this.onUp = event => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      if (!this.pointers.size) { this.dragging = false; canvas.classList.remove('is-dragging'); }
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };
    this.onWheel = event => {
      event.preventDefault();
      this.setZoom(this.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
      this.idle = 0;
    };
    this.onKey = event => {
      const step = event.shiftKey ? 15 : 5;
      const moves = {
        ArrowLeft: () => { this.yaw -= step; }, ArrowRight: () => { this.yaw += step; },
        ArrowUp: () => { this.pitch = Math.min(this.options.maxPitch, this.pitch + step); },
        ArrowDown: () => { this.pitch = Math.max(this.options.minPitch, this.pitch - step); },
        '+': () => this.setZoom(this.zoom * 1.15), '=': () => this.setZoom(this.zoom * 1.15),
        '-': () => this.setZoom(this.zoom / 1.15),
        '0': () => this.reset(),
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      move();
      this.dirty = true; this.idle = 0;
      schedule();
    };

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('keydown', this.onKey);
  }

  setZoom(value) {
    this.zoom = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, value));
    this.dirty = true;
    schedule();
    return this;
  }

  /* -------------------------------------------------------------- drawing */

  update(dt) {
    if (!this.visible) return false;
    /* `idle` starts spent, so a fresh viewer turns straight away; any input
       resets it, which is what makes the spin pause while you are posing a
       model and pick up again a couple of seconds after you let go. */
    if (this.spin && !this.dragging) {
      this.idle += dt;
      if (this.idle >= this.options.resumeAfter) {
        this.yaw += this.options.spinSpeed * dt;
        this.dirty = true;
      }
    }
    if (this.dirty) { this.render(); this.dirty = false; }
    return this.spin || this.dragging;
  }

  render() {
    const canvas = this.canvas;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width || canvas.clientWidth || 200;
    const cssHeight = rect.height || canvas.clientHeight || 200;
    const width = Math.min(this.options.maxPixels, Math.round(cssWidth * ratio));
    const height = Math.min(this.options.maxPixels, Math.round(cssHeight * ratio));
    if (width < 2 || height < 2) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
    }
    const view = {
      yaw: this.yaw, pitch: this.pitch, zoom: this.zoom,
      width, height, projection: this.options.projection || 'perspective',
    };

    const gl = VOX.GL && VOX.GL.shared();
    this.context.clearRect(0, 0, width, height);
    if (gl) {
      gl.draw(this.model.name, this.mesh, view);
      this.context.drawImage(gl.canvas, 0, 0, width, height, 0, 0, width, height);
    } else {
      /* No WebGL2: the same picture, drawn on the CPU at half resolution. */
      const image = VOX.Raster.render(this.mesh, Object.assign({}, view, {
        width: Math.round(width / 2), height: Math.round(height / 2), samples: 1,
      }));
      const data = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
      if (!this.scratch) this.scratch = document.createElement('canvas');
      this.scratch.width = image.width; this.scratch.height = image.height;
      this.scratch.getContext('2d').putImageData(data, 0, 0);
      this.context.imageSmoothingEnabled = true;
      this.context.drawImage(this.scratch, 0, 0, width, height);
    }
  }

  destroy() {
    active.delete(this);
    if (this.observer) this.observer.disconnect();
    const canvas = this.canvas;
    if (this.onDown) {
      canvas.removeEventListener('pointerdown', this.onDown);
      canvas.removeEventListener('pointermove', this.onMove);
      canvas.removeEventListener('pointerup', this.onUp);
      canvas.removeEventListener('pointercancel', this.onUp);
      canvas.removeEventListener('wheel', this.onWheel);
      canvas.removeEventListener('keydown', this.onKey);
    }
  }
}

VOX.Viewer = {
  attach: (canvas, model, options) => new Viewer(canvas, model, options),
  Viewer, meshFor, meshes,
  all: active,
  setSpin(value) { for (const viewer of active) { viewer.spin = value && !reduceMotion.matches; viewer.dirty = true; } schedule(); },
  redraw() { for (const viewer of active) viewer.dirty = true; schedule(); },
};

})(typeof globalThis !== 'undefined' ? globalThis : this);
