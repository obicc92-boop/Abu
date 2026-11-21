/**
 * Lays a parsed song out as lines ("systems") of beat columns, ready to draw.
 * Ported from scoreHTML() in prototype/index.html: one column per beat, bars
 * kept whole, and bars spread evenly over the lines so a bar is never left
 * alone on the last line.
 *
 * Pure module: no React.
 */
import { dohTimeline, normalizePart, octaveOf, SYLLABLE_PATTERN, type ExpressionKind, type ParsedSong } from '@/solfa';

export interface ScoreCell {
  /** Absolute beat this column plays on. */
  beat: number;
  /** As written: "d", "s.l", "-", "" (rest). */
  text: string;
  /** First beat of a bar: drawn with a barline. */
  barStart: boolean;
  /** A hold ("-") or a rest (""): drawn faint. */
  hold: boolean;
  /**
   * A beat this part doesn't have, where another part's bar is longer (in a line that doesn't add up): left blank,
   * so the parts' bar lines stay in step.
   */
  pad?: boolean;
}

export interface LyricSegment {
  beat: number;
  /** Beats this syllable covers until the next one, so it has room to show. */
  span: number;
  text: string;
}

/** A musical marking on the score (src/solfa/expressions.ts), drawn from the column of the beat it starts on. */
export interface ScoreMark {
  /** Absolute beat it starts on. */
  beat: number;
  /** As shown: "pp", "sfz", "cresc.", "Andante M. 70", "rit.". */
  text: string;
  kind: ExpressionKind;
}

/**
 * A hairpin ("<" getting louder, ">" softer) on one line of the score, drawn
 * as a wedge in its marks' line. It runs from its beat to the part's next
 * dynamic, accent, cresc., dim. or hairpin; if that isn't on its line or the
 * next, to the end of its bar.
 */
export interface ScoreHairpin {
  /** The beats it runs between on this line (`to`: the start of the beat it reaches). */
  from: number;
  to: number;
  /** How far open the wedge is where it starts and ends on this line: 0 its point, 1 its mouth. */
  open: [number, number];
}

/**
 * A slur under a row's notes on one line of the score: written in brackets ("(m'.d')", "(s :f |m)"), drawn as a
 * sheet does in sol-fa, as a line under the notes from the first to the last.
 */
export interface ScoreSlur {
  /** First and last column it runs under. */
  from: number;
  to: number;
  /**
   * Where it starts under the first column's notes and ends under the last's, as a share of their shown width
   * (0–1). Null where it runs on from the line before or to the next line: from or to that column's edge.
   */
  start: number | null;
  end: number | null;
}

export interface ScoreRow {
  part: string;
  cells: ScoreCell[];
  /** Words under this row, or null when the part has none. */
  lyrics: LyricSegment[] | null;
  /** This part's own markings starting on this line (dynamics, accents, cresc., dim., directions), drawn just above its notes. */
  marks: ScoreMark[];
  /** This part's hairpins on this line, drawn as wedges with its markings. */
  hairpins: ScoreHairpin[];
  /** Slurs under this row's notes on this line, in order. */
  slurs: ScoreSlur[];
}

export interface ScoreSystem {
  id: string;
  /** Section name, on the first line of each named section. */
  heading: string | null;
  start: number;
  beats: number;
  /** Relative width of each beat column: wider where a beat holds more notes ("d.,r"). */
  widths: number[];
  rows: ScoreRow[];
  /** Key changes starting on this line: the beat, and the new doh (semitones above C, before any transpose). */
  keys: { beat: number; semitone: number }[];
  /**
   * Markings for every part starting on this line: tempo, rit., accel., a tempo, and dynamics and directions
   * written on a line of their own. Drawn above the line, beside the key changes.
   */
  marks: ScoreMark[];
  /** Hairpins for every part on this line, drawn as wedges with those markings. */
  hairpins: ScoreHairpin[];
}

