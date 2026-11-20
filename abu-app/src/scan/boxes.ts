/**
 * Boxed sheets: sol-fa written in a table where each box holds a bar (or a
 * few) of every part, the parts stacked in it, each with its words under
 * it, and a part that rests often left out. Written by hand, the rows in one
 * box sit at their own heights, so rows found straight across a system run
 * into each other and mix the parts (the owner's "Ekeresimesi Erutego", 20
 * November 2026).
 *
 * Here the page is cut into systems at the table's long rules, each system
 * into boxes at its borders, and each box's rows are found and read on their
 * own. Each part then takes its row in every box, by height against the
 * boxes nearby that have every part; a box with no row for a part gives it
 * rests; and the boxes are joined with bar lines.
 *
 * Pure logic: the reading itself is passed in (SolfaScores' own model in the
 * browser, or in the tools in abu-reader).
 */
import { inkOf, partsFor } from './page-lines';
import { borderX, notesLikeness, tableBorders, type Border, type Gray, type RowBox } from './rows';
import type { Box } from './types';

/** A ruled line across the page: its height at the page's left edge, and how much it drops for each pixel across. */
export interface Rule {
  y: number;
  slope: number;
}

export const ruleY = (r: Rule, x: number) => r.y + r.slope * x;

/** The most a rule slopes (drawn by hand, or on a page photographed a little crooked and straightened). */
const MOST_SLOPE = 0.03;
/** A rule runs through ink across at least this much of the page's width... */
const RULE_COVERS = 0.5;
/** ...and is a thin line: this much more of it is ink than just above or below it (a row of writing isn't)... */
const RULE_STANDS_OUT = 0.3;
/** ...unbroken across this much of the page (a slur and the writing beside it are broken)... */
const RULE_SPANS = 0.6;
/** ...but for gaps this long, of the page's width, where the pen skipped or writing crosses it. */
const RULE_GAP = 0.03;

/**
 * The long ruled lines across a page (a table's rules between its systems),
 * top to bottom, ruled or drawn by hand: each is the straight line, within
 * MOST_SLOPE of level, that runs through ink (a pixel either side, for a
 * wobble) across at least half the page, unbroken but for short gaps across
 * most of it, with paper just above and below. A slur or an underline is too
 * short; a row of writing isn't thin.
 */
export function pageRules(img: Gray, ink: Uint8Array = inkOf(img)): Rule[] {
  const { width: w, height: h } = img;
  if (w < 8 || h < 8) return [];
  // Ink spread a pixel up and down: a ruled line wobbles.
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      near[i] = ink[i] | (y > 0 ? ink[i - w] : 0) | (y + 1 < h ? ink[i + w] : 0);
    }
  const step = 2;
  const columns = Math.ceil(w / step);
  const mid = w / 2;
  // How much of a line is ink: the line through height y0 at the page's middle, sloping `slope`.
  const cover = (y0: number, slope: number) => {
    let n = 0;
    for (let x = 0; x < w; x += step) {
      const y = Math.round(y0 + slope * (x - mid));
      if (y >= 0 && y < h && near[y * w + x]) n++;
    }
    return n / columns;
  };
  const slopes = Math.ceil((MOST_SLOPE * w) / 2);
  const best = new Float32Array(h);
  const bestSlope = new Float32Array(h);
  for (let k = -slopes; k <= slopes; k++) {
    // Slopes 2 pixels apart across the page: a line between two is within a pixel of one of them.
    const slope = (2 * k) / w;
    for (let y0 = 0; y0 < h; y0++) {
      const c = cover(y0, slope);
      if (c > best[y0] || (c === best[y0] && Math.abs(slope) < Math.abs(bestSlope[y0]))) {
        best[y0] = c;
        bestSlope[y0] = slope;
      }
    }
  }
  // The longest stretch of a line that's ink, bridging gaps where the pen skipped or writing crosses it.
  const gap = Math.max(3, Math.round(RULE_GAP * w));
  const span = (y0: number, slope: number) => {
    let longest = 0;
    let start = -1;
    let last = -1;
    for (let x = 0; x < w; x += step) {
      const y = Math.round(y0 + slope * (x - mid));
      if (y < 0 || y >= h || !near[y * w + x]) continue;
      if (start < 0 || x - last > gap) start = x;
      last = x;
      longest = Math.max(longest, last - start);
    }
    return longest / w;
  };
  const away = Math.max(4, Math.round(h / 200));
  const found: { y0: number; slope: number; c: number }[] = [];
  for (let y0 = 0; y0 < h; y0++) {
    const c = best[y0];
    if (c < RULE_COVERS) continue;
    const slope = bestSlope[y0];
    if (c - Math.max(cover(y0 - away, slope), cover(y0 + away, slope)) < RULE_STANDS_OUT) continue;
    if (span(y0, slope) < RULE_SPANS) continue;
    found.push({ y0, slope, c });
  }
  // A rule is found at a few neighbouring heights: the best of each.
  found.sort((a, b) => b.c - a.c);
  const kept: typeof found = [];
  const apart = Math.max(6, Math.round(h / 80));
  for (const f of found) if (!kept.some((k) => Math.abs(k.y0 - f.y0) < apart)) kept.push(f);
  return kept.sort((a, b) => a.y0 - b.y0).map((f) => ({ y: f.y0 - f.slope * mid, slope: f.slope }));
}

