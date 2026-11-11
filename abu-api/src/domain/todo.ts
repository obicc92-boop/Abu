/**
 * The leader's To do on Home: what needs doing now, most urgent first.
 * Part leaders get the same for their own part (replies and attendance).
 */
import { canEditOrders, LEADERS, requireRole } from './access';

export type TodoKind = 'unmarked' | 'no_replies' | 'no_songs' | 'no_solfa' | 'waiting';

export interface TodoItem {
  kind: TodoKind;
  /** People, or songs, the item is about. */
  count: number;
  event_id?: string;
  event_title?: string;
  event_kind?: string;
  starts_at?: string;
  /** For songs without sol-fa: the first one, to open. */
  song_id?: string;
  song_title?: string;
}

interface EventRow {
  id: string;
  title: string;
  kind: string;
  starts_at: string;
}

const DAY = 864e5;

export async function leaderTodo(db: D1Database, me: string, groupId: string, now = new Date()): Promise<TodoItem[]> {
  const mine = await requireRole(db, groupId, me, LEADERS, 'Only leaders and part leaders have a To do.');
  const leader = mine.role === 'leader';
  // Placeholders: ?1 group, ?2 now, ?3 the other end of the window, and ?4 the
  // part (bound only for part leaders, who look after their own part).
  const scope = leader ? '' : ' and m.part = ?4';
  const params = (end: number) => [groupId, now.toISOString(), new Date(end).toISOString(), ...(leader ? [] : [mine.part])];
  const t = now.getTime();
  const event = (e: EventRow) => ({ event_id: e.id, event_title: e.title, event_kind: e.kind, starts_at: e.starts_at });
  const items: TodoItem[] = [];

  // Attendance not marked: started in the last 14 days, and nobody (in your part) marked.
  const { results: unmarked } = await db
    .prepare(
      `select e.id, e.title, e.kind, e.starts_at from events e
       where e.group_id = ?1 and e.starts_at <= ?2 and e.starts_at >= ?3
         and not exists (select 1 from attendance a join memberships m on m.group_id = e.group_id and m.user_id = a.user_id
                         where a.event_id = e.id${scope})
       order by e.starts_at desc limit 3`,
    )
    .bind(...params(t - 14 * DAY))
    .all<EventRow>();
  for (const e of unmarked) items.push({ kind: 'unmarked', count: 0, ...event(e) });

  // Replies: the next services and rehearsals within 7 days, and who (in your part) hasn't answered.
  const { results: soon } = await db
    .prepare(
      `select e.id, e.title, e.kind, e.starts_at,
         (select count(*) from memberships m where m.group_id = e.group_id and m.status = 'active'${scope}
            and not exists (select 1 from rsvps r where r.event_id = e.id and r.user_id = m.user_id)) as missing
       from events e where e.group_id = ?1 and e.starts_at > ?2 and e.starts_at <= ?3
       order by e.starts_at limit 2`,
    )
    .bind(...params(t + 7 * DAY))
    .all<EventRow & { missing: number }>();
  for (const e of soon) if (e.missing > 0) items.push({ kind: 'no_replies', count: e.missing, ...event(e) });

  // Services in the next 14 days with no songs yet (for whoever can edit song orders).
  if (await canEditOrders(db, groupId, mine)) {
    const { results: empty } = await db
      .prepare(
        `select e.id, e.title, e.kind, e.starts_at from events e
         where e.group_id = ? and e.kind <> 'rehearsal' and e.starts_at > ? and e.starts_at <= ?
           and not exists (select 1 from event_items i where i.event_id = e.id)
         order by e.starts_at limit 3`,
      )
      .bind(groupId, now.toISOString(), new Date(t + 14 * DAY).toISOString())
      .all<EventRow>();
    for (const e of empty) items.push({ kind: 'no_songs', count: 0, ...event(e) });
  }

  // Songs in the next 14 days' orders that nobody has typed in sol-fa yet.
  const { results: sheetOnly } = await db
    .prepare(
      `select s.id, s.title, min(e.starts_at) as first from event_items i
       join events e on e.id = i.event_id join songs s on s.id = i.song_id
       where e.group_id = ? and e.starts_at > ? and e.starts_at <= ? and length(trim(s.solfa)) = 0
       group by s.id order by first`,
    )
    .bind(groupId, now.toISOString(), new Date(t + 14 * DAY).toISOString())
    .all<{ id: string; title: string }>();
  if (sheetOnly.length) items.push({ kind: 'no_solfa', count: sheetOnly.length, song_id: sheetOnly[0].id, song_title: sheetOnly[0].title });

  // People waiting to be let in (only leaders let people in).
  if (leader) {
    const waiting = await db.prepare(`select count(*) as n from memberships where group_id = ? and status = 'pending'`).bind(groupId).first<{ n: number }>();
    if (waiting?.n) items.push({ kind: 'waiting', count: waiting.n });
  }

  return items;
}
