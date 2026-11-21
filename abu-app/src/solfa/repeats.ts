/**
 * Repeats and jumps (owner's request, 21 November 2026, circling a segno on a handwritten sheet: "DC or to
 * repeat… find how to use it… and how to implement that"): what a repeat mark in braces says, how it's spelt,
 * what's wrong with a song's marks, and the order a song is played in.
 *
 * The marks (docs/solfa-format.md), as the scanning AI writes them too:
 * - signs, written before the first note they mark: `{segno}` 𝄋, `{coda}` 𝄌, the start repeat `{|:}`, and the
 *   first and second endings `{1.}` and `{2.}`;
 * - jumps and ends, written right after the last note they end, before the bar line: `{D.S.}`, `{D.S. al Fine}`,
 *   `{D.S. al Coda}`, `{D.C.}`, `{D.C. al Fine}`, `{D.C. al Coda}`, `{Fine}`, `{to coda}`, and the end repeat
 *   `{:|}`.
 *
 * The order of play follows the usual conventions:
 * - A repeat is played once more: at `{:|}` the music goes back to its `{|:}`, once. An end repeat with no start
 *   goes back to the end of the repeat before it, else to the start of its section, else to the song's start
 *   (whichever is latest).
 * - First and second endings: the first ending plays up to its `{:|}`; the second time round it's left out and the
 *   second ending plays instead. A `{2.}` with no `{:|}` before it ends the first ending there and goes back.
 * - A jump (D.S. back to the segno, D.C. back to the start) is taken once.
 * - `{Fine}` and `{to coda}` count only on the pass after a jump: al Fine ends at Fine, al Coda leaves at To Coda
 *   for the coda, and a plain D.S. or D.C. does whichever of the two the song has.
 * - After a D.S. or D.C., repeats aren't taken again, and the last ending is played.
 * - Repeats inside a repeat are played again on its second time round.
 *
 * Pure module: no React, no audio. Relative imports only (the Worker reads songs with it too).
 */
import type { Mark, MarkName, ParsedSong } from './types';

const EPS = 1e-6;

/** Each mark as it's written in braces: SolfaScores' own spelling (the keypad writes it, the scanning AI too). */
export const REPEAT_SPELLING: Readonly<Record<MarkName, string>> = {
  segno: 'segno',
  coda: 'coda',
  '|:': '|:',
  '1.': '1.',
  '2.': '2.',
  ds: 'D.S.',
  'ds-fine': 'D.S. al Fine',
  'ds-coda': 'D.S. al Coda',
  dc: 'D.C.',
  'dc-fine': 'D.C. al Fine',
  'dc-coda': 'D.C. al Coda',
  fine: 'Fine',
  tocoda: 'to coda',
  ':|': ':|',
};

/** Signs: at the beat of the first note they mark. Every other mark is a jump or an end, at the beat its bar ends. */
const SIGNS: ReadonlySet<MarkName> = new Set<MarkName>(['segno', 'coda', '|:', '1.', '2.']);
export const isSign = (name: MarkName): boolean => SIGNS.has(name);

/** What a mark says, with case, spaces and dots left out of what's in its braces ("D.S. al Fine" is "dsalfine"). */
const READINGS: Readonly<Record<string, MarkName>> = {
  segno: 'segno',
  sign: 'segno',
  '𝄋': 'segno',
  '§': 'segno',
  $: 'segno',
  // SMuFL's (music fonts such as Bravura), as a PDF's text may give them.
  '\uE047': 'segno',
  coda: 'coda',
  '𝄌': 'coda',
  '⊕': 'coda',
  '\uE048': 'coda',
  tocoda: 'tocoda',
  'tocoda𝄌': 'tocoda',
  'tocoda⊕': 'tocoda',
  'to𝄌': 'tocoda',
  'to⊕': 'tocoda',
  ds: 'ds',
  dalsegno: 'ds',
  dsalfine: 'ds-fine',
  dalsegnoalfine: 'ds-fine',
  dsalcoda: 'ds-coda',
  dalsegnoalcoda: 'ds-coda',
  dc: 'dc',
  dacapo: 'dc',
  dcalfine: 'dc-fine',
  dacapoalfine: 'dc-fine',
  dcalcoda: 'dc-coda',
  dacapoalcoda: 'dc-coda',
  fine: 'fine',
  '|:': '|:',
  '||:': '|:',
  '‖:': '|:',
  '𝄆': '|:',
  ':|': ':|',
  ':||': ':|',
  ':‖': ':|',
  '𝄇': ':|',
  '1': '1.',
  '1st': '1.',
  '1sttime': '1.',
  firsttime: '1.',
  '2': '2.',
  '2nd': '2.',
  '2ndtime': '2.',
  secondtime: '2.',
};

