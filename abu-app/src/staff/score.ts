/**
 * A staff reading made into the score the MusicXML converter takes
 * (`XScore`, src/musicxml/read.ts), so staff notation becomes sol-fa the
 * same way a MusicXML file does (`findVoices`, then `toSolfa`).
 *
 * Every voice part is a part of its own, named Soprano, Alto, Tenor or
 * Bass, one note at a time, so `findVoices` trusts the names: a hymn's
 * treble staff is split here into the soprano (the upper voice, or a
 * chord's top note) and the alto (the lower voice, a chord's bottom note,
 * or the same note where the voices sing one), and its bass staff into
 * tenor and bass. A piano under the voices is a part named Piano, which
 * the converter leaves out. A tenor's treble clef sounds an octave lower
 * than written. Ties are joined into one long note, as `readMusicXml` does.
 */
import type { XDirection, XKey, XMeasure, XNote, XPart, XScore, XTime } from '@/musicxml';
import type { Box } from '@/scan/types';

import { letterOf, metreOf, midiOf, type Clef } from './decode';
import { octaveDown, type Role } from './systems';
import type { StaffMark, StaffReading, StaffSystem } from './index';
import type { PageBar, Reading, TimedEvent } from './timing';

/** A system's staves: where it is, who sings each staff, and each staff's clef at its start. */
export interface SystemPlace {
  page: number;
  box: Box;
  roles: Role[];
  clefs: Clef[];
}

const EPS = 1e-6;
const VOICE_PARTS = ['Soprano', 'Alto', 'Tenor', 'Bass'] as const;

/** A note of one line (a voice part, or one voice of a piano staff), in quarters from the piece's start. */
interface LineNote {
  start: number;
  /** As long as it lasts in its bar (its next note's start at most). */
  dur: number;
  midi: number;
  step: string;
  alter: number;
  tieStart: boolean;
  tieStop: boolean;
  chord: boolean;
  voice: string;
  staff: number;
  lyric?: XNote['lyric'];
  /** The system it's in, and where it was read on its page (for its words), in the page's pixels. */
  system: number;
  x?: number;
}

/** A syllable of the words under a staff, where it's printed (its middle, in the page's pixels). */
export interface Syllable {
  x: number;
  text: string;
  syllabic: 'begin' | 'middle' | 'end' | 'single';
}

/** What the reader writes for these tokens: pieces of the score keyed by who sings them. */
type Lines = Map<string, LineNote[]>;

const covers = (e: TimedEvent, t: number) => e.onset <= t + EPS && e.onset + e.beats > t + EPS;

/**
 * One staff's events in one bar as the lines they make, rests with them (a
 * note lasts to the next note or rest of its line: `rest` entries mark
 * where a line falls silent). A part's own staff gives its part one note at
 * a time (a chord's top note; a second voice only where the first is
 * silent). A staff two parts share gives the upper part its first voice's
 * top notes, and the lower part its second voice, or, where no second voice
 * sounds, the first voice's bottom note (the same note, where they sing one).
 */
function linesOf(events: TimedEvent[], role: Role, xOf: (e: TimedEvent) => number | undefined): { line: 'upper' | 'lower' | 'piano'; voice: number; e: TimedEvent; head: number; rest: boolean; x?: number }[] {
  const firsts = events.filter((e) => e.voice === 1);
  const seconds = events.filter((e) => e.voice === 2);
  const out: ReturnType<typeof linesOf> = [];
  const add = (line: 'upper' | 'lower' | 'piano', voice: number, e: TimedEvent, head: number) => out.push({ line, voice, e, head, rest: e.rest, x: xOf(e) });
  if (role === 'P1' || role === 'P2') {
    for (const e of events) if (!e.rest) e.heads.forEach((_, h) => add('piano', e.voice, e, h));
    return out;
  }
  const top = (e: TimedEvent) => e.heads.length - 1;
  if (role === 'SA' || role === 'TB') {
    for (const e of firsts) add('upper', 1, e, top(e));
    for (const e of seconds) add('lower', 1, e, 0);
    for (const e of firsts) {
      if (seconds.some((s) => covers(s, e.onset))) continue;
      add('lower', 1, e, 0);
    }
    return out;
  }
  for (const e of firsts) add('upper', 1, e, top(e));
  for (const e of seconds) {
    if (e.rest || firsts.some((f) => !f.rest && f.onset < e.onset + e.beats - EPS && f.onset + f.beats > e.onset + EPS)) continue;
    add('upper', 1, e, top(e));
  }
  return out;
}

