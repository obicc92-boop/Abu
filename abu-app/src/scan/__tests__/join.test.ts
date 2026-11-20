import { describe, expect, it } from '@jest/globals';

import { parseSolfa } from '@/solfa';

import { guessBeats, joinLines, linesKeys, timeFor } from '../join';

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

  it('allows for half-bar marks read as bar lines, and bar lines lost', () => {
    // 4/4, some half-bar marks read as bar lines: more bars of 2 beats than of 4, but the bars of 4 have a
    // half-bar mark in the middle, which a bar of 2/4 can't.
    const halves = ['S  d | d :r /m :f | s :- | l :t | d\' :- /- :- | s |', 'A  d | m :f | s :l /t :d | r :m | f :- /- :- | s |'];
    expect(guessBeats(halves)).toBe(4);
    // 3/4 with a bar line lost now and then: a bar of 6 beats is two of 3.
    expect(guessBeats(['S  d | d :r :m | f :s :l :t :d\' :r\' | m :- :- | s |', 'A  d | m :f :s | l :- :- | t :d\' :- | s |'])).toBe(3);
    // 12/8, each bar 12 beats with a mark every 3.
    expect(guessBeats(['S  d | d :r :m /f :s :l /t :d :r /m :f :s | d :- :- /- :- :- /r :- :- /m :- :- | s |'])).toBe(12);
  });
});

describe('key changes in a scanned sheet', () => {
  it('follows each line’s own new key and its bridge notes', () => {
    const keys = linesKeys([{ text: 'S  d :r |' }, { text: 'S  m :f |', key: 'F' }, { text: 'S  s=d :r |' }, { text: 'S  d :- |' }], 0, '2/4');
    expect(keys).toEqual([{ from: 0, start: 0 }, { from: 0, start: 5, change: 'F' }, { from: 5, start: 5 }, { from: 0, start: 0 }]);
  });

  it('carries a key change from a line left out to the next line kept', () => {
    const keys = linesKeys([{ text: 'S  d :r |' }, { text: 'S  m :f |', key: 'G', left: true }, { text: 'S  r :d |' }], 0, '2/4');
    expect(keys.map((k) => k.change)).toEqual([undefined, undefined, 'G']);
  });

  it('writes no change for a new key the same as the one before', () => {
    expect(linesKeys([{ text: 'S  d :r |', key: 'C' }, { text: 'S  m :f |', key: 'C' }], 0, '2/4').map((k) => k.change)).toEqual([undefined, undefined]);
  });

  it('puts a key line before a line that changes key', () => {
    expect(joinLines(['S  d :r |', 'S  m :f |'], '2/4', [undefined, 'F'])).toBe('S  d :r |\n\nkey: F\nS  m :f |');
  });
});
