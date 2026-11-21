/**
 * Musical markings (owner's request, 21 November 2026: "read the musical languages like Andante, piano,
 * pianissimo… P or PP or forte or fortissimo"): what a mark written in braces in a part's row or on a line of its
 * own says. Dynamics (`{pp}`, `{p}`, `{mf}`, `{f}`, `{ff}`, or the words: `{piano}`, `{fortissimo}`), accents
 * (`{sfz}`), gradual changes (`{cresc}`, `{dim}`, or their hairpins `{<}` and `{>}`), tempo (`{Andante}`,
 * `{M. 70}`, `{Andante M. 70}`, `{rit}`, `{accel}`, `{a tempo}`), and directions that change nothing in the sound
 * but are shown as printed (`{Maestoso}`, `{dolce}`, `{legato}`, `{With feeling}`; owner's request, 21 November
 * 2026: hairpins and tempo words too). The repeat marks (`{segno}`, `{ds}`…) are read in parse.ts.
 *
 * Pure module: no React.
 */
import type { Expression } from './types';

/** Beats a minute for the usual tempo words. */
export const TEMPO_WORDS: Readonly<Record<string, number>> = {
  grave: 40,
  largo: 50,
  lento: 52,
  larghetto: 60,
  adagio: 66,
  andante: 76,
  andantino: 84,
  moderato: 100,
  allegretto: 112,
  allegro: 126,
  vivace: 150,
  presto: 176,
};

/** Dynamics from softest to loudest, as printed, with how loud each plays (0–1). */
export const DYNAMICS: readonly { text: string; level: number }[] = [
  { text: 'ppp', level: 0.3 },
  { text: 'pp', level: 0.4 },
  { text: 'p', level: 0.55 },
  { text: 'mp', level: 0.7 },
  { text: 'mf', level: 0.82 },
  { text: 'f', level: 0.93 },
  { text: 'ff', level: 1 },
  { text: 'fff', level: 1 },
];

/** Before a song's first dynamic, if it has any: as if mezzo-forte. */
export const DEFAULT_LEVEL = 0.82;

const DYNAMIC_WORDS: Readonly<Record<string, string>> = {
  pianississimo: 'ppp',
  pianissimo: 'pp',
  piano: 'p',
  mezzopiano: 'mp',
  mezzoforte: 'mf',
  forte: 'f',
  fortissimo: 'ff',
  fortississimo: 'fff',
};
const ACCENTS: Readonly<Record<string, string>> = { sf: 'sf', sfz: 'sfz', fz: 'fz', fp: 'fp', sforzando: 'sfz', sforzato: 'sfz' };

const CRESC = /^(?:cresc\.?|crescendo)$/;
const DIM = /^(?:dim\.?|diminuendo|decresc\.?|decrescendo)$/;
/** Hairpins as sheets draw them: < (getting louder), > (getting softer). */
const HAIRPIN_UP = /^(?:<|＜|hairpin\s*<|cresc\s*<)$/;
const HAIRPIN_DOWN = /^(?:>|＞|hairpin\s*>|dim\s*>)$/;
const RIT = /^(?:rit\.?|ritard\.?|ritardando|riten\.?|ritenuto|rall\.?|rallentando|slower|slowing)$/;
const ACCEL = /^(?:accel\.?|accelerando|stringendo|string\.?|faster)$/;
/**
 * Directions printed on sheets that set no exact dynamic or speed: shown as printed, changing nothing in the
 * sound. Italian terms and the English ones hymn books use.
 */