/**
 * How long a voice's note lasts in its bar: to its line's next note or rest
 * where its length as read falls short of it by no more than itself (a dot
 * or a flag misread: the next note was timed by where it stands), else as
 * read. The bar's last note, to the bar's end only where a dot was missed.
 */
function heldTo(onset: number, beats: number, next: number | null, length: number): number {
  const end = onset + beats;
  if (next !== null) return next - end > EPS && next - end <= beats + EPS ? next : end;
  return length - end > EPS && length - end <= beats / 2 + EPS ? length : end;
}

/** Which part a staff's line is: by its role, and for a shared staff by upper or lower. */
function partOf(role: Role, line: 'upper' | 'lower' | 'piano'): string | null {
  switch (role) {
    case 'S':
      return 'Soprano';
    case 'A':
      return 'Alto';
    case 'T':
      return 'Tenor';
    case 'B':
      return 'Bass';
    case 'SA':
      return line === 'upper' ? 'Soprano' : 'Alto';
    case 'TB':
      return line === 'upper' ? 'Tenor' : 'Bass';
    case 'P1':
    case 'P2':
      return 'Piano';
    default:
      return null;
  }
}

/**
 * A voice part's notes given the words printed under its staff, system by
 * system: each syllable to the note it's printed under (in order, the
 * nearest within two staff spaces; a note with none is a melisma's). Where
 * the words are known, a note with no syllable of its own at the same pitch
 * as the note just before it is held on from it: a tie the reader missed
 * (no one slurs a note to itself).
 */
function withWords(notes: LineNote[], part: string, words?: (system: number, part: string) => Syllable[] | undefined, gapOf?: (system: number) => number): LineNote[] {
  if (!words) return notes;
  const out = [...notes].sort((a, b) => a.start - b.start);
  const systems = [...new Set(out.map((n) => n.system))];
  for (const system of systems) {
    const syllables = words(system, part);
    const here = out.filter((n) => n.system === system && n.x !== undefined);
    if (!syllables?.length || !here.length) continue;
    const near = 2 * (gapOf?.(system) ?? 10);
    // In order: each syllable to the nearest note after the last one taken.
    let from = 0;
    let matched = 0;
    for (const s of syllables) {
      let best = -1;
      for (let i = from; i < here.length; i++) {
        const d = Math.abs(here[i].x! - s.x);
        if (d <= near && (best < 0 || d < Math.abs(here[best].x! - s.x))) best = i;
        if (here[i].x! > s.x + near) break;
      }
      if (best < 0) continue;
      here[best].lyric = { text: s.text, syllabic: s.syllabic };
      from = best + 1;
      matched++;
    }
    // Ties from the words: only where most syllables found their notes (else the words are someone else's).
    if (matched < Math.max(2, syllables.length * 0.6)) continue;
    const first = here.findIndex((n) => n.lyric);
    for (let i = Math.max(1, first + 1); i < here.length; i++) {
      const n = here[i];
      const prev = here[i - 1];
      if (n.lyric || n.tieStop || prev.midi !== n.midi || Math.abs(prev.start + prev.dur - n.start) > EPS) continue;
      prev.tieStart = true;
      n.tieStop = true;
    }
  }
  return out;
}

/** Notes of a line in time order, each lasting to the next at most, tied notes joined. */
function tidy(notes: LineNote[]): LineNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || b.midi - a.midi);
  const out: LineNote[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.start - n.start) < EPS && !n.chord) continue; // two at once in one line: the first
    if (prev && !n.chord && prev.start + prev.dur > n.start + EPS) prev.dur = n.start - prev.start;
    // A tie from the note before, the same pitch, ending where this starts: one long note.
    if (prev && n.tieStop && prev.midi === n.midi && Math.abs(prev.start + prev.dur - n.start) < EPS && !n.chord && !prev.chord) {
      prev.dur += n.dur;
      prev.tieStart = n.tieStart;
      continue;
    }
    out.push({ ...n });
  }
  return out.filter((n) => n.dur > EPS);
}

