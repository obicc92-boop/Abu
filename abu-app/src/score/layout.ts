/**
 * Lays a parsed song out as lines ("systems") of beat columns, ready to draw.
 * Ported from scoreHTML() in prototype/index.html: one column per beat, bars
 * kept whole, and bars spread evenly over the lines so a bar is never left
 * alone on the last line.
 *
 * Pure module: no React.
 */
import { dohTimeline, octaveOf, SYLLABLE_PATTERN, type ParsedSong } from '@/solfa';

export interface ScoreCell {
  /** Absolute beat this column plays on. */
  beat: number;
  /** As written: "d", "s.l", "-", "" (rest). */
  text: string;
  /** First beat of a bar: drawn with a barline. */
  barStart: boolean;
  /** A hold ("-") or a rest (""): drawn faint. */
  hold: boolean;
}

export interface LyricSegment {
  beat: number;
  /** Beats this syllable covers until the next one, so it has room to show. */
  span: number;
  text: string;
}

export interface ScoreRow {
  part: string;
  cells: ScoreCell[];
  /** Words under this row, or null when the part has none. */
  lyrics: LyricSegment[] | null;
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
}

export interface LayoutOptions {
  /** Most beat columns per line. 12 suits a phone; Perform mode uses fewer. */
  maxBeats?: number;
  /** Show only this part ("my part only"). Words come from another part if it has none. */
  only?: string | null;
}

/** Narrowest column, in characters: a lone "d" gets the same room as "s.l". */
const MIN_COLUMN = 3;

export function layoutScore(song: ParsedSong, opts: LayoutOptions = {}): ScoreSystem[] {
  const maxBeats = opts.maxBeats ?? 12;
  const systems: ScoreSystem[] = [];
  // Where each key change starts (for one part, where that part changes).
  const changes = dohTimeline(song, 0, opts.only ?? undefined).slice(1);

  song.sections.forEach((sec, si) => {
    const first = sec.order[0];
    const bars = sec.bars[first];
    const barLen = Math.max(1, ...bars.map((b) => b.length));
    const fit = Math.max(1, Math.floor(maxBeats / barLen));
    const per = Math.ceil(bars.length / Math.ceil(bars.length / fit));
    const rows = opts.only && sec.order.includes(opts.only) ? [opts.only] : sec.order;
    const lyricsFrom = (p: string): string | null => {
      if (sec.lyrics[p]) return p;
      if (opts.only) return sec.order.find((q) => sec.lyrics[q]) ?? null;
      return null;
    };

    let i = 0;
    let beatAt = sec.start;
    while (i < bars.length) {
      const take: number[] = [];
      let n = 0;
      while (i + take.length < bars.length && take.length < per) {
        n += bars[i + take.length].length;
        take.push(i + take.length);
      }
      const start = beatAt;
      const lineRows: ScoreRow[] = rows.map((p) => {
        const cells: ScoreCell[] = [];
        let b = start;
        for (const bi of take) {
          (sec.bars[p][bi] ?? []).forEach((text, k) => {
            cells.push({ beat: b, text, barStart: k === 0, hold: text === '-' || text === '' });
            b += 1;
          });
        }
        const lp = lyricsFrom(p);
        return { part: p, cells, lyrics: lp ? lyricSegments(sec.lyrics[lp], start, n) : null };
      });
      systems.push({
        id: `${si}-${i}`,
        heading: i === 0 && sec.name ? sec.name : null,
        start,
        beats: n,
        widths: columnWidths(lineRows, start, n),
        rows: lineRows,
        keys: changes.filter((c) => c.beat >= start - 1e-6 && c.beat < start + n - 1e-6).map((c) => ({ beat: c.beat, semitone: c.semitone })),
      });
      beatAt += n;
      i += take.length;
    }
  });
  return systems;
}

/** Words are set smaller than notes: one word character takes about this many note characters. */
const LYRIC_CHAR = 0.7;

/**
 * Relative column widths in note characters: room for the longest beat in each
 * column, then extra on a syllable's first column when the words need it.
 */
function columnWidths(rows: ScoreRow[], start: number, n: number): number[] {
  const widths = new Array<number>(n).fill(MIN_COLUMN);
  for (const row of rows) {
    row.cells.forEach((cell, col) => {
      if (col < n) widths[col] = Math.max(widths[col], displayBeat(cell.text).length);
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
  return widths;
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
 * name small and raised before its new one (s=d → ˢd).
 */
export function displayBeat(text: string): string {
  if (text === '-') return '–';
  return text
    .replace(BRIDGE_RE, (_m, syl: string, mark?: string) => [...syl].map((c) => SMALL[c] ?? c).join('') + octave(mark))
    .replace(OCTAVE_MARK_RE, (_m, syl: string, mark: string) => syl + octave(mark));
}
