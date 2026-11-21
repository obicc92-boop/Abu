/**
 * Joins the lines read from a scanned sheet into one song in SolfaScores' format.
 *
 * Many sheets print the upbeat of a line in the first column of the next
 * line and leave the last beat of the line before it empty (or short).
 * Read line by line, each line then starts with a short bar, which SolfaScores'
 * checker only allows at the very start of a song, so the upbeat goes back
 * where it's sung, with its words.
 */
import { keyFromSemitone, parseKey, parseSolfa, parseTempo, parseTime, sectionLine, splitWords } from '@/solfa';

import { noteColumns } from './line-text';

interface Row {
  part: string | null;
  body: string;
}

const PART_ROW = /^(Solo|S|A|T|B|P\d+)\s+(.*)$/;
const WORDS_ROW = /^W\s*:?\s+(.*)$/;

function rowsOf(text: string): Row[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const p = l.match(PART_ROW);
      if (p) return { part: p[1], body: p[2] };
      const w = l.match(WORDS_ROW);
      return { part: null, body: w ? w[1] : l };
    });
}

const barsOf = (body: string) => body.split('|').map((b) => b.trim()).filter(Boolean);
const beatsOf = (bar: string) => bar.split(/[:/]/);
/**
 * A bar's notes that take a syllable, for moving the words sung on them: not the letters of a mark ({f},
 * {Andante}), nor a slur's notes after its first ("(s.l)" takes one), and a bridge note ("s=d") is one.
 */
const notesIn = (bar: string) => noteColumns(bar.replace(HELD, ' ')).length;
const row = (part: string, bars: string[]) => `${part.padEnd(2)} ${bars.join(' | ')} |`;
/** Whether a bar has nothing in it but marks in braces (or their stand-ins), which the checker doesn't count as a bar. */
const marksOnly = (bar: string) => !bar.replace(HELD, '').replace(/\{[^{}]*\}/g, '').trim();

/** Marks in braces, and the stand-ins they're held as while lines are joined. */
const MARKS = /\{[^{}]*\}/g;
const HELD = /[\u{F0000}-\u{FFFFD}]/gu;

/**
 * The lines with each mark in braces held as a stand-in of its own, a character with no bar line or beat mark in
 * it (a repeat's `{:|}` has both), and how to put them back.
 */
function holdMarks(lines: string[]): { lines: string[]; back: (text: string) => string } {
  const marks: string[] = [];
  const held = lines.map((l) =>
    l.replace(MARKS, (m) => {
      marks.push(m);
      return String.fromCodePoint(0xf0000 + marks.length - 1);
    }),
  );
  return { lines: held, back: (text) => text.replace(HELD, (c) => marks[(c.codePointAt(0) ?? 0) - 0xf0000] ?? '') };
}

/**
 * The usual number of beats in a bar, from the bars inside each line (a
 * line's first and last are often split). Each number is scored by how the
 * bars fit it, allowing for a reader's usual slips: a bar of exactly that
 * many beats counts most, and more with a half-bar mark ("/") in its middle,
 * which only bars of 4 or 6 have; a bar of twice as many counts a little (a
 * bar line lost), and one of half as many (a half-bar mark read as a bar
 * line). On 50 handwritten pages it guessed 47 times right, where the
 * commonest count got 46.
 */