/** A system of a boxed sheet: the rules above and below it, and its boxes' sides (left to right), in the page's pixels. */
export interface BoxedSystem {
  top: Rule;
  bottom: Rule;
  boxes: { left: number; right: number }[];
}

/** How far inside a rule or border a box's writing starts, in pixels of a page 2400 tall. */
const INSET = 5;

function crop(img: Gray, left: number, top: number, width: number, height: number): Gray {
  const x0 = Math.max(0, Math.round(left));
  const y0 = Math.max(0, Math.round(top));
  const w = Math.max(0, Math.min(img.width - x0, Math.round(width)));
  const h = Math.max(0, Math.min(img.height - y0, Math.round(height)));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) data.set(img.data.subarray((y0 + y) * img.width + x0, (y0 + y) * img.width + x0 + w), y * w);
  return { data, width: w, height: h };
}

/** The highest and lowest a rule runs between two places across. */
const ruleSpan = (r: Rule, left: number, right: number) => [Math.min(ruleY(r, left), ruleY(r, right)), Math.max(ruleY(r, left), ruleY(r, right))];

/**
 * A line down a system's picture near `x0` (a table's border the finder in
 * rows.ts passed over, where writing crowds it): the straight line, leaning
 * as a border drawn by hand may, with ink within a pixel of it down most of
 * the picture and much less a few pixels to each side (a column of writing
 * isn't a line). Null if there's none.
 */
function lineDown(g: Gray, x0: number): Border | null {
  const { data, width: w, height: h } = g;
  if (h < 8) return null;
  const dark = (x: number, y: number) => x >= 0 && x < w && data[y * w + x] < 150;
  const mid = (h - 1) / 2;
  const reach = Math.max(4, Math.round(0.015 * w));
  const down = (x: number, lean: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) {
      const at = Math.round(x + lean * (y - mid));
      if (dark(at - 1, y) || dark(at, y) || dark(at + 1, y)) n++;
    }
    return n / h;
  };
  let best: Border | null = null;
  let most = 0;
  const steps = Math.max(1, Math.round(h / 16));
  for (let i = -steps; i <= steps; i++) {
    const lean = (i / steps) * MOST_LEAN;
    for (let x = Math.round(x0 - reach); x <= Math.round(x0 + reach); x++) {
      const n = down(x, lean);
      if (n > most) {
        most = n;
        best = { x, y: mid, lean };
      }
    }
  }
  if (!best || most < 0.75) return null;
  const aside = Math.max(down(best.x - 5, best.lean), down(best.x + 5, best.lean));
  return most - aside >= 0.3 ? best : null;
}

/** The most a hand-drawn border leans: a pixel sideways for every 8 down (as in rows.ts). */
const MOST_LEAN = 1 / 8;