/**
 * The repeat or jump mark written in braces (`{D.S. al Fine}`, `{dal segno}`, `{dc}`, `{:|}`, `{1.}`), or null if
 * it isn't one. Case, spaces and dots don't matter.
 */
export function readRepeat(inner: string): MarkName | null {
  return READINGS[inner.toLowerCase().replace(/[\s.]+/g, '')] ?? null;
}

/** A stretch of the song as written: from beat `from` up to `to` (not played). */
export interface Segment {
  from: number;
  to: number;
}

/** A first ending: where it starts (`{1.}`), where it ends and goes back (its `{:|}`), and where the second takes over. */
export interface Ending {
  first: number;
  close: number;
  /** The second ending's start (`{2.}`), or `close` when there's none: second time round, the first is left out. */
  second: number;
  /** The end repeat that closes it (in `RepeatPlan.repeats`): once that's taken, the first ending is left out. */
  repeat: number;
}

/** What's wrong with a mark, said plainly, and where it is. */
export interface RepeatProblem {
  name: MarkName;
  beat: number;
  /** "{D.S.} has no {segno} before it to go back to, so the music plays straight on." */
  message: string;
}

/** A song's repeats and jumps, worked out: where each goes, and what's wrong. */
export interface RepeatPlan {
  /** End repeats (and a second ending with no end repeat before it): the beat, and where it goes back to. */
  repeats: { beat: number; target: number }[];
  endings: Ending[];
  /** D.S. and D.C.: the beat, where it goes, and whether it's al Fine or al Coda. */
  jumps: { beat: number; target: number; al: 'fine' | 'coda' | null }[];
  fines: number[];
  /** To Coda: the beat, and the coda it goes to. */
  toCodas: { beat: number; target: number }[];
  problems: RepeatProblem[];
}

const JUMPS: Partial<Record<MarkName, { to: 'segno' | 'start'; al: 'fine' | 'coda' | null }>> = {
  ds: { to: 'segno', al: null },
  'ds-fine': { to: 'segno', al: 'fine' },
  'ds-coda': { to: 'segno', al: 'coda' },
  dc: { to: 'start', al: null },
  'dc-fine': { to: 'start', al: 'fine' },
  'dc-coda': { to: 'start', al: 'coda' },
};

/** Marks on the same beat, read in this order: the ends of what comes before it, then a second ending, then signs. */
const rank = (name: MarkName): number => (name === '1.' ? 3 : name === '2.' ? 1 : isSign(name) ? 2 : 0);

