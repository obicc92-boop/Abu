/**
 * SolfaScores' own row reader, the parts that are plain logic (abu-reader/train has
 * the model and its training; pipeline.py is the same steps in Python):
 * finding the rows in a picture of a line of music, turning the model's
 * output into tokens, and tokens into SolfaScores text.
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
 * ignored and thin bands (slurs, specks) dropped. When fewer rows are found
 * than `expected`, rows that touch are split at their thinnest point: a row
 * clearly taller than the others, or any row while there are fewer than
 * `atLeast` (the line's parts; the words rows expected on top of them may
 * simply be outside the picture).
 */
export function findRows(img: Gray, expected = 0, atLeast = expected): RowBox[] {
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
    const others = bands.filter((_, i) => i !== k).map(([a, b]) => b - a);
    if (bands.length >= atLeast && others.length && bottom - top < 1.6 * median(others)) break;
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

/**
 * CTC's best path over the model's scores (steps × classes, blank first): the
 * tokens, the step each was read at (the middle of its run), and the least
 * sure of them.
 */
export function greedy(scores: Float32Array, steps: number, classes: number, tokens: string[]): { tokens: string[]; at: number[]; sure: number; mean: number } {
  const out: string[] = [];
  const at: number[] = [];
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
      at.push(t);
      runPeak = p;
    } else if (best === prev && best !== 0) {
      runPeak = Math.max(runPeak, p);
      at[at.length - 1] += 0.5;
    }
    if (best === 0 && prev !== 0) least = Math.min(least, runPeak);
    prev = best;
  }
  if (prev !== 0) least = Math.min(least, runPeak);
  return { tokens: out, at, sure: out.length ? least : 0, mean: steps ? sum / steps : 0 };
}

/**
 * A table border in a line's picture. One drawn by hand leans, so its x
 * changes down the line: `x` is where it crosses height `y` (the picture's
 * middle), and `lean` how many pixels it moves sideways for each pixel down.
 */
export interface Border {
  x: number;
  y: number;
  lean: number;
}

/** A border's x at height `y` in the line's picture (each row meets it at its own height). */
export function borderX(b: Border, y: number): number {
  return b.x + b.lean * (y - b.y);
}

/** The most a hand-drawn border leans: a pixel sideways for every 8 down. */
const MOST_LEAN = 1 / 8;
/** The widest a pen stroke is, in pixels. */
const STROKE = 8;
/** A lone stroke has paper this far out on each side, past the pixel next to it. */
const CLEAR = 4;
/** How much of the paper between the rows a table's line inks, at least (a pen may skip there). */
const CROSSES = 2 / 3;

/**
 * The table borders in a line's picture, left to right: lines running down
 * most of the line and through the paper between its rows (`rows`, found
 * here if not given). A ruled line runs straight down a column of pixels,
 * and may stop for a row of words. One drawn by hand may lean (up to a pixel
 * sideways every 8 down), wobble a pixel either way and have small gaps:
 * it's a straight line with ink within a pixel of it for more than 55% of
 * the height, with no break longer than a pen stroke is wide, the row of
 * words included. As such a line can also thread through dense handwriting,
 * it must be a lone stroke (paper either side) for at least 40% of the
 * height. A "|" written in each row stops at the row's edge, so a stack of
 * them isn't a border, even lined up, nor is a stroke drawn through two rows
 * at a time (a half-bar in 4/4, a bar line in 3/4: the checker's repairs,
 * which know the time, decide). None when the line has no table, or isn't
 * tall enough to tell.
 */
