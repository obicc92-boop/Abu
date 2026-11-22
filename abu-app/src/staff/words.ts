/**
 * The words under each voice's staff, from a PDF page's own text (a
 * picture has none to give, for now): the row of words printed nearest
 * under the staff (verse 1, where several verses are printed), or, for a
 * hymn's bass staff with nothing under it, the row over it, between the
 * staves, which every part sings. A row of printed sol-fa is never words.
 *
 * Each row is cut into syllables as printed: words apart, a hyphen between
 * a word's syllables ("Re - joice", "Re-joice"), an underscore line after a
 * syllable held over several notes. Each syllable is placed at its middle;
 * score.ts gives each to the note it's printed under.
 */
import { isSolfa, type PageText, type PdfChar } from '@/scan/pdf-text';
import { readExpression } from '@/solfa';

import type { PagePixels, ReadSystem } from './pages';
import type { Syllable } from './score';
import type { Staff } from './staves';

/** Rows of characters on one baseline, left to right. */
function rowsOfChars(chars: PdfChar[]): PdfChar[][] {
  const rows: PdfChar[][] = [];
  for (const c of [...chars].sort((a, b) => a.y - b.y || a.x0 - b.x0)) {
    const row = rows.find((r) => Math.abs(r[0].y - c.y) < 0.3 * Math.max(r[0].size, c.size));
    if (row) row.push(c);
    else rows.push([c]);
  }
  return rows.map((r) => r.sort((a, b) => a.x0 - b.x0));
}

const HYPHENS = /^[-–—‐]+$/;
const DYNAMICS = /^(?:p{1,3}|mp|mf|f{1,3}|sfz?|fz|cresc\.?|dim\.?|rit\.?|rall\.?|a|tempo)$/;

/** A row of words as syllables, each at its middle (in PDF points). */
export function syllablesOf(row: PdfChar[]): Syllable[] {
  // Pieces: runs of characters with no space or gap between them.
  const pieces: { text: string; x0: number; x1: number }[] = [];
  let cur: { text: string; x0: number; x1: number } | null = null;
  for (const c of row) {
    if (c.c === ' ' || (cur && c.x0 - cur.x1 > 0.2 * c.size)) {
      if (cur) pieces.push(cur);
      cur = null;
      if (c.c === ' ') continue;
    }
    if (cur) {
      cur.text += c.c;
      cur.x1 = c.x1;
    } else cur = { text: c.c, x0: c.x0, x1: c.x1 };
  }
  if (cur) pieces.push(cur);
  const out: (Syllable & { joinNext: boolean; joinPrev: boolean })[] = [];
  let pendingJoin = false;
  for (const p of pieces) {
    const text = p.text.replace(/_+$/g, '');
    if (!text || /^_+$/.test(p.text)) continue; // a held syllable's line
    if (HYPHENS.test(text)) {
      if (out.length) out[out.length - 1].joinNext = true;
      pendingJoin = true;
      continue;
    }
    // "Re-joice" printed close: its syllables apart, each where it's printed.
    const parts = text.split(/(?<=\S)[-–‐](?=\S)/);
    const width = (p.x1 - p.x0) / Math.max(1, text.length);
    let at = p.x0;
    parts.forEach((t, k) => {
      const lead = t.startsWith('-') || t.startsWith('–');
      const trail = /[-–‐]$/.test(t);
      const word = t.replace(/^[-–‐]+|[-–‐]+$/g, '');
      const x0 = at;
      const x1 = at + t.length * width;
      at = x1 + width;
      if (!word) return;
      if (lead && out.length) out[out.length - 1].joinNext = true;
      out.push({ x: (x0 + x1) / 2, text: word, syllabic: 'single', joinNext: trail || k < parts.length - 1, joinPrev: lead || k > 0 || pendingJoin });
      pendingJoin = false;
    });
    if (/[-–‐]$/.test(text)) pendingJoin = true;
  }
  return out.map(({ x, text, joinNext, joinPrev }, i) => {
    const before = joinPrev || (i > 0 && out[i - 1].joinNext);
    const after = joinNext;
    return { x, text, syllabic: before && after ? 'middle' : before ? 'end' : after ? 'begin' : 'single' };
  });
}

