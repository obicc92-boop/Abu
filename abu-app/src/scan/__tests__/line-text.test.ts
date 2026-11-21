import { describe, expect, it } from '@jest/globals';

import { alignedRows, barColumns, bestFree, changedShare, freeRepair, joinLine, keepsParts, namesNotWords, noteColumns, problemsByPart, sectionBeforeWords, sectionInWords, splitLine, tidyNotes, tidyTitle, withBarLinesInStep, withBarsInStep, withBridgeNotes, withFullEmptyBars, withGapsAsBars, withHalfBarsAsBars, withoutNameColumn, withRestingEdges, withShortBarsJoined, withSpacedBeats, withWords, wordsAsSpaced, wordsOf, wordsPreferring, wordsUnderNotes } from '../line-text';
import { parseSolfa, splitWords } from '@/solfa';

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

describe('words under their notes', () => {
  it('finds where each note is written, not its holds or rests', () => {
    expect(noteColumns("m'.m' :-.t /d' :s |")).toEqual([0, 3, 9, 12, 16]);
    expect(noteColumns('d :- /x :s=d |')).toEqual([0, 9]);
  });

  it('sets each syllable under the note it is sung on, as the checker pairs them', () => {
    // The owner's soprano: "Ke-re-si-me-sie" over m'.m' :-.t /d' :s.
    expect(wordsUnderNotes('Ke-re-si-me-sie', "m'.m' :-.t /d' :s |")).toEqual([
      { text: 'Ke-', at: 0 },
      { text: 're-', at: 4 },
      { text: 'si-', at: 9 },
      { text: 'me-', at: 13 },
      { text: 'sie', at: 17 },
    ]);
  });

  it('carries a syllable over a note for a lone "-", and lets syllables past the notes follow on', () => {
    expect(wordsUnderNotes('Glo - ry to', 'd :r :m |')).toEqual([
      { text: 'Glo', at: 0 },
      { text: 'ry', at: 6 },
      { text: 'to', at: 9 },
    ]);
  });
});

describe('note names read as words', () => {
  it('spots a row of sol-fa names, not a row of words', () => {
    expect(namesNotWords('fa - mi - fa - mi - re - doh')).toBe(true);
    expect(namesNotWords('doo - sol - mi - fa - sol - la - sol - fa - mi - doo -')).toBe(true);
    expect(namesNotWords('Ke-re-si-me-sie lu te go')).toBe(false);
    expect(namesNotWords('Do re mi')).toBe(true);
    expect(namesNotWords('la la')).toBe(false);
  });
});

describe('whose words to keep', () => {
  it('keeps an answer’s words under each part it gave them for, and the app’s under the others', () => {
    const answer = ['S  d :r |', 'W  Ke-re-si-me', 'A  m :f |', 'T  s :l |', 'W  Le kwa-nu'].join('\n');
    const mine = [
      { after: 0, text: 'Fare-91-me' },
      { after: 1, text: 'Ve-re Sy me' },
      { after: 2, text: 'Le Kwenue' },
    ];
    expect(wordsPreferring(wordsOf(answer), mine)).toEqual([
      { after: 0, text: 'Ke-re-si-me' },
      { after: 1, text: 'Ve-re Sy me' },
      { after: 2, text: 'Le kwa-nu' },
    ]);
    expect(withWords(answer, wordsPreferring(wordsOf(answer), mine))).toBe(
      ['S  d :r |', 'W  Ke-re-si-me', 'A  m :f |', 'W  Ve-re Sy me', 'T  s :l |', 'W  Le kwa-nu'].join('\n'),
    );
  });
});

describe('bridge notes read as two notes run together', () => {
  it('become bridge notes where every part’s moves doh the same way', () => {
    expect(withBridgeNotes('S  d :r /sd :r |\nW  Glo-ry\nA  m :f /m1l1 :t1 |')).toBe('S  d :r /s=d :r |\nW  Glo-ry\nA  m :f /m1=l1 :t1 |');
    expect(withBridgeNotes("S  d :r | d'f :- |\nA  d :t1 | s1d :- |")).toBe("S  d :r | d'=f :- |\nA  d :t1 | s1=d :- |");
  });

  it('are left alone where they don’t agree, only one part of several has one, or doh wouldn’t move', () => {
    expect(withBridgeNotes('S  sd :r |\nA  rd :t1 |')).toBeNull();
    expect(withBridgeNotes('S  sd :r |\nA  m :t1 |')).toBeNull();
    expect(withBridgeNotes('S  dd :r |\nA  ll :r |')).toBeNull();
    // One part's alone, even in a line of one part: more likely misread notes.
    expect(withBridgeNotes('S  d :m=s : |'.replace('=', ''))).toBeNull();
    expect(withBridgeNotes('S  sd :rl |')).toBeNull();
    expect(withBridgeNotes('S  d :de /ta :fe |')).toBeNull();
  });

  it('make a line add up as a free repair', () => {
    const passes = (t: string) => !parseSolfa(t, { time: '4/4' }).errors.length;
    expect(freeRepair('S  d :r /m :f | sd :- /- :- |\nA  d :t1 /d :r | m1l1 :- /- :- |', passes, 4)).toBe('S  d :r /m :f | s=d :- /- :- |\nA  d :t1 /d :r | m1=l1 :- /- :- |');
  });
});

