/**
 * A scanned line's text as rows to edit one by one: each part's row of notes
 * and the rows of words, in order, and back to text.
 */
import { parseNote, partName, splitWords, SYLLABLE_PATTERN, SYLLABLE_SEMITONES } from '@/solfa';

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

/**
 * Where a row's bar lines ("|") are, in characters from its start. Check the
 * reading draws each one as a line through the parts' rows, as on the sheet.
 */
export function barColumns(text: string): number[] {
  const out: number[] = [];
  for (let k = 0; k < text.length; k++) if (text[k] === '|') out.push(k);
  return out;
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
 * The words to keep: `theirs` (Opus's) under each part it gave words for, and `mine` (the app's) under the
 * others. Opus reads handwritten words far better than Cloudflare's reader.
 */
export function wordsPreferring(theirs: LineWords[], mine: LineWords[]): LineWords[] {
  return [...theirs, ...mine.filter((w) => w.text.trim() && !theirs.some((t) => t.after === w.after))].sort((a, b) => a.after - b.after);
}

/** The character columns where a row's notes are written, left to right (not its holds or rests). */
export function noteColumns(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/[^\s:|/.,]+/g)) {
    const t = m[0];
    if (t.includes('=') || parseNote(t)) out.push(m.index ?? 0);
  }
  return out;
}

/**
 * A row of words set under its part's notes, as on a sheet: each syllable (`splitWords`) at the column of
 * the note it's sung on, in order, as the checker pairs them; a lone "-" or "_" carries the syllable before
 * over a note. A syllable that would run into the one before is moved along, and syllables past the last
 * note follow on. `width` is how many note columns one character of the words takes.
 */
export function wordsUnderNotes(words: string, notes: string, width = 1): { text: string; at: number }[] {
  const columns = noteColumns(notes);
  const out: { text: string; at: number }[] = [];
  let free = 0;
  splitWords(words).forEach((w, k) => {
    if (w === '-' || w === '_') return;
    const at = Math.max(k < columns.length ? columns[k] : free, free);
    out.push({ text: w, at });
    free = at + Math.ceil(w.length * width) + 1;
  });
  return out;
}

/**
 * Whether a row read as words is only sol-fa's names ("fa - mi - re - doh"): a reader asked for the words
 * sometimes names the notes instead. Not words to keep.
 */
