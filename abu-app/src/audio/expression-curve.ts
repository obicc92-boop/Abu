/**
 * How the player follows a song's musical markings (owner's request, 21 November 2026): louder and softer for the
 * dynamics (p, f, cresc., dim., sfz), faster and slower for the tempo marks (Andante, M. 70, rit., a tempo). Both
 * are worked out once per song from `ParsedSong.expressions` (read in src/solfa/expressions.ts), so the player can
 * ask about every note and every tick. A song with no markings plays exactly as before: every note at full
 * loudness, at the person's own tempo.
 *
 * Pure module: no React, no Web Audio.
 */
import { DEFAULT_LEVEL, type Expression, type ParsedSong } from '@/solfa';

/* ---------- Louder and softer ---------- */

/** How far a cresc. or dim. goes when no dynamic says where it's heading (about two steps, p to f), and over how many beats. */
export const SWELL = 0.25;
export const SWELL_BEATS = 8;
/** A cresc. or dim. heads for the next dynamic only when that comes within this many beats (8 bars of 4/4). */
export const SWELL_REACH = 32;
/** The softest and loudest a cresc. or dim. can go: ppp and ff. */
const MIN_LEVEL = 0.3;
const MAX_LEVEL = 1;

export interface LoudnessCurve {
  /** How loud a note starting on `beat` plays, as a multiplier (1 is as loud as a song with no markings). An accent on its beat counts. */
  at(part: string, beat: number): number;
  /**
   * Where a note held from `start` for `beats` beats is heading by its end, through a cresc. or dim.: the level just
   * before its end (a new dynamic on the next note's beat is for that note), with accents left out.
   */
  heldTo(part: string, start: number, beats: number): number;
}

/** A song with no dynamics: every note as loud as before. */
export const FULL_LOUDNESS: LoudnessCurve = { at: () => 1, heldTo: () => 1 };

/** A stretch of a part's loudness: `level` at beat `from`, in a straight line to `toLevel` at beat `to`, then held. */
interface Stretch {
  from: number;
  level: number;
  to: number;
  toLevel: number;
}

const LOUDNESS_KINDS: ReadonlySet<Expression['kind']> = new Set(['dynamic', 'accent', 'cresc', 'dim']);
/** Accents are exactly on a note's beat; this only absorbs rounding. */
const SAME_BEAT = 1e-6;

/** How loud each part plays through a song, worked out once (the player does this when it loads a song). */
export function loudnessCurve(song: ParsedSong): LoudnessCurve {
  const marks = song.expressions.filter((e) => LOUDNESS_KINDS.has(e.kind));
  if (!marks.length) return FULL_LOUDNESS;
  // Each part's stretches, worked out the first time a part is asked about.
  const parts = new Map<string, PartLoudness>();
  const of = (part: string) => {
    let p = parts.get(part);
    if (!p) parts.set(part, (p = partLoudness(marks, part)));
    return p;
  };
  return {
    at: (part, beat) => of(part).at(beat),
    heldTo: (part, start, beats) => of(part).before(start + beats),
  };
}

/** One note's loudness multiplier, for a part at a beat: see `loudnessCurve`, which the player uses. */
export function loudness(song: ParsedSong, part: string, beat: number): number {
  return loudnessCurve(song).at(part, beat);
}

interface PartLoudness {
  at(beat: number): number;
  before(beat: number): number;
}

/**
 * The rules, for one part: marks written in its own row, or on a line of their own (for every part), count.
 * - Before the first dynamic it plays as if mezzo-forte (DEFAULT_LEVEL), so a song's f is louder than its unmarked music.
 * - A dynamic (pp…ff) sets the level from its beat on.
 * - An accent (sfz…) makes only the note starting on its beat loud.
 * - A cresc. or dim. moves in a straight line from its beat to the next dynamic, if that comes within 32 beats and
 *   is louder (for a cresc.) or softer (for a dim.). Otherwise it moves a quarter (about two steps, p to f) over
 *   8 beats and holds, between ppp and ff. A later mark takes over from the level reached.
 */
