/**
 * Signing up and in, and onboarding over HTTP, the way the app does it:
 * Emeka starts a choir, Adaeze joins with the code, then (with approval on)
 * Kelechi waits until Emeka lets him in.
 */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://abu.test';
const PASSWORD = 'choir-practice-2026';

/** Sends a request as the app would, with the session cookie if there is one. */
function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('origin', ORIGIN);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  return SELF.fetch(`${ORIGIN}/api${path}`, { ...init, headers });
}

const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

async function signUp(name: string) {
  const email = `${name.split(' ')[0].toLowerCase()}-${crypto.randomUUID().slice(0, 6)}@example.com`;
  const res = await call('/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ name, email, password: PASSWORD }) });
  expect(res.status).toBe(200);
  return { email, cookie: cookieFrom(res) };
}

describe('Signing up and in', () => {
  it('signing up gives you a profile and your own space, and keeps you signed in', async () => {
    const { cookie } = await signUp('Tobi Adeyemi');
    const me = await (await call('/me', { cookie })).json<{ profile: { display_name: string }; groups: { name: string; type: string }[] }>();
    expect(me.profile.display_name).toBe('Tobi Adeyemi');
    expect(me.groups.map((g) => [g.name, g.type])).toEqual([['My space', 'personal']]);
  });

  it('signs in with the right password only, and stores passwords hashed', async () => {
    const { email } = await signUp('Ngozi Uche');
    const wrong = await call('/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password: 'not-the-password' }) });
    expect(wrong.status).toBe(401);
    const right = await call('/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) });
    expect(right.status).toBe(200);
    expect((await call('/me', { cookie: cookieFrom(right) })).status).toBe(200);

    const stored = await env.DB.prepare('select a.password from account a join "user" u on u.id = a.userId where u.email = ?')
      .bind(email)
      .first<{ password: string }>();
    expect(stored?.password).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(stored?.password).not.toContain(PASSWORD);
  });

  it('asks you to sign in first for anything personal', async () => {
    const res = await call('/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in first.' });
    expect((await call('/groups', { method: 'POST', body: JSON.stringify({ name: 'X', type: 'band' }) })).status).toBe(401);
  });

  it('lets you change your name', async () => {
    const { cookie } = await signUp('Funke');
    const res = await call('/me', { method: 'PATCH', cookie, body: JSON.stringify({ display_name: 'Funke Alade' }) });
    expect(await res.json()).toMatchObject({ display_name: 'Funke Alade' });
  });
});

describe('Onboarding', () => {
  it('a leader starts a choir, members join with the code, and approval works', async () => {
    const emeka = await signUp('Emeka Nwosu');
    const created = await call('/groups', {
      method: 'POST',
      cookie: emeka.cookie,
      body: JSON.stringify({ name: "St. Mary's Choir", type: 'catholic', church: "St. Mary's", town: 'Enugu', part: 'B' }),
    });
    expect(created.status).toBe(201);
    const group = await created.json<{ id: string; invite_code: string; sections: string[] }>();
    expect(group.invite_code).toMatch(/^STM\d{3}$/);
    expect(group.sections[0]).toBe('Entrance');

    // Adaeze previews the group, then joins as an alto.
    const adaeze = await signUp('Adaeze Obi');
    const preview = await (await call(`/groups/preview/${group.invite_code.toLowerCase()}`, { cookie: adaeze.cookie })).json();
    expect(preview).toMatchObject({ name: "St. Mary's Choir", leader_name: 'Emeka Nwosu', members: 1, requires_approval: false });
    const joined = await call('/groups/join', { method: 'POST', cookie: adaeze.cookie, body: JSON.stringify({ code: group.invite_code, part: 'A' }) });
    expect(await joined.json()).toMatchObject({ status: 'active', part: 'A', role: 'member' });

    // Members can't change settings; the leader switches on approval.
    expect((await call(`/groups/${group.id}`, { method: 'PATCH', cookie: adaeze.cookie, body: JSON.stringify({ requires_approval: true }) })).status).toBe(403);
    const settings = await call(`/groups/${group.id}`, { method: 'PATCH', cookie: emeka.cookie, body: JSON.stringify({ requires_approval: true }) });
    expect(await settings.json()).toMatchObject({ requires_approval: true });

    // Kelechi waits; Emeka sees him waiting and lets him in.
    const kelechi = await signUp('Kelechi Okoro');
    const waiting = await (await call('/groups/join', { method: 'POST', cookie: kelechi.cookie, body: JSON.stringify({ code: group.invite_code, part: 'T' }) })).json<{
      user_id: string;
      status: string;
    }>();
    expect(waiting.status).toBe('pending');
    const members = await (await call(`/groups/${group.id}/members`, { cookie: emeka.cookie })).json<{ display_name: string; status: string }[]>();
    expect(members.map((m) => [m.display_name, m.status])).toEqual([
      ['Adaeze Obi', 'active'],
      ['Emeka Nwosu', 'active'],
      ['Kelechi Okoro', 'pending'],
    ]);
    expect((await call(`/groups/${group.id}/members/${waiting.user_id}/approve`, { method: 'POST', cookie: adaeze.cookie })).status).toBe(403);
    expect((await call(`/groups/${group.id}/members/${waiting.user_id}/approve`, { method: 'POST', cookie: emeka.cookie })).status).toBe(200);
    const mine = await (await call('/me', { cookie: kelechi.cookie })).json<{ groups: { name: string; status: string }[] }>();
    expect(mine.groups.find((g) => g.name === "St. Mary's Choir")?.status).toBe('active');
  });

  it('a wrong code says so plainly', async () => {
    const tobi = await signUp('Tobi');
    const res = await call('/groups/join', { method: 'POST', cookie: tobi.cookie, body: JSON.stringify({ code: 'zzz999' }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No group has the code ZZZ999. Check it with your leader.' });
  });

  it('members change their own part; leaders make part leaders', async () => {
    const emeka = await signUp('Emeka');
    const group = await (await call('/groups', { method: 'POST', cookie: emeka.cookie, body: JSON.stringify({ name: 'Joy Voices', type: 'pentecostal' }) })).json<{
      id: string;
      invite_code: string;
      leader_title: string;
    }>();
    expect(group.leader_title).toBe('Choir director');
    const chi = await signUp('Chiamaka');
    const m = await (await call('/groups/join', { method: 'POST', cookie: chi.cookie, body: JSON.stringify({ code: group.invite_code }) })).json<{ user_id: string }>();
    expect((await call(`/groups/${group.id}/members/${m.user_id}`, { method: 'PATCH', cookie: chi.cookie, body: JSON.stringify({ part: 'S' }) })).status).toBe(200);
    expect((await call(`/groups/${group.id}/members/${m.user_id}`, { method: 'PATCH', cookie: chi.cookie, body: JSON.stringify({ role: 'leader' }) })).status).toBe(403);
    expect((await call(`/groups/${group.id}/members/${m.user_id}`, { method: 'PATCH', cookie: emeka.cookie, body: JSON.stringify({ role: 'part_leader' }) })).status).toBe(200);
    const members = await (await call(`/groups/${group.id}/members`, { cookie: emeka.cookie })).json<{ user_id: string; part: string; role: string }[]>();
    expect(members.find((x) => x.user_id === m.user_id)).toMatchObject({ part: 'S', role: 'part_leader' });
  });
});
