import { describe, expect, it } from '@jest/globals';

import { nearName, SCALE, splashParticles } from '../particles';

describe('splashParticles', () => {
  it('is the same every time, so the web page and the browser agree', () => {
    expect(splashParticles()).toEqual(splashParticles());
  });

  it('is all sol-fa: the scale from doh to the doh above, each syllable in its own colour', () => {
    expect(SCALE.map((n) => n.text)).toEqual(['d', 'r', 'm', 'f', 's', 'l', 't', "d'"]);
    // Every syllable but the two dohs has a colour of its own; both dohs share one.
    expect(new Set(SCALE.map((n) => n.color)).size).toBe(7);
    expect(SCALE[0].color).toBe(SCALE[7].color);
    const { bursts, pops } = splashParticles();
    for (const p of [...bursts, ...pops]) expect(SCALE).toContainEqual({ text: p.text, color: p.color });
    expect(new Set(bursts.map((b) => b.text))).toEqual(new Set(SCALE.map((n) => n.text)));
    expect(new Set(pops.map((p) => p.text))).toEqual(new Set(SCALE.map((n) => n.text)));
  });

  it('sends syllables out all round the mark', () => {
    const { bursts } = splashParticles();
    expect(bursts).toHaveLength(24);
    const quarters = new Set(bursts.map((b) => Math.floor((((b.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2))));
    expect(quarters).toEqual(new Set([0, 1, 2, 3]));
  });

  it('pops syllables up all over the screen, but not over the name', () => {
    const { pops } = splashParticles();
    expect(pops).toHaveLength(30);
    for (const p of pops) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
      expect(nearName(p.x, p.y)).toBe(false);
    }
    // Above and below the name, and on both sides.
    expect(pops.some((p) => p.y < 0.3)).toBe(true);
    expect(pops.some((p) => p.y > 0.7)).toBe(true);
    expect(pops.some((p) => p.x < 0.3)).toBe(true);
    expect(pops.some((p) => p.x > 0.7)).toBe(true);
  });

  it('keeps everything within the animation’s two seconds, before it fades into the app', () => {
    const { bursts, pops } = splashParticles();
    for (const b of bursts) {
      expect(b.distance).toBeLessThanOrEqual(0.62);
      expect(b.delay + b.duration).toBeLessThanOrEqual(1850);
    }
    for (const p of pops) expect(p.delay + p.duration).toBeLessThanOrEqual(1900);
  });
});
