/**
 * Measures SolfaScores' staff-notation reader (abu-app/src/staff) on the
 * owner's sheets, as the app would read them, and with no AI.
 *
 *   cd abu-app && npx tsx --tsconfig tsconfig.json ../abu-reader/scripts/staff/measure.ts key [--n 40] [--seed 20261122] [--no-whiten] [--out name] [id ...]
 *
 * Sets (abu-reader/data/bantus/survey-all.json):
 * - key:     staff scores that also print the sol-fa as text (kind 'text', music_chars > 50); the printed sol-fa,
 *            read by the app's typed-sheet reader (src/scan/pdf-text.ts), is the answer key;
 * - vector:  staff scores drawn in a PDF with no sol-fa (kind 'staff', music_chars > 50);
 * - scanned: staff sheets scanned or drawn (kind 'staff', otherwise);
 * - choirpdfs: the choirpdfs.com preview pictures (data/choirpdfs/fresh and hw50), all of them.
 *
 * For every sheet: the staves and systems found, the reading's sol-fa (`findVoices` and `toSolfa`, as a MusicXML
 * file is converted), bars that add up, time per page, and on the key set, bar by bar and part by part against
 * the printed sol-fa. Writes runs/staff/<out>/<id>.json, .txt (both sol-fas side by side) and view/<id>-<page>.png
 * (the page with its systems boxed; kept out of git with the rest of runs/).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { findVoices, toSolfa } from '../../../abu-app/src/musicxml';
import type { PageText } from '../../../abu-app/src/scan/pdf-text';
import { readPagesWith, type PagePixels } from '../../../abu-app/src/staff/pages';

import { printedRows } from './answer';
import { compareSystem, notesOf, PARTS, type Comparison } from './compare';
import { APP, clock, META, pdfPages, picturePage, READER, sample, staffReader } from './lib';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name: string) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const n = Number(flag('--n') ?? 40);
const seed = Number(flag('--seed') ?? 20261122);
const whiten = !has('--no-whiten');
const noCache = has('--no-cache');
const outName = flag('--out');
const [set, ...only] = args;

interface Survey {
  id: string;
  name: string;
  pages: number;
  kind: string;
  music_chars: number;
}
const BANTUS = join(READER, 'data/bantus');
const survey: Survey[] = JSON.parse(readFileSync(join(BANTUS, 'survey-all.json'), 'utf8'));

function sheets(): { id: string; name: string; path: string; pdf: boolean }[] {
  const pick = (f: (s: Survey) => boolean) => survey.filter(f).sort((a, b) => a.id.localeCompare(b.id));
  const pdf = (s: Survey) => ({ id: s.id, name: s.name, path: join(BANTUS, 'pdf', `${s.id}.pdf`), pdf: true });
  let list: { id: string; name: string; path: string; pdf: boolean }[];
  if (set === 'key') list = pick((s) => s.kind === 'text' && s.music_chars > 50).map(pdf);
  else if (set === 'vector') list = pick((s) => s.kind === 'staff' && s.music_chars > 50).map(pdf);
  else if (set === 'scanned') list = pick((s) => s.kind === 'staff' && !(s.music_chars > 50)).map(pdf);
  else if (set === 'choirpdfs') {
    // The preview pictures (fresh/ and hw50/), all of them: those that aren't staff notation find no staves and say so.
    const dir = join(READER, 'data/choirpdfs');
    list = ['fresh', 'hw50'].flatMap((d) =>
      readdirSync(join(dir, d))
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .sort()
        .map((f) => ({ id: `${d}-${f.replace(/\.[^.]+$/, '')}`, name: `${d}/${f}`, path: join(dir, d, f), pdf: false })),
    );
    if (only.length) return list.filter((s) => only.some((o) => s.id.startsWith(o)));
    return list;
  } else throw new Error('Set: key, vector, scanned or choirpdfs');
  if (only.length) return list.filter((s) => only.some((o) => s.id.startsWith(o)));
  return sample(list, n, seed);
}

const requireApp = createRequire(join(APP, 'package.json'));

/** The page with its staves and systems drawn on, small, for looking at. */
async function view(png: Buffer, systems: { box: { top: number; bottom: number; left: number; right: number }; label: string }[], staves: { top: number; bottom: number; left: number; right: number; skew: number }[], file: string) {
  const { createCanvas, loadImage } = requireApp('@napi-rs/canvas') as {
    createCanvas(w: number, h: number): { getContext(k: '2d'): Record<string, unknown> & CanvasRenderingContext2D; toBuffer(t: string): Buffer };
    loadImage(b: Buffer): Promise<{ width: number; height: number }>;
  };
  const img = await loadImage(png);
  const s = 900 / img.height;
  const c = createCanvas(Math.round(img.width * s), 900);
  const ctx = c.getContext('2d');
  ctx.drawImage(img as never, 0, 0, img.width * s, 900);
  ctx.lineWidth = 2;
  for (const st of staves) {
    ctx.strokeStyle = 'rgba(0,120,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(st.left * s, (st.top + st.skew * st.left) * s);
    ctx.lineTo(st.right * s, (st.top + st.skew * st.right) * s);
    ctx.moveTo(st.left * s, (st.bottom + st.skew * st.left) * s);
    ctx.lineTo(st.right * s, (st.bottom + st.skew * st.right) * s);
    ctx.stroke();
  }
  systems.forEach((sys, i) => {
    ctx.strokeStyle = i % 2 ? 'rgba(220,0,0,0.9)' : 'rgba(0,160,0,0.9)';
    ctx.strokeRect(sys.box.left * s, sys.box.top * s, (sys.box.right - sys.box.left) * s, (sys.box.bottom - sys.box.top) * s);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '16px sans-serif';
    ctx.fillText(sys.label, sys.box.left * s + 4, sys.box.top * s + 16);
  });
  writeFileSync(file, c.toBuffer('image/png'));
}

