import { describe, expect, it } from '@jest/globals';

import { songArt } from '../song-art';

const HYMN = `S  d :d |t1 :l1 |s1 :d |r :m |
A  s1 :s1 |s1 :f1 |m1 :s1 |s1 :s1 |
T  m :m |r :d |d :d |t1 :d |
B  d :d |s1 :f1 |d :d |s1 :d |`;

const ys = (points: string) => points.split(' ').map((p) => Number(p.split(',')[1]));

describe('a song’s tile art', () => {
  it('draws each part’s opening melody as a line, the parts stacked as on a sheet', () => {
    const art = songArt(HYMN, 'x');
    expect(art.map((l) => l.part)).toEqual(['S', 'A', 'T', 'B']);
    const s = ys(art[0].points);
    // d d t1 l1 s1 d r m: down from doh, then up past it.
    expect(s[0]).toBe(s[2]);
    expect(s[4]).toBeGreaterThan(s[0]);
    expect(s[14]).toBeLessThan(s[0]);
    // Soprano above bass, and everything inside the box.
    expect(Math.max(...s)).toBeLessThan(Math.min(...ys(art[3].points)));
    for (const l of art) for (const y of ys(l.points)) expect(y > 10 && y < 90).toBe(true);
  });

  it('makes up a pattern of its own for a song with no sol-fa, the same every time', () => {
    expect(songArt(null, 'song-1')).toEqual(songArt('', 'song-1'));
    expect(songArt(null, 'song-1')).not.toEqual(songArt(null, 'song-2'));
    expect(songArt(null, 'song-1')).toHaveLength(4);
  });
});
