/** SolfaScores' own row reader runs in the web app for now (own-reader.web.ts); phones come with Phase 2. */
import type { RowBox } from './rows';
import type { FoundLine } from './types';

export const ownReaderHere = false;
const notYet = () => Promise.reject(new Error('Reading sheets works in the web app for now.'));
export const readLineOwn = (_canvas: unknown, _parts: string[], _wordsRows = 1): Promise<{ text: string; sure: number }> => notYet();
export interface PageLayout {
  small: unknown;
  rows: RowBox[];
  texts: string[];
  k: number;
}
export const findLinesOwn = (_page: unknown, _parts = 0): Promise<{ page: unknown; lines: FoundLine[]; layout?: PageLayout }> => notYet();
export const numberedPage = (_layout: PageLayout): { image: string; rows: { top: number; bottom: number; text: string }[] } => {
  throw new Error('Reading sheets works in the web app for now.');
};
