/**
 * The AI help for scanning sheets (see docs/scan-plan.md), used only where the
 * app can't do the job itself. The app reads typed PDFs from their own text
 * and finds and reads lines in pictures with SolfaScores' own model, in the browser.
 * Then, only for a line that still fails SolfaScores' checker:
 *
 * 1. Cloudflare's own reader (Workers AI, Mistral Small 3.1) corrects it. It
 *    also reads rows of words in pictures, which SolfaScores' model can't.
 * 2. Claude, only if the Worker has an Anthropic key: Haiku checks the line,
 *    and Opus reads it from scratch if that still fails. Haiku can also find
 *    the lines on a page the app couldn't.
 *
 * Measured in abu-reader/README.md. Claude answers in JSON to a fixed schema;
 * Cloudflare's reader answers in SolfaScores' own rows.
 */
import Anthropic from '@anthropic-ai/sdk';

import { readExpression, TEMPO_WORDS } from '../../abu-app/src/solfa';
import { AppError, badRequest } from './errors';

/** The strong reader: reads a line from scratch, for lines the cheaper path can't get right. */
const STRONG = 'claude-opus-5-5';
/** The cheap one: finds the lines on a page, and checks the reading SolfaScores' own model made of a line. */
const CHEAP = 'claude-haiku-5-5';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
/** Claude takes pictures up to 5 MB; the app sends far smaller ones. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/* ---------- Finding the lines on a page ---------- */

const PAGE_SYSTEM = `You look at a page of a tonic sol-fa choir sheet (typed or handwritten, often in a table) and find each line of music on it, so each line can be cut out and read on its own.

A line of music is one system: the rows of notes for all the parts sung together, side by side in time, with any rows of words between or under them. Sheets often stack 4 rows of notes (soprano, alto, tenor, bass, top to bottom) with words under the first row; some have 1, 2, 3 or 5 rows (a solo row on top). Several lines of music follow each other down the page; a table's horizontal rules or a gap usually separate them.

For each line of music, in reading order, give its box in pixels of this image: top (just above the first row of notes, including raised octave marks), bottom (just below its last row, including lowered octave marks and its last words row), left and right (including a first column with an upbeat and the table borders). Boxes of different lines must not overlap. Also give the parts of its rows of notes, top to bottom, as S, A, T, B or Solo, and how many rows of words it has.

Also read the heading if there is one: title, composer or arranger, the key (from "Doh is ...", "Key ...") as a note name such as Ab or F#, the time (such as 4/4) and the tempo as printed (such as "Andante. M. 70" or "Maestoso"), if printed. Use an empty string for anything not printed. Leave out headings, verses printed as text, footers and anything that isn't a line of sol-fa.`;

const PAGE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    composer: { type: 'string' },
    key: { type: 'string' },
    time: { type: 'string' },
    tempo: { type: 'string' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          top: { type: 'integer' },
          bottom: { type: 'integer' },
          left: { type: 'integer' },
          right: { type: 'integer' },
          parts: { type: 'array', items: { type: 'string' } },
          words_rows: { type: 'integer' },
        },
        required: ['top', 'bottom', 'left', 'right', 'parts', 'words_rows'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'composer', 'key', 'time', 'tempo', 'lines'],
  additionalProperties: false,
};

export interface FoundLine {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** The rows of notes, top to bottom: S, A, T, B or Solo. */
  parts: string[];
  /** How many rows of words it has, for finding its rows. */
  words: number;
}

export interface PageReading {
  title: string;
  composer: string;
  key: string;
  time: string;
  /** The tempo as printed ("Andante. M. 70"), or "". */
  tempo: string;
  lines: FoundLine[];
}

/* ---------- Reading one line ---------- */

/**
 * How every reader writes the markings and slurs printed with a line (src/solfa/expressions.ts reads them):
 * dynamics, hairpins, tempo changes and directions in braces before the note they start on, slurs in brackets.
 */
export const MARK_RULES = `- Markings printed over or under a part's row go in that row, in braces, just before the note they're printed over: dynamics \`{pp}\` \`{p}\` \`{mp}\` \`{mf}\` \`{f}\` \`{ff}\` \`{sfz}\`, \`{cresc}\` \`{dim}\`, a hairpin \`{<}\` or \`{>}\` before the note where the wedge starts, \`{rit}\` \`{rall}\` \`{accel}\` \`{a tempo}\`, and a tempo or direction as printed (\`{Andante M. 70}\`, \`{Maestoso}\`, \`{dolce}\`, \`{With feeling}\`), as in \`S  {p}d :r /m :f |\`. A tempo printed above the line goes before the top part's first note. Braces are not beats: they change no beat marks or bar lines.
- A slur (notes underlined, or joined by a curve: sung to one syllable) goes in round brackets from its first note to its last: \`(m'.d')\`, \`(s :f |m)\`. Brackets are not beats either.
- Copy only the marks and slurs that are printed.`;

