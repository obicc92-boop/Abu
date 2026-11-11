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
    expect(dohTimeline(withChange('s/d'))[1].doh).toBe(62);
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
