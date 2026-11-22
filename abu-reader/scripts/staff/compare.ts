/**
 * The staff reading's sol-fa against the sol-fa a sheet prints, system by
 * system, bar by bar and part by part. Bars are cut where the reading has
 * its bar lines, by beats: sheets print bar lines their own ways (some at
 * every half bar), but the beats are the same. A bar is the same when its
 * notes start on the same beats, last as long (within the bar) and are the
 * same notes in the same octave as written; `pitchesEqual` counts them the
 * same in any octave (the converter's doh octave and a sheet's differ in
 * some keys: see the README). Each system's printed row may start a beat or
 * two off (an upbeat printed at the end of the line before): the offset that
 * makes most bars the same is taken.
 */
import { parseSolfa } from '../../../abu-app/src/solfa';

export const PARTS = ['S', 'A', 'T', 'B'];

export interface PartCount {
  /** Bars the printed sol-fa has notes in. */
  printed: number;
  equal: number;
  pitchesEqual: number;
}

export interface Comparison {
  keyPrinted: string;
  keyRead: string;
  parts: Record<string, PartCount>;
}

export interface Note {
  start: number;
  dur: number;
  deg: number;
  oct: number;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** A text's notes per part, in beats from its start, and each part's bars' lengths in beats. */
export function notesOf(text: string): { time: string; key: string; notes: Record<string, Note[]>; bars: number[] } {
  const song = parseSolfa(text);
  const notes: Record<string, Note[]> = {};
  for (const p of PARTS) if (song.events[p]) notes[p] = song.events[p].map((e) => ({ start: e.start, dur: e.dur, deg: e.deg, oct: e.oct }));
  const first = PARTS.find((p) => song.parts.includes(p));
  const bars: number[] = [];
  for (const section of song.sections) for (const bar of (first && section.bars[first]) || []) bars.push(bar.length);
  return { time: song.meta.time, key: song.meta.key ? song.meta.key.name : '', notes, bars };
}

/** A bar's notes (those starting in it, held no further than its end) as text, with or without octaves. */
function barKey(notes: Note[], from: number, to: number, shift: number, octaves: boolean): string {
  return notes
    .filter((n) => n.start + shift >= from - 1e-6 && n.start + shift < to - 1e-6)
    .map((n) => `${round(n.start + shift - from)}/${round(Math.min(n.dur, to - n.start - shift))}/${n.deg}${octaves ? `/${n.oct}` : ''}`)
    .join(' ');
}

/**
 * One system's printed rows (part to sol-fa text) against the reading's notes in that system (part to notes,
 * in beats from the system's start), cut at the reading's bar lines (`bars`, lengths in beats). Counts are
 * added into `into`.
 */
export function compareSystem(printed: Record<string, string>, read: Record<string, Note[]>, bars: number[], time: string, into: Record<string, PartCount>, misses?: string[]) {
  const theirs: Record<string, Note[]> = {};
  for (const p of PARTS) if (printed[p]) theirs[p] = notesOf(`time: ${time}\n\n${p} ${printed[p]}\n`).notes[p] ?? [];
  const edges = bars.reduce<number[]>((acc, len) => [...acc, acc[acc.length - 1] + len], [0]);
  const count = (shift: number) => {
    const out: Record<string, PartCount> = {};
    for (const p of Object.keys(theirs)) {
      const c = (out[p] = { printed: 0, equal: 0, pitchesEqual: 0 });
      for (let b = 0; b + 1 < edges.length; b++) {
        const want = barKey(theirs[p], edges[b], edges[b + 1], shift, true);
        if (!want) continue;
        c.printed++;
        if (want === barKey(read[p] ?? [], edges[b], edges[b + 1], 0, true)) c.equal++;
        if (barKey(theirs[p], edges[b], edges[b + 1], shift, false) === barKey(read[p] ?? [], edges[b], edges[b + 1], 0, false)) c.pitchesEqual++;
      }
    }
    return out;
  };
  let best = count(0);
  let bestShift = 0;
  const score = (r: Record<string, PartCount>) => Object.values(r).reduce((s, c) => s + c.pitchesEqual, 0);
  for (const shift of [-1, 1, -2, 2, -0.5, 0.5, -3, 3]) {
    const r = count(shift);
    if (score(r) > score(best)) [best, bestShift] = [r, shift];
  }
  if (misses) {
    // The bars whose notes differ in any octave, printed over read (start/length/degree), at the best offset.
    const shift = bestShift;
    for (const p of Object.keys(theirs))
      for (let b = 0; b + 1 < edges.length; b++) {
        const want = barKey(theirs[p], edges[b], edges[b + 1], shift, false);
        const got = barKey(read[p] ?? [], edges[b], edges[b + 1], 0, false);
        if (want && want !== got) misses.push(`${p} bar ${b}: printed ${want} | read ${got}`);
      }
  }
  for (const [p, c] of Object.entries(best)) {
    const t = (into[p] ??= { printed: 0, equal: 0, pitchesEqual: 0 });
    t.printed += c.printed;
    t.equal += c.equal;
    t.pitchesEqual += c.pitchesEqual;
  }
}
