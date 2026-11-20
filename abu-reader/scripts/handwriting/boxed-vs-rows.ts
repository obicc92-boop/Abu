// For each page: how many notes the app reads on it box by box (src/scan/boxes.ts) and row by row across the page
// (page-lines.ts, as findLinesOwn does first), to see when reading box by box misses music (a rule or border
// missed, systems run together). Pages are taken at most 2400 tall, as the app does.
// Usage (from abu-app): npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/boxed-vs-rows.ts <pages.json [{file}]>
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from '../../../abu-app/node_modules/jimp-compact/dist/jimp.js';
import * as ort from '../../../abu-app/node_modules/onnxruntime-web/dist/ort.node.min.mjs';
import { boxedSystems, notesIn, pageRules, readBoxedSystem } from '../../../abu-app/src/scan/boxes';
import { notesRows, pageRows } from '../../../abu-app/src/scan/page-lines';
import { greedy, notesLikeness, toText, type Gray, type RowBox } from '../../../abu-app/src/scan/rows';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = resolve(process.env.MODEL ?? join(HERE, '../../../abu-app/public/reader/rows.onnx'));
const meta = JSON.parse(readFileSync(MODEL.replace(/\.onnx$/, '.json'), 'utf8'));
ort.env.wasm.numThreads = 1;

function resize(g: Gray, w: number, h: number): Gray {
  const out = new Uint8Array(w * h);
  const sx = g.width / w, sy = g.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.min(g.height, Math.ceil((y + 1) * sy)); yy++)
        for (let xx = Math.floor(x * sx); xx < Math.min(g.width, Math.ceil((x + 1) * sx)); xx++) {
          sum += g.data[yy * g.width + xx];
          n++;
        }
      out[y * w + x] = Math.round(sum / Math.max(1, n));
    }
  return { data: out, width: w, height: h };
}

function band(gray: Gray, row: RowBox) {
  const s = row.size;
  const left = row.left - meta.band.side * s;
  const top = row.baseline - meta.band.above * s;
  const w = row.right - row.left + 2 * meta.band.side * s;
  const h = (meta.band.above + meta.band.below) * s;
  const width = Math.max(32, Math.round(w / (h / meta.height)));
  const padded = width + ((meta.stride - (width % meta.stride)) % meta.stride);
  const data = new Float32Array(padded * meta.height);
  const sx = w / width, sy = h / meta.height;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gray.width || y >= gray.height ? 255 : gray.data[y * gray.width + x]);
  for (let y = 0; y < meta.height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0, n = 0;
      for (let yy = Math.floor(top + y * sy); yy < Math.ceil(top + (y + 1) * sy); yy++)
        for (let xx = Math.floor(left + x * sx); xx < Math.ceil(left + (x + 1) * sx); xx++) {
          sum += at(xx, yy);
          n++;
        }
      data[y * padded + x] = 1 - sum / Math.max(1, n) / 255;
    }
  return { data, width: padded, steps: Math.floor(width / meta.stride) };
}

async function main() {
  const file = process.argv[2];
  const pages: { file: string }[] = JSON.parse(readFileSync(file, 'utf8'));
  const session = await ort.InferenceSession.create(readFileSync(MODEL), { executionProviders: ['wasm'] });
  const read = async (g: Gray, row: RowBox) => {
    const b = band(g, row);
    const out = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
    return greedy(out.tokens.data, Math.min(b.steps, out.tokens.dims[1]), out.tokens.dims[2], meta.tokens);
  };
  for (const p of pages) {
    const img = await Jimp.read(join(dirname(file), p.file));
    const { width, height, data } = img.bitmap;
    let page: Gray = { data: new Uint8Array(width * height), width, height };
    for (let i = 0, j = 0; j < page.data.length; i += 4, j++) page.data[j] = Math.floor((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);
    const s = Math.min(1, 2400 / Math.max(width, height));
    if (s < 1) page = resize(page, Math.round(width * s), Math.round(height * s));
    const k = Math.max(1, Math.max(page.width, page.height) / 1200);
    const small = k > 1 ? resize(page, Math.round(page.width / k), Math.round(page.height / k)) : page;
    // Row by row across the page.
    const { rows } = pageRows(small);
    const reads = [];
    for (const r of rows) {
      const got = await read(page, { top: r.top * k, bottom: r.bottom * k, baseline: r.baseline * k, size: r.size * k, left: r.left * k, right: r.right * k });
      reads.push({ score: notesLikeness(got), beats: got.tokens.filter((t) => t === ':').length, text: toText(got.tokens), height: r.bottom - r.top, width: (r.right - r.left) / small.width, tokens: got.tokens });
    }
    const isNotes = notesRows(reads);
    const across = reads.reduce((n, r, i) => n + (isNotes[i] ? notesIn(r.tokens) : 0), 0);
    // Box by box.
    const rules = pageRules(small).map((r) => ({ y: r.y * k, slope: r.slope }));
    const systems = rules.length >= 3 ? boxedSystems(page, rules) : null;
    let boxed = 0;
    let lines = 0;
    for (const sys of systems ?? []) {
      const got = await readBoxedSystem(page, sys, (row) => read(page, row), 4);
      if (!got) continue;
      lines++;
      boxed += got.rows.reduce((n, r) => n + notesIn(r), 0);
    }
    console.log(`${p.file}\tacross ${across}\t${systems ? `boxed ${boxed} (${lines} lines)\t${(boxed / Math.max(1, across)).toFixed(2)}` : 'not boxed'}`);
  }
}
main();
