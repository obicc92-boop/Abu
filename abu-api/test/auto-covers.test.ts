/**
 * Covers made by AI without anyone asking (src/auto-covers.ts): a song without a cover gets one, once, never over a
 * picture someone chose; a failed try waits before the next; the daily allowance holds; collections get theirs only
 * for the tags the app suggests; and a visit to Home starts only a few. The AI is never reached: `coverMaker.make`
 * is replaced.
 */
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { autoCoverSong, autoCoverTag, coverWhatHomeShowed, knownTag, PER_VISIT, RETRY_HOURS } from '../src/auto-covers';
import { coverMaker, sceneWriter } from '../src/covers';
import type { HomeFeed } from '../src/domain/home';
import { call, send, signUp } from './helpers';

const GOOD = 'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God on high';
/** What the replaced AI gives back: a JPEG's first bytes. */
const MADE = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 7, 7, 7]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

let make: MockInstance<typeof coverMaker.make>;
let scene: MockInstance<typeof sceneWriter.write>;
beforeEach(() => {
  make = vi.spyOn(coverMaker, 'make').mockResolvedValue(MADE);
  scene = vi.spyOn(sceneWriter, 'write').mockResolvedValue('a village lit by lanterns');
});
afterEach(() => {
  vi.restoreAllMocks();
});

const today = () => new Date().toISOString().slice(0, 10);

async function songOf(cookie: string, title: string, tags: string[] = []) {
  const res = await send<{ id: string }>('/songs', 'POST', cookie, { title, composer: 'Test Composer', tags, solfa: GOOD, audience: 'everyone' });
  expect(res.status).toBe(201);
  return res.body.id;
}

const coverOf = (id: string) =>
  env.DB.prepare('select cover_key, cover_source, cover_tried_at from songs where id = ?').bind(id).first<{ cover_key: string | null; cover_source: string | null; cover_tried_at: string | null }>();

describe('A song without a cover', () => {
  it('gets one made by AI, once, from its title and tags, counted in the day’s allowance', async () => {
    const ada = await signUp('Ada Obi');
    const id = await songOf(ada.cookie, 'Ekeresimesi Elutego', ['Christmas', 'Igbo']);
    const before = (await env.DB.prepare('select coalesce(sum(made), 0) as n from auto_cover_days where day = ?').bind(today()).first<{ n: number }>())!.n;
    expect(await autoCoverSong(env, id)).toBe(true);
    const song = await coverOf(id);
    expect(song?.cover_source).toBe('ai');
    expect(song?.cover_key).toMatch(new RegExp(`^covers/${id}/[\\w-]+\\.jpg$`));
    expect(await env.COVERS.get(song!.cover_key!)).not.toBeNull();
    expect(make).toHaveBeenCalledTimes(1);
    expect(scene.mock.calls[0][1]).toMatchObject({ title: 'Ekeresimesi Elutego', tags: ['Christmas', 'Igbo'] });
    const prompt = make.mock.calls[0][1];
    expect(prompt).toContain('a village lit by lanterns');
    expect(prompt).not.toContain('Ekeresimesi');
    expect(prompt).toMatch(/starry night/);
    expect(prompt).toMatch(/West African textile/);
    const after = (await env.DB.prepare('select made from auto_cover_days where day = ?').bind(today()).first<{ made: number }>())!.made;
    expect(after).toBe(before + 1);
    // It has one now: nothing more is made.
    expect(await autoCoverSong(env, id)).toBe(false);
    expect(make).toHaveBeenCalledTimes(1);
    // Served like any cover.
    const served = await call(`/${song!.cover_key}`);
    expect(served.status).toBe(200);
  });

  it('never replaces a picture someone chose, even one chosen while the AI was at work', async () => {
    const ada = await signUp('Ada Obi');
    const chosen = await songOf(ada.cookie, 'Chosen First');
    const put = await call(`/songs/${chosen}/cover`, { method: 'PUT', cookie: ada.cookie, body: JPEG, headers: { 'content-type': 'image/jpeg' } });
    expect(put.status).toBe(200);
    expect(await autoCoverSong(env, chosen)).toBe(false);
    expect(make).not.toHaveBeenCalled();
    expect((await coverOf(chosen))?.cover_source).toBe('upload');

    // A picture chosen while the AI paints: the AI's is thrown away.
    const racing = await songOf(ada.cookie, 'Chosen Meanwhile');
    make.mockImplementationOnce(async () => {
      await call(`/songs/${racing}/cover`, { method: 'PUT', cookie: ada.cookie, body: JPEG, headers: { 'content-type': 'image/jpeg' } });
      return MADE;
    });
    expect(await autoCoverSong(env, racing)).toBe(false);
    const after = await coverOf(racing);
    expect(after?.cover_source).toBe('upload');
    const kept = await env.COVERS.list({ prefix: `covers/${racing}/` });
    expect(kept.objects.map((o) => o.key)).toEqual([after!.cover_key]);
  });

  it('isn’t made again for a song whose cover someone took away', async () => {
    const ada = await signUp('Ada Obi');
    const id = await songOf(ada.cookie, 'Taken Away');
    expect(await autoCoverSong(env, id)).toBe(true);
    const removed = await call(`/songs/${id}/cover`, { method: 'DELETE', cookie: ada.cookie });
    expect(removed.status).toBe(200);
    expect(await autoCoverSong(env, id)).toBe(false);
    expect(make).toHaveBeenCalledTimes(1);
    // Asking for one still works.
    expect((await send(`/songs/${id}/cover/make`, 'POST', ada.cookie, {})).status).toBe(200);
  });

  it('waits before trying again after the AI failed', async () => {
    const ada = await signUp('Ada Obi');
    const id = await songOf(ada.cookie, 'Tried Before');
    make.mockRejectedValueOnce(new Error('busy'));
    expect(await autoCoverSong(env, id)).toBe(false);
    expect((await coverOf(id))?.cover_key).toBeNull();
    // Straight away: not tried again.
    expect(await autoCoverSong(env, id)).toBe(false);
    expect(make).toHaveBeenCalledTimes(1);
    // Long enough after: tried again.
    const long = new Date(Date.now() - (RETRY_HOURS + 1) * 3600_000).toISOString();
    await env.DB.prepare('update songs set cover_tried_at = ? where id = ?').bind(long, id).run();
    expect(await autoCoverSong(env, id)).toBe(true);
  });

  it('isn’t made once the day’s allowance for everyone is used up', async () => {
    const ada = await signUp('Ada Obi');
    const id = await songOf(ada.cookie, 'Too Late Today');
    const made = (await env.DB.prepare('select made from auto_cover_days where day = ?').bind(today()).first<{ made: number }>())?.made ?? 0;
    await env.DB.prepare('insert into auto_cover_days (day, made) values (?, 200) on conflict (day) do update set made = 200').bind(today()).run();
    expect(await autoCoverSong(env, id)).toBe(false);
    expect(make).not.toHaveBeenCalled();
    // And people asking for one are refused too: they share the allowance.
    const asked = await send(`/songs/${id}/cover/make`, 'POST', ada.cookie, {});
    expect(asked.status).toBe(429);
    await env.DB.prepare('update auto_cover_days set made = ? where day = ?').bind(made, today()).run();
  });
});

