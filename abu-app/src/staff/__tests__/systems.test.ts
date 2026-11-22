import { describe, expect, it } from '@jest/globals';

import { findStaves, type Gray, type Staff } from '../staves';
import { byGaps, groupSystems, octaveDown, roleOfLabel, rolesAlike, rolesFor, rolesFromLabels, rolesWithWords } from '../systems';

/** A white page to draw on. */
function page(width: number, height: number): Gray {
  return { data: new Uint8Array(width * height).fill(255), width, height };
}

function ink(g: Gray, x: number, y: number) {
  if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data[Math.round(y) * g.width + Math.round(x)] = 0;
}

/** A staff's five lines, `gap` apart, from `left` to `right`, with a few note heads and stems on it. */
function staff(g: Gray, top: number, gap = 10, left = 100, right = 1100) {
  for (let k = 0; k < 5; k++) for (let x = left; x <= right; x++) ink(g, x, top + k * gap);
  for (let x = left + 80; x < right; x += 120) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -5; dx <= 5; dx++) ink(g, x + dx, top + 2 * gap + dy);
    for (let y = top + 2 * gap - 35; y < top + 2 * gap; y++) ink(g, x + 5, y);
  }
}

/** The system's first line, joining staves at the left. */
function join(g: Gray, x: number, from: number, to: number) {
  for (let y = from; y <= to; y++) {
    ink(g, x, y);
    ink(g, x + 1, y);
  }
}

describe('finding staves', () => {
  it('finds each staff with its lines and edges', () => {
    const g = page(1200, 900);
    [100, 260, 500, 660].forEach((top) => staff(g, top));
    const found = findStaves(g);
    expect(found.map((s) => Math.round(s.top))).toEqual([100, 260, 500, 660]);
    for (const s of found) {
      expect(s.gap).toBeCloseTo(10, 0);
      expect(Math.abs(s.left - 100)).toBeLessThan(4);
      expect(Math.abs(s.right - 1100)).toBeLessThan(4);
    }
  });
});

describe('grouping staves into systems', () => {
  it('joins the staves a line joins at the left, whether or not bar lines cross between them', () => {
    // Two systems of four (an SATB open score), lyrics' room between the staves, no bar lines between them.
    const g = page(1200, 1700);
    const tops = [100, 260, 420, 580, 900, 1060, 1220, 1380];
    tops.forEach((top) => staff(g, top));
    join(g, 100, 100, 620);
    join(g, 100, 900, 1420);
    const systems = groupSystems(g, findStaves(g));
    expect(systems.map((s) => s.length)).toEqual([4, 4]);
  });

  it('keeps a hymn’s two staves together and a solo line apart', () => {
    const g = page(1200, 1000);
    [100, 330, 520].forEach((top) => staff(g, top));
    join(g, 100, 330, 600);
    const systems = groupSystems(g, findStaves(g));
    expect(systems.map((s) => s.length)).toEqual([1, 2]);
  });

  it('groups by the gaps between staves where the page joins none', () => {
    const at = (top: number): Staff => ({ top, bottom: top + 40, gap: 10, left: 100, right: 1100, skew: 0 });
    // Pairs 60 apart within a system, 200 apart between.
    const staves = [100, 200, 440, 540, 780, 880].map(at);
    expect(byGaps(staves).map((s) => s.length)).toEqual([2, 2, 2]);
    // All alike and wide: a page of melody lines, a staff to a system.
    expect(byGaps([100, 300, 500].map(at)).map((s) => s.length)).toEqual([1, 1, 1]);
  });
});

describe('who sings each staff', () => {
  it('names the layouts choir sheets use', () => {
    expect(rolesFor(['G'], 1)).toEqual(['S']);
    expect(rolesFor(['F'], 1)).toEqual(['B']);
    // A hymn: soprano and alto on the treble staff, tenor and bass on the bass staff.
    expect(rolesFor(['G', 'F'], 2)).toEqual(['SA', 'TB']);
    // SATB open score.
    expect(rolesFor(['G', 'G', 'G', 'F'], 4)).toEqual(['S', 'A', 'T', 'B']);
    expect(rolesFor(['G', 'G', 'F', 'F'], 4)).toEqual(['S', 'A', 'T', 'B']);
    // A voice over a piano.
    expect(rolesFor(['G', 'G', 'F'], 3)).toEqual(['S', 'P1', 'P2']);
    // The voices over a piano, and the piano alone where the piece has voices over it elsewhere.
    expect(rolesFor(['G', 'G', 'G', 'F', 'G', 'F'], 6)).toEqual(['S', 'A', 'T', 'B', 'P1', 'P2']);
    expect(rolesFor(['G', 'F'], 6)).toEqual(['P1', 'P2']);
    // A hymn's two staves over a piano's.
    expect(rolesFor(['G', 'F', 'G', 'F'], 4)).toEqual(['SA', 'TB', 'P1', 'P2']);
    // Three voices' staves over a piano: which of them two voices share, by what's on them.
    expect(rolesFor(['G', 'G', 'F', 'G', 'F'], 5)).toEqual(['S', 'A', 'TB', 'P1', 'P2']);
    expect(rolesFor(['G', 'G', 'F', 'G', 'F'], 5, [true, false, false, true, true])).toEqual(['SA', 'T', 'B', 'P1', 'P2']);
    // A hymn's staves with only one voice on each all through: a tune and a bass.
    expect(rolesFor(['G', 'F'], 2, [false, false])).toEqual(['S', 'B']);
  });

  it('sings a tenor’s treble clef an octave lower', () => {
    expect(octaveDown('T', 'G')).toBe(true);
    expect(octaveDown('T', 'F')).toBe(false);
    expect(octaveDown('S', 'G')).toBe(false);
  });
});

