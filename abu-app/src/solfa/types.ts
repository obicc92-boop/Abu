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
  /**
   * Under a slur from the note before (written in brackets: `(m'.d')`, as sheets underline them): sung to the
   * same syllable, so it takes none of its own.
   */
  slurred?: boolean;
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

/**
 * A musical marking (src/solfa/expressions.ts): a dynamic (pp…ff), an accent (sfz), a gradual change (cresc.,
 * dim., or their hairpins < and >), tempo (Andante, M. 70, rit., accel., a tempo), or a direction with no set
 * effect on the sound (Maestoso, dolce, legato, With feeling).
 */
export type ExpressionKind = 'dynamic' | 'accent' | 'cresc' | 'dim' | 'tempo' | 'rit' | 'accel' | 'atempo' | 'direction';

export interface Expression {
  kind: ExpressionKind;
  /** As SolfaScores shows it: "pp", "sfz", "cresc.", "dim.", "<" and ">" (hairpins), "Andante M. 70", "rit.", "accel.", "a tempo", "Maestoso". */
  text: string;
  /** The part it's written in, or null for every part (a mark on a line of its own; tempo is always for every part). */
  part: string | null;
  /** The beat it starts on, from the start of the song. */
  beat: number;
  /** A dynamic's loudness, 0–1 (ppp 0.3 … ff 1); an accent's, for its own note. */
  level?: number;
  /** A tempo's beats a minute (Andante 76, M. 70). */
  bpm?: number;
}

/**
 * A repeat or jump mark (src/solfa/repeats.ts, docs/solfa-format.md):
 * - signs, at the beat of the first note they mark: the segno 𝄋 `segno`, the coda sign 𝄌 `coda`, a start repeat
 *   `|:`, and the first and second endings `1.` and `2.`;
 * - jumps and ends, at the beat their bar ends: D.S. (`ds`, `ds-fine` al Fine, `ds-coda` al Coda), D.C. (`dc`,
 *   `dc-fine`, `dc-coda`), `fine`, To Coda `tocoda`, and an end repeat `:|`.
 */
export type MarkName = 'segno' | 'coda' | '|:' | '1.' | '2.' | 'ds' | 'ds-fine' | 'ds-coda' | 'dc' | 'dc-fine' | 'dc-coda' | 'fine' | 'tocoda' | ':|';

/** A repeat or jump mark, at its beat. The player follows them (`playOrder` in src/solfa/repeats.ts). */
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
  /** Beats per minute, or null for words SolfaScores can't turn into a speed ("Joyfully"). */
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
  /** Musical markings (dynamics, tempo), in time order. */
  expressions: Expression[];
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
