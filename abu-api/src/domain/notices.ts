/**
 * Notices: posted by leaders and part leaders, read by the whole group. A
 * notice can be for one part ("Tenors, watch bar 6"): leaders write to any
 * part, part leaders to everyone or their own part.
 */
import { badRequest, notFound, forbidden } from '../errors';
import { LEADERS, membershipOf, newId, requireMember, requireRole } from './access';

export interface Notice {
  id: string;
  group_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  /** The part it's for, or null for everyone. */
  part: string | null;
  pinned: boolean;
  created_at: string;
}

export async function postNotice(db: D1Database, me: string, groupId: string, body: string, part: string | null = null): Promise<Notice> {
  const mine = await requireRole(db, groupId, me, LEADERS, 'Only leaders and part leaders can post notices.');
  const text = body?.trim();
  if (!text) throw badRequest('Write something first.');
  if (text.length > 2000) throw badRequest('Keep a notice under 2,000 characters.');
  const to = part?.trim() || null;
  if (to) {
    const g = await db.prepare('select parts from groups where id = ?').bind(groupId).first<{ parts: string }>();
    if (!(JSON.parse(g?.parts ?? '[]') as string[]).includes(to)) throw badRequest('Choose one of the group’s parts.');
    if (mine.role === 'part_leader' && to !== mine.part) throw forbidden('Part leaders write to everyone or to their own part.');
  }
  const id = newId();
  await db.prepare('insert into notices (id, group_id, author_id, body, part) values (?, ?, ?, ?, ?)').bind(id, groupId, me, text, to).run();
  return (await listNotices(db, me, groupId)).find((n) => n.id === id)!;
}

/** Pinned first, then newest first. */
export async function listNotices(db: D1Database, me: string, groupId: string): Promise<Notice[]> {
  await requireMember(db, groupId, me);
  const { results } = await db
    .prepare(
      `select n.*, p.display_name as author_name from notices n left join profiles p on p.id = n.author_id
       where n.group_id = ? order by n.pinned desc, n.created_at desc`,
    )
    .bind(groupId)
    .all<Omit<Notice, 'pinned'> & { pinned: number }>();
  return results.map((r) => ({ ...r, pinned: r.pinned === 1 }));
}

async function noticeGroup(db: D1Database, noticeId: string) {
  const n = await db.prepare('select group_id, author_id from notices where id = ?').bind(noticeId).first<{ group_id: string; author_id: string | null }>();
  if (!n) throw notFound('That notice doesn’t exist.');
  return n;
}

/** Leaders pin or unpin a notice. */
export async function pinNotice(db: D1Database, me: string, noticeId: string, pinned: boolean): Promise<void> {
  const n = await noticeGroup(db, noticeId);
  await requireRole(db, n.group_id, me, ['leader'], 'Only a leader can pin notices.');
  await db.prepare('update notices set pinned = ? where id = ?').bind(pinned ? 1 : 0, noticeId).run();
}

/** The author or a leader deletes a notice. */
export async function deleteNotice(db: D1Database, me: string, noticeId: string): Promise<void> {
  const n = await noticeGroup(db, noticeId);
  const mine = await membershipOf(db, n.group_id, me);
  if (n.author_id !== me && !(mine?.status === 'active' && mine.role === 'leader')) {
    throw forbidden('Only whoever posted it, or a leader, can delete a notice.');
  }
  await db.prepare('delete from notices where id = ?').bind(noticeId).run();
}
