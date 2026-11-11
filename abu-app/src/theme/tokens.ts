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

/** Short label for a part in narrow places: "S", "Solo" → "So". */
export function partLetter(part: string): string {
  return part.length > 2 ? part.slice(0, 2) : part;
}