export const LINE_SYSTEM = `You read one line of music from a picture of a tonic sol-fa choir sheet (typed or handwritten) and write it in SolfaScores' sol-fa text format. Copy exactly what is printed or written; never correct or improve the music.

The picture shows one line of music: one row of notes per part, top to bottom, often with rows of words between them. Give each row of notes, in the order given, with its part name.

SolfaScores' format:
- \`|\` is a bar line. Table borders and vertical lines between bars are bar lines. Don't start a row with \`|\`; end every row with \`|\`.
- \`:\` separates beats. The medium accent inside a bar (often typed as a short \`|\` or \`!\` within a table cell, or drawn as a short bar) is written \`/\`. So a 4-beat bar is \`d :r /m :f\`.
- Inside a beat, \`.\` splits it into halves and \`,\` splits a half into quarters: \`d.r\`, \`d.,r\`, \`d,r.m,f\`, \`.d\` (nothing in the first half). Three notes in one beat: \`d.r.m\`.
- \`-\` holds the note before it. A beat with nothing in it is a rest: leave it empty, as in \`d : :m\`. A printed \`x\` is a rest too: copy it. Keep \`-.\` and \`.-\` and similar exactly.
- Notes: d r m f s l t; raised de re fe se le; lowered ra ma lo ta (ba is written ta).
- Octave marks: a mark above or raised after the note (¹, ', a small raised figure or tick) means an octave up: write \`d'\`. A mark below or lowered (₁, a small lowered figure or tick, a comma right after the note) means an octave down: write \`t1\`. Two octaves: \`d''\` and \`s2\`.
- Bridge notes, where the key changes: a small note printed raised just before a note is that note's name in the old key. Write both joined by \`=\`, old first, each with its own octave marks: \`ˢd\` is \`s=d\`, \`ᵈ'f\` is \`d'=f\`, \`ᵐl₁\` is \`m=l1\`.
- A new key written with this line, above it or at its start (\`Key F\`, \`Doh is F\`, \`(F)\`, a key in a box), is given as \`key\`: the note's letter with any sharp or flat (\`F\`, \`B♭\`, \`F♯\`). An empty string if none is written there (the key in the sheet's heading isn't one). Write the bridge notes as well, where there are any.
- If the line begins with a column before its first bar line (an upbeat), write that column as the row's first bar: \`s | d :r /m :f |\`.
- Every row has the same number of bars, lined up with the rows above and below. A bar with nothing in it for a part is written with its empty beats, e.g. \` : : : \` for 4 beats.
${MARK_RULES}

Example of one line of four parts in 4/4:
S  s1 | d :-.r /m :d | f :m /r :- |
A  s1 | d :t1 /d :d | d :d /t1 :- |
T  m | m :s /s :m | l :s /s :- |
B  d | l1 :s1 /d :l1 | f1 :s1 /s1 :- |

With each row of notes, give the words printed under it, before the next part's row of notes; an empty string if there are none (on many sheets only the top part has words). On a sheet set in a table, a part's words are under its notes in every box: give them in order along the line. Write the words as syllables separated by spaces, with a hyphen after a syllable that runs on into the next (\`peo- ple\` is written \`peo-ple\`). Copy the words as written, in whatever language; the names of the notes (doh, re, mi) are never words. And list any bars you couldn't read with confidence (part and bar number, counting this line's bars from 1, the upbeat column included).`;

export const LINE_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          part: { type: 'string' },
          notes: { type: 'string', description: "The row in SolfaScores sol-fa, with printed markings in braces before their notes ({p}, {<}, {Andante M. 70}) and slurs in round brackets ((m'.d'))" },
          words: { type: 'string' },
        },
        required: ['part', 'notes', 'words'],
        additionalProperties: false,
      },
    },
    doubts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { part: { type: 'string' }, bar: { type: 'integer' } },
        required: ['part', 'bar'],
        additionalProperties: false,
      },
    },
    key: { type: 'string' },
  },
  required: ['rows', 'doubts', 'key'],
  additionalProperties: false,
};

export const CHECK_SYSTEM = `${LINE_SYSTEM}

A small model has already read this line; its reading comes with the picture. It is usually close, but check it bar by bar against the picture and correct every mistake: wrong or missing notes, octave marks, holds, rests, beat marks and bar lines. It usually leaves markings and slurs out: add the ones printed. Keep what it got right exactly as it is. List the bars you corrected or still can't read with confidence as doubts.`;

export const WORDS_LINE_SYSTEM = `You copy the words (lyrics) of one line of music from a picture of a tonic sol-fa choir sheet (typed or handwritten). The line's notes have been read already and come with the picture, one row per part, top to bottom; the words are printed under the parts' rows of notes.

For each part, in the order given, give the words printed under its row of notes, before the next part's row of notes; an empty string if there are none (on many sheets only the top part has words). On a sheet set in a table, a part's words are under its notes in every box: give them in order along the line. Write the words as syllables separated by spaces, with a hyphen after a syllable that runs on into the next (\`peo- ple\` is written \`peo-ple\`). Copy the words exactly as written, in whatever language, with their punctuation; never translate or correct them. The names of the notes (doh, re, mi) and the sol-fa itself are never words.

Also give as \`key\` a new key written with this line, above it or at its start (\`Key F\`, \`Doh is F\`, \`(F)\`, a key in a box): the note's letter with any sharp or flat (\`F\`, \`B♭\`, \`F♯\`). An empty string if none is written there (the key in the sheet's heading isn't one), and never a key written in the words.`;

