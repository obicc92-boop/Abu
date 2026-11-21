import { describe, expect, it } from '@jest/globals';

import { EKELE, GRACE, OLD100 } from '@/data/demo-songs';
import { parseSolfa } from '@/solfa';

import { displayBeat, layoutScore, lyricSegments } from '../layout';

const barsPerSystem = (song: ReturnType<typeof parseSolfa>, maxBeats?: number) =>
  layoutScore(song, { maxBeats }).map((s) => s.rows[0].cells.filter((c) => c.barStart).length);

describe('layoutScore', () => {
  it('puts Old Hundredth in four lines of three bars, heading on the first', () => {
    const systems = layoutScore(parseSolfa(OLD100, { time: '4/4' }));
    expect(systems.map((s) => [s.heading, s.start, s.beats])).toEqual([
      ['Verse 1', 0, 12],
      [null, 12, 12],
      [null, 24, 12],
      [null, 36, 12],
    ]);
    expect(systems[0].rows.map((r) => r.part)).toEqual(['S', 'A', 'T', 'B']);
    expect(systems[0].rows[0].cells.slice(0, 3)).toEqual([
      { beat: 0, text: 'd', barStart: true, hold: false },
      { beat: 1, text: '-', barStart: false, hold: true },
      { beat: 2, text: 'd', barStart: false, hold: false },
    ]);
  });

  it('widens columns that hold more notes', () => {
    const [sys] = layoutScore(parseSolfa('S  d :d.,r /s.l1 :- |\nA  d :r /m :f |', { time: '4/4' }));
    expect(sys.widths).toEqual([3, 4, 4, 3]);
  });

  it('widens a column when its syllable needs the room', () => {
    const [sys] = layoutScore(parseSolfa('S  d :r /m :f |\nW  Sing cheer-ful-ly', { time: '4/4' }));
    // Room for ~0.7 note characters per letter: "Sing" 4, "cheer-" 5, "ful-" 4; "ly" fits in 3.
    expect(sys.widths).toEqual([4, 5, 4, 3]);
  });

  it('shows words only under the parts that have them', () => {
    const [first] = layoutScore(parseSolfa(OLD100, { time: '4/4' }));
    expect(first.rows.map((r) => r.lyrics !== null)).toEqual([true, false, false, false]);
    expect(first.rows[0].lyrics).toEqual([
      { beat: 0, span: 2, text: 'All' },
      { beat: 2, span: 1, text: 'peo-' },
      { beat: 3, span: 1, text: 'ple' },
      { beat: 4, span: 1, text: 'that' },
      { beat: 5, span: 1, text: 'on' },
      { beat: 6, span: 1, text: 'earth' },
      { beat: 7, span: 1, text: 'do' },
      { beat: 8, span: 4, text: 'dwell,' },
    ]);
  });

  it('spreads bars evenly so no bar is left alone on a line', () => {
    const fourBars = parseSolfa('S  d :r /m :f | s :- /- :- | d :r /m :f | s :- /- :- |', { time: '4/4' });
    expect(barsPerSystem(fourBars)).toEqual([2, 2]);
    const fiveBars = parseSolfa('S  d :r /m :f | s :- /- :- | d :r /m :f | s :- /- :- | d :- /- :- |', { time: '4/4' });
    expect(barsPerSystem(fiveBars)).toEqual([3, 2]);
    expect(barsPerSystem(fiveBars, 8)).toEqual([2, 2, 1]);
  });

  it('starts each section on a new line with its heading', () => {
    const systems = layoutScore(parseSolfa(EKELE, { time: '4/4' }));
    expect(systems.map((s) => [s.heading, s.start])).toEqual([
      ['Verse', 0],
      [null, 8],
      ['Chorus', 16],
    ]);
  });

  it('handles a pickup bar in 3/4', () => {
    const systems = layoutScore(parseSolfa(GRACE, { time: '3/4' }));
    expect(systems.map((s) => [s.start, s.beats])).toEqual([
      [0, 10],
      [10, 12],
    ]);
  });

  it('shows one part on its own, borrowing words from a part that has them', () => {
    const systems = layoutScore(parseSolfa(OLD100, { time: '4/4' }), { only: 'A' });
    expect(systems[0].rows.map((r) => r.part)).toEqual(['A']);
    expect(systems[0].rows[0].lyrics?.[0]).toEqual({ beat: 0, span: 2, text: 'All' });
  });
});