const DIRECTIONS = new Set([
  'maestoso', 'dolce', 'legato', 'staccato', 'espressivo', 'espress', 'cantabile', 'con moto', 'sostenuto',
  'tranquillo', 'grazioso', 'giocoso', 'animato', 'energico', 'marcato', 'tenuto', 'pesante', 'semplice',
  'misterioso', 'religioso', 'sotto voce', 'mezza voce', 'tutti', 'solo', 'unison', 'unis', 'molto', 'poco',
  'con brio', 'con spirito', 'con anima', 'con fuoco', 'smorzando', 'morendo', 'perdendosi', 'calando',
  'slowly', 'softly', 'gently', 'joyfully', 'brightly', 'boldly', 'lively', 'majestically', 'solemnly',
  'prayerfully', 'reverently', 'tenderly', 'firmly', 'smoothly', 'quietly', 'with feeling', 'with joy',
  'with spirit', 'with dignity', 'with energy', 'moderately', 'moderately slow', 'moderately fast', 'steadily',
  'not too fast', 'not too slow', 'broadly', 'freely', 'in time', 'humming', 'hum',
]);
const A_TEMPO = /^a\s*tempo\.?$/;
/** A metronome mark: "M. 70", "M.M. 70", "MM=70", "♩ = 70", "M.70". */
const METRONOME = /(?:\bm\.?\s*m?\.?|♩)\s*=?\s*(\d{2,3})\b/i;

/** What a mark says, or null if it isn't one of these (the caller then tries the repeat marks, or warns). */
export function readExpression(inner: string): Omit<Expression, 'part' | 'beat'> | null {
  const text = inner.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const key = text.toLowerCase();
  const compact = key.replace(/[\s.]/g, '');
  const dynamic = DYNAMICS.find((d) => d.text === compact) ?? DYNAMICS.find((d) => d.text === DYNAMIC_WORDS[compact]);
  if (dynamic) return { kind: 'dynamic', text: dynamic.text, level: dynamic.level };
  if (ACCENTS[compact]) return { kind: 'accent', text: ACCENTS[compact], level: 1 };
  if (CRESC.test(key)) return { kind: 'cresc', text: 'cresc.' };
  if (DIM.test(key)) return { kind: 'dim', text: 'dim.' };
  if (HAIRPIN_UP.test(key)) return { kind: 'cresc', text: '<' };
  if (HAIRPIN_DOWN.test(key)) return { kind: 'dim', text: '>' };
  if (RIT.test(key)) return { kind: 'rit', text: key.startsWith('rall') ? 'rall.' : 'rit.' };
  if (ACCEL.test(key)) return { kind: 'accel', text: 'accel.' };
  if (A_TEMPO.test(key)) return { kind: 'atempo', text: 'a tempo' };
  const metronome = text.match(METRONOME);
  const word = (key.match(/[a-z]+/g) ?? []).find((w) => w in TEMPO_WORDS);
  if (metronome || word) {
    const bpm = metronome ? Number(metronome[1]) : TEMPO_WORDS[word!];
    if (bpm >= 20 && bpm <= 300) return { kind: 'tempo', text: tidyTempo(text), bpm };
  }
  // A direction: one SolfaScores knows, alone or with "molto", "poco", "più", "meno" and the like before it.
  const words = key.replace(/[.,;:!]+$/g, '').replace(/^(?:molto|poco|più|piu|meno|sempre|ben|assai)\s+/, '');
  if (DIRECTIONS.has(words) || DIRECTIONS.has(key.replace(/[.,;:!]+$/g, ''))) return { kind: 'direction', text: text.replace(/\s+/g, ' ') };
  return null;
}

/**
 * "andante m.70" → "Andante M. 70": a tempo mark as sheets print it, its first word capitalised and the rest as
 * written ("Allegro con brio", not "Allegro Con Brio").
 */
function tidyTempo(text: string): string {
  return text
    .replace(/^([a-z])/, (c) => c.toUpperCase())
    .replace(/\bM\.?\s*M?\.?\s*=?\s*(\d{2,3})/i, 'M. $1')
    .replace(/♩\s*=?\s*(\d{2,3})/, '♩ = $1');
}

/** Whether a mark sets or changes the tempo (so it's for every part, wherever it's written). */
export const isTempo = (kind: Expression['kind']): boolean => kind === 'tempo' || kind === 'rit' || kind === 'accel' || kind === 'atempo';
