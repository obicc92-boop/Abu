import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { DEMO_SONGS, EKELE, GRACE, OLD100 } from '../../data/demo-songs';
import { parseKey, parseSolfa, partName, type ParseOptions, type ParsedSong } from '..';

const parse = (lines: string[], opts: ParseOptions = { time: '4/4' }): ParsedSong => parseSolfa(lines.join('\n'), opts);
const messages = (issues: { message: string }[]) => issues.map((i) => i.message);
const notes = (song: ParsedSong, part = 'S') => song.events[part].map((e) => [e.start, e.dur, e.deg, e.oct]);

describe('demo songs from the prototype', () => {
  it('Old Hundredth: four parts, 12 bars, words on the soprano, no problems', () => {
    const song = parseSolfa(OLD100, { time: '4/4', key: 7 });
    expect(song.errors).toEqual([]);
    expect(song.warnings).toEqual([]);
    expect(song.parts).toEqual(['S', 'A', 'T', 'B']);
    expect(song.sections.map((s) => s.name)).toEqual(['Verse 1']);
    expect(song.bars).toBe(12);
    expect(song.total).toBe(48);
    expect(song.meta.key).toEqual({ semitone: 7, name: 'G' });
    // "d :- /d :t1": d held for two beats, then d, then low t.
    expect(notes(song).slice(0, 3)).toEqual([
      [0, 2, 0, 0],
      [2, 1, 0, 0],
      [3, 1, 11, -1],
    ]);
    expect(song.events.B[0]).toMatchObject({ start: 0, dur: 2, deg: 0, oct: -1, text: 'd1', bar: 1 });
    expect(song.sections[0].lyrics.S).toMatchObject({ 0: 'All', 2: 'peo-', 3: 'ple', 8: 'dwell,' });
    expect(song.events.S[0].lyric).toBe('All');
  });

  it('Ekele Diri Chukwu: verse and chorus', () => {
    const song = parseSolfa(EKELE, { time: '4/4', key: 5 });
    expect(song.errors).toEqual([]);
    expect(song.warnings).toEqual([]);
    expect(song.sections.map((s) => [s.name, s.start, s.beats, s.firstBar])).toEqual([
      ['Verse', 0, 16, 1],
      ['Chorus', 16, 8, 5],
    ]);
    expect(song.bars).toBe(6);
    expect(song.sections[1].lyrics.S[16]).toBe('Al-');
  });

  it('Amazing Grace: 3/4 with a one-beat pickup and melismas', () => {
    const song = parseSolfa(GRACE, { time: '3/4', key: 7 });
    expect(song.errors).toEqual([]);
    expect(song.warnings).toEqual([]);
    expect(song.beatsPerBar).toBe(3);
    expect(song.bars).toBe(8);
    expect(song.total).toBe(22);
    expect(notes(song).slice(0, 4)).toEqual([
      [0, 1, 7, -1],
      [1, 2, 0, 0],
      [3, 0.5, 4, 0],
      [3.5, 0.5, 0, 0],
    ]);
    // "A-maz-ing - grace": the lone "-" carries "ing" over the second half of beat 3.
    expect(song.sections[0].lyrics.S).toMatchObject({ 0: 'A-', 1: 'maz-', 3: 'ing', 4: 'grace', 6: 'how' });
  });

  it('every demo song parses with its own key and time', () => {
    for (const s of DEMO_SONGS) {
      expect(parseSolfa(s.solfa, { time: s.time, key: s.key }).errors).toEqual([]);
    }
  });
});

describe('the example in docs/solfa-format.md', () => {
  const doc = fs.readFileSync(path.join(__dirname, '../../../../docs/solfa-format.md'), 'utf8');
  const example = doc.split('## Example')[1].split('```')[1].replace(/^\n/, '');

  it('parses cleanly, headers included', () => {
    const song = parseSolfa(example);
    expect(song.errors).toEqual([]);
    expect(song.warnings).toEqual([]);
    expect(song.meta).toMatchObject({
      title: 'Morning Song',
      composer: 'Example Composer',
      key: { semitone: 7, name: 'G' },
      time: '4/4',
      timeSource: 'text',
      tempo: { text: '84', bpm: 84 },
    });
    expect(song.parts).toEqual(['S', 'A', 'T', 'B']);
    expect(song.sections.map((s) => s.name)).toEqual(['Verse', 'Chorus']);
    expect(song.bars).toBe(5);
  });
});

