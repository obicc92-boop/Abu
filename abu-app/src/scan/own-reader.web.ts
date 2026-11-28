/**
 * SolfaScores' own row reader in the browser: the small model trained in
 * abu-reader/train (public/reader/rows.onnx) run by ONNX Runtime's WebAssembly
 * build (public/ort, copied at build time), free and on the phone. It reads a
 * line's rows of notes; Haiku then checks the reading against the picture.
 */
import { boxedSystems, notesIn, pageRules, readBoxedSystem, ruleY, type RowReading } from './boxes';
import { groupLines, notesRows, pageRows, partsFor, skewOf } from './page-lines';
import { barsFromTable, evenPaper, findRows, greedy, notesLikeness, ruledBorders, tableBorders, toText, type Gray, type RowBox } from './rows';
import type { Box, FoundLine } from './types';

interface Meta {
  height: number;
  stride: number;
  band: { above: number; below: number; side: number };
  tokens: string[];
}
interface Tensor {
  data: Float32Array;
  dims: number[];
}
interface Session {
  run(feeds: Record<string, unknown>): Promise<Record<string, Tensor>>;
}
interface Ort {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(url: string, options: Record<string, unknown>): Promise<Session> };
}

let loading: Promise<{ ort: Ort; session: Session; meta: Meta }> | null = null;

function script(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('The sheet reader didn’t load. Check your connection.'));
    document.head.appendChild(s);
  });
}

