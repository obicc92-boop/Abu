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
}

let current: ScanDraft | null = null;

export const setScanDraft = (draft: ScanDraft) => {
  current = draft;
};
export const scanDraft = () => current;
export const clearScanDraft = () => {
  current = null;
};
