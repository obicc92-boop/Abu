/**
 * Finding the lines of music on a page picture by where the ink is, with no
 * AI (abu-reader/train/page_lines.py is the same in Python, measured on the
 * typed test sheets drawn as pictures: told the number of parts, it found 54
 * of 57 lines; assuming four parts, 50).
 *
 * 1. `pageRows`: the page's rows of writing, from its ink. Ruled lines are
 *    set aside (kept as places where lines of music may split), rows that
 *    touch are split, slivers (underlines, slurs) dropped.
 * 2. SolfaScores' own model reads each row, which tells rows of notes from rows of
 *    words (own-reader.web.ts).
 * 3. `groupLines`: on a page whose systems are boxed by ruled lines across
 *    it, the lines are cut there, each with its own number of parts (a
 *    semi-chorus of three among lines of four). Otherwise, where bar lines
 *    run down through each system's parts (a printed hymn book),
 *    `groupByBarLines`: the rows they join, each line with its own number of
 *    parts. Otherwise `groupRows`: rows grouped into lines with the same
 *    number of parts each, breaking at the clearest gaps.
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

/** Each pixel on where any pixel within `r` of it, sideways (or up and down), is on. */
function spread(on: Uint8Array, w: number, h: number, r: number, sideways: boolean): Uint8Array {
  const out = new Uint8Array(on);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on[y * w + x]) continue;
      if (sideways) for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) out[y * w + k] = 1;
      else for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) out[k * w + x] = 1;
    }
  return out;
}

/** The height of the writing's tall strokes: the 90th percentile of its vertical runs of ink (3 pixels or more). */
function strokeHeight(ink: Uint8Array, ruled: Uint8Array, w: number, h: number): number {
  const runs: number[] = [];
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && ink[y * w + x] && !ruled[y * w + x];
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= 3) runs.push(y - start);
        start = -1;
      }
    }
  }
  return runs.length ? percentile(runs, 0.9) : 0;
}

/** A ruled line across this much of the page's width can be the line between two systems. */
const SYSTEM_RULE = 0.35;

/**
 * Lines drawn by hand across the page, most often between systems with no ruler: thin strokes that slope
 * and wave, broken for a few pixels where writing touches or crosses them. Each is followed as a long path
 * through thin ink (in vertical runs of a few pixels; a letter's upright isn't), with gaps of up to six
 * pixels bridged, moving at most a pixel up or down at each step, and is a line only if it's ink for most
 * of its length (a row of dots and dashes isn't) and runs nearly level. Returns each one at least `least` long: its middle y, and
 * its pixels (the stroke itself in each column, not marks above or below that touch it). Ink in `skip`
 * (lines down the page) is passed over: a line drawn across crosses them.
 */
