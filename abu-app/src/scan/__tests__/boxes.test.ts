import { describe, expect, it } from '@jest/globals';

import { boxBands, boxedSystems, pageRules, partsOfBoxes, partsOfRows, ruleY, type BoxedSystem, type BoxRow } from '../boxes';
import type { Gray } from '../rows';

/** A white page. */
function blank(width: number, height: number): Gray {
  return { data: new Uint8Array(width * height).fill(255), width, height };
}

/** A ruled line across, sloping, three pixels thick. */
function rule(g: Gray, y: number, slope: number, from = 0, to = g.width) {
  for (let x = from; x < to; x++)
    for (let d = 0; d < 3; d++) {
      const yy = Math.round(y + slope * x) + d;
      if (yy >= 0 && yy < g.height) g.data[yy * g.width + x] = 0;
    }
}

/** A border down, three pixels thick. */
function border(g: Gray, x: number, top: number, bottom: number) {
  for (let y = top; y < bottom; y++) for (let d = 0; d < 3; d++) g.data[y * g.width + x + d] = 0;
}

/** A row of writing: ink every third column, as letters leave gaps. */
function writing(g: Gray, left: number, right: number, top: number, bottom: number) {
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x += 3) g.data[y * g.width + x] = 0;
}

/** A boxed page: three systems of four boxes, each box with rows of writing at heights of its own. */
function boxedPage(): Gray {
  const g = blank(600, 900);
  const rules = [60, 330, 600, 870];
  for (const y of rules) rule(g, y, 0.01, 20, 580);
  for (let s = 0; s < 3; s++)
    for (const x of [20, 160, 300, 440, 577]) border(g, x, rules[s] + 3, rules[s + 1] + 9);
  for (let s = 0; s < 3; s++)
    for (let b = 0; b < 4; b++) {
      const drift = (b % 2) * 12;
      for (let r = 0; r < 4; r++) {
        const top = rules[s] + 30 + drift + r * 60;
        writing(g, 30 + 140 * b, 140 + 140 * b, top, top + 22);
      }
    }
  return g;
}

describe('rules across a page', () => {
  it('finds sloping rules, but not rows of writing or a short slur', () => {
    const g = blank(600, 400);
    rule(g, 50, 0.02);
    rule(g, 300, -0.015);
    writing(g, 20, 580, 120, 145);
    rule(g, 200, 0, 100, 300); // a slur, a third of the page
    const found = pageRules(g);
    expect(found).toHaveLength(2);
    expect(Math.abs(ruleY(found[0], 300) - (50 + 0.02 * 300 + 1))).toBeLessThanOrEqual(2);
    expect(Math.abs(found[0].slope - 0.02)).toBeLessThan(0.005);
    expect(Math.abs(ruleY(found[1], 300) - (300 - 0.015 * 300 + 1))).toBeLessThanOrEqual(2);
  });
});

describe('boxed systems', () => {
  it('cuts a boxed page into its systems and each system into its boxes', () => {
    const g = boxedPage();
    const systems = boxedSystems(g, pageRules(g));
    expect(systems).not.toBeNull();
    expect(systems!.map((s) => s.boxes.length)).toEqual([4, 4, 4]);
    // Each box lies between its borders.
    const box = systems![0].boxes[1];
    expect(box.left).toBeGreaterThan(160);
    expect(box.right).toBeLessThan(300);
  });

  it('leaves a page without boxes alone', () => {
    const g = blank(600, 900);
    for (const y of [60, 330, 600, 870]) rule(g, y, 0, 20, 580);
    for (let r = 0; r < 12; r++) writing(g, 30, 570, 80 + r * 60, 102 + r * 60);
    expect(boxedSystems(g, pageRules(g))).toBeNull();
  });
});

