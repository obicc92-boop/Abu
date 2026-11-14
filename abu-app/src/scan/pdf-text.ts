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
  /** A bridge note's name in the old key ("s="), printed small and raised just before this note (ˢd). */
  pre?: string;
}

/** A drawn vertical line: x, top, bottom, and how thick it's drawn (when known). */
export type Seg = [number, number, number, number?];

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

/** A glyph as pdf.js's operator list gives it in a showText. */
interface PdfGlyph {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
}

/** The graphics state that matters here, saved and restored with the page's "q" and "Q". */
interface Gfx {
  ctm: Matrix;
  lineWidth: number;
  /** What can be seen, on the page: left, top, right, bottom. */
  clip: [number, number, number, number];
  font: { size: number; dir: number; matrix: number[]; music: boolean };
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  rise: number;
  leading: number;
  invisible: boolean;
}

/**
 * The page's characters (in reading fonts), drawn lines and staff-font count, from pdf.js.
 *
 * The characters come from the drawing operations, as the page is painted:
 * each glyph where it's drawn and as wide as its font makes it, leaving out
 * what's hidden (clipped away, or invisible text). When that finds nothing,
 * pdf.js's text content is used instead, each run of text split evenly.
 */
export async function pageText(page: PdfJsPage, OPS: PdfOps): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 });
  const at = (x: number, y: number) => vp.convertToViewportPoint(x, y) as [number, number];
  // The operator list first: it loads the fonts, whose names tell staff-notation fonts apart.
  const ops = await page.getOperatorList();
  const fontOf = (id: string): { name: string; matrix?: number[] } => {
    try {
      const f = page.commonObjs.has(id) ? (page.commonObjs.get(id) as { name?: string; fontMatrix?: number[] } | undefined) : undefined;
      return { name: f?.name ?? '', matrix: f?.fontMatrix ? Array.from(f.fontMatrix) : undefined };
    } catch {
      return { name: '' };
    }
  };

  // Drawn lines: the table's bar lines and the rules between lines of music.
  const segs: Seg[] = [];
  const across: number[] = [];
  const long = 0.3 * vp.width;
  let pictured = 0;
  const chars: PdfChar[] = [];
  let music = 0;
  const stack: Gfx[] = [];
  let g: Gfx = {
    ctm: IDENTITY,
    lineWidth: 1,
    clip: [-Infinity, -Infinity, Infinity, Infinity],
    font: { size: 0, dir: 1, matrix: [0.001, 0, 0, 0.001, 0, 0], music: false },
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    rise: 0,
    leading: 0,
    invisible: false,
  };
  let clipNext = false;
  // The text matrix, and where the next glyph goes in it (pdf.js's current.x, y and lineX, Y).
  let tm: Matrix = IDENTITY;
  let tx = 0;
  let ty = 0;
  let lx = 0;
  let ly = 0;
  const scale = () => Math.sqrt(Math.abs(g.ctm[0] * g.ctm[3] - g.ctm[1] * g.ctm[2]));
  /** Narrows what can be seen to a box drawn in user space. */
  const clipTo = (x0: number, y0: number, x1: number, y1: number) => {
    const pts = [apply(g.ctm, x0, y0), apply(g.ctm, x1, y0), apply(g.ctm, x0, y1), apply(g.ctm, x1, y1)].map(([px, py]) => at(px, py));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [l, t, r, b] = g.clip;
    g.clip = [Math.max(l, Math.min(...xs)), Math.max(t, Math.min(...ys)), Math.min(r, Math.max(...xs)), Math.min(b, Math.max(...ys))];
  };
  const moveText = (x: number, y: number) => {
    lx += x;
    ly += y;
    tx = lx;
    ty = ly;
  };
  const fills = new Set([OPS.fill, OPS.eoFill]);
  const strokes = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  /** Places a showText's glyphs on the page, as pdf.js's canvas does, and moves on past them. */
  const show = (glyphs: (PdfGlyph | number)[]) => {
    const { size, dir, matrix } = g.font;
    const m = compose(g.ctm, tm);
    const hScale = g.hScale * dir;
    let x = 0;
    for (const glyph of glyphs) {
      if (typeof glyph === 'number') {
        x -= (glyph * size) / 1000;
        continue;
      }
      const advance = (Number(glyph.width) || 0) * size * matrix[0];
      const start = x;
      x += advance + ((glyph.isSpace ? g.wordSpacing : 0) + g.charSpacing) * dir;
      const text = glyph.unicode ?? '';
      if (!text || g.invisible) continue;
      if (g.font.music) {
        music += Array.from(text).length;
        continue;
      }
      const [ox, oy] = at(...apply(m, tx + start * hScale, ty + g.rise));
      const [ex, ey] = at(...apply(m, tx + (start + advance) * hScale, ty + g.rise));
      const len = Math.hypot(ex - ox, ey - oy);
      if (len && Math.abs(ey - oy) > 0.1 * len) continue; // sideways text (labels down the margin)
      const [ux, uy] = at(...apply(m, tx + start * hScale, ty + g.rise + size));
      const height = Math.hypot(ux - ox, uy - oy);
      // Hidden by a clip when hardly any of it shows (a glyph cut part way, as some sheets' table cells do, still reads).
      const [l, t, r, b] = g.clip;
      const shown = Math.min(r, Math.max(ox, ex)) - Math.max(l, Math.min(ox, ex));
      const [top, bottom] = [oy - 0.7 * height, oy];
      if (shown < 0.2 * Math.max(0.1, Math.abs(ex - ox)) || Math.min(b, bottom) - Math.max(t, top) < 0.1 * height) continue;
      const pieces = Array.from(text);
      const step = (ex - ox) / pieces.length;
      pieces.forEach((c, k) => chars.push({ c: /\s/.test(c) ? ' ' : c, x0: ox + k * step, x1: ox + (k + 1) * step, y: oy, size: height, mark: '' }));
    }
    tx += x * hScale;
  };

  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push({ ...g, font: { ...g.font } });
    else if (fn === OPS.restore) g = stack.pop() ?? g;
    else if (fn === OPS.transform) g.ctm = compose(g.ctm, args as number[]);
    else if (fn === OPS.setLineWidth) g.lineWidth = Number(args?.[0]) || 0;
    else if (fn === OPS.setGState) {
      for (const [key, value] of (args?.[0] as [string, unknown][] | undefined) ?? []) if (key === 'LW') g.lineWidth = Number(value) || 0;
    } else if (fn === OPS.clip || fn === OPS.eoClip) clipNext = true;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ...g, font: { ...g.font } });
      if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) g.ctm = compose(g.ctm, Array.from(args[0] as ArrayLike<number>));
      const box = args?.[1] as ArrayLike<number> | null | undefined;
      if (box && box.length === 4) clipTo(box[0], box[1], box[2], box[3]);
    } else if (fn === OPS.paintFormXObjectEnd) g = stack.pop() ?? g;
    else if (fn === OPS.beginText) {
      tm = IDENTITY;
      tx = ty = lx = ly = 0;
    } else if (fn === OPS.setTextMatrix) {
      tm = Array.from(args[0] as ArrayLike<number>) as Matrix;
      tx = ty = lx = ly = 0;
    } else if (fn === OPS.moveText) moveText(Number(args[0]), Number(args[1]));
    else if (fn === OPS.setLeadingMoveText) {
      g.leading = Number(args[1]);
      moveText(Number(args[0]), Number(args[1]));
    } else if (fn === OPS.setLeading) g.leading = -Number(args[0]);
    else if (fn === OPS.nextLine) moveText(0, g.leading);
    else if (fn === OPS.setFont) {
      const size = Number(args[1]) || 0;
      const f = fontOf(String(args[0]));
      g.font = { size: Math.abs(size), dir: size < 0 ? -1 : 1, matrix: f.matrix ?? [0.001, 0, 0, 0.001, 0, 0], music: MUSIC_FONT.test(f.name) };
    } else if (fn === OPS.setCharSpacing) g.charSpacing = Number(args[0]) || 0;
    else if (fn === OPS.setWordSpacing) g.wordSpacing = Number(args[0]) || 0;
    else if (fn === OPS.setHScale) g.hScale = (Number(args[0]) || 100) / 100;
    else if (fn === OPS.setTextRise) g.rise = Number(args[0]) || 0;
    else if (fn === OPS.setTextRenderingMode) g.invisible = (Number(args[0]) & 3) === 3;
    else if (fn === OPS.showText) show((args[0] as (PdfGlyph | number)[]) ?? []);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintJpegXObject) {
      // A picture fills the unit square, mapped onto the page by the current matrix.
      const corners = [apply(g.ctm, 0, 0), apply(g.ctm, 1, 0), apply(g.ctm, 0, 1), apply(g.ctm, 1, 1)].map(([px, py]) => at(px, py));
      const xs = corners.map((c) => Math.min(vp.width, Math.max(0, c[0])));
      const ys = corners.map((c) => Math.min(vp.height, Math.max(0, c[1])));
      pictured = Math.max(pictured, ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / (vp.width * vp.height));
    } else if (fn === OPS.constructPath) {
      const paint = args[0] as number;
      const data = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      const box = args[2] as ArrayLike<number> | null | undefined;
      if (clipNext) {
        clipNext = false;
        if (box && box.length === 4 && Number.isFinite(box[0])) clipTo(box[0], box[1], box[2], box[3]);
      }
      const isFill = fills.has(paint);
      const isStroke = strokes.has(paint);
      if ((!isFill && !isStroke) || !data) return; // a clip, not a drawing
      for (const poly of subpaths(data)) {
        const pts = poly.map(([px, py]) => at(...apply(g.ctm, px, py)));
        if (isStroke || paint === OPS.fillStroke || paint === OPS.eoFillStroke) {
          for (let k = 1; k < pts.length; k++) {
            const [p, q] = [pts[k - 1], pts[k]];
            if (Math.abs(p[0] - q[0]) < 1 && Math.abs(p[1] - q[1]) > 4) segs.push([(p[0] + q[0]) / 2, Math.min(p[1], q[1]), Math.max(p[1], q[1]), g.lineWidth * scale()]);
            else if (Math.abs(p[1] - q[1]) < 1 && Math.abs(p[0] - q[0]) > long) across.push((p[1] + q[1]) / 2);
          }
        }
        if (isFill) {
          // A filled thin box is a drawn line.
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
          if (x1 - x0 < 2.5 && y1 - y0 > 4) segs.push([(x0 + x1) / 2, y0, y1, x1 - x0]);
          else if (y1 - y0 < 2.5 && x1 - x0 > long) across.push((y0 + y1) / 2);
        }
      }
    }
  });

  const result = { width: vp.width, height: vp.height, segs, across: across.sort((a, b) => a - b), pictured };
  if (chars.some((c) => c.c !== ' ') || music) return { ...result, chars, music };
  return { ...result, ...(await textItems(page, at, fontOf)) };
}