/**
 * A page's systems, if it's a boxed sheet: between each two rules, the boxes
 * between the table's borders (rows.ts `tableBorders`, which follows a line
 * drawn by hand). A border most systems have at a place across, but this
 * one was found without, is looked for again there (`lineDown`): a table's
 * columns mostly run down the page. `img` is the page; `rules` its rules
 * (`pageRules`, maybe found on a smaller copy and scaled). A page is boxed
 * when at least two systems have three boxes or more; then a system with
 * fewer (a last line written across the page) is one box. Null for any
 * other page.
 */
export function boxedSystems(img: Gray, rules: Rule[]): BoxedSystem[] | null {
  const k = img.height / 2400;
  const inset = Math.max(2, Math.round(INSET * k));
  const least = 0.04 * img.height;
  const found: { top: Rule; bottom: Rule; band: Gray; borders: Border[] }[] = [];
  for (let i = 0; i + 1 < rules.length; i++) {
    const top = Math.max(...ruleSpan(rules[i], 0, img.width)) + inset;
    const bottom = Math.min(...ruleSpan(rules[i + 1], 0, img.width)) - inset;
    if (bottom - top < least) continue;
    const band = crop(img, 0, top, img.width, bottom - top);
    found.push({ top: rules[i], bottom: rules[i + 1], band, borders: tableBorders(band) });
  }
  // The table's columns: borders of different systems close across, one to the next (a column drawn by hand
  // drifts down the page), in at least half the systems.
  const near = 0.015 * img.width;
  const mids = found.flatMap((f, s) => f.borders.map((b) => ({ s, x: borderX(b, (f.band.height - 1) / 2) }))).sort((a, b) => a.x - b.x);
  const columns: { s: number; x: number }[][] = [];
  for (const m of mids) {
    const last = columns[columns.length - 1];
    if (last && m.x - last[last.length - 1].x <= near) last.push(m);
    else columns.push([m]);
  }
  const systems = found.map(({ top, bottom, band, borders }, s) => {
    const all = [...borders];
    for (const column of columns) {
      if (column.length < Math.max(2, found.length / 2) || column.some((m) => m.s === s)) continue;
      // Looked for where the nearest system has it.
      const from = column.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
      const again = lineDown(band, from.x);
      if (again) all.push(again);
    }
    all.sort((a, b) => borderX(a, (band.height - 1) / 2) - borderX(b, (band.height - 1) / 2));
    const sides = (b: Border) => [borderX(b, 0), borderX(b, band.height - 1)];
    const boxes: { left: number; right: number }[] = [];
    for (let j = 0; j + 1 < all.length; j++) {
      const left = Math.max(...sides(all[j])) + inset;
      const right = Math.min(...sides(all[j + 1])) - inset;
      // A sliver between the table's edge and the page's isn't a box.
      if (right - left >= 0.04 * img.width) boxes.push({ left, right });
    }
    return { top, bottom, boxes };
  });
  if (systems.filter((s) => s.boxes.length >= 3).length < 2) return null;
  // A system the table doesn't divide: one box, across the table.
  const left = Math.min(...systems.filter((s) => s.boxes.length).map((s) => s.boxes[0].left));
  const right = Math.max(...systems.filter((s) => s.boxes.length).map((s) => s.boxes[s.boxes.length - 1].right));
  return systems.map(({ top, bottom, boxes }) => ({ top, bottom, boxes: boxes.length >= 2 ? boxes : [{ left, right }] }));
}

/** What the reader made of a row: its tokens (rows.ts), how sure it was of the least sure one, and on average. */
export interface RowReading {
  tokens: string[];
  sure: number;
  mean: number;
}

/** Reads a row of writing; its box is in the page's pixels. */
export type ReadRow = (row: RowBox) => Promise<RowReading>;

/** A row in a box, as read. */
export interface BoxRow {
  row: RowBox;
  read: RowReading;
  /** How much it reads like notes (rows.ts `notesLikeness`). */
  score: number;
  /** Its beat marks. */
  beats: number;
  y: number;
}

