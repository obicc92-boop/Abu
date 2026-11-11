import { SYLLABLE_PATTERN, SYLLABLE_SEMITONES } from './syllables';

/** Display names for doh, indexed by semitones above C (matches the prototype). */
export const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export interface KeyInfo {
  /** Doh as semitones above C, 0–11. This is what the song record stores. */
  semitone: number;
  /** How doh is shown, e.g. "E♭". */
  name: string;
}

const LETTER_SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function keyFromSemitone(semitone: number): KeyInfo {
  const s = mod12(semitone);
  return { semitone: s, name: KEY_NAMES[s] };
}

/**
 * Reads a key as written on sheets: "D", "Eb", "E♭", "e flat", "F#", "Doh is D",
 * "Key: F". A minor key ("A minor", "Am") gives its relative major's doh,
 * because sol-fa writes minor music in the lah mode.
 */
export function parseKey(text: string): KeyInfo | null {
  let t = text.trim().replace(/^key\s*:?\s*/i, '').replace(/^doh\s+is\s+/i, '').trim();
  const m = t.match(/^([A-Ga-g])\s*(#|♯|b|♭|-?\s*sharp|-?\s*flat)?\s*(m|min|minor|maj|major)?\.?$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = (m[2] ?? '').toLowerCase().replace(/[\s-]/g, '');
  let semitone = LETTER_SEMITONES[letter];
  let accidental = '';
  if (acc === '#' || acc === '♯' || acc === 'sharp') {
    semitone += 1;
    accidental = '♯';
  } else if (acc === 'b' || acc === '♭' || acc === 'flat') {
    semitone -= 1;
    accidental = '♭';
  }
  const mode = (m[3] ?? '').toLowerCase();
  if (mode === 'm' || mode === 'min' || mode === 'minor') return keyFromSemitone(semitone + 3);
  return { semitone: mod12(semitone), name: letter + accidental };
}

export interface Pivot {
  /** Syllable in the old key, e.g. "s". */
  from: string;
  /** The same pitch's syllable in the new key, e.g. "d". */
  to: string;
}

const PIVOT_RE = new RegExp(`\\(?\\b(${SYLLABLE_PATTERN})\\s*/\\s*(${SYLLABLE_PATTERN})\\b\\)?`);

/**
 * Reads the value of a `key:` line, which may carry a pivot note:
 * "F", "F s/d", "s/d" (work the new key out from the old one), "Doh is F".
 */
export function parseKeyLine(value: string): { key: KeyInfo | null; pivot: Pivot | null; ok: boolean } {
  const pm = value.match(PIVOT_RE);
  const pivot = pm ? { from: pm[1], to: pm[2] } : null;
  const rest = (pm ? value.replace(pm[0], ' ') : value).trim();
  if (!rest) return { key: null, pivot, ok: !!pivot };
  const key = parseKey(rest);
  return { key, pivot, ok: !!key };
}

/** The new doh implied by a pivot: the old key's `from` is the new key's `to`. */
export function keyAfterPivot(previous: number, pivot: Pivot): KeyInfo {
  return keyFromSemitone(previous + SYLLABLE_SEMITONES[pivot.from] - SYLLABLE_SEMITONES[pivot.to]);
}
