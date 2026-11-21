/**
 * A song's text as the song editor shows it in rows (owner's request, 20 November 2026): each line of music as
 * its parts' rows of notes and rows of words (shown by colour, as on Check the reading), with the lines between
 * them (a section's name, a key change, the heading) as what they are. The text stays the song: every change
 * here is to its lines, and lines not changed are kept exactly as they were.
 */
import type { LineRow } from '@/scan/line-text';
import { normalizePart, parseKey } from '@/solfa';

export type Piece =
  /** A line of music: its rows, from line `from` up to (not including) line `to` of the text. */
  | { kind: 'music'; from: number; to: number; rows: LineRow[]; labels: string[] }
  | { kind: 'section'; line: number; name: string }
  /** A key change ("Doh is F", "key: F"), or the song's key at its top. */
  | { kind: 'key'; line: number; name: string }
  | { kind: 'blank'; line: number }
  /** Anything else (the heading's lines, repeat marks, verses' text): shown as it is. */
  | { kind: 'other'; line: number; text: string };

const SECTION = /^\[(.+)\]$/;
const BARE_SECTION = /^(verse|chorus|refrain|coda|bridge|intro|outro|interlude)(\s*\d+)?:?$/i;
const KEY_LINE = /^(?:key\s*(?::\s*|\s+)(.+)|(doh\s+is\s+.+))$/i;
const HEADING = /^(title|composer|arranger|lyricist|time|tempo)\s*(?::|\s)/i;
const WORDS = /^(?:w|words)(?:\s*:\s*|\s+|$)(.*)$/i;
const LABELLED = /^([A-Za-z][A-Za-z0-9]{0,7})(?:(?::\s*|\s+)(.*))?$/;
/** Parts' names SolfaScores knows, even on a row with nothing in it yet. */
const KNOWN_PART = /^(?:S|A|T|B|Solo|Solo[SATB]|S\d|A\d|T\d|B\d|P\d+)$/;

/** What a line of the text is, on its own. */
function lineKind(line: string): { row: LineRow & { label: string } } | Exclude<Piece, { kind: 'music' }> | null {
  const t = line.trim();
  if (!t) return null;
  const section = t.match(SECTION) ?? (BARE_SECTION.test(t) ? [t, t.replace(/:$/, '')] : null);
  if (section) return { kind: 'section', line: 0, name: section[1].trim() };
  const key = t.match(KEY_LINE);
  if (key) {
    const parsed = parseKey((key[1] ?? key[2]).replace(/\s+[a-z]{1,2}\s*\/\s*[a-z]{1,2}.*$/i, '').trim());
    return parsed ? { kind: 'key', line: 0, name: parsed.name } : { kind: 'other', line: 0, text: t };
  }
  if (HEADING.test(t) || t.startsWith('{')) return { kind: 'other', line: 0, text: t };
  const words = t.match(WORDS);
  if (words) return { row: { part: null, text: words[1].trim(), label: 'W' } };
  const m = t.match(LABELLED);
  if (m) {
    const body = (m[2] ?? '').trim();
    const part = normalizePart(m[1]);
    // A part's row: a name SolfaScores knows, or anything followed by notes.
    if (KNOWN_PART.test(part) || /[:|]/.test(body)) return { row: { part, text: body, label: m[1] } };
  }
  return { kind: 'other', line: 0, text: t };
}

/** The song's text as pieces, in order. Lines of a [Verses] section are its text, not music. */
export function songPieces(text: string): Piece[] {
  const lines = text.split('\n');
  const pieces: Piece[] = [];
  let music: Extract<Piece, { kind: 'music' }> | null = null;
  let verses = false;
  lines.forEach((line, i) => {
    const kind = verses && !SECTION.test(line.trim()) ? (line.trim() ? { kind: 'other' as const, line: 0, text: line.trim() } : null) : lineKind(line);
    if (kind && 'row' in kind) {
      const { label, ...row } = kind.row;
      // A part's row again starts the next line of music (the lines of music weren't kept apart).
      const again = row.part && music?.rows.some((r) => r.part && normalizePart(r.part) === row.part);
      if (!music || again) {
        music = { kind: 'music', from: i, to: i + 1, rows: [], labels: [] };
        pieces.push(music);
      }
      music.rows.push(row);
      music.labels.push(label);
      music.to = i + 1;
      return;
    }
    music = null;
    if (!kind) return pieces.push({ kind: 'blank', line: i });
    if (kind.kind === 'section') verses = /^verses$/i.test(kind.name);
    pieces.push({ ...kind, line: i });
  });
  return pieces;
}