/** Whether a row is words: letters, not sol-fa, and not only dynamics or a label. */
function isWords(row: PdfChar[]): boolean {
  const text = row.map((c) => c.c).join('');
  if (isSolfa(text)) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => DYNAMICS.test(t))) return false;
  return (text.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0) >= 3;
}

const PART_NAMES: Record<string, string[]> = { S: ['Soprano'], A: ['Alto'], T: ['Tenor'], B: ['Bass'], SA: ['Soprano', 'Alto'], TB: ['Tenor', 'Bass'] };

/**
 * The words under each voice part's staff in each system on a page, by
 * part name. `systems` are the page's systems as read (their staves and
 * roles). Positions come back in the page's pixels.
 */
export function pageWords(text: PageText, pointScale: number, systems: ReadSystem[]): Map<ReadSystem, Map<string, Syllable[]>> {
  const out = new Map<ReadSystem, Map<string, Syllable[]>>();
  const rows = rowsOfChars(text.chars).filter(isWords);
  const all: { staff: Staff; system: ReadSystem; k: number }[] = systems.flatMap((system) => system.staves.map((staff, k) => ({ staff, system, k })));
  all.sort((a, b) => a.staff.top - b.staff.top);
  for (const [i, { staff, system, k }] of all.entries()) {
    const names = PART_NAMES[system.roles[k]];
    if (!names) continue;
    const next = all[i + 1]?.staff;
    const prev = all[i - 1]?.staff;
    const mid = (staff.left + staff.right) / 2;
    const yOf = (row: PdfChar[]) => row[0].y * pointScale;
    const bottom = staff.bottom + staff.skew * mid;
    const top = staff.top + staff.skew * mid;
    const limit = next ? next.top + next.skew * mid : bottom + 10 * staff.gap;
    const under = rows.filter((r) => yOf(r) > bottom + 0.5 * staff.gap && yOf(r) < Math.min(limit, bottom + 10 * staff.gap)).sort((a, b) => yOf(a) - yOf(b));
    let row = under[0];
    // A hymn's lower staff with nothing under it: the words between the staves, over it.
    if (!row && (system.roles[k] === 'TB' || k === system.roles.length - 1) && prev && system.staves.includes(prev)) {
      const from = prev.bottom + prev.skew * mid;
      row = rows.filter((r) => yOf(r) > from && yOf(r) < top - 0.5 * staff.gap).sort((a, b) => yOf(a) - yOf(b))[0];
    }
    if (!row) continue;
    const syllables = syllablesOf(row).map((s) => ({ ...s, x: s.x * pointScale }));
    const parts = out.get(system) ?? new Map<string, Syllable[]>();
    for (const name of names) parts.set(name, syllables);
    out.set(system, parts);
  }
  return out;
}

/** The words of every page with its own text, by system (its index among `systems`) and part. */
export function wordsOf(pages: PagePixels[], systems: ReadSystem[]): (system: number, part: string) => Syllable[] | undefined {
  const found = new Map<ReadSystem, Map<string, Syllable[]>>();
  pages.forEach((page, p) => {
    if (!page.text || !page.pointScale) return;
    for (const [s, parts] of pageWords(
      page.text,
      page.pointScale,
      systems.filter((s) => s.page === p),
    ))
      found.set(s, parts);
  });
  return (system, part) => found.get(systems[system])?.get(part);
}

/**
 * Each staff's label, as a PDF page prints it at the left of a system
 * ("SOPRANO", "Sop & Alto", "T.", "Organ" by its brace): the characters
 * left of where the staves start, each line of them given to the staff
 * nearest it. Null for a staff with none.
 */
