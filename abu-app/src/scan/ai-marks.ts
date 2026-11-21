/**
 * The marks and slurs printed with a line that reads right already, read by AI (owner's request, 21 November
 * 2026: "let AI read marks and slurs, hair pins, tempo words"): SolfaScores' own reader reads only notes, and
 * until then only the lines it got wrong went to an AI, so a line it read right never had its marks. An AI's
 * answer is kept only when it changed none of the line's notes, beat marks or bar lines (`withMarksAdded`).
 *
 * - A handwritten sheet's line gets them from the words call it has already (Opus copies its words, given its
 *   notes): the rows come back marked in the same call (`withWordsAndMarks`).
 * - A typed sheet's line (a photo, a scan or a PDF) gets a small marks reading of its own (`withAiMarks`):
 *   Cloudflare's reader first, then Claude's cheap one. What a PDF's own text and drawn underlines gave stays.
 *
 * Either way only when the person leaves "Read marks and slurs with AI" on (the scan's first step).
 */
import { joinLine, splitLine, withMarksAdded, withWords, wordsOf, wordsPreferring, type LineWords } from './line-text';

export type MarksReader = 'cloudflare' | 'claude';

/** Asks one reader for the line's rows with their marks: its answer, or it throws (switched off, over its day, out of the allowance). */
export type AskMarks = (by: MarksReader, rows: string) => Promise<string>;

/**
 * A typed sheet's line with the marks and slurs printed with it read by AI, when `on`: Cloudflare's reader first,
 * then Claude's if Cloudflare's isn't there, over its day, or gives back other notes. The line as it is if
 * neither can, or if a marked line wouldn't pass the checker (`passes`). `allowanceOut` says today's allowance
 * ran out (an answer with status 429), so the caller asks no more for this sheet. `keyChange`: the line has a new
 * key of its own, so a bridge note in it is real and never taken for a misread sign.
 */
export async function withAiMarks(
  text: string,
  o: { on: boolean; readers: { cloudflare: boolean; anthropic: boolean }; ask: AskMarks; passes: (t: string) => boolean; keyChange?: boolean },
): Promise<{ text: string; via?: MarksReader; allowanceOut?: boolean }> {
  const rows = joinLine(splitLine(text).filter((r) => r.part));
  if (!o.on || !rows.trim()) return { text };
  const order: MarksReader[] = [...(o.readers.cloudflare ? (['cloudflare'] as const) : []), ...(o.readers.anthropic ? (['claude'] as const) : [])];
  for (const by of order) {
    try {
      const marked = withMarksAdded(text, await o.ask(by, rows), { keyChange: o.keyChange });
      if (marked && o.passes(marked)) return { text: marked, via: by };
    } catch (e) {
      if ((e as { status?: number }).status === 429) return { text, allowanceOut: true };
    }
  }
  return { text };
}

/**
 * A handwritten sheet's line with the words Opus copied (kept under each part it gave words for; the app's under
 * the others), and the marks and slurs from the rows it gave back, if it did: kept only if their notes are the
 * line's and the line still passes the checker. Otherwise just the words.
 */
export function withWordsAndMarks(text: string, reply: { words: LineWords[]; notes?: string }, passes: (t: string) => boolean, keyChange = false): string {
  const worded = reply.words.length ? withWords(text, wordsPreferring(reply.words, wordsOf(text))) : text;
  const marked = reply.notes ? withMarksAdded(worded, reply.notes, { keyChange }) : null;
  return marked && passes(marked) ? marked : worded;
}
