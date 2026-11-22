/**
 * A staff's window as the staff reader sees it, cut from the page's grey
 * pixels with no canvas, so the browser, Node and jest cut it alike: the
 * staff straightened along the page's tilt, from `above` staff spaces over
 * its top line to `below` under its bottom one, scaled to the model's
 * height, ink 1 and paper 0, padded with paper to the width the model was
 * trained on.
 *
 * Also here: the model's scores as tokens (CTC's best path), and a PDF
 * page's own text whitened out before its staves are cut, so printed
 * sol-fa and words near a staff aren't read as music.
 */
import type { PageText } from '@/scan/pdf-text';

import type { Token } from './decode';
import type { Gray, Staff } from './staves';

/** The staff reader's description (public/reader/staff.json). */
export interface StaffMeta {
  height: number;
  stride: number;
  /** Batches were padded to a multiple of this width in training; reading pads the same. */
  widthStep: number;
  window: { above: number; below: number; side: number };
  vocab: string[];
}

export interface StaffInput {
  /** The model's input, row by row: `height` rows of `width` (padded) columns. */
  data: Float32Array;
  width: number;
  /** Output columns that cover the staff itself (not the padding). */
  steps: number;
  /** The page's x of the window's left edge, and page pixels per window pixel. */
  left: number;
  scale: number;
}

/**
 * A staff's window for the model. Page (x, y) from window (u, v):
 * x = left + u·scale, y = top + v·scale + skew·x, read between pixels
 * (bilinear), paper outside the page. Made smaller, each window pixel is the
 * mean of k × k such samples over the page pixels it covers.
 */
export function staffInput(gray: Gray, staff: Staff, meta: StaffMeta): StaffInput {
  const { above, below, side } = meta.window;
  const left = staff.left - side * staff.gap;
  const right = staff.right + side * staff.gap;
  const top = staff.top - above * staff.gap;
  const bottom = staff.bottom + below * staff.gap;
  const scale = (bottom - top) / meta.height;
  const width = Math.max(64, Math.round((right - left) / scale));
  const padded = width + ((meta.widthStep - (width % meta.widthStep)) % meta.widthStep);
  const height = meta.height;
  const data = new Float32Array(padded * height);
  const k = Math.max(1, Math.ceil(scale - 0.15));
  const { data: px, width: W, height: H } = gray;
  const sums = new Float64Array(height);
  const norm = 1 / (k * k * 255);
  for (let u = 0; u < width; u++) {
    sums.fill(0);
    for (let i = 0; i < k; i++) {
      const x = left + (u + (i + 0.5) / k) * scale - 0.5;
      const x0 = Math.floor(x);
      const fx = x - x0;
      const inX0 = x0 >= 0 && x0 < W;
      const inX1 = x0 + 1 >= 0 && x0 + 1 < W;
      const lift = top - 0.5 + staff.skew * x;
      for (let v = 0; v < height; v++) {
        for (let j = 0; j < k; j++) {
          const y = lift + (v + (j + 0.5) / k) * scale;
          const y0 = Math.floor(y);
          const fy = y - y0;
          const r0 = y0 >= 0 && y0 < H ? y0 * W : -1;
          const r1 = y0 + 1 >= 0 && y0 + 1 < H ? (y0 + 1) * W : -1;
          const a = r0 >= 0 && inX0 ? px[r0 + x0] : 255;
          const b = r0 >= 0 && inX1 ? px[r0 + x0 + 1] : 255;
          const c = r1 >= 0 && inX0 ? px[r1 + x0] : 255;
          const d = r1 >= 0 && inX1 ? px[r1 + x0 + 1] : 255;
          sums[v] += (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
        }
      }
    }
    for (let v = 0; v < height; v++) data[v * padded + u] = 1 - sums[v] * norm;
  }
  return { data, width: padded, steps: Math.floor(width / meta.stride), left, scale };
}

/** The page's x of an output column of a staff's window. */
export const columnX = (input: Pick<StaffInput, 'left' | 'scale'>, stride: number) => (t: number) => input.left + (t * stride + stride / 2) * input.scale;

/** CTC's best path over `steps` columns of scores (columns × classes, blank first): each token with the column it was first read at. */
export function greedy(scores: Float32Array, steps: number, classes: number, names: string[]): Token[] {
  const out: Token[] = [];
  let prev = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let max = -Infinity;
    for (let k = 0; k < classes; k++) {
      const v = scores[t * classes + k];
      if (v > max) {
        max = v;
        best = k;
      }
    }
    if (best !== prev && best !== 0) out.push([names[best - 1], t]);
    prev = best;
  }
  return out;
}