function partLoudness(marks: Expression[], part: string): PartLoudness {
  const mine = marks.filter((m) => m.part === null || m.part === part);
  const accents = mine.filter((m) => m.kind === 'accent');
  // At the same beat a dynamic comes first, so "p cresc." swells from p.
  const changes = mine
    .filter((m) => m.kind !== 'accent')
    .sort((a, b) => a.beat - b.beat || Number(a.kind !== 'dynamic') - Number(b.kind !== 'dynamic'));

  const stretches: Stretch[] = [{ from: -Infinity, level: DEFAULT_LEVEL, to: -Infinity, toLevel: DEFAULT_LEVEL }];
  const add = (s: Stretch) => {
    if (stretches[stretches.length - 1].from === s.from) stretches.pop();
    stretches.push(s);
  };
  const levelAt = (beat: number, before = false) => {
    const s = stretches[lastAtOrBefore(stretches, (x) => x.from, beat, before)];
    return beat >= s.to ? s.toLevel : s.level + ((s.toLevel - s.level) * (beat - s.from)) / (s.to - s.from);
  };

  changes.forEach((c, i) => {
    if (c.kind === 'dynamic') {
      const level = c.level ?? DEFAULT_LEVEL;
      add({ from: c.beat, level, to: c.beat, toLevel: level });
      return;
    }
    const up = c.kind === 'cresc';
    const start = levelAt(c.beat);
    const next = changes.slice(i + 1).find((d) => d.kind === 'dynamic' && d.beat > c.beat);
    const aim = next?.level;
    if (next && aim !== undefined && next.beat - c.beat <= SWELL_REACH && (up ? aim > start : aim < start)) {
      add({ from: c.beat, level: start, to: next.beat, toLevel: aim });
    } else {
      // Nothing to aim for: a quarter louder or softer over 8 beats (sooner if it meets ff or ppp), then held.
      const end = clamp(start + (up ? SWELL : -SWELL), MIN_LEVEL, MAX_LEVEL);
      add({ from: c.beat, level: start, to: c.beat + (SWELL_BEATS * Math.abs(end - start)) / SWELL, toLevel: end });
    }
  });

  return {
    at: (beat) => accents.find((a) => Math.abs(a.beat - beat) < SAME_BEAT)?.level ?? levelAt(beat),
    before: (beat) => levelAt(beat, true),
  };
}

/* ---------- Faster and slower ---------- */

/** A rit. slows to this share of the tempo it starts from, over this many beats (or by the next tempo mark, if sooner). */
export const RIT_TO = 0.75;
export const RIT_BEATS = 8;

export interface TempoCurve {
  /** The song's starting tempo, in beats a minute: what the factors are measured from. */
  readonly start: number;
  /** True for a song with no tempo marks to follow: the factor is 1 everywhere. */
  readonly steady: boolean;
  /** The tempo at a beat, as a factor of `start` (0.75 at the end of a rit., 2 in an Allegro 126 after an Adagio 63). */
  factorAt(beat: number): number;
  /**
   * How long `beats` beats from beat `from` take, counted in beats at the starting tempo (so seconds are this times
   * 60 / the person's tempo): more through a rit., fewer where the song goes faster.
   */
  span(from: number, beats: number): number;
  /** The beat reached `steadyBeats` beats at the starting tempo after beat `from`: `span` the other way round. */
  beatAfter(from: number, steadyBeats: number): number;
}

/** A song with no tempo marks: the person's tempo all through. */
export function steadyTempo(start: number): TempoCurve {
  return { start, steady: true, factorAt: () => 1, span: (_from, beats) => beats, beatAfter: (from, steadyBeats) => from + steadyBeats };
}

/**
 * A song's starting tempo, in beats a minute: its `tempo:` heading, else a tempo mark in its first bar (the last one
 * written on that beat, as the player follows), else 96 for 3/4 and 84 otherwise, as in the prototype.
 */
export function startingTempo(song: ParsedSong): number {
  const heading = song.meta.tempo?.bpm;
  if (heading) return heading;
  const first = song.expressions.find((e) => e.kind === 'tempo' && e.bpm && e.beat < song.beatsPerBar);
  if (first) {
    const same = song.expressions.filter((e) => e.kind === 'tempo' && e.bpm && Math.abs(e.beat - first.beat) < SAME_BEAT);
    return same[same.length - 1].bpm!;
  }
  return song.beatsPerBar === 3 ? 96 : 84;
}

/** A stretch of the tempo: `bpm` at beat `from`, changing by `slope` beats a minute each beat (only in a rit.). */
interface Pace {
  from: number;
  bpm: number;
  slope: number;
}

/**
 * The tempo through a song, worked out once (the player does this when it loads a song). `start` is the tempo the
 * factors are measured from: the player passes the one it starts at (`defaultTempo`), so with the person's tempo
 * left alone, a tempo mark plays at its own speed.
 * - A tempo mark with a speed (Andante, M. 70) sets it from its beat.
 * - A rit. (or rall.) slows in a straight line from its beat to three quarters of the tempo then, over 8 beats or
 *   by the next tempo mark if that's sooner, and holds.
 * - An a tempo goes back to the tempo before the rit. (before the first, after a rit. and then another).
 */
