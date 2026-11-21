/**
 * A checked scan, handed to the song editor to save (song-editor?from=scan).
 * Kept in memory; the scan itself stays saved on the phone (scan/saved.ts) until the song is saved.
 */
import type { PickedFile } from '@/api/client';

export interface ScanDraft {
  title: string;
  composer: string;
  /** Doh as semitones above C. */
  doh: number;
  time: string;
  solfa: string;
  /** The original sheet, attached to the song when it's saved. */
  sheet: PickedFile | null;
  /** The unfinished scan it came from (scan/saved.ts), forgotten once the song is saved. */
  scanId?: string;
  /** The scan's lines kept in the song, in order: the line of music each became, to go back and check one. */
  lineIds?: string[];
}

let current: ScanDraft | null = null;

export const setScanDraft = (draft: ScanDraft) => {
  current = draft;
};
export const scanDraft = () => current;
export const clearScanDraft = () => {
  current = null;
};

/**
 * Back to Check the reading from the song editor (owner's request, 21 November 2026: Edit going "back to the
 * check… where they show the row of the original music and the row of the transcribed music… the best place to do
 * the edit"): the line to open, and the song's details as the editor has them, so nothing changed there is lost.
 */
export interface CheckAgain {
  lineId: string | null;
  title: string;
  composer: string;
  doh: number;
  time: string;
}

let checkAgain: CheckAgain | null = null;

export const askToCheckAgain = (ask: CheckAgain) => {
  checkAgain = ask;
};
/** What the editor asked for, once. */
export const takeCheckAgain = () => {
  const ask = checkAgain;
  checkAgain = null;
  return ask;
};
