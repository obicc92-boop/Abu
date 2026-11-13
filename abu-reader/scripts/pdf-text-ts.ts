/**
 * Runs the app's typed-PDF reader (abu-app/src/scan/pdf-text.ts, the port of
 * pdf-text.py) on the typed sheets, with pdf.js as the app uses it, and
 * compares its drafts with pdf-text.py's.
 *
 *   npx --yes tsx scripts/pdf-text-ts.ts data/bantus [id ...]
 *
 * Writes data/<set>/draft-ts/<id>.txt, in the same form as draft/<id>.txt,
 * and prints per sheet how many rows match, and how many bars pass Abụ's
 * checker for each reader.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getDocument, OPS } from '../../abu-app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { pageText, readTypedSheet, type PdfJsPage } from '../../abu-app/src/scan/pdf-text';
import { parseSolfa } from '../../abu-app/src/solfa';

const [root, ...only] = process.argv.slice(2);
const kinds: Record<string, string> = JSON.parse(readFileSync(join(root, 'kinds.json'), 'utf8'));
const ids = only.length ? only : Object.keys(kinds).filter((id) => kinds[id] === 'solfa');
mkdirSync(join(root, 'draft-ts'), { recursive: true });

/** Bars passing the checker, out of all bars, in a draft (each line checked on its own, as the app does). */
function passing(draft: string): [number, number] {
  const time = draft.match(/^time: (.*)$/m)?.[1] ?? '4/4';
  let ok = 0;
  let all = 0;
  for (const block of draft.split(/\n\n+/).slice(1)) {
    if (!block.trim()) continue;
    const song = parseSolfa(`time: ${time}\n\n${block}\n`);
    const rows = block.split('\n').filter((l) => !l.startsWith('W'));
    const bars = Math.max(0, ...rows.map((r) => r.split('|').filter((b) => b.trim()).length));
    const bad = new Set(song.errors.map((e) => e.message.match(/bar (\d+)/)?.[1] ?? 'all'));
    all += bars;
    ok += bad.has('all') ? 0 : bars - bad.size;
  }
  return [ok, all];
}

async function main() {
let same = 0;
let total = 0;
const sums = { py: [0, 0], ts: [0, 0] };
for (const id of ids) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(join(root, 'pdf', `${id}.pdf`))), verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) pages.push(await pageText((await doc.getPage(n)) as unknown as PdfJsPage, OPS as unknown as Record<string, number>));
  const sheet = readTypedSheet(pages);
  const head = [sheet.title && `title: ${sheet.title}`, sheet.key && `key: ${sheet.key}`, sheet.time && `time: ${sheet.time}`].filter(Boolean);
  const draft = [...head, '', ...sheet.lines.map((l) => `${l.text}\n`)].join('\n');
  writeFileSync(join(root, 'draft-ts', `${id}.txt`), draft);
  const pyFile = join(root, 'draft', `${id}.txt`);
  const py = existsSync(pyFile) ? readFileSync(pyFile, 'utf8') : '';
  const a = py.split('\n').filter(Boolean);
  const b = draft.split('\n').filter(Boolean);
  const n = Math.max(a.length, b.length);
  const m = a.filter((l, i) => l === b[i]).length;
  same += m;
  total += n;
  const p = passing(py);
  const t = passing(draft);
  sums.py[0] += p[0];
  sums.py[1] += p[1];
  sums.ts[0] += t[0];
  sums.ts[1] += t[1];
  console.log(`${id.slice(0, 12)}  rows same ${m}/${n}  bars passing: python ${p[0]}/${p[1]}, app ${t[0]}/${t[1]}  ${sheet.staff ? '(staff)' : ''}`);
}
console.log(`\nrows the same: ${same} of ${total}`);
console.log(`bars passing: python ${sums.py[0]}/${sums.py[1]}, app ${sums.ts[0]}/${sums.ts[1]}`);
}

main();
