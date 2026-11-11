/** Attendance: marking by leaders and part leaders, and self check-in with the rehearsal's code. */
import { badRequest, forbidden } from '../errors';
import { groupOfEvent, LEADERS, membershipOf, nowIso, requireMember, requireRole, type Role } from './access';

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

/* ---------- The register: marking, rates and reports ---------- */

export interface SheetRow {
  user_id: string;
  display_name: string;
  part: string | null;
  role: Role;
  /** Their own reply before the day. */
  reply: 'going' | 'cant' | null;
  /** The mark, or null when nobody has marked them yet. */
  status: AttendanceStatus | null;
  self_check_in: boolean;
  /** Whether you may mark this person (part leaders: only their own part). */
  can_mark: boolean;
}

/** Everyone in the group for one service or rehearsal, with their reply and mark: for leaders and part leaders. */
export async function attendanceSheet(db: D1Database, me: string, eventId: string): Promise<SheetRow[]> {
  const groupId = await groupOfEvent(db, eventId);
  const mine = await requireRole(db, groupId, me, LEADERS, 'Only leaders and part leaders can see the attendance register.');
  const { results } = await db
    .prepare(
      `select m.user_id, p.display_name, m.part, m.role, r.status as reply, a.status, coalesce(a.self_check_in, 0) as self_check_in
       from memberships m
       join profiles p on p.id = m.user_id
       left join rsvps r on r.event_id = ?1 and r.user_id = m.user_id
       left join attendance a on a.event_id = ?1 and a.user_id = m.user_id
       where m.group_id = ?2 and m.status = 'active'
       order by p.display_name collate nocase`,
    )
    .bind(eventId, groupId)
    .all<Omit<SheetRow, 'self_check_in' | 'can_mark'> & { self_check_in: number }>();
  return results.map((r) => ({
    ...r,
    self_check_in: r.self_check_in === 1,
    can_mark: mine.role === 'leader' || (mine.part !== null && r.part === mine.part),
  }));
}

/**
 * After rehearsal: mark everyone you may mark who isn't marked yet, as present
 * (when most came) or absent (when the rest checked in). People who replied
 * "Can't come" are marked excused either way. Returns how many were marked.
 */
export async function markRest(db: D1Database, me: string, eventId: string, status: 'present' | 'absent'): Promise<number> {
  if (status !== 'present' && status !== 'absent') throw badRequest('Mark the rest present or absent.');
  const rest = (await attendanceSheet(db, me, eventId)).filter((r) => r.can_mark && r.status === null);
  if (!rest.length) return 0;
  const at = nowIso();
  await db.batch(
    rest.map((r) =>
      db
        .prepare('insert into attendance (event_id, user_id, status, marked_by, self_check_in, marked_at) values (?, ?, ?, ?, 0, ?) on conflict do nothing')
        .bind(eventId, r.user_id, r.reply === 'cant' ? 'excused' : status, me, at),
    ),
  );
  return rest.length;
}

export interface Tally {
  present: number;
  absent: number;
  excused: number;
  /** Present out of present and absent, as a whole percentage; null before anyone is marked. Excused doesn't count against anyone. */
  rate: number | null;
}

function tally(statuses: (AttendanceStatus | null)[]): Tally {
  const t = { present: 0, absent: 0, excused: 0 };
  for (const s of statuses) if (s) t[s]++;
  const counted = t.present + t.absent;
  return { ...t, rate: counted ? Math.round((t.present * 100) / counted) : null };
}

/** A mark, or "excused" for someone who replied "Can't come" and was never marked. */
const effective = (mark: AttendanceStatus | null, reply: string | null): AttendanceStatus | null => mark ?? (reply === 'cant' ? 'excused' : null);

interface RegisterCell {
  event_id: string;
  user_id: string;
  status: AttendanceStatus | null;
  reply: string | null;
}

/** Your own record in a group, over everything up to now. Only you (and the group's leaders, in the report) see it. */
export async function myAttendance(db: D1Database, me: string, groupId: string, now = new Date()): Promise<Tally> {
  await requireMember(db, groupId, me);
  const { results } = await db
    .prepare(
      `select a.status, r.status as reply from events e
       left join attendance a on a.event_id = e.id and a.user_id = ?1
       left join rsvps r on r.event_id = e.id and r.user_id = ?1
       where e.group_id = ?2 and e.starts_at <= ?3`,
    )
    .bind(me, groupId, now.toISOString())
    .all<{ status: AttendanceStatus | null; reply: string | null }>();
  return tally(results.map((r) => effective(r.status, r.reply)));
}

export interface AttendanceReport {
  from: string;
  to: string;
  /** The viewer's time zone, as JavaScript's getTimezoneOffset() (Lagos is -60), for dates and months. */
  tz: number;
  events: { id: string; kind: string; title: string; starts_at: string; marked: number }[];
  members: (Tally & { user_id: string; display_name: string; part: string | null; role: Role; marks: Record<string, AttendanceStatus | null> })[];
  parts: (Tally & { part: string; members: number })[];
  months: (Tally & { month: string; events: number })[];
  overall: Tally;
}

