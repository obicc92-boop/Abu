/**
 * Runs Abụ's MusicXML-to-sol-fa converter over PDMX pieces and reports how
 * many convert exactly (Abụ's reader plays back exactly the planned notes).
 *
 *   python3 scripts/pdmx-select.py hymns     # once: the list of pieces
 *   PDMX_DIR=<folder with PDMX.csv and mxl/> npx tsx scripts/pdmx-convert.ts [hymns|choral|all] [limit]
 *
 * Writes each sol-fa text and a summary to data/pdmx-solfa/ (not in git).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { musicXmlToSolfa } from '../../abu-app/src/musicxml';

const PDMX = process.env.PDMX_DIR ?? '/Users/somtoo/Desktop/Somtoo projects/Sonkomusic app/apps/reader/data/pdmx';
const which = process.argv[2] ?? 'hymns';
const limit = Number(process.argv[3] ?? 100000);
const out = join(__dirname, '..', 'data', 'pdmx-solfa', which);
mkdirSync(out, { recursive: true });

// The list comes from scripts/pdmx-select.py (Python reads PDMX's large CSV more easily).
const pick = JSON.parse(readFileSync(join(__dirname, '..', 'data', `pdmx-${which}.json`), 'utf8')) as Record<string, string>[];
console.log(`${pick.length} pieces (${which}), trying ${Math.min(limit, pick.length)}`);

const tally = { tried: 0, verified: 0, exact: 0, failed: 0, satb: 0 };
const reasons = new Map<string, number>();
const summary: Record<string, unknown>[] = [];
for (const r of pick.slice(0, limit)) {
  tally.tried++;
  try {
    const c = musicXmlToSolfa(new Uint8Array(readFileSync(join(PDMX, r.mxl))));
    const exact = c.verified && c.problems.length === 0;
    if (c.verified) tally.verified++;
    if (exact) tally.exact++;
    if (c.parts.join('') === 'SATB') tally.satb++;
    for (const p of [...c.problems, ...c.mismatches.slice(0, 1)]) {
      const reason = p.replace(/\d+(\.\d+)?/g, 'N').replace(/^[SATB]: /, '').slice(0, 70);
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    const id = r.mxl.split('/').pop()!.replace('.mxl', '');
    writeFileSync(join(out, `${id}.txt`), c.text);
    summary.push({ id, title: r.title, parts: c.parts.join(''), bars: c.bars, layout: c.layout, verified: c.verified, problems: c.problems, mismatches: c.mismatches.slice(0, 2), lyrics: r.has_lyrics, views: Number(r.n_views) });
  } catch (e) {
    tally.failed++;
    const reason = `error: ${(e as Error).message.slice(0, 60)}`;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
}
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(tally);
console.log([...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
