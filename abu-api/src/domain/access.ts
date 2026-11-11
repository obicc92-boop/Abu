/**
 * Who someone is in a group. D1 has no row-level security, so every action in
 * src/domain checks access here before reading or writing anything.
 */
import { forbidden, notFound } from '../errors';

export type Role = 'leader' | 'part_leader' | 'member';
export type MemberStatus = 'active' | 'pending';

export interface Membership {
  group_id: string;
  user_id: string;
  role: Role;
  status: MemberStatus;
  part: string | null;
  joined_at: string;
}

export const LEADERS: Role[] = ['leader', 'part_leader'];

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function membershipOf(db: D1Database, groupId: string, userId: string): Promise<Membership | null> {
  return db.prepare('select * from memberships where group_id = ? and user_id = ?').bind(groupId, userId).first<Membership>();
}

/** Active members only: people waiting for approval can't see the group's insides. */
export async function requireMember(db: D1Database, groupId: string, me: string): Promise<Membership> {
  const m = await membershipOf(db, groupId, me);
  if (!m || m.status !== 'active') throw forbidden('You’re not in this group.');
  return m;
}

export async function requireRole(db: D1Database, groupId: string, me: string, roles: Role[], message: string): Promise<Membership> {
  const m = await requireMember(db, groupId, me);
  if (!roles.includes(m.role)) throw forbidden(message);
  return m;
}

export const requireLeader = (db: D1Database, groupId: string, me: string, message = 'Only a leader can do that.') =>
  requireRole(db, groupId, me, ['leader'], message);

export async function groupOfEvent(db: D1Database, eventId: string): Promise<string> {
  const row = await db.prepare('select group_id from events where id = ?').bind(eventId).first<{ group_id: string }>();
  if (!row) throw notFound('That service or rehearsal doesn’t exist.');
  return row.group_id;
}

/** Whether `me` may see `other`'s profile: they share a group. Leaders also see people waiting to join. */
export async function sharesGroup(db: D1Database, me: string, other: string): Promise<boolean> {
  const row = await db
    .prepare(
      `select 1 from memberships a join memberships b on b.group_id = a.group_id
       where a.user_id = ? and a.status = 'active' and b.user_id = ? and (b.status = 'active' or a.role = 'leader')
       limit 1`,
    )
    .bind(me, other)
    .first();
  return row !== null;
}