describe('staves labelled on the page', () => {
  it('reads the labels sheets print', () => {
    expect(roleOfLabel('SOPRANO')).toBe('S');
    expect(roleOfLabel('Sop.')).toBe('S');
    expect(roleOfLabel('A.')).toBe('A');
    expect(roleOfLabel('Ten.')).toBe('T');
    expect(roleOfLabel('BASS')).toBe('B');
    expect(roleOfLabel('SOPRANO ALTO')).toBe('SA');
    expect(roleOfLabel('Sop & Alto')).toBe('SA');
    expect(roleOfLabel('TENOR BASS')).toBe('TB');
    expect(roleOfLabel('Organ')).toBe('P');
    expect(roleOfLabel('Ténors Basses')).toBe('TB');
    expect(roleOfLabel('Solo ténor')).toBe('T');
    expect(roleOfLabel('Contralto')).toBe('A');
    expect(roleOfLabel('Choir')).toBeNull();
  });

  it('takes the labels over the count, a piano’s for both its staves', () => {
    // A women's verse: two treble staves the count would call soprano and alto, labelled as such.
    expect(rolesFromLabels(['S.', 'A.'], ['S', 'A'])).toEqual(['S', 'A']);
    // "Sop & Alto" on one staff: the two voices share it.
    expect(rolesFromLabels(['Sop & Alto'], ['S'])).toEqual(['SA']);
    // Tenor and bass alone, which the count takes for a hymn's two staves.
    expect(rolesFromLabels(['Tenor', 'Bass'], ['SA', 'TB'])).toEqual(['T', 'B']);
    // "Organ" printed by its brace, beside one of its two staves.
    expect(rolesFromLabels(['SOPRANO', 'ALTO', 'TENOR', 'BASS', null, 'Organ'], ['S', 'A', 'T', 'B', 'P1', 'P2'])).toEqual(['S', 'A', 'T', 'B', 'P1', 'P2']);
    // A cantor's staff over the choir's: the tenor named twice, both staves the tenor's.
    expect(rolesFromLabels(['Tenor', 'S/A', 'T/B'], ['S', 'P1', 'P2'])).toEqual(['T', 'SA', 'TB']);
  });
});

describe('staves told apart by their words', () => {
  it('takes a pair with words under it for voices, and a pair with chords and none for a piano', () => {
    // A cantor over a hymn's two staves, counted as a voice over a piano.
    expect(rolesWithWords(['S', 'P1', 'P2'], ['G', 'G', 'F'], [false, true, true], [true, true, false])).toEqual(['S', 'SA', 'TB']);
    // Two voices over a piano, counted as SATB.
    expect(rolesWithWords(['S', 'A', 'T', 'B'], ['G', 'G', 'G', 'F'], [false, false, true, true], [true, true, false, false])).toEqual(['S', 'A', 'P1', 'P2']);
    // SATB with words under every staff stays SATB.
    expect(rolesWithWords(['S', 'A', 'T', 'B'], ['G', 'G', 'G', 'F'], [false, false, false, false], [true, true, true, true])).toEqual(['S', 'A', 'T', 'B']);
  });
});

describe('a piece keeps its layout', () => {
  it('gives systems alike the parts most of them were given', () => {
    const voicePiano = { clefs: ['G', 'G', 'F'] as const, roles: ['S', 'P1', 'P2'] as const };
    const odd = { clefs: ['G', 'G', 'F'] as const, roles: ['S', 'A', 'TB'] as const };
    const hymn = { clefs: ['G', 'F'] as const, roles: ['SA', 'TB'] as const };
    const out = rolesAlike([voicePiano, odd, voicePiano, hymn].map((s) => ({ clefs: [...s.clefs], roles: [...s.roles] })));
    expect(out).toEqual([
      ['S', 'P1', 'P2'],
      ['S', 'P1', 'P2'],
      ['S', 'P1', 'P2'],
      ['SA', 'TB'],
    ]);
  });
});
