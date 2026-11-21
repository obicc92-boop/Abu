import { describe, expect, it } from '@jest/globals';

import { orderLength, parseSolfa, playOrder, readRepeat, type ParsedSong } from '..';

/** A song in 2/4, so each bar is two beats. */
const song = (...lines: string[]): ParsedSong => parseSolfa(['time: 2/4', ...lines].join('\n'));
/** The order of play as [from, to] pairs of written beats. */
const order = (s: ParsedSong, from = 0) => playOrder(s, from).map((g) => [g.from, g.to]);
const marks = (s: ParsedSong) => s.marks.map((m) => [m.name, m.beat]);
const messages = (s: ParsedSong) => s.warnings.map((w) => w.message);

describe('reading repeat and jump marks', () => {
  it('reads each spelling, in any case, with or without dots and spaces', () => {
    const read: [string, string][] = [
      ['segno', 'segno'],
      ['Segno', 'segno'],
      ['𝄋', 'segno'],
      ['coda', 'coda'],
      ['𝄌', 'coda'],
      ['D.S.', 'ds'],
      ['ds', 'ds'],
      ['d.s', 'ds'],
      ['Dal Segno', 'ds'],
      ['D.S. al Fine', 'ds-fine'],
      ['DS al fine', 'ds-fine'],
      ['dal segno al fine', 'ds-fine'],
      ['D.S. al Coda', 'ds-coda'],
      ['D.C.', 'dc'],
      ['dc', 'dc'],
      ['Da Capo', 'dc'],
      ['D.C. al Fine', 'dc-fine'],
      ['d.c.alfine', 'dc-fine'],
      ['D.C. al Coda', 'dc-coda'],
      ['Fine', 'fine'],
      ['FINE', 'fine'],
      ['to coda', 'tocoda'],
      ['To Coda', 'tocoda'],
      ['|:', '|:'],
      ['||:', '|:'],
      [':|', ':|'],
      [': |', ':|'],
      ['1.', '1.'],
      ['1', '1.'],
      ['1st time', '1.'],
      ['2.', '2.'],
      ['2nd', '2.'],
    ];
    for (const [inner, name] of read) expect([inner, readRepeat(inner)]).toEqual([inner, name]);
    expect(readRepeat('p')).toBeNull();
    expect(readRepeat('Andante')).toBeNull();
  });

  it('puts a sign on the beat of the note it’s written before, and a jump or an end at the end of its bar', () => {
    const s = song('S  {segno}d :r | m :{coda}f | s :l {D.S. al Coda}| t :d\' {Fine} |');
    expect(s.errors).toEqual([]);
    expect(marks(s)).toEqual([
      ['segno', 0],
      ['coda', 3],
      ['ds-coda', 6],
      ['fine', 8],
    ]);
  });

  it('reads a mark right before a bar line, or at the end of a row, at that bar’s end, with no warning', () => {
    for (const row of ['S  d :r | m :f {D.C.}|', 'S  d :r | m :f {D.C.} |', 'S  d :r | m :f {D.C.}', 'S  d :r | m :f | {D.C.}', 'S  d :r | m :f |{D.C.}']) {
      const s = song(row);
      expect([row, s.errors, s.warnings, marks(s)]).toEqual([row, [], [], [['dc', 4]]]);
    }
    // A rest at the end of the bar: still the bar's end.
    expect(marks(song('S  d :r | m : {D.C.} |'))).toEqual([['dc', 4]]);
  });

  it('reads one on a line of its own at the end of the line of music before it, with or without a blank line', () => {
    const rows = ['S  d :r | m :f |', 'A  d :r | d :r |'];
    const next = ['', 'S  s :l |', 'A  m :f |'];
    for (const lines of [[...rows, '{D.C.}'], [...rows, '', '{D.C.}'], [...rows, '{D.C.}', ...next], [...rows, '', '{D.C.}', ...next]]) {
      const s = song(...lines);
      expect([lines, s.errors, s.warnings, marks(s)]).toEqual([lines, [], [], [['dc', 4]]]);
    }
    // A solo line, then all the parts: the solo's end.
    const solo = song('S  d :r | m :f |', '{D.C.}', '', 'S  s :l |', 'A  m :f |');
    expect([solo.errors, marks(solo)]).toEqual([[], [['dc', 4]]]);
  });

  it('keeps a repeat’s bar line in braces out of the bars', () => {
    const s = song('S  {|:}d :r | m :f {:|} | s :l |', 'A  {|:}d :d | d :d {:|} | m :f |');
    expect(s.errors).toEqual([]);
    expect(s.bars).toBe(3);
    expect(s.sections[0].bars.S).toEqual([
      ['d', 'r'],
      ['m', 'f'],
      ['s', 'l'],
    ]);
    // Written in every part's row, each mark is read once.
    expect(marks(s)).toEqual([
      ['|:', 0],
      [':|', 4],
    ]);
  });

  it('puts a mark in the middle of a bar at the beat where it’s written', () => {
    const s = parseSolfa('time: 4/4\nS  d :r {Fine} /m :f | {segno}s :{to coda}- /- :- |');
    expect(marks(s)).toEqual([
      ['fine', 2],
      ['segno', 4],
      ['tocoda', 5],
    ]);
  });

  it('keeps a mark at the end of its bar when the part rests through the next line', () => {
    const s = song('S  d :r | m :f {Fine} |', 'A  d :r | m :f |', '', 'A  s :l |', '', 'S  d :r {D.C. al Fine} |', 'A  d :r |');
    expect(s.errors).toEqual([]);
    expect(marks(s)).toEqual([
      ['fine', 4],
      ['dc-fine', 8],
    ]);
    expect(order(s)).toEqual([
      [0, 8],
      [0, 4],
    ]);
  });

  it('says plainly when a jump can’t be followed, with its bar', () => {
    expect(messages(song('S  d :r | m :f {D.S.} |'))).toEqual(['Bar 2: {D.S.} has no {segno} before it to go back to, so the music plays straight on.']);
    expect(messages(song('S  d :r | {2.}m :f |'))).toEqual(['Bar 2: {2.} has no {1.} before it, so the music plays straight on.']);
    expect(messages(song('S  d :r {to coda} | m :f {D.C. al Coda} |'))).toEqual(['Bar 1: {to coda} has no {coda} after it to go to, so the music plays straight on.']);
    expect(messages(song('S  d :r | m :f {D.C. al Fine} |'))).toEqual(['Bar 2: {D.C. al Fine} has no {Fine} to end at, so after it the music plays on to the end.']);
    expect(messages(song('S  d :r | m :f {D.C. al Coda} | {coda}s :- |'))).toEqual(['Bar 2: {D.C. al Coda} has no {to coda} to leave from, so after it the music plays on to the end.']);
    expect(messages(song('S  d :r | {1.}m :f |'))).toEqual(['Bar 2: {1.} has no {:|} or {2.} after it, so it plays as written.']);
    // Ones that can be followed say nothing.
    expect(messages(song('S  {segno}d :r | m :f {D.S.} |'))).toEqual([]);
  });
});

