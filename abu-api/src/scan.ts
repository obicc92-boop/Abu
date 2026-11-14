/**
 * The AI help for scanning sheets (see docs/scan-plan.md), used only where the
 * app can't do the job itself. The app reads typed PDFs from their own text
 * and finds and reads lines in pictures with Abụ's own model, in the browser.
 * Then, only for a line that still fails Abụ's checker:
 *
 * 1. Cloudflare's own reader (Workers AI, Mistral Small 3.1) corrects it. It
 *    also reads rows of words in pictures, which Abụ's model can't.
 * 2. Claude, only if the Worker has an Anthropic key: Haiku checks the line,
 *    and Opus reads it from scratch if that still fails. Haiku can also find
 *    the lines on a page the app couldn't.
 *
 * Measured in abu-reader/README.md. Claude answers in JSON to a fixed schema;
 * Cloudflare's reader answers in Abụ's own rows.
 */
import Anthropic from '@anthropic-ai/sdk';

import { AppError, badRequest } from './errors';

/** The strong reader: reads a line from scratch, for lines the cheaper path can't get right. */
const STRONG = 'claude-opus-5-5';
/** The cheap one: finds the lines on a page, and checks the reading Abụ's own model made of a line. */
const CHEAP = 'claude-haiku-5-5';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
/** Claude takes pictures up to 5 MB; the app sends far smaller ones. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/* ---------- Finding the lines on a page ---------- */

const PAGE_SYSTEM = `You look at a page of a tonic sol-fa choir sheet (typed or handwritten, often in a table) and find each line of music on it, so each line can be cut out and read on its own.

A line of music is one system: the rows of notes for all the parts sung together, side by side in time, with any rows of words between or under them. Sheets often stack 4 rows of notes (soprano, alto, tenor, bass, top to bottom) with words under the first row; some have 1, 2, 3 or 5 rows (a solo row on top). Several lines of music follow each other down the page; a table's horizontal rules or a gap usually separate them.

For each line of music, in reading order, give its box in pixels of this image: top (just above the first row of notes, including raised octave marks), bottom (just below its last row, including lowered octave marks and its last words row), left and right (including a first column with an upbeat and the table borders). Boxes of different lines must not overlap. Also give the parts of its rows of notes, top to bottom, as S, A, T, B or Solo, and how many rows of words it has.

Also read the heading if there is one: title, composer or arranger, the key (from "Doh is ...", "Key ...") as a note name such as Ab or F#, and the time (such as 4/4) if printed. Use an empty string for anything not printed. Leave out headings, verses printed as text, footers and anything that isn't a line of sol-fa.`;

const PAGE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    composer: { type: 'string' },
    key: { type: 'string' },
    time: { type: 'string' },
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
  required: ['title', 'composer', 'key', 'time', 'lines'],
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
  lines: FoundLine[];
}

/* ---------- Reading one line ---------- */

export const LINE_SYSTEM = `You read one line of music from a picture of a tonic sol-fa choir sheet (typed or handwritten) and write it in Abụ's sol-fa text format. Copy exactly what is printed or written; never correct or improve the music.

The picture shows one line of music: one row of notes per part, top to bottom, often with rows of words between them. Give each row of notes, in the order given, with its part name.

Abụ's format:
- \`|\` is a bar line. Table borders and vertical lines between bars are bar lines. Don't start a row with \`|\`; end every row with \`|\`.
- \`:\` separates beats. The medium accent inside a bar (often typed as a short \`|\` or \`!\` within a table cell, or drawn as a short bar) is written \`/\`. So a 4-beat bar is \`d :r /m :f\`.
- Inside a beat, \`.\` splits it into halves and \`,\` splits a half into quarters: \`d.r\`, \`d.,r\`, \`d,r.m,f\`, \`.d\` (nothing in the first half). Three notes in one beat: \`d.r.m\`.
- \`-\` holds the note before it. A beat with nothing in it is a rest: leave it empty, as in \`d : :m\`. A printed \`x\` is a rest too: copy it. Keep \`-.\` and \`.-\` and similar exactly.
- Notes: d r m f s l t; raised de re fe se le; lowered ra ma lo ta (ba is written ta).
- Octave marks: a mark above or raised after the note (¹, ', a small raised figure or tick) means an octave up: write \`d'\`. A mark below or lowered (₁, a small lowered figure or tick, a comma right after the note) means an octave down: write \`t1\`. Two octaves: \`d''\` and \`s2\`.
- Bridge notes, where the key changes: a small note printed raised just before a note is that note's name in the old key. Write both joined by \`=\`, old first, each with its own octave marks: \`ˢd\` is \`s=d\`, \`ᵈ'f\` is \`d'=f\`, \`ᵐl₁\` is \`m=l1\`.
- If the line begins with a column before its first bar line (an upbeat), write that column as the row's first bar: \`s | d :r /m :f |\`.
- Every row has the same number of bars, lined up with the rows above and below. A bar with nothing in it for a part is written with its empty beats, e.g. \` : : : \` for 4 beats.

Example of one line of four parts in 4/4:
S  s1 | d :-.r /m :d | f :m /r :- |
A  s1 | d :t1 /d :d | d :d /t1 :- |
T  m | m :s /s :m | l :s /s :- |
B  d | l1 :s1 /d :l1 | f1 :s1 /s1 :- |

Also give the words printed under the top row of notes (or the first row of words), as syllables separated by spaces, with a hyphen after a syllable that runs on into the next (\`peo- ple\` is written \`peo-ple\`); an empty string if there are none. And list any bars you couldn't read with confidence (part and bar number, counting this line's bars from 1, the upbeat column included).`;

