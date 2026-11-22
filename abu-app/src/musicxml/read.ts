/**
 * Reads MusicXML (score-partwise, as MuseScore, Sibelius and Finale export
 * it) into notes on one timeline, measured in quarter notes. Pure: no DOM, so
 * it runs in the app, in Node scripts and in the Worker.
 */
import { XMLParser } from 'fast-xml-parser';

import { readExpression } from '../solfa/expressions';
import { isSign, REPEAT_SPELLING, readRepeat } from '../solfa/repeats';
import { sectionName } from '../solfa/sections';

/** A preserve-order node from fast-xml-parser: `{ tag: children, ':@': attributes }`. */
type XNode = Record<string, unknown>;

export interface XNote {
  part: number;
  staff: number;
  voice: string;
  /** Quarter notes from the start of the piece. */
  start: number;
  /** Length in quarter notes (ties already joined). */
  dur: number;
  /** MIDI pitch as it sounds; null for a rest. */
  midi: number | null;
  /** The written letter, C to B, for naming chromatic notes. */
  step: string;
  /** Sharps (+) or flats (−) written on the note. */
  alter: number;
  chord: boolean;
  tieStart: boolean;
  tieStop: boolean;
  /** A slur (a curve over notes sung to one syllable) starts or ends on this note. */
  slurStart?: boolean;
  slurStop?: boolean;
  /** Verse 1's syllable on this note. */
  lyric?: { text: string; syllabic: string };
}

/**
 * What a score marks besides its notes, as SolfaScores writes it in braces (docs/solfa-format.md): a part's
 * dynamics, the tempo, repeats and jumps, and where sections start.
 */
export interface XDirection {
  /** Quarter notes from the start of the piece. */
  at: number;
  /** The bar it's written in (an index into `measures`): a jump or an end goes at that bar's end. */
  bar: number;
  /** The part and staff a dynamic is for; null for every part (tempo, repeats, jumps, sections). */
  part: number | null;
  staff?: number;
  /**
   * dynamic: `p`, `cresc.`, `<`; tempo: `Andante`, `M. 80`, `rit.`, `a tempo`; sign: `segno`, `coda`, `|:`, `1.`,
   * `2.` (before the note it marks); end: `:|`, `D.S. al Coda`, `Fine`, `to coda` (at its bar's end); section: its name.
   */
  kind: 'dynamic' | 'tempo' | 'sign' | 'end' | 'section';
  text: string;
}

export interface XMeasure {
  /** Quarter notes from the start of the piece. */
  start: number;
  length: number;
  number: string;
  /** A pickup (anacrusis) or other short bar, as the file marks it. */
  implicit: boolean;
}

export interface XClef {
  sign: string;
  /** −1 for a treble clef sung an octave lower (tenors). */
  octave: number;
}

export interface XPart {
  id: string;
  name: string;
  staves: number;
  /** First clef on each staff. */
  clefs: Record<number, XClef>;
  notes: XNote[];
}

export interface XKey {
  /** Quarter notes from the start. */
  at: number;
  /** Sharps (+) or flats (−) in the key signature. */
  fifths: number;
  mode: string;
}

export interface XTime {
  at: number;
  beats: number;
  beatType: number;
}

export interface XScore {
  title: string;
  composer: string;
  lyricist: string;
  parts: XPart[];
  /** Measures of the first part: every part follows the same bars. */
  measures: XMeasure[];
  keys: XKey[];
  times: XTime[];
  /** Dynamics, tempo, repeats, jumps and sections, in order (scores read from a picture may have none). */
  directions?: XDirection[];
}

const STEP_SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const EPS = 1e-6;

const tagOf = (n: XNode): string => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: XNode | undefined): XNode[] => {
  if (!n) return [];
  const v = n[tagOf(n)];
  return Array.isArray(v) ? (v as XNode[]) : [];
};
const attrs = (n: XNode | undefined): Record<string, string> => ((n?.[':@'] as Record<string, string>) ?? {});
const child = (n: XNode | undefined, tag: string): XNode | undefined => kids(n).find((c) => tagOf(c) === tag);
const childrenOf = (n: XNode | undefined, tag: string): XNode[] => kids(n).filter((c) => tagOf(c) === tag);
const text = (n: XNode | undefined): string =>
  kids(n)
    .map((c) => (tagOf(c) === '#text' ? String(c['#text']) : ''))
    .join('')
    .trim();
const num = (n: XNode | undefined, fallback = 0): number => {
  const v = Number(text(n));
  return Number.isFinite(v) ? v : fallback;
};

