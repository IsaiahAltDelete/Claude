/* ---------------------------------------------------------------------------
   A 3x5 bitmap font, for labelling baked sheets.

   The contact sheet is generated with no browser and no canvas, so there is
   nothing to draw text with. Rather than pull in a font library for captions,
   here are the glyphs the catalogue's names actually use, at the smallest size
   that survives being scaled up by two or three.

   Written as five rows per glyph rather than one packed string: the packed
   form is a third of the size and impossible to proofread, which is how the
   first version shipped an 'A' that rendered as an 'O'.
   --------------------------------------------------------------------------- */

const ROWS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '###', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '.#.', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '(': ['..#', '.#.', '.#.', '.#.', '..#'],
  ')': ['#..', '.#.', '.#.', '.#.', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '*': ['...', '#.#', '.#.', '#.#', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

const WIDTH = 3, HEIGHT = 5;

/* A glyph that is not exactly 3x5 draws garbage into every sheet, so check the
   table once at load rather than discovering it in a rendered PNG. */
for (const [character, rows] of Object.entries(ROWS)) {
  if (rows.length !== HEIGHT || rows.some(row => row.length !== WIDTH)) {
    throw new Error(`voxel-font: glyph "${character}" is not ${WIDTH}x${HEIGHT}`);
  }
}

/**
 * Draw text. `put(x, y)` is called for every lit pixel, so the caller owns the
 * colour and the clipping. Returns the width drawn.
 */
export function stroke(text, x, y, scale, put) {
  let at = x;
  for (const raw of String(text).toUpperCase()) {
    const rows = ROWS[raw] || ROWS['-'];
    for (let row = 0; row < HEIGHT; row++) {
      for (let column = 0; column < WIDTH; column++) {
        if (rows[row][column] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) put(at + column * scale + sx, y + row * scale + sy);
        }
      }
    }
    at += (WIDTH + 1) * scale;
  }
  return at - x - scale;
}

export const measure = (text, scale) => Math.max(0, String(text).length * (WIDTH + 1) * scale - scale);
export const lineHeight = scale => HEIGHT * scale;