const NOTE_NAMES = new Set(['d', 'r', 'm', 'f', 's', 'l', 't', 'de', 're', 'fe', 'se', 'le', 'ra', 'ma', 'lo', 'ta']);
/** How many notes a reading has. */
export const notesIn = (tokens: string[]) => tokens.filter((t) => NOTE_NAMES.has(t)).length;
/** A row surely of notes: two beat marks or more, and read enough like notes. */
const NOTES_AT = 0.3;
const sureNotes = (r: BoxRow) => r.beats >= 2 && r.score >= NOTES_AT;
/** A row that may be notes, like an upbeat's ":m'": a beat mark and a note. Taken only where a part's row is missing. */
const mayBeNotes = (r: BoxRow) => r.beats >= 1 && r.read.tokens.some((t) => NOTE_NAMES.has(t));
/** How near a part's height a short row must be to be taken as that part's, as a share of the space between parts. */
const NEAR_PART = 0.3;

function middle(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/**
 * Where each part's row is in box `i`, by height: its own rows if it has
 * every part, or else those of the nearest boxes that do (one each side,
 * averaged; the nearer one if one is nearer), so the parts follow the
 * handwriting as it drifts across the system. Null if no box has every part.
 */
function partsAt(boxes: number[][], parts: number, i: number): number[] | null {
  if (boxes[i].length === parts) return boxes[i];
  const full = boxes.map((b, j) => (b.length === parts ? j : -1)).filter((j) => j >= 0);
  if (!full.length) return null;
  const left = [...full].reverse().find((j) => j < i);
  const right = full.find((j) => j > i);
  const refs = [left, right].filter((j): j is number => j !== undefined);
  const nearest = refs.length === 2 && Math.abs(refs[0] - i) !== Math.abs(refs[1] - i) ? [refs.sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0]] : refs;
  return Array.from({ length: parts }, (_, p) => nearest.reduce((s, j) => s + boxes[j][p], 0) / nearest.length);
}

/**
 * The parts of a system: how many there are, and which of each box's rows
 * of notes is which part. `boxes` holds each box's rows of notes by their
 * height, top to bottom. There are `wanted` parts if a box has that many
 * rows, or else as many as at least two boxes have (one box's stray row
 * isn't a part); a box with more rows has its extra ones left out by the
 * caller. A box with every
 * part takes them in order. A box with fewer gives its rows to parts in
 * order, each near the height of that part's row in the nearest boxes with
 * every part (`partsAt`). Returns, for each box, the part of each of its rows.
 */
export function partsOfRows(boxes: number[][], wanted = 0): { parts: number; of: number[][] } {
  const counts = boxes.map((b) => b.length).sort((a, b) => b - a);
  let parts = counts.length > 1 ? counts[1] : (counts[0] ?? 0);
  if (wanted > 0) parts = (counts[0] ?? 0) >= wanted ? wanted : Math.min(parts, wanted);
  if (!parts) return { parts: 0, of: boxes.map(() => []) };
  const of = boxes.map((ys, i) => {
    const n = Math.min(ys.length, parts);
    if (!n) return [];
    const at = n === parts ? null : partsAt(boxes, parts, i);
    if (!at) return Array.from({ length: n }, (_, k) => k);
    // The cheapest way to give the rows to parts in order: cost[r][p], rows up to r given, the last to part p.
    const cost = Array.from({ length: n }, () => new Array<number>(parts).fill(Infinity));
    const from = Array.from({ length: n }, () => new Array<number>(parts).fill(-1));
    for (let r = 0; r < n; r++)
      for (let p = r; p < parts - (n - 1 - r); p++) {
        const here = Math.abs(ys[r] - at[p]);
        if (r === 0) cost[r][p] = here;
        else
          for (let q = r - 1; q < p; q++)
            if (cost[r - 1][q] + here < cost[r][p]) {
              cost[r][p] = cost[r - 1][q] + here;
              from[r][p] = q;
            }
      }
    let p = 0;
    for (let q = 1; q < parts; q++) if (cost[n - 1][q] < cost[n - 1][p]) p = q;
    const out = new Array<number>(n);
    for (let r = n - 1; r >= 0; r--) {
      out[r] = p;
      p = from[r][p];
    }
    return out;
  });
  return { parts, of };
}

/** A box's tokens without the bar lines at its ends (the box's borders, read as bar lines). */
function inner(tokens: string[]): string[] {
  let a = 0;
  let b = tokens.length;
  while (a < b && tokens[a] === '|') a++;
  while (b > a && tokens[b - 1] === '|') b--;
  return tokens.slice(a, b);
}

