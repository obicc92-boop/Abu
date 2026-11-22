/**
 * Staff notation read into sol-fa (the owner's request, 22 November 2026:
 * "we need to build for transcribing staff notation to solfa notation
 * too"): choir sheets printed in staff notation, PDF pages and photos, read
 * in the browser for free by SonkoMusic's staff reader (see README.md), into
 * the score the MusicXML converter takes (`XScore`), so `findVoices` and
 * `toSolfa` (src/musicxml) make the sol-fa.
 */
import type { XScore } from '@/musicxml';
import type { Box, ScanPage } from '@/scan/types';

import * as reader from './read';

export interface StaffSystem {
  /** The page it's on, from 0. */
  page: number;
  /** The system on its page, in page pixels: its staves, with a little room for words. */
  box: Box;
  /** Indexes into `score.measures`, `to` not included. */
  bars: [from: number, to: number];
}

export interface StaffMark {
  /** Index into `score.measures`. */
  bar: number;
  where: 'start' | 'end';
  /**
   * As SolfaScores writes marks, without braces: 'segno', 'coda', '|:', ':|', '1.', '2.', 'D.S.', 'D.S. al Coda',
   * 'D.S. al Fine', 'D.C.', 'D.C. al Fine', 'D.C. al Coda', 'Fine', 'to coda'.
   */
  text: string;
}

export interface StaffReading {
  score: XScore;
  systems: StaffSystem[];
  marks: StaffMark[];
}

/** How many staves are on a page (quick: to tell a staff sheet from a sol-fa one). */
export function stavesOnPage(page: ScanPage): Promise<number> {
  return reader.stavesOnPage(page);
}

export function readStaffPages(pages: ScanPage[], options?: { progress?(done: number, total: number): void; signal?: AbortSignal }): Promise<StaffReading> {
  return reader.readStaffPages(pages, options);
}
