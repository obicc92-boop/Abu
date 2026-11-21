/**
 * A song's sections (owner's request, 21 November 2026: "chorus, verses, refrain"): the names offered when a section
 * is written, and what a sheet's printed label says ("CHORUS", "Ch.", "Ref.", "2nd Verse"). A section is written in
 * a song's text as `[Chorus]` on a line of its own before its first line of music (docs/solfa-format.md); the score
 * shows its name over that line, and it lasts until the next one.
 */

/** The names offered, in the order a song usually has them. */
export const SECTION_CHOICES = ['Intro', 'Verse', 'Chorus', 'Refrain', 'Bridge', 'Interlude', 'Coda'] as const;

/** A label's word, as sheets print it, and the section it names. */
const WORDS: [RegExp, string][] = [
  [/^(?:ch|chr|chor|chorus)$/i, 'Chorus'],
  [/^(?:ref|refr|refrain)$/i, 'Refrain'],
  [/^(?:verse|vs|stanza)$/i, 'Verse'],
  [/^coda$/i, 'Coda'],
  [/^(?:intro|introduction)$/i, 'Intro'],
  [/^interlude$/i, 'Interlude'],
  [/^bridge$/i, 'Bridge'],
  [/^outro$/i, 'Outro'],
];

const named = (word: string): string | null => WORDS.find(([re]) => re.test(word))?.[1] ?? null;

/** Numbers as typed sheets spell them out ("VERSE ONE", "First Verse"; seen on the owner's typed samples, 21 November 2026). */
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** A verse's number as printed ("2", "02", "two", "2nd", "second"), or null. */
function numberOf(printed: string): number | null {
  const t = printed.toLowerCase();
  const digits = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(t);
  if (digits) return Number(digits[1]) || null;
  const k = Math.max(NUMBER_WORDS.indexOf(t), ORDINAL_WORDS.indexOf(t));
  return k >= 0 ? k + 1 : null;
}

/**
 * The section a printed label names ("CHORUS:" is Chorus, "Ch." Chorus, "Ref." Refrain, "Verse 2", "2nd Verse",
 * "VERSE TWO" and "Second Verse" Verse 2, "V2" Verse 2), or null when it names none. Only a label on its own: a
 * reader finds it (above a line, or before its first row) and asks. What sheets print after a label is left off: who
 * sings it ("Verse 2 (Female)"), how often ("REFRAIN 2x", "Chorus (x2)") and footnote stars. "Solo", "Tutti" and
 * "Unison" say who sings, not a section; a label in brackets ("(CHORUS)", "(Refrain)") is a direction, not one.
 */
export function sectionName(printed: string): string | null {
  let t = printed.trim().replace(/\s+/g, ' ');
  for (let was = ''; was !== t; ) {
    was = t;
    t = t
      .replace(/[.:\s]+$/, '')
      .replace(/\s*[*†]+$/, '')
      .replace(/^(.*\S)\s*\([^()]*\)$/, '$1')
      .replace(/\s+(?:\d\s*[x×]|[x×]\s*\d)$/i, '');
  }
  // "2nd Verse", "2. Verse", "Second Verse".
  const before = /^([A-Za-z]+|\d{1,2}(?:st|nd|rd|th)?)\.?\s+([A-Za-z]+)\.?$/i.exec(t);
  if (before) {
    const n = numberOf(before[1]);
    const name = named(before[2]);
    if (n && name) return `${name} ${n}`;
  }
  // "Verse 2", "Verse2", "V. 2", "V2", "VERSE TWO".
  const after = /^([A-Za-z]+?)\.?\s*(\d{1,2}|[A-Za-z]{3,})$/.exec(t);
  if (after) {
    const n = numberOf(after[2]);
    const name = /^v$/i.test(after[1]) ? 'Verse' : named(after[1]);
    if (n && name) return `${name} ${n}`;
  }
  const word = /^([A-Za-z]+)\.?$/.exec(t);
  return word ? named(word[1]) : null;
}

/** A section's name as the song's text writes it: `[Chorus]`. */
export const sectionLine = (name: string) => `[${name.trim()}]`;

/**
 * A line of music's text with a section's name on its first line (`[Chorus]`, as a reader may give it) taken off:
 * the name, and the rest.
 */
export function takeSection(text: string): { section: string | null; text: string } {
  const m = /^\s*\[([^\]\n]+)\]\s*(?:\n|$)/.exec(text);
  return m ? { section: m[1].trim(), text: text.slice(m[0].length) } : { section: null, text };
}
