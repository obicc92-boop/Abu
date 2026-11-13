import { describe, expect, it } from '@jest/globals';

import { headerInfo, isSolfa, pageText, readTypedSheet, toAbu, type PageText, type PdfChar, type Seg } from '../pdf-text';

/** Characters typed along a baseline, each `w` points wide (like a monospaced font). */
function typed(text: string, x: number, y: number, size = 12, w = 6): PdfChar[] {
  return Array.from(text).map((c, i) => ({ c: c === ' ' ? ' ' : c, x0: x + i * w, x1: x + (i + 1) * w, y, size, mark: '' }));
}

function page(chars: PdfChar[], segs: Seg[] = [], across: number[] = []): PageText {
  return { width: 612, height: 792, chars, segs, across, music: 0, pictured: 0 };
}

describe('rows of notes as typed', () => {
  it('tells sol-fa from words', () => {
    expect(isSolfa('d :r |m :f')).toBe(true);
    expect(isSolfa('s1 :- .s1 |d :-')).toBe(true);
    expect(isSolfa('O come let us sing')).toBe(false);
  });

  it('writes a row in Abụ’s format', () => {
    // Without a table, a typed "|" is a bar line.
    expect(toAbu('d :r |m :f', false)).toBe('d :r | m :f |');
    // In a table, the borders (¦) are the bars and a typed "|" is the medium accent.
    expect(toAbu('¦d :r |m :f ¦s :- |- :- ¦', true)).toBe('d :r / m :f | s :- / - :- |');
    // "t," is the low t1; bar numbers and dynamics go.
    expect(toAbu('12 t, :d |mf r :m', false)).toBe('t1 :d | r :m |');
    // A part's name printed before the row goes; a row starting with the note s stays.
    expect(toAbu('¦S ¦d :r |m :f ¦', true)).toBe('d :r / m :f |');
    expect(toAbu('Alto: d :r |m :f', false)).toBe('d :r | m :f |');
    expect(toAbu('s :d |m :f', false)).toBe('s :d | m :f |');
  });

  it('reads the key and time from the heading', () => {
    expect(headerInfo(['AMAZING LOVE', 'Key E Time 3/4'])).toEqual({ key: 'E', time: '3/4' });
    expect(headerInfo(['Doh is B♭'])).toEqual({ key: 'Bb', time: '' });
  });
});

describe('a typed sheet', () => {
  // A heading, then one line of music in a table: four parts with words under the alto.
  const borders: Seg[] = [100, 196, 292].map((x) => [x, 140, 220]);
  const chars = [
    ...typed('OLD HUNDREDTH', 200, 60, 20, 10),
    ...typed('Doh is G   Time 4/4', 100, 90),
    ...typed('d :- |d :t', 106, 150),
    ...typed('l :s |d :r', 202, 150),
    ...typed('s :- |l :s', 106, 164),
    ...typed('m :m |s :t', 202, 164),
    ...typed('All peo-ple that', 106, 178),
    ...typed('m :- |f :r', 106, 192),
    ...typed('d :d |m :r', 202, 192),
    ...typed('d :- |f :s', 106, 206),
    ...typed('l :m |d :s', 202, 206),
  ];

  it('reads each line as parts and words, with the heading', () => {
    const sheet = readTypedSheet([page(chars, borders)]);
    expect(sheet.title).toBe('OLD HUNDREDTH');
    expect(sheet.key).toBe('G');
    expect(sheet.time).toBe('4/4');
    expect(sheet.lines).toHaveLength(1);
    const [line] = sheet.lines;
    expect(line.parts).toEqual(['S', 'A', 'T', 'B']);
    expect(line.words).toBe(1);
    expect(line.text.split('\n')).toEqual(['S  d :- / d :t | l :s / d :r |', 'A  s :- / l :s | m :m / s :t |', 'W  All peo-ple that', 'T  m :- / f :r | d :d / m :r |', 'B  d :- / f :s | l :m / d :s |']);
    // Where it's printed, for the picture beside the reading.
    expect(line.page).toBe(0);
    expect(line.box[1]).toBeLessThan(150);
    expect(line.box[3]).toBeGreaterThan(206);
  });

  it('turns small raised and lowered figures into octave marks', () => {
    const row = [
      ...typed('d', 100, 150),
      { c: '1', x0: 106, x1: 109, y: 146, size: 7, mark: '' }, // raised: d'
      ...typed(' :t', 109, 150),
      { c: '1', x0: 127, x1: 130, y: 153, size: 7, mark: '' }, // lowered: t1
      ...typed(' |d :r', 130, 150),
    ];
    const sheet = readTypedSheet([page([...row, ...typed('m :f |s :l', 100, 164)])]);
    expect(sheet.lines[0].text.split('\n')[0]).toBe("S  d' :t1 | d :r |");
  });

  it('moves an upbeat printed at the start of the next line back where it belongs', () => {
    // Two lines of one part, far apart; the second starts with the upbeat "s" that the first left room for.
    const lines = [...typed('d :r |m :- |r :', 100, 150), ...typed('s |l :t |d :-', 100, 250)];
    const sheet = readTypedSheet([page(lines)]);
    expect(sheet.lines.map((l) => l.text)).toEqual(['S  d :r | m :- | r :s |', 'S  l :t | d :- |']);
  });

  it('reads nothing from a page with no sol-fa', () => {
    expect(readTypedSheet([page(typed('Programme for Sunday', 100, 100))]).lines).toEqual([]);
  });
});