/** Works out a song's repeats and jumps (see the conventions at the top). */
export function repeatPlan(song: Pick<ParsedSong, 'marks' | 'sections'>): RepeatPlan {
  const marks = [...song.marks].sort((a, b) => a.beat - b.beat || rank(a.name) - rank(b.name));
  const problems: RepeatProblem[] = [];
  const problem = (m: Mark, message: string) => problems.push({ name: m.name, beat: m.beat, message: `{${REPEAT_SPELLING[m.name]}} ${message}` });

  // First and second endings, and the end repeats (a second ending with no end repeat before it makes one).
  const firsts: { first: number; close: number | null; second: number | null; mark: Mark; repeat: number }[] = [];
  const ends: { beat: number; ending: number | null }[] = [];
  let open: (typeof firsts)[number] | null = null;
  for (const m of marks) {
    if (m.name === '1.') {
      open = { first: m.beat, close: null, second: null, mark: m, repeat: -1 };
      firsts.push(open);
    } else if (m.name === ':|') {
      const closes = !!open && open.close === null && m.beat > open.first + EPS;
      if (closes) open!.close = m.beat;
      ends.push({ beat: m.beat, ending: closes ? firsts.indexOf(open!) : null });
    } else if (m.name === '2.') {
      // The first ending it follows: the last one with no second ending yet.
      const e = [...firsts].reverse().find((f) => f.second === null && f.first < m.beat - EPS);
      if (!e) {
        problem(m, 'has no {1.} before it, so the music plays straight on.');
        continue;
      }
      if (e.close === null) {
        e.close = m.beat;
        ends.push({ beat: m.beat, ending: firsts.indexOf(e) });
      }
      e.second = m.beat;
      if (open === e) open = null;
    }
  }
  for (const f of firsts) if (f.close === null) problem(f.mark, 'has no {:|} or {2.} after it, so it plays as written.');

  // Where each end repeat goes back to: its start repeat (matched as brackets are, so one repeat can hold
  // another), else the latest of the repeat before it, its section's start and the song's start. One closing a
  // first ending goes back to before the ending.
  const sectionStarts = song.sections.map((s) => s.start);
  const events = [
    ...ends.map((e) => ({ beat: e.beat, end: e })),
    ...marks.filter((m) => m.name === '|:').map((m) => ({ beat: m.beat, end: null })),
  ].sort((a, b) => a.beat - b.beat || (a.end ? 0 : 1) - (b.end ? 0 : 1));
  const repeats: RepeatPlan['repeats'] = [];
  const startsOpen: number[] = [];
  let lastEnd: number | null = null;
  for (const ev of events) {
    if (!ev.end) {
      startsOpen.push(ev.beat);
      continue;
    }
    const ending = ev.end.ending === null ? null : firsts[ev.end.ending];
    const limit = ending ? ending.first : ev.beat;
    let target = startsOpen.pop();
    if (target === undefined) {
      const before = [...sectionStarts, ...(lastEnd === null ? [] : [lastEnd])].filter((b) => b < limit - EPS);
      target = Math.max(0, ...before);
    }
    repeats.push({ beat: ev.beat, target });
    if (ending) ending.repeat = repeats.length - 1;
    lastEnd = ev.beat;
  }
  const endings: Ending[] = firsts
    .filter((f) => f.close !== null && f.repeat >= 0)
    .map((f) => ({ first: f.first, close: f.close!, second: f.second ?? f.close!, repeat: f.repeat }));

  // D.S. and D.C.: back to the segno before it (the latest), or the start.
  const has = (name: MarkName) => marks.some((m) => m.name === name);
  const segnos = marks.filter((m) => m.name === 'segno').map((m) => m.beat);
  const jumps: RepeatPlan['jumps'] = [];
  for (const m of marks) {
    const kind = JUMPS[m.name];
    if (!kind) continue;
    let target = 0;
    if (kind.to === 'segno') {
      const before = segnos.filter((s) => s <= m.beat + EPS);
      if (!before.length) {
        problem(m, 'has no {segno} before it to go back to, so the music plays straight on.');
        continue;
      }
      target = before[before.length - 1];
    }
    if (kind.al === 'fine' && !has('fine')) problem(m, 'has no {Fine} to end at, so after it the music plays on to the end.');
    if (kind.al === 'coda' && !has('tocoda')) problem(m, 'has no {to coda} to leave from, so after it the music plays on to the end.');
    jumps.push({ beat: m.beat, target, al: kind.al });
  }

  // To Coda: on to the next coda sign.
  const codas = marks.filter((m) => m.name === 'coda').map((m) => m.beat);
  const toCodas: RepeatPlan['toCodas'] = [];
  for (const m of marks) {
    if (m.name !== 'tocoda') continue;
    const target = codas.find((c) => c >= m.beat - EPS);
    if (target === undefined) problem(m, 'has no {coda} after it to go to, so the music plays straight on.');
    else toCodas.push({ beat: m.beat, target });
  }

  const fines = marks.filter((m) => m.name === 'fine').map((m) => m.beat);
  return { repeats, endings, jumps, fines, toCodas, problems };
}

