import { describe, expect, it } from '@jest/globals';

import { applyKey, lowMarksShown, lowMarksTyped, songLowMarksShown, songLowMarksTyped, type Key, type Selection } from '../solfa-keys';

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

describe('low octave marks on screen', () => {
  it('shows t1 as t₁ and s2 as s₂, sharps and flats too, one character for one', () => {
    const row = 'd :- :t1.t1 | t1 :t1 :-.m | s2 :de1 /ta1 :- |';
    const shown = lowMarksShown(row);
    expect(shown).toBe('d :- :t₁.t₁ | t₁ :t₁ :-.m | s₂ :de₁ /ta₁ :- |');
    expect(shown.length).toBe(row.length);
    expect(lowMarksTyped(shown)).toBe(row);
  });

  it('leaves high marks, bridge notes and anything not a note as they are', () => {
    expect(lowMarksShown("d' :m=l1 | {1.} f :- |")).toBe("d' :m=l₁ | {1.} f :- |");
  });

  it('in a song, changes only the parts’ lines, not their names, the words or the heading', () => {
    const song = 'title: Psalm 1\ntime: 3/4\n[Verse 1]\nS1  d :t1 :d |\nW  t1 says\ns1: l1 :- :- |';
    const shown = songLowMarksShown(song);
    expect(shown).toBe('title: Psalm 1\ntime: 3/4\n[Verse 1]\nS1  d :t₁ :d |\nW  t1 says\ns1: l₁ :- :- |');
    expect(songLowMarksTyped(shown)).toBe(song);
  });
});

describe('a key change while writing a song', () => {
  const song = 'S  d :r |\nA  m :f |\n\nS  s :l |\nA  d :r |';
  const at = (text: string, find: string) => ({ start: text.indexOf(find), end: text.indexOf(find) });

  it('goes before the lines of music the cursor is in, and the cursor stays put', () => {
    const first = applyKey(song, at(song, 'm :f'), { keyChange: 'G' });
    expect(first.text).toBe('key: G\nS  d :r |\nA  m :f |\n\nS  s :l |\nA  d :r |');
    const second = applyKey(song, at(song, 'A  d :r'), { keyChange: 'G' });
    expect(second.text).toBe('S  d :r |\nA  m :f |\n\nkey: G\nS  s :l |\nA  d :r |');
    expect(second.text.slice(second.sel.start, second.sel.start + 7)).toBe('A  d :r');
  });

  it('changes a key line already there, and goes after a section’s name', () => {
    const withKey = 'S  d :r |\n\nkey: G\nS  s :l |';
    expect(applyKey(withKey, at(withKey, 's :l'), { keyChange: 'A' }).text).toBe('S  d :r |\n\nkey: A\nS  s :l |');
    const chorus = 'S  d :r |\n[Chorus]\nS  s :l |';
    expect(applyKey(chorus, at(chorus, 's :l'), { keyChange: 'F' }).text).toBe('S  d :r |\n[Chorus]\nkey: F\nS  s :l |');
  });

  it('on a blank line, goes before the lines below it', () => {
    const got = applyKey(song, { start: song.indexOf('\n\n') + 1, end: song.indexOf('\n\n') + 1 }, { keyChange: 'E♭' });
    expect(got.text).toBe('S  d :r |\nA  m :f |\n\nkey: E♭\nS  s :l |\nA  d :r |');
  });

  it('writes a bridge note with no spaces round its =', () => {
    expect(type([ins('s'), ins('='), ins('d')]).text).toBe('s=d');
  });
});
