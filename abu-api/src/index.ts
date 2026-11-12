/**
 * The "abu" Worker. Pages and files of the web app are served straight from
 * static assets (see wrangler.jsonc); only /api/* runs this code.
 *
 * Every signed-in route goes through src/domain, which checks who may do what.
 */
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import { getAuth } from './auth';
import type { Role } from './domain/access';
import {
  approveMember,
  createGroup,
  getGroup,
  getProfile,
  groupPreview,
  joinGroup,
  leaveGroup,
  listMembers,
  myGroups,
  removeMember,
  setPart,
  setRole,
  updateGroup,
  updateProfile,
  type GroupSettings,
  type GroupType,
} from './domain/groups';
import {
  addToOrder,
  copyOrder,
  createEvent,
  deleteEvent,
  eventDetails,
  listEvents,
  listReplies,
  removeFromOrder,
  reply,
  setOrder,
  songHistory,
  updateEvent,
  type EventKind,
  type Reply,
} from './domain/events';
import {
  attendanceReport,
  attendanceSheet,
  checkIn,
  checkInCode,
  markAttendance,
  markRest,
  myAttendance,
  reportCsv,
  type AttendanceStatus,
} from './domain/attendance';
import { deleteNotice, listNotices, pinNotice, postNotice } from './domain/notices';
import { leaderTodo } from './domain/todo';
import { myPractice, partReadiness, practiceSummary, recordPlay, setKnowsPart } from './domain/practice';
import {
  addToRepertoire,
  deleteSong,
  editSong,
  getSong,
  listRepertoire,
  listSongs,
  prepareSheet,
  removeFromRepertoire,
  setSheet,
  shareSong,
  songForMe,
  type SongInput,
} from './domain/songs';
import { newId } from './domain/access';
import { scanAllowance, useScan } from './domain/scan';
import { checkImage, checkLine, partOf, readLine, readPage, scanningReady } from './scan';
import { AppError, badRequest, notFound } from './errors';

type App = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<App>().basePath('/api');

/* ---------- Open to everyone ---------- */

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare(`select count(*) as tables from sqlite_master where type = 'table'`).first<{ tables: number }>();
  return c.json({ ok: true, tables: row?.tables ?? 0 });
});

// Sign up, sign in, sign out, session: handled by Better Auth.
app.on(['GET', 'POST'], '/auth/*', (c) => getAuth(c.env).handler(c.req.raw));

app.get('/songs', async (c) =>
  c.json(
    await listSongs(c.env.DB, {
      query: c.req.query('q'),
      tag: c.req.query('tag'),
      playable: c.req.query('playable') === '1',
    }),
  ),
);
app.get('/songs/:id', async (c) => c.json(await getSong(c.env.DB, c.req.param('id'))));

/** The original sheet (PDF or photo). Public, like the song. */
app.get('/songs/:id/sheet', async (c) => {
  const song = await getSong(c.env.DB, c.req.param('id'));
  const file = song.sheet_key ? await c.env.SHEETS.get(song.sheet_key) : null;
  if (!file) throw notFound('This song has no original sheet attached.');
  const ext = song.sheet_key!.split('.').pop();
  const name = song.title.replace(/[^\w .-]+/g, '').trim() || 'sheet';
  return new Response(file.body, {
    headers: {
      'content-type': song.sheet_type ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${name}.${ext}"`,
      'cache-control': 'public, max-age=86400',
    },
  });
});

/* ---------- Signed in ---------- */

const signedIn = createMiddleware<App>(async (c, next) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new AppError(401, 'Sign in first.');
  c.set('userId', session.user.id);
  await next();
});

/** The JSON body as an object, or {} when there isn't one. */
async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => ({}));
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
const text = (b: Record<string, unknown>, key: string): string | undefined => (typeof b[key] === 'string' ? (b[key] as string) : undefined);
const flag = (b: Record<string, unknown>, key: string): boolean | undefined => (typeof b[key] === 'boolean' ? (b[key] as boolean) : undefined);
/** A voice part, or null for "not set" / "I don't sing". */
const part = (b: Record<string, unknown>): string | null => text(b, 'part')?.trim() || null;

