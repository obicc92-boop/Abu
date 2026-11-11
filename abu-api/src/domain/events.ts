/**
 * Services, rehearsals and concerts (setlists in your own space); their song
 * orders; and replies ("Going" / "Can't come"). Leaders plan; members read and reply.
 */
import { badRequest, conflict, friendly, notFound } from '../errors';
import { canEditOrders, groupOfEvent, newId, nowIso, requireLeader, requireMember, requireOrderEditor, type Role } from './access';
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

/** A song in the order, with what the list and the player need. */
export interface OrderItem {
  id: string;
  event_id: string;
  position: number;
  section: string;
  song_id: string;
  note: string;
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  /** Someone has typed its sol-fa, so it can play. */
  playable: boolean;
}

export type Reply = 'going' | 'cant';

export interface EventDetails {
  event: GroupEvent;
  items: OrderItem[];
  my_reply: Reply | null;
  replies: { going: number; cant: number };
  /** Your role in the event's group: the app shows planning tools to leaders. */
  my_role: Role;
  my_part: string | null;
  /** Your own attendance mark, once someone has marked you (or you checked in). */
  my_attendance: 'present' | 'absent' | 'excused' | null;
  /** Whether members check themselves in with a code in this group. */
  self_check_in: boolean;
  /** You may change the song order (leaders, and part leaders when allowed). */
  can_edit_order: boolean;
}

const KINDS: EventKind[] = ['service', 'rehearsal', 'concert'];
const MAX_REPEAT_WEEKS = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isoOrThrow(value: string | undefined): string {
  const d = new Date(value ?? '');
  if (Number.isNaN(d.getTime())) throw badRequest('Choose a date and time.');
  return d.toISOString();
}

export interface EventInput {
  kind: EventKind;
  title: string;
  startsAt: string;
  venue?: string;
  note?: string;
  /** Also make the same event each week for this many more weeks (rehearsals). */
  repeatWeeks?: number;
}

