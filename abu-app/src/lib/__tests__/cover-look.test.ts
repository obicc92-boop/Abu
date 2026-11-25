import { describe, expect, it } from '@jest/globals';

import { averageColour, COVER_LOOKS, coverLook, glowFrom, hashOf } from '../cover-look';

/** Lightness and saturation of "#rrggbb", as HSL has them. */
function hsl(hex: string): { s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

describe('drawn covers', () => {
  it('give a song the same look every time, from its id', () => {
    expect(coverLook('old100')).toEqual(coverLook('old100'));
    expect(hashOf('old100')).toBe(hashOf('old100'));
  });

  it('spread songs over all the looks', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => coverLook(`song-${i}`)));
    expect(seen.size).toBe(COVER_LOOKS.length);
  });

  it('keep white titles readable: each look’s deep corner is dark', () => {
    for (const look of COVER_LOOKS) expect(hsl(look.from).l).toBeLessThan(0.2);
  });
});

describe('the glow from a picture', () => {
  it('keeps a picture’s hue, made lively and middling', () => {
    // A dull, dark blue picture glows a clear blue.
    const glow = glowFrom(30, 40, 70);
    const { s, l } = hsl(glow);
    expect(s).toBeGreaterThanOrEqual(0.49);
    expect(l).toBeGreaterThanOrEqual(0.41);
    expect(l).toBeLessThanOrEqual(0.56);
    expect(parseInt(glow.slice(5, 7), 16)).toBeGreaterThan(parseInt(glow.slice(1, 3), 16));
  });

  it('uses the main colour for a grey picture', () => {
    expect(glowFrom(120, 120, 122)).toBe('#D14617');
    expect(glowFrom(250, 250, 250)).toBe('#D14617');
  });

  it('averages pixels, colourful ones counting more, see-through ones not at all', () => {
    // A red pixel, a grey one, and a see-through green one.
    const [r, g, b] = averageColour([220, 30, 30, 255, 128, 128, 128, 255, 0, 255, 0, 0]);
    expect(r).toBeGreaterThan(190);
    expect(g).toBeLessThan(50);
    expect(b).toBeLessThan(50);
    expect(averageColour([])).toEqual([0, 0, 0]);
  });
});