function drawnLines(ink: Uint8Array, skip: Uint8Array, w: number, h: number, least: number): { y: number; pixels: number[] }[] {
  const thick = Math.max(3, Math.round(h / 300));
  const thin = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && ink[y * w + x] && !skip[y * w + x];
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start <= thick) for (let k = start; k < y; k++) thin[k * w + x] = 1;
        start = -1;
      }
    }
  }
  const open = spread(thin, w, h, 3, true);
  // The longest path ending at each pixel, and the step up or down into it.
  const length = new Int32Array(w * h);
  const step = new Int8Array(w * h);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (!open[i]) continue;
      let l = 0;
      let d = 0;
      if (x > 0) {
        l = length[i - 1];
        if (y > 0 && length[i - w - 1] > l) [l, d] = [length[i - w - 1], -1];
        if (y < h - 1 && length[i + w - 1] > l) [l, d] = [length[i + w - 1], 1];
      }
      length[i] = l + 1;
      step[i] = d;
    }
  // Paths' ends, longest first; each followed back until it meets one already taken.
  const ends: number[] = [];
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (length[i] < least) continue;
      let goesOn = false;
      if (x + 1 < w) for (let d = -1; d <= 1; d++) if (y + d >= 0 && y + d < h && open[(y + d) * w + x + 1] && step[(y + d) * w + x + 1] === -d) goesOn = true;
      if (!goesOn) ends.push(i);
    }
  ends.sort((a, b) => length[b] - length[a]);
  const taken = new Uint8Array(w * h);
  const lines: { y: number; pixels: number[] }[] = [];
  for (const end of ends) {
    if (taken[end]) continue;
    const path: number[] = [];
    let x = end % w;
    let y = (end - x) / w;
    while (x >= 0 && open[y * w + x] && !taken[y * w + x]) {
      path.push(y);
      const next = y + step[y * w + x];
      for (let d = -thick; d <= thick; d++) if (y + d >= 0 && y + d < h) taken[(y + d) * w + x] = 1;
      x--;
      y = next;
    }
    if (path.length < least) continue;
    let inked = 0;
    path.forEach((py, k) => {
      const px = x + path.length - k;
      if (thin[py * w + px] || (py > 0 && thin[(py - 1) * w + px]) || (py + 1 < h && thin[(py + 1) * w + px])) inked++;
    });
    // A line between systems runs nearly level, even drawn by hand on a page straightened first (a
    // signature's flourish doesn't).
    if (Math.max(...path) - Math.min(...path) > 0.08 * path.length + 2 * thick) continue;
    if (inked < 0.7 * path.length) continue;
    // In each column, the run of thin ink the path goes through (or touches).
    const pixels: number[] = [];
    path.forEach((py, k) => {
      const px = x + path.length - k;
      const at = [py, py - 1, py + 1].find((q) => q >= 0 && q < h && thin[q * w + px]);
      if (at === undefined) return;
      let top = at;
      let bottom = at;
      while (top > 0 && thin[(top - 1) * w + px]) top--;
      while (bottom < h - 1 && thin[(bottom + 1) * w + px]) bottom++;
      for (let q = top; q <= bottom; q++) pixels.push(q * w + px);
    });
    lines.push({ y: Math.round(median(path)), pixels });
  }
  return lines;
}

/** Bar lines joining two rows: fewer may be a letter's long stroke that touches the row below. */
const LINKED = 2;

/**
 * How many bar lines run from each row down into the next (one number for each row but the last). A
 * printed sheet draws each system's bar lines down through all its parts (and often its words), so rows
 * they join are one line of music, and rows nothing joins belong to different lines (owner's hymn-book
 * photos, 28 November 2026). A bar line here is an upright run of ink (a pixel either way, gaps of up to
 * two pixels) from the middle of one row to the middle of the next; runs within 3 pixels of each other
 * count once. Table borders drawn through a handwritten sheet join its rows the same way.
 */
function barLinks(ink: Uint8Array, w: number, h: number, rows: RowBox[]): number[] {
  if (rows.length < 2) return [];
  const least = 1.2 * (median(rows.map((r) => r.bottom - r.top)) || 1);
  const runs: { x: number; top: number; bottom: number }[] = [];
  for (let x = 0; x < w; x++) {
    let start = -1;
    let last = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && (ink[y * w + x] || (x > 0 && ink[y * w + x - 1]) || (x + 1 < w && ink[y * w + x + 1]));
      if (on) {
        if (start < 0) start = y;
        last = y;
      } else if (start >= 0 && (y - last > 2 || y === h)) {
        if (last - start + 1 >= least) runs.push({ x, top: start, bottom: last });
        start = -1;
      }
    }
  }
  return rows.slice(0, -1).map((a, i) => {
    const b = rows[i + 1];
    let n = 0;
    let prev = -Infinity;
    for (const r of runs) {
      if (r.top > (a.top + a.bottom) / 2 || r.bottom < (b.top + b.bottom) / 2) continue;
      if (r.x - prev > 3) n++;
      prev = r.x;
    }
    return n;
  });
}

/**
 * The page's rows of writing, top to bottom, and the ruled lines across it
 * (their y): `rules` all of them, `long` the ones across enough of the page
 * to box a system (a slur or an underline is shorter). `links`: the bar lines
 * running from each row down into the next (`barLinks`).
 */
