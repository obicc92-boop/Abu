/** People, groups and memberships: signing up, starting and joining groups, roles and parts. */
import { badRequest, forbidden, friendly, notFound } from '../errors';
import { membershipOf, newId, requireLeader, sharesGroup, type Membership, type Role } from './access';

export type GroupType = 'catholic' | 'anglican' | 'pentecostal' | 'band' | 'personal';

export interface Profile {
  id: string;
  display_name: string;
  avatar_key: string | null;
}

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  church: string;
  town: string;
  invite_code: string | null;
  requires_approval: boolean;
  self_check_in: boolean;
  leader_title: string;
  sections: string[];
  parts: string[];
  created_by: string | null;
  created_at: string;
}

export interface Member extends Membership {
  display_name: string;
}

interface GroupRow extends Omit<Group, 'requires_approval' | 'self_check_in' | 'sections' | 'parts'> {
  requires_approval: number;
  self_check_in: number;
  sections: string;
  parts: string;
}

const toGroup = (r: GroupRow): Group => ({
  ...r,
  requires_approval: r.requires_approval === 1,
  self_check_in: r.self_check_in === 1,
  sections: JSON.parse(r.sections),
  parts: JSON.parse(r.parts),
});

/** Leader title and song order sections for each group type (from the prototype). */
export const GROUP_DEFAULTS: Record<GroupType, { leaderTitle: string; sections: string[] }> = {
  catholic: {
    leaderTitle: 'Choirmaster',
    sections: ['Entrance', 'Kyrie', 'Gloria', 'Psalm', 'Gospel Acclamation', 'Offertory', 'Sanctus', 'Agnus Dei', 'Communion', 'Thanksgiving', 'Recessional'],
  },
  anglican: { leaderTitle: 'Choirmaster', sections: ['Introit', 'Hymn', 'Psalm', 'Canticle', 'Anthem', 'Offertory', 'Communion', 'Recessional'] },
  pentecostal: { leaderTitle: 'Choir director', sections: ['Praise', 'Worship', 'Special number', 'Offering', 'Thanksgiving', 'Closing'] },
  band: { leaderTitle: 'Music director', sections: ['Opening', 'Set 1', 'Set 2', 'Interlude', 'Encore'] },
  personal: { leaderTitle: 'Owner', sections: ['Opening', 'Song', 'Closing', 'Encore', 'Practice'] },
};

/* ---------- People ---------- */

/**
 * Called once when someone signs up: their profile and their own space
 * ("My space"). Safe to call again.
 */
export async function ensureUser(db: D1Database, user: { id: string; name?: string | null; email?: string | null }): Promise<void> {
  if (await db.prepare('select 1 from profiles where id = ?').bind(user.id).first()) return;
  const name = (user.name?.trim() || user.email?.split('@')[0] || '').slice(0, 80);
  const space = newId();
  const d = GROUP_DEFAULTS.personal;
  await db.batch([
    db.prepare('insert into profiles (id, display_name) values (?, ?)').bind(user.id, name),
    db
      .prepare(`insert into groups (id, name, type, leader_title, sections, created_by) values (?, 'My space', 'personal', ?, ?, ?)`)
      .bind(space, d.leaderTitle, JSON.stringify(d.sections), user.id),
    db.prepare(`insert into memberships (group_id, user_id, role, status) values (?, ?, 'leader', 'active')`).bind(space, user.id),
  ]);
}

/** Change your own name. */
export async function updateProfile(db: D1Database, me: string, patch: { display_name?: string }): Promise<Profile> {
  if (patch.display_name !== undefined) {
    const name = patch.display_name.trim();
    if (!name) throw badRequest('Enter your name.');
    try {
      await db.prepare('update profiles set display_name = ? where id = ?').bind(name.slice(0, 80), me).run();
    } catch (e) {
      throw friendly(e);
    }
  }
  return getProfile(db, me, me);
}

/** Your own profile, or someone you share a group with. */
export async function getProfile(db: D1Database, me: string, userId: string): Promise<Profile> {
  if (userId !== me && !(await sharesGroup(db, me, userId))) throw notFound('That person isn’t in any of your groups.');
  const p = await db.prepare('select id, display_name, avatar_key from profiles where id = ?').bind(userId).first<Profile>();
  if (!p) throw notFound('That person isn’t in any of your groups.');
  return p;
}

/* ---------- Groups ---------- */

/** A join code from the group's name, like the prototype's STM482 for St. Mary's. */
export async function newInviteCode(db: D1Database, name: string): Promise<string> {
  const prefix = (name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) + 'XXX').slice(0, 3);
  const safe = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = new Uint32Array(6);
  for (let tries = 0; tries < 60; tries++) {
    crypto.getRandomValues(random);
    const code =
      tries < 25
        ? prefix + String(random[0] % 1000).padStart(3, '0')
        : Array.from(random, (n) => safe[n % safe.length]).join('');
    if (!(await db.prepare('select 1 from groups where invite_code = ?').bind(code).first())) return code;
  }
  throw new Error('Could not make a group code. Try again.');
}

