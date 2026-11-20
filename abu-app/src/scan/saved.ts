/**
 * Unfinished scans kept on the phone (saved.web.ts keeps them in the browser). Scanning is in the web app for
 * now, so the phone builds keep none.
 */

/** An unfinished scan, as saved: where the person was, the heading, the time and each line (without its picture). */
export interface SavedScan<L = unknown> {
  id: string;
  /** When it was last saved (ms since 1970). */
  savedAt: number;
  phase: 'check' | 'finish';
  /** The line being checked. */
  current: number;
  heading: { title: string; composer: string; key: string; time: string };
  time: string;
  lines: L[];
  /** The original sheet's name and type (the file itself is kept with the pictures). */
  sheet: { name: string; type: string; size?: number } | null;
}

export const saveScan = async <L>(_scan: SavedScan<L>, _pictures: Record<string, Blob>, _sheet: Blob | null): Promise<void> => {};
export const listScans = async <L>(): Promise<SavedScan<L>[]> => [];
export const openScan = async <L extends { id: string }>(_id: string): Promise<{ scan: SavedScan<L>; pictures: Record<string, Blob>; sheet: Blob | null } | null> => null;
export const forgetScan = async (_id: string): Promise<void> => {};