/** Rests as long as a row: its beat marks and bar lines only (an empty beat is a rest). */
const restsLike = (tokens: string[]) => tokens.filter((t) => t === ':' || t === '/' || t === '|');

/** A system read box by box: each part's row of tokens, its words rows, and how sure the reader was. */
export interface BoxedReading {
  parts: string[];
  /** Each part's tokens, its boxes joined by bar lines. */
  rows: string[][];
  /** Rows of words: the part they're under (0 for the first), and the piece of each box they're in, in the page's pixels. */
  words: { after: number; pieces: Box[] }[];
  sure: number;
}

/**
 * Reads a boxed system (`boxedSystems`) of the page `img`, box by box: the
 * rows in each box found on their own (`boxBands`) and read with `read`;
 * the rows of notes given to the parts (`partsOfBoxes`); rests for a part
 * with no row in a box (as long as the box's other parts); and the words
 * under each part's row kept as pieces to read. `wanted` is how many parts
 * the person said, or 0. Null when no box has notes.
 */
export async function readBoxedSystem(img: Gray, system: BoxedSystem, read: ReadRow, wanted = 0): Promise<BoxedReading | null> {
  return partsOfBoxes(await boxRows(img, system, read), system, wanted);
}

/**
 * A box's ink (dark pixels) with the table's lines that reach into it
 * cleared: long runs across (a sloping rule's end, a pixel up or down
 * allowed) and down (a leaning border's). Writing has gaps between its
 * letters, so its runs are short.
 */
export function boxInk(g: Gray): Uint8Array {
  const { data, width: w, height: h } = g;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = data[i] < 150 ? 1 : 0;
  const clear = new Uint8Array(w * h);
  const across = Math.max(12, Math.round(0.3 * w));
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && (ink[y * w + x] || (y > 0 && ink[(y - 1) * w + x]) || (y + 1 < h && ink[(y + 1) * w + x]));
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= across) for (let k = start; k < x; k++) clear[y * w + k] = 1;
        start = -1;
      }
    }
  }
  const down = Math.max(12, Math.round(0.4 * h));
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && (ink[y * w + x] || (x > 0 && ink[y * w + x - 1]) || (x + 1 < w && ink[y * w + x + 1]));
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= down) for (let k = start; k < y; k++) clear[k * w + x] = 1;
        start = -1;
      }
    }
  }
  for (let i = 0; i < ink.length; i++) if (clear[i]) ink[i] = 0;
  return ink;
}

/** A box's ink counted row by row of pixels, smoothed over three. */
function profileOf(ink: Uint8Array, w: number, h: number): Float32Array {
  const raw = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    raw[y] = n;
  }
  const out = new Float32Array(h);
  for (let y = 0; y < h; y++) out[y] = (raw[Math.max(0, y - 1)] + raw[y] + raw[Math.min(h - 1, y + 1)]) / 3;
  return out;
}

/** Bands of a box's rows of pixels with ink, top (in) to bottom (out), bits a couple of pixels apart joined. */
function inkBands(profile: Float32Array): [number, number][] {
  const max = Math.max(0, ...profile);
  if (max <= 0) return [];
  const bands: [number, number][] = [];
  for (let y = 0; y < profile.length; y++) {
    if (profile[y] <= max * 0.04) continue;
    const start = y;
    while (y < profile.length && profile[y] > max * 0.04) y++;
    const last = bands[bands.length - 1];
    if (last && start - last[1] <= 2) last[1] = y;
    else bands.push([start, y]);
  }
  return bands.filter(([a, b]) => b - a >= 3);
}

/**
 * The rows in a box, as bands of its pixel rows, given the system's usual
 * row height. A sliver (an octave mark or a slur cut off) joins the row
 * it's nearest if it's close, and is dropped if not. A band much taller than
 * usual is rows that touch (notes and the words under them, in cramped
 * writing): it's split where its ink thins most, if that's at most half as
 * much as each side's busiest, and each side is split again if still tall.
 * A short row (an upbeat's ":d") is kept.
 */
