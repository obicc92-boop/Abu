import { describe, expect, it } from '@jest/globals';

import { joinLine, problemsByPart, splitLine, tidyTitle } from '../line-text';

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