/* ---------- Songs (signed in) ---------- */

function songInput(b: Record<string, unknown>): SongInput {
  return {
    title: text(b, 'title'),
    composer: text(b, 'composer'),
    doh: typeof b.doh === 'number' ? b.doh : undefined,
    time_signature: text(b, 'time_signature'),
    tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === 'string') : undefined,
    solfa: text(b, 'solfa'),
  };
}

app.post('/songs', signedIn, async (c) => {
  const b = await body(c);
  const song = await shareSong(c.env.DB, c.get('userId'), {
    ...songInput(b),
    title: text(b, 'title') ?? '',
    shared_from_group: text(b, 'shared_from_group') ?? null,
  });
  return c.json(song, 201);
});

app.patch('/songs/:id', signedIn, async (c) => c.json(await editSong(c.env.DB, c.get('userId'), c.req.param('id'), songInput(await body(c)))));

app.delete('/songs/:id', signedIn, async (c) => {
  const sheet = await deleteSong(c.env.DB, c.get('userId'), c.req.param('id'));
  if (sheet) await c.env.SHEETS.delete(sheet);
  return c.json({ ok: true });
});

/** What you can do with a song, and your own practice of it. */
app.get('/songs/:id/me', signedIn, async (c) => c.json(await songForMe(c.env.DB, c.get('userId'), c.req.param('id'))));

const SHEET_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_SHEET_BYTES = 10 * 1024 * 1024;

/** Attach or replace the original sheet. The body is the file; Content-Type says what it is. */
app.put('/songs/:id/sheet', signedIn, async (c) => {
  const songId = c.req.param('id');
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = SHEET_TYPES[type];
  if (!ext) throw badRequest('Attach a PDF, or a photo (JPEG, PNG or WebP).');
  if (Number(c.req.header('content-length') ?? 0) > MAX_SHEET_BYTES) throw badRequest('That file is over 10 MB. Try a smaller photo or PDF.');
  await prepareSheet(c.env.DB, c.get('userId'), songId);
  const file = await c.req.arrayBuffer();
  if (!file.byteLength) throw badRequest('That file is empty.');
  if (file.byteLength > MAX_SHEET_BYTES) throw badRequest('That file is over 10 MB. Try a smaller photo or PDF.');
  const key = `sheets/${songId}/${newId()}.${ext}`;
  await c.env.SHEETS.put(key, file, { httpMetadata: { contentType: type } });
  const old = await setSheet(c.env.DB, songId, key, type);
  if (old) await c.env.SHEETS.delete(old);
  return c.json(await getSong(c.env.DB, songId));
});

app.delete('/songs/:id/sheet', signedIn, async (c) => {
  const songId = c.req.param('id');
  await prepareSheet(c.env.DB, c.get('userId'), songId);
  const old = await setSheet(c.env.DB, songId, null, null);
  if (old) await c.env.SHEETS.delete(old);
  return c.json(await getSong(c.env.DB, songId));
});

/* ---------- Scanning sheets (src/scan.ts) ---------- */

