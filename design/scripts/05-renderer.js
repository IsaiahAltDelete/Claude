/* ---------------------------------------------------------------------------
   The renderer.

   WebGL2, written by hand, no libraries. Three passes into an offscreen
   target — background, instanced type, post — then one blit to the canvas.

   Memory discipline, since this thing can hold thousands of instances:
     · instance data is one interleaved buffer, grown in powers of two and
       shrunk when the count drops well below capacity;
     · the atlas and pattern textures are deleted before being replaced;
     · every render target is torn down and rebuilt only on a size change;
     · nothing is allocated inside the frame loop.
   --------------------------------------------------------------------------- */

(() => {
const { clamp, hexToRgba, hash01 } = window.ISO;
const G = window.ISO.GLSL;

const FORMATION_INDEX = Object.fromEntries(window.ISO.State.FORMATIONS.map((f, i) => [f[0], i]));
const BG_INDEX = { solid: 0, linear: 1, radial: 2, grid: 3, dots: 4, stripes: 5, noise: 6, pattern: 7, none: 8 };
const FACING_INDEX = { billboard: 0, flat: 1, radial: 2, flow: 3 };
const COLOR_INDEX = { solid: 0, depth: 1, index: 2, random: 3 };

/* ------------------------------------------------------------- matrices */

function perspective(out, fovyDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovyDeg * Math.PI) / 360);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function lookAt(out, eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

/* --------------------------------------------------------------- program */

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`${label} shader: ${log}`);
  }
  return sh;
}

function makeProgram(gl, vsSrc, fsSrc, label) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + " vertex");
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + " fragment");
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`${label} link: ${log}`);
  }
  // Cache every active uniform location up front.
  const u = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, "");
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