export function tableBorders(img: Gray, rows: RowBox[] = findRows(img)): Border[] {
  const { data, width: w, height: h } = img;
  if (!w || !h) return [];
  // For each column, how many rows above have ink within a pixel of it (a wobble), so the ink down
  // any stretch of a column is two lookups; and its own ink, top to bottom.
  const above = new Int32Array((h + 1) * w);
  const column = new Int32Array(w);
  const row = new Uint8Array(w + 2);
  for (let y = 0; y < h; y++) {
    const at = y * w;
    for (let x = 0; x < w; x++) row[x + 1] = data[at + x] < 150 ? 1 : 0;
    for (let x = 0; x < w; x++) {
      above[at + w + x] = above[at + x] + (row[x] | row[x + 1] | row[x + 2]);
      column[x] += row[x + 1];
    }
  }
  // Every lean, close enough together that a border between two of them strays at most half a pixel
  // from the nearer one. A leaning line is a few stretches of straight columns, a pixel apart, so
  // each lean costs one lookup per stretch and column. Straighter leans go first and win ties.
  const mid = (h - 1) / 2;
  const steps = Math.ceil(h / 16);
  const best = new Int32Array(w);
  const bestLean = new Float64Array(w);
  const inked = new Int32Array(w);
  for (let i = 0; i <= 2 * steps; i++) {
    const k = i === 0 ? 0 : i % 2 ? (i + 1) / 2 : -i / 2;
    const lean = (k * MOST_LEAN) / steps;
    inked.fill(0);
    for (let top = 0; top < h; ) {
      const shift = Math.round(lean * (top - mid));
      let bottom = top + 1;
      while (bottom < h && Math.round(lean * (bottom - mid)) === shift) bottom++;
      const lo = Math.max(0, -shift);
      const hi = Math.min(w, w - shift);
      const upper = above.subarray(top * w + shift + lo, top * w + shift + hi);
      const lower = above.subarray(bottom * w + shift + lo, bottom * w + shift + hi);
      for (let x = 0; x < hi - lo; x++) inked[lo + x] += lower[x] - upper[x];
      top = bottom;
    }
    for (let x = 0; x < w; x++)
      if (inked[x] > best[x]) {
        best[x] = inked[x];
        bestLean[x] = lean;
      }
  }
  const ink = (x: number, y: number) => x >= 0 && x < w && data[y * w + x] < 150;
  // How many rows a line is a lone stroke in: ink on it no wider than a pen stroke, paper either side.
  const alone = (b: Border) => {
    let n = 0;
    for (let y = 0; y < h; y++) {
      const x = Math.round(borderX(b, y));
      let l = ink(x, y) ? x : ink(x - 1, y) ? x - 1 : ink(x + 1, y) ? x + 1 : -1;
      if (l < 0) continue;
      let r = l;
      while (r - l < STROKE && ink(l - 1, y)) l--;
      while (r - l < STROKE && ink(r + 1, y)) r++;
      let lone = r - l < STROKE;
      for (let k = 2; lone && k <= CLEAR + 1; k++) lone = !ink(l - k, y) && !ink(r + k, y);
      if (lone) n++;
    }
    return n;
  };
  // Where a line has ink within a pixel of it, top to bottom, and how much between two heights.
  const on = new Uint8Array(h);
  const trace = (b: Border) => {
    for (let y = 0; y < h; y++) {
      const x = Math.round(borderX(b, y));
      on[y] = ink(x - 1, y) || ink(x, y) || ink(x + 1, y) ? 1 : 0;
    }
  };
  const inkedFrom = (from: number, to: number) => {
    let n = 0;
    for (let y = Math.max(0, from); y < Math.min(h, to); y++) n += on[y];
    return n;
  };
  // Whether the line traced runs through the paper between the rows, as a table's lines do and a "|"
  // written in each row doesn't (it stops at the row's edge). A ruled line crosses the paper between
  // two rows at least, with ink along most of it, but may stop for a row of words (a typed table's
  // often do). One drawn by hand crosses all of it from the first row it runs through (ink down half
  // the row or more) to the last, the row of words included, but for a pixel or two where the pen
  // skipped. Rows that touch, or run together, leave nothing to tell by.
  const sorted = [...rows].sort((a, b) => a.top - b.top);
  const crosses = (ruled: boolean) => {
    if (ruled) {
      let paper = false;
      for (let k = 1; k < sorted.length; k++) {
        const from = sorted[k - 1].bottom;
        const to = sorted[k].top;
        if (to - from < 2) continue;
        if (inkedFrom(from, to) >= CROSSES * (to - from)) return true;
        paper = true;
      }
      return !paper;
    }
    if (sorted.length < 2) return true;
    const through = sorted.map((r) => 2 * inkedFrom(r.top, r.bottom) >= r.bottom - r.top);
    const first = through.indexOf(true);
    const last = through.lastIndexOf(true);
    let paper = 0;
    let crossed = 0;
    for (let k = first + 1; k <= last; k++) {
      paper += Math.max(0, sorted[k].top - sorted[k - 1].bottom);
      crossed += inkedFrom(sorted[k - 1].bottom, sorted[k].top);
    }
    return last > first && crossed + 2 >= CROSSES * paper;
  };
  // Whether the line traced has no break longer than a pen stroke is wide, from its first stretch of ink
  // that long to its last (a pen skips a little; a stroke drawn through two rows at a time stops for the
  // row of words between).
  const unbroken = () => {
    let top = -1;
    let bottom = -1;
    for (let y = 0, run = 0; y < h; y++) {
      run = on[y] ? run + 1 : 0;
      if (run < STROKE) continue;
      if (top < 0) top = y - STROKE + 1;
      bottom = y;
    }
    for (let y = top, off = 0; top >= 0 && y <= bottom; y++) {
      off = on[y] ? 0 : off + 1;
      if (off > STROKE) return false;
    }
    return top >= 0;
  };
  // Lines straight down a column, as a ruled table's are: each run of such columns is one line, at its
  // middle. Any other line is where the ink along it peaks (none inked more within a pen stroke).
  const tall = 0.55 * h;
  const found: (Border & { inked: number; straight: boolean })[] = [];
  for (let x = 0; x < w; x++) {
    if (column[x] <= tall) continue;
    const start = x;
    let most = 0;
    for (; x < w && column[x] > tall; x++) most = Math.max(most, best[x]);
    found.push({ x: (start + x - 1) / 2, y: mid, lean: 0, inked: most, straight: true });
  }
  for (let x = 0; x < w; x++) {
    const v = best[x];
    if (v <= tall) continue;
    let end = x;
    while (end + 1 < w && best[end + 1] === v) end++;
    let peak = true;
    for (let d = 1; peak && d <= STROKE; d++) peak = (x - d < 0 || best[x - d] <= v) && (end + d >= w || best[end + d] <= v);
    const at = Math.floor((x + end) / 2);
    if (peak) found.push({ x: at, y: mid, lean: bestLean[at], inked: v, straight: false });
    x = end;
  }
  // A line that crosses or touches a straight one, or a more inked one, is that border seen askew
  // (through the writing beside it, or a pixel off): only the one is kept.
  const apart = (a: Border, b: Border) => {
    const top = a.x - b.x - (a.lean - b.lean) * mid;
    const bottom = a.x - b.x + (a.lean - b.lean) * (h - 1 - mid);
    return top * bottom <= 0 ? 0 : Math.min(Math.abs(top), Math.abs(bottom));
  };
  // Each runs through the paper between the rows; one drawn by hand is unbroken and stands alone too.
  const borders: Border[] = [];
  for (const f of found.sort((a, b) => Number(b.straight) - Number(a.straight) || b.inked - a.inked)) {
    if (!borders.every((b) => apart(b, f) > 2)) continue;
    trace(f);
    if (f.straight ? crosses(true) : crosses(false) && unbroken() && alone(f) > 0.4 * h) borders.push({ x: f.x, y: f.y, lean: f.lean });
  }
  borders.sort((a, b) => a.x - b.x);
  return borders.length >= 2 ? borders : [];
}

