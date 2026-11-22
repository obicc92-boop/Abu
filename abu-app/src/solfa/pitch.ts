/**
 * From sol-fa to pitch. Pure helpers for the audio engine and the key display.
 * Ported from doh() and partRef() in prototype/index.html.
 */
import { keyAfterPivot, mod12 } from './keys';
import { isLowPart } from './syllables';
import type { NoteEvent, ParsedSong } from './types';

/**
 * Highest a tune can sit on average (MIDI E♭5) and be written from the doh above middle C. On the 40 staff scores
 * that print their sol-fa too, every soprano part averages between F4 and B4 (65.4 to 70.8) from its own doh; the
 * two B♭ songs written from the lower doh would average G5 (79.1) from the upper one. Halfway.
 */
const TUNE_HIGHEST = 75;

/**
 * MIDI note for doh in a key (semitones above C): from middle C (60) up to B4 (71), where the owner's sheets print
 * the soprano's doh (owner's decision, 22 November 2026; measured on 40 staff scores that print their sol-fa too:
 * C to G and A♭ and A all so, the prototype had A♭ to B an octave lower). In A♭ to B a tune can be written from the
 * doh below as well (two of seven B♭ sheets): `tune`, how high the tune sits on average in semitones above doh
 * (tuneHeight), says which. One that would sit higher than a soprano sings from the upper doh is from the lower.
 */
export function dohMidi(key: number, tune?: number): number {
  const k = mod12(key);
  const doh = 60 + k;
  return k >= 8 && tune !== undefined && doh + tune > TUNE_HIGHEST ? doh - 12 : doh;
}

/** The part that carries the tune, for where doh sits: the soprano, else the first part that isn't tenor or bass. */
export function tunePart(parts: readonly string[]): string | undefined {
  return parts.find((p) => p === 'S') ?? parts.find((p) => /^S\d$/.test(p)) ?? parts.find((p) => !isLowPart(p));
}

/**
 * How high a song's tune sits: its notes' average in semitones above doh as written (`d` 0, `s` 7, `d'` 12), in the
 * tune's part up to the first key change. Undefined without such a part or notes.
 */
export function tuneHeight(song: ParsedSong): number | undefined {
  const part = tunePart(song.parts);
  if (!part) return undefined;
  const change = song.keyChanges[0];
  const until = change ? (change.bridges?.[part]?.beat ?? change.beat) : Infinity;
  const notes = (song.events[part] ?? []).filter((e) => e.start < until - 1e-6);
  return notes.length ? notes.reduce((sum, e) => sum + e.deg + 12 * e.oct, 0) / notes.length : undefined;
}

/**
 * The doh a tune is written from, given where it sounds (its notes' average MIDI pitch), for the converters (staff
 * sheets and MusicXML files): the doh above middle C, as 14 of the 16 sheets in A♭ to B write it, unless the tune
 * sits too high to be played back from there (dohMidi), when it's the one below. Either way, SolfaScores plays the
 * written tune back from the doh it was written from.
 */
export function dohForPitch(key: number, pitch: number): number {
  return dohMidi(key, pitch - dohMidi(key));
}

/** The doh a part reads from: tenor and bass use the doh an octave below. */
export function partDohMidi(part: string, doh: number): number {
  return doh - (isLowPart(part) ? 12 : 0);
}

/** MIDI note a part should sound for an event, given the doh in force and any transpose. */
export function noteMidi(part: string, ev: Pick<NoteEvent, 'deg' | 'oct'>, doh: number, transpose = 0): number {
  return partDohMidi(part, doh) + ev.deg + 12 * ev.oct + transpose;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface DohPoint {
  beat: number;
  /** MIDI note of doh from this beat on. */
  doh: number;
  /** Doh as semitones above C. */
  semitone: number;
}

/**
 * Where doh sits through the song, for one part or (without `part`) where
 * each key change starts. Starts from the song's key (or `fallbackKey`, the
 * song record's key, when the text has none). A pivot or bridge note says
 * exactly how far doh moves, since that note keeps its pitch; a part with its
 * own bridge note changes there. A named key alone puts the new doh as close
 * as possible to the old one, so voices stay in range.
 */
export function dohTimeline(song: ParsedSong, fallbackKey = 0, part?: string): DohPoint[] {
  let semitone = song.meta.key?.semitone ?? mod12(fallbackKey);
  let doh = dohMidi(semitone, tuneHeight(song));
  const out: DohPoint[] = [{ beat: 0, doh, semitone }];
  for (const kc of song.keyChanges) {
    const own = part ? kc.bridges?.[part] : undefined;
    let shift = own?.shift ?? kc.shift;
    // A named key wins over a shift that doesn't reach it (the reader has warned about it).
    if (!own && shift !== undefined && kc.key && mod12(semitone + shift) !== kc.key.semitone) shift = undefined;
    let next: number | null;
    if (shift !== undefined) {
      next = mod12(semitone + shift);
      doh += shift;
    } else {
      next = kc.key ? kc.key.semitone : kc.pivot ? keyAfterPivot(semitone, kc.pivot).semitone : null;
      if (next === null) continue;
      const up = mod12(next - semitone);
      doh += up <= 5 ? up : up - 12;
    }
    semitone = next;
    out.push({ beat: own?.beat ?? kc.beat, doh, semitone });
  }
  return out;
}

/** The doh in force at a beat. */
export function dohAt(timeline: DohPoint[], beat: number): number {
  let doh = timeline[0]?.doh ?? dohMidi(0);
  for (const p of timeline) {
    if (p.beat <= beat + 1e-6) doh = p.doh;
    else break;
  }
  return doh;
}
