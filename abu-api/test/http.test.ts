/** The Worker's HTTP side: what the app and the website can call today. */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { ensureUser } from '../src/domain/groups';
import { shareSong } from '../src/domain/songs';

describe('API', () => {
  it('reports health with the database tables in place', async () => {
    const res = await SELF.fetch('https://abu.test/api/health');
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; tables: number }>();
    expect(body.ok).toBe(true);
    expect(body.tables).toBeGreaterThanOrEqual(13);
  });

  it('lists and finds public songs without signing in', async () => {
    await ensureUser(env.DB, { id: 'http-user', name: 'Tester' });
    const song = await shareSong(env.DB, 'http-user', { title: 'Amazing Grace', doh: 7, time_signature: '3/4' });
    const list = await (await SELF.fetch('https://abu.test/api/songs?q=grace')).json<{ id: string }[]>();
    expect(list.map((s) => s.id)).toContain(song.id);
    const one = await SELF.fetch(`https://abu.test/api/songs/${song.id}`);
    expect(await one.json()).toMatchObject({ title: 'Amazing Grace', doh: 7, tags: [] });
  });

  it('answers unknown songs and paths with a 404 and a readable message', async () => {
    const missing = await SELF.fetch('https://abu.test/api/songs/nope');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'That song doesn’t exist.' });
    expect((await SELF.fetch('https://abu.test/api/nothing-here')).status).toBe(404);
  });
});
