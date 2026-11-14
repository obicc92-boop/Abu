/** Brand tokens, matching the :root variables in prototype/index.html. */
export const colors = {
  red: '#D93A1E',
  redDeep: '#A3261A',
  redTint: '#FCEAE5',
  gold: '#E6A325',
  ink: '#22160F',
  muted: '#76655C',
  line: '#E9DED8',
  sand: '#F7F1ED',
  white: '#FFFFFF',
  board: '#EDE4DE',
  ok: '#1C8173',
  /** Holds, rests and beat separators in the score. */
  faint: '#B9A79D',
  barline: '#CDBEB5',
  switchOff: '#D8CCC5',
} as const;

/**
 * Font families, named after the files loaded in src/app/_layout.tsx.
 * Each weight is its own family, so don't also set fontWeight.
 */
export const fonts = {
  /** Marcellus: the app name and big headings only. */
  display: 'Marcellus_400Regular',
  /** Figtree: UI text. */
  body: 'Figtree_500Medium',
  bold: 'Figtree_700Bold',
  heavy: 'Figtree_800ExtraBold',
  /** JetBrains Mono: sol-fa, so beats line up. */
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/** Fixed colour per voice part. */
export const partColors: Readonly<Record<string, string>> = {
  S: '#D93A1E',
  A: '#C98410',
  T: '#1C8173',
  B: '#3A4AA6',
  Solo: '#8A3FA0',
};

export function partColor(part: string): string {
  if (/^solo/i.test(part)) return partColors.Solo;
  return partColors[part.charAt(0).toUpperCase()] ?? colors.muted;
}

/**
 * A part's colour for text, such as its notes in the score: a darker shade
 * on light backgrounds, a lighter one on dark (each at least 5:1 contrast).
 */
const partInks: Readonly<Record<string, readonly [string, string]>> = {
  S: ['#B42A12', '#FF8F75'],
  A: ['#8A5A00', '#F2B54A'],
  T: ['#146A5E', '#4CC3AF'],
  B: ['#33409A', '#A3AEFF'],
  Solo: ['#7A3590', '#D49AE6'],
};

export function partInk(part: string, dark = false): string {
  const pair = /^solo/i.test(part) ? partInks.Solo : partInks[part.charAt(0).toUpperCase()];
  return pair ? pair[dark ? 1 : 0] : dark ? '#F7EDE7' : colors.ink;
}

/** Short label for a part in narrow places: "S", "Solo" → "So". */
export function partLetter(part: string): string {
  return part.length > 2 ? part.slice(0, 2) : part;
}
