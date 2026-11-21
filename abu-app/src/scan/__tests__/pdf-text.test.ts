import { describe, expect, it } from '@jest/globals';

import { dynamicsOnly, headerInfo, isSolfa, pageText, readTypedSheet, tempoPrinted, toAbu, type PageText, type PdfChar, type Seg } from '../pdf-text';
import { parseSolfa } from '@/solfa';

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

  it('writes a row in SolfaScores’ format', () => {
    // Without a table, a typed "|" is a bar line.
    expect(toAbu('d :r |m :f', false)).toBe('d :r | m :f |');
    // In a table, the borders (¦) are the bars and a typed "|" is the medium accent.
    expect(toAbu('¦d :r |m :f ¦s :- |- :- ¦', true)).toBe('d :r / m :f | s :- / - :- |');
    // "t," is the low t1; bar numbers go, and dynamics are kept in braces before their note.
    expect(toAbu('12 t, :d |mf r :m', false)).toBe('t1 :d | {mf}r :m |');
    // A part's name printed before the row goes; a row starting with the note s stays.
    expect(toAbu('¦S ¦d :r |m :f ¦', true)).toBe('d :r / m :f |');
    expect(toAbu('Alto: d :r |m :f', false)).toBe('d :r | m :f |');
    expect(toAbu('s :d |m :f', false)).toBe('s :d | m :f |');
  });

  it('reads the key and time from the heading', () => {
    expect(headerInfo(['AMAZING LOVE', 'Key E Time 3/4'])).toEqual({ key: 'E', time: '3/4', tempo: '' });
    expect(headerInfo(['Doh is B♭'])).toEqual({ key: 'Bb', time: '', tempo: '' });
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

  it('doesn’t take a brace drawn at a line’s edge for a half-bar line (a last octave mark can reach past it)', () => {
    const long: Seg[] = [100, 190].map((x) => [x, 138, 186]);
    const short: Seg[] = [140, 240, 273].flatMap((x) => [[x, 138, 154], [x, 166, 182]] as Seg[]);
    const [line] = readTypedSheet([page(rows, [...long, ...short])]).lines;
    expect(line.text.split('\n')).toEqual(['S  d :r / m :f | s :l / t :d |', 'A  d :d / d :d | m :m / s :m |']);
  });

  it('starts a line’s bar lines a little below the tops of the top row’s letters', () => {
    // The bar lines start at 143: the top row's letters reach 141.6 (its baseline is 150).
    const long: Seg[] = [100, 190, 290].map((x) => [x, 143, 186]);
    const [line] = readTypedSheet([page(rows, long)]).lines;
    expect(line.text.split('\n')[0]).toBe('S  d :r m :f | s :l t :d |');
  });
});

describe('bridge notes', () => {
  const small = (c: string, x0: number, y: number) => ({ c, x0, x1: x0 + 3.5, y, size: 7, mark: '' });

  it('reads a small note raised just before a note as its name in the old key', () => {
    const sheet = readTypedSheet([
      page([
        small('s', 101, 145.5), // ˢd
        ...typed('d :r |m :f', 106, 150),
        small('d', 98, 159.5), // ᵈ'f, with its own octave mark
        { c: '’', x0: 101.5, x1: 103.5, y: 159.5, size: 7, mark: '' },
        ...typed('f :m |r :d', 106, 164),
      ]),
    ]);
    expect(sheet.lines[0].text.split('\n')).toEqual(['S  s=d :r | m :f |', "A  d'=f :m | r :d |"]);
  });

  it('reads the “l” some fonts draw for a low mark, and never puts a bridge note inside “ta”', () => {
    const sheet = readTypedSheet([
      page([
        small('d', 97, 145.5), // ᵈˡs: the small note is d1
        small('l', 100.5, 145.5),
        ...typed('s :m |r :d', 106, 150),
        ...typed('ta :m |r :d', 106, 164),
        small('t', 107.5, 159.5), // a small t over "ta", by its second letter
      ]),
    ]);
    expect(sheet.lines[0].text.split('\n')).toEqual(['S  d1=s :m | r :d |', 'A  ta :m | r :d |']);
  });
});

