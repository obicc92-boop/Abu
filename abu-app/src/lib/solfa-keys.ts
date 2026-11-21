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
  /**
   * Writes text at the cursor, in place of any text chosen. A musical marking in braces (`{p}`, `{Andante}`) goes
   * before the note the cursor is in, never splitting it.
   */
  | { insert: string }
  /**
   * Deletes the text chosen, or the character before the cursor (with the space the keypad put by a mark), or a
   * marking in braces all at once.
   */
  | 'erase'
  /**
   * A slur (notes sung to one syllable, as a sheet underlines them: `(m.d)`): "(" before the note at the cursor,
   * or ")" after it inside a slur left open on its line; with text chosen, brackets round its notes.
   */
  | 'slur'
  | 'left'
  | 'right';

/** Beat marks and bar lines are written with a space before them, as on a sheet ("d :r /m :f |"). */
const SPACED = new Set([':', '/', '|']);
/** A musical marking from the keypad's Marks (`{p}`, `{cresc}`, `{M. 72}`): src/solfa/expressions.ts reads them. */
const MARKING = /^\{[^{}\n]*\}$/;
/** What a note is written with: its syllable, its octave mark, and a bridge note's = (`s=d`). */
const IN_NOTE = /[A-Za-z0-9'’′ʼ″¹²₁₂=]/;

/**
 * Where a marking tapped with the cursor at `at` goes, since it starts on the note it's written before: at the
 * cursor, unless that's inside a note (`r|e`, `d|'`, `s=|d`) or another marking (`{m|f}`), when it goes just
 * before that, so neither is split.
 */
function markingPlace(text: string, at: number): number {
  const line = text.lastIndexOf('\n', at - 1) + 1;
  const before = text.slice(line, at);
  const open = before.lastIndexOf('{');
  if (open > before.lastIndexOf('}')) return line + open;
  if (!IN_NOTE.test(text[at] ?? '')) return at;
  let from = at;
  while (from > line && IN_NOTE.test(text[from - 1])) from--;
  return from;
}

/** Spaces, beat marks, and half and quarter beats: what lies between notes. */
const BETWEEN = /[\s:/|¦.,]/;

/** Whether the cursor is inside a slur left open on its line: a "(" before it, and no ")" since. */
function inSlur(text: string, at: number): boolean {
  const before = text.slice(text.lastIndexOf('\n', at - 1) + 1, at).replace(/\{[^}]*\}/g, '');
  return before.lastIndexOf('(') > before.lastIndexOf(')');
}

/** The start of the note (or hold) the cursor is in or just after, or the cursor if it's neither. */
function noteStart(text: string, at: number): number {
  while (at > 0 && (IN_NOTE.test(text[at - 1]) || text[at - 1] === '-')) at--;
  return at;
}

/** The end of the note the cursor is in (`d|'` → after the mark), or the cursor if it isn't in one. */
function noteEnd(text: string, at: number): number {
  if (!IN_NOTE.test(text[at - 1] ?? '')) return at;
  while (at < text.length && IN_NOTE.test(text[at])) at++;
  return at;
}

/**
 * Where a slur's ")" goes: straight after the whole note at the cursor or before it, back past beat marks, spaces
 * and markings, since a ")" after a beat mark would be read as a beat of its own.
 */
function slurEnd(text: string, at: number): number {
  at = noteEnd(text, at);
  const line = text.lastIndexOf('\n', at - 1) + 1;
  while (at > line) {
    const open = text[at - 1] === '}' ? text.lastIndexOf('{', at - 1) : -1;
    if (BETWEEN.test(text[at - 1])) at--;
    else if (open >= line) at = open;
    else break;
  }
  return at;
}

