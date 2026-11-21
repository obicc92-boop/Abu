import { describe, expect, it } from '@jest/globals';

import { GRACE, OLD100 } from '@/data/demo-songs';
import { songPieces } from '@/lib/song-pieces';
import { parseSolfa } from '@/solfa';

import { barAt, beatOffset, lineBeats, lineOfBar, musicLines, rangeLabel, songBars } from '../bars';
import { layoutScore, rowsLine } from '../layout';

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

describe('beatOffset: where a beat starts in a row as written, for the cursor', () => {
  const row = 'm :- /m :m | r :d /f :m |';
  it.each([
    [0, 0],
    [1, 3],
    [2, 6],
    [3, 9],
    [4, 13],
    [5, 16],
    [8, 25],
    [20, 25],
  ])('beat %i starts at %i', (k, at) => {
    expect(beatOffset(row, k)).toBe(at);
  });

  it('passes over an opening bar line, marks in braces, and counts an empty beat (a rest)', () => {
    expect(beatOffset('| d :r |', 1)).toBe(5);
    expect(beatOffset('{Allegro con brio} d :{f}r', 1)).toBe(22);
    expect(beatOffset('d : :m', 2)).toBe(5);
  });
});

describe('a line that doesn’t add up, laid out with its bar lines in step', () => {
  it('pads the parts’ shorter bars with blanks, only where the song doesn’t add up', () => {
    const bad = parseSolfa('S  d :r :m |f :- |\nA  d :r |m :- |', { time: '2/4' });
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(songBars(bad).map((b) => [b.from, b.to])).toEqual([
      [0, 3],
      [3, 5],
    ]);
    const [line] = layoutScore(bad, { oneLine: true });
    const alto = line.rows.find((r) => r.part === 'A')!;
    expect(alto.cells.map((c) => [c.text, c.barStart, !!c.pad])).toEqual([
      ['d', true, false],
      ['r', false, false],
      ['', false, true],
      ['m', true, false],
      ['-', false, false],
    ]);
    // A song that adds up keeps its own beats.
    const good = parseSolfa(OLD100, { time: '4/4' });
    expect(layoutScore(good, { oneLine: true })[0].rows[0].cells.some((c) => c.pad)).toBe(false);
  });

  it('lays a section on one line', () => {
    expect(layoutScore(parseSolfa(OLD100, { time: '4/4' }), { oneLine: true }).map((s) => s.beats)).toEqual([48]);
  });
});

describe('rowsLine: a line written in rows, as one line of the score', () => {
  const rows = [
    { part: 'S', text: 'd :r |m :- |' },
    { part: null, text: 'Glo- ry be' },
    { part: 'A', text: '' },
    { part: null, text: '' },
    { part: 'T', text: 's1 :t1 |d :- |' },
  ];
  const text = rows.map((r) => `${r.part ?? 'W'}  ${r.text}`).join('\n');
  const line = rowsLine(parseSolfa(text, { time: '2/4' }), rows);

  it('keeps the rows in the order they’re written, with an empty row for a part with no notes yet', () => {
    expect(line.system.rows.map((r) => [r.part, r.cells.length])).toEqual([
      ['S', 4],
      ['A', 0],
      ['T', 4],
    ]);
    expect(line.notesRow).toEqual([0, 2, 4]);
    expect(line.wordsRow).toEqual([1, 3, null]);
  });

  it('gives a part with an empty row of words an empty words line, to tap', () => {
    expect(line.system.rows[0].lyrics?.map((l) => l.text)).toEqual(['Glo-', 'ry', 'be']);
    expect(line.system.rows[1].lyrics).toEqual([]);
    expect(line.system.rows[2].lyrics).toBeNull();
  });

  it('makes a line with nothing in it yet a line of empty rows', () => {
    const none = [
      { part: 'S', text: '' },
      { part: 'A', text: '' },
    ];
    const empty = rowsLine(parseSolfa('S\nA'), none);
    expect(empty.system.rows.map((r) => [r.part, r.cells.length])).toEqual([
      ['S', 0],
      ['A', 0],
    ]);
    expect(empty.system.widths).toEqual([]);
  });
});
