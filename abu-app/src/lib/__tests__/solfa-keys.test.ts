import { describe, expect, it } from '@jest/globals';

import { parseSolfa } from '@/solfa';

import { applyKey, keyChangePlace, lowMarksShown, lowMarksTyped, songLowMarksShown, songLowMarksTyped, withKeyChange, type Key, type Selection } from '../solfa-keys';

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

  it('goes before the lines of music the cursor is in, as sheets print it, and the cursor stays put', () => {
    expect(withKeyChange(song, at(song, 'm :f'), 'G').text).toBe('Doh is G\nS  d :r |\nA  m :f |\n\nS  s :l |\nA  d :r |');
    const second = withKeyChange(song, at(song, 'A  d :r'), 'G');
    expect(second.text).toBe('S  d :r |\nA  m :f |\n\nDoh is G\nS  s :l |\nA  d :r |');
    expect(second.text.slice(second.sel.start, second.sel.start + 7)).toBe('A  d :r');
    expect(keyChangePlace(song, song.indexOf('A  d :r')).at).toBe(song.indexOf('S  s :l'));
  });

  it('changes a key line already there, and goes after a section’s name', () => {
    const withKey = 'S  d :r |\n\nDoh is G\nS  s :l |';
    expect(withKeyChange(withKey, at(withKey, 's :l'), 'A').text).toBe('S  d :r |\n\nDoh is A\nS  s :l |');
    const old = 'S  d :r |\n\nkey: G\nS  s :l |';
    expect(withKeyChange(old, at(old, 's :l'), 'A').text).toBe('S  d :r |\n\nDoh is A\nS  s :l |');
    const chorus = 'S  d :r |\n[Chorus]\nS  s :l |';
    expect(withKeyChange(chorus, at(chorus, 's :l'), 'F').text).toBe('S  d :r |\n[Chorus]\nDoh is F\nS  s :l |');
  });

  it('on a blank line, goes before the lines below it', () => {
    const got = withKeyChange(song, { start: song.indexOf('\n\n') + 1, end: song.indexOf('\n\n') + 1 }, 'E♭');
    expect(got.text).toBe('S  d :r |\nA  m :f |\n\nDoh is E♭\nS  s :l |\nA  d :r |');
  });

  it('writes a bridge note with no spaces round its =', () => {
    expect(type([ins('s'), ins('='), ins('d')]).text).toBe('s=d');
  });
});

describe('musical markings from the Marks key', () => {
  const at = (text: string, find: string, plus = 0) => ({ start: text.indexOf(find) + plus, end: text.indexOf(find) + plus });

  it('writes one at the cursor in the middle of a row, before the note it starts on, with the cursor after it', () => {
    const row = 'd :r | m :f |';
    expect(applyKey(row, at(row, 'm'), ins('{p}'))).toEqual({ text: 'd :r | {p}m :f |', sel: { start: 10, end: 10 } });
    expect(applyKey(row, at(row, 'f'), ins('{cresc}')).text).toBe('d :r | m :{cresc}f |');
    expect(applyKey(row, { start: 0, end: 0 }, ins('{M. 72}')).text).toBe('{M. 72}d :r | m :f |');
    // Typed as the music goes: the beat mark, the marking, then its note.
    expect(type([ins('d'), ins(':'), ins('{mf}'), ins('r')]).text).toBe('d :{mf}r');
  });

  it('never splits a note or another marking: inside one, it goes just before it', () => {
    expect(applyKey('d :re :m', { start: 4, end: 4 }, ins('{dim}')).text).toBe('d :{dim}re :m');
    expect(applyKey("d' :r", { start: 1, end: 1 }, ins('{f}')).text).toBe("{f}d' :r");
    expect(applyKey('m :s=d', at('m :s=d', '=', 1), ins('{ff}')).text).toBe('m :{ff}s=d');
    const got = applyKey('{mf}d :r', { start: 2, end: 2 }, ins('{Andante}'));
    expect(got).toEqual({ text: '{Andante}{mf}d :r', sel: { start: 9, end: 9 } });
  });

  it('in place of the text chosen, so a marking can be changed', () => {
    expect(applyKey('{mf}d :r', { start: 0, end: 4 }, ins('{ff}'))).toEqual({ text: '{ff}d :r', sel: { start: 4, end: 4 } });
  });

  it('deletes a marking all at once', () => {
    expect(type(['erase'], 'd :{a tempo}').text).toBe('d :');
    expect(applyKey('d :{p}r', { start: 6, end: 6 }, 'erase')).toEqual({ text: 'd :r', sel: { start: 3, end: 3 } });
    expect(type(['erase'], 'd }').text).toBe('d ');
  });

  it('writes the hairpins, accel. and the directions too, each read as the sheet means it', () => {
    const row = 'd :r | m :f |';
    const marks: [string, string, string, string | null][] = [
      ['{<}', 'cresc', '<', 'S'],
      ['{>}', 'dim', '>', 'S'],
      ['{accel}', 'accel', 'accel.', null],
      ['{Maestoso}', 'direction', 'Maestoso', 'S'],
      ['{dolce}', 'direction', 'dolce', 'S'],
      ['{legato}', 'direction', 'legato', 'S'],
      ['{con moto}', 'direction', 'con moto', 'S'],
    ];
    for (const [mark, kind, text, part] of marks) {
      const written = applyKey(row, at(row, 'm'), ins(mark));
      expect(written).toEqual({ text: `d :r | ${mark}m :f |`, sel: { start: 7 + mark.length, end: 7 + mark.length } });
      const read = parseSolfa(`time: 2/4\nS  ${written.text}`);
      expect([read.errors, read.warnings]).toEqual([[], []]);
      // On the m, the bar's first beat: beat 2 of the song. Tempo is for every part.
      expect(read.expressions.map((e) => [e.kind, e.text, e.part, e.beat])).toEqual([[kind, text, part, 2]]);
    }
  });

  it('is read on the note it was written before, in the song editor’s text too', () => {
    const song = 'time: 2/4\nS  d :r |m :f |\nA  d :d |d :d |';
    const written = applyKey(song, at(song, 'f |'), ins('{p}'));
    expect(written.text).toBe('time: 2/4\nS  d :r |m :{p}f |\nA  d :d |d :d |');
    const read = parseSolfa(written.text);
    expect(read.errors).toEqual([]);
    expect(read.expressions.map((e) => [e.text, e.part, e.beat])).toEqual([['p', 'S', 3]]);
  });
});

