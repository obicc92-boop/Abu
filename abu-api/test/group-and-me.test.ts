/**
 * Group and Me over HTTP: notices (to everyone or one part, pinning,
 * deleting), the group's details and section names, your practice week and
 * streak, and changing your password.
 */
import { describe, expect, it } from 'vitest';

import { call, cookieFrom, PASSWORD, send, signUp } from './helpers';

interface Notice {
  id: string;
  body: string;
  part: string | null;
  pinned: boolean;
  author_name: string | null;
}
interface Summary {
  week_plays: number;
  week_days: number;
  streak: number;
  songs_known: number;
  songs_practised: number;
}

async function choir() {
  const emeka = await signUp('Emeka Nwosu');
  const group = (await send<{ id: string; invite_code: string }>('/groups', 'POST', emeka.cookie, { name: "St. Mary's Choir", type: 'catholic', part: 'B' })).body;
  const join = async (name: string, p: string) => {
    const who = await signUp(name);
    await send('/groups/join', 'POST', who.cookie, { code: group.invite_code, part: p });
    const id = (await send<{ profile: { id: string } }>('/me', 'GET', who.cookie)).body.profile.id;
    return { ...who, id };
  };
  const chiamaka = await join('Chiamaka Eze', 'S');
  const adaeze = await join('Adaeze Obi', 'A');
  await send(`/groups/${group.id}/members/${chiamaka.id}`, 'PATCH', emeka.cookie, { role: 'part_leader' });
  return { emeka, chiamaka, adaeze, group };
}

describe('Notices', () => {
  it('leaders write to anyone, part leaders to everyone or their part; members read', async () => {
    const { emeka, chiamaka, adaeze, group } = await choir();
    const post = (cookie: string, body: string, part?: string) => send<Notice & { error?: string }>(`/groups/${group.id}/notices`, 'POST', cookie, { body, part });

    expect((await post(emeka.cookie, 'Rehearsal moves to 4:30 PM on Thursday.')).status).toBe(201);
    const tenors = await post(emeka.cookie, 'Tenors, watch bar 6.', 'T');
    expect(tenors.body.part).toBe('T');
    expect((await post(chiamaka.cookie, 'Sopranos: come 30 minutes early.', 'S')).status).toBe(201);
    const wrongPart = await post(chiamaka.cookie, 'Altos, louder please.', 'A');
    expect(wrongPart.status).toBe(403);
    expect(wrongPart.body.error).toMatch(/their own part/);
    expect((await post(emeka.cookie, 'Descants!', 'Descant')).status).toBe(400);
    expect((await post(emeka.cookie, 'x'.repeat(2001))).status).toBe(400);
    expect((await post(emeka.cookie, '   ')).status).toBe(400);
    expect((await post(adaeze.cookie, 'Hello everyone')).status).toBe(403);

    const list = (await send<Notice[]>(`/groups/${group.id}/notices`, 'GET', adaeze.cookie)).body;
    expect(list.map((n) => n.body)).toEqual(['Sopranos: come 30 minutes early.', 'Tenors, watch bar 6.', 'Rehearsal moves to 4:30 PM on Thursday.']);

    // Leaders pin; pinned comes first.
    const first = list[2];
    expect((await send(`/notices/${first.id}/pin`, 'PUT', chiamaka.cookie, { pinned: true })).status).toBe(403);
    expect((await send(`/notices/${first.id}/pin`, 'PUT', emeka.cookie, { pinned: true })).status).toBe(200);
    const pinned = (await send<Notice[]>(`/groups/${group.id}/notices`, 'GET', adaeze.cookie)).body;
    expect(pinned[0]).toMatchObject({ id: first.id, pinned: true });

    // The author or a leader deletes.
    const sopranos = list[0];
    expect((await send(`/notices/${sopranos.id}`, 'DELETE', adaeze.cookie)).status).toBe(403);
    expect((await send(`/notices/${tenors.body.id}`, 'DELETE', chiamaka.cookie)).status).toBe(403);
    expect((await send(`/notices/${sopranos.id}`, 'DELETE', chiamaka.cookie)).status).toBe(200);
    expect((await send(`/notices/${tenors.body.id}`, 'DELETE', emeka.cookie)).status).toBe(200);
    expect((await send<Notice[]>(`/groups/${group.id}/notices`, 'GET', adaeze.cookie)).body).toHaveLength(1);

    const outsider = await signUp('Tobi Adeyemi');
    expect((await send(`/groups/${group.id}/notices`, 'GET', outsider.cookie)).status).toBe(403);
  });
});