describe('bar lines lined up by where they are printed', () => {
  it('gives a part with nothing printed in a bar a rest there (as an alternative reading)', () => {
    const long: Seg[] = [100, 160, 220, 280].map((x) => [x, 138, 186]);
    const rows = [...typed('d :r', 116, 150), ...typed('m :f', 176, 150), ...typed('s :l', 236, 150), ...typed('m :f', 176, 178), ...typed('s :l', 236, 178)];
    const [line] = readTypedSheet([page(rows, long)]).lines;
    expect(line.text.split('\n')).toEqual(['S  d :r | m :f | s :l |', 'A  m :f | s :l |']);
    expect(line.lined?.split('\n')).toEqual(['S  d :r | m :f | s :l |', 'A  : | m :f | s :l |']);
  });

  it('puts in a bar line where a part’s notes run across one the other parts have', () => {
    const row = (y: number, a: string, b: string, c: string, mid: boolean) => [...typed(a, 100, y), ...(mid ? typed('|', 140, y) : []), ...typed(b, 150, y), ...typed('|', 190, y), ...typed(c, 200, y), ...typed('|', 230, y)];
    const [line] = readTypedSheet([page([...row(150, 'd :r', 'm :f', 's :l', true), ...row(178, 'd :t1', 'm :r', 'd :-', false), ...row(206, 'm :s', 's :l', 'm :-', true)])]).lines;
    expect(line.text.split('\n')[1]).toBe('A  d :t1 m :r | d :- |');
    expect(line.lined?.split('\n')[1]).toBe('A  d :t1 | m :r | d :- |');
  });

  it('never pads a part that stops early, or one with a bar of notes, with rests', () => {
    const long: Seg[] = [100, 160, 220, 280].map((x) => [x, 138, 186]);
    // The alto has notes only in the first bar (another row may have taken the rest of its notes).
    const rows = [...typed('d :r', 116, 150), ...typed('m :f', 176, 150), ...typed('s :l', 236, 150), ...typed('d :t1', 116, 178)];
    expect(readTypedSheet([page(rows, long)]).lines[0].lined).toBeUndefined();
  });
});

describe('how typists write', () => {
  it('reads box-drawing bars as typed bars, and "ǀ" after a note as a low octave mark', () => {
    const sheet = readTypedSheet([page([...typed('r :- │m :m | f :m │r :- |', 100, 150), ...typed('sǀ :- │- :s | sǀ :m │r :- |', 100, 164)])]);
    expect(sheet.lines[0].text.split('\n')).toEqual(['S  r :- | m :m | f :m | r :- |', 'A  s1 :- | - :s | s1 :m | r :- |']);
  });

  it('leaves out labels printed among the notes', () => {
    expect(toAbu('d :r |m :f | CH |', false)).toBe('d :r | m :f |');
    expect(toAbu('A d1 :r1 |Verse m :f', false)).toBe('d1 :r1 | m :f |');
    // Divided parts' names ("S1", "S2") too.
    expect(toAbu('S1 m :m |s :s', false)).toBe('m :m | s :s |');
    expect(toAbu('d :r |S2 m :f', false)).toBe('d :r | m :f |');
  });

  it('reads a tall typed "|" as a bar line and one as tall as the notes as a half-bar', () => {
    const tall = (x: number, y: number): PdfChar => ({ c: '|', x0: x, x1: x + 3, y, size: 20, mark: '' });
    const row = (y: number) => [tall(94, y), ...typed('m :m |- :-', 100, y), tall(164, y), ...typed('r :r |- :-', 170, y)];
    const [line] = readTypedSheet([page(row(150))]).lines;
    expect(line.text).toBe('S  m :m / - :- | r :r / - :- |');
  });

  it('takes a bar line that stops just above a row of dots as going through it', () => {
    const dots = (y: number) => [...typed('. : . : .', 106, y), ...typed('. : . : .', 166, y)];
    // The bass row is only dots and colons; the bar lines end 3 points above its baseline.
    const long: Seg[] = [100, 160, 220].map((x) => [x, 138, 175]);
    const [line] = readTypedSheet([page([...typed('d :r :m', 106, 150), ...typed('f :s :l', 166, 150), ...dots(178)], long)]).lines;
    expect(line.text.split('\n')).toEqual(['S  d :r :m | f :s :l |', 'A  . : . : . | . : . : . |']);
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
    // A thin filled box across, under "d.r": an underline.
    [OPS.constructPath, [OPS.fill, [new Float32Array([0, 100, 648, 1, 113, 648, 1, 113, 648.5, 1, 100, 648.5, 4])], [100, 648, 113, 648.5]]],
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
    expect(p.unders?.map((u) => u.map((v) => Math.round(v * 10) / 10))).toEqual([[100, 113, 151.8]]);
  });
});

