/**
 * The daily allowance for covers made by AI (src/covers.ts). A picture costs little, but the AI is paid for, so each
 * person, and SolfaScores as a whole, has a limit per day (UTC), as scanning has. A cover counts only once it was
 * made: one the AI couldn't make costs nothing. Uploaded covers aren't counted. Covers made without anyone asking
 * (src/auto-covers.ts) count towards everyone's limit.
 */
import { AppError } from '../errors';

export const COVER_LIMITS = {
  /** Covers one person can have made in a day. */
  mine: 10,
  /** Covers made for everyone together in a day. */
  all: 200,
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Covers made today for everyone together: those people asked for, and those made without anyone asking
 * (src/auto-covers.ts), which share the allowance.
 */
export async function coversToday(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `select (select coalesce(sum(made), 0) from cover_usage where day = ?1) + (select coalesce(sum(made), 0) from auto_cover_days where day = ?1) as made`,
    )
    .bind(today())
    .first<{ made: number }>();
  return row?.made ?? 0;
}

/** Refuses when today's allowance is used up, before the AI is asked for anything. */
export async function mayMakeCover(db: D1Database, userId: string, limits = COVER_LIMITS): Promise<void> {
  const [mine, all] = await Promise.all([
    db.prepare('select made from cover_usage where user_id = ? and day = ?').bind(userId, today()).first<{ made: number }>(),
    coversToday(db),
  ]);
  if ((mine?.made ?? 0) >= limits.mine) throw new AppError(429, `You’ve made ${limits.mine} covers today. Try again tomorrow.`);
  if (all >= limits.all) throw new AppError(429, 'Covers can’t be made right now. Try again tomorrow.');
}

/** Counts a cover the AI made against today's allowance. */
export async function countCover(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('insert into cover_usage (user_id, day, made) values (?, ?, 1) on conflict (user_id, day) do update set made = made + 1')
    .bind(userId, today())
    .run();
}
