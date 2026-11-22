/**
 * Saves the windows the staff reader sees for one sheet's staves, as pictures, to look at what it reads
 * (with the page's own text whitened out, or not with --no-whiten).
 *
 *   cd abu-app && npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/staff/windows.ts <pdf or picture> [page] [--no-whiten]
 *
 * Writes runs/staff/windows/<page>-<staff>.png (kept out of git with the rest of runs/).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { findStaves } from '../../../abu-app/src/staff/staves';
import { staffInput, withoutText } from '../../../abu-app/src/staff/window';

import { APP, META, pdfPages, picturePage, READER } from './lib';

async function main() {
  const args = process.argv.slice(2);
  const whiten = !args.includes('--no-whiten');
  const [path, pageArg] = args.filter((a) => !a.startsWith('--'));
  const pages = path.endsWith('.pdf') ? await pdfPages(path) : [await picturePage(path)];
  const p = Number(pageArg ?? 0);
  const page = pages[p] as (typeof pages)[number] & { text?: never; pointScale?: number };
  const staves = findStaves(page.gray);
  const gray = whiten && page.text && page.pointScale ? withoutText(page.gray, page.text, page.pointScale, staves) : page.gray;
  const { createCanvas } = createRequire(join(APP, 'package.json'))('@napi-rs/canvas') as { createCanvas(w: number, h: number): { getContext(k: '2d'): { createImageData(w: number, h: number): { data: Uint8ClampedArray }; putImageData(d: unknown, x: number, y: number): void }; toBuffer(t: string): Buffer } };
  const out = join(READER, 'runs/staff/windows');
  mkdirSync(out, { recursive: true });
  staves.forEach((staff, i) => {
    const input = staffInput(gray, staff, META);
    const c = createCanvas(input.width, META.height);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(input.width, META.height);
    for (let k = 0; k < input.width * META.height; k++) {
      const v = Math.round(255 * (1 - input.data[k]));
      img.data.set([v, v, v, 255], k * 4);
    }
    ctx.putImageData(img, 0, 0);
    writeFileSync(join(out, `${p}-${i}.png`), c.toBuffer('image/png'));
  });
  console.log(`${staves.length} windows in ${out}`);
}

main();