describe('A collection', () => {
  it('gets its own cover for a tag the app suggests, once, and Home gives it', async () => {
    const ada = await signUp('Ada Obi');
    await songOf(ada.cookie, 'Carol One', ['Advent']);
    await songOf(ada.cookie, 'Carol Two', ['advent']);
    expect(await autoCoverTag(env, 'advent')).toBe(true);
    expect(scene.mock.calls[0][1]).toMatchObject({ title: 'Advent' });
    expect(scene.mock.calls[0][3]).toBe(true);
    expect(make.mock.calls[0][1]).toMatch(/candles/);
    expect(await autoCoverTag(env, 'Advent')).toBe(false);
    const feed = (await send<HomeFeed>('/home', 'GET', undefined)).body;
    const advent = feed.collections.find((c) => c.tag.toLowerCase() === 'advent');
    expect(advent?.cover_key).toMatch(/^covers\/tag-advent\/[\w-]+\.jpg$/);
    expect((await call(`/${advent!.cover_key}`)).status).toBe(200);
  });

  it('gets none for a tag someone typed that the app doesn’t suggest', async () => {
    expect(knownTag('christmas')).toBe('Christmas');
    expect(knownTag('Anything Goes')).toBeNull();
    expect(await autoCoverTag(env, 'Anything Goes')).toBe(false);
    expect(make).not.toHaveBeenCalled();
  });
});

describe('A visit to Home', () => {
  const feedWith = (ids: string[], tags: string[]): HomeFeed => ({
    tags: [],
    trending: ids.map((id) => ({ id, title: id, composer: '', doh: 0, time_signature: '4/4', tags: [], solfa: GOOD, cover_key: null, audience: 'everyone', plays: 0 })),
    newest: [],
    recent: [],
    discover: [],
    collections: tags.map((tag) => ({ tag, songs: 2, cover_key: null, covers: [] })),
    composers: [],
  });

  it('starts covers for only a few of the songs and collections it showed', async () => {
    const ada = await signUp('Ada Obi');
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await songOf(ada.cookie, `Visit Song ${i}`));
    await coverWhatHomeShowed({ ...env, AUTO_COVERS: 'on' } as Env, feedWith(ids, ['Lent', 'Pentecost']));
    const covered = await Promise.all(ids.map(async (id) => !!(await coverOf(id))?.cover_key));
    expect(covered.filter(Boolean)).toHaveLength(PER_VISIT.songs);
    expect(make).toHaveBeenCalledTimes(PER_VISIT.songs + PER_VISIT.collections);
  });

  it('starts none while AUTO_COVERS is off', async () => {
    const ada = await signUp('Ada Obi');
    const id = await songOf(ada.cookie, 'Left Alone');
    await coverWhatHomeShowed(env, feedWith([id], ['Marian']));
    expect(make).not.toHaveBeenCalled();
  });
});
