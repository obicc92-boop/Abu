/**
 * Colour tokens, by what they're for, in a light and a dark palette. Screens
 * get the palette in use from `useColors()` or `makeStyles()` (src/theme/theme.tsx),
 * which follows the phone's dark mode unless the person picks one in Me.
 * The light palette matches the :root variables in prototype/index.html.
 */
export interface Palette {
  /** Brand red: buttons, the red cards, active marks. White text sits on it in both palettes. */
  red: string;
  /** Red text and icons on the page: links, "How to write it". */
  link: string;
  /** Strong red text: kickers, headings, errors. */
  redDeep: string;
  /** A soft red wash behind text (highlights, problems), and its border. */
  redTint: string;
  redLine: string;
  gold: string;
  /** Main text; also the background of selected chips (with `onInk` text on it). */
  ink: string;
  muted: string;
  placeholder: string;
  line: string;
  /** The page, and sunken areas inside cards. */
  sand: string;
  /** Cards, inputs and sheets. */
  card: string;
  /** A slightly raised neutral: progress tracks, the rehearsal date tile. */
  board: string;
  /** The page, nearly opaque, for bars that float over it. */
  glass: string;
  ok: string;
  okTint: string;
  okLine: string;
  /** Amber for "not yet" and pinned notices: text, wash and border. */
  warn: string;
  warnTint: string;
  warnLine: string;
  /** Text and icons on `red` (and on the red cards). */
  onRed: string;
  /** Softer text on `red`: subtitles and kickers on the red cards. */
  onRedSoft: string;
  /** Text and icons on `ink` (selected chips, the offline bar). */
  onInk: string;
  /** Holds, rests and beat separators in the score. */
  faint: string;
  barline: string;
  switchOff: string;
}

export type Scheme = 'light' | 'dark';

export const lightColors: Palette = {
  red: '#D93A1E',
  link: '#C9341A',
  redDeep: '#A3261A',
  redTint: '#FCEAE5',
  redLine: '#EFC3B8',
  gold: '#E6A325',
  ink: '#22160F',
  muted: '#76655C',
  placeholder: '#B3A39A',
  line: '#E9DED8',
  sand: '#F7F1ED',
  card: '#FFFFFF',
  board: '#EDE4DE',
  glass: 'rgba(247,241,237,0.96)',
  ok: '#18776A',
  okTint: '#E6F4F0',
  okLine: '#BFE3DA',
  warn: '#94600A',
  warnTint: '#FBF0DA',
  warnLine: '#F0D9A6',
  onRed: '#FFFFFF',
  onRedSoft: '#FFE7E0',
  onInk: '#FFFFFF',
  faint: '#B9A79D',
  barline: '#CDBEB5',
  switchOff: '#D8CCC5',
};

/**
 * Warm, near-black browns (the same family as Perform's dark), so the brand
 * red still glows. Text keeps at least 4.5:1 on cards; the red cards and
 * buttons stay the brand red with white text.
 */
export const darkColors: Palette = {
  red: '#D93A1E',
  link: '#F27A5E',
  redDeep: '#F2957F',
  redTint: '#3A1D16',
  redLine: '#6B3226',
  gold: '#E6A325',
  ink: '#F4EAE4',
  muted: '#B5A59C',
  placeholder: '#8A786E',
  line: '#3E312A',
  sand: '#15100D',
  card: '#211915',
  board: '#2E231E',
  glass: 'rgba(21,16,13,0.96)',
  ok: '#34A390',
  okTint: '#14302A',
  okLine: '#245049',
  warn: '#E2B25A',
  warnTint: '#33270F',
  warnLine: '#5C4718',
  onRed: '#FFFFFF',
  onRedSoft: '#FFE7E0',
  onInk: '#1A1310',
  faint: '#7A6A60',
  barline: '#4D3F38',
  switchOff: '#4D3F38',
};

export const palettes: Readonly<Record<Scheme, Palette>> = { light: lightColors, dark: darkColors };

/** Colours that don't change with the theme: the red opening screens and the logo. */
export const brand = {
  red: '#D93A1E',
  redDeep: '#A3261A',
  gold: '#E6A325',
  white: '#FFFFFF',
  ink: '#22160F',
  onRedSoft: '#FFE7E0',
  /** Kickers on red. */
  onRedKicker: '#FFD9CF',
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
  return partColors[part.charAt(0).toUpperCase()] ?? lightColors.muted;
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
  return pair ? pair[dark ? 1 : 0] : dark ? darkColors.ink : lightColors.ink;
}

/** Short label for a part in narrow places: "S", "Solo" → "So". */
export function partLetter(part: string): string {
  return part.length > 2 ? part.slice(0, 2) : part;
}