export interface LayoutOptions {
  /** Most beat columns per line. 12 suits a phone; Perform mode uses fewer. */
  maxBeats?: number;
  /**
   * Room across a line, in note characters (the score's width over one character of the notes' type). Given, whole
   * bars go on a line while their columns fit it, so no line is crowded, and `maxBeats` only applies if given too;
   * a bar too wide on its own gets a line to itself (the score lets it scroll sideways). Not given (before the
   * score knows its width), lines take `maxBeats` beats as before.
   */
  maxChars?: number;
  /** Show only this part ("my part only"). Words come from another part if it has none. */
  only?: string | null;
  /**
   * Beats to leave out: the bars starting in them aren't laid out, and no line runs across them (a line of music
   * open to edit in the song editor goes there). With `from` and `to` the same, lines only break there.
   */
  skip?: { from: number; to: number } | null;
  /** All of each section on one line (a line of music written in rows: LineRows), fitted as with `maxChars`. */
  oneLine?: boolean;
}

/** Narrowest column, in characters: a lone "d" gets the same room as "s.l". */
const MIN_COLUMN = 3;

export function layoutScore(song: ParsedSong, opts: LayoutOptions = {}): ScoreSystem[] {
  const { maxChars, oneLine } = opts;
  const maxBeats = opts.maxBeats ?? (maxChars ? Infinity : 12);
  // Fitted to a width, nothing stretches a line to give a beat's colon room beside a busy beat ("s,f.m,r"), so
  // each column has a character more than its notes.
  const gutter = maxChars || oneLine ? 1 : 0;
  const sections = sectionBars(song);
  const systems: ScoreSystem[] = [];
  // Where each key change starts (for one part, where that part changes).
  const changes = dohTimeline(song, 0, opts.only ?? undefined).slice(1);

  song.sections.forEach((sec, si) => {
    const { lens } = sections[si];
    const rows = opts.only && sec.order.includes(opts.only) ? [opts.only] : sec.order;
    const lyricsFrom = (p: string): string | null => {
      if (sec.lyrics[p]) return p;
      if (opts.only) return sec.order.find((q) => sec.lyrics[q]) ?? null;
      return null;
    };
    // The beat each bar starts on, and where the last one ends.
    const barStarts = [sections[si].start];
    for (const len of lens) barStarts.push(barStarts[barStarts.length - 1] + len);

    /** Bars `from` up to (not including) `to` as one line of the score; its slurs are added once the lines are chosen. */
    const line = (from: number, to: number): Omit<ScoreSystem, 'id' | 'heading'> => {
      const start = barStarts[from];
      const n = barStarts[to] - start;
      const keys = changes.filter((c) => c.beat >= start - 1e-6 && c.beat < start + n - 1e-6).map((c) => ({ beat: c.beat, semitone: c.semitone }));
      const lineRows: ScoreRow[] = rows.map((p) => {
        const cells: ScoreCell[] = [];
        let b = start;
        for (let bi = from; bi < to; bi++) {
          const beats = sec.bars[p][bi] ?? [];
          // Its beats, and blanks where another part's bar is longer (only in a song that doesn't add up).
          for (let k = 0; k < Math.max(beats.length, lens[bi]); k++) {
            const text = beats[k] ?? '';
            const bare = text.replace(SLUR_RE, '');
            cells.push({ beat: b, text, barStart: k === 0, hold: bare === '-' || bare === '', ...(k >= beats.length ? { pad: true } : {}) });
            b += 1;
          }
        }
        const lp = lyricsFrom(p);
        return { part: p, cells, lyrics: lp ? lyricSegments(sec.lyrics[lp], start, n) : null, marks: marksOn(song, p, start, n), hairpins: [], slurs: [] };
      });
      const marks = marksOn(song, null, start, n);
      return { start, beats: n, widths: columnWidths(lineRows, start, n, marks, keys, gutter), rows: lineRows, keys, marks, hairpins: [] };
    };

    // The bars laid out, in runs that no line crosses: those before the beats left out, and those after.
    const { skip } = opts;
    const count = lens.length;
    const runs: [number, number][] = [[0, count]];
    if (skip) {
      const before = barStarts.slice(0, count).filter((b) => b < skip.from - 1e-6).length;
      const after = barStarts.slice(0, count).findIndex((b) => b >= skip.to - 1e-6);
      runs.splice(0, 1, [0, before], [after < 0 ? count : Math.max(before, after), count]);
    }
    // Parts with a slur still open at the end of the line before, so it runs on from the next line's start.
    const slurOpen: Record<string, boolean> = {};
    for (const [first, end] of runs) {
      const lines = oneLine
        ? end > first
          ? [end - first]
          : []
        : maxChars
          ? linesByRoom(end - first, barStarts.slice(first), (a, b) => line(first + a, first + b), maxChars, maxBeats)
          : linesByBeats(lens.slice(first, end), maxBeats);
      let from = first;
      for (const count of lines) {
        const made = line(from, from + count);
        for (const row of made.rows) {
          const got = slursIn(row.cells, !!slurOpen[row.part]);
          slurOpen[row.part] = got.open;
          row.slurs = got.slurs;
        }
        systems.push({ id: `${si}-${from}`, heading: from === 0 && sec.name ? sec.name : null, ...made });
        from += count;
      }
    }
  });
  addHairpins(song, systems);
  return systems;
}

