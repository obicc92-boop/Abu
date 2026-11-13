/**
 * Finding the lines of music on a page picture by where the ink is, with no
 * AI (abu-reader/train/page_lines.py is the same in Python, measured on the
 * typed test sheets drawn as pictures: told the number of parts, it found 54
 * of 57 lines; assuming four parts, 50).
 *
 * 1. `pageRows`: the page's rows of writing, from its ink. Ruled lines are
 *    set aside (kept as places where lines of music may split), rows that
 *    touch are split, slivers (underlines, slurs) dropped.
 * 2. Abụ's own model reads each row, which tells rows of notes from rows of
 *    words (own-reader.web.ts).
 * 3. `groupRows`: rows grouped into lines of music with the same number of
 *    parts each, breaking at the clearest gaps.
 */
import type { Gray, RowBox } from './rows';

function percentile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return 0;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (at - lo);
}
const median = (values: number[]) => percentile(values, 0.5);

/** Ink, judged against the paper around it (photos have uneven light). */
export function inkOf(img: Gray): Uint8Array {
  const { data, width: w, height: h } = img;
  const r = Math.max(8, Math.floor(w / 50));
  // Sums over the picture so far (one row and column of padding), for the mean around each pixel.
  const W = w + 1;
  const sums = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      sums[(y + 1) * W + x + 1] = sums[y * W + x + 1] + row;
    }
  }
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const total = sums[y1 * W + x1] - sums[y0 * W + x1] - sums[y1 * W + x0] + sums[y0 * W + x0];
      const local = total / ((y1 - y0) * (x1 - x0));
      const v = data[y * w + x];
      ink[y * w + x] = v < local - 25 && v < 215 ? 1 : 0;
    }
  }
  return ink;
}

/**
 * The page's tilt in degrees (a photo is rarely held straight): the angle at
 * which its rows of ink stand out most sharply when counted row by row.
 * Positive when rows run downhill to the right.
 */
export function skewOf(img: Gray): number {
  const { width: w, height: h } = img;
  const ink = inkOf(img);
  const xs: number[] = [];
  const ys: number[] = [];
  let total = 0;
  for (let i = 0; i < ink.length; i++) total += ink[i];
  const every = Math.max(1, Math.ceil(total / 150000));
  for (let i = 0, n = 0; i < ink.length; i++)
    if (ink[i] && n++ % every === 0) {
      xs.push(i % w);
      ys.push(Math.floor(i / w));
    }
  if (xs.length < 100) return 0;
  let best = 0;
  let bestScore = -1;
  const profile = new Float64Array(h + w);
  for (let k = -30; k <= 30; k++) {
    const deg = k * 0.2;
    const t = Math.tan((deg * Math.PI) / 180);
    profile.fill(0);
    const shift = t > 0 ? t * w : 0;
    for (let i = 0; i < xs.length; i++) profile[Math.round(ys[i] - xs[i] * t + shift)]++;
    let score = 0;
    for (let y = 0; y < profile.length; y++) score += profile[y] * profile[y];
    if (score > bestScore) {
      best = deg;
      bestScore = score;
    }
  }
  return best;
}

/** The page's rows of writing, top to bottom, and the ruled lines across it (their y). */
export function pageRows(img: Gray): { rows: RowBox[]; rules: number[] } {
  const { width: w, height: h } = img;
  const ink = inkOf(img);
  // Long ruled lines aren't writing: vertical ones (a table's borders, through several rows) and
  // horizontal ones (rules between lines of music, kept as places to split).
  const ruled = new Uint8Array(w * h);
  const tallRun = Math.floor(0.035 * h);
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && ink[y * w + x];
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start > tallRun) for (let k = start; k < y; k++) ruled[k * w + x] = 1;
        start = -1;
      }
    }
  }
  const wideRun = Math.floor(0.12 * w);
  const rules: number[] = [];
  for (let y = 0; y < h; y++) {
    let start = -1;
    let wide = 0;
    let all = 0;
    for (let x = 0; x <= w; x++) {
      const on = x < w && ink[y * w + x];
      if (on) all++;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start > wideRun) {
          wide += x - start;
          for (let k = start; k < x; k++) ruled[y * w + k] = 1;
        }
        start = -1;
      }
    }
    if (wide > 0.25 * w || all > 0.6 * w) rules.push(y);
  }
  const raw = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (ink[y * w + x] && !ruled[y * w + x]) n++;
    raw[y] = n;
  }
  const profile = new Float32Array(h);
  for (let y = 0; y < h; y++) profile[y] = (raw[Math.max(0, y - 1)] + raw[y] + raw[Math.min(h - 1, y + 1)]) / 3;
  const positive = Array.from(profile).filter((v) => v > 0);
  const top = positive.length ? percentile(positive, 0.98) : 0;
  if (top <= 0) return { rows: [], rules };

  let bands: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    if (profile[y] <= 0.05 * top) continue;
    const s = y;
    while (y < h && profile[y] > 0.05 * top) y++;
    bands.push([s, y]);
  }
  const merged: [number, number][] = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b[0] - last[1] <= Math.max(2, Math.floor(h / 300))) last[1] = b[1];
    else merged.push([b[0], b[1]]);
  }
  bands = merged.filter(([a, b]) => b - a >= Math.max(4, Math.floor(h / 200)));
  if (bands.length) {
    const usual = median(bands.map(([a, b]) => b - a));
    bands = bands.filter(([a, b]) => b - a >= 0.45 * usual);
  }
  // Rows that touch (octave marks and underlines bridge the gap in tight tables) are split at their
  // thinnest point, judged against a single row (rows that touch come in pairs, so the usual row is the
  // smaller kind).
  if (bands.length) {
    const single = percentile(
      bands.map(([a, b]) => b - a),
      0.25,
    );
    const out: [number, number][] = [];
    const todo = [...bands];
    while (todo.length) {
      const [a, b] = todo.shift()!;
      if (b - a < 1.6 * single) {
        out.push([a, b]);
        continue;
      }
      const lo = a + Math.floor(0.3 * single);
      const hi = b - Math.floor(0.3 * single);
      let cut = -1;
      let peak = 0;
      for (let y = a; y < b; y++) peak = Math.max(peak, profile[y]);
      for (let y = lo; y < hi; y++) if (cut < 0 || profile[y] < profile[cut]) cut = y;
      if (cut < 0 || profile[cut] > 0.5 * peak) {
        out.push([a, b]);
        continue;
      }
      todo.unshift([a, cut], [cut + 1, b]);
    }
    // Slivers split off a row (underlines, slurs) aren't rows.
    bands = out.filter(([a, b]) => b - a >= 0.45 * single).sort((p, q) => p[0] - q[0]);
  }
  const rows: RowBox[] = [];
  for (const [t, b] of bands) {
    let peak = 0;
    for (let y = t; y < b; y++) peak = Math.max(peak, profile[y]);
    let coreTop = -1;
    let coreBottom = -1;
    for (let y = t; y < b; y++)
      if (profile[y] > peak * 0.55) {
        if (coreTop < 0) coreTop = y;
        coreBottom = y;
      }
    let left = w;
    let right = -1;
    for (let y = t; y < b; y++)
      for (let x = 0; x < w; x++)
        if (ink[y * w + x] && !ruled[y * w + x]) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
    if (right < 0 || coreTop < 0) continue;
    const size = Math.min((b - t) * 1.6, Math.max((b - t) * 0.7, (coreBottom - coreTop + 1) * 1.9));
    rows.push({ top: t, bottom: b, baseline: coreBottom + 1, size, left, right });
  }
  return { rows, rules };
}