/**
 * The register for leaders and part leaders: every service and rehearsal that
 * has started in the range, each active member's marks and rate, and totals by
 * part and by month.
 */
export async function attendanceReport(
  db: D1Database,
  me: string,
  groupId: string,
  range: { from?: string; to?: string; tz?: number } = {},
  now = new Date(),
): Promise<AttendanceReport> {
  await requireRole(db, groupId, me, LEADERS, 'Only leaders and part leaders can see attendance reports.');
  const to = new Date(Math.min(now.getTime(), range.to ? new Date(range.to).getTime() : Infinity));
  const from = range.from ? new Date(range.from) : new Date(to.getFullYear(), to.getMonth() - 2, 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest('Choose a valid date range.');
  const tz = Number.isFinite(range.tz) && Math.abs(range.tz!) <= 14 * 60 ? Math.round(range.tz!) : 0;

  const [events, members, cells] = await Promise.all([
    db
      .prepare(
        `select e.id, e.kind, e.title, e.starts_at, (select count(*) from attendance a where a.event_id = e.id) as marked
         from events e where e.group_id = ? and e.starts_at >= ? and e.starts_at <= ? order by e.starts_at`,
      )
      .bind(groupId, from.toISOString(), to.toISOString())
      .all<AttendanceReport['events'][number]>(),
    db
      .prepare(
        `select m.user_id, p.display_name, m.part, m.role from memberships m join profiles p on p.id = m.user_id
         where m.group_id = ? and m.status = 'active' order by m.part is null, m.part, p.display_name collate nocase`,
      )
      .bind(groupId)
      .all<{ user_id: string; display_name: string; part: string | null; role: Role }>(),
    db
      .prepare(
        `select e.id as event_id, m.user_id, a.status, r.status as reply
         from events e join memberships m on m.group_id = e.group_id and m.status = 'active'
         left join attendance a on a.event_id = e.id and a.user_id = m.user_id
         left join rsvps r on r.event_id = e.id and r.user_id = m.user_id
         where e.group_id = ? and e.starts_at >= ? and e.starts_at <= ?`,
      )
      .bind(groupId, from.toISOString(), to.toISOString())
      .all<RegisterCell>(),
  ]);

  const mark = new Map<string, AttendanceStatus | null>();
  for (const c of cells.results) mark.set(`${c.event_id}|${c.user_id}`, effective(c.status, c.reply));
  const statusOf = (eventId: string, userId: string) => mark.get(`${eventId}|${userId}`) ?? null;

  const rows = members.results.map((m) => {
    const marks = Object.fromEntries(events.results.map((e) => [e.id, statusOf(e.id, m.user_id)]));
    return { ...m, marks, ...tally(Object.values(marks)) };
  });
  const partNames = [...new Set(members.results.map((m) => m.part ?? ''))];
  const parts = partNames.map((part) => {
    const inPart = rows.filter((r) => (r.part ?? '') === part);
    return { part, members: inPart.length, ...tally(inPart.flatMap((r) => Object.values(r.marks))) };
  });
  const monthOf = (iso: string) => localDate(iso, tz).slice(0, 7);
  const months = [...new Set(events.results.map((e) => monthOf(e.starts_at)))].map((month) => {
    const ids = events.results.filter((e) => monthOf(e.starts_at) === month).map((e) => e.id);
    return { month, events: ids.length, ...tally(rows.flatMap((r) => ids.map((id) => r.marks[id]))) };
  });
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    tz,
    events: events.results,
    members: rows,
    parts,
    months,
    overall: tally(rows.flatMap((r) => Object.values(r.marks))),
  };
}

/** "2026-11-30" as the viewer's calendar has it. */
const localDate = (iso: string, tz: number) => new Date(Date.parse(iso) - tz * 60_000).toISOString().slice(0, 10);

const CSV_MARK: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', excused: 'E' };
/** One spreadsheet cell, quoted when needed. Text starting like a formula is prefixed with ' so spreadsheets show it rather than run it. */
const csvCell = (v: string | number | null) => {
  let s = v === null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The report as a spreadsheet: one row per member, one column per service or rehearsal (P, A, E), then totals. */
export function reportCsv(report: AttendanceReport): string {
  const head = ['Name', 'Part', ...report.events.map((e) => `${localDate(e.starts_at, report.tz)} ${e.title}`), 'Present', 'Absent', 'Excused', 'Rate %'];
  const lines = report.members.map((m) => [
    m.display_name,
    m.part ?? '',
    ...report.events.map((e) => (m.marks[e.id] ? CSV_MARK[m.marks[e.id]!] : '')),
    m.present,
    m.absent,
    m.excused,
    m.rate,
  ]);
  return [head, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