export function readMusicXml(xml: string): XScore {
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, trimValues: true });
  const doc = parser.parse(xml) as XNode[];
  const root = doc.find((n) => tagOf(n) === 'score-partwise');
  if (!root) {
    throw new Error(doc.some((n) => tagOf(n) === 'score-timewise') ? 'This MusicXML is “timewise”; only “partwise” files can be read.' : 'This file isn’t MusicXML.');
  }

  const work = child(root, 'work');
  const ident = child(root, 'identification');
  const creator = (type: string) => text(childrenOf(ident, 'creator').find((c) => attrs(c).type === type));
  // MuseScore often puts the title and composer only in the page text ("credits").
  const credit = (type: string) =>
    childrenOf(root, 'credit')
      .filter((c) => text(child(c, 'credit-type')) === type)
      .map((c) => childrenOf(c, 'credit-words').map(text).join(' ').trim())
      .find(Boolean) ?? '';
  const title = text(child(work, 'work-title')) || text(child(root, 'movement-title')) || credit('title');

  const names: Record<string, string> = {};
  for (const sp of childrenOf(child(root, 'part-list'), 'score-part')) names[attrs(sp).id] = text(child(sp, 'part-name'));

  const score: XScore = {
    title,
    composer: creator('composer') || credit('composer'),
    lyricist: creator('lyricist') || creator('poet') || credit('lyricist'),
    parts: [],
    measures: [],
    keys: [],
    times: [],
    directions: [],
  };
  const directions = score.directions!;
  const direct = (d: XDirection) => {
    // Every part's copy of a repeat or a tempo is one mark.
    if (d.part === null && directions.some((o) => o.part === null && o.kind === d.kind && o.text === d.text && o.bar === d.bar)) return;
    directions.push(d);
  };

  childrenOf(root, 'part').forEach((partNode, pi) => {
    const part: XPart = { id: attrs(partNode).id, name: names[attrs(partNode).id] ?? '', staves: 1, clefs: {}, notes: [] };
    const verse = firstVerse(partNode);
    let divisions = 1;
    let transpose = 0;
    let at = 0;
    let beats = 4;
    let beatType = 4;

    childrenOf(partNode, 'measure').forEach((m, mi) => {
      // Every part follows the first part's bars, so voices stay together even if a part's bar is underfilled.
      const start = pi === 0 ? at : (score.measures[mi]?.start ?? at);
      let cursor = 0;
      let reach = 0;
      let chordStart = 0;

      for (const el of kids(m)) {
        switch (tagOf(el)) {
          case 'direction': {
            const offset = num(child(el, 'offset')) / divisions;
            const at = start + cursor + offset;
            const staff = num(child(el, 'staff'), 1) || 1;
            for (const d of directionsOf(el)) direct({ ...d, at, bar: mi, part: d.kind === 'dynamic' ? pi : null, ...(d.kind === 'dynamic' ? { staff } : {}) });
            break;
          }
          case 'barline': {
            const repeat = attrs(child(el, 'repeat')).direction;
            if (repeat === 'forward') direct({ at: start, bar: mi, part: null, kind: 'sign', text: '|:' });
            if (repeat === 'backward') direct({ at: start, bar: mi, part: null, kind: 'end', text: ':|' });
            const ending = child(el, 'ending');
            const number = (attrs(ending).number ?? '').split(/[,\s]+/)[0];
            if (ending && attrs(ending).type === 'start' && (number === '1' || number === '2')) {
              direct({ at: start, bar: mi, part: null, kind: 'sign', text: `${number}.` });
            }
            if (child(el, 'segno')) direct({ at: start, bar: mi, part: null, kind: 'sign', text: 'segno' });
            if (child(el, 'coda')) direct({ at: start, bar: mi, part: null, kind: 'sign', text: 'coda' });
            break;
          }
          case 'attributes': {
            const div = child(el, 'divisions');
            if (div) divisions = num(div, 1) || 1;
            const staves = child(el, 'staves');
            if (staves) part.staves = Math.max(part.staves, num(staves, 1));
            for (const clef of childrenOf(el, 'clef')) {
              const staff = Number(attrs(clef).number ?? 1) || 1;
              part.clefs[staff] ??= { sign: text(child(clef, 'sign')), octave: num(child(clef, 'clef-octave-change'), 0) };
            }
            const tr = child(el, 'transpose');
            if (tr) transpose = num(child(tr, 'chromatic'), 0) + 12 * num(child(tr, 'octave-change'), 0);
            const key = child(el, 'key');
            if (key && pi === 0 && child(key, 'fifths')) {
              score.keys.push({ at: start + cursor, fifths: num(child(key, 'fifths')), mode: text(child(key, 'mode')) || 'major' });
            }
            const time = child(el, 'time');
            if (time && child(time, 'beats')) {
              beats = num(child(time, 'beats'), 4) || 4;
              beatType = num(child(time, 'beat-type'), 4) || 4;
              if (pi === 0) score.times.push({ at: start + cursor, beats, beatType });
            }
            break;
          }
          case 'backup':
            cursor -= num(child(el, 'duration')) / divisions;
            break;
          case 'forward':
            cursor += num(child(el, 'duration')) / divisions;
            reach = Math.max(reach, cursor);
            break;
          case 'note': {
            if (child(el, 'grace')) break; // grace notes take no time
            const dur = num(child(el, 'duration')) / divisions;
            const chord = !!child(el, 'chord');
            const noteStart = chord ? chordStart : cursor;
            const pitch = child(el, 'pitch');
            const cue = !!child(el, 'cue');
            const step = text(child(pitch, 'step'));
            const alter = num(child(pitch, 'alter'), 0);
            const midi = pitch && !cue ? 12 * (num(child(pitch, 'octave')) + 1) + (STEP_SEMITONES[step] ?? 0) + alter + transpose : null;
            const ties = childrenOf(el, 'tie').map((t) => attrs(t).type);
            const notations = childrenOf(el, 'notations');
            const slurs = notations.flatMap((n) => childrenOf(n, 'slur')).map((t) => attrs(t).type);
            // A dynamic written on the note itself.
            for (const dyn of notations.flatMap((n) => childrenOf(n, 'dynamics'))) {
              const text = dynamicOf(dyn);
              if (text && !chord) direct({ at: start + cursor, bar: mi, part: pi, staff: num(child(el, 'staff'), 1) || 1, kind: 'dynamic', text });
            }
            const lyrics = childrenOf(el, 'lyric');
            // The part's first verse only: a note it has no syllable for takes none from another verse.
            const verse1 = lyrics.find((l) => (attrs(l).number ?? '1') === verse);
            const lyricText = verse1
              ? childrenOf(verse1, 'text')
                  .map((t) => text(t))
                  .join('')
                  .trim()
              : '';
            part.notes.push({
              part: pi,
              staff: num(child(el, 'staff'), 1) || 1,
              voice: text(child(el, 'voice')) || '1',
              start: start + noteStart,
              dur,
              midi: midi === null ? null : Math.round(midi),
              step,
              alter,
              chord,
              tieStart: ties.includes('start'),
              tieStop: ties.includes('stop'),
              ...(slurs.includes('start') ? { slurStart: true } : {}),
              ...(slurs.includes('stop') ? { slurStop: true } : {}),
              lyric: lyricText ? { text: lyricText, syllabic: text(child(verse1, 'syllabic')) || 'single' } : undefined,
            });
            if (!chord) {
              chordStart = cursor;
              cursor += dur;
            }
            reach = Math.max(reach, cursor);
            break;
          }
        }
      }

      if (pi === 0) {
        const nominal = (beats * 4) / beatType;
        const implicit = attrs(m).implicit === 'yes';
        // A bar is as long as its time signature, unless the file marks it short (a pickup) or it runs over.
        const length = implicit ? reach : Math.max(reach, nominal);
        score.measures.push({ start: at, length, number: attrs(m).number ?? String(mi + 1), implicit });
        at += length;
      }
    });

    part.notes = joinTies(part.notes);
    score.parts.push(part);
  });

  directions.sort((a, b) => a.at - b.at);
  return score;
}

