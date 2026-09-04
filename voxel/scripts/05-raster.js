/* ---------------------------------------------------------------------------
   A software rasteriser, so the catalogue can be rendered with no GPU, no
   canvas and no browser at all.

   This is what makes the project headless in the useful sense: `node
   tools/voxel-render.mjs` bakes the contact sheet and the turntable strip from
   the same meshes and the same camera the gallery uses, which is why the test
   image is worth anything. It is also the fallback the gallery falls back to
   when WebGL is unavailable.

   Z-buffered, back-face culled by the world-space normal (no winding
   guesswork), Gouraud-interpolated over baked ambient occlusion, and
   supersampled by an integer factor before the box downsample — which is the
   only antialiasing a voxel model needs, and it keeps the alpha edge clean for
   compositing.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const View = VOX.View;

const DEFAULT = {
  width: 256, height: 256, samples: 2, background: null,
  yaw: 35, pitch: 24, zoom: 1, fov: 26, projection: 'perspective',
};

/**
 * Render a mesh to straight RGBA bytes.
 * Returns { width, height, data } where data is width*height*4, top row first.
 */
function render(mesh, options = {}) {
  const o = Object.assign({}, DEFAULT, options);
  const samples = Math.max(1, Math.min(4, Math.round(o.samples)));
  const W = Math.max(1, Math.round(o.width * samples));
  const H = Math.max(1, Math.round(o.height * samples));

  const cam = View.camera(mesh.bounds, {
    width: o.width, height: o.height, yaw: o.yaw, pitch: o.pitch,
    zoom: o.zoom, fov: o.fov, projection: o.projection, pivot: o.pivot,
  });
  const m = cam.viewProjection;
  const eye = cam.eye;

  const count = mesh.count;
  const sx = new Float32Array(count), sy = new Float32Array(count), sz = new Float32Array(count);
  const ok = new Uint8Array(count);
  const vr = new Float32Array(count), vg = new Float32Array(count), vb = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const px = mesh.position[i * 3], py = mesh.position[i * 3 + 1], pz = mesh.position[i * 3 + 2];
    const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
    if (cw <= 1e-6) { ok[i] = 0; continue; }
    const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
    const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
    const cz = m[2] * px + m[6] * py + m[10] * pz + m[14];
    sx[i] = (cx / cw * 0.5 + 0.5) * W;
    sy[i] = (0.5 - cy / cw * 0.5) * H;
    sz[i] = cz / cw;
    ok[i] = 1;

    const nx = mesh.normal[i * 3], ny = mesh.normal[i * 3 + 1], nz = mesh.normal[i * 3 + 2];
    let dx = eye[0] - px, dy = eye[1] - py, dz = eye[2] - pz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const lit = View.shadePoint([nx, ny, nz], mesh.light[i], mesh.material[i], [dx, dy, dz]);
    const spec = lit.specular * 255;
    vr[i] = mesh.color[i * 3] * lit.diffuse + spec;
    vg[i] = mesh.color[i * 3 + 1] * lit.diffuse + spec;
    vb[i] = mesh.color[i * 3 + 2] * lit.diffuse + spec;
  }

  const pixels = new Float32Array(W * H * 3);
  const alpha = new Uint8Array(W * H);
  const depth = new Float32Array(W * H).fill(Infinity);

  let bgR = 0, bgG = 0, bgB = 0, bgA = 0;
  if (o.background !== null && o.background !== undefined) {
    const c = VOX.util.rgb(o.background);
    bgR = (c >> 16) & 255; bgG = (c >> 8) & 255; bgB = c & 255; bgA = 255;
    for (let i = 0; i < W * H; i++) { pixels[i * 3] = bgR; pixels[i * 3 + 1] = bgG; pixels[i * 3 + 2] = bgB; }
    alpha.fill(255);
  }

  for (let t = 0; t < count; t += 3) {
    if (!ok[t] || !ok[t + 1] || !ok[t + 2]) continue;

    /* Cull by the face normal against the eye — independent of winding. */
    const nx = mesh.normal[t * 3], ny = mesh.normal[t * 3 + 1], nz = mesh.normal[t * 3 + 2];
    const facing = nx * (eye[0] - mesh.position[t * 3])
      + ny * (eye[1] - mesh.position[t * 3 + 1])
      + nz * (eye[2] - mesh.position[t * 3 + 2]);
    if (facing <= 0) continue;

    const x0 = sx[t], y0 = sy[t], x1 = sx[t + 1], y1 = sy[t + 1], x2 = sx[t + 2], y2 = sy[t + 2];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const inv = 1 / area;

    let minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    let maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    let minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    let maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        let w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
        let w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
        let w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;

        const z = w0 * sz[t] + w1 * sz[t + 1] + w2 * sz[t + 2];
        const index = y * W + x;
        if (z >= depth[index]) continue;
        depth[index] = z;
        pixels[index * 3] = w0 * vr[t] + w1 * vr[t + 1] + w2 * vr[t + 2];
        pixels[index * 3 + 1] = w0 * vg[t] + w1 * vg[t + 1] + w2 * vg[t + 2];
        pixels[index * 3 + 2] = w0 * vb[t] + w1 * vb[t + 1] + w2 * vb[t + 2];
        alpha[index] = 255;
      }
    }
  }

  /* Box downsample, premultiplied so transparent pixels do not bleed black. */
  const outW = Math.round(o.width), outH = Math.round(o.height);
  const data = new Uint8ClampedArray(outW * outH * 4);
  const area = samples * samples;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0, g = 0, b = 0, a = 0, hits = 0;
      for (let j = 0; j < samples; j++) {
        for (let i = 0; i < samples; i++) {
          const index = (y * samples + j) * W + (x * samples + i);
          if (!alpha[index]) continue;
          r += pixels[index * 3]; g += pixels[index * 3 + 1]; b += pixels[index * 3 + 2];
          a += alpha[index]; hits++;
        }
      }
      const out = (y * outW + x) * 4;
      if (!hits) { data[out] = data[out + 1] = data[out + 2] = data[out + 3] = 0; continue; }
      data[out] = r / hits; data[out + 1] = g / hits; data[out + 2] = b / hits;
      data[out + 3] = a / area;
    }
  }
  return { width: outW, height: outH, data, camera: cam };
}