export function namesNotWords(words: string): boolean {
  const pieces = words
    .toLowerCase()
    .split(/[\s\-–,.;:!?'"()]+/)
    .filter(Boolean);
  return pieces.length >= 3 && pieces.every((p) => /^(d[oa]+h?|re|ray|mi|me|fa+h?|so+h?|sol|la+h?|ti|te|si)$/.test(p));
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
 * ("S", "A", "T", "B"), which SolfaScores' own model reads as bare notes or nothing:
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
 * Each part's too-long bars cut into whole bars where `cut` splits them into
 * pieces of exactly the bar's beats; a row's last piece may be shorter (a
 * short last bar), and its first too (an upbeat) when `upbeat`. Null if no
 * bar changes.
 */
function withBarsCut(text: string, beatsPerBar: number, cut: (bar: string, j: number) => string[], upbeat: boolean): string | null {
  let changed = false;
  const fixed = splitLine(text).map((r) => {
    if (!r.part) return r;
    const { bars, closed } = barsOfRow(r.text);
    const out = bars.flatMap((bar, j) => {
      if (beatCount(bar) <= beatsPerBar) return [bar];
      const pieces = cut(bar, j);
      if (pieces.length < 2) return [bar];
      const first = upbeat && j === 0;
      const last = j === bars.length - 1;
      const fits = pieces.every((p, k) => {
        const n = beatCount(p);
        return n === beatsPerBar || (n < beatsPerBar && ((first && k === 0) || (last && k === pieces.length - 1)));
      });
      if (!fits) return [bar];
      changed = true;
      return pieces;
    });
    return { part: r.part, text: `${out.map((b) => b.trim()).join(' | ')}${closed ? ' |' : ''}` };
  });
  return changed ? joinLine(fixed) : null;
}

/**
 * The line with half-bar marks read as bar lines, for a sheet whose long and
 * short bar lines came out alike: a bar far too long whose "/" marks cut it
 * into whole bars ("/ : / : m.m / f.,s :-.l" in 2/4). One before the row's
 * first beat is its opening bar line, and goes. Null if no bar changes. (A
 * sheet in 4/4 read this way as 2/4 plays the same, with its bars halved.)
 */
export function withHalfBarsAsBars(text: string, beatsPerBar: number): string | null {
  return withBarsCut(
    text,
    beatsPerBar,
    (bar, j) => {
      const pieces = bar.split('/');
      return j === 0 && !pieces[0].trim() ? pieces.slice(1) : pieces;
    },
    true,
  );
}

/**
 * The line with bar lines that are half-bar marks: two short bars in a row
 * that make one whole bar in every part alike ("s :d | d :d" in 4/4) become
 * one, the bar line a "/". On a boxed sheet written by hand, a "|" drawn
 * down through every part of a small box can be taken for the box's border
 * (boxes.ts). Null if no bars join.
 */
export function withShortBarsJoined(text: string, beatsPerBar: number): string | null {
  const rows = splitLine(text);
  const parts = rows.filter((r) => r.part).map((r) => barsOfRow(r.text));
  if (!parts.length) return null;
  const count = Math.min(...parts.map((p) => p.bars.length));
  const join = new Set<number>();
  for (let j = 0; j + 1 < count; j++) {
    const whole = parts.every((p) => {
      const a = beatCount(p.bars[j]);
      const b = beatCount(p.bars[j + 1]);
      return a < beatsPerBar && b < beatsPerBar && a + b === beatsPerBar;
    });
    if (whole) {
      join.add(j);
      j++;
    }
  }
  if (!join.size) return null;
  const fixed = rows.map((r) => {
    if (!r.part) return r;
    const { bars, closed } = barsOfRow(r.text);
    const out: string[] = [];
    bars.forEach((bar, j) => {
      if (join.has(j - 1)) out[out.length - 1] = `${out[out.length - 1].trim()} / ${bar.trim()}`;
      else out.push(bar.trim());
    });
    return { part: r.part, text: `${out.join(' | ')}${closed ? ' |' : ''}` };
  });
  return joinLine(fixed);
}

/**
 * The line with bar lines a typist left out between two notes ("s : - : m : r
 * d : - : - : m.s"): in a bar too long, the spaces between notes become bar
 * lines when that cuts it into whole bars (a short one only at the row's end:
 * a part's name read as a note, "s r : - …", is no upbeat). Null if no bar
 * changes.
 */
export function withGapsAsBars(text: string, beatsPerBar: number): string | null {
  return withBarsCut(text, beatsPerBar, (bar) => bar.split(GAP), false);
}

/**
 * The line with the bars a part rests through filled out with empty beats: a
 * typist often types a silent 4/4 bar as "| : |". Only bars with beat marks
 * and nothing else; an inner bar gets the time's beats, a first or last bar
 * as many as the longest part has there. Null if no part changes.
 */
export function withFullEmptyBars(text: string, beatsPerBar: number): string | null {
  const rows = splitLine(text);
  const notes = rows.filter((r) => r.part).map((r) => barsOfRow(r.text).bars);
  let changed = false;
  const fixed = rows.map((r) => {
    if (!r.part) return r;
    const { bars, closed } = barsOfRow(r.text);
    const out = bars.map((bar, j) => {
      // Beat marks and nothing else ("| |" with none is more likely a double bar line).
      if (/[^\s:/]/.test(bar) || !/[:/]/.test(bar)) return bar;
      const edge = j === 0 || j === bars.length - 1;
      const want = edge ? Math.max(...notes.map((b) => (b[j] === undefined ? 0 : beatCount(b[j])))) : beatsPerBar;
      const have = beatCount(bar);
      if (have >= want) return bar;
      changed = true;
      return `${bar.trimEnd()}${' :'.repeat(want - have)} `;
    });
    return { part: r.part, text: `${out.join('|')}${closed ? '|' : ''}` };
  });
  return changed ? joinLine(fixed) : null;
}

/**
 * A part's row as the checker counts its bars: the text between its bar
 * lines, and which of those pieces are bars (an empty one, before an opening
 * bar line or inside a doubled one, isn't).
 */
function checkedBars(text: string): { pieces: string[]; bars: number[] } {
  const pieces = text.split('|');
  return { pieces, bars: pieces.flatMap((p, k) => (p.trim() ? [k] : [])) };
}

/** Whether every mark in a piece of a row is a note, a hold or a rest (not a part's name read as notes). */
const readsAsNotes = (piece: string) => piece.split(/[\s:|/.,=-]+/).every((t) => !t || t === 'x' || parseNote(t));

/**
 * Whether two marks this many beats apart are too close to be a bar line and
 * a half-bar mark: one beat, or less than half a bar. A part's mark that far
 * from where the others have theirs more likely means it lost a beat.
 */
const nearBeats = (apart: number, beatsPerBar: number) => apart === 1 || (apart > 0 && 2 * apart < beatsPerBar);

/** A bar cut after each of these beats (counted from 1), at the beat marks there. */
function cutAfter(bar: string, ends: number[]): string[] {
  const out = [''];
  bar.split(/([:/])/).forEach((bit, k) => {
    if (k % 2 === 1 && ends.includes((k + 1) / 2)) out.push('');
    else out[out.length - 1] += bit;
  });
  return out;
}

/**
 * The line with the bar lines every part lost put back, for a sheet whose bar
 * lines came out as half-bar marks (a table ruled by hand): where every
 * part's bar has the same number of beats, more than the time's, it's cut
 * every bar's worth of beats, at the same beats in every part. Only into
 * whole bars, except that the line's first bar may start with an upbeat and
 * its last may end short, and only where most parts have a half-bar mark at
 * each cut: a song whose bars all run longer than its time says (6 beats
 * given as 4/4) isn't cut up. A bar is left as it is where a part has no
 * "/" at a cut but has one a beat or so from it (it more likely lost a beat
 * and gained one, so its notes would land a beat off), and in a line of one
 * bar that another upbeat fits as well (half a bar, in 4/4). Needs two parts
 * or more (one has nothing to agree with), each with as many bars. Only bar
 * lines move, to where every part's beats put them, so the app can keep it
 * even if the line still fails. Null if no bar changes.
 */
export function withBarsInStep(text: string, beatsPerBar: number): string | null {
  const rows = splitLine(text);
  const parts = rows.flatMap((r) => (r.part ? [checkedBars(r.text)] : []));
  if (parts.length < 2 || beatsPerBar < 1) return null;
  const count = parts[0].bars.length;
  if (parts.some((p) => p.bars.length !== count)) return null;
  const barOf = (p: { pieces: string[]; bars: number[] }, j: number) => p.pieces[p.bars[j]];
  let changed = false;
  for (let j = 0; j < count; j++) {
    const n = beatCount(barOf(parts[0], j));
    if (n <= beatsPerBar || parts.some((p) => beatCount(barOf(p, j)) !== n)) continue;
    const short = n % beatsPerBar;
    const first = j === 0;
    // A short piece only at the line's start (an upbeat) or its end; in a line of one bar it could be either.
    if (short && first === (j === count - 1)) continue;
    // The beats to cut after, a bar apart from this one.
    const cutsFrom = (start: number) => Array.from({ length: Math.ceil((n - start) / beatsPerBar) }, (_, k) => start + k * beatsPerBar);
    const ends = cutsFrom(short && first ? short : beatsPerBar);
    // Each part's mark after each beat: most parts must have "/" at every cut.
    const marks = parts.map((p) => barOf(p, j).match(/[:/]/g) ?? []);
    const slashed = (b: number) => 2 * marks.filter((m) => m[b - 1] === '/').length > parts.length;
    if (!ends.every(slashed)) continue;
    // In a line of one bar, the "/" marks may fit another upbeat as well (half a bar, where half-bars are marked too): which is it?
    if (count === 1 && Array.from({ length: beatsPerBar - 1 }, (_, u) => u + 1).some((u) => cutsFrom(u).every(slashed))) continue;
    // A part with no "/" at a cut but one a beat or so from it is a beat off there.
    if (ends.some((b) => marks.some((m) => m[b - 1] !== '/' && m.some((x, k) => x === '/' && nearBeats(Math.abs(k + 1 - b), beatsPerBar))))) continue;
    const cuts = parts.map((p) => cutAfter(barOf(p, j), ends));
    // A lone beat of rest would be an empty bar, which the checker drops: more likely an opening bar line read as a beat mark.
    if (cuts.some((c) => c.some((piece) => !piece.trim()))) continue;
    // A short piece must read as notes: a part's name read before the first bar ("S/A") is no upbeat.
    if (short && cuts.some((c) => !readsAsNotes(first ? c[0] : c[c.length - 1]))) continue;
    parts.forEach((p, i) => {
      const bar = barOf(p, j);
      p.pieces[p.bars[j]] = `${bar.match(/^\s*/)?.[0]}${cuts[i].map((c) => c.trim()).join(' | ')}${bar.match(/\s*$/)?.[0]}`;
    });
    changed = true;
  }
  if (!changed) return null;
  let i = 0;
  return joinLine(rows.map((r) => (r.part ? { part: r.part, text: parts[i++].pieces.join('|') } : r)));
}

/**
 * A part's row as the checker counts its beats: how many, and the mark after
 * each but the last (":", "/" or "|"), with where it is in the text (a
 * doubled bar line is in more than one place).
 */
function beatMarks(text: string): { beats: number; marks: { mark: string; at: number[] }[] } {
  const marks: { mark: string; at: number[] }[] = [];
  let beats = 0;
  let lines: number[] = [];
  let at = 0;
  for (const piece of text.split('|')) {
    if (piece.trim()) {
      if (beats) marks.push({ mark: '|', at: lines });
      for (let k = 0; k < piece.length; k++) if (piece[k] === ':' || piece[k] === '/') marks.push({ mark: piece[k], at: [at + k] });
      beats += beatCount(piece);
      lines = [];
    }
    at += piece.length;
    // The bar line after this piece (past the end after the last piece, where it's never used).
    lines.push(at);
    at += 1;
  }
  return { beats, marks };
}

/**
 * The line with one part's bar lines moved to where the others have theirs:
 * when every part has as many beats in all, a bar line that most parts have
 * after a beat is given to the others there, in place of their ":" or "/",
 * and a bar line that most parts don't have there becomes a beat mark ("/"
 * in the middle of a bar of 4, 6 or 8 beats, ":" elsewhere). For a bar line
 * read as a half-bar mark, or a half-bar mark read as a bar line. Needs three
 * parts or more. A part whose bar line would only move a beat or so, or
 * land a beat or so from a "/" it has where the others have ":", is left as
 * it is (it more likely lost a beat and gained one), but a part could still
 * be shifted this way, so the caller keeps it only if the line then passes.
 * Null if no part changes, or if the parts' beats don't add up alike.
 */
export function withBarLinesInStep(text: string, beatsPerBar: number): string | null {
  const rows = splitLine(text);
  const parts = rows.flatMap((r, i) => (r.part ? [{ row: i, ...beatMarks(r.text) }] : []));
  if (parts.length < 3 || parts.some((p) => p.beats !== parts[0].beats)) return null;
  const most = (k: number, bar: boolean) => 2 * parts.filter((p) => (p.marks[k].mark === '|') === bar).length > parts.length;
  const marks = parts[0].marks.map((_, k) => k);
  // The beats (from 1) most parts end a bar after.
  const lines = marks.filter((k) => most(k, true)).map((k) => k + 1);
  const half = beatsPerBar >= 4 && beatsPerBar % 2 === 0 ? beatsPerBar / 2 : 0;
  const midBar = (beat: number) => {
    if (!half) return false;
    const before = lines.filter((b) => b < beat).pop();
    const after = lines.find((b) => b > beat);
    if (before !== undefined) return beat - before === half;
    return after !== undefined && after - beat === half;
  };
  const edits = parts.map(() => [] as { k: number; at: number; mark: string }[]);
  for (const k of marks) {
    const bar = most(k, true);
    const beat = most(k, false);
    parts.forEach((p, i) => {
      const m = p.marks[k];
      if (bar && m.mark !== '|') edits[i].push({ k, at: m.at[0], mark: '|' });
      else if (beat && m.mark === '|' && m.at.length === 1) edits[i].push({ k, at: m.at[0], mark: midBar(k + 1) ? '/' : ':' });
    });
  }
  // A part whose bar line would move a beat or so, or land a beat or so from a "/" it has where most parts have ":", more likely lost a beat before it and has one too many after: left as it is.
  const mostColon = (k: number) => 2 * parts.filter((p) => p.marks[k].mark === ':').length > parts.length;
  edits.forEach((e, i) => {
    const near = (a: number, b: number) => nearBeats(Math.abs(a - b), beatsPerBar);
    const astray = marks.filter((k) => parts[i].marks[k].mark === '/' && mostColon(k));
    const moved = e.some((g) => g.mark === '|' && (e.some((l) => l.mark !== '|' && near(g.k, l.k)) || astray.some((k) => near(g.k, k))));
    if (moved) edits[i] = [];
  });
  if (!edits.some((e) => e.length)) return null;
  const fixed = rows.slice();
  parts.forEach((p, i) => {
    let t = rows[p.row].text;
    // From the right, so each place is still where it was found.
    for (const e of edits[i].sort((a, b) => b.at - a.at)) {
      const mark = e.mark === '|' ? `${/\s/.test(t[e.at - 1] ?? ' ') ? '' : ' '}|${/\s/.test(t[e.at + 1] ?? ' ') ? '' : ' '}` : e.mark;
      t = t.slice(0, e.at) + mark + t.slice(e.at + 1);
    }
    fixed[p.row] = { part: rows[p.row].part, text: t };
  });
  return joinLine(fixed);
}

/** Two notes run together with nothing between them (`sd`, `s1d`, `d'f`): how SolfaScores' own reader writes a bridge note. */
const RUN_TOGETHER = new RegExp(`(^|[\\s:|/.,])(${SYLLABLE_PATTERN})('{1,2}|[12])?(${SYLLABLE_PATTERN})('{1,2}|[12])?(?=$|[\\s:|/.,])`, 'g');

/**
 * Bridge notes, where the key changes (ˢd, the old name small and raised before the new): SolfaScores' own
 * reader writes one as two notes run together (`sd`), since it has no `=` (it learned from rows with the
 * bridge's `=` taken out), and the line then fails the checker on a note it doesn't know. Here they become
 * bridge notes (`s=d`), but only where they agree: every one in the line moves doh the same way (and moves
 * it), no part has two, and at least two parts have one. Asked for by the owner, 20 November 2026. On the 50
 * handwritten test pages, 103 of 323 lines read had notes run together, nearly all misread notes; these rules
 * leave every one alone (with one part's alone allowed, two one-row lines would have passed on a lone
 * "bridge"). Null if there are none, or they don't agree.
 */
export function withBridgeNotes(text: string): string | null {
  const rows = splitLine(text);
  const moves = new Set<number>();
  let found = 0;
  const out = rows.map((r) => {
    if (!r.part) return r;
    let here = 0;
    const t = r.text.replace(RUN_TOGETHER, (_m, before: string, from: string, fromMark = '', to: string, toMark = '') => {
      here++;
      moves.add((((SYLLABLE_SEMITONES[from] - SYLLABLE_SEMITONES[to]) % 12) + 12) % 12);
      return `${before}${from}${fromMark}=${to}${toMark}`;
    });
    if (here > 1) moves.add(-1);
    if (here) found++;
    return { ...r, text: t };
  });
  if (found < 2 || moves.size !== 1 || moves.has(0) || moves.has(-1)) return null;
  return joinLine(out);
}

/**
 * The free repairs for a line that fails the checker, tried in turn and
 * together: bridge notes read as two notes run together, a column of part names read as notes, bar lines every part lost
 * alike, half-bar marks that are bar lines and bar lines that are half-bar
 * marks, bar lines left out, missing beat
 * marks, parts resting through an upbeat, silent bars typed short, and one
 * part's bar lines moved to where the others have theirs. The first that
 * makes the line pass, or null. Bars every part agrees on are cut before any
 * one part's are, so a part whose bar can't be cut on its own isn't left out
 * of step with the others; moving one part's bar lines comes last, as it
 * could hide a beat that part lost.
 */
export function freeRepair(text: string, passes: (t: string) => boolean, beatsPerBar: number): string | null {
  const steps: ((t: string) => string | null)[] = [
    withBridgeNotes,
    withoutNameColumn,
    (t) => withBarsInStep(t, beatsPerBar),
    (t) => withHalfBarsAsBars(t, beatsPerBar),
    (t) => withShortBarsJoined(t, beatsPerBar),
    (t) => withGapsAsBars(t, beatsPerBar),
    (t) => withSpacedBeats(t, beatsPerBar),
    withRestingEdges,
    (t) => withFullEmptyBars(t, beatsPerBar),
    (t) => withBarLinesInStep(t, beatsPerBar),
  ];
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

/** The notes in each part's row (not holds, rests or marks), top to bottom. */
function notesByPart(text: string): string[][] {
  return splitLine(text)
    .filter((r) => r.part)
    .map((r) => r.text.split(/[\s:|/.,=-]+/).filter((t) => parseNote(t)));
}

/**
 * Whether a reader's answer for a line still has the line's parts, compared
 * with the reading it was given: a row for every part, notes in every part
 * that had notes, and no part's row a copy of another's that differed. An
 * answer can pass the checker without them (a line of two parts adds up as
 * well as four), so the app keeps an AI's answer only if this holds too.
 */
export function keepsParts(answer: string, reading: string): boolean {
  const was = notesByPart(reading);
  const now = notesByPart(answer);
  if (now.length < was.length) return false;
  if (was.some((notes, i) => notes.length > 0 && now[i].length === 0)) return false;
  const rows = splitLine(answer)
    .filter((r) => r.part)
    .map((r) => r.text.replace(/\s+/g, ''));
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((n, k) => n === b[k]);
  for (let i = 0; i < was.length; i++)
    for (let j = i + 1; j < was.length; j++) if (now[i].length && rows[i] === rows[j] && !same(was[i], was[j])) return false;
  return true;
}

/** A row's symbols, one each: a note with its octave marks, a beat mark, a half-bar or bar line, a hold or a split. */
const SYMBOL = /(?:de|re|fe|se|le|ta|ra|ma|lo|[drmfsltx])[',_1-9¹₁]*|[:|/.,\-]/g;

/**
 * How much of a reading an answer changed: the fewest symbols added, taken
 * out or swapped to turn the reading's rows of notes into the answer's, over
 * the reading's symbols (words rows and spacing don't count). On handwritten
 * lines, Haiku's corrections that changed a tenth or less were right or one
 * to three symbols off, and most that changed a third or more were wrong on
 * ten symbols or more though they added up (16 November 2026).
 */
export function changedShare(answer: string, reading: string): number {
  const symbols = (t: string) => splitLine(t).flatMap((r) => (r.part ? (r.text.match(SYMBOL) ?? []) : []));
  const a = symbols(reading);
  const b = symbols(answer);
  if (!a.length) return b.length ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] / a.length;
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
