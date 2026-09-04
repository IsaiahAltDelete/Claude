/* ---------------------------------------------------------------------------
   Voxels -> triangles.

   Two passes, both cheap, and the reason a 40k-voxel backdrop still renders on
   a phone:

   1. Face culling. A voxel only contributes a face where its neighbour is
      missing, so a solid block of 40k voxels emits the ~7k faces you can
      actually see and none of the interior.
   2. Greedy merging. Coplanar faces that share a colour, a material and all
      four ambient-occlusion corners are merged into the largest rectangle
      available, so a castle wall is a handful of quads rather than hundreds.

   Ambient occlusion is baked per vertex from the three voxels touching each
   corner — the standard 0..3 term — and the quad's diagonal is flipped when
   the corners disagree, which kills the seam that otherwise runs across every
   shaded face. Nothing here needs a GPU: the same buffers feed the WebGL
   renderer in the browser and the software rasteriser in tools/.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const { key } = VOX.util;

/* du x dv = normal, so p -> p+du -> p+du+dv -> p+dv winds anticlockwise when
   seen from the lit side. Order: +X, -X, +Y, -Y, +Z, -Z. */
const FACES = [
  { n: [1, 0, 0], du: [0, 1, 0], dv: [0, 0, 1], origin: [1, 0, 0] },
  { n: [-1, 0, 0], du: [0, 0, 1], dv: [0, 1, 0], origin: [0, 0, 0] },
  { n: [0, 1, 0], du: [0, 0, 1], dv: [1, 0, 0], origin: [0, 1, 0] },
  { n: [0, -1, 0], du: [1, 0, 0], dv: [0, 0, 1], origin: [0, 0, 0] },
  { n: [0, 0, 1], du: [1, 0, 0], dv: [0, 1, 0], origin: [0, 0, 1] },
  { n: [0, 0, -1], du: [0, 1, 0], dv: [1, 0, 0], origin: [0, 0, 0] },
];

const AO_LEVEL = [0.5, 0.7, 0.86, 1];

