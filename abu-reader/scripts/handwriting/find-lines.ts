// Finds the lines on page pictures as the app's findLinesOwn does (page at most 2400 px, straightened if
// tilted, shrunk to 1200 px to find its rows, each row read by the reader to tell notes from words, then
// grouped), caching the row readings, and writes per page: rows, readings, ruled lines, the grouping, and the
// shrunk straightened page as PNG (for overlays). score-lines.py scores the grouping against row labels.
// Usage (from abu-app): npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/find-lines.ts <pages.json [{file}]> <out dir> [parts=4]
// MODEL=<rows.onnx> reads with another model (its .json beside it); PAGE_LINES=<module path> finds the rows,
// tells notes from words and groups them with that copy of page-lines.ts (e.g. an older one, beside the
// app's so its imports resolve) instead of the app's.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from '../../../abu-app/node_modules/jimp-compact/dist/jimp.js';
import * as ort from '../../../abu-app/node_modules/onnxruntime-web/dist/ort.node.min.mjs';
import * as appLines from '../../../abu-app/src/scan/page-lines';
import { greedy, notesLikeness, toText, type Gray, type RowBox } from '../../../abu-app/src/scan/rows';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = resolve(process.env.MODEL ?? join(HERE, '../../../abu-app/public/reader/rows.onnx'));
const meta = JSON.parse(readFileSync(MODEL.replace(/\.onnx$/, '.json'), 'utf8'));
const modelId = createHash('md5').update(readFileSync(MODEL)).digest('hex').slice(0, 8);
ort.env.wasm.numThreads = 1;

/** Area-average resize of a gray picture. */
function resize(g: Gray, w: number, h: number): Gray {
  const out = new Uint8Array(w * h);
  const sx = g.width / w;
  const sy = g.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = x * sx, x1 = x0 + sx, y0 = y * sy, y1 = y0 + sy;
      let sum = 0, area = 0;
      for (let yy = Math.floor(y0); yy < Math.min(g.height, Math.ceil(y1)); yy++) {
        const fy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.min(g.width, Math.ceil(x1)); xx++) {
          const fx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          sum += g.data[yy * g.width + xx] * fx * fy;
          area += fx * fy;
        }
      }
      out[y * w + x] = Math.round(sum / area);
    }
  return { data: out, width: w, height: h };
}

/** The canvas's rotate(-tilt) about the middle, white around, bilinear. */
function rotate(g: Gray, tiltDeg: number): Gray {
  const a = (-tiltDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const cx = g.width / 2, cy = g.height / 2;
  const out = new Uint8Array(g.width * g.height).fill(255);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      // Inverse of rotating by a: rotate (x, y) about the middle by -a.
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const sxp = cos * dx + sin * dy + cx - 0.5;
      const syp = -sin * dx + cos * dy + cy - 0.5;
      const x0 = Math.floor(sxp), y0 = Math.floor(syp);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= g.width || y0 + 1 >= g.height) continue;
      const fx = sxp - x0, fy = syp - y0;
      const p = (xx: number, yy: number) => g.data[yy * g.width + xx];
      out[y * g.width + x] = Math.round(p(x0, y0) * (1 - fx) * (1 - fy) + p(x0 + 1, y0) * fx * (1 - fy) + p(x0, y0 + 1) * (1 - fx) * fy + p(x0 + 1, y0 + 1) * fx * fy);
    }
  return { data: out, width: g.width, height: g.height };
}

function band(gray: Gray, row: RowBox) {
  const s = row.size;
  const left = row.left - meta.band.side * s;
  const top = row.baseline - meta.band.above * s;
  const w = row.right - row.left + 2 * meta.band.side * s;
  const h = (meta.band.above + meta.band.below) * s;
  const scale = h / meta.height;
  const width = Math.max(32, Math.round(w / scale));
  const padded = width + ((meta.stride - (width % meta.stride)) % meta.stride);
  const data = new Float32Array(padded * meta.height);
  const sx = w / width, sy = h / meta.height;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gray.width || y >= gray.height ? 255 : gray.data[y * gray.width + x]);
  for (let y = 0; y < meta.height; y++) {
    const y0 = top + y * sy, y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = left + x * sx, x1 = x0 + sx;
      let sum = 0, area = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const fy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        if (fy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const fx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          if (fx <= 0) continue;
          sum += at(xx, yy) * fx * fy;
          area += fx * fy;
        }
      }
      data[y * padded + x] = 1 - sum / area / 255;
    }
  }
  return { data, width: padded, steps: Math.floor(width / meta.stride) };
}