/** Leaders plan services, rehearsals and concerts; returns the first one made. */
export async function createEvent(db: D1Database, me: string, groupId: string, input: EventInput): Promise<GroupEvent> {
  await requireLeader(db, groupId, me, 'Only a leader can plan services and rehearsals.');
  if (!KINDS.includes(input.kind)) throw badRequest('Choose a service, rehearsal or concert.');
  if (!input.title?.trim()) throw badRequest('Give it a title.');
  const repeat = Math.max(0, Math.min(MAX_REPEAT_WEEKS, Math.floor(input.repeatWeeks ?? 0)));
  const first = new Date(isoOrThrow(input.startsAt)).getTime();
  const ids = Array.from({ length: repeat + 1 }, () => newId());
  try {
    await db.batch(
      ids.map((id, week) =>
        db
          .prepare('insert into events (id, group_id, kind, title, starts_at, venue, note, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, groupId, input.kind, input.title.trim(), new Date(first + week * WEEK_MS).toISOString(), input.venue?.trim() ?? '', input.note?.trim() ?? '', me),
      ),
    );
  } catch (e) {
    throw friendly(e);
  }
  return getEvent(db, me, ids[0]);
}

export async function getEvent(db: D1Database, me: string, eventId: string): Promise<GroupEvent> {
  await requireMember(db, await groupOfEvent(db, eventId), me);
  const row = await db.prepare('select * from events where id = ?').bind(eventId).first<GroupEvent>();
  if (!row) throw notFound('That service or rehearsal doesn’t exist.');
  return row;
}

/** Leaders change an event's details. */
export async function updateEvent(db: D1Database, me: string, eventId: string, patch: Partial<Omit<EventInput, 'repeatWeeks'>>): Promise<GroupEvent> {
  await requireLeader(db, await groupOfEvent(db, eventId), me, 'Only a leader can change services and rehearsals.');
  const current = await getEvent(db, me, eventId);
  if (patch.kind !== undefined && !KINDS.includes(patch.kind)) throw badRequest('Choose a service, rehearsal or concert.');
  if (patch.title !== undefined && !patch.title.trim()) throw badRequest('Give it a title.');
  try {
    await db
      .prepare('update events set kind = ?, title = ?, starts_at = ?, venue = ?, note = ? where id = ?')
      .bind(
        patch.kind ?? current.kind,
        patch.title?.trim() ?? current.title,
        patch.startsAt !== undefined ? isoOrThrow(patch.startsAt) : current.starts_at,
        patch.venue?.trim() ?? current.venue,
        patch.note?.trim() ?? current.note,
        eventId,
      )
      .run();
  } catch (e) {
    throw friendly(e);
  }
  return getEvent(db, me, eventId);
}

export async function deleteEvent(db: D1Database, me: string, eventId: string): Promise<void> {
  await requireLeader(db, await groupOfEvent(db, eventId), me, 'Only a leader can delete services and rehearsals.');
  await db.prepare('delete from events where id = ?').bind(eventId).run();
}

/** A group's events in date order, between two times (default: everything). */
export async function listEvents(db: D1Database, me: string, groupId: string, opts: { from?: string; to?: string } = {}): Promise<(GroupEvent & { songs: number })[]> {
  await requireMember(db, groupId, me);
  const { results } = await db
    .prepare(
      `select e.*, (select count(*) from event_items i where i.event_id = e.id) as songs
       from events e where e.group_id = ? and e.starts_at >= ? and e.starts_at <= ? order by e.starts_at`,
    )
    .bind(groupId, opts.from ? isoOrThrow(opts.from) : '0000', opts.to ? isoOrThrow(opts.to) : '9999')
    .all<GroupEvent & { songs: number }>();
  return results;
}

/** Everything the event page shows: details, the order, your reply and the totals. */
export async function eventDetails(db: D1Database, me: string, eventId: string): Promise<EventDetails> {
  const groupId = await groupOfEvent(db, eventId);
  const m = await requireMember(db, groupId, me);
  const [event, items, mine, counts, att, group, canEdit] = await Promise.all([
    getEvent(db, me, eventId),
    listOrder(db, me, eventId),
    db.prepare('select status from rsvps where event_id = ? and user_id = ?').bind(eventId, me).first<{ status: Reply }>(),
    db
      .prepare(`select sum(status = 'going') as going, sum(status = 'cant') as cant from rsvps where event_id = ?`)
      .bind(eventId)
      .first<{ going: number | null; cant: number | null }>(),
    db
      .prepare('select status from attendance where event_id = ? and user_id = ?')
      .bind(eventId, me)
      .first<{ status: EventDetails['my_attendance'] }>(),
    db.prepare('select self_check_in from groups where id = ?').bind(groupId).first<{ self_check_in: number }>(),
    canEditOrders(db, groupId, m),
  ]);
  return {
    event,
    items,
    my_reply: mine?.status ?? null,
    replies: { going: counts?.going ?? 0, cant: counts?.cant ?? 0 },
    my_role: m.role,
    my_part: m.part,
    my_attendance: att?.status ?? null,
    self_check_in: group?.self_check_in === 1,
    can_edit_order: canEdit,
  };
}

/* ---------- The song order ---------- */

export async function listOrder(db: D1Database, me: string, eventId: string): Promise<OrderItem[]> {
  await requireMember(db, await groupOfEvent(db, eventId), me);
  const { results } = await db
    .prepare(
      `select i.id, i.event_id, i.position, i.section, i.song_id, i.note,
              s.title, s.composer, s.doh, s.time_signature, length(trim(s.solfa)) > 0 as playable
       from event_items i join songs s on s.id = i.song_id where i.event_id = ? order by i.position`,
    )
    .bind(eventId)
    .all<Omit<OrderItem, 'playable'> & { playable: number }>();
  return results.map((r) => ({ ...r, playable: r.playable === 1 }));
}

/** Leaders add a song to the order, at the end unless a position is given. */
export async function addToOrder(
  db: D1Database,
  me: string,
  eventId: string,
  input: { songId: string; section?: string; position?: number; note?: string },
): Promise<OrderItem> {
  await requireOrderEditor(db, await groupOfEvent(db, eventId), me);
  await getSong(db, input.songId);
  const last = await db.prepare('select max(position) as p from event_items where event_id = ?').bind(eventId).first<{ p: number | null }>();
  const id = newId();
  try {
    await db
      .prepare('insert into event_items (id, event_id, position, section, song_id, note) values (?, ?, ?, ?, ?, ?)')
      .bind(id, eventId, input.position ?? (last?.p ?? 0) + 1, input.section?.trim() ?? '', input.songId, input.note?.trim() ?? '')
      .run();
  } catch (e) {
    throw friendly(e);
  }
  return (await listOrder(db, me, eventId)).find((i) => i.id === id)!;
}

export async function removeFromOrder(db: D1Database, me: string, itemId: string): Promise<void> {
  const item = await db.prepare('select event_id from event_items where id = ?').bind(itemId).first<{ event_id: string }>();
  if (!item) throw notFound('That song isn’t in the order.');
  await requireOrderEditor(db, await groupOfEvent(db, item.event_id), me);
  await db.prepare('delete from event_items where id = ?').bind(itemId).run();
}

/**
 * Leaders reorder the songs and move them between sections in one go: `items`
 * is the whole order, top to bottom, each with its section.
 */
export async function setOrder(db: D1Database, me: string, eventId: string, items: { id: string; section: string }[]): Promise<OrderItem[]> {
  await requireOrderEditor(db, await groupOfEvent(db, eventId), me);
  const current = await listOrder(db, me, eventId);
  const same = items.length === current.length && new Set(items.map((i) => i.id)).size === items.length && items.every((i) => current.some((c) => c.id === i.id));
  if (!same) throw conflict('The song order changed while you were editing. Reload and try again.');
  if (items.length) {
    await db.batch(
      items.map((it, i) =>
        db.prepare('update event_items set position = ?, section = ? where id = ? and event_id = ?').bind(i + 1, (it.section ?? '').trim().slice(0, 60), it.id, eventId),
      ),
    );
  }
  return listOrder(db, me, eventId);
}

/** Leaders copy another event's songs (e.g. last week's) onto the end of this order. */
export async function copyOrder(db: D1Database, me: string, eventId: string, fromEventId: string): Promise<OrderItem[]> {
  const groupId = await groupOfEvent(db, eventId);
  await requireOrderEditor(db, groupId, me);
  if ((await groupOfEvent(db, fromEventId)) !== groupId) throw badRequest('You can only copy from your own group’s services.');
  const source = await listOrder(db, me, fromEventId);
  const last = await db.prepare('select max(position) as p from event_items where event_id = ?').bind(eventId).first<{ p: number | null }>();
  const start = last?.p ?? 0;
  if (source.length) {
    await db.batch(
      source.map((it, i) =>
        db
          .prepare('insert into event_items (id, event_id, position, section, song_id, note) values (?, ?, ?, ?, ?, ?)')
          .bind(newId(), eventId, start + i + 1, it.section, it.song_id, it.note),
      ),
    );
  }
  return listOrder(db, me, eventId);
}

/** When each song was last sung at a service or concert, and how often: for "last sung 3 weeks ago". */
export async function songHistory(db: D1Database, me: string, groupId: string, now = new Date()): Promise<{ song_id: string; last_sung_at: string; times: number }[]> {
  await requireMember(db, groupId, me);
  const { results } = await db
    .prepare(
      `select i.song_id, max(e.starts_at) as last_sung_at, count(*) as times
       from event_items i join events e on e.id = i.event_id
       where e.group_id = ? and e.kind <> 'rehearsal' and e.starts_at < ?
       group by i.song_id`,
    )
    .bind(groupId, now.toISOString())
    .all<{ song_id: string; last_sung_at: string; times: number }>();
  return results;
}

/* ---------- Replies ---------- */

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

/** Who replied what, with names and parts (members see this). */
export async function listReplies(db: D1Database, me: string, eventId: string): Promise<{ user_id: string; status: Reply; display_name: string; part: string | null }[]> {
  const groupId = await groupOfEvent(db, eventId);
  await requireMember(db, groupId, me);
  const { results } = await db
    .prepare(
      `select r.user_id, r.status, p.display_name, m.part from rsvps r
       join profiles p on p.id = r.user_id
       left join memberships m on m.group_id = ? and m.user_id = r.user_id
       where r.event_id = ? order by p.display_name`,
    )
    .bind(groupId, eventId)
    .all<{ user_id: string; status: Reply; display_name: string; part: string | null }>();
  return results;
}
