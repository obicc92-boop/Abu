/**
 * From sol-fa to pitch. Pure helpers for the audio engine and the key display.
 * Ported from doh() and partRef() in prototype/index.html.
 */
import { keyAfterPivot, mod12 } from './keys';
import { isLowPart } from './syllables';
import type { NoteEvent, ParsedSong } from './types';

/** MIDI note for doh in a key (semitones above C): A♭3 (56) up to G4 (67), as in the prototype. */
export function dohMidi(key: number): number {
  const k = mod12(key);
  return 60 + k - (k >= 8 ? 12 : 0);
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
 * Where doh sits through the song. Starts from the song's key (or `fallbackKey`,
 * the song record's key, when the text has none). At each key change the new
 * doh is placed as close as possible to the old one, so voices stay in range.
 */
export function dohTimeline(song: ParsedSong, fallbackKey = 0): DohPoint[] {
  let semitone = song.meta.key?.semitone ?? mod12(fallbackKey);
  let doh = dohMidi(semitone);
  const out: DohPoint[] = [{ beat: 0, doh, semitone }];
  for (const kc of song.keyChanges) {
    const next = kc.key ? kc.key.semitone : kc.pivot ? keyAfterPivot(semitone, kc.pivot).semitone : null;
    if (next === null) continue;
    const up = mod12(next - semitone);
    doh += up <= 5 ? up : up - 12;
    semitone = next;
    out.push({ beat: kc.beat, doh, semitone });
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
