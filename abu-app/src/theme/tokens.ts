/**
 * Colour tokens, by what they're for, in a light (white) and a dark (black) palette, in Suno's style (owner's
 * choice, 21 November 2026, from Suno's screens: "that's exactly what I want, both the white and the dark
 * background"): plain white or plain black, grey cards, and Suno's warm orange-red, running into pink on the
 * main buttons, as the one main colour. Gold, the parts' colours and the rest are secondary. Screens get the
 * palette in use from `useColors()` or `makeStyles()` (src/theme/theme.tsx), which follows the phone's dark mode
 * unless the person picks one in Me.
 */
export interface Palette {
  /** The main colour, Suno's warm orange-red: main buttons, switches that are on, selected marks, progress. */
  primary: string;
  /** The pink the main buttons' gradient runs into (orange-red, pink, orange-red), as on Suno's Create button. */
  primary2: string;
  /** Text and icons on `primary`. */
  onPrimary: string;
  /** Softer text on `primary` (the day on a date tile). */
  onPrimarySoft: string;
  /** `primary` pressed, and its shadow. */
  primaryDeep: string;
  /** Links and small actions in text: "How to write it", "See all". */
  link: string;
  /** Strong accent text: kickers, section names, badges. */
  accent: string;
  /** A soft accent wash behind text (badges, step numbers), and its border. */
  accentTint: string;
  accentLine: string;
  /** Errors and problems: a bar that doesn't add up, absent, "Remove". Text, wash, border, and text on it. */
  danger: string;
  dangerTint: string;
  dangerLine: string;
  onDanger: string;
  /**
   * The feature cards (the next service on Home) and the check-in code screen: a deep card with a soft glow in
   * the look's colour. Dark in both light and dark, so its text stays light.
   */
  hero: string;
  onHero: string;
  onHeroSoft: string;
  heroKicker: string;
  /** The glows on the feature cards: the look's own colour, and a second, fainter one. */
  heroGlow: string;
  heroGlow2: string;
  /** Celebration: a learned song, a streak. */
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
  /** Text and icons on `ink` (selected chips, the offline bar). */
  onInk: string;
  /** Holds, rests and beat separators in the score. */
  faint: string;
  barline: string;
  switchOff: string;
  /** Over the page behind a sheet rising from the bottom (Add a song). */
  scrim: string;
}

export type Scheme = 'light' | 'dark';

/** The main colour and its gradient's pink: white text on both stays at 4.5:1. */
const orange = '#D14617';
const pink = '#DA2F6E';

const gold = '#E6A325';

/** Light: a plain white page (a touch warm), white cards, near-black text. */
export const lightColors: Palette = {
  primary: orange,
  primary2: pink,
  onPrimary: '#FFFFFF',
  onPrimarySoft: '#FFE4D9',
  primaryDeep: '#A8360F',
  link: '#C2410C',
  accent: '#B53A0D',
  accentTint: '#FFEDE5',
  accentLine: '#F9C9B4',
  danger: '#C81E3A',
  dangerTint: '#FDE8EC',
  dangerLine: '#F5B8C4',
  onDanger: '#FFFFFF',
  hero: '#18181B',
  onHero: '#F4F4F5',
  onHeroSoft: '#C4C4CA',
  heroKicker: '#FF9466',
  heroGlow: '#F06A2C',
  heroGlow2: '#E2457A',
  gold,
  ink: '#141416',
  muted: '#66666E',
  placeholder: '#A1A1AA',
  line: '#E7E5E2',
  sand: '#FBFAF8',
  card: '#FFFFFF',
  board: '#F1F0EE',
  glass: 'rgba(251,250,248,0.96)',
  ok: '#18776A',
  okTint: '#E6F4F0',
  okLine: '#BFE3DA',
  warn: '#94600A',
  warnTint: '#FBF0DA',
  warnLine: '#F0D9A6',
  onInk: '#FFFFFF',
  faint: '#A1A1AA',
  barline: '#D4D4D8',
  switchOff: '#D4D4D8',
  scrim: 'rgba(17,17,19,0.45)',
};

/** Dark: Suno's plain, slightly cool black with grey cards; brighter orange for text. */
export const darkColors: Palette = {
  primary: orange,
  primary2: pink,
  onPrimary: '#FFFFFF',
  onPrimarySoft: '#FFE4D9',
  primaryDeep: '#A8360F',
  link: '#FF8A5B',
  accent: '#FF9466',
  accentTint: '#2E1A12',
  accentLine: '#5A2E1C',
  danger: '#FF6B81',
  dangerTint: '#3A1820',
  dangerLine: '#6A2A38',
  onDanger: '#1A0A0E',
  hero: '#18181B',
  onHero: '#F4F4F5',
  onHeroSoft: '#C4C4CA',
  heroKicker: '#FF9466',
  heroGlow: '#F06A2C',
  heroGlow2: '#E2457A',
  gold,
  ink: '#F4F4F5',
  muted: '#A1A1AA',
  placeholder: '#71717A',
  line: '#2A2A2F',
  sand: '#111113',
  card: '#1B1B1E',
  board: '#232327',
  glass: 'rgba(17,17,19,0.96)',
  ok: '#34A390',
  okTint: '#132A26',
  okLine: '#22463F',
  warn: '#E2B25A',
  warnTint: '#2E2615',
  warnLine: '#52431D',
  onInk: '#111113',
  faint: '#6B6B73',
  barline: '#3A3A40',
  switchOff: '#3A3A40',
  scrim: 'rgba(0,0,0,0.7)',
};

export const palettes: Readonly<Record<Scheme, Palette>> = { light: lightColors, dark: darkColors };

/**
 * Colours that don't change with light or dark: the icon's, splash's and first paint's gradient (the main colour,
 * orange at the top left running into pink at the bottom right; red until 21 November 2026), and WhatsApp's green.
 */
export const brand = {
  orange,
  pink,
  gold: '#E6A325',
  white: '#FFFFFF',
  ink: '#22160F',
  /** The WhatsApp share button's green (white text on it). */
  whatsapp: '#1F8F4E',
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
