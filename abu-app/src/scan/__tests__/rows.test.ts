import { describe, expect, it } from '@jest/globals';

import { agreedBorders, barsFromBorders, barsFromTable, borderX, findRows, greedy, notesLikeness, ruledBorders, runsThrough, tableBorders, toText, type Border, type Gray } from '../rows';

/** A white picture with dark blocks standing in for rows of writing, and a table's lines. */
function picture(width: number, height: number, blocks: [number, number][], tableLines: number[] = []): Gray {
  const data = new Uint8Array(width * height).fill(255);
  for (const [top, bottom] of blocks)
    for (let y = top; y < bottom; y++)
      for (let x = 20; x < width - 20; x += 3) {
        data[y * width + x] = 0; // ink every third column, like letters
      }
  for (const x of tableLines) for (let y = 0; y < height; y++) data[y * width + x] = 0;
  return { data, width, height };
}

describe('finding rows', () => {
  it('finds each row of writing, ignoring the table’s lines', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [70, 90], [120, 140]], [10, 200, 390]));
    expect(rows.map((r) => [r.top, r.bottom])).toEqual([
      [19, 41],
      [69, 91],
      [119, 141],
    ]);
    expect(rows[0].left).toBe(20);
    expect(rows.every((r) => r.size === rows[0].size)).toBe(true);
  });

  it('drops thin bands like slurs under notes', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [44, 46], [80, 100]]));
    expect(rows).toHaveLength(2);
  });

  it('splits rows that touch when more are expected', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [40, 60]]), 2);
    expect(rows).toHaveLength(2);
  });

  it('splits a row twice as tall as the others, where two rows touch', () => {
    const rows = findRows(picture(400, 200, [[20, 40], [70, 110]]), 3, 2);
    expect(rows).toHaveLength(3);
  });

  it('doesn’t cut a row in half to find a row of words that isn’t in the picture', () => {
    // Two parts, one row of words expected, but the line's picture only holds the parts.
    const rows = findRows(picture(400, 200, [[20, 48], [70, 106]]), 3, 2);
    expect(rows.map((r) => [r.top, r.bottom])).toEqual([
      [19, 49],
      [69, 107],
    ]);
  });
});

/** A line drawn down a picture by hand: its x at each height, left out where `gap` says. */
function draw(img: Gray, xAt: (y: number) => number, gap: (y: number) => boolean = () => false) {
  for (let y = 0; y < img.height; y++) if (!gap(y)) img.data[y * img.width + Math.round(xAt(y))] = 0;
}

/** That the borders found run, within a pixel, from these x at the picture's top to these at its bottom. */
function expectBorders(borders: Border[], height: number, ends: [number, number][]) {
  expect(borders).toHaveLength(ends.length);
  borders.forEach((b, i) => {
    expect(Math.abs(borderX(b, 0) - ends[i][0])).toBeLessThanOrEqual(1);
    expect(Math.abs(borderX(b, height - 1) - ends[i][1])).toBeLessThanOrEqual(1);
  });
}

/** Borders that don't lean, at these places. */
const straight = (xs: number[]): Border[] => xs.map((x) => ({ x, y: 100, lean: 0 }));

/**
 * A row as read from a table with cells 100 px wide: each cell's tokens spread
 * across its middle, and between cells the mark read at the border, if any
 * ('' for none).
 */
function lay(...parts: string[]): { tokens: string[]; xs: number[] } {
  const tokens: string[] = [];
  const xs: number[] = [];
  parts.forEach((part, k) => {
    const cell = Math.floor(k / 2);
    const read = part.split(' ').filter(Boolean);
    read.forEach((t, i) => {
      tokens.push(t);
      xs.push(k % 2 ? (cell + 1) * 100 + 2 : cell * 100 + 20 + (i * 60) / Math.max(1, read.length - 1));
    });
  });
  return { tokens, xs };
}

