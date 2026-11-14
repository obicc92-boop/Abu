/**
 * MusicXML (and compressed .mxl) to Abụ sol-fa: read the score, find the
 * soprano, alto, tenor and bass, write them as sol-fa, then check the text
 * plays back exactly the notes that were meant.
 */
import { strFromU8, unzipSync } from 'fflate';

import { dohAt, dohTimeline, noteMidi, parseSolfa } from '../solfa';

import { readMusicXml, type XScore } from './read';
import { findVoices } from './satb';
import { toSolfa, type SolfaText } from './to-solfa';

export { readMusicXml, type XScore } from './read';
export { findVoices, type VoiceLine } from './satb';
export { syllable, toSolfa, type SolfaText } from './to-solfa';

/** The MusicXML inside a compressed .mxl file (a zip with META-INF/container.xml). */
export function unzipMxl(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const container = files['META-INF/container.xml'];
  const root = container ? strFromU8(container).match(/full-path="([^"]+)"/)?.[1] : undefined;
  const name = root && files[root] ? root : Object.keys(files).find((f) => /\.(xml|musicxml)$/i.test(f) && !f.startsWith('META-INF'));
  if (!name) throw new Error('This .mxl file has no score inside.');
  return strFromU8(files[name]);
}

export interface Conversion extends SolfaText {
  /** The text reads back as exactly the planned notes, with no errors from Abụ's checker. */
  verified: boolean;
  /** What the check found, if anything. */
  mismatches: string[];
  layout: string;
}

export function musicXmlToSolfa(input: string | Uint8Array, opts: { barsPerLine?: number } = {}): Conversion {
  const xml = typeof input === 'string' ? input : isZip(input) ? unzipMxl(input) : strFromU8(input);
  const score: XScore = readMusicXml(xml);
  const voices = findVoices(score);
  if (!voices.lines.length) throw new Error('No sung or played notes were found in this score.');
  const out = toSolfa(score, voices.lines, opts);
  const mismatches = checkText(out);
  return { ...out, verified: mismatches.length === 0, mismatches, layout: voices.layout };
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** Reads the text back with Abụ's own reader and compares every note with the plan. */
export function checkText(out: SolfaText): string[] {
  const parsed = parseSolfa(out.text);
  const problems = parsed.errors.map((e) => e.message);
  for (const part of out.parts) {
    const want = out.planned[part] ?? [];
    const timeline = dohTimeline(parsed, 0, part);
    const got = (parsed.events[part] ?? []).map((ev) => ({ start: ev.start, dur: ev.dur, midi: noteMidi(part, ev, dohAt(timeline, ev.start)) }));
    if (want.length !== got.length) {
      problems.push(`${part}: ${got.length} notes read back, ${want.length} planned.`);
      continue;
    }
    const bad = want.findIndex((w, i) => Math.abs(w.start - got[i].start) > 1e-6 || Math.abs(w.dur - got[i].dur) > 1e-6 || w.midi !== got[i].midi);
    if (bad >= 0) problems.push(`${part}: note ${bad + 1} reads back as ${JSON.stringify(got[bad])}, planned ${JSON.stringify(want[bad])}.`);
  }
  return problems;
}
