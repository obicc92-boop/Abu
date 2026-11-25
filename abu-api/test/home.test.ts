/**
 * Home's feed over HTTP: above all that a song someone can't see never shows in any part of it, nor counts; then
 * trending, newest, recent and discover in their order, the tag filter, collections and composers; and the plays a
 * day each song gets, everyone's together, that trending counts.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { HomeFeed, HomeSong } from '../src/domain/home';
import { call, send, signUp } from './helpers';

const GOOD = 'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God on high';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

async function choir() {
  const emeka = await signUp('Emeka Nwosu');
  const group = (await send<{ id: string; invite_code: string }>('/groups', 'POST', emeka.cookie, { name: "St. Mary's Choir", type: 'catholic', part: 'B' })).body;
  const adaeze = await signUp('Adaeze Obi');
  await send('/groups/join', 'POST', adaeze.cookie, { code: group.invite_code, part: 'A' });
  const tobi = await signUp('Tobi Adeyemi');
  return { emeka, adaeze, tobi, group };
}

/** A word no other test uses, for tags, titles and composers. */
const unique = (word: string) => `${word}${crypto.randomUUID().slice(0, 8)}`;

async function share(cookie: string, song: Record<string, unknown>) {
  const res = await send<{ id: string }>('/songs', 'POST', cookie, { solfa: GOOD, ...song });
  expect(res.status).toBe(201);
  return res.body.id;
}
const play = (songId: string, cookie: string, day?: string) => send(`/songs/${songId}/plays`, 'POST', cookie, day ? { day } : {});
const cover = (songId: string, cookie: string) => call(`/songs/${songId}/cover`, { method: 'PUT', cookie, headers: { 'content-type': 'image/jpeg' }, body: JPEG });

async function home(cookie?: string, tag?: string): Promise<HomeFeed> {
  const res = await send<HomeFeed>(`/home${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`, 'GET', cookie);
  expect(res.status).toBe(200);
  return res.body;
}
const ids = (songs: HomeSong[]) => songs.map((s) => s.id);
/** Every song id anywhere in the feed. */
const everyId = (f: HomeFeed) => [
  ...[f.trending, f.newest, f.recent, f.discover].flatMap(ids),
  ...f.collections.flatMap((c) => c.covers.map((s) => s.id)),
  ...f.composers.map((c) => c.cover.id),
];

describe('Who sees what on Home', () => {
  it('never shows a song only its sharer or its group can see to anyone else, in any part of the feed, nor counts it', async () => {
    const { emeka, adaeze, tobi, group } = await choir();
    // Words only on the hidden songs, and a tag and a composer they share with one song open to everyone.
    const hidden = unique('Hidden');
    const shared = unique('Shared');
    const composer = unique('Composer');
    const mine = await share(emeka.cookie, { title: `${hidden} mine`, composer, tags: [hidden, shared], audience: 'me' });
    const ours = await share(emeka.cookie, { title: `${hidden} ours`, composer, tags: [hidden, shared], audience: 'group', shared_from_group: group.id });
    const open = await share(emeka.cookie, { title: 'Open to all', composer, tags: [shared] });
    // Covers and plays that would put the hidden songs first everywhere.
    for (const id of [mine, ours]) {
      expect((await cover(id, emeka.cookie)).status).toBe(200);
      for (let n = 0; n < 3; n++) await play(id, emeka.cookie);
    }
    await play(ours, adaeze.cookie);

    for (const viewer of [tobi.cookie, undefined]) {
      for (const tag of [undefined, shared, hidden, hidden.toUpperCase()]) {
        const feed = await home(viewer, tag);
        expect(everyId(feed)).not.toContain(mine);
        expect(everyId(feed)).not.toContain(ours);
        expect(JSON.stringify(feed)).not.toContain(hidden);
        expect(JSON.stringify(feed).toLowerCase()).not.toContain(hidden.toLowerCase());
      }
      const all = await home(viewer);
      // The shared tag and the composer count only the open song: no collection of one, the open song as the picture.
      expect(all.tags.find((t) => t.tag === shared)).toEqual({ tag: shared, songs: 1 });
      expect(all.collections.find((c) => c.tag === shared)).toBeUndefined();
      expect(all.composers.find((c) => c.name === composer)).toEqual({ name: composer, songs: 1, cover: { id: open, title: 'Open to all', cover_key: null } });
      expect(all.recent).toEqual([]);
      const one = await home(viewer, shared);
      expect([one.trending, one.newest, one.discover].map(ids)).toEqual([[open], [open], [open]]);
      expect(one.collections).toEqual([]);
      const none = await home(viewer, hidden);
      expect([none.trending, none.newest, none.recent, none.discover, none.collections, none.composers]).toEqual([[], [], [], [], [], []]);
    }

    // Adaeze is in the group: she sees its song, never Emeka's own.
    const member = await home(adaeze.cookie);
    expect(everyId(member)).toContain(ours);
    expect(everyId(member)).not.toContain(mine);
    expect(ids(member.recent)).toEqual([ours]);
    expect(member.tags.find((t) => t.tag === shared)?.songs).toBe(2);
    expect(member.tags.find((t) => t.tag === hidden)?.songs).toBe(1);
    expect(member.collections.find((c) => c.tag === shared)?.covers.map((s) => s.id)).toEqual([ours, open]);
    expect(member.composers.find((c) => c.name === composer)).toMatchObject({ songs: 2, cover: { id: ours } });
    // Everyone's plays together, but only of songs she can see.
    expect(member.trending.find((s) => s.id === ours)?.plays).toBe(4);

    // Emeka sees all three.
    const sharer = await home(emeka.cookie, shared);
    expect(ids(sharer.newest)).toEqual([open, ours, mine]);
    expect(sharer.composers).toMatchObject([{ name: composer, songs: 3 }]);
    expect((await home(emeka.cookie)).collections.find((c) => c.tag === hidden)?.songs).toBe(2);

    // A song she played that she can no longer see leaves her feed too.
    expect((await send(`/songs/${ours}`, 'PATCH', emeka.cookie, { audience: 'me' })).status).toBe(200);
    const after = await home(adaeze.cookie);
    expect(everyId(after)).not.toContain(ours);
    expect(after.recent).toEqual([]);
    expect(after.tags.find((t) => t.tag === hidden)).toBeUndefined();
  });
});