export const LINE_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { part: { type: 'string' }, notes: { type: 'string' } },
        required: ['part', 'notes'],
        additionalProperties: false,
      },
    },
    words: { type: 'string' },
    doubts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { part: { type: 'string' }, bar: { type: 'integer' } },
        required: ['part', 'bar'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows', 'words', 'doubts'],
  additionalProperties: false,
};

export const CHECK_SYSTEM = `${LINE_SYSTEM}

A small model has already read this line; its reading comes with the picture. It is usually close, but check it bar by bar against the picture and correct every mistake: wrong or missing notes, octave marks, holds, rests, beat marks and bar lines. Keep what it got right exactly as it is. List the bars you corrected or still can't read with confidence as doubts.`;

export interface LineReading {
  /** The line in Abụ's format: one row per part, the words under the first. */
  text: string;
  /** Bars the reader wasn't sure of, to check first. */
  doubts: { part: string; bar: number }[];
}

/* ---------- Shaping the answers ---------- */

const PART_NAMES: Record<string, string> = { s: 'S', soprano: 'S', a: 'A', alto: 'A', t: 'T', tenor: 'T', b: 'B', bass: 'B', solo: 'Solo' };
/** "Soprano" or "s" → "S"; anything else unknown → null. */
export const partOf = (name: string): string | null => PART_NAMES[name.trim().toLowerCase()] ?? null;

/** Keeps boxes inside the picture, drops empty ones and puts them in reading order. */
export function cleanPage(raw: { title?: string; composer?: string; key?: string; time?: string; lines?: (Partial<FoundLine> & { words_rows?: number })[] }, width: number, height: number): PageReading {
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
  return { title: one(raw.title), composer: one(raw.composer), key: one(raw.key).slice(0, 3), time: time ? `${time[1]}/${time[2]}` : '', lines };
}

