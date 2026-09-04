/* ---------------------------------------------------------------------------
   ClaudeVenture — the stage.

   The voxel maker in /voxel renders one model, framed by its own bounds, on a
   turntable. A game needs the opposite: thirty models at once, each somewhere
   different, all under one camera that does not move when they do. So this is
   a second renderer over the same meshes — `VOX.mesh` still does the greedy
   merge and bakes the ambient occlusion, `VOX.View` still owns the light rig,
   and the shading below is the same arithmetic as voxel/scripts/08-webgl.js in
   the same order. If the rig ever changes there, change it here, or the shop
   stops matching the catalogue it is furnished from.

   What is new is per-draw placement: a translation, a turn about Y and a
   scale, applied in the vertex shader so a mesh is uploaded once and drawn
   anywhere, any number of times, at no cost per instance beyond a draw call.

   The camera is orthographic at a fixed yaw and pitch, which is what makes an
   isometric picture isometric: no perspective divide, so a machine at the back
   of the shop is exactly the size of the same machine at the front, and the
   floor grid stays a grid.

   Two renderers again, for the same reason the gallery has two: WebGL2 where
   it exists, and a software path where it does not. The fallback is not the
   rasteriser running per frame — that would be a slideshow. It bakes each
   mesh to a sprite once, at the scene's own scale and angle, and then the
   frame is a depth-sorted stack of drawImage calls, which is a technique as
   old as isometric games and runs on anything.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const CV = root.CV;
if (!VOX || !CV) throw new Error('ClaudeVenture: load 01-props.js first');
const View = VOX.View;

/* ---------------------------------------------------------------- camera --- */

const DEG = Math.PI / 180;

/**
 * An orthographic camera looking down at `center` from `yaw`/`pitch`.
 * `halfHeight` is how many world units fit above the centre — the only zoom
 * control there is, and the only one an isometric game needs.
 */
function isoCamera(options) {
  const o = Object.assign({
    center: [0, 0, 0], halfHeight: 60, aspect: 1, yaw: 45, pitch: 34, distance: 600,
    pan: [0, 0],
  }, options);
  const yaw = o.yaw * DEG, pitch = o.pitch * DEG;
  const eye = [
    o.center[0] + o.distance * Math.cos(pitch) * Math.sin(yaw),
    o.center[1] + o.distance * Math.sin(pitch),
    o.center[2] + o.distance * Math.cos(pitch) * Math.cos(yaw),
  ];
  const view = View.lookAt(new Float32Array(16), eye, o.center, [0, 1, 0]);
  const projection = View.orthographic(new Float32Array(16), o.halfHeight, o.aspect, 1, o.distance * 2 + 600);
  /* The pan slides the whole picture across the frame in clip space, which is
     what lets the shop sit in the middle of the *visible* floor rather than the
     middle of the canvas when a rail is covering a third of it. */
  projection[12] += o.pan[0];
  projection[13] += o.pan[1];
  const viewProjection = View.multiply(new Float32Array(16), projection, view);
  return {
    viewProjection, view, projection, eye, center: o.center,
    halfHeight: o.halfHeight, yaw: o.yaw, pitch: o.pitch, pan: o.pan,
  };
}

/** World point -> clip -> normalised device coordinates. */
function project(cam, x, y, z) {
  const m = cam.viewProjection;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return {
    x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    z: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  };
}

/**
 * The inverse a game actually needs: a click, turned into the point on the
 * floor it landed on. With an orthographic camera the ray direction is the
 * camera's own forward vector, so this is two dot products and a divide rather
 * than a matrix inversion.
 */