/** A hairpin, as the reader gives it: a cresc. or dim. written "<" or ">". */
export const isHairpin = (e: { kind: ExpressionKind; text: string }): boolean => (e.kind === 'cresc' && e.text === '<') || (e.kind === 'dim' && e.text === '>');

/** What ends a hairpin: the next change of loudness written for its part. */
const ENDS_HAIRPIN: ReadonlySet<ExpressionKind> = new Set<ExpressionKind>(['dynamic', 'accent', 'cresc', 'dim']);

/**
 * Puts each hairpin on the lines it runs over, as a sheet draws it: from its
 * beat to the part's next dynamic, accent, cresc., dim. or hairpin (or one for
 * every part), running on into the next line when that mark is there; else to
 * the end of its bar. A part's hairpin goes in its row, one for every part on
 * the line itself; one for a part not shown ("my part only") is left out.
 */
function addHairpins(song: ParsedSong, systems: ScoreSystem[]): void {
  const lineAt = (beat: number) => systems.findIndex((s) => beat >= s.start - 1e-6 && beat < s.start + s.beats - 1e-6);
  for (const e of song.expressions) {
    if (!isHairpin(e)) continue;
    const at = lineAt(e.beat);
    if (at < 0) continue;
    const line = systems[at];
    const next = systems[at + 1];
    const lineEnd = line.start + line.beats;
    const until = song.expressions.find((x) => x.beat > e.beat + 1e-6 && ENDS_HAIRPIN.has(x.kind) && (x.part === e.part || x.part === null));
    let end: number;
    // On its line (or at the start of the next), or on the next line: the wedge runs to it.
    if (until && (until.beat <= lineEnd + 1e-6 || (next && until.beat < next.start + next.beats - 1e-6))) end = until.beat;
    else {
      const cells = (line.rows.find((r) => r.part === e.part) ?? line.rows[0])?.cells ?? [];
      end = cells.find((c) => c.barStart && c.beat > e.beat + 1e-6)?.beat ?? lineEnd;
    }
    const share = (beat: number) => (beat - e.beat) / (end - e.beat);
    for (const sys of [line, next]) {
      if (!sys) continue;
      const from = Math.max(e.beat, sys.start);
      const to = Math.min(end, sys.start + sys.beats);
      if (to - from < 1e-6) continue;
      const open: [number, number] = e.text === '<' ? [share(from), share(to)] : [1 - share(from), 1 - share(to)];
      const into = e.part === null ? sys.hairpins : sys.rows.find((r) => r.part === e.part)?.hairpins;
      into?.push({ from, to, open });
    }
  }
}

/**
 * Bars on each line, by count: as many as `maxBeats` holds of the longest bar,
 * spread evenly so a bar is never left alone on the last line (scoreHTML's rule).
 */