describe('lyricSegments', () => {
  it('keeps a leading gap as an empty segment', () => {
    expect(lyricSegments({ 2: 'Glo-', 3: 'ry' }, 0, 4)).toEqual([
      { beat: 0, span: 2, text: '' },
      { beat: 2, span: 1, text: 'Glo-' },
      { beat: 3, span: 1, text: 'ry' },
    ]);
  });
});

describe('displayBeat', () => {
  it.each([
    ["d'", 'd¹'],
    ['d¹', 'd¹'],
    ["d''", 'd²'],
    ['t1', 't₁'],
    ['t₁', 't₁'],
    ['s2', 's₂'],
    ['s.l1', 's.l₁'],
    ["d.,r'", 'd.,r¹'],
    ['-', '–'],
    ['', ''],
    ['fe', 'fe'],
    // Bridge notes as sheets print them: the old name small and raised, before the new one.
    ['s=d', 'ˢd'],
    ["d'=f", 'ᵈ¹f'],
    ['m=l1.r', 'ᵐl₁.r'],
    ['se=la', 'ˢᵉla'],
  ])('shows %j as %j', (input, shown) => {
    expect(displayBeat(input)).toBe(shown);
  });
});

describe('key changes on the score', () => {
  it('marks the line where the key changes, at the beat it starts', () => {
    const song = parseSolfa(['key: G', 'S  d :r /m :f | s :- /- :- | m :r /s=d :- | r :- /- :- |', 'A  d :- /- :- | m :- /- :- | d :- /- :- | t1 :- /- :- |'].join('\n'), { time: '4/4' });
    const systems = layoutScore(song, { maxBeats: 8 });
    expect(systems.map((s) => s.keys)).toEqual([[], [{ beat: 10, semitone: 2 }]]);
  });
});

describe('musical markings on the score', () => {
  const marksOf = (song: ReturnType<typeof parseSolfa>, opts?: Parameters<typeof layoutScore>[1]) =>
    layoutScore(song, opts).map((s) => ({
      line: s.marks.map((m) => [m.kind, m.text, m.beat]),
      rows: Object.fromEntries(s.rows.map((r) => [r.part, r.marks.map((m) => [m.kind, m.text, m.beat])])),
    }));

  const song = parseSolfa(
    [
      '{Andante M. 70}',
      'S  {p}d :r /{f}m :f | s :- /{cresc}- :- | d :r /{dim}m :f | s :- /- :- |',
      'A  {mf}d :d /d :d | m :- /- :- | {rit}d :d /d :d | d :- /- :- |',
      '',
      '{ff}',
      'S  {sfz}m :- /- :- | d :- /- :- |',
      'A  {a tempo}d :- /- :- | m :- /- :- |',
    ].join('\n'),
    { time: '4/4' },
  );

  it('gives each row its own part’s markings, on the line holding their beats', () => {
    expect(song.errors).toEqual([]);
    expect(marksOf(song, { maxBeats: 8 }).map((s) => s.rows)).toEqual([
      { S: [['dynamic', 'p', 0], ['dynamic', 'f', 2], ['cresc', 'cresc.', 6]], A: [['dynamic', 'mf', 0]] },
      { S: [['dim', 'dim.', 10]], A: [] },
      { S: [['accent', 'sfz', 16]], A: [] },
    ]);
  });

  it('puts the markings for every part on the line itself: tempo, rit., a tempo, a dynamic on its own line', () => {
    expect(marksOf(song, { maxBeats: 8 }).map((s) => s.line)).toEqual([
      [['tempo', 'Andante M. 70', 0]],
      [['rit', 'rit.', 8]],
      [
        ['dynamic', 'ff', 16],
        ['atempo', 'a tempo', 16],
      ],
    ]);
  });

  it('shows a tempo written over every part once', () => {
    const twice = parseSolfa('S  d :r /m :f | {rit}s :- /- :- |\nA  d :d /d :d | {rit}m :- /- :- |', { time: '4/4' });
    expect(layoutScore(twice)[0].marks).toEqual([{ beat: 4, text: 'rit.', kind: 'rit' }]);
  });

  it('keeps the markings for every part and your own part’s with my part only', () => {
    expect(marksOf(song, { maxBeats: 8, only: 'A' })).toEqual([
      { line: [['tempo', 'Andante M. 70', 0]], rows: { A: [['dynamic', 'mf', 0]] } },
      { line: [['rit', 'rit.', 8]], rows: { A: [] } },
      {
        line: [
          ['dynamic', 'ff', 16],
          ['atempo', 'a tempo', 16],
        ],
        rows: { A: [] },
      },
    ]);
  });

  it('shares the line with a key change on the same beat', () => {
    const keyed = parseSolfa(['key: G', 'S  d :r /m :f | s :- /- :- |', 'Doh is D', '{Allegro}', 'S  m :r /d :- | r :- /- :- |'].join('\n'), { time: '4/4' });
    const systems = layoutScore(keyed, { maxBeats: 8 });
    expect(systems.map((s) => [s.keys.map((k) => k.beat), s.marks.map((m) => [m.text, m.beat])])).toEqual([
      [[], []],
      [[8], [['Allegro', 8]]],
    ]);
  });

  it('lays out a song without markings as before', () => {
    const systems = layoutScore(parseSolfa(OLD100, { time: '4/4' }));
    expect(systems.every((s) => s.marks.length === 0 && s.rows.every((r) => r.marks.length === 0))).toBe(true);
    expect(systems.map((s) => s.widths)).toEqual([
      [3, 3, 4, 3, 4, 3, 4, 3, 3, 3, 3, 3],
      [3, 3, 3, 3, 4, 4, 5, 3, 3, 3, 3, 3],
      [3, 3, 4, 4, 4, 3, 5, 4, 3, 3, 3, 3],
      [3, 3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3],
    ]);
  });

  it('changes nothing else for markings that fit in the room to the next one', () => {
    const plain = 'S  d :r /m :f | s :- /- :- |\nW  Sing to the Lord, sing\nA  d :d /d :d | m :- /- :- |';
    const marked = '{Andante}\nS  {p}d :r /{f}m :f | s :- /{cresc}- :- |\nW  Sing to the Lord, sing\nA  {mf}d :d /d :d | m :- /- :- |';
    const strip = (systems: ReturnType<typeof layoutScore>) => systems.map((s) => ({ ...s, marks: [], rows: s.rows.map((r) => ({ ...r, marks: [] })) }));
    const [withMarks] = layoutScore(parseSolfa(marked, { time: '4/4' }));
    expect(withMarks.rows[0].marks).toHaveLength(3);
    expect(strip(layoutScore(parseSolfa(marked, { time: '4/4' })))).toEqual(strip(layoutScore(parseSolfa(plain, { time: '4/4' }))));
  });

  it('widens a column when a marking hasn’t the room before the next one', () => {
    // "cresc." needs about 5 note characters; with "f" on the next beat it has only its own 3.
    const [sys] = layoutScore(parseSolfa('S  {cresc}d :{f}r /m :f |', { time: '4/4' }));
    expect(sys.widths).toEqual([5, 3, 3, 3]);
  });
});

