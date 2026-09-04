/* ---------------------------------------------------------------------------
   The image pipeline.

   Every stage is a full-screen pass over a texture, so this file is mostly
   plumbing: compile the programs the shader manifest declares, keep a set of
   render targets the right size, and run the chain in order.

   Uniforms are bound from the manifest rather than by hand. Each program
   declares which parameter or renderer value feeds each uniform, which means
   adding a slider to the schema and a uniform to a shader is enough — nothing
   in this file has to learn about it.

   Memory: targets are allocated once per size and deleted before being
   replaced, the source and mask textures are deleted before reupload, and the
   frame loop allocates nothing.
   --------------------------------------------------------------------------- */

(() => {
const { clamp, hexToRgba } = window.ISO;

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(label + ": " + log);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc, label) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + " vertex");
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + " fragment");
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(label + " link: " + log);
  }
  return prog;
}

class ImageRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,          // every pass is a full-screen quad; there are no edges to smooth
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!this.gl) throw new Error("WebGL 2 is not available in this browser.");
    const gl = this.gl;

    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    const manifest = window.ISO.ImageGLSL;
    this.stages = new Map();
    for (const desc of manifest.PROGRAMS) {
      const prog = link(gl, manifest.QUAD_VS, desc.fs, desc.id);
      const locs = {};
      const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(prog, i);
        const name = info.name.replace(/\[0\]$/, "");
        locs[name] = gl.getUniformLocation(prog, name);
      }
      this.stages.set(desc.id, { desc, prog, locs });
    }

    this.quadVao = gl.createVertexArray();
    this.quadBuf = gl.createBuffer();
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.srcTex = null;
    this.maskTex = null;
    this.whiteTex = this.makeSolid(255);
    this.imageSize = [1, 1];
    this.hasImage = false;
    this.hasMask = false;

    this.targets = null;
    this.width = 0;
    this.height = 0;
    this.frameMs = 16;
    this.lost = false;

    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener("webglcontextrestored", () => { this.lost = false; this.onRestore?.(); });
  }

  /* ------------------------------------------------------------ textures */

  makeSolid(value) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([value, value, value, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  setImage(source) {
    const gl = this.gl;
    if (this.srcTex) gl.deleteTexture(this.srcTex);
    this.srcTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.imageSize = [source.width || source.videoWidth || 1, source.height || source.videoHeight || 1];
    this.hasImage = true;
  }

  /** mask is { data: Uint8ClampedArray, width, height } or null for none. */
  setMask(mask) {
    const gl = this.gl;
    if (this.maskTex) { gl.deleteTexture(this.maskTex); this.maskTex = null; }
    this.hasMask = !!mask;
    if (!mask) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.width, mask.height, 0, gl.RED,
      gl.UNSIGNED_BYTE, mask.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.maskTex = tex;
  }

  /* ------------------------------------------------------------- targets */

  makeTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex, fbo, w, h };
  }

  disposeTargets() {
    const gl = this.gl;
    if (!this.targets) return;
    for (const t of Object.values(this.targets)) {
      if (!t || !t.tex) continue;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.targets = null;
  }

  resize(width, height) {
    const gl = this.gl;
    const w = clamp(Math.round(width), 16, this.maxTex);
    const h = clamp(Math.round(height), 16, this.maxTex);
    if (w === this.width && h === this.height && this.targets) return;

    this.disposeTargets();
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;

    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    this.targets = {
      SRC: this.makeTarget(w, h),
      MASK: this.makeTarget(w, h),
      TONED: this.makeTarget(w, h),
      BLUR_TMP: this.makeTarget(w, h),
      BLUR_OUT: this.makeTarget(w, h),
      BLUR_ALT: this.makeTarget(w, h),
      STYLED: this.makeTarget(w, h),
      COMPED: this.makeTarget(w, h),
      BLOOM_A: this.makeTarget(bw, bh),
      BLOOM_B: this.makeTarget(bw, bh),
    };
    gl.viewport(0, 0, w, h);
  }

  /* ------------------------------------------------------------ uniforms */

  bind(stage, state, extra) {
    const gl = this.gl;
    for (const u of stage.desc.uniforms || []) {
      const loc = stage.locs[u.name];
      if (!loc) continue;                    // optimised out of this program
      let v;
      if (u.src) {
        v = extra[u.src];
        if (v === undefined) continue;
      } else {
        v = state[u.key];
      }
      switch (u.type) {
        case "1f":
          gl.uniform1f(loc, typeof v === "boolean" ? (v ? 1 : 0) : Number(v) || 0);
          break;
        case "1i": {
          let n = v;
          if (u.enum) n = Math.max(0, u.enum.indexOf(v));
          else if (typeof v === "boolean") n = v ? 1 : 0;
          gl.uniform1i(loc, Math.round(Number(n) || 0));
          break;
        }
        case "2f":
          gl.uniform2f(loc, v[0], v[1]);
          break;
        case "3f":
          gl.uniform3f(loc, v[0], v[1], v[2]);
          break;
        case "3fc": {
          const c = hexToRgba(v);
          gl.uniform3f(loc, c.r, c.g, c.b);
          break;
        }
        case "4f":
          gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
          break;
        default:
          break;
      }
    }
  }

  /** Run one stage into `target`, or to the canvas when target is null. */
  pass(id, textures, target, state, extra) {
    const gl = this.gl;
    const stage = this.stages.get(id);
    if (!stage) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.width, target ? target.h : this.height);
    gl.useProgram(stage.prog);

    const samplers = stage.desc.samplers || [];
    for (let i = 0; i < samplers.length; i++) {
      const loc = stage.locs[samplers[i]];
      if (!loc) continue;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, textures[i] || this.whiteTex);
      gl.uniform1i(loc, i);
    }

    this.bind(stage, state, extra);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /* --------------------------------------------------------------- frame */

  render(s, time) {
    const gl = this.gl;
    if (this.lost || !this.targets) return;
    if (!this.hasImage) {
      // Nothing to draw is not the same as "leave whatever was there": after a
      // context loss or a failed decode a stale frame under the drop plate is
      // worse than an empty canvas.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const t0 = performance.now();
    const t = this.targets;

    const extra = {
      resolution: [this.width, this.height],
      time,
      imageAspect: this.imageSize[0] / Math.max(this.imageSize[1], 1),
      canvasAspect: this.width / Math.max(this.height, 1),
      blurDir: [0, 0],
      blurRadius: 0,
      // Textures are uploaded top row first while the quad's v runs bottom-up,
      // so the geometry pass flips the lookup rather than the frame. Doing it
      // here rather than at upload keeps the mask, which arrives as a plain
      // row-major array, in step with the photograph for free.
      flipUv: 1,
    };

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // 1. Geometry, applied identically to the photograph and to the mask so
    //    the two stay registered however the frame is zoomed or turned.
    this.pass("geom", [this.srcTex], t.SRC, s, extra);
    this.pass("geom", [this.maskTex || this.whiteTex], t.MASK, s, extra);

    // 2. Tone and grade.
    this.pass("tone", [t.SRC.tex], t.TONED, s, extra);

    // 3. A blurred copy of the graded image, which is what clarity, sharpening
    //    and soften all read. Held in a local rather than written back into
    //    the target map: an alias in there would be deleted twice on the next
    //    resize and would leave the map describing something resize did not
    //    build.
    const blurTwice = (source, out, radius) => {
      extra.blurRadius = radius;
      extra.blurDir = [1 / this.width, 0];
      this.pass("blur", [source.tex], t.BLUR_TMP, s, extra);
      extra.blurDir = [0, 1 / this.height];
      this.pass("blur", [t.BLUR_TMP.tex], out, s, extra);
      return out;
    };

    const styleRadius = Math.max(
      Math.abs(s.clarity) * 12,
      s.sharpen * 6,
      s.softBlur * 40,
      s.bgMode === "blur" && s.effectTarget !== "subject" ? s.bgBlur * 60 : 0,
    );
    const blur = styleRadius > 0.2 ? blurTwice(t.TONED, t.BLUR_OUT, styleRadius) : t.TONED;

    // The composite reads a blur of whichever image the background is drawn
    // from. With the effects aimed at the subject the background is the plain
    // photograph, so blurring the graded one would put the grade back behind
    // a subject the user had just excluded it from — visible on any preset
    // that throws the background out of focus.
    let compBlur = blur;
    if (s.bgMode === "blur" && s.effectTarget === "subject" && s.bgBlur * 60 > 0.2) {
      compBlur = blurTwice(t.SRC, t.BLUR_ALT, s.bgBlur * 60);
    }

    // 4. Stylise, then composite subject against background.
    this.pass("style", [t.TONED.tex, blur.tex], t.STYLED, s, extra);
    this.pass("comp", [t.STYLED.tex, t.SRC.tex, compBlur.tex, t.MASK.tex], t.COMPED, s, extra);

    // 5. Bloom, only when it is asked for.
    let bloomTex = this.whiteTex;
    if (s.bloom > 0) {
      this.pass("bright", [t.COMPED.tex], t.BLOOM_A, s, extra);
      extra.blurRadius = 3;
      extra.blurDir = [1 / t.BLOOM_A.w, 0];
      this.pass("blur", [t.BLOOM_A.tex], t.BLOOM_B, s, extra);
      extra.blurDir = [0, 1 / t.BLOOM_A.h];
      this.pass("blur", [t.BLOOM_B.tex], t.BLOOM_A, s, extra);
      bloomTex = t.BLOOM_A.tex;
    }

    // 6. Finish to the canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.pass("post", [t.COMPED.tex, bloomTex], null, s, extra);

    // Leave no render-target texture bound into the next frame's first pass.
    for (let i = 0; i < 4; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0);

    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  dispose() {
    const gl = this.gl;
    this.disposeTargets();
    for (const stage of this.stages.values()) gl.deleteProgram(stage.prog);
    for (const tex of [this.srcTex, this.maskTex, this.whiteTex]) if (tex) gl.deleteTexture(tex);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteVertexArray(this.quadVao);
  }
}

window.ISO.ImageRenderer = ImageRenderer;
})();
