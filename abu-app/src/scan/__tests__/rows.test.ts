import { describe, expect, it } from '@jest/globals';

import { barsFromBorders, findRows, greedy, notesLikeness, tableBorders, toText, type Gray } from '../rows';

/** A white picture with dark blocks standing in for rows of writing, and a table's lines. */
function picture(width: number, height: number, blocks: [number, number][], tableLines: number[] = []): Gray {
  const data = new Uint8Array(width * height).fill(255);
  for (const [top, bottom] of blocks)
    for (let y = top; y < bottom; y++)
      for (let x = 20; x < width - 20; x += 3) {
        data[y * width + x] = 0; // ink every third column, like letters
      }
  for (const x of tableLines) for (let y = 0; y < height; y++) data[y * width + x] = 0;
  return { data, width, height };
}

describe('finding rows', () => {
  it('finds each row of writing, ignoring the table’s lines', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [70, 90], [120, 140]], [10, 200, 390]));
    expect(rows.map((r) => [r.top, r.bottom])).toEqual([
      [19, 41],
      [69, 91],
      [119, 141],
    ]);
    expect(rows[0].left).toBe(20);
    expect(rows.every((r) => r.size === rows[0].size)).toBe(true);
  });

  it('drops thin bands like slurs under notes', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [44, 46], [80, 100]]));
    expect(rows).toHaveLength(2);
  });

  it('splits rows that touch when more are expected', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [40, 60]]), 2);
    expect(rows).toHaveLength(2);
  });

  it('splits a row twice as tall as the others, where two rows touch', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [70, 110]]), 3, 2);
    expect(rows).toHaveLength(3);
  });

  it('doesn’t cut a row in half to find a row of words that isn’t in the picture', () => {
    // Two parts, one row of words expected, but the line's picture only holds the parts.
    const rows = findRows(picture(400, 200, [[20, 48], [70, 106]]), 3, 2);
    expect(rows.map((r) => [r.top, r.bottom])).toEqual([
      [19, 49],
      [69, 107],
    ]);
  });
});

describe('a sheet set in a table', () => {
  it('finds the table’s borders, not a “|” typed in a row', () => {
    // Borders at 10, 200 and 390 through the whole line; a typed bar at 100 in the first row only.
    const img = picture(400, 200, [[20, 40], [70, 90], [120, 140]], [10, 200, 390]);
    for (let y = 18; y < 42; y++) img.data[y * 400 + 100] = 0;
    expect(tableBorders(img)).toEqual([10, 200, 390]);
  });

  it('finds none when the line has no table', () => {
    expect(tableBorders(picture(400, 200, [[20, 40], [70, 90]]))).toEqual([]);
  });

  it('reads a “|” away from the borders as the medium accent', () => {
    // m :- |f :r ‖ m :-  — the typed bar in the cell is "/", the border is the barline.
    const tokens = ['m', ':', '-', '|', 'f', ':', 'r', '|', 'm', ':', '-'];
    const xs = [20, 40, 50, 100, 120, 150, 170, 199, 220, 240, 250];
    expect(barsFromBorders(tokens, xs, [10, 200, 390], 16).join(' ')).toBe('m : - / f : r | m : -');
    expect(barsFromBorders(tokens, xs, [], 16)).toEqual(tokens);
  });
});

describe('reading the model’s output', () => {
  const TOKENS = ['d', 'r', 'm', '_', '|', ':'];
  /** Scores per step, the chosen class far above the rest. */
  const scores = (path: number[]) => {
    const classes = TOKENS.length + 1;
    const s = new Float32Array(path.length * classes).fill(-5);
    path.forEach((c, t) => (s[t * classes + c] = 5));
    return s;
  };

  it('collapses repeats and drops blanks', () => {
    // d d _ r r : blank m  →  d r : m
    const r = greedy(scores([1, 1, 0, 2, 2, 6, 0, 3]), 8, TOKENS.length + 1, TOKENS);
    expect(r.tokens).toEqual(['d', 'r', ':', 'm']);
    expect(r.at).toEqual([0.5, 3.5, 5, 7]);
    expect(r.sure).toBeGreaterThan(0.99);
  });

  it('writes tokens as an Abụ row', () => {
    expect(toText(['s', '_', '|', 'd', ':', '-', '.', 'r', '/', 'm', ':', 'd', '^'])).toBe("s1 | d :-.r /m :d' |");
    expect(toText(['s', '_', '_', ':', 'd'])).toBe('s2 :d |');
    expect(toText([])).toBe('');
  });

  it('tells rows of notes from rows of words', () => {
    const notes = { tokens: ['d', ':', 'r', ':', 'm', '|', 's', ':', 'l', ':', 't', ':', 'd'], mean: 0.9 };
    // A row of words read as sol-fa: a few "notes" (letters), no beat marks.
    const words = { tokens: ['|', '/', 't', '-', '|', 'd', 'e', 'm', '|', 'ma', 'f'], mean: 0.95 };
    expect(notesLikeness(notes)).toBeGreaterThan(notesLikeness(words));
  });

  it('takes a held note (one note, then all beat marks) for a row of notes', () => {
    // d' :- /- : | : /: | : /:  — the soprano holding one note across the line.
    const held = { tokens: ['d', '^', ':', '-', '/', '-', ':', '|', ':', '/', ':', '|', ':', '/', ':'], mean: 0.9 };
    const words = { tokens: ['|', '/', 't', '-', '|', 'd', 'e', 'm', '|', 'ma', 'f'], mean: 0.95 };
    expect(notesLikeness(held)).toBeGreaterThan(notesLikeness(words));
  });
});