/** ONNX Runtime and the model, loaded once. */
function reader() {
  loading ??= (async () => {
    const w = window as unknown as { ort?: Ort };
    if (!w.ort) await script('/ort/ort.wasm.min.js');
    const ort = w.ort!;
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = 1;
    const [session, meta] = await Promise.all([
      ort.InferenceSession.create('/reader/rows.onnx', { executionProviders: ['wasm'] }),
      fetch('/reader/rows.json').then((r) => {
        if (!r.ok) throw new Error('The sheet reader didn’t load.');
        return r.json() as Promise<Meta>;
      }),
    ]);
    return { ort, session, meta };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

function grayOf(canvas: HTMLCanvasElement): Gray {
  const { width, height } = canvas;
  const px = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
  return { data, width, height };
}

/** The row cut out as the reader was trained (a band around its baseline), as ink 1 / paper 0. */
function band(canvas: HTMLCanvasElement, row: RowBox, meta: Meta): { data: Float32Array; width: number; steps: number; left: number; scale: number } {
  const s = row.size;
  const left = row.left - meta.band.side * s;
  const top = row.baseline - meta.band.above * s;
  const w = row.right - row.left + 2 * meta.band.side * s;
  const h = (meta.band.above + meta.band.below) * s;
  const scale = h / meta.height;
  const width = Math.max(32, Math.round(w / scale));
  const padded = width + ((meta.stride - (width % meta.stride)) % meta.stride);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = meta.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, meta.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, left, top, w, h, 0, 0, width, meta.height);
  const px = ctx.getImageData(0, 0, width, meta.height).data;
  const data = new Float32Array(padded * meta.height);
  for (let y = 0; y < meta.height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[y * padded + x] = 1 - (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    }
  return { data, width: padded, steps: Math.floor(width / meta.stride), left, scale: w / width };
}

/** A line's rows of notes, read by SolfaScores' own model: one row of SolfaScores text per part, and how sure it was. */
export async function readLineOwn(canvas: HTMLCanvasElement, parts: string[], wordsRows = 1): Promise<{ text: string; sure: number }> {
  const { ort, session, meta } = await reader();
  // A photo's grey paper brought up to white first: rows and borders are found by a fixed darkness.
  const gray = evenPaper(grayOf(canvas));
  const rows = findRows(gray, parts.length + wordsRows, parts.length);
  const borders = rows.length >= 2 ? tableBorders(gray, rows) : [];
  const ruled = rows.length >= 2 ? ruledBorders(gray) : [];
  const read: { top: number; bottom: number; y: number; tokens: string[]; xs: number[]; sure: number; score: number }[] = [];
  for (const row of rows) {
    const b = band(canvas, row, meta);
    const out = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
    const scores = out.tokens;
    const r = greedy(scores.data, Math.min(b.steps, scores.dims[1]), scores.dims[2], meta.tokens);
    // Each token's place in the line: its step in the band, back in the line's pixels.
    const xs = r.at.map((t) => b.left + (t + 0.5) * meta.stride * b.scale);
    read.push({ top: row.top, bottom: row.bottom, y: (row.top + row.bottom) / 2, tokens: r.tokens, xs, sure: r.sure, score: notesLikeness(r) });
  }
  const chosen = [...read]
    .sort((a, b) => b.score - a.score)
    .slice(0, parts.length)
    .sort((a, b) => a.top - b.top);
  // A table's borders are the bar lines in every part they run through, each row meeting a leaning
  // border at its own height. The rows share a type size, so one `near` does for all.
  const near = rows.length ? 0.8 * rows[0].size : 0;
  const barred = barsFromTable(chosen, borders, near, ruled, gray);
  return {
    text: chosen.map((r, i) => `${parts[i].padEnd(2)} ${toText(barred[i].tokens)}`).join('\n'),
    sure: chosen.length ? Math.min(...chosen.map((r) => r.sure)) : 0,
  };
}

/** Pages are searched for their lines this big, on their longer side. */
const FIND_EDGE = 1200;
/**
 * A boxed sheet is read box by box if that reads at least this share of the notes read row by row across it.
 * On 50 handwritten test pages (20 November 2026), every page that read worse box by box read under half the
 * notes (systems run together where a faint rule was missed); 14 of the 17 that read better, 0.63 or more.
 */
const BOXED_ENOUGH = 0.6;

/**
 * The lines of music on a page picture, found by where the ink is and read
 * by SolfaScores' own model to tell rows of notes from rows of words (page-lines.ts;
 * no AI). On a boxed sheet the lines come already read, box by box
 * (boxes.ts), as `draft`. `parts` is how many voice parts each line has, or 0 to work it
 * out. A tilted page (a photo) is straightened first, and comes back as
 * `page` to cut the lines from. Boxes are in the page's pixels; each row of
 * words says which part's row it comes after (0 for the first), so its words
 * can go there.
 */
export async function findLinesOwn(original: HTMLCanvasElement, parts = 0): Promise<{ page: HTMLCanvasElement; lines: FoundLine[] }> {
  const { ort, session, meta } = await reader();
  const k = Math.max(1, Math.max(original.width, original.height) / FIND_EDGE);
  const shrink = (from: HTMLCanvasElement) => {
    const c = document.createElement('canvas');
    c.width = Math.round(from.width / k);
    c.height = Math.round(from.height / k);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from, 0, 0, c.width, c.height);
    return c;
  };
  let page = original;
  let small = shrink(page);
  // Rows found on a tilted page run into each other: straighten it first.
  const tilt = skewOf(grayOf(small));
  if (Math.abs(tilt) >= 0.2) {
    page = document.createElement('canvas');
    page.width = original.width;
    page.height = original.height;
    const ctx = page.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.translate(page.width / 2, page.height / 2);
    ctx.rotate((-tilt * Math.PI) / 180);
    ctx.drawImage(original, -page.width / 2, -page.height / 2);
    small = shrink(page);
  }
  const smallGray = grayOf(small);
  const { rows, rules, long, links } = pageRows(smallGray);
  const big = (r: RowBox): RowBox => ({ top: r.top * k, bottom: r.bottom * k, baseline: r.baseline * k, size: r.size * k, left: r.left * k, right: r.right * k });
  const reads = [];
  for (const row of rows) {
    const b = band(page, big(row), meta);
    const out = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
    const r = greedy(out.tokens.data, Math.min(b.steps, out.tokens.dims[1]), out.tokens.dims[2], meta.tokens);
    reads.push({ score: notesLikeness(r), beats: r.tokens.filter((t) => t === ':').length, text: toText(r.tokens), height: row.bottom - row.top, width: (row.right - row.left) / small.width, notes: notesIn(r.tokens) });
  }
  const isNotes = notesRows(reads);
  // A boxed sheet (each bar in a box of its own, the parts stacked in it, handwritten at their own heights):
  // read box by box (boxes.ts). Its rules are found on the small page, its boxes and rows on the page itself.
  // Kept only if it reads about as many notes as the rows across the page hold: where a rule or a border
  // between boxes is missed (drawn faintly, or a photo's shadow), systems run together and music is lost.
  const ruled = pageRules(smallGray).map((r) => ({ y: r.y * k, slope: r.slope }));
  const whole = ruled.length >= 3 ? grayOf(page) : null;
  const systems = whole ? boxedSystems(whole, ruled) : null;
  if (whole && systems) {
    const readRow = async (row: RowBox): Promise<RowReading> => {
      const b = band(page, row, meta);
      const out = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
      const r = greedy(out.tokens.data, Math.min(b.steps, out.tokens.dims[1]), out.tokens.dims[2], meta.tokens);
      return { tokens: r.tokens, sure: r.sure, mean: r.mean };
    };
    const lines: FoundLine[] = [];
    let notes = 0;
    for (const s of systems) {
      const got = await readBoxedSystem(whole, s, readRow, parts);
      if (!got) continue;
      notes += got.rows.reduce((n, r) => n + notesIn(r), 0);
      const left = s.boxes[0].left;
      const right = s.boxes[s.boxes.length - 1].right;
      const box = { left, right, top: Math.min(ruleY(s.top, left), ruleY(s.top, right)), bottom: Math.max(ruleY(s.bottom, left), ruleY(s.bottom, right)) };
      const wordRows = got.words.map((w) => ({
        after: w.after,
        pieces: w.pieces,
        box: {
          left: Math.min(...w.pieces.map((p) => p.left)),
          right: Math.max(...w.pieces.map((p) => p.right)),
          top: Math.min(...w.pieces.map((p) => p.top)),
          bottom: Math.max(...w.pieces.map((p) => p.bottom)),
        },
      }));
      const draft = got.parts.map((p, i) => `${p.padEnd(2)} ${toText(got.rows[i])}`).join('\n');
      lines.push({ box, parts: got.parts, words: wordRows.length, wordRows, draft });
    }
    const across = reads.reduce((n, r, i) => n + (isNotes[i] ? r.notes : 0), 0);
    if (lines.length && notes >= BOXED_ENOUGH * across) return { page, lines };
  }
  const boxOf = (g: number[]): Box => ({
    top: rows[g[0]].top * k,
    bottom: rows[g[g.length - 1]].bottom * k,
    left: Math.min(...g.map((i) => rows[i].left)) * k,
    right: Math.max(...g.map((i) => rows[i].right)) * k,
  });
  // A printed sheet's bar lines say which rows are one line, each with its own number of parts.
  const grouped = groupLines(rows, isNotes, rules, long, parts, { links, reads });
  const lines = grouped.lines.map((g) => {
    let seen = 0;
    const wordRows: FoundLine['wordRows'] = [];
    for (const i of g) {
      if (grouped.notes[i]) seen++;
      else wordRows.push({ box: boxOf([i]), after: Math.max(0, seen - 1) });
    }
    // No more parts than the person said each line has: a row of words read like notes is left to the line's
    // reader, which takes the rows that read most like notes.
    const n = grouped.parts ? Math.min(seen, grouped.parts) : seen;
    return { box: boxOf(g), parts: partsFor(n), words: g.length - n, wordRows: wordRows.map((w) => ({ ...w, after: Math.min(w.after, n - 1) })) };
  });
  return { page, lines };
}

export const ownReaderHere = true;
