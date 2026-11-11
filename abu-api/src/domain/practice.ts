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
  /** The song, for listing your practice on Me. */
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  playable: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A day on the phone's calendar ("2026-11-11"), or today in UTC if it didn't say. */
const dayOr = (day: string | undefined) => (day && DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : nowIso().slice(0, 10));
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Count one play-through (the player calls this at the end of a song), on the day it was played. */
export async function recordPlay(db: D1Database, me: string, songId: string, day?: string): Promise<Practice> {
  await getSong(db, songId);
  await db.batch([
    db
      .prepare(
        `insert into practice (user_id, song_id, plays, last_played_at) values (?, ?, 1, ?)
         on conflict (user_id, song_id) do update set plays = plays + 1, last_played_at = excluded.last_played_at`,
      )
      .bind(me, songId, nowIso()),
    db
      .prepare('insert into practice_days (user_id, day, plays) values (?, ?, 1) on conflict (user_id, day) do update set plays = plays + 1')
      .bind(me, dayOr(day)),
  ]);
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

/** Your own practice, and only yours: most recently played first. */
export async function myPractice(db: D1Database, me: string): Promise<Practice[]> {
  const { results } = await db
    .prepare(
      `select p.song_id, p.plays, p.knows_part, p.last_played_at,
              s.title, s.composer, s.doh, s.time_signature, length(trim(s.solfa)) > 0 as playable
       from practice p join songs s on s.id = p.song_id
       where p.user_id = ? order by p.last_played_at is null, p.last_played_at desc`,
    )
    .bind(me)
    .all<Omit<Practice, 'knows_part' | 'playable'> & { knows_part: number; playable: number }>();
  return results.map((r) => ({ ...r, knows_part: r.knows_part === 1, playable: r.playable === 1 }));
}

export interface PracticeSummary {
  /** Play-throughs in the last 7 days, today included. */
  week_plays: number;
  /** Days you practised in the last 7. */
  week_days: number;
  /** Days in a row up to today, or up to yesterday if you haven't practised yet today. */
  streak: number;
  songs_known: number;
  songs_practised: number;
}

/** Your week, a gentle streak and the songs you know. Only you see it. */
export async function practiceSummary(db: D1Database, me: string, today?: string): Promise<PracticeSummary> {
  const t = dayOr(today);
  const [days, songs] = await Promise.all([
    db.prepare('select day, plays from practice_days where user_id = ? and day <= ? order by day desc limit 400').bind(me, t).all<{ day: string; plays: number }>(),
    db
      .prepare('select coalesce(sum(knows_part), 0) as known, coalesce(sum(plays > 0), 0) as practised from practice where user_id = ?')
      .bind(me)
      .first<{ known: number; practised: number }>(),
  ]);
  const weekStart = addDays(t, -6);
  const week = days.results.filter((d) => d.day >= weekStart && d.plays > 0);
  const played = new Set(days.results.filter((d) => d.plays > 0).map((d) => d.day));
  let streak = 0;
  for (let d = played.has(t) ? t : addDays(t, -1); played.has(d); d = addDays(d, -1)) streak++;
  return {
    week_plays: week.reduce((n, d) => n + d.plays, 0),
    week_days: week.length,
    streak,
    songs_known: songs?.known ?? 0,
    songs_practised: songs?.practised ?? 0,
  };
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
