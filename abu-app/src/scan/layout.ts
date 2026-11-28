/**
 * Lines of music on a page as Claude grouped the app's rows (owner's request, 28 November 2026: cutting printed
 * and handwritten sol-fa into lines "needs some reasoning"). The app finds the rows itself (page-lines.ts) and
 * draws the page with each one boxed and numbered (`numberedPage` in own-reader.web.ts); Claude says which rows
 * are each line's notes, who sings each, and which are its words (abu-api/src/scan.ts, `readLayout`). Each line
 * then becomes a line to cut out and read, as the app's own grouping would make it.
 *
 * Pure module: no React, no canvas.
 */
import type { ScanLayoutLine } from '../api/client';
import type { RowBox } from './rows';
import type { Box, FoundLine } from './types';

/** How the page is drawn for Claude: the numbers' size and the white margin they go in, from the rows' height. */
export function numbering(rows: RowBox[]): { size: number; margin: number } {
  const heights = rows.map((r) => r.bottom - r.top).sort((a, b) => a - b);
  const usual = heights[Math.floor(heights.length / 2)] ?? 20;
  const size = Math.max(12, Math.round(Math.min(28, usual * 0.8)));
  return { size, margin: 3 * size };
}

/**
 * Claude's lines as lines to cut from the page: each with its box (round all its rows, in the page's pixels:
 * the rows were found on the page shrunk `k` times), its parts top to bottom, and its rows of words, each after
 * the part whose row is above it.
 */
export function linesFromLayout(layout: ScanLayoutLine[], rows: RowBox[], k: number): FoundLine[] {
  const boxOf = (g: number[]): Box => ({
    top: Math.min(...g.map((i) => rows[i].top)) * k,
    bottom: Math.max(...g.map((i) => rows[i].bottom)) * k,
    left: Math.min(...g.map((i) => rows[i].left)) * k,
    right: Math.max(...g.map((i) => rows[i].right)) * k,
  });
  return layout.map((l) => {
    const notes = [...l.notes].sort((a, b) => a.row - b.row);
    const words = [...l.words].sort((a, b) => a - b);
    const wordRows = words.map((w) => ({ box: boxOf([w]), after: Math.max(0, notes.filter((n) => n.row < w).length - 1) }));
    return { box: boxOf([...notes.map((n) => n.row), ...words]), parts: notes.map((n) => n.part), words: words.length, wordRows };
  });
}
