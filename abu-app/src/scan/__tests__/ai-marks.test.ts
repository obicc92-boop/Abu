import { describe, expect, it, jest } from '@jest/globals';

import { withAiMarks, withWordsAndMarks, type AskMarks } from '../ai-marks';
import { withMarksAdded } from '../line-text';
import { parseSolfa } from '@/solfa';

const passes = (t: string) => !parseSolfa(t, { time: '4/4' }).errors.length;
const LINE = ['S  d :r /m :f | s :- /- :- |', 'W  Glo-ry be to God', 'A  d :t1 /d :d | m :- /- :- |'].join('\n');

describe('an AI’s marks, kept only if it changed no note', () => {
  it('adds the marks and slurs to the line, keeping its spacing and its words', () => {
    const answer = ['S  {p}d : r /(m :f) | {rit}s :- /- :- |', 'A  {p}d :t1 /d :d | {<}m :- /- :- |'].join('\n');
    expect(withMarksAdded(LINE, answer)).toBe(['S  {p}d :r /(m :f) | {rit}s :- /- :- |', 'W  Glo-ry be to God', 'A  {p}d :t1 /d :d | {<}m :- /- :- |'].join('\n'));
  });

  it('ignores an answer that changed a note, a beat mark or a bar line, or left a part out', () => {
    expect(withMarksAdded(LINE, 'S  {p}d :r /m :s | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |')).toBeNull();
    expect(withMarksAdded(LINE, 'S  {p}d :r :m :f | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |')).toBeNull();
    expect(withMarksAdded(LINE, 'S  {p}d :r /m :f | s :- /- :-\nA  d :t1 /d :d | m :- /- :- |')).toBeNull();
    expect(withMarksAdded(LINE, 'S  {p}d :r /m :f | s :- /- :- |')).toBeNull();
  });

  it('never drops what the line has (a PDF’s own marks and underlines), and adds only what’s missing', () => {
    const pdf = 'S  {mf}d :(r.m) | f :s |';
    // The AI's {p} is where the PDF has {mf}, and its slur overlaps the PDF's: both left out; its {dim} goes in.
    expect(withMarksAdded(pdf, 'S  {p}d :r.(m | f) :{dim}s |')).toBe('S  {mf}d :(r.m) | f :{dim}s |');
    // The same mark a note or so away isn't added twice.
    expect(withMarksAdded('S  {p}d :r | m :f |', 'S  d :{p}r | m :f |')).toBe('S  {p}d :r | m :f |');
    // A slur of its own elsewhere goes in.
    expect(withMarksAdded(pdf, 'S  d :r.m | (f :s) |')).toBe('S  {mf}d :(r.m) | (f :s) |');
  });
});

describe('a typed line’s marks reading', () => {
  const answer = 'S  {Maestoso}d :r /(m :f) | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |';

  it('asks Cloudflare’s reader first, with the line’s rows', async () => {
    const ask = jest.fn<AskMarks>(async () => answer);
    const got = await withAiMarks(LINE, { on: true, readers: { cloudflare: true, anthropic: true }, ask, passes });
    expect(got).toEqual({ text: ['S  {Maestoso}d :r /(m :f) | s :- /- :- |', 'W  Glo-ry be to God', 'A  d :t1 /d :d | m :- /- :- |'].join('\n'), via: 'cloudflare' });
    expect(ask.mock.calls).toEqual([['cloudflare', 'S  d :r /m :f | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |']]);
  });

  it('then Claude’s, when Cloudflare’s is over its day or changed a note', async () => {
    const overDay = jest.fn<AskMarks>(async (by) => {
      if (by === 'cloudflare') throw Object.assign(new Error('Today’s free AI reading is used up.'), { status: 503 });
      return answer;
    });
    expect((await withAiMarks(LINE, { on: true, readers: { cloudflare: true, anthropic: true }, ask: overDay, passes })).via).toBe('claude');
    expect(overDay.mock.calls.map(([by]) => by)).toEqual(['cloudflare', 'claude']);
    const wrong = jest.fn<AskMarks>(async (by) => (by === 'cloudflare' ? answer.replace('m :f', 'm :s') : answer));
    expect((await withAiMarks(LINE, { on: true, readers: { cloudflare: true, anthropic: true }, ask: wrong, passes })).via).toBe('claude');
    // Neither right: the line as it was.
    const never = jest.fn<AskMarks>(async () => answer.replace('m :f', 'm :s'));
    expect(await withAiMarks(LINE, { on: true, readers: { cloudflare: true, anthropic: true }, ask: never, passes })).toEqual({ text: LINE });
    // Only Claude's there: it's asked straight away.
    const only = jest.fn<AskMarks>(async () => answer);
    await withAiMarks(LINE, { on: true, readers: { cloudflare: false, anthropic: true }, ask: only, passes });
    expect(only.mock.calls.map(([by]) => by)).toEqual(['claude']);
  });

  it('stops when today’s allowance is used up, and asks nothing when switched off', async () => {
    const out = jest.fn<AskMarks>(async () => {
      throw Object.assign(new Error('That’s 400 lines read today.'), { status: 429 });
    });
    expect(await withAiMarks(LINE, { on: true, readers: { cloudflare: true, anthropic: true }, ask: out, passes })).toEqual({ text: LINE, allowanceOut: true });
    expect(out).toHaveBeenCalledTimes(1);
    const off = jest.fn<AskMarks>(async () => answer);
    expect(await withAiMarks(LINE, { on: false, readers: { cloudflare: true, anthropic: true }, ask: off, passes })).toEqual({ text: LINE });
    expect(off).not.toHaveBeenCalled();
  });

  it('keeps a PDF’s own marks and adds the AI’s', async () => {
    const pdf = 'S  {mf}d :(r.m) | f :s |';
    const ask = jest.fn<AskMarks>(async () => 'S  {p}d :r.m | f :{dim}s |');
    expect((await withAiMarks(pdf, { on: true, readers: { cloudflare: true, anthropic: false }, ask, passes: () => true })).text).toBe('S  {mf}d :(r.m) | f :{dim}s |');
  });
});

describe('a handwritten line’s words call, with its marks', () => {
  it('takes the words, and the marks from the rows it gave back when their notes are the line’s', () => {
    const line = 'S  d :r /m :f | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |';
    const notes = 'S  {f}d :r /(m :f) | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |';
    expect(withWordsAndMarks(line, { words: [{ after: 0, text: 'Glo-ry be God' }], notes }, passes)).toBe(
      'S  {f}d :r /(m :f) | s :- /- :- |\nW  Glo-ry be God\nA  d :t1 /d :d | m :- /- :- |',
    );
    // Its notes not the line's: just the words.
    expect(withWordsAndMarks(line, { words: [{ after: 0, text: 'Glo-ry' }], notes: notes.replace('m :f', 'm :s') }, passes)).toBe('S  d :r /m :f | s :- /- :- |\nW  Glo-ry\nA  d :t1 /d :d | m :- /- :- |');
    // No rows back (marks not asked for): the words only, as before.
    expect(withWordsAndMarks(line, { words: [] }, passes)).toBe(line);
  });
});
