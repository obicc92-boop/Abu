/**
 * Where the opening animation's notes fly and where its glitter twinkles.
 * Generated from a fixed seed, so every launch looks the same and the web's
 * server-rendered page matches what the browser draws.
 *
 * Pure module: no React.
 */

export type GlyphKind = 'eighth' | 'beamed' | 'quarter' | 'syllable' | 'glint';

/** A note, sol-fa syllable or gold glint that bursts out of the book. */
export interface Burst {
  kind: GlyphKind;
  /** The syllable, for kind "syllable". */
  text?: string;
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
  color: string;
  /** Milliseconds after the animation starts. */
  delay: number;
  duration: number;
}

/** A gold or white glint that twinkles twice in place. */
export interface Sparkle {
  /** Position as fractions of the screen, 0 to 1. */
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  /** Length of one twinkle; it twinkles twice. */
  duration: number;
}

export const WHITE = '#FFFFFF';
export const GOLD = '#E6A325';
/** A lighter gold for the shine on glitter. */
export const SHINE = '#FFD98A';

const SYLLABLES = ['d', 'r', 'm', 'f', 's', 'l', 't'];
const KINDS: GlyphKind[] = ['eighth', 'syllable', 'glint', 'beamed', 'syllable', 'glint', 'quarter', 'syllable', 'glint'];

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

export function splashParticles(seed = 2026, bursts = 20, sparkles = 34): { bursts: Burst[]; sparkles: Sparkle[] } {
  const rand = seeded(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
  let syllable = 0;

  const out: Burst[] = [];
  for (let i = 0; i < bursts; i++) {
    const kind = KINDS[i % KINDS.length];
    out.push({
      kind,
      text: kind === 'syllable' ? SYLLABLES[syllable++ % SYLLABLES.length] : undefined,
      // Spread evenly round the circle, nudged so it doesn't look mechanical.
      angle: (i / bursts) * Math.PI * 2 + between(-0.18, 0.18),
      distance: between(0.32, 0.6),
      arc: between(0.04, 0.12),
      spin: kind === 'glint' ? between(90, 220) : between(-60, 60),
      size: kind === 'glint' ? between(14, 24) : kind === 'syllable' ? between(32, 46) : between(36, 56),
      color: kind === 'glint' ? (i % 2 ? SHINE : GOLD) : i % 4 === 3 ? GOLD : WHITE,
      delay: Math.round(120 + i * 28 + between(0, 40)),
      duration: Math.round(between(1000, 1150)),
    });
  }

  const glints: Sparkle[] = [];
  for (let i = 0; i < sparkles; i++) {
    glints.push({
      x: between(0.06, 0.94),
      y: between(0.08, 0.92),
      size: between(10, 24),
      color: i % 3 === 0 ? SHINE : i % 3 === 1 ? GOLD : WHITE,
      delay: Math.round(between(250, 1250)),
      duration: Math.round(between(320, 480)),
    });
  }
  // A small crown of glitter around "Abụ" as it rises in, under the book.
  for (let i = 0; i < 6; i++) {
    glints.push({
      x: between(0.3, 0.7),
      y: between(0.56, 0.66),
      size: between(10, 18),
      color: i % 2 ? SHINE : GOLD,
      delay: Math.round(between(800, 1400)),
      duration: Math.round(between(280, 400)),
    });
  }
  return { bursts: out, sparkles: glints };
}