/** What the slur key does: see `Key`. The cursor stays after the notes it was after. */
function withSlur(text: string, start: number, end: number): { text: string; sel: Selection } {
  const cursor = (at: number) => ({ start: at, end: at });
  // Text chosen: brackets round its notes, whole, leaving out spaces and beat marks at its ends.
  let from = start;
  let to = end;
  while (from < to && BETWEEN.test(text[from])) from++;
  while (to > from && BETWEEN.test(text[to - 1])) to--;
  if (from < to) {
    from = noteStart(text, from);
    to = noteEnd(text, to);
    return { text: `${text.slice(0, from)}(${text.slice(from, to)})${text.slice(to)}`, sel: cursor(to + 2) };
  }
  if (inSlur(text, start)) {
    const at = slurEnd(text, start);
    // A slur opened and closed with no note between: taken back, as a second tap of the key.
    if (text[at - 1] === '(') return { text: text.slice(0, at - 1) + text.slice(at), sel: cursor(start - 1) };
    return { text: `${text.slice(0, at)})${text.slice(at)}`, sel: cursor(Math.max(at, start) + 1) };
  }
  // Before the note the cursor is in or just after, never inside it: "(" in front of a note is how it reads.
  const at = noteStart(text, start);
  return { text: `${text.slice(0, at)}(${text.slice(at)}`, sel: cursor(start + 1) };
}

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
    // A marking goes all at once, as it came: no half of one is left to puzzle the reader.
    const open = text[from] === '}' ? text.lastIndexOf('{', from) : -1;
    if (open >= 0 && !/[}\n]/.test(text.slice(open + 1, from))) from = open;
    else {
      // A bar line goes with the spaces the keypad put round it, a beat mark with the one before it.
      if (text[from] === ' ' && text[from - 1] === '|') from--;
      if (SPACED.has(text[from]) && text[from - 1] === ' ') from--;
    }
    return { text: text.slice(0, from) + text.slice(end), sel: { start: from, end: from } };
  }
  if (key === 'slur') return withSlur(text, start, end);
  if (start === end && MARKING.test(key.insert)) {
    const at = markingPlace(text, start);
    const after = at + key.insert.length;
    return { text: text.slice(0, at) + key.insert + text.slice(at), sel: { start: after, end: after } };
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

/** A line that isn't music: blank, a section's name ("[Chorus]") or a heading line ("key: F", "time: 4/4"). */
const NOT_MUSIC = /^\s*(?:$|\[|(?:title|composer|arranger|lyricist|key|time|tempo)\s*:|doh\s+is\b)/i;
const KEY_LINE = /^\s*(?:key\s*:|doh\s+is\b)/i;

/**
 * Where a key change written at the cursor goes (owner's request, 20 November 2026): on a line of its own before
 * the lines of music the cursor is in (the block of parts' lines, up to a blank line, a section's name or a
 * heading line), so it starts at their first bar, for every part. On a blank line, before the lines below it.
 * `at` is where; `existing`, a key line already just above them, which is changed instead.
 */
export function keyChangePlace(text: string, cursor: number): { at: number; existing?: { from: number; length: number } } {
  const lineStart = (at: number) => text.lastIndexOf('\n', at - 1) + 1;
  const lineAt = (from: number) => text.slice(from, text.indexOf('\n', from) < 0 ? text.length : text.indexOf('\n', from));
  let at = lineStart(Math.max(0, Math.min(cursor, text.length)));
  if (!lineAt(at).trim()) {
    const next = text.indexOf('\n', at);
    return { at: next >= 0 ? next + 1 : at };
  }
  // Up to the first of the block's lines of music.
  while (at > 0 && !NOT_MUSIC.test(lineAt(lineStart(at - 1)))) at = lineStart(at - 1);
  const above = at > 0 ? lineStart(at - 1) : -1;
  return above >= 0 && KEY_LINE.test(lineAt(above)) ? { at, existing: { from: above, length: lineAt(above).length } } : { at };
}

/**
 * A key change written into a song: \`Doh is F\`, as sheets print it, where `keyChangePlace` says (a key line
 * already there is changed). The cursor stays where it was in the music.
 */
export function withKeyChange(text: string, sel: Selection, name: string): { text: string; sel: Selection } {
  const line = `Doh is ${name}`;
  const cursor = Math.max(0, Math.min(sel.start, text.length));
  const { at, existing } = keyChangePlace(text, cursor);
  if (existing) {
    const moved = line.length - existing.length;
    return { text: text.slice(0, existing.from) + line + text.slice(existing.from + existing.length), sel: { start: sel.start + moved, end: sel.end + moved } };
  }
  const insert = `${line}\n`;
  const moved = at <= cursor ? insert.length : 0;
  return { text: text.slice(0, at) + insert + text.slice(at), sel: { start: sel.start + moved, end: sel.end + moved } };
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
