/**
 * Song covers over HTTP: a picture chosen by whoever can edit the song, or one made by AI, the daily allowance for
 * those, serving them, and what the AI is asked for. The AI is never reached: `coverMaker.make` is replaced.
 */
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { COVER_MODEL, coverMaker, coverPrompt, smaller } from '../src/covers';
import { call, send, signUp } from './helpers';

interface Song {
  id: string;
  title: string;
  cover_key: string | null;
  cover_source: 'upload' | 'ai' | null;
  updated_at: string;
  updated_by: string | null;
}

const GOOD = 'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God on high';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9]);
/** What the replaced AI gives back: a JPEG's first bytes. */
const MADE = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 7, 7, 7]);
const NO_TEXT = 'no text, no letters, no words, no signature, no watermark';
/** Nothing a person sees may name a company or the model. */
const NAMES = /cloudflare|workers ai|flux|black forest|schnell|anthropic|claude/i;

let make: MockInstance<typeof coverMaker.make>;
beforeEach(() => {
  make = vi.spyOn(coverMaker, 'make').mockResolvedValue(MADE);
});
afterEach(() => vi.restoreAllMocks());

/** Someone signed up, with their id. (Signing up is slow, a password hashed on purpose: each test signs up only whom it needs.) */
async function person(name: string) {
  const who = await signUp(name);
  return { ...who, id: (await send<{ profile: { id: string } }>('/me', 'GET', who.cookie)).body.profile.id };
}

/** Emeka's choir, with Adaeze in it. */
async function choir() {
  const emeka = await person('Emeka Nwosu');
  const group = (await send<{ id: string; invite_code: string }>('/groups', 'POST', emeka.cookie, { name: "St. Mary's Choir", type: 'catholic', part: 'B' })).body;
  const adaeze = await person('Adaeze Obi');
  await send('/groups/join', 'POST', adaeze.cookie, { code: group.invite_code, part: 'A' });
  return { emeka, adaeze, group };
}

const putCover = (songId: string, cookie: string | undefined, type: string, body: Uint8Array) =>
  call(`/songs/${songId}/cover`, { method: 'PUT', cookie, headers: { 'content-type': type }, body });
const makeCover = (songId: string, cookie: string | undefined, idea?: string) =>
  send<Song & { error?: string }>(`/songs/${songId}/cover/make`, 'POST', cookie, idea === undefined ? {} : { idea });
const inBucket = async (key: string) => (await env.COVERS.get(key)) !== null;
const coversOf = async (songId: string) => (await env.COVERS.list({ prefix: `covers/${songId}/` })).objects.map((o) => o.key);
const today = () => new Date().toISOString().slice(0, 10);

