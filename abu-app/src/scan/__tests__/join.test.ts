import { describe, expect, it } from '@jest/globals';

import { parseSolfa } from '@/solfa';

import { guessBeats, joinLines, timeFor } from '../join';

const LINE_1 = ['S  s1 | d :r /m :f | s :- /- : |', 'W  O come let us a-dore', 'A  s1 | d :t1 /d :d | d :- /- : |'].join('\n');
const LINE_2 = ['S  m | r :d /t1 :d | d :- /- :- |', 'W  him the new born king', 'A  d | t1 :l1 /s1 :s1 | s1 :- /- :- |'].join('\n');

describe('joining scanned lines', () => {
  it('moves the upbeat printed at the start of a line into the empty beat before it, with its word', () => {
    const text = joinLines([LINE_1, LINE_2], '4/4');
    expect(text).toBe(
      [
        'S  s1 | d :r /m :f | s :- /- :m |',
        'W  O come let us a-dore him',
        'A  s1 | d :t1 /d :d | d :- /- :d |',
        '',
        'S  r :d /t1 :d | d :- /- :- |',
        'W  the new born king',
        'A  t1 :l1 /s1 :s1 | s1 :- /- :- |',
      ].join('\n'),
    );
    const song = parseSolfa(text, { time: '4/4' });
    expect(song.errors).toEqual([]);
    expect(song.bars).toBe(5);
    // The moved m is the last beat of bar 2 (beat 8, after the one-beat pickup), and "him" is sung on it.
    expect(song.sections[0].lyrics.S[8]).toBe('him');
  });

  it('completes a short last bar with the upbeat', () => {
    const text = joinLines(['S  d :r /m :f | s :- /- |', 'S  m | r :d /t1 :d |'], '4/4');
    expect(text).toBe('S  d :r /m :f | s :- /- :m |\n\nS  r :d /t1 :d |');
  });

  it('leaves lines alone when the next one starts with a full bar or the parts differ', () => {
    expect(joinLines(['S  d :r /m :f |', 'S  s :- /- :- |'], '4/4')).toBe('S  d :r /m :f |\n\nS  s :- /- :- |');
    expect(joinLines(['S  d :r /m : |', 'A  m | d :- /- :- |'], '4/4')).toBe('S  d :r /m : |\n\nA  m | d :- /- :- |');
  });

  it('keeps an upbeat at the very start of the song', () => {
    expect(joinLines([LINE_1], '4/4').split('\n')[0]).toBe('S  s1 | d :r /m :f | s :- /- : |');
  });
});

describe('the time', () => {
  it('uses what is printed', () => {
    expect(timeFor('3/4', [])).toBe('3/4');
  });

  it('guesses from the bars inside the lines when nothing is printed', () => {
    expect(guessBeats([LINE_1, LINE_2])).toBe(4);
    expect(timeFor('', ['S  d | d :r :m :f :s :l | t :d\' :- :- :- :- | s |'])).toBe('6/8');
    expect(timeFor('', ['S  d | d :r | m :f | s |'])).toBe('2/4');
    expect(timeFor('', [])).toBe('4/4');
  });
});
