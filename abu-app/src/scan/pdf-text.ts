/**
 * Typed sol-fa sheets read from the PDF's own text, with no pictures and no
 * AI: free, instant and exact when the sheet was typed (in Word, mostly) and
 * saved as a PDF. A port of abu-reader/scripts/pdf-text.py, which was
 * measured on the owner's sheets (92% of bars pass Abụ's checker as read).
 *
 * What it knows (from the owner's sheets):
 * - Table borders are bar lines. A typed "|" inside a bar is the medium
 *   accent, written "/" in Abụ. With no table, a typed "|" is a bar line.
 * - Octave marks are small figures or ticks set above or below a note, or
 *   the characters ¹ ² ₁ ₂. They become d' (up) and t1 (down).
 * - Four rows of notes are soprano, alto, tenor and bass, top to bottom.
 * - Many sheets print a line's upbeat in the first column of the next line,
 *   leaving the last beat of the line before it empty. It goes back there.
 *
 * `pageText` takes what it needs from a pdf.js page; the rest is plain logic.
 * Positions are in PDF points, from the page's top left.
 */

/** A character on the page: its left and right edges, its baseline and type size, and any octave mark found for it. */
export interface PdfChar {
  c: string;
  x0: number;
  x1: number;
  y: number;
  size: number;
  mark: string;
}

/** A drawn vertical line: x, top, bottom. */
export type Seg = [number, number, number];

export interface PageText {
  width: number;
  height: number;
  chars: PdfChar[];
  /** Vertical lines drawn on the page (a table's bar lines). */
  segs: Seg[];
  /** Long horizontal lines, which may separate one line of music from the next. */
  across: number[];
  /** Characters in fonts that draw staff notation. */
  music: number;
  /**
   * How much of the page its biggest picture covers (0 to 1). A scanned
   * page is one big picture, and any text on it was guessed by a computer
   * (often badly): it's read as a picture instead.
   */
  pictured: number;
}

/** A line of music as read: its rows of notes ("n") and words ("w"), and where it's printed. */
export interface TypedLine {
  page: number;
  /** In PDF points: left, top, right, bottom. */
  box: [number, number, number, number];
  rows: ['n' | 'w', string][];
}

export interface TypedSheet {
  title: string;
  key: string;
  time: string;
  /** Each line as Abụ text (S, A, T, B rows with W rows of words), with its parts and where it's printed. */
  lines: { page: number; box: TypedLine['box']; parts: string[]; words: number; text: string }[];
  /** A staff score with sol-fa printed with it: its text is only part of the music. */
  staff: boolean;
}

