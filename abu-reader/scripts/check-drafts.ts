/**
 * Runs Abụ's sol-fa checker over the drafts made from sheets and reports, per
 * sheet, how many bars pass and what goes wrong most often.
 *
 *   npx --yes tsx scripts/check-drafts.ts data/bantus
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSolfa } from '../../abu-app/src/solfa';

const root = process.argv[2] ?? 'data/bantus';
const only = new Set(process.argv.slice(3));
const survey = JSON.parse(readFileSync(join(root, 'survey.json'), 'utf8')) as { id: string; name: string }[];
const names = new Map(survey.map((s) => [s.id, s.name]));

const kinds: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'kinds.json'), 'utf8'));
  } catch {
    return {};
  }
})();
const reasons = new Map<string, number>();
const totals = new Map<string, { bars: number; good: number; sheets: number; clean: number }>();
const rows: string[] = [];
for (const file of readdirSync(join(root, 'draft')).sort()) {
  const id = file.replace(/\.txt$/, '');
  if (only.size && !only.has(id)) continue;
  const text = readFileSync(join(root, 'draft', file), 'utf8');
  let song;
  try {
    song = parseSolfa(text);
  } catch (e) {
    rows.push(`  crash ${(e as Error).message.slice(0, 50)}  ${names.get(id)}`);
    continue;
  }
  const badBars = new Set<string>();
  for (const e of song.errors) {
    const bar = e.message.match(/bar (\d+)/)?.[1];
    if (bar) badBars.add(bar);
    const reason = e.message.replace(/\d+/g, 'N').replace(/^(Soprano|Alto|Tenor|Bass|Solo|P\d), /, '').slice(0, 60);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const good = Math.max(0, song.bars - badBars.size);
  const kind = kinds[id] ?? 'solfa';
  const t = totals.get(kind) ?? { bars: 0, good: 0, sheets: 0, clean: 0 };
  t.bars += song.bars;
  t.good += good;
  t.sheets += 1;
  if (song.bars && good === song.bars) t.clean += 1;
  totals.set(kind, t);
  rows.push(`${kind.padEnd(6)} ${String(good).padStart(4)}/${String(song.bars).padEnd(4)} bars ok  ${String(song.errors.length).padStart(3)} errors  ${song.parts.join('').slice(0, 8).padEnd(8)} ${song.meta.time?.label ?? '?'}  ${names.get(id)?.slice(0, 55)}`);
}
console.log(rows.sort().join('\n'));
for (const [kind, t] of totals) {
  console.log(`\n${kind}: ${t.good} of ${t.bars} bars pass (${Math.round((100 * t.good) / Math.max(1, t.bars))}%); ${t.clean} of ${t.sheets} sheets with every bar passing`);
}
console.log([...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r, n]) => `${String(n).padStart(5)}  ${r}`).join('\n'));
