import { describe, expect, it } from '@jest/globals';
import { strToU8, zipSync } from 'fflate';

import { findVoices, musicXmlToSolfa, readMusicXml, syllable, unzipMxl } from '..';

/**
 * A tiny MusicXML writer for tests. A voice is written as "F4/2 A4/1~ R/2",
 * durations in divisions: `~` starts a tie, `^` ends one, `R` is a rest, and
 * `C4+E4/4` is a chord.
 */
interface VoiceSpec {
  voice: string;
  staff?: number;
  notes: string;
  words?: (string | null)[];
}

function noteXml(token: string, voice: string, staff: number, word: string | null | undefined): string {
  const m = token.match(/^([^/]+)\/(\d+)([~^]*)$/);
  if (!m) throw new Error(`bad token ${token}`);
  const [, pitches, dur, ties] = m;
  const tie = (ties.includes('^') ? '<tie type="stop"/>' : '') + (ties.includes('~') ? '<tie type="start"/>' : '');
  const lyric = word
    ? `<lyric number="1"><syllabic>${word.endsWith('-') ? 'begin' : word.startsWith('-') ? 'end' : 'single'}</syllabic><text>${word.replace(/-/g, '')}</text></lyric>`
    : '';
  return pitches
    .split('+')
    .map((p, i) => {
      if (p === 'R') return `<note><rest/><duration>${dur}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`;
      const pm = p.match(/^([A-G])(#|b)?(\d)$/);
      if (!pm) throw new Error(`bad pitch ${p}`);
      const alter = pm[2] === '#' ? '<alter>1</alter>' : pm[2] === 'b' ? '<alter>-1</alter>' : '';
      return `<note>${i ? '<chord/>' : ''}<pitch><step>${pm[1]}</step>${alter}<octave>${pm[3]}</octave></pitch><duration>${dur}</duration>${tie}<voice>${voice}</voice><staff>${staff}</staff>${i ? '' : lyric}</note>`;
    })
    .join('');
}

function measureXml(voices: VoiceSpec[], length: number): string {
  return voices
    .map((v, i) => {
      const tokens = v.notes.trim().split(/\s+/);
      const body = tokens.map((t, k) => noteXml(t, v.voice, v.staff ?? 1, v.words?.[k])).join('');
      return (i ? `<backup><duration>${length}</duration></backup>` : '') + body;
    })
    .join('');
}

interface PartSpec {
  name: string;
  attributes: string;
  /** One list of voices per bar, plus the bar's length in divisions; `extra` goes at the bar's start. */
  bars: { voices: VoiceSpec[]; length: number; implicit?: boolean; extra?: string }[];
}

function scoreXml(parts: PartSpec[], head = ''): string {
  const list = parts.map((p, i) => `<score-part id="P${i + 1}"><part-name>${p.name}</part-name></score-part>`).join('');
  const body = parts
    .map(
      (p, i) =>
        `<part id="P${i + 1}">` +
        p.bars
          .map(
            (b, bi) =>
              `<measure number="${bi}"${b.implicit ? ' implicit="yes"' : ''}>${bi === 0 ? `<attributes>${p.attributes}</attributes>` : ''}${b.extra ?? ''}${measureXml(b.voices, b.length)}</measure>`,
          )
          .join('') +
        `</part>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">${head}<part-list>${list}</part-list>${body}</score-partwise>`;
}

// A hymn as printed in hymn books: soprano and alto on the top staff, tenor and bass below, in B♭ and 3/4 with a pickup.
const HYMN = scoreXml(
  [
    {
      name: 'Hymn',
      attributes:
        '<divisions>2</divisions><key><fifths>-2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves>' +
        '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>',
      bars: [
        {
          implicit: true,
          length: 2,
          voices: [
            { voice: '1', notes: 'F4/2', words: ['All'] },
            { voice: '2', notes: 'D4/2' },
            { voice: '5', staff: 2, notes: 'Bb3/2' },
            { voice: '6', staff: 2, notes: 'Bb2/2' },
          ],
        },
        {
          length: 6,
          voices: [
            { voice: '1', notes: 'Bb4/2 A4/1 G4/1 F4/2', words: ['peo-', '-ple', null, 'that'] },
            { voice: '2', notes: 'D4/2 Eb4/2 C4/2' },
            { voice: '5', staff: 2, notes: 'F3/6' },
            { voice: '6', staff: 2, notes: 'Bb2/2 G2/2 F2/2' },
          ],
        },
        {
          length: 6,
          voices: [
            { voice: '1', notes: 'G4/2 F4/4~', words: ['on', 'earth'] },
            { voice: '2', notes: 'Eb4/2 D4/4~' },
            { voice: '5', staff: 2, notes: 'Bb3/6' },
            { voice: '6', staff: 2, notes: 'Eb3/2 F2/4' },
          ],
        },
        {
          length: 6,
          voices: [
            { voice: '1', notes: 'F4/2^ R/2 R/2' },
            { voice: '2', notes: 'D4/2^ R/4' },
            { voice: '5', staff: 2, notes: 'Bb3/2 R/4' },
            { voice: '6', staff: 2, notes: 'Bb2/2 R/4' },
          ],
        },
      ],
    },
  ],
  '<work><work-title>Old Hundredth</work-title></work><identification><creator type="composer">Louis Bourgeois</creator></identification>',
);

describe('a hymn on two staves', () => {
  const out = musicXmlToSolfa(HYMN);

  it('finds the four voices from the staves and voices', () => {
    expect(out.parts).toEqual(['S', 'A', 'T', 'B']);
    expect(out.layout).toBe('1 part, 4 lines');
  });

  it('writes the sol-fa: a one-beat pickup, quavers, a tie over the barline and words under the soprano', () => {
    expect(out.text).toBe(
      [
        'title: Old Hundredth',
        'composer: Louis Bourgeois',
        'key: Bb',
        'time: 3/4',
        '',
        "S  s | d' :t.l :s | l :s :- | - : : |",
        'W  All peo-ple _ that on earth',
        'A  m | m :f :r | f :m :- | - : : |',
        "T  d' | s :- :- | d' :- :- | d' : : |",
        'B  d | d :l1 :s1 | f :s1 :- | d : : |',
        '',
      ].join('\n'),
    );
  });

  it("reads back as exactly the score's notes, with nothing to report", () => {
    expect(out.mismatches).toEqual([]);
    expect(out.verified).toBe(true);
    expect(out.problems).toEqual([]);
    expect(out.bars).toBe(4);
    // The tied F is one note of three beats: beat 2 of bar 2 (after the one-beat pickup and bar 1) to the end of bar 3's first beat.
    expect(out.planned.S.at(-1)).toEqual({ start: 5, dur: 3, midi: 65 });
  });
});

describe('four named parts', () => {
  const part = (name: string, clef: string, notes: string): PartSpec => ({
    name,
    attributes: `<divisions>12</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef>${clef}</clef>`,
    bars: [{ length: 48, voices: [{ voice: '1', notes }] }],
  });
  const G = '<sign>G</sign><line>2</line>';
  const xml = scoreXml([
    part('Tenor', `${G}<clef-octave-change>-1</clef-octave-change>`, 'E3/24 G3/24'),
    part('Soprano', G, 'C5/4 D5/4 E5/4 F5/12 G5/3 A5/3 B5/6 C6/12'),
    part('Bass', '<sign>F</sign><line>4</line>', 'C3/12 R/12 G2/24'),
    part('Alto', G, 'C4/48'),
  ]);
  const out = musicXmlToSolfa(xml);

  it('trusts the names, in S A T B order', () => {
    expect(out.layout).toBe('named parts');
    expect(out.parts).toEqual(['S', 'A', 'T', 'B']);
  });

  it('writes triplets as thirds, semiquavers as quarters, rests as empty beats and octaves with marks', () => {
    expect(out.text.split('\n').slice(3, 7)).toEqual([
      "S  d'.r'.m' :f' :s',l'.t' :d'' |",
      'A  d :- :- :- |',
      'T  m :- :s :- |',
      'B  d : :s1 :- |',
    ]);
    expect(out.verified).toBe(true);
  });
});

describe('key changes', () => {
  const xml = scoreXml([
    {
      name: 'Melody',
      attributes: '<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>',
      bars: [
        { length: 4, voices: [{ voice: '1', notes: 'C4/1 D4/1 E4/1 F4/1' }] },
        { length: 4, extra: '<attributes><key><fifths>1</fifths></key></attributes>', voices: [{ voice: '1', notes: 'G4/4' }] },
      ],
    },
  ]);

  it('starts a new line with the new key, moving doh to the nearest G (below), as the player does', () => {
    const out = musicXmlToSolfa(xml);
    expect(out.text).toBe(['key: C', 'time: 4/4', '', 'S  d :r :m :f |', '', 'key: G', "S  d' :- :- :- |", ''].join('\n'));
    expect(out.verified).toBe(true);
  });
});

describe('chords on one stem', () => {
  const xml = scoreXml([
    {
      name: 'Choir',
      attributes:
        '<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><staves>2</staves>' +
        '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>',
      bars: [
        {
          length: 2,
          voices: [
            { voice: '1', notes: 'C4+E4/1 B3+D4/1' },
            { voice: '5', staff: 2, notes: 'C3+G3/1 G2+G3/1' },
          ],
        },
      ],
    },
    { name: 'Piano', attributes: '<divisions>1</divisions><clef><sign>G</sign><line>2</line></clef>', bars: [{ length: 2, voices: [{ voice: '1', notes: 'C6/2' }] }] },
  ]);

  it('splits each chord into an upper and a lower voice, leaving the piano out', () => {
    const { lines } = findVoices(readMusicXml(xml));
    expect(lines.map((l) => [l.part, l.notes.map((n) => n.midi)])).toEqual([
      ['S', [64, 62]],
      ['A', [60, 59]],
      ['T', [55, 55]],
      ['B', [48, 43]],
    ]);
  });
});

describe('naming notes', () => {
  it('names raised and lowered notes from how they are spelt', () => {
    expect(syllable(61, 60, 'C', 'C', 1)).toEqual({ name: 'de', octave: 0 });
    expect(syllable(61, 60, 'C', 'D', -1)).toEqual({ name: 'ra', octave: 0 });
    expect(syllable(66, 60, 'C', 'F', 1)).toEqual({ name: 'fe', octave: 0 });
    expect(syllable(68, 60, 'C', 'G', 1)).toEqual({ name: 'se', octave: 0 });
    expect(syllable(68, 60, 'C', 'A', -1)).toEqual({ name: 'lo', octave: 0 });
    expect(syllable(70, 60, 'C', 'B', -1)).toEqual({ name: 'ta', octave: 0 });
    // B natural in F is the raised fourth.
    expect(syllable(71, 65, 'F', 'B', 0)).toEqual({ name: 'fe', octave: 0 });
  });

  it('counts octaves from doh', () => {
    expect(syllable(59, 60, 'C', 'B', 0)).toEqual({ name: 't', octave: -1 });
    expect(syllable(84, 60, 'C', 'C', 0)).toEqual({ name: 'd', octave: 2 });
  });
});

describe('files', () => {
  it('opens a compressed .mxl through its container', () => {
    const zip = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score/hymn.xml"/></rootfiles></container>'),
      'score/hymn.xml': strToU8(HYMN),
    });
    expect(unzipMxl(zip)).toBe(HYMN);
    expect(musicXmlToSolfa(zip).parts).toEqual(['S', 'A', 'T', 'B']);
  });

  it('says plainly what it cannot read', () => {
    expect(() => readMusicXml('<score-timewise/>')).toThrow('timewise');
    expect(() => readMusicXml('<html/>')).toThrow('isn’t MusicXML');
    expect(() => musicXmlToSolfa(scoreXml([{ name: 'Empty', attributes: '<divisions>1</divisions>', bars: [{ length: 4, voices: [{ voice: '1', notes: 'R/4' }] }] }]))).toThrow(
      'No sung or played notes',
    );
  });
});