/** The page's characters from pdf.js's text content, each run of text split evenly (when the drawing operations gave none). */
async function textItems(page: PdfJsPage, at: (x: number, y: number) => [number, number], fontOf: (id: string) => { name: string }) {
  const content = await page.getTextContent({ disableNormalization: true });
  const chars: PdfChar[] = [];
  let music = 0;
  for (const raw of content.items) {
    const it = raw as PdfTextItem;
    if (typeof it.str !== 'string' || !it.str) continue;
    const t = it.transform;
    const [x, y] = at(t[4], t[5]);
    const [ax, ay] = at(t[4] + t[0], t[5] + t[1]);
    const len = Math.hypot(ax - x, ay - y);
    if (!len || Math.abs(ay - y) > 0.1 * len) continue; // sideways text (labels down the margin)
    const glyphs = Array.from(it.str);
    if (MUSIC_FONT.test(fontOf(it.fontName).name)) {
      music += glyphs.length;
      continue;
    }
    const size = Math.hypot(t[2], t[3]);
    const step = it.width / glyphs.length;
    glyphs.forEach((g, i) => chars.push({ c: /\s/.test(g) ? ' ' : g, x0: x + i * step, x1: x + (i + 1) * step, y, size, mark: '' }));
  }
  return { chars, music };
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
/** A small letter, as notes are (a capital beside the music is a part's name, which takes no octave mark). */
const isSmallLetter = (c: string) => c !== c.toUpperCase();

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Rows by baseline, each sorted left to right, with its baseline and type
 * size. Rows are made from the visible characters; each space then joins
 * the row it sits on (spaces can be set tiny, between two rows).
 */
function cluster(chars: PdfChar[]): { rows: PdfChar[][]; base: number[]; size: number[] } {
  let rows: PdfChar[][] = [];
  let cur: PdfChar[] = [];
  for (const c of chars.filter((ch) => ch.c !== ' ').sort((a, b) => a.y - b.y)) {
    if (cur.length && c.y - cur[cur.length - 1].y > 0.3 * Math.min(c.size, cur[cur.length - 1].size)) {
      rows.push(cur);
      cur = [];
    }
    cur.push(c);
  }
  if (cur.length) rows.push(cur);
  const base = rows.map((r) => median(r.map((c) => c.y)));
  const size = rows.map((r) => median(r.map((c) => c.size)));
  for (const c of chars) {
    if (c.c !== ' ' || !rows.length) continue;
    let best = 0;
    for (let k = 1; k < rows.length; k++) if (Math.abs(base[k] - c.y) < Math.abs(base[best] - c.y)) best = k;
    if (Math.abs(base[best] - c.y) <= 0.5 * size[best]) rows[best].push(c);
  }
  rows = rows.map((r) => [...r].sort((a, b) => a.x0 - b.x0));
  return { rows, base, size };
}

const SOLFA_CHARS = new RegExp(`${NOTE}|[|¦:.,\\-–—/x!]`, 'g');
const NOTES = new RegExp(NOTE, 'g');

/**
 * Whether a row's text is sol-fa: almost all notes and marks, with at least
 * two notes or holds; or a part resting the whole line (only beat marks).
 */
export function isSolfa(text: string): boolean {
  const t = text.replace(/ /g, '');
  if (!t) return false;
  const colons = t.match(/:/g)?.length ?? 0;
  if (/^[:|¦/]+$/.test(t) && colons >= 2) return true;
  const rest = t.replace(SOLFA_CHARS, '');
  return (t.length - rest.length) / t.length > 0.85 && ((t.match(NOTES)?.length ?? 0) + (t.match(/-/g)?.length ?? 0) >= 2 || colons >= 3);
}

/**
 * Finds the rows, then octave marks: small figures or ticks just after a note
 * in a row of notes. Works on copies, so the page's characters can be read again.
 */
export function rowsOf(input: PdfChar[]) {
  if (!input.some((c) => c.c !== ' ')) return { rows: [] as PdfChar[][], base: [] as number[], size: [] as number[] };
  const chars = input.map((c) => ({ ...c }));
  const letters = chars.filter((c) => isSmallLetter(c.c));
  const near = (m: PdfChar, n: PdfChar) => m.x0 - n.x1 >= -1.5 && m.x0 - n.x1 < 0.5 * n.size && Math.abs(n.y - m.y) < 0.8 * n.size;
  // A small figure or tick right after a bigger letter (judged against that letter, not the page: some
  // sheets set their words smaller than their notes).
  const isCand = (m: PdfChar) => m.c in RAISED || m.c in LOWERED || (MARKISH.has(m.c) && letters.some((n) => m.size < 0.85 * n.size && near(m, n)));
  const cands = chars.filter(isCand);
  const others = chars.filter((c) => !isCand(c));
  const notes = cluster(others)
    .rows.filter((r) => isSolfa(r.map((c) => c.c).join('')))
    .flatMap((r) => r.filter((c) => isSmallLetter(c.c)));
  const leftovers: PdfChar[] = [];
  // A note with a mark reaches to the mark's right edge, so no gap is left where the mark was.
  const reach = new Map<PdfChar, number>();
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
    reach.set(note, Math.max(reach.get(note) ?? note.x1, m.x1));
  }
  for (const [note, x1] of reach) note.x1 = x1;
  const all = [...others, ...leftovers];
  const bridged = bridgesOf(all, notes);
  return cluster(all.filter((c) => !bridged.has(c)));
}

