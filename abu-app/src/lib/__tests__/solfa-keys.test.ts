import { describe, expect, it } from '@jest/globals';

import { applyKey, type Key, type Selection } from '../solfa-keys';

/** Types the keys in turn from an empty row (or `from`, cursor at its end), and gives the text. */
function type(keys: Key[], from = ''): { text: string; sel: Selection } {
  let state = { text: from, sel: { start: from.length, end: from.length } };
  for (const k of keys) state = applyKey(state.text, state.sel, k);
  return state;
}
const ins = (s: string): Key => ({ insert: s });

describe('the sol-fa keypad', () => {
  it('writes a bar as on a sheet: beat marks spaced, a bar line with a space after it', () => {
    const keys = ['d', ':', 'r', '/', 'm', ':', 'f', '|'].map(ins);
    expect(type(keys).text).toBe('d :r /m :f | ');
  });

  it('puts an octave mark straight after its note', () => {
    expect(type([ins('f'), ins("'"), ins(':'), ins('t'), ins('1')]).text).toBe("f' :t1");
  });

  it('writes where the cursor is, in place of the text chosen', () => {
    // The soprano's "f1" in the owner's screenshot, made "f'": the "1" chosen and the high mark tapped.
    expect(applyKey('f1 :f', { start: 1, end: 2 }, ins("'"))).toEqual({ text: "f' :f", sel: { start: 2, end: 2 } });
    expect(applyKey('d :f', { start: 1, end: 1 }, ins(' :r'))).toEqual({ text: 'd :r :f', sel: { start: 4, end: 4 } });
  });

  it('deletes the character before the cursor, with the space the keypad put by a mark', () => {
    expect(type(['erase'], "d :r'").text).toBe('d :r');
    expect(type(['erase'], 'd :').text).toBe('d');
    expect(type(['erase'], 'd :r | ').text).toBe('d :r');
    expect(applyKey('d :r', { start: 0, end: 0 }, 'erase')).toEqual({ text: 'd :r', sel: { start: 0, end: 0 } });
    expect(applyKey('d :r :m', { start: 2, end: 4 }, 'erase')).toEqual({ text: 'd  :m', sel: { start: 2, end: 2 } });
  });

  it('moves the cursor a character at a time, staying within the row', () => {
    expect(applyKey('d :r', { start: 4, end: 4 }, 'left').sel).toEqual({ start: 3, end: 3 });
    expect(applyKey('d :r', { start: 0, end: 0 }, 'left').sel).toEqual({ start: 0, end: 0 });
    expect(applyKey('d :r', { start: 4, end: 4 }, 'right').sel).toEqual({ start: 4, end: 4 });
    // With text chosen, an arrow goes to that end of it.
    expect(applyKey('d :r', { start: 1, end: 3 }, 'right').sel).toEqual({ start: 3, end: 3 });
  });
});