function groundAt(cam, ndcX, ndcY, planeY = 0) {
  const yaw = cam.yaw * DEG, pitch = cam.pitch * DEG;
  /* the camera basis, rebuilt from the angles rather than read back out */
  const forward = [
    -Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw),
  ];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const hw = cam.halfHeight * cam.aspect, hh = cam.halfHeight;
  /* Undo the pan, or every tap lands where the picture would have been. */
  const px = ndcX - (cam.pan ? cam.pan[0] : 0);
  const py = ndcY - (cam.pan ? cam.pan[1] : 0);
  const origin = [
    cam.center[0] + right[0] * px * hw + up[0] * py * hh,
    cam.center[1] + right[1] * px * hw + up[1] * py * hh,
    cam.center[2] + right[2] * px * hw + up[2] * py * hh,
  ];
  if (Math.abs(forward[1]) < 1e-5) return { x: origin[0], z: origin[2] };
  const t = (planeY - origin[1]) / forward[1];
  return { x: origin[0] + forward[0] * t, z: origin[2] + forward[2] * t };
}

/* ------------------------------------------------------------- the GPU --- */

const VERTEX = `#version 300 es
precision highp float;

in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
in float aLight;
in float aMaterial;

uniform mat4 uViewProjection;
uniform vec3 uEye;
uniform vec3 uKey;
uniform vec3 uFill;
uniform vec4 uRig;            // ambient, key, fill, unused
uniform vec4 uPlace;          // x, y, z, scale
uniform vec2 uTurn;           // cos(yaw), sin(yaw)
uniform vec4 uTint;           // rgb multiplier, alpha

out vec4 vColor;

const vec4 SPECULAR = vec4(0.06, 0.0, 0.42, 0.30);
const vec4 GLOSS    = vec4(8.0,  1.0, 26.0, 40.0);

vec3 turn(vec3 p) { return vec3(uTurn.x * p.x + uTurn.y * p.z, p.y, -uTurn.y * p.x + uTurn.x * p.z); }

void main() {
  int material = int(aMaterial + 0.5);
  vec3 world = turn(aPosition * uPlace.w) + uPlace.xyz;
  vec3 normal = turn(aNormal);
  vec3 viewDir = normalize(uEye - world);
  float key = max(dot(normal, uKey), 0.0);
  float fill = max(dot(normal, uFill), 0.0);

  float diffuse = uRig.x + key * uRig.y + fill * uRig.z;
  if (material == 3) diffuse = diffuse * 0.72 + 0.42;
  diffuse *= aLight;

  vec3 halfway = normalize(uKey + viewDir);
  float specular = pow(max(dot(normal, halfway), 0.0), GLOSS[material]) * SPECULAR[material] * aLight;

  if (material == 1) {
    diffuse = (0.94 + key * 0.16) * (0.86 + aLight * 0.14);
    specular = 0.05;
  }

  vColor = vec4((aColor * diffuse + specular) * uTint.rgb, uTint.a);
  gl_Position = uViewProjection * vec4(world, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vec4(clamp(vColor.rgb, 0.0, 1.0) * vColor.a, vColor.a); }`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`stage: shader failed — ${log}`);
  }
  return shader;
}