describe('Choosing a cover', () => {
  it('puts, serves, replaces and takes away a cover, deleting the old picture, and keeps no version', async () => {
    const { emeka, adaeze, group } = await choir();
    const song = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Ave Maria', solfa: GOOD, shared_from_group: group.id })).body;
    expect(song).toMatchObject({ cover_key: null, cover_source: null });

    // Anyone in the group it was shared from can change it, as they can edit it.
    const put = await putCover(song.id, adaeze.cookie, 'image/jpeg', JPEG);
    expect(put.status).toBe(200);
    const first = (await put.json()) as Song;
    expect(first.cover_key).toMatch(new RegExp(`^covers/${song.id}/[\\w-]+\\.jpg$`));
    expect(first.cover_source).toBe('upload');
    // Not an edit of the song: when and by whom it was saved stay as they were.
    expect(first.updated_at).toBe(song.updated_at);
    expect(first.updated_by).toBe(emeka.id);
    expect((await send<Song>(`/songs/${song.id}`, 'GET', undefined)).body.cover_key).toBe(first.cover_key);

    // Served to anyone who has its address, and kept for good (a new cover gets a new address).
    const got = await call(`/${first.cover_key}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(got.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(JPEG);

    // A new picture replaces it, and the old one is gone from the bucket.
    const second = (await (await putCover(song.id, emeka.cookie, 'image/png', PNG)).json()) as Song;
    expect(second.cover_key).not.toBe(first.cover_key);
    expect(second.cover_key).toMatch(/\.png$/);
    expect((await call(`/${second.cover_key}`)).headers.get('content-type')).toBe('image/png');
    expect((await call(`/${first.cover_key}`)).status).toBe(404);
    expect(await inBucket(first.cover_key!)).toBe(false);
    expect(await coversOf(song.id)).toEqual([second.cover_key]);

    // Taken away: no cover, and the picture is gone.
    const removed = await send<Song>(`/songs/${song.id}/cover`, 'DELETE', adaeze.cookie);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ cover_key: null, cover_source: null, updated_at: song.updated_at });
    expect((await call(`/${second.cover_key}`)).status).toBe(404);
    expect(await coversOf(song.id)).toEqual([]);
    expect((await send(`/songs/${song.id}/cover`, 'DELETE', adaeze.cookie)).status).toBe(200);

    expect((await send(`/songs/${song.id}/versions`, 'GET', emeka.cookie)).body).toEqual([]);
    expect((await call('/covers/nope/nothing.jpg')).status).toBe(404);
  });

  it('refuses what isn’t a picture, a picture over 5 MB, and anyone who can’t edit the song', async () => {
    const [emeka, tobi] = [await person('Emeka Nwosu'), await person('Tobi Adeyemi')];
    const song = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Open hymn', solfa: GOOD })).body;
    const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

    const text = await putCover(song.id, emeka.cookie, 'text/plain', JPEG);
    expect(text.status).toBe(400);
    expect(await errorOf(text)).toBe('Choose a picture (JPEG, PNG or WebP).');
    expect((await putCover(song.id, emeka.cookie, 'application/pdf', JPEG)).status).toBe(400);
    const big = await putCover(song.id, emeka.cookie, 'image/jpeg', new Uint8Array(5 * 1024 * 1024 + 1));
    expect(big.status).toBe(400);
    expect(await errorOf(big)).toBe('That picture is over 5 MB. Try a smaller one.');
    const empty = await putCover(song.id, emeka.cookie, 'image/jpeg', new Uint8Array(0));
    expect(empty.status).toBe(400);

    // Tobi can see the song but not edit it; signed out can't do anything.
    expect((await putCover(song.id, tobi.cookie, 'image/jpeg', JPEG)).status).toBe(403);
    expect((await send(`/songs/${song.id}/cover`, 'DELETE', tobi.cookie)).status).toBe(403);
    expect((await makeCover(song.id, tobi.cookie)).status).toBe(403);
    expect((await putCover(song.id, undefined, 'image/jpeg', JPEG)).status).toBe(401);
    expect((await makeCover(song.id, undefined)).status).toBe(401);
    // A song only its sharer can see isn't there for anyone else.
    const mine = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Draft', solfa: GOOD, audience: 'me' })).body;
    expect((await putCover(mine.id, tobi.cookie, 'image/jpeg', JPEG)).status).toBe(404);
    expect((await makeCover(mine.id, tobi.cookie)).status).toBe(404);

    expect(make).not.toHaveBeenCalled();
    expect(await coversOf(song.id)).toEqual([]);
    expect(await coversOf(mine.id)).toEqual([]);
  });
});

describe('A cover made by AI', () => {
  it('is made from the song and the idea, stored as the song’s cover, and replaces the old one', async () => {
    const { emeka, adaeze, group } = await choir();
    const song = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Ekeresimesi Erutego', composer: 'C. Ọkafor', tags: ['Christmas', 'Igbo'], solfa: GOOD, shared_from_group: group.id })).body;
    const chosen = (await (await putCover(song.id, adaeze.cookie, 'image/jpeg', JPEG)).json()) as Song;

    const made = await makeCover(song.id, adaeze.cookie, '  a choir under a mango tree\n\tat dusk\u0007 ');
    expect(made.status).toBe(200);
    expect(made.body.cover_source).toBe('ai');
    expect(made.body.cover_key).toMatch(new RegExp(`^covers/${song.id}/[\\w-]+\\.jpg$`));
    expect(made.body.updated_at).toBe(song.updated_at);
    expect(await inBucket(chosen.cover_key!)).toBe(false);
    expect(await coversOf(song.id)).toEqual([made.body.cover_key]);
    const got = await call(`/${made.body.cover_key}`);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(MADE);

    // What the AI was asked for: the idea first, tidied, then the song.
    expect(make).toHaveBeenCalledTimes(1);
    const prompt = make.mock.calls[0][1];
    expect(prompt.startsWith('Show: a choir under a mango tree at dusk. Square album cover artwork')).toBe(true);
    expect(prompt).toContain('Ekeresimesi Erutego');
    expect(prompt).toContain('the nativity star');
    expect(prompt).toContain('akwete, adire, aso-oke');
    expect(prompt).toContain(NO_TEXT);
    expect(prompt).not.toContain('Ọkafor');

    // Without an idea, from the song alone.
    expect((await makeCover(song.id, emeka.cookie)).status).toBe(200);
    expect(make.mock.calls[1][1].startsWith('Square album cover artwork')).toBe(true);
    expect(await coversOf(song.id)).toHaveLength(1);

    // An idea too long is refused before the AI is asked.
    const long = await makeCover(song.id, emeka.cookie, 'x'.repeat(201));
    expect(long.status).toBe(400);
    expect(make).toHaveBeenCalledTimes(2);
    expect((await send(`/songs/${song.id}/versions`, 'GET', emeka.cookie)).body).toEqual([]);
  });

  it('allows 10 a person a day and 200 for everyone, counting only covers that were made', async () => {
    const [emeka, adaeze] = [await person('Emeka Nwosu'), await person('Adaeze Obi')];
    const song = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Gloria', tags: ['Gloria'], solfa: GOOD })).body;
    const used = async (userId: string) =>
      (await env.DB.prepare('select made from cover_usage where user_id = ? and day = ?').bind(userId, today()).first<{ made: number }>())?.made ?? 0;
    const errors: string[] = [];

    // The AI failing, or giving something that isn't a picture, costs nothing and changes nothing.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    make.mockRejectedValueOnce(new Error('3040: Capacity temporarily exceeded'));
    const failed = await makeCover(song.id, emeka.cookie);
    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe('The cover couldn’t be made just now. Try again in a minute.');
    errors.push(failed.body.error!);
    make.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    expect((await makeCover(song.id, emeka.cookie)).status).toBe(503);
    expect(logged).toHaveBeenCalled();
    expect(await used(emeka.id)).toBe(0);
    expect(await coversOf(song.id)).toEqual([]);

    for (let n = 1; n <= 10; n++) expect((await makeCover(song.id, emeka.cookie)).status).toBe(200);
    expect(await used(emeka.id)).toBe(10);
    const over = await makeCover(song.id, emeka.cookie);
    expect(over.status).toBe(429);
    expect(over.body.error).toBe('You’ve made 10 covers today. Try again tomorrow.');
    errors.push(over.body.error!);
    expect(make).toHaveBeenCalledTimes(12);
    // Only the last one is kept.
    expect(await coversOf(song.id)).toHaveLength(1);

    // Everyone together: 200 made today (as if Emeka had made the other 190 too) stops Adaeze before her first.
    const mine = (await send<Song>('/songs', 'POST', adaeze.cookie, { title: 'Adaeze’s hymn', solfa: GOOD })).body;
    const setMade = (made: number) => env.DB.prepare('update cover_usage set made = ? where user_id = ? and day = ?').bind(made, emeka.id, today()).run();
    await setMade(200);
    try {
      const full = await makeCover(mine.id, adaeze.cookie);
      expect(full.status).toBe(429);
      expect(full.body.error).toBe('Covers can’t be made right now. Try again tomorrow.');
      errors.push(full.body.error!);
      expect(make).toHaveBeenCalledTimes(12);
      // Choosing a picture is never limited.
      expect((await putCover(mine.id, adaeze.cookie, 'image/jpeg', JPEG)).status).toBe(200);
    } finally {
      await setMade(10);
    }
    expect((await makeCover(mine.id, adaeze.cookie)).status).toBe(200);
    for (const error of errors) expect(error).not.toMatch(NAMES);
  });

  it('asks the image model for the picture in 4 steps, and gives back its bytes', async () => {
    vi.restoreAllMocks();
    const run = vi.fn(async (_model: string, _input: unknown) => ({ image: btoa(String.fromCharCode(...MADE)) }));
    const withAi = { ...env, AI: { run } as unknown as Ai } as Env;
    expect(await coverMaker.make(withAi, 'A prompt')).toEqual(MADE);
    expect(run).toHaveBeenCalledWith('@cf/black-forest-labs/flux-1-schnell', { prompt: 'A prompt', steps: 4 });
    expect(COVER_MODEL).toBe('@cf/black-forest-labs/flux-1-schnell');
    run.mockResolvedValueOnce({} as { image: string });
    await expect(coverMaker.make(withAi, 'A prompt')).rejects.toThrow();
  });

  it('makes the picture 800 pixels across, keeping it as made when that fails or doesn’t make it smaller', async () => {
    const big = new Uint8Array(4000).fill(7);
    const asked: unknown[] = [];
    const images = (gives: () => Promise<Uint8Array>) =>
      ({
        ...env,
        IMAGES: {
          input: () => ({
            transform: (t: unknown) => {
              asked.push(t);
              return {
                output: async (o: unknown) => {
                  asked.push(o);
                  const bytes = await gives();
                  return { response: () => new Response(bytes) };
                },
              };
            },
          }),
        } as unknown as ImagesBinding,
      }) as Env;
    const small = new Uint8Array(900).fill(3);
    expect(await smaller(images(async () => small), big)).toEqual(small);
    expect(asked).toEqual([{ width: 800 }, { format: 'image/jpeg', quality: 82 }]);
    // Bigger than before: kept as made.
    expect(await smaller(images(async () => new Uint8Array(5000)), big)).toBe(big);
    // Failing (past the free transformations on the Free plan, say): kept as made.
    expect(
      await smaller(
        images(async () => {
          throw new Error('9422');
        }),
        big,
      ),
    ).toBe(big);
  });
});

describe('A deleted song', () => {
  it('takes its cover with it, and its plays', async () => {
    const emeka = await person('Emeka Nwosu');
    const song = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Short-lived', solfa: GOOD })).body;
    const cover = ((await (await putCover(song.id, emeka.cookie, 'image/jpeg', JPEG)).json()) as Song).cover_key!;
    await send(`/songs/${song.id}/plays`, 'POST', emeka.cookie);
    await send(`/songs/${song.id}/plays`, 'POST', emeka.cookie);
    expect((await send(`/songs/${song.id}`, 'DELETE', emeka.cookie)).status).toBe(200);
    expect((await call(`/${cover}`)).status).toBe(404);
    expect(await inBucket(cover)).toBe(false);
    const days = await env.DB.prepare('select count(*) as n from song_days where song_id = ?').bind(song.id).first<{ n: number }>();
    expect(days?.n).toBe(0);
  });
});

describe('What the AI is asked for (coverPrompt)', () => {
  const prompt = (tags: string[], idea?: string, title = 'Gloria in Excelsis') => coverPrompt({ title, composer: 'G. F. Handel', tags }, idea);

  it('asks for square album-cover artwork for a choir song, from its title, with no lettering', () => {
    const p = prompt([]);
    expect(p).toContain('Square album cover artwork for a choir song');
    expect(p).toContain('Gloria in Excelsis');
    expect(p).toContain('An elegant painterly illustration, rich warm colour, soft light, a simple centred composition');
    expect(p.endsWith(`${NO_TEXT}.`)).toBe(true);
    expect(p).not.toContain('Handel');
    expect(p).not.toContain('Show:');
  });

  it('takes the tags as mood and scene, ignoring case', () => {
    const scenes: [string, string][] = [
      ['Christmas', 'a starry night, the nativity star, warm lamplight'],
      ['easter', 'sunrise, white lilies, an empty tomb in morning light'],
      ['Lent', 'purple'],
      ['Communion', 'bread and a chalice, candlelight'],
      ['Thanksgiving', 'harvest, joyful colour'],
      ['Marian', 'blue and white, roses'],
      ['Pentecost', 'flame'],
      ['Praise and Worship', 'bright and joyful, rays of light'],
      ['Worship', 'rays of light'],
      ['ADVENT', 'candles, deep blue'],
      ['Entrance', 'a church interior with warm light'],
      ['Offertory', 'a church interior with warm light'],
      ['Recessional', 'a church interior with warm light'],
    ];
    for (const [tag, scene] of scenes) expect(prompt([tag])).toContain(scene);
    // The church only when nothing says more; a tag it doesn't know adds nothing.
    expect(prompt(['Entrance', 'Christmas'])).not.toContain('church interior');
    expect(prompt(['Choir practice'])).toContain('Mood: peaceful and uplifting.');
  });

  it('weaves in West African cloth for songs in Igbo, Yoruba or Hausa', () => {
    for (const tag of ['Igbo', 'yoruba', 'Hausa']) expect(prompt([tag])).toContain('West African textile patterns (akwete, adire, aso-oke)');
    expect(prompt(['English', 'Latin'])).not.toContain('textile');
  });

  it('leads with the creator’s idea, tidied, and stays under 1,000 characters', () => {
    expect(prompt(['Easter'], 'three women at\u0000 the\ntomb')).toMatch(/^Show: three women at the tomb\. Square album cover/);
    expect(prompt([], '   ')).not.toContain('Show:');
    const all = ['Christmas', 'Easter', 'Lent', 'Communion', 'Thanksgiving', 'Marian', 'Pentecost', 'Praise', 'Advent', 'Entrance', 'Igbo', 'Yoruba'];
    const longest = prompt(all, 'y'.repeat(600), 'T'.repeat(200));
    expect(longest.length).toBeLessThan(1000);
    expect(longest.endsWith(`${NO_TEXT}.`)).toBe(true);
    expect(prompt([], undefined, 'Line one\nline two')).toContain('inspired by its title: Line one line two.');
  });
});
