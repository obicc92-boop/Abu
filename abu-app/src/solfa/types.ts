import type { KeyInfo, Pivot } from './keys';

export interface Issue {
  message: string;
  /** 1-based line in the sol-fa text, when known. */
  line?: number;
  /** Part label, e.g. "T". */
  part?: string;
  /** 1-based bar number, counting a pickup bar as bar 1. */
  bar?: number;
}

export interface NoteEvent {
  /** Beats from the start of the song. */
  start: number;
  /** Length in beats, including any holds (`-`). */
  dur: number;
  /** Semitones above doh, 0–11. */
  deg: number;
  /** Octave offset as written (tenor as written, not as sung). */
  oct: number;
  /** The note as written, e.g. "t1". */
  text: string;
  /** 1-based bar number. */
  bar: number;
  /** Lyric syllable sung on this note, if any. */
  lyric?: string;
}

export interface Section {
  /** "" when the text has no [Section] heading. */
  name: string;
  /** Beat where the section starts. */
  start: number;
  /** Length in beats (taken from the section's first part). */
  beats: number;
  /** 1-based number of the section's first bar. */
  firstBar: number;
  /** Parts in the order they first appear in this section. */
  order: string[];
  /** For each part: bars, each a list of beats as written ("d", "-", "s.l", ""). */
  bars: Record<string, string[][]>;
  /** For each part: lyric syllables as split from its W lines. */
  words: Record<string, string[]>;
  /** For each part: lyric text keyed by the absolute beat it starts on. */
  lyrics: Record<string, Record<number, string>>;
}

export type MarkName = 'segno' | 'ds' | 'dc' | 'fine' | '1.' | '2.';

/** A repeat or jump mark. Shown in the MVP; playback doesn't follow it yet. */
export interface Mark {
  name: MarkName;
  beat: number;
}

/**
 * A key change after the start of the song: from a `key:` line (at a bar
 * line, for every part), or from bridge notes ("s=d") in the parts, each part
 * changing at its own bridge note.
 */
export interface KeyChange {
  /** Where the change starts: the bar line, or the first part's bridge note. */
  beat: number;
  /** Null only when a pivot is given and the key before it isn't known. */
  key: KeyInfo | null;
  pivot: Pivot | null;
  /**
   * How far doh moves, in semitones, when a pivot or bridge note says so: the
   * note keeps its pitch, so its octave marks fix the octave too. Without it
   * (a named key alone), doh moves the shortest way.
   */
  shift?: number;
  /** Parts with their own bridge note: where each changes key, and by how much. Other parts change at `beat`. */
  bridges?: Record<string, { beat: number; shift: number }>;
}

export interface Tempo {
  /** As written, e.g. "84" or "Adagio". */
  text: string;
  /** Beats per minute, or null for words Abụ can't turn into a speed ("Joyfully"). */
  bpm: number | null;
}

export interface SongMeta {
  title?: string;
  composer?: string;
  arranger?: string;
  lyricist?: string;
  /** Starting doh: from the text, else from the options, else null. */
  key: KeyInfo | null;
  /** e.g. "4/4". */
  time: string;
  /** Where `time` came from. "guess" means the app should ask the user to confirm. */
  timeSource: 'text' | 'option' | 'guess';
  tempo: Tempo | null;
}

export interface ParsedSong {
  meta: SongMeta;
  /** Beats (pulses) per bar: the time signature's top number. */
  beatsPerBar: number;
  sections: Section[];
  /** Every part label, in order of first appearance. */
  parts: string[];
  /** Note events per part, in time order. */
  events: Record<string, NoteEvent[]>;
  keyChanges: KeyChange[];
  marks: Mark[];
  /** Paragraphs from a [Verses] block, shown under the score. */
  extraVerses: string[];
  /** Song length in beats. */
  total: number;
  /** Number of bars. */
  bars: number;
  /** Problems that should block saving. */
  errors: Issue[];
  /** Things worth showing that don't block saving. */
  warnings: Issue[];
}

export interface ParseOptions {
  /** Time signature from the song record, used when the text has no `time:` line. */
  time?: string;
  /** Doh from the song record (semitones above C, or a name like "Eb"), used when the text has no `key:` line. */
  key?: number | string;
}
