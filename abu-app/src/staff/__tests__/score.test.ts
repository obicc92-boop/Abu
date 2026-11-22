import { describe, expect, it } from '@jest/globals';

import { findVoices, toSolfa } from '@/musicxml';

import { decodeStaff, type Clef, type Token } from '../decode';
import { readingScore, type Syllable, type SystemPlace } from '../score';
import type { Role } from '../systems';
import { timeSystems, type StaffTokens } from '../timing';
import { syllablesOf } from '../words';

/**
 * A staff's tokens as the reader writes them, at the columns given: each
 * group's tokens one column after another from its column (so notes in
 * different staves at the same column stand one over the other).
 */
function line(groups: [number, string][]): StaffTokens {
  const tokens: Token[] = groups.flatMap(([col, text]) => text.split(' ').map((t, k): Token => [t, col + k]));
  return { tokens, x: (t) => t * 4, gap: 8 };
}

/** Systems of staves read into the score, and its sol-fa rows by part (spaces taken out). */
function read(systems: { roles: Role[]; clefs: Clef[]; staves: StaffTokens[] }[], words?: (system: number, part: string) => Syllable[] | undefined) {
  const reading = timeSystems(
    systems.map((s) => ({
      staves: s.staves,
      clefs: s.clefs,
      lanes: s.roles.map(String),
      ...(s.roles.includes('P1') ? { piano: [s.roles.indexOf('P1'), s.roles.indexOf('P2')] as [number, number] } : {}),
    })),
  );
  const places: SystemPlace[] = systems.map((s) => ({ page: 0, box: { top: 0, bottom: 100, left: 0, right: 100 }, roles: s.roles, clefs: s.clefs }));
  const out = readingScore(reading, places, { xOf: (k, e) => systems[k].staves[e.staff].x(e.at), gapOf: () => 8, words });
  const voices = findVoices(out.score);
  const solfa = toSolfa(out.score, voices.lines);
  const rows: Record<string, string> = {};
  for (const l of solfa.text.split('\n')) {
    const m = /^(S|A|T|B)\s+(.*)$/.exec(l);
    if (m) rows[m[1]] = (rows[m[1]] ?? '') + m[2].replace(/\s+/g, '');
  }
  return { ...out, voices, solfa, rows };
}

describe('decoding a staff', () => {
  it('spells notes from the clef, the key and the bar’s accidentals', () => {
    // F major: B is flat; a natural holds to the bar's end; the next bar is in the key again.
    const staff = decodeStaff(
      ['clef.G', 'key:-1', 'time:4/4', 'n4@4', 'acc.n', 'n4@4', 'n4@4', 'n4@2', 'bar', 'n1@4', 'bar'].map((t, i): Token => [t, i * 3]),
      { clef: 'G', fifths: 0, time: '4/4' },
    );
    expect(staff.start).toEqual({ clef: 'G', fifths: -1, time: '4/4' });
    expect(staff.bars[0].events.map((e) => e.heads[0].alter)).toEqual([-1, 0, 0, 0]);
    expect(staff.bars[1].events[0].heads[0].alter).toBe(-1);
  });

  it('carries a tie over the bar line', () => {
    const staff = decodeStaff(
      ['clef.F', 'n2@3', 'n2@3', 'tie', 'bar', 'n2@3', 'n2@4', 'bar'].map((t, i): Token => [t, i * 3]),
      { clef: 'F', fifths: 0, time: '4/4' },
    );
    expect(staff.bars[0].events[1].heads[0].tie).toBe(true);
    expect(staff.bars[1].events[0].heads[0].tiedIn).toBe(true);
    expect(staff.bars[1].events[1].heads[0].tiedIn).toBe(false);
  });
});