describe('a sheet set in a table', () => {
  const ROWS: [number, number][] = [
    [20, 40],
    [70, 90],
    [120, 140],
  ];

  it('finds the table’s borders, not a “|” typed in a row', () => {
    // Borders at 10, 200 and 390 through the whole line; a typed bar at 100 in the first row only.
    const img = picture(400, 200, ROWS, [10, 200, 390]);
    for (let y = 18; y < 42; y++) img.data[y * 400 + 100] = 0;
    expect(tableBorders(img).map((b) => [b.x, b.lean])).toEqual([
      [10, 0],
      [200, 0],
      [390, 0],
    ]);
  });

  it('finds none when the line has no table', () => {
    expect(tableBorders(picture(400, 200, [[20, 40], [70, 90]]))).toEqual([]);
  });

  it('doesn’t take a “|” typed at the same place in every row for a border', () => {
    // Typed bars line up in the parts, but leave the space between the rows empty.
    const img = picture(400, 200, ROWS);
    for (const [top, bottom] of ROWS) for (let y = top - 2; y < bottom + 2; y++) img.data[y * 400 + 100] = 0;
    expect(tableBorders(img)).toEqual([]);
  });

  const PARTS: [number, number][] = [
    [10, 40],
    [50, 80],
    [125, 155],
    [165, 195],
  ];
  /**
   * A line of S, A, a row of words, T and B filling most of its height, in a table ruled at `ruled`:
   * each row's letters in their own places, with paper around each of `clear`.
   */
  const fullLine = (clear: number[], ruled = [10, 500, 990]) => {
    const img = picture(1000, 200, [], ruled);
    [...PARTS, [95, 115]].forEach(([top, bottom], k) => {
      for (let x0 = 30 + 7 * k; x0 < 960; x0 += 26) {
        if (clear.some((c) => x0 + 10 > c - 8 && x0 < c + 8)) continue;
        for (let y = top; y < bottom; y++) for (let x = x0; x < x0 + 10; x += 2) img.data[y * 1000 + x] = 0;
      }
    });
    return img;
  };

  it('doesn’t take a “|” written in each part for a border, even lined up to a pixel or two', () => {
    // A half-bar typed in each part's cell: tall enough together to run down 68% of the line, lined up
    // exactly at 700 and a pixel further right in each part at 300. Neither runs through the paper
    // between the rows, as the table's lines do.
    const typed = (img: Gray) => {
      PARTS.forEach(([top, bottom], k) => {
        for (let y = top - 2; y < bottom + 2; y++) {
          img.data[y * 1000 + 300 + k] = 0;
          img.data[y * 1000 + 700] = 0;
        }
      });
      return img;
    };
    expect(tableBorders(typed(fullLine([300, 303, 700]))).map((b) => b.x)).toEqual([10, 500, 990]);
    // Nor do they make a table of a line that has none.
    expect(tableBorders(typed(fullLine([300, 303, 700], [])))).toEqual([]);
  });

  it('doesn’t take a stroke drawn through two parts at a time for a border', () => {
    // Drawn by hand through S and A, then T and B, stopping for the words between: a half-bar in 4/4,
    // a bar line in 3/4, which only the time can tell (the checker's repairs know it). A ruled line
    // that stops for the words, as a typed table's do, is still a border.
    const img = fullLine([250, 260, 270, 750]);
    const pairs = (y: number) => !((y >= 6 && y < 84) || (y >= 121 && y < 199));
    draw(img, (y) => 250 + Math.floor(y / 10), pairs);
    draw(img, (y) => 750, pairs);
    expect(tableBorders(img).map((b) => b.x)).toEqual([10, 500, 750, 990]);
  });

  it('keeps a ruled border when dense writing crowds it', () => {
    // Writing over 90% of the line, right up to and across its ruled lines: a line through it anywhere
    // has ink within a pixel nearly all the way down, but the ruled ones are straight down a column.
    const img = picture(400, 200, [], [10, 200, 390]);
    for (let y = 10; y < 190; y++) for (let x = 0; x < 400; x++) if ((x + y) % 3 === 0) img.data[y * 400 + x] = 0;
    expect(tableBorders(img).map((b) => b.x)).toEqual([10, 200, 390]);
  });

  it('finds borders drawn by hand that lean a pixel every 8 rows, either way', () => {
    const img = picture(400, 200, ROWS);
    draw(img, (y) => 10 + Math.floor(y / 8));
    draw(img, (y) => 200 - Math.floor(y / 8));
    draw(img, (y) => 360 + Math.floor(y / 8));
    // A typed bar in one row is still not a border.
    for (let y = 68; y < 92; y++) img.data[y * 400 + 100] = 0;
    const borders = tableBorders(img);
    expectBorders(borders, 200, [
      [10, 34],
      [200, 176],
      [360, 384],
    ]);
    // About a pixel every 8 rows, right, left and right.
    expect(borders.map((b) => Math.round(b.lean * 8))).toEqual([1, -1, 1]);
  });

  it('finds a border broken by gaps', () => {
    // A pen that skips: 5 rows in every 20 left out (75% of the line inked), on lines that lean.
    const img = picture(400, 200, ROWS);
    const skips = (y: number) => y % 20 >= 15;
    draw(img, (y) => 30 + Math.floor(y / 10), skips);
    draw(img, (y) => 250 - Math.floor(y / 12), skips);
    expectBorders(tableBorders(img), 200, [
      [30, 49],
      [250, 234],
    ]);
  });

  it('finds a border that wobbles a pixel either side', () => {
    const img = picture(400, 200, ROWS);
    const wobble = [0, 1, 1, 0, -1, -1];
    draw(img, (y) => 50 + wobble[y % 6]);
    draw(img, (y) => 300 + wobble[(y + 3) % 6] + Math.floor(y / 16));
    expectBorders(tableBorders(img), 200, [
      [50, 50],
      [300, 312],
    ]);
  });

  it('doesn’t take a line threading through dense writing for a border', () => {
    // Handwriting that fills most of the line (rows that touch): a line through it anywhere has ink
    // within a pixel nearly all the way down, but none of that ink is a lone stroke. Only the two
    // ruled borders count.
    const img = picture(400, 200, [], [10, 390]);
    for (let y = 10; y < 160; y++) for (let x = 20; x < 380; x++) if ((x + y) % 3 === 0) img.data[y * 400 + x] = 0;
    expect(tableBorders(img).map((b) => b.x)).toEqual([10, 390]);
  });

  it('reads a “|” away from the borders as the medium accent', () => {
    // m :- |f :r ‖ m :-  — the typed bar in the cell is "/", the border is the barline.
    const tokens = ['m', ':', '-', '|', 'f', ':', 'r', '|', 'm', ':', '-'];
    const xs = [20, 40, 50, 100, 120, 150, 170, 199, 220, 240, 250];
    expect(barsFromBorders(tokens, xs, straight([10, 200, 390]), 100, 16).tokens.join(' ')).toBe('m : - / f : r | m : -');
    expect(barsFromBorders(tokens, xs, [], 100, 16)).toEqual({ tokens, xs });
  });

  it('puts the bar line in every part at the same border (a 3/4 sheet ruled by hand)', () => {
    // As read, each part's second bar line came out "/" and the bar had 9 beats.
    const parts = [
      lay('l : - . l : s . l', '|', 'm : m : -', '/', 'l : - . d ^ : t'),
      lay('m : m : r . d', '|', 't _ : t _ : -', '/', 'd : m : r'),
      lay('d ^ : d ^ : t . l', '|', 'l : s : -', '/', 'l : m : f'),
      lay('l : d : r . r', '|', 'm / m : -', '/', 'l : d : r . r'),
    ];
    const borders = straight([4, 100, 200, 296]);
    expect(parts.map((p) => toText(barsFromBorders(p.tokens, p.xs, borders, 100, 16).tokens))).toEqual([
      'l :-.l :s.l | m :m :- | l :-.d\' :t |',
      'm :m :r.d | t1 :t1 :- | d :m :r |',
      'd\' :d\' :t.l | l :s :- | l :m :f |',
      'l :d :r.r | m /m :- | l :d :r.r |',
    ]);
  });

  it('takes a leaning border at each row’s own height', () => {
    // The border crosses x 200 at the line's middle and leans right: the soprano meets it at 185,
    // the bass at 215, so each part's bar line falls on a different mark read.
    const border: Border = { x: 200, y: 150, lean: 1 / 8 };
    expect(borderX(border, 30)).toBe(185);
    const tokens = ['d', ':', 'r', ':', 'm'];
    const xs = [160, 185, 200, 215, 235];
    expect(barsFromBorders(tokens, xs, [border], 30, 6).tokens.join(' ')).toBe('d | r : m');
    expect(barsFromBorders(tokens, xs, [border], 270, 6).tokens.join(' ')).toBe('d : r | m');
  });

  it('makes a “/” or “:” read at a border the bar line', () => {
    const row = lay('d : r', ':', 'm : f', '/', 's : l', '|', 't : d ^');
    expect(barsFromBorders(row.tokens, row.xs, straight([0, 100, 200, 300, 400]), 100, 16).tokens.join(' ')).toBe('d : r | m : f | s : l | t : d ^');
  });

  it('puts a bar line in where nothing was read at a border', () => {
    const row = lay('d : r', '', 'm : f', '', 's : l', '', 'd');
    const read = barsFromBorders(row.tokens, row.xs, straight([100, 200, 300]), 100, 16);
    expect(read.tokens.join(' ')).toBe('d : r | m : f | s : l | d');
    // The places stay in step, a bar line put in at its border's place.
    expect(read.xs).toHaveLength(read.tokens.length);
    expect(read.tokens.flatMap((t, i) => (t === '|' ? [read.xs[i]] : []))).toEqual([100, 200, 300]);
    // A low t whose octave mark was read just past the border keeps its mark: the bar line goes after it.
    const low = barsFromBorders(['s', ':', 't', '_', 'd'], [140, 160, 185, 203, 230], straight([100, 200]), 100, 8);
    expect(toText(low.tokens)).toBe('s :t1 | d |');
  });

  it('adds nothing at the table’s outer edges', () => {
    // The left and right borders lie beyond the row's first and last token: an upbeat ":" against the
    // left one stays a beat mark, and no bar line goes before or after the row.
    const row = lay(': s', '|', 'd : r : m');
    expect(barsFromBorders(row.tokens, row.xs, straight([5, 100, 195]), 100, 16).tokens.join(' ')).toBe(': s | d : r : m');
    const held = lay('d : -', '', 'm :');
    expect(barsFromBorders(held.tokens, held.xs, straight([15, 100, 185]), 100, 16).tokens.join(' ')).toBe('d : - | m :');
    // A right border just inside the last token: the ":" read there is the row's last, so it stays.
    expect(barsFromBorders(held.tokens, held.xs, straight([15, 100, 178]), 100, 16).tokens.join(' ')).toBe('d : - | m :');
  });

  it('never doubles a bar line', () => {
    // A "|" read a little off the border, with a ":" nearer to it: left as read.
    const off = { tokens: ['d', ':', '|', 'm'], xs: [70, 98, 110, 130] };
    expect(barsFromBorders(off.tokens, off.xs, straight([0, 100, 200]), 100, 16).tokens.join(' ')).toBe('d : | m');
    // A double border (two lines close together) with nothing read: one bar line.
    const row = lay('d : r', '', 'm : f');
    expect(barsFromBorders(row.tokens, row.xs, straight([0, 98, 104, 200]), 100, 16).tokens.join(' ')).toBe('d : r | m : f');
    // A "|" read just beyond `near` of the border (so first taken for a "/"): it's the bar line, not "/ |".
    const late = { tokens: ['d', ':', 'r', '|', 'm'], xs: [40, 60, 70, 80, 120] };
    expect(barsFromBorders(late.tokens, late.xs, straight([0, 100, 200]), 100, 16).tokens.join(' ')).toBe('d : r | m');
    // A bar line already beside the border's place: none put in next to it.
    const beside = { tokens: ['d', ':', 'r', '|', 'm'], xs: [20, 40, 60, 80, 120] };
    expect(barsFromBorders(beside.tokens, beside.xs, straight([0, 81, 100, 200]), 100, 16).tokens.join(' ')).toBe('d : r | m');
  });

  it('takes a “:” for the bar line only right at the border', () => {
    // Row size 30 (near 24). The bar line wasn't read in this part, and a note lies between the nearest
    // ":" and the border: the bar line goes in before the note, not on the ":".
    const between = barsFromBorders(['l', ':', 's', '.', 'l', 't', ':', 'm', ':', '-'], [200, 220, 240, 255, 282, 308, 320, 335, 350, 365], straight([0, 300, 600]), 100, 24);
    expect(toText(between.tokens)).toBe('l :s.l | t :m :- |');
    // A rest's ":" a little way from the border is a beat mark: the bar line goes in beside it.
    const after = barsFromBorders(['d', ':', '-', ':', '-', ':', 's', ':', 'l'], [30, 50, 70, 90, 110, 147, 160, 175, 190], straight([5, 135, 400]), 100, 20);
    expect(toText(after.tokens)).toBe('d :- :- | :s :l |');
    const before = barsFromBorders(['d', ':', 'r', ':', 'm', ':', 's'], [40, 55, 70, 88, 115, 130, 145], straight([0, 100, 300]), 100, 24);
    expect(toText(before.tokens)).toBe('d :r : | m :s |');
    // A "|" read a little past `near` (taken for a "/"), with a ":" before the note on the other side:
    // the "|" is the bar line, and the ":" stays.
    const late = barsFromBorders(['d', ':', 'r', '|', 'm', ':', 'f'], [60, 86, 95, 118, 130, 150, 170], straight([0, 100, 200]), 100, 16);
    expect(toText(late.tokens)).toBe('d :r | m :f |');
  });

  it('never puts a bar line inside a beat', () => {
    // "d.r" read with the "d" just before the border and the "." just past it: the bar line goes before the "d".
    const read = barsFromBorders(['m', ':', 'f', 'd', '.', 'r', ':', 's'], [40, 60, 80, 96, 104, 115, 130, 150], straight([0, 100, 300]), 100, 16);
    expect(toText(read.tokens)).toBe('m :f | d.r :s |');
    expect(read.xs).toEqual([40, 60, 80, 96, 96, 104, 115, 130, 150]);
    // Where the beat starts with a ":" (": d.r"), a bar line has no place: left as read.
    const mark = barsFromBorders(['s', ':', '-', ':', 'd', '.', 'r'], [40, 55, 70, 85, 96, 104, 115], straight([0, 100, 300]), 100, 8);
    expect(toText(mark.tokens)).toBe('s :- :d.r |');
  });

  it('takes no border as inside a row just because its first token was read past it', () => {
    // The left border at 6, the first note read at 4: the ":" after it isn't a bar line.
    const read = barsFromBorders(['d', ':', 'r', '|', 'm', ':', 'f'], [4, 20, 34, 100, 120, 140, 160], straight([6, 100, 200]), 100, 16);
    expect(toText(read.tokens)).toBe('d :r | m :f |');
  });

  it('puts bar lines in only where most parts read one', () => {
    // Soprano and alto read a bar line at 100; only the tenor reads one at 200 (where a line only
    // looks like a border, say). The tenor's and bass's missing bar lines go in at 100, none at 200.
    const rows = [
      { ...lay('d : r', '|', 'm : f', '', 's'), y: 20 },
      { ...lay('m : f', '|', 's : l', '', 't'), y: 60 },
      { ...lay('s : l', '', 't : d', '|', 'r'), y: 140 },
      { ...lay('d : t _', '', 's : f', '', 'm'), y: 180 },
    ];
    const borders = straight([100, 200]);
    const bars = agreedBorders(rows, borders, 16);
    expect(bars.map((b) => b.x)).toEqual([100]);
    expect(rows.map((r) => barsFromBorders(r.tokens, r.xs, borders, r.y, 16, bars).tokens.join(' '))).toEqual([
      'd : r | m : f s',
      'm : f | s : l t',
      's : l | t : d | r',
      'd : t _ | s : f m',
    ]);
  });
});

