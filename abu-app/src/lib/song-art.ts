/**
 * A song's tile art, as on Suno's album shelves but drawn from the song itself (owner's request, 21 November
 * 2026): each part's opening melody as a stepped line in its own colour, the parts stacked as on a sheet, in a
 * 100 × 100 box. A song with no sol-fa to hand (a song order's item) gets a pattern made from its id instead, so
 * it still has a look of its own, the same every time.
 */
import { parseSolfa } from '@/solfa';

export interface ArtLine {
  part: string;
  /** SVG polyline points in a 100 × 100 box. */
  points: string;
}

const PARTS = ['S', 'A', 'T', 'B'];
const NOTES = 10;
const TOP = 16;
const BOTTOM = 84;

/** Steps for each part: the pitches (semitones) of its first notes. */
function fromSolfa(solfa: string): Record<string, number[]> | null {
  try {
    const song = parseSolfa(solfa);
    const steps: Record<string, number[]> = {};
    for (const part of song.parts.slice(0, 4)) {
      const notes = (song.events[part] ?? []).slice(0, NOTES).map((e) => e.deg + 12 * e.oct);
      if (notes.length >= 2) steps[part] = notes;
    }
    return Object.keys(steps).length ? steps : null;
  } catch {
    return null;
  }
}

/** A made-up melody per part, from the id: a walk of small steps, the same for the same id. */
function fromSeed(seed: string): Record<string, number[]> {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h >>> 0) / 4294967296;
  };
  const steps: Record<string, number[]> = {};
  for (const part of PARTS) {
    let pitch = 0;
    steps[part] = Array.from({ length: 8 }, () => (pitch += Math.round((next() - 0.5) * 5)));
  }
  return steps;
}

export function songArt(solfa: string | null | undefined, seed: string): ArtLine[] {
  const steps = (solfa && fromSolfa(solfa)) || fromSeed(seed);
  const parts = Object.keys(steps);
  // Each part's band, no taller than a quarter-and-a-bit of the box, the parts together in the middle.
  const band = Math.min((BOTTOM - TOP) / parts.length, 26);
  const top = 50 - (band * parts.length) / 2;
  return parts.map((part, k) => {
    const notes = steps[part];
    const lo = Math.min(...notes);
    const hi = Math.max(...notes);
    const span = Math.max(hi - lo, 4);
    const mid = top + band * (k + 0.5);
    const w = 80 / notes.length;
    const points = notes.flatMap((n, i) => {
      // Higher notes higher up, centred in the part's own band.
      const y = (mid - ((n - (lo + hi) / 2) / span) * band * 0.84).toFixed(1);
      const x0 = 10 + i * w;
      return [`${x0.toFixed(1)},${y}`, `${(x0 + w - 2.5).toFixed(1)},${y}`];
    });
    return { part, points: points.join(' ') };
  });
}