function build(model, options = {}) {
  const greedy = options.greedy !== false;
  const occlusion = options.ao !== false;
  const cells = model.cells;
  const bounds = model.bounds();

  const solid = (x, y, z) => cells.has(key(x, y, z));

  /* Corner occlusion, the classic three-sample term. */
  function corner(x, y, z, n, a, b) {
    const px = x + n[0], py = y + n[1], pz = z + n[2];
    const s1 = solid(px + a[0], py + a[1], pz + a[2]) ? 1 : 0;
    const s2 = solid(px + b[0], py + b[1], pz + b[2]) ? 1 : 0;
    if (s1 && s2) return 0;
    const c = solid(px + a[0] + b[0], py + a[1] + b[1], pz + a[2] + b[2]) ? 1 : 0;
    return 3 - (s1 + s2 + c);
  }

  const position = [], normal = [], color = [], light = [], material = [];
  let quads = 0;

  for (const face of FACES) {
    const { n, du, dv } = face;
    /* The axis the slices stack along is whichever component the normal uses. */
    const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
    const uAxis = du[0] !== 0 ? 0 : du[1] !== 0 ? 1 : 2;
    const vAxis = dv[0] !== 0 ? 0 : dv[1] !== 0 ? 1 : 2;

    const min = bounds.min, max = bounds.max;
    const uMin = min[uAxis], uMax = max[uAxis];
    const vMin = min[vAxis], vMax = max[vAxis];
    const uSpan = uMax - uMin + 1, vSpan = vMax - vMin + 1;

    const maskValue = new Int32Array(uSpan * vSpan);
    const maskAO = new Int32Array(uSpan * vSpan);
    const maskUsed = new Uint8Array(uSpan * vSpan);

    for (let slice = min[axis]; slice <= max[axis]; slice++) {
      maskValue.fill(0); maskAO.fill(0); maskUsed.fill(0);
      let any = false;

      for (let u = 0; u < uSpan; u++) {
        for (let v = 0; v < vSpan; v++) {
          const p = [0, 0, 0];
          p[axis] = slice; p[uAxis] = uMin + u; p[vAxis] = vMin + v;
          const value = cells.get(key(p[0], p[1], p[2]));
          if (value === undefined) continue;
          if (solid(p[0] + n[0], p[1] + n[1], p[2] + n[2])) continue;

          let ao = 0b11111111;                 // every corner fully lit
          if (occlusion) {
            const negU = [-du[0], -du[1], -du[2]], negV = [-dv[0], -dv[1], -dv[2]];
            const a0 = corner(p[0], p[1], p[2], n, negU, negV);
            const a1 = corner(p[0], p[1], p[2], n, du, negV);
            const a2 = corner(p[0], p[1], p[2], n, du, dv);
            const a3 = corner(p[0], p[1], p[2], n, negU, dv);
            ao = a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
          }
          const index = u * vSpan + v;
          maskValue[index] = value | 0x40000000;   // mark as present
          maskAO[index] = ao;
          any = true;
        }
      }
      if (!any) continue;

      /* Greedy rectangles over the mask. */
      for (let u = 0; u < uSpan; u++) {
        for (let v = 0; v < vSpan; v++) {
          const index = u * vSpan + v;
          if (!maskValue[index] || maskUsed[index]) continue;
          const value = maskValue[index], ao = maskAO[index];

          let height = 1;
          if (greedy) {
            while (v + height < vSpan) {
              const probe = u * vSpan + v + height;
              if (maskUsed[probe] || maskValue[probe] !== value || maskAO[probe] !== ao) break;
              height++;
            }
          }
          let width = 1;
          if (greedy) {
            outer: while (u + width < uSpan) {
              for (let h = 0; h < height; h++) {
                const probe = (u + width) * vSpan + v + h;
                if (maskUsed[probe] || maskValue[probe] !== value || maskAO[probe] !== ao) break outer;
              }
              width++;
            }
          }
          for (let w = 0; w < width; w++) for (let h = 0; h < height; h++) maskUsed[(u + w) * vSpan + v + h] = 1;

          const base = [0, 0, 0];
          base[axis] = slice + face.origin[axis];
          base[uAxis] = uMin + u + face.origin[uAxis];
          base[vAxis] = vMin + v + face.origin[vAxis];

          const rgbValue = value & 0xffffff;
          const mat = (value >>> 24) & 3;
          const r = (rgbValue >> 16) & 255, g = (rgbValue >> 8) & 255, b = rgbValue & 255;
          const corners = [
            AO_LEVEL[ao & 3], AO_LEVEL[(ao >> 2) & 3], AO_LEVEL[(ao >> 4) & 3], AO_LEVEL[(ao >> 6) & 3],
          ];
          const p0 = base;
          const p1 = [base[0] + du[0] * width, base[1] + du[1] * width, base[2] + du[2] * width];
          const p2 = [p1[0] + dv[0] * height, p1[1] + dv[1] * height, p1[2] + dv[2] * height];
          const p3 = [base[0] + dv[0] * height, base[1] + dv[1] * height, base[2] + dv[2] * height];

          /* Flip the split so the darker pair shares the diagonal — otherwise
             the interpolation leaves a visible crease across shaded faces. */
          const flip = corners[0] + corners[2] < corners[1] + corners[3];
          const order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
          const points = [p0, p1, p2, p3];

          for (const i of order) {
            const p = points[i];
            position.push(p[0], p[1], p[2]);
            normal.push(n[0], n[1], n[2]);
            color.push(r, g, b);
            light.push(corners[i]);
            material.push(mat);
          }
          quads++;
        }
      }
    }
  }

  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    color: new Uint8Array(color),
    light: new Float32Array(light),
    material: new Float32Array(material),
    count: light.length,
    triangles: light.length / 3,
    quads,
    bounds,
    voxels: cells.size,
  };
}

VOX.mesh = build;
VOX.Mesh = { build, FACES, AO_LEVEL };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