export function boxBands(profile: Float32Array, usual: number): [number, number][] {
  let bands = inkBands(profile);
  const sum = (a: number, b: number) => profile.slice(a, b).reduce((s, v) => s + v, 0);
  const max = Math.max(0, ...profile);
  // Slivers join the nearer row, if close.
  const out: [number, number][] = [];
  for (let i = 0; i < bands.length; i++) {
    const [a, b] = bands[i];
    if (b - a >= 0.4 * usual) {
      out.push([a, b]);
      continue;
    }
    const up = out.length ? a - out[out.length - 1][1] : Infinity;
    const next = bands[i + 1];
    const downGap = next ? next[0] - b : Infinity;
    if (up <= downGap && up <= 0.35 * usual) out[out.length - 1][1] = b;
    else if (next && downGap <= 0.35 * usual) bands[i + 1] = [a, next[1]];
    else if (sum(a, b) >= 0.5 * max && b - a >= 0.25 * usual) out.push([a, b]);
  }
  bands = out;
  const split = (a: number, b: number): [number, number][] => {
    if (b - a <= 1.5 * usual) return [[a, b]];
    let cut = -1;
    for (let y = Math.round(a + 0.4 * usual); y <= Math.round(b - 0.4 * usual); y++) if (cut < 0 || profile[y] < profile[cut]) cut = y;
    if (cut < 0) return [[a, b]];
    const above = Math.max(...profile.slice(a, cut));
    const below = Math.max(...profile.slice(cut + 1, b));
    if (profile[cut] > 0.5 * Math.min(above, below)) return [[a, b]];
    return [...split(a, cut), ...split(cut + 1, b)];
  };
  return bands.flatMap(([a, b]) => split(a, b));
}

/** A row's box from its band of pixel rows: where its ink is, and its baseline and size as rows.ts finds them. */
function rowOf(ink: Uint8Array, w: number, profile: Float32Array, [top, bottom]: [number, number]): RowBox {
  let peak = 0;
  for (let y = top; y < bottom; y++) peak = Math.max(peak, profile[y]);
  let coreTop = bottom;
  let coreBottom = top;
  for (let y = top; y < bottom; y++)
    if (profile[y] > peak * 0.55) {
      coreTop = Math.min(coreTop, y);
      coreBottom = Math.max(coreBottom, y);
    }
  let left = w;
  let right = 0;
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < w; x++)
      if (ink[y * w + x]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
  const size = Math.max((bottom - top) * 0.7, Math.min((bottom - top) * 1.6, (coreBottom - coreTop + 1) * 1.9));
  return { top, bottom, baseline: coreBottom + 1, size, left: left <= right ? left : 0, right: left <= right ? right : w };
}

/** Each box's rows, top to bottom, found on their own and read (see `readBoxedSystem`). Rows share the system's type size. */
export async function boxRows(img: Gray, system: BoxedSystem, read: ReadRow): Promise<BoxRow[][]> {
  const k = img.height / 2400;
  const inset = Math.max(2, Math.round(INSET * k));
  const cuts = system.boxes.map(({ left, right }) => {
    const top = ruleSpan(system.top, left, right)[1] + inset;
    const bottom = ruleSpan(system.bottom, left, right)[0] - inset;
    const gray = crop(img, left, top, right - left, bottom - top);
    const ink = boxInk(gray);
    return { left, top, gray, ink, profile: profileOf(ink, gray.width, gray.height) };
  });
  const usual = middle(cuts.flatMap((c) => inkBands(c.profile).map(([a, b]) => b - a)).filter((h) => h >= 8 * k)) || 30 * k;
  const found = cuts.map((c) => boxBands(c.profile, usual).map((band) => rowOf(c.ink, c.gray.width, c.profile, band)));
  const size = middle(found.flat().map((r) => r.size));
  const boxes: BoxRow[][] = [];
  for (const [i, rows] of found.entries()) {
    const { left, top } = cuts[i];
    const out: BoxRow[] = [];
    for (const r of rows) {
      const row: RowBox = { top: r.top + top, bottom: r.bottom + top, baseline: r.baseline + top, size, left: r.left + left, right: r.right + left };
      const got = await read(row);
      out.push({ row, read: got, score: notesLikeness(got), beats: got.tokens.filter((t) => t === ':').length, y: (row.top + row.bottom) / 2 });
    }
    boxes.push(out);
  }
  return boxes;
}

