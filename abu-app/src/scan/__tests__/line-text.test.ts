import { describe, expect, it } from '@jest/globals';

import {
  alignedRows,
  barColumns,
  changedShare,
  freeRepair,
  joinLine,
  keepsParts,
  problemsByPart,
  splitLine,
  tidyNotes,
  tidyTitle,
  withBarLinesInStep,
  withBarsInStep,
  withFullEmptyBars,
  withGapsAsBars,
  withHalfBarsAsBars,
  withoutNameColumn,
  withRestingEdges,
  withShortBarsJoined,
  withSpacedBeats,
  withWords,
  wordsOf,
} from '../line-text';
import { parseSolfa } from '@/solfa';

describe('tidyNotes', () => {
  it('joins a bridge note typed with spaces', () => {
    expect(tidyNotes("d' = f :f . f |")).toBe("d'=f :f.f |");
  });
});

describe('free repairs', () => {
  const passes = (t: string) => !parseSolfa(t, { time: '4/4' }).errors.length;

  it('puts back beat marks a typist left out, only where that gives a bar its beats', () => {
    const line = ['S  s1 :t1.d :d :t1.s1 | d : m : r -.s1 | m : r : d : - |', 'A  s1 :s1.s1 :s1 :- | s1 : s1 : s1 -.s1 | s1 : f1 : m1 : - |'].join('\n');
    expect(withSpacedBeats(line, 4)).toBe(['S  s1 :t1.d :d :t1.s1 | d : m : r :-.s1 | m : r : d : - |', 'A  s1 :s1.s1 :s1 :- | s1 : s1 : s1 :-.s1 | s1 : f1 : m1 : - |'].join('\n'));
    // Spaces around "." aren't beat marks, and a bar that already has its beats is left alone.
    expect(withSpacedBeats('S  d . r :m :f :s | m : - : r : d |', 4)).toBeNull();
    // Three spaces where one beat is missing: which one? Left for the person.
    expect(withSpacedBeats('S  d r m f : s | m : r : d : - |', 4)).toBeNull();
  });

  it('gives parts resting through the upbeat an empty bar there', () => {
    const line = ['S  m | s : r / r : m | f : - / - : - |', 'A  m | r : t1 / t1 : d | r : - / - : - |', "T  : / : | : / d' : - |", 'B  : / : | : / m : - |'].join('\n');
    expect(withRestingEdges(line)).toBe(['S  m | s : r / r : m | f : - / - : - |', 'A  m | r : t1 / t1 : d | r : - / - : - |', "T  x | : / : | : / d' : - |", 'B  x | : / : | : / m : - |'].join('\n'));
    // Bars that only differ in the middle aren't moved.
    expect(withRestingEdges(['S  d :r / m :f | s :- / - :- |', 'A  d :r / m :f |'].join('\n'))).toBeNull();
  });

  it('reads half-bar marks as bar lines where they cut a long bar into whole bars', () => {
    // A 4/4 sheet whose tall and short bar lines came out alike, read as 2/4: plays the same.
    expect(withHalfBarsAsBars('S  / : / : m.m / f.,s :-.l / - :- |', 2)).toBe('S  : | : m.m | f.,s :-.l | - :- |');
    // Half-bars of a 4/4 bar that's too long for another reason stay.
    expect(withHalfBarsAsBars('S  d :r / m :f s :l / t :d\' |', 4)).toBeNull();
  });

  it('joins two short bars into one where every part makes a whole bar of them', () => {
    // A tall "|" drawn through a small box of a boxed sheet, taken for the box's border.
    const read = ['S  l :d /- :l | s :d | d :d | t :- /- :- |', 'A  f :l /- :f | m :m | m :d | r :- /- :- |'].join('\n');
    expect(withShortBarsJoined(read, 4)).toBe(['S  l :d /- :l | s :d / d :d | t :- /- :- |', 'A  f :l /- :f | m :m / m :d | r :- /- :- |'].join('\n'));
    expect(freeRepair(read, passes, 4)).toBe(withShortBarsJoined(read, 4));
    // Not where one part's bars don't make a whole bar, nor in 2/4 where they're whole already.
    expect(withShortBarsJoined(['S  s :d | d :d |', 'A  m :m | m :d :r |'].join('\n'), 4)).toBeNull();
    expect(withShortBarsJoined('S  s :d | d :d |', 2)).toBeNull();
  });

  it('puts in bar lines left out between notes, only where every piece is a whole bar', () => {
    expect(withGapsAsBars('S  : m : m : s l : - : f : m r : - : - : l |', 4)).toBe('S  : m : m : s | l : - : f : m | r : - : - : l |');
    // A part's name read as a note ("s") isn't an upbeat.
    expect(withGapsAsBars('S  s r : - .d : - :t1 d : - : s : - |', 4)).toBeNull();
  });

  it('fills out a silent bar typed short, but not a double bar line', () => {
    const line = (s: string) => [`S  d :r :m :f | ${s} | s :- :- :- |`, 'A  d :r :m :f | m :- :- :- | s :- :- :- |'].join('\n');
    expect(withFullEmptyBars(line(':'), 4)).toBe(line(': : :'));
    expect(withFullEmptyBars(line(''), 4)).toBeNull();
  });

  it('keeps a repair only when the line then passes', () => {
    const fixable = ['S  m | d : m : r -.s1 | d : - : - : - |', 'A  s1 | s1 : s1 : s1 -.s1 | s1 : - : - : - |', 'T  d : d : t1 :-.t1 | d : - : - : - |'].join('\n');
    expect(freeRepair(fixable, passes, 4)).toBe(['S  m | d : m : r :-.s1 | d : - : - : - |', 'A  s1 | s1 : s1 : s1 :-.s1 | s1 : - : - : - |', 'T  x | d : d : t1 :-.t1 | d : - : - : - |'].join('\n'));
    expect(freeRepair('S  d r m f : s | m : r : d : - |', passes, 4)).toBeNull();
  });
});

