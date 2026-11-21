import { describe, expect, it } from '@jest/globals';

import { OLD100 } from '@/data/demo-songs';
import { DEFAULT_LEVEL, parseSolfa, type Expression, type ParsedSong } from '@/solfa';

import {
  FULL_LOUDNESS,
  loudness,
  loudnessCurve,
  RIT_BEATS,
  RIT_TO,
  startingTempo,
  tempoCurve,
} from '../expression-curve';

const P = 0.55;
const PP = 0.4;
const F = 0.93;

/** A plain two-part song in 4/4 with the given markings in place of its own. */
function marked(expressions: Partial<Expression>[], heading = ''): ParsedSong {
  const song = parseSolfa(`${heading}time: 4/4\nS  d :r /m :f |s :- /- :- |\nA  d :d /d :d |d :- /- :- |`);
  return {
    ...song,
    expressions: expressions.map((e) => ({ kind: 'dynamic', text: '', part: null, beat: 0, ...e }) as Expression),
  };
}
const dyn = (beat: number, level: number, part: string | null = null): Partial<Expression> => ({ kind: 'dynamic', beat, level, part });

describe('loudness', () => {
  it('is 1 throughout a song with no dynamics, so it sounds as before', () => {
    const song = parseSolfa(OLD100, { time: '4/4' });
    expect(loudnessCurve(song)).toBe(FULL_LOUDNESS);
    expect(loudness(song, 'S', 0)).toBe(1);
    expect(loudness(song, 'B', 7.5)).toBe(1);
    // Tempo marks alone don't change the loudness either.
    expect(loudness(marked([{ kind: 'tempo', bpm: 76 }]), 'S', 3)).toBe(1);
  });

  it('plays as mezzo-forte before the first dynamic, then as each dynamic says, for its part or every part', () => {
    const song = parseSolfa('time: 4/4\nS  d :r /{p}m :f |s :- /- :- |\nA  d :d /d :d |d :- /- :- |\n{f}\nS  d :- /- :- |\nA  d :- /- :- |');
    const at = (part: string, beat: number) => loudness(song, part, beat);
    expect(at('S', 0)).toBe(DEFAULT_LEVEL);
    expect(at('S', 2)).toBe(P);
    expect(at('S', 7)).toBe(P);
    // The p is in the sopranos' row: the altos carry on as before.
    expect(at('A', 2)).toBe(DEFAULT_LEVEL);
    // The f is on a line of its own, for every part.
    expect(at('S', 8)).toBe(F);
    expect(at('A', 8)).toBe(F);
  });

  it('makes only the note on an accent’s beat loud', () => {
    const song = marked([dyn(0, P), { kind: 'accent', beat: 2, level: 1, part: 'S' }]);
    const curve = loudnessCurve(song);
    expect(curve.at('S', 2)).toBe(1);
    expect(curve.at('S', 1)).toBe(P);
    expect(curve.at('S', 2.5)).toBe(P);
    expect(curve.at('A', 2)).toBe(P);
    // A note held from the accent goes back to the level under it.
    expect(curve.heldTo('S', 2, 2)).toBe(P);
  });

  it('moves a cresc. in a straight line to the next dynamic', () => {
    const curve = loudnessCurve(marked([dyn(0, P), { kind: 'cresc', beat: 2 }, dyn(8, F)]));
    expect(curve.at('S', 2)).toBeCloseTo(P, 9);
    expect(curve.at('S', 5)).toBeCloseTo((P + F) / 2, 9);
    expect(curve.at('A', 7)).toBeCloseTo(P + ((F - P) * 5) / 6, 9);
    expect(curve.at('S', 8)).toBe(F);
    // A note held through it heads for where the cresc. has got to by its end.
    expect(curve.heldTo('S', 4, 2)).toBeCloseTo(P + ((F - P) * 4) / 6, 9);
  });

  it('starts a cresc. from a dynamic on the same beat (“p cresc.”), whichever is written first', () => {
    const curve = loudnessCurve(marked([{ kind: 'cresc', beat: 0 }, dyn(0, P), dyn(4, F)]));
    expect(curve.at('S', 0)).toBe(P);
    expect(curve.at('S', 2)).toBeCloseTo((P + F) / 2, 9);
  });

  it('moves a quarter over 8 beats and holds when no dynamic comes within 32 beats', () => {
    const curve = loudnessCurve(marked([dyn(0, P), { kind: 'cresc', beat: 0 }, dyn(40, PP)]));
    expect(curve.at('S', 4)).toBeCloseTo(P + 0.125, 9);
    expect(curve.at('S', 8)).toBeCloseTo(P + 0.25, 9);
    expect(curve.at('S', 30)).toBeCloseTo(P + 0.25, 9);
    expect(curve.at('S', 40)).toBe(PP);

    const dim = loudnessCurve(marked([{ kind: 'dim', beat: 4 }]));
    expect(dim.at('T', 0)).toBe(DEFAULT_LEVEL);
    expect(dim.at('T', 12)).toBeCloseTo(DEFAULT_LEVEL - 0.25, 9);
  });

  it('keeps a cresc. or dim. between ppp and ff', () => {
    const cresc = loudnessCurve(marked([dyn(0, F), { kind: 'cresc', beat: 0 }]));
    expect(cresc.at('S', 1)).toBeCloseTo(F + 0.25 / 8, 9);
    expect(cresc.at('S', 3)).toBe(1);
    expect(cresc.at('S', 20)).toBe(1);
    const dim = loudnessCurve(marked([dyn(0, PP), { kind: 'dim', beat: 0 }]));
    expect(dim.at('S', 1.6)).toBeCloseTo(PP - 0.05, 9);
    expect(dim.at('S', 3.2)).toBeCloseTo(0.3, 9);
    expect(dim.at('S', 20)).toBe(0.3);
  });

  it('never makes a cresc. softer: with a softer dynamic next, it swells until that dynamic', () => {
    const curve = loudnessCurve(marked([dyn(0, F), { kind: 'cresc', beat: 0 }, dyn(4, P)]));
    expect(curve.at('S', 2)).toBeCloseTo(F + 0.0625, 9);
    expect(curve.at('S', 4)).toBe(P);
  });

  it('lets a later cresc. or dim. take over from the level reached (a swell and back)', () => {
    const curve = loudnessCurve(marked([dyn(0, P), { kind: 'cresc', beat: 0 }, { kind: 'dim', beat: 4 }, dyn(8, P)]));
    // The cresc. can't aim for the p, so it swells a quarter over 8 beats; at beat 4 the dim. comes back down to p.
    const top = P + 0.125;
    expect(curve.at('S', 4)).toBeCloseTo(top, 9);
    expect(curve.at('S', 6)).toBeCloseTo((top + P) / 2, 9);
    expect(curve.at('S', 8)).toBe(P);
  });

  it('holds a note at its own level up to a new dynamic on the next note', () => {
    const curve = loudnessCurve(marked([dyn(0, F), dyn(4, P)]));
    expect(curve.heldTo('S', 0, 4)).toBe(F);
    expect(curve.at('S', 4)).toBe(P);
  });
});

