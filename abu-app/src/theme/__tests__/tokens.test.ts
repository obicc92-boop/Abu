import { describe, expect, it } from '@jest/globals';

import { darkColors, lightColors, partInk, type Palette } from '../tokens';

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as [string, Palette][])('the %s palette', (_, c) => {
  it('keeps text readable on cards and the page (4.5:1)', () => {
    for (const text of [c.ink, c.muted, c.redDeep, c.link, c.ok, c.warn]) {
      for (const bg of [c.card, c.sand]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text readable on its own washes and on red and ink', () => {
    expect(contrast(c.redDeep, c.redTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.ok, c.okTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.warn, c.warnTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onRed, c.red)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onInk, c.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('sets the parts’ note colours apart from the page', () => {
    const dark = c === darkColors;
    for (const part of ['S', 'A', 'T', 'B', 'Solo']) expect(contrast(partInk(part, dark), dark ? c.card : c.sand)).toBeGreaterThanOrEqual(4.5);
  });
});

it('has the same colours, by name, in both palettes', () => {
  expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
});
