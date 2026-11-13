/** Abụ's own row reader runs in the web app for now (own-reader.web.ts); phones come with Phase 2. */
import type { FoundLine } from './types';

export const ownReaderHere = false;
const notYet = () => Promise.reject(new Error('Abụ’s own reader works in the web app for now.'));
export const readLineOwn = (_canvas: unknown, _parts: string[], _wordsRows = 1): Promise<{ text: string; sure: number }> => notYet();
export const findLinesOwn = (_page: unknown, _parts = 0): Promise<{ page: unknown; lines: FoundLine[] }> => notYet();