/** Whether a border's place lies inside a row as read, clear of its first and last token: not the table's outer edges. */
function inside(xs: number[], x: number, near: number): boolean {
  return xs.length > 1 && xs[0] + near < x && x < xs[xs.length - 1] - near;
}

const MARKS = new Set([':', '/', '|', '.', ',']);

/**
 * On a sheet set in a table, the table's borders are the bar lines, in every
 * part at once. A row read on its own can't tell, but the line's picture can
 * (`xs` are the tokens' places in the line's pixels, `y` the row's height,
 * where each border's x is taken):
 * - a "|" read away from every border is the medium accent "/" (a "|" typed
 *   inside a cell);
 * - at a border inside the row, where no "|" was read, the mark read right
 *   beside it is the bar line: a "/" (one next to a bar line is never right),
 *   or a ":" right at it, within a third of `near` (a CTC step or two; one
 *   further off is a beat mark, as a rest beside the bar line has). Where
 *   neither was read, a "|" goes in, but never inside a beat (before a "."
 *   or ",") or between a note and its octave marks.
 * A bar line is never doubled, nor added near the row's first or last token
 * (the table's outer edges). Bar lines are put in only at `bars` (by default
 * every border; see `barsFromTable`), and a "|" is made "/" only away from
 * every one of `borders` (none when there are none). `xs` comes back in step
 * with the tokens, a bar line put in taking its border's place.
 */