describe('a line’s bar lines from its table', () => {
  // Each part's own bar lines, a little off from the other parts' (none lined up through the line).
  const rows = [
    { tokens: ['d', ':', 'r', '|', 'm', ':', 'f', '|', 's'], xs: [40, 70, 100, 130, 160, 190, 220, 250, 280], y: 30 },
    { tokens: ['m', ':', 'f', '|', 's', ':', 'l', '|', 't'], xs: [40, 70, 100, 139, 160, 190, 220, 243, 280], y: 70 },
    { tokens: ['s', ':', 'l', '|', 't', ':', 'd', '|', 'r'], xs: [40, 70, 100, 123, 160, 190, 220, 264, 280], y: 140 },
    { tokens: ['d', ':', 't', '|', 's', ':', 'f', '|', 'm'], xs: [40, 70, 100, 144, 160, 190, 220, 236, 280], y: 180 },
  ];

  it('leaves the parts’ own bar lines as read when the only lines are down the ends', () => {
    // A frame drawn by hand down each end, leaning: no line runs through the writing, so none is a bar
    // line and the parts' "|" aren't half-bars.
    const frame: Border[] = [
      { x: 20, y: 100, lean: 1 / 10 },
      { x: 300, y: 100, lean: -1 / 12 },
    ];
    expect(barsFromTable(rows, frame, 16, []).map((r) => r.tokens)).toEqual(rows.map((r) => r.tokens));
  });

  it('takes the borders for the bar lines when a line runs through the writing', () => {
    // A border at 130 through the parts: each part's first "|", read on it or a little off, is the bar
    // line, and the second, away from every border, a half-bar.
    const table: Border[] = [
      { x: 20, y: 100, lean: 0 },
      { x: 130, y: 100, lean: 0 },
      { x: 300, y: 100, lean: 0 },
    ];
    expect(barsFromTable(rows, table, 16, table).map((r) => r.tokens.join(' '))).toEqual([
      'd : r | m : f / s',
      'm : f | s : l / t',
      's : l | t : d / r',
      'd : t | s : f / m',
    ]);
  });
});