describe('slurs on the score', () => {
  const slursOf = (text: string, maxBeats?: number) => layoutScore(parseSolfa(text, { time: '4/4' }), { maxBeats }).map((s) => s.rows[0].slurs);

  it('underlines the notes of a slur in one beat, and shows no brackets', () => {
    const [sys] = layoutScore(parseSolfa("S  (m'.d') :r /m :f |", { time: '4/4' }));
    expect(sys.rows[0].slurs).toEqual([{ from: 0, to: 0, start: 0, end: 1 }]);
    expect(sys.rows[0].cells[0].text).toBe("(m'.d')");
    expect(displayBeat(sys.rows[0].cells[0].text)).toBe('m¹.d¹');
  });

  it('starts and ends under the notes it holds, partway through a beat', () => {
    // "s.l" shown: the slur starts under the l, two thirds of the way along.
    expect(slursOf('S  s.(l :t) /d :- |')).toEqual([[{ from: 0, to: 1, start: 2 / 3, end: 1 }]]);
    expect(slursOf('S  (d.r).m :f /s :- |')).toEqual([[{ from: 0, to: 0, start: 0, end: 3 / 5 }]]);
  });

  it('runs across beats and across a bar line', () => {
    expect(slursOf('S  (d :r) /m :f |')).toEqual([[{ from: 0, to: 1, start: 0, end: 1 }]]);
    expect(slursOf('S  d :r /(s :f | m) :- /- :- |')).toEqual([[{ from: 2, to: 4, start: 0, end: 1 }]]);
  });

  it('carries on from the start of the next line when a line breaks inside it', () => {
    const text = 'S  d :r /m :(f | s :- /- :- | m) :r /d :- |';
    expect(slursOf(text, 4)).toEqual([
      [{ from: 3, to: 3, start: 0, end: null }],
      [{ from: 0, to: 3, start: null, end: null }],
      [{ from: 0, to: 0, start: null, end: 1 }],
    ]);
  });

  it('treats a held beat with a closing bracket as a hold', () => {
    const [sys] = layoutScore(parseSolfa('S  (d :-) /m :f |', { time: '4/4' }));
    expect(sys.rows[0].cells[1]).toMatchObject({ text: '-)', hold: true });
    expect(displayBeat('-)')).toBe('–');
  });

  it('gives brackets no room, and leaves a song without slurs as it was', () => {
    const widths = (text: string) => layoutScore(parseSolfa(text, { time: '4/4' })).map((s) => s.widths);
    // (Without words: notes under a slur share a syllable, so words would sit differently.)
    expect(widths("S  (m'.d') :(r | m) :f /s.(l :t) |\nA  d :d | d :d /d :d |")).toEqual(widths("S  m'.d' :r | m :f /s.l :t |\nA  d :d | d :d /d :d |"));
    const systems = layoutScore(parseSolfa(OLD100, { time: '4/4' }));
    expect(systems.every((s) => s.rows.every((r) => r.slurs.length === 0))).toBe(true);
  });
});