describe('format table: key', () => {
  it.each([
    ['D', 2, 'D'],
    ['Eb', 3, 'E♭'],
    ['E♭', 3, 'E♭'],
    ['e flat', 3, 'E♭'],
    ['F#', 6, 'F♯'],
    ['Bb', 10, 'B♭'],
    ['Doh is D', 2, 'D'],
    ['Key: F', 5, 'F'],
    ['A minor', 0, 'C'],
    ['Am', 0, 'C'],
  ])('reads %s', (text, semitone, name) => {
    expect(parseKey(text)).toEqual({ semitone, name });
  });

  it('rejects things that are not keys', () => {
    expect(parseKey('H')).toBeNull();
    expect(parseKey('')).toBeNull();
  });

  it.each([['key: D'], ['Doh is D'], ['Key D'], ['key: Doh is D'], ['KEY: d']])('accepts the line “%s”', (line) => {
    const song = parse([line, 'S  d :r /m :f |']);
    expect(song.meta.key).toEqual({ semitone: 2, name: 'D' });
    expect(song.errors).toEqual([]);
  });

  it('uses the song record’s key when the text has none, and the text’s key over it', () => {
    expect(parse(['S  d :r /m :f |'], { time: '4/4', key: 7 }).meta.key?.name).toBe('G');
    expect(parse(['S  d :r /m :f |'], { time: '4/4', key: 'Eb' }).meta.key?.name).toBe('E♭');
    expect(parse(['key: F', 'S  d :r /m :f |'], { time: '4/4', key: 7 }).meta.key?.name).toBe('F');
  });

  it('reports a key it can’t read', () => {
    const song = parse(['key: Z', 'S  d :r /m :f |']);
    expect(messages(song.errors)).toEqual(['Line 1: “Z” isn’t a key Abụ knows. Write it like “key: E♭” or “Doh is D”.']);
  });
});

describe('format table: time', () => {
  it('reads “time: 3/4”', () => {
    const song = parse(['time: 3/4', 'S  d :r :m | f :- :- |'], {});
    expect(song.meta).toMatchObject({ time: '3/4', timeSource: 'text' });
    expect(song.beatsPerBar).toBe(3);
    expect(song.errors).toEqual([]);
  });

  it('reads “Time: 4” as sheets write it', () => {
    expect(parse(['Time: 4', 'S  d :r /m :f |'], {}).meta.time).toBe('4/4');
    expect(parse(['time: 6', 'S  d :r :m /f :s :l |'], {}).meta.time).toBe('6/8');
  });

  it('falls back to the song record’s time', () => {
    expect(parse(['S  d :r :m | f :- :- |'], { time: '3/4' }).meta).toMatchObject({ time: '3/4', timeSource: 'option' });
  });

  it('guesses from the bars when no time is given, and says so', () => {
    const song = parse(['S  s1 | d :- :m | r :d :r | m :- :- |'], {});
    expect(song.meta).toMatchObject({ time: '3/4', timeSource: 'guess' });
    expect(song.errors).toEqual([]);
    expect(messages(song.warnings)).toEqual(['No time given, so Abụ guessed 3/4 from the bars. Add “time: 3/4” if that’s right.']);
  });

  it('reports a time it can’t read', () => {
    expect(messages(parse(['time: fast', 'S  d :r /m :f |']).errors)).toContain(
      'Line 1: “fast” isn’t a time Abụ knows. Write it like “time: 4/4”.',
    );
  });
});

