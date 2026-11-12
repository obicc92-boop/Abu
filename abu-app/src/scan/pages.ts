/**
 * Scanning on phones (Android and iPhone builds) comes in Phase 2, with the
 * phone's own document scanner; for now it's in the web app only. The web
 * version is pages.web.ts.
 */
import type { Box, ScanPage } from './types';

export const MAX_PAGES = 8;
export const scanningHere = false;
const notYet = () => Promise.reject(new Error('Scanning works in the web app for now.'));

export const loadPages = (_files: { file: Blob; type: string }[]): Promise<{ pages: ScanPage[]; more: boolean }> => notYet();
export const pageForFinding = (_page: ScanPage): Promise<{ blob: Blob; width: number; height: number; scale: number }> => notYet();
export const cutLine = (_page: ScanPage, _box: Box): Promise<{ blob: Blob; url: string; width: number; height: number }> => notYet();