describe('staff readings as sol-fa', () => {
  it('splits a hymn’s two staves into soprano, alto, tenor and bass', () => {
    // C major. Treble: chords on one stem, and a second voice's stems down; bass the same.
    const SA = line([
      [0, 'clef.G key:0 time:4/4'],
      [10, 'n4@0 +@-2'],
      [20, 'n4@1 n4@-1/2'],
      [30, 'n4@2 +@0'],
      [40, 'n4@5 n4@0/2'],
      [50, 'bar'],
    ]);
    const TB = line([
      [0, 'clef.F key:0 time:4/4'],
      [10, 'n4@10 +@3'],
      [20, 'n4@9 n4@4/2'],
      [30, 'n4@7 +@0'],
      [40, 'n4@7 n4@3/2'],
      [50, 'bar'],
    ]);
    const { rows, score } = read([{ roles: ['SA', 'TB'], clefs: ['G', 'F'], staves: [SA, TB] }]);
    expect(score.parts.map((p) => p.name)).toEqual(['Soprano', 'Alto', 'Tenor', 'Bass']);
    expect(rows.S).toBe("m:f:s:d'|");
    expect(rows.A).toBe('d:r:m:m|');
    // The tenor written as sheets print it, an octave over where it sounds.
    expect(rows.T).toBe("d':t:s:s|");
    expect(rows.B).toBe('d:r:s1:d|');
  });

  it('reads an SATB open score, the tenor’s treble clef an octave lower', () => {
    const S = line([[0, 'clef.G key:1 time:3/4'], [10, 'n4@5'], [20, 'n4@4'], [30, 'n4@2'], [40, 'bar']]);
    const A = line([[0, 'clef.G key:1 time:3/4'], [10, 'n4@0'], [20, 'n4@-1'], [30, 'n4@-1'], [40, 'bar']]);
    const T = line([[0, 'clef.G key:1 time:3/4'], [10, 'n4@5'], [20, 'n4@4'], [30, 'n4@3'], [40, 'bar']]);
    const B = line([[0, 'clef.F key:1 time:3/4'], [10, 'n4@3'], [20, 'n4@0'], [30, 'n4@0'], [40, 'bar']]);
    const { rows, score, solfa } = read([{ roles: ['S', 'A', 'T', 'B'], clefs: ['G', 'G', 'G', 'F'], staves: [S, A, T, B] }]);
    const tenor = score.parts.find((p) => p.name === 'Tenor')!;
    expect(tenor.clefs[1]).toEqual({ sign: 'G', octave: -1 });
    // C5 written in the tenor's clef sounds C4.
    expect(tenor.notes[0].midi).toBe(60);
    expect(solfa.key).toBe('G');
    expect(solfa.time).toBe('3/4');
    // G major (doh the G above middle C): C is fah, B me, E lah, D soh; the tenor and bass read from the G below.
    expect(rows.S).toBe('f:m:d|');
    expect(rows.A).toBe('l1:s1:s1|');
    expect(rows.T).toBe('f:m:r|');
    expect(rows.B).toBe('f1:d1:d1|');
  });

  it('keeps a bar line most of the staves read where one missed it', () => {
    const bars = (missing: boolean) =>
      line([
        [0, 'clef.G key:0 time:2/4'],
        [10, 'n4@2'],
        [20, 'n4@2'],
        ...(missing ? [] : ([[30, 'bar']] as [number, string][])),
        [40, 'n2@3'],
        [50, 'bar'],
      ]);
    const { score, rows } = read([{ roles: ['S', 'A', 'T', 'B'], clefs: ['G', 'G', 'G', 'G'], staves: [bars(false), bars(true), bars(false), bars(false)] }]);
    expect(score.measures.length).toBe(2);
    expect(rows.A).toBe('s:s|l:-|');
  });

  it('leaves a piano under the voices out of the sol-fa', () => {
    const S = line([[0, 'clef.G key:0 time:2/4'], [10, 'n4@2'], [20, 'n4@0'], [30, 'bar']]);
    const RH = line([[0, 'clef.G key:0 time:2/4'], [10, 'n4@0 +@2 +@4'], [20, 'n4@0 +@2'], [30, 'bar']]);
    const LH = line([[0, 'clef.F key:0 time:2/4'], [10, 'n2@3'], [30, 'bar']]);
    const { score, voices, rows } = read([{ roles: ['S', 'P1', 'P2'], clefs: ['G', 'G', 'F'], staves: [S, RH, LH] }]);
    expect(score.parts.map((p) => p.name)).toEqual(['Soprano', 'Piano']);
    expect(voices.lines.map((l) => l.part)).toEqual(['S']);
    expect(rows.S).toBe('s:m|');
  });

  it('joins ties into one note, and makes a short first bar a pickup', () => {
    const S = line([
      [0, 'clef.G key:0 time:4/4'],
      [10, 'n4@2'],
      [20, 'bar'],
      [30, 'n2@5'],
      [40, 'n2@4 tie'],
      [50, 'bar'],
      [60, 'n1@4'],
      [70, 'bar'],
    ]);
    const { score, rows } = read([{ roles: ['S'], clefs: ['G'], staves: [S] }]);
    expect(score.measures.map((m) => [m.length, m.implicit])).toEqual([
      [1, true],
      [4, false],
      [4, false],
    ]);
    const notes = score.parts[0].notes;
    expect(notes.map((n) => [n.start, n.dur])).toEqual([
      [0, 1],
      [1, 2],
      [3, 6],
    ]);
    expect(rows.S).toBe("s|d':-:t:-|-:-:-:-|");
  });

  it('gives the repeat signs and jumps as marks, at their bars', () => {
    const S = line([
      [0, 'clef.G key:0 time:2/4'],
      [10, 'rpt.start segno n2@2'],
      [20, 'bar'],
      [30, 'volta1 n2@3'],
      [40, 'rpt.end'],
      [50, 'volta2 n2@4'],
      [60, 'ds.coda bar.end'],
    ]);
    const { marks, score } = read([{ roles: ['S'], clefs: ['G'], staves: [S] }]);
    expect(marks).toEqual([
      { bar: 0, where: 'start', text: '|:' },
      { bar: 0, where: 'start', text: 'segno' },
      { bar: 1, where: 'start', text: '1.' },
      { bar: 1, where: 'end', text: ':|' },
      { bar: 2, where: 'start', text: '2.' },
      { bar: 2, where: 'end', text: 'D.S. al Coda' },
    ]);
    expect(score.directions?.map((d) => [d.bar, d.kind, d.text])).toContainEqual([2, 'end', 'D.S. al Coda']);
  });

  it('puts the words under their notes, and holds a note the words say is tied', () => {
    // "Glo - ry ___" over three notes, the last two the same pitch (a tie the reader missed).
    const S = line([[0, 'clef.G key:0 time:4/4'], [10, 'n4@2'], [20, 'n4@3'], [30, 'n2@3'], [40, 'bar']]);
    const words = (_: number, part: string): Syllable[] | undefined =>
      part === 'Soprano'
        ? [
            { x: 40, text: 'Glo', syllabic: 'begin' },
            { x: 80, text: 'ry', syllabic: 'end' },
          ]
        : undefined;
    const { score, rows } = read([{ roles: ['S'], clefs: ['G'], staves: [S] }], words);
    const notes = score.parts[0].notes;
    expect(notes.map((n) => [n.dur, n.lyric?.text])).toEqual([
      [1, 'Glo'],
      [3, 'ry'],
    ]);
    expect(notes[0].lyric?.syllabic).toBe('begin');
    expect(rows.S).toBe('s:l:-:-|');
  });
});

