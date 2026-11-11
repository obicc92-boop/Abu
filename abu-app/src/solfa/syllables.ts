/**
 * Sol-fa syllables, octave marks and part names.
 * See docs/solfa-format.md for the format these rules come from.
 */

/**
 * Semitones above doh for every syllable Abụ accepts.
 * Raised (Curwen): de re fe se le. Lowered: ra ma ta, with `ba` accepted as `ta`.
 * Also accepted because people type them: di ri fi si (raised), me (= ma),
 * lo (lowered lah), la (= l), te (= t).
 */
export const SYLLABLE_SEMITONES: Readonly<Record<string, number>> = {
  d: 0,
  de: 1,
  di: 1,
  ra: 1,
  r: 2,
  re: 3,
  ri: 3,
  ma: 3,
  me: 3,
  m: 4,
  f: 5,
  fe: 6,
  fi: 6,
  s: 7,
  se: 8,
  si: 8,
  lo: 8,
  l: 9,
  la: 9,
  le: 10,
  ta: 10,
  ba: 10,
  t: 11,
  te: 11,
};

/** Two-letter syllables first so `de` isn't read as `d` plus junk. */
export const SYLLABLE_PATTERN = '(?:de|di|ra|re|ri|ma|me|fe|fi|se|si|lo|la|le|ta|ba|te|d|r|m|f|s|l|t)';

/** High marks: ' ’ ′ ʼ ¹ (one octave), ² ″ (two). Low marks: 1 ₁ (one), 2 ₂ (two). */
const OCTAVE_PATTERN = "(?:['’′ʼ¹²″]+|[12₁₂])";

export const NOTE_RE = new RegExp(`^(${SYLLABLE_PATTERN})(${OCTAVE_PATTERN})?$`);

/** Octave offset written on a note: `'` is +1, `1` is −1, `''`/`²` is +2, `2` is −2. */
export function octaveOf(mark: string | undefined): number {
  if (!mark) return 0;
  let v = 0;
  for (const c of mark) {
    if (c === "'" || c === '’' || c === '′' || c === 'ʼ' || c === '¹') v += 1;
    else if (c === '²' || c === '″') v += 2;
    else if (c === '1' || c === '₁') v -= 1;
    else if (c === '2' || c === '₂') v -= 2;
  }
  return v;
}

export interface ParsedNote {
  syllable: string;
  degree: number;
  octave: number;
}

export function parseNote(token: string): ParsedNote | null {
  const m = token.match(NOTE_RE);
  if (!m) return null;
  return { syllable: m[1], degree: SYLLABLE_SEMITONES[m[1]], octave: octaveOf(m[2]) };
}

const FULL_PART_NAMES: Readonly<Record<string, string>> = {
  soprano: 'S',
  alto: 'A',
  tenor: 'T',
  bass: 'B',
};

/** "soprano" → "S", "s1" → "S1", "solo" → "Solo", "keys" → "Keys". */
export function normalizePart(label: string): string {
  const full = FULL_PART_NAMES[label.toLowerCase()];
  if (full) return full;
  return label.length <= 2
    ? label.toUpperCase()
    : label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/** Display name for a part label: "S" → "Soprano"; other labels unchanged. */
export function partName(part: string): string {
  return ({ S: 'Soprano', A: 'Alto', T: 'Tenor', B: 'Bass' } as Record<string, string>)[part] ?? part;
}

/** A part's name for a group of singers: "Sopranos", "Altos", "Tenors", "Basses". */
export function partPlural(part: string): string {
  const name = partName(part);
  return /s$/i.test(name) ? `${name}es` : `${name}s`;
}

/**
 * Tenor and bass lines are read from the lower doh: tenor is written an octave
 * above where it sounds, and bass is written relative to that same lower doh.
 * Solo is never lowered.
 */
export function isLowPart(part: string): boolean {
  if (/^solo/i.test(part)) return false;
  const first = part.charAt(0).toUpperCase();
  return first === 'T' || first === 'B';
}