/** A bar's marks as SolfaScores writes them. */
const MARK_TEXT: Record<string, { where: 'start' | 'end'; text: string }> = {
  segno: { where: 'start', text: 'segno' },
  coda: { where: 'start', text: 'coda' },
  tocoda: { where: 'end', text: 'to coda' },
  'ds.coda': { where: 'end', text: 'D.S. al Coda' },
  'dc.coda': { where: 'end', text: 'D.C. al Coda' },
  'ds.fine': { where: 'end', text: 'D.S. al Fine' },
  'dc.fine': { where: 'end', text: 'D.C. al Fine' },
  fine: { where: 'end', text: 'Fine' },
};

export function marksOf(bars: PageBar[]): StaffMark[] {
  const out: StaffMark[] = [];
  bars.forEach((bar, i) => {
    if (bar.repeatStart) out.push({ bar: i, where: 'start', text: '|:' });
    if (bar.volta) out.push({ bar: i, where: 'start', text: `${bar.volta}.` });
    for (const m of bar.marks) if (MARK_TEXT[m]) out.push({ bar: i, ...MARK_TEXT[m] });
    if (bar.barline === 'rpt.end') out.push({ bar: i, where: 'end', text: ':|' });
  });
  return out;
}

/**
 * The reading as a score: its bars, keys and metres, and a part for each
 * voice that sings (and the piano). `xOf` gives where an event was read on
 * its page (for words, words.ts); systems' places give `systems`.
 */