describe('a row of words to type in', () => {
  it('starts with each syllable under its note, and reads as the same words', () => {
    const notes = 'm :- .f |s :l |t :d’ |';
    const words = 'Bless-ing and hon-our';
    const spaced = wordsAsSpaced(words, notes.replace('’', "'"));
    const cols = noteColumns(notes.replace('’', "'"));
    // Each syllable starts at its note's column, or a space after the one before it when that one is wider.
    const syllables = splitWords(words);
    let free = 0;
    syllables.forEach((w, k) => {
      const at = spaced.indexOf(w, free);
      expect(at).toBe(Math.max(cols[k], free ? free + 1 : 0));
      free = at + w.length;
    });
    expect(splitWords(spaced)).toEqual(syllables);
  });
});

describe('musical markings in braces', () => {
  // Marks ({p}, {cresc}, {Andante M. 70}) are written just before the note they start on; the checker takes them
  // out before counting beats, and so must every helper here: never a beat, a note or a bar line, and kept in place.
  const passes = (time: string) => (t: string) => !parseSolfa(t, { time }).errors.length;

  it('are tidied as written, not as notes', () => {
    expect(tidyNotes('{p}d . r :{Andante  M. 70} m |')).toBe('{p}d.r :{Andante M. 70} m |');
    expect(tidyNotes('{ cresc }d :r |')).toBe('{cresc}d :r |');
    // One still being typed is left as it is.
    expect(tidyNotes('d :r {Andante M. 7')).toBe('d :r {Andante M. 7');
  });

  it('take their room in the columns but are never split, and their "|" or ":" is no bar line or beat', () => {
    const rows = [
      { part: 'S', text: '{p}d :r /{f}m :f | {tempo: 70}s :- |' },
      { part: 'A', text: 'd :t1 /d :d | m :- |' },
    ];
    const shown = alignedRows(rows);
    // Only spaces are added, and each bar line is in the same column in both rows.
    expect(shown.map((t) => t.replace(/\s/g, ''))).toEqual(rows.map((r) => r.text.replace(/\s/g, '')));
    expect(barColumns(shown[0])).toEqual(barColumns(shown[1]));
    expect(barColumns('{a|b}d :r |')).toEqual([10]);
    // A part's notes are where the notes are, after their marks.
    expect(noteColumns('{p}d :r /{f}m :f |')).toEqual([3, 6, 12, 15]);
    expect(wordsUnderNotes('O come', '{Andante M. 70}d :r |').map((w) => w.at)).toEqual([15, 18]);
  });

  it('aren’t beats when beat marks a typist left out are put back', () => {
    const line = (bar: string) => `S  d :r :m :f | ${bar} | s :- :- :- |`;
    expect(withSpacedBeats(line('{Andante M. 70}d :r m :f'), 4)).toBe(line('{Andante M. 70}d :r :m :f'));
    // A space after a mark isn't a gap between notes; one before a mark is.
    expect(withSpacedBeats(line('{p} d r :m :f'), 4)).toBe(line('{p} d :r :m :f'));
    expect(withSpacedBeats(line('d {p}r :m :f'), 4)).toBe(line('d :{p}r :m :f'));
    expect(withSpacedBeats(line('d :r :m :f {rit}'), 4)).toBeNull();
    expect(withGapsAsBars('S  {p}s :- : m : r d : - : - : {rit}m.s |', 4)).toBe('S  {p}s :- : m : r | d : - : - : {rit}m.s |');
  });

  it('stay where they are when bar lines are put back in step', () => {
    const READ = [
      "S  {Andante M. 70}l :-.l :s.l | m :m :- /{cresc}l :-.d' :t.l /s :- :- |",
      'A  {p}m :m :r.d | t1 :t1 :- /d :m :r.d /t1 :- :- |',
      "T  d' :d' :t.l | l :s :- /l :m :f.m /{rit}r :- :- |",
      'B  l :d :r.r | m /m :- /l :d :r.r /s1 :- :- |',
    ].join('\n');
    const FIXED = [
      "S  {Andante M. 70}l :-.l :s.l | m :m :- | {cresc}l :-.d' :t.l | s :- :- |",
      'A  {p}m :m :r.d | t1 :t1 :- | d :m :r.d | t1 :- :- |',
      "T  d' :d' :t.l | l :s :- | l :m :f.m | {rit}r :- :- |",
      'B  l :d :r.r | m /m :- | l :d :r.r | s1 :- :- |',
    ].join('\n');
    expect(withBarsInStep(READ, 3)).toBe(FIXED);
    expect(passes('3/4')(FIXED)).toBe(true);
    const line = ['S  {mf}d :r /m :f | s :- /- :- |', 'A  {mf}d :t1 /d :r / m :- /- :- |', 'T  {mf}m :s /s :l | s :- /- :- |', 'B  {mf}d :s1 /l1 :f1 | {dim}d :- /- :- |'].join('\n');
    expect(withBarLinesInStep(line, 4)).toBe(line.replace('A  {mf}d :t1 /d :r / m', 'A  {mf}d :t1 /d :r | m'));
    expect(freeRepair(line, passes('4/4'), 4)).toBe(withBarLinesInStep(line, 4));
  });

  it('don’t count as a bar on their own, or stop a repair', () => {
    // A mark after the last bar line ({fine}) is no bar, as for the checker.
    const line = ['S  d :r :m / f :s :l | s :- :- | {fine}', 'A  d :t1 :d / r :m :f | m :- :- |'].join('\n');
    expect(withBarsInStep(line, 3)).toBe(['S  d :r :m | f :s :l | s :- :- | {fine}', 'A  d :t1 :d | r :m :f | m :- :- |'].join('\n'));
  });

  it('go along with parts resting, empty bars filled out and bridge notes', () => {
    expect(withRestingEdges('S  {Andante M. 70}s1 | d :r /m :f |\nA  {p}d :t1 /d :d |')).toBe('S  {Andante M. 70}s1 | d :r /m :f |\nA  x | {p}d :t1 /d :d |');
    expect(withFullEmptyBars('S  {p}d :r /m :f | : | s :- /- :- |', 4)).toBe('S  {p}d :r /m :f | : : : | s :- /- :- |');
    expect(withBridgeNotes('S  d :r /{p}sd :r |\nA  m :f /{p}m1l1 :t1 |')).toBe('S  d :r /{p}s=d :r |\nA  m :f /{p}m1=l1 :t1 |');
    expect(withHalfBarsAsBars('S  {p}d :r / m :f / s :l |', 2)).toBe('S  {p}d :r | m :f | s :l |');
  });

  it('don’t make a reader’s answer look as if it lost a part’s notes, or changed them', () => {
    const reading = 'S  d :r /m :f |\nA  d :t1 /d :d |';
    const answer = 'S  {p}d :{cresc}r /{f}m :{ff}f |\nA  {p}d :t1 /d :d |';
    expect(keepsParts(answer, reading)).toBe(true);
    expect(changedShare(answer, reading)).toBe(0);
    expect(changedShare('S  {Andante M. 70}d :r /m :s |\nA  d :t1 /d :d |', reading)).toBeCloseTo(1 / 16);
    expect(bestFree([answer], passes('4/4'), 4)).toBe(answer);
  });

  it('leave the checker’s problems with the part they’re about', () => {
    const line = 'S  {p}d :r /m :f | {cresc}s :- /- | {rit}d :- /- :- |\nA  d :t1 /d :d | m :- /- :- | d :- /- :- |';
    const { byPart } = problemsByPart(
      parseSolfa(line, { time: '4/4' }).errors.map((e) => e.message),
      ['S', 'A'],
    );
    expect(byPart.S).toEqual(['Bar 2 has 3 beats; 4/4 needs 4.']);
  });
});