export function staffLabels(text: PageText, pointScale: number, staves: Staff[]): (string | null)[] {
  const out: PdfChar[][] = staves.map(() => []);
  if (!staves.length) return [];
  const left = Math.min(...staves.map((s) => s.left));
  const gap = Math.max(...staves.map((s) => s.gap));
  for (const c of text.chars) {
    if (c.c === ' ' || c.x1 * pointScale > left + 0.3 * gap || c.x0 * pointScale < left - 40 * gap) continue;
    const y = (c.y - 0.35 * c.size) * pointScale;
    let best = -1;
    let near = Infinity;
    staves.forEach((s, i) => {
      const top = s.top + s.skew * left;
      const bottom = s.bottom + s.skew * left;
      const d = y < top ? top - y : y > bottom ? y - bottom : 0;
      if (d < near) [near, best] = [d, i];
    });
    if (best >= 0 && near <= 3 * staves[best].gap) out[best].push(c);
  }
  return out.map((chars) => {
    if (!chars.length) return null;
    const rows = rowsOfChars(chars).sort((a, b) => a[0].y - b[0].y);
    return rows.map((r) => r.map((c, i) => (i && c.x0 - r[i - 1].x1 > 0.25 * c.size ? ` ${c.c}` : c.c)).join('')).join(' ');
  });
}

/** Whether a row of words is printed under each staff (before the next staff, and within ten staff spaces). */
export function wordsUnder(text: PageText, pointScale: number, staves: Staff[]): boolean[] {
  const rows = rowsOfChars(text.chars).filter(isWords);
  return staves.map((staff, i) => {
    const next = staves[i + 1];
    const mid = (staff.left + staff.right) / 2;
    const bottom = staff.bottom + staff.skew * mid;
    const limit = Math.min(next ? next.top + next.skew * mid : Infinity, bottom + 10 * staff.gap);
    return rows.some((r) => {
      const y = r[0].y * pointScale;
      const x = ((r[0].x0 + r[r.length - 1].x1) / 2) * pointScale;
      return y > bottom + 0.5 * staff.gap && y < limit && x > staff.left && x < staff.right;
    });
  });
}

/** A tempo or mood printed above the music ("Moderato-vivace", "With joy ♩ = 80"): not a title. */
function tempoMark(row: string): boolean {
  const mark = readExpression(row.replace(/[-–]/g, ' '));
  return !!mark && mark.kind !== 'dynamic' && mark.kind !== 'accent';
}

/**
 * A PDF page's title: the row printed largest over its first staff (not a
 * "Doh is G", a credit or a row of sol-fa), in its own lettering, or "".
 */
export function titleOf(text: PageText, pointScale: number, first: Staff | undefined): string {
  const limit = first ? (first.top - 2 * first.gap) / pointScale : text.height / 3;
  const rows = rowsOfChars(text.chars.filter((c) => c.y < limit)).filter((r) => (r.map((c) => c.c).join('').match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0) >= 3);
  // A word's gap in large type is a smaller share of its size than in small type: a fifth of the size or so.
  const said = (r: PdfChar[]) => r.map((c, i) => (i && c.x0 - r[i - 1].x1 > 0.15 * c.size && c.c !== ' ' && r[i - 1].c !== ' ' ? ` ${c.c}` : c.c)).join('').replace(/\s+/g, ' ').trim();
  const best = rows
    // Not a key, a credit ("by …", "Music by"), the composer's phone number, or a row of printed sol-fa.
    .filter((r) => !/^(doh|key|lah)\b|©|copyright|^(composed|music|words|arr|by)\b|contact|phone|tel\b|@|\d{7}/i.test(said(r)) && (said(r).match(/[|:]/g)?.length ?? 0) < 2 && !tempoMark(said(r)))
    .sort((a, b) => Math.max(...b.map((c) => c.size)) - Math.max(...a.map((c) => c.size)))[0];
  if (!best) return '';
  // Only the title's own lettering: smaller words level with it ("Music by" at the right) are a credit.
  const size = Math.max(...best.map((c) => c.size));
  return said(best.filter((c) => c.size >= 0.75 * size));
}