describe('a slur from the keypad', () => {
  const at = (text: string, find: string, plus = 0) => ({ start: text.indexOf(find) + plus, end: text.indexOf(find) + plus });

  it('opens with "(" before the note at the cursor, and closes with ")" after the last', () => {
    const row = 'd :r |m.d :r |';
    const opened = applyKey(row, at(row, 'm'), 'slur');
    expect(opened).toEqual({ text: 'd :r |(m.d :r |', sel: { start: 7, end: 7 } });
    expect(applyKey(opened.text, at(opened.text, 'm.d', 3), 'slur').text).toBe('d :r |(m.d) :r |');
    // Typed as the music goes: the key before the slur's first note, and again after its last.
    expect(type([ins('d'), ins(':'), 'slur', ins('m'), ins('.'), ins('d'), 'slur']).text).toBe('d :(m.d)');
    // Or straight after its first note: the "(" goes before it, and the cursor stays after it.
    expect(type(['slur', ins('.'), ins('r'), 'slur'], 'd').text).toBe('(d.r)');
  });

  it('closes after the note, not after a beat mark or bar line, with the cursor where it was', () => {
    expect(type(['slur'], '(s :f :')).toEqual({ text: '(s :f) :', sel: { start: 8, end: 8 } });
    expect(type(['slur'], '(s :f | ').text).toBe('(s :f) | ');
    // Across a bar line, as the reader takes it.
    expect(type(['slur', ins(':'), ins('r')], '(s :f |m').text).toBe('(s :f |m) :r');
  });

  it('never splits a note: "(" goes before it, ")" after its octave mark', () => {
    expect(applyKey('d :re.m', { start: 4, end: 4 }, 'slur').text).toBe('d :(re.m');
    expect(applyKey("(m'.d' :r", { start: 5, end: 5 }, 'slur').text).toBe("(m'.d') :r");
    expect(applyKey('(m.s=d :r', at('(m.s=d', '=', 0), 'slur').text).toBe('(m.s=d) :r');
  });

  it('puts brackets round the notes chosen, leaving out spaces and beat marks at their ends', () => {
    expect(applyKey('d :m.d :r', { start: 3, end: 6 }, 'slur')).toEqual({ text: 'd :(m.d) :r', sel: { start: 8, end: 8 } });
    expect(applyKey('d :m.d :r', { start: 2, end: 7 }, 'slur').text).toBe('d :(m.d) :r');
    // Chosen from inside one note to inside another: round both, whole.
    expect(applyKey("d :re.m' :r", { start: 4, end: 7 }, 'slur').text).toBe("d :(re.m') :r");
  });

  it('a second tap straight after opening takes it back', () => {
    expect(type(['slur', 'slur'], 'd :').text).toBe('d :');
  });

  it('is read with the notes after the first under the slur, sharing its syllable', () => {
    let song = 'time: 2/4\nS  d :r |m.d :r |d :- |\nW  give thanks to Thee, O';
    song = applyKey(song, at(song, 'm.d'), 'slur').text;
    song = applyKey(song, at(song, 'd :r |d', 1), 'slur').text;
    expect(song).toBe('time: 2/4\nS  d :r |(m.d) :r |d :- |\nW  give thanks to Thee, O');
    const read = parseSolfa(song);
    expect(read.errors).toEqual([]);
    expect(read.events.S.map((e) => [e.text, e.lyric ?? '', !!e.slurred])).toEqual([
      ['d', 'give', false],
      ['r', 'thanks', false],
      ['m', 'to', false],
      ['d', '', true],
      ['r', 'Thee,', false],
      ['d', 'O', false],
    ]);
  });
});