describe('format table: barlines and beats', () => {
  it('“|” separates bars; empty bars from “||” or a closing “|” are ignored', () => {
    const song = parse(['S  | d :r /m :f || s :- /- :- ‖']);
    expect(song.sections[0].bars.S).toEqual([
      ['d', 'r', 'm', 'f'],
      ['s', '-', '-', '-'],
    ]);
    expect(song.bars).toBe(2);
  });

  it('“:” and “/” both separate beats; “/” is just the half-bar accent', () => {
    const song = parse(['S  d :r /m :f |']);
    expect(song.sections[0].bars.S[0]).toHaveLength(4);
    expect(notes(song).map((n) => n[0])).toEqual([0, 1, 2, 3]);
  });

  it('explains when “|” was used for the half-bar accent, as typed sheets do', () => {
    const song = parse(['S  d :r | m :f | s :- | - :- |']);
    expect(messages(song.errors)).toEqual([
      'Soprano, bar 2 has 2 beats; 4/4 needs 4.',
      'Soprano, bar 3 has 2 beats; 4/4 needs 4.',
    ]);
    expect(messages(song.warnings)).toContain('In Abụ, “|” is only a barline. For the half-bar accent, use “/”, e.g. “d :r /m :f |”.');
  });
});

describe('format table: rhythm', () => {
  it('half beat: “.” splits a beat in two', () => {
    expect(notes(parse(['S  s.l :- /d :- |']))).toEqual([
      [0, 0.5, 7, 0],
      [0.5, 1.5, 9, 0],
      [2, 2, 0, 0],
    ]);
  });

  it('quarter beat: “,” splits a half beat in two', () => {
    expect(notes(parse(['S  d.,r :r,r.m /f :- |']))).toEqual([
      [0, 0.75, 0, 0],
      [0.75, 0.25, 2, 0],
      [1, 0.25, 2, 0],
      [1.25, 0.25, 2, 0],
      [1.5, 0.5, 4, 0],
      [2, 2, 5, 0],
    ]);
  });

  it('hold: “-” continues the note, across barlines too', () => {
    expect(notes(parse(['S  d :- /- :- |']))).toEqual([[0, 4, 0, 0]]);
    expect(notes(parse(['S  d :r /m :s | - :- /l :- |']))).toEqual([
      [0, 1, 0, 0],
      [1, 1, 2, 0],
      [2, 1, 4, 0],
      [3, 3, 7, 0],
      [6, 2, 9, 0],
    ]);
  });

  it('rest: an empty beat or “x” is silence, and a hold after a rest stays silent', () => {
    expect(notes(parse(['S  d : /x :r |']))).toEqual([
      [0, 1, 0, 0],
      [3, 1, 2, 0],
    ]);
    expect(notes(parse(['S  d :x /- :r |']))).toEqual([
      [0, 1, 0, 0],
      [3, 1, 2, 0],
    ]);
    expect(notes(parse(['S  x.d :- /d :- |']))).toEqual([
      [0.5, 1.5, 0, 0],
      [2, 2, 0, 0],
    ]);
  });
});

describe('format table: octaves', () => {
  it('high: d\' d¹ d’ (one octave), d\'\' d² (two)', () => {
    const song = parse(["S  d' :d¹ /d’ :d'' | d² :- /- :- |"]);
    expect(song.errors).toEqual([]);
    expect(song.events.S.map((e) => e.oct)).toEqual([1, 1, 1, 2, 2]);
  });

  it('low: t1 t₁ (one octave), s2 s₂ (two)', () => {
    const song = parse(['S  t1 :t₁ /s2 :s₂ |']);
    expect(song.errors).toEqual([]);
    expect(notes(song).map((n) => [n[2], n[3]])).toEqual([
      [11, -1],
      [11, -1],
      [7, -2],
      [7, -2],
    ]);
  });

  it('warns when a paper-style “s,” low mark is typed, since “,” splits beats in Abụ', () => {
    const song = parse(['S  d :s, /d :- |']);
    expect(messages(song.warnings)).toEqual(['Soprano, bar 1: in “s,” the comma splits a half beat. For a low note, write “s1”.']);
  });
});

describe('format table: sharps and flats', () => {
  it('raised de re fe se le; lowered ra ma ta, with ba read as ta', () => {
    const song = parse(['S  de :re /fe :se | le :ra /ma :ta | ba :- /- :- |']);
    expect(song.errors).toEqual([]);
    expect(song.events.S.map((e) => e.deg)).toEqual([1, 3, 6, 8, 10, 1, 3, 10, 10]);
  });
});