/** A dynamic's text as SolfaScores writes it (`p`, `mf`, `sfz`), from MusicXML's `<dynamics><mf/></dynamics>`. */
function dynamicOf(dyn: XNode): string | null {
  for (const c of kids(dyn)) {
    const tag = tagOf(c);
    const written = tag === 'other-dynamics' ? text(c) : tag;
    const read = written && tag !== '#text' ? readExpression(written) : null;
    if (read && (read.kind === 'dynamic' || read.kind === 'accent')) return read.text;
  }
  return null;
}

/** Jumps a score gives only to its player, in `<sound>`. */
const SOUND_JUMPS: [string, string][] = [
  ['dalsegno', 'D.S.'],
  ['dacapo', 'D.C.'],
  ['fine', 'Fine'],
  ['tocoda', 'to coda'],
];

/** What a `<direction>` says: dynamics, hairpins, tempo, signs, jumps, and a section's name. */
function directionsOf(el: XNode): Omit<XDirection, 'at' | 'bar' | 'part'>[] {
  const out: Omit<XDirection, 'at' | 'bar' | 'part'>[] = [];
  let jumped = false;
  for (const dt of childrenOf(el, 'direction-type')) {
    for (const c of kids(dt)) {
      switch (tagOf(c)) {
        case 'dynamics': {
          const t = dynamicOf(c);
          if (t) out.push({ kind: 'dynamic', text: t });
          break;
        }
        case 'wedge': {
          const type = attrs(c).type;
          if (type === 'crescendo') out.push({ kind: 'dynamic', text: '<' });
          if (type === 'diminuendo') out.push({ kind: 'dynamic', text: '>' });
          break;
        }
        case 'segno':
          out.push({ kind: 'sign', text: 'segno' });
          break;
        case 'coda':
          out.push({ kind: 'sign', text: 'coda' });
          break;
        case 'metronome': {
          const bpm = num(child(c, 'per-minute'));
          const unit = text(child(c, 'beat-unit'));
          const dotted = !!child(c, 'beat-unit-dot');
          const quarters = ({ whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 }[unit] ?? 1) * (dotted ? 1.5 : 1);
          // As quarter notes a minute: the song's own beat is worked out where it's written (to-solfa.ts).
          if (bpm > 0) out.push({ kind: 'tempo', text: `M. ${Math.round(bpm * quarters)}` });
          break;
        }
        case 'rehearsal':
        case 'words': {
          const words = text(c).replace(/\s+/g, ' ').trim();
          if (!words) break;
          const repeat = readRepeat(words);
          if (repeat) {
            out.push({ kind: isSign(repeat) ? 'sign' : 'end', text: REPEAT_SPELLING[repeat] });
            jumped = !isSign(repeat);
            break;
          }
          const section = sectionName(words);
          if (section) {
            out.push({ kind: 'section', text: section });
            break;
          }
          const mark = readExpression(words);
          if (mark?.kind === 'dynamic' || mark?.kind === 'accent' || mark?.kind === 'cresc' || mark?.kind === 'dim') out.push({ kind: 'dynamic', text: mark.text });
          else if (mark && mark.kind !== 'direction') out.push({ kind: 'tempo', text: mark.text });
          break;
        }
      }
    }
  }
  // A tempo's words and its metronome mark printed together are one mark: "Andante M. 72".
  const tempos = out.filter((d) => d.kind === 'tempo' && !/^(?:rit|rall|accel|a tempo)/.test(d.text));
  if (tempos.length > 1) {
    tempos[0].text = tempos.map((d) => d.text).join(' ');
    for (const d of tempos.slice(1)) out.splice(out.indexOf(d), 1);
  }
  // A jump given only to the player (MuseScore writes the words too, but not every program does).
  const sound = attrs(child(el, 'sound'));
  if (!jumped) for (const [attr, jump] of SOUND_JUMPS) if (sound[attr]) out.push({ kind: 'end', text: jump });
  // A tempo given only to the player, as quarter notes a minute.
  if (sound.tempo && !out.some((d) => d.kind === 'tempo' && d.text.startsWith('M.'))) {
    const bpm = Math.round(Number(sound.tempo));
    if (bpm > 0) out.push({ kind: 'tempo', text: `M. ${bpm}` });
  }
  return out;
}