/** Paste one image into another — how the contact sheet is assembled. */
function blit(target, source, dx, dy) {
  for (let y = 0; y < source.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= target.width) continue;
      const s = (y * source.width + x) * 4, d = (ty * target.width + tx) * 4;
      const sa = source.data[s + 3] / 255;
      if (sa <= 0) continue;
      const da = target.data[d + 3] / 255;
      const outA = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        target.data[d + c] = (source.data[s + c] * sa + target.data[d + c] * da * (1 - sa)) / (outA || 1);
      }
      target.data[d + 3] = outA * 255;
    }
  }
  return target;
}

function image(width, height, background) {
  const data = new Uint8ClampedArray(width * height * 4);
  if (background !== undefined && background !== null) {
    const c = VOX.util.rgb(background);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = (c >> 16) & 255; data[i * 4 + 1] = (c >> 8) & 255;
      data[i * 4 + 2] = c & 255; data[i * 4 + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Flat filled rectangle — sheet backgrounds and separators. */
function rect(target, x0, y0, w, h, color, alphaValue = 1) {
  const c = VOX.util.rgb(color);
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  for (let y = Math.max(0, y0); y < Math.min(target.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(target.width, x0 + w); x++) {
      const d = (y * target.width + x) * 4;
      target.data[d] = target.data[d] * (1 - alphaValue) + r * alphaValue;
      target.data[d + 1] = target.data[d + 1] * (1 - alphaValue) + g * alphaValue;
      target.data[d + 2] = target.data[d + 2] * (1 - alphaValue) + b * alphaValue;
      target.data[d + 3] = Math.max(target.data[d + 3], 255 * alphaValue);
    }
  }
  return target;
}

VOX.Raster = { render, blit, image, rect, DEFAULT };
VOX.render = render;

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