describe('format table: key changes', () => {
  const twoLines = (keyLine: string) =>
    parse(['key: G', 'S  d :r /m :f | s :- /- :- |', keyLine, 'S  d :r /m :f | s :- /- :- |']);

  it('a new key: line changes doh from the next bar', () => {
    const song = twoLines('key: D');
    expect(song.errors).toEqual([]);
    expect(song.keyChanges).toEqual([{ beat: 8, key: { semitone: 2, name: 'D' }, pivot: null }]);
  });

  it('a pivot alone works the new key out: s/d from G is D', () => {
    const song = twoLines('key: s/d');
    expect(song.keyChanges).toEqual([{ beat: 8, key: { semitone: 2, name: 'D' }, pivot: { from: 's', to: 'd' } }]);
    expect(song.warnings).toEqual([]);
  });

  it('a pivot that matches the named key is fine; one that doesn’t gets a warning', () => {
    expect(twoLines('key: D s/d').warnings).toEqual([]);
    expect(messages(twoLines('key: F (s/d)').warnings)).toEqual([
      'Line 3: the pivot s/d moves doh from G to D, not F. Check the key or the pivot.',
    ]);
  });

  it('a key: line at the top of a later section changes key at that section', () => {
    const song = parse(['key: G', '[Verse]', 'S  d :r /m :f |', '[Chorus]', 'key: A', 'S  s :- /- :- |']);
    expect(song.keyChanges.map((k) => [k.beat, k.key?.name])).toEqual([[4, 'A']]);
    expect(song.meta.key?.name).toBe('G');
  });
});

describe('format table: parts', () => {
  it('reads Solo plus S A T B, with full names folded to letters', () => {
    const song = parse([
      'Solo     d :r /m :f |',
      'Soprano  d :r /m :f |',
      'alto     d :r /m :f |',
      'Tenor:   d :r /m :f |',
      'b        d :r /m :f |',
    ]);
    expect(song.errors).toEqual([]);
    expect(song.parts).toEqual(['Solo', 'S', 'A', 'T', 'B']);
    expect(song.parts.map(partName)).toEqual(['Solo', 'Soprano', 'Alto', 'Tenor', 'Bass']);
  });

  it('keeps tenor as written; the octave drop happens at playback', () => {
    const song = parse(['S  d :r /m :f |', 'T  d :r /m :f |']);
    expect(song.events.T).toEqual(song.events.S);
  });

  it('asks for a part name when a line starts with a note', () => {
    expect(messages(parse(['d :r /m :f |']).errors)).toEqual(['Line 1: start the line with a part name, e.g. “S  d :r /m :f |”.', 'Type at least one part line, e.g. “S  d :r /m :f |”.']);
    expect(messages(parse(['| d :r /m :f |']).errors)[0]).toBe('Line 1: start each line with a part name (S, A, T, B, Solo) or W for words.');
  });
});

describe('format table: words', () => {
  it('a W line belongs to the part above it', () => {
    const song = parse(['S  d :r /m :f |', 'W  one two three four', 'A  d :- /m :- |', 'W  five six']);
    expect(song.sections[0].lyrics.S).toEqual({ 0: 'one', 1: 'two', 2: 'three', 3: 'four' });
    expect(song.sections[0].lyrics.A).toEqual({ 0: 'five', 2: 'six' });
  });

  it('a W line with no part above it applies to every part without its own words', () => {
    const song = parse(['[Verse]', 'W  all sing to-geth-er', 'S  d :r /m :f |', 'W  so-pra-no own', 'A  d :r /m :f |', 'B  d :- /m :f |']);
    expect(song.errors).toEqual([]);
    expect(song.sections[0].lyrics.S).toEqual({ 0: 'so-', 1: 'pra-', 2: 'no', 3: 'own' });
    expect(song.sections[0].lyrics.A).toEqual({ 0: 'all', 1: 'sing', 2: 'to-', 3: 'geth-' });
    expect(song.sections[0].lyrics.B).toEqual({ 0: 'all', 2: 'sing', 3: 'to-' });
    // Shared words that run long are reported once, not once per part.
    expect(messages(song.warnings)).toEqual(['Alto in Verse: 5 syllables for 4 notes. Some words won’t show.']);
  });

  it('held notes don’t take a syllable; a lone “-” carries one over another note', () => {
    expect(parse(['S  d :- /m :- |', 'W  Hold on']).sections[0].lyrics.S).toEqual({ 0: 'Hold', 2: 'on' });
    expect(parse(['S  d :r /m :f |', 'W  Glo - ry be']).sections[0].lyrics.S).toEqual({ 0: 'Glo', 2: 'ry', 3: 'be' });
  });

  it('warns when there are more syllables than notes', () => {
    const song = parse(['S  d :r /m :f |', 'W  one two three four five']);
    expect(song.errors).toEqual([]);
    expect(messages(song.warnings)).toEqual(['Soprano: 5 syllables for 4 notes. Some words won’t show.']);
  });
});