/* -------------------------------------------------------------- renderer */

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,          // we run our own multisampled target instead
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      desynchronized: false,
    });
    if (!this.gl) throw new Error("WebGL 2 is not available in this browser.");

    const gl = this.gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;

    this.progScene = makeProgram(gl, G.SCENE_VS, G.SCENE_FS, "scene");
    this.progBg = makeProgram(gl, G.QUAD_VS, G.BG_FS, "background");
    this.progBright = makeProgram(gl, G.QUAD_VS, G.BRIGHT_FS, "bright");
    this.progBlur = makeProgram(gl, G.QUAD_VS, G.BLUR_FS, "blur");
    this.progPost = makeProgram(gl, G.QUAD_VS, G.POST_FS, "post");

    // Full-screen triangle strip, shared by every screen-space pass.
    this.quadVao = gl.createVertexArray();
    this.quadBuf = gl.createBuffer();
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instanced quad: 4 corners, one interleaved buffer of per-instance data.
    this.sceneVao = gl.createVertexArray();
    gl.bindVertexArray(this.sceneVao);
    this.cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    const aCorner = gl.getAttribLocation(this.progScene.prog, "aCorner");
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

    this.instBuf = gl.createBuffer();
    this.instCapacity = 0;
    this.instData = null;
    this.instCount = 0;
    this.attrIndex = gl.getAttribLocation(this.progScene.prog, "aIndex");
    this.attrRand = gl.getAttribLocation(this.progScene.prog, "aRand");
    this.attrCell = gl.getAttribLocation(this.progScene.prog, "aCell");
    gl.bindVertexArray(null);

    this.atlasTex = null;
    this.patternTex = null;
    this.cells = new Float32Array(64 * 4);
    this.cellCount = 1;
    this.atlasSize = [1, 1];

    this.targets = null;
    this.width = 0;
    this.height = 0;
    this.samples = 0;

    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.eye = [0, 0, 3];
    this.target = [0, 0, 0];

    this.frameMs = 16;
    this.lost = false;

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.onRestore?.();
    });
  }

  /* ------------------------------------------------------------ textures */

  static uploadTexture(gl, tex, source) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  setAtlas(atlas) {
    const gl = this.gl;
    if (this.atlasTex) gl.deleteTexture(this.atlasTex);   // release before replacing
    this.atlasTex = gl.createTexture();
    Renderer.uploadTexture(gl, this.atlasTex, atlas.canvas);

    this.cellCount = Math.max(1, atlas.cells.length);
    this.cells.fill(0);
    atlas.cells.forEach((c, i) => {
      this.cells[i * 4] = c.u0;
      this.cells[i * 4 + 1] = c.v0;
      this.cells[i * 4 + 2] = c.u1 - c.u0;
      this.cells[i * 4 + 3] = c.v1 - c.v0;
    });
    this.atlasSize = [atlas.width, atlas.height];
    this.cellsDirty = true;
  }

  setPattern(canvas) {
    const gl = this.gl;
    if (this.patternTex) gl.deleteTexture(this.patternTex);
    this.patternTex = gl.createTexture();
    Renderer.uploadTexture(gl, this.patternTex, canvas);
    gl.bindTexture(gl.TEXTURE_2D, this.patternTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /* ------------------------------------------------------------ instances */

  /**
   * Rebuild the per-instance buffer. Capacity grows in powers of two and is
   * released once the live count falls under a quarter of it, so dragging the
   * count slider around does not leave a large buffer stranded.
   */
  setCount(count) {
    const gl = this.gl;
    const n = Math.max(1, Math.floor(count));
    if (n === this.instCount && this.instData) {
      this.assignCells(n);
      return;
    }

    let cap = this.instCapacity;
    if (n > cap || n < cap / 4) {
      cap = 1 << Math.ceil(Math.log2(Math.max(64, n)));
      this.instCapacity = cap;
      this.instData = new Float32Array(cap * 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, cap * 6 * 4, gl.DYNAMIC_DRAW);
    }

    const d = this.instData;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      d[o] = i;
      d[o + 1] = hash01(i * 3 + 1);
      d[o + 2] = hash01(i * 3 + 2);
      d[o + 3] = hash01(i * 3 + 3);
      d[o + 4] = hash01(i * 7 + 11);
      d[o + 5] = i % this.cellCount;
    }
    this.instCount = n;
    this.uploadInstances(n);
    this.bindInstanceAttribs();
  }

  /** Only the cell column changes when the atlas gains or loses tokens. */
  assignCells(n) {
    const d = this.instData;
    if (!d) return;
    for (let i = 0; i < n; i++) d[i * 6 + 5] = i % this.cellCount;
    this.uploadInstances(n);
  }

  uploadInstances(n) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instData, 0, n * 6);
  }

  bindInstanceAttribs() {
    const gl = this.gl;
    const stride = 6 * 4;
    gl.bindVertexArray(this.sceneVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.enableVertexAttribArray(this.attrIndex);
    gl.vertexAttribPointer(this.attrIndex, 1, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(this.attrIndex, 1);
    gl.enableVertexAttribArray(this.attrRand);
    gl.vertexAttribPointer(this.attrRand, 4, gl.FLOAT, false, stride, 4);
    gl.vertexAttribDivisor(this.attrRand, 1);
    gl.enableVertexAttribArray(this.attrCell);
    gl.vertexAttribPointer(this.attrCell, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(this.attrCell, 1);
    gl.bindVertexArray(null);
  }

  /* -------------------------------------------------------------- targets */

  disposeTargets() {
    const gl = this.gl;
    const t = this.targets;
    if (!t) return;
    for (const fb of [t.msaaFbo, t.sceneFbo, t.bloomFboA, t.bloomFboB]) if (fb) gl.deleteFramebuffer(fb);
    for (const rb of [t.colorRb, t.depthRb]) if (rb) gl.deleteRenderbuffer(rb);
    for (const tex of [t.sceneTex, t.bloomTexA, t.bloomTexB]) if (tex) gl.deleteTexture(tex);
    this.targets = null;
  }

  makeColorTexture(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  resize(width, height, samples) {
    const gl = this.gl;
    const w = clamp(Math.round(width), 16, this.maxTex);
    const h = clamp(Math.round(height), 16, this.maxTex);
    const s = clamp(samples | 0, 0, this.maxSamples);
    if (w === this.width && h === this.height && s === this.samples && this.targets) return;

    this.disposeTargets();
    this.width = w;
    this.height = h;
    this.samples = s;
    this.canvas.width = w;
    this.canvas.height = h;

    const t = {};
    t.sceneTex = this.makeColorTexture(w, h);
    t.sceneFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.sceneTex, 0);

    if (s > 0) {
      t.msaaFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.msaaFbo);
      t.colorRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.colorRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.RGBA8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, t.colorRb);
      t.depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.depthRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depthRb);
    } else {
      t.depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.sceneFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depthRb);
    }

    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    t.bloomW = bw;
    t.bloomH = bh;
    t.bloomTexA = this.makeColorTexture(bw, bh);
    t.bloomTexB = this.makeColorTexture(bw, bh);
    t.bloomFboA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.bloomFboA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.bloomTexA, 0);
    t.bloomFboB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.bloomFboB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.bloomTexB, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    this.targets = t;
  }

  /* --------------------------------------------------------------- camera */

  updateCamera(s) {
    const aspect = this.width / Math.max(this.height, 1);
    const yaw = (s.yaw * Math.PI) / 180;
    const pitch = (s.pitch * Math.PI) / 180;
    const dist = Math.max(0.05, s.dist);
    const cp = Math.cos(pitch);
    const tx = s.panX * dist * 0.6;
    const ty = s.panY * dist * 0.6;
    this.target[0] = tx;
    this.target[1] = ty;
    this.target[2] = 0;
    this.eye[0] = tx + Math.sin(yaw) * cp * dist;
    this.eye[1] = ty + Math.sin(pitch) * dist;
    this.eye[2] = Math.cos(yaw) * cp * dist;
    const far = Math.max(dist + s.depth * 2 + s.radius * 4, 12);
    perspective(this.proj, s.fov, aspect, 0.01, far);
    lookAt(this.view, this.eye, this.target, [0, 1, 0]);
    this.fadeNear = Math.max(0.02, dist - s.depth * 0.5 - s.radius);
    this.fadeFar = dist + s.depth * 0.75 + s.radius;
  }

  /* --------------------------------------------------------------- passes */

  drawBackground(s, time) {
    const gl = this.gl;
    const { prog, u } = this.progBg;
    gl.useProgram(prog);
    const a = hexToRgba(s.bgA), b = hexToRgba(s.bgB);
    gl.uniform1i(u.uType, BG_INDEX[s.bgType] ?? 0);
    gl.uniform3f(u.uA, a.r, a.g, a.b);
    gl.uniform3f(u.uB, b.r, b.g, b.b);
    gl.uniform1f(u.uAngle, s.bgAngle);
    gl.uniform1f(u.uScale, s.bgScale);
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uRes, this.width, this.height);
    gl.uniform1f(u.uPatRot, s.patRot);
    gl.uniform1f(u.uPatJitter, s.patJitter);
    gl.uniform1f(u.uPatOpacity, s.patOpacity);
    gl.uniform1f(u.uPatDrift, s.patDrift);
    if (this.patternTex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.patternTex);
      gl.uniform1i(u.uPattern, 0);
    }
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  drawType(s, time) {
    const gl = this.gl;
    if (!this.atlasTex || !this.instCount) return;
    const { prog, u } = this.progScene;
    gl.useProgram(prog);

    gl.uniformMatrix4fv(u.uProj, false, this.proj);
    gl.uniformMatrix4fv(u.uView, false, this.view);
    gl.uniform2f(u.uAtlasSize, this.atlasSize[0], this.atlasSize[1]);
    gl.uniform4fv(u.uCells, this.cells);

    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uCount, this.instCount);
    gl.uniform1i(u.uFormation, FORMATION_INDEX[s.formation] ?? 1);
    gl.uniform1i(u.uFacing, FACING_INDEX[s.facing] ?? 0);
    gl.uniform1i(u.uColorMode, COLOR_INDEX[s.colorMode] ?? 0);

    gl.uniform1f(u.uRadius, s.radius);
    gl.uniform1f(u.uDepth, s.depth);
    gl.uniform1f(u.uTurns, s.turns);
    gl.uniform1f(u.uScatter, s.scatter);
    gl.uniform1f(u.uStagger, s.stagger);
    gl.uniform1f(u.uSize, s.size);
    gl.uniform1f(u.uSizeVar, s.sizeVar);
    gl.uniform1f(u.uSizeDepth, s.sizeDepth);
    gl.uniform1f(u.uRoll, s.roll);
    gl.uniform1f(u.uRollVar, s.rollVar);
    gl.uniform1f(u.uSpeed, s.speed);
    gl.uniform1f(u.uSpin, s.spin);
    gl.uniform1f(u.uSwirl, s.swirl);
    gl.uniform1f(u.uTumble, s.tumble);
    gl.uniform1f(u.uWobble, s.wobble);
    gl.uniform1f(u.uWobbleFreq, s.wobbleFreq);
    gl.uniform1f(u.uTurb, s.turb);
    gl.uniform1f(u.uTurbScale, s.turbScale);
    gl.uniform1f(u.uPulse, s.pulse);
    gl.uniform1f(u.uPulseRate, s.pulseRate);
    gl.uniform2f(u.uDrift, s.driftX, s.driftY);
    gl.uniform1f(u.uDriftAmt, s.driftAmt);
    gl.uniform1f(u.uFog, s.fog);
    gl.uniform2f(u.uFade, this.fadeNear, this.fadeFar);
    gl.uniform1f(u.uOpacity, s.opacity);

    const ta = hexToRgba(s.tintA), tb = hexToRgba(s.tintB);
    gl.uniform3f(u.uTintA, ta.r, ta.g, ta.b);
    gl.uniform3f(u.uTintB, tb.r, tb.g, tb.b);

    // Distance fades into the backdrop, except in the light-emitting blend
    // modes where fading into black is what reads as depth.
    const lit = s.blend === "add" || s.blend === "screen";
    const fogColor = lit || s.bgType === "none" ? { r: 0, g: 0, b: 0 } : hexToRgba(s.bgA);
    gl.uniform3f(u.uFogColor, fogColor.r, fogColor.g, fogColor.b);
    gl.uniform1f(u.uCut, s.blend === "normal" ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(u.uAtlas, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    if (s.blend === "normal") {
      // Nearest copy wins, so overlaps never blend in the wrong order.
      gl.depthMask(true);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (this.samples > 0) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    } else {
      gl.depthMask(false);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.enable(gl.BLEND);
      if (s.blend === "add") gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      else if (s.blend === "screen") gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.bindVertexArray(this.sceneVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instCount);

    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  drawBloom(s) {
    const gl = this.gl;
    const t = this.targets;
    gl.viewport(0, 0, t.bloomW, t.bloomH);

    gl.bindFramebuffer(gl.FRAMEBUFFER, t.bloomFboA);
    gl.useProgram(this.progBright.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.sceneTex);
    gl.uniform1i(this.progBright.u.uTex, 0);
    gl.uniform1f(this.progBright.u.uThreshold, 0.55);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(this.progBlur.prog);
    gl.uniform1i(this.progBlur.u.uTex, 0);
    for (const [fbo, tex, dx, dy] of [
      [t.bloomFboB, t.bloomTexA, 1 / t.bloomW, 0],
      [t.bloomFboA, t.bloomTexB, 0, 1 / t.bloomH],
    ]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform2f(this.progBlur.u.uDir, dx, dy);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.viewport(0, 0, this.width, this.height);
  }

  drawPost(s, time) {
    const gl = this.gl;
    const t = this.targets;
    const { prog, u } = this.progPost;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.sceneTex);
    gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t.bloomTexA);
    gl.uniform1i(u.uBloom, 1);

    gl.uniform2f(u.uRes, this.width, this.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uBloomAmt, s.bloom);
    gl.uniform1f(u.uChroma, s.chroma);
    gl.uniform1f(u.uGrain, s.grain);
    gl.uniform1f(u.uScan, s.scan);
    gl.uniform1f(u.uVignette, s.vignette);
    gl.uniform1f(u.uPixelate, s.pixelate);
    gl.uniform1f(u.uPosterize, s.posterize);
    gl.uniform1f(u.uContrast, s.contrast);
    gl.uniform1f(u.uInvert, s.invert ? 1 : 0);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** One complete frame. `time` is in seconds. */
  render(s, time) {
    if (this.lost || !this.targets) return;
    const gl = this.gl;
    const t0 = performance.now();
    const t = this.targets;

    this.updateCamera(s);

    const drawFbo = this.samples > 0 ? t.msaaFbo : t.sceneFbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, drawFbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (s.bgType !== "none") this.drawBackground(s, time);
    this.drawType(s, time);

    if (this.samples > 0) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msaaFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.sceneFbo);
      gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height,
        gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    if (s.bloom > 0) this.drawBloom(s);
    this.drawPost(s, time);

    gl.bindVertexArray(null);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  dispose() {
    const gl = this.gl;
    this.disposeTargets();
    for (const p of [this.progScene, this.progBg, this.progBright, this.progBlur, this.progPost]) {
      if (p?.prog) gl.deleteProgram(p.prog);
    }
    for (const b of [this.quadBuf, this.cornerBuf, this.instBuf]) if (b) gl.deleteBuffer(b);
    for (const v of [this.quadVao, this.sceneVao]) if (v) gl.deleteVertexArray(v);
    for (const tex of [this.atlasTex, this.patternTex]) if (tex) gl.deleteTexture(tex);
    this.instData = null;
  }
}

window.ISO.Renderer = Renderer;
window.ISO.FORMATION_INDEX = FORMATION_INDEX;
})();
