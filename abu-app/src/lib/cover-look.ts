/**
 * Covers the app draws itself, for a song until it has a picture (colleagues' request, 25 November 2026: a Home that
 * looks like a music app's, every song with a picture; the AI makes one for each, abu-api/src/auto-covers.ts): a deep
 * two-colour gradient picked from the song's id, so each song keeps its own look, with its title. And the glow
 * Home's top takes from the song in front: the drawn cover's colour, or a picture's own.
 *
 * Pure module: no React.
 */

export interface CoverLook {
  /** The deep corner, where the title sits (white text stays readable on it). */
  from: string;
  /** The bright corner. */
  to: string;
}

/**
 * The drawn covers' colours: the brand's orange-red into pink first, then deep tones of the parts' colours and the
 * gold, each running from near-black into the colour, so a shelf of them looks like a shelf of album covers.
 */
export const COVER_LOOKS: readonly CoverLook[] = [
  { from: '#3D1405', to: '#D14617' }, // the main colour
  { from: '#2B1240', to: '#DA2F6E' }, // plum into the brand's pink
  { from: '#082E2B', to: '#1C8173' }, // tenor's teal
  { from: '#10153D', to: '#3A4AA6' }, // bass's indigo
  { from: '#3A2203', to: '#C98410' }, // alto's amber
  { from: '#3A0A12', to: '#D93A1E' }, // soprano's red
  { from: '#0F2219', to: '#2F7A55' }, // forest
  { from: '#1F1F26', to: '#A8475F' }, // slate into rose
  { from: '#2A1608', to: '#E6A325' }, // the gold
];

/** A number from a string, the same every time (FNV-1a). */
export function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/** A song's drawn cover colours, from its id. */
export function coverLook(seed: string): CoverLook {
  return COVER_LOOKS[hashOf(seed) % COVER_LOOKS.length];
}

/** "#rrggbb" from red, green and blue (0 to 255). */
function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A glow colour from a picture's average colour: the same hue, made lively enough to glow (saturation at least 0.5)
 * and middling in lightness, so a grey or nearly black picture still gives a soft colour and a white one isn't
 * blinding. A picture with no colour to speak of (greys) glows in the main colour.
 */
export function glowFrom(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.06) return '#D14617';
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r / 255) h = ((g - b) / 255 / d) % 6;
  else if (max === g / 255) h = (b - r) / 255 / d + 2;
  else h = (r - g) / 255 / d + 4;
  h = (h * 60 + 360) % 360;
  const s2 = Math.max(s, 0.5);
  const l2 = Math.min(0.55, Math.max(0.42, l));
  // HSL back to RGB.
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

/** The average colour of RGBA pixels (a canvas's `getImageData`), weighting colourful pixels more than grey ones. */
export function averageColour(pixels: ArrayLike<number>): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const pr = pixels[i];
    const pg = pixels[i + 1];
    const pb = pixels[i + 2];
    const weight = 1 + (Math.max(pr, pg, pb) - Math.min(pr, pg, pb)) / 32;
    r += pr * weight;
    g += pg * weight;
    b += pb * weight;
    w += weight;
  }
  return w ? [r / w, g / w, b / w] : [0, 0, 0];
}