describe('drawn bar lines', () => {
  // Four bars' worth of notes in two rows; lines drawn at the edges, between bars 2 and 3, and inside bars.
  const groups = (y: number, notes: string[]) => notes.flatMap((n, i) => typed(n, [106, 150, 200, 250][i], y));
  const rows = [...groups(150, ['d :r', 'm :f', 's :l', 't :d']), ...groups(178, ['d :d', 'd :d', 'm :m', 's :m'])];

  it('reads long lines through every row as bar lines and short ones inside a row as half-bar lines', () => {
    const long: Seg[] = [100, 190, 290].map((x) => [x, 138, 186]);
    const short: Seg[] = [140, 240].flatMap((x) => [[x, 138, 154], [x, 166, 182]] as Seg[]);
    const [line] = readTypedSheet([page(rows, [...long, ...short])]).lines;
    expect(line.text.split('\n')).toEqual(['S  d :r / m :f | s :l / t :d |', 'A  d :d / d :d | m :m / s :m |']);
  });

  it('in a line of one row, reads thick lines as bar lines and thin ones as half-bar lines', () => {
    const thick: Seg[] = [100, 190, 290].map((x) => [x, 140, 160, 1.5]);
    const thin: Seg[] = [140, 240].map((x) => [x, 140, 155, 0.5]);
    const [line] = readTypedSheet([page(groups(150, ['d :r', 'm :f', 's :l', 't :d']), [...thick, ...thin])]).lines;
    expect(line.text).toBe('S  d :r / m :f | s :l / t :d |');
  });

  it('keeps a short line as a bar line when bars don’t have one each (3/4, with one border drawn row by row)', () => {
    const three = (y: number) => [...typed('d :r :m', 106, y), ...typed('f :s :l', 166, y), ...typed('t :d :r', 226, y)];
    const long: Seg[] = [100, 160, 280].map((x) => [x, 138, 186]);
    const short: Seg[] = [[220, 138, 154], [220, 166, 182]];
    const [line] = readTypedSheet([page([...three(150), ...three(178)], [...long, ...short])]).lines;
    expect(line.text.split('\n')[0]).toBe('S  d :r :m | f :s :l | t :d :r |');
  });

  it('starts a line’s bar lines a little below the tops of the top row’s letters', () => {
    // The bar lines start at 143: the top row's letters reach 141.6 (its baseline is 150).
    const long: Seg[] = [100, 190, 290].map((x) => [x, 143, 186]);
    const [line] = readTypedSheet([page(rows, long)]).lines;
    expect(line.text.split('\n')[0]).toBe('S  d :r m :f | s :l t :d |');
  });
});

