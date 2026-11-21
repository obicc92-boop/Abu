import { describe, expect, it, jest } from '@jest/globals';

import { withAiMarks, type AskMarks } from '../ai-marks';
import { barSpans } from '../bar-check';
import { joinLines } from '../join';
import { alignedRows, barColumns, splitLine, withBarsInStep, withMarksAdded, withSpacedBeats } from '../line-text';
import { pageText, readTypedSheet, toAbu, type PageText, type PdfChar } from '../pdf-text';
import { isSign, repeatMark } from '../repeats';

describe('repeats and jumps as SolfaScores spells them', () => {
  it('spells what sheets print and readers write', () => {
    const said = ['𝄋', '§', '$', 'Segno', '𝄌', 'Coda', 'To Coda', 'to coda 𝄌', 'D.S.', 'DS', 'Dal Segno', 'dal segno al fine', 'D.S. al Coda', 'D.C.', 'dc', 'Da Capo', 'D.C. al Fine', 'da capo al coda', 'Fine', 'FINE', ':|', ':||', '|:', '||:', '1.', '1st time', '2nd time'];
    expect(said.map(repeatMark)).toEqual(['segno', 'segno', 'segno', 'segno', 'coda', 'coda', 'to coda', 'to coda', 'D.S.', 'D.S.', 'D.S.', 'D.S. al Fine', 'D.S. al Coda', 'D.C.', 'D.C.', 'D.C.', 'D.C. al Fine', 'D.C. al Coda', 'Fine', 'Fine', ':|', ':|', '|:', '|:', '1.', '1.', '2.']);
    expect(['p', 'cresc', 'Andante', 'fine print', 'd'].map(repeatMark)).toEqual([null, null, null, null, null]);
    expect(['segno', 'coda', '|:', '1.'].every(isSign)).toBe(true);
    expect(['D.C. al Fine', 'Fine', 'to coda', ':|'].some(isSign)).toBe(false);
  });
});

describe('a segno or coda sign read as a note, put right by the AI’s marks', () => {
  // The owner's Ekeresimesi Erutego: the segno before the soprano's "d'" was read as the bridge note "s=d'", with the
  // alto and tenor resting through that bar.
  const LINE = ["S  s=d' :-.d' /d' :d' | t :- /l :s |", 'A  : / : | s :- /f :m |', "T  : / : | r' :- /d' :t |", 'B  d :-.d /d :d | s1 :- /s1 :s1 |'].join('\n');
  const ANSWER = ["S  {segno}d' :-.d' /d' :d' | t :- /l :s |", 'A  : / : | s :- /f :m |', "T  : / : | r' :- /d' :t |", 'B  d :-.d /d :d | s1 :- /s1 :s1 |'].join('\n');

  it('turns the owner’s lone bridge note into the segno, the notes otherwise as they were', () => {
    expect(withMarksAdded(LINE, ANSWER)?.split('\n')[0]).toBe("S  {segno}d' :-.d' /d' :d' | t :- /l :s |");
    expect(withMarksAdded(LINE, ANSWER)?.split('\n').slice(1)).toEqual(LINE.split('\n').slice(1));
  });

  it('leaves real bridge notes alone: in several parts, or where the line has a new key', () => {
    const twoParts = LINE.replace('B  d :-.d', 'B  d=s1 :-.d');
    expect(withMarksAdded(twoParts, ANSWER.replace('B  d :-.d', 'B  d=s1 :-.d'))).toBeNull();
    expect(withMarksAdded(LINE, ANSWER, { keyChange: true })).toBeNull();
    // Without a sign there, the AI has simply changed a note: ignored.
    expect(withMarksAdded(LINE, ANSWER.replace('{segno}', ''))).toBeNull();
    // A note it dropped somewhere else than at its sign: ignored.
    expect(withMarksAdded(LINE, ANSWER.replace('t :- /l :s', 't :- /l :'))).toBeNull();
  });

  it('takes out a stray note made from a sign, once for each sign', () => {
    // A segno read as a note of its own (its beat a rest now), and a coda sign read as notes run together.
    expect(withMarksAdded('S  s :d :r :m |', 'S  {segno} :d :r :m |')).toBe('S  {segno}:d :r :m |');
    expect(withMarksAdded("S  d :r | ld' :- |", "S  d :r | {coda}d' :- |")).toBe("S  d :r | {coda}d' :- |");
    expect(withMarksAdded('S  s s :d :r |', 'S  {segno} :d :r |')).toBeNull();
  });

  it('happens in the typed marks reading too, only where the AI is right', async () => {
    const ask = jest.fn<AskMarks>(async () => ANSWER);
    const passes = () => true;
    expect((await withAiMarks(LINE, { on: true, readers: { cloudflare: true, anthropic: false }, ask, passes })).text.split('\n')[0]).toBe("S  {segno}d' :-.d' /d' :d' | t :- /l :s |");
    expect((await withAiMarks(LINE, { on: true, readers: { cloudflare: true, anthropic: false }, ask, passes, keyChange: true })).text).toBe(LINE);
  });
});

