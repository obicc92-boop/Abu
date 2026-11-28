// Reads every line of a page from scratch with Opus (the Worker's readLine, as /api/scan/line does), each line cut
// from the straightened page find-lines.ts saved, round the rows Claude grouped it from (layout-claude.ts's
// answer). On the trial key in abu-api/.dev.vars.trial, never printed. Prints each line and writes them as JSON.
// Usage (from abu-api): npx tsx ../abu-reader/scripts/handwriting/read-lines-opus.ts <found pages.json> <layout answers dir> <page name> <time> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Jimp from '../../../abu-app/node_modules/jimp-compact/dist/jimp.js';
import { cleanLayout, readLine } from '../../../abu-api/src/scan';

const HERE = dirname(fileURLToPath(import.meta.url));
const key = readFileSync(join(HERE, '../../../abu-api/.dev.vars.trial'), 'utf8').match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error('No trial key in abu-api/.dev.vars.trial');
const env = { ANTHROPIC_API_KEY: key } as Env;
const [pagesFile, answers, name, time, out] = process.argv.slice(2);

interface Row {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

(async () => {
  const p = JSON.parse(readFileSync(pagesFile, 'utf8')).find((q: { png: string }) => q.png.endsWith(`${name}.png`));
  const lines = cleanLayout(JSON.parse(readFileSync(join(answers, `${name}.answer.json`), 'utf8')).answer, p.rows.length) ?? [];
  const page = await Jimp.read(p.png);
  const rows: Row[] = p.rows;
  const results = [];
  for (const [n, l] of lines.entries()) {
    const all = [...l.notes.map((x) => x.row), ...l.words].map((i) => rows[i]);
    const top = Math.min(...all.map((r) => r.top));
    const bottom = Math.max(...all.map((r) => r.bottom));
    const padY = Math.round((bottom - top) * 0.04) + 4;
    const x0 = Math.max(0, Math.min(...all.map((r) => r.left)) - 6);
    const x1 = Math.min(page.bitmap.width, Math.max(...all.map((r) => r.right)) + 6);
    const y0 = Math.max(0, top - padY);
    const y1 = Math.min(page.bitmap.height, bottom + padY);
    const cut = page.clone().crop(x0, y0, x1 - x0, y1 - y0);
    const jpeg: Buffer = await cut.quality(90).getBufferAsync('image/jpeg');
    const parts = l.notes.map((x) => x.part);
    const r = await readLine(env, new Uint8Array(jpeg).buffer, 'image/jpeg', { parts, time });
    results.push({ line: n + 1, parts, text: r.text });
    console.log(`--- line ${n + 1} (${parts.join(' ')})\n${r.text}`);
  }
  writeFileSync(out, JSON.stringify(results, null, 1));
})();
