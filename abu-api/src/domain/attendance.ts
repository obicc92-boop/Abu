/** Attendance: marking by leaders and part leaders, and self check-in with the rehearsal's code. */
import { badRequest, forbidden } from '../errors';
import { groupOfEvent, LEADERS, membershipOf, nowIso, requireMember, requireRole } from './access';

export type AttendanceStatus = 'present' | 'absent' | 'excused';

export interface AttendanceMark {
  event_id: string;
  user_id: string;
  status: AttendanceStatus;
  marked_by: string | null;
  self_check_in: boolean;
  marked_at: string;
}

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'excused'];
/** Check-in opens this long before the start... */
const OPENS_BEFORE_MS = 3 * 60 * 60 * 1000;
/** ...and closes this long after. */
const CLOSES_AFTER_MS = 6 * 60 * 60 * 1000;
const MAX_WRONG_CODES = 5;

/** Leaders mark anyone in the group; part leaders only people in their own part. */
export async function canMark(db: D1Database, me: string, eventId: string, userId: string): Promise<boolean> {
  const groupId = await groupOfEvent(db, eventId);
  const mine = await membershipOf(db, groupId, me);
  if (!mine || mine.status !== 'active') return false;
  const theirs = await membershipOf(db, groupId, userId);
  if (!theirs || theirs.status !== 'active') return false;
  return mine.role === 'leader' || (mine.role === 'part_leader' && mine.part !== null && theirs.part === mine.part);
}

export async function markAttendance(db: D1Database, me: string, eventId: string, userId: string, status: AttendanceStatus): Promise<void> {
  if (!STATUSES.includes(status)) throw badRequest('Mark present, absent or excused.');
  if (!(await canMark(db, me, eventId, userId))) {
    const mine = await membershipOf(db, await groupOfEvent(db, eventId), me);
    throw forbidden(
      mine?.role === 'part_leader' ? 'Part leaders can mark only people in their own part.' : 'Only leaders and part leaders can mark attendance.',
    );
  }
  await db
    .prepare(
      `insert into attendance (event_id, user_id, status, marked_by, self_check_in, marked_at) values (?, ?, ?, ?, 0, ?)
       on conflict (event_id, user_id) do update
         set status = excluded.status, marked_by = excluded.marked_by, self_check_in = 0, marked_at = excluded.marked_at`,
    )
    .bind(eventId, userId, status, me, nowIso())
    .run();
}

/** Leaders and part leaders see everyone's marks; members see only their own. */
export async function listAttendance(db: D1Database, me: string, eventId: string): Promise<AttendanceMark[]> {
  const mine = await requireMember(db, await groupOfEvent(db, eventId), me);
  const stmt = LEADERS.includes(mine.role)
    ? db.prepare('select * from attendance where event_id = ?').bind(eventId)
    : db.prepare('select * from attendance where event_id = ? and user_id = ?').bind(eventId, me);
  const { results } = await stmt.all<Omit<AttendanceMark, 'self_check_in'> & { self_check_in: number }>();
  return results.map((r) => ({ ...r, self_check_in: r.self_check_in === 1 }));
}

/** The 4-digit code to show at rehearsal, made the first time a leader or part leader asks. */
export async function checkInCode(db: D1Database, me: string, eventId: string): Promise<string> {
  await requireRole(db, await groupOfEvent(db, eventId), me, LEADERS, 'Only leaders and part leaders can show the check-in code.');
  const existing = await db.prepare('select code from event_codes where event_id = ?').bind(eventId).first<{ code: string }>();
  if (existing) return existing.code;
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  const code = String(n[0] % 10000).padStart(4, '0');
  await db.prepare('insert into event_codes (event_id, code) values (?, ?) on conflict do nothing').bind(eventId, code).run();
  return (await db.prepare('select code from event_codes where event_id = ?').bind(eventId).first<{ code: string }>())!.code;
}

export type CheckInResult = 'present' | 'wrong_code' | 'locked';

/** Self check-in with the code shown at rehearsal. Five wrong codes lock you out for that event. */
export async function checkIn(db: D1Database, me: string, eventId: string, code: string, now = new Date()): Promise<CheckInResult> {
  const groupId = await groupOfEvent(db, eventId);
  await requireMember(db, groupId, me);
  const info = await db
    .prepare('select e.starts_at, g.self_check_in from events e join groups g on g.id = e.group_id where e.id = ?')
    .bind(eventId)
    .first<{ starts_at: string; self_check_in: number }>();
  if (!info?.self_check_in) throw forbidden('Self check-in is off for this group. Your leader will mark you.');
  const start = new Date(info.starts_at).getTime();
  if (now.getTime() < start - OPENS_BEFORE_MS || now.getTime() > start + CLOSES_AFTER_MS) {
    throw forbidden('Check-in opens 3 hours before the start and closes 6 hours after.');
  }
  const tries = await db
    .prepare('select failures from check_in_attempts where event_id = ? and user_id = ?')
    .bind(eventId, me)
    .first<{ failures: number }>();
  const failures = tries?.failures ?? 0;
  if (failures >= MAX_WRONG_CODES) return 'locked';

  const real = await db.prepare('select code from event_codes where event_id = ?').bind(eventId).first<{ code: string }>();
  if (!real || real.code !== code.trim()) {
    await db
      .prepare(
        `insert into check_in_attempts (event_id, user_id, failures) values (?, ?, 1)
         on conflict (event_id, user_id) do update set failures = failures + 1`,
      )
      .bind(eventId, me)
      .run();
    return failures + 1 >= MAX_WRONG_CODES ? 'locked' : 'wrong_code';
  }
  await db
    .prepare(
      `insert into attendance (event_id, user_id, status, marked_by, self_check_in, marked_at) values (?, ?, 'present', ?, 1, ?)
       on conflict (event_id, user_id) do update
         set status = 'present', marked_by = excluded.marked_by, self_check_in = 1, marked_at = excluded.marked_at`,
    )
    .bind(eventId, me, me, nowIso())
    .run();
  return 'present';
}
