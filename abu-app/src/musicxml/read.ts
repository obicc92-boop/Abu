/**
 * Reads MusicXML (score-partwise, as MuseScore, Sibelius and Finale export
 * it) into notes on one timeline, measured in quarter notes. Pure: no DOM, so
 * it runs in the app, in Node scripts and in the Worker.
 */
import { XMLParser } from 'fast-xml-parser';

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
  /** Verse 1's syllable on this note. */
  lyric?: { text: string; syllabic: string };
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
  };

  childrenOf(root, 'part').forEach((partNode, pi) => {
    const part: XPart = { id: attrs(partNode).id, name: names[attrs(partNode).id] ?? '', staves: 1, clefs: {}, notes: [] };
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
            const lyrics = childrenOf(el, 'lyric');
            const verse1 = lyrics.find((l) => (attrs(l).number ?? '1') === '1') ?? lyrics[0];
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

  return score;
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