export async function createGroup(
  db: D1Database,
  me: string,
  input: { name: string; type: Exclude<GroupType, 'personal'>; church?: string; town?: string; part?: string | null },
): Promise<Group> {
  const name = input.name.trim();
  if (!name) throw badRequest('Give the group a name.');
  if (!(input.type in GROUP_DEFAULTS) || input.type === ('personal' as GroupType)) throw badRequest('Choose what kind of group this is.');
  const id = newId();
  const d = GROUP_DEFAULTS[input.type];
  const code = await newInviteCode(db, name);
  try {
    await db.batch([
      db
        .prepare(
          `insert into groups (id, name, type, church, town, invite_code, leader_title, sections, created_by)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, name, input.type, input.church?.trim() ?? '', input.town?.trim() ?? '', code, d.leaderTitle, JSON.stringify(d.sections), me),
      db.prepare(`insert into memberships (group_id, user_id, role, status, part) values (?, ?, 'leader', 'active', ?)`).bind(id, me, input.part ?? null),
    ]);
  } catch (e) {
    throw friendly(e);
  }
  return getGroup(db, me, id);
}

export interface GroupPreview {
  id: string;
  name: string;
  type: GroupType;
  church: string;
  town: string;
  leader_name: string | null;
  members: number;
  requires_approval: boolean;
}

/** What the join screen shows before joining. */
export async function groupPreview(db: D1Database, code: string): Promise<GroupPreview> {
  const row = await db
    .prepare(
      `select g.id, g.name, g.type, g.church, g.town, g.requires_approval,
         (select p.display_name from memberships m join profiles p on p.id = m.user_id
           where m.group_id = g.id and m.role = 'leader' and m.status = 'active' order by m.joined_at limit 1) as leader_name,
         (select count(*) from memberships m where m.group_id = g.id and m.status = 'active') as members
       from groups g where g.invite_code = ?`,
    )
    .bind(code.trim().toUpperCase())
    .first<Omit<GroupPreview, 'requires_approval'> & { requires_approval: number }>();
  if (!row) throw notFound(`No group has the code ${code.trim().toUpperCase()}. Check it with your leader.`);
  return { ...row, requires_approval: row.requires_approval === 1 };
}

/** Join with a code: in straight away, or waiting if the leader approves new members. */
export async function joinGroup(db: D1Database, me: string, code: string, part: string | null = null): Promise<Membership> {
  const g = await db
    .prepare('select id, requires_approval from groups where invite_code = ?')
    .bind(code.trim().toUpperCase())
    .first<{ id: string; requires_approval: number }>();
  if (!g) throw notFound(`No group has the code ${code.trim().toUpperCase()}. Check it with your leader.`);
  const existing = await membershipOf(db, g.id, me);
  if (existing) return existing;
  await db
    .prepare(`insert into memberships (group_id, user_id, role, status, part) values (?, ?, 'member', ?, ?) on conflict do nothing`)
    .bind(g.id, me, g.requires_approval ? 'pending' : 'active', part)
    .run();
  return (await membershipOf(db, g.id, me))!;
}

/** A group you belong to, or are waiting to join. */
export async function getGroup(db: D1Database, me: string, groupId: string): Promise<Group> {
  if (!(await membershipOf(db, groupId, me))) throw forbidden('You’re not in this group.');
  const row = await db.prepare('select * from groups where id = ?').bind(groupId).first<GroupRow>();
  if (!row) throw notFound('That group doesn’t exist.');
  return toGroup(row);
}

/** Your groups, your own space first, with your role, part and whether you're still waiting. */
export async function myGroups(db: D1Database, me: string): Promise<(Group & Pick<Membership, 'role' | 'status' | 'part'>)[]> {
  const { results } = await db
    .prepare(
      `select g.*, m.role, m.status, m.part from memberships m join groups g on g.id = m.group_id
       where m.user_id = ? order by g.type <> 'personal', g.name`,
    )
    .bind(me)
    .all<GroupRow & Pick<Membership, 'role' | 'status' | 'part'>>();
  return results.map((r) => ({ ...toGroup(r), role: r.role, status: r.status, part: r.part }));
}

/** Members see the group's members; leaders also see who is waiting; someone waiting sees only themselves. */
export async function listMembers(db: D1Database, me: string, groupId: string): Promise<Member[]> {
  const mine = await membershipOf(db, groupId, me);
  if (!mine) throw forbidden('You’re not in this group.');
  const base = 'select m.*, p.display_name from memberships m join profiles p on p.id = m.user_id where m.group_id = ?';
  const stmt =
    mine.status !== 'active'
      ? db.prepare(`${base} and m.user_id = ? order by p.display_name`).bind(groupId, me)
      : mine.role === 'leader'
        ? db.prepare(`${base} order by p.display_name`).bind(groupId)
        : db.prepare(`${base} and (m.status = 'active' or m.user_id = ?) order by p.display_name`).bind(groupId, me);
  const { results } = await stmt.all<Member>();
  return results;
}

export interface GroupSettings {
  name?: string;
  church?: string;
  town?: string;
  requires_approval?: boolean;
  self_check_in?: boolean;
  leader_title?: string;
  sections?: string[];
}

/** Leaders change the group's details and switches. */
export async function updateGroup(db: D1Database, me: string, groupId: string, patch: GroupSettings): Promise<Group> {
  await requireLeader(db, groupId, me, 'Only a leader can change the group’s settings.');
  const sets: string[] = [];
  const values: unknown[] = [];
  const put = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (patch.name !== undefined) put('name', patch.name.trim());
  if (patch.church !== undefined) put('church', patch.church.trim());
  if (patch.town !== undefined) put('town', patch.town.trim());
  if (patch.leader_title !== undefined) put('leader_title', patch.leader_title.trim());
  if (patch.requires_approval !== undefined) put('requires_approval', patch.requires_approval ? 1 : 0);
  if (patch.self_check_in !== undefined) put('self_check_in', patch.self_check_in ? 1 : 0);
  if (patch.sections !== undefined) put('sections', JSON.stringify(patch.sections.map((s) => s.trim()).filter(Boolean)));
  if (sets.length) {
    try {
      await db.prepare(`update groups set ${sets.join(', ')} where id = ?`).bind(...values, groupId).run();
    } catch (e) {
      throw friendly(e);
    }
  }
  return getGroup(db, me, groupId);
}

/** Leaders delete a group they lead (not someone's own space). */
export async function deleteGroup(db: D1Database, me: string, groupId: string): Promise<void> {
  await requireLeader(db, groupId, me, 'Only a leader can delete the group.');
  const g = await db.prepare('select type from groups where id = ?').bind(groupId).first<{ type: GroupType }>();
  if (g?.type === 'personal') throw badRequest('Your own space can’t be deleted.');
  try {
    await db.prepare('delete from groups where id = ?').bind(groupId).run();
  } catch (e) {
    throw friendly(e, 'A song from this group is in another group’s song order, so the group can’t be deleted yet.');
  }
}

async function targetMembership(db: D1Database, groupId: string, userId: string): Promise<Membership> {
  const m = await membershipOf(db, groupId, userId);
  if (!m) throw notFound('That person isn’t in this group.');
  return m;
}

/** Leaders let in someone who is waiting. */
export async function approveMember(db: D1Database, me: string, groupId: string, userId: string): Promise<void> {
  await requireLeader(db, groupId, me, 'Only a leader can let new members in.');
  await targetMembership(db, groupId, userId);
  await db.prepare(`update memberships set status = 'active' where group_id = ? and user_id = ?`).bind(groupId, userId).run();
}

/** Leaders make someone a leader, part leader or member. */
export async function setRole(db: D1Database, me: string, groupId: string, userId: string, role: Role): Promise<void> {
  await requireLeader(db, groupId, me, 'Only a leader can change roles.');
  await targetMembership(db, groupId, userId);
  try {
    await db.prepare('update memberships set role = ? where group_id = ? and user_id = ?').bind(role, groupId, userId).run();
  } catch (e) {
    throw friendly(e);
  }
}

/** You change your own part; leaders change anyone's. */
export async function setPart(db: D1Database, me: string, groupId: string, userId: string, part: string | null): Promise<void> {
  if (userId === me) {
    if (!(await membershipOf(db, groupId, me))) throw forbidden('You’re not in this group.');
  } else {
    await requireLeader(db, groupId, me, 'Only a leader can change someone else’s part.');
    await targetMembership(db, groupId, userId);
  }
  try {
    await db.prepare('update memberships set part = ? where group_id = ? and user_id = ?').bind(part, groupId, userId).run();
  } catch (e) {
    throw friendly(e);
  }
}

/** Leave a group (a leader must hand over first). */
export async function leaveGroup(db: D1Database, me: string, groupId: string): Promise<void> {
  const g = await db.prepare('select type from groups where id = ?').bind(groupId).first<{ type: GroupType }>();
  if (g?.type === 'personal') throw badRequest('You can’t leave your own space.');
  try {
    await db.prepare('delete from memberships where group_id = ? and user_id = ?').bind(groupId, me).run();
  } catch (e) {
    throw friendly(e);
  }
}

/** Leaders remove someone from the group. */
export async function removeMember(db: D1Database, me: string, groupId: string, userId: string): Promise<void> {
  await requireLeader(db, groupId, me, 'Only a leader can remove members.');
  try {
    await db.prepare('delete from memberships where group_id = ? and user_id = ?').bind(groupId, userId).run();
  } catch (e) {
    throw friendly(e);
  }
}

