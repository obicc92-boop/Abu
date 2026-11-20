// Which pages the app reads box by box (src/scan/boxes.ts): for each page, its rules, and its systems' boxes if
// it's boxed. Pages are taken at most 2400 tall, as the app does.
// Usage (from abu-app): npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/boxed-pages.ts <pages.json [{file}]>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Jimp from '../../../abu-app/node_modules/jimp-compact/dist/jimp.js';
import { boxedSystems, pageRules } from '../../../abu-app/src/scan/boxes';
import type { Gray } from '../../../abu-app/src/scan/rows';

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

async function main() {
  const file = process.argv[2];
  const pages: { file: string }[] = JSON.parse(readFileSync(file, 'utf8'));
  let boxed = 0;
  for (const p of pages) {
    const img = await Jimp.read(join(dirname(file), p.file));
    const { width, height, data } = img.bitmap;
    let page: Gray = { data: new Uint8Array(width * height), width, height };
    for (let i = 0, j = 0; j < page.data.length; i += 4, j++) page.data[j] = Math.floor((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);
    const s = Math.min(1, 2400 / Math.max(width, height));
    if (s < 1) page = resize(page, Math.round(width * s), Math.round(height * s));
    const k = Math.max(page.width, page.height) / 1200;
    const small = k > 1 ? resize(page, Math.round(page.width / k), Math.round(page.height / k)) : page;
    const rules = pageRules(small).map((r) => ({ y: r.y * Math.max(1, k), slope: r.slope }));
    const systems = rules.length >= 3 ? boxedSystems(page, rules) : null;
    if (systems) boxed++;
    console.log(`${p.file}: ${rules.length} rules, ${systems ? `boxed: ${systems.map((x) => x.boxes.length).join(' ')}` : 'not boxed'}`);
  }
  console.log(`${boxed} of ${pages.length} pages boxed`);
}
main();
