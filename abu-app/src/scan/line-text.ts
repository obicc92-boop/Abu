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