async function grayFile(file: string): Promise<Gray> {
  const img = await Jimp.read(file);
  const { width, height, data } = img.bitmap;
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = Math.floor((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);
  return { data: g, width, height };
}

async function savePng(g: Gray, file: string) {
  const img = new Jimp(g.width, g.height);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i];
    img.bitmap.data[4 * i] = v; img.bitmap.data[4 * i + 1] = v; img.bitmap.data[4 * i + 2] = v; img.bitmap.data[4 * i + 3] = 255;
  }
  await img.writeAsync(file);
}

async function main() {
  const [pagesFile, outDir, partsArg] = process.argv.slice(2);
  const parts = Number(partsArg ?? 4);
  mkdirSync(outDir, { recursive: true });
  const root = dirname(pagesFile);
  const pages: { file: string }[] = JSON.parse(readFileSync(pagesFile, 'utf8'));
  const { groupLines, notesRows, pageRows, skewOf }: typeof appLines = process.env.PAGE_LINES ? await import(resolve(process.env.PAGE_LINES)) : appLines;
  const session = await ort.InferenceSession.create(readFileSync(MODEL), { executionProviders: ['wasm'] });
  const results = [];
  for (const [n, p] of pages.entries()) {
    const id = p.file.replace(/[^\w.-]+/g, '_');
    let page = await grayFile(join(root, p.file));
    const s = Math.min(1, 2400 / Math.max(page.width, page.height));
    if (s < 1) page = resize(page, Math.round(page.width * s), Math.round(page.height * s));
    const k = Math.max(1, Math.max(page.width, page.height) / 1200);
    const shrink = (g: Gray) => resize(g, Math.round(g.width / k), Math.round(g.height / k));
    let small = shrink(page);
    const tilt = skewOf(small);
    if (Math.abs(tilt) >= 0.2) {
      page = rotate(page, tilt);
      small = shrink(page);
    }
    const { rows, rules, long } = pageRows(small);
    const rowsId = createHash('md5').update(JSON.stringify(rows)).digest('hex').slice(0, 8);
    const cacheFile = join(dirname(resolve(pagesFile)), 'pagecache', `${id}-${page.width}x${page.height}-${tilt.toFixed(2)}-${modelId}-${rowsId}.json`);
    mkdirSync(dirname(cacheFile), { recursive: true });
    let reads: { score: number; beats: number; text: string; height: number; width: number }[];
    if (existsSync(cacheFile)) reads = JSON.parse(readFileSync(cacheFile, 'utf8'));
    else {
      reads = [];
      for (const row of rows) {
        const big: RowBox = { top: row.top * k, bottom: row.bottom * k, baseline: row.baseline * k, size: row.size * k, left: row.left * k, right: row.right * k };
        const b = band(page, big);
        const res = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
        const sc = Object.values(res)[0] as unknown as { data: Float32Array; dims: number[] };
        const r = greedy(sc.data, Math.min(b.steps, sc.dims[1]), sc.dims[2], meta.tokens);
        reads.push({ score: notesLikeness(r), beats: r.tokens.filter((t) => t === ':').length, text: toText(r.tokens), height: row.bottom - row.top, width: (row.right - row.left) / small.width });
      }
      writeFileSync(cacheFile, JSON.stringify(reads));
    }
    const isNotes = notesRows(reads);
    const lines: number[][] = groupLines(rows, isNotes, rules, long, parts).lines;
    const png = join(outDir, `${id.replace(/\.\w+$/, '')}.png`);
    if (!existsSync(png)) await savePng(small, png);
    results.push({ n, file: p.file, png, tilt, width: small.width, height: small.height, rows, rules, long, reads, isNotes, lines });
    console.log(`${String(n).padStart(2)} ${p.file}: ${rows.length} rows, ${isNotes.filter(Boolean).length} notes, ${lines.length} lines`);
  }
  writeFileSync(join(outDir, 'pages.json'), JSON.stringify(results, null, 1));
}
main();
