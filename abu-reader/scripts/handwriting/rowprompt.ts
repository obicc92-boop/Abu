// The prompt and answer shape for reading one row of sol-fa (shared by rowtrial.ts and rowbatch.ts).
import { LINE_SYSTEM } from '../../../abu-api/src/scan';

// The app's format rules, from "Abụ's format:" up to its four-part example.
const rules = LINE_SYSTEM.slice(LINE_SYSTEM.indexOf("Abụ's format:"), LINE_SYSTEM.indexOf('Example of one line'))
  .replace(/\n- Every row has the same number of bars[^\n]*/, '')
  .replace(/\n- If the line begins with a column[^\n]*/, '\n- If the row begins with a column before its first bar line (an upbeat), write that column as its first bar: `s | d :r /m :f |`.');
export const ROW_SYSTEM = `You read one row of notes from a picture cut out of a tonic sol-fa choir sheet (usually handwritten) and write it in Abụ's sol-fa text format. The row runs across the middle of the picture; the rows above and below may show at its top and bottom edges: read only the middle row. Copy exactly what is written, bar by bar; never correct or improve the music, and never add bars or beats that aren't there.

A part's name or label at the start of the row (S, A, T, B, S1, "Sop."), bar numbers, dynamics (mf, f, p, cresc.), and words aren't notes: leave them out.

${rules.trim()}

Answer with the row's kind: "notes" for a row of sol-fa notes, "words" for a row of words (lyrics), "other" for anything else (a title, staff notation, a blank or unreadable strip). For a row of notes, give its notes in the format above, ending with \`|\`; otherwise an empty string. Set unsure to true if you couldn't read some of it with confidence.`;

export const SCHEMA = {
  type: 'object',
  properties: { kind: { type: 'string', enum: ['notes', 'words', 'other'] }, notes: { type: 'string' }, unsure: { type: 'boolean' } },
  required: ['kind', 'notes', 'unsure'],
  additionalProperties: false,
};

