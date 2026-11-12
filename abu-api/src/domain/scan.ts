/**
 * The daily allowance for scanning sheets. Reading costs money (about 3 US
 * cents to find the lines on a page and 1.5 cents to read a line), so each
 * person, and Abụ as a whole, has a limit per day (UTC).
 */
import { AppError } from '../errors';

export const LIMITS = {
  /** Pages one person can scan in a day. */
  pages: 40,
  /** Lines one person can have read in a day (re-reads count). */
  lines: 400,
  /** Lines read for everyone together in a day: about US$30 at most. */
  allLines: 2000,
};

export type ScanUse = 'page' | 'line';

const today = () => new Date().toISOString().slice(0, 10);

/** Counts one page or line against today's allowance, or refuses when it's used up. */
export async function useScan(db: D1Database, userId: string, use: ScanUse, limits = LIMITS): Promise<void> {
  const day = today();
  const mine = await db.prepare(`select pages, lines from scan_usage where user_id = ? and day = ?`).bind(userId, day).first<{ pages: number; lines: number }>();
  if (use === 'page' && (mine?.pages ?? 0) >= limits.pages) {
    throw new AppError(429, `That’s ${limits.pages} pages scanned today, the most for one day. Try again tomorrow.`);
  }
  if (use === 'line' && (mine?.lines ?? 0) >= limits.lines) {
    throw new AppError(429, `That’s ${limits.lines} lines read today, the most for one day. Try again tomorrow.`);
  }
  if (use === 'line') {
    const all = await db.prepare(`select coalesce(sum(lines), 0) as lines from scan_usage where day = ?`).bind(day).first<{ lines: number }>();
    if ((all?.lines ?? 0) >= limits.allLines) throw new AppError(429, 'Abụ has read as many lines as it can today. Try again tomorrow.');
  }
  await db
    .prepare(
      `insert into scan_usage (user_id, day, pages, lines) values (?, ?, ?, ?)
       on conflict (user_id, day) do update set pages = pages + excluded.pages, lines = lines + excluded.lines`,
    )
    .bind(userId, day, use === 'page' ? 1 : 0, use === 'line' ? 1 : 0)
    .run();
}

/** What's left of today's allowance. */
export async function scanAllowance(db: D1Database, userId: string, limits = LIMITS) {
  const row = await db.prepare(`select pages, lines from scan_usage where user_id = ? and day = ?`).bind(userId, today()).first<{ pages: number; lines: number }>();
  return { pages: Math.max(0, limits.pages - (row?.pages ?? 0)), lines: Math.max(0, limits.lines - (row?.lines ?? 0)) };
}
