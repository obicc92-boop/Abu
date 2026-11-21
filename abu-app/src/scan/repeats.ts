/**
 * Repeats and jumps as SolfaScores writes them, in braces (owner's request, 21 November 2026: "DC or to repeat…
 * and also for the AI to be able to read that too", after a segno on their sheet was read as a bridge note):
 *
 * - signs, before the first note they mark: `{segno}` (𝄋), `{coda}` (𝄌), the start repeat `{|:}`, and the first
 *   and second endings `{1.}` and `{2.}`;
 * - jumps and ends, right after the last note of their bar, before its `|`: `{D.S.}`, `{D.S. al Fine}`,
 *   `{D.S. al Coda}`, `{D.C.}`, `{D.C. al Fine}`, `{D.C. al Coda}`, `{Fine}`, `{to coda}`, and the end repeat
 *   `{:|}`.
 *
 * `repeatMark` gives the spelling for what a sheet prints or a reader writes ("Dal Segno al Fine", "dc", "𝄋",
 * "1st time"), from the sol-fa reader's own reading. Relative imports only: the Worker uses it too.
 */
import { readRepeat, REPEAT_SPELLING } from '../solfa/repeats';

/** Signs: written before the first note they mark. */
export const SIGNS: readonly string[] = ['segno', 'coda', '|:', '1.', '2.'];

/** Jumps and ends: written after the last note of their bar, before its bar line. */
export const ENDS: readonly string[] = ['D.S.', 'D.S. al Fine', 'D.S. al Coda', 'D.C.', 'D.C. al Fine', 'D.C. al Coda', 'Fine', 'to coda', ':|'];

/** The segno and coda signs as a PDF's text may give them: the music symbols, SMuFL's (music fonts), and stand-ins typists use. */
export const SEGNO_GLYPHS = ['𝄋', '', '§', '$'];
export const CODA_GLYPHS = ['𝄌', '', '⊕'];

/**
 * What's in a repeat or jump mark's braces as SolfaScores spells it ("dal segno al fine" is "D.S. al Fine"), or null
 * if it isn't one: the sol-fa reader's own reading (src/solfa/repeats.ts), so scanning and the score never differ.
 */
export function repeatMark(inner: string): string | null {
  const name = readRepeat(inner.trim());
  return name ? REPEAT_SPELLING[name] : null;
}

/** Whether a mark is a sign (before the note it marks) rather than a jump or an end (after its bar's last note). */
export const isSign = (mark: string): boolean => SIGNS.includes(mark);