/* ---------- From a pdf.js page ---------- */

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
}
interface PdfViewport {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
}
/** What's used of a pdf.js page (pdfjs-dist 5). */
export interface PdfJsPage {
  getViewport(o: { scale: number }): PdfViewport;
  getTextContent(o?: { disableNormalization?: boolean }): Promise<{ items: object[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  commonObjs: { has(id: string): boolean; get(id: string): unknown };
}
/** The drawing operations used, by name (pdf.js's OPS). */
export type PdfOps = Record<string, number>;

// Fonts that draw staff notation (notes, clefs, rests); their characters aren't text.
const MUSIC_FONT = /opus|maestro|bravura|petrucci|sonata|leland|emmentaler|engraver|jazz|november|helsinki|reprise|norfolk|inkpen|finale|sibelius|musescore|music/i;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** The matrix that applies `inner`, then `outer` (PDF's "cm": the new matrix goes inside the current one). */
const compose = (outer: Matrix, inner: number[]): Matrix => [
  inner[0] * outer[0] + inner[1] * outer[2],
  inner[0] * outer[1] + inner[1] * outer[3],
  inner[2] * outer[0] + inner[3] * outer[2],
  inner[2] * outer[1] + inner[3] * outer[3],
  inner[4] * outer[0] + inner[5] * outer[2] + outer[4],
  inner[4] * outer[1] + inner[5] * outer[3] + outer[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** The page's characters (in reading fonts), drawn lines and staff-font count, from pdf.js. */
export async function pageText(page: PdfJsPage, OPS: PdfOps): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 });
  const at = (x: number, y: number) => vp.convertToViewportPoint(x, y) as [number, number];
  // The operator list first: it loads the fonts, whose names tell staff-notation fonts apart.
  const ops = await page.getOperatorList();
  const content = await page.getTextContent({ disableNormalization: true });
  const chars: PdfChar[] = [];
  let music = 0;
  const fontName = (id: string) => {
    try {
      return page.commonObjs.has(id) ? ((page.commonObjs.get(id) as { name?: string } | undefined)?.name ?? '') : '';
    } catch {
      return '';
    }
  };
  for (const raw of content.items) {
    const it = raw as PdfTextItem;
    if (typeof it.str !== 'string' || !it.str) continue;
    const t = it.transform;
    const [x, y] = at(t[4], t[5]);
    const [ax, ay] = at(t[4] + t[0], t[5] + t[1]);
    const len = Math.hypot(ax - x, ay - y);
    if (!len || Math.abs(ay - y) > 0.1 * len) continue; // sideways text (labels down the margin)
    const glyphs = Array.from(it.str);
    if (MUSIC_FONT.test(fontName(it.fontName))) {
      music += glyphs.length;
      continue;
    }
    const size = Math.hypot(t[2], t[3]);
    const step = it.width / glyphs.length;
    glyphs.forEach((g, i) => chars.push({ c: /\s/.test(g) ? ' ' : g, x0: x + i * step, x1: x + (i + 1) * step, y, size, mark: '' }));
  }

  // Drawn lines: the table's bar lines and the rules between lines of music.
  const segs: Seg[] = [];
  const across: number[] = [];
  const long = 0.3 * vp.width;
  let pictured = 0;
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const fills = new Set([OPS.fill, OPS.eoFill]);
  const strokes = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === OPS.transform) ctm = compose(ctm, args as number[]);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = compose(ctm, Array.from(args[0] as ArrayLike<number>));
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintJpegXObject) {
      // A picture fills the unit square, mapped onto the page by the current matrix.
      const corners = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)].map(([px, py]) => at(px, py));
      const xs = corners.map((c) => Math.min(vp.width, Math.max(0, c[0])));
      const ys = corners.map((c) => Math.min(vp.height, Math.max(0, c[1])));
      pictured = Math.max(pictured, ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / (vp.width * vp.height));
    }
    else if (fn === OPS.constructPath) {
      const paint = args[0] as number;
      const isFill = fills.has(paint);
      const isStroke = strokes.has(paint);
      if (!isFill && !isStroke) return; // a clip, not a drawing
      const data = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!data) return;
      for (const poly of subpaths(data)) {
        const pts = poly.map(([px, py]) => at(...apply(ctm, px, py)));
        if (isStroke || paint === OPS.fillStroke || paint === OPS.eoFillStroke) {
          for (let k = 1; k < pts.length; k++) {
            const [p, q] = [pts[k - 1], pts[k]];
            if (Math.abs(p[0] - q[0]) < 1 && Math.abs(p[1] - q[1]) > 4) segs.push([(p[0] + q[0]) / 2, Math.min(p[1], q[1]), Math.max(p[1], q[1])]);
            else if (Math.abs(p[1] - q[1]) < 1 && Math.abs(p[0] - q[0]) > long) across.push((p[1] + q[1]) / 2);
          }
        }
        if (isFill) {
          // A filled thin box is a drawn line.
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
          if (x1 - x0 < 2.5 && y1 - y0 > 4) segs.push([(x0 + x1) / 2, y0, y1]);
          else if (y1 - y0 < 2.5 && x1 - x0 > long) across.push((y0 + y1) / 2);
        }
      }
    }
  });
  return { width: vp.width, height: vp.height, chars, segs, across: across.sort((a, b) => a - b), music, pictured };
}

