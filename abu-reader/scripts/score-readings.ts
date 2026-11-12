/**
 * Scores readings of single lines against the answers (answers.json), per
 * run in runs/claude-read/ (or the folders given).
 *
 *   npx --yes tsx scripts/score-readings.ts data/bantus [runs/claude-read/<run> ...]
 *
 * Notes right: the notes (pitch, octave and length, in order) that match the
 * answer, out of the answer's notes or the reading's, whichever is more.
 * Bars right: bars written exactly as the answer (spaces aside).
 * Silent mistakes: wrong bars in lines that Abụ's checker passes, which only
 * a person listening would catch.
 *
 * Answers come from the PDFs' text, and the text reader makes mistakes too.
 * Lines whose answer was found wrong by eye are listed with the reason in
 * data/<set>/answers-wrong.json and left out.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseSolfa } from '../../abu-app/src/solfa';

interface Answer {
  id: string;
  sheetName: string;
  parts: string[];
  time: string;
  text: string;
}

const root = process.argv[2] ?? 'data/bantus';
const wrongPath = join(root, 'answers-wrong.json');
const wrong = existsSync(wrongPath) ? (JSON.parse(readFileSync(wrongPath, 'utf8')) as Record<string, string>) : {};
const answers = (JSON.parse(readFileSync(join(root, 'answers.json'), 'utf8')) as Answer[]).filter((a) => !(a.id in wrong));
if (Object.keys(wrong).length) console.log(`Leaving out ${Object.keys(wrong).length} answer lines found wrong by eye (${wrongPath}).`);
const runs = process.argv.length > 3 ? process.argv.slice(3) : readdirSync('runs/claude-read').map((d) => join('runs/claude-read', d)).filter((d) => statSync(d).isDirectory());

/** Each part's row, from "S  d :r |" lines; reading may use full names. */
function rows(text: string, parts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(Solo|S|A|T|B|Soprano|Alto|Tenor|Bass)\b[:.]?\s*(.*)$/i);
    if (!m) continue;
    const name = { soprano: 'S', alto: 'A', tenor: 'T', bass: 'B' }[m[1].toLowerCase()] ?? (m[1].toLowerCase() === 'solo' ? 'Solo' : m[1].toUpperCase());
    if (parts.includes(name) && !(name in out)) out[name] = m[2];
  }
  return out;
}

/** Bars as text, ignoring spaces, "/" for the medium accent (a beat like any other) and a whole beat written "x" (the same rest as an empty beat). */
const bars = (row: string) => {
  const out = row.split('|').map((b) =>
    b
      .replace(/\s+/g, '')
      .replace(/\//g, ':')
      .split(':')
      .map((beat) => (beat === 'x' ? '' : beat))
      .join(':'),
  );
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
};

function lcs(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

const notesOf = (text: string, time: string, part: string) => {
  const song = parseSolfa(`time: ${time}\n\n${part.padEnd(2)} ${text}\n`);
  return (song.events[part] ?? []).map((e) => `${e.deg}/${e.oct}/${+e.dur.toFixed(3)}`);
};

for (const run of runs) {
  let notesRight = 0;
  let notesTotal = 0;
  let barsRight = 0;
  let barsTotal = 0;
  let linesExact = 0;
  let linesPass = 0;
  let silent = 0;
  let lines = 0;
  const worst: [number, string][] = [];
  for (const a of answers) {
    const file = join(run, `${a.id}.txt`);
    if (!existsSync(file)) continue;
    lines++;
    const reading = readFileSync(file, 'utf8');
    const want = rows(a.text, a.parts);
    const got = rows(reading, a.parts);
    const checked = parseSolfa(`time: ${a.time}\n\n${a.parts.map((p) => `${p.padEnd(2)} ${got[p] ?? ''}`).join('\n')}\n`);
    const passes = checked.errors.length === 0 && a.parts.every((p) => got[p]);
    if (passes) linesPass++;
    let lineBarsRight = 0;
    let lineBars = 0;
    let lineNotesRight = 0;
    let lineNotes = 0;
    for (const p of a.parts) {
      const wb = bars(want[p] ?? '');
      const gb = bars(got[p] ?? '');
      lineBars += wb.length;
      lineBarsRight += wb.filter((b, i) => gb[i] === b).length;
      const wn = notesOf(want[p] ?? '', a.time, p);
      const gn = notesOf(got[p] ?? '', a.time, p);
      lineNotes += Math.max(wn.length, gn.length);
      lineNotesRight += lcs(wn, gn);
    }
    barsRight += lineBarsRight;
    barsTotal += lineBars;
    notesRight += lineNotesRight;
    notesTotal += lineNotes;
    if (lineBarsRight === lineBars) linesExact++;
    if (passes) silent += lineBars - lineBarsRight;
    worst.push([lineNotesRight / Math.max(1, lineNotes), `${a.id.slice(0, 10)}…${a.id.split('-').pop()} ${a.sheetName.slice(0, 40)}`]);
  }
  if (!lines) continue;
  const pct = (x: number, y: number) => `${((100 * x) / Math.max(1, y)).toFixed(1)}%`;
  console.log(`\n${run.split('/').pop()}: ${lines} lines`);
  console.log(`  notes right   ${pct(notesRight, notesTotal)} (${notesRight} of ${notesTotal})`);
  console.log(`  bars right    ${pct(barsRight, barsTotal)} (${barsRight} of ${barsTotal})`);
  console.log(`  lines exact   ${linesExact} of ${lines}; lines passing the checker ${linesPass}`);
  console.log(`  silent mistakes (wrong bars in lines the checker passes): ${silent}`);
  console.log(`  weakest lines: ${worst.sort((x, y) => x[0] - y[0]).slice(0, 5).map(([s, n]) => `${(100 * s).toFixed(0)}% ${n}`).join('; ')}`);
}
