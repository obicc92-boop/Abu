/** Abụ's own row reader runs in the web app for now (own-reader.web.ts); phones come with Phase 2. */
export const ownReaderHere = false;
export const readLineOwn = (_canvas: unknown, _parts: string[], _wordsRows = 1): Promise<{ text: string; sure: number }> =>
  Promise.reject(new Error('Abụ’s own reader works in the web app for now.'));