export function guessBeats(lines: string[]): number | null {
  const score = new Map<number, number>();
  const add = (n: number, s: number) => score.set(n, (score.get(n) ?? 0) + s);
  // A mark's ":" or "|" ({:|}, a repeat) is no beat or bar line.
  for (const text of lines.map((l) => l.replace(MARKS, ' ')))
    for (const r of rowsOf(text)) {
      if (!r.part) continue;
      for (const bar of barsOf(r.body).slice(1, -1)) {
        const marks = bar.match(/[:/]/g) ?? [];
        const n = marks.length + 1;
        const halved = n >= 4 && n % 2 === 0 && marks[n / 2 - 1] === '/';
        add(n, halved ? 1.5 : 1);
        if (n % 2 === 0) add(n / 2, halved ? -0.5 : 0.5);
        if ((2 * n) % 4 === 0 || 2 * n === 6) add(2 * n, 0.5);
      }
    }
  return [...score.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

/** "4/4" from what's printed, or from the bars when nothing is printed. */
export function timeFor(printed: string, lines: string[]): string {
  const t = parseTime(printed);
  if (t) return t.label;
  const beats = guessBeats(lines);
  return beats ? (parseTime(String(beats))?.label ?? '4/4') : '4/4';
}

/** Moves the upbeat at the start of `next` to the end of `prev`, if that's how the sheet is laid out. Returns the new pair, or null. */
function moveUpbeat(prev: Row[], next: Row[], beats: number): [Row[], Row[]] | null {
  const prevParts = prev.filter((r) => r.part);
  const nextParts = next.filter((r) => r.part);
  if (!prevParts.length || prevParts.map((r) => r.part).join() !== nextParts.map((r) => r.part).join()) return null;
  const firsts = nextParts.map((r) => barsOf(r.body));
  const lasts = prevParts.map((r) => barsOf(r.body));
  const b = beatsOf(firsts[0][0] ?? '').length;
  if (firsts.some((f) => f.length < 2 || beatsOf(f[0]).length !== b) || b >= beats || lasts.some((l) => !l.length)) return null;
  // A mark alone between bar lines ("| {p} |") is no bar to move or move into.
  if (firsts.some((f) => marksOnly(f[0])) || lasts.some((l) => marksOnly(l[l.length - 1]))) return null;

  const joined: string[] = [];
  for (let i = 0; i < lasts.length; i++) {
    const last = lasts[i][lasts[i].length - 1];
    const lastBeats = beatsOf(last);
    const upbeat = firsts[i][0];
    if (lastBeats.length + b === beats) joined.push(`${last} :${upbeat}`);
    else if (lastBeats.length === beats && lastBeats.slice(-b).every((x) => !x.trim())) {
      // The line ends with empty beats, left for the upbeat printed on the next line.
      const seps = last.match(/[:/]/g) ?? [];
      let kept = lastBeats[0].trim();
      for (let k = 1; k < beats - b; k++) kept += ` ${seps[k - 1]}${lastBeats[k].trim()}`;
      joined.push(`${kept} ${seps[beats - b - 1]}${upbeat}`);
    } else return null;
  }

  // The words sung on the upbeat go back with it: as many syllables as the first part's upbeat has notes.
  const firstPart = nextParts[0].part;
  const moving = notesIn(firsts[0][0]);
  const newPrev: Row[] = [];
  const newNext: Row[] = [];
  let k = 0;
  for (const r of prev) {
    if (r.part) {
      const bars = lasts[k];
      newPrev.push({ part: r.part, body: `${[...bars.slice(0, -1), joined[k]].join(' | ')} |` });
      k++;
    } else newPrev.push(r);
  }
  const prevWordsAt = newPrev.findIndex((r, i) => !r.part && newPrev[i - 1]?.part === firstPart);
  k = 0;
  for (let i = 0; i < next.length; i++) {
    const r = next[i];
    if (r.part) {
      newNext.push({ part: r.part, body: `${firsts[k].slice(1).join(' | ')} |` });
      k++;
    } else if (next[i - 1]?.part === firstPart && moving && prevWordsAt >= 0) {
      const syllables = splitWords(r.body);
      newPrev[prevWordsAt] = { part: null, body: `${newPrev[prevWordsAt].body} ${syllables.slice(0, moving).join(' ')}`.trim() };
      newNext.push({ part: null, body: syllables.slice(moving).join(' ') });
    } else newNext.push(r);
  }
  return [newPrev, newNext];
}

/**
 * Where each line of a scanned sheet is in key (owner's request, 20 November 2026): `from`, the key it comes in
 * with; `start`, the key it starts in (its own new key, if it has one: printed with it, read by the AI or set by
 * the person); and `change`, the key's name where the song's text needs a key line before it. That's at a
 * line's own new key, or at the first kept line after lines left out that changed key (with their bridge notes or
 * their own key). Keys are semitones above C; `doh` is the song's.
 */
export function linesKeys(lines: { text: string; key?: string; left?: boolean }[], doh: number, time: string): { from: number; start: number; change?: string }[] {
  // Where the music is, every line counted; and where the song's text has it, the kept lines only.
  let real = doh;
  let song = doh;
  return lines.map((l) => {
    const from = real;
    const own = l.key ? parseKey(l.key) : null;
    const start = own ? own.semitone : real;
    // Where its bridge notes leave it.
    const after = parseSolfa(l.text, { time, key: start }).keyChanges.at(-1)?.key?.semitone ?? start;
    if (l.left) {
      real = after;
      return { from, start };
    }
    const change = start !== song ? (own ? own.name : keyFromSemitone(start).name) : undefined;
    real = song = after;
    return { from, start, ...(change ? { change } : {}) };
  });
}

/**
 * The lines as one song text, a blank line between lines of music, upbeats moved back. `keys`, the key each line
 * changes to at its start, if it does (`linesKeys`), goes on a line before it as sheets print it: \`Doh is F\`.
 */
export function joinLines(lines: string[], time: string, keys: (string | undefined)[] = [], sections: (string | null | undefined)[] = []): string {
  const beats = parseTime(time)?.pulses ?? guessBeats(lines) ?? 4;
  // Marks held as stand-ins while bars and beats are counted and moved, and put back after.
  const held = holdMarks(lines);
  const rows = held.lines.map(rowsOf);
  for (let i = 1; i < rows.length; i++) {
    const moved = moveUpbeat(rows[i - 1], rows[i], beats);
    if (moved) [rows[i - 1], rows[i]] = moved;
  }
  return rows
    .map((line, i) => {
      const text = line
        .filter((r) => r.part || r.body)
        .filter((r) => !r.part || barsOf(r.body).length)
        .map((r) => (r.part ? row(r.part, barsOf(r.body)) : `W  ${r.body}`))
        .join('\n');
      const keyed = text && keys[i] ? `Doh is ${keys[i]}\n${held.back(text)}` : held.back(text);
      // A section starting at the line ("[Chorus]"), above its key change.
      return keyed && sections[i] ? `${sectionLine(sections[i]!)}\n${keyed}` : keyed;
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The song's text with the tempo printed in the sheet's heading ("Larghetto, M. 79", "Andante. M. 70") as its
 * first line, \`tempo: …\`, as the song editor saves it; the text as it is when there's none, or when it says no
 * speed SolfaScores can play (src/solfa/parse.ts reads the number as beats a minute, or a tempo word's usual speed).
 */
export function withTempo(text: string, tempo: string | undefined): string {
  const t = (tempo ?? '').replace(/\s+/g, ' ').trim();
  if (!t || parseTempo(t).bpm === null) return text;
  return text ? `tempo: ${t}\n\n${text}` : `tempo: ${t}`;
}