describe('bar lines in step, only where the parts and the picture agree', () => {
  it('leaves half-bar strokes read as “/” in every part as they are', () => {
    // A tall half-bar stroke at 100 in every row lines up like a border, but every part reads it as
    // "/" (right, in 4/4): no bar line goes in there. At 200 three parts read a bar line; the tenor gets one.
    const rows = [
      { ...lay('d : r', '/', 'm : f', '|', 's'), y: 20 },
      { ...lay('m : f', '/', 's : l', '|', 't'), y: 60 },
      { ...lay('s : l', '/', 't : d', '', 'r'), y: 140 },
      { ...lay('d : t', ':', 's : f', '|', 'm'), y: 180 },
    ];
    expect(barsFromTable(rows, straight([0, 100, 200, 300]), 16, straight([0, 100, 200, 300])).map((r) => r.tokens.join(' '))).toEqual([
      'd : r / m : f | s',
      'm : f / s : l | t',
      's : l / t : d | r',
      'd : t : s : f | m',
    ]);
  });

  it('keeps the parts’ “|” where a table drawn by hand has a border it didn’t find', () => {
    // Borders drawn by hand (leaning) found at 100 and 300; the one at 200 was too broken to find, but
    // every part reads a bar line there. With no ruled lines, nothing is made "/".
    const rows = [
      { ...lay('d : r', '|', 'm : f', '|', 's'), y: 20 },
      { ...lay('m : f', '|', 's : l', '|', 't'), y: 60 },
      { ...lay('s : l', '|', 't : d', '|', 'r'), y: 140 },
      { ...lay('d : t', '|', 's : f', '|', 'm'), y: 180 },
    ];
    const drawn: Border[] = [
      { x: 100, y: 100, lean: 1 / 40 },
      { x: 300, y: 100, lean: 1 / 40 },
    ];
    expect(barsFromTable(rows, drawn, 16, []).map((r) => r.tokens)).toEqual(rows.map((r) => r.tokens));
    // Ruled with straight lines (here down the ends), a "|" away from every line is the medium accent, as always.
    expect(barsFromTable(rows, drawn, 16, straight([0, 300]))[0].tokens.join(' ')).toBe('d : r | m : f / s');
  });

  it('puts a border’s bar lines only in the rows it runs through (two systems in one box)', () => {
    // The box takes in two rows of one system (a border at 100) and two of the next (a border at 200).
    const img = picture(400, 200, []);
    draw(img, () => 100, (y) => y >= 100);
    draw(img, () => 200, (y) => y < 100);
    const rows = [
      { ...lay('d : r', '|', 'm : f', '', 's'), y: 20, top: 10, bottom: 30 },
      { ...lay('m : f', '', 's : l', '', 't'), y: 50, top: 40, bottom: 60 },
      { ...lay('s : l', '', 't : d', '|', 'r'), y: 120, top: 110, bottom: 130 },
      { ...lay('d : t', '', 's : f', '', 'm'), y: 160, top: 150, bottom: 170 },
    ];
    const borders = straight([100, 200]);
    expect(runsThrough(img, borders[0], rows[0])).toBe(true);
    expect(runsThrough(img, borders[0], rows[2])).toBe(false);
    expect(barsFromTable(rows, borders, 16, [], img).map((r) => r.tokens.join(' '))).toEqual([
      'd : r | m : f s',
      'm : f | s : l t',
      's : l t : d | r',
      'd : t s : f | m',
    ]);
  });

  it('finds the lines a ruler drew, not ones drawn by hand', () => {
    const img = picture(400, 200, [], [10, 200, 390]);
    draw(img, (y) => 300 + y / 10);
    expect(ruledBorders(img).map((b) => b.x)).toEqual([10, 200, 390]);
    expect(ruledBorders(picture(400, 200, [], [10]))).toEqual([]);
  });
});

