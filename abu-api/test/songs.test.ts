/**
 * Songs over HTTP: sharing with the sol-fa check, editing rights, original
 * sheets in R2, the repertoire and "My songs", and private practice.
 */
import { describe, expect, it } from 'vitest';

import { call, send, signUp } from './helpers';

interface Song {
  id: string;
  title: string;
  composer: string;
  doh: number;
  tags: string[];
  solfa: string;
  sheet_key: string | null;
  sheet_type: string | null;
  group_name: string | null;
  shared_by_name: string | null;
}

const GOOD = 'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God on high';
/** Bar 2 is a beat short (a pickup or a closing bar may be short, a middle bar may not). */
const BAD = 'S  d :r /m :f | s :- /- | d :- /- :- |';

async function choir() {
  const emeka = await signUp('Emeka Nwosu');
  const group = (await send<{ id: string; invite_code: string }>('/groups', 'POST', emeka.cookie, { name: "St. Mary's Choir", type: 'catholic', part: 'B' })).body;
  const adaeze = await signUp('Adaeze Obi');
  await send('/groups/join', 'POST', adaeze.cookie, { code: group.invite_code, part: 'A' });
  const tobi = await signUp('Tobi Adeyemi');
  return { emeka, adaeze, tobi, group };
}

describe('The library', () => {
  it('has the demo songs, and filters by words, tag and playable', async () => {
    const all = (await send<Song[]>('/songs', 'GET', undefined)).body;
    expect(all.map((s) => s.id)).toEqual(expect.arrayContaining(['old100', 'ekele', 'grace']));
    // Search finds words inside the sol-fa, not just titles.
    expect((await send<Song[]>('/songs?q=cheer-ful', 'GET', undefined)).body.map((s) => s.id)).toEqual(['old100']);
    expect((await send<Song[]>('/songs?tag=igbo', 'GET', undefined)).body.map((s) => s.id)).toEqual(['ekele']);
    expect((await send<Song[]>('/songs?playable=1', 'GET', undefined)).body.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Sharing and editing songs', () => {
  it('shares a song from your group, with the sol-fa checked first', async () => {
    const { emeka, group } = await choir();
    const bad = await send<{ error: string }>('/songs', 'POST', emeka.cookie, { title: 'Broken', solfa: BAD, time_signature: '4/4' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('The sol-fa has a problem: Soprano, bar 2 has 3 beats; 4/4 needs 4.');

    const ok = await send<Song>('/songs', 'POST', emeka.cookie, {
      title: 'Gloria (Igbo)',
      composer: 'Arr. E. Nwosu',
      doh: 2,
      time_signature: '4/4',
      tags: ['Gloria', 'Igbo'],
      solfa: GOOD,
      shared_from_group: group.id,
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ title: 'Gloria (Igbo)', doh: 2, tags: ['Gloria', 'Igbo'], group_name: "St. Mary's Choir", shared_by_name: 'Emeka Nwosu' });
  });

  it('a song can be sheet only (no sol-fa yet)', async () => {
    const { tobi } = await choir();
    const song = await send<Song>('/songs', 'POST', tobi.cookie, { title: 'Kyrie (Missa Igbo)' });
    expect(song.status).toBe(201);
    expect(song.body.solfa).toBe('');
    expect((await send<Song[]>('/songs?playable=1&q=Missa', 'GET', undefined)).body).toEqual([]);
  });

  it('whoever shared it, or their group, edits it; others can’t; signed out can’t share', async () => {
    const { emeka, adaeze, tobi, group } = await choir();
    const song = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Sanctus', solfa: GOOD, shared_from_group: group.id })).body;
    expect((await send<Song>(`/songs/${song.id}`, 'PATCH', adaeze.cookie, { composer: 'Fixed by Adaeze' })).body.composer).toBe('Fixed by Adaeze');
    expect((await send(`/songs/${song.id}`, 'PATCH', tobi.cookie, { composer: 'Tobi' })).status).toBe(403);
    expect((await send(`/songs/${song.id}`, 'PATCH', adaeze.cookie, { solfa: BAD })).status).toBe(400);
    expect((await send('/songs', 'POST', undefined, { title: 'Nope' })).status).toBe(401);

    const mine = await send<{ can_edit: boolean }>(`/songs/${song.id}/me`, 'GET', adaeze.cookie);
    expect(mine.body.can_edit).toBe(true);
    expect((await send<{ can_edit: boolean }>(`/songs/${song.id}/me`, 'GET', tobi.cookie)).body.can_edit).toBe(false);
  });
});

describe('Original sheets', () => {
  it('attaches a sheet, serves it to anyone, replaces and removes it', async () => {
    const { emeka, adaeze, tobi, group } = await choir();
    const song = (await send<Song>('/songs', 'POST', emeka.cookie, { title: 'Ave Maria', shared_from_group: group.id })).body;
    const pdf = new TextEncoder().encode('%PDF-1.4 a pretend sheet');

    // Wrong type, an outsider, and a member of the group.
    expect((await call(`/songs/${song.id}/sheet`, { method: 'PUT', cookie: adaeze.cookie, headers: { 'content-type': 'text/plain' }, body: pdf })).status).toBe(400);
    expect((await call(`/songs/${song.id}/sheet`, { method: 'PUT', cookie: tobi.cookie, headers: { 'content-type': 'application/pdf' }, body: pdf })).status).toBe(403);
    const put = await call(`/songs/${song.id}/sheet`, { method: 'PUT', cookie: adaeze.cookie, headers: { 'content-type': 'application/pdf' }, body: pdf });
    expect(put.status).toBe(200);
    const withSheet = (await put.json()) as Song;
    expect(withSheet.sheet_type).toBe('application/pdf');
    expect(withSheet.sheet_key).toMatch(new RegExp(`^sheets/${song.id}/.+\\.pdf$`));

    const file = await call(`/songs/${song.id}/sheet`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(await file.text()).toBe('%PDF-1.4 a pretend sheet');

    // Replacing swaps the file; removing clears it.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const replaced = (await (await call(`/songs/${song.id}/sheet`, { method: 'PUT', cookie: emeka.cookie, headers: { 'content-type': 'image/png' }, body: png })).json()) as Song;
    expect(replaced.sheet_type).toBe('image/png');
    expect(new Uint8Array(await (await call(`/songs/${song.id}/sheet`)).arrayBuffer())).toEqual(png);
    expect((await send<Song>(`/songs/${song.id}/sheet`, 'DELETE', emeka.cookie)).body.sheet_key).toBeNull();
    expect((await call(`/songs/${song.id}/sheet`)).status).toBe(404);
  });
});

describe('Repertoire and My songs', () => {
  it('leaders build the repertoire; anyone saves to My songs; the song shows where it is', async () => {
    const { emeka, adaeze, group } = await choir();
    expect((await send(`/groups/${group.id}/repertoire`, 'POST', adaeze.cookie, { song_id: 'ekele' })).status).toBe(403);
    expect((await send(`/groups/${group.id}/repertoire`, 'POST', emeka.cookie, { song_id: 'ekele' })).status).toBe(200);
    expect((await send<Song[]>(`/groups/${group.id}/repertoire`, 'GET', adaeze.cookie)).body.map((s) => s.id)).toEqual(['ekele']);

    const me = (await send<{ groups: { id: string; type: string }[] }>('/me', 'GET', adaeze.cookie)).body;
    const space = me.groups.find((g) => g.type === 'personal')!;
    expect((await send(`/groups/${space.id}/repertoire`, 'POST', adaeze.cookie, { song_id: 'old100' })).status).toBe(200);
    expect((await send<{ in_groups: string[] }>('/songs/old100/me', 'GET', adaeze.cookie)).body.in_groups).toEqual([space.id]);
    expect((await send<{ in_groups: string[] }>('/songs/ekele/me', 'GET', adaeze.cookie)).body.in_groups).toEqual([group.id]);

    expect((await send(`/groups/${space.id}/repertoire/old100`, 'DELETE', adaeze.cookie)).status).toBe(200);
    expect((await send<Song[]>(`/groups/${space.id}/repertoire`, 'GET', adaeze.cookie)).body).toEqual([]);
  });
});

describe('Practice', () => {
  it('counts your plays and “I know my part”, privately', async () => {
    const { adaeze, emeka } = await choir();
    await send('/songs/grace/plays', 'POST', adaeze.cookie);
    expect((await send<{ plays: number }>('/songs/grace/plays', 'POST', adaeze.cookie)).body.plays).toBe(2);
    expect((await send('/songs/grace/knows', 'PUT', adaeze.cookie, { knows: true })).status).toBe(200);
    expect((await send<{ plays: number; knows_part: boolean }>('/songs/grace/me', 'GET', adaeze.cookie)).body).toMatchObject({ plays: 2, knows_part: true });
    expect((await send<{ song_id: string }[]>('/me/practice', 'GET', adaeze.cookie)).body.map((p) => p.song_id)).toEqual(['grace']);
    expect((await send<unknown[]>('/me/practice', 'GET', emeka.cookie)).body).toEqual([]);
    expect((await send('/songs/grace/plays', 'POST', undefined)).status).toBe(401);
  });
});
