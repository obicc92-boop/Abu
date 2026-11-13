/**
 * A scanned line's text as rows to edit one by one: each part's row of notes
 * and the rows of words, in order, and back to text.
 */
import { partName } from '@/solfa';

export interface LineRow {
  /** S, A, T, B, Solo... or null for a row of words. */
  part: string | null;
  text: string;
}

const PART_ROW = /^(Solo|S|A|T|B|P\d+)\s+(.*)$/;
const WORDS_ROW = /^W\s*:?\s+(.*)$/;

export function splitLine(text: string): LineRow[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const p = l.match(PART_ROW);
      if (p) return { part: p[1], text: p[2] };
      const w = l.match(WORDS_ROW);
      return { part: null, text: w ? w[1] : l };
    });
}

export function joinLine(rows: LineRow[]): string {
  return rows.map((r) => (r.part ? `${r.part.padEnd(2)} ${r.text.trim()}` : `W  ${r.text.trim()}`)).join('\n');
}

/** A line's rows of words, each with the part's row it comes after (0 for the first part). */
export interface LineWords {
  after: number;
  text: string;
}

/** The rows of words in a line's text, and where they are. */
export function wordsOf(text: string): LineWords[] {
  let seen = 0;
  const out: LineWords[] = [];
  for (const r of splitLine(text)) {
    if (r.part) seen++;
    else if (r.text.trim()) out.push({ after: Math.max(0, seen - 1), text: r.text.trim() });
  }
  return out;
}

/**
 * The line with these rows of words in place of its own, each under the
 * part it was printed after; with none, the line as it is.
 */
export function withWords(text: string, words: LineWords[]): string {
  const kept = words.filter((w) => w.text.trim());
  if (!kept.length) return text;
  const parts = splitLine(text).filter((r) => r.part);
  const rows: LineRow[] = [];
  parts.forEach((r, i) => {
    rows.push(r);
    const last = i === parts.length - 1;
    for (const w of kept) if (w.after === i || (last && w.after > i)) rows.push({ part: null, text: w.text });
  });
  return joinLine(rows);
}

/**
 * The line without a column of part names printed before its first bar
 * ("S", "A", "T", "B"), which Abụ's own model reads as bare notes or nothing:
 * only when every row's first column is one bare letter or empty (no beat or
 * octave marks), and at least one is empty. Otherwise null. The caller keeps
 * it only if the line then passes the checker (an upbeat column already does).
 */
export function withoutNameColumn(text: string): string | null {
  const rows = splitLine(text);
  const notes = rows.filter((r) => r.part);
  if (notes.length < 2) return null;
  const firsts = notes.map((r) => (r.text.includes('|') ? r.text.slice(0, r.text.indexOf('|')).trim() : null));
  if (firsts.some((f) => f === null || !/^[a-z]?$/.test(f)) || !firsts.some((f) => f === '')) return null;
  return joinLine(rows.map((r) => (r.part ? { part: r.part, text: r.text.slice(r.text.indexOf('|') + 1).trim() } : r)));
}

/** The checker's messages that are about one part ("Alto, bar 2 has 5 beats…"), and the rest. */
export function problemsByPart(messages: string[], parts: string[]): { byPart: Record<string, string[]>; other: string[] } {
  const byPart: Record<string, string[]> = {};
  const other: string[] = [];
  for (const m of messages) {
    const part = parts.find((p) => m.startsWith(`${partName(p)},`) || m.startsWith(`${partName(p)} `));
    if (part) (byPart[part] ??= []).push(m.replace(`${partName(part)}, `, '').replace(/^./, (c) => c.toUpperCase()));
    else other.push(m);
  }
  return { byPart, other };
}

/** A title printed in capitals ("OLD HUNDREDTH") as a title ("Old Hundredth"). */
export function tidyTitle(title: string): string {
  if (!/[A-Z]/.test(title) || title !== title.toUpperCase()) return title;
  const small = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'to', 'for', 'is', 'my', 'at', 'by']);
  return title
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
