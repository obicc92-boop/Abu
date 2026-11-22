/**
 * Writes soprano, alto, tenor and bass lines as SolfaScores sol-fa text (see
 * docs/solfa-format.md): each beat in the simplest form that fits (whole,
 * halves, thirds, quarters or sixths), holds, rests, octave marks, raised and
 * lowered notes named from how they're spelt, verse 1's words under each part
 * that has them, slurs in brackets, and the score's dynamics, tempo, repeats,
 * jumps, key changes ("Doh is F") and sections ("[Chorus]"), as sheets print
 * them (22 November 2026, for staff notation read into sol-fa).
 */
import { dohForPitch, dohMidi, isLowPart, mod12, tunePart } from '../solfa';

import type { XScore } from './read';
import type { VoiceLine } from './satb';

export interface PlannedNote {
  /** Beats from the start of the song, as the text will play it. */
  start: number;
  dur: number;
  midi: number;
}

export interface SolfaText {
  text: string;
  title: string;
  composer: string;
  /** Starting doh, e.g. "Bb". */
  key: string;
  time: string;
  /** The tempo printed at the start ("Andante", "M. 80"), or "". */
  tempo: string;
  parts: string[];
  bars: number;
  /** The lines of music, as written in `text`. */
  lines: SolfaLine[];
  /** Where the text can't say exactly what the score says (rhythms rounded, time changes...). */
  problems: string[];
  /** The notes the text should play, per part: the check compares SolfaScores' reading of the text with these. */
  planned: Record<string, PlannedNote[]>;
}

