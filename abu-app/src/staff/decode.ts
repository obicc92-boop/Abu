/**
 * What the staff reader writes for one staff, made into bars of notes (a
 * port of SonkoMusic's pianoDecode.ts). Its tokens are staff positions and
 * lengths (`n4@3` is a quarter note on the staff's fourth step up from the
 * bottom line, `/2` a second voice, `+@1` another head of the same chord),
 * and the pitches follow from the clef, the key signature, the bar's
 * accidentals, ties and 8va lines. Times within the bar are worked out with
 * the system's other staves (timing.ts), since a lower voice's silences may
 * be left blank.
 */

/** A token the reader read, and the column (output step) it was first read at. */
export type Token = [name: string, step: number];

export type Clef = 'G' | 'F';
/** The step (C0 = 0, one a letter) of a clef's bottom line: E4 for the treble, G2 for the bass. */
export const CLEF_BASE: Record<Clef, number> = { G: 30, F: 18 };
const SHARPS = [3, 0, 4, 1, 5, 2, 6];
const FLATS = [6, 2, 5, 1, 4, 0, 3];
const ACC: Record<string, number> = { s: 1, f: -1, n: 0, x: 2, ff: -2 };
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The alteration a key signature gives a letter (0 = C). */
export function keyAlterOf(fifths: number, letter: number): number {
  if (fifths > 0) return SHARPS.slice(0, fifths).includes(letter) ? 1 : 0;
  if (fifths < 0) return FLATS.slice(0, -fifths).includes(letter) ? -1 : 0;
  return 0;
}

export interface ReadHead {
  /** The written step (C0 = 0, an 8va line already counted) and alteration. */
  step: number;
  alter: number;
  /** Tied to the same note next in its voice; tied from the one before. */
  tie: boolean;
  tiedIn: boolean;
}

export interface ReadEvent {
  voice: 1 | 2;
  rest: boolean;
  /** Written value (4 a quarter) and dots. */
  dur: number;
  dots: number;
  tuplet?: 3 | 6;
  /** Low to high. Empty for a rest. */
  heads: ReadHead[];
  fermata?: boolean;
  /** The column it was read at. */
  at: number;
  /** Beats (quarters) it lasts. */
  beats: number;
}

export type Barline = 'bar' | 'bar.dbl' | 'bar.end' | 'rpt.end';

/** Repeat signs and words the reader knows: segno, coda, tocoda, ds.coda, dc.coda, ds.fine, dc.fine, fine. */
export const MARK_TOKENS = ['segno', 'coda', 'tocoda', 'ds.coda', 'dc.coda', 'ds.fine', 'dc.fine', 'fine'];
/** Those that end a bar (printed at its end, over or after its last notes). */
export const END_MARKS = ['tocoda', 'ds.coda', 'dc.coda', 'ds.fine', 'dc.fine', 'fine'];

export interface ReadBar {
  events: ReadEvent[];
  /** The column its barline was read at (null: the staff ended without one). */
  end: number | null;
  barline: Barline | null;
  repeatStart?: boolean;
  volta?: 1 | 2;
  marks: string[];
  /** A key or metre that starts here. */
  key?: number;
  time?: string;
}

export interface StaffState {
  clef: Clef;
  fifths: number;
  time: string;
}

export interface ReadStaff {
  /** The clef, key and metre the staff starts in (read, or carried from the staff before). */
  start: StaffState;
  /** Whether the staff printed a time signature (a piece's first system). */
  timeRead: boolean;
  /** Whether it printed its own clef (else the one carried was used). */
  clefRead: boolean;
  bars: ReadBar[];
  /** What's in force at its end, for the next system. */
  end: StaffState;
  /** Ties still open at its end (into the next system): by voice and written step. */
  open: Map<string, number>;
}

export const beatsOf = (dur: number, dots: number, tuplet?: 3 | 6) => (4 / dur) * (dots === 2 ? 1.75 : dots === 1 ? 1.5 : 1) * (tuplet === 3 ? 2 / 3 : tuplet === 6 ? 4 / 6 : 1);

/**
 * A staff's tokens as bars of events. `carried` is the clef, key and metre
 * in force from the staff before (the same part's on the system above);
 * `ties` the ties still open from it. `strayWithin`: a barline read before
 * any music, this close (in columns) after the clef and key, is the
 * system's own first line misread. `nearBar`: a jump or Fine read this
 * close after a barline, before any note of the next bar, belongs to the
 * bar it ends.
 */