describe('slurs in round brackets', () => {
  // Notes a sheet underlines or joins with a curve are sung to one syllable: `(m'.d')`, `(s :f |m)`. Brackets
  // aren't beats or notes, and only the slur's first note takes a syllable.
  const passes = (time: string) => (t: string) => !parseSolfa(t, { time }).errors.length;

  it('give a syllable only to a slur’s first note, as the checker pairs them', () => {
    expect(noteColumns("(m'.d') :(d'.s) |")).toEqual([1, 10]);
    expect(noteColumns('(s :f |m) :r |')).toEqual([1, 11]);
    expect(noteColumns('( d.r ) :{p}(m :f) |')).toEqual([2, 13]);
    const notes = "(m'.d') :d' | s :- |";
    expect(wordsUnderNotes('Glo-ry be', notes)).toEqual([
      { text: 'Glo-', at: 1 },
      { text: 'ry', at: 9 },
      { text: 'be', at: 14 },
    ]);
    expect(wordsAsSpaced('Glo-ry be', notes)).toBe(' Glo-    ry   be');
    // The same syllables on the same notes as the checker gives them.
    const song = parseSolfa(`S  ${notes}\nW  Glo-ry be`, { time: '2/4' });
    expect(song.events.S.filter((e) => e.lyric).map((e) => [e.text, e.lyric])).toEqual([
      ["m'", 'Glo-'],
      ["d'", 'ry'],
      ['s', 'be'],
    ]);
  });

  it('leave the rows lined up as before, and are no bar line', () => {
    const rows = [
      { part: 'S', text: "(m'.d') :(d'.s) | (s :f |m) :- |" },
      { part: 'A', text: 'd :t1 | d :r | m :- |' },
    ];
    const shown = alignedRows(rows);
    expect(shown.map((t) => t.replace(/\s/g, ''))).toEqual(rows.map((r) => r.text.replace(/\s/g, '')));
    expect(barColumns(shown[0])).toEqual(barColumns(shown[1]));
    expect(tidyNotes("(m' . d') : ( d'.s ) |")).toBe("(m'.d') : ( d'.s ) |");
  });

  it('stay on their notes through the free repairs', () => {
    const line = (bar: string) => `S  d :r :m :f | ${bar} | s :- :- :- |`;
    expect(withSpacedBeats(line('(s l) :t :d'), 4)).toBe(line('(s :l) :t :d'));
    // An upbeat in a slur is still notes.
    const upbeat = ['S  (s /d) :r :m /f :- :s | l :- :- |', 'A  m /m :m :d /r :- :m | f :- :- |'].join('\n');
    expect(withBarsInStep(upbeat, 3)).toBe(['S  (s | d) :r :m | f :- :s | l :- :- |', 'A  m | m :m :d | r :- :m | f :- :- |'].join('\n'));
    expect(passes('3/4')(withBarsInStep(upbeat, 3) ?? '')).toBe(true);
    expect(withBridgeNotes('S  d :r /(sd :r) |\nA  m :f /(m1l1 :t1) |')).toBe('S  d :r /(s=d :r) |\nA  m :f /(m1=l1 :t1) |');
    const four = ['S  (d :r /m) :f | s :- /- :- |', 'A  d :t1 /d :r / m :- /- :- |', 'T  m :s /s :l | s :- /- :- |', 'B  d :s1 /l1 :f1 | d :- /- :- |'].join('\n');
    expect(freeRepair(four, passes('4/4'), 4)).toBe(four.replace('A  d :t1 /d :r / m', 'A  d :t1 /d :r | m'));
  });

  it('don’t make a reader’s answer look as if it lost or changed notes', () => {
    const reading = 'S  d :r /m :f |\nA  d :t1 /d :d |';
    const answer = 'S  (d :r) /(m :f) |\nA  (d :t1) /d :d |';
    expect(keepsParts(answer, reading)).toBe(true);
    expect(changedShare(answer, reading)).toBe(0);
    expect(bestFree([answer], passes('4/4'), 4)).toBe(answer);
  });
});

