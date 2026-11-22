/**
 * A staff-notation sheet, as SolfaScores' staff reader read it (src/staff), written in sol-fa (owner's request,
 * 22 November 2026: "transcribing staff notation to solfa notation"). The same converter writes it as writes
 * MusicXML files (src/musicxml), one line of music for each system the sheet printed, so each line is checked
 * against its own picture on Check the reading.
 */
import { scoreToSolfa, type Conversion, type XDirection, type XScore } from '@/musicxml';

/** What the staff reader gives: the score, its systems (bar ranges), and repeat and jump marks by bar. */
export interface StaffRead {
  score: XScore;
  systems: { bars: [from: number, to: number] }[];
  marks: { bar: number; where: 'start' | 'end'; text: string }[];
}

/** The reading as sol-fa, with a line of music for each system, in the systems' order. */
export function staffSong(reading: StaffRead): Conversion & { systemOf: number[] } {
  const { score } = reading;
  const marks: XDirection[] = reading.marks.map((m) => ({
    at: score.measures[m.bar]?.start ?? 0,
    bar: m.bar,
    part: null,
    kind: m.where === 'start' ? 'sign' : 'end',
    text: m.text,
  }));
  const systems = reading.systems.map((s) => Array.from({ length: Math.max(0, s.bars[1] - s.bars[0]) }, (_, k) => s.bars[0] + k));
  const song = scoreToSolfa({ ...score, directions: [...(score.directions ?? []), ...marks] }, { systems });
  // Each line's system: a system with no bars writes no line, so they're matched by their first bar.
  const systemOf = song.lines.map((l) => systems.findIndex((s) => s[0] === l.bars[0]));
  return { ...song, systemOf };
}

/** A MusicXML file (MuseScore, Sibelius, Finale), by its name or type: opened straight into the song editor. */
export const isMusicXml = (file: { name?: string; type?: string }) =>
  /\.(musicxml|mxl|xml)$/i.test(file.name ?? '') || /musicxml|^(?:application|text)\/xml$/i.test(file.type ?? '');
