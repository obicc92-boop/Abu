import { describe, expect, it } from '@jest/globals';

import { barNumbers, barSpans, checkRows } from '../bar-check';
import { alignedRows, splitLine, type LineRow } from '../line-text';
import { parseSolfa } from '@/solfa';

/** The rows as Check the reading shows them, and what its checker says of the line. */
function check(line: string, time: string) {
  const rows = splitLine(line);
  const shown = alignedRows(rows);
  const parsed = parseSolfa(line, { time });
  const marks = checkRows(
    rows.map((r, i) => ({ part: r.part, text: shown[i] })),
    parsed.errors,
    parsed.beatsPerBar,
  );
  return { rows, shown, parsed, marks };
}

const bad = (marks: ReturnType<typeof checkRows>[number]) => marks.bars.filter((b) => b.bad).map((b) => ({ bar: b.bar, beats: b.beats, wrongBeats: b.wrongBeats }));

describe('barSpans', () => {
  it('gives each bar the columns between its bar lines, and its beats', () => {
    const text = 'd :r :m | f :- :s |';
    expect(barSpans(text)).toEqual([
      { bar: 1, from: -1, to: 8, closed: true, first: 0, beats: 3 },
      { bar: 2, from: 8, to: 18, closed: true, first: 10, beats: 3 },
    ]);
  });

  it('counts the text before the first "|" as bar 1, and an opening "|" as no bar', () => {
    expect(barSpans('s1 | d :r |').map((b) => [b.bar, b.from, b.to, b.beats])).toEqual([
      [1, -1, 3, 1],
      [2, 3, 10, 2],
    ]);
    // An opening bar line: the space before it isn't a bar.
    expect(barSpans(' | d :r | m :f').map((b) => [b.bar, b.from, b.to, b.closed])).toEqual([
      [1, 1, 8, true],
      [2, 8, 14, false],
    ]);
  });

  it('runs a last bar with no closing "|" to the end of its text', () => {
    const [last] = barSpans('d :r :m   ');
    expect(last).toMatchObject({ bar: 1, from: -1, to: 7, closed: false, beats: 3 });
  });

  it('makes a row with no "|" one bar, and an empty row none', () => {
    expect(barSpans('d :r :m /f :s :l')).toEqual([{ bar: 1, from: -1, to: 16, closed: false, first: 0, beats: 6 }]);
    expect(barSpans('')).toEqual([]);
    expect(barSpans('   ')).toEqual([]);
  });

  it('skips the gap between two "|" and counts half-bar marks as beats', () => {
    expect(barSpans('d :r || m /f').map((b) => [b.bar, b.beats])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('numbers on from a given bar', () => {
    expect(barSpans('d | r |', 4).map((b) => b.bar)).toEqual([4, 5]);
  });
});

describe('checkRows', () => {
  it('marks each part’s bar 2 with its 9 beats in 3/4, as on the owner’s handwritten sheet', () => {
    const line = [
      "S  l :-.l :s.l | m :m :- /l :-.d' :t. /s :- :- | m :- :-",
      'A  m :m :r.d | t1 :t1 :- /d :m :r. /t1 :- :- | t1 :- :-',
      'W  Glo - ry to God',
      "T  d' :d' :t.l | l :s :- /l :m :f. /s :- :- | s :- :-",
      'B  l :d :r.r | m /m :- /l :d :r.r /s1 :- :- | m :- :-',
    ].join('\n');
    const { parsed, marks } = check(line, '3/4');
    expect(parsed.errors.map((e) => e.message)).toEqual([
      'Soprano, bar 2 has 9 beats; 3/4 needs 3.',
      'Alto, bar 2 has 9 beats; 3/4 needs 3.',
      'Tenor, bar 2 has 9 beats; 3/4 needs 3.',
      'Bass, bar 2 has 9 beats; 3/4 needs 3.',
    ]);
    for (const i of [0, 1, 3, 4]) {
      expect(bad(marks[i])).toEqual([{ bar: 2, beats: 9, wrongBeats: true }]);
      expect(marks[i].whole).toBe(false);
    }
    // The row of words has no bars.
    expect(marks[2]).toEqual({ bars: [], whole: false });
  });

  it('spans the same columns in every part, since the parts’ bars are lined up', () => {
    const line = ['S  d :r :m | f :s :l :t | d\' :- :- |', 'A  d :t1 :d | r :m :f | m :- :- |'].join('\n');
    const { marks } = check(line, '3/4');
    const cols = (i: number) => marks[i].bars.map((b) => [b.from, b.to]);
    expect(cols(0)).toEqual(cols(1));
    expect(bad(marks[0])).toEqual([{ bar: 2, beats: 4, wrongBeats: true }]);
    expect(bad(marks[1])).toEqual([]);
  });

  it('follows a row as it’s typed, by its own bar lines', () => {
    const typed = 'd :r :m | f :s | m :- :- |';
    const line = `S  ${typed}\nA  d :t1 :d | r :m :f | m :- :- |`;
    const parsed = parseSolfa(line, { time: '3/4' });
    const rows: LineRow[] = [
      { part: 'S', text: typed },
      { part: 'A', text: alignedRows(splitLine(line))[1] },
    ];
    const [s] = checkRows(rows, parsed.errors, parsed.beatsPerBar);
    const two = s.bars.find((b) => b.bar === 2);
    expect(two).toMatchObject({ from: 8, to: 15, beats: 2, bad: true, wrongBeats: true });
  });

  it('doesn’t count a short first or last bar as wrong beats, but marks a bad note in it', () => {
    const line = 'S  s1 | d :r :m | q :- |';
    const { parsed, marks } = check(line, '3/4');
    expect(parsed.errors.map((e) => e.message)).toEqual(['Soprano, bar 3: “q” is not a sol-fa note.']);
    expect(bad(marks[0])).toEqual([{ bar: 3, beats: 2, wrongBeats: false }]);
  });

  // Alto, tenor and bass as read right, for a soprano row to be checked against.
  const lower = ['A  d :t1 :d | r :m :f | m :- :- |', 'T  m :s :s | l :s :l | s :- :- |', 'B  d :s1 :m1 | f1 :d :f1 | d :- :- |'];
  const withSoprano = (s: string) => check([`S  ${s}`, ...lower].join('\n'), '3/4');
  const wholes = (marks: ReturnType<typeof checkRows>) => marks.map((m) => m.whole);

  it('marks only the soprano bar with too many beats, not the three parts measured against it', () => {
    const { parsed, marks } = withSoprano('d :r :m | f :- :- :- | m :- :- |');
    expect(parsed.errors.map((e) => e.message)).toContain('Alto has 9 beats but Soprano has 10.');
    expect(bad(marks[0])).toEqual([{ bar: 2, beats: 4, wrongBeats: true }]);
    expect(wholes(marks)).toEqual([false, false, false, false]);
  });

  it('marks only the soprano bar a beat short', () => {
    const { marks } = withSoprano('d :r :m | f :- | m :- :- |');
    expect(bad(marks[0])).toEqual([{ bar: 2, beats: 2, wrongBeats: true }]);
    expect(wholes(marks)).toEqual([false, false, false, false]);
  });

  it('marks only the soprano bar whose bar line was read as a half-bar mark', () => {
    const { parsed, marks } = withSoprano('d :r :m /f :- :- | m :- :- |');
    expect(parsed.errors.map((e) => e.message)).toContain('Alto has 3 bars but Soprano has 2.');
    expect(bad(marks[0])).toEqual([{ bar: 1, beats: 6, wrongBeats: true }]);
    expect(wholes(marks)).toEqual([false, false, false, false]);
  });

  it('marks the soprano as a whole when it has a bar too many and every bar adds up', () => {
    const { parsed, marks } = withSoprano('d :r :m | f :- :- | m :- :- | d :- :- |');
    expect(parsed.errors.map((e) => e.part)).toEqual(['A', 'T', 'B']);
    expect(marks.every((m) => m.bars.every((b) => !b.bad))).toBe(true);
    expect(wholes(marks)).toEqual([true, false, false, false]);
  });

  it('marks an alto bar with a beat too many by its bar alone', () => {
    const line = ['S  d :r :m | f :- :- | m :- :- |', 'A  d :t1 :d | r :m :f :s | m :- :- |', ...lower.slice(1)].join('\n');
    const { marks } = check(line, '3/4');
    expect(bad(marks[1])).toEqual([{ bar: 2, beats: 4, wrongBeats: true }]);
    expect(wholes(marks)).toEqual([false, false, false, false]);
  });

  it('marks both of two parts that don’t match, since neither can be told right', () => {
    const line = ['S  d :r :m | f :- :- |', 'A  d :r :m | f :- :- | m :- :- |'].join('\n');
    const { parsed, marks } = check(line, '3/4');
    expect(parsed.errors.map((e) => e.message)).toEqual(['Alto has 3 bars but Soprano has 2.']);
    expect(wholes(marks)).toEqual([true, true]);
    expect(bad(marks[1])).toEqual([]);
    expect(marks[1].bars).toHaveLength(3);
  });

  it('marks the part whose beats differ but no bar is wrong (a longer upbeat)', () => {
    const line = ['S  s1 | d :r :m |', 'A  m1 :s1 | d :t1 :d |', 'T  m | s :s :s |', 'B  d | m1 :s1 :d |'].join('\n');
    const { parsed, marks } = check(line, '3/4');
    expect(parsed.errors.map((e) => e.message)).toEqual(['Alto has 5 beats but Soprano has 4.']);
    expect(wholes(marks)).toEqual([false, true, false, false]);
    expect(bad(marks[1])).toEqual([]);
  });

  it('marks the parts the checker names when counting can’t tell which is out of step', () => {
    const rows: LineRow[] = [
      { part: 'S', text: 'd :r :m | f :- :- |' },
      { part: 'A', text: 'd :r :m | f :- :- |' },
    ];
    const marks = checkRows(rows, [{ message: 'Alto has 7 beats but Soprano has 6.', part: 'A' }], 3);
    expect(wholes(marks)).toEqual([false, true]);
  });

  it('marks a row with no bar lines as one bar of all its beats', () => {
    const line = ['S  d :r :m /f :s :l', 'A  d :r :m | f :s :l'].join('\n');
    const { parsed, marks } = check(line, '3/4');
    expect(parsed.errors.some((e) => e.part === 'S' && e.bar === 1)).toBe(true);
    expect(bad(marks[0])).toEqual([{ bar: 1, beats: 6, wrongBeats: true }]);
  });

  it('numbers a part’s bars on from its row before, as the checker does', () => {
    const line = ['S  d :r :m | f :s :l |', 'S  m :- :- /r | d :- :- |'].join('\n');
    const { parsed, marks } = check(line, '3/4');
    expect(parsed.errors.map((e) => [e.part, e.bar])).toEqual([['S', 3]]);
    expect(marks[0].bars.map((b) => b.bar)).toEqual([1, 2]);
    expect(bad(marks[1])).toEqual([{ bar: 3, beats: 4, wrongBeats: true }]);
  });

  it('marks the whole part when the checker names a bar its rows don’t have', () => {
    const rows: LineRow[] = [{ part: 'S', text: 'd :r :m | f :s :l |' }];
    const [s] = checkRows(rows, [{ message: 'Soprano, bar 5 …', part: 'S', bar: 5 }], 3);
    expect(s.whole).toBe(true);
    expect(s.bars.every((b) => !b.bad)).toBe(true);
  });

  it('marks nothing on a line that adds up', () => {
    const line = ['S  d :r :m | f :- :- |', 'W  Glo - ry be', 'A  d :t1 :d | r :- :- |'].join('\n');
    const { parsed, marks } = check(line, '3/4');
    expect(parsed.errors).toEqual([]);
    expect(marks.every((m) => !m.whole && m.bars.every((b) => !b.bad))).toBe(true);
  });
});

describe('barNumbers', () => {
  it('numbers the bars where they start, from the part with the most', () => {
    const rows = splitLine(['S  s1 | d :r :m | f :- :- |', 'A  s1 | d :t1 :d |'].join('\n'));
    const shown = alignedRows(rows);
    const numbers = barNumbers(rows.map((r, i) => ({ part: r.part, text: shown[i] })));
    expect(numbers.map((n) => n.bar)).toEqual([1, 2, 3]);
    expect(numbers.map((n) => shown[0][n.at])).toEqual(['s', 'd', 'f']);
  });

  it('has none when a part has two rows, as one strip can’t number both', () => {
    const line = ['S  d :r :m | f :s :l |', 'A  d :r :m | f :s :l |', 'S  m :- :- /r | d :- :- |', 'A  m :- :- | d :- :- |'].join('\n');
    const { shown, parsed, marks } = check(line, '3/4');
    // The checker names the soprano's bar 3, which starts its second row, where a strip of the first rows' bars would say 1.
    expect(parsed.errors.map((e) => [e.part, e.bar])).toContainEqual(['S', 3]);
    expect(bad(marks[2])).toEqual([{ bar: 3, beats: 4, wrongBeats: true }]);
    expect(barNumbers(splitLine(line).map((r, i) => ({ part: r.part, text: shown[i] })))).toEqual([]);
  });

  it('has none for a line with no notes', () => {
    expect(barNumbers([{ part: null, text: 'Glo - ry' }])).toEqual([]);
  });
});

describe('musical markings in braces', () => {
  it('aren’t beats or bar lines', () => {
    expect(barSpans('{p}d :r /{f}m :f |')).toEqual([{ bar: 1, from: -1, to: 17, closed: true, first: 0, beats: 4 }]);
    expect(barSpans('{M.70}d :- |').map((b) => b.beats)).toEqual([2]);
    // Whatever is written in one: a "|" in a mark is no bar line, a ":" no beat.
    expect(barSpans('{a|b}d :r | {♩: 70}m :f |').map((b) => [b.bar, b.from, b.to, b.beats])).toEqual([
      [1, -1, 10, 2],
      [2, 10, 24, 2],
    ]);
    // A mark alone after the last bar line is no bar, as for the checker.
    expect(barSpans('d :r | m :f | {fine}').map((b) => b.bar)).toEqual([1, 2]);
  });

  it('leave the right bars marked in a line with marks in it', () => {
    const line = ['S  {Andante M. 70}{p}d :r /{cresc}m :f | s :- /- | {rit}d :- /- :- |', 'A  {p}d :t1 /d :d | {mf}m :- /- | d :- /- :- |'].join('\n');
    const { parsed, shown, marks } = check(line, '4/4');
    expect(parsed.errors.map((e) => e.message)).toEqual(['Soprano, bar 2 has 3 beats; 4/4 needs 4.', 'Alto, bar 2 has 3 beats; 4/4 needs 4.']);
    expect(bad(marks[0])).toEqual([{ bar: 2, beats: 3, wrongBeats: true }]);
    expect(bad(marks[1])).toEqual([{ bar: 2, beats: 3, wrongBeats: true }]);
    // The parts' bars span the same columns, marks and all.
    expect(marks[0].bars[0].to).toBe(marks[1].bars[0].to);
    expect(barNumbers(splitLine(line).map((r, i) => ({ part: r.part, text: shown[i] }))).map((n) => n.bar)).toEqual([1, 2, 3]);
  });
});

describe('slurs in round brackets', () => {
  it('aren’t beats or bar lines', () => {
    expect(barSpans("(m'.d') :(d'.s) | (s :f |m) :- |").map((b) => [b.bar, b.beats])).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const { parsed, marks } = check(['S  (d :r /m) :f | (s :- /-) |', 'A  d :t1 /d :d | m :- /- :- |'].join('\n'), '4/4');
    expect(parsed.errors.map((e) => e.message)).toEqual(['Alto has 8 beats but Soprano has 7.']);
    expect(marks[0].bars.map((b) => b.beats)).toEqual([4, 3]);
  });
});
