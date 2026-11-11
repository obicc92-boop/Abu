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
