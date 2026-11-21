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
 * "1st time"). Pure, with no imports: the Worker uses it too.
 */

/** Signs: written before the first note they mark. */
export const SIGNS: readonly string[] = ['segno', 'coda', '|:', '1.', '2.'];

/** Jumps and ends: written after the last note of their bar, before its bar line. */
export const ENDS: readonly string[] = ['D.S.', 'D.S. al Fine', 'D.S. al Coda', 'D.C.', 'D.C. al Fine', 'D.C. al Coda', 'Fine', 'to coda', ':|'];

/** The segno and coda signs as a PDF's text may give them: the music symbols, SMuFL's (music fonts), and stand-ins typists use. */
export const SEGNO_GLYPHS = ['𝄋', '', '§', '$'];
export const CODA_GLYPHS = ['𝄌', '', '⊕'];

/** What's in a repeat or jump mark's braces as SolfaScores spells it ("dal segno al fine" is "D.S. al Fine"), or null if it isn't one. */
export function repeatMark(inner: string): string | null {
  const t = inner.trim().replace(/\s+/g, ' ');
  const k = t.toLowerCase();
  if (SEGNO_GLYPHS.includes(t) || k === 'segno' || k === 'sign') return 'segno';
  if (CODA_GLYPHS.includes(t) || k === 'coda') return 'coda';
  if (/^to coda(?: ?(?:𝄌|⊕|))?$/.test(k)) return 'to coda';
  const jump = k.match(/^(?:(d\.? ?s\.?|dal segno)|(d\.? ?c\.?|da capo))(?: al (fine|coda))?$/);
  if (jump) return `${jump[1] ? 'D.S.' : 'D.C.'}${jump[3] ? ` al ${jump[3] === 'fine' ? 'Fine' : 'Coda'}` : ''}`;
  if (/^fine\.?$/.test(k)) return 'Fine';
  if (/^(?::\|\|?|:‖|:𝄇)$/.test(k)) return ':|';
  if (/^(?:\|\|?:|‖:|𝄆)$/.test(k)) return '|:';
  if (/^(?:1\.?|1st(?: time)?|first time)$/.test(k)) return '1.';
  if (/^(?:2\.?|2nd(?: time)?|second time)$/.test(k)) return '2.';
  return null;
}

/** Whether a mark is a sign (before the note it marks) rather than a jump or an end (after its bar's last note). */
export const isSign = (mark: string): boolean => SIGNS.includes(mark);