describe('Group details and sections', () => {
  it('leaders rename the group, the leader’s title and the sections', async () => {
    const { emeka, chiamaka, adaeze, group } = await choir();
    const patch = (cookie: string, data: unknown) => send<{ name: string; leader_title: string; sections: string[]; error?: string }>(`/groups/${group.id}`, 'PATCH', cookie, data);

    const done = await patch(emeka.cookie, {
      name: "St. Mary's Catholic Choir",
      church: "St. Mary's Church",
      town: 'Enugu',
      leader_title: 'Choir director',
      sections: ['Entrance', 'Kyrie', 'Gloria', 'Offertory', 'Communion', 'Igbo hymn', 'Recessional'],
    });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ name: "St. Mary's Catholic Choir", leader_title: 'Choir director' });
    expect(done.body.sections).toContain('Igbo hymn');

    expect((await patch(emeka.cookie, { sections: ['Entrance', 'entrance'] })).body.error).toMatch(/different name/);
    expect((await patch(emeka.cookie, { sections: Array.from({ length: 31 }, (_, i) => `Section ${i}`) })).status).toBe(400);
    expect((await patch(emeka.cookie, { name: '  ' })).status).toBe(400);
    expect((await patch(emeka.cookie, { leader_title: '' })).status).toBe(400);
    expect((await patch(chiamaka.cookie, { name: 'Sopranos only' })).status).toBe(403);
    expect((await patch(adaeze.cookie, { leader_title: 'Boss' })).status).toBe(403);
  });
});

describe('Your practice', () => {
  it('counts your week and a streak on your own calendar', async () => {
    const { adaeze, emeka } = await choir();
    const play = (songId: string, day: string) => send(`/songs/${songId}/plays`, 'POST', adaeze.cookie, { day });
    await play('grace', '2026-11-09');
    await play('grace', '2026-11-10');
    await play('ekele', '2026-11-10');
    await play('old100', '2026-11-11');
    await play('old100', '2026-11-02'); // more than a week before
    await send('/songs/grace/knows', 'PUT', adaeze.cookie, { knows: true });

    const today = (await send<Summary>('/me/practice/summary?today=2026-11-11', 'GET', adaeze.cookie)).body;
    expect(today).toEqual({ week_plays: 4, week_days: 3, streak: 3, songs_known: 1, songs_practised: 3 });

    // Not practised yet today: the streak still stands until a whole day passes.
    expect((await send<Summary>('/me/practice/summary?today=2026-11-12', 'GET', adaeze.cookie)).body.streak).toBe(3);
    expect((await send<Summary>('/me/practice/summary?today=2026-11-13', 'GET', adaeze.cookie)).body.streak).toBe(0);

    // Nobody else's practice shows up in yours.
    expect((await send<Summary>('/me/practice/summary?today=2026-11-11', 'GET', emeka.cookie)).body).toEqual({
      week_plays: 0,
      week_days: 0,
      streak: 0,
      songs_known: 0,
      songs_practised: 0,
    });
  });
});

describe('Your password', () => {
  it('changes with the current one, and the new one signs in', async () => {
    const who = await signUp('Ngozi Okafor');
    const change = (currentPassword: string) =>
      call('/auth/change-password', { method: 'POST', cookie: who.cookie, body: JSON.stringify({ currentPassword, newPassword: 'new-choir-pass-2026', revokeOtherSessions: false }) });
    expect((await change('wrong-password')).status).toBeGreaterThanOrEqual(400);
    expect((await change(PASSWORD)).status).toBe(200);

    const signIn = (password: string) => call('/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: who.email, password }) });
    expect((await signIn(PASSWORD)).status).toBe(401);
    const ok = await signIn('new-choir-pass-2026');
    expect(ok.status).toBe(200);
    expect(cookieFrom(ok)).toMatch(/session_token/);
  });
});
