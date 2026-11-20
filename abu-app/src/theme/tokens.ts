/**
 * Colour tokens, by what they're for. There are three looks (owner's choice, 21 November 2026, after the red
 * main colour didn't fit the darker, Suno-like design): Gold (cream and gold), Silver (cool silver-white) and
 * Violet (soft violet), each in a light and a dark palette. Me → Appearance picks the look and light or dark;
 * screens get the palette in use from `useColors()` or `makeStyles()` (src/theme/theme.tsx). The parts keep
 * their own fixed colours in every look.
 */
export interface Palette {
  /** The main colour: main buttons, the tab in use, switches that are on, selected marks, progress. */
  primary: string;
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
}

export type Scheme = 'light' | 'dark';

/** The three looks, in the order Me shows them. */
export type LookId = 'gold' | 'silver' | 'violet';

export const LOOKS: readonly { id: LookId; name: string; about: string }[] = [
  { id: 'gold', name: 'Gold', about: 'Warm, with cream and gold' },
  { id: 'silver', name: 'Silver', about: 'Cool silver-white' },
  { id: 'violet', name: 'Violet', about: 'Soft violet' },
];

/** What the light palettes share: the "ok", "not yet" and "problem" colours. */
const lightStatus = {
  ok: '#18776A',
  okTint: '#E6F4F0',
  okLine: '#BFE3DA',
  warn: '#94600A',
  warnTint: '#FBF0DA',
  warnLine: '#F0D9A6',
  danger: '#C2341C',
  dangerTint: '#FBEAE6',
  dangerLine: '#EFC3B8',
  onDanger: '#FFFFFF',
  gold: '#E6A325',
} as const;

const darkStatus = {
  ok: '#34A390',
  warn: '#E2B25A',
  danger: '#F27A5E',
  onDanger: '#1A0D0A',
  gold: '#E6A325',
} as const;

/** Gold: the warm sand and near-black browns the app has had, with cream (dark) or ink (light) buttons and gold. */
const goldLight: Palette = {
  ...lightStatus,
  primary: '#22160F',
  onPrimary: '#FFFFFF',
  onPrimarySoft: '#E9DED8',
  primaryDeep: '#4A3A31',
  link: '#865800',
  accent: '#7A4F00',
  accentTint: '#F8EBD2',
  accentLine: '#EBCF98',
  hero: '#1E1612',
  onHero: '#F6EDE7',
  onHeroSoft: '#C9B9B0',
  heroKicker: '#F2B54A',
  heroGlow: '#E6A325',
  heroGlow2: '#4CC3AF',
  ink: '#22160F',
  muted: '#76655C',
  placeholder: '#B3A39A',
  line: '#E9DED8',
  sand: '#F7F1ED',
  card: '#FFFFFF',
  board: '#EDE4DE',
  glass: 'rgba(247,241,237,0.96)',
  onInk: '#FFFFFF',
  faint: '#B9A79D',
  barline: '#CDBEB5',
  switchOff: '#D8CCC5',
};

const goldDark: Palette = {
  ...darkStatus,
  primary: '#F6EDE7',
  onPrimary: '#0D0907',
  onPrimarySoft: '#5C4C44',
  primaryDeep: '#D9CCC3',
  link: '#F2B54A',
  accent: '#F2B54A',
  accentTint: '#33270F',
  accentLine: '#5C4718',
  dangerTint: '#3A1D16',
  dangerLine: '#6B3226',
  okTint: '#14302A',
  okLine: '#245049',
  warnTint: '#33270F',
  warnLine: '#5C4718',
  hero: '#1C1411',
  onHero: '#F6EDE7',
  onHeroSoft: '#C9B9B0',
  heroKicker: '#F2B54A',
  heroGlow: '#E6A325',
  heroGlow2: '#4CC3AF',
  ink: '#F6EDE7',
  muted: '#B8A79E',
  placeholder: '#8A786E',
  line: '#2E231E',
  sand: '#0D0907',
  card: '#191210',
  board: '#261C17',
  glass: 'rgba(13,9,7,0.96)',
  onInk: '#0D0907',
  faint: '#7A6A60',
  barline: '#4D3F38',
  switchOff: '#4D3F38',
};

/** Silver: cool greys with no warmth, silver-white (dark) or graphite (light) buttons. */
const silverLight: Palette = {
  ...lightStatus,
  primary: '#1C2028',
  onPrimary: '#FFFFFF',
  onPrimarySoft: '#DDE1E7',
  primaryDeep: '#3A414D',
  link: '#3D4A5C',
  accent: '#465266',
  accentTint: '#E9EDF3',
  accentLine: '#CBD3DF',
  hero: '#161A21',
  onHero: '#EEF1F6',
  onHeroSoft: '#C3C9D3',
  heroKicker: '#D7DEE8',
  heroGlow: '#C7D0DC',
  heroGlow2: '#7FA6E0',
  ink: '#12151B',
  muted: '#5B6472',
  placeholder: '#9AA3B0',
  line: '#DDE1E7',
  sand: '#F3F5F8',
  card: '#FFFFFF',
  board: '#E6E9EE',
  glass: 'rgba(243,245,248,0.96)',
  onInk: '#FFFFFF',
  faint: '#9AA3B0',
  barline: '#C3CAD4',
  switchOff: '#C9CFD8',
};