describe('rows in a box', () => {
  /** A box's ink counted row by row: bands of `ink` pixels per row of pixels. */
  function profile(height: number, bands: [number, number, number][]): Float32Array {
    const p = new Float32Array(height);
    for (const [a, b, ink] of bands) for (let y = a; y < b; y++) p[y] = ink;
    return p;
  }

  it('splits notes and the words under them where they touch, at their thinnest', () => {
    // Notes 100–125, words 125–150 touching through a thin waist at 124–126.
    const p = profile(200, [
      [100, 150, 40],
      [124, 127, 4],
    ]);
    expect(boxBands(p, 25)).toEqual([
      [100, 124],
      [125, 150],
    ]);
  });

  it('keeps a short row (an upbeat) and joins an octave mark to its row', () => {
    const p = profile(200, [
      [20, 45, 40], // a row
      [10, 13, 3], // its octave mark, a little above
      [120, 140, 8], // ":d", short but a row
    ]);
    expect(boxBands(p, 25)).toEqual([
      [10, 45],
      [120, 140],
    ]);
  });
});

describe('giving rows to parts', () => {
  it('takes every part in order in a full box, and follows the handwriting’s drift in the others', () => {
    const { parts, of } = partsOfRows([
      [100, 160], // an upbeat: soprano and alto
      [90, 150, 270], // soprano, alto, and the bass coming in
      [80, 140, 200, 260],
      [95, 155, 215, 275],
    ]);
    expect(parts).toBe(4);
    expect(of).toEqual([
      [0, 1],
      [0, 1, 3],
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ]);
  });

  it('has as many parts as at least two boxes have rows, or as the person said', () => {
    expect(partsOfRows([[1, 2, 3, 4, 5], [1, 2, 3, 4], [1, 2]]).parts).toBe(4);
    expect(partsOfRows([[1, 2, 3, 4], [1, 2, 3, 4]], 2).parts).toBe(2);
  });
});

describe('a system read box by box', () => {
  const system: BoxedSystem = {
    top: { y: 0, slope: 0 },
    bottom: { y: 400, slope: 0 },
    boxes: [
      { left: 0, right: 100 },
      { left: 110, right: 300 },
      { left: 310, right: 500 },
    ],
  };
  /** A row in box `b` at height `y`, read as `text` (tokens split on spaces). */
  const row = (b: number, y: number, text: string): BoxRow => {
    const tokens = text ? text.split(' ') : [];
    const notes = tokens.filter((t) => /^[drmfslt]$/.test(t)).length;
    const beats = tokens.filter((t) => t === ':').length;
    return {
      row: { top: y - 12, bottom: y + 12, baseline: y + 8, size: 24, left: system.boxes[b].left, right: system.boxes[b].right },
      read: { tokens, sure: 0.9, mean: 0.95 },
      score: tokens.length ? 0.95 * Math.min(1, (notes + beats) / 6) * Math.min(1, (beats + 1) / 3) : 0,
      beats,
      y,
    };
  };

  it('joins the boxes with bar lines, gives a missing part rests, and takes an upbeat at its part’s height', () => {
    const boxes = [
      [row(0, 50, ': m ^'), row(0, 80, ''), row(0, 120, ': d')],
      [row(1, 40, 'm ^ . m ^ : - . t / d ^ : s'), row(1, 70, ''), row(1, 110, 'd . d : - . s / l : m'), row(1, 140, ''), row(1, 260, 'd . d : - . d / f : r')],
      [row(2, 45, 'l : l / l : -'), row(2, 75, ''), row(2, 115, 'f : f / f : -'), row(2, 180, 'l : d | l : d'), row(2, 255, '- : - / - : m')],
    ];
    const got = partsOfBoxes(boxes, system, 4)!;
    expect(got.parts).toEqual(['S', 'A', 'T', 'B']);
    expect(got.rows.map((r) => r.join(' '))).toEqual([
      ': m ^ | m ^ . m ^ : - . t / d ^ : s | l : l / l : -',
      ': d | d . d : - . s / l : m | f : f / f : -',
      // No tenor in the first two boxes: rests as long as the boxes' other parts. The third box's "|"
      // inside it, where the other parts read none, is its half-bar mark.
      ': | : / : | l : d / l : d',
      ': | d . d : - . d / f : r | - : - / - : m',
    ]);
    // The soprano's words are in every box; the alto's in the second.
    expect(got.words.map((w) => [w.after, w.pieces.length])).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });

  it('reads nothing from a system with no notes', () => {
    expect(partsOfBoxes([[row(0, 50, '')], [row(1, 50, '')], [row(2, 50, '')]], system)).toBeNull();
  });
});
