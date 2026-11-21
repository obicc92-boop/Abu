import { describe, expect, it } from '@jest/globals';

import { GRACE, OLD100 } from '@/data/demo-songs';
import { songPieces } from '@/lib/song-pieces';
import { parseSolfa } from '@/solfa';

import { barAt, lineBeats, lineOfBar, musicLines, rangeLabel, songBars } from '../bars';
import { layoutScore } from '../layout';

describe('songBars', () => {
  it('numbers the bars through the song, each with its beats', () => {
    const bars = songBars(parseSolfa(OLD100, { time: '4/4' }));
    expect(bars).toHaveLength(12);
    expect(bars.slice(0, 2)).toEqual([
      { bar: 1, from: 0, to: 4 },
      { bar: 2, from: 4, to: 8 },
    ]);
    expect(bars.at(-1)).toEqual({ bar: 12, from: 44, to: 48 });
  });

  it('counts a pickup bar as bar 1, with its own few beats', () => {
    const bars = songBars(parseSolfa(GRACE, { time: '3/4' }));
    expect(bars[0]).toEqual({ bar: 1, from: 0, to: 1 });
    expect(bars[1]).toEqual({ bar: 2, from: 1, to: 4 });
    expect(barAt(bars, 2.5)?.bar).toBe(2);
    expect(barAt(bars, 999)).toBeUndefined();
  });

  it('runs on through sections', () => {
    const song = parseSolfa('[Verse]\nS  d :r /m :f | s :- /- :- |\n\n[Chorus]\nS  m :r /d :- |', { time: '4/4' });
    expect(songBars(song)).toEqual([
      { bar: 1, from: 0, to: 4 },
      { bar: 2, from: 4, to: 8 },
      { bar: 3, from: 8, to: 12 },
    ]);
  });
});

describe('the line of music that holds a bar', () => {
  const text = [
    'title: Test',
    '[Verse]',
    'S  d :r /m :f | s :- /- :- |',
    'W  Glo- ry to God',
    'A  d :d /d :d | d :- /- :- |',
    '',
    'Doh is F',
    'S  m :r /d :- | r :- /- :- | d :- /- :- |',
    'A  d :t1 /d :- | t1 :- /- :- | d :- /- :- |',
    '',
    'S',
    'A',
  ].join('\n');
  const pieces = songPieces(text);

  it('knows each line’s first bar and how many it has (an empty one has none)', () => {
    expect(musicLines(pieces).map(({ first, count }) => [first, count])).toEqual([
      [1, 2],
      [3, 3],
      [6, 0],
    ]);
  });

  it('finds the line for a bar, the last one past the end, and none in a song with no music', () => {
    expect([1, 2, 3, 5, 6, 40].map((bar) => lineOfBar(pieces, bar))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(lineOfBar(songPieces('title: Nothing yet'), 1)).toBe(-1);
  });

  it('gives a line’s beats in the song, and an empty line none, where its bars will go', () => {
    const bars = songBars(parseSolfa(text, { time: '4/4' }));
    const lines = musicLines(pieces);
    expect(lineBeats(bars, lines[0])).toEqual({ from: 0, to: 8 });
    expect(lineBeats(bars, lines[1])).toEqual({ from: 8, to: 20 });
    expect(lineBeats(bars, lines[2])).toEqual({ from: 20, to: 20 });
  });
});

describe('rangeLabel', () => {
  const bars = songBars(parseSolfa(OLD100, { time: '4/4' }));
  it.each([
    [{ from: 16, to: 20, loop: false }, 'Playing bar 5'],
    [{ from: 16, to: 20, loop: true }, 'Looping bar 5'],
    [{ from: 16, to: 24, loop: true }, 'Looping bars 5–6'],
    [{ from: 16, to: 48, loop: false }, 'Playing from bar 5'],
    [{ from: 0, to: 48, loop: true }, 'Looping the song'],
  ])('says %j as %j', (range, said) => {
    expect(rangeLabel(range, bars)).toBe(said);
  });
});

describe('a line of music open to edit, in place of its bars', () => {
  const song = parseSolfa(OLD100, { time: '4/4' });
  /** Each line's first beat and the beat after its last. */
  const spans = (systems: ReturnType<typeof layoutScore>) => systems.map((s) => [s.start, s.start + s.beats]);

  it('leaves its bars out, and no line runs across them', () => {
    // Bars 4 and 5 (beats 12 to 20) open, on a phone's width.
    const lines = spans(layoutScore(song, { maxChars: 44, skip: { from: 12, to: 20 } }));
    expect(lines.every(([from, to]) => to <= 12 || from >= 20)).toBe(true);
    expect(lines.filter(([, to]) => to <= 12).at(-1)?.[1]).toBe(12);
    expect(lines.find(([from]) => from >= 20)?.[0]).toBe(20);
    expect(lines.reduce((n, [from, to]) => n + to - from, 0)).toBe(48 - 8);
  });

  it('just breaks the lines for a line with no bars yet', () => {
    const lines = spans(layoutScore(song, { maxChars: 44, skip: { from: 20, to: 20 } }));
    expect(lines.every(([from, to]) => to <= 20 || from >= 20)).toBe(true);
    expect(lines.reduce((n, [from, to]) => n + to - from, 0)).toBe(48);
    // At the end: nothing changes.
    expect(layoutScore(song, { maxChars: 44, skip: { from: 48, to: 48 } })).toEqual(layoutScore(song, { maxChars: 44 }));
  });

  it('keeps the section’s heading on its first line only', () => {
    const systems = layoutScore(song, { skip: { from: 0, to: 8 } });
    expect(systems[0]).toMatchObject({ start: 8, heading: null });
  });
});