/** The first verse a part has words for: "1", or the lowest number its lyrics use (some files start at 2). */
function firstVerse(part: XNode): string {
  const numbers = new Set<string>();
  for (const m of childrenOf(part, 'measure')) for (const n of childrenOf(m, 'note')) for (const l of childrenOf(n, 'lyric')) numbers.add(attrs(l).number ?? '1');
  return numbers.has('1') || !numbers.size ? '1' : [...numbers].sort((a, b) => (Number(a) || 99) - (Number(b) || 99) || a.localeCompare(b))[0];
}

/** Joins tied notes into one long note, per staff and voice. */
function joinTies(notes: XNote[]): XNote[] {
  const out: XNote[] = [];
  const open: XNote[] = [];
  for (const n of [...notes].sort((a, b) => a.start - b.start)) {
    if (n.midi !== null && n.tieStop) {
      const i = open.findIndex((o) => o.midi === n.midi && o.staff === n.staff && o.voice === n.voice && Math.abs(o.start + o.dur - n.start) < EPS);
      if (i >= 0) {
        const held = open[i];
        held.dur += n.dur;
        if (!n.tieStart) open.splice(i, 1);
        continue;
      }
    }
    out.push(n);
    if (n.midi !== null && n.tieStart) open.push(n);
  }
  return out;
}
