import { describe, expect, it } from '@jest/globals';

import { groupRows, notesRows, pageRows, partsFor, skewOf } from '../page-lines';
import type { Gray, RowBox } from '../rows';

/** A white page with rows of "writing" (short strokes, every third column) and ruled lines across it. */
function page(width: number, height: number, rows: [number, number][], rules: number[] = []): Gray {
  const data = new Uint8Array(width * height).fill(250);
  for (const [top, bottom] of rows)
    for (let y = top; y < bottom; y++)
      for (let x = 40; x < width - 40; x += 3) {
        if ((y - top) % 5 !== 4) data[y * width + x] = 20; // letters are short strokes, not ruled lines
      }
  for (const y of rules) for (let x = 20; x < width - 20; x++) data[y * width + x] = 20;
  return { data, width, height };
}

/** Rows of `h` pixels, `gap` apart, in lines of `n` rows, lines `between` apart. */
function layout(lines: number, n: number, h = 14, gap = 6, between = 30, from = 40): [number, number][] {
  const out: [number, number][] = [];
  let y = from;
  for (let l = 0; l < lines; l++) {
    for (let r = 0; r < n; r++) {
      out.push([y, y + h]);
      y += h + gap;
    }
    y += between - gap;
  }
  return out;
}

const box = (top: number, bottom: number): RowBox => ({ top, bottom, baseline: bottom - 2, size: 20, left: 40, right: 560 });

describe('rows on a page', () => {
  it('finds every row of writing, top to bottom', () => {
    const want = layout(3, 5);
    const { rows } = pageRows(page(600, 420, want));
    expect(rows).toHaveLength(15);
    rows.forEach((r, i) => {
      expect(Math.abs(r.top - want[i][0])).toBeLessThanOrEqual(2);
      expect(Math.abs(r.bottom - want[i][1])).toBeLessThanOrEqual(2);
    });
  });

  it('sets ruled lines aside as places to split', () => {
    const { rows, rules } = pageRows(page(600, 300, layout(2, 4, 14, 6, 30, 40), [120]));
    expect(rows).toHaveLength(8);
    expect(rules).toContain(120);
  });

  it('splits rows that touch', () => {
    // Two rows of 14 pixels with only a thin bridge between them, among single rows.
    const img = page(600, 300, [
      [40, 54],
      [70, 84],
      [100, 128],
      [150, 164],
    ]);
    // Where the two rows meet, only a few marks bridge the gap.
    for (let y = 112; y < 117; y++) for (let x = 40; x < 560; x++) img.data[y * 600 + x] = x % 30 ? 250 : 20;
    expect(pageRows(img).rows).toHaveLength(5);
  });
});

describe('a tilted photo', () => {
  it('finds how far the rows tilt', () => {
    const w = 600;
    const h = 400;
    const data = new Uint8Array(w * h).fill(250);
    const tilt = Math.tan((2 * Math.PI) / 180); // rows running 2° downhill to the right
    for (const y0 of [60, 120, 180, 240])
      for (let x = 40; x < 560; x += 3)
        for (let d = 0; d < 12; d++) {
          if (d % 5 === 4) continue;
          const y = Math.round(y0 + d + x * tilt);
          data[y * w + x] = 20;
        }
    expect(skewOf({ data, width: w, height: h })).toBeCloseTo(2, 0);
    expect(skewOf(page(600, 300, layout(2, 4)))).toBeCloseTo(0, 0);
  });
});

describe('telling notes from words', () => {
  it('keeps rows that read like the page’s other rows of notes', () => {
    const reads = [
      { score: 0.95, beats: 8 },
      { score: 0.9, beats: 2 }, // words read with two stray ":"
      { score: 0.97, beats: 9 },
      { score: 0.3, beats: 0 },
    ];
    expect(notesRows(reads)).toEqual([true, false, true, false]);
  });
});

describe('grouping rows into lines of music', () => {
  it('breaks at the wider gaps: four parts, words between alto and tenor', () => {
    // S A W T B, three times, with a wider gap between lines.
    const rows = layout(3, 5).map(([t, b]) => box(t, b));
    const isNotes = rows.map((_, i) => i % 5 !== 2);
    const lines = groupRows(rows, isNotes, []);
    expect(lines).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14],
    ]);
  });

  it('finds two-part lines when the gaps say so', () => {
    const rows = layout(4, 3).map(([t, b]) => box(t, b)); // S A W, four times
    const isNotes = rows.map((_, i) => i % 3 !== 2);
    expect(groupRows(rows, isNotes, []).map((l) => l.filter((i) => isNotes[i]).length)).toEqual([2, 2, 2, 2]);
  });

  it('uses the ruled lines of a table with no gaps between lines', () => {
    const rows = layout(2, 4, 14, 6, 6).map(([t, b]) => box(t, b));
    const isNotes = rows.map(() => true);
    const ruleY = rows[3].bottom + 3;
    expect(groupRows(rows, isNotes, [ruleY])).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
  });

  it('takes the number of parts the person gives', () => {
    const rows = layout(1, 6, 14, 6).map(([t, b]) => box(t, b));
    const isNotes = rows.map(() => true);
    expect(groupRows(rows, isNotes, [], 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it('leaves the heading and a footer out', () => {
    // A heading, then S A T B W, then far below a footer line of words.
    const rows = [box(10, 30), ...layout(1, 5, 14, 6, 0, 60).map(([t, b]) => box(t, b)), box(300, 314)];
    const isNotes = [false, true, true, true, true, false, false];
    expect(groupRows(rows, isNotes, [])).toEqual([[1, 2, 3, 4, 5]]);
  });

  it('names the parts', () => {
    expect(partsFor(4)).toEqual(['S', 'A', 'T', 'B']);
    expect(partsFor(2)).toEqual(['S', 'A']);
    expect(partsFor(6)).toHaveLength(6);
  });
});