/** How each row read: whether it's notes is judged against the page's other rows. */
export interface RowRead {
  /** mean confidence × notes × beat marks (rows.ts `notesLikeness`). */
  score: number;
  /** Beat marks (":") read in the row. */
  beats: number;
}

/**
 * Which rows are notes: read confidently, with about as many beat marks as
 * the page's other rows of notes (a row of words can read with a stray ":").
 */
export function notesRows(reads: RowRead[]): boolean[] {
  const sure = reads.filter((r) => r.score >= 0.6 && r.beats >= 2).map((r) => r.beats);
  const least = sure.length ? Math.max(2, 0.4 * median(sure)) : 2;
  return reads.map((r) => r.score >= 0.4 && r.beats >= least);
}

/**
 * Rows grouped into lines of music (lists of row numbers, top to bottom).
 * Every line has the same number of parts: `parts` if the person said, or
 * the number whose breaks between lines fall on the clearest gaps (a ruled
 * line counts as a wide gap), favouring the usual choir layouts when the
 * gaps don't say.
 */
export function groupRows(rows: RowBox[], isNotes: boolean[], rules: number[], parts = 0): number[][] {
  const notes = isNotes.flatMap((n, i) => (n ? [i] : []));
  if (!notes.length) return [];
  const usual = median(rows.map((r) => r.bottom - r.top)) || 1;
  const gaps: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    let g = rows[i + 1].top - rows[i].bottom;
    if (rules.some((y) => rows[i].bottom - 3 <= y && y <= rows[i + 1].top + 3)) g += 3 * usual;
    gaps.push(g);
  }
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);
  let best: { chunks: number[][]; breaks: number[] } | null = null;
  let bestScore = -Infinity;
  const choices = parts ? [parts] : range(1, Math.min(5, notes.length) + 1);
  for (const p of choices) {
    const chunks: number[][] = [];
    for (let j = 0; j < notes.length; j += p) chunks.push(notes.slice(j, j + p));
    const breaks = chunks.slice(1).map((next, k) => range(chunks[k][chunks[k].length - 1], next[0]).reduce((m, q) => (gaps[q] > gaps[m] ? q : m)));
    const inside = range(notes[0], notes[notes.length - 1])
      .filter((q) => !breaks.includes(q))
      .map((q) => gaps[q]);
    // How cleanly the breaks stand out from every other gap between the rows of notes, in rows.
    let score = breaks.length ? (Math.min(...breaks.map((q) => gaps[q])) - (inside.length ? Math.max(...inside) : 0)) / usual : 0;
    if (notes.length % p) score -= 0.3; // a short last line is possible, but less likely
    score += ({ 4: 0.5, 2: 0.25, 3: 0.1, 5: 0.1 } as Record<number, number>)[p] ?? 0;
    if (score > bestScore + 1e-6) {
      best = { chunks, breaks };
      bestScore = score;
    }
  }
  const { chunks, breaks } = best!;
  const lines: number[][] = [];
  let start = notes[0];
  chunks.forEach((c, k) => {
    const b = breaks[k];
    const last = c[c.length - 1];
    let g = range(start, (b ?? rows.length - 1) + 1);
    // Rows after the last line's notes belong to it only if they're close (its words), not a footer.
    if (b === undefined) g = g.filter((i) => i <= last || range(last, i).every((q) => gaps[q] <= 1.2 * usual));
    lines.push(g);
    if (b !== undefined) start = b + 1;
  });
  return lines;
}

/** Part names for a line with `n` rows of notes, top to bottom. */
export function partsFor(n: number): string[] {
  return ({ 1: ['S'], 2: ['S', 'A'], 3: ['S', 'A', 'B'], 4: ['S', 'A', 'T', 'B'], 5: ['Solo', 'S', 'A', 'T', 'B'] } as Record<number, string[]>)[n] ?? Array.from({ length: n }, (_, k) => `P${k + 1}`);
}
