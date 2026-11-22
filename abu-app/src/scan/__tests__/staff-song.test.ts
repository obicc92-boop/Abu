import { describe, expect, it } from '@jest/globals';

import type { XNote, XScore } from '@/musicxml';

import { isMusicXml, staffSong } from '../staff-song';

/** A note as the staff reader gives it: quarters from the start, sounding MIDI, written letter. */
const note = (start: number, dur: number, midi: number, step: string, part: number): XNote => ({
  part,
  staff: 1,
  voice: '1',
  start,
  dur,
  midi,
  step,
  alter: 0,
  chord: false,
  tieStart: false,
  tieStop: false,
});

// Two staves read from a picture, four bars of 2/4 in G over two systems; the tenor's staff a treble clef sung an
// octave lower, as SATB scores print it.
const score: XScore = {
  title: '',
  composer: '',
  lyricist: '',
  measures: [0, 2, 4, 6].map((start, i) => ({ start, length: 2, number: String(i + 1), implicit: false })),
  keys: [{ at: 0, fifths: 1, mode: 'major' }],
  times: [{ at: 0, beats: 2, beatType: 4 }],
  parts: [
    {
      id: 'P1',
      name: 'Soprano',
      staves: 1,
      clefs: { 1: { sign: 'G', octave: 0 } },
      notes: [note(0, 1, 67, 'G', 0), note(1, 1, 69, 'A', 0), note(2, 2, 71, 'B', 0), note(4, 1, 72, 'C', 0), note(5, 1, 71, 'B', 0), note(6, 2, 67, 'G', 0)],
    },
    {
      id: 'P2',
      name: 'Tenor',
      staves: 1,
      clefs: { 1: { sign: 'G', octave: -1 } },
      notes: [note(0, 2, 59, 'B', 1), note(2, 2, 62, 'D', 1), note(4, 2, 64, 'E', 1), note(6, 2, 59, 'B', 1)],
    },
  ],
};

describe('a staff sheet in sol-fa', () => {
  const reading = {
    score,
    systems: [{ bars: [0, 2] as [number, number] }, { bars: [2, 4] as [number, number] }],
    marks: [
      { bar: 2, where: 'start' as const, text: 'segno' },
      { bar: 3, where: 'end' as const, text: 'D.S.' },
    ],
  };

  it('writes a line of music for each system, with the repeat marks where the sheet has them', () => {
    const song = staffSong(reading);
    expect(song.verified).toBe(true);
    expect(song.key).toBe('G');
    expect(song.lines.map((l) => l.bars)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(song.systemOf).toEqual([0, 1]);
    expect(song.lines.map((l) => l.rows)).toEqual([
      // The tenor written an octave above where it sounds, as sol-fa sheets print it.
      ['S  d :r | m :- |', 'T  m :- | s :- |'].join('\n'),
      ['S  {segno}f :m | d :- {D.S.} |', 'T  l :- | m :- |'].join('\n'),
    ]);
  });

  it('leaves out a system with no bars, keeping each line with its own system', () => {
    const song = staffSong({ ...reading, systems: [{ bars: [0, 0] }, ...reading.systems] });
    expect(song.systemOf).toEqual([1, 2]);
  });
});

describe('MusicXML files', () => {
  it('are known by their name or type', () => {
    expect(isMusicXml({ name: 'Ave Maria.mxl' })).toBe(true);
    expect(isMusicXml({ name: 'score.musicxml' })).toBe(true);
    expect(isMusicXml({ name: 'x', type: 'application/vnd.recordare.musicxml+xml' })).toBe(true);
    expect(isMusicXml({ name: 'Hymn.pdf', type: 'application/pdf' })).toBe(false);
    expect(isMusicXml({ name: 'page.jpg', type: 'image/jpeg' })).toBe(false);
  });
});