export function pageRows(img: Gray): { rows: RowBox[]; rules: number[]; long: number[]; links: number[] } {
  const { width: w, height: h } = img;
  const ink = inkOf(img);
  // Long ruled lines aren't writing: vertical ones (a table's borders, through several rows) and
  // horizontal ones (rules between lines of music, kept as places to split). A hand-drawn line wanders
  // a pixel or two, so they're looked for in the ink spread that far sideways (or up and down).
  const lean = 2;
  const tall = new Uint8Array(w * h);
  const sideways = spread(ink, w, h, lean, true);
  const tallRun = Math.floor(0.035 * h);
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && sideways[y * w + x];
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start > tallRun) for (let k = start; k < y; k++) tall[k * w + x] = 1;
        start = -1;
      }
    }
  }
  const wideRuns = new Uint8Array(w * h);
  const upDown = spread(ink, w, h, lean, false);
  const wideRun = Math.floor(0.12 * w);
  const rules: number[] = [];
  const long: number[] = [];
  for (let y = 0; y < h; y++) {
    let start = -1;
    let wide = 0;
    let all = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && ink[y * w + x]) all++;
      const on = x < w && upDown[y * w + x];
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start > wideRun) {
          wide += x - start;
          for (let k = start; k < x; k++) wideRuns[y * w + k] = 1;
        }
        start = -1;
      }
    }
    if (wide > 0.25 * w || all > 0.6 * w) rules.push(y);
    if (wide >= SYSTEM_RULE * w) long.push(y);
  }
  const ruled = spread(tall, w, h, lean, true);
  const down = ruled.map((v, i) => (ink[i] && v ? 1 : 0));
  const across = spread(wideRuns, w, h, lean, false);
  for (let i = 0; i < ruled.length; i++) ruled[i] = ink[i] && (ruled[i] || across[i]) ? 1 : 0;
  // A line drawn by hand, unless it's one already found ruled straight (whose ink is set aside already).
  for (const { y, pixels } of drawnLines(ink, down, w, h, Math.ceil(SYSTEM_RULE * w))) {
    if (long.some((l) => Math.abs(l - y) <= lean)) continue;
    for (const i of pixels) ruled[i] = 1;
    rules.push(y);
    long.push(y);
  }
  rules.sort((a, b) => a - b);
  long.sort((a, b) => a - b);
  const stroke = strokeHeight(ink, ruled, w, h);
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
  if (top <= 0) return { rows: [], rules, long, links: [] };

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
  // smaller kind). A row is at most about twice the writing's tall strokes: where every block is
  // several rows that touch (handwriting in a table), the blocks can't say how tall one row is.
  if (bands.length) {
    let single = percentile(
      bands.map(([a, b]) => b - a),
      0.25,
    );
    if (stroke > 0) single = Math.min(single, 2 * stroke);
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
  return { rows, rules, long, links: barLinks(ink, w, h, rows) };
}

/** How each row read: whether it's notes is judged against the page's other rows. */
export interface RowRead {
  /** mean confidence × notes × beat marks (rows.ts `notesLikeness`). */
  score: number;
  /** Beat marks (":") read in the row. */
  beats: number;
  /** The row as read, in SolfaScores text (rows.ts `toText`). */
  text?: string;
  /** The row's height, in the page's pixels. */
  height?: number;
  /** How much of the page's width the row spans (0 to 1). */
  width?: number;
}

const NOTE_NAME = /(?:de|re|fe|se|le|ta|ra|ma|lo|[drmfslt])/g;

/**
 * How a row's reading weighs for being a row of notes, learnt from 9,451 rows
 * of 252 handwritten pages that Claude Opus labelled (16 November 2026), on
 * how it read: its confidence, its beat marks against the page's usual, how
 * many of its beats hold a note or a hold, its bar lines and notes, and its
 * height and width.
 */
const WEIGHTS = { score: 1.9785, beats: 2.7763, filled: 2.7145, bars: 0.5681, height: 0.2951, width: -2.6618, notes: 0.6616, bias: -3.657 };
/** Rows weighing at least this likely are notes. */
const NOTES_AT = 0.3;

/**
 * Which rows are notes. With each row's reading, height and width, by the
 * weights above: on 51 hand-labelled pages, 1,155 of 1,181 rows of notes
 * kept, and 146 of 833 rows of words or headings taken for notes (the beat
 * marks alone: 1,149 and 159). Without them, a row read confidently with
 * about as many beat marks as the page's other rows of notes (a row of words
 * can read with a stray ":").
 */
