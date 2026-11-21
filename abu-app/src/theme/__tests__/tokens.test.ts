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
  ['light', lightColors, false],
  ['dark', darkColors, true],
] as [string, Palette, boolean][])('the %s palette', (_, c, dark) => {
  it('keeps text readable on cards and the page (4.5:1)', () => {
    for (const text of [c.ink, c.muted, c.accent, c.link, c.ok, c.warn, c.danger]) {
      for (const bg of [c.card, c.sand]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text readable on its own washes, on the main colour and its gradient, on ink and on the feature cards', () => {
    expect(contrast(c.accent, c.accentTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.danger, c.dangerTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.ok, c.okTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.warn, c.warnTint)).toBeGreaterThanOrEqual(4.5);
    for (const fill of [c.primary, c.primary2]) expect(contrast(c.onPrimary, fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimarySoft, c.primary)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.onDanger, c.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onInk, c.ink)).toBeGreaterThanOrEqual(4.5);
    for (const text of [c.onHero, c.onHeroSoft, c.heroKicker]) expect(contrast(text, c.hero)).toBeGreaterThanOrEqual(4.5);
  });

  it('sets the main colour apart from the page, so buttons and switches stand out (3:1, as for shapes)', () => {
    expect(contrast(c.primary, c.sand)).toBeGreaterThanOrEqual(3);
  });

  it('sets the parts’ note colours apart from the page', () => {
    for (const part of ['S', 'A', 'T', 'B', 'Solo']) expect(contrast(partInk(part, dark), dark ? c.card : c.sand)).toBeGreaterThanOrEqual(4.5);
  });
});

it('has the same colours, by name, in both palettes', () => {
  expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
});

it('has one main colour, Suno’s orange-red, in light and dark', () => {
  expect(darkColors.primary).toBe(lightColors.primary);
  expect(darkColors.primary2).toBe(lightColors.primary2);
});
