import { describe, expect, it } from '@jest/globals';

import { alignedRows, joinLine, problemsByPart, splitLine, tidyNotes, tidyTitle, withoutNameColumn, withWords, wordsOf } from '../line-text';
import { parseSolfa } from '@/solfa';

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
    // Every part's bar lines fall in the same columns.
    const bars = (s: string) => [...s].flatMap((c, i) => (c === '|' ? [i] : []));
    expect(bars(shown[2])).toEqual(bars(shown[0]));
    expect(bars(shown[4])).toEqual(bars(shown[0]));
    expect(bars(shown[3])).toEqual(bars(shown[0]));
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