describe('bar lines in step in every part', () => {
  const passes = (time: string) => (t: string) => !parseSolfa(t, { time }).errors.length;
  // As read from the owner's handwritten sheet in 3/4: the bar lines ruled by hand came out as half-bar marks, so every part's bar 2 has 9 beats.
  const READ = [
    "S  l :-.l :s.l | m :m :- /l :-.d' :t.l /s :- :- |",
    'A  m :m :r.d | t1 :t1 :- /d :m :r.d /t1 :- :- |',
    'W  Sing: glo-ry to God on high',
    "T  d' :d' :t.l | l :s :- /l :m :f.m /r :- :- |",
    'B  l :d :r.r | m /m :- /l :d :r.r /s1 :- :- |',
  ].join('\n');
  const FIXED = [
    "S  l :-.l :s.l | m :m :- | l :-.d' :t.l | s :- :- |",
    'A  m :m :r.d | t1 :t1 :- | d :m :r.d | t1 :- :- |',
    'W  Sing: glo-ry to God on high',
    "T  d' :d' :t.l | l :s :- | l :m :f.m | r :- :- |",
    'B  l :d :r.r | m /m :- | l :d :r.r | s1 :- :- |',
  ].join('\n');

  it('cuts a bar too long in every part alike into whole bars, at the same beats in each', () => {
    expect(passes('3/4')(READ)).toBe(false);
    // The bass's "/" after its first beat doesn't fall on a bar's end, so it stays; the words are left as they are.
    expect(withBarsInStep(READ, 3)).toBe(FIXED);
    expect(passes('3/4')(FIXED)).toBe(true);
    // Cutting each part at its own "/" marks can't do it: the bass would be left a bar too long.
    expect(passes('3/4')(withHalfBarsAsBars(READ, 3) ?? READ)).toBe(false);
  });

  it('lets the line start with an upbeat and end with a short bar', () => {
    const upbeat = ['S  s /d :r :m /f :- :s | l :- :- |', 'A  m /m :m :d /r :- :m | f :- :- |'].join('\n');
    expect(withBarsInStep(upbeat, 3)).toBe(['S  s | d :r :m | f :- :s | l :- :- |', 'A  m | m :m :d | r :- :m | f :- :- |'].join('\n'));
    const ending = ['S  d :r :m | f :- :m /r :- |', 'A  d :t1 :d | r :- :d /t1 :- |'].join('\n');
    expect(withBarsInStep(ending, 3)).toBe(['S  d :r :m | f :- :m | r :- |', 'A  d :t1 :d | r :- :d | t1 :- |'].join('\n'));
    expect(passes('3/4')(withBarsInStep(ending, 3) ?? '')).toBe(true);
    // A short piece in the middle of the line isn't a bar.
    expect(withBarsInStep(['S  d :r :m | f :- :m /r :- :d /t1 | d :- :- |', 'A  d :r :m | f :- :m /r :- :d /t1 | d :- :- |'].join('\n'), 3)).toBeNull();
  });

  it('leaves a line alone where the parts disagree, or that already adds up', () => {
    // The bass has 8 beats in bar 2, the others 9.
    expect(withBarsInStep(READ.replace('/s1 :- :- |', '/s1 :- |'), 3)).toBeNull();
    // The bass has a bar more.
    expect(withBarsInStep(READ.replace('B  l :d :r.r |', 'B  l | d :r.r |'), 3)).toBeNull();
    expect(withBarsInStep(FIXED, 3)).toBeNull();
    // One part has nothing to agree with.
    expect(withBarsInStep('S  d :r :m /f :s :l |', 3)).toBeNull();
  });

  it('only cuts where most parts have a half-bar mark, and an upbeat must be notes', () => {
    // A song in 6 given as 4/4 (from the owner's typed samples): every bar runs long, but a 4-beat bar doesn't end at its "/".
    const six = ["S  f:f:-/-:-:l' | l':f:s/-:r':- | r':-:m/m:m:- |", "A  r:r:-/-:-:f' | f':r:m/-:t1:- | t1:-:d/d:d:- |"].join('\n');
    expect(withBarsInStep(six, 4)).toBeNull();
    // Bar lines read as ":" in every part: left for the person.
    expect(withBarsInStep(READ.replace(/ \//g, ' :'), 3)).toBeNull();
    // A part's name read before the first bar (also from the samples).
    expect(withBarsInStep(['S  S/A : : : m1 | s1 :s1 :s1 :s1 |', 'A  T/B : : : d | d :d :d :d |'].join('\n'), 4)).toBeNull();
  });

  it('leaves a line of one bar that an upbeat of half a bar fits as well', () => {
    // A 4/4 line with its bar lines (after beats 2 and 6) read as "/": a cut after beat 4 would add up too, every bar line half a bar off.
    const four = ['S  s :l /d :r /m :f /s :- |', 'A  m :f /s :l /d :r /m :- |', 'T  d :d /d :d /s :s /d :- |', 'B  d :f /m :f /s :s1 /d :- |'].join('\n');
    expect(withBarsInStep(four, 4)).toBeNull();
    expect(freeRepair(four, passes('4/4'), 4)).toBeNull();
    // In 6/8: after beats 3 and 9, or after beat 6?
    expect(withBarsInStep(["S  s :l :t /d' :- :t /l :- :s /f :- :- |", 'A  m :f :s /l :- :s /f :- :m /r :- :- |'].join('\n'), 6)).toBeNull();
    // With no half-bar marks only one cut fits, and it's made.
    const plain = ['S  s :l :t :d /r :m :f :s /l :- :- :- |', 'A  m :f :s :l /t :d :r :m /f :- :- :- |'].join('\n');
    expect(withBarsInStep(plain, 4)).toBe(['S  s :l :t :d | r :m :f :s | l :- :- :- |', 'A  m :f :s :l | t :d :r :m | f :- :- :- |'].join('\n'));
  });

  it('leaves a bar where a part’s own "/" sits a beat from a cut: it lost a beat and gained one', () => {
    // The alto lost its second t1 and gained a hold: its "/" marks fall after beats 2 and 5 of bar 2, the others' after 3 and 6.
    const shifted = READ.replace('A  m :m :r.d | t1 :t1 :- /d :m :r.d /t1 :- :- |', 'A  m :m :r.d | t1 :- /d :m :r.d /t1 :- :- :- |');
    expect(withBarsInStep(shifted, 3)).toBeNull();
    expect(freeRepair(shifted, passes('3/4'), 3)).toBeNull();
    // A part with ":" at a cut and no "/" near it (its bar line read as a beat mark) is cut with the others.
    expect(withBarsInStep(READ.replace('A  m :m :r.d | t1 :t1 :- /d', 'A  m :m :r.d | t1 :t1 :- :d'), 3)).toBe(FIXED);
  });

  it('leaves a lone beat of rest at the line’s start to the half-bar repair: it’s more likely an opening bar line', () => {
    const line = ['S  / : / : m.m / f.,s :-.l / - :- | s :- |', 'A  / : / : d.d / r.,m :-.f / - :- | m :- |'].join('\n');
    expect(withBarsInStep(line, 2)).toBeNull();
    expect(freeRepair(line, passes('2/4'), 2)).toBe(['S  : | : m.m | f.,s :-.l | - :- | s :- |', 'A  : | : d.d | r.,m :-.f | - :- | m :- |'].join('\n'));
  });

  it('gives a part the bar line most parts have after the same beat', () => {
    const line = ['S  d :r /m :f | s :- /- :- |', 'A  d :t1 /d :r / m :- /- :- |', 'T  m :s /s :l | s :- /- :- |', 'B  d :s1 /l1 :f1 | d :- /- :- |'].join('\n');
    expect(withBarLinesInStep(line, 4)).toBe(line.replace('A  d :t1 /d :r / m', 'A  d :t1 /d :r | m'));
    expect(freeRepair(line, passes('4/4'), 4)).toBe(withBarLinesInStep(line, 4));
  });

  it('turns a bar line only one part has into a beat mark', () => {
    // The alto's half-bar mark read as a bar line ("/" in the middle of a 4/4 bar); the tenor's stray one after beat 3 (":").
    const line = ['S  d :r /m :f | s :- /- :- |', 'A  d :t1 | d :r | m :- /- :- |', 'T  m :s /s | l | s :- /- :- |', 'B  d :s1 /l1 :f1 | d :- /- :- |'].join('\n');
    expect(withBarLinesInStep(line, 4)).toBe(['S  d :r /m :f | s :- /- :- |', 'A  d :t1 / d :r | m :- /- :- |', 'T  m :s /s : l | s :- /- :- |', 'B  d :s1 /l1 :f1 | d :- /- :- |'].join('\n'));
    // In 3/4 there's no middle of the bar: ":".
    const three = ['S  d :r :m | f :- :- |', 'A  d | t1 :d | r :- :- |', 'T  m :s :s | l :- :- |'].join('\n');
    expect(withBarLinesInStep(three, 3)).toBe(three.replace('A  d | t1', 'A  d : t1'));
  });

  it('leaves the bar lines alone when the parts’ beats don’t add up alike', () => {
    const line = ['S  d :r /m :f | s :- /- :- |', 'A  d :t1 /d / m :- /- :- |', 'T  m :s /s :l | s :- /- :- |', 'B  d :s1 /l1 :f1 | d :- /- :- |'].join('\n');
    expect(withBarLinesInStep(line, 4)).toBeNull();
    expect(withBarLinesInStep(['S  d :r /m :f | s :- /- :- |', 'A  d :r /m :f | s :- /- :- |'].join('\n'), 4)).toBeNull();
  });

  it('leaves a part whose bar line is a beat off: it more likely lost a beat and gained one', () => {
    // The alto's bar 1 has a beat too many and its bar 2 one too few: moving its bar line would shift its notes.
    const line = ['S  d :r /m :f | s :- /- :- | d :- /- |', 'A  d : :t1 /d :r | m :- /- | d :- /- |', 'T  m :s /s :l | s :- /- :- | m :- /- |', 'B  d :s1 /l1 :f1 | d :- /- :- | d :- /- |'].join('\n');
    expect(withBarLinesInStep(line, 4)).toBeNull();
    expect(freeRepair(line, passes('4/4'), 4)).toBeNull();
    // The alto lost its bar line, and its second "/" is after beat 5 where the others have theirs after 6: a bar line after beat 4 would leave it a beat off.
    const late = ['S  d :r /m :f | s :- /- :- |', 'A  t1 :d /r :m :f /s :- :- |', 'T  s1 :t1 /d :r | m :- /- :- |', 'B  d :s1 /d :r | d :- /- :- |'].join('\n');
    expect(withBarLinesInStep(late, 4)).toBeNull();
    expect(freeRepair(late, passes('4/4'), 4)).toBeNull();
    // In 2/4 half a bar is one beat: a bar line a beat off is still a shift.
    const two = ['S  d :r | m :f | s :- |', 'A  t1 | d :r :m | f :- |', 'T  s1 :t1 | d :r | m :- |', 'B  d :s1 | d :r | d :- |'].join('\n');
    expect(withBarLinesInStep(two, 2)).toBeNull();
    expect(freeRepair(two, passes('2/4'), 2)).toBeNull();
  });

  it('puts back bar lines lost in every part as a free repair', () => {
    expect(freeRepair(READ, passes('3/4'), 3)).toBe(FIXED);
  });
});

describe('an AI answer kept only with every part', () => {
  const reading = ['S  d :r | m :f |', 'W  O come let us', 'A  s1 :t1 | d :d |', 'T  m :s | s :l |', 'B  d :s1 | d :f1 |'].join('\n');

  it('keeps an answer that changes notes but keeps the parts', () => {
    expect(keepsParts(['S  d :r | m :- |', 'A  s1 :t1 | d :- |', 'T  m :s | s :- |', 'B  d :s1 | d :- |'].join('\n'), reading)).toBe(true);
  });

  it('turns away an answer that drops a part, empties one, or copies one onto others', () => {
    expect(keepsParts(['S  d :r | m :f |', 'A  s1 :t1 | d :d |'].join('\n'), reading)).toBe(false);
    expect(keepsParts(['S  d :r | m :f |', 'A  s1 :t1 | d :d |', 'T  m :s | s :l |', 'B  : | : |'].join('\n'), reading)).toBe(false);
    expect(keepsParts(['S  d :r | m :f |', 'A  d :r | m :f |', 'T  d :r | m :f |', 'B  d :r | m :f |'].join('\n'), reading)).toBe(false);
  });

  it('lets a part that was resting rest, and parts the reading had alike stay alike', () => {
    const resting = ['S  d :r | m :f |', 'A  d :r | m :f |', 'T  : | : |'].join('\n');
    expect(keepsParts(resting, resting)).toBe(true);
  });
});

describe('a scanned line as rows', () => {
  const TEXT = ['S  s1 | d :r /m :f |', 'W  O come let us', 'A  s1 | d :t1 /d :d |'].join('\n');

  it('splits into rows of notes and words, in order, and back', () => {
    const rows = splitLine(TEXT);
    expect(rows).toEqual([
      { part: 'S', text: 's1 | d :r /m :f |' },
      { part: null, text: 'O come let us' },
      { part: 'A', text: 's1 | d :t1 /d :d |' },
    ]);
    expect(joinLine(rows)).toBe(TEXT);
  });

  it('keeps the rows of words where they were printed, whoever read the notes', () => {
    expect(wordsOf(TEXT)).toEqual([{ after: 0, text: 'O come let us' }]);
    // A reader's version with its words in the wrong place (or none): the printed ones go back under the soprano.
    const read = 'S  s1 | d :r /m :f |\nA  s1 | d :t1 /d :d |\nW  0 come let';
    expect(withWords(read, wordsOf(TEXT))).toBe(TEXT);
    // Words read after the alto, in a four-part line.
    expect(withWords('S  d |\nA  d |\nT  d |\nB  d |', [{ after: 1, text: 'Glo-ry' }])).toBe('S  d |\nA  d |\nW  Glo-ry\nT  d |\nB  d |');
    expect(withWords('S  d |', [])).toBe('S  d |');
  });

  it('drops a column of part names read as notes', () => {
    // "S A T B" printed before the first bar: read as s, nothing, r, d.
    const read = ['S  s | d :- /d :t1 |', 'A  | s1 :- /l1 :s1 |', 'T  r | m :- /f :r |', 'B  d | d1 :- /f1 :s1 |'].join('\n');
    expect(withoutNameColumn(read)).toBe(['S  d :- /d :t1 |', 'A  s1 :- /l1 :s1 |', 'T  m :- /f :r |', 'B  d1 :- /f1 :s1 |'].join('\n'));
    // An upbeat column has notes with marks in every part: left alone.
    expect(withoutNameColumn(['S  s1 | d :r |', 'A  m1 | d :t1 |'].join('\n'))).toBeNull();
    expect(withoutNameColumn(['S  s | d :r |', 'A  d | d :t1 |'].join('\n'))).toBeNull();
  });

  it('puts the checker’s messages under their part', () => {
    const { byPart, other } = problemsByPart(['Alto, bar 2 has 5 beats; 4/4 needs 4.', 'Tenor has 3 bars but Soprano has 4.'], ['S', 'A', 'T']);
    expect(byPart).toEqual({ A: ['Bar 2 has 5 beats; 4/4 needs 4.'], T: ['Tenor has 3 bars but Soprano has 4.'] });
    expect(other).toEqual([]);
  });
});

describe('titles', () => {
  it('turns a title printed in capitals into a title', () => {
    expect(tidyTitle('OLD HUNDREDTH')).toBe('Old Hundredth');
    expect(tidyTitle('THOU CROWNEST THE YEAR')).toBe('Thou Crownest the Year');
    expect(tidyTitle('Amazing Love')).toBe('Amazing Love');
    expect(tidyTitle('')).toBe('');
  });
});

describe('rows lined up for checking', () => {
  // As read from the sheet in the owner's screenshot: each part's bars start in different columns.
  const TEXT = [
    'S  : / : s.l,t | d\'.d\' : d\'.d\' / d\'.t,l : s.f |',
    'W  Blessing and honour, glory and pow’r be unto',
    'A  : d.m,f / s.s : s.s | s.f,m : r.d / r : s |',
    'T  : / : | : / : s.l,t |',
    'B  d\'.d :d\'.d\' / d\'.t,l : s.f | m : .l / s .s : |',
  ].join('\n');
  const rows = splitLine(TEXT);
  const shown = alignedRows(rows);

  it('starts each bar, and each beat, in the same column in every part', () => {
    expect(shown).toEqual([
      "     :      /       :s.l,t | d'.d' :d'.d' /d'.t,l :s.f   |",
      'Blessing and honour, glory and pow’r be unto',
      '     :d.m,f /s.s    :s.s   | s.f,m :r.d   /r      :s     |',
      '     :      /       :      |       :      /       :s.l,t |',
      "d'.d :d'.d' /d'.t,l :s.f   | m     :.l    /s.s    :      |",
    ]);
    // Every part's bar lines fall in the same columns, so they're drawn as one line through the parts.
    expect(barColumns(shown[0])).toEqual([27, 57]);
    expect(barColumns(shown[2])).toEqual(barColumns(shown[0]));
    expect(barColumns(shown[4])).toEqual(barColumns(shown[0]));
    expect(barColumns(shown[3])).toEqual(barColumns(shown[0]));
    expect(barColumns(shown[1])).toEqual([]);
  });

  it('only adds spaces: each row reads the same', () => {
    const time = { time: '4/4' };
    const again = joinLine(rows.map((r, i) => ({ ...r, text: shown[i] })));
    expect(parseSolfa(again, time).errors).toEqual(parseSolfa(TEXT, time).errors);
    expect(rows.map((r, i) => (r.part ? tidyNotes(shown[i]).replace(/ /g, '') : shown[i]))).toEqual(rows.map((r) => (r.part ? tidyNotes(r.text).replace(/ /g, '') : r.text)));
  });

  it('lines up whole bars when the parts don’t agree on the beats in one', () => {
    const [a, b] = alignedRows(splitLine('S  d :r :m | f :s |\nA  d :r | m :f |'));
    expect(a.indexOf('|')).toBe(b.indexOf('|'));
  });
});

describe('how much a correction changed', () => {
  const draft = 'S  d :r /m :f | s :- /- :- |\nA  d :t1 /d :r | m :- /- :- |';
  it('counts the symbols added, taken out or swapped, over the reading’s', () => {
    expect(changedShare(draft, draft)).toBe(0);
    // One note swapped in 32 symbols; spacing and words rows don't count.
    expect(changedShare('S  d :r /m :f | s :- /- :- |\nW  Glo-ry\nA  d :t1 /d :m | m :- /- :- |', draft)).toBe(1 / 32);
    // A rewrite changes most of it.
    expect(changedShare('S  m :f /s :l | t :d\' /r\' :m\' |\nA  s :l /t :d\' | r\' :- /- :- |', draft)).toBeGreaterThan(0.2);
    expect(changedShare('S  d :r |', '')).toBe(1);
  });
});
