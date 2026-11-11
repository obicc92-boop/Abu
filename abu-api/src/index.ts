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
import { myPractice, partReadiness, recordPlay, setKnowsPart } from './domain/practice';
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

/** Count a play-through (the player calls this at the end of a song). */
app.post('/songs/:id/plays', signedIn, async (c) => c.json(await recordPlay(c.env.DB, c.get('userId'), c.req.param('id'))));

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

/* ---------- Errors ---------- */

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong. Try again.' }, 500);
});

export default app;
