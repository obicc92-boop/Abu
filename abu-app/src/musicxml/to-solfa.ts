/**
 * Writes soprano, alto, tenor and bass lines as Abụ sol-fa text (see
 * docs/solfa-format.md): each beat in the simplest form that fits (whole,
 * halves, thirds, quarters or sixths), holds, rests, octave marks, raised and
 * lowered notes named from how they're spelt, and verse 1 under the soprano.
 */
import { dohMidi, isLowPart, mod12 } from '../solfa';

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
  parts: string[];
  bars: number;
  /** Where the text can't say exactly what the score says (rhythms rounded, time changes...). */
  problems: string[];
  /** The notes the text should play, per part: the check compares Abụ's reading of the text with these. */
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

/** One beat's slots as Abụ writes them: "d", "-", "", "d.r", "d.,r", "d.r.m", "d,r.m,f"... */
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
}

export function toSolfa(score: XScore, lines: VoiceLine[], opts: { barsPerLine?: number } = {}): SolfaText {
  const problems: string[] = [];
  const time = score.times[0] ?? { at: 0, beats: 4, beatType: 4 };
  if (score.times.some((t) => t.beats !== time.beats || t.beatType !== time.beatType)) problems.push('The time signature changes; Abụ keeps one time per song.');
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
  const toBeat = (q: number): number => {
    let i = measures.findIndex((m) => q < m.start + m.length - EPS);
    if (i < 0) i = measures.length - 1;
    return barStart[i] + shift[i] + (q - measures[i].start) / beatQ;
  };

  // Keys: doh moves to the nearest place at each change, as Abụ's player does.
  const keys = [...(score.keys.length ? score.keys : [{ at: 0, fifths: 0, mode: 'major' }])].sort((a, b) => a.at - b.at);
  const keyBars: { bar: number; name: string; semitone: number; doh: number }[] = [];
  for (const k of keys) {
    const name = KEY_BY_FIFTHS[Math.max(-7, Math.min(7, k.fifths))];
    const semitone = mod12(7 * k.fifths);
    let bar = measures.findIndex((m) => m.start + EPS >= k.at);
    if (bar < 0) bar = measures.length - 1;
    const prev = keyBars[keyBars.length - 1];
    if (prev && prev.semitone === semitone) continue;
    if (prev && Math.abs(measures[bar].start - k.at) > EPS) problems.push(`The key changes inside bar ${measures[bar].number}; Abụ changes key at the barline.`);
    const doh = prev ? prev.doh + (mod12(semitone - prev.semitone) <= 5 ? mod12(semitone - prev.semitone) : mod12(semitone - prev.semitone) - 12) : dohMidi(semitone);
    if (prev && prev.bar === bar) keyBars.pop();
    keyBars.push({ bar: keyBars.length ? bar : 0, name, semitone, doh });
  }
  const keyAt = (bar: number) => [...keyBars].reverse().find((k) => k.bar <= bar) ?? keyBars[0];

  const planned: Record<string, PlannedNote[]> = {};
  const written: Record<string, string[][]> = {}; // part -> bars -> beats
  const lyricsByBar: string[][] = barBeats.map(() => []); // soprano syllable tokens per bar, in note order

  for (const line of lines) {
    const low = isLowPart(line.part);
    const notes: BeatNote[] = line.notes
      .map((n) => {
        const start = toBeat(n.start);
        const bar = Math.max(0, barStart.findIndex((b, i) => start < b + barBeats[i] - EPS));
        const k = keyAt(bar);
        const s = syllable(n.midi, k.doh - (low ? 12 : 0), k.name[0], n.step, n.alter);
        if (Math.abs(s.octave) > 2) problems.push(`${line.part}: a note is more than two octaves from doh.`);
        return { start, end: start + n.dur / beatQ, midi: n.midi, token: s.name + octaveMark(s.octave), lyric: n.lyric };
      })
      .sort((a, b) => a.start - b.start);

    const out: PlannedNote[] = (planned[line.part] = []);
    const bars: string[][] = (written[line.part] = barBeats.map(() => []));
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
        const snap = (x: number) => B + Math.round((x - B) * d!) / d!;
        const slots: Slot[] = [];
        for (let k = 0; k < d; k++) {
          const t = B + k * step;
          const starting = here.find((n) => Math.abs(snap(n.start) - t) < EPS);
          if (starting) {
            slots.push({ kind: 'start', token: starting.token });
            // As Abụ will play it: a note runs on through holds, and stops at a rest or the next note.
            last = { start: t, dur: step, midi: starting.midi };
            out.push(last);
            if (line.part === lines[0].part) lyricsByBar[bar].push(lyricToken(starting.lyric));
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
    if (rounded) problems.push(`${line.part}: some rhythms were rounded to the nearest quarter or sixth of a beat.`);
    const off = notes.filter((n) => !out.some((p) => p.midi === n.midi && Math.abs(p.start - n.start) < 1e-4 && Math.abs(p.start + p.dur - n.end) < 1e-4)).length;
    if (off) problems.push(`${line.part}: ${off} note${off === 1 ? '' : 's'} can’t be written exactly.`);
  }

  // Lines of music: about 16 beats each, starting a new line at a key change.
  const per = opts.barsPerLine ?? Math.max(2, Math.round(16 / bpb));
  const systems: number[][] = [];
  let current: number[] = [];
  for (let bar = 0; bar < barBeats.length; bar++) {
    const keyChange = keyBars.some((k) => k.bar === bar && bar > 0);
    if (current.length && (current.length >= per || keyChange)) {
      systems.push(current);
      current = [];
    }
    current.push(bar);
  }
  if (current.length) systems.push(current);

  const head = [
    score.title ? `title: ${oneLine(score.title)}` : '',
    score.composer ? `composer: ${oneLine(score.composer)}` : '',
    score.lyricist ? `lyricist: ${oneLine(score.lyricist)}` : '',
    `key: ${keyBars[0].name}`,
    `time: ${time.beats}/${time.beatType}`,
  ].filter(Boolean);
  const blocks: string[] = [];
  for (const sys of systems) {
    const lines2: string[] = [];
    const change = keyBars.find((k) => k.bar === sys[0] && sys[0] > 0);
    if (change) lines2.push(`key: ${change.name}`);
    for (const line of lines) {
      const barsText = sys.map((bar) => {
        const beats = written[line.part][bar];
        // A bar of rests still needs a mark, or the bar would vanish.
        return (beats.every((x) => x === '') ? ['x', ...beats.slice(1)] : beats).join(' :');
      });
      lines2.push(`${line.part.padEnd(2)} ${barsText.join(' | ')} |`);
      if (line.part === lines[0].part) {
        const words = joinWords(sys.flatMap((bar) => lyricsByBar[bar]));
        if (words) lines2.push(`W  ${words}`);
      }
    }
    blocks.push(lines2.join('\n'));
  }

  return {
    text: `${head.join('\n')}\n\n${blocks.join('\n\n')}\n`,
    title: score.title,
    composer: score.composer,
    key: keyBars[0].name,
    time: `${time.beats}/${time.beatType}`,
    parts: lines.map((l) => l.part),
    bars: barBeats.length,
    problems: [...new Set(problems)],
    planned,
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
