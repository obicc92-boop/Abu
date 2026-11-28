// Puts each hymn read by hymns-read.ts together as a song, as the scan screen would, with what the owner's hymn
// book needs: the time from the bars where none is printed (timeFor); a verse number Opus read as an ending
// ("{1.}" before a line's first note) taken as the line's section, "Verse 1"; a composer that's only the key or the
// time left out. Each line is checked again at the song's time, with the free repairs, and the song as the Worker
// checks it. Writes <dir>/assembled.json: one entry per hymn with its song and whether it can be added.
// Usage (from abu-api): npx tsx --tsconfig ../abu-app/tsconfig.json ../abu-reader/scripts/handwriting/hymns-assemble.ts <songs dir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { joinLines, linesKeys, timeFor, withTempo } from '../../../abu-app/src/scan/join';
import { bestFree, splitLine, tidyTitle } from '../../../abu-app/src/scan/line-text';
import { parseKey, parseSolfa, parseTime } from '../../../abu-app/src/solfa';

const dir = process.argv[2];
const VERSE = /^\{(\d{1,2})\.\}\s*/;

interface Read {
  pdf: string;
  heading: { title: string; composer: string; key: string; time: string; tempo: string };
  lines: { page: string; parts: string[]; text: string; key?: string; section?: string }[];
}

const out = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.pdf.json') || (n.startsWith('CamScanner') && n.endsWith('.json')))) {
  const h: Read = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const PART = /^(Solo[SATB]?|S|A|T|B|P\d+)(\s+)(.*)$/;
  const lines = h.lines.map((l) => {
    // A verse number before the line's first note, read as an ending: the line's section, taken off every row.
    const rows = l.text.split('\n');
    const verse = rows.find((r) => PART.test(r))?.match(PART)?.[3].match(VERSE);
    if (!verse) return l;
    const text = rows
      .map((r) => {
        const p = r.match(PART);
        return p && VERSE.test(p[3]) ? `${p[1]}${p[2]}${p[3].replace(VERSE, '')}` : r;
      })
      .join('\n');
    return { ...l, text, section: l.section ?? `Verse ${verse[1]}` };
  });
  const time = timeFor(h.heading.time, lines.map((l) => l.text).filter(Boolean));
  const beats = parseTime(time)?.pulses ?? 4;
  const passes = (t: string) => splitLine(t).some((r) => r.part && r.text.trim()) && !parseSolfa(t, { time }).errors.length;
  for (const l of lines) if (l.text.trim() && !passes(l.text)) l.text = bestFree([l.text], passes, beats);
  const doh = parseKey(h.heading.key)?.semitone ?? 0;
  const keys = linesKeys(lines.map((l) => ({ text: l.text, key: l.key, left: !l.text.trim() })), doh, time);
  let running: string | null = null;
  const sections = lines.map((l) => {
    const own = l.section ?? null;
    const s = own && own !== running ? own : null;
    if (own) running = own;
    return s;
  });
  const kept = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.text.trim());
  const solfa = withTempo(
    joinLines(
      kept.map(({ l }) => l.text),
      time,
      kept.map(({ i }) => keys[i]?.change),
      kept.map(({ i }) => sections[i]),
    ),
    h.heading.tempo,
  );
  const parsed = parseSolfa(solfa, { time, key: doh });
  const composer = /\b(key|doh|time)\b|^\s*\d+\s*\/\s*\d+\s*$/i.test(h.heading.composer) ? '' : h.heading.composer.replace(/^by\s+/i, '').trim();
  const failing = lines.filter((l) => !l.text.trim() || !passes(l.text)).length;
  out.push({
    pdf: h.pdf,
    title: tidyTitle(h.heading.title),
    composer,
    key: h.heading.key,
    doh,
    time,
    lines: lines.length,
    failing,
    errors: parsed.errors.map((e) => e.message),
    warnings: parsed.warnings.length,
    solfa,
    ok: !!h.heading.title.trim() && lines.length > 0 && failing === 0 && !parsed.errors.length,
  });
}
out.sort((a, b) => a.pdf.localeCompare(b.pdf));
writeFileSync(join(dir, 'assembled.json'), JSON.stringify(out, null, 1));
for (const s of out) console.log(`${s.ok ? 'ok ' : '-- '} ${s.pdf.replace('CamScanner_', '').replace('.pdf', '')} "${s.title}" ${s.key} ${s.time}: ${s.lines} lines, ${s.failing} failing, ${s.errors.length} problems${s.errors.length ? ` (${s.errors[0]})` : ''}`);
console.log(`${out.filter((s) => s.ok).length} of ${out.length} hymns can be added`);