export function decodeStaff(tokens: Token[], carried: StaffState, ties: Map<string, number> = new Map(), options: { strayWithin?: number; nearBar?: number } = {}): ReadStaff {
  const strayWithin = options.strayWithin ?? Infinity;
  const nearBar = options.nearBar ?? 0;
  let lastSign = -Infinity;
  let { clef, fifths, time } = carried;
  let started = false;
  let start: StaffState = { clef, fifths, time };
  let timeRead = false;
  let clefRead = false;
  const bars: ReadBar[] = [];
  let bar: ReadBar = { events: [], end: null, barline: null, marks: [] };
  // Accidentals drawn this bar, by written step.
  const drawn = new Map<number, number>();
  const open = new Map(ties);
  let ottava = 0;
  let ottavaEnds = false;
  let tupletOpen: { num: 3 | 6; voice: 1 | 2 | null } | null = null;
  let tupletEnds = false;
  let pendingAcc: number | null = null;
  let event: ReadEvent | null = null;
  // (Set by head(), so widened: the checker can't see a closure's assignments.)
  let lastHead = null as { head: ReadHead; written: number } | null;
  // Ties this event opened (kept past it).
  const openedNow = new Set<string>();

  const startState = () => {
    if (!started) {
      start = { clef, fifths, time };
      started = true;
    }
  };
  const finish = () => {
    if (!event) return;
    event.beats = beatsOf(event.dur, event.dots, event.tuplet);
    // A voice's ties not taken up by its next note are dropped (the reader missed the note or the tie).
    for (const key of [...open.keys()]) if (key.startsWith(`${event.voice}:`) && !openedNow.has(key)) open.delete(key);
    openedNow.clear();
    // A chord tied in some heads to the same chord next in its voice is tied in all of them.
    if (!event.rest && event.heads.length > 1 && event.heads.some((h) => h.tiedIn)) {
      const voice = event.voice;
      const before = [...(bars.at(-1)?.events ?? []), ...bar.events].reverse().find((x) => x.voice === voice);
      const notes = (x: ReadEvent) => x.heads.map((h) => `${h.step}:${h.alter}`).join(',');
      if (before && !before.rest && notes(before) === notes(event) && before.heads.some((h) => !h.tie))
        event.heads.forEach((h, k) => {
          before.heads[k].tie = true;
          h.tiedIn = true;
        });
    }
    bar.events.push(event);
    event = null;
    if (tupletEnds) {
      tupletOpen = null;
      tupletEnds = false;
    }
    if (ottavaEnds) {
      ottava = 0;
      ottavaEnds = false;
    }
  };
  const head = (pos: number, voice: 1 | 2): ReadHead => {
    const written = pos + CLEF_BASE[clef];
    const key = `${voice}:${written}`;
    let alter: number;
    let tiedIn = false;
    if (pendingAcc !== null) {
      alter = pendingAcc;
      drawn.set(written, alter);
    } else if (open.has(key)) {
      alter = open.get(key)!;
      tiedIn = true;
    } else alter = drawn.get(written) ?? keyAlterOf(fifths, mod(written, 7));
    if (open.has(key)) {
      tiedIn = true;
      open.delete(key);
    }
    pendingAcc = null;
    const h: ReadHead = { step: written + ottava, alter, tie: false, tiedIn };
    lastHead = { head: h, written };
    return h;
  };

  for (const [tok, t] of tokens) {
    if (tok.startsWith('clef.')) {
      finish();
      clef = tok === 'clef.F' ? 'F' : 'G';
      if (!bars.length && !bar.events.length) {
        lastSign = t;
        clefRead = true;
      }
      continue;
    }
    if (tok.startsWith('key:')) {
      finish();
      if (!bars.length && !bar.events.length) lastSign = t;
      fifths = Number(tok.slice(4));
      if (bar.events.length || bars.length) bar.key = fifths;
      continue;
    }
    if (tok.startsWith('time:')) {
      finish();
      if (!bars.length && !bar.events.length) lastSign = t;
      time = tok.slice(5);
      if (!bars.length && !bar.events.length) timeRead = true;
      else bar.time = time;
      continue;
    }
    startState();
    if (tok === 'bar' || tok === 'bar.dbl' || tok === 'bar.end' || tok === 'rpt.end') {
      finish();
      if (!bar.events.length && !bars.length && !bar.marks.length && !bar.repeatStart && t - lastSign <= strayWithin) continue; // a stray line before the music
      bar.end = t;
      bar.barline = tok;
      bars.push(bar);
      bar = { events: [], end: null, barline: null, marks: [] };
      drawn.clear();
      pendingAcc = null;
      continue;
    }
    if (tok === 'rpt.start') bar.repeatStart = true;
    else if (tok === 'volta1' || tok === 'volta2') bar.volta = tok === 'volta1' ? 1 : 2;
    else if (MARK_TOKENS.includes(tok)) {
      const last = bars.at(-1);
      // A jump or Fine just after the barline it's printed at, before the next bar's notes: that bar's.
      if (END_MARKS.includes(tok) && last && last.end !== null && !bar.events.length && !event && t - last.end <= nearBar) last.marks.push(tok);
      else bar.marks.push(tok);
    } else if (tok === '8va' || tok === '8vb') {
      finish();
      ottava = tok === '8va' ? 7 : -7;
    } else if (tok === 'ott.end') {
      if (event) ottavaEnds = true;
      else ottava = 0;
    } else if (tok === 'tuplet3' || tok === 'tuplet6') {
      finish();
      tupletOpen = { num: tok === 'tuplet3' ? 3 : 6, voice: null };
    } else if (tok === 'tuplet.end') {
      if (event) tupletEnds = true;
      else tupletOpen = null;
    } else if (tok.startsWith('acc.')) {
      // An accidental before a chord's next head stays with this chord; before a new note, the note.
      pendingAcc = ACC[tok.slice(4)] ?? null;
    } else if (tok.startsWith('g@')) {
      // A grace note takes no time, and sol-fa leaves it out; its accidental still counts for the bar.
      finish();
      const written = Number(tok.slice(2)) + CLEF_BASE[clef];
      if (pendingAcc !== null) drawn.set(written, pendingAcc);
      pendingAcc = null;
    } else if (/^[nr]\d+/.test(tok)) {
      finish();
      const voice: 1 | 2 = tok.endsWith('/2') ? 2 : 1;
      const m = /^([nr])(\d+)(?:@(-?\d+))?/.exec(tok)!;
      const rest = m[1] === 'r';
      let tuplet: 3 | 6 | undefined;
      if (tupletOpen) {
        tupletOpen.voice ??= voice;
        if (tupletOpen.voice === voice) tuplet = tupletOpen.num;
      }
      event = {
        voice,
        rest,
        dur: Number(m[2]),
        dots: 0,
        ...(tuplet ? { tuplet } : {}),
        heads: rest ? [] : [head(Number(m[3]), voice)],
        at: t,
        beats: 0,
      };
      if (rest) pendingAcc = null;
    } else if (tok.startsWith('+@')) {
      if (event && !event.rest) {
        const h = head(Number(tok.slice(2)), event.voice);
        // One head a step: a second reading of the same head is dropped.
        if (!event.heads.some((x) => x.step === h.step)) event.heads.push(h);
        event.heads.sort((a, b) => a.step - b.step);
      }
    } else if (tok === 'tie') {
      if (lastHead && event && !event.rest) {
        lastHead.head.tie = true;
        open.set(`${event.voice}:${lastHead.written}`, lastHead.head.alter);
        openedNow.add(`${event.voice}:${lastHead.written}`);
      }
    } else if (tok === 'dot') {
      if (event) event.dots = Math.min(2, event.dots + 1);
    } else if (tok === 'ferm') {
      if (event) event.fermata = true;
      else if (bar.events.length) bar.events[bar.events.length - 1].fermata = true;
    }
    // (Arpeggios and ornaments change nothing a choir sings.)
  }
  finish();
  if (bar.events.length || bar.marks.length || bar.repeatStart || bar.volta) bars.push(bar);
  if (!started) start = { clef, fifths, time };
  return { start, timeRead, clefRead, bars, end: { clef, fifths, time }, open };
}

/** Quarters in a bar of a metre. */
export function barBeats(time: string): number {
  if (time === 'C' || time === 'cut') return 4;
  const [n, d] = time.split('/').map(Number);
  return n && d ? (n * 4) / d : 4;
}

/** A metre as beats over beat type: C is 4/4, cut time 2/2. */
export function metreOf(time: string): { beats: number; beatType: number } {
  if (time === 'C') return { beats: 4, beatType: 4 };
  if (time === 'cut') return { beats: 2, beatType: 2 };
  const [n, d] = time.split('/').map(Number);
  return n && d ? { beats: n, beatType: d } : { beats: 4, beatType: 4 };
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMI = [0, 2, 4, 5, 7, 9, 11];
/** A step (C0 = 0) and alteration as MIDI (C4 = 60). */
export const midiOf = (step: number, alter: number) => 12 * (Math.floor(step / 7) + 1) + SEMI[mod(step, 7)] + alter;
/** A step's letter, C to B. */
export const letterOf = (step: number) => LETTERS[mod(step, 7)];