describe('a new key printed partway through', () => {
  const lineOf = (y: number) => [...typed('d :- |d :t | l :s |d :r', 106, y), ...typed('s :- |l :s | m :m |s :t', 106, y + 14)];
  const heading = typed('Doh is G   Time 4/4', 106, 90);

  it('starts the line printed just below it, and isn’t read as words', () => {
    const sheet = readTypedSheet([page([...heading, ...lineOf(150), ...typed('Key A', 106, 200), ...lineOf(220)])]);
    expect(sheet.key).toBe('G');
    expect(sheet.lines.map((l) => l.key)).toEqual([undefined, 'A']);
    expect(sheet.lines.map((l) => l.text).join('\n')).not.toContain('Key');
    const flat = readTypedSheet([page([...heading, ...lineOf(150), ...typed('Doh is E flat', 106, 200), ...lineOf(220)])]);
    expect(flat.lines[1].key).toBe('E♭');
  });

  it('isn’t a key over the middle of a line, or in the words', () => {
    const middle = readTypedSheet([page([...heading, ...lineOf(150), ...typed('Key A', 200, 200), ...lineOf(220)])]);
    expect(middle.lines[1].key).toBeUndefined();
    const words = readTypedSheet([page([...heading, ...lineOf(150), ...typed('Open the key And sing', 106, 178)])]);
    expect(words.lines[0].key).toBeUndefined();
    expect(words.lines[0].text).toContain('Open the key And sing');
  });
});