/** The reading as Abụ text: "S  d :r |", with the words under the first row. */
export function lineText(raw: { rows?: { part?: string; notes?: string }[]; words?: string }, parts: string[]): string {
  const out: string[] = [];
  (raw.rows ?? []).forEach((row, i) => {
    const part = partOf(row.part ?? '') ?? parts[i] ?? `P${i + 1}`;
    let notes = (row.notes ?? '').replace(/\s+/g, ' ').trim().replace(/^\|\s*/, '');
    if (notes && !notes.endsWith('|')) notes += ' |';
    out.push(`${part.padEnd(2)} ${notes}`);
    const words = (raw.words ?? '').replace(/\s+/g, ' ').trim();
    if (i === 0 && words) out.push(`W  ${words}`);
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

const FIX_ANSWER = `Answer with only the corrected line: one row per part, in order, each as the part name, two spaces and the notes (for example \`S  s1 | d :-.r /m :d |\`), then a row \`W  \` and the words. No other text.`;
const WORDS_PROMPT = `This picture is one row of words (the lyrics) from a tonic sol-fa choir sheet. Copy the words exactly as printed, left to right, keeping hyphens between syllables. Leave out a part's name printed at the left edge (S, A, T, B, Soprano...) and bar numbers. Answer with only those words, nothing else. If there are no words, answer with nothing.`;

/** Whether each reader can be used: the app tries them in this order. */
export function scanReaders(env: Env): { cloudflare: boolean; anthropic: boolean } {
  return { cloudflare: !!env.AI, anthropic: !!env.ANTHROPIC_API_KEY };
}

async function askCloudflare(env: Env, image: ArrayBuffer, type: ImageType, prompt: string, system: string | null, maxTokens: number): Promise<string> {
  if (!env.AI) throw new AppError(503, 'Cloudflare’s reader isn’t switched on.');
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
    // means Abụ's own allowance is used up, and the app stops reading; this one only skips this reader.
    if (/4006|daily free allocation|neurons/i.test(message)) throw new AppError(503, 'Today’s free AI reading is used up. Check the rest of the lines by eye, or try tomorrow.');
    throw new AppError(503, 'Cloudflare’s reader is busy or out of reach. Try again in a minute.');
  }
  return (out?.choices?.[0]?.message?.content ?? out?.response ?? '').trim();
}

/** Cloudflare's reader's answer, rows as "S  d :r |" and "W  words", as a line in Abụ's format. */
export function rowsAnswer(answer: string, parts: string[]): string {
  const rows: { part: string; notes: string }[] = [];
  let words = '';
  for (const raw of answer.split('\n')) {
    const m = raw
      .trim()
      .replace(/^`+|`+$/g, '')
      .match(/^(Solo|Soprano|Alto|Tenor|Bass|S|A|T|B|W)\b[:.]?\s*(.*)$/i);
    if (!m) continue;
    if (m[1].toUpperCase() === 'W') words ||= m[2].trim();
    else if (rows.length < parts.length) rows.push({ part: m[1], notes: m[2] });
  }
  return lineText({ rows, words }, parts);
}

/** Corrects a line Abụ's own model read that fails Abụ's checker (Cloudflare's reader). */
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

/* ---------- Asking Claude ---------- */

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function ask(env: Env, model: string, system: string, schema: Record<string, unknown>, image: ArrayBuffer, type: ImageType, prompt: string): Promise<unknown> {
  if (!env.ANTHROPIC_API_KEY) throw new AppError(503, 'Claude isn’t switched on for scanning.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 2 });
  let message;
  try {
    message = await client.messages.create({
      model,
      // Room for its thinking as well as the answer: a reply cut short isn't valid JSON.
      max_tokens: 16000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
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
  if (!env.ANTHROPIC_API_KEY) throw new AppError(503, 'Claude isn’t switched on for scanning.');
}

/** Refuses straight away when Cloudflare's reader isn't there, before anything is counted. */
export function cloudflareReady(env: Env): void {
  if (!env.AI) throw new AppError(503, 'Cloudflare’s reader isn’t switched on.');
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

/** One line of music, read into Abụ sol-fa. */
export async function readLine(env: Env, image: ArrayBuffer, type: ImageType, opts: { parts: string[]; time?: string; key?: string }): Promise<LineReading> {
  const beats = opts.time?.split('/')[0];
  const prompt = [
    `Parts, top to bottom: ${opts.parts.join(', ')}.`,
    opts.time ? `Time ${opts.time}: ${beats} beats in a full bar.` : '',
    opts.key ? `Doh is ${opts.key}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const raw = (await ask(env, STRONG, LINE_SYSTEM, LINE_SCHEMA, image, type, prompt)) as { rows?: { part?: string; notes?: string }[]; words?: string; doubts?: { part?: string; bar?: number }[] };
  return shapeReading(raw, opts.parts);
}

/** Checks the reading Abụ's own model made of a line against its picture (Haiku), fixing what it got wrong. */
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
  const raw = (await ask(env, CHEAP, CHECK_SYSTEM, LINE_SCHEMA, image, type, prompt)) as { rows?: { part?: string; notes?: string }[]; words?: string; doubts?: { part?: string; bar?: number }[] };
  return shapeReading(raw, opts.parts);
}

function shapeReading(raw: { rows?: { part?: string; notes?: string }[]; words?: string; doubts?: { part?: string; bar?: number }[] }, parts: string[]): LineReading {
  return {
    text: lineText(raw, parts),
    doubts: (raw.doubts ?? [])
      .map((d) => ({ part: partOf(d.part ?? '') ?? '', bar: Math.round(Number(d.bar) || 0) }))
      .filter((d) => d.part && d.bar > 0),
  };
}