interface Result {
  id: string;
  name: string;
  pages: number;
  ms: number;
  msPages: number[];
  staves: number;
  layout: string[];
  bars: number;
  barsAddUp: number;
  key?: string;
  title?: string;
  error?: string;
  comparison?: Comparison;
}

async function main() {
  const list = sheets();
  const out = join(READER, 'runs/staff', outName ?? `${set}${whiten ? '' : '-nowhite'}`);
  mkdirSync(join(out, 'view'), { recursive: true });
  const reader = await staffReader(undefined, !noCache);
  const results: Result[] = [];
  for (const sheet of list) {
    const result: Result = { id: sheet.id, name: sheet.name, pages: 0, ms: 0, msPages: [], staves: 0, layout: [], bars: 0, barsAddUp: 0 };
    try {
      const t0 = performance.now();
      const pages: (PagePixels & { png(): Buffer })[] = sheet.pdf ? await pdfPages(sheet.path) : [await picturePage(sheet.path)];
      const tRender = performance.now() - t0;
      result.pages = pages.length;
      const before = clock.model;
      const t1 = performance.now();
      const reading = await readPagesWith(pages, META, reader, { whiten });
      result.ms = Math.round(performance.now() - t1 + (clock.model - before > 0 ? 0 : 0));
      result.msPages = [Math.round(tRender)];
      result.staves = reading.read.reduce((k, s) => k + s.staves.length, 0);
      result.layout = pages.map((_, p) =>
        reading.read
          .filter((s) => s.page === p)
          .map((s) => s.roles.join('+'))
          .join(' | '),
      );
      result.bars = reading.score.measures.length;
      result.title = reading.score.title;
      // Bars where every voice's staff (the piano's left out: it isn't sung) has notes and rests that fill it exactly.
      result.barsAddUp = reading.timed.bars.filter((bar) => {
        const roles = reading.read[bar.system].roles;
        const staves = [...new Set(bar.events.map((e) => e.staff))].filter((si) => ['S', 'A', 'T', 'B', 'SA', 'TB'].includes(roles[si]));
        return (
          staves.length > 0 &&
          staves.every((si) => {
            const firsts = bar.events.filter((e) => e.staff === si && e.voice === 1);
            const end = Math.max(0, ...firsts.map((e) => e.onset + e.beats));
            const sum = firsts.reduce((t, e) => t + e.beats, 0);
            return Math.abs(end - bar.length) < 0.02 && Math.abs(sum - bar.length) < 0.02;
          })
        );
      }).length;
      // The sol-fa, as a MusicXML file is converted.
      const voices = findVoices(reading.score);
      // The sheet's own lines of music: each system's bars.
      const lines = reading.systems.map((s) => Array.from({ length: s.bars[1] - s.bars[0] }, (_, k) => s.bars[0] + k));
      const solfa = voices.lines.length ? toSolfa(reading.score, voices.lines, { systems: lines }) : null;
      result.key = solfa?.key;
      let answer = '';
      if (set === 'key' && sheet.pdf && solfa) {
        // The printed sol-fa, system by system, against the reading's bars in that system.
        const mine = notesOf(solfa.text);
        const time = mine.time;
        const counts: Comparison['parts'] = {};
        const keys: string[] = [];
        const beatAt = (bar: number) => mine.bars.slice(0, bar).reduce((t, n) => t + n, 0);
        for (const [p, page] of pages.entries()) {
          const onPage = reading.read.filter((s) => s.page === p);
          const rows = printedRows((page as { text: PageText }).text, (page as { pointScale: number }).pointScale, onPage);
          for (const s of onPage) {
            const printed = rows.get(s) ?? {};
            if (!Object.keys(printed).length) continue;
            const [from, to] = s.bars ?? [0, 0];
            const start = beatAt(from);
            const end = beatAt(to);
            const ours = Object.fromEntries(PARTS.map((q) => [q, (mine.notes[q] ?? []).filter((n) => n.start >= start - 1e-6 && n.start < end - 1e-6).map((n) => ({ ...n, start: n.start - start }))]));
            const misses: string[] = [];
            compareSystem(printed, ours, mine.bars.slice(from, to), time, counts, misses);
            if (misses.length) answer += misses.map((m) => `MISS ${m}`).join('\n') + '\n';
            // Side by side, for looking at: printed (P) over read (R), part by part.
            answer += `bars ${from}-${to}\n${PARTS.filter((q) => printed[q]).map((q) => `P ${q} ${printed[q]}`).join('\n')}\n\n`;
          }
          keys.push(...[...(page as { text: PageText }).text.chars.map((c) => c.c).join('').matchAll(/doh\s*(?:is|=)\s*([A-G][b#♭♯]?)/gi)].map((m) => m[1]));
        }
        result.comparison = { keyPrinted: keys[0] ?? '?', keyRead: solfa.key, parts: counts };
      }
      writeFileSync(join(out, `${sheet.id}.txt`), `${sheet.name}\n\n== staff reading ==\n${solfa?.text ?? '(no voices)'}\n${solfa?.problems.join('\n') ?? ''}\n\n== printed ==\n${answer}\n`);
      writeFileSync(join(out, `${sheet.id}.json`), JSON.stringify({ ...result, systems: reading.systems, marks: reading.marks, read: reading.read.map((s) => ({ page: s.page, bars: s.bars, roles: s.roles, clefs: s.clefs, staves: s.staves, tokens: s.tokens.map((t) => t.tokens.map(([tok]) => tok).join(' ')) })) }, null, 1));
      for (const [p, page] of pages.entries()) {
        const systems = reading.read.filter((s) => s.page === p);
        await view(
          page.png(),
          systems.map((s) => ({ box: { top: Math.min(...s.staves.map((st) => st.top)) - 20, bottom: Math.max(...s.staves.map((st) => st.bottom)) + 20, left: Math.min(...s.staves.map((st) => st.left)) - 10, right: Math.max(...s.staves.map((st) => st.right)) + 10 }, label: s.roles.join(' ') })),
          systems.flatMap((s) => s.staves),
          join(out, 'view', `${sheet.id.slice(0, 16)}-${p}.png`),
        );
      }
    } catch (e) {
      result.error = String((e as Error).message ?? e);
    }
    results.push(result);
    const c = result.comparison;
    console.log(
      `${sheet.id.slice(0, 14)} p${result.pages} st${result.staves} ${String(result.ms).padStart(6)}ms bars ${result.barsAddUp}/${result.bars}` +
        (c ? `  key ${c.keyPrinted}/${c.keyRead} ${Object.entries(c.parts).map(([p, v]) => `${p} ${v.equal}/${v.pitchesEqual}/${v.printed}`).join(' ')}` : '') +
        (result.error ? `  ERROR ${result.error}` : '') +
        `  ${result.layout.join(' / ')}`,
    );
  }
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
  // Totals.
  const ok = results.filter((r) => !r.error);
  const pages = ok.reduce((k, r) => k + r.pages, 0);
  const staves = ok.reduce((k, r) => k + r.staves, 0);
  console.log(`\n${ok.length} of ${results.length} sheets read, ${pages} pages, ${staves} staves`);
  console.log(`bars adding up: ${ok.reduce((k, r) => k + r.barsAddUp, 0)} of ${ok.reduce((k, r) => k + r.bars, 0)}`);
  console.log(`time: ${(ok.reduce((k, r) => k + r.ms, 0) / Math.max(1, pages)).toFixed(0)} ms a page (model ${clock.staves} staves read, ${(clock.model / Math.max(1, clock.staves)).toFixed(0)} ms a staff; ${clock.cached} from the cache)`);
  const cmp = ok.filter((r) => r.comparison);
  if (cmp.length) {
    const sum: Record<string, { equal: number; pitches: number; printed: number }> = {};
    for (const r of cmp)
      for (const [p, v] of Object.entries(r.comparison!.parts)) {
        sum[p] ??= { equal: 0, pitches: 0, printed: 0 };
        sum[p].equal += v.equal;
        sum[p].pitches += v.pitchesEqual;
        sum[p].printed += v.printed;
      }
    const keyOk = cmp.filter((r) => r.comparison!.keyPrinted === r.comparison!.keyRead).length;
    console.log(`against the printed sol-fa (${cmp.length} sheets, doh agrees on ${keyOk}):`);
    for (const [p, v] of Object.entries(sum)) console.log(`  ${p}: ${v.equal} of ${v.printed} bars the same (${((100 * v.equal) / Math.max(1, v.printed)).toFixed(1)}%), ${v.pitches} with the same notes in any octave`);
  }
  if (existsSync(out)) console.log(`\nwritten to ${out}`);
}

main();