const silverDark: Palette = {
  ...darkStatus,
  primary: '#E8ECF2',
  onPrimary: '#0B0C0F',
  onPrimarySoft: '#4B515D',
  primaryDeep: '#C9D0DA',
  link: '#D7DEE8',
  accent: '#D7DEE8',
  accentTint: '#1F242C',
  accentLine: '#3A414D',
  dangerTint: '#33191A',
  dangerLine: '#5E2E2A',
  okTint: '#122925',
  okLine: '#22463F',
  warnTint: '#2B2412',
  warnLine: '#4F4119',
  hero: '#171A20',
  onHero: '#EEF1F6',
  onHeroSoft: '#C3C9D3',
  heroKicker: '#D7DEE8',
  heroGlow: '#C7D0DC',
  heroGlow2: '#7FA6E0',
  ink: '#EEF1F6',
  muted: '#A9B0BC',
  placeholder: '#7A818D',
  line: '#2A2E36',
  sand: '#0B0C0F',
  card: '#15171C',
  board: '#1F2229',
  glass: 'rgba(11,12,15,0.96)',
  onInk: '#0B0C0F',
  faint: '#6B727E',
  barline: '#3A3F4A',
  switchOff: '#3A3F4A',
};

/** Violet: a faint violet in the greys, soft violet buttons and accents. */
const violetLight: Palette = {
  ...lightStatus,
  primary: '#6E54F0',
  onPrimary: '#FFFFFF',
  onPrimarySoft: '#E6E0FF',
  primaryDeep: '#5640D0',
  link: '#5B43D6',
  accent: '#5038C4',
  accentTint: '#EEEAFF',
  accentLine: '#D3CAFB',
  hero: '#1A1530',
  onHero: '#F1EEF8',
  onHeroSoft: '#C8C1DA',
  heroKicker: '#C9BCFF',
  heroGlow: '#B9A8FF',
  heroGlow2: '#4CC3AF',
  ink: '#17132A',
  muted: '#625A7A',
  placeholder: '#A29BB8',
  line: '#E2DDF0',
  sand: '#F6F4FB',
  card: '#FFFFFF',
  board: '#ECE8F6',
  glass: 'rgba(246,244,251,0.96)',
  onInk: '#FFFFFF',
  faint: '#A29BB8',
  barline: '#CCC5E0',
  switchOff: '#D3CDE3',
};

const violetDark: Palette = {
  ...darkStatus,
  primary: '#B9A8FF',
  onPrimary: '#150F2E',
  onPrimarySoft: '#3E2F7A',
  primaryDeep: '#9C88F0',
  link: '#C9BCFF',
  accent: '#C9BCFF',
  accentTint: '#241D3D',
  accentLine: '#41356B',
  dangerTint: '#33181C',
  dangerLine: '#5E2C30',
  okTint: '#13282A',
  okLine: '#234544',
  warnTint: '#2C2414',
  warnLine: '#50411C',
  hero: '#1A1624',
  onHero: '#F1EEF8',
  onHeroSoft: '#C8C1DA',
  heroKicker: '#C9BCFF',
  heroGlow: '#B9A8FF',
  heroGlow2: '#4CC3AF',
  ink: '#F1EEF8',
  muted: '#B0A9C2',
  placeholder: '#7F7894',
  line: '#2C2739',
  sand: '#0D0B12',
  card: '#17141F',
  board: '#221E2D',
  glass: 'rgba(13,11,18,0.96)',
  onInk: '#150F2E',
  faint: '#6F6884',
  barline: '#3D3650',
  switchOff: '#3D3650',
};

export const palettes: Readonly<Record<LookId, Readonly<Record<Scheme, Palette>>>> = {
  gold: { light: goldLight, dark: goldDark },
  silver: { light: silverLight, dark: silverDark },
  violet: { light: violetLight, dark: violetDark },
};

/** The first look's palettes, for the few places that don't follow the look (Perform's own colours). */
export const lightColors = goldLight;
export const darkColors = goldDark;

/** Colours that don't change with the look: the red icon, splash and first paint, and WhatsApp's green. */
export const brand = {
  red: '#D93A1E',
  redDeep: '#A3261A',
  gold: '#E6A325',
  white: '#FFFFFF',
  ink: '#22160F',
  onRedSoft: '#FFE7E0',
  /** Kickers on red. */
  onRedKicker: '#FFD9CF',
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
