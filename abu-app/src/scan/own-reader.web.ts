/**
 * Abụ's own row reader in the browser: the small model trained in
 * abu-reader/train (public/reader/rows.onnx) run by ONNX Runtime's WebAssembly
 * build (public/ort, copied at build time), free and on the phone. It reads a
 * line's rows of notes; Haiku then checks the reading against the picture.
 */
import { groupRows, notesRows, pageRows, partsFor, skewOf } from './page-lines';
import { barsFromBorders, findRows, greedy, notesLikeness, tableBorders, toText, type Gray, type RowBox } from './rows';
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
    s.onerror = () => reject(new Error('Abụ’s reader didn’t load. Check your connection.'));
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
        if (!r.ok) throw new Error('Abụ’s reader didn’t load.');
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

/** A line's rows of notes, read by Abụ's own model: one row of Abụ text per part, and how sure it was. */
export async function readLineOwn(canvas: HTMLCanvasElement, parts: string[], wordsRows = 1): Promise<{ text: string; sure: number }> {
  const { ort, session, meta } = await reader();
  const gray = grayOf(canvas);
  const rows = findRows(gray, parts.length + wordsRows, parts.length);
  const borders = rows.length >= 2 ? tableBorders(gray) : [];
  const read: { top: number; tokens: string[]; sure: number; score: number }[] = [];
  for (const row of rows) {
    const b = band(canvas, row, meta);
    const out = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
    const scores = out.tokens;
    const r = greedy(scores.data, Math.min(b.steps, scores.dims[1]), scores.dims[2], meta.tokens);
    // Each token's place in the line: its step in the band, back in the line's pixels.
    const xs = r.at.map((t) => b.left + (t + 0.5) * meta.stride * b.scale);
    const tokens = barsFromBorders(r.tokens, xs, borders, 0.8 * row.size);
    read.push({ top: row.top, ...r, tokens, score: notesLikeness(r) });
  }
  const chosen = [...read]
    .sort((a, b) => b.score - a.score)
    .slice(0, parts.length)
    .sort((a, b) => a.top - b.top);
  return {
    text: chosen.map((r, i) => `${parts[i].padEnd(2)} ${toText(r.tokens)}`).join('\n'),
    sure: chosen.length ? Math.min(...chosen.map((r) => r.sure)) : 0,
  };
}

/** Pages are searched for their lines this big, on their longer side. */
const FIND_EDGE = 1200;

/**
 * The lines of music on a page picture, found by where the ink is and read
 * by Abụ's own model to tell rows of notes from rows of words (page-lines.ts;
 * no AI). `parts` is how many voice parts each line has, or 0 to work it
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
  const { rows, rules } = pageRows(grayOf(small));
  const big = (r: RowBox): RowBox => ({ top: r.top * k, bottom: r.bottom * k, baseline: r.baseline * k, size: r.size * k, left: r.left * k, right: r.right * k });
  const reads = [];
  for (const row of rows) {
    const b = band(page, big(row), meta);
    const out = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
    const r = greedy(out.tokens.data, Math.min(b.steps, out.tokens.dims[1]), out.tokens.dims[2], meta.tokens);
    reads.push({ score: notesLikeness(r), beats: r.tokens.filter((t) => t === ':').length });
  }
  const isNotes = notesRows(reads);
  const boxOf = (g: number[]): Box => ({
    top: rows[g[0]].top * k,
    bottom: rows[g[g.length - 1]].bottom * k,
    left: Math.min(...g.map((i) => rows[i].left)) * k,
    right: Math.max(...g.map((i) => rows[i].right)) * k,
  });
  const lines = groupRows(rows, isNotes, rules, parts).map((g) => {
    let seen = 0;
    const wordRows: FoundLine['wordRows'] = [];
    for (const i of g) {
      if (isNotes[i]) seen++;
      else wordRows.push({ box: boxOf([i]), after: Math.max(0, seen - 1) });
    }
    return { box: boxOf(g), parts: partsFor(seen), words: wordRows.length, wordRows };
  });
  return { page, lines };
}

export const ownReaderHere = true;
