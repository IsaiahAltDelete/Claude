/* ---------------------------------------------------------------------------
   Getting a model out of here.

   Five formats, chosen for what a small game actually needs:

     json  the native format — diffable, tiny, and what the gallery links to
     obj   with a matching .mtl, for anything that eats meshes
     vox   MagicaVoxel, so a model can be opened and edited by hand
     ply   a single file with vertex colours, for tools that hate .mtl
     png   a rendered image, encoded here rather than by a canvas, so the
           same call works in Node with no dependencies

   The PNG encoder takes a `deflate` function. Node passes `zlib.deflateSync`;
   in the browser nothing is passed and it falls back to stored (uncompressed)
   deflate blocks, which is a valid zlib stream every decoder accepts — larger
   on disk, but it means the library never needs a compression dependency.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const { hex, red, green, blue } = VOX.util;

/* -------------------------------------------------------------------- json */

const toJSON = model => model.toJSON();
const toJSONText = (model, pretty = false) => JSON.stringify(model.toJSON(), null, pretty ? 2 : 0);

/* --------------------------------------------------------------------- obj */

/** OBJ plus MTL. One material per distinct colour; faces come from the mesher. */
function toOBJ(model, options = {}) {
  const name = options.name || model.name;
  const mesh = VOX.mesh(model, { greedy: options.greedy !== false, ao: false });
  const materials = new Map();
  const lines = [`# ${name} — built by the voxel maker`, `mtllib ${name}.mtl`, `o ${name}`];
  const faces = [];

  /* Vertices are deduplicated on their exact integer position. */
  const index = new Map();
  const vertexLines = [];
  const vertexIndex = (x, y, z) => {
    const k = `${x},${y},${z}`;
    let i = index.get(k);
    if (i === undefined) {
      vertexLines.push(`v ${x} ${y} ${z}`);
      i = vertexLines.length;
      index.set(k, i);
    }
    return i;
  };

  for (let t = 0; t < mesh.count; t += 3) {
    const color = (mesh.color[t * 3] << 16) | (mesh.color[t * 3 + 1] << 8) | mesh.color[t * 3 + 2];
    if (!materials.has(color)) materials.set(color, `c${hex(color).slice(1)}`);
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(vertexIndex(mesh.position[(t + i) * 3], mesh.position[(t + i) * 3 + 1], mesh.position[(t + i) * 3 + 2]));
    }
    faces.push({ material: materials.get(color), ids });
  }

  lines.push(...vertexLines);
  let current = null;
  for (const face of faces) {
    if (face.material !== current) { lines.push(`usemtl ${face.material}`); current = face.material; }
    lines.push(`f ${face.ids[0]} ${face.ids[1]} ${face.ids[2]}`);
  }

  const mtl = [`# ${name}`];
  for (const [color, id] of materials) {
    mtl.push(`newmtl ${id}`, `Kd ${(red(color) / 255).toFixed(4)} ${(green(color) / 255).toFixed(4)} ${(blue(color) / 255).toFixed(4)}`, 'Ka 0 0 0', 'Ks 0 0 0', 'illum 1', '');
  }
  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n') + '\n' };
}

/* --------------------------------------------------------------------- ply */

function toPLY(model) {
  const mesh = VOX.mesh(model, { ao: true });
  const header = [
    'ply', 'format ascii 1.0', `comment ${model.name} — voxel maker`,
    `element vertex ${mesh.count}`,
    'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue',
    `element face ${mesh.count / 3}`, 'property list uchar int vertex_index', 'end_header',
  ];
  const body = [];
  for (let i = 0; i < mesh.count; i++) {
    body.push(`${mesh.position[i * 3]} ${mesh.position[i * 3 + 1]} ${mesh.position[i * 3 + 2]} ${mesh.color[i * 3]} ${mesh.color[i * 3 + 1]} ${mesh.color[i * 3 + 2]}`);
  }
  for (let f = 0; f < mesh.count; f += 3) body.push(`3 ${f} ${f + 1} ${f + 2}`);
  return header.concat(body).join('\n') + '\n';
}

/* --------------------------------------------------------------------- vox */

/** Quantise to at most 255 colours by frequency, mapping the rest to the nearest. */
function quantise(model, limit = 255) {
  const palette = model.palette();
  const keep = palette.slice(0, limit).map(entry => entry.color);
  if (palette.length <= limit) return { palette: keep, map: new Map(keep.map((c, i) => [c, i])) };
  const map = new Map(keep.map((c, i) => [c, i]));
  for (const { color } of palette.slice(limit)) {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < keep.length; i++) {
      const dr = red(color) - red(keep[i]), dg = green(color) - green(keep[i]), db = blue(color) - blue(keep[i]);
      const d = dr * dr * 2 + dg * dg * 3 + db * db;
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    map.set(color, best);
  }
  return { palette: keep, map };
}

