import { describe, expect, it } from '@jest/globals';

import { headerInfo, isSolfa, readTypedSheet, toAbu, type PageText, type PdfChar, type Seg } from '../pdf-text';

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
    expect(toAbu('¦d :r |m :f ¦s :- |- :- ¦', true)).toBe('d :r /m :f | s :- /- :- |');
    // "t," is the low t1; bar numbers and dynamics go.
    expect(toAbu('12 t, :d |mf r :m', false)).toBe('t1 :d | r :m |');
    // A part's name printed before the row goes; a row starting with the note s stays.
    expect(toAbu('¦S ¦d :r |m :f ¦', true)).toBe('d :r /m :f |');
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
    expect(line.text.split('\n')).toEqual(['S  d :- /d :t | l :s /d :r |', 'A  s :- /l :s | m :m /s :t |', 'W  All peo-ple that', 'T  m :- /f :r | d :d /m :r |', 'B  d :- /f :s | l :m /d :s |']);
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