describe('musical markings in a typed sheet', () => {
  const lineOf = (y: number) => [...typed('d :- |d :t | l :s |d :r', 106, y), ...typed('s :- |l :s | m :m |s :t', 106, y + 14)];

  it('finds the tempo printed in the heading, as printed', () => {
    expect(headerInfo(['COMFORT YE', 'Doh is E   Larghetto, M. 79'])).toEqual({ key: 'E', time: '', tempo: 'Larghetto, M. 79' });
    expect(headerInfo(['THE LORD IS MY SHEPHERD', 'Andante. M. 70', 'Doh is G   Time 4/4'])).toEqual({ key: 'G', time: '4/4', tempo: 'Andante. M. 70' });
    expect(headerInfo(['Key F', 'M.M. ♩ = 72']).tempo).toBe('♩ = 72');
    expect(headerInfo(['ALLEGRO MODERATO', 'Doh is D']).tempo).toBe('ALLEGRO MODERATO');
    expect(headerInfo(['Ave Maria', 'Moderato (M. 84)']).tempo).toBe('Moderato (M. 84)');
  });

  it('takes no tempo from running text or a title', () => {
    expect(tempoPrinted('Beyond the Grave')).toBe('');
    expect(tempoPrinted('Grave')).toBe('Grave');
    expect(tempoPrinted('Grave M. 40')).toBe('Grave M. 40');
    expect(tempoPrinted('sung andante by all')).toBe('');
    expect(tempoPrinted('Psalm 70, Matthew 5')).toBe('');
    expect(tempoPrinted('Key E Time 3/4')).toBe('');
  });

  it('gives the sheet its heading’s tempo, and the song plays at it', () => {
    const sheet = readTypedSheet([page([...typed('PSALM 23', 200, 60, 20, 10), ...typed('Doh is G   Andante. M. 70', 106, 90), ...lineOf(150)])]);
    expect(sheet.tempo).toBe('Andante. M. 70');
    expect(sheet.lines[0].text).not.toContain('Andante');
    expect(parseSolfa(`tempo: ${sheet.tempo}\n${sheet.lines[0].text}`).meta.tempo).toEqual({ text: 'Andante. M. 70', bpm: 70 });
  });

  it('starts a line with a tempo printed over it after the heading, for every part', () => {
    const heading = typed('Doh is G   Time 4/4', 106, 90);
    const sheet = readTypedSheet([page([...heading, ...lineOf(150), ...typed('Allegro  M. 120', 106, 200), ...lineOf(220)])]);
    expect(sheet.tempo).toBe('');
    expect(sheet.lines.map((l) => l.text.split('\n')[0])).toEqual(['S  d :- | d :t | l :s | d :r |', 'S  {Allegro M. 120}d :- | d :t | l :s | d :r |']);
    expect(sheet.lines[1].text.split('\n')[1]).toBe('A  s :- | l :s | m :m | s :t |');
    const song = parseSolfa(sheet.lines.map((l) => l.text).join('\n\n'), { time: '2/4' });
    expect(song.errors).toEqual([]);
    expect(song.expressions).toEqual([{ kind: 'tempo', text: 'Allegro M. 120', bpm: 120, part: null, beat: 8 }]);
    // Printed close under the line before, it's still not words.
    const close = readTypedSheet([page([...heading, ...lineOf(150), ...typed('MM = 72', 106, 186), ...lineOf(210)])]);
    expect(close.lines.map((l) => l.text)).toEqual(['S  d :- | d :t | l :s | d :r |\nA  s :- | l :s | m :m | s :t |', 'S  {MM 72}d :- | d :t | l :s | d :r |\nA  s :- | l :s | m :m | s :t |']);
    expect(parseSolfa(close.lines[1].text, { time: '2/4' }).expressions[0]).toMatchObject({ kind: 'tempo', bpm: 72 });
    // A row with words as well as a tempo word isn't a tempo.
    const words = readTypedSheet([page([...heading, ...lineOf(150), ...typed('Chorus, Allegro', 106, 200), ...lineOf(220)])]);
    expect(words.lines[1].text).not.toContain('{');
  });

  it('keeps dynamics typed among the notes, before their note', () => {
    expect(toAbu('mf d :r |p m :f', false)).toBe('{mf}d :r | {p}m :f |');
    expect(toAbu('d :- |cresc. r :m |dim. f :- ', false)).toBe('d :- | {cresc}r :m | {dim}f :- |');
    // "accel." isn't played yet: it goes, as before.
    expect(toAbu('accel. d :r', false)).toBe('d :r |');
    // A lone "f" may be fah: it stays a note.
    expect(toAbu('f :r |m :f', false)).toBe('f :r | m :f |');
    // One typed after the last note, for the line after, stays at the end.
    expect(toAbu('d :- |s :- | p', false)).toBe('d :- | s :- | {p} |');
  });

  it('reads a row of only dynamics between the parts as neither notes nor words', () => {
    expect(['mf', 'p   cresc.', 'pp', 'ff'].map(dynamicsOnly)).toEqual([true, true, true, true]);
    expect(['f', 'f f', 'd :r', 'O come', 'p and'].map(dynamicsOnly)).toEqual([false, false, false, false, false]);
    const rows = [
      ...typed('mf', 106, 140, 9),
      ...typed('d :- |d :t | l :s |d :r', 106, 150),
      ...typed('All peo-ple that on', 106, 164),
      ...typed('mf', 106, 176, 9),
      ...typed('s :- |l :s | m :m |s :t', 106, 186),
    ];
    const sheet = readTypedSheet([page([...typed('Doh is G   Time 4/4', 106, 90), ...rows])]);
    expect(sheet.lines[0].parts).toEqual(['S', 'A']);
    expect(sheet.lines[0].text.split('\n')).toEqual(['S  d :- | d :t | l :s | d :r |', 'W  All peo-ple that on', 'A  s :- | l :s | m :m | s :t |']);
  });
});