describe('tempo curve', () => {
  it('is steady for a song with no tempo marks', () => {
    const song = parseSolfa(OLD100, { time: '4/4' });
    const curve = tempoCurve(song);
    expect(curve.steady).toBe(true);
    expect(curve.start).toBe(84);
    expect(curve.factorAt(10)).toBe(1);
    expect(curve.span(3, 2.5)).toBe(2.5);
    expect(curve.beatAfter(3, 2.5)).toBe(5.5);
  });

  it('starts from the tempo heading, else a tempo mark in the first bar, else 96 in 3/4 and 84 otherwise', () => {
    expect(startingTempo(parseSolfa('tempo: 72\ntime: 4/4\nS  {Andante}d :r /m :f |'))).toBe(72);
    expect(startingTempo(parseSolfa('time: 4/4\nS  {Andante}d :r /m :f |'))).toBe(76);
    expect(startingTempo(parseSolfa('time: 4/4\nS  d :r /{M. 70}m :f |'))).toBe(70);
    expect(startingTempo(parseSolfa('time: 4/4\nS  d :r /m :f |{Andante}s :- /- :- |'))).toBe(84);
    expect(startingTempo(parseSolfa('time: 3/4\nS  d :r :m |'))).toBe(96);
    // A heading with no speed ("Joyfully") leaves it to the marks.
    expect(startingTempo(parseSolfa('tempo: Joyfully\ntime: 4/4\nS  {Allegro}d :r /m :f |'))).toBe(126);
    // Two marks on the first beat: the last, as the player follows, so it starts at factor 1.
    const both = parseSolfa('time: 4/4\n{Andante} {M. 70}\nS  d :r /m :f |');
    expect(startingTempo(both)).toBe(70);
    expect(tempoCurve(both).steady).toBe(true);
  });

  it('sets the tempo from a tempo mark’s beat', () => {
    const song = parseSolfa('time: 4/4\nS  d :r /m :f |{Allegro}s :- /- :- |');
    const curve = tempoCurve(song);
    expect(curve.steady).toBe(false);
    expect(curve.factorAt(3.9)).toBe(1);
    expect(curve.factorAt(4)).toBeCloseTo(126 / 84, 9);
    // Two beats before the change and four after take 2 + 4 × 84/126 beats at the starting tempo.
    expect(curve.span(2, 6)).toBeCloseTo(2 + (4 * 84) / 126, 9);
    expect(curve.beatAfter(2, 2 + (4 * 84) / 126)).toBeCloseTo(8, 9);
    // Measured from the tempo the player starts at, when it's given.
    expect(tempoCurve(song, 100).factorAt(4)).toBeCloseTo(1.26, 9);
  });

  it('slows a rit. in a straight line to three quarters over 8 beats, then holds', () => {
    const curve = tempoCurve(marked([{ kind: 'tempo', bpm: 60 }, { kind: 'rit', beat: 4 }]));
    expect(curve.start).toBe(60);
    expect(curve.factorAt(4)).toBe(1);
    expect(curve.factorAt(8)).toBeCloseTo(1 - (1 - RIT_TO) / 2, 9);
    expect(curve.factorAt(4 + RIT_BEATS)).toBeCloseTo(RIT_TO, 9);
    expect(curve.factorAt(50)).toBeCloseTo(RIT_TO, 9);
    // The rit.'s 8 beats take ∫ 1/factor: 32 ln(4/3) ≈ 9.2 beats at the starting tempo.
    const ritSpan = 32 * Math.log(4 / 3);
    expect(curve.span(4, 8)).toBeCloseTo(ritSpan, 9);
    expect(curve.span(0, 20)).toBeCloseTo(4 + ritSpan + 8 / RIT_TO, 9);
    expect(curve.span(12, 4)).toBeCloseTo(4 / RIT_TO, 9);
    // beatAfter undoes span, anywhere through it.
    for (const from of [-0.5, 0, 3, 5.25, 11.9, 13]) {
      for (const beats of [0.25, 1, 3.5, 10]) expect(curve.beatAfter(from, curve.span(from, beats))).toBeCloseTo(from + beats, 9);
    }
  });

  it('finishes a rit. by the next tempo mark if that’s sooner, and a tempo goes back', () => {
    const curve = tempoCurve(marked([{ kind: 'tempo', bpm: 80 }, { kind: 'rit', beat: 4 }, { kind: 'atempo', beat: 6 }]));
    expect(curve.factorAt(5)).toBeCloseTo((1 + RIT_TO) / 2, 9);
    expect(curve.factorAt(5.999)).toBeCloseTo(RIT_TO, 3);
    expect(curve.factorAt(6)).toBe(1);
    expect(curve.factorAt(20)).toBe(1);
  });

  it('goes back to the tempo before the first rit. after one rit. and then another', () => {
    const curve = tempoCurve(
      marked([{ kind: 'tempo', bpm: 80 }, { kind: 'rit', beat: 4 }, { kind: 'rit', beat: 16 }, { kind: 'atempo', beat: 30 }]),
    );
    expect(curve.factorAt(14)).toBeCloseTo(RIT_TO, 9);
    expect(curve.factorAt(24)).toBeCloseTo(RIT_TO * RIT_TO, 9);
    expect(curve.factorAt(30)).toBe(1);
  });

  it('takes a new tempo mark after a rit. as it is, and an a tempo with no rit. changes nothing', () => {
    const curve = tempoCurve(
      marked([{ kind: 'tempo', bpm: 80 }, { kind: 'rit', beat: 0 }, { kind: 'tempo', beat: 4, bpm: 100 }, { kind: 'atempo', beat: 8 }]),
    );
    expect(curve.factorAt(2)).toBeCloseTo((1 + RIT_TO) / 2, 9);
    expect(curve.factorAt(4)).toBeCloseTo(1.25, 9);
    expect(curve.factorAt(10)).toBeCloseTo(1.25, 9);
  });

  it('reads a rit. written in every part’s row once', () => {
    const once = tempoCurve(parseSolfa('time: 4/4\n{M. 60}\nS  d :r /{rit}m :f |s :- /- :- |\nA  d :d /d :d |d :- /- :- |'));
    const each = tempoCurve(parseSolfa('time: 4/4\n{M. 60}\nS  d :r /{rit}m :f |s :- /- :- |\nA  d :d /{rit}d :d |d :- /- :- |'));
    for (const beat of [1, 2, 4, 6, 10, 12]) expect(each.factorAt(beat)).toBeCloseTo(once.factorAt(beat), 12);
    expect(each.factorAt(6)).toBeCloseTo((1 + RIT_TO) / 2, 9);
  });
});