describe('format table: sections', () => {
  it('reads [Verse], [Chorus], [Coda] with their start beats', () => {
    const song = parse(['[Verse]', 'S  d :r /m :f |', '[Chorus]', 'S  s :- /- :- |', '[Coda]', 'S  d :- /- :- |']);
    expect(song.sections.map((s) => [s.name, s.start])).toEqual([
      ['Verse', 0],
      ['Chorus', 4],
      ['Coda', 8],
    ]);
  });

  it('accepts a bare CHORUS line as on paper, with a nudge to use brackets', () => {
    const song = parse(['S  d :r /m :f |', 'CHORUS', 'S  s :- /- :- |']);
    expect(song.sections.map((s) => s.name)).toEqual(['', 'Chorus']);
    expect(messages(song.warnings)).toEqual(['Line 2: write section names in brackets, e.g. “[Chorus]”.']);
  });

  it('notes a section with nothing in it', () => {
    const song = parse(['[Verse]', 'S  d :r /m :f |', '[Chorus]']);
    expect(song.errors).toEqual([]);
    expect(messages(song.warnings)).toEqual(['“Chorus” has no part lines yet.']);
  });
});

describe('format table: repeats and jumps', () => {
  it('reads {segno} {fine} {ds} and places them on beats', () => {
    const song = parse(['S  {segno} d :r /m :f | s :- /- :- {fine} | {ds} |']);
    expect(song.errors).toEqual([]);
    expect(song.marks).toEqual([
      { name: 'segno', beat: 0 },
      { name: 'fine', beat: 8 },
      { name: 'ds', beat: 8 },
    ]);
    expect(song.sections[0].bars.S[1]).toEqual(['s', '-', '-', '-']);
  });

  it('reads {1.} {2.} and {dc}, and says playback won’t follow them yet', () => {
    const song = parse(['S  d :r /m :f | {1.} s :- /- :- {dc} | {2.} d :- /- :- |']);
    expect(song.errors).toEqual([]);
    expect(song.marks.map((m) => [m.name, m.beat])).toEqual([
      ['1.', 4],
      ['dc', 8],
      ['2.', 8],
    ]);
    expect(messages(song.warnings)).toEqual(['Playback goes straight through for now. It doesn’t follow {ds}, {dc} or 1st and 2nd endings yet.']);
  });

  it('marks shared by several parts appear once; a mark on its own line goes at that point', () => {
    const song = parse(['[Verse]', 'S  d :r /m :f |', 'A  d :r /m :f |', '[Chorus]', '{segno}', 'S  {fine} d :- /- :- |', 'A  {fine} d :- /- :- |']);
    expect(song.marks).toEqual([
      { name: 'segno', beat: 4 },
      { name: 'fine', beat: 4 },
    ]);
  });

  it('warns about marks it doesn’t know but still reads the bar', () => {
    const song = parse(['S  {coda} d :r /m :f |']);
    expect(song.errors).toEqual([]);
    expect(song.events.S).toHaveLength(4);
    expect(messages(song.warnings)).toEqual(['Line 1: “{coda}” isn’t a mark Abụ knows. Use {segno}, {ds}, {dc}, {fine}, {1.} or {2.}.']);
  });
});