function linesByBeats(lens: number[], maxBeats: number): number[] {
  if (!lens.length) return [];
  const barLen = Math.max(1, ...lens);
  const fit = Math.max(1, Math.floor(maxBeats / barLen));
  const per = Math.ceil(lens.length / Math.ceil(lens.length / fit));
  const lines: number[] = [];
  for (let i = 0; i < lens.length; i += per) lines.push(Math.min(per, lens.length - i));
  return lines;
}

/**
 * Each section's first beat and its bars' lengths, as the score lays them out: as its first part has them. In a
 * song that doesn't add up (a line being checked or written), each bar is as long as its longest part's, every
 * part's bars are there, and the sections follow one another, so the parts' bar lines stay in step where their
 * beats don't. A song that plays is laid out on the beats it plays.
 */
export function sectionBars(song: ParsedSong): { start: number; lens: number[] }[] {
  const widen = song.errors.length > 0;
  let at = 0;
  return song.sections.map((sec) => {
    const first = sec.bars[sec.order[0]] ?? [];
    const count = widen ? Math.max(first.length, ...sec.order.map((p) => sec.bars[p]?.length ?? 0)) : first.length;
    const lens = Array.from({ length: count }, (_, bi) => (widen ? Math.max(0, ...sec.order.map((p) => sec.bars[p]?.[bi]?.length ?? 0)) : first[bi].length));
    const start = widen ? at : sec.start;
    at = start + lens.reduce((a, b) => a + b, 0);
    return { start, lens };
  });
}

/** One line of music laid out as a line of the score, its rows matched to the rows it's written in (LineRows). */
export interface RowsLine {
  system: ScoreSystem;
  /** For each row of the line: the row of the text it shows (a part's notes), and the row of words under it, if any. */
  notesRow: number[];
  wordsRow: (number | null)[];
}

/**
 * A line of music written in rows (Check the reading, the song editor's open line) as one line of the score, in
 * the order its rows are written: a row with no notes yet (a part just added, or a second row of a part) is an
 * empty row there, to tap and write in, and a part with an empty row of words under it has its words line, empty.
 */
export function rowsLine(song: ParsedSong, rows: readonly { part: string | null }[]): RowsLine {
  const [laid] = layoutScore(song, { oneLine: true });
  const base: ScoreSystem = laid ?? { id: 'line', heading: null, start: 0, beats: 0, widths: [], rows: [], keys: [], marks: [], hairpins: [] };
  const used = new Set<ScoreRow>();
  const notesRow: number[] = [];
  const wordsRow: (number | null)[] = [];
  const lineRows: ScoreRow[] = [];
  rows.forEach((r, i) => {
    if (!r.part) return;
    const part = normalizePart(r.part);
    const found = base.rows.find((x) => x.part === part && !used.has(x));
    const words = rows[i + 1] && !rows[i + 1].part ? i + 1 : null;
    const row: ScoreRow = found ?? { part, cells: [], lyrics: null, marks: [], hairpins: [], slurs: [] };
    if (found) used.add(found);
    lineRows.push(words !== null && !row.lyrics ? { ...row, lyrics: [] } : row);
    notesRow.push(i);
    wordsRow.push(words);
  });
  return { system: { ...base, rows: lineRows }, notesRow, wordsRow };
}

/**
 * Bars on each line, by the room they need: a line takes whole bars while
 * their columns fit `maxChars` (and `maxBeats`); a bar too wide on its own has
 * a line to itself. Of the ways with the fewest lines, the one whose lines are
 * most even in width (least sum of squares), so a bar is left alone on the last
 * line only when nothing else fits; on a tie, the earlier lines fuller.
 */