export function barsFromBorders(
  tokens: string[],
  xs: number[],
  borders: Border[],
  y: number,
  near: number,
  bars: Border[] = borders,
): { tokens: string[]; xs: number[] } {
  if (!borders.length && !bars.length) return { tokens, xs };
  const at = borders.map((b) => borderX(b, y));
  const out = borders.length ? tokens.map((t, i) => (t === '|' && !at.some((b) => Math.abs(b - xs[i]) <= near) ? '/' : t)) : [...tokens];
  const places = [...xs];
  const octave = (t: string | undefined) => t === '^' || t === '_';
  // A mark that can become the bar line: inside the row, with no bar line beside it.
  const canBe = (i: number) => i > 0 && i < out.length - 1 && out[i - 1] !== '|' && out[i + 1] !== '|';
  for (const b of bars.map((b) => borderX(b, y)).sort((p, q) => p - q)) {
    const n = out.length;
    if (!inside(places, b, near) || out.some((t, i) => t === '|' && Math.abs(places[i] - b) <= near)) continue;
    // The tokens either side of the border (a note's octave marks read just past it stay with the note).
    let i = places.findIndex((x) => x > b);
    while (i < n && octave(out[i])) i++;
    const beside = [i - 1, i].filter((j) => j < n);
    const marks = beside.filter((j) => out[j] === '/' || (out[j] === ':' && Math.abs(places[j] - b) <= near / 3));
    if (marks.length) {
      const fits = marks.filter(canBe);
      if (fits.length) out[fits.reduce((m, j) => (Math.abs(places[j] - b) < Math.abs(places[m] - b) ? j : m))] = '|';
      continue;
    }
    // Nothing read there: a bar line between the tokens either side, before the note a "." or "," follows.
    if (out[i] === '.' || out[i] === ',') {
      i--;
      while (i > 0 && octave(out[i])) i--;
      if (MARKS.has(out[i - 1])) continue;
    }
    if (i <= 0 || i >= n || out[i - 1] === '|' || out[i] === '|') continue;
    out.splice(i, 0, '|');
    places.splice(i, 0, Math.max(places[i - 1], Math.min(b, places[i])));
  }
  return { tokens: out, xs: places };
}

/**
 * The borders most parts read a bar line at: at least half the rows read a
 * "|" within `near` of it, each row at its own height. Only there are the
 * other parts' bar lines put in, so a line that only looks like a border
 * (writing that happens to line up) adds none, nor does a stack of half-bar
 * strokes (read as "/", which is right; a bar line read short is put back by
 * the checker's repairs, which know the time).
 */
export function agreedBorders(rows: { tokens: string[]; xs: number[]; y: number }[], borders: Border[], near: number): Border[] {
  return borders.filter((b) => {
    const reads = rows.filter((r) => {
      const x = borderX(b, r.y);
      return r.tokens.some((t, i) => t === '|' && Math.abs(r.xs[i] - x) <= near);
    }).length;
    return reads > 0 && 2 * reads >= rows.length;
  });
}

/**
 * Whether a border runs through a row of the line's picture: ink within a
 * pixel of it down at least half the row's height. A box that takes in rows
 * of two systems has two tables, their borders in different places; one's
 * borders aren't bar lines in the other's rows.
 */
export function runsThrough(img: Gray, b: Border, row: { top: number; bottom: number }): boolean {
  const { data, width: w, height: h } = img;
  const ink = (x: number, y: number) => x >= 0 && x < w && data[y * w + x] < 150;
  let n = 0;
  let all = 0;
  for (let y = Math.max(0, Math.round(row.top)); y < Math.min(h, Math.round(row.bottom)); y++) {
    const x = Math.round(borderX(b, y));
    all++;
    if (ink(x - 1, y) || ink(x, y) || ink(x + 1, y)) n++;
  }
  return all > 0 && 2 * n >= all;
}