const rowLine = (label: string, body: string) => (body ? `${label.padEnd(2)} ${body}` : label);

/** The text with one row of a line of music changed to `body` (its part's name, or W, kept). */
export function withRow(text: string, piece: number, row: number, body: string): string {
  const p = songPieces(text)[piece];
  if (p?.kind !== 'music' || row >= p.rows.length) return text;
  const lines = text.split('\n');
  lines[p.from + row] = rowLine(p.labels[row], body.trim() ? body.replace(/\s+$/, '') : '');
  return lines.join('\n');
}

/** The text with one row of a line of music given to another part ("S" to "SoloB"); its notes are kept. */
export function withRowPart(text: string, piece: number, row: number, part: string): string {
  const p = songPieces(text)[piece];
  if (p?.kind !== 'music' || row >= p.rows.length || !p.rows[row].part) return text;
  const lines = text.split('\n');
  lines[p.from + row] = rowLine(part, p.rows[row].text.trim());
  return lines.join('\n');
}

/** The parts of a line of music, in the order sheets print them. */
const ORDER = ['Solo', 'S', 'A', 'T', 'B'];

/** The text with a new, empty line of music at the end: a row for each part, and words under the first. */
export function withNewLine(text: string, parts: string[]): string {
  const ordered = ORDER.filter((p) => parts.includes(p));
  const rows = ordered.flatMap((p, k) => (k === 0 ? [p, 'W'] : [p]));
  const body = text.replace(/\s+$/, '');
  return `${body ? `${body}\n\n` : ''}${rows.join('\n')}`;
}

/** The piece that's the song's line of music number `line` (counting from 0), or -1. */
export function musicPiece(pieces: Piece[], line: number): number {
  let n = -1;
  return pieces.findIndex((p) => p.kind === 'music' && ++n === line);
}

/** The text without a line of music (and a blank line beside it). */
export function withoutLine(text: string, piece: number): string {
  const p = songPieces(text)[piece];
  if (p?.kind !== 'music') return text;
  const lines = text.split('\n');
  let { from, to } = p;
  if (to < lines.length && !lines[to].trim()) to++;
  else if (from > 0 && !lines[from - 1].trim()) from--;
  lines.splice(from, to - from);
  return lines.join('\n');
}

/** The text with an empty row of words under a part's row of notes. */
export function withWordsRow(text: string, piece: number, row: number): string {
  const p = songPieces(text)[piece];
  if (p?.kind !== 'music') return text;
  const lines = text.split('\n');
  lines.splice(p.from + row + 1, 0, 'W');
  return lines.join('\n');
}

/** The text without one of its lines (a key change taken off). */
export function withoutTextLine(text: string, line: number): string {
  const lines = text.split('\n');
  lines.splice(line, 1);
  return lines.join('\n');
}

/**
 * The text with a key change before a line of music, as sheets print it ("Doh is F"): one just above it is
 * changed instead.
 */
export function withKeyBefore(text: string, piece: number, name: string): string {
  const pieces = songPieces(text);
  const p = pieces[piece];
  if (p?.kind !== 'music') return text;
  const lines = text.split('\n');
  const above = pieces[piece - 1];
  if (above?.kind === 'key') lines[above.line] = `Doh is ${name}`;
  else lines.splice(p.from, 0, `Doh is ${name}`);
  return lines.join('\n');
}

/** How many bars the lines of music before each one have, for numbering its bars on from them. */
export function barsBefore(pieces: Piece[]): number[] {
  let n = 0;
  return pieces.map((p) => {
    const before = n;
    if (p.kind === 'music') n += Math.max(0, ...p.rows.filter((r) => r.part).map((r) => r.text.split('|').filter((b) => b.trim()).length));
    return before;
  });
}

/** A line of music's own text (its rows, with their parts' names), to check it on its own. */
export function musicText(text: string, p: Extract<Piece, { kind: 'music' }>): string {
  return text.split('\n').slice(p.from, p.to).join('\n');
}
