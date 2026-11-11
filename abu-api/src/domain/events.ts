/** Services, rehearsals and concerts; their song orders; and replies ("Going" / "Can't come"). */
import { badRequest, friendly, notFound } from '../errors';
import { groupOfEvent, newId, nowIso, requireLeader, requireMember } from './access';
import { getSong } from './songs';

export type EventKind = 'service' | 'rehearsal' | 'concert';

export interface GroupEvent {
  id: string;
  group_id: string;
  kind: EventKind;
  title: string;
  starts_at: string;
  venue: string;
  note: string;
  created_by: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  event_id: string;
  position: number;
  section: string;
  song_id: string;
  note: string;
  title: string;
}

export type Reply = 'going' | 'cant';

const KINDS: EventKind[] = ['service', 'rehearsal', 'concert'];

function isoOrThrow(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest('Choose a date and time.');
  return d.toISOString();
}

/** Leaders plan services, rehearsals and concerts. */
export async function createEvent(
  db: D1Database,
  me: string,
  groupId: string,
  input: { kind: EventKind; title: string; startsAt: string; venue?: string; note?: string },
): Promise<GroupEvent> {
  await requireLeader(db, groupId, me, 'Only a leader can plan services and rehearsals.');
  if (!KINDS.includes(input.kind)) throw badRequest('Choose a service, rehearsal or concert.');
  if (!input.title?.trim()) throw badRequest('Give it a title.');
  const id = newId();
  try {
    await db
      .prepare('insert into events (id, group_id, kind, title, starts_at, venue, note, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, groupId, input.kind, input.title.trim(), isoOrThrow(input.startsAt), input.venue?.trim() ?? '', input.note?.trim() ?? '', me)
      .run();
  } catch (e) {
    throw friendly(e);
  }
  return getEvent(db, me, id);
}

export async function getEvent(db: D1Database, me: string, eventId: string): Promise<GroupEvent> {
  await requireMember(db, await groupOfEvent(db, eventId), me);
  const row = await db.prepare('select * from events where id = ?').bind(eventId).first<GroupEvent>();
  if (!row) throw notFound('That service or rehearsal doesn’t exist.');
  return row;
}

/** A group's events in date order, from a given time (default: everything). */
export async function listEvents(db: D1Database, me: string, groupId: string, opts: { from?: string } = {}): Promise<GroupEvent[]> {
  await requireMember(db, groupId, me);
  const { results } = await db
    .prepare('select * from events where group_id = ? and starts_at >= ? order by starts_at')
    .bind(groupId, opts.from ? isoOrThrow(opts.from) : '0000')
    .all<GroupEvent>();
  return results;
}

/** Leaders add a song to the order, at the end unless a position is given. */
export async function addToOrder(
  db: D1Database,
  me: string,
  eventId: string,
  input: { songId: string; section?: string; position?: number; note?: string },
): Promise<OrderItem> {
  await requireLeader(db, await groupOfEvent(db, eventId), me, 'Only a leader can change the song order.');
  await getSong(db, input.songId);
  const last = await db.prepare('select max(position) as p from event_items where event_id = ?').bind(eventId).first<{ p: number | null }>();
  const id = newId();
  await db
    .prepare('insert into event_items (id, event_id, position, section, song_id, note) values (?, ?, ?, ?, ?, ?)')
    .bind(id, eventId, input.position ?? (last?.p ?? 0) + 1, input.section?.trim() ?? '', input.songId, input.note?.trim() ?? '')
    .run();
  return (await listOrder(db, me, eventId)).find((i) => i.id === id)!;
}

export async function removeFromOrder(db: D1Database, me: string, itemId: string): Promise<void> {
  const item = await db.prepare('select event_id from event_items where id = ?').bind(itemId).first<{ event_id: string }>();
  if (!item) throw notFound('That song isn’t in the order.');
  await requireLeader(db, await groupOfEvent(db, item.event_id), me, 'Only a leader can change the song order.');
  await db.prepare('delete from event_items where id = ?').bind(itemId).run();
}

export async function listOrder(db: D1Database, me: string, eventId: string): Promise<OrderItem[]> {
  await requireMember(db, await groupOfEvent(db, eventId), me);
  const { results } = await db
    .prepare(
      `select i.id, i.event_id, i.position, i.section, i.song_id, i.note, s.title
       from event_items i join songs s on s.id = i.song_id where i.event_id = ? order by i.position`,
    )
    .bind(eventId)
    .all<OrderItem>();
  return results;
}

/** Reply for yourself: "Going" or "Can't come" (which counts as excused). */
export async function reply(db: D1Database, me: string, eventId: string, status: Reply): Promise<void> {
  await requireMember(db, await groupOfEvent(db, eventId), me);
  if (status !== 'going' && status !== 'cant') throw badRequest('Reply “Going” or “Can’t come”.');
  await db
    .prepare(
      `insert into rsvps (event_id, user_id, status, updated_at) values (?, ?, ?, ?)
       on conflict (event_id, user_id) do update set status = excluded.status, updated_at = excluded.updated_at`,
    )
    .bind(eventId, me, status, nowIso())
    .run();
}

export async function listReplies(db: D1Database, me: string, eventId: string): Promise<{ user_id: string; status: Reply }[]> {
  await requireMember(db, await groupOfEvent(db, eventId), me);
  const { results } = await db.prepare('select user_id, status from rsvps where event_id = ?').bind(eventId).all<{ user_id: string; status: Reply }>();
  return results;
}