describe('repeat marks through the scanning helpers', () => {
  it('a repeat’s bar line and dots are never a bar line or a beat', () => {
    expect(barSpans('{|:}d :r | m :f {:|} |').map((b) => [b.bar, b.beats])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(barColumns('{|:}d :r | m :f {:|} |')).toEqual([9, 21]);
    const rows = [
      { part: 'S', text: '{|:}d :r | m :f {:|} |' },
      { part: 'A', text: 'd :t1 | d :d |' },
    ];
    const shown = alignedRows(rows);
    expect(shown.map((t) => t.replace(/\s/g, ''))).toEqual(rows.map((r) => r.text.replace(/\s/g, '')));
    expect(barColumns(shown[0])).toEqual(barColumns(shown[1]));
  });

  it('the free repairs keep them where they are', () => {
    const line = (bar: string) => `S  {segno}d :r :m :f | ${bar} | s :- :- :- {D.C. al Fine} |`;
    expect(withSpacedBeats(line('{|:}s l :t :d'), 4)).toBe(line('{|:}s :l :t :d'));
    const twoParts = ['S  d :r :m / f :s :l {:|} | s :- :- |', 'A  d :t1 :d / r :m :f {:|} | m :- :- |'].join('\n');
    expect(withBarsInStep(twoParts, 3)).toBe(['S  d :r :m | f :s :l {:|} | s :- :- |', 'A  d :t1 :d | r :m :f {:|} | m :- :- |'].join('\n'));
  });

  it('joining lines keeps them, an upbeat moves back with its own, and never past a repeat', () => {
    const one = ['S  s1 | d :r /m :f | s :- /- : |', 'W  O come let us a-dore', 'A  s1 | d :t1 /d :d | d :- /- : |'].join('\n');
    const two = ['S  {segno}m | r :d /t1 :d | d :- /- :- {D.S. al Fine} |', 'W  him the new born king', 'A  d | t1 :l1 /s1 :s1 | s1 :- /- :- |'].join('\n');
    const sopranos = (text: string) => splitLine(text).filter((r) => r.part === 'S').map((r) => r.text);
    expect(sopranos(joinLines([one, two], '4/4'))).toEqual(['s1 | d :r /m :f | s :- /- :{segno}m |', 'r :d /t1 :d | d :- /- :- {D.S. al Fine} |']);
    // A repeat at the end of the line before: the upbeat stays after it.
    const repeated = one.replace('S  s1 | d :r /m :f | s :- /- : |', 'S  s1 | d :r /m :f | s :- /- : {:|} |');
    expect(sopranos(joinLines([repeated, two], '4/4'))).toEqual(['s1 | d :r /m :f | s :- /- : {:|} |', '{segno}m | r :d /t1 :d | d :- /- :- {D.S. al Fine} |']);
  });
});

/** Characters typed along a baseline, each `w` points wide. */
function typed(text: string, x: number, y: number, size = 12, w = 6): PdfChar[] {
  return Array.from(text).map((c, i) => ({ c: c === ' ' ? ' ' : c, x0: x + i * w, x1: x + (i + 1) * w, y, size, mark: '' }));
}
const page = (chars: PdfChar[]): PageText => ({ width: 612, height: 792, chars, segs: [], across: [], music: 0, pictured: 0 });

describe('repeats and jumps in a typed PDF', () => {
  it('typed among the notes', () => {
    expect(toAbu('d :- |s :- D.C. al Fine', false)).toBe('d :- | s :- {D.C. al Fine} |');
    expect(toAbu('d :- | Fine |s :-', false)).toBe('d :- {Fine} | s :- |');
    expect(toAbu('§ d :r |m :f', false)).toBe('{segno}d :r | m :f |');
    expect(toAbu('d :r |$m :f To Coda', false)).toBe('d :r | {segno}m :f {to coda} |');
    expect(toAbu('d :r | m :f Dal Segno al Coda', false)).toBe('d :r | m :f {D.S. al Coda} |');
    // Notes that look like the letters ("d.s." is two notes) stay notes.
    expect(toAbu('d.s.l :r |m :f', false)).toBe('d.s.l :r | m :f |');
  });

  it('printed on a row of their own over or under a line, where they’re printed', () => {
    const heading = typed('Doh is G   Time 2/4', 106, 90);
    // Bar lines at x 136, 172 and 214; the notes of bar 2 start at x 142.
    const line = [...typed('d :- |d :t | l :s |d :r', 106, 150), ...typed('s :- |l :s | m :m |s :t', 106, 164)];
    const sheet = readTypedSheet([
      page([
        ...heading,
        ...typed('𝄋', 142, 140), // a segno over bar 2's first note
        ...line,
        ...typed('Fine', 160, 178), // "Fine" over the bar line after bar 2
        ...typed('D.C. al Fine', 210, 178), // and "D.C. al Fine" at the end of the line
      ]),
    ]);
    expect(sheet.lines).toHaveLength(1);
    expect(sheet.lines[0].text.split('\n')).toEqual(['S  d :- | {segno}d :t {Fine} | l :s | d :r {D.C. al Fine} |', 'A  s :- | l :s | m :m | s :t |']);
  });

  it('keeps the segno and coda signs a music font gives', async () => {
    const OPS = { save: 1, restore: 2, clip: 4, constructPath: 5, endPath: 6, beginText: 7, endText: 8, setFont: 9, setTextMatrix: 10, showText: 11, setTextRenderingMode: 12, fill: 13, stroke: 14 };
    const text = (font: string, x: number, glyphs: unknown[]) => [
      [OPS.beginText, null],
      [OPS.setFont, [font, 12]],
      [OPS.setTextMatrix, [[1, 0, 0, 1, x, 650]]],
      [OPS.showText, [glyphs]],
      [OPS.endText, null],
    ];
    // In a music font (Bravura, SMuFL): a segno (U+E047) kept, a G clef (U+E050) not.
    const ops = [...text('F1', 100, [{ unicode: 'd', width: 500 }]), ...text('F2', 140, [{ unicode: '', width: 500 }]), ...text('F2', 180, [{ unicode: '', width: 500 }])] as [number, unknown][];
    const fake = {
      getViewport: () => ({ width: 600, height: 800, convertToViewportPoint: (x: number, y: number) => [x, 800 - y] }),
      getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({ fnArray: ops.map(([fn]) => fn), argsArray: ops.map(([, args]) => args) }),
      commonObjs: { has: (id: string) => id === 'F1' || id === 'F2', get: (id: string) => ({ name: id === 'F2' ? 'Bravura' : 'Arial', fontMatrix: [0.001, 0, 0, 0.001, 0, 0] }) },
    };
    const p = await pageText(fake, OPS);
    expect(p.chars.filter((c) => c.c !== ' ').map((c) => c.c)).toEqual(['d', '']);
    expect(p.music).toBe(1);
  });
});
