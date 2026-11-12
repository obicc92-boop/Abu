/**
 * Abụ's own row reader, the parts that are plain logic (abu-reader/train has
 * the model and its training; pipeline.py is the same steps in Python):
 * finding the rows in a picture of a line of music, turning the model's
 * output into tokens, and tokens into Abụ text.
 */

export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

/** A row of writing in a line's picture, in its pixels. */
export interface RowBox {
  top: number;
  bottom: number;
  baseline: number;
  /** About the type's size (how the reader was trained to cut rows). */
  size: number;
  left: number;
  right: number;
}

/**
 * Rows of writing, top to bottom, by where the ink is. A table's lines are
 * ignored, thin bands (slurs, specks) dropped, and rows that touch are split
 * at their thinnest point when fewer are found than `expected`.
 */
export function findRows(img: Gray, expected = 0): RowBox[] {
  const { data, width: w, height: h } = img;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = data[i] < 150 ? 1 : 0;
  // A table's vertical lines and rules aren't writing.
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += ink[y * w + x];
    if (n > 0.55 * h) for (let y = 0; y < h; y++) ink[y * w + x] = 0;
  }
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    if (n > 0.5 * w) for (let x = 0; x < w; x++) ink[y * w + x] = 0;
  }
  const raw = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    raw[y] = n;
  }
  const profile = new Float32Array(h);
  for (let y = 0; y < h; y++) profile[y] = (raw[Math.max(0, y - 1)] + raw[y] + raw[Math.min(h - 1, y + 1)]) / 3;
  const max = Math.max(...profile);
  if (max <= 0) return [];

  let bands: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    if (profile[y] <= max * 0.06) continue;
    const start = y;
    while (y < h && profile[y] > max * 0.06) y++;
    bands.push([start, y]);
  }
  // Join bits of one row (octave marks just above or below it).
  const merged: [number, number][] = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b[0] - last[1] <= Math.max(2, Math.floor(h / 120))) last[1] = b[1];
    else merged.push([b[0], b[1]]);
  }
  const sum = (a: number, b: number) => profile.slice(a, b).reduce((s, v) => s + v, 0);
  bands = merged.filter(([a, b]) => b - a >= Math.max(4, Math.floor(h / 60)) && sum(a, b) > max * 2);
  if (bands.length) {
    const usual = median(bands.map(([a, b]) => b - a));
    bands = bands.filter(([a, b]) => b - a >= 0.45 * usual);
  }
  while (expected && bands.length && bands.length < expected) {
    let k = 0;
    bands.forEach(([a, b], i) => {
      if (b - a > bands[k][1] - bands[k][0]) k = i;
    });
    const [top, bottom] = bands[k];
    if (bottom - top < 16) break;
    const from = top + Math.floor((bottom - top) / 4);
    const to = bottom - Math.floor((bottom - top) / 4);
    let cut = from;
    for (let y = from; y < to; y++) if (profile[y] < profile[cut]) cut = y;
    bands.splice(k, 1, [top, cut], [cut + 1, bottom]);
  }

  const rows: RowBox[] = bands.map(([top, bottom]) => {
    let peak = 0;
    for (let y = top; y < bottom; y++) peak = Math.max(peak, profile[y]);
    let coreTop = bottom;
    let coreBottom = top;
    for (let y = top; y < bottom; y++) {
      if (profile[y] > peak * 0.55) {
        coreTop = Math.min(coreTop, y);
        coreBottom = Math.max(coreBottom, y);
      }
    }
    const size = Math.max((bottom - top) * 0.7, Math.min((bottom - top) * 1.6, (coreBottom - coreTop + 1) * 1.9));
    let left = w;
    let right = 0;
    for (let y = top; y < bottom; y++)
      for (let x = 0; x < w; x++)
        if (ink[y * w + x]) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
    return { top, bottom, baseline: coreBottom + 1, size, left: left < right ? left : 0, right: left < right ? right : w };
  });
  // A line's rows share a type size.
  const usual = median(rows.map((r) => r.size));
  return rows.map((r) => ({ ...r, size: usual }));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** CTC's best path over the model's scores (steps × classes, blank first): the tokens, and the least sure of them. */
export function greedy(scores: Float32Array, steps: number, classes: number, tokens: string[]): { tokens: string[]; sure: number; mean: number } {
  const out: string[] = [];
  let prev = 0;
  let least = 1;
  let runPeak = 0;
  let sum = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let top = -Infinity;
    for (let c = 0; c < classes; c++) {
      const v = scores[t * classes + c];
      if (v > top) {
        top = v;
        best = c;
      }
    }
    let total = 0;
    for (let c = 0; c < classes; c++) total += Math.exp(scores[t * classes + c] - top);
    const p = 1 / total;
    sum += p;
    if (best !== prev && best !== 0) {
      if (prev !== 0) least = Math.min(least, runPeak);
      out.push(tokens[best - 1]);
      runPeak = p;
    } else if (best === prev && best !== 0) runPeak = Math.max(runPeak, p);
    if (best === 0 && prev !== 0) least = Math.min(least, runPeak);
    prev = best;
  }
  if (prev !== 0) least = Math.min(least, runPeak);
  return { tokens: out, sure: out.length ? least : 0, mean: steps ? sum / steps : 0 };
}

const NOTES = new Set(['d', 'r', 'm', 'f', 's', 'l', 't', 'de', 're', 'fe', 'se', 'le', 'ra', 'ma', 'lo', 'ta']);

/** Tokens as an Abụ row: "s1 | d :-.r /m :d' |". */
export function toText(tokens: string[]): string {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '^') out += "'";
    else if (t === '_') out += tokens[i - 1] === '_' ? '' : tokens[i + 1] === '_' ? '2' : '1';
    else if (t === '|') out += ' | ';
    else if (t === ':' || t === '/') out += ` ${t}`;
    else out += t;
  }
  out = out.replace(/\s+/g, ' ').trim();
  return out ? `${out} |` : out;
}

/** How much a row reads like a row of notes, for choosing a line's rows: confidently read notes with beat marks between them (words have none). */
export function notesLikeness(read: { tokens: string[]; mean: number }): number {
  const notes = read.tokens.filter((t) => NOTES.has(t)).length;
  const beats = read.tokens.filter((t) => t === ':').length;
  return read.tokens.length ? read.mean * Math.min(1, notes / 6) * Math.min(1, (beats + 1) / 3) : 0;
}
