/** The staff reader runs in the web app for now (read.web.ts); phones come later, as for the sol-fa reader. */
import type { ScanPage } from '@/scan/types';

import type { StaffReading } from './index';

const notYet = () => Promise.reject(new Error('Reading staff notation needs the web app for now.'));
export const stavesOnPage = (_page: ScanPage): Promise<number> => notYet();
export const readStaffPages = (_pages: ScanPage[], _options: { progress?(done: number, total: number): void; signal?: AbortSignal } = {}): Promise<StaffReading> => notYet();