/**
 * The parts' rows from each box's rows (see `readBoxedSystem`). Rows surely
 * of notes are given to the parts first (`partsOfRows`); then, in a box
 * lacking a part, a short row that may be notes (an upbeat) is taken as
 * that part's if it's at its height. A box's half-bar marks read as bar
 * lines are made "/" when the box's other parts read none (a box is a bar).
 * The rows below a part's notes, before the next part's, are its words.
 */
export function partsOfBoxes(boxes: BoxRow[][], system: BoxedSystem, wanted = 0): BoxedReading | null {
  const sure = boxes.map((rows) => rows.filter(sureNotes));
  const most = partsOfRows(
    sure.map((rows) => rows.map((r) => r.y)),
    wanted,
  ).parts;
  if (!most) return null;
  // At most as many rows of notes in a box as parts: the ones reading most like notes.
  const kept = sure.map((rows) => {
    if (rows.length <= most) return rows;
    const best = new Set([...rows].sort((a, b) => b.score - a.score).slice(0, most));
    return rows.filter((r) => best.has(r));
  });
  const ys = kept.map((rows) => rows.map((r) => r.y));
  const { parts, of } = partsOfRows(ys, most);
  const full = ys.filter((y) => y.length === parts);
  const apart = middle(full.flatMap((y) => y.slice(1).map((v, p) => v - y[p])));
  const notes = kept.map((rows, i) => {
    const given = rows.map((r, k) => ({ r, part: of[i][k] }));
    const at = given.length < parts && apart > 0 ? partsAt(ys, parts, i) : null;
    if (!at) return given;
    for (const r of boxes[i]) {
      if (rows.includes(r) || !mayBeNotes(r)) continue;
      let part = -1;
      for (let p = 0; p < parts; p++) if (!given.some((g) => g.part === p) && (part < 0 || Math.abs(r.y - at[p]) < Math.abs(r.y - at[part]))) part = p;
      if (part < 0 || Math.abs(r.y - at[part]) > NEAR_PART * apart) continue;
      // The parts stay in order down the box.
      if (given.some((g) => (g.r.y < r.y) !== (g.part < part))) continue;
      given.push({ r, part });
    }
    return given.sort((a, b) => a.r.y - b.r.y);
  });
  const rows: string[][] = Array.from({ length: parts }, () => []);
  const words = new Map<string, { after: number; pieces: Box[] }>();
  const usual = middle(boxes.flat().map((r) => r.row.bottom - r.row.top));
  let least = 1;
  notes.forEach((given, i) => {
    if (!given.length) return;
    const tokens = given.map((g) => inner(g.r.read.tokens));
    // A box is a bar: a bar line read inside it, where the box's other parts read none, is its half-bar mark.
    const barsIn = middle(tokens.map((t) => t.filter((x) => x === '|').length));
    const fixed = tokens.map((t) => (barsIn === 0 ? t.map((x) => (x === '|' ? '/' : x)) : t));
    const longest = fixed.reduce((a, b) => (b.length > a.length ? b : a));
    for (let p = 0; p < parts; p++) {
      const g = given.findIndex((x) => x.part === p);
      if (g >= 0) least = Math.min(least, given[g].r.read.sure);
      if (rows[p].length) rows[p].push('|');
      rows[p].push(...(g >= 0 ? fixed[g] : restsLike(longest)));
    }
    // Rows of words: under a part's notes, before the next part's (the first verse first). A sliver isn't words.
    const all = boxes[i];
    given.forEach(({ r, part }, n) => {
      const next = given[n + 1]?.r;
      const under = all.filter((x) => x.y > r.y && (!next || x.y < next.y) && !given.some((g) => g.r === x) && x.row.bottom - x.row.top >= 0.5 * usual);
      under.forEach((w, verse) => {
        const key = `${part}:${verse}`;
        const entry = words.get(key) ?? { after: part, pieces: [] };
        entry.pieces.push({ top: w.row.top, bottom: w.row.bottom, left: system.boxes[i].left, right: system.boxes[i].right });
        words.set(key, entry);
      });
    });
  });
  return {
    parts: partsFor(parts),
    rows,
    words: [...words.values()].sort((a, b) => a.after - b.after),
    sure: least,
  };
}
