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
import { getSong, listSongs } from './domain/songs';
import { AppError, badRequest } from './errors';

type App = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<App>().basePath('/api');

/* ---------- Open to everyone ---------- */

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare(`select count(*) as tables from sqlite_master where type = 'table'`).first<{ tables: number }>();
  return c.json({ ok: true, tables: row?.tables ?? 0 });
});

// Sign up, sign in, sign out, session: handled by Better Auth.
app.on(['GET', 'POST'], '/auth/*', (c) => getAuth(c.env).handler(c.req.raw));

app.get('/songs', async (c) => c.json(await listSongs(c.env.DB, { query: c.req.query('q') })));
app.get('/songs/:id', async (c) => c.json(await getSong(c.env.DB, c.req.param('id'))));

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

app.use('/me', signedIn);
app.use('/me/*', signedIn);
app.use('/groups', signedIn);
app.use('/groups/*', signedIn);

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

/* ---------- Errors ---------- */

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong. Try again.' }, 500);
});

export default app;