describe('a time signature misread', () => {
  it('gives way to the time the bars hold (4/4 read as 4/2: every bar half full, padded with rests)', () => {
    // Notes spaced as printed: a few staff spaces apart, and from the bar lines.
    const bar = (col: number): [number, string][] => ['n4@0', 'n4@3', 'n4@3', 'n4@2', 'bar'].map((t, k) => [col + 8 * (k + 1), t]);
    const staff = line([[0, 'clef.G key:0 time:4/2'], ...[0, 1, 2, 3, 4].flatMap((k) => bar(12 + 40 * k))]);
    const { score, solfa } = read([{ roles: ['S'], clefs: ['G'], staves: [staff] }]);
    expect(score.times[0]).toMatchObject({ beats: 4, beatType: 4 });
    expect(solfa.text).toContain('S  m :l :l :s |');
  });

  it('keeps a time the bars do hold', () => {
    const bar = (col: number, notes: string[]): [number, string][] => [...notes, 'bar'].map((t, k) => [col + 8 * (k + 1), t]);
    const staff = line([[0, 'clef.G key:0 time:3/4'], ...bar(12, ['n4@0', 'n4@3', 'n4@3']), ...bar(44, ['n4@0', 'n4@3', 'n4@3']), ...bar(76, ['n2@0', 'n4@2']), ...bar(100, ['n2@0', 'dot'])]);
    const { score } = read([{ roles: ['S'], clefs: ['G'], staves: [staff] }]);
    expect(score.times[0]).toMatchObject({ beats: 3, beatType: 4 });
  });
});

describe('words as printed', () => {
  it('cuts a row into syllables, joined by hyphens', () => {
    const chars = (text: string, x0 = 0) => [...text].map((c, i) => ({ c, x0: x0 + i * 6, x1: x0 + i * 6 + 6, y: 100, size: 10, mark: '' }));
    const row = [...chars('Re - joice Mass is en-ded___ A'), ...chars('-', 200), ...chars('men', 212)];
    expect(syllablesOf(row).map((s) => [s.text, s.syllabic])).toEqual([
      ['Re', 'begin'],
      ['joice', 'end'],
      ['Mass', 'single'],
      ['is', 'single'],
      ['en', 'begin'],
      ['ded', 'end'],
      ['A', 'begin'],
      ['men', 'end'],
    ]);
  });
});