/** What the music meets on its way, in the order it's dealt with on the same beat. */
type Trigger =
  | { kind: 'fine'; beat: number }
  | { kind: 'tocoda'; beat: number; i: number }
  | { kind: 'repeat'; beat: number; i: number }
  | { kind: 'jump'; beat: number; i: number }
  | { kind: 'ending'; beat: number; i: number };
const FIRST: Record<Trigger['kind'], number> = { fine: 0, tocoda: 1, repeat: 2, jump: 3, ending: 4 };

/**
 * The order a song is played in, from written beat `from` (the start, or a bar the person chose), as stretches of
 * the song as written, one after another (see the conventions at the top). From a bar part way, the music is
 * played as if it were the first time there: a repeat ahead is taken, and so is a jump. A song with no repeats or
 * jumps is one stretch, from `from` to its end.
 */
export function playOrder(song: Pick<ParsedSong, 'marks' | 'sections' | 'total'>, from = 0): Segment[] {
  const total = song.total;
  const start = Math.max(0, Math.min(from, total));
  if (start >= total - EPS) return [];
  if (!song.marks.length) return [{ from: start, to: total }];
  const plan = repeatPlan(song);
  const triggers: Trigger[] = [
    ...plan.fines.map((beat) => ({ kind: 'fine' as const, beat })),
    ...plan.toCodas.map((t, i) => ({ kind: 'tocoda' as const, beat: t.beat, i })),
    ...plan.repeats.map((r, i) => ({ kind: 'repeat' as const, beat: r.beat, i })),
    ...plan.jumps.map((j, i) => ({ kind: 'jump' as const, beat: j.beat, i })),
    ...plan.endings.map((e, i) => ({ kind: 'ending' as const, beat: e.first, i })),
  ].sort((a, b) => a.beat - b.beat || FIRST[a.kind] - FIRST[b.kind]);

  const out: Segment[] = [];
  let pos = start;
  /** After a jump: what it's "al" (or 'plain' for a plain D.S. or D.C.); null before any jump. */
  let jumped: 'fine' | 'coda' | 'plain' | null = null;
  const repeated = new Set<number>();
  const jumpsTaken = new Set<number>();
  const codasTaken = new Set<number>();
  /** Plays on from `pos` to `to`, then carries on at `next`. */
  const play = (to: number, next: number) => {
    if (to - pos > EPS) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.to - pos) < EPS) last.to = to;
      else out.push({ from: pos, to });
    }
    pos = next;
  };
  const active = (t: Trigger): boolean => {
    switch (t.kind) {
      case 'fine':
        return jumped === 'fine' || jumped === 'plain';
      case 'tocoda':
        return (jumped === 'coda' || jumped === 'plain') && !codasTaken.has(t.i);
      case 'repeat':
        return jumped === null && !repeated.has(t.i);
      case 'jump':
        return !jumpsTaken.has(t.i);
      case 'ending':
        return jumped !== null || repeated.has(plan.endings[t.i].repeat);
    }
  };

  // Each step takes a repeat, a jump or a To Coda that can't be taken again, or moves on past an ending, so this
  // ends; the cap is only a guard.
  for (let step = 0; step < 1000; step++) {
    const t = triggers.find((x) => x.beat > pos + EPS && x.beat < total + EPS && active(x));
    if (!t) break;
    if (t.kind === 'fine') {
      play(t.beat, t.beat);
      return out;
    }
    if (t.kind === 'tocoda') {
      codasTaken.add(t.i);
      play(t.beat, plan.toCodas[t.i].target);
    } else if (t.kind === 'repeat') {
      const r = plan.repeats[t.i];
      repeated.add(t.i);
      // Going round again: the repeats inside it are played again too.
      plan.repeats.forEach((x, j) => {
        if (x.beat > r.target + EPS && x.beat < r.beat - EPS) repeated.delete(j);
      });
      play(t.beat, r.target);
    } else if (t.kind === 'jump') {
      const j = plan.jumps[t.i];
      jumpsTaken.add(t.i);
      jumped = j.al ?? 'plain';
      play(t.beat, j.target);
    } else {
      play(t.beat, plan.endings[t.i].second);
    }
  }
  play(total, total);
  return out;
}

/** How many beats an order of play takes. */
export const orderLength = (order: readonly Segment[]): number => order.reduce((a, s) => a + s.to - s.from, 0);