describe('slurs underlined in a typed sheet', () => {
  // A typist underlines the notes sung to one syllable; the PDF draws the underline as a short line just under them.
  const heading = typed('Doh is G   Time 2/4', 106, 90);
  const row = (text: string, y = 150) => typed(text, 106, y);
  /** The x where the n-th character of a row typed at 106 starts and ends (6 points each). */
  const at = (n: number) => 106 + n * 6;
  const sheet = (chars: PdfChar[], unders: [number, number, number][], segs: Seg[] = []) => readTypedSheet([{ ...page([...heading, ...chars], segs), unders }]);

  it('puts the notes over a short line just under them in brackets', () => {
    // "d :r.m |f :s" with "r.m" underlined (characters 3 to 5).
    const s1 = sheet(row('d :r.m |f :s'), [[at(3), at(6), 152]]);
    expect(s1.lines[0].text).toBe('S  d :(r.m) | f :s |');
    // Across a beat and a bar line: "s" to "m".
    const s2 = sheet(row('d :s |f :m'), [[at(3), at(10), 152.5]]);
    expect(s2.lines[0].text).toBe('S  d :(s | f :m) |');
    // The slur's notes after its first take no syllable.
    const song = parseSolfa(`time: 2/4\n${s2.lines[0].text}\nW  O come`);
    expect(song.events.S.filter((e) => e.lyric).map((e) => [e.text, e.lyric])).toEqual([
      ['d', 'O'],
      ['s', 'come'],
    ]);
  });

  it('keeps a note’s octave mark inside its slur, and joins an underline drawn in pieces', () => {
    expect(sheet(row("d :r.m' |f :s"), [[at(3), at(7), 152]]).lines[0].text).toBe("S  d :(r.m') | f :s |");
    expect(sheet(row('d :r.t, |f :s'), [[at(3), at(7), 152]]).lines[0].text).toBe('S  d :(r.t1) | f :s |');
    expect(sheet(row('d :r.m |f :s'), [[at(3), at(4.5), 152], [at(4.5), at(6), 152.2]]).lines[0].text).toBe('S  d :(r.m) | f :s |');
  });

  it('leaves out a line under one note, a word, a dynamic, or far below the notes', () => {
    expect(sheet(row('d :r.m |f :s'), [[at(3), at(4), 152]]).lines[0].text).toBe('S  d :r.m | f :s |');
    // A label typed among the notes ("Ref") underlined with them.
    expect(sheet(row('d :r.m.f |s :l.t.d Ref'), [[at(15), at(18), 152]]).lines[0].text).toBe('S  d :r.m.f | s :l.(t.d) |');
    expect(sheet(row('d :r.m.f |s :l.t.d Ref'), [[at(15), at(22), 152]]).lines[0].text).toBe('S  d :r.m.f | s :l.t.d |');
    expect(sheet(row('d :mf r |f :s'), [[at(3), at(5), 152]]).lines[0].text).toBe('S  d : {mf}r | f :s |');
    expect(sheet(row('d :r.m |f :s'), [[at(3), at(6), 158]]).lines[0].text).toBe('S  d :r.m | f :s |');
  });

  it('leaves out a table’s rules: a line across that meets a border, or one as long as a bar of eight beats', () => {
    const cells: Seg[] = [[at(0) - 2, 140, 154], [at(7) - 2, 140, 154]];
    expect(sheet(row('d :r.m |f :s'), [[at(0) - 2, at(7) - 2, 152]], cells).lines[0].text).not.toContain('(');
    expect(sheet(row('d :r :m :f :s :l :t :d :r :m'), [[at(0), at(29), 152]]).lines[0].text).not.toContain('(');
  });
});