export const WORDS_LINE_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { part: { type: 'string' }, words: { type: 'string' } },
        required: ['part', 'words'],
        additionalProperties: false,
      },
    },
    key: { type: 'string' },
  },
  required: ['rows', 'key'],
  additionalProperties: false,
};

/**
 * The words call when the line's marks are wanted as well (owner's request, 21 November 2026: the AI reads the
 * marks and slurs of every line, not only of the lines it reads): the rows of notes come back too, marked. One
 * call, not two. The app keeps them only if, marks and slurs aside, they're the notes it sent.
 */
export const WORDS_MARKS_SYSTEM = `${WORDS_LINE_SYSTEM}

Also give each part's row of notes back as it came, with the markings and slurs printed with it added, as follows. Change nothing else in the row: no note, octave mark, beat mark or bar line.
${MARK_RULES}`;

export const WORDS_MARKS_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { part: { type: 'string' }, words: { type: 'string' }, notes: { type: 'string' } },
        required: ['part', 'words', 'notes'],
        additionalProperties: false,
      },
    },
    key: { type: 'string' },
  },
  required: ['rows', 'key'],
  additionalProperties: false,
};

/**
 * The marks reading, for a typed sheet's line that reads right already (owner's request, 21 November 2026): its
 * rows come back with what's printed with them, nothing else changed. Cloudflare's reader first, Haiku if it
 * can't; the app keeps an answer only if, marks and slurs aside, it's the rows it sent.
 */
export const MARKS_SYSTEM = `You add the markings printed on one line of a tonic sol-fa choir sheet to its rows of notes, which have been read already and come with the picture, one row per part, top to bottom. Give every row back exactly as it came, adding only:
${MARK_RULES}
Never change, add or take out a note, octave mark, beat mark or bar line. If nothing is printed, give the rows back as they came.`;

export const MARKS_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: { type: 'object', properties: { part: { type: 'string' }, notes: { type: 'string' } }, required: ['part', 'notes'], additionalProperties: false },
    },
  },
  required: ['rows'],
  additionalProperties: false,
};

const MARKS_ANSWER = `Answer with only the rows, one per part, in order, each as the part name, two spaces and the notes. No other text.`;

export interface LineReading {
  /** The line in SolfaScores' format: one row per part, each with the words under it, if any. */
  text: string;
  /** Bars the reader wasn't sure of, to check first. */
  doubts: { part: string; bar: number }[];
  /** A new key written with the line ("F", "B♭"), if the reader saw one. */
  key?: string;
}

/**
 * A key as a reader gave it ("F", "Bb", "b flat", "F#"), as SolfaScores writes it ("F", "B♭", "F♯"); undefined if
 * it isn't one. For a key written partway through a song (owner's request, 20 November 2026).
 */
