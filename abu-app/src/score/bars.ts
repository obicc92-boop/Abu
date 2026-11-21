/**
 * A song's bars, to play part of it and to find the line of music that holds a bar (owner's request, 21 November
 * 2026: edit inside the preview, play from any bar, play or loop one bar). Bars are numbered from 1, a pickup bar
 * counted as bar 1, as the checker and the editor's rows number them.
 *
 * Pure module: no React.
 */
import { barsBefore, type Piece } from '@/lib/song-pieces';
import type { ParsedSong } from '@/solfa';

export interface BarSpan {
  bar: number;
  /** Its first beat, and the beat after its last, from the start of the song. */
  from: number;
  to: number;
}

/** Each bar of the song in order, by its section's first part (as the score lays them out). */
export function songBars(song: ParsedSong): BarSpan[] {
  const bars: BarSpan[] = [];
  for (const sec of song.sections) {
    let at = sec.start;
    for (const bar of sec.bars[sec.order[0]] ?? []) {
      bars.push({ bar: bars.length + 1, from: at, to: at + bar.length });
      at += bar.length;
    }
  }
  return bars;
}

/** The bar a beat is in. */
export function barAt(bars: BarSpan[], beat: number): BarSpan | undefined {
  return bars.find((b) => beat >= b.from - 1e-6 && beat < b.to - 1e-6);
}

/** Each line of music in the song's text (its block of parts' rows): its piece, its first bar's number and how many bars it has. */
export function musicLines(pieces: Piece[]): { piece: number; first: number; count: number }[] {
  // With one more piece at the end, the bars before it are all of them.
  const before = barsBefore([...pieces, { kind: 'blank', line: -1 }]);
  return pieces.flatMap((p, k) => (p.kind === 'music' ? [{ piece: k, first: before[k] + 1, count: before[k + 1] - before[k] }] : []));
}

/** The line of music (counting from 0) that holds bar `bar`; past the last bar, the last line; -1 with none. */
export function lineOfBar(pieces: Piece[], bar: number): number {
  const lines = musicLines(pieces);
  const at = lines.findIndex((l) => bar >= l.first && bar < l.first + l.count);
  if (at >= 0) return at;
  return lines.length && bar >= 1 ? lines.length - 1 : -1;
}

/**
 * The beats a line of music's bars take in the song: from its first bar to the end of its last. One with no bars
 * yet (just added) takes none, where its bars will go.
 */
export function lineBeats(bars: BarSpan[], line: { first: number; count: number }): { from: number; to: number } {
  const end = bars.at(-1)?.to ?? 0;
  const from = bars[line.first - 1]?.from ?? end;
  if (!line.count) return { from, to: from };
  return { from, to: bars[line.first + line.count - 2]?.to ?? end };
}

/** What's playing, said plainly: "Looping bar 5", "Playing bars 3–6", "Playing from bar 5". */
export function rangeLabel(range: { from: number; to: number; loop: boolean }, bars: BarSpan[]): string {
  const first = barAt(bars, range.from);
  const last = barAt(bars, range.to - 1e-3);
  if (!first) return '';
  const end = bars.at(-1)?.to ?? 0;
  if (range.to >= end - 1e-6 && (!last || last.bar !== first.bar)) {
    if (first.bar === 1) return range.loop ? 'Looping the song' : 'Playing the song';
    return `${range.loop ? 'Looping' : 'Playing'} from bar ${first.bar}`;
  }
  const which = !last || last.bar === first.bar ? `bar ${first.bar}` : `bars ${first.bar}–${last.bar}`;
  return `${range.loop ? 'Looping' : 'Playing'} ${which}`;
}
