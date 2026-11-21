/**
 * Which bars of a scanned line don't add up, and where they are in each row
 * as shown, so Check the reading can mark each one and show its beats: the
 * person counts them against the time and the other parts.
 */
import { normalizePart, type Issue } from '@/solfa';

import type { LineRow } from './line-text';

/** One bar of a row, by the columns of the row as shown. */
export interface BarSpan {
  /** Its number in its part, from 1, as the checker counts (an empty piece before the first "|" or after the last isn't a bar). */
  bar: number;
  /** The column of the bar line before it, or -1 when it starts the row. */
  from: number;
  /** The column of the bar line after it, or where the row's text ends when none closes it. */
  to: number;
  /** Whether a bar line closes it. */
  closed: boolean;
  /** The column of its first character that isn't a space. */
  first: number;
  /** Its beats, counted as the checker counts them. */
  beats: number;
}

/** A bar as the checker found it. */
export interface BarMark extends BarSpan {
  /** The checker found a problem in this bar (its beats, or a note it can't read). */
  bad: boolean;
  /** The problem is its beats: too many, or too few where only a first or last bar may be short. */
  wrongBeats: boolean;
}

export interface RowCheck {
  /** A part's bars, left to right; none for a row of words. */
  bars: BarMark[];
  /** A problem with the part as a whole, not one bar: more or fewer bars, or beats, than most parts. */
  whole: boolean;
}

/** Marks like "{ds}", which the checker takes out before it reads a bar. */
const MARK = /\{[^}]*\}/g;
const BAR_LINE = /[|‖]/;
const BEAT_MARK = /[:/¦]/;

/**
 * A row's bars, with the columns each spans in `text` (the row as shown,
 * spaces and all) and its beats, numbered from `firstBar`. Pieces with
 * nothing in them aren't bars, as for the checker: the space before an
 * opening "|", after a closing one, or between two "|".
 */
export function barSpans(text: string, firstBar = 1): BarSpan[] {
  const out: BarSpan[] = [];
  const end = text.trimEnd().length;
  let from = -1;
  for (let k = 0; k <= text.length; k++) {
    // A mark ({p}, {Andante M. 70}) is passed over whole: nothing in it is a bar line.
    if (text[k] === '{') {
      const close = text.indexOf('}', k);
      if (close > k && !text.slice(k + 1, close).includes('{')) {
        k = close;
        continue;
      }
    }
    const atLine = k < text.length && BAR_LINE.test(text[k]);
    if (!atLine && k < text.length) continue;
    const piece = text.slice(from + 1, k);
    const notes = piece.replace(MARK, ' ');
    if (notes.trim()) {
      out.push({
        bar: firstBar + out.length,
        from,
        to: atLine ? k : end,
        closed: atLine,
        first: from + 1 + (piece.length - piece.trimStart().length),
        beats: notes.split(BEAT_MARK).length,
      });
    }
    from = k;
  }
  return out;
}

/**
 * Each row's bars as shown, with the bars the checker found wrong. `rows` are
 * the rows as on screen (aligned, or what's being typed: only spaces differ
 * from the line the checker read), and `errors` the checker's for that line.
 * A part's bars are numbered on from its rows before, as the checker numbers
 * them. When the checker finds parts that don't match, the ones marked as a
 * whole are found by counting (see outOfStep), not by who its messages name.
 * A bar the checker names but the rows don't have marks its part as a whole,
 * so no problem goes unmarked.
 */
export function checkRows(rows: LineRow[], errors: Issue[], beatsPerBar: number): RowCheck[] {
  const badBars = new Set<string>();
  const named = new Set<string>();
  for (const e of errors) {
    if (!e.part) continue;
    if (e.bar) badBars.add(`${e.part} ${e.bar}`);
    else named.add(e.part);
  }
  const seen: Record<string, number> = {};
  const spans = rows.map((r) => {
    if (!r.part) return [];
    const part = normalizePart(r.part);
    const bars = barSpans(r.text, (seen[part] ?? 0) + 1);
    seen[part] = (seen[part] ?? 0) + bars.length;
    return bars;
  });
  const parts: Record<string, PartCount> = {};
  const marks = rows.map((r, i) => {
    if (!r.part) return [];
    const part = normalizePart(r.part);
    const count = (parts[part] ??= { bars: seen[part], beats: 0, wrong: false });
    return spans[i].map((b) => {
      const bad = badBars.has(`${part} ${b.bar}`);
      const edge = b.bar === 1 || b.bar === seen[part];
      const wrongBeats = bad && (b.beats > beatsPerBar || (b.beats < beatsPerBar && !edge));
      count.beats += b.beats;
      count.wrong ||= wrongBeats;
      return { ...b, bad, wrongBeats };
    });
  });
  const whole = named.size ? outOfStep(parts) : new Set<string>();
  // Counting found nothing the checker did: mark the parts it named.
  if (named.size && !whole.size && !Object.values(parts).some((c) => c.wrong)) for (const p of named) whole.add(p);
  for (const e of errors) if (e.part && e.bar && e.part in seen && !(e.bar >= 1 && e.bar <= seen[e.part])) whole.add(e.part);
  return rows.map((r, i) => ({ bars: marks[i], whole: !!r.part && whole.has(normalizePart(r.part)) }));
}

/** A part's bars and beats in the line, and whether a bar of it has too many or too few beats. */
interface PartCount {
  bars: number;
  beats: number;
  wrong: boolean;
}

/**
 * The parts out of step with the others: the checker measures every part
 * against the first, so when the first is the one misread, its message names
 * all the others. Here the bars and beats most parts share are taken as
 * right. A part with a bar of wrong beats isn't counted, since that bar
 * already shows what's wrong with it. When no count is shared by more parts
 * than any other, none can be told right, so every one is marked.
 */
function outOfStep(parts: Record<string, PartCount>): Set<string> {
  const groups = new Map<string, string[]>();
  for (const [part, c] of Object.entries(parts)) {
    if (c.wrong) continue;
    const key = `${c.bars} ${c.beats}`;
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  const sizes = [...groups.values()].map((g) => g.length).sort((a, b) => b - a);
  const right = sizes.length > 1 && sizes[0] === sizes[1] ? [] : [...groups.values()].find((g) => g.length === sizes[0]) ?? [];
  return new Set([...groups.values()].flat().filter((p) => !right.includes(p)));
}

/**
 * Where to number the line's bars: at the start of each bar of the part with
 * the most of them (the parts' bars are lined up in columns, so it's where
 * every part's bar starts). None when a part has two rows: its second row's
 * bars count on from its first, as the checker counts them, so one strip
 * can't number both rows.
 */
export function barNumbers(rows: LineRow[]): { bar: number; at: number }[] {
  const parts = rows.flatMap((r) => (r.part ? [normalizePart(r.part)] : []));
  if (new Set(parts).size < parts.length) return [];
  let most: BarSpan[] = [];
  for (const r of rows) {
    if (!r.part) continue;
    const bars = barSpans(r.text);
    if (bars.length > most.length) most = bars;
  }
  return most.map((b) => ({ bar: b.bar, at: b.first }));
}