describe('Home’s shelves', () => {
  it('orders trending by the last two weeks’ plays, then all time, then newest; newest, recent and discover; and filters by tag', async () => {
    // Emeka shares the songs and hasn't played any; Adaeze plays them.
    const [emeka, adaeze] = [await signUp('Emeka Nwosu'), await signUp('Adaeze Obi')];
    const tag = unique('Shelf');
    const s1 = await share(emeka.cookie, { title: 'One', tags: [tag] });
    const s2 = await share(emeka.cookie, { title: 'Two', tags: [tag] });
    const s3 = await share(emeka.cookie, { title: 'Three', tags: [tag] });
    const s4 = await share(emeka.cookie, { title: 'Sheet only', tags: [tag], solfa: '  \n\n ' });
    const s5 = await share(emeka.cookie, { title: 'Five', tags: [tag] });
    const other = await share(emeka.cookie, { title: 'Another tag', tags: [unique('Other')] });

    // Three played long ago (all time only), then One once and Two three times now.
    await play(s3, adaeze.cookie, '2025-01-05');
    await play(s3, adaeze.cookie, '2025-01-06');
    await play(s1, adaeze.cookie);
    for (let n = 0; n < 3; n++) await play(s2, adaeze.cookie);

    const hers = await home(adaeze.cookie, tag);
    expect(ids(hers.trending)).toEqual([s2, s1, s3, s5]);
    expect(hers.trending.map((s) => s.plays)).toEqual([3, 1, 0, 0]);
    expect(ids(hers.newest)).toEqual([s5, s4, s3, s2, s1]);
    expect(hers.newest.find((s) => s.id === s4)?.plays).toBe(0);
    expect(ids(hers.recent)).toEqual([s2, s1, s3]);
    expect(ids(hers.discover)).toEqual([s5]);
    expect(hers.collections).toEqual([]);
    for (const shelf of [hers.trending, hers.newest, hers.recent, hers.discover]) expect(ids(shelf)).not.toContain(other);
    expect(hers.trending[0]).toMatchObject({ id: s2, title: 'Two', composer: '', doh: 0, time_signature: '4/4', tags: [tag], solfa: GOOD, cover_key: null, audience: 'everyone' });

    // Someone who hasn't played any: discover is trending; signed out the same, with nothing recent.
    const his = await home(emeka.cookie, tag);
    expect(ids(his.discover)).toEqual([s2, s1, s3, s5]);
    expect(his.recent).toEqual([]);
    const out = await home(undefined, tag.toUpperCase());
    expect(ids(out.trending)).toEqual([s2, s1, s3, s5]);
    expect(ids(out.discover)).toEqual([s2, s1, s3, s5]);
    expect(out.recent).toEqual([]);

    // Plays by everyone count together; a play dated well ahead doesn't count for trending.
    for (let n = 0; n < 3; n++) await play(s1, emeka.cookie);
    await play(s5, emeka.cookie, '2099-01-01');
    const now = await home(undefined, tag);
    expect(ids(now.trending)).toEqual([s1, s2, s3, s5]);
    expect(now.trending.map((s) => s.plays)).toEqual([4, 3, 0, 0]);
    expect(ids((await home(emeka.cookie, tag)).discover)).toEqual([s2, s3]);

    // Without a tag, the other song is there too.
    expect(ids((await home(adaeze.cookie)).newest)).toContain(other);
  });

  it('gathers collections by tag and composers, those with covers first, skipping nobody-in-particular', async () => {
    const emeka = await signUp('Emeka Nwosu');
    const tag = unique('Collect');
    const lonely = unique('Lonely');
    const composer = unique('Handel');
    const first = await share(emeka.cookie, { title: 'First', tags: [tag], composer });
    const songs = [first];
    for (const title of ['Second', 'Third', 'Fourth', 'Fifth']) songs.push(await share(emeka.cookie, { title, tags: [tag.toLowerCase()], composer: ` ${composer.toUpperCase()} ` }));
    await share(emeka.cookie, { title: 'Alone', tags: [lonely], composer });
    for (const nobody of ['Anon', 'anonymous', 'Unknown', '']) await share(emeka.cookie, { title: `By ${nobody || 'nobody'}`, tags: [tag], composer: nobody });
    expect((await cover(first, emeka.cookie)).status).toBe(200);

    const feed = await home(emeka.cookie);
    // One collection whatever the case: 9 songs; the one with a cover first, then the newest.
    const collection = feed.collections.find((c) => c.tag.toLowerCase() === tag.toLowerCase())!;
    expect(collection.songs).toBe(9);
    expect(collection.covers).toHaveLength(4);
    expect(collection.covers[0]).toMatchObject({ id: first, title: 'First' });
    expect(collection.covers[0].cover_key).toMatch(new RegExp(`^covers/${first}/`));
    expect(feed.collections.find((c) => c.tag === lonely)).toBeUndefined();
    expect(feed.tags.find((t) => t.tag === lonely)).toEqual({ tag: lonely, songs: 1 });
    expect(feed.tags.find((t) => t.tag.toLowerCase() === tag.toLowerCase())?.songs).toBe(9);

    // One composer whatever the case and spaces: 6 songs, the one with a cover as the picture.
    const theirs = feed.composers.filter((c) => c.name.toLowerCase() === composer.toLowerCase());
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ songs: 6, cover: { id: first, title: 'First' } });
    for (const nobody of ['anon', 'anonymous', 'unknown', '']) expect(feed.composers.map((c) => c.name.toLowerCase())).not.toContain(nobody);

    // Within the tag: the composer's songs with that tag only, and no collections.
    const within = await home(emeka.cookie, tag);
    expect(within.composers).toMatchObject([{ songs: 5, cover: { id: first } }]);
    expect(within.collections).toEqual([]);
    expect(within.tags).toEqual(feed.tags);
  });
});

describe('Plays for trending', () => {
  it('counts each song’s plays a day, everyone’s together, on the day each was played', async () => {
    const [emeka, adaeze] = [await signUp('Emeka Nwosu'), await signUp('Adaeze Obi')];
    const song = await share(emeka.cookie, { title: 'Counted' });
    await play(song, adaeze.cookie, '2026-11-20');
    await play(song, adaeze.cookie, '2026-11-20');
    await play(song, emeka.cookie, '2026-11-20');
    await play(song, adaeze.cookie, '2026-11-21');
    const { results } = await env.DB.prepare('select day, plays from song_days where song_id = ? order by day').bind(song).all();
    expect(results).toEqual([
      { day: '2026-11-20', plays: 3 },
      { day: '2026-11-21', plays: 1 },
    ]);
    // A play with no day counts on today (UTC), as for your own week.
    await play(song, emeka.cookie);
    const today = new Date().toISOString().slice(0, 10);
    expect(await env.DB.prepare('select plays from song_days where song_id = ? and day = ?').bind(song, today).first('plays')).toBe(1);
    // Your own practice is still counted as before.
    expect((await send<{ plays: number }>(`/songs/${song}/me`, 'GET', adaeze.cookie)).body.plays).toBe(3);
  });
});