export function keyName(raw: unknown): string | undefined {
  const m = String(raw ?? '').match(/^\s*(?:key\s*:?\s*|doh\s*is\s*)?([A-Ga-g])\s*(#|♯|b|♭|-?\s*sharp|-?\s*flat)?\s*(?:major)?\s*$/i);
  if (!m) return undefined;
  const acc = (m[2] ?? '').replace(/[-\s]/g, '').toLowerCase();
  return m[1].toUpperCase() + (acc === '#' || acc === '♯' || acc === 'sharp' ? '♯' : acc === 'b' || acc === '♭' || acc === 'flat' ? '♭' : '');
}

/* ---------- Shaping the answers ---------- */

const PART_NAMES: Record<string, string> = { s: 'S', soprano: 'S', a: 'A', alto: 'A', t: 'T', tenor: 'T', b: 'B', bass: 'B', solo: 'Solo' };
/** "Soprano" or "s" → "S"; anything else unknown → null. */
export const partOf = (name: string): string | null => PART_NAMES[name.trim().toLowerCase()] ?? null;

/** Keeps boxes inside the picture, drops empty ones and puts them in reading order. */
export function cleanPage(raw: { title?: string; composer?: string; key?: string; time?: string; tempo?: string; lines?: (Partial<FoundLine> & { words_rows?: number })[] }, width: number, height: number): PageReading {
  const clamp = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const lines = (raw.lines ?? [])
    .map((l) => {
      const top = clamp(l.top, height);
      const bottom = clamp(l.bottom, height);
      const left = clamp(l.left, width);
      const right = clamp(l.right, width);
      const parts = (l.parts ?? []).map((p) => partOf(String(p))).filter((p): p is string => !!p);
      const words = Math.max(0, Math.min(6, Math.round(Number(l.words_rows) || 0)));
      return { top: Math.min(top, bottom), bottom: Math.max(top, bottom), left: Math.min(left, right), right: Math.max(left, right), parts: parts.length ? parts : ['S'], words };
    })
    .filter((l) => l.bottom - l.top >= 8 && l.right - l.left >= 24)
    .sort((a, b) => a.top - b.top);
  const one = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const time = one(raw.time).match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  return { title: one(raw.title), composer: one(raw.composer), key: one(raw.key).slice(0, 3), time: time ? `${time[1]}/${time[2]}` : '', tempo: tempoOf(one(raw.tempo)), lines };
}

/**
 * A row's markings in braces (`{p}`, `{Andante M. 70}`) tidied, so nothing in one can pass for a beat mark, a bar
 * line, a bridge note or a slur (`{♩ = 70}` is `{♩ 70}`, which still says 70 a minute); an empty one goes, and so
 * does a brace left open or never opened.
 */
export function tidyMarks(notes: string): string {
  return notes
    .replace(/\{([^{}]*)\}/g, (_, inner: string) => {
      const mark = inner.replace(/[|:/=¦()]/g, ' ').replace(/\s+/g, ' ').trim();
      return mark ? `\u0000${mark}\u0001` : ' ';
    })
    .replace(/[{}]/g, '')
    .replace(/\u0000/g, '{')
    .replace(/\u0001/g, '}');
}

/**
 * A row's slurs (round brackets around the notes sung to one syllable: `(m'.d')`, `(s :f |m)`) kept whole: a
 * bracket closing none, one opened inside another, one left open at the row's end, and a pair around no note go,
 * so the row still reads. (Brackets in a mark were taken out with `tidyMarks`.)
 */
export function tidySlurs(notes: string): string {
  const drop = new Set<number>();
  let open = -1;
  for (let k = 0; k < notes.length; k++) {
    const c = notes[k];
    if (c === '{') {
      const close = notes.indexOf('}', k);
      if (close > k) k = close;
    } else if (c === '(') {
      if (open >= 0) drop.add(k);
      else open = k;
    } else if (c === ')') {
      if (open < 0) drop.add(k);
      else {
        if (!/[a-z]/.test(notes.slice(open + 1, k).replace(/\{[^{}]*\}/g, '').replace(/x/g, ''))) drop.add(open).add(k);
        open = -1;
      }
    }
  }
  if (open >= 0) drop.add(open);
  return [...notes].map((c, k) => (drop.has(k) ? '' : c)).join('');
}

/** The reading as SolfaScores text: "S  d :r |", with the words under the first row. */
export function lineText(raw: { rows?: { part?: string; notes?: string; words?: string }[]; words?: string }, parts: string[]): string {
  const out: string[] = [];
  (raw.rows ?? []).forEach((row, i) => {
    const part = partOf(row.part ?? '') ?? parts[i] ?? `P${i + 1}`;
    let notes = tidySlurs(tidyMarks(row.notes ?? '')).replace(/\s+/g, ' ').trim().replace(/^\|\s*/, '');
    if (notes && !notes.endsWith('|')) notes += ' |';
    out.push(`${part.padEnd(2)} ${notes}`);
    // Each part's own words (Claude), or one row of words for the line under the first part (Cloudflare's reader).
    // (A marking or a slur's bracket copied into the words belongs with the notes, not sung: it goes.)
    const words = (row.words ?? (i === 0 ? raw.words : '') ?? '').replace(/\{[^{}]*\}/g, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (words) out.push(`W  ${words}`);
  });
  return out.join('\n');
}

/* ---------- Asking Cloudflare's reader (Workers AI) ---------- */

/**
 * On the 57 test lines, Mistral Small 3.1 corrected 5 of the 12 lines that
 * failed the checker and broke none, when only failing lines were sent and
 * its answer kept only if it passed. Gemma 4, Llama 4 Scout and Qwen 3.8 did
 * worse, and every model broke lines that were already right, so the app
 * never sends it a line that passes. It read 79% of words right.
 */
const CLOUDFLARE = '@cf/mistralai/mistral-small-3.1-24b-instruct';

const FIX_ANSWER = `Answer with only the corrected line: one row per part, in order, each as the part name, two spaces and the notes with their markings and slurs (for example \`S  s1 | d :-.r /m :d |\`), then a row \`W  \` and the words. No other text.`;
const WORDS_PROMPT = `This picture is one row of words (the lyrics) from a tonic sol-fa choir sheet. Copy the words exactly as printed, left to right, keeping hyphens between syllables. Leave out a part's name printed at the left edge (S, A, T, B, Soprano...) and bar numbers. Answer with only those words, nothing else. If there are no words, answer with nothing.`;

/** Whether each reader can be used: the app tries them in this order. */
export function scanReaders(env: Env): { cloudflare: boolean; anthropic: boolean } {
  return { cloudflare: !!env.AI, anthropic: !!env.ANTHROPIC_API_KEY };
}

async function askCloudflare(env: Env, image: ArrayBuffer, type: ImageType, prompt: string, system: string | null, maxTokens: number): Promise<string> {
  if (!env.AI) throw new AppError(503, 'The AI reader isn’t switched on.');
  const content = [
    { type: 'image_url', image_url: { url: `data:${type};base64,${base64(image)}` } },
    { type: 'text', text: prompt },
  ];
  const input = { messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }], max_tokens: maxTokens, temperature: 0 };
  let out: { choices?: { message?: { content?: string } }[]; response?: string };
  try {
    out = (await (env.AI.run as (model: string, input: unknown) => Promise<unknown>)(CLOUDFLARE, input)) as typeof out;
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    console.error('scan: Cloudflare reader failed', message);
    // The free daily allowance of Workers AI (on the Workers Free plan, calls stop there). Not a 429: that
    // means SolfaScores' own allowance is used up, and the app stops reading; this one only skips this reader.
    if (/4006|daily free allocation|neurons/i.test(message)) throw new AppError(503, 'Today’s free AI reading is used up. Check the rest of the lines by eye, or try tomorrow.');
    throw new AppError(503, 'The AI reader is busy or out of reach. Try again in a minute.');
  }
  return (out?.choices?.[0]?.message?.content ?? out?.response ?? '').trim();
}

/** Cloudflare's reader's answer, rows as "S  d :r |" and "W  words", as a line in SolfaScores' format. */
export function rowsAnswer(answer: string, parts: string[]): string {
  const rows: { part: string; notes: string }[] = [];
  let words = '';
  // A tempo given on a row of its own above the line ("{Andante M. 70}") goes before the top part's first note.
  let above = '';
  for (const raw of answer.split('\n')) {
    const line = raw.trim().replace(/^`+|`+$/g, '');
    if (!rows.length && /^(?:\{[^{}]*\}\s*)+$/.test(line)) above += line;
    const m = line.match(/^(Solo|Soprano|Alto|Tenor|Bass|S|A|T|B|W)\b[:.]?\s*(.*)$/i);
    if (!m) continue;
    if (m[1].toUpperCase() === 'W') words ||= m[2].trim();
    else if (rows.length < parts.length) rows.push({ part: m[1], notes: rows.length ? m[2] : above + m[2] });
  }
  return lineText({ rows, words }, parts);
}

/**
 * A line's rows of notes as a reader gave them back with their marks, in the parts' order: marks and slurs tidied,
 * nothing else touched (no bar line added, so the app can compare them with the rows it sent).
 */
export function markedRows(rows: { part?: string; notes?: string }[] | undefined, parts: string[]): string {
  return (rows ?? [])
    .slice(0, parts.length)
    .map((row, i) => `${(parts[i] ?? `P${i + 1}`).padEnd(2)} ${tidySlurs(tidyMarks(row.notes ?? '')).replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

/** Cloudflare's reader's answer to the marks reading, rows as "S  {p}d :r |", in the parts' order. */
export function marksAnswer(answer: string, parts: string[]): string {
  const rows: { notes: string }[] = [];
  for (const raw of answer.split('\n')) {
    const m = raw
      .trim()
      .replace(/^`+|`+$/g, '')
      .match(/^(Solo|Soprano|Alto|Tenor|Bass|S|A|T|B|P\d+)\b[:.]?\s*(.*)$/i);
    if (m && rows.length < parts.length) rows.push({ notes: m[2] });
  }
  return markedRows(rows, parts);
}

/** Corrects a line SolfaScores' own model read that fails SolfaScores' checker (Cloudflare's reader). */
export async function fixLine(env: Env, image: ArrayBuffer, type: ImageType, opts: { parts: string[]; time?: string; key?: string; draft: string }): Promise<LineReading> {
  const beats = opts.time?.split('/')[0];
  const prompt = [
    `Parts, top to bottom: ${opts.parts.join(', ')}.`,
    opts.time ? `Time ${opts.time}: ${beats} beats in a full bar.` : '',
    opts.key ? `Doh is ${opts.key}.` : '',
    `A small model read the line as:\n${opts.draft}`,
  ]
    .filter(Boolean)
    .join(' ');
  const answer = await askCloudflare(env, image, type, prompt, `${CHECK_SYSTEM}\n\n${FIX_ANSWER}`, 2500);
  const text = rowsAnswer(answer, opts.parts);
  if (!text.trim()) throw new AppError(422, 'This line couldn’t be read. Check it by eye.');
  return { text, doubts: [] };
}

/** A row of words, as printed (Cloudflare's reader): "All peo-ple that on earth". */
export async function readWords(env: Env, image: ArrayBuffer, type: ImageType): Promise<string> {
  const answer = await askCloudflare(env, image, type, WORDS_PROMPT, null, 400);
  return answer
    .split('\n')[0]
    .replace(/^["“'`]+|["”'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // A part's name read from the left edge anyway ("S Blessing and honour"); a lone "A" may be a word, so it stays.
    .replace(/^(?:Soprano|Sop\.?|Tenor|Ten\.?|Bass|S|T|B)[.:]?\s+(?=\S)/, '')
    .slice(0, 400);
}

const HEADING_PROMPT = `This picture is the top of a tonic sol-fa choir sheet, above the music (the first row of the music may show at the bottom). Copy what is written there, in exactly these five lines:
Title: the song's title
Composer: who wrote or arranged it
Key: the key, as written (for example "Doh is G" or "Key F")
Time: the time signature, as written (for example 3/4, 4/4, 6/8, 2/4 or C)
Tempo: the speed or mood, as written (for example "Andante. M. 70", "Maestoso", "With feeling" or "♩ = 72")
Leave the rest of a line empty if that isn't written on the sheet. No other text.`;

/** A sheet's heading as read: what's missing is "". */
export interface Heading {
  title: string;
  composer: string;
  /** The key's note, as "G", "B♭" or "F♯". */
  key: string;
  /** As "3/4". */
  time: string;
  /** The tempo as printed: "Larghetto, M. 79", "Andante. M. 70", "Allegro". */
  tempo: string;
}

/** A metronome mark: "M. 70", "M.M. 70", "MM = 70", "M = 70", "♩ = 70", and "J = 72" (a ♩ read as a J). */
const METRONOME = String.raw`(?:\bM\.\s*M\.?|\bMM\b\.?|\bM\.|\bM(?=\s*=)|♩|𝅘𝅥|\bJ(?=\s*=))\s*=?\s*\d{2,3}(?!\d)`;
/** A tempo word SolfaScores knows the speed of (src/solfa/expressions.ts), and a second one after it ("Allegro moderato"). */
const TEMPO_WORD = `\\b(?:${Object.keys(TEMPO_WORDS).join('|')})\\b(?:\\s+(?:${Object.keys(TEMPO_WORDS).join('|')})\\b)?`;
const TEMPO_PRINTED = new RegExp(`${TEMPO_WORD}(?:[\\s.,;:(–—-]{0,4}${METRONOME})?|${METRONOME}`, 'i');

/** Directions about who sings, not how fast or in what mood: never a heading's tempo. */
const NOT_TEMPO = /^(?:tutti|solo|unison|unis|hum|humming|molto|poco)\.?$/i;

/**
 * The tempo as printed, from the first of `texts` that has one: a tempo word ("Andante", "Allegro moderato"),
 * a metronome mark ("M. 70", "♩ = 72"), or both ("Larghetto, M. 79"); "" if none. The first text, the reader's
 * own Tempo line, may also be a direction with no set speed, as printed ("Maestoso", "Slowly", "With feeling":
 * owner's request, 21 November 2026), which the song's `tempo:` line keeps as words. Only what SolfaScores
 * knows (src/solfa/expressions.ts), so a reader's guess ("Joyful", "4/4") isn't taken for one.
 */
export function tempoOf(...texts: string[]): string {
  const own = (texts[0] ?? '').trim().replace(/^\((.*)\)$/, '$1').replace(/[\s,;:]+$/, '');
  const said = own.length <= 60 ? readExpression(own) : null;
  if (said && (said.kind === 'tempo' || (said.kind === 'direction' && !NOT_TEMPO.test(own)))) return own.replace(/\bJ(\s*=)/, '♩$1');
  for (const text of texts) {
    const m = (text ?? '').match(TEMPO_PRINTED);
    if (!m) continue;
    let t = m[0].replace(/[\s.,;:(–—-]+$/, '').replace(/\bJ(\s*=)/, '♩$1');
    if (t.includes('(') && !t.includes(')')) t += ')';
    return t.slice(0, 60);
  }
  return '';
}

/** "Key", "Doh is" and the like, then the key's note standing alone ("Key: by Jude" has none). */
const KEY_NOTE = /(?:\b[Kk][Ee][Yy]\b|\b[Dd][Oo][Hh]?\b)\s*(?:of|is|=|:)?\s*(?:[Dd][Oo][Hh]?\s*(?:is|=)\s*)?([A-Ga-g])\s*(#|♯|b|♭|-?\s*sharp|-?\s*flat)?(?![A-Za-z])/;

/** The key's note from what was read: "Key Ab", "Doh is B♭", "Key: Doh is F", or a bare "E flat" on the key's own line. */
export function keyOf(answer: string, keyLine: string): string {
  const m = answer.match(KEY_NOTE) ?? keyLine.match(/^\s*([A-G])\s*(#|♯|b|♭|-?\s*sharp|-?\s*flat)?(?![A-Za-z])/);
  if (!m) return '';
  const acc = (m[2] ?? '').replace(/[\s-]/g, '').toLowerCase();
  return m[1].toUpperCase() + (acc === '#' || acc === '♯' || acc === 'sharp' ? '♯' : acc === 'b' || acc === '♭' || acc === 'flat' ? '♭' : '');
}

/** The time signature from what was read, wherever it is ("Key Eb 4/4", "Time: 3/4", "common time"). */
export function timeOf(answer: string): string {
  const m = answer.replace(/\u2044/g, '/').match(/(?<![\d/])(2|3|4|6|9|12)\s*\/\s*(2|4|8)(?![\d/])/);
  if (m) return `${m[1]}/${m[2]}`;
  return /common time|\btime:\s*c\b/i.test(answer) ? '4/4' : '';
}

/**
 * A sheet's heading (title, composer, key, time, tempo) from a picture of the top
 * of its first page, with Cloudflare's reader. On 51 handwritten pages it
 * found the time on 28 (all right; the rest are written stacked or faint)
 * and the key on 37 of 50 (one wrong).
 */
export async function readHeading(env: Env, image: ArrayBuffer, type: ImageType): Promise<Heading> {
  const answer = await askCloudflare(env, image, type, HEADING_PROMPT, null, 200);
  const line = (name: string) => (answer.match(new RegExp(`^\\s*\\**${name}\\**\\s*:\\s*(.*)$`, 'im'))?.[1] ?? '').replace(/^["“'`*]+|["”'`*]+$/g, '').trim();
  const clean = (t: string) => (/^(?:none|n\/a|-|unknown|not (?:written|shown|given))\.?$/i.test(t) ? '' : t.slice(0, 120));
  // The tempo on its own line, or put with the key or the time ("Key: G 3/4 moderato"); never from the title.
  return { title: clean(line('Title')), composer: clean(line('Composer')), key: keyOf(answer, line('Key')), time: timeOf(answer), tempo: tempoOf(line('Tempo'), line('Key'), line('Time')) };
}

/* ---------- Asking Claude ---------- */

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function ask(env: Env, model: string, system: string, schema: Record<string, unknown>, image: ArrayBuffer, type: ImageType, prompt: string, effort: 'low' | 'medium' = 'medium', maxTokens = 16000): Promise<unknown> {
  if (!env.ANTHROPIC_API_KEY) throw new AppError(503, 'The AI reader isn’t switched on for scanning.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 2 });
  let message;
  try {
    message = await client.messages.create({
      model,
      // Room for its thinking as well as the answer: a reply cut short isn't valid JSON.
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: base64(image) } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
  } catch (e) {
    console.error('scan: reader failed', e);
    throw new AppError(503, 'The reader is busy or out of reach. Try again in a minute.');
  }
  const text = message.content.find((b) => b.type === 'text');
  if (message.stop_reason === 'refusal' || !text || text.type !== 'text') throw new AppError(422, 'This picture couldn’t be read. Try a clearer photo of the sheet.');
  try {
    return JSON.parse(text.text);
  } catch {
    throw new AppError(422, 'This picture couldn’t be read. Try again.');
  }
}

/** Refuses straight away when Claude has no key, before anything is counted. */
export function scanningReady(env: Env): void {
  if (!env.ANTHROPIC_API_KEY) throw new AppError(503, 'The AI reader isn’t switched on for scanning.');
}

/** Refuses straight away when Cloudflare's reader isn't there, before anything is counted. */
export function cloudflareReady(env: Env): void {
  if (!env.AI) throw new AppError(503, 'The AI reader isn’t switched on.');
}

export function checkImage(type: string, bytes: number): ImageType {
  if (!(IMAGE_TYPES as readonly string[]).includes(type)) throw badRequest('Send a picture (JPEG, PNG or WebP).');
  if (!bytes) throw badRequest('That picture is empty.');
  if (bytes > MAX_IMAGE_BYTES) throw badRequest('That picture is over 5 MB. Send a smaller one.');
  return type as ImageType;
}

/** Where the lines of music are on a page, and its heading. */
export async function readPage(env: Env, image: ArrayBuffer, type: ImageType, width: number, height: number): Promise<PageReading> {
  // Haiku finds the lines as well as Opus did on the owner's sheets (abu-reader/README.md), for a twentieth of the cost.
  const raw = await ask(env, CHEAP, PAGE_SYSTEM, PAGE_SCHEMA, image, type, `The image is ${width} by ${height} pixels.`);
  return cleanPage(raw as Parameters<typeof cleanPage>[0], width, height);
}

/** One line of music, read into SolfaScores sol-fa. */
export async function readLine(env: Env, image: ArrayBuffer, type: ImageType, opts: { parts: string[]; time?: string; key?: string }): Promise<LineReading> {
  const beats = opts.time?.split('/')[0];
  const prompt = [
    `Parts, top to bottom: ${opts.parts.join(', ')}.`,
    opts.time ? `Time ${opts.time}: ${beats} beats in a full bar.` : '',
    opts.key ? `Doh is ${opts.key}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const raw = (await ask(env, STRONG, LINE_SYSTEM, LINE_SCHEMA, image, type, prompt)) as { rows?: { part?: string; notes?: string; words?: string }[]; words?: string; doubts?: { part?: string; bar?: number }[]; key?: string };
  return shapeReading(raw, opts.parts);
}

/**
 * A line's words, each part's (Opus, at low effort: copying words needs little thought), given its notes as
 * read. For a handwritten sheet's lines that add up without Opus: Cloudflare's reader reads handwritten words
 * poorly (owner's call, 20 November 2026). `after` is the part's place in `parts` (0 for the first). Also a new
 * key written with the line, if there's one, as SolfaScores' own reader reads only notes.
 */
export async function readLineWords(
  env: Env,
  image: ArrayBuffer,
  type: ImageType,
  opts: { parts: string[]; notes: string; marks?: boolean },
): Promise<{ words: { after: number; text: string }[]; key?: string; notes?: string }> {
  const prompt = `Parts, top to bottom: ${opts.parts.join(', ')}. The line's notes as read:\n${opts.notes}`;
  const [system, schema] = opts.marks ? [WORDS_MARKS_SYSTEM, WORDS_MARKS_SCHEMA] : [WORDS_LINE_SYSTEM, WORDS_LINE_SCHEMA];
  const raw = (await ask(env, STRONG, system, schema, image, type, prompt, 'low')) as { rows?: { part?: string; words?: string; notes?: string }[]; key?: string };
  const words: { after: number; text: string }[] = [];
  (raw.rows ?? []).forEach((row, i) => {
    const at = opts.parts.indexOf(partOf(row.part ?? '') ?? '');
    const text = (row.words ?? '').replace(/\s+/g, ' ').trim();
    if (text) words.push({ after: at >= 0 ? at : Math.min(i, opts.parts.length - 1), text });
  });
  const key = keyName(raw.key);
  // With the marks asked for: the rows of notes back, marked (the app checks they're the notes it sent).
  const notes = opts.marks && raw.rows?.some((r) => r.notes?.trim()) ? markedRows(raw.rows, opts.parts) : '';
  return { words, ...(key ? { key } : {}), ...(notes ? { notes } : {}) };
}

/**
 * The marks and slurs printed with a line that reads right already, added to its rows (`notes`): Cloudflare's
 * reader, or Haiku (`by: 'claude'`, at low effort) when Cloudflare's can't. The rows come back as "S  {p}d :r |";
 * the app keeps them only if, marks and slurs aside, they're the rows it sent.
 */
export async function readMarks(env: Env, image: ArrayBuffer, type: ImageType, opts: { parts: string[]; notes: string; by: 'cloudflare' | 'claude' }): Promise<{ text: string }> {
  const prompt = `Parts, top to bottom: ${opts.parts.join(', ')}. The line's rows as read:\n${opts.notes}`;
  let text: string;
  if (opts.by === 'claude') {
    const raw = (await ask(env, CHEAP, MARKS_SYSTEM, MARKS_SCHEMA, image, type, prompt, 'low', 4000)) as { rows?: { part?: string; notes?: string }[] };
    text = markedRows(raw.rows, opts.parts);
  } else {
    // The rows and the few marks added: about a token for every one or two characters.
    text = marksAnswer(await askCloudflare(env, image, type, prompt, `${MARKS_SYSTEM}\n\n${MARKS_ANSWER}`, Math.min(1500, 150 + Math.ceil(opts.notes.length / 1.5))), opts.parts);
  }
  if (!text.trim()) throw new AppError(422, 'No marks could be read for this line.');
  return { text };
}

/** Checks the reading SolfaScores' own model made of a line against its picture (Haiku), fixing what it got wrong. */
export async function checkLine(env: Env, image: ArrayBuffer, type: ImageType, opts: { parts: string[]; time?: string; key?: string; draft: string }): Promise<LineReading> {
  const beats = opts.time?.split('/')[0];
  const prompt = [
    `Parts, top to bottom: ${opts.parts.join(', ')}.`,
    opts.time ? `Time ${opts.time}: ${beats} beats in a full bar.` : '',
    opts.key ? `Doh is ${opts.key}.` : '',
    `A small model read the line as:\n${opts.draft}`,
  ]
    .filter(Boolean)
    .join(' ');
  const raw = (await ask(env, CHEAP, CHECK_SYSTEM, LINE_SCHEMA, image, type, prompt)) as { rows?: { part?: string; notes?: string; words?: string }[]; words?: string; doubts?: { part?: string; bar?: number }[]; key?: string };
  return shapeReading(raw, opts.parts);
}

function shapeReading(raw: { rows?: { part?: string; notes?: string; words?: string }[]; words?: string; doubts?: { part?: string; bar?: number }[]; key?: string }, parts: string[]): LineReading {
  const key = keyName(raw.key);
  return {
    text: lineText(raw, parts),
    doubts: (raw.doubts ?? [])
      .map((d) => ({ part: partOf(d.part ?? '') ?? '', bar: Math.round(Number(d.bar) || 0) }))
      .filter((d) => d.part && d.bar > 0),
    ...(key ? { key } : {}),
  };
}
