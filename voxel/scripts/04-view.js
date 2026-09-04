/* ---------------------------------------------------------------------------
   Camera, lighting and framing — the part both renderers must agree on.

   The gallery draws with WebGL and the tools draw with a software rasteriser
   in Node. If those two disagree about where the camera sits or how a face is
   lit, the baked test sheet stops being a test of anything. So the matrices,
   the light rig and the material response all live here, once.

   The orbit camera is described the way a turntable is: yaw (degrees around
   the model), pitch (degrees above the horizon), and a zoom multiplier applied
   to a distance derived from the model's own bounding sphere. Every model in
   the catalogue therefore frames itself, whatever its size.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});

/* One light rig for the whole project: a warm key from the upper right, a cool
   fill from behind left so silhouettes never go black, and enough ambient that
   an unlit face still shows its colour. */
const LIGHT = {
  key: normalize([0.42, 0.86, 0.3]),
  fill: normalize([-0.55, 0.22, -0.7]),
  keyStrength: 0.72,
  fillStrength: 0.2,
  ambient: 0.4,
  specular: { solid: 0.06, emissive: 0, metal: 0.42, glass: 0.3 },
  gloss: { solid: 8, emissive: 1, metal: 26, glass: 40 },
};

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/* ------------------------------------------------------------- matrices */

function perspective(out, fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function orthographic(out, halfHeight, aspect, near, far) {
  out.fill(0);
  out[0] = 1 / (halfHeight * aspect); out[5] = 1 / halfHeight;
  out[10] = -2 / (far - near); out[14] = -(far + near) / (far - near); out[15] = 1;
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

function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/* ---------------------------------------------------------------- camera */

const DEFAULTS = { yaw: 35, pitch: 24, zoom: 1, fov: 26, projection: 'perspective' };

/**
 * Everything a renderer needs for one frame: the view-projection matrix, the
 * eye position (for speculars) and the near/far it settled on.
 * `bounds` is a model's bounds; voxel (x,y,z) fills the cube [x,x+1].
 */
function camera(bounds, options = {}) {
  const o = Object.assign({}, DEFAULTS, options);
  const aspect = (o.width || 1) / (o.height || 1);
  const center = [
    (bounds.min[0] + bounds.max[0] + 1) / 2,
    (bounds.min[1] + bounds.max[1] + 1) / 2,
    (bounds.min[2] + bounds.max[2] + 1) / 2,
  ];
  if (o.pivot) { center[0] += o.pivot[0]; center[1] += o.pivot[1]; center[2] += o.pivot[2]; }

  const radius = Math.max(1, Math.hypot(bounds.size[0], bounds.size[1], bounds.size[2]) / 2);
  /* Enough room that a turntable never clips the model at any yaw, then the
     user's zoom on top. Narrow aspect ratios pull the camera back further. */
  const fit = radius / Math.sin((o.fov * Math.PI) / 360);
  const distance = (fit * 1.12) / Math.max(0.35, Math.min(1, aspect)) / o.zoom;

  const yaw = (o.yaw * Math.PI) / 180;
  const pitch = Math.max(-1.5, Math.min(1.5, (o.pitch * Math.PI) / 180));
  const eye = [
    center[0] + distance * Math.cos(pitch) * Math.sin(yaw),
    center[1] + distance * Math.sin(pitch),
    center[2] + distance * Math.cos(pitch) * Math.cos(yaw),
  ];

  const near = Math.max(0.05, distance - radius * 2.2);
  const far = distance + radius * 4;
  const projection = new Float32Array(16);
  if (o.projection === 'orthographic') {
    orthographic(projection, (radius * 1.12) / o.zoom, aspect, 0.01, far + radius * 4);
  } else {
    perspective(projection, o.fov, aspect, near, far);
  }
  const view = lookAt(new Float32Array(16), eye, center, [0, 1, 0]);
  const viewProjection = multiply(new Float32Array(16), projection, view);
  return { viewProjection, view, projection, eye, center, radius, distance, near, far };
}

/**
 * The shading every renderer applies, per vertex. Returns a multiplier per
 * channel plus an additive specular term, both already gamma-free.
 */
function shadePoint(normal, ao, material, viewDir) {
  /* Emissive is nearly unlit, but not flat: a light that shows no form at all
     turns a cut gem into a coloured sticker. A sixth of the usual key term and
     a sixth of the occlusion is enough to keep the facets readable. */
  if (material === 1) {
    const key = Math.max(0, normal[0] * LIGHT.key[0] + normal[1] * LIGHT.key[1] + normal[2] * LIGHT.key[2]);
    return { diffuse: (0.94 + key * 0.16) * (0.86 + ao * 0.14), specular: 0.05 };
  }
  const key = Math.max(0, normal[0] * LIGHT.key[0] + normal[1] * LIGHT.key[1] + normal[2] * LIGHT.key[2]);
  const fill = Math.max(0, normal[0] * LIGHT.fill[0] + normal[1] * LIGHT.fill[1] + normal[2] * LIGHT.fill[2]);
  let diffuse = LIGHT.ambient + key * LIGHT.keyStrength + fill * LIGHT.fillStrength;
  if (material === 3) diffuse = diffuse * 0.72 + 0.42;            // glass reads bright and flat
  diffuse *= ao;

  const names = ['solid', 'emissive', 'metal', 'glass'];
  const name = names[material] || 'solid';
  const half = normalize([
    LIGHT.key[0] + viewDir[0], LIGHT.key[1] + viewDir[1], LIGHT.key[2] + viewDir[2],
  ]);
  const spec = Math.pow(
    Math.max(0, normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2]),
    LIGHT.gloss[name],
  ) * LIGHT.specular[name] * ao;
  return { diffuse, specular: spec };
}

VOX.View = {
  LIGHT, DEFAULTS, camera, shadePoint,
  perspective, orthographic, lookAt, multiply, normalize,
};

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