describe('what isn’t music', () => {
  it('leaves out the parts’ names printed beside the music, but not a word that looks like one', () => {
    const big = (c: string, y: number): PdfChar => ({ c, x0: 80, x1: 92, y, size: 20, mark: '' });
    const sheet = readTypedSheet([
      page([
        ...typed('d :r |m :f', 106, 150),
        big('S', 165), // set bigger, on the words' baseline
        ...typed('Glo-ry be to', 106, 166),
        ...typed('d :d |d :d', 106, 190),
        big('A', 200), // on a row of its own
        ...typed('A men to all', 106, 206),
      ]),
    ]);
    expect(sheet.lines[0].text.split('\n')).toEqual(['S  d :r | m :f |', 'W  Glo-ry be to', 'A  d :d | d :d |', 'W  A men to all']);
  });

  it('gives a big part name set tight against the first note no octave mark', () => {
    const chars = [{ c: 'B', x0: 80, x1: 90, y: 151, size: 16, mark: '' }, ...typed('l,s.f,m :r.s', 91, 150, 9, 5)];
    expect(readTypedSheet([page(chars)]).lines[0].text).toBe('S  l,s.f,m :r.s |');
  });

  it('keeps a part resting for the whole line', () => {
    const sheet = readTypedSheet([page([...typed('d :r |m :f', 106, 150), ...typed(':   |:   ', 106, 164)])]);
    expect(sheet.lines[0].text.split('\n')).toEqual(['S  d :r | m :f |', 'A  : | : |']);
  });

  it('reads a dot or comma printed several times over as one', () => {
    expect(toAbu('d....t1,,,,l1 :s', false)).toBe('d.t1,l1 :s |');
  });

  it('reads the same page twice alike (octave marks aren’t added twice)', () => {
    const p = page([...typed('d', 100, 150), { c: '1', x0: 106, x1: 109, y: 146, size: 7, mark: '' }, ...typed(' :r |m :f', 109, 150), ...typed('m :f |s :l', 100, 164)]);
    expect(readTypedSheet([p]).lines[0].text).toBe(readTypedSheet([p]).lines[0].text);
    expect(readTypedSheet([p]).lines[0].text.split('\n')[0]).toBe("S  d' :r | m :f |");
  });
});

describe('a PDF page as pdf.js draws it', () => {
  const OPS = { save: 1, restore: 2, clip: 4, constructPath: 5, endPath: 6, beginText: 7, endText: 8, setFont: 9, setTextMatrix: 10, showText: 11, setTextRenderingMode: 12, fill: 13, stroke: 14 };
  const glyph = (unicode: string, width: number) => ({ unicode, width });
  const text = (x: number, y: number, glyphs: unknown[]) => [
    [OPS.beginText, null],
    [OPS.setFont, ['F1', 12]],
    [OPS.setTextMatrix, [[1, 0, 0, 1, x, y]]],
    [OPS.showText, [glyphs]],
    [OPS.endText, null],
  ];
  const ops = [
    ...text(100, 650, [glyph('d', 500), glyph('.', 250), glyph('r', 400)]),
    // A figure clipped away (the clip box is elsewhere on the page): it isn't seen, so it isn't read.
    [OPS.save, null],
    [OPS.clip, null],
    [OPS.constructPath, [OPS.endPath, [null], [0, 0, 50, 50]]],
    ...text(120, 655, [glyph('1', 500)]),
    [OPS.restore, null],
    // A kerning step between two glyphs (in thousandths of the type size).
    ...text(200, 650, [glyph('m', 600), -500, glyph('f', 500)]),
    // Invisible text.
    [OPS.setTextRenderingMode, [3]],
    ...text(300, 650, [glyph('x', 500)]),
    [OPS.setTextRenderingMode, [0]],
    // A thin filled box: a drawn line, 0.5 wide.
    [OPS.constructPath, [OPS.fill, [new Float32Array([0, 150, 640, 1, 150.5, 640, 1, 150.5, 660, 1, 150, 660, 4])], [150, 640, 150.5, 660]]],
  ] as [number, unknown][];
  const fake = {
    getViewport: () => ({ width: 600, height: 800, convertToViewportPoint: (x: number, y: number) => [x, 800 - y] }),
    getTextContent: async () => ({ items: [] }),
    getOperatorList: async () => ({ fnArray: ops.map(([fn]) => fn), argsArray: ops.map(([, args]) => args) }),
    commonObjs: { has: (id: string) => id === 'F1', get: () => ({ name: 'Arial', fontMatrix: [0.001, 0, 0, 0.001, 0, 0] }) },
  };

  it('places each glyph by its own width, leaving out hidden text, and finds drawn lines with their weight', async () => {
    const p = await pageText(fake, OPS);
    const ink = p.chars.filter((c) => c.c !== ' ');
    expect(ink.map((c) => c.c).join('')).toBe('d.rmf');
    expect(ink.map((c) => Math.round(c.x0 * 10) / 10)).toEqual([100, 106, 109, 200, 213.2]);
    expect(ink.every((c) => c.y === 150 && c.size === 12)).toBe(true);
    expect(p.segs).toEqual([[150.25, 140, 160, 0.5]]);
  });
});
