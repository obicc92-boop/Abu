import { describe, expect, it } from '@jest/globals';
import { OLD100 } from '../../data/demo-songs';
import { dohAt, dohMidi, dohTimeline, midiToHz, noteMidi, parseSolfa } from '..';

describe('doh', () => {
  it('sits between A♭3 and G4, as in the prototype', () => {
    expect(dohMidi(0)).toBe(60); // C4
    expect(dohMidi(7)).toBe(67); // G4
    expect(dohMidi(8)).toBe(56); // A♭3
    expect(dohMidi(11)).toBe(59); // B3
  });
});

describe('noteMidi', () => {
  const d = { deg: 0, oct: 0 };

  it('plays tenor and bass from the doh an octave below; solo and upper parts from doh', () => {
    const g = dohMidi(7);
    expect(noteMidi('S', d, g)).toBe(67);
    expect(noteMidi('A', d, g)).toBe(67);
    expect(noteMidi('Solo', d, g)).toBe(67);
    expect(noteMidi('T', d, g)).toBe(55);
    expect(noteMidi('B', d, g)).toBe(55);
  });

  it('applies octave marks and transpose', () => {
    expect(noteMidi('S', { deg: 11, oct: -1 }, 60)).toBe(59);
    expect(noteMidi('S', { deg: 0, oct: 1 }, 60, 2)).toBe(74);
  });

  it('voices Old Hundredth’s first chord in G as G4 D4 B3 G2', () => {
    const song = parseSolfa(OLD100, { time: '4/4', key: 7 });
    const doh = dohTimeline(song)[0].doh;
    expect(['S', 'A', 'T', 'B'].map((p) => noteMidi(p, song.events[p][0], doh))).toEqual([67, 62, 59, 43]);
  });
});

describe('dohTimeline', () => {
  const withChange = (to: string) =>
    parseSolfa(['key: G', 'S  d :r /m :f |', `key: ${to}`, 'S  s :- /- :- |'].join('\n'), { time: '4/4' });

  it('moves doh the shortest way at a key change', () => {
    expect(dohTimeline(withChange('D'))).toEqual([
      { beat: 0, doh: 67, semitone: 7 },
      { beat: 4, doh: 62, semitone: 2 },
    ]);
    expect(dohTimeline(withChange('A'))[1].doh).toBe(69);
    // A pivot keeps its note's pitch: G's soh is the new doh, D above it.
    expect(dohTimeline(withChange('s/d'))[1].doh).toBe(74);
    expect(dohTimeline(withChange('d/s'))[1].doh).toBe(60);
  });

  it('keeps each bridge note’s pitch, and each part changes at its own', () => {
    const song = parseSolfa(
      ['key: D', "S  d :d' /d'=f :m |", 'A  d :r /r=s1 :- |', 'T  m :m /m :m=l1 |', 'B  d :- /d :- |'].join('\n'),
      { time: '4/4' },
    );
    const midi = (part: string) => {
      const tl = dohTimeline(song, 0, part);
      return song.events[part].map((e) => noteMidi(part, e, dohAt(tl, e.start)));
    };
    expect(midi('S')).toEqual([62, 74, 74, 73]); // D5 stays D5 as the new fah, then the new me
    expect(midi('A')).toEqual([62, 64, 64]); // r=s1 is E4 in both keys
    expect(midi('T')).toEqual([54, 54, 54, 54]); // still in D on beat 3; m=l1 is F♯3 in both keys
    expect(midi('B')).toEqual([50, 57]); // no bridge note: the bass changes where the first part does
    expect(dohTimeline(song, 0, 'T').map((p) => p.beat)).toEqual([0, 3]);
    expect(dohTimeline(song).map((p) => [p.beat, p.semitone])).toEqual([[0, 2], [2, 9]]);
  });

  it('starts from the song record’s key when the text has none', () => {
    const song = parseSolfa('S  d :r /m :f |', { time: '4/4' });
    expect(dohTimeline(song, 5)).toEqual([{ beat: 0, doh: 65, semitone: 5 }]);
  });

  it('dohAt finds the doh in force at a beat', () => {
    const tl = dohTimeline(withChange('D'));
    expect(dohAt(tl, 0)).toBe(67);
    expect(dohAt(tl, 3.5)).toBe(67);
    expect(dohAt(tl, 4)).toBe(62);
  });
});

describe('midiToHz', () => {
  it('tunes A4 to 440 Hz', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });
});