/**
 * MagicaVoxel .vox. Their axes are X right, Y depth, Z up, so ours rotate in:
 * vox(x, y, z) = (our x, -our z, our y), shifted to be non-negative.
 */
function toVOX(model) {
  const bounds = model.bounds();
  const voxels = model.voxels();
  const { palette, map } = quantise(model);
  const size = [bounds.size[0], bounds.size[2], bounds.size[1]];

  const chunks = [];
  const chunk = (id, content, children = []) => {
    const childBytes = children.reduce((n, c) => n + c.length, 0);
    const head = new Uint8Array(12 + content.length + childBytes);
    const view = new DataView(head.buffer);
    for (let i = 0; i < 4; i++) head[i] = id.charCodeAt(i);
    view.setInt32(4, content.length, true);
    view.setInt32(8, childBytes, true);
    head.set(content, 12);
    let offset = 12 + content.length;
    for (const c of children) { head.set(c, offset); offset += c.length; }
    return head;
  };

  const sizeContent = new Uint8Array(12);
  new DataView(sizeContent.buffer).setInt32(0, size[0], true);
  new DataView(sizeContent.buffer).setInt32(4, size[1], true);
  new DataView(sizeContent.buffer).setInt32(8, size[2], true);
  chunks.push(chunk('SIZE', sizeContent));

  const xyzi = new Uint8Array(4 + voxels.length * 4);
  new DataView(xyzi.buffer).setInt32(0, voxels.length, true);
  voxels.forEach((v, i) => {
    const at = 4 + i * 4;
    xyzi[at] = v.x - bounds.min[0];
    xyzi[at + 1] = bounds.max[2] - v.z;
    xyzi[at + 2] = v.y - bounds.min[1];
    xyzi[at + 3] = (map.get(v.color) || 0) + 1;
  });
  chunks.push(chunk('XYZI', xyzi));

  const rgba = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) {
    const color = palette[i] === undefined ? 0 : palette[i];
    rgba[i * 4] = red(color); rgba[i * 4 + 1] = green(color); rgba[i * 4 + 2] = blue(color);
    rgba[i * 4 + 3] = palette[i] === undefined ? 0 : 255;
  }
  chunks.push(chunk('RGBA', rgba));

  const main = chunk('MAIN', new Uint8Array(0), chunks);
  const out = new Uint8Array(8 + main.length);
  out.set([0x56, 0x4f, 0x58, 0x20], 0);                       // "VOX "
  new DataView(out.buffer).setInt32(4, 150, true);
  out.set(main, 8);
  return out;
}

/* --------------------------------------------------------------------- png */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Valid zlib with stored blocks — no compression, no dependency. */
function zlibStored(bytes) {
  const blocks = Math.max(1, Math.ceil(bytes.length / 65535));
  const out = new Uint8Array(2 + blocks * 5 + bytes.length + 4);
  out[0] = 0x78; out[1] = 0x01;
  let at = 2, from = 0;
  for (let i = 0; i < blocks; i++) {
    const size = Math.min(65535, bytes.length - from);
    out[at++] = i === blocks - 1 ? 1 : 0;
    out[at++] = size & 255; out[at++] = size >>> 8;
    out[at++] = ~size & 255; out[at++] = (~size >>> 8) & 255;
    out.set(bytes.subarray(from, from + size), at);
    at += size; from += size;
  }
  const sum = adler32(bytes);
  out[at++] = (sum >>> 24) & 255; out[at++] = (sum >>> 16) & 255;
  out[at++] = (sum >>> 8) & 255; out[at++] = sum & 255;
  return out;
}

/**
 * Encode { width, height, data } as a PNG.
 * `deflate` is optional: pass zlib.deflateSync in Node for a smaller file.
 */
function toPNG(image, deflate) {
  const { width, height, data } = image;
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const at = y * (width * 4 + 1);
    raw[at] = 0;                                             // filter: none
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), at + 1);
  }
  const compressed = deflate ? new Uint8Array(deflate(Buffer.from(raw))) : zlibStored(raw);

  const chunks = [];
  const chunk = (type, body) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out, 4, 8 + body.length));
    chunks.push(out);
  };

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunk('IHDR', ihdr);
  chunk('IDAT', compressed);
  chunk('IEND', new Uint8Array(0));

  const size = chunks.reduce((n, c) => n + c.length, 8);
  const png = new Uint8Array(size);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let at = 8;
  for (const c of chunks) { png.set(c, at); at += c.length; }
  return png;
}

/* ------------------------------------------------------------------ browser */

/** Hand a blob to the user. No-op outside a browser. */
function download(filename, content, type = 'application/octet-stream') {
  if (typeof document === 'undefined') return false;
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

VOX.Export = { toJSON, toJSONText, toOBJ, toPLY, toVOX, toPNG, quantise, crc32, adler32, zlibStored, download };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