class GLBackend {
  constructor(canvas) {
        /* preserveDrawingBuffer costs a little on some drivers and buys the one
       thing a smoke test needs: readPixels after the frame has been presented,
       which is the only honest way to assert that the shop actually drew. */
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('stage: no WebGL2');
    this.gl = gl;
    this.label = 'webgl';
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`stage: link failed — ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.attribute = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      color: gl.getAttribLocation(program, 'aColor'),
      light: gl.getAttribLocation(program, 'aLight'),
      material: gl.getAttribLocation(program, 'aMaterial'),
    };
    this.uniform = {};
    for (const name of ['uViewProjection', 'uEye', 'uKey', 'uFill', 'uRig', 'uPlace', 'uTurn', 'uTint']) {
      this.uniform[name] = gl.getUniformLocation(program, name);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    this.uploads = new Map();
  }

  upload(key, mesh) {
    const gl = this.gl;
    const existing = this.uploads.get(key);
    if (existing && existing.count === mesh.count) return existing;
    if (existing) this.free(key);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffers = [];
    const bind = (location, data, size, type, normalise) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, type, normalise, 0, 0);
      buffers.push(buffer);
    };
    bind(this.attribute.position, mesh.position, 3, gl.FLOAT, false);
    bind(this.attribute.normal, mesh.normal, 3, gl.FLOAT, false);
    bind(this.attribute.color, mesh.color, 3, gl.UNSIGNED_BYTE, true);
    bind(this.attribute.light, mesh.light, 1, gl.FLOAT, false);
    bind(this.attribute.material, mesh.material, 1, gl.FLOAT, false);
    gl.bindVertexArray(null);
    const entry = { vao, buffers, count: mesh.count };
    this.uploads.set(key, entry);
    return entry;
  }

  free(key) {
    const entry = this.uploads.get(key);
    if (!entry) return;
    this.gl.deleteVertexArray(entry.vao);
    for (const buffer of entry.buffers) this.gl.deleteBuffer(buffer);
    this.uploads.delete(key);
  }

  frame(width, height, cam, clear) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniform.uViewProjection, false, cam.viewProjection);
    gl.uniform3fv(this.uniform.uEye, cam.eye);
    gl.uniform3fv(this.uniform.uKey, View.LIGHT.key);
    gl.uniform3fv(this.uniform.uFill, View.LIGHT.fill);
    gl.uniform4f(this.uniform.uRig, View.LIGHT.ambient, View.LIGHT.keyStrength, View.LIGHT.fillStrength, 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  draw(entry, place) {
    const gl = this.gl;
    const yaw = (place.yaw || 0) * DEG;
    gl.uniform4f(this.uniform.uPlace, place.x, place.y, place.z, place.scale || 1);
    gl.uniform2f(this.uniform.uTurn, Math.cos(yaw), Math.sin(yaw));
    const tint = place.tint || 1;
    gl.uniform4f(this.uniform.uTint, tint, tint, tint, place.alpha === undefined ? 1 : place.alpha);
    gl.bindVertexArray(entry.vao);
    gl.drawArrays(gl.TRIANGLES, 0, entry.count);
  }

  blendOn() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
  }

  blendOff() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }
}

/* -------------------------------------------------------------- the CPU --- */

/**
 * The software path. Each mesh is rendered once by VOX.Raster, at the scene's
 * own angle and at a fixed number of pixels per voxel, into an offscreen
 * canvas; a frame is then those sprites stacked back to front. Sprites are
 * baked lazily — a couple per frame — so the first seconds fill in rather than
 * freezing, which is the difference between a slow start and a hung tab.
 */
class SoftBackend {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('stage: no 2D context either');
    this.label = 'software';
    this.sprites = new Map();
    this.pending = [];
    this.ppu = 4;
  }

  upload(key, mesh) {
    let entry = this.sprites.get(key);
    if (entry && entry.count === mesh.count) return entry;
    entry = { key, mesh, count: mesh.count, canvas: null, ox: 0, oy: 0 };
    this.sprites.set(key, entry);
    this.pending.push(entry);
    return entry;
  }

  free(key) { this.sprites.delete(key); }

  /** Bake at most `budget` sprites. Called once per frame by the stage. */
  bake(budget = 2) {
    let done = 0;
    while (this.pending.length && done < budget) {
      const entry = this.pending.shift();
      if (!this.sprites.has(entry.key)) continue;
      this.render(entry);
      done++;
    }
    return this.pending.length;
  }

  render(entry) {
    const bounds = entry.mesh.bounds;
    const radius = Math.max(1, Math.hypot(bounds.size[0], bounds.size[1], bounds.size[2]) / 2);
    /* VOX.Raster frames by the mesh's own bounding sphere, so a sprite always
       comes out filling its own square whatever size that square is. The scale
       it was baked at is therefore `size / (radius * 2.4)`, which is the
       requested pixels-per-voxel — unless the clamp bit, and the room mesh
       always makes it bite. Record what was actually achieved and let the draw
       call scale the difference back out; without this the room is baked at
       two thirds scale and every prop floats off its own floor. */
    const size = Math.max(8, Math.min(768, Math.ceil(radius * 2.4 * this.ppu)));
    const zoom = 1.12 * 2 / 2.4;
    const image = VOX.Raster.render(entry.mesh, {
      width: size, height: size, samples: 1, projection: 'orthographic',
      yaw: this.yaw, pitch: this.pitch, zoom,
    });
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.getContext('2d').putImageData(new ImageData(image.data, size, size), 0, 0);
    entry.canvas = canvas;
    entry.ppu = size / (radius * 2.4);
    entry.ox = size / 2;
    entry.oy = size / 2;
    /* The sprite is centred on the mesh's bounds centre, so that is the point
       the stage has to project when it places it. */
    entry.pivot = [
      (bounds.min[0] + bounds.max[0] + 1) / 2,
      (bounds.min[1] + bounds.max[1] + 1) / 2,
      (bounds.min[2] + bounds.max[2] + 1) / 2,
    ];
    return entry;
  }

  frame(width, height, cam, clear) {
    this.cam = cam;
    this.width = width; this.height = height;
    this.yaw = cam.yaw; this.pitch = cam.pitch;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${Math.round(clear[0] * 255)},${Math.round(clear[1] * 255)},${Math.round(clear[2] * 255)})`;
    ctx.fillRect(0, 0, width, height);
    /* Pixels per world unit, read off the camera rather than assumed, so the
       sprites and the placement can never disagree about scale. */
    this.ppu = (height / 2) / cam.halfHeight;
    this.queue = [];
  }

