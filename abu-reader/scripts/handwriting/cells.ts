// Reads a boxed sheet's page box by box, as the app does (abu-app/src/scan/boxes.ts), with the app's model, and
// prints each system's parts and whether every bar adds up. The page should be at most 2400 tall, as in the app.
// ROWS=1 prints every row found in each box (N notes, ? maybe an upbeat), DRAW=<system> saves that system's
// picture with its rows boxed (notes red), PARTS (default 4) is how many parts the person said, TIME the time.
// Usage (from abu-app): npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/cells.ts <page.png> <out dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from '../../../abu-app/node_modules/jimp-compact/dist/jimp.js';
import * as ort from '../../../abu-app/node_modules/onnxruntime-web/dist/ort.node.min.mjs';
import { boxedSystems, boxRows, pageRules, partsOfBoxes } from '../../../abu-app/src/scan/boxes';
import { parseSolfa } from '../../../abu-app/src/solfa/parse';
import { greedy, toText, type Gray, type RowBox } from '../../../abu-app/src/scan/rows';

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

async function main() {
  const [pageFile, outDir] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const session = await ort.InferenceSession.create(readFileSync(MODEL), { executionProviders: ['wasm'] });
  const read = async (g: Gray, row: RowBox) => {
    const b = band(g, row);
    const out = await session.run({ image: new ort.Tensor('float32', b.data, [1, 1, meta.height, b.width]) });
    return greedy(out.tokens.data, Math.min(b.steps, out.tokens.dims[1]), out.tokens.dims[2], meta.tokens);
  };
  {
    // As the app does it: rules found on the page shrunk to 1200, systems and boxes on the page.
    const page = await grayFile(pageFile);
    const k = Math.max(page.width, page.height) / 1200;
    const small = resize(page, Math.round(page.width / k), Math.round(page.height / k));
    const rules = pageRules(small).map((r) => ({ y: r.y * k, slope: r.slope }));
    const systems = boxedSystems(page, rules);
    console.log(`rules at ${rules.map((r) => Math.round(r.y)).join(' ')}; ${systems ? systems.length : 'not'} boxed systems`);
    const time = process.env.TIME ?? '4/4';
    const all: unknown[] = [];
    for (const [n, s] of (systems ?? []).entries()) {
      const rows = await boxRows(page, s, (row) => read(page, row));
      const got = partsOfBoxes(rows, s, Number(process.env.PARTS ?? 4));
      console.log(`\nSystem ${n + 1}: ${s.boxes.length} boxes at ${s.boxes.map((b) => `${Math.round(b.left)}–${Math.round(b.right)}`).join(' ')}`);
      if (process.env.DRAW && Number(process.env.DRAW) === n + 1) {
        // The system with each row found boxed (notes thick), for looking at.
        const top = Math.round(Math.min(s.top.y, s.top.y + s.top.slope * page.width));
        const bottom = Math.round(Math.max(s.bottom.y, s.bottom.y + s.bottom.slope * page.width));
        const img = new Jimp(page.width, bottom - top);
        for (let y = 0; y < bottom - top; y++)
          for (let x = 0; x < page.width; x++) {
            const v = page.data[(y + top) * page.width + x];
            img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
          }
        for (const box of rows)
          for (const r of box) {
            const c = r.beats >= 2 && r.score >= 0.3 ? Jimp.rgbaToInt(220, 30, 30, 255) : Jimp.rgbaToInt(30, 120, 220, 255);
            for (let x = Math.round(r.row.left); x <= Math.round(r.row.right); x++)
              for (const y of [r.row.top, r.row.bottom - 1]) img.setPixelColor(c, x, Math.round(y) - top);
            for (let y = Math.round(r.row.top); y < Math.round(r.row.bottom); y++)
              for (const x of [r.row.left, r.row.right]) img.setPixelColor(c, Math.round(x), y - top);
          }
        await img.writeAsync(join(outDir, `system${n + 1}.png`));
      }
      if (process.env.ROWS)
        rows.forEach((box, i) => {
          console.log(`  box ${i + 1}`);
          for (const r of box) console.log(`    y ${Math.round(r.y)} h ${Math.round(r.row.bottom - r.row.top)} ${r.beats >= 2 && r.score >= 0.3 ? 'N' : r.beats >= 1 ? '?' : ' '} ${r.score.toFixed(2)} mean ${r.read.mean.toFixed(2)}  ${toText(r.read.tokens)}`);
        });
      if (!got) {
        console.log('  no notes');
        continue;
      }
      const text = got.parts.map((p, i) => `${p.padEnd(2)} ${toText(got.rows[i])}`).join('\n');
      console.log(text.replace(/^/gm, '  '));
      const errors = parseSolfa(text, { time }).errors;
      console.log(`  ${errors.length ? errors.map((e) => e.message).join(' / ') : 'adds up'}`);
      console.log(`  words: ${got.words.map((w) => `${got.parts[w.after]} (${w.pieces.length} pieces)`).join(', ')}`);
      all.push({ text, errors: errors.length, words: got.words });
    }
    writeFileSync(join(outDir, 'boxed.json'), JSON.stringify(all, null, 1));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
