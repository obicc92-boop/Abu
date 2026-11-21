import { describe, expect, it } from '@jest/globals';

import { parseSolfa } from '@/solfa';

import { barAt, restingBar, tileBars } from '../tile-bars';

const HYMN = `S  d :d |t1 :l1 |s1 :d |r :m |
W  All peo-ple that on earth do dwell
A  s1 :s1 |s1 :f1 |m1 :s1 |s1 :s1 |
T  m :m |r :d |d :d |t1 :d |
B  d :d |s1 :f1 |d :d |s1 :d |`;

const UPBEAT = `S  :s1 |d :- :r |m :- :- |
A  :s1 |s1 :- :t1 |d :- :- |`;

describe('a song’s bars for its tile', () => {
  it('gives each bar’s beats for each part, where it starts, and its words', () => {
    const bars = tileBars(parseSolfa(HYMN, { time: '2/4' }));
    expect(bars.map((b) => [b.number, b.start, b.beats])).toEqual([
      [1, 0, 2],
      [2, 2, 2],
      [3, 4, 2],
      [4, 6, 2],
    ]);
    expect(bars[1].rows).toEqual([
      { part: 'S', beats: ['t1', 'l1'] },
      { part: 'A', beats: ['s1', 'f1'] },
      { part: 'T', beats: ['r', 'd'] },
      { part: 'B', beats: ['s1', 'f1'] },
    ]);
    // A word split over bars keeps its hyphen; in one bar it's joined up.
    expect(bars[0].words).toBe('All peo-');
    expect(bars[1].words).toBe('ple that');
  });

  it('rests on the first whole bar, not an upbeat, and follows the player’s beat', () => {
    const song = parseSolfa(UPBEAT, { time: '3/4' });
    const bars = tileBars(song);
    // ":s1" is a rest, then s1: two beats of a bar of three.
    expect(bars[0].beats).toBe(2);
    expect(restingBar(bars, song.beatsPerBar)?.number).toBe(2);
    expect(barAt(bars, 0)?.number).toBe(1);
    expect(barAt(bars, 1)?.number).toBe(1);
    expect(barAt(bars, 2)?.number).toBe(2);
    expect(barAt(bars, 4)?.number).toBe(2);
    expect(barAt(bars, 5)?.number).toBe(3);
  });

  it('shows four parts at most', () => {
    const five = `Solo d :r |\nS  d :r |\nA  d :r |\nT  d :r |\nB  d :r |`;
    expect(tileBars(parseSolfa(five, { time: '2/4' }))[0].rows).toHaveLength(4);
  });
});
