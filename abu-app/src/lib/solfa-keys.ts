/**
 * What the sol-fa keypad's keys do to the text being edited (components/solfa-keypad.tsx): every symbol of the
 * notation a tap away, since a phone's keyboard keeps the octave mark out of easy reach (owner's request, 20
 * November 2026). Pure: the text and the cursor in, the text and the cursor out.
 */
import { SYLLABLE_PATTERN } from '@/solfa';

/** The cursor, or the text chosen: from `start` to `end`. */
export interface Selection {
  start: number;
  end: number;
}

export type Key =
  /** Writes text at the cursor, in place of any text chosen. */
  | { insert: string }
  /** Deletes the text chosen, or the character before the cursor (with the space the keypad put by a mark). */
  | 'erase'
  | 'left'
  | 'right';

/** Beat marks and bar lines are written with a space before them, as on a sheet ("d :r /m :f |"). */
const SPACED = new Set([':', '/', '|']);

/** What `key` does to `text` with the cursor at `sel`. */
export function applyKey(text: string, sel: Selection, key: Key): { text: string; sel: Selection } {
  const start = Math.max(0, Math.min(sel.start, sel.end, text.length));
  const end = Math.min(text.length, Math.max(sel.start, sel.end));
  if (key === 'left') {
    const at = start === end ? Math.max(0, start - 1) : start;
    return { text, sel: { start: at, end: at } };
  }
  if (key === 'right') {
    const at = start === end ? Math.min(text.length, end + 1) : end;
    return { text, sel: { start: at, end: at } };
  }
  if (key === 'erase') {
    if (start !== end) return { text: text.slice(0, start) + text.slice(end), sel: { start, end: start } };
    if (!start) return { text, sel: { start, end } };
    let from = start - 1;
    // A bar line goes with the spaces the keypad put round it, a beat mark with the one before it.
    if (text[from] === ' ' && text[from - 1] === '|') from--;
    if (SPACED.has(text[from]) && text[from - 1] === ' ') from--;
    return { text: text.slice(0, from) + text.slice(end), sel: { start: from, end: from } };
  }
  let insert = key.insert;
  // A beat mark or bar line gets a space before it unless there's one already, and a bar line one after.
  if (SPACED.has(insert)) {
    const prev = text[start - 1];
    if (start > 0 && prev !== ' ' && prev !== '\n') insert = ` ${insert}`;
    if (key.insert === '|') insert = `${insert} `;
  }
  const at = start + insert.length;
  return { text: text.slice(0, start) + insert + text.slice(end), sel: { start: at, end: at } };
}

/**
 * A low octave mark as a sheet writes it, small and below the line: `t1` shows as `t₁`, `s2` as `s₂` (owner's
 * request, 20 November 2026). Only on screen: the text keeps `t1`, the format's own way. One character for one,
 * so the cursor, the bar lines drawn over the rows and the words set under the notes stay where they are.
 */
const LOW_MARK = new RegExp(`(^|[^A-Za-z0-9'’])(${SYLLABLE_PATTERN})([12])(?![0-9])`, 'g');
const SMALL_LOW: Record<string, string> = { '1': '₁', '2': '₂' };

/** A row of notes as shown: low octave marks small and below (`t1` → `t₁`). */
export function lowMarksShown(row: string): string {
  return row.replace(LOW_MARK, (_m, before: string, syllable: string, mark: string) => before + syllable + SMALL_LOW[mark]);
}

/** A row of notes as typed in a field that shows `t₁`, back to the text's `t1`. */
export function lowMarksTyped(row: string): string {
  return row.replace(/₁/g, '1').replace(/₂/g, '2');
}

/** A part's line in a song's text ("S  d :t1 |"): the part's name, and its notes after it. */
const PART_LINE = /^(\s*[A-Za-z][A-Za-z0-9]{0,7}(?::\s*|\s+))(.*)$/;
/** Lines that start like a part's but aren't notes: words, and the heading's lines. */
const NOT_NOTES = /^\s*(w|words|title|composer|arranger|lyricist|key|time|tempo|doh)\b/i;

function inNoteLines(text: string, change: (row: string) => string): string {
  return text
    .split('\n')
    .map((line) => {
      if (NOT_NOTES.test(line)) return line;
      const m = line.match(PART_LINE);
      return m ? m[1] + change(m[2]) : line;
    })
    .join('\n');
}

/** A song's text as shown in the editor: the low octave marks in the parts' lines small and below. */
export const songLowMarksShown = (text: string) => inNoteLines(text, lowMarksShown);
/** A song's text as typed in the editor, back to `t1`. */
export const songLowMarksTyped = (text: string) => inNoteLines(text, lowMarksTyped);