/** A path's pieces as lists of points (pdf.js 5's path data: 0 move, 1 line, 2 curve, 3 quadratic curve, 4 close). */
function subpaths(data: ArrayLike<number>): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 0; i < data.length; ) {
    const op = data[i++];
    if (op === 0) {
      if (cur.length) out.push(cur);
      cur = [[data[i], data[i + 1]]];
      i += 2;
    } else if (op === 1) {
      cur.push([data[i], data[i + 1]]);
      i += 2;
    } else if (op === 2) {
      cur.push([data[i + 4], data[i + 5]]);
      i += 6;
    } else if (op === 3) {
      cur.push([data[i + 2], data[i + 3]]);
      i += 4;
    } else if (op === 4) {
      if (cur.length) cur.push(cur[0]);
    } else break; // something unexpected: stop rather than misread
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ---------- Reading the text ---------- */

const NOTE = "(?:de|re|fe|se|le|ra|ma|lo|ta|ba|d|r|m|f|s|l|t)(?:'{1,2}|[12])?";
const RAISED: Record<string, string> = { '¹': "'", '²': "''" };
const LOWERED: Record<string, string> = { '₁': '1', '₂': '2' };
const MARKISH = new Set(['1', '2', '|', 'l', 'I', "'", '’', 'ʼ']);
const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rows by baseline, each sorted left to right, with its baseline and type size. */
function cluster(chars: PdfChar[]): { rows: PdfChar[][]; base: number[]; size: number[] } {
  let rows: PdfChar[][] = [];
  let cur: PdfChar[] = [];
  for (const c of [...chars].sort((a, b) => a.y - b.y)) {
    if (cur.length && c.y - cur[cur.length - 1].y > 0.3 * Math.min(c.size, cur[cur.length - 1].size)) {
      rows.push(cur);
      cur = [];
    }
    cur.push(c);
  }
  if (cur.length) rows.push(cur);
  rows = rows.filter((r) => r.some((c) => c.c !== ' ')).map((r) => [...r].sort((a, b) => a.x0 - b.x0));
  const ink = (r: PdfChar[]) => r.filter((c) => c.c !== ' ');
  return { rows, base: rows.map((r) => median(ink(r).map((c) => c.y))), size: rows.map((r) => median(ink(r).map((c) => c.size))) };
}

const SOLFA_CHARS = new RegExp(`${NOTE}|[|¦:.,\\-–—/x!]`, 'g');
const NOTES = new RegExp(NOTE, 'g');

/** Whether a row's text is sol-fa: almost all notes and marks, with at least two notes or holds. */
export function isSolfa(text: string): boolean {
  const t = text.replace(/ /g, '');
  if (!t) return false;
  const rest = t.replace(SOLFA_CHARS, '');
  return (t.length - rest.length) / t.length > 0.85 && (t.match(NOTES)?.length ?? 0) + (t.match(/-/g)?.length ?? 0) >= 2;
}

/** Finds the rows, then octave marks: small figures or ticks just after a note in a row of notes. */
export function rowsOf(chars: PdfChar[]) {
  if (!chars.some((c) => c.c !== ' ')) return { rows: [] as PdfChar[][], base: [] as number[], size: [] as number[] };
  const letters = chars.filter((c) => isLetter(c.c));
  const near = (m: PdfChar, n: PdfChar) => m.x0 - n.x1 >= -1.5 && m.x0 - n.x1 < 0.5 * n.size && Math.abs(n.y - m.y) < 0.8 * n.size;
  // A small figure or tick right after a bigger letter (judged against that letter, not the page: some
  // sheets set their words smaller than their notes).
  const isCand = (m: PdfChar) => m.c in RAISED || m.c in LOWERED || (MARKISH.has(m.c) && letters.some((n) => m.size < 0.85 * n.size && near(m, n)));
  const cands = chars.filter(isCand);
  const others = chars.filter((c) => !isCand(c));
  const notes = cluster(others)
    .rows.filter((r) => isSolfa(r.map((c) => c.c).join('')))
    .flatMap((r) => r.filter((c) => isLetter(c.c)));
  const leftovers: PdfChar[] = [];
  for (const m of cands) {
    const uni = m.c in RAISED || m.c in LOWERED;
    const close = notes.filter((n) => near(m, n) && (uni || m.size < 0.85 * n.size));
    if (!close.length) {
      leftovers.push(m);
      continue;
    }
    const note = close.reduce((a, b) => {
      const ka = [Math.abs(a.y - m.y), m.x0 - a.x1];
      const kb = [Math.abs(b.y - m.y), m.x0 - b.x1];
      return kb[0] < ka[0] || (kb[0] === ka[0] && kb[1] < ka[1]) ? b : a;
    });
    if (uni) note.mark += RAISED[m.c] ?? LOWERED[m.c];
    else {
      const two = m.c === '2';
      const up = m.y < note.y - 0.12 * note.size;
      note.mark += up ? (two ? "''" : "'") : two ? '2' : '1';
    }
  }
  return cluster([...others, ...leftovers]);
}

const crosses = ([, top, bottom]: Seg, y: number, main: number) => top <= y - 0.55 * main && bottom >= y - 0.15 * main;

/** The row as typed, with drawn lines through it as "¦" and gaps as spaces. */
function rowText(row: PdfChar[], y: number, main: number, segs: Seg[]): string {
  const items: [number, number, string][] = row.map((c) => [c.x0, c.x1, c.c + c.mark]);
  for (const s of segs) if (crosses(s, y, main)) items.push([s[0] - 0.01, s[0] + 0.01, '¦']);
  items.sort((a, b) => a[0] - b[0]);
  let out = '';
  let prev: number | null = null;
  let lastBar: number | null = null;
  for (const [x0, x1, s] of items) {
    if (s === '¦') {
      if (lastBar !== null && x0 - lastBar < 4) continue; // a double line
      lastBar = x0;
    }
    if (s === ' ') {
      if (!out.endsWith(' ')) out += ' ';
      continue;
    }
    if (prev !== null && x0 - prev > 0.28 * main && !out.endsWith(' ')) out += ' ';
    out += s;
    prev = x1;
  }
  return out.trim();
}

const DASHES: Record<string, string> = { '–': '-', '—': '-', '−': '-', '‒': '-', '’': "'", 'ʼ': "'" };
const DYNAMICS = /(^|[^a-z'])(?:mf|mp|pp|ff|fff|ppp|p|sfz|cresc\.?|dim\.?|rit\.?|rall\.?|accel\.?)(?![a-z])/g;

/** A row of notes as typed, in Abụ's format. */
export function toAbu(text: string, drawnBars: boolean): string {
  let t = text.replace(/[–—−‒’ʼ]/g, (c) => DASHES[c]);
  // A part's name printed before its row ("S", "Alto:", "Ten."), in capitals: a small "s" is a note.
  t = t.replace(/^\s*(?:¦\s*)?(?:Solo|Soprano|Sop|Alto|Tenor|Ten|Bass|S|A|T|B)\b[.:]?\s*/, '');
  t = t.replace(/\|/g, drawnBars ? '/' : '|').replace(/¦/g, '|');
  t = t.replace(/\s+'/g, "'"); // "d '" is d'
  t = t.replace(/([a-z]),(?=[\s:./|]|$)/g, (_, n: string) => `${n}1`); // "t," (a comma after a note, not before one) is the low t1
  t = t.replace(DYNAMICS, '$1 ');
  t = t.replace(/(^|[^\w'])\d+(?![\w'])/g, '$1 '); // bar numbers
  t = t.replace(/-{2,}/g, '-');
  t = t.replace(/\b([dfrlstm])\s+([ae])\b/g, '$1$2'); // "t a" spaced out is ta
  t = t.replace(/\b([a-z]{1,2})11(?![\d'])/g, (_, n: string) => `${n}2`); // two low marks: two octaves down
  t = t.replace(/\s*\|\s*/g, ' | ').trim();
  t = t.replace(/^(\|\s*)+/, ''); // double borders at the start
  t = t.replace(/(\|\s*)+$/, '').trim();
  return t ? `${t} |` : t;
}

const KEY = /(?:doh\s*(?:is|=|–|-|:)?|key\s*(?:of|:|=)?)\s*([A-G])\s*(♭|♯|#|b(?![a-z])|flat|sharp)?/i;
const TIME = /(\d{1,2})\s*\/\s*(\d{1,2})/;
const SUPERSUB: Record<string, string> = Object.fromEntries([...'⁰¹²³⁴⁵⁶⁷⁸⁹'].map((c, i) => [c, String(i)]).concat([...'₀₁₂₃₄₅₆₇₈₉'].map((c, i) => [c, String(i)])));

/** The key ("Doh is G", "Key Eb") and time ("Time 3/4") printed in a sheet's heading. */
export function headerInfo(lines: string[]): { key: string; time: string } {
  const text = lines.join(' ').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/g, (c) => SUPERSUB[c]);
  let key = '';
  const k = text.match(KEY);
  if (k) {
    const acc = (k[2] ?? '').toLowerCase();
    key = k[1].toUpperCase() + (['♭', 'b', 'flat'].includes(acc) ? 'b' : ['♯', '#', 'sharp'].includes(acc) ? '#' : '');
  }
  const w = text.search(/time/i);
  const m = (w >= 0 ? text.slice(w + 4) : text).match(TIME);
  const time = m && ['2', '4', '8', '16'].includes(m[2]) ? `${m[1]}/${m[2]}` : '';
  return { key, time };
}

interface System {
  rows: ['n' | 'w', string][];
  ys: number[];
  main: number;
  page: number;
  x0: number;
  x1: number;
}

/** More than five rows of notes is several lines of music: split at ruled lines, or evenly. */
function splitTall(system: System, across: number[]): System[] {
  const idx = system.rows.flatMap(([k], i) => (k === 'n' ? [i] : []));
  if (idx.length <= 5) return [system];
  const { ys } = system;
  const n = system.rows.length;
  const cuts: number[] = [];
  for (let k = 1; k < n; k++) if (across.some((a) => ys[k - 1] < a && a < ys[k] - 0.6 * system.main)) cuts.push(k);
  let pieces: number[][] = [];
  const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
  if (cuts.length) {
    const bounds = [0, ...cuts, n];
    pieces = bounds.slice(1).map((b, i) => range(bounds[i], b));
    const notesIn = (p: number[]) => p.filter((i) => system.rows[i][0] === 'n').length;
    if (!pieces.filter((p) => notesIn(p) > 0).every((p) => notesIn(p) >= 2 && notesIn(p) <= 5)) pieces = [];
  }
  if (!pieces.length) {
    const size = [4, 3, 2].find((k) => idx.length % k === 0) ?? 4;
    const starts = idx.filter((_, k) => k % size === 0);
    const bounds = [...starts, n];
    pieces = bounds.slice(1).map((b, i) => range(bounds[i], b));
  }
  return pieces.filter((p) => p.length).map((p) => ({ ...system, rows: p.map((i) => system.rows[i]), ys: p.map((i) => ys[i]) }));
}

const barsOf = (row: string) =>
  row
    .split('|')
    .map((b) => b.trim())
    .filter(Boolean);
const beatsOf = (bar: string) => bar.split(/[:/]/);

/** Moves an upbeat printed at the start of a line back into the last bar of the line before. */
function mergeUpbeats(systems: System[]): void {
  const counts = new Map<number, number>();
  for (const s of systems) for (const [k, t] of s.rows) if (k === 'n') for (const b of barsOf(t).slice(1, -1)) counts.set(beatsOf(b).length, (counts.get(beatsOf(b).length) ?? 0) + 1);
  if (!counts.size) return;
  // The commonest number of beats in a bar (the first seen wins a tie, as in Python's Counter).
  let bpb = 0;
  let most = -1;
  for (const [beats, n] of counts)
    if (n > most) {
      bpb = beats;
      most = n;
    }
  for (let s = 1; s < systems.length; s++) {
    const prev = systems[s - 1];
    const cur = systems[s];
    const pRows = prev.rows.flatMap(([k], i) => (k === 'n' ? [i] : []));
    const cRows = cur.rows.flatMap(([k], i) => (k === 'n' ? [i] : []));
    if (pRows.length !== cRows.length || !pRows.length) continue;
    const firsts = cRows.map((i) => barsOf(cur.rows[i][1]));
    const lasts = pRows.map((i) => barsOf(prev.rows[i][1]));
    if (firsts.some((f, i) => f.length < 2 || !lasts[i].length)) continue;
    const b = beatsOf(firsts[0][0]).length;
    if (b >= bpb || firsts.some((f) => beatsOf(f[0]).length !== b)) continue;
    const merged: string[] = [];
    let ok = true;
    for (let i = 0; i < firsts.length; i++) {
      const f = firsts[i];
      const l = lasts[i];
      const last = l[l.length - 1];
      const beats = beatsOf(last);
      const seps = last.match(/[:/]/g) ?? [];
      if (beats.length + b === bpb) merged.push(`${last} :${f[0]}`);
      else if (beats.length === bpb && beats.slice(-b).every((x) => !x.trim())) {
        const keep = beats.slice(0, -b);
        let text = keep[0];
        keep.slice(1).forEach((beat, k) => (text += ` ${seps[k]}${beat.trim()}`));
        text += keep.length <= seps.length ? ` ${seps[keep.length - 1]}${f[0]}` : '';
        merged.push(text);
      } else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    pRows.forEach((i, k) => (prev.rows[i] = ['n', `${[...lasts[k].slice(0, -1), merged[k]].join(' | ')} |`]));
    cRows.forEach((i, k) => (cur.rows[i] = ['n', `${firsts[k].slice(1).join(' | ')} |`]));
  }
}

const PARTS: Record<number, string[]> = { 1: ['S'], 2: ['S', 'A'], 3: ['S', 'A', 'B'], 4: ['S', 'A', 'T', 'B'], 5: ['Solo', 'S', 'A', 'T', 'B'] };
const WORDISH = /[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]/;

/** The heading lines and each line of music (rows of notes and words), page by page. */
export function readSystems(pages: PageText[]): { header: string[]; systems: System[]; printed: TypedLine[]; music: number } {
  const header: string[] = [];
  const systems: System[] = [];
  let music = 0;
  pages.forEach((page, number) => {
    music += page.music;
    if (!page.chars.length) return;
    const { rows, base, size } = rowsOf(page.chars);
    const { segs, across } = page;
    let cur: System | null = null;
    let lastY: number | null = null;
    const pageSystems: System[] = [];
    rows.forEach((r, i) => {
      const y = base[i];
      const main = size[i];
      const plain = rowText(r, y, main, []);
      const gap = lastY !== null ? y - lastY : 1e9;
      if (isSolfa(plain)) {
        const drawn = segs.some((s) => crosses(s, y, main));
        if (!cur || gap > 2.6 * main) {
          cur = { rows: [], ys: [], main, page: number, x0: 1e9, x1: 0 };
          pageSystems.push(cur);
        }
        const ink = r.filter((c) => c.c !== ' ');
        cur.x0 = Math.min(cur.x0, ink[0].x0);
        cur.x1 = Math.max(cur.x1, ink[ink.length - 1].x1);
        cur.rows.push(['n', toAbu(drawn ? rowText(r, y, main, segs) : plain, drawn)]);
        cur.ys.push(y);
        lastY = y;
      } else if (cur && gap <= 2.6 * main && WORDISH.test(plain) && !/^[\d\s]+$/.test(plain)) {
        cur.rows.push(['w', plain]);
        cur.ys.push(y);
        lastY = y;
      } else {
        if (!systems.length && !pageSystems.length) header.push(plain);
        if (gap > 2.6 * main) cur = null;
      }
    });
    for (const s of pageSystems) systems.push(...splitTall(s, across));
  });
  const printed: TypedLine[] = systems.map((s) => ({
    page: s.page,
    box: [s.x0 - 14, Math.min(...s.ys) - 1.2 * s.main, s.x1 + 14, Math.max(...s.ys) + 0.7 * s.main],
    rows: s.rows.map(([k, t]) => [k, t] as ['n' | 'w', string]),
  }));
  mergeUpbeats(systems);
  return { header, systems, printed, music };
}

/** A typed sheet read from its pages' text: the heading, and each line in Abụ's format with where it's printed. */
export function readTypedSheet(pages: PageText[]): TypedSheet {
  const { header, systems, printed, music } = readSystems(pages);
  const { key, time } = headerInfo(header);
  const title = header.find((h) => /[A-Za-z]{3}/.test(h))?.trim() ?? '';
  const lines = systems.map((s, i) => {
    const n = s.rows.filter(([k]) => k === 'n').length;
    const names = PARTS[n] ?? Array.from({ length: n }, (_, k) => `P${k + 1}`);
    const out: string[] = [];
    let k = 0;
    let part: string | null = null;
    let words = 0;
    for (const [kind, text] of s.rows) {
      if (kind === 'n') {
        part = names[k++];
        out.push(`${part.padEnd(2)} ${text.replace(/ {2,}/g, ' ')}`);
      } else if (part) {
        out.push(`W  ${text.replace(/-\s+/g, '-').trim()}`);
        words++;
      }
    }
    return { page: s.page, box: printed[i].box, parts: names, words, text: out.join('\n') };
  });
  return { title, key, time, lines, staff: music > 50 };
}
