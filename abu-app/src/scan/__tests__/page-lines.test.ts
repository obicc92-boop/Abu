import { describe, expect, it } from '@jest/globals';

import { garbled, groupByBarLines, groupLines, groupRows, notesRows, pageRows, partsFor, skewOf, type RowRead } from '../page-lines';
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

  it('follows a line drawn by hand between systems, though it slopes and waves', () => {
    // Too slanted for a ruled line: 34 pixels down across the page, wobbling a pixel or so.
    const img = page(600, 340, layout(2, 4, 14, 6, 50, 40));
    for (let x = 20; x < 580; x++) {
      const y = Math.round(122 + (34 * (x - 20)) / 560 + Math.sin(x / 15));
      img.data[y * 600 + x] = 20;
      img.data[(y + 1) * 600 + x] = 20;
    }
    const { rows, long } = pageRows(img);
    expect(rows).toHaveLength(8);
    expect(long.some((y) => y > 130 && y < 150)).toBe(true);
  });

  it('counts the bar lines running down from each row into the next', () => {
    // Two systems of three rows; each system's bar lines run from its first row's top to its last row's
    // bottom (as a printed hymn book draws them), at five places across.
    const rows = layout(2, 3, 14, 6, 30, 40);
    const img = page(600, 300, rows);
    for (const [first, last] of [
      [0, 2],
      [3, 5],
    ])
      for (const x of [100, 200, 300, 400, 500]) for (let y = rows[first][0]; y < rows[last][1]; y++) img.data[y * 600 + x] = 20;
    const { rows: found, links } = pageRows(img);
    expect(found).toHaveLength(6);
    expect(links).toEqual([5, 5, 0, 5, 5]);
    // Rows with no bar lines aren't joined: their letters stop at each row.
    expect(pageRows(page(600, 300, rows)).links).toEqual([0, 0, 0, 0, 0]);
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

    it('cuts each box as a line when most hold one part and its words (a cantor’s verses after a refrain)', () => {
      const { rows, long } = boxed([5, 2, 2, 2, 2]);
      const isNotes = rows.map((_, i) => (i < 5 ? i !== 2 : i % 2 === 1));
      expect(groupLines(rows, isNotes, long, long, 4).lines).toEqual([[0, 1, 2, 3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]);
      expect(groupLines(rows, isNotes, long, long, 0).lines).toEqual([[0, 1, 2, 3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]);
    });

    it('groups as before when every box holds one part (a staff under each part’s row of sol-fa)', () => {
      const { rows, long } = boxed([2, 2, 2, 2, 2, 2, 2, 2]);
      const isNotes = rows.map((_, i) => i % 2 === 1);
      expect(groupLines(rows, isNotes, long, long, 4)).toEqual({ lines: groupRows(rows, isNotes, long, 4), parts: 4, notes: isNotes });
    });

    it('keeps a system with a row of words under every part as one line, though it is taller', () => {
      const { rows, long } = boxed([5, 5, 8, 5]);
      const isNotes = rows.map((_, i) => (i < 10 || i >= 18 ? i % 5 !== 2 : i % 2 === 0));
      expect(groupLines(rows, isNotes, long, long, 4).lines[2]).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    });

    it('groups as before when a ruled line runs under every row', () => {
      const rows = layout(2, 4).map(([t, b]) => box(t, b));
      const isNotes = rows.map(() => true);
      const under = rows.slice(0, -1).map((r) => r.bottom + 3);
      expect(groupLines(rows, isNotes, under, under, 4)).toEqual({ lines: groupRows(rows, isNotes, under, 4), parts: 4, notes: isNotes });
    });
  });

  describe('on a printed page whose bar lines run down through each system', () => {
    const NOTES = 's :s :m | s :- :- | m\' :r\' :d\' | s :- :l |';
    const notesRead = (text = NOTES, width = 0.8): RowRead => ({ score: 0.98, beats: (text.match(/:/g) ?? []).length, text, height: 14, width });
    const wordsRead = (text = '', width = 0.8): RowRead => ({ score: text ? 0.9 : 0, beats: (text.match(/:/g) ?? []).length, text, height: 14, width });
    /** Rows top to bottom, with the gaps after each: close in a system, wider between. */
    const stack = (kinds: string, between: number[]) => {
      const rows: RowBox[] = [];
      let y = 20;
      [...kinds].forEach((_, i) => {
        rows.push(box(y, y + 14));
        y += 14 + (between.includes(i) ? 24 : 6);
      });
      return rows;
    };

    it('takes the rows the bar lines join as a line, each with its own number of parts', () => {
      // A three-part chorus (S A B, words), a four-part one (S A T B, words), then a verse's melody and its
      // words, its bar lines through both. N notes, W words.
      const kinds = 'NNNWNNNNWNW';
      const rows = stack(kinds, [3, 8]);
      const reads = [...kinds].map((k) => (k === 'N' ? notesRead() : wordsRead('Che ta-nu ihe')));
      const isNotes = [...kinds].map((k) => k === 'N');
      const links = [5, 5, 0, 0, 5, 5, 5, 0, 0, 4];
      for (const parts of [4, 0]) {
        const { lines, notes } = groupLines(rows, isNotes, [], [], parts, { links, reads });
        expect(lines).toEqual([
          [0, 1, 2, 3],
          [4, 5, 6, 7, 8],
          [9, 10],
        ]);
        expect(lines.map((l) => l.filter((i) => notes[i]).length)).toEqual([3, 4, 1]);
      }
      // Without the bar lines, "not sure" takes every row of notes for a line of its own.
      expect(groupLines(rows, isNotes, [], [], 0).lines).toHaveLength(8);
    });

    it('takes a row of words that read as notes for words: its beat marks are few, or it isn’t sol-fa', () => {
      const kinds = 'NNNWNNNW';
      const rows = stack(kinds, [3]);
      const reads = [notesRead(), notesRead(), notesRead(), notesRead('dflox\' :-de :m\' |'), notesRead(), notesRead(), notesRead(), notesRead('mma-ta | m-dm\' :- | ma |')];
      const isNotes = rows.map(() => true);
      const links = [5, 5, 3, 0, 5, 5, 4];
      const { lines, notes } = groupLines(rows, isNotes, [], [], 0, { links, reads });
      expect(lines).toEqual([
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ]);
      expect(notes).toEqual([true, true, true, false, true, true, true, false]);
    });

    it('keeps a part that comes in late, with a short row as thick with beat marks', () => {
      // Hosanna: S and A from the start, T and B only in the last bar.
      const kinds = 'NNNNW';
      const rows = stack(kinds, []);
      const late = 'm | d :d :- |';
      const reads = [notesRead(), notesRead(), notesRead(late, 0.25), notesRead(late, 0.25), wordsRead('Ho- sa nna dị- rị O-nye')];
      const { lines, notes } = groupLines(rows, rows.map((_, i) => i < 4), [], [], 4, { links: [4, 4, 4, 0], reads });
      expect(lines).toEqual([[0, 1, 2, 3, 4]]);
      expect(notes).toEqual([true, true, true, true, false]);
    });

    it('gives a line the words close under it, but not verses printed further down', () => {
      const kinds = 'NNNNWWWW';
      const rows = stack(kinds, []);
      const reads = [...kinds].map((k) => (k === 'N' ? notesRead() : wordsRead()));
      const isNotes = [...kinds].map((k) => k === 'N');
      const { lines } = groupLines(rows, isNotes, [], [], 4, { links: [3, 3, 3, 0, 0, 0, 0], reads });
      // At most one row of words for each part: four here, so the fifth row of text on isn't the line's.
      expect(lines).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]]);
      const more = stack('NNWWWW', []);
      const two = groupLines(more, [true, true, false, false, false, false], [], [], 4, { links: [3, 0, 0, 0, 0], reads: [notesRead(), notesRead(), wordsRead(), wordsRead(), wordsRead(), wordsRead()] });
      expect(two.lines).toEqual([[0, 1, 2, 3]]);
    });

    it('joins a system whose bar lines stop at the words between its upper and lower parts', () => {
      // S A, two rows of words, T B (drawn by hand a pair at a time), then S A, words, T B, a wider gap between.
      const kinds = 'NNWWNNNNWNN';
      const rows = stack(kinds, [5]);
      const reads = [...kinds].map((k) => (k === 'N' ? notesRead() : wordsRead('Rise, ye chil-dren')));
      const isNotes = [...kinds].map((k) => k === 'N');
      const links = [3, 0, 0, 0, 3, 0, 3, 0, 0, 3];
      for (const parts of [4, 0]) {
        const { lines, notes } = groupLines(rows, isNotes, [], [], parts, { links, reads });
        expect(lines).toEqual([
          [0, 1, 2, 3, 4, 5],
          [6, 7, 8, 9, 10],
        ]);
        expect(lines.map((l) => l.filter((i) => notes[i]).length)).toEqual([4, 4]);
      }
    });

    it('keeps lines of two parts apart when they’re as far apart as the lines around them', () => {
      // Three systems of S A and their words, the same gap after each.
      const kinds = 'NNWNNWNNW';
      const rows = stack(kinds, [2, 5]);
      const reads = [...kinds].map((k) => (k === 'N' ? notesRead() : wordsRead('All my in-ten-tion')));
      const isNotes = [...kinds].map((k) => k === 'N');
      expect(groupLines(rows, isNotes, [], [], 4, { links: [3, 0, 0, 3, 0, 0, 3, 0], reads }).lines).toEqual([
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
      ]);
      // A cantor's line over the choir's, words between each one's rows (the bar lines run through them).
      const call = stack('NWNWNWNW', [3]);
      const callReads = [...'NWNWNWNW'].map((k) => (k === 'N' ? notesRead() : wordsRead('Sọ Chukwu k’a-na')));
      const callNotes = [...'NWNWNWNW'].map((k) => k === 'N');
      expect(groupLines(call, callNotes, [], [], 4, { links: [4, 4, 4, 0, 4, 4, 4], reads: callReads }).lines).toEqual([
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ]);
    });

    it('leaves the grouping to the gaps where the bar lines run from one system into the next (a table)', () => {
      const rows = layout(3, 5).map(([t, b]) => box(t, b));
      const isNotes = rows.map((_, i) => i % 5 !== 2);
      const reads = rows.map((_, i) => (isNotes[i] ? notesRead() : wordsRead()));
      const links = rows.slice(1).map(() => 6);
      expect(groupByBarLines(rows, isNotes, reads, links, [], 4)).toBeNull();
      expect(groupLines(rows, isNotes, [], [], 4, { links, reads }).lines).toEqual(groupRows(rows, isNotes, [], 4));
    });

    it('leaves the grouping to the ruled lines on a page that boxes its systems', () => {
      const rows = layout(3, 5, 14, 6, 6).map(([t, b]) => box(t, b));
      const isNotes = rows.map((_, i) => i % 5 !== 2);
      const long = [rows[4].bottom + 3, rows[9].bottom + 3];
      const reads = rows.map((_, i) => (isNotes[i] ? notesRead() : wordsRead()));
      // Bar lines that would join the first system's first two rows only.
      const links = rows.slice(1).map((_, i) => (i === 0 ? 5 : 0));
      expect(groupLines(rows, isNotes, long, long, 4, { links, reads }).lines).toEqual(groupLines(rows, isNotes, long, long, 4).lines);
    });
  });

  it('tells a reading that isn’t sol-fa', () => {
    expect(garbled("s :s.d' :t.l | s :- :- | d1 :s1.l1 :s1.f1 |")).toBe(0);
    expect(garbled('m :- :- | : : | m :- :d.m | - :.,d |')).toBe(0);
    expect(garbled("dflox' :-de :m' |")).toBeGreaterThanOrEqual(0.6);
    expect(garbled("mma-ta | m-dm' :- | x :m'-ta |")).toBeGreaterThanOrEqual(0.6);
    expect(garbled('')).toBe(0);
  });

  it('names the parts', () => {
    expect(partsFor(4)).toEqual(['S', 'A', 'T', 'B']);
    expect(partsFor(2)).toEqual(['S', 'A']);
    expect(partsFor(6)).toHaveLength(6);
  });
});