const EPS = 1e-6;
const DIVISIONS = [1, 2, 4, 3, 6];
const LETTERS = 'CDEFGAB';
const DIATONIC = ['d', 'r', 'm', 'f', 's', 'l', 't'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const RAISED: Record<number, string> = { 1: 'de', 3: 're', 6: 'fe', 8: 'se', 10: 'le' };
const LOWERED: Record<number, string> = { 1: 'ra', 3: 'ma', 6: 'fe', 8: 'lo', 10: 'ta' };
const KEY_BY_FIFTHS: Record<number, string> = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#', '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb' };

/** The sol-fa name for a note, from how far it sits above doh and how it's spelt. */
export function syllable(midi: number, dohBase: number, dohLetter: string, step: string, alter: number): { name: string; octave: number } {
  const rel = midi - dohBase;
  const deg = mod12(rel);
  const octave = Math.floor(rel / 12);
  const i = NATURAL.indexOf(deg);
  if (i >= 0) return { name: DIATONIC[i], octave };
  const letter = LETTERS.indexOf(step);
  const written = letter >= 0 ? (letter - LETTERS.indexOf(dohLetter) + 7) % 7 : -1;
  // Written on the letter below (C♯ in C) it's raised; on the letter above (D♭) it's lowered.
  const raised = written >= 0 ? mod12(deg - NATURAL[written]) === 1 : alter >= 0;
  return { name: (raised ? RAISED : LOWERED)[deg], octave };
}

const octaveMark = (o: number) => (o > 0 ? "'".repeat(Math.min(o, 2)) : o < 0 ? String(Math.min(-o, 2)) : '');

type Slot = { kind: 'start'; token: string } | { kind: 'hold' } | { kind: 'rest' };

/** One beat's slots as SolfaScores writes them: "d", "-", "", "d.r", "d.,r", "d.r.m", "d,r.m,f"... */
function writeBeat(slots: Slot[]): string {
  const first = (s: Slot) => (s.kind === 'start' ? s.token : s.kind === 'hold' ? '-' : 'x');
  const later = (s: Slot, prevRest: boolean) => (s.kind === 'start' ? s.token : s.kind === 'rest' && !prevRest ? 'x' : '');
  if (slots.length === 1) return slots[0].kind === 'rest' ? '' : first(slots[0]);
  const tokens = slots.map((s, k) => (k === 0 ? first(s) : later(s, slots[k - 1].kind === 'rest')));
  const pair = (a: string, b: string) => (b === '' ? a : `${a},${b}`);
  if (slots.length === 2 || slots.length === 3) return tokens.join('.');
  if (slots.length === 4) return `${pair(tokens[0], tokens[1])}.${pair(tokens[2], tokens[3])}`;
  return `${pair(tokens[0], tokens[1])}.${pair(tokens[2], tokens[3])}.${pair(tokens[4], tokens[5])}`;
}

interface BeatNote {
  start: number;
  end: number;
  midi: number;
  token: string;
  lyric?: { text: string; syllabic: string };
  /** A slur's first note, and its last (the brackets round them: `(s :f |m)`). */
  opens?: boolean;
  closes?: boolean;
  /** After a slur's first note: it takes no syllable of its own. */
  slurred?: boolean;
}

/** A line of music as written: the bars it holds (indexes into the score's measures) and its rows. */
export interface SolfaLine {
  bars: number[];
  /** Its part rows, each with its words under it if it has any. */
  rows: string;
  /** A new key from its start ("F"), or a section starting there ("Chorus"). */
  key?: string;
  section?: string;
}

export interface SolfaOptions {
  barsPerLine?: number;
  /** The lines of music as the sheet set them: each a list of bar indexes, in order (a staff score's systems). */
  systems?: number[][];
}

/**
 * The score's voice lines as sol-fa. Doh starts where SolfaScores puts it for the key: in A♭ to B, the doh above
 * middle C unless the tune sits too high to be played back from there (dohForPitch, on the notes the text plays).
 */
export function toSolfa(score: XScore, lines: VoiceLine[], opts: SolfaOptions = {}): SolfaText {
  const { out, start } = write(score, lines, opts);
  const tune = tunePart(out.parts);
  const notes = tune ? (out.planned[tune] ?? []).filter((n) => n.start < start.until - EPS) : [];
  if (!notes.length) return out;
  const doh = dohForPitch(start.semitone, notes.reduce((sum, n) => sum + n.midi, 0) / notes.length);
  if (doh === start.doh) return out;
  return write(score, lines, opts, doh).out;
}

/** The sol-fa, with doh starting at `firstDoh` (else where SolfaScores puts it for the key), and where it started. */
function write(score: XScore, lines: VoiceLine[], opts: SolfaOptions, firstDoh?: number): { out: SolfaText; start: { doh: number; semitone: number; until: number } } {
  const problems: string[] = [];
  const time = score.times[0] ?? { at: 0, beats: 4, beatType: 4 };
  if (score.times.some((t) => t.beats !== time.beats || t.beatType !== time.beatType)) problems.push('The time signature changes; SolfaScores keeps one time per song.');
  const beatQ = 4 / time.beatType;
  const bpb = time.beats;

  // Bars in beats. A short first bar (pickup) is padded at its start so its notes end on the barline.
  const measures = score.measures.length ? score.measures : [{ start: 0, length: bpb * beatQ, number: '1', implicit: false }];
  const barBeats: number[] = [];
  const barStart: number[] = [];
  const shift: number[] = [];
  let beatAt = 0;
  measures.forEach((m, i) => {
    const len = m.length / beatQ;
    const whole = Math.ceil(len - EPS);
    if (Math.abs(whole - len) > EPS && i > 0) problems.push(`Bar ${m.number} lasts ${+len.toFixed(2)} beats; it’s written as ${whole}.`);
    if (i > 0 && i < measures.length - 1 && whole !== bpb) problems.push(`Bar ${m.number} has ${whole} beats; ${bpb} are expected.`);
    barBeats.push(Math.max(1, whole));
    barStart.push(beatAt);
    shift.push(i === 0 ? whole - len : 0);
    beatAt += Math.max(1, whole);
  });
  const barOf = (q: number) => {
    const i = measures.findIndex((m) => q < m.start + m.length - EPS);
    return i < 0 ? measures.length - 1 : i;
  };
  const toBeat = (q: number): number => {
    const i = barOf(q);
    return barStart[i] + shift[i] + (q - measures[i].start) / beatQ;
  };
  /** The bar and the beat in it where a time falls. */
  const beatIn = (q: number): [bar: number, beat: number] => {
    const bar = barOf(q);
    return [bar, Math.max(0, Math.min(barBeats[bar] - 1, Math.floor(toBeat(q) - barStart[bar] + EPS)))];
  };

  // Keys: doh moves to the nearest place at each change, as SolfaScores' player does.
  const keys = [...(score.keys.length ? score.keys : [{ at: 0, fifths: 0, mode: 'major' }])].sort((a, b) => a.at - b.at);
  const keyBars: { bar: number; name: string; semitone: number; doh: number }[] = [];
  for (const k of keys) {
    const name = KEY_BY_FIFTHS[Math.max(-7, Math.min(7, k.fifths))];
    const semitone = mod12(7 * k.fifths);
    let bar = measures.findIndex((m) => m.start + EPS >= k.at);
    if (bar < 0) bar = measures.length - 1;
    const prev = keyBars[keyBars.length - 1];
    if (prev && prev.semitone === semitone) continue;
    if (prev && Math.abs(measures[bar].start - k.at) > EPS) problems.push(`The key changes inside bar ${measures[bar].number}; SolfaScores changes key at the barline.`);
    const doh = prev ? prev.doh + (mod12(semitone - prev.semitone) <= 5 ? mod12(semitone - prev.semitone) : mod12(semitone - prev.semitone) - 12) : (firstDoh ?? dohMidi(semitone));
    if (prev && prev.bar === bar) keyBars.pop();
    keyBars.push({ bar: keyBars.length ? bar : 0, name, semitone, doh });
  }
  const keyAt = (bar: number) => [...keyBars].reverse().find((k) => k.bar <= bar) ?? keyBars[0];

  // What the score marks besides notes, in braces before the beat they start on (docs/solfa-format.md): a part's
  // dynamics in its own row, the tempo and repeats in the first part's row (each mark is read once), jumps and ends
  // after their bar's last note, and sections above the line they start.
  const before: Record<string, string[][][]> = {}; // part -> bars -> beats -> marks
  const after: string[][] = barBeats.map(() => []); // bar -> jumps and ends, in the first part's row
  const sectionAt = new Map<number, string>();
  let tempo = '';
  const first = lines[0]?.part;
  for (const l of lines) before[l.part] = barBeats.map((n) => Array.from({ length: n }, () => []));
  const firstNote = Math.min(...lines.flatMap((l) => l.notes.map((n) => n.start)), Infinity);
  for (const d of score.directions ?? []) {
    const bar = Math.max(0, Math.min(d.bar, barBeats.length - 1));
    if (d.kind === 'section') {
      if (!sectionAt.has(bar)) sectionAt.set(bar, d.text);
      continue;
    }
    if (d.kind === 'end') {
      if (!after[bar].includes(d.text)) after[bar].push(d.text);
      continue;
    }
    // A metronome mark is in quarter notes a minute; the song counts its own beats.
    const text = d.kind === 'tempo' ? d.text.replace(/\bM\. (\d+)/, (_, q) => `M. ${Math.round(Number(q) / beatQ)}`) : d.text;
    if (d.kind === 'tempo' && !tempo && d.at <= Math.max(0, firstNote) + EPS) {
      tempo = text;
      continue;
    }
    const [b, beat] = beatIn(d.at);
    const rows = d.part === null ? (first ? [first] : []) : lines.filter((l) => l.from && l.from.part === d.part && (d.staff === undefined || l.from.staff === d.staff)).map((l) => l.part);
    for (const part of rows) {
      const here = before[part][b][beat];
      if (!here.includes(text)) here.push(text);
    }
  }

  const planned: Record<string, PlannedNote[]> = {};
  const written: Record<string, string[][]> = {}; // part -> bars -> beats
  const lyricsByBar: Record<string, string[][]> = {}; // part -> bars -> syllable tokens, in note order

  for (const line of lines) {
    const low = isLowPart(line.part);
    const notes: BeatNote[] = line.notes
      .map((n) => {
        const start = toBeat(n.start);
        const bar = Math.max(0, barStart.findIndex((b, i) => start < b + barBeats[i] - EPS));
        const k = keyAt(bar);
        const s = syllable(n.midi, k.doh - (low ? 12 : 0), k.name[0], n.step, n.alter);
        if (Math.abs(s.octave) > 2) problems.push(`${line.part}: a note is more than two octaves from doh.`);
        return { start, end: start + n.dur / beatQ, midi: n.midi, token: s.name + octaveMark(s.octave), lyric: n.lyric, slurStart: n.slurStart, slurStop: n.slurStop };
      })
      .sort((a, b) => a.start - b.start)
      .map(({ slurStart, slurStop, ...n }) => ({ ...n, ...(slurStart ? { opens: true } : {}), ...(slurStop ? { closes: true } : {}) }) as BeatNote & { opens?: boolean; closes?: boolean });
    // Slurs paired from first note to last (one at a time: a slur inside another is the same syllable anyway). In
    // sol-fa a slur's notes after the first take no syllable, so a slur over notes that each have their own (a
    // phrase mark, not one syllable sung over several notes) is left out, keeping the words with their notes.
    let open = -1;
    notes.forEach((n, i) => {
      const opens = n.opens;
      const closes = n.closes;
      n.opens = n.closes = false;
      if (open >= 0 && closes && i > open && notes.slice(open + 1, i + 1).some((m) => m.lyric?.text.trim())) open = -1;
      else if (open >= 0 && closes && i > open) {
        notes[open].opens = true;
        n.closes = true;
        for (let k = open + 1; k <= i; k++) notes[k].slurred = true;
        open = -1;
      }
      if (open < 0 && opens && !closes) open = i;
    });

    const out: PlannedNote[] = (planned[line.part] = []);
    const bars: string[][] = (written[line.part] = barBeats.map(() => []));
    const words: string[][] = (lyricsByBar[line.part] = barBeats.map(() => []));
    let ni = 0;
    let rounded = false;
    let last: PlannedNote | null = null;
    for (let bar = 0; bar < barBeats.length; bar++) {
      for (let b = 0; b < barBeats[bar]; b++) {
        const B = barStart[bar] + b;
        // Notes touching this beat, and the finest division their edges need.
        while (ni < notes.length && notes[ni].end <= B + EPS) ni++;
        const here = notes.slice(ni).filter((n) => n.start < B + 1 - EPS);
        const edges = here.flatMap((n) => [n.start - B, n.end - B]).filter((x) => x > EPS && x < 1 - EPS);
        let d = DIVISIONS.find((dv) => edges.every((x) => Math.abs(x * dv - Math.round(x * dv)) < 1e-4));
        if (d === undefined) {
          rounded = true;
          const err = (v: number) => edges.reduce((sum, x) => sum + Math.abs(x * v - Math.round(x * v)), 0);
          d = err(6) < err(4) ? 6 : 4;
        }
        const step = 1 / d;
        // Only edges inside this beat are snapped: a note from before it isn't struck again on it (Math.round(-0.5) is 0).
        const snap = (x: number) => (x < B - EPS ? x : B + Math.round((x - B) * d!) / d!);
        const slots: Slot[] = [];
        for (let k = 0; k < d; k++) {
          const t = B + k * step;
          const starting = here.find((n) => Math.abs(snap(n.start) - t) < EPS);
          if (starting) {
            slots.push({ kind: 'start', token: `${starting.opens ? '(' : ''}${starting.token}${starting.closes ? ')' : ''}` });
            // As SolfaScores will play it: a note runs on through holds, and stops at a rest or the next note.
            last = { start: t, dur: step, midi: starting.midi };
            out.push(last);
            if (!starting.slurred) words[bar].push(lyricToken(starting.lyric));
            continue;
          }
          const covering = here.find((n) => snap(n.start) < t - EPS && snap(n.end) > t + EPS);
          if (covering && last) {
            slots.push({ kind: 'hold' });
            last.dur += step;
          } else {
            slots.push({ kind: 'rest' });
            last = null;
          }
        }
        bars[bar].push(writeBeat(slots));
      }
    }
    // A slur whose last note couldn't be written leaves a bracket open: the part's slurs are left out instead.
    const all = bars.flat().join('');
    if ((all.match(/\(/g) ?? []).length !== (all.match(/\)/g) ?? []).length) for (const bar of bars) bar.forEach((beat, i) => (bar[i] = beat.replace(/[()]/g, '')));
    if (rounded) problems.push(`${line.part}: some rhythms were rounded to the nearest quarter or sixth of a beat.`);
    const off = notes.filter((n) => !out.some((p) => p.midi === n.midi && Math.abs(p.start - n.start) < 1e-4 && Math.abs(p.start + p.dur - n.end) < 1e-4)).length;
    if (off) problems.push(`${line.part}: ${off} note${off === 1 ? '' : 's'} can’t be written exactly.`);
  }

  // Lines of music: as the sheet set them, or about 16 beats each, starting a new line at a key change or a section.
  let systems: number[][];
  if (opts.systems?.length) systems = opts.systems.map((s) => s.filter((b) => b >= 0 && b < barBeats.length)).filter((s) => s.length);
  else {
    const per = opts.barsPerLine ?? Math.max(2, Math.round(16 / bpb));
    systems = [];
    let current: number[] = [];
    for (let bar = 0; bar < barBeats.length; bar++) {
      const keyChange = keyBars.some((k) => k.bar === bar && bar > 0);
      if (current.length && (current.length >= per || keyChange || sectionAt.has(bar))) {
        systems.push(current);
        current = [];
      }
      current.push(bar);
    }
    if (current.length) systems.push(current);
  }

  const head = [
    score.title ? `title: ${oneLine(score.title)}` : '',
    score.composer ? `composer: ${oneLine(score.composer)}` : '',
    score.lyricist ? `lyricist: ${oneLine(score.lyricist)}` : '',
    `key: ${keyBars[0].name}`,
    `time: ${time.beats}/${time.beatType}`,
    tempo ? `tempo: ${tempo}` : '',
  ].filter(Boolean);
  const solfaLines: SolfaLine[] = systems.map((sys) => {
    const rows: string[] = [];
    for (const line of lines) {
      const barsText = sys.map((bar) => {
        const raw = written[line.part][bar];
        // A bar of rests still needs a rest written, or the bar would vanish (marks in braces don't count).
        const beats = (raw.every((x) => x === '') ? ['x', ...raw.slice(1)] : raw).map((beat, i) => {
          const marks = before[line.part][bar][i];
          return marks.length ? `${marks.map((m) => `{${m}}`).join('')}${beat}` : beat;
        });
        const text = beats.join(' :');
        const ends = line.part === first ? after[bar] : [];
        return ends.length ? `${text} ${ends.map((m) => `{${m}}`).join(' ')}` : text;
      });
      rows.push(`${line.part.padEnd(2)} ${barsText.join(' | ')} |`);
      const words = joinWords(sys.flatMap((bar) => lyricsByBar[line.part][bar]));
      if (words) rows.push(`W  ${words}`);
    }
    const change = keyBars.find((k) => k.bar === sys[0] && sys[0] > 0);
    const section = sys.map((bar) => sectionAt.get(bar)).find(Boolean);
    return { bars: sys, rows: rows.join('\n'), ...(change ? { key: change.name } : {}), ...(section ? { section } : {}) };
  });
  // A section or key starting inside a line of music the sheet set: written above that line.
  const blocks = solfaLines.map((l) => [l.section ? `[${l.section}]` : '', l.key ? `Doh is ${l.key}` : '', l.rows].filter(Boolean).join('\n'));

  return {
    out: {
      text: `${head.join('\n')}\n\n${blocks.join('\n\n')}\n`,
      title: score.title,
      composer: score.composer,
      key: keyBars[0].name,
      time: `${time.beats}/${time.beatType}`,
      tempo,
      parts: lines.map((l) => l.part),
      bars: barBeats.length,
      lines: solfaLines,
      problems: [...new Set(problems)],
      planned,
    },
    start: { doh: keyBars[0].doh, semitone: keyBars[0].semitone, until: keyBars[1] ? barStart[keyBars[1].bar] : Infinity },
  };
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A syllable for the W line: "peo-" joins the next syllable; "_" skips a note with no word. */
function lyricToken(l?: { text: string; syllabic: string }): string {
  if (!l) return '_';
  const t = l.text.replace(/[\s:|]+/g, '').replace(/-/g, '') || '_';
  return l.syllabic === 'begin' || l.syllabic === 'middle' ? `${t}-` : t;
}

function joinWords(tokens: string[]): string {
  while (tokens.length && tokens[tokens.length - 1] === '_') tokens.pop();
  if (!tokens.some((t) => t !== '_')) return '';
  let out = '';
  tokens.forEach((t, i) => {
    if (i === 0) out = t;
    else if (out.endsWith('-') && t !== '_') out += t;
    else out += ` ${t}`;
  });
  return out;
}
