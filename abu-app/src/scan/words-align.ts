/**
 * Lining a row of words up with its part's notes (a tester's report, 28 November 2026: "Text not aligning with
 * the solfa notes… let the composer arrange the text/words properly to make it align"). A row of words is sung a
 * syllable to a note, in order, as the checker pairs them (`splitWords` in src/solfa/parse.ts): "Chi-ne-ke" is
 * three syllables for three notes, and a lone "-" holds the syllable before over one more note. A word read as
 * one ("Chineke" under three notes) pushes every syllable after it onto the wrong note. These change the row a
 * syllable at a time, so it can be put right with taps (src/components/words-sheet.tsx): a syllable (and all after
 * it) a note later or earlier, a word split into its syllables, two halves of a word joined, or two words tied on
 * one note ("ka‿o").
 *
 * Pure module: no React.
 */
import { splitWords } from '@/solfa';

/** A note the syllable before is held over. */
export const HOLD = '-';
const isHold = (s: string | undefined) => s === '-' || s === '_';

/** A row of words as the checker sings it: syllables, and "-" for a note the syllable before is held over. */
export const syllablesOf = (words: string): string[] => splitWords(words);

/** The row's text from its syllables ("peo-" then "ple" still sing as one word). */
export const wordsText = (syllables: string[]): string => syllables.join(' ');

/**
 * What each of the part's `notes` sings: a syllable, "-" (the syllable before held over it), or null (no words left
 * for it); and the syllables past the last note, which won't show.
 */
export function slotsOf(syllables: string[], notes: number): { slots: (string | null)[]; extra: string[] } {
  return { slots: Array.from({ length: notes }, (_, k) => syllables[k] ?? null), extra: syllables.slice(notes) };
}

/** The syllable at `i`, and all after it, a note later: the syllable before is held over one more note. */
export function later(syllables: string[], i: number): string[] {
  if (i <= 0 || i > syllables.length) return [HOLD, ...syllables];
  return [...syllables.slice(0, i), HOLD, ...syllables.slice(i)];
}

/** The syllable at `i`, and all after it, a note earlier: only where a note before it is held. Null where none is. */
export function earlier(syllables: string[], i: number): string[] | null {
  if (i <= 0 || !isHold(syllables[i - 1])) return null;
  return [...syllables.slice(0, i - 1), ...syllables.slice(i)];
}

/** Two words sung on one note, as hymn books tie them ("ka‿o"). */
export const TIE = '‿';

/**
 * The syllable at `i` joined with the next: the two halves of one word ("Chi-" and "ne" make "Chine"), or two
 * words sung on one note, tied ("ka" and "o" make "ka‿o"). Null where either is a held note.
 */
export function join(syllables: string[], i: number): string[] | null {
  const a = syllables[i];
  const b = syllables[i + 1];
  if (!a || !b || isHold(a) || isHold(b)) return null;
  const one = a.endsWith('-') ? a.slice(0, -1) + b : `${a}${TIE}${b}`;
  return [...syllables.slice(0, i), one, ...syllables.slice(i + 2)];
}

/** The word at `i` split into its syllables (`syllablesOfWord`). Null if it's one already. */
export function split(syllables: string[], i: number): string[] | null {
  const w = syllables[i];
  if (!w || isHold(w)) return null;
  // Words tied on one note come apart first.
  const pieces = w.includes(TIE) ? w.split(TIE).filter(Boolean) : syllablesOfWord(w);
  return pieces.length > 1 ? [...syllables.slice(0, i), ...pieces, ...syllables.slice(i + 1)] : null;
}

/** Every word in the row split into its syllables. */
export function splitAll(syllables: string[]): string[] {
  return syllables.flatMap((w) => (isHold(w) ? [w] : w.includes(TIE) ? [w] : syllablesOfWord(w)));
}

const VOWELS = new Set('aeiouáàâéèêíìîóòôúùûāēīōū');
/** Two letters that are one sound: Igbo's ch, gb, gh, gw, kp, kw, nw, ny, sh; and English's th, ph, wh. */
const DIGRAPHS = new Set(['ch', 'gb', 'gh', 'gw', 'kp', 'kw', 'nw', 'ny', 'sh', 'th', 'ph', 'wh']);

/** Letters with their marks (ị, ọ, ụ, ń, a tone mark), each a unit, and a digraph one unit. */
function unitsOf(word: string): string[] {
  const letters: string[] = [];
  for (const ch of word.normalize('NFD')) {
    // A combining mark (the dot under ị, a tone mark) or an apostrophe stays with the letter before.
    if (/[̀-ͯ'’]/.test(ch) && letters.length) letters[letters.length - 1] += ch;
    else letters.push(ch);
  }
  const units: string[] = [];
  for (let k = 0; k < letters.length; k++) {
    const pair = (letters[k][0] + (letters[k + 1]?.[0] ?? '')).toLowerCase();
    if (k + 1 < letters.length && DIGRAPHS.has(pair) && letters[k].length === 1) {
      units.push(letters[k] + letters[k + 1]);
      k++;
    } else units.push(letters[k]);
  }
  return units;
}

const isVowel = (u: string) => VOWELS.has(u[0].toLowerCase());
const isNasal = (u: string) => /^[mnMN]$/.test(u[0]) && !/[’']/.test(u);

/**
 * A word's syllables, hyphenated as a row of words writes them ("Chineke" → "Chi-", "ne-", "ke"), its punctuation
 * kept at its ends. Each vowel ends a syllable, as Igbo is sung (a-nyị, Ma-rị-a, bị-a, Chu-kwu); a consonant
 * before a vowel starts the next; m or n before another consonant is a syllable of its own (N-na, m-ma, n-ke).
 * A word that ran on before ("nyịa-") keeps its hyphen on its last syllable.
 */
export function syllablesOfWord(word: string): string[] {
  const m = word.match(/^([^\p{L}]*)([\p{L}\p{M}'’-]*?)(-?)([^\p{L}\p{M}]*)$/u);
  if (!m || !m[2]) return [word];
  const [, lead, core, runsOn, tail] = m;
  const units = unitsOf(core.replace(/-/g, ''));
  const out: string[] = [];
  let cur = '';
  let voweled = false;
  units.forEach((u, k) => {
    const next = units[k + 1];
    const vowelLater = units.slice(k + 1).some(isVowel);
    if (isVowel(u)) {
      if (voweled) {
        out.push(cur);
        cur = '';
      }
      cur += u;
      voweled = true;
      return;
    }
    if (isNasal(u) && next && !isVowel(next) && vowelLater) {
      // A syllabic m or n (N-na, n-ke): a syllable of its own.
      if (cur) out.push(cur);
      out.push(u);
      cur = '';
      voweled = false;
      return;
    }
    if (voweled && vowelLater) {
      out.push(cur);
      cur = u;
      voweled = false;
      return;
    }
    cur += u;
  });
  // A last piece with no vowel (consonants at the end) stays with the syllable before.
  if (cur && out.length && !unitsOf(cur).some(isVowel)) out[out.length - 1] += cur;
  else if (cur) out.push(cur);
  const pieces = out.map((s) => s.normalize('NFC'));
  if (pieces.length <= 1) return [word];
  return pieces.map((p, k) => (k === 0 ? lead : '') + p + (k < pieces.length - 1 ? '-' : runsOn + tail));
}
