/**
 * Picks answer lines for measuring readers: lines of music on typed sol-fa
 * sheets, read from the PDF's own text, that pass Abụ's checker on their own.
 * A reader is then shown a picture of the same line and scored against it.
 *
 *   npx --yes tsx scripts/answer-lines.ts data/bantus [per-sheet]
 *
 * Reads data/<set>/lines/ and draft/ (from pdf-text.py) and writes
 * data/<set>/answers.json.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSolfa } from '../../abu-app/src/solfa';

const root = process.argv[2] ?? 'data/bantus';
const perSheet = Number(process.argv[3] ?? 4);
// --refresh keeps the same lines as the last answers.json (so earlier readings can be rescored) and rereads their text.
const refresh = process.argv.includes('--refresh');
const keep = refresh ? new Set((JSON.parse(readFileSync(join(root, 'answers.json'), 'utf8')) as { id: string }[]).map((a) => a.id)) : null;
const PARTS: Record<number, string[]> = { 1: ['S'], 2: ['S', 'A'], 3: ['S', 'A', 'B'], 4: ['S', 'A', 'T', 'B'], 5: ['Solo', 'S', 'A', 'T', 'B'] };

const kinds = JSON.parse(readFileSync(join(root, 'kinds.json'), 'utf8')) as Record<string, string>;
const survey = JSON.parse(readFileSync(join(root, 'survey.json'), 'utf8')) as { id: string; name: string }[];
const names = new Map(survey.map((s) => [s.id, s.name]));

export interface Answer {
  id: string;
  sheet: string;
  sheetName: string;
  line: number;
  page: number;
  box: number[];
  parts: string[];
  time: string;
  key: string | null;
  text: string;
}

const answers: Answer[] = [];
for (const file of readdirSync(join(root, 'lines')).sort()) {
  const sheet = file.replace(/\.json$/, '');
  if (kinds[sheet] !== 'solfa') continue;
  const data = JSON.parse(readFileSync(join(root, 'lines', file), 'utf8')) as { key: string | null; time: string | null; lines: { page: number; box: number[]; rows: [string, string][] }[] };
  // The song's time: as printed, or from the commonest bar length (inner bars only: a line's first and last bars are often split).
  const counts = new Map<number, number>();
  for (const line of data.lines)
    for (const [kind, t] of line.rows) {
      if (kind !== 'n') continue;
      const bars = t.split('|').map((b) => b.trim()).filter(Boolean);
      for (const b of bars.slice(1, -1)) {
        const n = b.split(/[:/]/).length;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
  const bpb = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 4;
  const time = data.time ?? `${bpb}/4`;
  const good: Answer[] = [];
  data.lines.forEach((line, n) => {
    const notes = line.rows.filter(([k]) => k === 'n').map(([, t]) => t);
    const parts = PARTS[notes.length];
    if (!parts) return;
    const text = notes.map((t, i) => `${parts[i].padEnd(2)} ${t}`).join('\n');
    const song = parseSolfa(`time: ${time}\n\n${text}\n`);
    if (song.errors.length || song.bars < 3) return;
    good.push({ id: `${sheet}-${n}`, sheet, sheetName: names.get(sheet) ?? '', line: n, page: line.page, box: line.box, parts, time, key: data.key, text });
  });
  if (keep) {
    answers.push(...good.filter((g) => keep.has(g.id)));
    continue;
  }
  // A few lines from across each sheet.
  const step = Math.max(1, good.length / perSheet);
  for (let i = 0; i < Math.min(perSheet, good.length); i++) answers.push(good[Math.floor(i * step)]);
}
writeFileSync(join(root, 'answers.json'), JSON.stringify(answers, null, 1));
const sheets = new Set(answers.map((a) => a.sheet)).size;
console.log(`${answers.length} answer lines from ${sheets} sheets`);
