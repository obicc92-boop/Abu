import { describe, expect, it } from '@jest/globals';

import { splashParticles } from '../particles';

describe('splashParticles', () => {
  it('is the same every time, so the web page and the browser agree', () => {
    expect(splashParticles()).toEqual(splashParticles());
  });

  it('sends notes, syllables and gold glints out all round the book', () => {
    const { bursts } = splashParticles();
    expect(bursts).toHaveLength(20);
    expect(new Set(bursts.map((b) => b.kind))).toEqual(new Set(['eighth', 'beamed', 'quarter', 'syllable', 'glint']));
    expect(bursts.filter((b) => b.kind === 'syllable').map((b) => b.text)).toEqual(['d', 'r', 'm', 'f', 's', 'l', 't']);
    // Directions cover every quarter of the screen.
    const quarters = new Set(bursts.map((b) => Math.floor((((b.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2))));
    expect(quarters).toEqual(new Set([0, 1, 2, 3]));
  });

  it('keeps glitter on screen and everything within the animation’s two seconds', () => {
    const { bursts, sparkles } = splashParticles();
    for (const b of bursts) {
      expect(b.distance).toBeLessThanOrEqual(0.6);
      expect(b.delay + b.duration).toBeLessThanOrEqual(1850);
    }
    for (const s of sparkles) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(1);
      expect(s.delay + 2 * s.duration).toBeLessThanOrEqual(2300);
    }
  });
});
