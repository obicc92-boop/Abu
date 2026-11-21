/**
 * A song's bars as a shelf's tile shows them (owner's request, 21 November 2026): the parts' beats for one bar,
 * as written, up to four parts, with the words sung in it. The tile shows the first full bar while the song rests,
 * and follows the player bar by bar while it plays (src/components/shelf.tsx).
 *
 * Pure module: no React.
 */
import type { ParsedSong } from '@/solfa';

export interface TileBar {
  /** 1-based, as the song numbers its bars. */
  number: number;
  /** Beat it starts on, from the start of the song (as the player counts). */
  start: number;
  beats: number;
  rows: { part: string; beats: string[] }[];
  /** The words sung in it, from the first part that has words there. */
  words: string;
}

export function tileBars(song: ParsedSong, maxParts = 4): TileBar[] {
  const shown = song.parts.slice(0, maxParts);
  const bars: TileBar[] = [];
  for (const section of song.sections) {
    const first = section.order.find((p) => section.bars[p]?.length);
    if (!first) continue;
    let start = section.start;
    section.bars[first].forEach((firstBeats, i) => {
      const beats = firstBeats.length;
      const rows = shown.flatMap((part) => {
        const b = section.bars[part]?.[i];
        return b && b.length ? [{ part, beats: b }] : [];
      });
      let words = '';
      for (const part of section.order) {
        const lyrics = section.lyrics[part];
        if (!lyrics) continue;
        const sung = Object.keys(lyrics)
          .map(Number)
          .filter((beat) => beat >= start && beat < start + beats)
          .sort((a, b) => a - b)
          .map((beat) => lyrics[beat]);
        if (sung.length) {
          words = sung.join(' ').replace(/-\s+/g, '-');
          break;
        }
      }
      bars.push({ number: section.firstBar + i, start, beats, rows, words });
      start += beats;
    });
  }
  return bars;
}

/** The bar shown while the song rests: the first whole bar (not an upbeat), or the first. */
export function restingBar(bars: TileBar[], beatsPerBar: number): TileBar | null {
  return bars.find((b) => b.beats >= beatsPerBar) ?? bars[0] ?? null;
}

/** The bar a beat falls in. */
export function barAt(bars: TileBar[], beat: number): TileBar | null {
  let found: TileBar | null = null;
  for (const b of bars) {
    if (b.start > beat) break;
    found = b;
  }
  return found;
}