  draw(entry, place) {
    if (!entry.canvas) return;
    const pivot = entry.pivot;
    const scale = place.scale || 1;
    const yaw = (place.yaw || 0) * DEG;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const px = pivot[0] * scale, pz = pivot[2] * scale;
    const world = [
      c * px + s * pz + place.x,
      pivot[1] * scale + place.y,
      -s * px + c * pz + place.z,
    ];
    const ndc = project(this.cam, world[0], world[1], world[2]);
    this.queue.push({
      entry,
      /* The room is the ground everything else stands on: painter's algorithm
         has no way to know that from a bounds centre sitting in the middle of
         the scene, so it is told. */
      depth: place.back ? -1e6 : ndc.z,
      alpha: place.alpha === undefined ? 1 : place.alpha,
      x: (ndc.x * 0.5 + 0.5) * this.width,
      y: (0.5 - ndc.y * 0.5) * this.height,
      scale: scale * (this.ppu / (entry.ppu || this.ppu)),
    });
  }

  /** Painter's algorithm: no depth buffer, so the order is the whole trick. */
  flush() {
    const ctx = this.ctx;
    this.queue.sort((a, b) => a.depth - b.depth);
    for (const item of this.queue) {
      const sprite = item.entry.canvas;
      const w = sprite.width * item.scale, h = sprite.height * item.scale;
      ctx.globalAlpha = item.alpha;
      ctx.drawImage(sprite, Math.round(item.x - w / 2), Math.round(item.y - h / 2), w, h);
    }
    ctx.globalAlpha = 1;
    this.queue.length = 0;
  }

  blendOn() {}
  blendOff() {}
}

/* -------------------------------------------------------------- the stage --- */