function linesByRoom(
  count: number,
  barStarts: number[],
  line: (from: number, to: number) => { widths: number[] },
  maxChars: number,
  maxBeats: number,
): number[] {
  // For each number of bars from the start: the fewest lines to hold them, how even, and where its last line starts.
  const best: { lines: number; cost: number; from: number }[] = [{ lines: 0, cost: 0, from: 0 }];
  for (let to = 1; to <= count; to++) {
    let pick: { lines: number; cost: number; from: number } | null = null;
    for (let from = to - 1; from >= 0; from--) {
      const width = line(from, to).widths.reduce((a, b) => a + b, 0);
      const alone = to - from === 1;
      // Lines only get wider with more bars, so once one is too wide, so is every longer one.
      if (!alone && (width > maxChars || barStarts[to] - barStarts[from] > maxBeats)) break;
      const lines = best[from].lines + 1;
      const cost = best[from].cost + width * width;
      if (!pick || lines < pick.lines || (lines === pick.lines && cost < pick.cost)) pick = { lines, cost, from };
    }
    best.push(pick!);
  }
  const lines: number[] = [];
  for (let to = count; to > 0; to = best[to].from) lines.unshift(to - best[to].from);
  return lines;
}

/** A slur's brackets, kept in a beat as written ("(m'.d')", "(s", "m)") and never shown. */
const SLUR_RE = /[()]/g;

/**
 * The slurs under a row's notes on one line, from the brackets in its beats.
 * One open at the line's start (`open`, from the line before) runs from the
 * first column's edge, and one still open at its end runs to the last
 * column's edge and on to the next line (`open` in the answer).
 */
function slursIn(cells: ScoreCell[], open: boolean): { slurs: ScoreSlur[]; open: boolean } {
  if (!cells.length) return { slurs: [], open };
  const slurs: ScoreSlur[] = [];
  let now: ScoreSlur | null = open ? { from: 0, to: 0, start: null, end: null } : null;
  for (let col = 0; col < cells.length; col++) {
    const text = cells[col].text;
    if (!text.includes('(') && !text.includes(')')) continue;
    // Where each bracket falls in the beat as shown, as a share of its width (mono type: one character, one width).
    const pieces = text.split(/([()])/);
    const widths = pieces.map((piece) => (piece === '(' || piece === ')' ? 0 : displayBeat(piece).length));
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    let at = 0;
    pieces.forEach((piece, k) => {
      if (piece === '(' && !now) now = { from: col, to: col, start: at / total, end: null };
      else if (piece === ')' && now) {
        slurs.push({ ...now, to: col, end: at / total });
        now = null;
      }
      at += widths[k];
    });
  }
  if (now) slurs.push({ ...now, to: cells.length - 1, end: null });
  return { slurs, open: now !== null };
}

/**
 * A part's markings (or, with null, those for every part) starting within a line's beats. One written in several
 * parts' rows on the same beat (a tempo over each part) is shown once.
 */
function marksOn(song: ParsedSong, part: string | null, start: number, n: number): ScoreMark[] {
  const marks: ScoreMark[] = [];
  for (const e of song.expressions) {
    // Hairpins are drawn as wedges, not words (addHairpins).
    if (e.part !== part || isHairpin(e) || e.beat < start - 1e-6 || e.beat >= start + n - 1e-6) continue;
    if (marks.some((m) => m.text === e.text && Math.abs(m.beat - e.beat) < 1e-6)) continue;
    marks.push({ beat: e.beat, text: e.text, kind: e.kind });
  }
  return marks;
}

/** Words are set smaller than notes: one word character takes about this many note characters. */
const LYRIC_CHAR = 0.7;
/** Markings are set small too, about the same. */
const MARK_CHAR = 0.7;
/** Room a key change's name takes ("Doh is Bb"), when a marking shares its line. */
const KEY_CHARS = 9;

/**
 * Relative column widths in note characters: room for the longest beat in each
 * column (and `gutter` beside it), then extra on a syllable's first column when
 * the words need it, and on a marking's first column when it needs it.
 */
function columnWidths(rows: ScoreRow[], start: number, n: number, marks: ScoreMark[], keys: { beat: number }[], gutter: number): number[] {
  const widths = new Array<number>(n).fill(MIN_COLUMN);
  for (const row of rows) {
    row.cells.forEach((cell, col) => {
      if (col < n) widths[col] = Math.max(widths[col], displayBeat(cell.text).length + gutter);
    });
  }
  for (const row of rows) {
    for (const seg of row.lyrics ?? []) {
      const from = seg.beat - start;
      const have = widths.slice(from, from + seg.span).reduce((a, b) => a + b, 0);
      const need = Math.ceil(seg.text.length * LYRIC_CHAR + 0.5);
      if (need > have) widths[from] += need - have;
    }
  }
  for (const row of rows) roomForMarks(widths, start, row.marks, []);
  roomForMarks(widths, start, marks, keys);
  return widths;
}