describe('reading the model’s output', () => {
  const TOKENS = ['d', 'r', 'm', '_', '|', ':'];
  /** Scores per step, the chosen class far above the rest. */
  const scores = (path: number[]) => {
    const classes = TOKENS.length + 1;
    const s = new Float32Array(path.length * classes).fill(-5);
    path.forEach((c, t) => (s[t * classes + c] = 5));
    return s;
  };

  it('collapses repeats and drops blanks', () => {
    // d d _ r r : blank m  →  d r : m
    const r = greedy(scores([1, 1, 0, 2, 2, 6, 0, 3]), 8, TOKENS.length + 1, TOKENS);
    expect(r.tokens).toEqual(['d', 'r', ':', 'm']);
    expect(r.at).toEqual([0.5, 3.5, 5, 7]);
    expect(r.sure).toBeGreaterThan(0.99);
  });

  it('writes tokens as a SolfaScores row', () => {
    expect(toText(['s', '_', '|', 'd', ':', '-', '.', 'r', '/', 'm', ':', 'd', '^'])).toBe("s1 | d :-.r /m :d' |");
    expect(toText(['s', '_', '_', ':', 'd'])).toBe('s2 :d |');
    expect(toText([])).toBe('');
  });

  it('tells rows of notes from rows of words', () => {
    const notes = { tokens: ['d', ':', 'r', ':', 'm', '|', 's', ':', 'l', ':', 't', ':', 'd'], mean: 0.9 };
    // A row of words read as sol-fa: a few "notes" (letters), no beat marks.
    const words = { tokens: ['|', '/', 't', '-', '|', 'd', 'e', 'm', '|', 'ma', 'f'], mean: 0.95 };
    expect(notesLikeness(notes)).toBeGreaterThan(notesLikeness(words));
  });

  it('takes a held note (one note, then all beat marks) for a row of notes', () => {
    // d' :- /- : | : /: | : /:  — the soprano holding one note across the line.
    const held = { tokens: ['d', '^', ':', '-', '/', '-', ':', '|', ':', '/', ':', '|', ':', '/', ':'], mean: 0.9 };
    const words = { tokens: ['|', '/', 't', '-', '|', 'd', 'e', 'm', '|', 'ma', 'f'], mean: 0.95 };
    expect(notesLikeness(held)).toBeGreaterThan(notesLikeness(words));
  });
});
