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

/** A row of notes tidied: single spaces, none around "." and ",". */
export function tidyNotes(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s*([.,=])\s*/g, '$1').trim();
}

/**
 * The rows as shown for checking: each bar of every part starts in the same
 * column, and so does each beat where the parts agree on how many a bar has,
 * as on the printed sheet. Rows of words are shown as they are. Only spaces
 * are added, so a row shown this way reads the same as before.
 */
export function alignedRows(rows: LineRow[]): string[] {
  const split = rows.map((r) => {
    if (!r.part) return null;
    const pieces = tidyNotes(r.text).split('|');
    const closed = pieces.length > 1 && !pieces[pieces.length - 1].trim();
    const bars = (closed ? pieces.slice(0, -1) : pieces).map((bar) => {
      const parts = bar.split(/([:/])/);
      return { beats: parts.filter((_, k) => k % 2 === 0).map((b) => b.trim()), seps: parts.filter((_, k) => k % 2 === 1) };
    });
    return { bars, closed };
  });
  const most = Math.max(0, ...split.map((s) => s?.bars.length ?? 0));
  const shown = split.map((s) => (s ? s.bars.map(() => '') : null));
  for (let j = 0; j < most; j++) {
    const here = split.flatMap((s, i) => (s && j < s.bars.length ? [{ i, bar: s.bars[j] }] : []));
    const counts = new Set(here.map((h) => h.bar.beats.length));
    const write = (bar: { beats: string[]; seps: string[] }, widths: number[]) =>
      bar.beats.map((b, k) => (k === 0 ? '' : ` ${bar.seps[k - 1]}`) + b.padEnd(widths[k] ?? 0)).join('');
    let texts: { i: number; text: string }[];
    if (counts.size === 1) {
      const widths = here[0].bar.beats.map((_, k) => Math.max(...here.map((h) => h.bar.beats[k].length)));
      texts = here.map((h) => ({ i: h.i, text: write(h.bar, widths) }));
    } else texts = here.map((h) => ({ i: h.i, text: write(h.bar, []) }));
    const width = Math.max(...texts.map((t) => t.text.length));
    for (const t of texts) (shown[t.i] as string[])[j] = t.text.padEnd(width);
  }
  return rows.map((r, i) => {
    const s = split[i];
    const bars = shown[i];
    if (!s || !bars) return r.text;
    return `${bars.join(' | ')}${s.closed ? ' |' : ''}`.trimEnd();
  });
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

/** A row's bars (the text between bar lines), and whether it ends with a bar line. */
function barsOfRow(text: string): { bars: string[]; closed: boolean } {
  const pieces = text.split('|');
  const closed = pieces.length > 1 && !pieces[pieces.length - 1].trim();
  return { bars: closed ? pieces.slice(0, -1) : pieces, closed };
}
const beatCount = (bar: string) => bar.split(/[:/]/).length;
/** A space between two notes or holds inside a beat (not one around "." or ","). */
const GAP = /(?<=[^\s.,:/|])\s+(?=[^\s.,:/|])/g;

/**
 * The line with beat marks a typist left out: "d : m : r -.s1" for
 * "d : m : r :-.s1". In a bar short of beats, the spaces between its notes
 * become ":" when that gives the bar exactly the beats it needs (the time's,
 * or for a line's first and last bar, as many as the other parts have there).
 * Null if no bar changes. The caller keeps it only if the line then passes.
 */
export function withSpacedBeats(text: string, beatsPerBar: number): string | null {
  const rows = splitLine(text);
  const noteBars = rows.filter((r) => r.part).map((r) => barsOfRow(r.text).bars);
  let changed = false;
  const fixed = rows.map((r) => {
    if (!r.part) return r;
    const { bars, closed } = barsOfRow(r.text);
    const out = bars.map((bar, j) => {
      const gaps = bar.match(GAP)?.length ?? 0;
      if (!gaps) return bar;
      const have = beatCount(bar);
      const edge = j === 0 || j === bars.length - 1;
      const want = edge ? Math.max(...noteBars.map((b) => (b[j] === undefined ? 0 : beatCount(b[j])))) : beatsPerBar;
      if (have >= want || have + gaps !== want) return bar;
      changed = true;
      return bar.replace(GAP, ' :');
    });
    return { part: r.part, text: `${out.join('|')}${closed ? '|' : ''}` };
  });
  return changed ? joinLine(fixed) : null;
}

/**
 * The line with an empty bar for parts resting through its upbeat (or its
 * short last bar): a sheet prints nothing there, so such a part reads one bar
 * short. Only where that part's bars match the others' after the upbeat (or
 * before the last bar), and that bar is shorter than the rest. Null if no
 * part changes.
 */
export function withRestingEdges(text: string): string | null {
  const rows = splitLine(text);
  const notes = rows.filter((r) => r.part).map((r) => barsOfRow(r.text));
  const most = Math.max(0, ...notes.map((n) => n.bars.length));
  const full = notes.find((n) => n.bars.length === most);
  if (!full || notes.every((n) => n.bars.length === most)) return null;
  const ref = full.bars.map(beatCount);
  const longest = Math.max(...ref);
  const rest = (beats: number) => (beats <= 1 ? ' x ' : Array.from({ length: beats }, () => ' ').join(':'));
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  let changed = false;
  const fixed = rows.map((r) => {
    if (!r.part) return r;
    const { bars, closed } = barsOfRow(r.text);
    if (bars.length !== most - 1) return r;
    const counts = bars.map(beatCount);
    if (ref[0] < longest && same(counts, ref.slice(1))) {
      changed = true;
      return { part: r.part, text: `${rest(ref[0]).trim()} | ${bars.join('|').trim()}${closed ? ' |' : ''}` };
    }
    if (ref[most - 1] < longest && same(counts, ref.slice(0, -1))) {
      changed = true;
      return { part: r.part, text: `${bars.join('|').trim()} | ${rest(ref[most - 1]).trim()} |` };
    }
    return r;
  });
  return changed ? joinLine(fixed) : null;
}

/**
 * The free repairs for a line that fails the checker, tried in turn and
 * together: a column of part names read as notes, missing beat marks, parts
 * resting through an upbeat. The first that makes the line pass, or null.
 */
export function freeRepair(text: string, passes: (t: string) => boolean, beatsPerBar: number): string | null {
  const steps: ((t: string) => string | null)[] = [withoutNameColumn, (t) => withSpacedBeats(t, beatsPerBar), withRestingEdges];
  // Each repair alone, then each in turn on top of the ones before (in this order).
  let layered = text;
  for (const step of steps) {
    const alone = step(text);
    if (alone && passes(alone)) return alone;
    const more = step(layered);
    if (more) {
      layered = more;
      if (passes(layered)) return layered;
    }
  }
  return null;
}

/**
 * The first of the readings (the app's own first, then any others it made)
 * that passes, as it is or with a free repair; otherwise the first as it is.
 */
export function bestFree(readings: string[], passes: (t: string) => boolean, beatsPerBar: number): string {
  for (const r of readings) if (passes(r)) return r;
  for (const r of readings) {
    const fixed = freeRepair(r, passes, beatsPerBar);
    if (fixed) return fixed;
  }
  return readings[0];
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