class Stage {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.dpr = 1;
    this.meshes = new Map();
    this.models = new Map();
    this.clear = options.clear || [0.07, 0.07, 0.09];
    this.yaw = options.yaw === undefined ? 45 : options.yaw;
    this.pitch = options.pitch === undefined ? 36 : options.pitch;
    this.center = options.center || [0, 8, 0];
    this.halfHeight = options.halfHeight || 60;
    this.pan = options.pan || [0, 0];
    this.batch = [];
    this.shadows = [];
    try {
      this.backend = new GLBackend(canvas);
    } catch (error) {
      if (typeof console !== 'undefined') console.warn('ClaudeVenture: falling back to the software stage —', error.message);
      this.backend = new SoftBackend(canvas);
    }
    this.renderer = this.backend.label;
    /* One shadow disc, scaled per entity. Cheaper than a shadow per model and
       it reads better: a soft round contact patch is what the eye wants under
       a chunky character, not an accurate silhouette. */
    const disc = VOX.model('cv-shadow');
    disc.discY(0, 0, 0, 6, '#000000');
    this.define('__shadow', disc);
  }

  /** Register a model under a key. Meshing is deferred to the first draw. */
  define(key, model) {
    this.models.set(key, model);
    this.meshes.delete(key);
    this.backend.free(key);
    return key;
  }

  has(key) { return this.models.has(key); }

  /** Forget a model entirely — its recipe, its mesh and whatever the backend
      uploaded or baked for it. */
  drop(key) {
    this.models.delete(key);
    this.meshes.delete(key);
    this.backend.free(key);
    return this;
  }

  meshFor(key) {
    let mesh = this.meshes.get(key);
    if (!mesh) {
      const model = this.models.get(key);
      if (!model) return null;
      mesh = VOX.mesh(model);
      this.meshes.set(key, mesh);
    }
    return mesh;
  }

  /** Drop everything: what a new location does. */
  reset() {
    for (const key of this.models.keys()) if (key !== '__shadow') this.backend.free(key);
    const shadow = this.models.get('__shadow');
    this.models.clear(); this.meshes.clear();
    this.models.set('__shadow', shadow);
    return this;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.dpr = dpr;
    this.width = width; this.height = height;
    return this;
  }

  camera() {
    const aspect = (this.width || 1) / (this.height || 1);
    const cam = isoCamera({
      center: this.center, halfHeight: this.halfHeight, aspect,
      yaw: this.yaw, pitch: this.pitch, pan: this.pan,
    });
    cam.aspect = aspect;
    return cam;
  }

  /** Queue one model for this frame. */
  add(key, place) { this.batch.push([key, place]); return this; }

  /** Queue a contact shadow of radius `r` on the floor. */
  shadow(x, z, r, alpha = 0.22) {
    this.shadows.push({ x, z, r, alpha });
    return this;
  }

  render() {
    this.resize();
    const cam = this.camera();
    this.cam = cam;
    this.backend.frame(this.width, this.height, cam, this.clear);
    if (this.backend.bake) this.backend.bake(3);

    for (const [key, place] of this.batch) {
      const mesh = this.meshFor(key);
      if (!mesh) continue;
      const entry = this.backend.upload(key, mesh);
      this.backend.draw(entry, place);
    }

    if (this.shadows.length) {
      const mesh = this.meshFor('__shadow');
      const entry = this.backend.upload('__shadow', mesh);
      this.backend.blendOn();
      for (const s of this.shadows) {
        this.backend.draw(entry, { x: s.x, y: 0.02, z: s.z, scale: s.r / 6, alpha: s.alpha, tint: 0 });
      }
      this.backend.blendOff();
    }
    if (this.backend.flush) this.backend.flush();

    this.batch.length = 0;
    this.shadows.length = 0;
    return this;
  }

  /** A pointer event -> the floor tile under it. */
  pick(clientX, clientY, planeY = 0) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    return groundAt(this.cam || this.camera(), ndcX, ndcY, planeY);
  }

  /** A world point -> CSS pixels inside the canvas, for floating HUD labels. */
  toScreen(x, y, z) {
    const cam = this.cam || this.camera();
    const rect = this.canvas.getBoundingClientRect();
    const ndc = project(cam, x, y, z);
    return { x: (ndc.x * 0.5 + 0.5) * rect.width, y: (0.5 - ndc.y * 0.5) * rect.height, depth: ndc.z };
  }

  /** How many sprites the software path still owes. Zero on the GPU path. */
  get warming() { return this.backend.pending ? this.backend.pending.length : 0; }
}

CV.Stage = { Stage, isoCamera, project, groundAt, create: (canvas, options) => new Stage(canvas, options) };

})(typeof globalThis !== 'undefined' ? globalThis : this);