/**
 * The lines a ruler drew down a line's picture: columns of pixels inked down
 * more than 55% of its height, each run of them one line (a typed "|" is
 * only as tall as its row). None when fewer than two. A "|" read away from
 * these (and from `tableBorders`) is the medium accent "/": a hand-drawn
 * table can miss a border `tableBorders` doesn't find (too broken, or
 * crowded), so its rows' "|" are made "/" only on a ruled one, as always.
 */
export function ruledBorders(img: Gray): Border[] {
  const { data, width: w, height: h } = img;
  const xs: number[] = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (data[y * w + x] < 150) n++;
    if (n > 0.55 * h) xs.push(x);
  }
  const borders: Border[] = [];
  let start = -1;
  for (let i = 0; i < xs.length; i++) {
    if (start < 0) start = xs[i];
    if (i === xs.length - 1 || xs[i + 1] > xs[i] + 1) {
      borders.push({ x: (start + xs[i]) / 2, y: (h - 1) / 2, lean: 0 });
      start = -1;
    }
  }
  return borders.length >= 2 ? borders : [];
}

/**
 * A line's rows of notes with the table's borders as their bar lines, in
 * step in every part (`barsFromBorders`, each row at its own height `y`).
 * A border is a bar line in the rows it runs through (`runsThrough`, when
 * the picture `img` and each row's `top` and `bottom` are given), where most
 * of those rows read one (`agreedBorders`, two rows at least). Only for a
 * table whose lines run through the writing: a border inside half the rows
 * or more; lines down the ends alone (a frame, or a line joining the parts)
 * aren't bar lines. A "|" away from every border becomes "/" only on a sheet
 * ruled with straight lines (`ruled`, from `ruledBorders`: given apart, as a
 * border drawn by hand can come out not leaning), as it always has.
 */
export function barsFromTable(
  rows: { tokens: string[]; xs: number[]; y: number; top?: number; bottom?: number }[],
  borders: Border[],
  near: number,
  ruled: Border[],
  img?: Gray,
): { tokens: string[]; xs: number[] }[] {
  const table = borders.some((b) => 2 * rows.filter((r) => inside(r.xs, borderX(b, r.y), near)).length >= rows.length);
  const demote = ruled.length >= 2 ? [...ruled, ...borders] : [];
  if (!rows.length || (!table && !demote.length)) return rows.map((r) => ({ tokens: r.tokens, xs: r.xs }));
  const runs = (b: Border, r: (typeof rows)[number]) => !img || r.top === undefined || r.bottom === undefined || runsThrough(img, b, { top: r.top, bottom: r.bottom });
  // Each border's rows: the ones it runs through, if most of them read a bar line on it.
  const through = borders.map((b) => {
    if (!table) return [];
    const ks = rows.flatMap((r, k) => (runs(b, r) ? [k] : []));
    const enough = ks.length >= (img ? 2 : 1) && agreedBorders(ks.map((k) => rows[k]), [b], near).length > 0;
    return enough ? ks : [];
  });
  return rows.map((r, k) => barsFromBorders(r.tokens, r.xs, demote, r.y, near, borders.filter((_, i) => through[i].includes(k))));
}

const NOTES = new Set(['d', 'r', 'm', 'f', 's', 'l', 't', 'de', 're', 'fe', 'se', 'le', 'ra', 'ma', 'lo', 'ta']);

/** Tokens as a SolfaScores row: "s1 | d :-.r /m :d' |". */
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

/**
 * How much a row reads like a row of notes, for choosing a line's rows:
 * confidently read notes with beat marks between them (a held note is all
 * beat marks); words have no beat marks.
 */
export function notesLikeness(read: { tokens: string[]; mean: number }): number {
  const notes = read.tokens.filter((t) => NOTES.has(t)).length;
  const beats = read.tokens.filter((t) => t === ':').length;
  return read.tokens.length ? read.mean * Math.min(1, (notes + beats) / 6) * Math.min(1, (beats + 1) / 3) : 0;
}