const SYLLABLE = /^(?:de|re|fe|se|le|ra|ma|lo|ta|ba|d|r|m|f|s|l|t)$/;

/**
 * Bridge notes, where the key changes: a note printed small and raised just
 * before a note in a row of notes is that note's name in the old key (ˢd, ᵈ'f).
 * Sets the note's `pre` ("s=") and gives the characters it took.
 */
function bridgesOf(chars: PdfChar[], notes: PdfChar[]): Set<PdfChar> {
  const used = new Set<PdfChar>();
  const ink = chars.filter((c) => c.c !== ' ');
  for (const n of notes) {
    const N = n.size;
    // Only before a note's first letter (not between the letters of "ta").
    if (ink.some((g) => g !== n && isSmallLetter(g.c) && g.size >= 0.75 * N && Math.abs(g.y - n.y) < 0.3 * N && g.x1 <= n.x0 + 0.5 && n.x0 - g.x1 < 0.25 * N)) continue;
    const last = ink
      .filter((g) => !used.has(g) && g !== n && g.size < 0.75 * N && g.size > 0.35 * N && g.x1 <= n.x0 + 0.15 * N && n.x0 - g.x1 < 0.5 * N && g.y < n.y - 0.12 * N && g.y > n.y - 0.9 * N)
      .sort((a, b) => b.x1 - a.x1)[0];
    if (!last) continue;
    // The small note, read leftwards: its letters and any octave marks, set tight together.
    const group = [last];
    for (;;) {
      const head = group[0];
      const before = ink.filter((g) => g !== head && g.x1 <= head.x0 + 0.5 && head.x0 - g.x1 < 0.35 * head.size && Math.abs(g.y - head.y) < 0.35 * head.size && g.size < 0.75 * N).sort((a, b) => b.x1 - a.x1)[0];
      if (!before || group.length >= 4) break;
      group.unshift(before);
    }
    const text = group.map((g) => g.c).join('');
    const syllable = [text.slice(0, 2), text.slice(0, 1)].find((t) => SYLLABLE.test(t));
    if (!syllable) continue;
    // What follows is its octave marks: ticks and raised figures go up; figures, and the "l" some fonts draw
    // for one, go down unless set raised.
    const first = group[0];
    let marks = '';
    for (const g of group.slice(syllable.length)) {
      const up = g.y < first.y - 0.12 * first.size;
      if ("'’ʼ¹".includes(g.c)) marks += "'";
      else if (g.c === '²') marks += "''";
      else if (g.c === '₁') marks += '1';
      else if (g.c === '₂') marks += '2';
      else if ('1lI'.includes(g.c)) marks += up ? "'" : '1';
      else if (g.c === '2') marks += up ? "''" : '2';
      else marks += '?';
    }
    if (!/^(?:'{0,2}|[12])$/.test(marks)) continue;
    n.pre = `${syllable}${marks}=`;
    for (const g of group) used.add(g);
  }
  return used;
}

// A drawn line goes through a row when it reaches from the row's letters (some
// sheets start their bar lines a little below the tops of the top row's letters) to its baseline.
const crosses = ([, top, bottom]: Seg, y: number, main: number) => top <= y - 0.4 * main && bottom >= y - 0.15 * main;

/** A drawn line through a row of notes: a bar line ("¦"), or a medium accent ("┆", a short line inside a bar). */
type Drawn = [number, number, number, '¦' | '┆'];

/** The row as typed, with drawn lines through it as "¦" (or "┆") and gaps as spaces. */
function rowText(row: PdfChar[], y: number, main: number, drawn: Drawn[]): string {
  const items: [number, number, string][] = row.map((c) => [c.x0, c.x1, (c.pre ?? '') + c.c + c.mark]);
  for (const s of drawn) if (crosses([s[0], s[1], s[2]], y, main)) items.push([s[0] - 0.01, s[0] + 0.01, s[3]]);
  // By the middle of each character: a line drawn right at a letter's left edge comes before it.
  items.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  let out = '';
  let prev: number | null = null;
  let lastBar: number | null = null;
  for (const [x0, x1, s] of items) {
    if (s === '¦' || s === '┆') {
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
  t = t.replace(/\|/g, drawnBars ? '/' : '|').replace(/¦/g, '|').replace(/┆/g, '/');
  t = t.replace(/\.{2,}/g, '.').replace(/,{2,}/g, ','); // a dot or comma printed several times over
  t = t.replace(/\s+'/g, "'"); // "d '" is d'
  t = t.replace(/([a-z]),(?=[\s:./|]|$)/g, (_, n: string) => `${n}1`); // "t," (a comma after a note, not before one) is the low t1
  t = t.replace(DYNAMICS, '$1 ');
  t = t.replace(/(^|[^\w'])\d+(?![\w'])/g, '$1 '); // bar numbers
  t = t.replace(/-{2,}/g, '-');
  t = t.replace(/\b([dfrlstm])\s+([ae])\b/g, '$1$2'); // "t a" spaced out is ta
  t = t.replace(/\b([a-z]{1,2})11(?![\d'])/g, (_, n: string) => `${n}2`); // two low marks: two octaves down
  t = t.replace(/\s*\|\s*/g, ' | ').replace(/\s*\/\s*/g, ' / ').trim();
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
// A tempo or metronome mark printed between lines ("Andante. M. 70"): not words.
const TEMPO = /\b(?:Largo|Larghetto|Lento|Adagio|Andante|Andantino|Moderato|Allegretto|Allegro|Vivace|Presto|Maestoso|Grave)\b|\bM\.\s*M?\.?\s*=?\s*\d{2,3}\b/;
const PART_LABEL = /^(?:Solo|Soprano|Sop|Alto|Tenor|Ten|Bass|S|A|T|B)[.:]?$/;

/**
 * How many characters at the start of a row are a part's name printed beside
 * the music ("S", "Alto:"), set bigger than the row or standing left of where
 * the music starts (`x0`); -1 when that's all the row has, 0 when there's none.
 */
function labelAt(row: PdfChar[], x0: number | null): number {
  let i = 0;
  while (i < row.length && row[i].c === ' ') i++;
  let j = i;
  // The name ends at a gap or a change of type size (a big "B" set tight against the bass's first note).
  while (j < row.length && row[j].c !== ' ' && (j === i || (row[j].x0 - row[j - 1].x1 < 0.3 * row[j].size && Math.abs(row[j].size - row[i].size) <= 0.15 * row[i].size))) j++;
  const token = row.slice(i, j);
  if (!token.length || !PART_LABEL.test(token.map((c) => c.c).join(''))) return 0;
  const rest = row.slice(j).filter((c) => c.c !== ' ');
  if (!rest.length) return -1;
  const end = token[token.length - 1].x1;
  const big = median(token.map((c) => c.size)) >= 1.15 * median(rest.map((c) => c.size));
  const apart = x0 !== null && end <= x0 - 1 && rest[0].x0 - end >= 0.5 * rest[0].size;
  return big || apart ? j : 0;
}

/**
 * The drawn lines through a line of music's rows of notes, as bar lines or
 * medium accents (a 4/4 bar's half-bar line). Where long lines run down
 * through several rows and short ones are drawn inside single rows between
 * them, the long ones are the bar lines; in a line of one row, the thick
 * ones are (thin ones between them are the accents).
 */
function drawnLines(notes: { y: number; main: number }[], segs: Seg[], x0: number, x1: number, main: number): Drawn[] {
  const through = segs.map((s) => [s, notes.filter((n) => crosses(s, n.y, n.main)).length] as const).filter(([, k]) => k > 0);
  const places = (list: Seg[]) =>
    list
      .map((s) => s[0])
      .sort((a, b) => a - b)
      .filter((x, i, xs) => i === 0 || x - xs[i - 1] >= 2);
  /** The accents, when `isBar` splits the lines the way a sheet would: bar lines inside the music with a few lines between them. */
  const accentsBy = (isBar: (s: Seg, k: number) => boolean): Set<Seg> | null => {
    const bars = places(through.filter(([s, k]) => isBar(s, k)).map(([s]) => s));
    const inside = bars.filter((x) => x > x0 + main && x < x1 - main);
    // Lines well inside the music only: a brace or bracket drawn at the edges isn't one (a last note's
    // octave mark can reach past it).
    const between = places(through.filter(([s, k]) => !isBar(s, k)).map(([s]) => s)).filter((x) => x > x0 + 0.5 * main && x < x1 - 0.5 * main && !bars.some((b) => Math.abs(b - x) < 2));
    if (!inside.length || !between.length) return null;
    // A medium accent in most bars and never two in one, as on a sheet in 4/4 or 6/8 (a stray short line isn't one).
    const edges = [x0, ...inside, x1];
    const perBar = edges.slice(1).map((end, k) => between.filter((x) => x > edges[k] && x < end).length);
    if (perBar.some((n) => n > 1) || perBar.filter((n) => n === 1).length < 0.6 * perBar.length) return null;
    return new Set(through.filter(([s, k]) => !isBar(s, k) && between.some((x) => Math.abs(x - s[0]) < 2)).map(([s]) => s));
  };
  const heaviest = Math.max(0, ...through.map(([s]) => s[3] ?? 0));
  const accents = accentsBy((_, k) => k >= 2) ?? (heaviest > 0 ? accentsBy((s) => (s[3] ?? 0) > 0.5 * heaviest) : null) ?? new Set<Seg>();
  return through.map(([s]) => [s[0], s[1], s[2], accents.has(s) ? '┆' : '¦']);
}

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
    // Each system's rows of notes, written out once all its rows are known (the drawn lines depend on them all).
    const noteRows = new Map<System, { at: number; row: PdfChar[]; y: number; main: number }[]>();
    rows.forEach((whole, i) => {
      const y = base[i];
      const main = size[i];
      const label = labelAt(whole, cur ? cur.x0 : null);
      if (label < 0) return; // a part's name on a row of its own
      const r = label ? whole.slice(label) : whole;
      const plain = rowText(r, y, main, []);
      const gap = lastY !== null ? y - lastY : 1e9;
      const ink = r.filter((c) => c.c !== ' ');
      const solfa = isSolfa(plain);
      if (cur && !solfa && ink.length <= 3 && main < 0.7 * cur.main) return; // a stray small figure
      if (solfa) {
        if (!cur || gap > 2.6 * main) {
          cur = { rows: [], ys: [], main, page: number, x0: 1e9, x1: 0 };
          pageSystems.push(cur);
          noteRows.set(cur, []);
        }
        cur.x0 = Math.min(cur.x0, ink[0].x0);
        cur.x1 = Math.max(cur.x1, ink[ink.length - 1].x1);
        noteRows.get(cur)?.push({ at: cur.rows.length, row: r, y, main });
        cur.rows.push(['n', '']);
        cur.ys.push(y);
        lastY = y;
      } else if (cur && gap <= 2.6 * main && WORDISH.test(plain) && !/^[\d\s]+$/.test(plain) && !TEMPO.test(plain)) {
        cur.rows.push(['w', plain]);
        cur.ys.push(y);
        lastY = y;
      } else {
        if (!systems.length && !pageSystems.length) header.push(plain);
        if (gap > 2.6 * main) cur = null;
      }
    });
    for (const s of pageSystems) {
      const notes = noteRows.get(s) ?? [];
      const drawn = drawnLines(notes, segs, s.x0, s.x1, s.main);
      for (const n of notes) {
        const ruled = drawn.some((d) => crosses([d[0], d[1], d[2]], n.y, n.main));
        s.rows[n.at] = ['n', toAbu(ruled ? rowText(n.row, n.y, n.main, drawn) : rowText(n.row, n.y, n.main, []), ruled)];
      }
      systems.push(...splitTall(s, across));
    }
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
