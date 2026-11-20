/**
 * What the sol-fa keypad's keys do to the text being edited (components/solfa-keypad.tsx): every symbol of the
 * notation a tap away, since a phone's keyboard keeps the octave mark out of easy reach (owner's request, 20
 * November 2026). Pure: the text and the cursor in, the text and the cursor out.
 */

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
