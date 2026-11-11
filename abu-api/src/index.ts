/**
 * The "abu" Worker. Pages and files of the web app are served straight from
 * static assets (see wrangler.jsonc); only /api/* runs this code.
 *
 * Milestone 1 exposes what needs no sign-in: a health check and the public
 * song library. The rest of src/domain gets routes with sign-in (milestone 2).
 */
import { Hono } from 'hono';

import { getSong, listSongs } from './domain/songs';
import { AppError } from './errors';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare(`select count(*) as tables from sqlite_master where type = 'table' and name not like '\\_%' escape '\\'`).first<{
    tables: number;
  }>();
  return c.json({ ok: true, tables: row?.tables ?? 0 });
});

app.get('/songs', async (c) => c.json(await listSongs(c.env.DB, { query: c.req.query('q') })));
app.get('/songs/:id', async (c) => c.json(await getSong(c.env.DB, c.req.param('id'))));

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong. Try again.' }, 500);
});

export default app;
