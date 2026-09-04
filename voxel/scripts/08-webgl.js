/* ---------------------------------------------------------------------------
   The WebGL2 renderer.

   One context for the whole page, not one per model. A gallery of eighty
   models cannot have eighty WebGL contexts — browsers cap it around sixteen
   and silently drop the oldest — so this renders into a single offscreen
   canvas and the caller blits the result into whatever 2D canvas the tile
   owns. That also means tiles cost a `drawImage` each rather than a context.

   The lighting is deliberately duplicated from 04-view.js rather than shared:
   the vertex shader has to do it in GLSL. If you change the rig there, change
   it here, or the baked sheets in voxel/assets stop matching the page — which
   is exactly what tools/voxel-check.mjs exists to catch.

   Falls back to the software rasteriser when WebGL2 is missing.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const View = VOX.View;

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
uniform vec4 uRig;          // ambient, key strength, fill strength, unused

out vec3 vColor;

const vec4 SPECULAR = vec4(0.06, 0.0, 0.42, 0.30);
const vec4 GLOSS    = vec4(8.0,  1.0, 26.0, 40.0);

void main() {
  int material = int(aMaterial + 0.5);
  vec3 normal = aNormal;
  vec3 viewDir = normalize(uEye - aPosition);
  float key = max(dot(normal, uKey), 0.0);
  float fill = max(dot(normal, uFill), 0.0);

  float diffuse = uRig.x + key * uRig.y + fill * uRig.z;
  if (material == 3) diffuse = diffuse * 0.72 + 0.42;
  diffuse *= aLight;

  vec3 halfway = normalize(uKey + viewDir);
  float specular = pow(max(dot(normal, halfway), 0.0), GLOSS[material]) * SPECULAR[material] * aLight;

  if (material == 1) {                       // emissive: nearly unlit, still shaped
    diffuse = (0.94 + key * 0.16) * (0.86 + aLight * 0.14);
    specular = 0.05;
  }

  vColor = aColor * diffuse + specular;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 fragColor;
void main() { fragColor = vec4(clamp(vColor, 0.0, 1.0), 1.0); }`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`voxel: shader failed to compile — ${log}`);
  }
  return shader;
}

class Renderer {
  constructor(options = {}) {
    this.canvas = options.canvas || document.createElement('canvas');
    this.canvas.width = options.width || 512;
    this.canvas.height = options.height || 512;
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, antialias: true, premultipliedAlpha: false,
      preserveDrawingBuffer: true, powerPreference: 'low-power',
    });
    if (!gl) throw new Error('voxel: no WebGL2');
    this.gl = gl;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`voxel: program failed to link — ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.attribute = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      color: gl.getAttribLocation(program, 'aColor'),
      light: gl.getAttribLocation(program, 'aLight'),
      material: gl.getAttribLocation(program, 'aMaterial'),
    };
    this.uniform = {
      viewProjection: gl.getUniformLocation(program, 'uViewProjection'),
      eye: gl.getUniformLocation(program, 'uEye'),
      key: gl.getUniformLocation(program, 'uKey'),
      fill: gl.getUniformLocation(program, 'uFill'),
      rig: gl.getUniformLocation(program, 'uRig'),
    };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(0, 0, 0, 0);

    /* Uploaded meshes, most-recently-used last. Anything past the limit is
       deleted rather than left for the driver to hold on to. */
    this.uploads = new Map();
    this.limit = options.cache || 40;
  }

  size(width, height) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    return this;
  }

  upload(key, mesh) {
    const gl = this.gl;
    let entry = this.uploads.get(key);
    if (entry && entry.count === mesh.count) {
      this.uploads.delete(key); this.uploads.set(key, entry);   // touch
      return entry;
    }
    if (entry) this.release(key);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffers = [];
    const bind = (location, data, size, type, normalize) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, type, normalize, 0, 0);
      buffers.push(buffer);
    };
    bind(this.attribute.position, mesh.position, 3, gl.FLOAT, false);
    bind(this.attribute.normal, mesh.normal, 3, gl.FLOAT, false);
    bind(this.attribute.color, mesh.color, 3, gl.UNSIGNED_BYTE, true);
    bind(this.attribute.light, mesh.light, 1, gl.FLOAT, false);
    bind(this.attribute.material, mesh.material, 1, gl.FLOAT, false);
    gl.bindVertexArray(null);

    entry = { vao, buffers, count: mesh.count, bounds: mesh.bounds };
    this.uploads.set(key, entry);
    while (this.uploads.size > this.limit) this.release(this.uploads.keys().next().value);
    return entry;
  }

  release(key) {
    const entry = this.uploads.get(key);
    if (!entry) return;
    const gl = this.gl;
    gl.deleteVertexArray(entry.vao);
    for (const buffer of entry.buffers) gl.deleteBuffer(buffer);
    this.uploads.delete(key);
  }

  /** Draw one mesh. `key` identifies the mesh for buffer reuse across frames. */
  draw(key, mesh, options = {}) {
    const gl = this.gl;
    const width = options.width || this.canvas.width;
    const height = options.height || this.canvas.height;
    this.size(width, height);
    const entry = this.upload(key, mesh);
    const cam = View.camera(mesh.bounds, Object.assign({}, options, { width, height }));

    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniform.viewProjection, false, cam.viewProjection);
    gl.uniform3fv(this.uniform.eye, cam.eye);
    gl.uniform3fv(this.uniform.key, View.LIGHT.key);
    gl.uniform3fv(this.uniform.fill, View.LIGHT.fill);
    gl.uniform4f(this.uniform.rig, View.LIGHT.ambient, View.LIGHT.keyStrength, View.LIGHT.fillStrength, 0);
    gl.bindVertexArray(entry.vao);
    gl.drawArrays(gl.TRIANGLES, 0, entry.count);
    gl.bindVertexArray(null);
    return cam;
  }

  dispose() {
    for (const key of Array.from(this.uploads.keys())) this.release(key);
    this.gl.deleteProgram(this.program);
  }
}

let shared = null;
let sharedFailed = false;

/** The page-wide renderer. Returns null once WebGL2 has been ruled out. */
function sharedRenderer() {
  if (shared || sharedFailed) return shared;
  try {
    shared = new Renderer({ width: 512, height: 512 });
  } catch (error) {
    sharedFailed = true;
    if (typeof console !== 'undefined') console.warn('voxel: falling back to the software renderer —', error.message);
  }
  return shared;
}

VOX.GL = { Renderer, shared: sharedRenderer, available: () => !!sharedRenderer() };

})(typeof globalThis !== 'undefined' ? globalThis : this);
