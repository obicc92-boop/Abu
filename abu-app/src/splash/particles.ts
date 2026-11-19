/**
 * Where the opening animation's sol-fa flies and pops: the scale, d r m f s l
 * t d', each syllable in its own soft colour, bursting out of the mark and
 * popping up all over the screen. Generated from a fixed seed, so every launch
 * looks the same and the web's server-rendered page matches what the browser
 * draws.
 *
 * Pure module: no React.
 */

/** The scale from doh to the doh above, each with a soft colour that shows on red (both dohs share white). */
export const SCALE: readonly { text: string; color: string }[] = [
  { text: 'd', color: '#FFFFFF' },
  { text: 'r', color: '#FFD98A' },
  { text: 'm', color: '#9FE5D8' },
  { text: 'f', color: '#FFB9A8' },
  { text: 's', color: '#F2B544' },
  { text: 'l', color: '#BFC9FF' },
  { text: 't', color: '#FFE7C2' },
  { text: "d'", color: '#FFFFFF' },
];

/** A syllable that bursts out of the mark and flies across the screen. */
export interface Burst {
  text: string;
  color: string;
  /** Direction of travel, in radians (0 = right, π/2 = down). */
  angle: number;
  /** How far it travels, as a fraction of the screen's longer side. */
  distance: number;
  /** How high its path curves, as a fraction of the screen's longer side. */
  arc: number;
  /** Total spin in degrees by the end of its flight. */
  spin: number;
  /** Size in points. */
  size: number;
  /** Milliseconds after the animation starts. */
  delay: number;
  duration: number;
}

/** A syllable that pops up where it is, drifts up a little and fades. */
export interface Pop {
  text: string;
  color: string;
  /** Position as fractions of the screen, 0 to 1. */
  x: number;
  y: number;
  size: number;
  /** A slight tilt, in degrees. */
  tilt: number;
  /** How far it drifts up while it shows, in points. */
  drift: number;
  delay: number;
  duration: number;
}

/** Small deterministic random number generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the mark and "SolfaScores" sit (as fractions of the screen), kept clear of pops so the name stays easy to read. */
export function nearName(x: number, y: number): boolean {
  return Math.abs(x - 0.5) < 0.36 && y > 0.38 && y < 0.66;
}

export function splashParticles(seed = 2026, bursts = 24, pops = 30): { bursts: Burst[]; pops: Pop[] } {
  const rand = seeded(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();

  const flying: Burst[] = [];
  for (let i = 0; i < bursts; i++) {
    const note = SCALE[i % SCALE.length];
    flying.push({
      ...note,
      // Spread evenly round the circle, nudged so it doesn't look mechanical.
      angle: (i / bursts) * Math.PI * 2 + between(-0.16, 0.16),
      distance: between(0.3, 0.62),
      arc: between(0.04, 0.12),
      spin: between(-50, 50),
      size: between(30, 52),
      delay: Math.round(120 + i * 24 + between(0, 40)),
      duration: Math.round(between(1000, 1120)),
    });
  }

  const popping: Pop[] = [];
  for (let i = 0; i < pops; i++) {
    let x = 0;
    let y = 0;
    do {
      x = between(0.06, 0.94);
      y = between(0.06, 0.94);
    } while (nearName(x, y));
    // Start a step along the scale from the bursts, so the colours mix.
    const note = SCALE[(i + 3) % SCALE.length];
    popping.push({
      ...note,
      x,
      y,
      size: between(22, 42),
      tilt: between(-16, 16),
      drift: between(10, 24),
      delay: Math.round(between(250, 1120)),
      duration: Math.round(between(620, 760)),
    });
  }
  return { bursts: flying, pops: popping };
}