/**
 * Makes room for a line of markings. A marking runs on over the beats after it,
 * up to the next one on its line (markings on the same beat, and a key change
 * there, side by side), so its first column is widened only when even that is
 * too narrow. A line with key changes and no markings is left as it was.
 */
function roomForMarks(widths: number[], start: number, marks: ScoreMark[], keys: { beat: number }[]): void {
  if (!marks.length) return;
  const cols = new Map<number, { chars: number; marked: boolean }>();
  const add = (beat: number, chars: number, marked: boolean) => {
    const col = Math.floor(beat - start);
    const was = cols.get(col);
    cols.set(col, was ? { chars: was.chars + 2 + chars, marked: was.marked || marked } : { chars, marked });
  };
  keys.forEach((k) => add(k.beat, KEY_CHARS, false));
  marks.forEach((m) => add(m.beat, m.text.length, true));
  const at = [...cols.keys()].sort((a, b) => a - b);
  at.forEach((col, i) => {
    const { chars, marked } = cols.get(col)!;
    if (!marked) return;
    const to = i + 1 < at.length ? at[i + 1] : widths.length;
    const have = widths.slice(col, to).reduce((a, b) => a + b, 0);
    const need = Math.ceil(chars * MARK_CHAR + 0.5);
    if (need > have) widths[col] += need - have;
  });
}

/** Groups a line's words so each syllable spans the beats until the next one. */
export function lyricSegments(lyrics: Record<number, string>, from: number, count: number): LyricSegment[] {
  const segs: LyricSegment[] = [];
  for (let x = from; x < from + count; x++) {
    const text = lyrics[x];
    if (text || segs.length === 0) segs.push({ beat: x, span: 1, text: text ?? '' });
    else segs[segs.length - 1].span += 1;
  }
  return segs;
}

const OCTAVE_MARK_RE = new RegExp(`(${SYLLABLE_PATTERN})(['’′ʼ¹²″]+|[12₁₂])`, 'g');
const BRIDGE_RE = new RegExp(`(${SYLLABLE_PATTERN})(['’′ʼ¹²″]+|[12₁₂])?=`, 'g');
const SUP = ['', '¹', '²', '³'];
const SUB = ['', '₁', '₂', '₃'];
/** Small raised letters, for a bridge note's name in the old key as sheets print it. */
const SMALL: Readonly<Record<string, string>> = { d: 'ᵈ', r: 'ʳ', m: 'ᵐ', f: 'ᶠ', s: 'ˢ', l: 'ˡ', t: 'ᵗ', e: 'ᵉ', a: 'ᵃ', i: 'ⁱ', o: 'ᵒ', b: 'ᵇ' };

const octave = (mark: string | undefined) => {
  const v = octaveOf(mark);
  return v > 0 ? SUP[Math.min(v, 3)] : v < 0 ? SUB[Math.min(-v, 3)] : '';
};

/**
 * How a beat is shown: octave marks as small raised or lowered digits (d' → d¹,
 * t1 → t₁), holds as "–", and a bridge note as the sheet prints it, its old
 * name small and raised before its new one (s=d → ˢd). A slur's brackets are
 * left out (the score draws a line under the notes instead), so they take no room.
 */
export function displayBeat(beat: string): string {
  const text = beat.replace(SLUR_RE, '');
  if (text === '-') return '–';
  return text
    .replace(BRIDGE_RE, (_m, syl: string, mark?: string) => [...syl].map((c) => SMALL[c] ?? c).join('') + octave(mark))
    .replace(OCTAVE_MARK_RE, (_m, syl: string, mark: string) => syl + octave(mark));
}