export function notesRows(reads: RowRead[]): boolean[] {
  const sure = reads.filter((r) => r.score >= 0.6 && r.beats >= 2).map((r) => r.beats);
  const full = reads.length > 0 && reads.every((r) => r.text !== undefined && r.height !== undefined && r.width !== undefined);
  if (!full) {
    const least = sure.length ? Math.max(2, 0.4 * median(sure)) : 2;
    return reads.map((r) => r.score >= 0.4 && r.beats >= least);
  }
  const usual = sure.length ? median(sure) : 2;
  const usualHeight = median(reads.map((r) => r.height!)) || 1;
  return reads.map((r) => {
    const text = r.text!;
    const slots = text.split(/[:|/]/);
    const filled = slots.filter((piece) => /(?:de|re|fe|se|le|ta|ra|ma|lo|[drmfslt])/.test(piece) || piece.includes('-')).length / Math.max(1, slots.length);
    const z =
      WEIGHTS.bias +
      WEIGHTS.score * r.score +
      WEIGHTS.beats * Math.min(2, r.beats / usual) +
      WEIGHTS.filled * filled +
      WEIGHTS.bars * Math.min(3, (text.match(/\|/g)?.length ?? 0) / Math.max(1, usual / 2)) +
      WEIGHTS.height * Math.min(3, r.height! / usualHeight) +
      WEIGHTS.width * r.width! +
      WEIGHTS.notes * Math.min(3, (text.match(NOTE_NAME)?.length ?? 0) / Math.max(1, usual));
    return 1 / (1 + Math.exp(-z)) >= NOTES_AT;
  });
}

const NOTE_READ = "(?:de|re|fe|se|le|ta|ra|ma|lo|ba|[drmfslt])[',12]*";
const BEAT_READ = new RegExp(`^(?:[.,]*(?:-|x|${NOTE_READ})(?:\\s*[.,]+\\s*(?:-|x|${NOTE_READ}))*\\.?)?$`);

/**
 * How much of a row's reading isn't sol-fa: the share of its beats (between beat marks and bar lines)
 * holding something other than notes and holds (letters run together, "mma-ta", "dflox'", as a row of
 * words read as notes comes out). Rows of notes read 0 to 0.2 on the owner's hymn-book photos and nearly
 * all under 0.5 on 50 handwritten pages; rows of words that the reader gave beat marks, mostly 0.5 or more.
 */