describe('a section’s label read among a picture line’s words', () => {
  // Owner's report, 21 November 2026: scanning didn't find "chorus, verses, refrain".
  it('takes a row that’s only a label over the first part as the line’s section, and not words', () => {
    const got = sectionInWords([
      { after: 0, text: 'CHORUS' },
      { after: 0, text: 'Glo-ry to God' },
    ]);
    expect(got.section).toBe('Chorus');
    expect(withWords('S  d :r |\nA  m :f |', got.words)).toBe('S  d :r |\nW  Glo-ry to God\nA  m :f |');
  });

  it('takes a label with a colon before a row’s words, and keeps the words', () => {
    expect(sectionBeforeWords('Refrain: Glo-ry to God')).toEqual({ name: 'Refrain', words: 'Glo-ry to God' });
    expect(sectionBeforeWords('CHR:I know I know')).toEqual({ name: 'Chorus', words: 'I know I know' });
    expect(sectionInWords([{ after: 1, text: 'Verse 2: O come' }])).toEqual({ section: 'Verse 2', words: [{ after: 1, text: 'O come' }] });
  });

  it('takes no section from a lyric, a label further down the line, or who sings', () => {
    for (const words of [[{ after: 0, text: 'Chorus of an-gels sing' }], [{ after: 0, text: 'Lord: have mer-cy' }], [{ after: 0, text: 'Solo' }], [{ after: 3, text: 'CH' }]]) {
      expect(sectionInWords(words)).toEqual({ section: null, words });
    }
  });
});
