/**
 * Practice: play counts and "I know my part". Private to each person; leaders
 * and part leaders only ever see totals per part.
 */
import { groupOfEvent, LEADERS, nowIso, requireRole } from './access';
import { getSong } from './songs';

export interface Practice {
  song_id: string;
  plays: number;
  knows_part: boolean;
  last_played_at: string | null;
}

/** Count one play-through (the player calls this at the end of a song). */
export async function recordPlay(db: D1Database, me: string, songId: string): Promise<Practice> {
  await getSong(db, songId);
  await db
    .prepare(
      `insert into practice (user_id, song_id, plays, last_played_at) values (?, ?, 1, ?)
       on conflict (user_id, song_id) do update set plays = plays + 1, last_played_at = excluded.last_played_at`,
    )
    .bind(me, songId, nowIso())
    .run();
  return (await myPractice(db, me)).find((p) => p.song_id === songId)!;
}

/** "I know my part" on or off. */
export async function setKnowsPart(db: D1Database, me: string, songId: string, knows: boolean): Promise<void> {
  await getSong(db, songId);
  await db
    .prepare(
      `insert into practice (user_id, song_id, knows_part) values (?, ?, ?)
       on conflict (user_id, song_id) do update set knows_part = excluded.knows_part`,
    )
    .bind(me, songId, knows ? 1 : 0)
    .run();
}

/** Your own practice, and only yours. */
export async function myPractice(db: D1Database, me: string): Promise<Practice[]> {
  const { results } = await db
    .prepare('select song_id, plays, knows_part, last_played_at from practice where user_id = ?')
    .bind(me)
    .all<Omit<Practice, 'knows_part'> & { knows_part: number }>();
  return results.map((r) => ({ ...r, knows_part: r.knows_part === 1 }));
}

export interface PartReadiness {
  part: string;
  /** Active members singing this part. */
  members: number;
  /** How many marked "I know my part" for every song in the order. */
  ready: number;
  /** Plays of the order's songs by this part, added up. */
  plays: number;
}

/** How ready each part is for an event: totals only, for leaders and part leaders. */
export async function partReadiness(db: D1Database, me: string, eventId: string): Promise<PartReadiness[]> {
  const groupId = await groupOfEvent(db, eventId);
  await requireRole(db, groupId, me, LEADERS, 'Only leaders and part leaders can see how ready each part is.');
  const { results } = await db
    .prepare(
      `with s as (select distinct song_id from event_items where event_id = ?1),
       m as (select user_id, coalesce(part, '') as part from memberships where group_id = ?2 and status = 'active')
       select m.part as part,
         count(*) as members,
         sum(case when exists (select 1 from s) and not exists (
               select 1 from s where not exists (
                 select 1 from practice pr where pr.user_id = m.user_id and pr.song_id = s.song_id and pr.knows_part = 1))
             then 1 else 0 end) as ready,
         coalesce(sum((select coalesce(sum(pr.plays), 0) from practice pr
                        where pr.user_id = m.user_id and pr.song_id in (select song_id from s))), 0) as plays
       from m group by m.part order by m.part`,
    )
    .bind(eventId, groupId)
    .all<PartReadiness>();
  return results;
}
