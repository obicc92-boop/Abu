import { describe, expect, it } from '@jest/globals';

import { groupLines, groupRows, notesRows, pageRows, partsFor, skewOf } from '../page-lines';
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

  it('tells a ruled line that can box a system from a slur', () => {
    // A line across the page at 120; a slur across a fifth of it under a row, at 92.
    const img = page(600, 300, layout(2, 4, 14, 6, 30, 40), [120]);
    for (let x = 200; x < 320; x++) img.data[92 * 600 + x] = 20;
    const { long } = pageRows(img);
    expect(long).toContain(120);
    expect(long).not.toContain(92);
  });

  it('sets ruled lines aside as places to split', () => {
    const { rows, rules } = pageRows(page(600, 300, layout(2, 4, 14, 6, 30, 40), [120]));
    expect(rows).toHaveLength(8);
    expect(rules).toContain(120);
  });

  it('sets hand-drawn table lines aside, though they lean', () => {
    const img = page(600, 420, layout(3, 5));
    // Twelve table lines from top to bottom, each leaning a pixel every 8 rows.
    for (let k = 0; k < 12; k++) for (let y = 20; y < 400; y++) img.data[y * 600 + 45 + k * 42 + Math.floor(y / 8)] = 20;
    expect(pageRows(img).rows).toHaveLength(15);
  });

  it('splits blocks of rows that touch, even when every block is one (handwriting in a table)', () => {
    const w = 600;
    const h = 1200;
    const data = new Uint8Array(w * h).fill(250);
    // Rows 20 pixels apart, their letters 8 pixels tall (as handwriting's strokes are about 40% of that).
    const rows = layout(3, 5, 8, 12, 40);
    for (const [top, bottom] of rows) for (let y = top; y < bottom; y++) for (let x = 40; x < w - 40; x += 3) data[y * w + x] = 20;
    // In each block, marks bridge each row to the next (in different places, as a tail touches the
    // letter below), so no gap is clear of ink.
    rows.forEach(([, bottom], i) => {
      const next = rows[i + 1];
      if (next && next[0] - bottom < 20) for (let y = bottom; y < next[0]; y++) for (let x = 40 + (i % 2) * 21; x < w - 40; x += 45) data[y * w + x] = 20;
    });
    expect(pageRows({ data, width: w, height: h }).rows).toHaveLength(15);
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

  it('weighs how each row read, with its height and width, when they are given', () => {
    const row = (score: number, text: string, height = 26, width = 0.9) => ({ score, beats: (text.match(/:/g) ?? []).length, text, height, width });
    const reads = [
      row(0.97, 'm :- /r :d | t1 :- /- :- | d :r /m :f | s :- /- :- |'),
      row(0.95, 'd :- /t1 :l1 | s1 :- /- :- | l1 :t1 /d :r | m :- /- :- |'),
      // A row of words read with stray marks: confident, but its beats are few and mostly empty.
      row(0.9, ': : | : /d : | : / : |'),
      row(0.96, 's :- /f :m | r :- /- :- | m :f /s :l | t :- /- :- |'),
      // A heading across part of the page.
      row(0.4, 'd |', 30, 0.4),
      row(0.98, 'd :- /s1 :l1 | s1 :- /- :- | f1 :r1 /d1 :t2 | d1 :- /- :- |'),
    ];
    expect(notesRows(reads)).toEqual([true, true, false, true, false, true]);
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

  describe('on a page whose systems are boxed by ruled lines', () => {
    /** Rows top to bottom from [top, bottom] pairs, and the ruled lines between the boxes. */
    const boxed = (systems: number[]) => {
      const rows: RowBox[] = [];
      const long: number[] = [];
      let y = 20;
      systems.forEach((n, k) => {
        if (k) {
          long.push(y + 3);
          y += 8;
        }
        for (let r = 0; r < n; r++) {
          rows.push(box(y, y + 14));
          y += 20;
        }
      });
      return { rows, long };
    };

    it('cuts each box as a line, with its own number of parts', () => {
      // S A W T B; then a semi-chorus S A W T W; then S A W T B. Four parts at a time would put the
      // second box's last words row and the third box's soprano in one line.
      const { rows, long } = boxed([5, 5, 5]);
      const isNotes = [true, true, false, true, true, true, true, false, true, false, true, true, false, true, true];
      const { lines, parts } = groupLines(rows, isNotes, long, long, 4);
      expect(lines).toEqual([
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8, 9],
        [10, 11, 12, 13, 14],
      ]);
      expect(parts).toBe(4);
      expect(lines.map((l) => l.filter((i) => isNotes[i]).length)).toEqual([4, 3, 4]);
      expect(groupRows(rows, isNotes, long, 4)[1]).not.toEqual([5, 6, 7, 8, 9]);
    });

    it('keeps a box as one line when a row of words in it reads like notes', () => {
      const { rows, long } = boxed([5, 5, 5]);
      const isNotes = rows.map(() => true);
      expect(groupLines(rows, isNotes, long, long, 4).lines).toEqual([
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8, 9],
        [10, 11, 12, 13, 14],
      ]);
    });

    it('splits a box holding two systems (no ruled line between them) at its widest gap', () => {
      const { rows, long } = boxed([5, 10, 5]);
      // A wider gap between the two systems in the middle box.
      for (let i = 10; i < rows.length; i++) rows[i] = { ...rows[i], top: rows[i].top + 10, bottom: rows[i].bottom + 10 };
      const isNotes = rows.map((_, i) => [0, 1, 3, 4].includes(i % 5));
      expect(groupLines(rows, isNotes, long, long.map((y, k) => (k ? y + 10 : y)), 4).lines).toEqual([
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8, 9],
        [10, 11, 12, 13, 14],
        [15, 16, 17, 18, 19],
      ]);
    });

    it('splits boxes holding two systems at a time, judged by a box holding one', () => {
      // Systems of S A W T B, wider gaps between them; ruled lines only after the first and third.
      const rows = layout(5, 5).map(([t, b]) => box(t, b));
      const isNotes = rows.map((_, i) => i % 5 !== 2);
      const after = (k: number) => rows[5 * k + 4].bottom + 4;
      const long = [after(0), after(2)];
      expect(groupLines(rows, isNotes, long, long, 4).lines).toEqual(groupRows(rows, isNotes, long, 4));
    });

    it('joins a system cut in two by a ruled line under one part’s row', () => {
      // The first system has a ruled line under its soprano as well as round it.
      const { rows, long } = boxed([1, 4, 5, 5]);
      for (let i = 1; i < rows.length; i++) rows[i] = { ...rows[i], top: rows[i].top - 4, bottom: rows[i].bottom - 4 };
      const lines = [long[0] - 4, ...long.slice(1).map((y) => y - 4)];
      const isNotes = [true, true, false, true, true, true, true, false, true, true, true, true, false, true, true];
      expect(groupLines(rows, isNotes, lines, lines, 4).lines).toEqual([
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8, 9],
        [10, 11, 12, 13, 14],
      ]);
    });

    it('takes boxes of two rows of notes for two-part lines, even with four parts asked for', () => {
      const { rows, long } = boxed([3, 3, 3]);
      const isNotes = rows.map((_, i) => i % 3 !== 2);
      expect(groupLines(rows, isNotes, long, long, 4).lines).toEqual([
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
      ]);
    });

    it('leaves a footer far under the last box out, without splitting its system', () => {
      const { rows, long } = boxed([5, 5, 5]);
      rows.push(box(rows[rows.length - 1].bottom + 60, rows[rows.length - 1].bottom + 74));
      const isNotes = rows.map((_, i) => i < 15 && i % 5 !== 2);
      expect(groupLines(rows, isNotes, long, long, 4).lines).toEqual([
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8, 9],
        [10, 11, 12, 13, 14],
      ]);
    });

    it('says how many parts a line has at most only when the person said', () => {
      const { rows, long } = boxed([5, 5, 5]);
      const isNotes = rows.map((_, i) => i % 5 !== 2);
      expect(groupLines(rows, isNotes, long, long, 4).parts).toBe(4);
      expect(groupLines(rows, isNotes, long, long, 0).parts).toBe(0);
    });

    it('keeps a box’s rows from its ruled line, even one not read as notes', () => {
      // The second box's soprano read as words: it stays in its line, for the line's reader to read again.
      const { rows, long } = boxed([5, 5, 5]);
      const isNotes = rows.map((_, i) => i !== 5 && i % 5 !== 2);
      expect(groupLines(rows, isNotes, long, long, 4).lines[1]).toEqual([5, 6, 7, 8, 9]);
    });

    it('groups as before when a ruled line runs under every row', () => {
      const rows = layout(2, 4).map(([t, b]) => box(t, b));
      const isNotes = rows.map(() => true);
      const under = rows.slice(0, -1).map((r) => r.bottom + 3);
      expect(groupLines(rows, isNotes, under, under, 4)).toEqual({ lines: groupRows(rows, isNotes, under, 4), parts: 4 });
    });
  });

  it('names the parts', () => {
    expect(partsFor(4)).toEqual(['S', 'A', 'T', 'B']);
    expect(partsFor(2)).toEqual(['S', 'A']);
    expect(partsFor(6)).toHaveLength(6);
  });
});