describe('the order of play', () => {
  it('is the whole song, once, in a song with no repeats or jumps', () => {
    const s = song('S  d :r | m :f | s :l |');
    expect(order(s)).toEqual([[0, 6]]);
    expect(order(s, 2)).toEqual([[2, 6]]);
    expect(order(s, 6)).toEqual([]);
  });

  it('plays a repeat once more, from its start repeat, or from the start with none', () => {
    expect(order(song('S  d :r | {|:}m :f | s :l {:|} | d\' :- |'))).toEqual([
      [0, 6],
      [2, 8],
    ]);
    expect(order(song('S  d :r | m :f {:|} | s :l |'))).toEqual([
      [0, 4],
      [0, 6],
    ]);
  });

  it('goes back from an end repeat with no start to the repeat before it, or to its section’s start', () => {
    // A A B B
    expect(order(song('S  d :r {:|} | m :f {:|} |'))).toEqual([
      [0, 2],
      [0, 4],
      [2, 4],
    ]);
    // The chorus repeats from its own start.
    expect(order(song('[Verse]', 'S  d :r | m :f |', '[Chorus]', 'S  s :l | t :d\' {:|} |'))).toEqual([
      [0, 8],
      [4, 8],
    ]);
    // One repeat straight after another, written :|: as two marks.
    expect(order(song('S  {|:}d :r {:|} | {|:}m :f {:|} |'))).toEqual([
      [0, 2],
      [0, 4],
      [2, 4],
    ]);
  });

  it('plays the first ending, goes back, and plays the second instead the second time', () => {
    const s = song('S  {|:}d :r | {1.}m :f {:|} | {2.}s :l | d\' :- |');
    expect(s.warnings).toEqual([]);
    expect(order(s)).toEqual([
      [0, 4],
      [0, 2],
      [4, 8],
    ]);
    // A first ending of two bars.
    expect(order(song('S  d :r | {1.}m :f | s :- {:|} | {2.}l :t | d\' :- |'))).toEqual([
      [0, 6],
      [0, 2],
      [6, 10],
    ]);
    // Written the old way, with no end repeat: the second ending says where the first ends.
    expect(order(song('S  d :r | {1.}m :f | {2.}s :l |'))).toEqual([
      [0, 4],
      [0, 2],
      [4, 6],
    ]);
  });

  it('D.C. al Fine: back to the start, and ends at Fine', () => {
    const s = song('S  d :r | m :f {Fine} | s :l | t :d\' {D.C. al Fine} |');
    expect(s.warnings).toEqual([]);
    expect(order(s)).toEqual([
      [0, 8],
      [0, 4],
    ]);
  });

  it('D.S. al Fine: back to the segno, and ends at Fine', () => {
    expect(order(song('S  d :r | {segno}m :f | s :l {Fine} | t :d\' {D.S. al Fine} |'))).toEqual([
      [0, 8],
      [2, 6],
    ]);
  });

  it('D.S. al Coda: back to the segno, then from To Coda to the coda', () => {
    const s = song('S  d :r | {segno}m :f {to coda} | s :l {D.S. al Coda} | {coda}t :d\' |');
    expect(s.warnings).toEqual([]);
    expect(order(s)).toEqual([
      [0, 6],
      [2, 4],
      [6, 8],
    ]);
  });

  it('D.C. al Coda: back to the start, then from To Coda to the coda', () => {
    expect(order(song('S  d :r {to coda} | m :f {D.C. al Coda} | {coda}s :l |'))).toEqual([
      [0, 4],
      [0, 2],
      [4, 6],
    ]);
  });

  it('counts Fine and To Coda only on the pass after a jump', () => {
    // Before the D.C., the Fine and the To Coda are passed by.
    expect(order(song('S  d :r {Fine} | m :f |'))).toEqual([[0, 4]]);
    expect(order(song('S  d :r {to coda} | m :f | {coda}s :l |'))).toEqual([[0, 6]]);
    // A plain D.S. or D.C. does whichever the song has.
    expect(order(song('S  {segno}d :r {Fine} | m :f {D.S.} |'))).toEqual([
      [0, 4],
      [0, 2],
    ]);
    expect(order(song('S  d :r {to coda} | m :f {D.C.} | {coda}s :l |'))).toEqual([
      [0, 4],
      [0, 2],
      [4, 6],
    ]);
    // al Fine leaves a To Coda alone, and al Coda a Fine.
    expect(order(song('S  d :r {to coda} | m :f {Fine} | s :l {D.C. al Fine} | {coda}t :- |'))).toEqual([
      [0, 6],
      [0, 4],
    ]);
  });

  it('takes a jump once: a D.C. with no Fine plays on to the end the second time', () => {
    expect(order(song('S  d :r | m :f {D.C.} | s :l |'))).toEqual([
      [0, 4],
      [0, 6],
    ]);
  });

  it('doesn’t take repeats again after a D.S. or D.C., and plays the last ending', () => {
    expect(order(song('S  {|:}d :r {:|} | m :f {Fine} | s :l {D.C. al Fine} |'))).toEqual([
      [0, 2],
      [0, 6],
      [0, 4],
    ]);
    expect(order(song('S  {|:}d :r | {1.}m :f {:|} | {2.}s :l {D.C.} |'))).toEqual([
      [0, 4],
      [0, 2],
      [4, 6],
      [0, 2],
      [4, 6],
    ]);
  });

  it('plays a repeat inside a repeat again on its second time round', () => {
    expect(order(song('S  {|:}d :r | {|:}m :f {:|} | s :l {:|} |'))).toEqual([
      [0, 4],
      [2, 6],
      [0, 4],
      [2, 6],
    ]);
  });

  it('plays straight on past a jump it can’t follow', () => {
    expect(order(song('S  d :r | m :f {D.S.} | s :l |'))).toEqual([[0, 6]]);
    expect(order(song('S  d :r {to coda} | m :f {D.C.} |'))).toEqual([
      [0, 4],
      [0, 4],
    ]);
    expect(order(song('S  d :r | {2.}m :f |'))).toEqual([[0, 4]]);
  });

  it('from a bar part way, follows the jumps from there as if for the first time', () => {
    // Inside a repeat: on to its end, back, and round again.
    expect(order(song('S  d :r | m :f {:|} | s :l |'), 2)).toEqual([
      [2, 4],
      [0, 6],
    ]);
    // Inside a first ending.
    expect(order(song('S  {|:}d :r | {1.}m :f {:|} | {2.}s :l | d\' :- |'), 2)).toEqual([
      [2, 4],
      [0, 2],
      [4, 8],
    ]);
    // After the Fine: on to the D.C., back to the start, and ends at Fine.
    expect(order(song('S  d :r | m :f {Fine} | s :l | t :d\' {D.C. al Fine} |'), 4)).toEqual([
      [4, 8],
      [0, 4],
    ]);
    // In the coda: to the end.
    expect(order(song('S  d :r | {segno}m :f {to coda} | s :l {D.S. al Coda} | {coda}t :d\' |'), 6)).toEqual([[6, 8]]);
    // In the second ending: straight on.
    expect(order(song('S  {|:}d :r | {1.}m :f {:|} | {2.}s :l | d\' :- |'), 4)).toEqual([[4, 8]]);
  });

  it('adds up to the beats played', () => {
    expect(orderLength(playOrder(song('S  d :r | m :f {Fine} | s :l | t :d\' {D.C. al Fine} |')))).toBe(12);
  });
});
