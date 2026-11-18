// Groups the rows find-lines.ts found again, without reading the pictures: for trying changes to the
// grouping (or to notesRows) quickly. Writes a pages.json for score-lines.py.
// Usage (from abu-app): npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/handwriting/regroup.ts <found pages.json> <out pages.json> [parts=4]
// GROUP=<module path> takes groupLines and notesRows from that module instead of the app's page-lines.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as app from '../../../abu-app/src/scan/page-lines';

async function main() {
  const [from, to, partsArg] = process.argv.slice(2);
  const parts = Number(partsArg ?? 4);
  const mod = process.env.GROUP ? await import(resolve(process.env.GROUP)) : app;
  const pages = JSON.parse(readFileSync(from, 'utf8'));
  for (const p of pages) {
    p.isNotes = (mod.notesRows ?? app.notesRows)(p.reads);
    p.lines = (mod.groupLines ?? app.groupLines)(p.rows, p.isNotes, p.rules, p.long, parts).lines;
  }
  writeFileSync(to, JSON.stringify(pages));
}
main();
