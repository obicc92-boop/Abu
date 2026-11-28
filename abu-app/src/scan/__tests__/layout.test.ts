import { describe, expect, it } from '@jest/globals';

import { linesFromLayout, numbering } from '../layout';
import type { RowBox } from '../rows';

const row = (top: number, left = 40, right = 560): RowBox => ({ top, bottom: top + 14, baseline: top + 12, size: 20, left, right });

describe('lines from Claude’s grouping of the rows', () => {
  // A heading, then S A B and their words, then a verse's melody and its words.
  const rows = [row(10, 100, 500), row(40), row(60), row(80), row(100, 40, 520), row(140), row(160, 60, 480)];

  it('makes each line round its rows, in the page’s pixels, with its parts and its words after the part above', () => {
    const lines = linesFromLayout(
      [
        { notes: [{ row: 1, part: 'S' }, { row: 2, part: 'A' }, { row: 3, part: 'B' }], words: [4] },
        { notes: [{ row: 5, part: 'S' }], words: [6] },
      ],
      rows,
      2,
    );
    expect(lines).toEqual([
      { box: { top: 80, bottom: 228, left: 80, right: 1120 }, parts: ['S', 'A', 'B'], words: 1, wordRows: [{ box: { top: 200, bottom: 228, left: 80, right: 1040 }, after: 2 }] },
      { box: { top: 280, bottom: 348, left: 80, right: 1120 }, parts: ['S'], words: 1, wordRows: [{ box: { top: 320, bottom: 348, left: 120, right: 960 }, after: 0 }] },
    ]);
  });

  it('puts words between the parts after the part above them (S A, words, T B)', () => {
    const [line] = linesFromLayout([{ notes: [{ row: 1, part: 'S' }, { row: 2, part: 'A' }, { row: 4, part: 'T' }, { row: 5, part: 'B' }], words: [3] }], rows, 1);
    expect(line.parts).toEqual(['S', 'A', 'T', 'B']);
    expect(line.wordRows.map((w) => w.after)).toEqual([1]);
  });

  it('numbers the rows in a margin sized to the writing', () => {
    expect(numbering(rows)).toEqual({ size: 12, margin: 36 });
    expect(numbering([row(0), { ...row(40), bottom: 80 }, { ...row(100), bottom: 140 }])).toEqual({ size: 28, margin: 84 });
  });
});
