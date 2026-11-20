import { describe, expect, it } from '@jest/globals';

import { LOOKS, palettes, partInk, type Palette } from '../tokens';

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const every = LOOKS.map((l) => [l.name, palettes[l.id], l.scheme === 'dark'] as [string, Palette, boolean]);

describe.each(every)('the %s look', (_, c, dark) => {
  it('keeps text readable on cards and the page (4.5:1)', () => {
    for (const text of [c.ink, c.muted, c.accent, c.link, c.ok, c.warn, c.danger]) {
      for (const bg of [c.card, c.sand]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text readable on its own washes, on the main colour, on ink and on the feature cards', () => {
    expect(contrast(c.accent, c.accentTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.danger, c.dangerTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.ok, c.okTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.warn, c.warnTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimarySoft, c.primary)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.onDanger, c.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onInk, c.ink)).toBeGreaterThanOrEqual(4.5);
    for (const text of [c.onHero, c.onHeroSoft, c.heroKicker]) expect(contrast(text, c.hero)).toBeGreaterThanOrEqual(4.5);
  });

  it('sets the main colour apart from the page, so buttons and the tab in use stand out', () => {
    expect(contrast(c.primary, c.sand)).toBeGreaterThanOrEqual(4.5);
  });

  it('sets the parts’ note colours apart from the page', () => {
    for (const part of ['S', 'A', 'T', 'B', 'Solo']) expect(contrast(partInk(part, dark), dark ? c.card : c.sand)).toBeGreaterThanOrEqual(4.5);
  });

  it('has the same colours, by name, as the first look', () => {
    expect(Object.keys(c).sort()).toEqual(Object.keys(palettes.white).sort());
  });
});

it('has five looks: White (light), then Ebony, Gold, Silver and Violet (dark)', () => {
  expect(LOOKS.map((l) => `${l.name} ${l.scheme}`)).toEqual(['White light', 'Ebony dark', 'Gold dark', 'Silver dark', 'Violet dark']);
});
