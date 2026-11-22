/**
 * The sol-fa a staff score prints beside its staves, as the answer key for
 * the staff reader: the page's rows of sol-fa found and read by the app's
 * typed-sheet reader's own pieces (`rowsOf`, `isSolfa` and `toAbu` in
 * src/scan/pdf-text.ts), each given to the staff it's printed beside. The
 * whole typed-sheet reader (`readTypedSheet`) can't be used as it is: on a
 * staff score it doesn't know which row is whose, and cuts lines at rows of
 * words, so a page of four staves comes out as one part's rows one after
 * another.
 *
 * A row printed just above a staff is that staff's part; on a staff two
 * parts share (a hymn's), the row above is the upper part's and the row
 * below the lower's (soprano over the treble staff, alto under it, tenor
 * over the bass staff, bass under it).
 */
import { isSolfa, rowsOf, toAbu, type PageText, type PdfChar } from '../../../abu-app/src/scan/pdf-text';
import type { ReadSystem } from '../../../abu-app/src/staff/pages';

/** A row's characters as typed: octave marks after their notes, spaces where the gaps are (as pdf-text's `itemsText`). */
function rowText(row: PdfChar[], main: number): string {
  let out = '';
  let prev: number | null = null;
  for (const c of [...row].sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1))) {
    if (c.c === ' ') {
      if (!out.endsWith(' ')) out += ' ';
      continue;
    }
    if (prev !== null && c.x0 - prev > 0.28 * main && !out.endsWith(' ')) out += ' ';
    out += (c.pre ?? '') + c.c + c.mark;
    prev = c.x1;
  }
  return out.trim();
}

/** Each system's printed sol-fa on a page, part by part (in SolfaScores' format), for the systems read on it. */
export function printedRows(text: PageText, pointScale: number, systems: ReadSystem[]): Map<ReadSystem, Record<string, string>> {
  const out = new Map<ReadSystem, Record<string, string>>();
  const { rows, base, size } = rowsOf(text.chars);
  const staves = systems.flatMap((s) => s.staves.map((staff, i) => ({ s, staff, role: s.roles[i] })));
  // Each row of sol-fa by the staff it's nearest, above or below it.
  const near = new Map<(typeof staves)[number], { above: { d: number; text: string }[]; below: { d: number; text: string }[] }>();
  rows.forEach((row, i) => {
    const plain = rowText(row, size[i]);
    if (!isSolfa(plain)) return;
    const x = ((Math.min(...row.map((c) => c.x0)) + Math.max(...row.map((c) => c.x1))) / 2) * pointScale;
    const y = (base[i] - 0.35 * size[i]) * pointScale;
    let best: { st: (typeof staves)[number]; d: number; above: boolean } | null = null;
    for (const st of staves) {
      const top = st.staff.top + st.staff.skew * x;
      const bottom = st.staff.bottom + st.staff.skew * x;
      const d = y < top ? top - y : y > bottom ? y - bottom : 0;
      if (d === 0 || d > 7 * st.staff.gap) continue;
      if (!best || d < best.d) best = { st, d, above: y < top };
    }
    if (!best) return;
    const entry = near.get(best.st) ?? { above: [], below: [] };
    (best.above ? entry.above : entry.below).push({ d: best.d, text: toAbu(plain, false) });
    near.set(best.st, entry);
  });
  for (const st of staves) {
    const entry = near.get(st);
    if (!entry) continue;
    const above = entry.above.sort((a, b) => a.d - b.d)[0]?.text;
    const below = entry.below.sort((a, b) => a.d - b.d)[0]?.text;
    const parts = out.get(st.s) ?? {};
    const put = (part: string, t: string | undefined) => {
      if (t && !parts[part]) parts[part] = t;
    };
    if (st.role === 'SA') {
      put('S', above);
      put('A', below);
    } else if (st.role === 'TB') {
      put('T', above);
      put('B', below);
    } else if (['S', 'A', 'T', 'B'].includes(st.role)) put(st.role, above ?? below);
    out.set(st.s, parts);
  }
  return out;
}