export function readingScore(
  reading: Reading,
  places: SystemPlace[],
  options: {
    title?: string;
    xOf?: (system: number, e: TimedEvent) => number;
    /** The words printed under a voice part's staff in a system, if known (a PDF page's own text: words.ts). */
    words?: (system: number, part: string) => Syllable[] | undefined;
    /** The staff space in a system, in the page's pixels (how near a syllable must be to its note). */
    gapOf?: (system: number) => number;
  } = {},
): StaffReading {
  const measures: XMeasure[] = [];
  const keys: XKey[] = [];
  const times: XTime[] = [];
  const lines: Lines = new Map();
  const tenorClef = new Map<string, Clef>();
  let at = 0;
  const pickup = !!reading.bars[0]?.pickup;
  reading.bars.forEach((bar, b) => {
    measures.push({ start: at, length: bar.length, number: String(b + (pickup ? 0 : 1)), implicit: !!bar.pickup });
    if (b === 0 || bar.keyChange !== undefined) keys.push({ at, fifths: b === 0 ? bar.fifths : bar.keyChange!, mode: 'major' });
    if (b === 0 || bar.timeChange) {
      const m = metreOf(b === 0 ? bar.time : bar.timeChange!);
      times.push({ at, beats: m.beats, beatType: m.beatType });
    }
    const place = places[bar.system];
    // A pickup's notes end at its barline: they start as late as the bar is short.
    const shift = bar.pickup ? bar.length - Math.max(0, ...bar.events.map((e) => e.onset + e.beats)) : 0;
    place.roles.forEach((role, si) => {
      const events = bar.events.filter((e) => e.staff === si);
      const entries = linesOf(events, role, (ev) => options.xOf?.(bar.system, ev));
      for (const [k, { line, voice, e, head, rest, x }] of entries.entries()) {
        const part = partOf(role, line);
        if (!part || rest) continue;
        const h = e.heads[head];
        const down = octaveDown(role, place.clefs[si]);
        if (part === 'Tenor' && !tenorClef.has(part)) tenorClef.set(part, down ? 'G' : place.clefs[si]);
        // The next note or rest in this line, for how long this one lasts (a voice's; a piano's as read).
        const next = entries.filter((o, j) => j !== k && o.line === line && o.voice === voice && o.e.onset > e.onset + EPS).reduce<number | null>((m, o) => (m === null || o.e.onset < m ? o.e.onset : m), null);
        const until = line === 'piano' ? e.onset + e.beats : heldTo(e.onset, e.beats, next, bar.length - shift);
        const start = at + shift + e.onset;
        const end = Math.min(at + bar.length, at + shift + until);
        if (end <= start + EPS) continue;
        const key = part === 'Piano' ? `Piano/${role}/${voice}` : part;
        const list = lines.get(key) ?? [];
        list.push({
          start,
          dur: end - start,
          midi: midiOf(h.step, h.alter) - (down ? 12 : 0),
          step: letterOf(h.step),
          alter: h.alter,
          tieStart: h.tie,
          tieStop: h.tiedIn,
          chord: line === 'piano' && head > 0,
          voice: String(voice),
          staff: role === 'P2' ? 2 : 1,
          system: bar.system,
          x,
        });
        lines.set(key, list);
      }
    });
    at += bar.length;
  });
  const sung = VOICE_PARTS.filter((name) => lines.has(name));
  const parts: XPart[] = sung.map((name, pi) => ({
    id: `P${pi + 1}`,
    name,
    staves: 1,
    clefs: { 1: name === 'Soprano' || name === 'Alto' ? { sign: 'G', octave: 0 } : name === 'Tenor' && tenorClef.get(name) === 'G' ? { sign: 'G', octave: -1 } : { sign: 'F', octave: 0 } },
    notes: tidy(withWords(lines.get(name)!, name, options.words, options.gapOf)).map((n) => noteOf(n, pi)),
  }));
  const pianoKeys = [...lines.keys()].filter((k) => k.startsWith('Piano/'));
  if (pianoKeys.length) {
    const pi = parts.length;
    const notes = pianoKeys.flatMap((k) => {
      // A chord's heads share a start: tidied by voice, its other heads kept.
      const all = lines.get(k)!;
      const mains = tidy(all.filter((n) => !n.chord));
      const heads = all.filter((n) => n.chord && mains.some((m) => Math.abs(m.start - n.start) < EPS)).map((n) => ({ ...n, dur: mains.find((m) => Math.abs(m.start - n.start) < EPS)!.dur }));
      return [...mains, ...heads].sort((a, b) => a.start - b.start || Number(a.chord) - Number(b.chord));
    });
    parts.push({ id: `P${pi + 1}`, name: 'Piano', staves: 2, clefs: { 1: { sign: 'G', octave: 0 }, 2: { sign: 'F', octave: 0 } }, notes: notes.map((n) => noteOf(n, pi)) });
  }
  const marks = marksOf(reading.bars);
  const directions: XDirection[] = marks.map((m) => ({
    at: m.where === 'start' ? measures[m.bar].start : measures[m.bar].start + measures[m.bar].length,
    bar: m.bar,
    part: null,
    kind: m.where === 'start' ? 'sign' : 'end',
    text: m.text,
  }));
  const score: XScore = { title: options.title ?? '', composer: '', lyricist: '', parts, measures, keys, times, directions };
  // Systems: the bars each holds (one for each place, in order; a system with no bars holds none).
  const systems: StaffSystem[] = places.map((place) => ({ page: place.page, box: place.box, bars: [measures.length, measures.length] }));
  reading.bars.forEach((bar, b) => {
    const s = systems[bar.system];
    if (s.bars[0] === measures.length) s.bars = [b, b + 1];
    else s.bars[1] = b + 1;
  });
  // (Systems before the first with bars start where the next does.)
  for (let k = systems.length - 2; k >= 0; k--) if (systems[k].bars[0] === measures.length && systems[k].bars[1] === measures.length) systems[k].bars = [systems[k + 1].bars[0], systems[k + 1].bars[0]];
  return { score, systems, marks };
}

const noteOf = (n: LineNote, part: number): XNote => ({
  part,
  staff: n.staff,
  voice: n.voice,
  start: n.start,
  dur: n.dur,
  midi: n.midi,
  step: n.step,
  alter: n.alter,
  chord: n.chord,
  tieStart: n.tieStart,
  tieStop: n.tieStop,
  ...(n.lyric ? { lyric: n.lyric } : {}),
});