const contentType = (c: { req: { header: (name: string) => string | undefined } }) => (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();

app.get('/scan/allowance', signedIn, async (c) => c.json(await scanAllowance(c.env.DB, c.get('userId'))));

/** Finds the lines of music on a page. The body is the picture; ?w= and ?h= give its size in pixels. */
app.post('/scan/page', signedIn, async (c) => {
  scanningReady(c.env);
  const width = Number(c.req.query('w'));
  const height = Number(c.req.query('h'));
  if (!(width >= 50 && height >= 50 && width <= 5000 && height <= 5000)) throw badRequest('Say how big the picture is (w and h, in pixels).');
  checkImage(contentType(c), Number(c.req.header('content-length') ?? 1) || 1);
  const image = await c.req.arrayBuffer();
  const type = checkImage(contentType(c), image.byteLength);
  await useScan(c.env.DB, c.get('userId'), 'page');
  return c.json(await readPage(c.env, image, type, Math.round(width), Math.round(height)));
});

/** Reads one line of music. The body is the picture; ?parts=S,A,T,B, and ?time= and ?key= when known. */
app.post('/scan/line', signedIn, async (c) => {
  scanningReady(c.env);
  const parts = (c.req.query('parts') ?? 'S')
    .split(',')
    .map((p) => partOf(p))
    .filter((p): p is string => !!p)
    .slice(0, 6);
  if (!parts.length) throw badRequest('Say which parts the line has (S, A, T, B or Solo).');
  const time = c.req.query('time');
  if (time && !/^\d{1,2}\/\d{1,2}$/.test(time)) throw badRequest('The time should look like 4/4.');
  const key = c.req.query('key');
  if (key && !/^[A-G][b#♭♯]?$/.test(key)) throw badRequest('The key should be a note name, like Ab.');
  checkImage(contentType(c), Number(c.req.header('content-length') ?? 1) || 1);
  const image = await c.req.arrayBuffer();
  const type = checkImage(contentType(c), image.byteLength);
  await useScan(c.env.DB, c.get('userId'), 'line');
  return c.json(await readLine(c.env, image, type, { parts, time: time || undefined, key: key || undefined }));
});

/** Checks a line Abụ's own model read (?draft=, the reading as text), with the line's picture as the body. */
app.post('/scan/check', signedIn, async (c) => {
  scanningReady(c.env);
  const parts = (c.req.query('parts') ?? 'S')
    .split(',')
    .map((p) => partOf(p))
    .filter((p): p is string => !!p)
    .slice(0, 6);
  if (!parts.length) throw badRequest('Say which parts the line has (S, A, T, B or Solo).');
  const draft = (c.req.query('draft') ?? '').slice(0, 4000);
  if (!draft.trim()) throw badRequest('Send the reading to check.');
  const time = c.req.query('time');
  if (time && !/^\d{1,2}\/\d{1,2}$/.test(time)) throw badRequest('The time should look like 4/4.');
  const key = c.req.query('key');
  if (key && !/^[A-G][b#♭♯]?$/.test(key)) throw badRequest('The key should be a note name, like Ab.');
  checkImage(contentType(c), Number(c.req.header('content-length') ?? 1) || 1);
  const image = await c.req.arrayBuffer();
  const type = checkImage(contentType(c), image.byteLength);
  await useScan(c.env.DB, c.get('userId'), 'line');
  return c.json(await checkLine(c.env, image, type, { parts, time: time || undefined, key: key || undefined, draft }));
});

/** Count a play-through (the player calls this at the end of a song). */
/** One play-through, counted on `day` (the phone's date, "2026-11-11") for the week and streak on Me. */
app.post('/songs/:id/plays', signedIn, async (c) => c.json(await recordPlay(c.env.DB, c.get('userId'), c.req.param('id'), text(await body(c), 'day'))));

/** "I know my part", on or off. */
app.put('/songs/:id/knows', signedIn, async (c) => {
  const knows = flag(await body(c), 'knows');
  if (knows === undefined) throw badRequest('Say whether you know your part.');
  await setKnowsPart(c.env.DB, c.get('userId'), c.req.param('id'), knows);
  return c.json({ ok: true });
});

app.use('/me', signedIn);
app.use('/me/*', signedIn);
app.use('/groups', signedIn);
app.use('/groups/*', signedIn);
app.use('/events/*', signedIn);
app.use('/notices/*', signedIn);

app.get('/me', async (c) => {
  const me = c.get('userId');
  return c.json({ profile: await getProfile(c.env.DB, me, me), groups: await myGroups(c.env.DB, me) });
});

app.patch('/me', async (c) => {
  const b = await body(c);
  return c.json(await updateProfile(c.env.DB, c.get('userId'), { display_name: text(b, 'display_name') }));
});

app.post('/groups', async (c) => {
  const b = await body(c);
  const group = await createGroup(c.env.DB, c.get('userId'), {
    name: text(b, 'name') ?? '',
    type: (text(b, 'type') ?? '') as Exclude<GroupType, 'personal'>,
    church: text(b, 'church'),
    town: text(b, 'town'),
    part: part(b),
  });
  return c.json(group, 201);
});

app.get('/groups/preview/:code', async (c) => c.json(await groupPreview(c.env.DB, c.req.param('code'))));

app.post('/groups/join', async (c) => {
  const b = await body(c);
  const code = text(b, 'code');
  if (!code?.trim()) throw badRequest('Enter the group’s code.');
  return c.json(await joinGroup(c.env.DB, c.get('userId'), code, part(b)));
});

app.get('/groups/:id', async (c) => c.json(await getGroup(c.env.DB, c.get('userId'), c.req.param('id'))));

app.patch('/groups/:id', async (c) => {
  const b = await body(c);
  const patch: GroupSettings = {
    name: text(b, 'name'),
    church: text(b, 'church'),
    town: text(b, 'town'),
    leader_title: text(b, 'leader_title'),
    requires_approval: flag(b, 'requires_approval'),
    self_check_in: flag(b, 'self_check_in'),
    part_leaders_edit_orders: flag(b, 'part_leaders_edit_orders'),
    sections: Array.isArray(b.sections) ? b.sections.filter((s): s is string => typeof s === 'string') : undefined,
  };
  return c.json(await updateGroup(c.env.DB, c.get('userId'), c.req.param('id'), patch));
});

app.get('/groups/:id/members', async (c) => c.json(await listMembers(c.env.DB, c.get('userId'), c.req.param('id'))));

app.post('/groups/:id/members/:userId/approve', async (c) => {
  await approveMember(c.env.DB, c.get('userId'), c.req.param('id'), c.req.param('userId'));
  return c.json({ ok: true });
});

/** Change a member's role (leaders) or part (yourself, or leaders for anyone). */
app.patch('/groups/:id/members/:userId', async (c) => {
  const b = await body(c);
  const [me, groupId, userId] = [c.get('userId'), c.req.param('id'), c.req.param('userId')];
  const role = text(b, 'role');
  if (role !== undefined) {
    if (!['leader', 'part_leader', 'member'].includes(role)) throw badRequest('Choose leader, part leader or member.');
    await setRole(c.env.DB, me, groupId, userId, role as Role);
  }
  if ('part' in b) await setPart(c.env.DB, me, groupId, userId, part(b));
  return c.json({ ok: true });
});

/** Leave the group (your own id) or, for leaders, remove someone. */
app.delete('/groups/:id/members/:userId', async (c) => {
  const [me, groupId, userId] = [c.get('userId'), c.req.param('id'), c.req.param('userId')];
  if (userId === me) await leaveGroup(c.env.DB, me, groupId);
  else await removeMember(c.env.DB, me, groupId, userId);
  return c.json({ ok: true });
});

app.get('/me/practice', async (c) => c.json(await myPractice(c.env.DB, c.get('userId'))));
/** Your week, streak and songs you know; `today` is the phone's date. */
app.get('/me/practice/summary', async (c) => c.json(await practiceSummary(c.env.DB, c.get('userId'), c.req.query('today'))));

/** "Our repertoire" (or "My songs" in your own space). */
app.get('/groups/:id/repertoire', async (c) => c.json(await listRepertoire(c.env.DB, c.get('userId'), c.req.param('id'))));
app.post('/groups/:id/repertoire', async (c) => {
  const songId = text(await body(c), 'song_id');
  if (!songId) throw badRequest('Choose a song.');
  await addToRepertoire(c.env.DB, c.get('userId'), c.req.param('id'), songId);
  return c.json({ ok: true });
});
app.delete('/groups/:id/repertoire/:songId', async (c) => {
  await removeFromRepertoire(c.env.DB, c.get('userId'), c.req.param('id'), c.req.param('songId'));
  return c.json({ ok: true });
});

/* ---------- Schedule: services, rehearsals, concerts and their song orders ---------- */

const kind = (b: Record<string, unknown>): EventKind | undefined => text(b, 'kind') as EventKind | undefined;

app.get('/groups/:id/events', async (c) =>
  c.json(await listEvents(c.env.DB, c.get('userId'), c.req.param('id'), { from: c.req.query('from'), to: c.req.query('to') })),
);

app.post('/groups/:id/events', async (c) => {
  const b = await body(c);
  const event = await createEvent(c.env.DB, c.get('userId'), c.req.param('id'), {
    kind: kind(b) ?? ('' as EventKind),
    title: text(b, 'title') ?? '',
    startsAt: text(b, 'starts_at') ?? '',
    venue: text(b, 'venue'),
    note: text(b, 'note'),
    repeatWeeks: typeof b.repeat_weeks === 'number' ? b.repeat_weeks : 0,
  });
  return c.json(event, 201);
});

/** When each song was last sung, for "last sung 3 weeks ago" while planning. */
app.get('/groups/:id/song-history', async (c) => c.json(await songHistory(c.env.DB, c.get('userId'), c.req.param('id'))));

app.get('/events/:id', async (c) => c.json(await eventDetails(c.env.DB, c.get('userId'), c.req.param('id'))));

app.patch('/events/:id', async (c) => {
  const b = await body(c);
  return c.json(
    await updateEvent(c.env.DB, c.get('userId'), c.req.param('id'), {
      kind: kind(b),
      title: text(b, 'title'),
      startsAt: text(b, 'starts_at'),
      venue: text(b, 'venue'),
      note: text(b, 'note'),
    }),
  );
});

app.delete('/events/:id', async (c) => {
  await deleteEvent(c.env.DB, c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

app.post('/events/:id/items', async (c) => {
  const b = await body(c);
  const songId = text(b, 'song_id');
  if (!songId) throw badRequest('Choose a song.');
  return c.json(await addToOrder(c.env.DB, c.get('userId'), c.req.param('id'), { songId, section: text(b, 'section') }), 201);
});

app.delete('/events/:id/items/:itemId', async (c) => {
  await removeFromOrder(c.env.DB, c.get('userId'), c.req.param('itemId'));
  return c.json({ ok: true });
});

/** The whole order, top to bottom, each song with its section. */
app.put('/events/:id/order', async (c) => {
  const b = await body(c);
  const items = Array.isArray(b.items)
    ? b.items
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({ id: String(i.id ?? ''), section: typeof i.section === 'string' ? i.section : '' }))
    : null;
  if (!items) throw badRequest('Send the order as a list.');
  return c.json(await setOrder(c.env.DB, c.get('userId'), c.req.param('id'), items));
});

app.post('/events/:id/copy-order', async (c) => {
  const from = text(await body(c), 'from_event_id');
  if (!from) throw badRequest('Choose which service to copy from.');
  return c.json(await copyOrder(c.env.DB, c.get('userId'), c.req.param('id'), from));
});

app.put('/events/:id/reply', async (c) => {
  const status = text(await body(c), 'status') as Reply | undefined;
  await reply(c.env.DB, c.get('userId'), c.req.param('id'), status ?? ('' as Reply));
  return c.json({ ok: true });
});

app.get('/events/:id/replies', async (c) => c.json(await listReplies(c.env.DB, c.get('userId'), c.req.param('id'))));

/** How ready each part is: totals only, for leaders and part leaders. */
app.get('/events/:id/readiness', async (c) => c.json(await partReadiness(c.env.DB, c.get('userId'), c.req.param('id'))));

/* ---------- Attendance ---------- */

/** The register for one service or rehearsal: everyone, their reply and mark (leaders and part leaders). */
app.get('/events/:id/attendance', async (c) => c.json(await attendanceSheet(c.env.DB, c.get('userId'), c.req.param('id'))));

/** Mark one person present, absent or excused. */
app.put('/events/:id/attendance/:userId', async (c) => {
  const status = text(await body(c), 'status') as AttendanceStatus | undefined;
  await markAttendance(c.env.DB, c.get('userId'), c.req.param('id'), c.req.param('userId'), status ?? ('' as AttendanceStatus));
  return c.json({ ok: true });
});

/** Mark everyone not marked yet as present or absent; "Can't come" replies become excused. */
app.post('/events/:id/attendance/rest', async (c) => {
  const status = text(await body(c), 'status') as 'present' | 'absent' | undefined;
  return c.json({ marked: await markRest(c.env.DB, c.get('userId'), c.req.param('id'), status ?? ('' as 'present')) });
});

/** The 4-digit code to show at the rehearsal (leaders and part leaders). */
app.get('/events/:id/check-in-code', async (c) => c.json({ code: await checkInCode(c.env.DB, c.get('userId'), c.req.param('id')) }));

/** Check yourself in with the code: "present", "wrong_code" or "locked" (after five wrong codes). */
app.post('/events/:id/check-in', async (c) => {
  const code = text(await body(c), 'code') ?? '';
  return c.json({ result: await checkIn(c.env.DB, c.get('userId'), c.req.param('id'), code) });
});

/** Your own attendance in a group, seen only by you. */
app.get('/groups/:id/my-attendance', async (c) => c.json(await myAttendance(c.env.DB, c.get('userId'), c.req.param('id'))));

/** Rates and the register by member, part and month (leaders and part leaders). */
const reportRange = (c: { req: { query: (k: string) => string | undefined } }) => ({
  from: c.req.query('from'),
  to: c.req.query('to'),
  tz: c.req.query('tz') === undefined ? undefined : Number(c.req.query('tz')),
});

app.get('/groups/:id/attendance', async (c) => c.json(await attendanceReport(c.env.DB, c.get('userId'), c.req.param('id'), reportRange(c))));

/** The same register as a spreadsheet to download. */
app.get('/groups/:id/attendance.csv', async (c) => {
  const report = await attendanceReport(c.env.DB, c.get('userId'), c.req.param('id'), reportRange(c));
  const name = `abu-attendance-${report.from.slice(0, 10)}-to-${report.to.slice(0, 10)}.csv`;
  // The byte order mark makes Excel read names like "Ọkafor" correctly.
  return c.body(`\uFEFF${reportCsv(report)}`, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${name}"`,
    'cache-control': 'private, no-store',
  });
});

/* ---------- The leader's To do ---------- */

/** What needs doing now, most urgent first (leaders; part leaders for their part). */
app.get('/groups/:id/todo', async (c) => c.json(await leaderTodo(c.env.DB, c.get('userId'), c.req.param('id'))));

/* ---------- Notices ---------- */

/** Pinned first, then newest. Everyone in the group reads them all; Home picks yours. */
app.get('/groups/:id/notices', async (c) => c.json(await listNotices(c.env.DB, c.get('userId'), c.req.param('id'))));

/** Leaders and part leaders post, to everyone or to one part (`part`). */
app.post('/groups/:id/notices', async (c) => {
  const b = await body(c);
  return c.json(await postNotice(c.env.DB, c.get('userId'), c.req.param('id'), text(b, 'body') ?? '', part(b)), 201);
});

/** Leaders pin or unpin. */
app.put('/notices/:id/pin', async (c) => {
  await pinNotice(c.env.DB, c.get('userId'), c.req.param('id'), flag(await body(c), 'pinned') ?? true);
  return c.json({ ok: true });
});

/** Whoever posted it, or a leader. */
app.delete('/notices/:id', async (c) => {
  await deleteNotice(c.env.DB, c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

/* ---------- Errors ---------- */

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong. Try again.' }, 500);
});

export default app;
