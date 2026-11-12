/**
 * Finds the soprano, alto, tenor and bass lines in a score, however it's laid
 * out: four parts, two staves with two voices each (the hymn-book layout),
 * chords on one stem, or a single tune. Each line comes out one note at a time.
 */
import type { XNote, XPart, XScore } from './read';

export interface LineNote {
  /** Quarter notes from the start. */
  start: number;
  dur: number;
  midi: number;
  step: string;
  alter: number;
  lyric?: { text: string; syllabic: string };
}

export interface VoiceLine {
  /** S, A, T or B (or "S" alone for a tune). */
  part: string;
  notes: LineNote[];
}

const EPS = 1e-6;
const INSTRUMENT = /piano|organ|keyboard|harmonium|accomp|guitar|drum|percussion|violin|viola|cello|flute|clarinet|trumpet|horn|sax|harp|strings|synth|bass guitar|reduction/i;
const NAMED: [RegExp, string][] = [
  [/^\s*(soprano|sopran|s|treble|cantus|melody|tune)\b/i, 'S'],
  [/^\s*(alto|contralto|a)\b/i, 'A'],
  [/^\s*(tenor|t)\b/i, 'T'],
  [/^\s*(bass|basso|bassus|baritone|b)\b/i, 'B'],
];

interface Lane {
  low: boolean;
  /** Set when the part's name says which voice it is. */
  named?: string;
  notes: LineNote[];
}

const toLine = (n: XNote): LineNote => ({ start: n.start, dur: n.dur, midi: n.midi!, step: n.step, alter: n.alter, lyric: n.lyric });

/** The notes sounding one at a time, choosing the top (or bottom) note of each chord. */
function single(notes: XNote[], pick: 'top' | 'bottom'): LineNote[] {
  const byStart = new Map<number, XNote[]>();
  for (const n of notes) {
    if (n.midi === null) continue;
    const key = Math.round(n.start * 1e6);
    byStart.set(key, [...(byStart.get(key) ?? []), n]);
  }
  const out: LineNote[] = [];
  for (const k of [...byStart.keys()].sort((a, b) => a - b)) {
    const group = byStart.get(k)!;
    const chosen = group.reduce((a, b) => (pick === 'top' ? (b.midi! > a.midi! ? b : a) : b.midi! < a.midi! ? b : a));
    // The lyric usually sits on one note of the chord: keep it whichever note is chosen.
    const lyric = chosen.lyric ?? group.find((g) => g.lyric)?.lyric;
    const prev = out[out.length - 1];
    if (prev && prev.start + prev.dur > chosen.start + EPS) prev.dur = chosen.start - prev.start; // never overlap
    out.push({ ...toLine(chosen), lyric });
  }
  return out;
}

const hasChords = (notes: XNote[]) => {
  const seen = new Set<number>();
  for (const n of notes) {
    if (n.midi === null) continue;
    const k = Math.round(n.start * 1e6);
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
};

const mean = (notes: XNote[]) => {
  const p = notes.filter((n) => n.midi !== null);
  return p.length ? p.reduce((s, n) => s + n.midi!, 0) / p.length : 0;
};

/** One or two lanes per staff: two voices, or a voice in chords, give an upper and a lower line. */
function lanesOf(part: XPart): Lane[] {
  const named = NAMED.find(([re]) => re.test(part.name))?.[1];
  const lanes: Lane[] = [];
  for (let staff = 1; staff <= part.staves; staff++) {
    const notes = part.notes.filter((n) => n.staff === staff);
    if (!notes.some((n) => n.midi !== null)) continue;
    const clef = part.clefs[staff];
    const low = clef ? clef.sign === 'F' || (clef.sign === 'G' && clef.octave < 0) : mean(notes) < 57;
    const voices = [...new Set(notes.filter((n) => n.midi !== null).map((n) => n.voice))]
      .map((v) => notes.filter((n) => n.voice === v))
      .sort((a, b) => mean(b) - mean(a));
    if (voices.length >= 2) {
      lanes.push({ low, notes: single(voices[0], 'top') }, { low, notes: single(voices[1], 'bottom') });
    } else if (hasChords(voices[0])) {
      lanes.push({ low, notes: single(voices[0], 'top') }, { low, notes: single(voices[0], 'bottom') });
    } else {
      lanes.push({ low, named, notes: single(voices[0], 'top') });
    }
  }
  return lanes;
}

export interface Voices {
  lines: VoiceLine[];
  /** How the parts were found, for reports. */
  layout: string;
}

export function findVoices(score: XScore): Voices {
  const sung = score.parts.filter((p) => !INSTRUMENT.test(p.name));
  // A hymn written for piano (one part named "Piano") is still the choir's four parts.
  const parts = sung.length ? sung : score.parts;
  const lanes = parts.flatMap(lanesOf);

  // Four parts named for their voices: trust the names.
  const byName = new Map(lanes.filter((l) => l.named).map((l) => [l.named!, l]));
  if (byName.size >= 2 && lanes.every((l) => l.named)) {
    return { lines: ['S', 'A', 'T', 'B'].filter((p) => byName.has(p)).map((p) => ({ part: p, notes: byName.get(p)!.notes })), layout: 'named parts' };
  }

  const high = lanes.filter((l) => !l.low).slice(0, 2);
  const low = lanes.filter((l) => l.low).slice(0, 2);
  const lines: VoiceLine[] = [];
  if (high[0]) lines.push({ part: 'S', notes: high[0].notes });
  if (high[1]) lines.push({ part: 'A', notes: high[1].notes });
  if (low.length === 2) lines.push({ part: 'T', notes: low[0].notes }, { part: 'B', notes: low[1].notes });
  else if (low[0]) lines.push({ part: 'B', notes: low[0].notes });
  // A tune for men alone (e.g. TTBB with no treble staff): its top line leads.
  if (!high.length && lines.length) lines.sort((a, b) => 'TB'.indexOf(a.part) - 'TB'.indexOf(b.part));
  return { lines, layout: `${parts.length} part${parts.length === 1 ? '' : 's'}, ${lanes.length} line${lanes.length === 1 ? '' : 's'}` };
}