export function garbled(text: string): number {
  const beats = text
    .split(/[:|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return beats.length ? beats.filter((s) => !BEAT_READ.test(s)).length / beats.length : 0;
}
/** A row reading this garbled is words, however it weighs in `notesRows`. */
const GARBLED = 0.6;
/** The share of a page's rows of notes that bar lines must join for its lines to be found by them. */
const BARRED = 0.75;

/**
 * Lines of music where a sheet's bar lines run down through each system's parts (`barLinks`), as in a
 * printed hymn book (owner's request, 28 November 2026: its four parts were read one part to a line):
 * rows the bar lines join are one line, each with its own number of parts (a hymn's SATB, a three-part
 * chorus, a verse's melody and its words, a cantor's line over the choir's), and a row of notes nothing
 * joins is a line of its own. Rows of words close under a line are its words (one under each part at most,
 * so verses printed below aren't). Within joined rows, a row of words read as notes is told by its beat
 * marks: the parts of one system have about as many, but for a part that comes in late (a short row, as
 * thick with them). Null when the bar lines don't join most of the page's rows of notes in systems, or join
 * more rows of notes than a system has (a handwritten table's borders running from one system into the next).
 * `notes` is which rows are notes, so judged.
 */
export function groupByBarLines(
  rows: RowBox[],
  isNotes: boolean[],
  reads: RowRead[],
  links: number[],
  long: number[],
  parts = 0,
): { lines: number[][]; notes: boolean[] } | null {
  if (rows.length < 2 || links.length !== rows.length - 1 || reads.length !== rows.length) return null;
  // A page drawn so: bar lines join most rows of notes that come one after another (the parts of a system;
  // a hymn's unison verses between, a melody and its words, needn't be), or most rows of notes to a row next
  // to them (a melody line with its words under it, again and again). On handwritten sheets a long stroke or
  // a border here and there joins a few rows only.
  const joined = (i: number) => i >= 0 && i < links.length && links[i] >= LINKED;
  const pairs = links.map((_, i) => i).filter((i) => isNotes[i] && isNotes[i + 1]);
  const noted = isNotes.flatMap((n, i) => (n ? [i] : []));
  const share = Math.max(
    pairs.length >= 2 ? pairs.filter(joined).length / pairs.length : 0,
    noted.filter((i) => joined(i - 1) || joined(i)).length / Math.max(1, noted.length),
  );
  if (share < BARRED) return null;
  const chains: number[][] = [[0]];
  for (let i = 0; i + 1 < rows.length; i++) {
    const ruled = long.some((y) => rows[i].bottom - 3 <= y && y <= rows[i + 1].top + 3);
    if (links[i] >= LINKED && !ruled) chains[chains.length - 1].push(i + 1);
    else chains.push([i + 1]);
  }
  const notes = [...isNotes];
  const wordsLike = (i: number) => reads[i].text !== undefined && garbled(reads[i].text!) >= GARBLED;
  for (const c of chains) {
    const sure = c.filter((i) => isNotes[i] && reads[i].beats >= 1);
    if (c.length < 2 || !sure.length) continue;
    const usual = median(sure.map((i) => reads[i].beats));
    const thick = (i: number) => reads[i].beats / Math.max(1e-6, reads[i].width ?? 1);
    const thickest = Math.max(...sure.filter((i) => reads[i].beats >= 0.75 * usual).map(thick));
    const widest = Math.max(...c.map((i) => reads[i].width ?? 1));
    for (const i of c) {
      const r = reads[i];
      const full = r.beats >= 0.75 * usual;
      const late = (r.width ?? 1) < 0.6 * widest && thick(i) >= 0.6 * thickest;
      notes[i] = r.beats >= 1 && r.score >= 0.3 && (full || late) && !wordsLike(i);
    }
  }
  const count = (c: number[]) => c.filter((i) => notes[i]).length;
  const systems = chains.filter((c) => count(c) >= 2);
  const inSystems = systems.reduce((n, c) => n + count(c), 0);
  if (!(systems.length >= 2 || (systems.length === 1 && inSystems >= 0.5 * notes.filter(Boolean).length))) return null;
  if (systems.some((c) => count(c) > Math.max(parts || 4, 4) + 2)) return null;
  const rowHeight = median(rows.map((r) => r.bottom - r.top)) || 1;
  const lines: number[][] = [];
  for (const c of chains) {
    if (count(c)) {
      // From its first row of notes (a heading the bar lines touch isn't part of it).
      lines.push(c.slice(c.findIndex((i) => notes[i])));
      continue;
    }
    const line = lines[lines.length - 1];
    if (!line) continue;
    const last = line[line.length - 1];
    const words = line.filter((i) => !notes[i]).length;
    if (c[0] === last + 1 && rows[c[0]].top - rows[last].bottom <= 1.2 * rowHeight && words + c.length <= line.length - words) line.push(...c);
  }
  // Where the bar lines stop at the words between a system's upper and lower parts (S A, words, T B, drawn
  // by hand a pair at a time), two lines of two parts or more side by side, with only words between, closer
  // together than the lines around them are apart, and no more parts together than a line has, are one. (A
  // cantor's line over the choir's has its words between its parts: the bar lines run through them.)
  const gapBetween = (a: number[], b: number[]) => rows[b[0]].top - rows[a[a.length - 1]].bottom;
  const sideBySide = (l: number[]) => {
    const n = l.filter((i) => notes[i]);
    return n[n.length - 1] - n[0] === n.length - 1;
  };
  const most = parts || 4;
  for (let k = 0; k + 1 < lines.length; k++) {
    const [a, b] = [lines[k], lines[k + 1]];
    const lastNotes = Math.max(...a.filter((i) => notes[i]));
    if (count(a) < 2 || count(b) < 2 || count(a) + count(b) > most || !sideBySide(a) || !sideBySide(b)) continue;
    if (rows.slice(lastNotes + 1, b[0]).some((_, j) => notes[lastNotes + 1 + j])) continue;
    let inside = 0;
    for (let i = lastNotes; i < b[0]; i++) inside = Math.max(inside, rows[i + 1].top - rows[i].bottom);
    const around = [k > 0 ? gapBetween(lines[k - 1], a) : NaN, k + 2 < lines.length ? gapBetween(b, lines[k + 2]) : NaN].filter((g) => !Number.isNaN(g));
    if (!around.length || inside >= 0.6 * Math.min(...around)) continue;
    lines.splice(k, 2, Array.from({ length: b[b.length - 1] - a[0] + 1 }, (_, j) => a[0] + j));
  }
  return { lines, notes };
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

/**
 * Rows grouped into lines of music (lists of row numbers, top to bottom), and
 * the number of parts a line has at most (the `parts` the person gave; 0
 * when they're not sure). On a page whose systems are boxed by ruled lines
 * across it (`long`), each box is a line with its own number of parts: a
 * semi-chorus of three among lines of four keeps the lines after it in step
 * with the page. A box is judged to hold one system or more by its height
 * against the usual box's (a row of words can read like notes, so its rows of
 * notes can't be counted on), and one holding more is split at its clearest
 * gaps near where each system should end. Boxes of two rows of notes are
 * lines of two parts, even with four asked for (two-part hymns are common).
 * Where the ruled lines don't box systems (none, or one under every row), the
 * bar lines joining each system's rows group them (`groupByBarLines`, given
 * `bars`: the page's `links` and each row's reading), or else `groupRows`
 * as before; `notes` says which rows were taken for notes. Boxes most of which hold one part and
 * its words are lines of their own when some box holds a system (a cantor's
 * verses after a refrain), and a box is cut into several systems only when
 * it has the rows of notes for them (a system with words under every part is
 * tall). Measured on 50 handwritten pages labelled row by row (18 November
 * 2026): 284 of 318 systems cut exactly with four parts given (274 with "Not
 * sure"), against 263 (258) the day before; on 140 other pages, judged by eye
 * where the cutting changed, 39 → 63 systems right on the 17 pages changed.
 * With bar lines and garbled readings (28 November 2026): 291 of 318 (283 with
 * "Not sure"), and on the owner's 16 hymn-book photos, 17 of 88 → 76 (39 → 84
 * with "Not sure").
 */
export function groupLines(
  rows: RowBox[],
  isNotes: boolean[],
  rules: number[],
  long: number[],
  parts = 0,
  bars?: { links: number[]; reads: RowRead[] },
): { lines: number[][]; parts: number; notes: boolean[] } {
  // Where ruled lines don't box the systems: by the bar lines that join each system's rows, if they do
  // (`groupByBarLines`), else by the gaps (`groupRows`). Given the rows' readings, a row reading as
  // anything but sol-fa is words there (`garbled`).
  const before = () => {
    if (!bars) return { lines: groupRows(rows, isNotes, rules, parts), parts, notes: isNotes };
    const notes = isNotes.map((n, i) => n && !(bars.reads[i]?.text !== undefined && garbled(bars.reads[i].text!) >= GARBLED));
    const barred = groupByBarLines(rows, notes, bars.reads, bars.links, long, parts);
    if (barred) return { ...barred, parts };
    return { lines: groupRows(rows, notes, rules, parts), parts, notes };
  };
  const crossed = (i: number, ys: number[]) => ys.some((y) => rows[i].bottom - 3 <= y && y <= rows[i + 1].top + 3);
  const rowHeight = median(rows.map((r) => r.bottom - r.top)) || 1;
  const boxes: number[][] = [[]];
  rows.forEach((_, i) => {
    boxes[boxes.length - 1].push(i);
    if (i < rows.length - 1 && crossed(i, long)) boxes.push([]);
  });
  // A box's rows: from its ruled line (from its first row of notes in the top box, under a title), to its
  // last row of notes and the rows close under it (its words; a footer further down isn't).
  const found: { rows: number[]; notes: number[] }[] = [];
  boxes.forEach((b, k) => {
    const notes = b.filter((i) => isNotes[i]);
    if (!notes.length) return;
    const last = notes[notes.length - 1];
    const kept: number[] = [];
    for (const i of b) {
      if (k === 0 && i < notes[0]) continue;
      if (i > last && rows[i].top - rows[i - 1].bottom > 1.2 * rowHeight) break;
      kept.push(i);
    }
    found.push({ rows: kept, notes });
  });
  // Ruled lines that box systems leave two rows of notes or more in most boxes (fewer: a line under every
  // row), and not many more than a system's (words read like notes can double them, but not much more).
  const usualCount = median(found.map((b) => b.notes.length));
  if (found.length < 2 || median(found.map((b) => b.rows.length)) < 2 || usualCount > 2.5 * (parts || 4)) return before();
  let p = parts || Math.round(usualCount);
  // Boxes holding one part and its words, most of them, with a box or more holding a system (a cantor's
  // verses after a refrain for the choir): each is a line, judged against the boxes holding a system. With
  // none holding one, the boxes are the parts' own (a staff under each part's row of sol-fa): grouped as before.
  if (usualCount < 2) {
    p = parts || 4;
    if (!found.some((b) => b.notes.length >= Math.max(2, p - 1))) return before();
  }
  const height = (b: { rows: number[]; notes: number[] }) => rows[b.rows[b.rows.length - 1]].bottom - rows[b.notes[0]].top;
  const single = found.filter((b) => b.notes.length >= Math.max(1, p - 1) && b.notes.length <= p + 2);
  // A system's height, from the boxes holding about one (when even one does: boxes may hold two at a time).
  const usual = median((single.length ? single : found).map(height)) || 1;
  // A ruled line under one part's row (some sheets rule one under the soprano) cuts a system in two: a box
  // of that one row alone, then a box with the rest of a line's parts, no taller together than a system, are
  // one. (Short systems one after another, a verse of one or two parts, keep their words rows in their boxes.)
  const merged: typeof found = [];
  for (const b of found) {
    const prev = merged[merged.length - 1];
    const both = prev && { rows: rows.map((_, i) => i).filter((i) => i >= prev.rows[0] && i <= b.rows[b.rows.length - 1]), notes: [...prev.notes, ...b.notes] };
    if (both && prev.rows.length === 1 && both.notes.length === p && height(both) <= 1.25 * usual) merged[merged.length - 1] = both;
    else merged.push(b);
  }
  const lines: number[][] = [];
  for (const b of merged) {
    // A system with a row of words under every part is taller than most: a box is several only with the
    // rows of notes for them (counted as at most four parts each: rows of words read as notes can make
    // more seem usual).
    const k = Math.max(1, Math.min(Math.floor(b.notes.length / Math.max(1, Math.min(p, 4) - 1)), Math.round(height(b) / usual)));
    if (k === 1) {
      lines.push(b.rows);
      continue;
    }
    // Split at the k - 1 clearest gaps (a shorter ruled line in one counts as a wide gap), each near
    // where a system should end, with notes on both sides.
    const inBox = b.rows.filter((i) => i >= b.notes[0]);
    const top = rows[inBox[0]].top;
    const each = (rows[inBox[inBox.length - 1]].bottom - top) / k;
    const cuts: number[] = [];
    for (let j = 1; j < k; j++) {
      const want = top + j * each;
      const from = cuts.length ? cuts[cuts.length - 1] + 1 : 0;
      let best = -1;
      let bestScore = -Infinity;
      for (let q = from; q < inBox.length - 1; q++) {
        const i = inBox[q];
        const mid = (rows[i].bottom + rows[i + 1].top) / 2;
        if (Math.abs(mid - want) > 0.35 * each) continue;
        if (!inBox.slice(from, q + 1).some((r) => isNotes[r]) || !inBox.slice(q + 1).some((r) => isNotes[r])) continue;
        const score = rows[i + 1].top - rows[i].bottom + (crossed(i, rules) ? 3 * rowHeight : 0) - Math.abs(mid - want) / each;
        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
      if (best >= 0) cuts.push(best);
    }
    // Rows ahead of the box's first row of notes (from its ruled line) start its first line; rows of words
    // ahead of a later piece's first row of notes are the words under the piece above.
    const pieces: number[][] = [];
    let start = 0;
    for (const c of [...cuts, inBox.length - 1]) {
      const piece = inBox.slice(start, c + 1);
      const first = piece.findIndex((r) => isNotes[r]);
      if (pieces.length) pieces[pieces.length - 1].push(...piece.slice(0, first));
      pieces.push(piece.slice(first));
      start = c + 1;
    }
    pieces[0] = [...b.rows.filter((i) => i < b.notes[0]), ...pieces[0]];
    lines.push(...pieces);
  }
  return { lines, parts, notes: isNotes };
}

/** Part names for a line with `n` rows of notes, top to bottom. */
export function partsFor(n: number): string[] {
  return ({ 1: ['S'], 2: ['S', 'A'], 3: ['S', 'A', 'B'], 4: ['S', 'A', 'T', 'B'], 5: ['Solo', 'S', 'A', 'T', 'B'] } as Record<number, string[]>)[n] ?? Array.from({ length: n }, (_, k) => `P${k + 1}`);
}