describe('lines laid out by the room their bars need', () => {
  // Busy like Handel's Worthy is the Lamb: many notes to a beat.
  const busyLines = [
    "S  s,f.m,r :d /d'.d' :.l | r'.r' :.t /l,s.f,m :r.t | s,f.m,r :d /d'.d' :.l | r'.r' :.t /d' :- |",
    'W  Wor- thy is the Lamb that was slain and hath re- deem- ed us to God by his blood to re- ceive pow- er and rich- es',
    'A  m,r.d,t1 :d /m.m :.f | f.f :.r /d,t1.l1,s1 :s1.s1 | m,r.d,t1 :d /m.m :.f | f.f :.s /m :- |',
    "T  d,t1.l1,s1 :m /s.s :.d' | l.l :.s /f,m.r,d :t1.r | d,t1.l1,s1 :m /s.s :.d' | l.l :.s /s :- |",
    'B  d :d /d.d :.f1 | f1.f1 :.s1 /l1 :s1 | d :d /d.d :.f1 | f1.f1 :.s1 /d :- |',
  ];
  const busy = parseSolfa(busyLines.join('\n'), { time: '4/4' });
  const busyNotes = parseSolfa(busyLines.filter((l) => !l.startsWith('W')).join('\n'), { time: '4/4' });
  const total = (s: { widths: number[] }) => s.widths.reduce((a, b) => a + b, 0);
  const barsOn = (s: ReturnType<typeof layoutScore>[number]) => s.rows[0].cells.filter((c) => c.barStart).length;

  it('gives a busy song fewer bars a line than a simple hymn in the same room', () => {
    expect(busy.errors).toEqual([]);
    const hymn = layoutScore(parseSolfa(OLD100, { time: '4/4' }), { maxChars: 44 });
    const crowded = layoutScore(busy, { maxChars: 44 });
    expect(hymn.map(barsOn)).toEqual([3, 3, 3, 3]);
    expect(Math.max(...crowded.map(barsOn))).toBeLessThan(3);
    expect(crowded.map(barsOn).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('never puts more on a line than its room, unless one bar alone is wider', () => {
    for (const maxChars of [20, 30, 44, 60, 90]) {
      for (const sys of [...layoutScore(busy, { maxChars }), ...layoutScore(parseSolfa(OLD100, { time: '4/4' }), { maxChars })]) {
        if (barsOn(sys) > 1) expect(total(sys)).toBeLessThanOrEqual(maxChars);
      }
    }
    // Too narrow for most bars: one bar a line, some wider than the room (the score scrolls those sideways).
    const lines = layoutScore(busy, { maxChars: 20 });
    expect(lines.map(barsOn)).toEqual([1, 1, 1, 1]);
    expect(lines.some((s) => total(s) > 20)).toBe(true);
  });

  it('gives each word its room, and a busy beat a character beside it for its colon', () => {
    // The tenor's "d,t1.l1,s1", shown "d,t₁.l₁,s₁": 10 characters, and one more.
    expect(layoutScore(busyNotes, { maxChars: 90 })[0].widths[0]).toBe(11);
    const [first] = layoutScore(busy, { maxChars: 90 });
    for (const seg of first.rows[0].lyrics ?? []) {
      const from = seg.beat - first.start;
      const room = first.widths.slice(from, from + seg.span).reduce((a, b) => a + b, 0);
      expect(room).toBeGreaterThanOrEqual(Math.ceil(seg.text.length * 0.7 + 0.5));
    }
  });

  it('spreads bars evenly, leaving a bar alone on the last line only when nothing else fits', () => {
    const seven = parseSolfa(`S  ${'d :r /m :f | '.repeat(7)}`, { time: '4/4' });
    // Room for three bars of 12: three lines, 3 + 2 + 2 rather than 3 + 3 + 1.
    expect(layoutScore(seven, { maxChars: 40 }).map(barsOn)).toEqual([3, 2, 2]);
    expect(layoutScore(parseSolfa(`S  ${'d :r /m :f | '.repeat(5)}`, { time: '4/4' }), { maxChars: 40 }).map(barsOn)).toEqual([3, 2]);
  });

  it('still keeps to maxBeats when it is given too', () => {
    const lines = layoutScore(parseSolfa(OLD100, { time: '4/4' }), { maxChars: 200, maxBeats: 8 });
    expect(lines.every((s) => s.beats <= 8)).toBe(true);
  });

  it('lays out as before without a budget: lines by beats, columns without the extra character', () => {
    const systems = layoutScore(busy);
    // 12 beats hold three bars; four bars spread evenly make two lines of two.
    expect(systems.map((s) => s.beats)).toEqual([8, 8]);
    expect(layoutScore(busyNotes)[0].widths[0]).toBe(10);
    expect(layoutScore(busy, { maxBeats: 12 })).toEqual(systems);
  });
});

describe('hairpins and directions on the score', () => {
  const lay = (text: string, opts?: Parameters<typeof layoutScore>[1]) => layoutScore(parseSolfa(text, { time: '4/4' }), opts);

  it('draws a hairpin from its beat to the part’s next dynamic, as a wedge rather than a mark', () => {
    const [sys] = lay('S  {p}{<}d :r /m :{f}f |\nA  d :d /d :d |');
    expect(sys.rows[0].hairpins).toEqual([{ from: 0, to: 3, open: [0, 1] }]);
    expect(sys.rows[0].marks.map((m) => m.text)).toEqual(['p', 'f']);
    expect(sys.rows[1].hairpins).toEqual([]);
  });

  it('runs to the end of its bar when no mark ends it', () => {
    const [sys] = lay('S  d :{>}r /m :f | s :- /- :- |');
    expect(sys.rows[0].hairpins).toEqual([{ from: 1, to: 4, open: [1, 0] }]);
  });

  it('runs on into the next line when the mark that ends it is there', () => {
    const systems = lay('S  d :r /{<}m :f | s :{f}- /- :- |', { maxBeats: 4 });
    expect(systems.map((s) => s.rows[0].hairpins)).toEqual([[{ from: 2, to: 4, open: [0, 2 / 3] }], [{ from: 4, to: 5, open: [2 / 3, 1] }]]);
  });

  it('stops at the end of its bar when the mark that ends it is further on than the next line', () => {
    const systems = lay('S  d :{<}r /m :f | s :- /- :- | {f}d :- /- :- |', { maxBeats: 4 });
    expect(systems.map((s) => s.rows[0].hairpins)).toEqual([[{ from: 1, to: 4, open: [0, 1] }], [], []]);
  });

  it('ends at a dynamic for every part, and puts a hairpin for every part on the line itself', () => {
    const [own] = lay('S  {<}d :r /m :f |\n{f}\nS  s :- /- :- |', { maxBeats: 8 });
    expect(own.rows[0].hairpins).toEqual([{ from: 0, to: 4, open: [0, 1] }]);
    const [all] = lay('{>}\nS  d :r /m :f |\nA  d :d /d :d |\n{p}\nS  s :- /- :- |\nA  d :- /- :- |', { maxBeats: 8 });
    expect(all.hairpins).toEqual([{ from: 0, to: 4, open: [1, 0] }]);
    expect(all.rows.every((r) => r.hairpins.length === 0)).toBe(true);
  });

  it('leaves out another part’s hairpins with my part only', () => {
    const [sys] = lay('S  {<}d :r /m :{f}f |\nA  {>}d :d /d :{p}d |', { only: 'A' });
    expect(sys.rows.map((r) => [r.part, r.hairpins])).toEqual([['A', [{ from: 0, to: 3, open: [1, 0] }]]]);
  });

  it('puts accel. with the tempo marks, and directions in a part’s row or on the line', () => {
    const [sys] = lay('{Maestoso}\nS  {dolce}d :r /{accel}m :f |\nA  d :d /d :d |');
    expect(sys.marks.map((m) => [m.kind, m.text, m.beat])).toEqual([
      ['direction', 'Maestoso', 0],
      ['accel', 'accel.', 2],
    ]);
    expect(sys.rows[0].marks.map((m) => [m.kind, m.text, m.beat])).toEqual([['direction', 'dolce', 0]]);
  });
});

describe('repeats and jumps on the score', () => {
  const two = (text: string) => parseSolfa(`time: 2/4\n${text}`);

  it('draws a song with none as before', () => {
    const [sys] = layoutScore(two('S  d :r | m :f |'), { maxBeats: 8 });
    expect(sys.repeats).toBeUndefined();
    expect(sys.rows[0].cells.every((c) => c.repeat === undefined && c.repeatEndAfter === undefined)).toBe(true);
  });

  it('puts a repeat’s bar lines in every part’s row, with room for their dots', () => {
    const song = two('S  {|:}d :r | m :f {:|} | s :l {:|} |\nA  d :d | d :d | m :f |');
    const plain = layoutScore(two('S  d :r | m :f | s :l |\nA  d :d | d :d | m :f |'), { maxBeats: 6 })[0];
    const [sys] = layoutScore(song, { maxBeats: 6 });
    for (const row of sys.rows) {
      expect(row.cells.map((c) => c.repeat ?? null)).toEqual(['start', null, null, null, 'end', null]);
      expect(row.cells.map((c) => !!c.repeatEndAfter)).toEqual([false, false, false, false, false, true]);
    }
    // The start's column, the column before the end, and the last column each get a character more.
    expect(sys.widths.map((w, i) => w - plain.widths[i])).toEqual([1, 0, 0, 1, 0, 1]);
    // Nothing to draw over the line: the bar lines are the repeats.
    expect(sys.repeats).toBeUndefined();
  });

  it('puts an end repeat at the end of its line, not at the start of the next', () => {
    const systems = layoutScore(two('S  d :r | m :f {:|} | {|:}s :l | t :d\' |'), { maxBeats: 4 });
    expect(systems.map((s) => [s.start, s.rows[0].cells.map((c) => c.repeat ?? (c.repeatEndAfter ? 'after' : null))])).toEqual([
      [0, [null, null, null, 'after']],
      [4, ['start', null, null, null]],
    ]);
  });

  it('draws the segno and coda from their beat, and a jump’s words where its bar ends, on that bar’s line', () => {
    const song = two('S  {segno}d :r | m :f {to coda} | s :l {D.S. al Coda} | {coda}t :d\' |');
    const systems = layoutScore(song, { maxBeats: 4 });
    expect(systems.map((s) => s.repeats)).toEqual([
      { signs: [{ beat: 0, sign: 'segno' }], words: [{ beat: 4, text: 'To Coda', coda: true }], endings: [] },
      { signs: [{ beat: 6, sign: 'coda' }], words: [{ beat: 6, text: 'D.S. al Coda', coda: false }], endings: [] },
    ]);
    // Room for the words within the bar they end.
    const bar = (s: (typeof systems)[number], from: number, to: number) => s.widths.slice(from, to).reduce((a, b) => a + b, 0);
    expect(bar(systems[1], 0, 2)).toBeGreaterThanOrEqual(Math.ceil('D.S. al Coda'.length * 0.7));
  });

  it('draws first and second endings as brackets over their bars, the first closed and the second open', () => {
    const song = two('S  {|:}d :r | {1.}m :f {:|} | {2.}s :l | d\' :- |');
    const [sys] = layoutScore(song, { maxBeats: 8 });
    expect(sys.repeats?.endings).toEqual([
      { label: '1.', from: 2, to: 4, starts: true, closed: true },
      { label: '2.', from: 4, to: 6, starts: true, closed: false },
    ]);
    // Across two lines: on the second, it runs on from the line's start, with no label or hook there.
    const long = layoutScore(two('S  d :r | {1.}m :f | s :l {:|} | {2.}t :d\' |'), { maxBeats: 4 });
    expect(long.map((s) => s.repeats?.endings)).toEqual([
      [{ label: '1.', from: 2, to: 4, starts: true, closed: false }],
      [
        { label: '1.', from: 4, to: 6, starts: false, closed: true },
        { label: '2.', from: 6, to: 8, starts: true, closed: false },
      ],
    ]);
  });
});
