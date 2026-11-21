import { describe, expect, it } from '@jest/globals';

import { barsBefore, songPieces, withKeyBefore, withNewLine, withoutLine, withoutTextLine, withRow, withRowPart, withWordsRow } from '../song-pieces';

const SONG = `title: Morning Song
[Verse]
S  d :- /d :t1 | l1:s1 /d :r  |
W  All peo-ple that on earth do dwell
A  s1:- /l1:s1 | m1:m1 /s1:t1 |

Doh is F
S  m :- /- :-  |
A  d :- /- :-  |`;

describe('a song as pieces', () => {
  it('finds its lines of music, with their rows, and what’s between them', () => {
    const pieces = songPieces(SONG);
    expect(pieces.map((p) => p.kind)).toEqual(['other', 'section', 'music', 'blank', 'key', 'music']);
    const first = pieces[2];
    expect(first.kind === 'music' && first.rows).toEqual([
      { part: 'S', text: 'd :- /d :t1 | l1:s1 /d :r  |' },
      { part: null, text: 'All peo-ple that on earth do dwell' },
      { part: 'A', text: 's1:- /l1:s1 | m1:m1 /s1:t1 |' },
    ]);
    expect(pieces[4]).toEqual({ kind: 'key', line: 6, name: 'F' });
    expect(barsBefore(pieces)).toEqual([0, 0, 0, 2, 2, 2]);
  });

  it('starts a new line of music where a part comes again, and reads empty rows and full part names', () => {
    const pieces = songPieces('Soprano: d :r |\nA  m :f |\nS  s :l |\nA\nW');
    expect(pieces.map((p) => p.kind === 'music' && p.rows.map((r) => r.part))).toEqual([
      ['S', 'A'],
      ['S', 'A', null],
    ]);
  });

  it('keeps a [Verses] section’s text as text', () => {
    expect(songPieces('[Verses]\nGlory to God in the highest\n2. And on earth peace').map((p) => p.kind)).toEqual(['section', 'other', 'other']);
  });
});

describe('changing a song by its rows', () => {
  it('changes a row, keeping its part’s name, and nothing else', () => {
    const next = withRow(SONG, 2, 2, 's1:- /l1:s1 | m1:m1 /s1:s1 |');
    expect(next.split('\n')[4]).toBe('A  s1:- /l1:s1 | m1:m1 /s1:s1 |');
    expect(next.split('\n').filter((l, i) => i !== 4)).toEqual(SONG.split('\n').filter((l, i) => i !== 4));
    expect(withRow('Soprano: d :r |', 0, 0, 'd :m |')).toBe('Soprano d :m |');
  });

  it('adds an empty line of music for the parts chosen, with words under the first', () => {
    expect(withNewLine('', ['B', 'S', 'A', 'T'])).toBe('S\nW\nA\nT\nB');
    expect(withNewLine('S  d :r |\n', ['S', 'A'])).toBe('S  d :r |\n\nS\nW\nA');
  });

  it('takes a line of music out, with a blank line beside it', () => {
    expect(withoutLine(SONG, 5)).toBe(SONG.split('\n').slice(0, 7).join('\n'));
    expect(withoutLine('S  d |\n\nS  r |', 0)).toBe('S  r |');
  });

  it('adds a row of words under a part', () => {
    expect(withWordsRow('S  d |\nA  r |', 0, 1)).toBe('S  d |\nA  r |\nW');
  });

  it('writes a key change before a line of music, or changes the one there', () => {
    expect(withKeyBefore('S  d |\n\nS  r |', 2, 'G')).toBe('S  d |\n\nDoh is G\nS  r |');
    expect(withKeyBefore(SONG, 5, 'G').split('\n')[6]).toBe('Doh is G');
    expect(withoutTextLine(SONG, 6)).not.toContain('Doh is F');
  });
});

describe('who sings a row', () => {
  it('gives a row to another part, its notes kept, and knows a solo sung by one part', () => {
    const text = 'S  d :r |m :f |\nW  Bless-ing and\nA  s1 :t1 |d :r |';
    const next = withRowPart(text, 0, 0, 'SoloB');
    expect(next.split('\n')[0]).toBe('SoloB d :r |m :f |');
    const rows = (songPieces(next)[0] as Extract<ReturnType<typeof songPieces>[number], { kind: 'music' }>).rows;
    expect(rows.map((r) => r.part)).toEqual(['SoloB', null, 'A']);
    // Words have no part to change.
    expect(withRowPart(text, 0, 1, 'T')).toBe(text);
  });
});