export function tempoCurve(song: ParsedSong, start = startingTempo(song)): TempoCurve {
  const marks = song.expressions.filter((e) => (e.kind === 'tempo' && !!e.bpm) || e.kind === 'rit' || e.kind === 'atempo');
  const paces: Pace[] = [{ from: 0, bpm: start, slope: 0 }];
  const bpmAt = (beat: number) => {
    const p = paces[lastAtOrBefore(paces, (x) => x.from, beat)];
    return p.bpm + p.slope * (beat - p.from);
  };
  // A mark takes over from its beat: anything planned from there on (the hold at the end of a rit. cut short) goes.
  const set = (from: number, bpm: number, slope = 0) => {
    while (paces.length && paces[paces.length - 1].from >= from) paces.pop();
    paces.push({ from, bpm, slope });
  };

  let beforeRit: number | null = null;
  marks.forEach((m, i) => {
    if (m.kind === 'tempo') {
      set(m.beat, m.bpm!);
      beforeRit = null;
    } else if (m.kind === 'atempo') {
      if (beforeRit !== null) set(m.beat, beforeRit);
      beforeRit = null;
    } else {
      // The same rit. written in every part's row is read once over: it starts from the same tempo, so it's the same.
      const from = bpmAt(m.beat);
      beforeRit ??= from;
      const next = marks.slice(i + 1).find((n) => n.beat > m.beat);
      const end = Math.min(m.beat + RIT_BEATS, next?.beat ?? Infinity);
      set(m.beat, from, (from * RIT_TO - from) / (end - m.beat));
      set(end, from * RIT_TO);
    }
  });

  if (paces.every((p) => p.bpm === start && p.slope === 0)) return steadyTempo(start);
  return pacedTempo(paces, start);
}

/**
 * Beats and time through a changing tempo. "Steady beats" are beats at the starting tempo: the player turns them
 * into seconds with the person's tempo. `steadyAt[i]` counts them from beat 0 to where `paces[i]` starts. Through a
 * rit. the tempo changes smoothly, so the time is worked out exactly (a logarithm), not in small steps.
 */
function pacedTempo(paces: Pace[], start: number): TempoCurve {
  const factor = paces.map((p) => p.bpm / start);
  const slope = paces.map((p) => p.slope / start);
  /** Steady beats for `beats` beats from the start of pace `i` (as a factor, it's `factor[i] + slope[i] * beats`). */
  const within = (i: number, beats: number) =>
    slope[i] === 0 ? beats / factor[i] : Math.log((factor[i] + slope[i] * beats) / factor[i]) / slope[i];
  const steadyAt = [0];
  for (let i = 1; i < paces.length; i++) steadyAt.push(steadyAt[i - 1] + within(i - 1, paces[i].from - paces[i - 1].from));

  /** Steady beats from beat 0 to `beat` (before beat 0, at the first tempo). */
  const toSteady = (beat: number) => {
    if (beat < 0) return beat / factor[0];
    const i = lastAtOrBefore(paces, (p) => p.from, beat);
    return steadyAt[i] + within(i, beat - paces[i].from);
  };
  /** The beat `steady` steady beats from beat 0. */
  const fromSteady = (steady: number) => {
    if (steady < 0) return steady * factor[0];
    const i = lastAtOrBefore(steadyAt, (s) => s, steady);
    const d = steady - steadyAt[i];
    return paces[i].from + (slope[i] === 0 ? d * factor[i] : (factor[i] * (Math.exp(slope[i] * d) - 1)) / slope[i]);
  };

  return {
    start,
    steady: false,
    factorAt: (beat) => {
      if (beat < 0) return factor[0];
      const i = lastAtOrBefore(paces, (p) => p.from, beat);
      return factor[i] + slope[i] * (beat - paces[i].from);
    },
    span: (from, beats) => toSteady(from + beats) - toSteady(from),
    beatAfter: (from, steadyBeats) => fromSteady(toSteady(from) + steadyBeats),
  };
}

/* ---------- Helpers ---------- */

/**
 * The last item whose key is at or before `x` (or strictly before, with `strictly`), in items sorted by key; the
 * first item when none is.
 */
function lastAtOrBefore<T>(items: readonly T[], key: (item: T) => number, x: number, strictly = false): number {
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const k = key(items[mid]);
    if (strictly ? k < x : k <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
