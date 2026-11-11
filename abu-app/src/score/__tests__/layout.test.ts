import { describe, expect, it } from '@jest/globals';

import { EKELE, GRACE, OLD100 } from '@/data/demo-songs';
import { parseSolfa } from '@/solfa';

import { displayBeat, layoutScore, lyricSegments } from '../layout';

const barsPerSystem = (song: ReturnType<typeof parseSolfa>, maxBeats?: number) =>
  layoutScore(song, { maxBeats }).map((s) => s.rows[0].cells.filter((c) => c.barStart).length);

describe('layoutScore', () => {
  it('puts Old Hundredth in four lines of three bars, heading on the first', () => {
    const systems = layoutScore(parseSolfa(OLD100, { time: '4/4' }));
    expect(systems.map((s) => [s.heading, s.start, s.beats])).toEqual([
      ['Verse 1', 0, 12],
      [null, 12, 12],
      [null, 24, 12],
      [null, 36, 12],
    ]);
    expect(systems[0].rows.map((r) => r.part)).toEqual(['S', 'A', 'T', 'B']);
    expect(systems[0].rows[0].cells.slice(0, 3)).toEqual([
      { beat: 0, text: 'd', barStart: true, hold: false },
      { beat: 1, text: '-', barStart: false, hold: true },
      { beat: 2, text: 'd', barStart: false, hold: false },
    ]);
  });

  it('widens columns that hold more notes', () => {
    const [sys] = layoutScore(parseSolfa('S  d :d.,r /s.l1 :- |\nA  d :r /m :f |', { time: '4/4' }));
    expect(sys.widths).toEqual([3, 4, 4, 3]);
  });

  it('widens a column when its syllable needs the room', () => {
    const [sys] = layoutScore(parseSolfa('S  d :r /m :f |\nW  Sing cheer-ful-ly', { time: '4/4' }));
    // Room for ~0.7 note characters per letter: "Sing" 4, "cheer-" 5, "ful-" 4; "ly" fits in 3.
    expect(sys.widths).toEqual([4, 5, 4, 3]);
  });

  it('shows words only under the parts that have them', () => {
    const [first] = layoutScore(parseSolfa(OLD100, { time: '4/4' }));
    expect(first.rows.map((r) => r.lyrics !== null)).toEqual([true, false, false, false]);
    expect(first.rows[0].lyrics).toEqual([
      { beat: 0, span: 2, text: 'All' },
      { beat: 2, span: 1, text: 'peo-' },
      { beat: 3, span: 1, text: 'ple' },
      { beat: 4, span: 1, text: 'that' },
      { beat: 5, span: 1, text: 'on' },
      { beat: 6, span: 1, text: 'earth' },
      { beat: 7, span: 1, text: 'do' },
      { beat: 8, span: 4, text: 'dwell,' },
    ]);
  });

  it('spreads bars evenly so no bar is left alone on a line', () => {
    const fourBars = parseSolfa('S  d :r /m :f | s :- /- :- | d :r /m :f | s :- /- :- |', { time: '4/4' });
    expect(barsPerSystem(fourBars)).toEqual([2, 2]);
    const fiveBars = parseSolfa('S  d :r /m :f | s :- /- :- | d :r /m :f | s :- /- :- | d :- /- :- |', { time: '4/4' });
    expect(barsPerSystem(fiveBars)).toEqual([3, 2]);
    expect(barsPerSystem(fiveBars, 8)).toEqual([2, 2, 1]);
  });

  it('starts each section on a new line with its heading', () => {
    const systems = layoutScore(parseSolfa(EKELE, { time: '4/4' }));
    expect(systems.map((s) => [s.heading, s.start])).toEqual([
      ['Verse', 0],
      [null, 8],
      ['Chorus', 16],
    ]);
  });

  it('handles a pickup bar in 3/4', () => {
    const systems = layoutScore(parseSolfa(GRACE, { time: '3/4' }));
    expect(systems.map((s) => [s.start, s.beats])).toEqual([
      [0, 10],
      [10, 12],
    ]);
  });

  it('shows one part on its own, borrowing words from a part that has them', () => {
    const systems = layoutScore(parseSolfa(OLD100, { time: '4/4' }), { only: 'A' });
    expect(systems[0].rows.map((r) => r.part)).toEqual(['A']);
    expect(systems[0].rows[0].lyrics?.[0]).toEqual({ beat: 0, span: 2, text: 'All' });
  });
});

describe('lyricSegments', () => {
  it('keeps a leading gap as an empty segment', () => {
    expect(lyricSegments({ 2: 'Glo-', 3: 'ry' }, 0, 4)).toEqual([
      { beat: 0, span: 2, text: '' },
      { beat: 2, span: 1, text: 'Glo-' },
      { beat: 3, span: 1, text: 'ry' },
    ]);
  });
});

describe('displayBeat', () => {
  it.each([
    ["d'", 'd¹'],
    ['d¹', 'd¹'],
    ["d''", 'd²'],
    ['t1', 't₁'],
    ['t₁', 't₁'],
    ['s2', 's₂'],
    ['s.l1', 's.l₁'],
    ["d.,r'", 'd.,r¹'],
    ['-', '–'],
    ['', ''],
    ['fe', 'fe'],
  ])('shows %j as %j', (input, shown) => {
    expect(displayBeat(input)).toBe(shown);
  });
});