/** Repeat words a page prints in its reading font, which the reader reads from the picture: never whitened. */
const KEEP = /^(d\.?\s?[sc]\.?|dal|da|segno|capo|fine|coda|al|to|[12]\.?|\d+\.)$/i;

/** Ink, for telling the text's own strokes from the music's running through them (anti-aliased edges included). */
const INKED = 200;

/**
 * The page with its own text whitened out: a PDF page's characters in
 * reading fonts, which are the printed sol-fa, the words, the title and the
 * marks (notes and signs are drawn in music fonts and aren't among them),
 * except repeat words. Only the text's own strokes go: ink inside the
 * characters' boxes that runs out of them (a stem, a tie or a beam passing
 * through a row of sol-fa) is music and stays, and so does everything on a
 * staff's lines. Boxes are in PDF points; `pointScale` makes them the
 * page's pixels.
 */
export function withoutText(gray: Gray, text: PageText, pointScale: number, staves: Staff[]): Gray {
  const data = new Uint8Array(gray.data);
  const { width, height } = gray;
  // Words, to spare the repeat words: characters on one baseline with no gap between.
  const chars = [...text.chars].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const words: (typeof chars)[] = [];
  for (const c of chars) {
    const last = words[words.length - 1]?.at(-1);
    if (last && c.c !== ' ' && Math.abs(last.y - c.y) < 0.3 * c.size && c.x0 - last.x1 < 0.25 * c.size && last.c !== ' ') words[words.length - 1].push(c);
    else if (c.c !== ' ') words.push([c]);
  }
  // The text's boxes, a little generous, but never over a staff's lines.
  const mask = new Uint8Array(width * height);
  const onStaff = (x: number, y: number) => staves.some((s) => x > s.left - s.gap && x < s.right + s.gap && y > s.top + s.skew * x - 0.3 * s.gap && y < s.bottom + s.skew * x + 0.3 * s.gap);
  const cover = (left: number, right: number, base: number, size: number) => {
    const x0 = Math.max(0, Math.floor(left * pointScale) - 2);
    const x1 = Math.min(width - 1, Math.ceil(right * pointScale) + 2);
    const y0 = Math.max(0, Math.floor((base - 1.0 * size) * pointScale) - 2);
    const y1 = Math.min(height - 1, Math.ceil((base + 0.35 * size) * pointScale) + 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!onStaff(x, y)) mask[y * width + x] = 1;
  };
  const whitened = words.filter((word) => !KEEP.test(word.map((c) => c.c).join(''))).flat();
  for (const c of whitened) cover(c.x0, c.x1, c.y, c.size);
  // And between neighbouring characters of a row (an octave mark drawn as a tick between a row's notes).
  const byRow = [...whitened].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  byRow.forEach((c, i) => {
    const next = byRow[i + 1];
    if (next && Math.abs(next.y - c.y) < 0.3 * c.size && next.x0 > c.x1 && next.x0 - c.x1 < 4 * c.size) cover(c.x1, next.x0, c.y, Math.min(c.size, next.size));
  });
  // Ink in the boxes joined to ink outside them is the music's: found by spreading from where it crosses in.
  const kept = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || data[i] >= INKED) continue;
    const x = i % width;
    const out = (j: number) => j >= 0 && j < mask.length && !mask[j] && data[j] < INKED;
    if ((x > 0 && out(i - 1)) || (x < width - 1 && out(i + 1)) || out(i - width) || out(i + width)) {
      kept[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
      if (j < 0 || j >= mask.length || !mask[j] || kept[j] || data[j] >= INKED) continue;
      kept[j] = 1;
      stack.push(j);
    }
  }
  for (let i = 0; i < mask.length; i++) if (mask[i] && !kept[i]) data[i] = 255;
  return { data, width, height };
}