describe('format table: tempo', () => {
  it.each([
    ['tempo: 72', { text: '72', bpm: 72 }],
    ['tempo: ♩ = 96', { text: '♩ = 96', bpm: 96 }],
    ['tempo: Adagio', { text: 'Adagio', bpm: 66 }],
    ['tempo: Joyfully', { text: 'Joyfully', bpm: null }],
  ])('reads “%s”', (line, tempo) => {
    expect(parse([line, 'S  d :r /m :f |']).meta.tempo).toEqual(tempo);
  });
});

describe('format table: extra verses', () => {
  it('keeps a [Verses] block as text, split into paragraphs, and keeps reading after it', () => {
    const song = parse([
      'S  d :r /m :f |',
      '[Verses]',
      '2. Sing to the Lord: with cheerful voice',
      'S is not a part line here',
      '',
      '3. Third verse',
      '[Coda]',
      'S  d :- /- :- |',
    ]);
    expect(song.errors).toEqual([]);
    expect(song.extraVerses).toEqual(['2. Sing to the Lord: with cheerful voice\nS is not a part line here', '3. Third verse']);
    expect(song.sections.map((s) => s.name)).toEqual(['', 'Coda']);
  });
});

describe('checks before saving', () => {
  it('names the part and bar when a bar has the wrong number of beats', () => {
    const song = parse(['S  d :r /m :f | s :l /t :d\' | d\' :- /- :- |', "T  d :r /m :f | s :l /t :d' :r' | d' :- /- :- |"]);
    expect(song.errors).toEqual([
      { message: 'Tenor, bar 2 has 5 beats; 4/4 needs 4.', line: 2, part: 'T', bar: 2 },
      { message: 'Tenor has 13 beats but Soprano has 12.', line: 2, part: 'T' },
    ]);
  });

  it('allows a short first bar (pickup) and a short last bar, but not a short bar in between', () => {
    expect(parse(['S  s1 | d :- /m :r | d :- /- |']).errors).toEqual([]);
    expect(messages(parse(['S  d :- /m :r | d :- | m :- /- :- |']).errors)).toEqual(['Soprano, bar 2 has 2 beats; 4/4 needs 4.']);
  });

  it('checks that every part in a section has the same number of bars', () => {
    const song = parse(['[Verse]', 'S  d :r /m :f | s :- /- :- |', 'A  d :r /m :f |']);
    expect(messages(song.errors)).toEqual(['Verse: Alto has 1 bar but Soprano has 2.']);
  });

  it('checks every syllable is a sol-fa note', () => {
    expect(parse(['S  d :q /m :f |']).errors).toEqual([{ message: 'Soprano, bar 1: “q” is not a sol-fa note.', line: 1, part: 'S', bar: 1 }]);
    expect(messages(parse(['S  d :r /m :f3 |']).errors)).toEqual(['Soprano, bar 1: “f3” is not a sol-fa note.']);
  });

  it('asks for at least one part line', () => {
    expect(messages(parseSolfa('').errors)).toEqual(['Type at least one part line, e.g. “S  d :r /m :f |”.']);
    expect(messages(parseSolfa('title: Empty\n# just a comment').errors)).toEqual(['Type at least one part line, e.g. “S  d :r /m :f |”.']);
  });

  it('ignores comments, blank lines, tabs and Windows line endings', () => {
    const song = parseSolfa('# a note to self\r\n\r\nS\td :r /m :f |\r\n', { time: '4/4' });
    expect(song.errors).toEqual([]);
    expect(song.events.S).toHaveLength(4);
  });

  it('numbers bars across sections in the errors and events', () => {
    const song = parse(['[Verse]', 'S  d :r /m :f | s :- /- :- |', '[Chorus]', 'S  d :r /m | s :- /- :- |']);
    expect(messages(song.errors)).toEqual(['Soprano, bar 3 has 3 beats; 4/4 needs 4.']);
    expect(song.events.S.at(-1)?.bar).toBe(4);
  });
});
