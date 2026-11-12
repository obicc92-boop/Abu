import { describe, expect, it } from '@jest/globals';

import { findRows, greedy, notesLikeness, toText, type Gray } from '../rows';

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
});
